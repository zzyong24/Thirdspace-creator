import {expect,it,vi} from 'vitest';
import {createCommentsCollector} from './comments';
const ctx={userId:'u',accountId:'a',requestId:'r',source:'user' as const};
it('1005作品分页，0评论推进水位、未完成作品不推进',async()=>{
 const pubs=Array.from({length:1005},(_,i)=>({id:`p${i}`,externalId:`v${i}`,platform:'douyin',status:'published',hiddenAt:null}));
 const settle=vi.fn(async()=>{});const list=vi.fn(async(_c:unknown,p:{limit:number;offset:number})=>pubs.slice(p.offset,p.offset+p.limit));
 const collector=createCommentsCollector({db:{} as never,deps:{now:()=>new Date().toISOString(),nextId:()=>''},checkScheduledSignal:()=>{},sync:{due:async()=>true,settle},ingestionService:{ensureDouyinSource:async()=> 'src'},candidateService:{listCommentsForPublication:async()=>[]},publishingService:{getRecentPublicationsWithTitle:list,resolvePublication:async(_c:unknown,p:{externalId:string})=>({id:p.externalId})},analyticsService:{getPublicationAnalytics:async()=>({rows:[]})},readCommentsForWorks:async(_c:unknown,ids:string[])=>({works:ids.map((id,i)=>({awemeId:id,records:[],complete:i!==1004})),truncated:false,cooldownRemainMs:0})} as never);
 const result=await collector(ctx,{},()=>{});expect(list).toHaveBeenCalledTimes(6);expect(settle).toHaveBeenCalledWith(ctx,'p0','comments',{success:true});expect(settle).toHaveBeenCalledWith(ctx,'p1004','comments',expect.objectContaining({success:false}));expect(result.incomplete).toBe(true);
 expect(result.message).not.toContain('全量完成');
 expect(result.message).toContain('确认完成 1004');
 expect(result.message).toContain('未完成 1');
});

it('独立评论任务1005作品每批最多20，等待浏览器不记失败，继续原任务采完',async()=>{
 const pubs=Array.from({length:1005},(_,i)=>({id:`p${i}`,externalId:`v${i}`,platform:'douyin',status:'published',hiddenAt:null}));
 const done=new Set<string>();let busy=true;const sizes:number[]=[];
 const settle=vi.fn(async(_c:unknown,id:string,_cap:string,result:{success:boolean})=>{if(result.success)done.add(id);});
 const collector=createCommentsCollector({db:{} as never,deps:{now:()=>new Date().toISOString(),nextId:()=>''},checkScheduledSignal:()=>{},sync:{due:async(_c:unknown,id:string)=>!done.has(id),settle},ingestionService:{ensureDouyinSource:async()=> 'src'},candidateService:{listCommentsForPublication:async()=>[]},publishingService:{getRecentPublicationsWithTitle:async(_c:unknown,p:{limit:number;offset:number})=>pubs.slice(p.offset,p.offset+p.limit),resolvePublication:async(_c:unknown,p:{externalId:string})=>({id:p.externalId})},analyticsService:{getPublicationAnalytics:async()=>({rows:[]})},readCommentsForWorks:async(_c:unknown,ids:string[])=>{sizes.push(ids.length);if(busy)throw Object.assign(new Error('busy'),{code:'BROWSER_PROFILE_BUSY'});return {works:ids.map(id=>({awemeId:id,records:[],complete:true})),truncated:false,cooldownRemainMs:0};}} as never);
 const waiting=await collector(ctx,{},()=>{},{taskId:'original'});expect(waiting).toMatchObject({continueCollection:true,retryAfterMs:60000});expect(settle).not.toHaveBeenCalled();
 busy=false;let result;for(let i=0;i<51;i++)result=await collector(ctx,{},()=>{},{taskId:'original'});
 expect(done.size).toBe(1005);expect(Math.max(...sizes)).toBe(20);expect(result?.continueCollection).toBe(false);
});
