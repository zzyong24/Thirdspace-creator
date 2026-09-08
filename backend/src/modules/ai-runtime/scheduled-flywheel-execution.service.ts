import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {and,asc,eq,isNull,aiTasks,aiTaskSteps,executionTasks,jobRuns,scheduledJobs,type Db} from '@creatoros/backend';
import {scheduledFlywheelTaskInputSchema,workerSkillSnapshotSchema,type ExecutionRef} from '@creatoros/contract/execution-worker';
import type {RequestContext} from '@creatoros/contract';
import {createExecutionAuthorityService} from '../execution/execution-authority.service';
import {createExecutionLeaseService} from '../execution/execution-lease.service';
import {createExecutionCallLedgerService} from '../execution/execution-call-ledger.service';
import {createExecutionWorkerOutcomeService} from '../execution/execution-worker-outcome.service';
import {createPersistentTaskService,type PersistentTaskClaim} from '../execution/persistent-task.service';
import {createExecutionFlywheelGenerationService,type FlywheelGenerationDeps} from '../execution/execution-flywheel-generation.service';
import {bindScheduledFlywheel} from '../execution/scheduled-flywheel-binding';
import {ScheduledFlywheelSuspended} from './scheduled-flywheel-suspension';
import {teardownFacets,type BenchmarkTeardownPort} from './benchmark-teardown-runner';
import type {ScheduledCollectionAiPort,ScheduledCollectionTask} from './scheduled-collection-runner';

