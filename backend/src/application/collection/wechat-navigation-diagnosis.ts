import {createHash} from 'node:crypto';
import {mkdir,lstat,realpath,readFile,open,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {lstatSync,realpathSync,renameSync} from 'node:fs';
import {z} from 'zod';
import {wechatNavigationDiagnosisResource,type WechatNavigationDiagnosisResource,type RequestContext,type RequestControls} from '@creatoros/contract';
import {ConflictError,OwnershipError,ValidationError,AuthenticationError} from '../../modules/platform-account/platform-account.errors';
import type {WechatNavigationControls,WechatNavigationResult} from '@creatoros/ai-worker/platform/wechat-browser-source';

// host排队120000 + source完整2330000（含其aggregate结算10000）。
const EXECUTION_BUDGET_MS=2_450_000;
const SETTLEMENT_BUDGET_MS=120_000;
const FINAL_MARGIN_MS=10_000;
export const WECHAT_NAVIGATION_BUDGET_MS=EXECUTION_BUDGET_MS+SETTLEMENT_BUDGET_MS+FINAL_MARGIN_MS;
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const configSchema=z.object({authorizationId:z.string().min(1).max(160),groupId:z.string().min(1),accountId:z.string().min(1),privateRoot:z.string().min(1),sourceSha:z.string().regex(/^[a-f0-9]{40}$/)}).strict();
export type WechatNavigationConfiguration=z.infer<typeof configSchema>;
type Account={id:string;userId:string;platform:string;externalAccountId?:string|null;status:string;updatedAt:string};
type Group={id:string;userId:string;status:string;version:number};
type Membership={id:string;userId:string;groupId:string;accountId:string;version:number;leftAt:string|null};
type FrozenScope={userId:string;groupId:string;groupVersion:number;membershipId:string;membershipVersion:number;accountId:string;platform:string;platformIdentity:string;accountStatus:string;accountUpdatedAt:string};
type Checkout={authDir:string;onStopped():Promise<void>;auditReceipt:Readonly<{leaseId:string;hostOperationId:string}>};
export interface WechatNavigationDiagnosisPorts{
 configuration?:unknown;
 assertOwnedAccount(ctx:RequestContext,accountId:string,platform:string):Promise<void>;
 readAccount(ctx:RequestContext,accountId:string):Promise<Account>;
 readGroup(ctx:RequestContext,groupId:string):Promise<Group>;
 readMembership(ctx:RequestContext,accountId:string):Promise<Membership>;
 authorizeProfile(ctx:RequestContext,accountId:string):Promise<{authDir:string}>;
 acquireProfile(directory:string,signal:AbortSignal):Promise<Checkout>;
 observeNavigation(directory:string,expectedIdentity:string,controls:WechatNavigationControls):Promise<WechatNavigationResult>;
 onStopUnconfirmed(retry:()=>Promise<void>):void;
 now?:()=>number;
}
const conflict=(reason:string):never=>{throw new ConflictError(reason);};
// SEMANTIC_BOUNDARY_ALLOW: 只区分已证归属拒绝与未知读失败，不推断平台页面或业务语义。
const provenScopeFailure=(error:unknown)=>error instanceof OwnershipError||error instanceof ValidationError||(error instanceof ConflictError&&['WECHAT_NAVIGATION_SCOPE_CHANGED','WECHAT_NAVIGATION_SCOPE_INVALID'].includes(error.message));
async function safeDiagnosticPort<T>(work:()=>Promise<T>):Promise<T>{
 try{return await work();}catch(error){
  if(error instanceof OwnershipError||error instanceof ValidationError||error instanceof AuthenticationError)throw error;
  // 仅本能力的固定协议可以原样公开；fs/JSON异常不得携带路径或原件片段出端口。
  if(error instanceof Error&&/^WECHAT_NAVIGATION_[A-Z0-9_]{1,80}$/.test(error.message))throw new ConflictError(error.message);
  throw new ConflictError('WECHAT_NAVIGATION_STORAGE_UNAVAILABLE');
 }
}
/** 有限机械scope校验不判断页面含义，也不修改任何采集实体。 */
export function createWechatNavigationDiagnosis(ports:WechatNavigationDiagnosisPorts){
 const now=ports.now??Date.now;
 // 所有等待共用本run绝对边界；晚到只读结果不能继续启动或发布。
 async function until<T>(deadline:number,work:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
  signal?.throwIfAborted();if(now()>=deadline)conflict('WECHAT_NAVIGATION_DEADLINE_EXCEEDED');
  let timer:ReturnType<typeof setTimeout>|undefined;let abort:(()=>void)|undefined;
  try{return await Promise.race([work(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('WECHAT_NAVIGATION_DEADLINE_EXCEEDED')),Math.max(0,deadline-now()));if(signal){abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();}})]);}finally{if(timer)clearTimeout(timer);if(abort)signal?.removeEventListener('abort',abort);}
 }
 async function freeze(ctx:RequestContext,accountId:string):Promise<FrozenScope>{
  if(!ctx.groupId)throw new OwnershipError('WECHAT_NAVIGATION_GROUP_REQUIRED');
  await ports.assertOwnedAccount(ctx,accountId,'wechatVideo');
  const [account,group,membership]=await Promise.all([ports.readAccount(ctx,accountId),ports.readGroup(ctx,ctx.groupId),ports.readMembership(ctx,accountId)]);
  if(account.userId!==ctx.userId||account.id!==accountId||account.platform!=='wechatVideo'||account.status!=='active'||!account.externalAccountId||group.userId!==ctx.userId||group.id!==ctx.groupId||group.status!=='active'||membership.userId!==ctx.userId||membership.groupId!==ctx.groupId||membership.accountId!==accountId||membership.leftAt!==null)throw new OwnershipError('WECHAT_NAVIGATION_SCOPE_INVALID');
  return {userId:ctx.userId,groupId:group.id,groupVersion:group.version,membershipId:membership.id,membershipVersion:membership.version,accountId,platform:account.platform,platformIdentity:account.externalAccountId,accountStatus:account.status,accountUpdatedAt:account.updatedAt};
 }
 async function privateDirectory(directory:string,create=false){
  if(!path.isAbsolute(directory))conflict('WECHAT_NAVIGATION_PRIVATE_ROOT_INVALID');
  if(create)await mkdir(directory,{mode:0o700});
  const stat=await lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o700||await realpath(directory)!==path.resolve(directory))conflict('WECHAT_NAVIGATION_PRIVATE_ROOT_INVALID');
 }
 async function readPrivate(filename:string):Promise<unknown>{
  await privateDirectory(path.dirname(filename));
  const stat=await lstat(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o600||stat.size>4*1024*1024)conflict('WECHAT_NAVIGATION_PRIVATE_INDEX_INVALID');
  return JSON.parse(await readFile(filename,'utf8'));
 }
 async function atomic(filename:string,value:unknown,deadline:number){
  await until(deadline,()=>privateDirectory(path.dirname(filename)));
  const temporary=`${filename}.tmp`;
  const bytes=JSON.stringify(value);if(Buffer.byteLength(bytes)>4*1024*1024)conflict('WECHAT_NAVIGATION_PRIVATE_INDEX_TOO_LARGE');
  let handle;try{handle=await open(temporary,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=undefined;if(now()>=deadline)conflict('WECHAT_NAVIGATION_DEADLINE_EXCEEDED');await privateDirectory(path.dirname(filename));if(now()>=deadline)conflict('WECHAT_NAVIGATION_DEADLINE_EXCEEDED');await rename(temporary,filename);}finally{await handle?.close();await unlink(temporary).catch(()=>{});}
 }
 function configuration(){const value=typeof ports.configuration==='function'?ports.configuration():ports.configuration;if(!value)conflict('WECHAT_NAVIGATION_DISABLED');try{return configSchema.parse(typeof value==='string'?JSON.parse(value):value);}catch{return conflict('WECHAT_NAVIGATION_CONFIG_INVALID');}}
 async function paths(){const config=configuration();await privateDirectory(config.privateRoot);const marker=path.join(config.privateRoot,`authorization-${hash(config.authorizationId)}.json`);return {config,marker};}
 async function assertCachedScope(ctx:RequestContext,accountId:string,response:unknown){
  const readDeadline=now()+120000;
  const result=wechatNavigationDiagnosisResource.parse(response);const {config,marker}=await until(readDeadline,paths);
  if(ctx.groupId!==config.groupId||accountId!==config.accountId)throw new OwnershipError('WECHAT_NAVIGATION_SCOPE_INVALID');
  const saved=await until(readDeadline,()=>readPrivate(marker)) as {invocationId?:unknown;scope?:unknown;directory?:unknown};
  if(saved.invocationId!==result.diagnosticRunId||typeof saved.directory!=='string'||saved.directory!==path.join(config.privateRoot,`run-${hash(result.diagnosticRunId)}`))conflict('WECHAT_NAVIGATION_PRIVATE_INDEX_INVALID');
  let current:FrozenScope;try{current=await until(readDeadline,()=>freeze(ctx,accountId));}catch(error){return conflict(provenScopeFailure(error)?'WECHAT_NAVIGATION_SCOPE_CHANGED':'WECHAT_NAVIGATION_SCOPE_UNVERIFIED');}
  if(hash(current)!==result.scopeProofHash||hash(saved.scope)!==result.scopeProofHash)conflict('WECHAT_NAVIGATION_SCOPE_CHANGED');
  const index=await until(readDeadline,()=>readPrivate(path.join(saved.directory as string,'result.json'))) as {result?:unknown;quarantined?:unknown};
  if((index.quarantined===true&&result.screenshots.length>0)||hash(index.result)!==hash(result))conflict('WECHAT_NAVIGATION_PRIVATE_INDEX_INVALID');
 }
 async function diagnose(ctx:RequestContext,accountId:string,controls?:RequestControls):Promise<WechatNavigationDiagnosisResource>{
  const started=now(),deadline=started+WECHAT_NAVIGATION_BUDGET_MS,executionDeadline=started+EXECUTION_BUDGET_MS,settlementDeadline=deadline-FINAL_MARGIN_MS;
  const {config,marker}=await until(executionDeadline,paths,controls?.signal);
  if(!controls?.signal||!controls.trustedInvocationId)conflict('WECHAT_NAVIGATION_TRUSTED_CLI_REQUIRED');
  const requestControls=controls??conflict('WECHAT_NAVIGATION_TRUSTED_CLI_REQUIRED');
  requestControls.signal.throwIfAborted();
  if(ctx.groupId!==config.groupId||accountId!==config.accountId)throw new OwnershipError('WECHAT_NAVIGATION_SCOPE_INVALID');
  const scope=await until(executionDeadline,()=>freeze(ctx,accountId),requestControls.signal),scopeProofHash=hash(scope),diagnosticRunId=requestControls.trustedInvocationId;
  const directory=path.join(config.privateRoot,`run-${hash(diagnosticRunId)}`);
  // wx消耗跨重启授权；重复/损坏均不能删标记再启动。
  let admission;
  try{admission=await open(marker,'wx',0o600);}catch(error){
   if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
   const previous=await readPrivate(marker) as {invocationId?:unknown;scope?:unknown;directory?:unknown};
   if(previous.invocationId!==diagnosticRunId)conflict('WECHAT_NAVIGATION_AUTHORIZATION_CONSUMED');
   if(hash(previous.scope)!==scopeProofHash||previous.directory!==directory)conflict('WECHAT_NAVIGATION_SCOPE_CHANGED');
   let index!:{result:unknown};try{index=await readPrivate(path.join(directory,'result.json')) as {result:unknown};}catch{conflict('WECHAT_NAVIGATION_OUTCOME_UNKNOWN');}
   await assertCachedScope(ctx,accountId,index.result);return wechatNavigationDiagnosisResource.parse(index.result);
  }
  try{await admission.writeFile(JSON.stringify({schema:'wechat-navigation-admission/v1',invocationId:diagnosticRunId,scope,directory,startedAt:new Date(started).toISOString(),deadlineAt:new Date(deadline).toISOString()}));await admission.sync();}finally{await admission.close();}
  await privateDirectory(directory,true);
  const controller=new AbortController(),signal=AbortSignal.any([requestControls.signal,controller.signal]);
  const timer=setTimeout(()=>controller.abort(Error('WECHAT_NAVIGATION_DEADLINE_EXCEEDED')),Math.max(0,executionDeadline-now()));
  let scopeChanged=false,scopeUnverified=false,checkout:Checkout|undefined,observation:WechatNavigationResult|undefined,observerEntered=false;
  const stop:WechatNavigationDiagnosisResource['stop']={browserOpened:false,contextCloseStarted:false,physicalStopConfirmed:false,physicalStoppedAt:null,hostLeaseReleaseConfirmed:false,hostLeaseReleasedAt:null,stopPending:false};
  const assertScopeFresh=async()=>{signal.throwIfAborted();if(now()>=executionDeadline){controller.abort(Error('WECHAT_NAVIGATION_DEADLINE_EXCEEDED'));signal.throwIfAborted();}try{if(hash(await until(executionDeadline,()=>freeze(ctx,accountId),signal))!==scopeProofHash)conflict('WECHAT_NAVIGATION_SCOPE_CHANGED');}catch(error){if(!signal.aborted){scopeChanged=provenScopeFailure(error);scopeUnverified=!scopeChanged;controller.abort(Error(scopeChanged?'WECHAT_NAVIGATION_SCOPE_CHANGED':'WECHAT_NAVIGATION_SCOPE_UNVERIFIED'));}throw error;}signal.throwIfAborted();};
  let reasonCode:string|null=null,status:WechatNavigationDiagnosisResource['status']='completed';
  try{
   await assertScopeFresh();
   const profile=await until(executionDeadline,()=>ports.authorizeProfile(ctx,accountId),signal);await assertScopeFresh();
   const acquisition=ports.acquireProfile(profile.authDir,signal);
   try{checkout=await until(executionDeadline,()=>acquisition,signal);}catch(error){
    // acquire迟到但从未交给worker：保有同一清理能力，不能丢失租约或再启动。
    stop.stopPending=true;const cleanup=async()=>{const late=await acquisition;await late.onStopped();stop.hostLeaseReleaseConfirmed=true;stop.hostLeaseReleasedAt=new Date(now()).toISOString();stop.stopPending=false;};
    ports.onStopUnconfirmed(cleanup);void cleanup().catch(()=>{});throw error;
   }
   await assertScopeFresh();
   observerEntered=true;
   observation=await ports.observeNavigation(checkout.authDir,scope.platformIdentity,{
    signal,deadlineAt:new Date(executionDeadline).toISOString(),diagnosticRunId,privateEvidenceDir:directory,assertScopeFresh,
    onBrowserOpened:()=>{stop.browserOpened=true;},onContextCloseStarted:()=>{stop.contextCloseStarted=true;},
    onPhysicalStopped:occurredAt=>{stop.physicalStopConfirmed=true;stop.physicalStoppedAt=occurredAt;},
    onStopped:async()=>{await checkout!.onStopped();stop.hostLeaseReleaseConfirmed=true;stop.hostLeaseReleasedAt=new Date(now()).toISOString();stop.stopPending=false;},
    onStopUnconfirmed:retry=>{stop.stopPending=true;ports.onStopUnconfirmed(retry);},
   });
   await assertScopeFresh();
   if(!stop.physicalStopConfirmed||!stop.hostLeaseReleaseConfirmed){status='unknown';reasonCode='WECHAT_NAVIGATION_STOP_PENDING';stop.stopPending=true;}
  }catch(error){
   reasonCode=scopeChanged?'WECHAT_NAVIGATION_SCOPE_CHANGED':scopeUnverified?'WECHAT_NAVIGATION_SCOPE_UNVERIFIED':signal.aborted?(now()>=executionDeadline?'WECHAT_NAVIGATION_DEADLINE_EXCEEDED':'WECHAT_NAVIGATION_CANCELLED'):typeof (error as {code?:unknown}).code==='string'?String((error as {code:string}).code):'WECHAT_NAVIGATION_FAILED';
   status=scopeChanged?'failed':scopeUnverified?'unknown':signal.aborted?'cancelled':'failed';
   if(checkout&&!observerEntered&&!stop.hostLeaseReleaseConfirmed){try{await checkout.onStopped();stop.hostLeaseReleaseConfirmed=true;stop.hostLeaseReleasedAt=new Date(now()).toISOString();}catch{stop.stopPending=true;ports.onStopUnconfirmed(checkout.onStopped);}}
   if(stop.browserOpened&&(!stop.physicalStopConfirmed||!stop.hostLeaseReleaseConfirmed)){stop.stopPending=true;status='unknown';}
   if(stop.stopPending)status='unknown';
  }finally{clearTimeout(timer);}
  // 私有准备可异步；有效索引只在最后一次scope核验后的同步段提交。
  // 提交点之后才收到的取消不追改已完成事实；提交前取消只提交无图隔离摘要。
  for(let preparation=0;preparation<2;preparation++){
   try{if(hash(await until(settlementDeadline,()=>freeze(ctx,accountId)))!==scopeProofHash)scopeChanged=true;}catch(error){if(now()>=settlementDeadline)conflict('WECHAT_NAVIGATION_SETTLEMENT_DEADLINE');if(provenScopeFailure(error))scopeChanged=true;else scopeUnverified=true;}
   if(scopeChanged){status='failed';reasonCode='WECHAT_NAVIGATION_SCOPE_CHANGED';}
   else if(scopeUnverified){status='unknown';reasonCode='WECHAT_NAVIGATION_SCOPE_UNVERIFIED';}
   else if(signal.aborted){status=stop.stopPending?'unknown':'cancelled';reasonCode=now()>=executionDeadline?'WECHAT_NAVIGATION_DEADLINE_EXCEEDED':'WECHAT_NAVIGATION_CANCELLED';}
   const quarantined=scopeChanged||signal.aborted||status!=='completed';
   const result=wechatNavigationDiagnosisResource.parse({diagnosticRunId,status,reasonCode,startedAt:new Date(started).toISOString(),deadlineAt:new Date(deadline).toISOString(),completedAt:new Date(now()).toISOString(),scopeProofHash,identityMatched:observation?.identityMatched??null,sampleCount:observation?.sampleCount??0,screenshots:quarantined?[]:(observation?.snapshots??[]).map(snapshot=>({phase:snapshot.phase,...snapshot.screenshot})),stop});
   await until(settlementDeadline,()=>privateDirectory(directory));
   await until(settlementDeadline,()=>atomic(path.join(directory,'manifest.json'),{schema:'wechat-navigation-private-manifest/v1',diagnosticRunId,scope,sourceSha:config.sourceSha,auditReceipt:checkout?.auditReceipt??null,quarantined,observation:observation??null,result},settlementDeadline));
   const prepared=path.join(directory,'result.prepared.json');
   await until(settlementDeadline,()=>atomic(prepared,{result,quarantined},settlementDeadline));
   // 最后的异步边界之后，signal/deadline/目录与rename处于同一JS执行段。
   let finalScopeChanged=false,finalScopeUnverified=false;
   try{finalScopeChanged=hash(await until(settlementDeadline,()=>freeze(ctx,accountId)))!==scopeProofHash;}catch(error){if(now()>=settlementDeadline)conflict('WECHAT_NAVIGATION_SETTLEMENT_DEADLINE');if(provenScopeFailure(error))finalScopeChanged=true;else finalScopeUnverified=true;}
   if(finalScopeChanged&&!scopeChanged){scopeChanged=true;continue;}
   if(finalScopeUnverified&&!scopeUnverified){scopeUnverified=true;continue;}
   if(signal.aborted&&!quarantined)continue;
   if(now()>=settlementDeadline)conflict('WECHAT_NAVIGATION_SETTLEMENT_DEADLINE');
   for(const ownedDirectory of [config.privateRoot,directory]){const stat=lstatSync(ownedDirectory);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o700||realpathSync(ownedDirectory)!==path.resolve(ownedDirectory))conflict('WECHAT_NAVIGATION_PRIVATE_ROOT_INVALID');}
   // SEMANTIC_BOUNDARY_ALLOW: 仅以原signal/固定期限落实发布授权，不判断页面或创作含义。
   if(signal.aborted&&!quarantined)continue;
   if(now()>=settlementDeadline)conflict('WECHAT_NAVIGATION_SETTLEMENT_DEADLINE');
   renameSync(prepared,path.join(directory,'result.json'));
   return result;
  }
  return conflict('WECHAT_NAVIGATION_PUBLICATION_INTERRUPTED');
 }
 return {diagnose:(ctx:RequestContext,accountId:string,controls?:RequestControls)=>safeDiagnosticPort(()=>diagnose(ctx,accountId,controls)),assertCachedScope:(ctx:RequestContext,accountId:string,response:unknown)=>safeDiagnosticPort(()=>assertCachedScope(ctx,accountId,response))};
}
