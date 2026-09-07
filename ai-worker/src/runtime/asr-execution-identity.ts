import {createHash} from 'node:crypto';
import {asrIdentitySchema} from '@creatoros/contract/execution-worker';
import type {MultimodalSpec} from './multimodal-factory';
import {transcriptionsUrl} from './multimodal-openai-asr';
import {completionsUrl as qwenUrl} from './multimodal-qwen-asr';
import {completionsUrl as mimoUrl} from './multimodal-mimo-asr';
import {whisperLevelFromSpec,whisperModelId} from './multimodal-whisper-local';
/** 复用实际适配器的地址解析；只描述真实执行身份，不读取或保存凭据。 */
export function asrExecutionIdentity(spec:MultimodalSpec,language:string|null){
 if(spec.provider==='whisper-local')return asrIdentitySchema.parse({protocol:'whisper-local.v1',provider:spec.provider,model:whisperModelId(whisperLevelFromSpec(spec)),endpointDigest:null,language});
 let protocol:string,endpoint:string;
 switch(spec.provider){
  case 'qwen':case 'qwen-asr':protocol='qwen-chat-audio.v1';endpoint=qwenUrl(spec);break;
  case 'xiaomi-mimo':protocol='mimo-chat-audio.v1';endpoint=mimoUrl(spec);break;
  case 'openai':case 'siliconflow':case 'groq':protocol='openai-audio-transcriptions.v1';endpoint=transcriptionsUrl(spec);break;
  default:throw new Error('当前转写供应商没有已注册适配器');
 }
 return asrIdentitySchema.parse({protocol,provider:spec.provider,model:spec.model,endpointDigest:`sha256:${createHash('sha256').update(endpoint).digest('hex')}`,language});
}
