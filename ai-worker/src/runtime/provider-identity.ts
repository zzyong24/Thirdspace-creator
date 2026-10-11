import type {CodexModelSpec} from '@creatoros/contract/execution-worker';
/** modelFor 的非秘密协议身份投影；测试用真实 SDK 请求捕获覆盖全部分支。 */
export function providerIdentityFor(spec: {
  apiFormat: "anthropic" | "openai_chat" | "openai_responses";
  customEndpoint: boolean;
  model: string;
  displayModelKey?: "channel-managed";
}|CodexModelSpec) {
  if("engine" in spec)return {modelId:spec.requestedModel??"codex-default",provider:"codex-app-server"};
  if (spec.displayModelKey === "channel-managed")
    return { modelId: "channel-managed", provider: "channel-managed" };
  const provider =
    spec.apiFormat === "anthropic"
      ? "anthropic.messages"
      : `${spec.customEndpoint ? "creatoros-custom" : "openai"}.${spec.apiFormat === "openai_chat" ? "chat" : "responses"}`;
  return { modelId: spec.model, provider };
}

/** 与 modelFor 共用端点能力选择；只使用非秘密配置。 */
export function structuredModeForIdentity(spec:{apiFormat:"anthropic"|"openai_chat"|"openai_responses";customEndpoint:boolean;structuredOutputs?:boolean}|CodexModelSpec):"native"|"text" {
 if("engine" in spec)return "native";
 return spec.apiFormat==="openai_chat" && spec.customEndpoint ? (spec.structuredOutputs===true?"native":"text") : (spec.structuredOutputs===false?"text":"native");
}
