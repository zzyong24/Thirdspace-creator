import {beforeEach,afterEach,it,expect} from 'vitest';
import {createDb,aiTasks,executionTasks,eq,jobRuns,scheduledJobs,type Db} from '@creatoros/backend';
import {createSchedulingService} from '../scheduling/scheduling.service';
import {runScheduledCollection} from './scheduled-collection-runner';
import {triggerScheduledJob} from './scheduled-collection-scheduler';
import {createScheduledFlywheelExecutionService} from './scheduled-flywheel-execution.service';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createExecutionLeaseService} from '../execution/execution-lease.service';
import {bindScheduledFlywheel} from '../execution/scheduled-flywheel-binding';
const ctx={userId:'t951-user',accountId:'t951-account',requestId:'t951',source:'user' as const};
const now=()=> '2026-09-11T01:00:00.000Z';let db:Db,close:()=>Promise<void>,seq=0;
const nextId=(p:string)=>`${p}-t951-${++seq}`;
beforeEach(async()=>{const r=await createDb();db=r.db;close=()=>r.client.close();});afterEach(async()=>close?.());
const deps={entryPath:'/never-start-a-worker-for-prepare',resolveModelSpec:async()=>{throw new Error('no model in binding test');},budget:{maxCalls:4,maxTokens:1000,deadlineMs:60000},now};
async function trigger(sourceKind:string,skipHeavyBackfill=false,defer=false,recoverBeforeRun=false){
 const scheduling=createSchedulingService({db,now,nextId}),service=createScheduledFlywheelExecutionService(db,deps);
 const [job]=await db.insert(scheduledJobs).values({id:nextId('job'),userId:ctx.userId,accountId:ctx.accountId,name:'采集',sourceKind,schedule:'40 9 * * *',target:{source:'fixture'},createdAt:now(),updatedAt:now()}).returning();
 if(!job)throw new Error('fixture job missing');
 const result=await triggerScheduledJob(ctx,{id:job.id,sourceKind,target:{source:'fixture'},accountId:ctx.accountId},{now,ai:{createTask:async(c,input)=>{
  const id=nextId('task');await db.insert(aiTasks).values({id,userId:c.userId,accountId:c.accountId!,taskType:input.taskType,inputData:input.inputData,idempotencyKey:id,requestFingerprint:'sha256:'+'a'.repeat(64),requestedAt:now(),runtimeData:{skillSnapshot:{snapshotVersion:1,userId:c.userId,accountId:c.accountId,resolvedAt:now(),platformPolicyVersion:'1',platformPolicy:'fixture',skills:[{skillId:'topic.attribution',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'JSON',template:'fixture',tools:[],requiredFacets:[],contextRequirements:[],outputSchema:{type:'object'},completionPolicy:null,completionPolicyAdapter:null}}]}}});return {id,status:'queued'};
 }},runs:{...scheduling,createRun:async(c,input)=>{
  if(recoverBeforeRun){
   await service.recoverQueued(async(_c,id)=>{await db.update(aiTasks).set({status:'failed'}).where(eq(aiTasks.id,id));});
   const existing=await db.select().from(jobRuns).where(eq(jobRuns.aiTaskId,input.aiTaskId!));
   expect(existing).toHaveLength(1);
   return service.ensureRunForTask(c,input.aiTaskId!);
  }
  return scheduling.createRun(c,input);
 }},dispatch:(c,t)=>defer?Promise.resolve({executionTaskId:"deferred-fixture"}):service.prepare(c,t.id)},{skipHeavyBackfill});
 return {result,service,scheduling,job};
}
it.each(['self.metrics','self.detail','benchmark','favorites'])('真实trigger落库后prepare与claim保持真实run绑定：%s',async kind=>{
 const f=await trigger(kind,true);await f.result.completion;
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.result.aiTaskId));if(!task)throw new Error('fixture task missing');expect(task.executionTaskId).toBeTruthy();
 const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,task.executionTaskId!));if(!execution)throw new Error('fixture execution missing');expect(execution.payload).toMatchObject({modelInput:{jobRunId:f.result.jobRunId,target:{__skipHeavyBackfill:true}}});
 await f.service.drain((c,t,scope)=>runScheduledCollection(c,t,{ai:scope.ai,runs:f.scheduling,isNotLoggedInError:()=>false,collectors:{[kind]:async(_c,target)=>{expect(target.__skipHeavyBackfill).toBe(true);return {itemsNew:1200,itemsUpdated:0};}},now}),1);
 const run=await f.scheduling.getRun(ctx,f.result.jobRunId);expect(run).toMatchObject({status:'succeeded',itemsNew:1200});
 const [finished]=await db.select().from(executionTasks).where(eq(executionTasks.id,execution.id));expect(finished?.status).toBe('succeeded');
 await f.service.stop();
});
it('跨账号准备及已冻结run被篡改时拒绝',async()=>{
 const f=await trigger('self.metrics');await f.result.completion;
 await expect(f.service.prepare({...ctx,accountId:'another'},f.result.aiTaskId)).rejects.toThrow();
 // 已冻结任务的run被换到错误任务时，运行阶段仍拒绝。
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.result.aiTaskId));
 if(!task?.executionTaskId)throw new Error("fixture binding missing");
 {await db.update(jobRuns).set({aiTaskId:'other'}).where(eq(jobRuns.id,f.result.jobRunId));const claim=await createPersistentTaskService(db,{now}).claimTask({taskId:task.executionTaskId,workerId:'fixture'});await expect(createExecutionLeaseService(db,{now}).withLease({executionTaskId:task.executionTaskId,attempt:claim!.lease.attempt,fenceToken:claim!.lease.fenceToken},'admission',bindScheduledFlywheel)).rejects.toThrow();}
 await f.service.stop();
});

