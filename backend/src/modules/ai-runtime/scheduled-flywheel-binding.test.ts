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
async function trigger(sourceKind:string,skipHeavyBackfill=false,defer=false){
 const scheduling=createSchedulingService({db,now,nextId}),service=createScheduledFlywheelExecutionService(db,deps);
 const [job]=await db.insert(scheduledJobs).values({id:nextId('job'),userId:ctx.userId,accountId:ctx.accountId,name:'采集',sourceKind,schedule:'40 9 * * *',target:{source:'fixture'},createdAt:now(),updatedAt:now()}).returning();
 if(!job)throw new Error('fixture job missing');
 const result=await triggerScheduledJob(ctx,{id:job.id,sourceKind,target:{source:'fixture'},accountId:ctx.accountId},{now,ai:{createTask:async(c,input)=>{
  const id=nextId('task');await db.insert(aiTasks).values({id,userId:c.userId,accountId:c.accountId!,taskType:input.taskType,inputData:input.inputData,idempotencyKey:id,requestFingerprint:'sha256:'+'a'.repeat(64),requestedAt:now(),runtimeData:{skillSnapshot:{snapshotVersion:1,userId:c.userId,accountId:c.accountId,resolvedAt:now(),platformPolicyVersion:'1',platformPolicy:'fixture',skills:[{skillId:'topic.attribution',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'JSON',template:'fixture',tools:[],requiredFacets:[],contextRequirements:[],outputSchema:{type:'object'},completionPolicy:null,completionPolicyAdapter:null}}]}}});return {id,status:'queued'};
 }},runs:scheduling,dispatch:(c,t)=>defer?Promise.resolve({executionTaskId:"deferred-fixture"}):service.prepare(c,t.id)},{skipHeavyBackfill});
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
 if(mode==='missing')await db.delete(jobRuns).where(eq(jobRuns.id,f.result.jobRunId));
 if(mode==='duplicate')await f.scheduling.createRun(ctx,{jobId:f.job.id,aiTaskId:f.result.aiTaskId});
 if(mode==='forged')await db.update(aiTasks).set({inputData:{jobId:f.job.id,jobRunId:'forged',target:{source:'fixture'}}}).where(eq(aiTasks.id,f.result.aiTaskId));
 await expect(f.service.prepare(ctx,f.result.aiTaskId)).rejects.toThrow();
 const [task]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.result.aiTaskId));expect(task?.executionTaskId).toBeNull();await f.service.stop();
});
