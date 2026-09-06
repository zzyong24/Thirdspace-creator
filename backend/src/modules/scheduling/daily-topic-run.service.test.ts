import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDb,aiTasks,executionTasks,jobRuns,eq,type Db} from '@creatoros/backend';
import {createSchedulingService} from './scheduling.service';
import {createDailyTopicRunService} from './daily-topic-run.service';
const ctx={userId:'daily-user',accountId:'daily-account',requestId:'test',source:'user' as const};
const now=()=> '2026-09-05T01:00:00.000Z';let db:Db,close:()=>Promise<void>,seq=0;
beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});afterAll(async()=>close?.());
async function fixture(sourceKind='topic.daily'){
 const id='daily-task-'+(++seq),scheduling=createSchedulingService({db,now,nextId:p=>p+'-'+(++seq)});
 const job=await scheduling.createJob(ctx,{name:'每日选题',sourceKind,schedule:'40 9 * * *'});
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:'scheduled.topic.daily',inputData:{jobId:job.id},idempotencyKey:id,requestedAt:now()});
 const run=await scheduling.createRun(ctx,{jobId:job.id,aiTaskId:id,scheduledFor:null});
 return {id,job,run,scheduling,service:createDailyTopicRunService(db,{now})};
}
it('真实AI任务反查唯一run，日键保持运行开始UTC，不信调用者自报run',async()=>{
 const f=await fixture();expect(await f.service.resolveRun(ctx,f.id)).toMatchObject({jobId:f.job.id,jobRunId:f.run.id,dayKey:'2026-09-05'});
 await expect(f.service.resolveRun({...ctx,accountId:'other'},f.id)).rejects.toThrow();
 await f.scheduling.createRun(ctx,{jobId:f.job.id,aiTaskId:f.id});await expect(f.service.resolveRun(ctx,f.id)).rejects.toThrow();
});
it('错误sourceKind或跨账号绑定拒绝；finish同事务回滚且成功重放不改统计',async()=>{
 const bad=await fixture('comments');await expect(bad.service.resolveRun(ctx,bad.id)).rejects.toThrow();
 const f=await fixture();const input={jobId:f.job.id,jobRunId:f.run.id,aiTaskId:f.id};
 await expect(db.transaction(tx=>f.service.validateRun(ctx,{...input,aiTaskId:bad.id},tx))).rejects.toThrow();
 await expect(db.transaction(async tx=>{await f.service.finishRun(ctx,{...input,itemsNew:2,message:'真实入池'},tx);throw Error('rollback');})).rejects.toThrow('rollback');
 expect((await f.scheduling.getRun(ctx,f.run.id)).status).toBe('running');
 await db.transaction(tx=>f.service.finishRun(ctx,{...input,itemsNew:2,message:'真实入池'},tx));
 await db.transaction(tx=>f.service.finishRun(ctx,{...input,itemsNew:2,message:'真实入池'},tx));
 await expect(db.transaction(tx=>f.service.finishRun(ctx,{...input,itemsNew:3,message:'变更'},tx))).rejects.toThrow();
 expect(await f.scheduling.getRun(ctx,f.run.id)).toMatchObject({status:'succeeded',itemsNew:2,itemsUpdated:0});
});

