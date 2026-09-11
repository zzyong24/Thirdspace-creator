import type {RequestContext} from '@creatoros/contract';
export const TRAFFIC_START_FAILURE='流量补采未能启动，已有数据已保留，请重试或查看任务中心。';
/** 等待的只有执行准备，不等待逐作品抓取；失败只结算本次冻结的队列行。 */
export async function startTrafficCollection<Row,Run extends {aiTaskId:string;completion?:Promise<unknown>}>(ctx:RequestContext,ports:{
 snapshot:()=>Promise<Row[]>;
 trigger:()=>Promise<Run>;
 fail:(rows:Row[],message:string)=>Promise<unknown>;
}){
 const rows=await ports.snapshot();
 try{const run=await ports.trigger();await run.completion;return run;}
 catch(error){
  console.error('[traffic-start] 执行准备失败',{accountId:ctx.accountId,requestId:ctx.requestId,error});
  await ports.fail(rows,TRAFFIC_START_FAILURE);
  throw new Error(TRAFFIC_START_FAILURE,{cause:error});
 }
}
