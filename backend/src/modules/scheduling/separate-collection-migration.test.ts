import {afterEach,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createDb,scheduledJobs,aiTasks,jobRuns,eq} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {createSchedulingService} from './scheduling.service';
import {ensureCollectionJobs} from '../ai-runtime/collection-bootstrap';
const closes:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const close of closes.splice(0))await close();});
const ctx={userId:'u',accountId:'a',requestId:'test',source:'ingestion' as const},stamp='2026-09-14T00:00:00.000Z';
const migration=()=>readFile(new URL('../../../drizzle/0098_separate_collection_jobs.sql',import.meta.url),'utf8');
it.each([
 [true,{metrics:true,comments:true,traffic:true,content:true}],
 [false,{metrics:true,comments:true,traffic:true,content:true}],
 [true,{metrics:false,comments:true,traffic:false,content:false}],
 [true,{metrics:false,comments:false,traffic:false,content:true}],
] as const)('前向拆分当前开关enabled=%s×能力，保留原历史和冻结输入，重跑不恢复用户关闭项',async(enabled,capabilities)=>{
 const f=await createDb();closes.push(()=>f.client.close());
 const target={externalSourceId:'source-u-a',operationsSync:{version:1,capabilities}};
 await f.db.insert(scheduledJobs).values({id:'m',...ctx,name:'作品自动同步',prompt:'old',sourceKind:'self.metrics',target,schedule:'0 */2 * * *',enabled,createdAt:stamp,updatedAt:stamp});
 await f.db.insert(scheduledJobs).values(['comments','self.traffic','self.detail'].map((kind,i)=>({id:`old-${i}`,userId:ctx.userId,accountId:ctx.accountId,name:'历史任务',prompt:'old',sourceKind:kind,target:{externalSourceId:`old-${i}`,mergedIntoSelfMetrics:true,enabledBeforeMerge:true},schedule:'0 9 * * *',enabled:false,createdAt:stamp,updatedAt:stamp})));
 await f.db.insert(aiTasks).values({id:'task',userId:ctx.userId,accountId:ctx.accountId,taskType:'scheduled.self.metrics',status:'running',inputData:{jobId:'m',target},idempotencyKey:'task',requestedAt:stamp});
 await f.db.insert(jobRuns).values({id:'run',jobId:'m',userId:ctx.userId,aiTaskId:'task',status:'running',itemsNew:9,itemsUpdated:5,startedAt:stamp});
 await f.client.exec(await migration());
 const rows=await f.db.select().from(scheduledJobs),byKind=new Map(rows.map(r=>[r.sourceKind,r]));
 for(const [kind,cap] of [['self.metrics','metrics'],['comments','comments'],['self.traffic','traffic'],['self.detail','content']] as const){
  expect(byKind.get(kind)).toMatchObject({enabled:enabled&&capabilities[cap],schedule:'0 */2 * * *'});
  expect(byKind.get(kind)!.target).not.toHaveProperty('operationsSync');expect(byKind.get(kind)!.target).not.toHaveProperty('mergedIntoSelfMetrics');
 }
 expect(byKind.get('self.metrics')!.id).toBe('m');expect(byKind.get('comments')!.id).toBe('old-0');
 expect(byKind.get('self.detail')!.target).toMatchObject({__backfillOnly:true,__skipMetricRefresh:true});
 expect((await f.db.select().from(aiTasks))[0]!.inputData).toEqual({jobId:'m',target});expect((await f.db.select().from(jobRuns))[0]).toMatchObject({status:'running',itemsNew:9,itemsUpdated:5});
 await f.db.update(scheduledJobs).set({enabled:false}).where(eq(scheduledJobs.sourceKind,'comments'));
 await f.client.exec(await migration());expect((await f.db.select().from(scheduledJobs)).find(r=>r.sourceKind==='comments')!.enabled).toBe(false);
});
it('缺失兄弟作业只补一个；未知已关闭detail不复活，另一个账号不受影响',async()=>{
 const f=await createDb();closes.push(()=>f.client.close());
 await f.db.insert(scheduledJobs).values([{id:'m',sourceKind:'self.metrics',accountId:'a',enabled:true,target:{operationsSync:{version:1,capabilities:{metrics:true,comments:true,traffic:true,content:true}}}},{id:'legacy',sourceKind:'self.detail',accountId:'a',enabled:false,target:{}},{id:'other',sourceKind:'self.metrics',accountId:'b',enabled:false,target:{}}].map(r=>({...r,userId:'u',name:r.id,prompt:'',schedule:'0 9 * * *',createdAt:stamp,updatedAt:stamp})));
 await f.client.exec(await migration());const rows=await f.db.select().from(scheduledJobs);
 expect(rows.filter(r=>r.accountId==='a')).toHaveLength(4);expect(rows.find(r=>r.id==='legacy')!.enabled).toBe(false);expect(rows.find(r=>r.id==='other')).toMatchObject({enabled:false,target:{}});
});
it('新建默认独立作业，bootstrap重启不打开已关闭；detail只允许系统显式backfill',async()=>{
 const f=await createDb();closes.push(()=>f.client.close());let seq=0;
 const service=createSchedulingService({db:f.db,now:()=>stamp,nextId:p=>`${p}-${++seq}`});
 const deps={listJobsBySourceKind:async(c:RequestContext,sourceKind:string)=>(await service.listJobs(c,{sourceKind,limit:50,offset:0})).rows,createJob:(c:RequestContext,input:Parameters<typeof service.createJob>[1])=>service.createJob(c,input)};
 await ensureCollectionJobs(ctx,deps);const rows=(await service.listJobs(ctx,{limit:50,offset:0})).rows;
 expect(rows.map(r=>r.sourceKind)).toEqual(expect.arrayContaining(['self.metrics','comments','self.traffic','self.detail']));
 for(const row of rows.filter(r=>['self.metrics','comments','self.traffic','self.detail'].includes(r.sourceKind))){expect(row.target).not.toHaveProperty('operationsSync');await service.setEnabled(ctx,row.id,false);}
 await ensureCollectionJobs(ctx,deps);expect((await service.listJobs(ctx,{limit:50,offset:0})).rows.filter(r=>['self.metrics','comments','self.traffic','self.detail'].includes(r.sourceKind)).every(r=>!r.enabled)).toBe(true);
 await expect(service.createJob({...ctx,accountId:'other'},{name:'旧detail',sourceKind:'self.detail',schedule:'0 9 * * *'})).rejects.toThrow();
 await expect(service.createJob({...ctx,accountId:'other'},{name:'补全',sourceKind:'self.detail',target:{__backfillOnly:true},systemManaged:true,schedule:'0 */2 * * *'})).resolves.toMatchObject({sourceKind:'self.detail'});
});

