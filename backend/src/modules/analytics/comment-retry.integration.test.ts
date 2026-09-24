import {afterEach,expect,it,vi} from 'vitest';
import {createDb,eq,OwnershipError} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {publications} from '../../schema/publishing';
import {createPublicationSyncService} from './sync-state.service';
import {createCommentsCollector} from '../../application/collection/comments';

const ctx:RequestContext={userId:'u',accountId:'a',requestId:'retry-test',source:'user'};
const close:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const fn of close.splice(0))await fn();});
async function fixture(){
 const f=await createDb();close.push(()=>f.client.close());let now='2026-09-22T04:00:00.000Z';
 const pubs=['p1','p2','p3'].map(id=>({id,userId:'u',accountId:'a',externalId:`v-${id}`,platform:'douyin',status:'published',hiddenAt:null,contentOutputId:'out',accountReference:'account',createdAt:now,updatedAt:now}));
 await f.db.insert(publications).values(pubs);
 const service=createPublicationSyncService(f.db,{now:()=>now,assertPublication:async(c,id)=>{
  const [p]=await f.db.select().from(publications).where(eq(publications.id,id));
  if(!p||p.userId!==c.userId||p.accountId!==c.accountId||p.hiddenAt||p.status!=='published'||p.platform!=='douyin'||!p.externalId)throw new OwnershipError('作品不可采集');return p;
 }});
 for(const p of pubs)await service.settle(ctx,p.id,'comments',{success:true});
 now='2026-09-22T04:01:00.000Z';
 for(const p of pubs)await service.settle(ctx,p.id,'comments',{success:false,error:'SECRET_COOKIE=do-not-expose'});
 now='2026-09-22T04:02:00.000Z';
 return {...f,pubs,service,now:()=>now,setNow:(value:string)=>{now=value;}};
}
const select=(rows:Array<{publicationId:string;failureVersion:string}>)=>rows.map(({publicationId,failureVersion})=>({publicationId,failureVersion}));

it('当前账号稳定分页，只列真实可采集且externalId一致失败；原异常不公开',async()=>{
 const f=await fixture();
 const first=await f.service.listCommentFailures(ctx,{page:1,pageSize:1});
 const second=await f.service.listCommentFailures(ctx,{page:2,pageSize:1});
 expect(first.rows[0]?.publicationId).toBe('p1');expect(second.rows[0]?.publicationId).toBe('p2');expect(first.total).toBe(3);
 expect(first.rows[0]?.failureVersion).toMatch(/^sha256:[a-f0-9]{64}$/);
 expect(JSON.stringify(first)).not.toContain('SECRET');expect(first.rows[0]).not.toHaveProperty('error');
 await f.db.update(publications).set({externalId:'changed'}).where(eq(publications.id,'p1'));
 await f.db.update(publications).set({hiddenAt:f.now()}).where(eq(publications.id,'p2'));
 expect((await f.service.listCommentFailures(ctx,{page:1,pageSize:100})).rows.map(row=>row.publicationId)).toEqual(['p3']);
 expect((await f.service.listCommentFailures({...ctx,accountId:'other'},{page:1,pageSize:20})).rows).toEqual([]);
});

it('过期基线/越权使整批拒绝，只有retryAt改变且历史成功水位保留',async()=>{
 const f=await fixture();const items=select((await f.service.listCommentFailures(ctx,{page:1,pageSize:100})).rows);
 const original=await f.service.read(ctx,'p1','comments');
 await f.service.settle(ctx,'p2','comments',{success:false,error:'new-failure'});
 await expect(f.service.retryComments(ctx,{items:items.slice(0,2)})).rejects.toMatchObject({name:'ConflictError'});
 expect(await f.service.read(ctx,'p1','comments')).toEqual(original);
 await expect(f.service.retryComments({...ctx,accountId:'other'},{items:[items[0]!]})).rejects.toBeInstanceOf(OwnershipError);
 const result=await f.service.retryComments(ctx,{items:[items[0]!]});
 expect(result.updated).toBe(1);
 expect(await f.service.read(ctx,'p1','comments')).toEqual({...original,retryAt:f.now()});
 await expect(f.service.retryComments(ctx,{items:[items[0]!]})).rejects.toMatchObject({name:'ConflictError'});
 expect(result.items[0]?.failureVersion).not.toBe(items[0]!.failureVersion);
});

