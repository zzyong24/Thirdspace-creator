import type {AsrRequest} from '@creatoros/contract/execution-worker';
import type {GeneratedTranscript} from './multimodal-factory';
/** 按原适配器协议拼接已确认分片，不摘要、改写或选择正文。 */
export function assembleAsrTranscript(identity:Pick<AsrRequest,'protocol'|'language'>,parts:GeneratedTranscript[]):GeneratedTranscript {
 if(!parts.length)throw new Error('识别回执为空');
 if(identity.protocol==='qwen-chat-audio.v1'){
  const language=identity.language?.trim();
  return {text:parts.map(part=>part.text).join('\n'),...(language?{language}:{})};
 }
 if(identity.protocol==='mimo-chat-audio.v1')return {text:parts.map(part=>part.text).join('\n'),...(identity.language==='zh'||identity.language==='en'?{language:identity.language}:{})};
 if(parts.length!==1)throw new Error('单请求识别回执不能有多个分片');
 return {...parts[0]!};
}
