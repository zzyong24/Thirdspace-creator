import {afterEach,expect,it} from 'vitest';
import {createDb,eq} from '@creatoros/backend';
import {scheduledJobs} from '../../schema/scheduling';
import {createSchedulingService} from './scheduling.service';
const closes:Array<()=>Promise<unknown>>=[];afterEach(async()=>{for(const c of closes.splice(0))await c();});
const ctx={userId:'u',accountId:'a',requestId:'r',source:'user' as const};
it('雷达编辑名称和时间但不能改target及toolGrants',async()=>{
 const f=await createDb();closes.push(()=>f.client.close());let i=0;const s=createSchedulingService({db:f.db,now:()=>new Date().toISOString(),nextId:()=>String(++i)});
 const job=await s.createJob(ctx,{name:'radar',sourceKind:'intelligence.sync',schedule:'0 */2 * * *',systemManaged:true});
 expect((await s.updateJob(ctx,job.id,{name:'雷达同步',schedule:'0 */6 * * *'})).name).toBe('雷达同步');
 await expect(s.updateJob(ctx,job.id,{target:{a:1}})).rejects.toThrow();await expect(s.updateJob(ctx,job.id,{toolGrants:[]})).rejects.toThrow();
});
it('真实迁移保留关闭意图和历史，重复执行不会把关项开回来',async()=>{
 const f=await createDb();closes.push(()=>f.client.close());const stamp='2026-09-13T00:00:00Z';
 await f.db.insert(scheduledJobs).values([{id:'m',sourceKind:'self.metrics',enabled:false},{id:'c',sourceKind:'comments',enabled:true},{id:'t',sourceKind:'self.traffic',enabled:false}].map(j=>({...j,userId:'u',accountId:'a',name:j.id,prompt:'',target:{},schedule:'0 9 * * *',createdAt:stamp,updatedAt:stamp})));
 await f.db.insert(scheduledJobs).values({id:'all-off',sourceKind:'self.metrics',enabled:false,userId:'u',accountId:'off-account',name:'off',prompt:'',target:{},schedule:'0 9 * * *',createdAt:stamp,updatedAt:stamp});
 const {readFile}=await import('node:fs/promises');const sql=await readFile(new URL('../../../drizzle/0096_publication_sync_state.sql',import.meta.url),'utf8');await f.client.exec(sql);
 let [m]=await f.db.select().from(scheduledJobs).where(eq(scheduledJobs.id,'m'));expect(m?.enabled).toBe(true);expect(m?.target).toMatchObject({operationsSync:{version:1,capabilities:{metrics:false,comments:true,traffic:false,content:false}}});
 await f.client.exec(sql);[m]=await f.db.select().from(scheduledJobs).where(eq(scheduledJobs.id,'m'));expect(m?.target).toMatchObject({operationsSync:{capabilities:{comments:true,traffic:false}}});
 const [off]=await f.db.select().from(scheduledJobs).where(eq(scheduledJobs.id,'all-off'));expect(off).toMatchObject({enabled:false,target:{operationsSync:{capabilities:{metrics:false,content:false,comments:false,traffic:false}}}});
 const old=await f.db.select().from(scheduledJobs).where(eq(scheduledJobs.id,'c'));expect(old[0]).toMatchObject({enabled:false,target:{mergedIntoSelfMetrics:true,enabledBeforeMerge:true}});
});
it.each([
 ['comments',true,{metrics:false,content:false,comments:true,traffic:false}],
 ['self.traffic',true,{metrics:false,content:false,comments:false,traffic:true}],
 ['self.detail',true,{metrics:true,content:true,comments:false,traffic:false}],
 ['comments',false,{metrics:false,content:false,comments:false,traffic:false}],
] as const)('仅存兼容任务 %s enabled=%s 只迁移它原有能力，不默认开启其他能力',async(sourceKind,enabled,capabilities)=>{
 const f=await createDb();closes.push(()=>f.client.close());const stamp='2026-09-13T00:00:00Z';
 await f.db.insert(scheduledJobs).values({id:'orphan',sourceKind,enabled,userId:'u',accountId:'orphan-account',name:'旧任务',prompt:'',target:{},schedule:'0 9 * * *',createdAt:stamp,updatedAt:stamp});
 const {readFile}=await import('node:fs/promises');const sql=await readFile(new URL('../../../drizzle/0096_publication_sync_state.sql',import.meta.url),'utf8');
 for(let attempt=0;attempt<2;attempt++){
  await f.client.exec(sql);
  const rows=await f.db.select().from(scheduledJobs).where(eq(scheduledJobs.accountId,'orphan-account'));
  const parents=rows.filter(r=>r.sourceKind==='self.metrics');expect(parents).toHaveLength(1);
  expect(parents[0]).toMatchObject({enabled,target:{operationsSync:{version:1,capabilities}}});
  expect(rows.find(r=>r.id==='orphan')).toMatchObject({enabled:false,target:{mergedIntoSelfMetrics:true,enabledBeforeMerge:enabled}});
 }
});