it.each(['missing','duplicate','forged'])('运行绑定%s时不能绑定执行',async mode=>{
 const f=await trigger('self.metrics',false,true);await f.result.completion;
 if(mode==='missing'){await db.delete(jobRuns).where(eq(jobRuns.id,f.result.jobRunId));await db.update(aiTasks).set({inputData:{jobId:f.job.id,target:{source:'fixture'}}}).where(eq(aiTasks.id,f.result.aiTaskId));}
 if(mode==='duplicate')await f.scheduling.createRun(ctx,{jobId:f.job.id,aiTaskId:f.result.aiTaskId});
 if(mode==='forged')await db.update(aiTasks).set({inputData:{jobId:f.job.id,jobRunId:'forged',target:{source:'fixture'}}}).where(eq(aiTasks.id,f.result.aiTaskId));
 await expect(f.service.prepare(ctx,f.result.aiTaskId)).rejects.toThrow();
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.result.aiTaskId));expect(task?.executionTaskId).toBeNull();await f.service.stop();
});

it.each(['self.metrics','self.detail','benchmark','favorites'])('恢复器在task创建与run落库之间执行，不误杀原任务：%s',async kind=>{
 const f=await trigger(kind,false,false,true);await f.result.completion;
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.result.aiTaskId));
 expect(task?.status).not.toBe('failed');expect(task?.executionTaskId).toBeTruthy();
 expect(await db.select().from(jobRuns).where(eq(jobRuns.aiTaskId,f.result.aiTaskId))).toHaveLength(1);
 await f.service.stop();
});
it('采集器意外抛错时同时收口run，下一次合法采集不被假运行中阻断',async()=>{
 const f=await trigger('self.metrics');await f.result.completion;
 await f.scheduling.updateRun(ctx,f.result.jobRunId,{itemsNew:3});
 await f.service.drain(async()=>{throw new Error('fixture collector unavailable');},1);
 const run=await f.scheduling.getRun(ctx,f.result.jobRunId);
 expect(run).toMatchObject({status:'failed',itemsNew:3});expect(run.finishedAt).toBeTruthy();
 await f.service.stop();
});

it('带冻结意图的孤儿任务并发补建只返回同一run，篡改时刻拒绝',async()=>{
 const f=await trigger('self.metrics',false,true);await f.result.completion;
 await db.delete(jobRuns).where(eq(jobRuns.id,f.result.jobRunId));
 const recovered=await Promise.all(Array.from({length:4},()=>f.service.ensureRunForTask(ctx,f.result.aiTaskId)));
 expect(new Set(recovered.map(run=>run.id)).size).toBe(1);
 expect(await db.select().from(jobRuns).where(eq(jobRuns.aiTaskId,f.result.aiTaskId))).toHaveLength(1);
 await db.update(jobRuns).set({scheduledFor:'2026-09-11T00:00:00.000Z'}).where(eq(jobRuns.id,recovered[0]!.id));
 await expect(f.service.prepare(ctx,f.result.aiTaskId)).rejects.toThrow();
 await f.service.stop();
});
it('孤儿任务带不存在的显式run引用时不补造新run',async()=>{
 const f=await trigger('self.metrics',false,true);await f.result.completion;
 await db.delete(jobRuns).where(eq(jobRuns.id,f.result.jobRunId));
 await db.update(aiTasks).set({inputData:{jobId:f.job.id,jobRunId:'missing',target:{},scheduledRun:{version:1,scheduledFor:null}}}).where(eq(aiTasks.id,f.result.aiTaskId));
 await expect(f.service.prepare(ctx,f.result.aiTaskId)).rejects.toThrow();
 expect(await db.select().from(jobRuns).where(eq(jobRuns.aiTaskId,f.result.aiTaskId))).toHaveLength(0);
 await f.service.stop();
});
it('最终回填端口异常时，已完成执行的运行记录仍能结束',async()=>{
 const f=await trigger('self.metrics');await f.result.completion;
 await f.service.drain((c,t,scope)=>runScheduledCollection(c,t,{ai:scope.ai,runs:{updateRun:async()=>{throw new Error('fixture final projection failed');}},isNotLoggedInError:()=>false,collectors:{'self.metrics':async()=>({itemsNew:0,itemsUpdated:0})},now}),1);
 expect(await f.scheduling.getRun(ctx,f.result.jobRunId)).toMatchObject({status:'succeeded',finishedAt:now()});
 await f.service.stop();
});
