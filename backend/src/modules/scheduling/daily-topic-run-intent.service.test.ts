import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDb,aiTasks,jobRuns,eq,type Db} from '@creatoros/backend';
import {createSchedulingService} from './scheduling.service';
import {createDailyTopicRunService} from './daily-topic-run.service';
import {createDailyTopicRunIntentService} from './daily-topic-run-intent.service';
const ctx={userId:'intent-user',accountId:'intent-account',requestId:'intent-test',source:'user' as const};
const now=()=> '2026-09-05T02:00:00.000Z';let db:Db,close:()=>Promise<void>,seq=0;
beforeAll(async()=>{const result=await createDb();db=result.db;close=()=>result.client.close();});afterAll(async()=>close?.());
const nextId=(prefix:string)=>`${prefix}-intent-${++seq}`;
async function fixture(intent:unknown={version:1,scheduledFor:null},sourceKind='topic.daily'){
 const scheduling=createSchedulingService({db,now,nextId});const job=await scheduling.createJob(ctx,{name:'每日选题',sourceKind,schedule:'40 9 * * *'});const id=nextId('task');
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:'scheduled.topic.daily',inputData:{jobId:job.id,...(intent===undefined?{}:{scheduledRun:intent})},idempotencyKey:id,requestedAt:now()});
 return {id,job,scheduling,service:createDailyTopicRunIntentService(db,{now,nextId})};
}
it('任务已存在但run未写时恢复补齐，原触发随后重放同一run',async()=>{
 const f=await fixture({version:1,scheduledFor:'2026-09-05T01:40:00.000Z'});
 expect(await db.select().from(jobRuns).where(eq(jobRuns.aiTaskId,f.id))).toHaveLength(0);
 const restored=await f.service.ensureRunForTask(ctx,f.id);
 expect(await createDailyTopicRunService(db,{now}).resolveRun(ctx,f.id)).toMatchObject({jobId:f.job.id,jobRunId:restored.id});
 const triggerReplay=await f.service.ensureRunForTask(ctx,f.id);expect(triggerReplay).toEqual(restored);
 expect(restored).toMatchObject({scheduledFor:'2026-09-05T01:40:00.000Z',status:'running',itemsNew:0});
 expect(await db.select().from(jobRuns).where(eq(jobRuns.aiTaskId,f.id))).toHaveLength(1);
});
it('runNow无父且null时刻的并发恢复只创建一个run',async()=>{
 const f=await fixture();const rows=await Promise.all(Array.from({length:4},()=>f.service.ensureRunForTask(ctx,f.id)));
 expect(new Set(rows.map(row=>row.id)).size).toBe(1);expect(rows[0]?.scheduledFor).toBeNull();
 expect(await db.select().from(jobRuns).where(eq(jobRuns.aiTaskId,f.id))).toHaveLength(1);
});
it('旧已有run无意图仍原样回读终态；旧孤儿无意图不猜测',async()=>{
 const f=await fixture(null);await db.update(aiTasks).set({inputData:{jobId:f.job.id}}).where(eq(aiTasks.id,f.id));
 await expect(f.service.ensureRunForTask(ctx,f.id)).rejects.toThrow();
 const existing=await f.scheduling.createRun(ctx,{jobId:f.job.id,aiTaskId:f.id});
 await f.scheduling.updateRun(ctx,existing.id,{status:'succeeded',itemsNew:2});
 await db.update(aiTasks).set({status:'succeeded'}).where(eq(aiTasks.id,f.id));
 expect(await f.service.ensureRunForTask(ctx,f.id)).toMatchObject({id:existing.id,status:'succeeded',itemsNew:2});
});
it('跨账号、错误作业、损坏意图和非queued孤儿均拒绝无写入',async()=>{
 const f=await fixture();await expect(f.service.ensureRunForTask({...ctx,accountId:'other'},f.id)).rejects.toThrow();
 const bad=await fixture({version:1,scheduledFor:null},'comments');await expect(bad.service.ensureRunForTask(ctx,bad.id)).rejects.toThrow();
 for(const intent of [{version:2,scheduledFor:null},{version:1},{version:1,scheduledFor:'tomorrow'},{version:1,scheduledFor:'2026-02-30T00:00:00.000Z'},{version:1,scheduledFor:null,extra:true}]){
  const item=await fixture(intent);await expect(item.service.ensureRunForTask(ctx,item.id)).rejects.toThrow();expect(await db.select().from(jobRuns).where(eq(jobRuns.aiTaskId,item.id))).toHaveLength(0);
 }
 await db.update(aiTasks).set({status:'failed'}).where(eq(aiTasks.id,f.id));await expect(f.service.ensureRunForTask(ctx,f.id)).rejects.toThrow();
});
it('已有多个run或错误job归属拒绝，不挑一条当成真实绑定',async()=>{
 const f=await fixture();await f.scheduling.createRun(ctx,{jobId:f.job.id,aiTaskId:f.id});await f.scheduling.createRun(ctx,{jobId:f.job.id,aiTaskId:f.id});await expect(f.service.ensureRunForTask(ctx,f.id)).rejects.toThrow();
 const other=await fixture({version:1,scheduledFor:null},'comments'),target=await fixture();await other.scheduling.createRun(ctx,{jobId:other.job.id,aiTaskId:target.id});await expect(target.service.ensureRunForTask(ctx,target.id)).rejects.toThrow();
});

