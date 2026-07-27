import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModel, LanguageModel } from "ai";

// Provider 工厂(Phase 3)—— 把「一次运行解析出来的模型配置」变成一个 AI SDK LanguageModel。
// 这是「模型中立层」的落点:换厂商 = 换 apiFormat/baseUrl/token,不动 AgentRuntime,也不绑
// 任何厂商 SDK 的业务调用。用户自带 key + 自定义 baseURL(relay / MiniMax / DeepSeek)全支持。
//
// 协议族(apiFormat)而非厂商名做开关:加一个 OpenAI 兼容端点 = 配 baseUrl,不改代码。
//   - anthropic  → @ai-sdk/anthropic(官方端点或 relay baseURL)
//   - openai_chat → 显式 Chat Completions(不依赖 provider 默认 callable,防 SDK 升级漂移)
//   - openai_responses → @ai-sdk/openai Responses(官方或 New API/relay 自定义 baseURL)

export type ApiFormat =
  | "anthropic"
  | "openai_chat"
  | "openai_responses";

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

/**
 * 统一 anthropic baseURL 约定 —— 与旧 @anthropic-ai/sdk 路径共用同一份模型配置。
 * 旧 SDK 给 baseURL `…/anthropic` 会自己补 `/v1/messages`;而 @ai-sdk/anthropic 只补 `/messages`
 * (它默认 baseURL 本身已含 `/v1`)。若不归一,同一条 `…/anthropic` 配置在新路径会缺 `/v1` → 404。
 * 这里把缺版本段(/vN)的 anthropic baseURL 补上 `/v1`,用户只配 `…/anthropic` 两条 SDK 路径都通。
 */
export function normalizeAnthropicBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

/** 把 ModelSpec 解析成一个可直接喂给 runAgentNode 的 LanguageModel。 */
export function modelFor(spec: ModelSpec): LanguageModel {
  if (spec.apiFormat === "anthropic") {
    const provider = createAnthropic({
      apiKey: spec.token,
      ...(spec.baseUrl
        ? { baseURL: normalizeAnthropicBaseUrl(spec.baseUrl) }
        : {}),
    });
    return provider(spec.model);
  }
  if (spec.apiFormat === "openai_responses") {
    const provider = createOpenAI({
      apiKey: spec.token,
      ...(spec.baseUrl
        ? { baseURL: spec.baseUrl, name: "creatoros-custom" }
        : {}),
    });
    return provider.responses(spec.model);
  }
  // openai_chat:两条路径都显式选 Chat,不能再用 createOpenAI()(model)——
  // @ai-sdk/openai 4 的默认 callable 已是 Responses,会让同一配置因 baseUrl 有无而分叉。
  if (spec.baseUrl) {
    const provider = createOpenAICompatible({
      name: "creatoros-custom",
      apiKey: spec.token,
      baseURL: spec.baseUrl,
    });
    return provider.chatModel(spec.model);
  }
  const provider = createOpenAI({ apiKey: spec.token });
  return provider.chat(spec.model);
}

/**
 * [T-093] 把 ModelSpec 解析成一个 AI SDK EmbeddingModel(与文本 `modelFor` 并列,
 * 供 `embed`/`embedMany` 直用)。协议族开关同 modelFor:
 *   - openai_chat/openai_responses + baseUrl → openai-compatible 的 textEmbeddingModel(SiliconFlow/
 *     DeepSeek/任意 OpenAI 兼容 embedding 端点);
 *   - openai_chat 无 baseUrl → 官方 OpenAI textEmbeddingModel;
 *   - anthropic → 诚实抛错(Anthropic Messages 协议不提供 embedding 端点;调用方
 *     应引导用户为该 capability 配 OpenAI 兼容 embedding 模型,不静默降级成聊天模型)。
 */
export function embeddingModelFor(spec: ModelSpec): EmbeddingModel {
  if (spec.apiFormat === "anthropic") {
    throw new Error(
      "anthropic 协议不提供 embedding 端点:请为该 capability 配置 openai_chat 协议的 embedding 模型(如 SiliconFlow BAAI/bge-m3)",
    );
  }
  if (spec.baseUrl) {
    const provider = createOpenAICompatible({
      name: "creatoros-custom-embedding",
      apiKey: spec.token,
      baseURL: spec.baseUrl,
    });
    return provider.textEmbeddingModel(spec.model);
  }
  const provider = createOpenAI({ apiKey: spec.token });
  return provider.textEmbeddingModel(spec.model);
}
