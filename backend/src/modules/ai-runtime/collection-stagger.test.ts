import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@creatoros/contract';
import type { PersistentTaskService } from '../execution';
import { ensureCollectionJobs } from './collection-bootstrap';
import { createAutomationHandlerRegistry, runAutomationDriverTick } from './automation-driver';

const ctx: RequestContext = { userId:'u',accountId:'a',requestId:'stagger',source:'ingestion' };
const minutes = { 'self.metrics':0, 'self.traffic':15, comments:30, 'self.detail':45 };

describe('T-983 北京时间独立采集错峰',()=>{
 it('新账号默认四类计划错开15分钟，携带明确时区，重绑保留关闭和用户计划',async()=>{
  const jobs: Array<{id:string;sourceKind:string;schedule:string;target:Record<string,unknown>;enabled?:boolean}> = [];
  const createJob=vi.fn(async(_ctx:RequestContext,input: Omit<typeof jobs[number],'id'>)=>{const job={id:input.sourceKind,...input};jobs.push(job);return job;});
  const deps={createJob,listJobsBySourceKind:async(_ctx:RequestContext,kind:string)=>jobs.filter(job=>job.sourceKind===kind)};
  await ensureCollectionJobs(ctx,deps);
  for(const [kind,minute] of Object.entries(minutes))expect(jobs.find(job=>job.sourceKind===kind)).toMatchObject({schedule:`${minute} */2 * * *`,target:{scheduleTimezone:'Asia/Shanghai'}});
  const comments=jobs.find(job=>job.sourceKind==='comments')!;comments.enabled=false;comments.schedule='7 11 * * *';
  createJob.mockClear();await ensureCollectionJobs(ctx,deps);
  expect(createJob).not.toHaveBeenCalled();expect(comments).toMatchObject({enabled:false,schedule:'7 11 * * *'});
 });
 it.each(['UTC','America/Los_Angeles','Asia/Shanghai'])('本机时区%s下仍只在北京时间偶数小时触发对应任务',async(timezone)=>{
  const original=process.env.TZ;process.env.TZ=timezone;
  try {
   const enqueue=vi.fn(async()=>({}));
   const tasks={recoverExpiredLeases:async()=>({requeued:0,failed:0,paused:0,cancelled:0}),enqueue,claimNext:async()=>null} as unknown as PersistentTaskService;
   const registry=createAutomationHandlerRegistry().register('scheduled_collection',async()=>undefined).seal();
   const jobs=Object.entries(minutes).map(([sourceKind,minute])=>({id:sourceKind,accountId:'a',sourceKind,target:{scheduleTimezone:'Asia/Shanghai'},schedule:`${minute} */2 * * *`,enabled:true}));
   for(const [kind,minute] of Object.entries(minutes)){
    enqueue.mockClear();
    const deps={ctx,tasks,registry,listRunnableJobs:async()=>jobs,workerId:'test',cron:{validate:()=>true},maxClaims:0,leaseSeconds:60};
    await runAutomationDriverTick({...deps,now:()=>`2026-09-14T00:${String(minute).padStart(2,'0')}:00Z`});
    expect(enqueue.mock.calls.map(call=>(call as unknown[])[1])).toEqual([expect.objectContaining({ownerId:kind})]);
    enqueue.mockClear();await runAutomationDriverTick({...deps,now:()=>`2026-09-14T01:${String(minute).padStart(2,'0')}:00Z`});
    expect(enqueue).not.toHaveBeenCalled();
   }
  } finally { if(original===undefined)delete process.env.TZ;else process.env.TZ=original; }
 });
 it('北京时间计划改成每日后，漏跑恢复不能在计划前触发，恢复锚点与实际时区一致',async()=>{
  const original=process.env.TZ;process.env.TZ='America/Los_Angeles';
  try{
   const enqueue=vi.fn(async()=>({}));
   const tasks={recoverExpiredLeases:async()=>({requeued:0,failed:0,paused:0,cancelled:0}),enqueue,claimNext:async()=>null} as unknown as PersistentTaskService;
   const registry=createAutomationHandlerRegistry().register('scheduled_collection',async()=>undefined).seal();
   const job={id:'daily',accountId:'a',sourceKind:'self.metrics',target:{scheduleTimezone:'Asia/Shanghai'},schedule:'0 9 * * *',enabled:true};
   const deps={ctx,tasks,registry,listRunnableJobs:async()=>[job],workerId:'test',cron:{validate:()=>true},recoverMissedDailyRuns:true};
   await runAutomationDriverTick({...deps,now:()=> '2026-09-14T00:59:00Z'});
   expect(enqueue).not.toHaveBeenCalled();
   await runAutomationDriverTick({...deps,now:()=> '2026-09-14T01:02:00Z'});
   expect(enqueue).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({idempotencyKey:'scheduled-job:daily:2026-09-14T01:00:00.000Z'}));
  }finally{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
 });

});
