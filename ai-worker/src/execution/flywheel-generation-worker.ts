import {z} from 'zod';
import {workerReservationSchema,workerStartReceiptSchema,type WorkerPort,type structuredGenerationInputSchema,type workerModelSpecSchema} from '@creatoros/contract/execution-worker';
import {createDurableGenerationModel} from './durable-generation-model';
import {GenerationFailure,generationFailure} from './generation-error';
import {modelFor} from '../runtime/provider-factory';
import {runWithEffectiveSkillSnapshot,getEffectiveTemplate} from '../prompt/effective-skill-runtime';
import {runStructuredNode} from '../nodes/structured-node';
import {benchmarkTeardownSchema} from '../prompt/templates/benchmark-teardown';

/** 只执行后端冻结的对标拆解能力；不接任意模板、脚本或工具。 */
export async function generateFlywheelInWorker(input:z.infer<typeof structuredGenerationInputSchema>,spec:z.infer<typeof workerModelSpecSchema>,signal:AbortSignal,call:(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>){
 if(input.capability!=='benchmark.teardown'||input.skillId!=='benchmark.teardown')throw new GenerationFailure('failed','FLYWHEEL_CAPABILITY_INVALID');
 let lastCallId:string|undefined;
 const model=createDurableGenerationModel({model:modelFor(spec),operationKey:input.operationKey,signal,ports:{
  async reserve(request){const value=workerReservationSchema.parse(await call('reserveGenerationCall',JSON.parse(JSON.stringify(request)),signal));lastCallId=value.callId;return value;},
  async start(callId){const value=workerStartReceiptSchema.parse(await call('startCall',{callId},signal));if(value.callId!==callId)throw new GenerationFailure('unknown_result','FLYWHEEL_START_RECEIPT_UNKNOWN');},
  async settle(callId,value){await call('settleGenerationCall',{callId,...value});},
 }});
 try{
  const value=await runWithEffectiveSkillSnapshot(input.skillSnapshot,async()=>benchmarkTeardownSchema.parse((await runStructuredNode({model,template:getEffectiveTemplate('benchmark.teardown'),facets:input.facets,maxOutputTokens:input.maxOutputTokens,maxRetries:0,signal})).object));
  signal.throwIfAborted();if(!lastCallId)throw new GenerationFailure('unknown_result','FLYWHEEL_CALL_MISSING');
  const text=JSON.stringify(value);await call('saveGenerationResult',{callId:lastCallId,text},signal);return {callId:lastCallId,text};
 }catch(error){signal.throwIfAborted();if(error instanceof GenerationFailure)throw error;throw generationFailure(error,false);}
}
