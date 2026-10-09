import {createHash} from 'node:crypto';
import type {Db} from '../../db';
import type {CollectionRunResource} from '@creatoros/contract';
import type {createHostBrowserProfileLifecycle} from '../execution';
import type {createBrowserProfileAuthority} from './browser-profile-authority.service';
import {createAccountBindingCommitter,createAccountBindingPreparer,type AccountBindingPreparedPlan} from './account-binding-commit';
import type {AccountBindingStagePort} from './account-binding.service';

type Authority=Pick<ReturnType<typeof createBrowserProfileAuthority>,'authorizeBindingStaging'|'authorizeBindingTarget'|'authorizeBindingRecoveryTarget'|'forgetTemporary'>;
type Lifecycle=Pick<ReturnType<typeof createHostBrowserProfileLifecycle>,'acquire'|'reserveProfiles'|'withProfiles'>;
type LocalBindingIdentity=NonNullable<Awaited<ReturnType<AccountBindingStagePort['identity']>>>;
export type LocalLoginControls={signal:AbortSignal;onStopped:()=>Promise<void>;onStopUnconfirmed:(retry:()=>Promise<void>)=>void};
/** 只接受宿主文件操作能力；backend不依赖frontend的路径、浏览器或Cookie实现。 */
export interface BindingProfileFilesPort {
 prepareAdoption(source:string,target:string,owner:{userId:string;runId:string}):Promise<{rollbackProfile:()=>Promise<void>;finalizeProfile:()=>Promise<void>}>;
 readAdoption(source:string):Promise<{userId?:string;runId?:string;targetDir:string}|null>;
 rollbackAdoption(source:string):Promise<void>;
 discardStaging(source:string):Promise<void>;
}
export interface LocalPlatformBindingStagePorts {
 db:Db;authority:Authority;lifecycle:Lifecycle;now:()=>string;nextId:(prefix:string)=>string;
 platform:'xiaohongshu'|'kuaishou'|'wechatOfficial'|'wechatVideo';scopes:CollectionRunResource['capability'][];
 profileFiles:BindingProfileFilesPort;
 loadLogin:()=>Promise<(directory:string,controls:LocalLoginControls)=>Promise<{platformIdentity:string;displayName:string;source:string;followerCount?:number|null}>>;
 commitAuthorization:(tx:Parameters<AccountBindingStagePort['commit']>[2],ctx:Parameters<AccountBindingStagePort['commit']>[0],accountId:string,identity:LocalBindingIdentity)=>Promise<void>;
}

