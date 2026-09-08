import {z} from 'zod';
import {workerReservationSchema,workerStartReceiptSchema,type WorkerPort,type structuredGenerationInputSchema,type workerModelSpecSchema} from '@creatoros/contract/execution-worker';
import {createDurableGenerationModel} from './durable-generation-model';
import {GenerationFailure,generationFailure} from './generation-error';
import {modelFor} from '../runtime/provider-factory';
import {runWithEffectiveSkillSnapshot,getEffectiveTemplate} from '../prompt/effective-skill-runtime';
import {runStructuredNode} from '../nodes/structured-node';
import {flywheelOutputSchema} from '../runtime/flywheel-output';
import {runChatStructuredSequence} from './chat-structured-sequence';
import {chatStructuredNodeSchema} from '@creatoros/contract/execution-worker';

/** 只执行后端冻结的对标拆解能力；不接任意模板、脚本或工具。 */
export async function generateFlywheelInWorker(input:z.infer<typeof structuredGenerationInputSchema>,spec:z.infer<typeof workerModelSpecSchema>,signal:AbortSignal,call:(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>){
 if(!['benchmark.teardown','topic.attribution','favorites.triage','knowledge.distill'].includes(input.capability)||input.skillId!==input.capability)throw new GenerationFailure('failed','FLYWHEEL_CAPABILITY_INVALID');
 let lastCallId:string|undefined;
 const model=createDurableGenerationModel({model:modelFor(spec),operationKey:input.operationKey,signal,ports:{
  async reserve(request){const value=workerReservationSchema.parse(await call('reserveGenerationCall',JSON.parse(JSON.stringify(request)),signal));lastCallId=value.callId;return value;},
  async start(callId){const value=workerStartReceiptSchema.parse(await call('startCall',{callId},signal));if(value.callId!==callId)throw new GenerationFailure('unknown_result','FLYWHEEL_START_RECEIPT_UNKNOWN');},
  async settle(callId,value){await call('settleGenerationCall',{callId,...value});},
 }});
 try{
  const value=await runWithEffectiveSkillSnapshot(input.skillSnapshot,async()=>{
   if(input.capability==='knowledge.distill'){
    const node=chatStructuredNodeSchema.parse(JSON.parse(input.facets.__knowledgeNode??'null'));
    if(node.capability!=='knowledge.distill')throw new Error('FLYWHEEL_KNOWLEDGE_INPUT_INVALID');
    const result=await runChatStructuredSequence(node,model,input.maxOutputTokens,signal);
    return flywheelOutputSchema(input.capability).parse({...result.object as object,coverage:{inputChars:node.coverage.inputChars,processedChars:node.coverage.submittedChars,truncatedChars:node.coverage.truncatedChars,chunkCount:node.chunks.length}});
   }
   return flywheelOutputSchema(input.capability).parse((await runStructuredNode({model,template:getEffectiveTemplate(input.capability),facets:input.facets,maxOutputTokens:input.maxOutputTokens,maxRetries:0,signal})).object);
  });
  signal.throwIfAborted();if(!lastCallId)throw new GenerationFailure('unknown_result','FLYWHEEL_CALL_MISSING');
  const text=JSON.stringify(value);await call('saveGenerationResult',{callId:lastCallId,text},signal);return {callId:lastCallId,text};
 }catch(error){signal.throwIfAborted();if(error instanceof GenerationFailure)throw error;throw generationFailure(error,false);}
}
