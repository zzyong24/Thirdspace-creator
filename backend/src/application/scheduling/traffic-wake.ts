import type { RequestContext } from '@creatoros/contract';
/** 持久队列补偿唤醒：补齐入队与上一轮完成之间的空窗。暂停/失败留给用户恢复。 */
export async function recoverTrafficQueues(ctx:RequestContext,ports:{
 listJobs:(ctx:RequestContext,query:{sourceKind:string;limit:number;offset:number})=>Promise<{rows:Array<{id:string;accountId?:string|null;enabled?:boolean}>;total:number}>;
 listRuns:(ctx:RequestContext,jobId:string)=>Promise<{rows:Array<{status:string}>}>;
 hasPending:(ctx:RequestContext)=>Promise<boolean>;
 start:(ctx:RequestContext)=>Promise<unknown>;
 shouldStop:()=>boolean;
}){
 for(let offset=0;!ports.shouldStop();offset+=100){
  const jobs=await ports.listJobs(ctx,{sourceKind:'self.traffic',limit:100,offset});
  for(const job of jobs.rows){
   if(ports.shouldStop())return;
   if(!job.accountId||job.enabled===false)continue;
   const owned={...ctx,accountId:job.accountId};
   if(!await ports.hasPending(owned))continue;
   const {rows}=await ports.listRuns(owned,job.id);
   if(rows.some(run=>run.status==='running'||run.status==='needs_reconnect'))continue;
   if(rows.length && rows[0]!.status!=='succeeded')continue;
   await ports.start(owned);
  }
  if(offset+jobs.rows.length>=jobs.total||jobs.rows.length===0)return;
 }
}
