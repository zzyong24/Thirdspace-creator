import {createOpenaiAsrAdapter} from '../runtime/multimodal-openai-asr';
import {createMimoAsrAdapter} from '../runtime/multimodal-mimo-asr';
import {createQwenAsrAdapter} from '../runtime/multimodal-qwen-asr';
import {createDefaultWhisperLocalAdapter} from '../runtime/multimodal-whisper-local';
import type {MultimodalProviderRegistry} from '../runtime/multimodal-factory';
/** 同一套真实 ASR 适配器，实例只在独立 Worker 内创建。 */
export function createTranscribeAsrRegistry(){
 const openai=createOpenaiAsrAdapter(),mimo=createMimoAsrAdapter(),qwen=createQwenAsrAdapter();
 return {openai,siliconflow:openai,groq:openai,'xiaomi-mimo':mimo,'qwen-asr':qwen,qwen,'whisper-local':createDefaultWhisperLocalAdapter()};
}
/** aliases 共用实例只关闭一次；云端无本地资源的适配器无需提供 close。 */
export async function closeTranscribeAsrRegistry(registry:MultimodalProviderRegistry){
 const results=await Promise.allSettled([...new Set(Object.values(registry))].map(adapter=>adapter.close?.()));
 const failures=results.filter((result):result is PromiseRejectedResult=>result.status==='rejected');
 if(failures.length)throw new AggregateError(failures.map(result=>result.reason),'TRANSCRIBE_RESOURCE_CLEANUP_FAILED');
}
