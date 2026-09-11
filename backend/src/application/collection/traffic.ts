import type {TrafficSourcePayload,RequestContext} from '@creatoros/contract';
import type {TrafficService} from '../../modules/analytics';
import type {Collector} from '../../modules/ai-runtime';
/** 单批交还原执行权；逐作品状态是断点，基础采集不等待此任务。 */
export function createTrafficCollector(ports:{service:TrafficService;read:(ctx:RequestContext,externalId:string)=>Promise<TrafficSourcePayload>;checkSignal:()=>void;isNotLoggedIn:(error:unknown)=>boolean}):Collector{
 return async(ctx,_target,report,execution)=>{
  if(!execution?.taskId)throw new Error("流量补采缺少原任务标识");
  ports.checkSignal();await ports.service.reconnect(ctx);
  const rows=await ports.service.pending(ctx,20);let written=0,failed=0;
  for(const row of rows){
   ports.checkSignal();
   try{
    const pub=await ports.service.assertPublication(ctx,row.publicationId);
    if(pub.externalId!==row.externalId)throw new Error('作品来源标识已变化');
    const data=await ports.read(ctx,row.externalId);ports.checkSignal();
    await ports.service.settle(ctx,row,{data},execution.taskId);written++;
   }catch(error){
    ports.checkSignal();const reconnect=ports.isNotLoggedIn(error);
    await ports.service.settle(ctx,row,{status:reconnect?'needs_reconnect':'failed',error:reconnect?'登录已过期，请重新连接抖音':error instanceof Error?error.message:'流量来源读取失败'},execution.taskId);
    if(reconnect)throw error;failed++;
   }
   report({stage:'traffic',processed:written+failed,total:rows.length,message:`本批流量来源：已保存 ${written} 条，失败 ${failed} 条；基础指标已保留`});
  }
  const summary=await ports.service.summary(ctx,execution.taskId);
  const remaining=(await ports.service.pending(ctx,1)).length>0;
  return {itemsNew:0,itemsUpdated:summary.written,continueCollection:remaining,incomplete:summary.failed>0,message:remaining?'本批已保存，后台继续剩余流量来源':summary.failed?'部分作品流量来源读取失败，可在复盘页重试；基础指标不受影响':'流量来源待采队列已处理'};
 };
}
