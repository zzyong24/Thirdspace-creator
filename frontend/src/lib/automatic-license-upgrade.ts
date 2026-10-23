"use client";

import {creationScopeKey,readCreationScope,type CreationScope} from './creation-workspace-scope';
import {isDesktopRuntimeClient} from './desktop-updater';
import {fetchCreatorApi} from './http-transport';
import {waitForAiCreditCenter} from './open-ai-credit-center';
import {parseLegacyUpgradeResult,parseNativeRestoreResult,parseUpgradeObservationToken,UPGRADE_OBSERVATION_HEADER,type LegacyUpgradeResult,type NativeRestoreResult,type UpgradeAction,type UpgradeReason} from './legacy-license-upgrade';
import {refreshModelRoutingAfterUpgrade} from '@/features/copilot/assistant-engine';

export interface AutomaticLicenseUpgradeState {
 readonly scopeKey:string;
 readonly status:'idle'|'checking'|'ready'|'pending'|'blocked';
 readonly phase:'proof'|'binding'|'credentials'|'fulfillment'|'configuration'|'routing'|null;
 readonly reasonCode:UpgradeReason|NativeRestoreResult['reasonCode']|null;
 readonly entitlementReady:boolean;
 readonly configurationReady:boolean;
 readonly successRevision:number;
}
export const AUTOMATIC_UPGRADE_SERVER_STATE:AutomaticLicenseUpgradeState=Object.freeze({scopeKey:'',status:'idle',phase:null,reasonCode:null,entitlementReady:false,configurationReady:false,successRevision:0});
export const automaticUpgradeScopeKey=(scope:CreationScope)=>creationScopeKey(scope);
const WAIT_MS=730_000,READ_RETRY_DELAYS=[1000,3000,10000] as const;
type Owner={scope:CreationScope;key:string;control:AbortController;deadline:number;token:string|null;invalidated:boolean;entitlementReady:boolean;promise:Promise<void>};
const owners=new Map<string,Owner>(),listeners=new Set<()=>void>();
let snapshot=AUTOMATIC_UPGRADE_SERVER_STATE,selectedScope='',successRevision=0;
let nativeFlight:Promise<unknown>|null=null,nativeUnconfirmed=false;
export const readAutomaticLicenseUpgrade=()=>snapshot;
/** 显示订阅不拥有工作；退订不会终止原生提交或原观察。 */
export function subscribeAutomaticLicenseUpgrade(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
function current(owner:Owner){return !owner.invalidated&&selectedScope===owner.key&&automaticUpgradeScopeKey(readCreationScope())===owner.key;}
function emit(owner:Owner,patch:Partial<AutomaticLicenseUpgradeState>){
 if(!current(owner))return;
 snapshot=Object.freeze({...snapshot,scopeKey:owner.key,entitlementReady:owner.entitlementReady,...patch});
 for(const listener of listeners)listener();
 // 只记录固定枚举，不记录原许可、scope值、token、Key或业务结果正文。
 console.info('[automatic-model-upgrade]',JSON.stringify({phase:snapshot.phase,status:snapshot.status,reasonCode:snapshot.reasonCode}));
}
function live(owner:Owner){if(!current(owner)||owner.control.signal.aborted||Date.now()>=owner.deadline)throw new DOMException('原权益观察已结束','AbortError');}
function pending(owner:Owner,reasonCode:AutomaticLicenseUpgradeState['reasonCode']='UPGRADE_SERVICE_UNAVAILABLE',phase:AutomaticLicenseUpgradeState['phase']=snapshot.phase){emit(owner,{status:'pending',phase,reasonCode,configurationReady:false});}
function stop(owner:Owner,result:LegacyUpgradeResult){
 emit(owner,{status:result.outcome==='blocked'?'blocked':'pending',phase:result.phase,reasonCode:result.reasonCode,configurationReady:false});
}
function wait<T>(owner:Owner,operation:()=>T|PromiseLike<T>){live(owner);return waitForAiCreditCenter(operation,owner.control.signal);}
async function pause(owner:Owner,ms:number){
 await wait(owner,()=>new Promise<void>((resolve,reject)=>{
  const done=()=>{clearTimeout(timer);owner.control.signal.removeEventListener('abort',cancel);};
  const cancel=()=>{done();reject(new DOMException('原权益观察已结束','AbortError'));};
  const timer=setTimeout(()=>{done();resolve();},ms);owner.control.signal.addEventListener('abort',cancel,{once:true});
 }));live(owner);
}
async function read(owner:Owner,action:UpgradeAction):Promise<LegacyUpgradeResult>{
 live(owner);emit(owner,{status:'checking',phase:action==='probe'?'proof':action==='fulfill'?'fulfillment':'configuration',reasonCode:null,configurationReady:false});
 const original=owner.token;
 const response=await wait(owner,()=>fetchCreatorApi('/api/v1/local/client-config',{method:'POST',cache:'no-store',signal:owner.control.signal,headers:{'x-creatoros-config-trigger':'legacy_upgrade','x-creatoros-upgrade-mode':'automatic','x-creatoros-upgrade-action':action,...(original?{[UPGRADE_OBSERVATION_HEADER]:original}:{})}},owner.scope));
 const value=await wait(owner,()=>response.json());live(owner);
 const result=parseLegacyUpgradeResult(value,action),raw=response.headers.get(UPGRADE_OBSERVATION_HEADER);
 if(raw!==null){const token=parseUpgradeObservationToken(raw);if(original!==null&&token!==original)throw Error('观察身份变化');owner.token=token;}
 if(!owner.token&&result.outcome!=='unknown'&&result.outcome!=='blocked')throw Error('观察所有权未确认');
 return result;
}
async function probe(owner:Owner){
 let result=await read(owner,'probe');
 for(const delay of READ_RETRY_DELAYS){
  // 未拿到首响应token时绝不能以新无头请求接管；经济unknown另走一次只读核对。
  if(!owner.token||result.reasonCode!=='UPGRADE_SERVICE_UNAVAILABLE'||!result.retryable)break;
  await pause(owner,delay);result=await read(owner,'probe');
 }
 return result;
}
async function synchronize(owner:Owner){
 for(let attempt=0;attempt<=READ_RETRY_DELAYS.length;attempt++){
  const result=await read(owner,'sync');
  if(result.outcome==='blocked'){stop(owner,result);return;}
  if(result.configurationStatus==='ready'&&result.entitlementStatus==='ready'){
   owner.entitlementReady=true;emit(owner,{status:'checking',phase:'routing',reasonCode:null});
   try{await wait(owner,()=>refreshModelRoutingAfterUpgrade(owner.control.signal));live(owner);}
   catch{live(owner);pending(owner,'UPGRADE_CONFIGURATION_PENDING','routing');return;}
   emit(owner,{status:'ready',phase:'configuration',reasonCode:'UPGRADE_READY',configurationReady:true,successRevision:++successRevision});
   window.dispatchEvent(new CustomEvent('creatoros:client-config-synced',{detail:{outcome:'configured'}}));return;
  }
  if(!result.retryable||attempt===READ_RETRY_DELAYS.length){stop(owner,result);return;}
  await pause(owner,READ_RETRY_DELAYS[attempt]);
 }
}
async function run(owner:Owner){
 const timer=setTimeout(()=>owner.control.abort(),Math.max(0,owner.deadline-Date.now()));
 try{
  if(nativeFlight){pending(owner,'RESTORE_IN_PROGRESS','binding');return;}
  let result=await probe(owner);
  if(!owner.token){stop(owner,result);return;}
  if(result.outcome==='restore_required'){
   emit(owner,{status:'checking',phase:'binding',reasonCode:null});
   if(nativeFlight||nativeUnconfirmed){pending(owner,'RESTORE_IN_PROGRESS','binding');return;}
   const token=parseUpgradeObservationToken(owner.token);nativeUnconfirmed=true;
   const work=Promise.resolve().then(async()=>{const {invoke}=await wait(owner,()=>import('@tauri-apps/api/core'));live(owner);return invoke<unknown>('license_restore_saved',{observationToken:token});});
   nativeFlight=work;
   // 真正底层收尾才释放guard；观察者取消不声称撤回已发IPC。
   void work.then(value=>{try{nativeUnconfirmed=parseNativeRestoreResult(value).status!=='ready';}catch{nativeUnconfirmed=true;}if(nativeFlight===work)nativeFlight=null;},()=>{if(nativeFlight===work)nativeFlight=null;});
   let saved:NativeRestoreResult;
   try{saved=parseNativeRestoreResult(await wait(owner,()=>work));live(owner);}
   catch{live(owner);await read(owner,'probe').catch(()=>undefined);live(owner);pending(owner,'RESTORE_CONTINUE_REQUIRED','binding');return;}
   if(saved.status!=='ready'){
    if(saved.status==='unknown'){await read(owner,'probe').catch(()=>undefined);live(owner);}
    emit(owner,{status:saved.status==='blocked'&&!saved.retryable?'blocked':'pending',phase:'binding',reasonCode:saved.reasonCode,configurationReady:false});return;
   }
   result=await probe(owner);
  }
  if(nativeUnconfirmed){pending(owner,'RESTORE_STORAGE_UNCONFIRMED','binding');return;}
  if(result.entitlementStatus==='ready'){owner.entitlementReady=true;await synchronize(owner);return;}
  if(result.outcome==='blocked'||result.outcome==='restore_required'){stop(owner,result);return;}
  if(result.reasonCode==='UPGRADE_ENTITLEMENT_UNKNOWN'){
   const observed=await read(owner,'probe');
   if(observed.entitlementStatus==='ready'){owner.entitlementReady=true;await synchronize(owner);}else stop(owner,observed);return;
  }
  if(result.bindingStatus!=='verified'||!['UPGRADE_ENTITLEMENT_NOT_READY','UPGRADE_WALLET_NOT_LINKED'].includes(result.reasonCode)){stop(owner,result);return;}
  // 初次合法权益沿Growth原业务身份履约；404从不被解释成此前未开户。
  try{result=await read(owner,'fulfill');}
  catch{live(owner);result=await read(owner,'probe');if(result.entitlementStatus==='ready'){owner.entitlementReady=true;await synchronize(owner);}else stop(owner,result);return;}
  if(result.entitlementStatus==='ready'){owner.entitlementReady=true;await synchronize(owner);return;}
  if(result.outcome==='unknown'||result.outcome==='pending'){
   result=await read(owner,'probe');if(result.entitlementStatus==='ready'){owner.entitlementReady=true;await synchronize(owner);}else stop(owner,result);return;
  }
  stop(owner,result);
 }catch{
  if(current(owner)){
   if(nativeUnconfirmed)pending(owner,'RESTORE_STORAGE_UNCONFIRMED','binding');
   else pending(owner,owner.entitlementReady?'UPGRADE_CONFIGURATION_PENDING':'UPGRADE_SERVICE_UNAVAILABLE');
  }
 }
 finally{clearTimeout(timer);}
}
/** 本realm每scope只有一个owner，完成/未知也不因重挂重新无token申请。 */
export function ensureAutomaticLicenseUpgrade(scope:CreationScope):Promise<void>{
 if(!isDesktopRuntimeClient())return Promise.resolve();
 const frozen=Object.freeze({groupId:scope.groupId,accountId:scope.groupId?null:scope.accountId}),key=automaticUpgradeScopeKey(frozen);
 if(key!==automaticUpgradeScopeKey(readCreationScope()))return Promise.resolve();
 for(const [other,owner] of owners)if(other!==key&&!owner.invalidated)invalidateAutomaticLicenseUpgradeScope(owner.scope);
 selectedScope=key;
 const previous=owners.get(key);
 if(previous){
  if(previous.invalidated){snapshot=Object.freeze({...AUTOMATIC_UPGRADE_SERVER_STATE,scopeKey:key,status:'pending',phase:'proof',reasonCode:'UPGRADE_IDENTITY_CHANGED',successRevision});for(const listener of listeners)listener();}
  return previous.promise;
 }
 if(owners.size>=256){snapshot=Object.freeze({...AUTOMATIC_UPGRADE_SERVER_STATE,scopeKey:key,status:'pending',phase:'proof',reasonCode:'UPGRADE_SERVICE_UNAVAILABLE',successRevision});for(const listener of listeners)listener();return Promise.resolve();}
 const owner:Owner={scope:frozen,key,control:new AbortController(),deadline:Date.now()+WAIT_MS,token:null,invalidated:false,entitlementReady:false,promise:Promise.resolve()};
 owners.set(key,owner);snapshot=Object.freeze({...AUTOMATIC_UPGRADE_SERVER_STATE,scopeKey:key,successRevision});
 // 先登记promise再执行首fetch，StrictMode同步重入也只join同一owner。
 owner.promise=Promise.resolve().then(()=>run(owner));return owner.promise;
}
/** 仅真实范围/许可失效调用；组件卸载或显示退订不调用。 */
export function invalidateAutomaticLicenseUpgradeScope(scope:CreationScope):void{
 const key=automaticUpgradeScopeKey(scope),owner=owners.get(key);
 if(owner){owner.invalidated=true;owner.control.abort();}
 if(snapshot.scopeKey===key){snapshot=Object.freeze({...AUTOMATIC_UPGRADE_SERVER_STATE,scopeKey:key,successRevision});for(const listener of listeners)listener();}
}
