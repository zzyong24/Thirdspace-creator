import {z} from 'zod';
import type {runTranscribeInWorker} from './transcribe-worker-run';
import {runTranscribeAsrInWorker} from './transcribe-asr-run';
import {createTranscribeAsrRegistry} from './transcribe-asr-registry';
import {GenerationFailure} from './generation-error';

/** 只执行已冻结的单资源 ASR 阶段，不写作品/项目产物或任务终态。 */
export const runBoundAsrStageInWorker:typeof runTranscribeInWorker=async(input,signal,call)=>{
  if(input.awemeIds.length!==1)throw new GenerationFailure('failed','BOUND_ASR_INPUT_INVALID');
  const awemeId=input.awemeIds[0]!;
  const source=z.object({skippedReason:z.string().nullable()}).strict().parse(await call('prepareTranscribeItem',{awemeId},signal));
  if(!source.skippedReason){
   try{await runTranscribeAsrInWorker(awemeId,signal,call,createTranscribeAsrRegistry());}
   catch(error){if(error instanceof Error&&error.name==='AsrExecutionInterruption')throw new GenerationFailure('unknown_result','BOUND_ASR_RESULT_UNKNOWN');throw error;}
  }
  signal.throwIfAborted();
  return z.object({status:z.literal('succeeded')}).strict().parse(await call('completeTranscribeTask',{},signal));
 };
