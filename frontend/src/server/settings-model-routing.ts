import type {ModelRouteMode} from '@creatoros/contract/execution-worker';
/** 固定协议映射，与业务 adapter 的 mode/capability 对齐，不按文案猜能力。 */
export function modelTestRoute(capability:string):{mode:ModelRouteMode;capability:string}{
 switch(capability){
  case 'default':return {mode:'text',capability:'copilot.assist'};
  case 'script.review':return {mode:'structured',capability:'default'};
  case 'chat.fallback':return {mode:'text',capability};
  case 'asset.classify':return {mode:'vision',capability};
  case 'image.generate':return {mode:'image',capability};
  case 'video.generate':return {mode:'video',capability};
  case 'transcribe.audio':return {mode:'asr',capability};
  default:throw new Error('MODEL_TEST_ROUTE_UNSUPPORTED');
 }
}
/** 已选择非API通路；中性未验证，不能另测一个API或声称连通。 */
export class ModelProbeNotApplicable extends Error {
 constructor(readonly reason:'codex'|'audio-task'){super('MODEL_PROBE_NOT_APPLICABLE');}
}