it('0098真实SQL新增cover水位能力，同时保留旧三类能力及未知能力约束',async()=>{
 const f=await createDb();closes.push(()=>f.client.close());
 // 构造升级前的真实CHECK约束，先证明cover尚不可写入。
 await f.client.exec("ALTER TABLE publication_sync_state DROP CONSTRAINT publication_sync_capability; ALTER TABLE publication_sync_state ADD CONSTRAINT publication_sync_capability CHECK (capability IN ('metrics','comments','content'))");
 const insert=(capability:string)=>f.client.query("INSERT INTO publication_sync_state (user_id,account_id,publication_id,capability,external_id,attempted_at) VALUES ($1,$2,$3,$4,$5,$6)",['u','a',`publication-${capability}`,capability,`external-${capability}`,stamp]);
 await expect(insert('cover')).rejects.toThrow(/publication_sync_capability/);
 for(const capability of ['metrics','comments','content'])await insert(capability);
 await f.client.exec(await migration());
 await expect(insert('cover')).resolves.toBeDefined();
 const rows=await f.client.query<{capability:string}>('SELECT capability FROM publication_sync_state ORDER BY capability');
 expect(rows.rows.map(row=>row.capability)).toEqual(['comments','content','cover','metrics']);
 for(const capability of ['metrics','comments','content','cover']){
  await expect(f.client.query("UPDATE publication_sync_state SET failures=1 WHERE capability=$1",[capability])).resolves.toBeDefined();
 }
 await expect(insert('unknown')).rejects.toThrow(/publication_sync_capability/);
 await f.client.exec(await migration());
 expect((await f.client.query('SELECT * FROM publication_sync_state')).rows).toHaveLength(4);
});
