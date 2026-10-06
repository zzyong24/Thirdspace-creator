import {executionTimeoutMs} from "@creatoros/contract/timeout-policy";
import {workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import {requireAccountId} from "./benchmark.errors";
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {and,asc,eq,isNull,aiTasks,benchmarkWorks,executionTasks,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {benchmarkTranscribeTaskInputSchema,type ExecutionRef} from '@creatoros/contract/execution-worker';
import type {AiService} from '../ai/ai.service';
import {canonicalJson} from '../ai/canonical-json';
import {transcribeConfiguration} from '../ai-runtime/transcribe-business-execution.service';
import {createExecutionAuthorityService} from '../execution/execution-authority.service';
import {createPersistentTaskService,type PersistentTaskClaim} from '../execution/persistent-task.service';
import {createExecutionLeaseService} from '../execution/execution-lease.service';
import {createExecutionCallLedgerService} from '../execution/execution-call-ledger.service';
import {createExecutionWorkerOutcomeService} from '../execution/execution-worker-outcome.service';
import {createClaimedWorkerSupervision} from '../execution/claimed-worker-supervision';
import {createClaimedAsrStageService,ClaimedAsrSuspended,type ClaimedAsrStageDeps} from '../execution/claimed-asr-stage.service';
import type {TranscribeResourceBinding} from '../execution/transcribe-execution-binding';

export interface BenchmarkTranscriptionDeps extends Omit<ClaimedAsrStageDeps,'bindResource'|'runWorker'> {
 ai:Pick<AiService,'createTask'>;entryPath:string|(()=>string);wake?:()=>void;
}
export class BenchmarkTranscriptionPending extends Error {
 readonly code='BENCHMARK_TRANSCRIPTION_PENDING';
 constructor(readonly aiTaskId:string,readonly executionTaskId:string){super(`转写任务仍可恢复，请查看原任务 ${aiTaskId}`);}
}
/** 单条用户请求创建真实 benchmark.transcribe；唯一输出是原 benchmark work 的逐字稿。 */
export function createBenchmarkTranscriptionService(db:Db,deps:BenchmarkTranscriptionDeps){
 const tasks=createPersistentTaskService(db,deps),authority=createExecutionAuthorityService(db,deps),leases=createExecutionLeaseService(db,deps);
 const ledger=createExecutionCallLedgerService(db,deps),outcomes=createExecutionWorkerOutcomeService(db,deps),supervision=createClaimedWorkerSupervision(deps);
 const shutdown=new AbortController(),runs=new Map<string,Promise<void>>(),now=deps.now??(()=>new Date().toISOString());
 const workWhere=(ctx:RequestContext,id:string)=>and(eq(benchmarkWorks.id,id),eq(benchmarkWorks.userId,ctx.userId),workspaceFilter(benchmarkWorks,ctx));
 const taskWhere=(ctx:RequestContext,id:string)=>and(eq(aiTasks.id,id),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx));
 const bindResource:TranscribeResourceBinding=async(scope,awemeId)=>{
  const payload=scope.task.payload as Record<string,unknown>,input=benchmarkTranscribeTaskInputSchema.parse(payload.modelInput);
  const [business]=await scope.tx.select().from(aiTasks).where(taskWhere(scope.context,scope.task.ownerId));
  const [work]=await scope.tx.select().from(benchmarkWorks).where(workWhere(scope.context,input.workId));
  if(scope.task.kind!=='ai_task'||scope.task.ownerType!=='ai_task'||!business||business.taskType!=='benchmark.transcribe'||business.executionTaskId!==scope.task.id||payload.aiTaskId!==business.id||!isDeepStrictEqual(business.inputData,input)||!work||work.awemeId!==input.awemeId||work.sourceId!==input.sourceId||work.sourceExternalAccountId!==input.sourceExternalAccountId||awemeId!==input.awemeId)throw new Error('BENCHMARK_TRANSCRIPT_OWNER_MISMATCH');
  return {payload,input:{kind:'transcribe.douyin',awemeIds:[awemeId],language:'zh',configuration:input.configuration},credentialIntentId:business.id};
 };
 const stage=createClaimedAsrStageService(db,{...deps,bindResource,runWorker:supervision.run});
 async function prepare(ctx:RequestContext,id:string){
  const [task]=await db.select().from(aiTasks).where(taskWhere(ctx,id));
  if(!task||task.taskType!=='benchmark.transcribe')throw new Error('BENCHMARK_TRANSCRIPT_TASK_NOT_FOUND');
  ctx={...ctx,groupId:task.groupId??undefined,accountId:task.accountId,membershipVersion:task.membershipVersion??undefined,groupVersion:task.groupVersion??undefined};
  const input=benchmarkTranscribeTaskInputSchema.parse(task.inputData);
  const [work]=await db.select().from(benchmarkWorks).where(workWhere(ctx,input.workId));
  if(!work||work.awemeId!==input.awemeId||work.sourceId!==input.sourceId||work.sourceExternalAccountId!==input.sourceExternalAccountId)throw new Error('BENCHMARK_TRANSCRIPT_SOURCE_CHANGED');
  if(task.executionTaskId){
   const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,task.executionTaskId));
   if(!isDeepStrictEqual((execution?.payload as Record<string,unknown>|undefined)?.modelInput,input))throw new Error('BENCHMARK_TRANSCRIPT_INPUT_CHANGED');
   return authority.bindAiTask(ctx,id);
  }
  return authority.bindAiTask(ctx,id,{requestFingerprint:task.requestFingerprint,modelInput:input,budget:deps.budget});
 }
 async function consume(claim:PersistentTaskClaim){
  const ref:ExecutionRef={executionTaskId:claim.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const ctx:RequestContext={userId:claim.task.userId,groupId:claim.task.groupId??undefined,accountId:claim.task.accountId,membershipVersion:claim.task.membershipVersion??undefined,groupVersion:claim.task.groupVersion??undefined,requestId:`benchmark-transcribe:${claim.task.id}`,source:'user'};
  const input=await leases.withLease(ref,"admission",async({task})=>benchmarkTranscribeTaskInputSchema.parse((task.payload as Record<string,unknown>).modelInput));
  let checking=false,finished=false;
  const verify=()=>leases.withLease(ref,'admission',async scope=>{shutdown.signal.throwIfAborted();return bindResource(scope,input.awemeId);});
  const timer=setInterval(()=>{if(checking||finished)return;checking=true;void verify().then(()=>tasks.heartbeat({taskId:ref.executionTaskId,workerId:claim.lease.workerId,attempt:ref.attempt,leaseSeconds:300})).catch(()=>{}).finally(()=>{checking=false;});},10000);
  try {
   await leases.withLease(ref,'admission',async scope=>{await bindResource(scope,input.awemeId);await scope.tx.update(benchmarkWorks).set({transcriptStatus:'pending',updatedAt:now()}).where(workWhere(ctx,input.workId));});
   const text=await stage.transcribe(ref,ctx,input.awemeId,shutdown.signal);
   await leases.withLease(ref,'admission',async scope=>{
    await bindResource(scope,input.awemeId);const stamp=now();
    await scope.tx.update(benchmarkWorks).set({transcript:text,transcriptStatus:text?'done':'skipped',updatedAt:stamp}).where(workWhere(ctx,input.workId));
    await scope.tx.update(aiTasks).set({status:'succeeded',completedAt:stamp,errorMessage:null}).where(taskWhere(ctx,scope.task.ownerId));
    await scope.tx.update(executionTasks).set({status:'succeeded',leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,updatedAt:stamp}).where(eq(executionTasks.id,scope.task.id));finished=true;
   });
  } catch(error){
   let status=error instanceof ClaimedAsrSuspended?error.status:undefined;
   if(!status&&!shutdown.signal.aborted){try{const state=await ledger.inspect(ref),unknown=state.calls.some(call=>call.status==='started'||call.status==='unknown');status=(await outcomes.recordFailure(ref,{outcome:unknown?'unknown_result':'failed',errorCode:unknown?'BENCHMARK_ASR_REQUIRES_RECONCILIATION':'BENCHMARK_TRANSCRIBE_FAILED'})).status;}catch{/* 原租约恢复接管。 */}}
   if(status==='failed'||status==='waiting_user')await leases.withLease(ref,'settlement',async scope=>{
    await bindResource(scope,input.awemeId);if(scope.task.status!==status)return;
    const [work]=await scope.tx.select().from(benchmarkWorks).where(workWhere(ctx,input.workId));
    await scope.tx.update(benchmarkWorks).set({transcriptStatus:work?.transcript?.trim()?'done':'failed',updatedAt:now()}).where(workWhere(ctx,input.workId));
   }).catch(()=>{});
  }finally{finished=true;clearInterval(timer);}
 }
 const track=async(id:string,work:()=>Promise<void>)=>{
  const existing=runs.get(id);if(existing)return existing;
  const pending=work();runs.set(id,pending);try{await pending;}finally{runs.delete(id);}
 };
 const service={
  prepare,
  async submit(ctx:RequestContext,workId:string){
   requireAccountId(ctx.accountId,"真实转写凭据账号");await assertWritableWorkspace(db,ctx);
   shutdown.signal.throwIfAborted();
   const [work]=await db.select().from(benchmarkWorks).where(workWhere(ctx,workId));if(!work)throw new Error('BENCHMARK_WORK_NOT_FOUND');
   const configuration=transcribeConfiguration(await deps.resolveSpec(ctx));
   const input=benchmarkTranscribeTaskInputSchema.parse({kind:'benchmark.transcribe',workId,awemeId:work.awemeId,sourceId:work.sourceId,sourceExternalAccountId:work.sourceExternalAccountId,configuration});
   const attemptId=`benchmark-transcribe:${createHash('sha256').update(canonicalJson(input)).digest('hex')}`;
   const task=await deps.ai.createTask(ctx,{taskType:'benchmark.transcribe',attemptId,inputData:input});
   const mapped=await prepare(ctx,task.id);return mapped;
  },
  async run(ctx:RequestContext,aiTaskId:string){
   const mapped=await prepare(ctx,aiTaskId);
   await track(mapped.executionTaskId,async()=>{const claim=await tasks.claimTask({taskId:mapped.executionTaskId,workerId:`benchmark-asr:${randomUUID()}`,leaseSeconds:300});if(claim)await consume(claim);});return mapped;
  },
  async transcribe(ctx:RequestContext,workId:string,options:{waitMs?:number}={}){
   const [work]=await db.select().from(benchmarkWorks).where(workWhere(ctx,workId));if(!work)throw new Error('BENCHMARK_WORK_NOT_FOUND');
   if(work.transcript?.trim())return {status:'reused' as const,transcript:work.transcript};
   const mapped=await service.submit(ctx,workId);if(deps.wake)deps.wake();else void service.run(ctx,mapped.aiTaskId).catch(()=>{});
   const expires=Date.now()+executionTimeoutMs(options.waitMs);
   while(!shutdown.signal.aborted){
    const task=await tasks.get(ctx,mapped.executionTaskId);
    if(task.status==='succeeded'){
     const [fresh]=await db.select().from(benchmarkWorks).where(workWhere(ctx,workId));
     if(!fresh||fresh.awemeId!==work.awemeId||!['done','skipped'].includes(fresh.transcriptStatus??''))throw new Error('BENCHMARK_TRANSCRIPT_PROJECTION_MISSING');
     return {status:fresh.transcriptStatus==='done'?'done' as const:'skipped' as const,transcript:fresh.transcript};
    }
    if(['failed','blocked','waiting_user','unknown_result','cancelled','paused','pause_requested','cancel_requested'].includes(task.status)||Date.now()>=expires)throw new BenchmarkTranscriptionPending(mapped.aiTaskId,mapped.executionTaskId);
    await new Promise(resolve=>setTimeout(resolve,250));
   }
   throw new BenchmarkTranscriptionPending(mapped.aiTaskId,mapped.executionTaskId);
  },
  async recoverQueued(){
   const rows=await db.select().from(aiTasks).where(and(eq(aiTasks.taskType,'benchmark.transcribe'),eq(aiTasks.status,'queued'),isNull(aiTasks.executionTaskId))).orderBy(asc(aiTasks.requestedAt));
   for(const row of rows){if(shutdown.signal.aborted)return;try{await prepare({userId:row.userId,groupId:row.groupId??undefined,accountId:row.accountId,membershipVersion:row.membershipVersion??undefined,groupVersion:row.groupVersion??undefined,requestId:`benchmark-recover:${row.id}`,source:'user'},row.id);}catch{/* 保留原任务及冻结输入供诊断，不另造任务。 */}}
  },
  async drain(maxTasks=10){let count=0;while(!shutdown.signal.aborted&&count<maxTasks){const claim=await tasks.claimNext({kinds:['ai_task'],executionMode:'benchmark.transcribe',workerId:`benchmark-asr-drain:${randomUUID()}`,leaseSeconds:300});if(!claim)break;await track(claim.task.id,()=>consume(claim));count++;}return count;},
  async stop(){shutdown.abort();await supervision.stop();await Promise.allSettled([...runs.values()]);},
 };
 return service;
}
