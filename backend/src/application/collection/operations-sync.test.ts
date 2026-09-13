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
