import {createTranscribeWorkerSource} from "./transcribe-worker-source";
import {z} from 'zod';
import {transcribeItemReceiptSchema,transcribeSourceSchema,type transcribeTaskInputSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import {createTranscribeAudioExtractor} from '../runtime/transcribe-audio-extract';
import {createOpenaiAsrAdapter} from '../runtime/multimodal-openai-asr';
import {createMimoAsrAdapter} from '../runtime/multimodal-mimo-asr';
import {createQwenAsrAdapter} from '../runtime/multimodal-qwen-asr';
import {createDefaultWhisperLocalAdapter} from '../runtime/multimodal-whisper-local';
import {runTranscribeAsrInWorker} from './transcribe-asr-run';
import {runTranscribePostprocessInWorker} from './transcribe-postprocess-run';
import {GenerationFailure} from './generation-error';
type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
const itemState=z.object({receipt:transcribeItemReceiptSchema.nullable(),source:transcribeSourceSchema.nullable()}).strict();
const audio=z.union([z.object({status:z.literal('missing')}).strict(),z.object({status:z.literal('ready'),bytes:z.instanceof(Uint8Array),audioDigest:z.string(),audioByteLength:z.number()}).strict()]);
/** 一件作品只由此处编排：匿名取流/抽音/识别/后处理均在 Worker，事实与终态经原任务端口提交。 */
export async function runTranscribeInWorker(input:z.infer<typeof transcribeTaskInputSchema>,signal:AbortSignal,call:Call){
 const guarded=async<T>(schema:z.ZodType<T>,port:WorkerPort,data:unknown)=>{
  try{const value=schema.parse(await call(port,data,signal));signal.throwIfAborted();return value;}catch{signal.throwIfAborted();throw new GenerationFailure('unknown_result','TRANSCRIBE_HOST_RECEIPT_UNKNOWN');}
 };
 const source=createTranscribeWorkerSource(signal,call);
 const extract=createTranscribeAudioExtractor(),openai=createOpenaiAsrAdapter();
 const mimo=createMimoAsrAdapter(),qwen=createQwenAsrAdapter();
 const registry={openai,siliconflow:openai,groq:openai,'xiaomi-mimo':mimo,'qwen-asr':qwen,qwen,'whisper-local':createDefaultWhisperLocalAdapter()};
 const ack=z.object({ok:z.literal(true)}).strict();
 for(const awemeId of input.awemeIds){
   signal.throwIfAborted();const state=await guarded(itemState,'prepareTranscribeItem',{awemeId});
   if(state.receipt && state.receipt.status!=='failed')continue;
   try{
    const savedAudio=await guarded(audio,'readTranscribeAudio',{awemeId});
    if(savedAudio.status==='missing'){
     let selected=state.source??await source(awemeId);
     await guarded(ack,'recordTranscribeSource',{awemeId,source:{...selected,kind:selected.kind??'video'}});
     if(selected.kind==='image-album'){await guarded(transcribeItemReceiptSchema,'saveTranscribeArtifact',{awemeId});continue;}
     let bytes:Uint8Array;
     try{bytes=await extract(selected.playUrl,signal);}catch(error){
      signal.throwIfAborted();selected=await source(awemeId);if(selected.kind==='image-album')throw error;
      await guarded(ack,'recordTranscribeSource',{awemeId,source:{...selected,kind:'video'}});bytes=await extract(selected.playUrl,signal);
     }
     await guarded(z.object({audioDigest:z.string(),audioByteLength:z.number().positive()}).strict(),'saveTranscribeAudio',{awemeId,bytes});
    }
    await runTranscribeAsrInWorker(awemeId,signal,call,registry);
    await runTranscribePostprocessInWorker(awemeId,signal,call);
    await guarded(transcribeItemReceiptSchema,'saveTranscribeArtifact',{awemeId});
   }catch(error){
    signal.throwIfAborted();
    if(error instanceof GenerationFailure || (error instanceof Error&&error.name==='AsrExecutionInterruption'))throw error instanceof GenerationFailure?error:new GenerationFailure('unknown_result','TRANSCRIBE_ASR_RESULT_UNKNOWN');
    // 普通单作品故障保留已完成子集；后端仍拒绝把在途或未知付费调用报成失败。
    await guarded(transcribeItemReceiptSchema,'failTranscribeItem',{awemeId,error:'该作品取流或转写失败，请检查登录与模型配置后重试'});
   }
  }
  return await guarded(z.object({status:z.enum(['succeeded','failed'])}).strict(),'completeTranscribeTask',{});
}

