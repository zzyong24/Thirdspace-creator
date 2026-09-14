import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {and,asc,eq,inArray,isNull,requireAccountId,aiTasks,aiTaskSteps,executionTasks,jobRuns,scheduledJobs,type Db} from '@creatoros/backend';
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
const sourceKinds=['benchmark','self.detail','self.metrics','self.traffic','comments','favorites'] as const;
// SEMANTIC_BOUNDARY_ALLOW: 用户要求作品优先于评论与封面；仅落实后台资源调度，不做内容判断。
const collectionPriority=(kind:string)=>({"self.metrics":100,"self.traffic":80,comments:40,"self.detail":20}[kind]??0);
const taskTypes=sourceKinds.map(kind=>`scheduled.${kind}`);
export type ScheduledFlywheelCollector=(ctx:RequestContext,task:ScheduledCollectionTask,scope:ScheduledFlywheelScope)=>Promise<void>;
/** 原aiTask单向交接给execution_tasks；不生成第二份业务任务或调度队列。 */
export function createScheduledFlywheelExecutionService(db:Db,deps:ScheduledFlywheelDeps){
 const tasks=createPersistentTaskService(db,deps),authority=createExecutionAuthorityService(db,deps),leases=createExecutionLeaseService(db,deps),ledger=createExecutionCallLedgerService(db,deps),outcomes=createExecutionWorkerOutcomeService(db,deps),generation=createExecutionFlywheelGenerationService(db,deps),abort=new AbortController(),scopeStore=new AsyncLocalStorage<{ref:ExecutionRef;signal:AbortSignal}>();
 const now=deps.now??(()=>new Date().toISOString());
 const runIntents=createScheduledRunIntentService(db,{now,nextId:prefix=>`${prefix}-${randomUUID()}`},sourceKinds);
 // 槽位只表示本进程正在执行的账号；排队、重试时间与任务状态仍以数据库为准。
 const maxActiveAccounts=2;
 const activeRuns=new Map<string,{userId:string;accountId:string;pending:Promise<void>}>();
 let admissionTail:Promise<void>=Promise.resolve();
 const accountKey=(owner:{userId:string;accountId:string})=>JSON.stringify([owner.userId,owner.accountId]);
 function admit<T>(run:()=>Promise<T>):Promise<T>{
  const pending=admissionTail.then(run);
  admissionTail=pending.then(()=>{},()=>{});
  return pending;
 }
 function launch(claim:PersistentTaskClaim,collector:ScheduledFlywheelCollector){
  const owner={userId:claim.task.userId,accountId:claim.task.accountId},key=accountKey(owner);
  const pending=consume(claim,collector).finally(()=>{if(activeRuns.get(key)?.pending===pending)activeRuns.delete(key);});
  activeRuns.set(key,{...owner,pending});
  // 后台入口不等待整项任务；保持 rejection 已处理，等待入口仍可观察原错误。
  void pending.catch(()=>{});
  return pending;
 }
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
  const raw=task.inputData as Record<string,unknown>;
  const parsedSnapshot=scheduledFlywheelSnapshotSchema.safeParse({sourceKind:task.taskType.slice('scheduled.'.length),skillSnapshot:(task.runtimeData as Record<string,unknown>)?.skillSnapshot});
  if(!parsedSnapshot.success)throw new Error('旧采集任务缺少完整执行配置，无法继续原任务。已有数据保留，请重新运行同步任务。',{cause:parsedSnapshot.error});
  const snapshot=parsedSnapshot.data.skillSnapshot;
  if(snapshot.userId!==ctx.userId||snapshot.accountId!==ctx.accountId)throw new Error('原任务缺少对标拆解授权快照');
  // 调度run是持久绑定真相；dispatch内存对象不是恢复输入。旧任务可缺jobRunId，不能猜ID。
  const run=await runIntents.ensureRunForTask(ctx,task.id);
  if(raw.jobRunId!==undefined&&raw.jobRunId!==run.id)throw new Error('采集任务运行引用与真实绑定不符');
  const modelInput=scheduledFlywheelTaskInputSchema.parse({kind:'scheduled.flywheel',sourceKind:task.taskType.slice('scheduled.'.length),jobId:raw.jobId,jobRunId:run.id,target:raw.target??{},skillSnapshot:snapshot});
  const [job]=await db.select().from(scheduledJobs).where(eq(scheduledJobs.id,modelInput.jobId));
  if(run?.aiTaskId!==task.id||run?.jobId!==modelInput.jobId||run?.userId!==ctx.userId||job?.userId!==ctx.userId||job?.accountId!==ctx.accountId||job?.sourceKind!==modelInput.sourceKind)throw new Error('原调度运行归属不符');
  return authority.bindAiTask(ctx,aiTaskId,{requestFingerprint:task.requestFingerprint,modelInput,budget:['self.traffic','self.metrics','comments','self.detail'].includes(modelInput.sourceKind)?createContinuousExecutionBudget():deps.budget,priority:collectionPriority(modelInput.sourceKind)});
 },
 async run(ctx:RequestContext,aiTaskId:string,collector:ScheduledFlywheelCollector){
  const bound=await service.prepare(ctx,aiTaskId),owner={userId:ctx.userId,accountId:requireAccountId(ctx.accountId)};
  const admitted=await admit(async()=>{
   if(abort.signal.aborted||activeRuns.size>=maxActiveAccounts||activeRuns.has(accountKey(owner)))return null;
   const claim=await tasks.claimTask({taskId:bound.executionTaskId,workerId:`flywheel:${randomUUID()}`,leaseSeconds:300});
   return claim?{pending:launch(claim,collector)}:null;
  });
  if(admitted)await admitted.pending;
  return bound;
 },
 async drain(collector:ScheduledFlywheelCollector,maxTasks=10,options:{waitForCompletion?:boolean}={}){
  let processed=0;const launched:Promise<void>[]=[];
  while(!abort.signal.aborted&&processed<maxTasks){
   const admitted=await admit(async()=>{
    if(abort.signal.aborted||activeRuns.size>=maxActiveAccounts)return null;
    const claim=await tasks.claimNext({kinds:['ai_task'],executionMode:'scheduled.flywheel',workerId:`flywheel-drain:${randomUUID()}`,leaseSeconds:300,excludeAccounts:[...activeRuns.values()].map(({userId,accountId})=>({userId,accountId}))});
    return claim?{pending:launch(claim,collector)}:null;
   });
   if(admitted){launched.push(admitted.pending);processed++;continue;}
   if(options.waitForCompletion===false||!activeRuns.size)break;
   await Promise.race([...activeRuns.values()].map(run=>run.pending));
  }
  if(options.waitForCompletion!==false)await Promise.all([...launched,...[...activeRuns.values()].map(run=>run.pending)]);
  return processed;
 },
 async recoverQueued(onFailure:(ctx:RequestContext,taskId:string,error?:unknown)=>Promise<void>,prepare?:(ctx:RequestContext,taskId:string)=>Promise<unknown>):Promise<void>{
  const rows=await db.select().from(aiTasks).where(and(inArray(aiTasks.taskType,taskTypes),eq(aiTasks.status,'queued'),isNull(aiTasks.executionTaskId),isNull(aiTasks.leaseOwner))).orderBy(asc(aiTasks.requestedAt));
  const failures:unknown[]=[];
  for(const row of rows){
   if(abort.signal.aborted)return;
   const ctx:RequestContext={userId:row.userId,accountId:row.accountId,requestId:`flywheel-recover:${row.id}`,source:'ingestion'};
   try{await (prepare??service.prepare)(ctx,row.id);}catch(error){
    // 一个旧任务已明确失败不能挡住其它账号的恢复；仍向调用方报告结算错误。
    try{await onFailure(ctx,row.id,error);}catch(failure){failures.push(failure);}
   }
  }
  if(failures.length)throw new AggregateError(failures,'部分旧采集任务未能恢复，其他任务已继续处理');
 },
 async stop(){abort.abort();await admissionTail;const stopped=await Promise.allSettled([generation.stop(),...[...activeRuns.values()].map(run=>run.pending)]);if(stopped.some(value=>value.status==='rejected'))throw new Error('飞轮执行尚未确认停止');},
 };
 async function consume(claim:PersistentTaskClaim,collector:ScheduledFlywheelCollector){
  const ref:ExecutionRef={executionTaskId:claim.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},control=new AbortController(),signal=AbortSignal.any([abort.signal,control.signal]);
  let finished=false,checking=false;
  const verify=()=>leases.withLease(ref,'admission',async scope=>{signal.throwIfAborted();return bindScheduledFlywheel(scope);});
  const acknowledgeControl=async()=>{
   const controlled=await leases.withLease(ref,'settlement',async({task})=>['cancel_requested','pause_requested'].includes(task.status));
   if(!controlled)return false;
   await tasks.acknowledgeControl({taskId:ref.executionTaskId,workerId:claim.lease.workerId,attempt:ref.attempt});
   return true;
  };
  let bound:Awaited<ReturnType<typeof verify>>;
  try{bound=await verify();}catch(error){
   if(signal.aborted)return;
   const acknowledged=await acknowledgeControl().catch(()=>false);
   if(acknowledged)return;
   throw error;
  }
  if(signal.aborted)return;
  const ctx=bound.context,task:ScheduledCollectionTask={id:bound.business.id,taskType:bound.business.taskType,inputData:{...(bound.business.inputData as Record<string,unknown>),jobId:bound.input.jobId,jobRunId:bound.input.jobRunId,target:bound.input.target}};
  const checkInput=(c:RequestContext,id:string)=>{if(c.userId!==ctx.userId||c.accountId!==ctx.accountId||id!==task.id)throw new Error('飞轮生命周期归属不符');};
  const finish=async(status:'succeeded'|'failed',errorMessage?:string)=>{
   const current=await leases.withLease(ref,'settlement',async({task})=>task);
   if(current.status!=='running')throw new ScheduledFlywheelSuspended(ref.executionTaskId,current.status);
   const state=await ledger.inspect(ref);if(state.calls.some(row=>row.status==='started'||row.status==='unknown')){const result=await outcomes.recordFailure(ref,{outcome:'unknown_result',errorCode:'FLYWHEEL_CALL_REQUIRES_RECONCILIATION'});throw new ScheduledFlywheelSuspended(ref.executionTaskId,result.status);}
   const original=state.calls.find(row=>row.id===current.retryOfCallId),latest=original?state.calls.filter(row=>row.operationKey===original.operationKey).at(-1):undefined;
   if(status==='succeeded'&&original&&latest?.status!=='settled'){const result=await outcomes.recordFailure(ref,{outcome:'waiting_user',errorCode:'FLYWHEEL_RETRY_SOURCE_UNAVAILABLE'});throw new ScheduledFlywheelSuspended(ref.executionTaskId,result.status);}
   await leases.withLease(ref,'admission',async scope=>{await bindScheduledFlywheel(scope);signal.throwIfAborted();await scope.tx.update(aiTasks).set({status,completedAt:now(),errorMessage:errorMessage??null}).where(eq(aiTasks.id,task.id));await scope.tx.update(jobRuns).set({status,error:errorMessage??null,finishedAt:now()}).where(eq(jobRuns.id,bound.input.jobRunId));await scope.tx.update(executionTasks).set({status,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,updatedAt:now(),lastErrorMessage:errorMessage??null}).where(eq(executionTasks.id,ref.executionTaskId));});finished=true;
  };
  const ai:ScheduledCollectionAiPort={async recordCollectionResult(c,id,result){
   checkInput(c,id);
   const parts=result.countsBySource??{main:result};
   if(!Object.values(parts).every(p=>[p.itemsNew,p.itemsUpdated].every(n=>Number.isSafeInteger(n)&&n>=0)))throw new Error('采集统计不合法');
   await leases.withLease(ref,'admission',async scope=>{
    const current=await bindScheduledFlywheel(scope);signal.throwIfAborted();
    const runtime=(current.business.runtimeData??{}) as Record<string,unknown>;
    const receipt=runtime.collectionResultReceipt as {executionId?:string;attempt?:number;bySource?:Record<string,{itemsNew:number;itemsUpdated:number}>}|undefined;
    if(receipt?.executionId===ref.executionTaskId&&receipt.attempt===ref.attempt)return;
    const [run]=await scope.tx.select().from(jobRuns).where(eq(jobRuns.id,current.input.jobRunId)).for('update');
    if(!run)throw new Error('原采集运行记录不存在');
    const bySource={...(receipt?.executionId===ref.executionTaskId?receipt.bySource:{})};
    let itemsNew=run.itemsNew??0,itemsUpdated=run.itemsUpdated??0;
    for(const [key,part] of Object.entries(parts)){
     const previous=bySource[key]??{itemsNew:key==='main'&&part.countMode==='cumulative'?itemsNew:0,itemsUpdated:key==='main'&&part.countMode==='cumulative'?itemsUpdated:0};
     const next=part.countMode==='cumulative'?{itemsNew:part.itemsNew,itemsUpdated:part.itemsUpdated}:{itemsNew:previous.itemsNew+part.itemsNew,itemsUpdated:previous.itemsUpdated+part.itemsUpdated};
     itemsNew+=next.itemsNew-previous.itemsNew;itemsUpdated+=next.itemsUpdated-previous.itemsUpdated;bySource[key]=next;
    }
    await scope.tx.update(jobRuns).set({itemsNew,itemsUpdated}).where(eq(jobRuns.id,run.id));
    // 仅保存统计回执以防重复累加；任务执行权仍由 execution_tasks 管理。
    await scope.tx.update(aiTasks).set({runtimeData:{...runtime,collectionResultReceipt:{executionId:ref.executionTaskId,attempt:ref.attempt,bySource}}}).where(eq(aiTasks.id,id));
   });
  },async deferCollection(c,id,retryAfterMs=2000){
   checkInput(c,id);await verify();
   if(!['self.traffic','self.metrics','comments','self.detail'].includes(bound.input.sourceKind))throw new Error('仅作品、流量、评论与封面分批采集可交还执行权');
   if(!Number.isSafeInteger(retryAfterMs)||retryAfterMs<2000||retryAfterMs>86400000)throw new Error('采集重试等待时长须为2秒至24小时');
   await leases.withLease(ref,'admission',async scope=>{await bindScheduledFlywheel(scope);signal.throwIfAborted();await scope.tx.update(executionTasks).set({status:'queued',retryAt:new Date(Date.parse(now())+retryAfterMs).toISOString(),leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,updatedAt:now()}).where(eq(executionTasks.id,ref.executionTaskId));});
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
    await leases.withLease(ref,'settlement',async scope=>{const current=await bindScheduledFlywheel(scope),retry=current.task.status==='retry_wait'||current.task.status==='queued';await scope.tx.update(jobRuns).set({status:retry?'running':'failed',error:retry?null:current.task.lastErrorMessage??'模型阶段已挂起，请在原任务中恢复',finishedAt:retry?null:now()}).where(eq(jobRuns.id,current.input.jobRunId));}).catch(()=>{});
    return;
   }
   if(!signal.aborted){try{await finish('failed','飞轮执行中断，请查看原任务恢复状态');}catch{/* 已挂起/失去fence不得覆盖，原租约恢复接管。 */}}
  }finally{
   const interrupted=signal.aborted;clearInterval(timer);control.abort();
   // 收集器已退出才确认用户控制；应用退出时的 running 不会被改成取消。
   if(interrupted)await acknowledgeControl().catch(()=>{});
  }
 }
 return service;
}
