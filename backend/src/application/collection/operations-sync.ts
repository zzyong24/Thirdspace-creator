import type {Collector,CollectResult} from '../../modules/ai-runtime';
import {operationsSyncSchema} from '@creatoros/contract';
import {isBrowserProfileBusy,BROWSER_PROFILE_RETRY_MS} from '../../modules/ai-runtime/scheduled-collection-runner';
/** 统一入口复用原采集器及其持久化边界。失败分别记录，已保存能力不回滚。 */
export function createOperationsSyncCollector(ports:{metrics:Collector;comments:Collector;traffic:Collector;checkSignal:()=>void;failures?:(ctx:import("@creatoros/contract").RequestContext,capabilities:readonly import("../../modules/analytics").SyncCapability[])=>Promise<number>;isNotLoggedIn:(error:unknown)=>boolean}):Collector{
 return async(ctx,target,report,execution)=>{
  // 旧已冻结任务没有新协议：只走原作品采集，不凭默认值临时打开评论/流量。
  if(target.operationsSync===undefined)return ports.metrics(ctx,{...target,__operationsSync:true},report,execution);
  const config=operationsSyncSchema.parse(target.operationsSync);
  const countsBySource:NonNullable<CollectResult["countsBySource"]>={};
  let itemsNew=0,itemsUpdated=0,remaining=false;const errors:string[]=[];
  const steps:Array<['metrics'|'comments'|'traffic',Collector]>=[['metrics',ports.metrics],['comments',ports.comments],['traffic',ports.traffic]];
  for(const [kind,collect] of steps){
   if(!config.capabilities[kind as 'metrics'|'comments'|'traffic'] && !(kind==='metrics'&&config.capabilities.content))continue;
   ports.checkSignal();
   try{
    const r=await collect(ctx,{...target,__operationsSync:true,__skipHeavyBackfill:target.__skipHeavyBackfill===true||!config.capabilities.content,__skipMetricRefresh:!config.capabilities.metrics},report,execution);
    countsBySource[kind]={itemsNew:r.itemsNew,itemsUpdated:r.itemsUpdated,countMode:r.countMode};
    itemsNew+=r.itemsNew;itemsUpdated+=r.itemsUpdated;
    if(r.continueCollection&&r.retryAfterMs!==undefined)return {...r,itemsNew,itemsUpdated,countsBySource,incomplete:errors.length>0||r.incomplete};
    if(r.incomplete)errors.push(r.message??`${kind} 尚未完成`);
    if(r.continueCollection)remaining=true;
   }catch(error){ports.checkSignal();if(ports.isNotLoggedIn(error))throw error;
    if(isBrowserProfileBusy(error))return {itemsNew,itemsUpdated,countsBySource,continueCollection:true,retryAfterMs:BROWSER_PROFILE_RETRY_MS,incomplete:errors.length>0,message:'浏览器正在被其他操作使用，稍后继续原任务；已保存的数据保留'};
    errors.push(`${{metrics:"作品指标和内容",comments:"作品评论",traffic:"流量来源"}[kind]}：${error instanceof Error?error.message:'读取失败'}`);}
  }
  const outstanding=await ports.failures?.(ctx,(["metrics","comments","content"] as const).filter(k=>config.capabilities[k]))??0;
  if(outstanding)errors.push(`${outstanding} 项数据仍待重试`);
  return {itemsNew,itemsUpdated,countsBySource,continueCollection:remaining,incomplete:errors.length>0,message:errors.length?`部分同步待重试；已保存的数据保留。${errors.join('；')}`:remaining?'本批已保存，继续剩余同步':'作品同步已完成'};
 };
}
