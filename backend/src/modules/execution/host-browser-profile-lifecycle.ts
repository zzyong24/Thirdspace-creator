import {retryBrowserProfileCleanup} from '@creatoros/ai-worker/browser/chromium-guard';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import type {Db} from '@creatoros/backend';
import {setTimeout as delay} from 'node:timers/promises';
import {BrowserProfileBusyError,createExecutionBrowserProfileLeaseService} from './execution-browser-profile-lease.service';

export interface HostBrowserProfileIdentity {userId:string;authDir:string;profileKey:string}
/** 宿主资源授权适配器。当前账号归属/规范路径由生产resolveProfile验证，凭据不经此端口。 */
export function createHostBrowserProfileLifecycle(db:Db,deps:{
 resolveProfile(authDir:string,signal?:AbortSignal):Promise<HostBrowserProfileIdentity>;
 hostInstanceId?:string;
 waitTimeoutMs?:number;
 pollIntervalMs?:number;
}){
 const profiles=createExecutionBrowserProfileLeaseService(db),hostInstanceId=deps.hostInstanceId??randomUUID();
 const identitySchema=z.object({userId:z.string().min(1),authDir:z.string().min(1),profileKey:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
 const stoppedCleanup=new Map<string,()=>Promise<void>>();
 const acquire=async(authDir:string,signal?:AbortSignal)=>{
  signal?.throwIfAborted();const identity=identitySchema.parse(await deps.resolveProfile(authDir,signal));signal?.throwIfAborted();
  await stoppedCleanup.get(identity.authDir)?.();
  // 只重试本进程已经收到实际停止证明的释放；不抢占活资源或按TTL解锁。
  await retryBrowserProfileCleanup(identity.authDir,{signal});signal?.throwIfAborted();
  const owner={userId:identity.userId,domain:'douyin.com',profileKey:identity.profileKey,hostInstanceId,hostOperationId:randomUUID()};
  // 同档案的后台采集和登录探针共用互斥资源。只等真实持有者释放，不按时间抢占。
  const deadline=Date.now()+(deps.waitTimeoutMs??60_000);
  let receipt:Awaited<ReturnType<typeof profiles.acquireForHost>>;
  for(;;){
   signal?.throwIfAborted();
   try{receipt=await profiles.acquireForHost(owner);break;}
   catch(error){
    if(!(error instanceof BrowserProfileBusyError)||Date.now()>=deadline)throw error;
    // 重试已收到 context 停止事件、但 DB 释放曾失败的清理能力。
    await stoppedCleanup.get(identity.authDir)?.();
    await retryBrowserProfileCleanup(identity.authDir,{signal});
    await delay(Math.min(deps.pollIntervalMs??250,Math.max(1,deadline-Date.now())),undefined,{signal});
   }
  }
  let released=false,pending:Promise<void>|undefined;
  const onStopped=():Promise<void>=>{
   if(released)return Promise.resolve();
   if(!pending){pending=profiles.releaseAfterHostStopped(owner,receipt.leaseId).then(()=>{released=true;});void pending.catch(()=>{pending=undefined;});}
   return pending;
  };
  // 即使此刻取消仍交给guardedLaunch；其停止/释放重试不能在适配器中丢失。
  return {authDir:identity.authDir,onStopped};
 };
 return {acquire,async withProfiles<T>(authDirs:string[],action:()=>Promise<T>):Promise<T>{
  const held:Array<Awaited<ReturnType<typeof acquire>>>=[];
  try{for(const dir of [...new Set(authDirs)].sort())held.push(await acquire(dir));return await action();}
  finally{
   // 目录操作没有浏览器子进程；action 已退出即有停止证明。释放失败保留给下一次 checkout 重试。
   const results=await Promise.allSettled(held.map(async resource=>{
    const cleanup=async()=>{await resource.onStopped();stoppedCleanup.delete(resource.authDir);};
    stoppedCleanup.set(resource.authDir,cleanup);await cleanup();
   }));
   const failure=results.find(result=>result.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
  }
 }};
}