async function executionFixture(status:string){
 const f=await fixture();const {createPersistentTaskService}=await import('../execution/persistent-task.service');
 const execution=await createPersistentTaskService(db,{now}).enqueue(ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:f.id,idempotencyKey:f.id,payload:{aiTaskId:f.id}});
 await db.update(aiTasks).set({executionTaskId:execution.id}).where(eq(aiTasks.id,f.id));
 await db.update(executionTasks).set({status,lastErrorMessage:status==='failed'?'供应商明确拒绝请求':null}).where(eq(executionTasks.id,execution.id));
 return {...f,execution};
}
it('真实持久失败和取消同步运行终态，不修改执行状态，重复同步幂等',async()=>{
 for(const state of ['failed','cancelled']){const f=await executionFixture(state);const result=await f.service.syncExecutionRuns({userId:ctx.userId,requestId:'daemon',source:'ingestion'});expect(result.finalized).toBeGreaterThanOrEqual(1);expect(await f.scheduling.getRun(ctx,f.run.id)).toMatchObject({status:'failed',error:state==='failed'?'供应商明确拒绝请求':'每日选题已取消'});const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.execution.id));expect(row!.status).toBe(state);expect((await f.service.syncExecutionRuns(ctx)).finalized).toBe(0);}
});
it('等待/未知/暂停/排队真实执行一直受保护；成功缺少原子回执只报不一致',async()=>{
 for(const state of ['retry_wait','waiting_user','unknown_result','paused','queued','running','pause_requested','cancel_requested','succeeded']){
  const f=await executionFixture(state);const result=await f.service.syncExecutionRuns(ctx);expect(result.activeAiTaskIds).toContain(f.id);expect((await f.scheduling.getRun(ctx,f.run.id)).status).toBe('running');if(state==='succeeded')expect(result.inconsistencies).toContainEqual(expect.objectContaining({jobRunId:f.run.id,executionTaskId:f.execution.id}));
 }
});
it('系统同步按真实用户过滤，不把同账号错绑执行当作可完成来源',async()=>{
 const f=await executionFixture('failed');expect((await f.service.syncExecutionRuns({...ctx,userId:'other-user'})).finalized).toBe(0);expect((await f.scheduling.getRun(ctx,f.run.id)).status).toBe('running');
 await db.update(executionTasks).set({ownerId:'wrong-task'}).where(eq(executionTasks.id,f.execution.id));const result=await f.service.syncExecutionRuns(ctx);expect((await f.scheduling.getRun(ctx,f.run.id)).status).toBe('running');expect(result.inconsistencies).toContainEqual(expect.objectContaining({jobRunId:f.run.id}));
});
it('每日失败同步后显式retry同事务重新打开原run，保留执行调用预算',async()=>{
 const f=await executionFixture('failed');
 const [before]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.execution.id));
 const modelInput={kind:'model.structured',skillId:'topic.generate',facets:{__dailyTopic:JSON.stringify({jobId:f.job.id,jobRunId:f.run.id,dayKey:'2026-09-05',dailyLimit:5,preferences:[],rankingNow:now(),skipReason:'model_unconfigured'})}};
 await db.update(executionTasks).set({payload:{...(before!.payload as object),modelInput}}).where(eq(executionTasks.id,f.execution.id));
 await f.service.syncExecutionRuns(ctx);await db.update(aiTasks).set({status:'failed',completedAt:now(),errorMessage:'原失败'}).where(eq(aiTasks.id,f.id));
 await db.transaction(async tx=>{expect(await f.service.reopenForExecutionRetry(ctx,f.execution.id,tx)).toBe(true);await f.service.validateRun(ctx,{jobId:f.job.id,jobRunId:f.run.id,aiTaskId:f.id},tx);});
 expect(await f.scheduling.getRun(ctx,f.run.id)).toMatchObject({status:'running',finishedAt:null,error:null,itemsNew:0});
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.id));expect(task).toMatchObject({status:'queued',completedAt:null,errorMessage:null});
 const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.execution.id));expect(execution).toMatchObject({status:'failed',executionBudget:before!.executionBudget,deadlineAt:before!.deadlineAt});
 await db.transaction(async tx=>{expect(await f.service.reopenForExecutionRetry(ctx,f.execution.id,tx)).toBe(true);});
});

it('重开严格核验冻结run与零写入事实，失败时不部分复位业务任务',async()=>{
 const f=await executionFixture('failed');const [original]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.execution.id));
 const facet={jobId:f.job.id,jobRunId:f.run.id,dayKey:'2026-09-05',dailyLimit:5,preferences:[],rankingNow:now(),skipReason:'model_unconfigured'};
 const payload=(value:typeof facet)=>({...original!.payload as object,modelInput:{kind:'model.structured',skillId:'topic.generate',facets:{__dailyTopic:JSON.stringify(value)}}});
 await db.update(executionTasks).set({payload:payload({...facet,jobRunId:'other-run'})}).where(eq(executionTasks.id,f.execution.id));await expect(db.transaction(tx=>f.service.reopenForExecutionRetry(ctx,f.execution.id,tx))).rejects.toThrow();
 await db.update(executionTasks).set({payload:payload(facet)}).where(eq(executionTasks.id,f.execution.id));
 for(const patch of [{status:'succeeded',itemsNew:0},{status:'failed',itemsNew:1}]){await db.update(jobRuns).set(patch).where(eq(jobRuns.id,f.run.id));await expect(db.transaction(tx=>f.service.reopenForExecutionRetry(ctx,f.execution.id,tx))).rejects.toThrow();expect((await f.scheduling.getRun(ctx,f.run.id)).status).toBe(patch.status);}
 await db.update(executionTasks).set({payload:{aiTaskId:f.id}}).where(eq(executionTasks.id,f.execution.id));await db.update(aiTasks).set({taskType:'topic.generate'}).where(eq(aiTasks.id,f.id));expect(await db.transaction(tx=>f.service.reopenForExecutionRetry(ctx,f.execution.id,tx))).toBe(false);
});
