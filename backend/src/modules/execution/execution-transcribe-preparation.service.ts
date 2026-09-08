import type {z} from 'zod';
import {readTranscribeAsrPlan} from './transcribe-asr-plan';
import type {createExecutionAsrPorts} from './execution-asr-ports.service';
import {isDeepStrictEqual} from 'node:util';
import {eq,executionTasks,executionCalls,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {transcribeAsrPreparationSchema,transcribeTaskInputSchema,transcribeAsrPlanSchema,transcribeAudioReceiptSchema,type ExecutionRef} from '@creatoros/contract/execution-worker';
import {asrExecutionIdentity} from '@creatoros/ai-worker/asr-identity';
import {localWhisperSpec,isAsrExecutionControlError,type MultimodalSpec} from '@creatoros/ai-worker';
import {transcribeConfiguration} from '../ai-runtime/transcribe-business-execution.service';
import {awaitPreparation} from './await-preparation';
import {createExecutionLeaseService} from './execution-lease.service';
import {createExecutionTranscribeAudioService} from './execution-transcribe-audio.service';
import {bindTranscribeAudioExecution,type TranscribeResourceBinding,type TranscribeExecutionScope} from './transcribe-execution-binding';
import {ConflictError} from './execution.errors';
/** 凭据仅返回当前调用；音频与实际身份在原任务行锁下首次冻结。 */
export function createExecutionTranscribePreparationService(db:Db,deps:{
 audio:ReturnType<typeof createExecutionTranscribeAudioService>;asr:Pick<ReturnType<typeof createExecutionAsrPorts>,'read'|'recoverLocalFallback'>;now?:()=>string;bindResource?:TranscribeResourceBinding;
 resolveSpec(ctx:RequestContext):Promise<MultimodalSpec>;
 prepareSpec(ctx:RequestContext,spec:MultimodalSpec,input:{audioBytes:Uint8Array;intentId:string}):Promise<MultimodalSpec>;
}){
 const leases=createExecutionLeaseService(db,deps);
 async function read(scope:TranscribeExecutionScope,awemeId:string){
  const bound=await (deps.bindResource??bindTranscribeAudioExecution)(scope,awemeId),input=transcribeTaskInputSchema.parse(deps.bindResource?bound.input:bound.payload.modelInput);
  const {plans,plan}=readTranscribeAsrPlan(bound.payload,awemeId);
  if(!plan){
   const calls=await scope.tx.select({operationKey:executionCalls.operationKey}).from(executionCalls).where(eq(executionCalls.executionTaskId,scope.task.id));
   if(calls.some(call=>call.operationKey.startsWith(`transcribe:${awemeId}/asr/`)||call.operationKey.startsWith(`transcribe:${awemeId}/local-asr/`)))throw new ConflictError('已有识别调用缺少原选择，不能重新申请凭据');
  }
  return {...bound,input,plans,plan};
 }
 const service={
  async prepare(ref:ExecutionRef,awemeId:string,signal?:AbortSignal):Promise<z.infer<typeof transcribeAsrPreparationSchema>>{
   const abort=signal??new AbortController().signal;abort.throwIfAborted();
   const initial=await leases.withLease(ref,'admission',async scope=>({...await read(scope,awemeId),context:scope.context}));
   if(initial.plan){const restored=await deps.asr.read(ref,{awemeId});abort.throwIfAborted();if(restored){if(!isDeepStrictEqual(restored.identity,initial.plan.identity))throw new ConflictError('恢复期间识别身份已改变');return {status:'restored' as const,plan:initial.plan,result:restored.result};}}
   if(initial.plan&&initial.plan.identity.protocol!=='whisper-local.v1'&&await deps.asr.recoverLocalFallback(ref,{awemeId})){abort.throwIfAborted();return service.prepare(ref,awemeId,abort);}
   const audio=await deps.audio.read(ref,{awemeId},abort);if(audio.status!=='ready')throw new ConflictError('识别准备需要已保存原音频');
   if(initial.plan&&(initial.plan.audioDigest!==audio.audioDigest||initial.plan.audioByteLength!==audio.audioByteLength))throw new ConflictError('原音频与已选执行不同');
   let spec:MultimodalSpec;
   if(initial.plan?.identity.protocol==='whisper-local.v1'||(!initial.plan&&initial.input.configuration.provider==='whisper-local'))spec=localWhisperSpec();
   else {
    try {spec=await awaitPreparation(()=>deps.resolveSpec(initial.context),abort);}
    catch(error){abort.throwIfAborted();if(initial.plan||isAsrExecutionControlError(error))throw error;spec=localWhisperSpec();}
    if(spec.provider!=='whisper-local'){
     if(!isDeepStrictEqual(transcribeConfiguration(spec),initial.input.configuration))throw new ConflictError('模型配置已变化，不能替换原转写执行');
     await leases.withLease(ref,'admission',async scope=>{abort.throwIfAborted();const current=await read(scope,awemeId);if(!isDeepStrictEqual(current.input,initial.input)||!isDeepStrictEqual(current.plan,initial.plan))throw new ConflictError('申请凭据前原执行选择已变化');});
     spec=await awaitPreparation(()=>deps.prepareSpec(initial.context,spec,{audioBytes:audio.bytes,intentId:`task:${initial.credentialIntentId}:aweme:${awemeId}`}),abort);
     if(spec.provider!=='whisper-local'&&!isDeepStrictEqual(transcribeConfiguration(spec),initial.input.configuration))throw new ConflictError('按次凭据与冻结配置不符');
    }
    if(spec.provider==='whisper-local')spec=localWhisperSpec();
   }
   abort.throwIfAborted();
   let identity:ReturnType<typeof asrExecutionIdentity>;
   try {identity=asrExecutionIdentity(spec,initial.input.language);}
   catch(error){if(initial.plan)throw error;spec=localWhisperSpec();identity=asrExecutionIdentity(spec,initial.input.language);}
   const plan=transcribeAsrPlanSchema.parse({schemaVersion:1,identity,audioDigest:audio.audioDigest,audioByteLength:audio.audioByteLength});
   if(initial.plan&&!isDeepStrictEqual(initial.plan,plan))throw new ConflictError('不能改换已冻结的实际转写身份');
   await leases.withLease(ref,'admission',async scope=>{
    abort.throwIfAborted();const current=await read(scope,awemeId);
    const currentAudio=transcribeAudioReceiptSchema.parse((current.payload.transcribeAudioInputs as Record<string,unknown>)?.[awemeId]);
    if(currentAudio.state!=='ready'||currentAudio.audioDigest!==plan.audioDigest||currentAudio.audioByteLength!==plan.audioByteLength)throw new ConflictError('准备期间原音频已改变');
    if(!isDeepStrictEqual(current.input,initial.input))throw new ConflictError('转写配置准备期间发生变化');
    if(current.plan){if(!isDeepStrictEqual(current.plan,plan))throw new ConflictError('另一执行已固定不同识别身份');return;}
    const calls=await scope.tx.select({operationKey:executionCalls.operationKey}).from(executionCalls).where(eq(executionCalls.executionTaskId,scope.task.id));
    if(calls.some(call=>call.operationKey.startsWith(`transcribe:${awemeId}/asr/`)||call.operationKey.startsWith(`transcribe:${awemeId}/local-asr/`)))throw new ConflictError('已有识别调用不能补选新身份');
    await scope.tx.update(executionTasks).set({payload:{...current.payload,transcribeAsrPlans:{...current.plans,[awemeId]:plan}}}).where(eq(executionTasks.id,scope.task.id));
   });
   abort.throwIfAborted();return {status:'prepared' as const,plan,spec:{...transcribeConfiguration(spec),token:spec.token}};
  },
 };
 return service;
}
