import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {and,asc,eq,inArray,isNull,aiTasks,aiTaskSteps,executionTasks,jobRuns,scheduledJobs,type Db} from '@creatoros/backend';
import {createContinuousExecutionBudget,scheduledFlywheelTaskInputSchema,scheduledFlywheelSnapshotSchema,type ExecutionRef} from '@creatoros/contract/execution-worker';
import type {RequestContext} from '@creatoros/contract';
import {createExecutionAuthorityService} from '../execution/execution-authority.service';
import {createExecutionLeaseService} from '../execution/execution-lease.service';
import {createExecutionCallLedgerService} from '../execution/execution-call-ledger.service';
import {createExecutionWorkerOutcomeService} from '../execution/execution-worker-outcome.service';
import {createPersistentTaskService,type PersistentTaskClaim} from '../execution/persistent-task.service';
import {createExecutionFlywheelGenerationService,type FlywheelGenerationDeps} from '../execution/execution-flywheel-generation.service';
import {bindScheduledFlywheel} from '../execution/scheduled-flywheel-binding';
import {createScheduledRunIntentService} from '../scheduling/daily-topic-run-intent.service';
import {ScheduledFlywheelSuspended} from './scheduled-flywheel-suspension';
import {benchmarkTeardownSchema,topicAttributionSchema,favoritesTriageSchema,flywheelKnowledgeResultSchema} from '@creatoros/ai-worker';
import {normalizeDistillation,mergeDistillations,MAX_DISTILL_CONTENT_CHARS,DISTILL_CHUNK_CHARS} from './knowledge-distill-runner';
import {chunkTextDeterministically} from './chunk-and-merge';
import {truncateForTriage,type FavoritesTriagePort,type FavoritesKnowledgeDistillPort,type FavoritesTranscribePort} from './favorites-distill-runner';
import type {TopicAttributionPort} from './topic-attribution-runner';
import type {FlywheelCapability} from '../execution/execution-flywheel-generation.service';
import {teardownFacets,type BenchmarkTeardownPort} from './benchmark-teardown-runner';
import type {ScheduledCollectionAiPort,ScheduledCollectionTask} from './scheduled-collection-runner';

