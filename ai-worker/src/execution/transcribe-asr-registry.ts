import {createOpenaiAsrAdapter} from '../runtime/multimodal-openai-asr';
import {createMimoAsrAdapter} from '../runtime/multimodal-mimo-asr';
import {createQwenAsrAdapter} from '../runtime/multimodal-qwen-asr';
import {createDefaultWhisperLocalAdapter} from '../runtime/multimodal-whisper-local';
/** 同一套真实 ASR 适配器，实例只在独立 Worker 内创建。 */
export function createTranscribeAsrRegistry(){
 const openai=createOpenaiAsrAdapter(),mimo=createMimoAsrAdapter(),qwen=createQwenAsrAdapter();
 return {openai,siliconflow:openai,groq:openai,'xiaomi-mimo':mimo,'qwen-asr':qwen,qwen,'whisper-local':createDefaultWhisperLocalAdapter()};
}
