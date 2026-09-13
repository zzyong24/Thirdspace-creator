import {expect,it,vi} from 'vitest';
import {createCommentsCollector} from './comments';
const ctx={userId:'u',accountId:'a',requestId:'r',source:'user' as const};
it('1005作品分页，0评论推进水位、未完成作品不推进',async()=>{
 const pubs=Array.from({length:1005},(_,i)=>({id:`p${i}`,externalId:`v${i}`,platform:'douyin',status:'published',hiddenAt:null}));
 const settle=vi.fn(async()=>{});const list=vi.fn(async(_c:unknown,p:{limit:number;offset:number})=>pubs.slice(p.offset,p.offset+p.limit));
 const collector=createCommentsCollector({db:{} as never,deps:{now:()=>new Date().toISOString(),nextId:()=>''},checkScheduledSignal:()=>{},sync:{due:async()=>true,settle},ingestionService:{ensureDouyinSource:async()=> 'src'},candidateService:{listCommentsForPublication:async()=>[]},publishingService:{getRecentPublicationsWithTitle:list,resolvePublication:async(_c:unknown,p:{externalId:string})=>({id:p.externalId})},analyticsService:{getPublicationAnalytics:async()=>({rows:[]})},readCommentsForWorks:async(_c:unknown,ids:string[])=>({works:ids.map((id,i)=>({awemeId:id,records:[],complete:i!==1004})),truncated:false,cooldownRemainMs:0})} as never);
 const result=await collector(ctx,{},()=>{});expect(list).toHaveBeenCalledTimes(6);expect(settle).toHaveBeenCalledWith(ctx,'p0','comments',{success:true});expect(settle).toHaveBeenCalledWith(ctx,'p1004','comments',expect.objectContaining({success:false}));expect(result.incomplete).toBe(true);
});