/** 共用持久绑定任务和事务；平台驱动只返回真实身份，账号与授权由backend提交。 */
export function createLocalPlatformAccountBindingStage(ports:LocalPlatformBindingStagePorts):AccountBindingStagePort{
 const runs=new Map<string,string>(),identities=new Map<string,LocalBindingIdentity>(),pendingStops=new Map<string,()=>Promise<void>>();
 type Prepared={plan:AccountBindingPreparedPlan;runId:string;source:string;target:string;reservation:Awaited<ReturnType<Lifecycle['reserveProfiles']>>};
 const prepared=new Map<string,Prepared>(),prepare=createAccountBindingPreparer(ports);
 async function release(key:string,held:Prepared,keepTarget=false){await held.reservation.release();if(!keepTarget)ports.authority.forgetTemporary(held.target);prepared.delete(key);}
 const commit=createAccountBindingCommitter({...ports,commitAuthorization:(tx,ctx,account,identity)=>ports.commitAuthorization(tx,ctx,account.id,identity),prepareProfile:async(ctx,input,reader)=>{
  const held=prepared.get(input.stagingKey);if(!held||held.plan.accountId!==input.accountId||held.plan.userId!==ctx.userId||held.plan.groupId!==ctx.groupId)throw Error('绑定目录缺少原任务准备');
  const target=await ports.authority.authorizeBindingTarget(ctx,input.accountId,reader);if(target.authDir!==held.target)throw Error('平台登录目录与准备目标不符');
  input.signal.throwIfAborted();const receipt=await ports.profileFiles.prepareAdoption(held.source,held.target,{userId:ctx.userId,runId:held.runId});
  return {rollbackProfile:async()=>{await receipt.rollbackProfile();await release(input.stagingKey,held);},finalizeProfile:async()=>{try{await receipt.finalizeProfile();}finally{await release(input.stagingKey,held,true);}ports.authority.forgetTemporary(held.source);runs.delete(input.stagingKey);identities.delete(input.stagingKey);}};
 }});
 return {
  async createStaging(ctx,runId){const stagingKey=createHash('sha256').update(JSON.stringify([ctx.userId,runId])).digest('hex').slice(0,16);await ports.authority.authorizeBindingStaging(ctx,runId,stagingKey);runs.set(stagingKey,runId);return {stagingKey};},
  async login(ctx,{stagingKey,signal}){
   const runId=runs.get(stagingKey);if(!runId)throw Error('扫码目录缺少原任务');
   const login=await ports.loadLogin(),source=await ports.authority.authorizeBindingStaging(ctx,runId,stagingKey),resource=await ports.lifecycle.acquire(source.authDir,signal);
   const identity=await login(resource.authDir,{signal,onStopped:resource.onStopped,onStopUnconfirmed:retry=>pendingStops.set(stagingKey,retry)});
   if(!identity.platformIdentity?.trim())throw Error('未读到真实平台身份');
   identities.set(stagingKey,{externalAccountId:identity.platformIdentity,accountHandle:identity.displayName?.trim()||identity.platformIdentity,...(typeof identity.followerCount==='number'?{followerBaseline:identity.followerCount}:{}),collectionProof:{proofSource:identity.source,scopes:ports.scopes,verifiedAt:ports.now(),expiresAt:null}});return true;
  },
  async identity(_ctx,{stagingKey,signal}){signal.throwIfAborted();return identities.get(stagingKey)??null;},
  async prepareCommit(ctx,{stagingKey,identity,signal}){
   signal.throwIfAborted();if(prepared.has(stagingKey))throw Error('本绑定任务已准备');const runId=runs.get(stagingKey);if(!runId)throw Error('绑定缺少原任务');
   const plan=await prepare(ctx,identity);signal.throwIfAborted();const source=await ports.authority.authorizeBindingStaging(ctx,runId,stagingKey),target=await ports.authority.authorizeBindingRecoveryTarget(ctx,{runId,stagingKey,accountId:plan.accountId});
   try{const reservation=await ports.lifecycle.reserveProfiles([source.authDir,target.authDir],signal);prepared.set(stagingKey,{plan,runId,source:source.authDir,target:target.authDir,reservation});signal.throwIfAborted();}catch(error){if(!prepared.has(stagingKey))ports.authority.forgetTemporary(target.authDir);throw error;}
  },
  async commit(ctx,input,tx){const held=prepared.get(input.stagingKey);if(!held)throw Error('绑定缺少事务外准备');return commit(ctx,{...input,prepared:held.plan},tx);},
  async discard(ctx,{stagingKey,runId}){
   const source=(await ports.authority.authorizeBindingStaging(ctx,runId,stagingKey)).authDir;const retry=pendingStops.get(stagingKey);if(retry){await retry();pendingStops.delete(stagingKey);}
   const held=prepared.get(stagingKey);if(held&&(held.runId!==runId||held.plan.userId!==ctx.userId||held.plan.groupId!==ctx.groupId))throw Error('清理任务与准备归属不符');
   const adoption=await ports.profileFiles.readAdoption(source);let target:string|undefined;
   if(adoption){if(adoption.userId!==ctx.userId||adoption.runId!==runId)throw Error('恢复目录与原绑定任务不符');target=held?.target??(await ports.authority.authorizeBindingRecoveryTarget(ctx,{runId,stagingKey})).authDir;if(target!==adoption.targetDir)throw Error('恢复目录与原真实身份不符');}
   const cleanup=async()=>{if(adoption)await ports.profileFiles.rollbackAdoption(source);await ports.profileFiles.discardStaging(source);};
   if(held){await cleanup();await release(stagingKey,held);}else await ports.lifecycle.withProfiles(target?[source,target]:[source],cleanup);
   if(target)ports.authority.forgetTemporary(target);ports.authority.forgetTemporary(source);runs.delete(stagingKey);identities.delete(stagingKey);
  },
 };
}
