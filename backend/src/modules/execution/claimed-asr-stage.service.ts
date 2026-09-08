import {isDeepStrictEqual} from 'node:util';
import {eq,executionTasks,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {transcribeTaskInputSchema,workerPortInputSchemas,type ExecutionRef} from '@creatoros/contract/execution-worker';
import type {createClaimedWorkerSupervision} from './claimed-worker-supervision';
import type {TranscribeResourceBinding} from './transcribe-execution-binding';
import {createExecutionLeaseService} from './execution-lease.service';
import {createExecutionCallLedgerService} from './execution-call-ledger.service';
import {createExecutionWorkerOutcomeService} from './execution-worker-outcome.service';
import {createExecutionAsrPorts} from './execution-asr-ports.service';
import {createExecutionTranscribeAudioService} from './execution-transcribe-audio.service';
import {createExecutionTranscribePreparationService} from './execution-transcribe-preparation.service';
import {readTranscribeAsrPlan} from './transcribe-asr-plan';

type PreparationDeps=Parameters<typeof createExecutionTranscribePreparationService>[1];
export class ClaimedAsrSuspended extends Error {
 constructor(readonly ref:ExecutionRef,readonly status:string){super('CLAIMED_ASR_SUSPENDED');}
}
export interface ClaimedAsrStageDeps {
 budget:{maxCalls:number;maxTokens:number;deadlineMs:number};now?:()=>string;
 bindResource:TranscribeResourceBinding;
 runWorker:ReturnType<typeof createClaimedWorkerSupervision>['run'];
 objectStorageForCtx:Parameters<typeof createExecutionTranscribeAudioService>[1]['objectStorageForCtx'];
 resolveSpec:PreparationDeps['resolveSpec'];prepareSpec:PreparationDeps['prepareSpec'];
 readSource(ctx:RequestContext,awemeId:string,signal:AbortSignal):Promise<{kind:'image-album'}|{kind:'video';playUrl:string}>;
 extractAudio(playUrl:string,signal:AbortSignal):Promise<Uint8Array>;
}
/** 同一原 claim 内的单资源 ASR 阶段；领域提供冻结资源，监督与终态归调用方。 */
export function createClaimedAsrStageService(db:Db,deps:ClaimedAsrStageDeps){
 const leases=createExecutionLeaseService(db,deps),ledger=createExecutionCallLedgerService(db,deps),outcomes=createExecutionWorkerOutcomeService(db,deps);
 const audio=createExecutionTranscribeAudioService(db,deps),asr=createExecutionAsrPorts(db,deps),preparation=createExecutionTranscribePreparationService(db,{...deps,audio,asr});
 return {async transcribe(ref:ExecutionRef,ctx:RequestContext,awemeId:string,signal:AbortSignal):Promise<string|null>{
  signal.throwIfAborted();
  const controller=new AbortController(),abort=AbortSignal.any([signal,controller.signal]);
  const verify=()=>leases.withLease(ref,'admission',async scope=>{
   abort.throwIfAborted();if(scope.context.userId!==ctx.userId||scope.context.accountId!==ctx.accountId)throw new Error('ASR_RESOURCE_OWNER_MISMATCH');
   const bound=await deps.bindResource(scope,awemeId),input=transcribeTaskInputSchema.parse(bound.input);
   if(!isDeepStrictEqual(input.awemeIds,[awemeId]))throw new Error('ASR_RESOURCE_INPUT_MISMATCH');
   return {...bound,input,task:scope.task};
  });
  let completed:string|null|undefined,closed=false,persisted:string|undefined,sourceError:unknown;
  const readResult=async()=>{
   const {payload}=await verify();
   if((payload.asrSourceSkips as Record<string,unknown>|undefined)?.[awemeId]==='IMAGE_ALBUM')return null;
   if(!readTranscribeAsrPlan(payload,awemeId).plan)return undefined;
   const receipt=await asr.read(ref,{awemeId});return receipt?.result.text.trim()?receipt.result.text:undefined;
  };
  try {
   const initial=await verify();await ledger.initializeBudget(ref);
   completed=await readResult();if(completed!==undefined)return completed;
   const state=await ledger.inspect(ref);
   const reason=await deps.runWorker({ref,deadlineAt:Date.parse(state.deadlineAt!),verify,isClosed:()=>closed,close:()=>{closed=true;},hasDurableOutcome:()=>completed!==undefined||persisted!==undefined,ports:{
    async validate(current,mode){if(closed||!isDeepStrictEqual(current,ref))throw new Error('ASR_STAGE_CLOSED');await leases.withLease(ref,mode,async scope=>{await deps.bindResource(scope,awemeId);});},
    async invoke(_ref,port,raw){
     if(port==='readTaskContext'){await verify();return initial.input;}
     if(port==='heartbeat'){await verify();return {ok:true};}
     if(port==='prepareTranscribeItem'){
      if(workerPortInputSchemas.prepareTranscribeItem.parse(raw).awemeId!==awemeId)throw new Error('ASR_STAGE_ITEM_MISMATCH');
      if((await readResult())===null)return {skippedReason:'IMAGE_ALBUM'};
      if((await audio.read(ref,{awemeId},abort)).status==='missing'){
       const source=await deps.readSource(ctx,awemeId,abort).catch(error=>{sourceError=error;throw error;});await verify();
       if(source.kind==='image-album'){
        await leases.withLease(ref,'admission',async scope=>{const bound=await deps.bindResource(scope,awemeId);await scope.tx.update(executionTasks).set({payload:{...bound.payload,asrSourceSkips:{...bound.payload.asrSourceSkips as Record<string,string>,[awemeId]:'IMAGE_ALBUM'}}}).where(eq(executionTasks.id,scope.task.id));});
        return {skippedReason:'IMAGE_ALBUM'};
       }
       const bytes=await deps.extractAudio(source.playUrl,abort).catch(error=>{sourceError=error;throw error;});await verify();await audio.save(ref,{awemeId,bytes},abort);
      }
      return {skippedReason:null};
     }
     if(port==='readTranscribeAudio')return audio.read(ref,raw,abort);
     if(port==='prepareTranscribeAsr'){const input=workerPortInputSchemas.prepareTranscribeAsr.parse(raw);return preparation.prepare(ref,input.awemeId,abort).catch(error=>{sourceError=error;throw error;});}
     if(['reserveAsrRequest','startAsrRequest','settleAsrRequest','selectTranscribeLocalFallback'].includes(port))return asr.invoke(ref,port,raw);
     if(port==='completeTranscribeTask'){workerPortInputSchemas.completeTranscribeTask.parse(raw);completed=await readResult();if(completed===undefined)throw new Error('ASR_STAGE_RECEIPT_MISSING');closed=true;return {status:'succeeded'};}
     if(port==='commitResult'){
      const request=workerPortInputSchemas.commitResult.parse(raw);if(request.outcome==='succeeded')throw new Error('ASR_STAGE_RECEIPT_REQUIRED');
      const state=await ledger.inspect(ref),own=state.calls.filter(call=>call.operationKey.startsWith(`transcribe:${awemeId}/`));
      if(!own.length){closed=true;return {status:'failed'};}
      const result=await outcomes.recordFailure(ref,request);persisted=result.status;closed=true;return result;
     }
     throw new Error('ASR_STAGE_PORT_UNAVAILABLE');
    },
   }});
   if(persisted)throw new ClaimedAsrSuspended(ref,persisted);
   if(reason!=='completed'||completed===undefined)throw new Error('ASR_STAGE_INCOMPLETE');return completed;
  } catch(error){
   if(error instanceof ClaimedAsrSuspended)throw error;
   if(!persisted){try{const receipt=await readResult();if(receipt!==undefined)return receipt;}catch{/* 只有仍持有原执行权的完整回执可回放。 */}}
   let status=persisted??'recovery_pending',unstarted=false;
   try {
    const task=await leases.withLease(ref,'settlement',async scope=>{await deps.bindResource(scope,awemeId);return scope.task;});status=task.status;
    if(task.status==='running'&&!signal.aborted){
     const state=await ledger.inspect(ref),own=state.calls.filter(call=>call.operationKey.startsWith(`transcribe:${awemeId}/`));
     if(!own.length)unstarted=true;
     else {const unknown=state.calls.some(call=>call.status==='started'||call.status==='unknown');const result=await outcomes.recordFailure(ref,{outcome:unknown?'unknown_result':own.at(-1)?.status==='rejected'?'waiting_user':'failed',errorCode:unknown?'ASR_STAGE_REQUIRES_RECONCILIATION':'ASR_STAGE_INTERRUPTED'});status=result.status;}
    }
   }catch{/* 不替失去 fence 的原作业改终态。 */}
   if(unstarted)throw sourceError??error;
   throw new ClaimedAsrSuspended(ref,status);
  }finally{closed=true;controller.abort();}
 }};
}
