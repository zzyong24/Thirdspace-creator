import {expect,it,vi} from 'vitest';
import type {CollectionRunResource,RequestContext} from '@creatoros/contract';
import {createPlatformMetricsCollector,PlatformCollectionNeedsAuthError} from './platform-collector';
const ctx:RequestContext={userId:'u',accountId:'ks',groupId:'g',membershipVersion:2,requestId:'test',source:'ingestion'};
function fixture(platform='kuaishou',status:CollectionRunResource['status']='complete'){
 const start=vi.fn(async(_c:RequestContext,input:{accountId:string;capability:CollectionRunResource['capability'];clientRequestId:string})=>({attemptId:input.clientRequestId,...input,status,generation:1,committedPages:2,completeCatalogGeneration:1,reasonCode:null,startedAt:'2026-10-09T00:00:00Z',updatedAt:'2026-10-09T00:00:00Z'})),schedule=vi.fn(async(_c:RequestContext,_r:CollectionRunResource,_s?:AbortSignal)=>{});
 const collect=createPlatformMetricsCollector({account:async()=>({platform}),start,status:async(_c,_id,attemptId)=>({...await start(_c,{accountId:_id,capability:'workCatalog',clientRequestId:attemptId}),status}),schedule});
 return {collect,start,schedule};
}
it('同一持久scheduled任务沿原键恢复，目录完成后才等指标与快手概览，不虚构统计',async()=>{
 const f=fixture();const result=await f.collect(ctx,'task-original');expect(result).toMatchObject({itemsNew:0,itemsUpdated:0});expect(result.continueCollection).toBeUndefined();
 expect(f.schedule.mock.calls.map(([,r])=>r.capability)).toEqual(['workCatalog','workMetrics','accountOverview']);
 expect(f.start.mock.calls[0]![1].clientRequestId).toBe('scheduled-task-original-catalog');
});
it('部分结果继续同一任务而非报成功，未登录诚实要求原平台重连',async()=>{
 const partial=fixture('xiaohongshu','partial');expect(await partial.collect(ctx,'original')).toMatchObject({continueCollection:true});expect(partial.schedule).toHaveBeenCalledOnce();
 await expect(fixture('xiaohongshu','needsAuth').collect(ctx,'original')).rejects.toBeInstanceOf(PlatformCollectionNeedsAuthError);
});

it.each(['start','schedule'] as const)('有效旧租约在%s冲突时退避原task，不创建新请求键',async(stage)=>{
 const ports={account:async()=>({platform:'xiaohongshu'}),start:vi.fn(async(_c:RequestContext,input:{accountId:string;capability:CollectionRunResource['capability'];clientRequestId:string})=>{if(stage==='start')throw Object.assign(Error('原租约占用'),{code:'LEASE_EXPIRED'});return {attemptId:input.clientRequestId,...input,status:'running' as const,generation:1,committedPages:0,completeCatalogGeneration:null,reasonCode:null,startedAt:'2026-10-09T00:00:00Z',updatedAt:'2026-10-09T00:00:00Z'};}),status:async()=>{throw Error('不应读未获得的租约');},schedule:async()=>{throw Object.assign(Error('原租约有效'),{code:'LEASE_EXPIRED'});}};
 expect(await createPlatformMetricsCollector(ports)(ctx,'same-task')).toMatchObject({continueCollection:true,retryAfterMs:60_000});expect(ports.start).toHaveBeenCalledOnce();expect(ports.start.mock.calls[0]![1].clientRequestId).toBe('scheduled-same-task-catalog');
});