it('近期成功后失败，经用户retry到期必须进入真实collector读取端口',async()=>{
 const f=await fixture();const items=select((await f.service.listCommentFailures(ctx,{page:1,pageSize:100})).rows);
 expect(await f.service.due(ctx,'p1','comments')).toBe(false);
 await f.service.retryComments(ctx,{items:[items[0]!]});
 const read=vi.fn(async(_ctx:RequestContext,ids:string[],options:{onWorkComplete:(work:{awemeId:string;records:never[];complete:boolean},progress:{processed:number;total:number})=>Promise<void>})=>{
  const works=ids.map(awemeId=>({awemeId,records:[] as never[],complete:true}));
  for(const [index,work] of works.entries())await options.onWorkComplete(work,{processed:index+1,total:works.length});
  return {works,truncated:false,cooldownRemainMs:0};
 });
 const collector=createCommentsCollector({db:f.db,deps:{now:f.now,nextId:()=>''},sync:f.service,checkScheduledSignal:()=>{},ingestionService:{ensureDouyinSource:async()=> 'src',createRun:async()=>({id:'ingest-fixture'}),completeRun:async()=>({})},candidateService:{listCommentsForPublication:async()=>[]},publishingService:{getRecentPublicationsWithTitle:async()=>f.pubs,resolvePublication:async()=>null},analyticsService:{getPublicationAnalytics:async()=>({rows:[]})},readCommentsForWorks:read} as never);
 await collector(ctx,{},()=>{},{taskId:'real-collector-test'});
 expect(read).toHaveBeenCalledOnce();expect(read.mock.calls[0]![1]).toEqual(['v-p1']);
});

it('externalId变化与批内越权都全批拒绝，两个并发旧baseline只能一次提交',async()=>{
 const f=await fixture();const items=select((await f.service.listCommentFailures(ctx,{page:1,pageSize:100})).rows);
 const before=await f.service.read(ctx,'p1','comments');
 await f.db.update(publications).set({accountId:'other'}).where(eq(publications.id,'p2'));
 await expect(f.service.retryComments(ctx,{items:items.slice(0,2)})).rejects.toBeInstanceOf(OwnershipError);
 expect(await f.service.read(ctx,'p1','comments')).toEqual(before);
 await f.db.update(publications).set({externalId:'changed'}).where(eq(publications.id,'p3'));
 await expect(f.service.retryComments(ctx,{items:[items[0]!,items[2]!]})).rejects.toMatchObject({name:'ConflictError'});
 expect(await f.service.read(ctx,'p1','comments')).toEqual(before);
 const results=await Promise.allSettled([f.service.retryComments(ctx,{items:[items[0]!]}),f.service.retryComments(ctx,{items:[items[0]!]})]);
 expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
 expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
 expect(await f.service.read(ctx,'p1','comments')).toEqual({...before,retryAt:f.now()});
});

it('并发新失败不被旧retry覆盖，最终保持新失败退避与错误事实',async()=>{
 const f=await fixture();const items=select((await f.service.listCommentFailures(ctx,{page:1,pageSize:100})).rows);
 f.setNow('2026-09-22T04:03:00.000Z');
 await Promise.allSettled([f.service.retryComments(ctx,{items:[items[0]!]}),f.service.settle(ctx,'p1','comments',{success:false,error:'newer failure'})]);
 const row=await f.service.read(ctx,'p1','comments');
 expect(row).toMatchObject({error:'newer failure',failures:2,attemptedAt:f.now(),lastSucceededAt:'2026-09-22T04:00:00.000Z'});
 expect(Date.parse(row!.retryAt!)).toBeGreaterThan(Date.parse(f.now()));
});
