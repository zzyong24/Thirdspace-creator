import {executionTimeoutMs} from "@creatoros/contract/timeout-policy";
import type {HostProcessRecovery} from './host-browser-process-recovery';
import {retryBrowserProfileCleanup} from '@creatoros/ai-worker/browser/chromium-guard';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import type {Db} from '@creatoros/backend';
import {setTimeout as delay} from 'node:timers/promises';
import {BrowserProfileBusyError,createExecutionBrowserProfileLeaseService} from './execution-browser-profile-lease.service';

export interface HostBrowserProfileIdentity {userId:string;authDir:string;profileKey:string;domain?:string}
/** 宿主资源授权适配器。当前账号归属/规范路径由生产resolveProfile验证，凭据不经此端口。 */
export function createHostBrowserProfileLifecycle(db:Db,deps:{
 resolveProfile(authDir:string,signal?:AbortSignal):Promise<HostBrowserProfileIdentity>;
 hostInstanceId?:string;
 waitTimeoutMs?:number;
 pollIntervalMs?:number;
 recovery?:HostProcessRecovery;
}){
 const profiles=createExecutionBrowserProfileLeaseService(db);
 let hostIdentity:Promise<string>|undefined;
 const getHostIdentity=()=>hostIdentity??=Promise.resolve(deps.hostInstanceId??deps.recovery?.createHostInstanceId()??randomUUID());
 const identitySchema=z.object({userId:z.string().min(1),authDir:z.string().min(1),profileKey:z.string().regex(/^[a-f0-9]{64}$/),domain:z.string().min(1).optional()}).strict();
 const stoppedCleanup=new Map<string,()=>Promise<void>>();
 const acquire=async(authDir:string,signal?:AbortSignal)=>{
  signal?.throwIfAborted();const identity=identitySchema.parse(await deps.resolveProfile(authDir,signal));signal?.throwIfAborted();
  await stoppedCleanup.get(identity.authDir)?.();
  // 只重试本进程已经收到实际停止证明的释放；不抢占活资源或按TTL解锁。
  await retryBrowserProfileCleanup(identity.authDir,{signal});signal?.throwIfAborted();
  const hostInstanceId=await getHostIdentity();signal?.throwIfAborted();
  const owner={userId:identity.userId,domain:identity.domain??'douyin.com',profileKey:identity.profileKey,hostInstanceId,hostOperationId:randomUUID()};
  // 同档案的后台采集和登录探针共用互斥资源。只等真实持有者释放，不按时间抢占。
  const deadline=Date.now()+(executionTimeoutMs(deps.waitTimeoutMs));
  let receipt:Awaited<ReturnType<typeof profiles.acquireForHost>>;
  let recoveryChecked=false;
  for(;;){
   signal?.throwIfAborted();
   try{receipt=await profiles.acquireForHost(owner);break;}
   catch(error){
    if(!(error instanceof BrowserProfileBusyError)||Date.now()>=deadline)throw error;
    if(deps.recovery&&!recoveryChecked){
     recoveryChecked=true;
     const held=await profiles.getHeldHostLease({userId:identity.userId,domain:identity.domain??'douyin.com',profileKey:identity.profileKey});
     if(held&&held.hostInstanceId!==hostInstanceId){
      const proof=await deps.recovery.isPreviousHostStopped({hostInstanceId:held.hostInstanceId,authDir:identity.authDir});signal?.throwIfAborted();
      if(proof.stopped){
       if(await profiles.releaseVerifiedStoppedHost(held)){console.info('[browser-profile-recovery] 已确认旧宿主停止，恢复原采集档案',{reason:proof.reason});continue;}
      }else console.info('[browser-profile-recovery] 保留占用，等待实际使用者释放',{reason:proof.reason});
     }
    }
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
 async function reserveProfiles(authDirs:string[],signal?:AbortSignal){
  const held:Array<Awaited<ReturnType<typeof acquire>>>=[];
  const release=async()=>{
   const results=await Promise.allSettled(held.map(async resource=>{
    const cleanup=async()=>{await resource.onStopped();stoppedCleanup.delete(resource.authDir);};
    stoppedCleanup.set(resource.authDir,cleanup);await cleanup();
   }));
   const failure=results.find(result=>result.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
  };
  try{for(const dir of [...new Set(authDirs)].sort())held.push(await acquire(dir,signal));return {release};}
  catch(error){await release();throw error;}
 }
 return {acquire,reserveProfiles,async withProfiles<T>(authDirs:string[],action:()=>Promise<T>):Promise<T>{
  const reservation=await reserveProfiles(authDirs);
  try{return await action();}finally{await reservation.release();}
 }};
}
