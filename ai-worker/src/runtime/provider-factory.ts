import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

// Provider 工厂(Phase 3)—— 把「一次运行解析出来的模型配置」变成一个 AI SDK LanguageModel。
// 这是「模型中立层」的落点:换厂商 = 换 apiFormat/baseUrl/token,不动 AgentRuntime,也不绑
// 任何厂商 SDK 的业务调用。用户自带 key + 自定义 baseURL(relay / MiniMax / DeepSeek)全支持。
//
// 协议族(apiFormat)而非厂商名做开关:加一个 OpenAI 兼容端点 = 配 baseUrl,不改代码。
//   - anthropic  → @ai-sdk/anthropic(官方端点或 relay baseURL)
//   - openai_chat + baseUrl → @ai-sdk/openai-compatible(DeepSeek / MiniMax / 任意 OpenAI 兼容)
//   - openai_chat 无 baseUrl → @ai-sdk/openai(官方 OpenAI)

export type ApiFormat = "anthropic" | "openai_chat";

/** 一次运行需要的最小模型规格(由上层 resolveLlmConfig 按 capability 解析后投影)。 */
export interface ModelSpec {
  apiFormat: ApiFormat;
  /** 自定义端点(relay / DeepSeek / MiniMax);null = 用该 provider 的官方默认端点。 */
  baseUrl: string | null;
  /** 模型 id,如 "claude-opus-4-8" / "deepseek-chat" / "gpt-4o"。 */
  model: string;
  /** 用户自带的 API key。 */
  token: string;
}

/** 把 ModelSpec 解析成一个可直接喂给 runAgentNode 的 LanguageModel。 */
export function modelFor(spec: ModelSpec): LanguageModel {
  if (spec.apiFormat === "anthropic") {
    const provider = createAnthropic({
      apiKey: spec.token,
      ...(spec.baseUrl ? { baseURL: spec.baseUrl } : {}),
    });
    return provider(spec.model);
  }
  // openai_chat:自定义 baseURL → openai-compatible(覆盖 DeepSeek/MiniMax/relay);
  // 无 baseURL → 官方 OpenAI。
  if (spec.baseUrl) {
    const provider = createOpenAICompatible({
      name: "creatoros-custom",
      apiKey: spec.token,
      baseURL: spec.baseUrl,
    });
    return provider(spec.model);
  }
  const provider = createOpenAI({ apiKey: spec.token });
  return provider(spec.model);
}
