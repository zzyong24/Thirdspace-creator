import {requireAccountId} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';

/** 同账号串行只协调内存中的调用；真实任务与重试仍由 execution_tasks 管理。 */
export function createAccountCollectionQueue(){
 const tails=new Map<string,Promise<void>>();
 return (ctx:RequestContext,run:()=>Promise<void>,signal?:AbortSignal):Promise<void>=>{
  signal?.throwIfAborted();
  const key=JSON.stringify([ctx.userId,requireAccountId(ctx.accountId)]);
  const previous=tails.get(key)??Promise.resolve();
  let started=false;
  const pending=previous.then(()=>{signal?.throwIfAborted();started=true;return run();});
  const tail=pending.catch(()=>{}).finally(()=>{if(tails.get(key)===tail)tails.delete(key);});
  tails.set(key,tail);
  if(!signal)return pending;
  // 等待者可以立即取消；已开始的采集必须等真实退出，才能交还执行权和账号槽。
  return new Promise<void>((resolve,reject)=>{
   const onAbort=()=>{if(!started)reject(signal.reason);};
   signal.addEventListener('abort',onAbort,{once:true});
   pending.then(resolve,reject).finally(()=>signal.removeEventListener('abort',onAbort));
   if(signal.aborted)onAbort();
  });
 };
}
