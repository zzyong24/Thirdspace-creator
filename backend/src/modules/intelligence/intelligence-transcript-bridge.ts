import {transcribePreparationError} from "../execution/transcribe-stage-error";
import {isDeepStrictEqual} from 'node:util';
import {and,eq,executionTasks,executionCalls,itemTranscripts,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {isContinuousExecutionBudget,transcribeTaskInputSchema,workerPortInputSchemas,type ExecutionRef} from '@creatoros/contract/execution-worker';
import {createClaimedWorkerSupervision} from '../execution/claimed-worker-supervision';
import {createExecutionLeaseService} from '../execution/execution-lease.service';
import {createExecutionCallLedgerService} from '../execution/execution-call-ledger.service';
import {createExecutionWorkerOutcomeService} from '../execution/execution-worker-outcome.service';
import {createExecutionAsrPorts} from '../execution/execution-asr-ports.service';
import {createExecutionTranscribeAudioService} from '../execution/execution-transcribe-audio.service';
import {createExecutionTranscribePreparationService} from '../execution/execution-transcribe-preparation.service';
import {readTranscribeAsrPlan} from '../execution/transcribe-asr-plan';
import {bindIntelligenceTranscript} from './transcript-execution-binding';
import {transcribeConfiguration} from '../ai-runtime/transcribe-business-execution.service';
import {IntelligenceGenerationSuspended} from './topic-preview-runner';
import type {PersistentTaskService} from '../execution/persistent-task.service';
import type {IntelligenceTranscriptPort} from './transcript-runner';

type PreparationDeps=Parameters<typeof createExecutionTranscribePreparationService>[1];
export interface IntelligenceTranscriptBridgeDeps {
 entryPath:string|(()=>string);
 tasks:Pick<PersistentTaskService,'heartbeat'>;
 budget:{maxCalls:number;maxTokens:number;deadlineMs:number};
 objectStorageForCtx:Parameters<typeof createExecutionTranscribeAudioService>[1]['objectStorageForCtx'];
 resolveSpec:PreparationDeps['resolveSpec'];
 prepareSpec:PreparationDeps['prepareSpec'];
 /** 保留实际来源读取及抽音服务；端口必须接受当前账号并使用传入取消信号。 */
 readSource(ctx:RequestContext,awemeId:string,signal:AbortSignal):Promise<{kind:'image-album'}|{kind:'video';playUrl:string}>;
 extractAudio(playUrl:string,signal:AbortSignal):Promise<Uint8Array>;
 now?:()=>string;
}
/** 沿原 transcript claim 调度 ASR；原 runner 负责业务逐字稿及任务终态投影。 */
export function createIntelligenceTranscriptBridge(db:Db,deps:IntelligenceTranscriptBridgeDeps){
 const supervision=createClaimedWorkerSupervision(deps),leases=createExecutionLeaseService(db,deps);
 const ledger=createExecutionCallLedgerService(db,deps),asr=createExecutionAsrPorts(db,deps);
 const audio=createExecutionTranscribeAudioService(db,deps),preparation=createExecutionTranscribePreparationService(db,{...deps,audio,asr});
 const outcomes=createExecutionWorkerOutcomeService(db,{...deps,allowedKinds:['transcribe']});
 type Result=Awaited<ReturnType<IntelligenceTranscriptPort['transcribe']>>;
 const skipped=(reason:string):Result=>({text:null,provider:null,model:null,language:'zh',skippedReason:reason});
 const transcript:IntelligenceTranscriptPort={async transcribe(ctx,target,claim){
  if(!claim)throw new Error('INTELLIGENCE_TRANSCRIPT_CLAIM_REQUIRED');
  const ref:ExecutionRef={executionTaskId:claim.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const verify=()=>leases.withLease(ref,'admission',async scope=>{
   if(scope.context.userId!==ctx.userId||scope.context.accountId!==ctx.accountId)throw new Error('INTELLIGENCE_TRANSCRIPT_OWNER_MISMATCH');
   const bound=await bindIntelligenceTranscript(scope);
   if(bound.item.id!==target.itemId||bound.item.canonicalUrl!==target.canonicalUrl||bound.item.externalId!==target.externalId)throw new Error('INTELLIGENCE_TRANSCRIPT_SOURCE_CHANGED');
   return {...bound,task:scope.task};
  });
  const projectFailure=async(status:string)=>{
   if(status!=='failed'&&status!=='waiting_user'&&status!=='unknown_result')return;
   await leases.withLease(ref,'settlement',async scope=>{
    const bound=await bindIntelligenceTranscript(scope);if(scope.task.status!==status)return;
    const stamp=(deps.now??(()=>new Date().toISOString()))(),retained=!!bound.transcript.text?.trim();
    await scope.tx.update(itemTranscripts).set({status:retained?'done':status==='failed'?'failed':'blocked',errorCode:status==='unknown_result'?'TRANSCRIBE_RESULT_UNCONFIRMED':'TRANSCRIBE_FAILED',completedAt:stamp,updatedAt:stamp}).where(and(eq(itemTranscripts.itemId,bound.item.id),eq(itemTranscripts.executionTaskId,scope.task.id)));
   });
  };
  let persistedStatus:string|undefined,completed:Result|undefined,closed=false,preparationError:unknown;
  let originalDeadlineAt:number|null=null;
  let readResult:(()=>Promise<Result|undefined>)|undefined;
  const controller=new AbortController();
  try {
   if(supervision.isStopping())throw new Error('INTELLIGENCE_TRANSCRIPT_STOPPING');
   const initial=await verify(),awemeId=initial.awemeId;
   if(!awemeId)return skipped('NO_AUDIO_SOURCE');
   let payload=initial.task.payload as Record<string,unknown>;
   if(!payload.modelInput){
    const configuration=transcribeConfiguration(await deps.resolveSpec(ctx,{ref}));
    const input=transcribeTaskInputSchema.parse({kind:'transcribe.douyin',awemeIds:[awemeId],language:'zh',configuration});
    await leases.withLease(ref,'admission',async scope=>{
     const bound=await bindIntelligenceTranscript(scope);if(bound.awemeId!==awemeId)throw new Error('INTELLIGENCE_TRANSCRIPT_SOURCE_CHANGED');
     const current=scope.task.payload as Record<string,unknown>;
     if(!current.modelInput){
      if((await scope.tx.select({id:executionCalls.id}).from(executionCalls).where(eq(executionCalls.executionTaskId,scope.task.id)).limit(1)).length)throw new Error('INTELLIGENCE_TRANSCRIPT_PLAN_MISSING');
      await scope.tx.update(executionTasks).set({payload:{...current,modelInput:input},...(scope.task.deadlineAt===null&&!isContinuousExecutionBudget(scope.task.executionBudget)?{deadlineAt:new Date(Date.parse((deps.now??(()=>new Date().toISOString()))())+deps.budget.deadlineMs).toISOString()}: {})}).where(eq(executionTasks.id,scope.task.id));
     }
    });
   }
   payload=(await verify()).task.payload as Record<string,unknown>;
   const input=transcribeTaskInputSchema.parse(payload.modelInput);
   if(!isDeepStrictEqual(input.awemeIds,[awemeId]))throw new Error('INTELLIGENCE_TRANSCRIPT_PLAN_CHANGED');
   await ledger.initializeBudget(ref);
   readResult=async():Promise<Result|undefined>=>{
    const current=(await verify()).task.payload as Record<string,unknown>;
    if(current.intelligenceTranscriptSkip==='IMAGE_ALBUM')return skipped('IMAGE_ALBUM');
    if(!readTranscribeAsrPlan(current,awemeId).plan)return undefined;
    const receipt=await asr.read(ref,{awemeId});
    const mode=receipt?.identity.protocol==='whisper-local.v1'?'whisper-local':input.configuration.displayModelKey==='channel-managed'?'channel-managed':'configured-cloud';
    return receipt?.result.text.trim()?{text:receipt.result.text,provider:mode,model:mode,language:receipt.identity.language}:undefined;
   };
   completed=await readResult();if(completed)return completed;
   const state=await ledger.inspect(ref);
   originalDeadlineAt=state.deadlineAt===null?null:Date.parse(state.deadlineAt);
   const outcome=await supervision.run({ref,deadlineAt:state.deadlineAt===null?null:Date.parse(state.deadlineAt),verify,isClosed:()=>closed,close:()=>{closed=true;controller.abort();},hasDurableOutcome:()=>completed!==undefined||persistedStatus!==undefined,ports:{
    async validate(current,mode){if(closed||!isDeepStrictEqual(ref,current))throw new Error('INTELLIGENCE_TRANSCRIPT_PORT_CLOSED');await leases.withLease(ref,mode,async()=>{});},
    async invoke(_ref,port,raw){
     if(port==='readTaskContext'){await verify();return input;}
     if(port==='heartbeat'){await verify();return deps.tasks.heartbeat({taskId:ref.executionTaskId,workerId:claim.lease.workerId,attempt:ref.attempt,leaseSeconds:300});}
     if(port==='prepareTranscribeItem'){
      if(workerPortInputSchemas.prepareTranscribeItem.parse(raw).awemeId!==awemeId)throw new Error('INTELLIGENCE_TRANSCRIPT_ITEM_MISMATCH');
      const current=(await verify()).task.payload as Record<string,unknown>;
      if(current.intelligenceTranscriptSkip==='IMAGE_ALBUM')return {skippedReason:'IMAGE_ALBUM'};
      if((await audio.read(ref,{awemeId},controller.signal)).status==='missing'){
       const source=await deps.readSource(ctx,awemeId,controller.signal).catch(error=>{preparationError=error;throw error;});controller.signal.throwIfAborted();await verify();
       if(source.kind==='image-album'){
        await leases.withLease(ref,'admission',async scope=>{await bindIntelligenceTranscript(scope);await scope.tx.update(executionTasks).set({payload:{...scope.task.payload as Record<string,unknown>,intelligenceTranscriptSkip:'IMAGE_ALBUM'}}).where(eq(executionTasks.id,scope.task.id));});
        return {skippedReason:'IMAGE_ALBUM'};
       }
       const bytes=await deps.extractAudio(source.playUrl,controller.signal).catch(error=>{preparationError=error;throw error;});controller.signal.throwIfAborted();await verify();
       await audio.save(ref,{awemeId,bytes},controller.signal);
      }
      return {skippedReason:null};
     }
     if(port==='readTranscribeAudio')return audio.read(ref,raw,controller.signal);
     if(port==='prepareTranscribeAsr'){const request=workerPortInputSchemas.prepareTranscribeAsr.parse(raw);return preparation.prepare(ref,request.awemeId,controller.signal).catch(error=>{preparationError=error;throw error;});}
     if(['reserveAsrRequest','startAsrRequest','settleAsrRequest','selectTranscribeLocalFallback'].includes(port))return asr.invoke(ref,port,raw);
     if(port==='completeTranscribeTask'){
      workerPortInputSchemas.completeTranscribeTask.parse(raw);completed=await readResult!();
      if(!completed)throw new Error('INTELLIGENCE_TRANSCRIPT_RECEIPT_MISSING');closed=true;return {status:'succeeded'};
     }
     if(port==='commitResult'){
      const request=workerPortInputSchemas.commitResult.parse(raw);if(request.outcome==='succeeded')throw new Error('INTELLIGENCE_TRANSCRIPT_RECEIPT_REQUIRED');
      if(!(await ledger.inspect(ref)).calls.length){closed=true;return {status:'failed'};}
      const result=await outcomes.recordFailure(ref,request);persistedStatus=result.status;await projectFailure(result.status);closed=true;return result;
     }
     throw new Error('INTELLIGENCE_TRANSCRIPT_PORT_UNAVAILABLE');
    },
   }});
   if(persistedStatus)throw new IntelligenceGenerationSuspended(ref.executionTaskId,ref.attempt,ref.fenceToken,persistedStatus);
   if(outcome!=='completed'||!completed)throw new Error('INTELLIGENCE_TRANSCRIPT_WORKER_INCOMPLETE');
   return completed;
  } catch(error){
   if(error instanceof IntelligenceGenerationSuspended)throw error;
   if(!persistedStatus&&readResult){try{const receipt=await readResult();if(receipt)return receipt;}catch{/* 只回放仍获原 claim 授权的完整回执。 */}}
   let status=persistedStatus??'recovery_pending',unstarted=false;
   try {
    const task=await leases.withLease(ref,'settlement',async scope=>{await bindIntelligenceTranscript(scope);return scope.task;});status=task.status;
    if(task.status==='running'&&!supervision.isStopping()){
     const state=await ledger.inspect(ref);
     if(!state.calls.length)unstarted=true;
     else {
      const unknown=state.calls.some(call=>call.status==='started'||call.status==='unknown');
      const result=await outcomes.recordFailure(ref,{outcome:unknown?'unknown_result':state.calls.at(-1)?.status==='rejected'?'waiting_user':'failed',errorCode:unknown?'INTELLIGENCE_ASR_REQUIRES_RECONCILIATION':'INTELLIGENCE_ASR_WORKER_INTERRUPTED'});status=result.status;await projectFailure(result.status);
     }
    }
   } catch {/* fence 失效/DB 不可用时交还原持久恢复，不覆盖原任务。 */}
   if(unstarted)throw transcribePreparationError(preparationError??error,controller.signal,originalDeadlineAt);
   throw new IntelligenceGenerationSuspended(ref.executionTaskId,ref.attempt,ref.fenceToken,status);
  } finally {closed=true;controller.abort();}
 }};
 return {transcript,stop:supervision.stop};
}