it.each([null,'2026-09-05T01:40:00.000Z'])('真实trigger在createTask/createRun间交错启动recoverQueued，锚=%s',async scheduledFor=>{
 const {createDailyTopicBusinessAdapter}=await import('../ai-runtime/daily-topic-business-adapter');
 const {createStructuredBusinessExecutionService}=await import('../ai-runtime/structured-business-execution.service');
 const {triggerScheduledJob}=await import('../ai-runtime/scheduled-collection-scheduler');
 const isolated=await createDb();const store=isolated.db;
 try{
  const scheduling=createSchedulingService({db:store,now,nextId}),intents=createDailyTopicRunIntentService(store,{now,nextId}),runs=createDailyTopicRunService(store,{now});
  const job=await scheduling.createJob(ctx,{name:'交错恢复',sourceKind:'topic.daily',schedule:'40 9 * * *'});
  const business=createStructuredBusinessExecutionService(store,{budget:{maxCalls:8,maxTokens:10000,deadlineMs:60000},maxOutputTokens:512,adapters:{'scheduled.topic.daily':createDailyTopicBusinessAdapter({now,resolveRun:async(c,id)=>{await intents.ensureRunForTask(c,id);return runs.resolveRun(c,id);},countCandidatesForDay:async()=>0,hasConfiguredModel:async()=>false,listActivePreferences:async()=>[],positioning:{getPositioningCenter:async()=>({profile:null,currentStatement:null})}})}});
  const failures:string[]=[];let createdTaskId='';
  // AI创建端口只替代Skill解析；任务、run、准备恢复、执行绑定均真实落PGlite。
  const result=await triggerScheduledJob(ctx,{id:job.id,sourceKind:job.sourceKind,target:{},accountId:ctx.accountId},{now,ai:{createTask:async(c,input)=>{
   const id=nextId('crash-task');createdTaskId=id;
   const skills=[{skillId:'topic.generate',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'JSON',template:'主题',tools:[],requiredFacets:[],contextRequirements:[],outputSchema:{type:'object'},completionPolicy:null,completionPolicyAdapter:null}}];
   await store.insert(aiTasks).values({id,userId:c.userId,accountId:c.accountId!,taskType:'scheduled.topic.daily',inputData:input.inputData,idempotencyKey:id,requestFingerprint:'sha256:'+'0'.repeat(64),runtimeData:{skillSnapshot:{snapshotVersion:1,userId:c.userId,accountId:c.accountId,resolvedAt:now(),platformPolicyVersion:'1',platformPolicy:'自动选题',skills}},requestedAt:now()});
   return {id,status:'queued'};
  }},runs:{listRunsByJob:(c,id,options)=>scheduling.listRunsByJob(c,id,options),updateRun:(c,id,patch)=>scheduling.updateRun(c,id,patch),createRun:async(c,input)=>{
   expect(await store.select().from(jobRuns)).toHaveLength(0);
   await business.recoverQueued(async(context,id)=>{failures.push(id);await store.update(aiTasks).set({status:'failed'}).where(eq(aiTasks.id,id));});
   return intents.ensureRunForTask(c,input.aiTaskId!);
  }},dispatch:async(c,input)=>business.prepare(c,input.id)},scheduledFor?{scheduledFor}:undefined);
  await result.completion;
  expect(failures).toEqual([]);expect(await store.select().from(jobRuns)).toHaveLength(1);
  const [task]=await store.select().from(aiTasks).where(eq(aiTasks.id,createdTaskId));expect(task?.executionTaskId).toBeTruthy();expect(task?.status).not.toBe('failed');
  expect((await intents.ensureRunForTask(ctx,createdTaskId)).id).toBe(result.jobRunId);
 }finally{await isolated.client.close();}
});
