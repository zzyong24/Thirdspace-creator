import {it,expect} from 'vitest';
import {createDb,aiTasks,jobRuns} from '@creatoros/backend';
import {createSchedulingService} from './scheduling.service';
it('并发流量触发和恢复共用task行锁，只创建一条原run',async()=>{
 const {db}=await createDb();let seq=0;const now=()=> '2026-09-11T00:00:00.000Z';
 const service=createSchedulingService({db,now,nextId:p=>`${p}-${++seq}`});
 const ctx={userId:'u',accountId:'a',requestId:'r',source:'ingestion' as const};
 const job=await service.createJob(ctx,{name:'流量',sourceKind:'self.traffic',target:{},schedule:'0 0 * * *',enabled:false,systemManaged:true});
 await db.insert(aiTasks).values({id:'task',userId:'u',accountId:'a',taskType:'scheduled.self.traffic',inputData:{jobId:job.id,scheduledRun:{version:1,scheduledFor:null}},idempotencyKey:'task',requestedAt:now()});
 const [a,b]=await Promise.all([service.createRun(ctx,{jobId:job.id,aiTaskId:'task'}),service.createRun(ctx,{jobId:job.id,aiTaskId:'task'})]);
 expect(a.id).toBe(b.id);expect(await db.select().from(jobRuns)).toHaveLength(1);
});