export interface ScheduledFlywheelModels {teardown:BenchmarkTeardownPort;attribute:TopicAttributionPort;triage:FavoritesTriagePort;distillKnowledge:FavoritesKnowledgeDistillPort;transcribeOne:FavoritesTranscribePort}
export interface ScheduledFlywheelScope {execution:ExecutionRef;signal:AbortSignal;ai:ScheduledCollectionAiPort;models:ScheduledFlywheelModels}
export interface ScheduledFlywheelDeps extends FlywheelGenerationDeps {
 createFavoritesAsr?(runWorker:ReturnType<typeof createExecutionFlywheelGenerationService>['runWorker']):{transcribe(ref:ExecutionRef,ctx:RequestContext,input:{itemId:string;awemeId:string},signal:AbortSignal):Promise<string|null>};
}
const sourceKinds=['benchmark','self.detail','self.metrics','self.traffic','favorites'] as const;
const taskTypes=sourceKinds.map(kind=>`scheduled.${kind}`);
export type ScheduledFlywheelCollector=(ctx:RequestContext,task:ScheduledCollectionTask,scope:ScheduledFlywheelScope)=>Promise<void>;
/** 原aiTask单向交接给execution_tasks；不生成第二份业务任务或调度队列。 */
export function createScheduledFlywheelExecutionService(db:Db,deps:ScheduledFlywheelDeps){
 const tasks=createPersistentTaskService(db,deps),authority=createExecutionAuthorityService(db,deps),leases=createExecutionLeaseService(db,deps),ledger=createExecutionCallLedgerService(db,deps),outcomes=createExecutionWorkerOutcomeService(db,deps),generation=createExecutionFlywheelGenerationService(db,deps),abort=new AbortController(),scopeStore=new AsyncLocalStorage<{ref:ExecutionRef;signal:AbortSignal}>();
 const now=deps.now??(()=>new Date().toISOString());
 const runIntents=createScheduledRunIntentService(db,{now,nextId:prefix=>`${prefix}-${randomUUID()}`},sourceKinds);
 const activeRuns=new Set<Promise<void>>();
 const track=async(pending:Promise<void>)=>{activeRuns.add(pending);try{await pending;}finally{activeRuns.delete(pending);}};
 const favoriteAsr=deps.createFavoritesAsr?.(generation.runWorker);
 async function contextFor(ctx:RequestContext){
  const scope=scopeStore.getStore();if(!scope)throw new Error('飞轮阶段缺少原调度任务执行权');scope.signal.throwIfAborted();
  const bound=await leases.withLease(scope.ref,'admission',async bound=>{const owned=await bindScheduledFlywheel(bound);if(owned.context.userId!==ctx.userId||owned.context.accountId!==ctx.accountId)throw new Error('飞轮模型账号不符');return owned;});
  return {...scope,bound};
 }
 async function generate(ctx:RequestContext,capability:FlywheelCapability,resourceId:string|undefined,facets:Record<string,string|undefined>){
  if(!resourceId)throw new Error('飞轮模型缺少原业务资源ID');const scope=await contextFor(ctx);
  try{return await generation.generate(scope.ref,capability,resourceId,facets);}
  catch(error){
   if(error instanceof ScheduledFlywheelSuspended)throw error;
   const state=await ledger.inspect(scope.ref),unknown=state.calls.some(row=>row.status==='started'||row.status==='unknown');
   if(unknown){const result=await outcomes.recordFailure(scope.ref,{outcome:'unknown_result',errorCode:'FLYWHEEL_MODEL_RECEIPT_UNKNOWN'});throw new ScheduledFlywheelSuspended(scope.ref.executionTaskId,result.status);}
   throw error;
  }
 }
 const models:ScheduledFlywheelModels={
  async teardown(ctx,input){return benchmarkTeardownSchema.parse(await generate(ctx,'benchmark.teardown',input.work.id,teardownFacets(input.positioningBrief,input.work)));},
  async attribute(ctx,input){return topicAttributionSchema.parse(await generate(ctx,'topic.attribution',input.publicationId,{positioning:input.positioningBrief||'（本账号尚未设置定位——按通用短视频逻辑归因，实验选题给通用可迁移角度）',workBrief:input.workBrief,transcript:input.transcript}));},
  async triage(ctx,input){return favoritesTriageSchema.parse(await generate(ctx,'favorites.triage',input.itemId,{title:input.title||'(无标题)',transcript:truncateForTriage(input.transcript)}));},
  async distillKnowledge(ctx,content,itemId){
   const text=content.trim();if(!text)throw new Error('知识蒸馏原文为空');
   const submitted=text.slice(0,MAX_DISTILL_CONTENT_CHARS),chunks=chunkTextDeterministically(submitted,DISTILL_CHUNK_CHARS).map(chunk=>chunk.text);
   const node={capability:'knowledge.distill',facets:{},chunks,originalText:submitted,coverage:{inputChars:text.length,submittedChars:submitted.length,truncatedChars:text.length-submitted.length}};
   const result=flywheelKnowledgeResultSchema.parse(await generate(ctx,'knowledge.distill',itemId,{__knowledgeNode:JSON.stringify(node)}));
   if(result.parts.length!==result.coverage.chunkCount)throw new Error('知识蒸馏缺少完整分块结果');
   const parts=result.parts.map(normalizeDistillation);if(parts.some(part=>part===null))throw new Error('模型未蒸馏出可用知识原子');
   const merged=mergeDistillations(parts.filter(part=>part!==null));if(!merged.atoms.length)throw new Error('模型未蒸馏出可用知识原子');return {...merged,coverage:result.coverage};
  },
  async transcribeOne(ctx,awemeId,itemId){
   const scope=await contextFor(ctx);if(scope.bound.input.sourceKind!=='favorites'||!itemId)throw new Error('收藏转写缺少原条目归属');
   if(!favoriteAsr){const result=await outcomes.recordFailure(scope.ref,{outcome:'waiting_user',errorCode:'FAVORITES_ASR_NOT_CONFIGURED'});throw new ScheduledFlywheelSuspended(scope.ref.executionTaskId,result.status);}
   try{return await favoriteAsr.transcribe(scope.ref,ctx,{itemId,awemeId},scope.signal);}catch(error){
    const current=await leases.withLease(scope.ref,'settlement',async({task})=>task);
    if(current.status!=='running')throw new ScheduledFlywheelSuspended(scope.ref.executionTaskId,current.status);
    const state=await ledger.inspect(scope.ref);if(state.calls.some(call=>call.status==='started'||call.status==='unknown')){const result=await outcomes.recordFailure(scope.ref,{outcome:'unknown_result',errorCode:'FAVORITES_ASR_RECEIPT_UNKNOWN'});throw new ScheduledFlywheelSuspended(scope.ref.executionTaskId,result.status);}
    throw error;
   }
  },
 };
 const service={
 models,
 ensureRunForTask:runIntents.ensureRunForTask,
 async prepare(ctx:RequestContext,aiTaskId:string){
  abort.signal.throwIfAborted();
  const [task]=await db.select().from(aiTasks).where(and(eq(aiTasks.id,aiTaskId),eq(aiTasks.userId,ctx.userId),eq(aiTasks.accountId,ctx.accountId??'')));
  if(!task||!taskTypes.includes(task.taskType))throw new Error('不支持的原调度任务');
  if(task.executionTaskId){const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,task.executionTaskId));scheduledFlywheelTaskInputSchema.parse((execution?.payload as Record<string,unknown>)?.modelInput);return authority.bindAiTask(ctx,aiTaskId);}
  if(task.startedAt||task.modelCallStartedAt||task.retryOfTaskId)throw new Error('已有旧执行事实，须恢复原任务，不能重置预算');
  const raw=task.inputData as Record<string,unknown>,snapshot=scheduledFlywheelSnapshotSchema.parse({sourceKind:task.taskType.slice('scheduled.'.length),skillSnapshot:(task.runtimeData as Record<string,unknown>).skillSnapshot}).skillSnapshot;
  if(snapshot.userId!==ctx.userId||snapshot.accountId!==ctx.accountId)throw new Error('原任务缺少对标拆解授权快照');
  // 调度run是持久绑定真相；dispatch内存对象不是恢复输入。旧任务可缺jobRunId，不能猜ID。
  const run=await runIntents.ensureRunForTask(ctx,task.id);
  if(raw.jobRunId!==undefined&&raw.jobRunId!==run.id)throw new Error('采集任务运行引用与真实绑定不符');
  const modelInput=scheduledFlywheelTaskInputSchema.parse({kind:'scheduled.flywheel',sourceKind:task.taskType.slice('scheduled.'.length),jobId:raw.jobId,jobRunId:run.id,target:raw.target??{},skillSnapshot:snapshot});
  const [job]=await db.select().from(scheduledJobs).where(eq(scheduledJobs.id,modelInput.jobId));
  if(run?.aiTaskId!==task.id||run?.jobId!==modelInput.jobId||run?.userId!==ctx.userId||job?.userId!==ctx.userId||job?.accountId!==ctx.accountId||job?.sourceKind!==modelInput.sourceKind)throw new Error('原调度运行归属不符');
  return authority.bindAiTask(ctx,aiTaskId,{requestFingerprint:task.requestFingerprint,modelInput,budget:['self.traffic','self.metrics'].includes(modelInput.sourceKind)?createContinuousExecutionBudget():deps.budget});
 },
 async run(ctx:RequestContext,aiTaskId:string,collector:ScheduledFlywheelCollector){const bound=await service.prepare(ctx,aiTaskId),claim=await tasks.claimTask({taskId:bound.executionTaskId,workerId:`flywheel:${randomUUID()}`,leaseSeconds:300});if(claim)await track(consume(claim,collector));return bound;},
 async drain(collector:ScheduledFlywheelCollector,maxTasks=10){let processed=0;while(!abort.signal.aborted&&processed<maxTasks){const claim=await tasks.claimNext({kinds:['ai_task'],executionMode:'scheduled.flywheel',workerId:`flywheel-drain:${randomUUID()}`,leaseSeconds:300});if(!claim)break;await track(consume(claim,collector));processed++;}return processed;},
 async recoverQueued(onFailure:(ctx:RequestContext,taskId:string,error?:unknown)=>Promise<void>,prepare?:(ctx:RequestContext,taskId:string)=>Promise<unknown>):Promise<void>{const rows=await db.select().from(aiTasks).where(and(inArray(aiTasks.taskType,taskTypes),eq(aiTasks.status,'queued'),isNull(aiTasks.executionTaskId),isNull(aiTasks.leaseOwner))).orderBy(asc(aiTasks.requestedAt));for(const row of rows){if(abort.signal.aborted)return;const ctx:RequestContext={userId:row.userId,accountId:row.accountId,requestId:`flywheel-recover:${row.id}`,source:'ingestion'};try{await (prepare??service.prepare)(ctx,row.id);}catch(error){await onFailure(ctx,row.id,error);}}},
 async stop(){abort.abort();const stopped=await Promise.allSettled([generation.stop(),...activeRuns]);if(stopped.some(value=>value.status==='rejected'))throw new Error('飞轮执行尚未确认停止');},
 };
 async function consume(claim:PersistentTaskClaim,collector:ScheduledFlywheelCollector){
  const ref:ExecutionRef={executionTaskId:claim.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},control=new AbortController(),signal=AbortSignal.any([abort.signal,control.signal]);
  let finished=false,checking=false;
  const verify=()=>leases.withLease(ref,'admission',async scope=>{signal.throwIfAborted();return bindScheduledFlywheel(scope);});
  const bound=await verify(),ctx=bound.context,task:ScheduledCollectionTask={id:bound.business.id,taskType:bound.business.taskType,inputData:{...(bound.business.inputData as Record<string,unknown>),jobId:bound.input.jobId,jobRunId:bound.input.jobRunId,target:bound.input.target}};
  const checkInput=(c:RequestContext,id:string)=>{if(c.userId!==ctx.userId||c.accountId!==ctx.accountId||id!==task.id)throw new Error('飞轮生命周期归属不符');};
  const finish=async(status:'succeeded'|'failed',errorMessage?:string)=>{
   const current=await leases.withLease(ref,'settlement',async({task})=>task);
   if(current.status!=='running')throw new ScheduledFlywheelSuspended(ref.executionTaskId,current.status);
   const state=await ledger.inspect(ref);if(state.calls.some(row=>row.status==='started'||row.status==='unknown')){const result=await outcomes.recordFailure(ref,{outcome:'unknown_result',errorCode:'FLYWHEEL_CALL_REQUIRES_RECONCILIATION'});throw new ScheduledFlywheelSuspended(ref.executionTaskId,result.status);}
   const original=state.calls.find(row=>row.id===current.retryOfCallId),latest=original?state.calls.filter(row=>row.operationKey===original.operationKey).at(-1):undefined;
   if(status==='succeeded'&&original&&latest?.status!=='settled'){const result=await outcomes.recordFailure(ref,{outcome:'waiting_user',errorCode:'FLYWHEEL_RETRY_SOURCE_UNAVAILABLE'});throw new ScheduledFlywheelSuspended(ref.executionTaskId,result.status);}
   await leases.withLease(ref,'admission',async scope=>{await bindScheduledFlywheel(scope);signal.throwIfAborted();await scope.tx.update(aiTasks).set({status,completedAt:now(),errorMessage:errorMessage??null}).where(eq(aiTasks.id,task.id));await scope.tx.update(jobRuns).set({status,error:errorMessage??null,finishedAt:now()}).where(eq(jobRuns.id,bound.input.jobRunId));await scope.tx.update(executionTasks).set({status,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,updatedAt:now(),lastErrorMessage:errorMessage??null}).where(eq(executionTasks.id,ref.executionTaskId));});finished=true;
  };
  const ai:ScheduledCollectionAiPort={async deferCollection(c,id){
   checkInput(c,id);await verify();
   if(!['self.traffic','self.metrics'].includes(bound.input.sourceKind))throw new Error('仅流量分批采集可交还执行权');
   await leases.withLease(ref,'admission',async scope=>{await bindScheduledFlywheel(scope);signal.throwIfAborted();await scope.tx.update(executionTasks).set({status:'queued',retryAt:new Date(Date.parse(now())+2000).toISOString(),leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,updatedAt:now()}).where(eq(executionTasks.id,ref.executionTaskId));});
   finished=true;throw new ScheduledFlywheelSuspended(ref.executionTaskId,'queued');
  },async markWaitingUser(c,id){
   checkInput(c,id);await verify();
   const state=await ledger.inspect(ref),unknown=state.calls.some(call=>call.status==='started'||call.status==='unknown');
   await outcomes.recordFailure(ref,{outcome:unknown?'unknown_result':'waiting_user',errorCode:unknown?'FLYWHEEL_CALL_REQUIRES_RECONCILIATION':'FLYWHEEL_LOGIN_REQUIRED'});
   finished=true;
  },async markRunning(c,id){checkInput(c,id);await verify();},async recordStep(c,id,input){checkInput(c,id);await leases.withLease(ref,'admission',async scope=>{await bindScheduledFlywheel(scope);signal.throwIfAborted();const stepId=`flywheel-step:${task.id}:${input.stepNo}`;await scope.tx.insert(aiTaskSteps).values({id:stepId,aiTaskId:task.id,...input,createdAt:now()}).onConflictDoNothing();});},async markSucceeded(c,id){checkInput(c,id);await finish('succeeded');},async markFailed(c,id,message){checkInput(c,id);await finish('failed',message);}};
  const timer=setInterval(()=>{if(finished||checking)return;checking=true;void verify().then(()=>tasks.heartbeat({taskId:ref.executionTaskId,workerId:claim.lease.workerId,attempt:ref.attempt,leaseSeconds:300})).catch(()=>control.abort()).finally(()=>{checking=false;});},10000);
  try{await scopeStore.run({ref,signal},()=>collector(ctx,task,{execution:ref,signal,ai,models}));if(!finished){await verify();throw new Error('飞轮采集器未提交原任务终态');}}
  catch(error){
   if(error instanceof ScheduledFlywheelSuspended){
    // job_run只是运行投影：等待重试保留进行中，其余明确呈现挂起/失败，不改execution权威。
    await leases.withLease(ref,'settlement',async scope=>{const current=await bindScheduledFlywheel(scope),retry=current.task.status==='retry_wait'||current.task.status==='queued';await scope.tx.update(jobRuns).set({status:retry?'running':'failed',error:current.task.lastErrorMessage??'模型阶段已挂起，请在原任务中恢复',finishedAt:retry?null:now()}).where(eq(jobRuns.id,current.input.jobRunId));}).catch(()=>{});
    return;
   }
   if(!signal.aborted){try{await finish('failed','飞轮执行中断，请查看原任务恢复状态');}catch{/* 已挂起/失去fence不得覆盖，原租约恢复接管。 */}}
  }finally{clearInterval(timer);control.abort();}
 }
 return service;
}
