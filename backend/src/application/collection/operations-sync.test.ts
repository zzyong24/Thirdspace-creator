import {expect,it,vi} from 'vitest';
import {createOperationsSyncCollector} from './operations-sync';
import {readAllPublicationPages} from './publication-pages';
const ctx={userId:'u',accountId:'a',requestId:'r',source:'user' as const};
it('统一任务能力关闭、独立失败、execution贯穿、流量分批继续',async()=>{
 const metrics=vi.fn(async()=>{throw Error('指标失败');});const comments=vi.fn(async()=>({itemsNew:2,itemsUpdated:0}));const traffic=vi.fn(async()=>({itemsNew:0,itemsUpdated:20,continueCollection:true}));
 const collector=createOperationsSyncCollector({metrics,comments,traffic,checkSignal:()=>{},isNotLoggedIn:()=>false});
 const report=()=>{},execution={taskId:'real'};const result=await collector(ctx,{operationsSync:{version:1,capabilities:{metrics:true,comments:true,traffic:true,content:false}}},report,execution);
 expect(comments).toHaveBeenCalledWith(ctx,expect.objectContaining({__skipHeavyBackfill:true}),report,execution);expect(result).toMatchObject({itemsNew:2,itemsUpdated:20,continueCollection:true,incomplete:true});
 comments.mockClear();await collector(ctx,{operationsSync:{version:1,capabilities:{metrics:false,comments:false,traffic:true,content:false}}},report,execution);expect(comments).not.toHaveBeenCalled();
});
it('1005作品完整分页，不用500上限或遇旧停止',async()=>{const pubs=Array.from({length:1005},(_,id)=>({id}));const read=vi.fn(async(p:{limit:number;offset:number})=>pubs.slice(p.offset,p.offset+p.limit));expect(await readAllPublicationPages(read)).toHaveLength(1005);expect(read).toHaveBeenCalledTimes(6);});
it('全部能力关闭返回诚实0，不调用采集端口',async()=>{
 const collect=vi.fn(async()=>({itemsNew:1,itemsUpdated:0}));const collector=createOperationsSyncCollector({metrics:collect,comments:collect,traffic:collect,checkSignal:()=>{},isNotLoggedIn:()=>false});
 const result=await collector(ctx,{operationsSync:{version:1,capabilities:{metrics:false,comments:false,traffic:false,content:false}}},()=>{},{taskId:'t'});expect(result.itemsNew).toBe(0);expect(collect).not.toHaveBeenCalled();
});
it('旧冻结任务无operationsSync只恢复旧作品采集，不把关闭能力默认全开',async()=>{
 const metrics=vi.fn(async()=>({itemsNew:2,itemsUpdated:0})),comments=vi.fn(),traffic=vi.fn();
 const collector=createOperationsSyncCollector({metrics,comments,traffic,checkSignal:()=>{},isNotLoggedIn:()=>false});await collector(ctx,{},()=>{},{taskId:'old'});expect(metrics).toHaveBeenCalledOnce();expect(comments).not.toHaveBeenCalled();expect(traffic).not.toHaveBeenCalled();
});
it.each(['metrics','comments'])('共享档案在%s占用时停止后续能力，保留已完成结果',async blocked=>{
 const ok={itemsNew:3,itemsUpdated:2};const busy=Object.assign(new Error('档案占用'),{code:'BROWSER_PROFILE_BUSY'});
 const metrics=vi.fn(async()=>{if(blocked==='metrics')throw busy;return ok;});
 const comments=vi.fn(async()=>{throw busy;});const traffic=vi.fn(async()=>ok);
 const collect=createOperationsSyncCollector({metrics,comments,traffic,checkSignal:()=>{},isNotLoggedIn:()=>false});
 const result=await collect(ctx,{operationsSync:{version:1,capabilities:{metrics:true,comments:true,traffic:true,content:true}}},()=>{},{taskId:'original'});
 expect(result).toMatchObject({itemsNew:blocked==='metrics'?0:3,itemsUpdated:blocked==='metrics'?0:2,continueCollection:true,retryAfterMs:60000});
 expect(traffic).not.toHaveBeenCalled();if(blocked==='metrics')expect(comments).not.toHaveBeenCalled();
});
it('合并同步保留流量返回的共享资源等待时长',async()=>{
 const noop=async()=>({itemsNew:0,itemsUpdated:0});
 const collect=createOperationsSyncCollector({metrics:noop,comments:noop,traffic:async()=>({itemsNew:0,itemsUpdated:2,continueCollection:true,retryAfterMs:60000}),checkSignal:()=>{},isNotLoggedIn:()=>false});
 expect(await collect(ctx,{operationsSync:{version:1,capabilities:{metrics:true,comments:true,traffic:true,content:true}}},()=>{},{taskId:'original'})).toMatchObject({continueCollection:true,retryAfterMs:60000,itemsUpdated:2});
});
