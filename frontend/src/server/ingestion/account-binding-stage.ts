import {createHash} from 'node:crypto';
import path from 'node:path';
import type {Db} from '@creatoros/backend';
import {createAccountBindingCommitter,createAccountBindingPreparer,type AccountBindingPreparedPlan,type AccountBindingStagePort,createBrowserProfileAuthority} from '@creatoros/backend/modules/platform-account';
import type {createHostBrowserProfileLifecycle} from '@creatoros/backend/modules/execution';
import {prepareDouyinStagingAdoption,discardDouyinStagingDir,readDouyinBindingAdoption,rollbackDouyinBindingAdoption,douyinStagingDirFor} from './douyin-auth-staging';
type Authority=ReturnType<typeof createBrowserProfileAuthority>;
type Lifecycle=ReturnType<typeof createHostBrowserProfileLifecycle>;
/** 宿主文件与真实浏览器适配；账号归属、身份幂等、组事务由backend服务落实。 */
export function createDouyinAccountBindingStage(ports:{db:Db;base:string;authority:Authority;lifecycle:Lifecycle;now:()=>string;nextId:(prefix:string)=>string;loadCdp:()=>Promise<typeof import('./douyin-cdp')>}):AccountBindingStagePort{
 const runs=new Map<string,string>();
 type Prepared={plan:AccountBindingPreparedPlan;runId:string;source:string;target:string;reservation:Awaited<ReturnType<Lifecycle['reserveProfiles']>>};
 const prepared=new Map<string,Prepared>();
 const prepare=createAccountBindingPreparer(ports);
 async function release(key:string,held:Prepared){await held.reservation.release();ports.authority.forgetTemporary(held.plan.accountId);prepared.delete(key);}
 const commit=createAccountBindingCommitter({...ports,prepareProfile:async(ctx,input,reader)=>{
  const held=prepared.get(input.stagingKey);if(!held||held.plan.accountId!==input.accountId||held.plan.userId!==ctx.userId||held.plan.groupId!==ctx.groupId)throw new Error('绑定目录缺少原任务准备');
  const target=await ports.authority.authorizeBindingTarget(ctx,input.accountId,reader);
  if(target.authDir!==held.target)throw new Error('绑定目录与准备目标不符');
  input.signal.throwIfAborted();const receipt=await prepareDouyinStagingAdoption(held.source,held.target,{userId:ctx.userId,runId:held.runId});
  return {
   rollbackProfile:async()=>{await receipt.rollbackProfile();await release(input.stagingKey,held);},
   finalizeProfile:async()=>{try{await receipt.finalizeProfile();}finally{await release(input.stagingKey,held);}ports.authority.forgetTemporary(`_staging-${input.stagingKey}`);runs.delete(input.stagingKey);},
  };
 }});

 return {
  async createStaging(ctx,runId){
   // SEMANTIC_BOUNDARY_ALLOW: 稳定token只绑定真实runID以恢复宿主目录，不解释内容或身份。
   const stagingKey=createHash('sha256').update(JSON.stringify([ctx.userId,runId])).digest('hex').slice(0,16);
   await ports.authority.authorizeBindingStaging(ctx,runId,stagingKey);runs.set(stagingKey,runId);return {stagingKey};
  },
  async login(ctx,{stagingKey,signal}){const dir=douyinStagingDirFor(ports.base,stagingKey),owner=await ports.authority.resolveProfile(dir,signal);if(owner.userId!==ctx.userId)throw new Error('扫码目录属于其它用户');return (await ports.loadCdp()).loginDouyin({authDir:dir,signal});},
  async identity(ctx,{stagingKey,signal}){const dir=douyinStagingDirFor(ports.base,stagingKey),owner=await ports.authority.resolveProfile(dir,signal);if(owner.userId!==ctx.userId)throw new Error('扫码目录属于其它用户');const identity=await(await ports.loadCdp()).fetchDouyinIdentity({authDir:dir,signal});return identity?.secUid?{externalAccountId:identity.secUid,accountHandle:identity.nickname,...(typeof identity.followerCount==='number'?{followerBaseline:identity.followerCount}:{})}:null;},
  async prepareCommit(ctx,{stagingKey,identity,signal}){
   signal.throwIfAborted();if(prepared.has(stagingKey))throw new Error('本绑定任务已准备');
   const runId=runs.get(stagingKey);if(!runId)throw new Error('绑定临时目录缺少原任务');
   const plan=await prepare(ctx,identity);signal.throwIfAborted();
   const source=(await ports.authority.authorizeBindingStaging(ctx,runId,stagingKey)).authDir;
   const target=await ports.authority.authorizeBindingRecoveryTarget(ctx,{runId,stagingKey,accountId:plan.accountId});
   try{const reservation=await ports.lifecycle.reserveProfiles([source,target.authDir],signal);prepared.set(stagingKey,{plan,runId,source,target:target.authDir,reservation});signal.throwIfAborted();}
   catch(error){if(!prepared.has(stagingKey))ports.authority.forgetTemporary(plan.accountId);throw error;}
  },
  async discard(ctx,{stagingKey,runId}){
   const source=(await ports.authority.authorizeBindingStaging(ctx,runId,stagingKey)).authDir;
   const held=prepared.get(stagingKey);
   if(held&&(held.runId!==runId||held.plan.userId!==ctx.userId||held.plan.groupId!==ctx.groupId))throw new Error('清理任务与准备归属不符');
   const adoption=await readDouyinBindingAdoption(source);let target:string|undefined;
   if(adoption){if(adoption.userId!==ctx.userId||adoption.runId!==runId)throw new Error('恢复目录与原绑定任务不符');
    // 已持真实租约时不再请求同一宿主资源；重启丢失Map才读持久run证明恢复。
    if(held){if(held.target!==adoption.targetDir)throw new Error('恢复目录与准备目标不符');target=held.target;}
    else target=(await ports.authority.authorizeBindingRecoveryTarget(ctx,{runId,stagingKey,accountId:path.basename(adoption.targetDir)})).authDir;
   }
   const cleanup=async()=>{if(adoption)await rollbackDouyinBindingAdoption(source);await discardDouyinStagingDir(source);};
   if(held){await cleanup();await release(stagingKey,held);}
   else await ports.lifecycle.withProfiles(target?[source,target]:[source],cleanup);
   if(target)ports.authority.forgetTemporary(path.basename(target));ports.authority.forgetTemporary(`_staging-${stagingKey}`);runs.delete(stagingKey);
  },
  async commit(ctx,input,tx){const held=prepared.get(input.stagingKey);if(!held)throw new Error('绑定缺少事务外准备');return commit(ctx,{...input,prepared:held.plan},tx);},
 };
}