export interface ScheduledFlywheelScope {signal:AbortSignal;ai:ScheduledCollectionAiPort;models:{teardown:BenchmarkTeardownPort}}
export type ScheduledFlywheelCollector=(ctx:RequestContext,task:ScheduledCollectionTask,scope:ScheduledFlywheelScope)=>Promise<void>;
/** 原aiTask单向交接给execution_tasks；不生成第二份业务任务或调度队列。 */
export function createScheduledFlywheelExecutionService(db:Db,deps:FlywheelGenerationDeps){
 const tasks=createPersistentTaskService(db,deps),authority=createExecutionAuthorityService(db,deps),leases=createExecutionLeaseService(db,deps),ledger=createExecutionCallLedgerService(db,deps),outcomes=createExecutionWorkerOutcomeService(db,deps),generation=createExecutionFlywheelGenerationService(db,deps),abort=new AbortController(),scopeStore=new AsyncLocalStorage<{ref:ExecutionRef;signal:AbortSignal}>();
 const now=deps.now??(()=>new Date().toISOString());
 const activeRuns=new Set<Promise<void>>();
 const track=async(pending:Promise<void>)=>{activeRuns.add(pending);try{await pending;}finally{activeRuns.delete(pending);}};
 const models:{teardown:BenchmarkTeardownPort}={async teardown(ctx,input){
  const scope=scopeStore.getStore();if(!scope)throw new Error('飞轮模型缺少原调度任务执行权');scope.signal.throwIfAborted();
  await leases.withLease(scope.ref,'admission',async bound=>{const owned=await bindScheduledFlywheel(bound);if(owned.context.userId!==ctx.userId||owned.context.accountId!==ctx.accountId)throw new Error('飞轮模型账号不符');});
  try{return await generation.teardown(scope.ref,input.work.id,teardownFacets(input.positioningBrief,input.work));}
  catch(error){
   if(error instanceof ScheduledFlywheelSuspended)throw error;
   const state=await ledger.inspect(scope.ref),unknown=state.calls.some(row=>row.status==='started'||row.status==='unknown');
   if(unknown){const result=await outcomes.recordFailure(scope.ref,{outcome:'unknown_result',errorCode:'FLYWHEEL_MODEL_RECEIPT_UNKNOWN'});throw new ScheduledFlywheelSuspended(scope.ref.executionTaskId,result.status);}
   // 未开始的配置/业务错误仍走原可选增强降级，原采集结果保留。
   throw error;
  }
 }};
 const service={
 models,
 async prepare(ctx:RequestContext,aiTaskId:string){
  abort.signal.throwIfAborted();
  const [task]=await db.select().from(aiTasks).where(and(eq(aiTasks.id,aiTaskId),eq(aiTasks.userId,ctx.userId),eq(aiTasks.accountId,ctx.accountId??'')));
  if(!task||task.taskType!=='scheduled.benchmark')throw new Error('不支持的原调度任务');
  if(task.executionTaskId){const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,task.executionTaskId));scheduledFlywheelTaskInputSchema.parse((execution?.payload as Record<string,unknown>)?.modelInput);return authority.bindAiTask(ctx,aiTaskId);}
  if(task.startedAt||task.modelCallStartedAt||task.retryOfTaskId)throw new Error('已有旧执行事实，须恢复原任务，不能重置预算');
  const raw=task.inputData as Record<string,unknown>,snapshot=workerSkillSnapshotSchema.parse((task.runtimeData as Record<string,unknown>).skillSnapshot);
  if(snapshot.userId!==ctx.userId||snapshot.accountId!==ctx.accountId||!snapshot.skills.some(skill=>skill.skillId==='benchmark.teardown'))throw new Error('原任务缺少对标拆解授权快照');
  const modelInput=scheduledFlywheelTaskInputSchema.parse({kind:'scheduled.flywheel',sourceKind:'benchmark',jobId:raw.jobId,jobRunId:raw.jobRunId,target:raw.target??{},skillSnapshot:snapshot});
  const [run]=await db.select().from(jobRuns).where(eq(jobRuns.id,modelInput.jobRunId)),[job]=await db.select().from(scheduledJobs).where(eq(scheduledJobs.id,modelInput.jobId));
  if(run?.aiTaskId!==task.id||run?.jobId!==modelInput.jobId||run?.userId!==ctx.userId||job?.userId!==ctx.userId||job?.accountId!==ctx.accountId||job?.sourceKind!=='benchmark')throw new Error('原调度运行归属不符');
  return authority.bindAiTask(ctx,aiTaskId,{requestFingerprint:task.requestFingerprint,modelInput,budget:deps.budget});
 },
 async run(ctx:RequestContext,aiTaskId:string,collector:ScheduledFlywheelCollector){const bound=await service.prepare(ctx,aiTaskId),claim=await tasks.claimTask({taskId:bound.executionTaskId,workerId:`flywheel:${randomUUID()}`,leaseSeconds:300});if(claim)await track(consume(claim,collector));return bound;},
 async drain(collector:ScheduledFlywheelCollector,maxTasks=10){let processed=0;while(!abort.signal.aborted&&processed<maxTasks){const claim=await tasks.claimNext({kinds:['ai_task'],executionMode:'scheduled.flywheel',workerId:`flywheel-drain:${randomUUID()}`,leaseSeconds:300});if(!claim)break;await track(consume(claim,collector));processed++;}return processed;},
 async recoverQueued(onFailure:(ctx:RequestContext,taskId:string)=>Promise<void>){const rows=await db.select().from(aiTasks).where(and(eq(aiTasks.taskType,'scheduled.benchmark'),eq(aiTasks.status,'queued'),isNull(aiTasks.executionTaskId),isNull(aiTasks.leaseOwner))).orderBy(asc(aiTasks.requestedAt));for(const row of rows){if(abort.signal.aborted)return;const ctx:RequestContext={userId:row.userId,accountId:row.accountId,requestId:`flywheel-recover:${row.id}`,source:'ingestion'};try{await service.prepare(ctx,row.id);}catch{await onFailure(ctx,row.id);}}},
 async stop(){abort.abort();const stopped=await Promise.allSettled([generation.stop(),...activeRuns]);if(stopped.some(value=>value.status==='rejected'))throw new Error('飞轮执行尚未确认停止');},
 };
 async function consume(claim:PersistentTaskClaim,collector:ScheduledFlywheelCollector){
  const ref:ExecutionRef={executionTaskId:claim.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},control=new AbortController(),signal=AbortSignal.any([abort.signal,control.signal]);
  let finished=false,checking=false;
  const verify=()=>leases.withLease(ref,'admission',async scope=>{signal.throwIfAborted();return bindScheduledFlywheel(scope);});
  const bound=await verify(),ctx=bound.context,task:ScheduledCollectionTask={id:bound.business.id,taskType:bound.business.taskType,inputData:bound.business.inputData as Record<string,unknown>};
  const checkInput=(c:RequestContext,id:string)=>{if(c.userId!==ctx.userId||c.accountId!==ctx.accountId||id!==task.id)throw new Error('飞轮生命周期归属不符');};
  const finish=async(status:'succeeded'|'failed',errorMessage?:string)=>{
   const current=await leases.withLease(ref,'settlement',async({task})=>task);
   if(current.status!=='running')throw new ScheduledFlywheelSuspended(ref.executionTaskId,current.status);
   const state=await ledger.inspect(ref);if(state.calls.some(row=>row.status==='started'||row.status==='unknown')){const result=await outcomes.recordFailure(ref,{outcome:'unknown_result',errorCode:'FLYWHEEL_CALL_REQUIRES_RECONCILIATION'});throw new ScheduledFlywheelSuspended(ref.executionTaskId,result.status);}
   const original=state.calls.find(row=>row.id===current.retryOfCallId),latest=original?state.calls.filter(row=>row.operationKey===original.operationKey).at(-1):undefined;
   if(status==='succeeded'&&original&&latest?.status!=='settled'){const result=await outcomes.recordFailure(ref,{outcome:'waiting_user',errorCode:'FLYWHEEL_RETRY_SOURCE_UNAVAILABLE'});throw new ScheduledFlywheelSuspended(ref.executionTaskId,result.status);}
   await leases.withLease(ref,'admission',async scope=>{await bindScheduledFlywheel(scope);signal.throwIfAborted();await scope.tx.update(aiTasks).set({status,completedAt:now(),errorMessage:errorMessage??null}).where(eq(aiTasks.id,task.id));await scope.tx.update(executionTasks).set({status,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,updatedAt:now(),lastErrorMessage:errorMessage??null}).where(eq(executionTasks.id,ref.executionTaskId));});finished=true;
  };
  const ai:ScheduledCollectionAiPort={async markRunning(c,id){checkInput(c,id);await verify();},async recordStep(c,id,input){checkInput(c,id);await leases.withLease(ref,'admission',async scope=>{await bindScheduledFlywheel(scope);signal.throwIfAborted();const stepId=`flywheel-step:${task.id}:${input.stepNo}`;await scope.tx.insert(aiTaskSteps).values({id:stepId,aiTaskId:task.id,...input,createdAt:now()}).onConflictDoNothing();});},async markSucceeded(c,id){checkInput(c,id);await finish('succeeded');},async markFailed(c,id,message){checkInput(c,id);await finish('failed',message);}};
  const timer=setInterval(()=>{if(finished||checking)return;checking=true;void verify().then(()=>tasks.heartbeat({taskId:ref.executionTaskId,workerId:claim.lease.workerId,attempt:ref.attempt,leaseSeconds:300})).catch(()=>control.abort()).finally(()=>{checking=false;});},10000);
  try{await scopeStore.run({ref,signal},()=>collector(ctx,task,{signal,ai,models}));if(!finished){await verify();throw new Error('飞轮采集器未提交原任务终态');}}
  catch(error){
   if(error instanceof ScheduledFlywheelSuspended){
    // job_run只是运行投影：等待重试保留进行中，其余明确呈现挂起/失败，不改execution权威。
    await leases.withLease(ref,'settlement',async scope=>{const current=await bindScheduledFlywheel(scope),retry=current.task.status==='retry_wait';await scope.tx.update(jobRuns).set({status:retry?'running':'failed',error:current.task.lastErrorMessage??'模型阶段已挂起，请在原任务中恢复',finishedAt:retry?null:now()}).where(eq(jobRuns.id,current.input.jobRunId));}).catch(()=>{});
    return;
   }
   if(!signal.aborted){try{await finish('failed','飞轮执行中断，请查看原任务恢复状态');}catch{/* 已挂起/失去fence不得覆盖，原租约恢复接管。 */}}
  }finally{clearInterval(timer);control.abort();}
 }
 return service;
}
