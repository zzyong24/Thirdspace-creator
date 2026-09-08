import {retryBrowserProfileCleanup} from '@creatoros/ai-worker/browser/chromium-guard';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import type {Db} from '@creatoros/backend';
import {createExecutionBrowserProfileLeaseService} from './execution-browser-profile-lease.service';

export interface HostBrowserProfileIdentity {userId:string;authDir:string;profileKey:string}
/** 宿主资源授权适配器。当前账号归属/规范路径由生产resolveProfile验证，凭据不经此端口。 */
export function createHostBrowserProfileLifecycle(db:Db,deps:{
 resolveProfile(authDir:string,signal?:AbortSignal):Promise<HostBrowserProfileIdentity>;
 hostInstanceId?:string;
}){
 const profiles=createExecutionBrowserProfileLeaseService(db),hostInstanceId=deps.hostInstanceId??randomUUID();
 const identitySchema=z.object({userId:z.string().min(1),authDir:z.string().min(1),profileKey:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
 return {async acquire(authDir:string,signal?:AbortSignal){
  signal?.throwIfAborted();const identity=identitySchema.parse(await deps.resolveProfile(authDir,signal));signal?.throwIfAborted();
  // 只重试本进程已经收到实际停止证明的释放；不抢占活资源或按TTL解锁。
  await retryBrowserProfileCleanup(identity.authDir,{signal});signal?.throwIfAborted();
  const owner={userId:identity.userId,domain:'douyin.com',profileKey:identity.profileKey,hostInstanceId,hostOperationId:randomUUID()};
  const receipt=await profiles.acquireForHost(owner);
  let released=false,pending:Promise<void>|undefined;
  const onStopped=():Promise<void>=>{
   if(released)return Promise.resolve();
   if(!pending){pending=profiles.releaseAfterHostStopped(owner,receipt.leaseId).then(()=>{released=true;});void pending.catch(()=>{pending=undefined;});}
   return pending;
  };
  // 即使此刻取消仍交给guardedLaunch；其停止/释放重试不能在适配器中丢失。
  return {authDir:identity.authDir,onStopped};
 }};
}
