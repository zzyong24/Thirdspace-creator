import type {CollectionRunResource,RequestContext} from '@creatoros/contract';
import type {CollectResult} from '../../modules/ai-runtime/scheduled-collection-runner';

export class PlatformCollectionNeedsAuthError extends Error {readonly code='PLATFORM_NEEDS_AUTH';}
type Capability=CollectionRunResource['capability'];
/** 调度只复用平台服务的原attempt/租约/提交协议，不读Cookie，不创建第二条周期生产链。 */
export function createPlatformMetricsCollector(ports:{
 account(ctx:RequestContext,accountId:string):Promise<{platform:string}>;
 start(ctx:RequestContext,input:{accountId:string;capability:Capability;clientRequestId:string}):Promise<CollectionRunResource>;
 status(ctx:RequestContext,accountId:string,attemptId:string):Promise<CollectionRunResource>;
 resumeAuthorization?(ctx:RequestContext,accountId:string,attemptId:string,taskId:string):Promise<void>;
 schedule(ctx:RequestContext,run:CollectionRunResource,signal?:AbortSignal):Promise<void>;
}){
 return async(ctx:RequestContext,taskId:string,signal?:AbortSignal):Promise<CollectResult>=>{
  if(!ctx.accountId)throw Error('平台采集缺少真实账号');
  const account=await ports.account(ctx,ctx.accountId);
  if(account.platform!=='kuaishou'&&account.platform!=='xiaohongshu')throw Error('该平台尚未接入作品数据同步');
  const pending:CollectResult={itemsNew:0,itemsUpdated:0,continueCollection:true,retryAfterMs:60_000,message:'原平台采集尚未完成，将沿原任务继续'};
  const collect=async(capability:Capability,key:string)=>{
   signal?.throwIfAborted();
   let run:CollectionRunResource;try{run=await ports.start(ctx,{accountId:ctx.accountId!,capability,clientRequestId:key});
   if(run.status==='needsAuth')await ports.resumeAuthorization?.(ctx,ctx.accountId!,run.attemptId,taskId);
   if(run.status==='needsAuth')run=await ports.status(ctx,ctx.accountId!,run.attemptId);
   await ports.schedule(ctx,run,signal);signal?.throwIfAborted();
   const state=await ports.status(ctx,ctx.accountId!,run.attemptId);
   if(state.status==='needsAuth')throw new PlatformCollectionNeedsAuthError('请到账号管理重新扫码绑定该平台账号');
   if(state.status==='failed'||state.status==='cancelled')throw Error(`平台采集未完成：${state.reasonCode??state.status}`);
   return state;
   }catch(error){if(signal?.aborted)throw error;if(error&&typeof error==='object'&&'code' in error){if(error.code==='LEASE_EXPIRED')return null;if(error.code==='SCOPE_MISSING'||error.code==='LOGIN_REQUIRED')throw new PlatformCollectionNeedsAuthError('该平台账号需要重新扫码核验');}throw error;}
  };
  const catalog=await collect('workCatalog',`scheduled-${taskId}-catalog`);
  if(catalog?.status!=='complete')return pending;
  // catalog消费者可能已创建这些子任务；原目录attempt键保证重复读取不会新建。
  const metrics=await collect('workMetrics',`${catalog.attemptId}-metrics`);
  if(metrics?.status!=='complete')return pending;
  if(account.platform==='kuaishou'&&(await collect('accountOverview',`${catalog.attemptId}-overview`))?.status!=='complete')return pending;
  return {itemsNew:0,itemsUpdated:0,message:'平台作品目录与指标已同步；平台未提供本轮新增/更新计数'};
 };
}
