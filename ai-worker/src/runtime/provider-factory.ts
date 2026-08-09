import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModelV3, EmbeddingModelV4 } from "@ai-sdk/provider";
import {
  wrapEmbeddingModel,
  wrapLanguageModel,
  type EmbeddingModel,
  type LanguageModel,
} from "ai";

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
  displayModelKey?: "channel-managed";
}

type ChannelEmbeddingInput = EmbeddingModelV3 | EmbeddingModelV4;

export class ModelConfigurationError extends Error {
  constructor() {
    super("模型接口格式配置无效");
    this.name = "ModelConfigurationError";
  }
}

export class ChannelManagedProviderError extends Error {
  constructor() {
    super("渠道模型调用失败，请稍后重试或联系官方处理");
    this.name = "ChannelManagedProviderError";
  }
}

export const MANAGED_AI_CREDIT_EXHAUSTED_MESSAGE =
  "AI 额度不足，请充值后再试。";

/**
 * 受管权益的额度耗尽是一个产品状态，不是“模型配置错误”。这个错误只携带稳定、安全的
 * 用户文案；上游响应正文只用于边界内分类，绝不挂到 cause 或公开字段，避免泄露服务细节。
 */
export class ManagedAiCreditExhaustedError extends Error {
  readonly code = "AI_CREDIT_EXHAUSTED";

  constructor() {
    super(MANAGED_AI_CREDIT_EXHAUSTED_MESSAGE);
    this.name = "ManagedAiCreditExhaustedError";
  }
}

function collectProviderErrorSignals(error: unknown, depth = 0): string[] {
  if (depth > 2 || error == null) return [];
  if (typeof error === "string" || typeof error === "number") {
    return [String(error)];
  }
  if (error instanceof Error) {
    const record = error as Error & {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      responseBody?: unknown;
      body?: unknown;
    };
    return [
      error.name,
      error.message,
      ...collectProviderErrorSignals(record.code, depth + 1),
      ...collectProviderErrorSignals(record.status, depth + 1),
      ...collectProviderErrorSignals(record.statusCode, depth + 1),
      ...collectProviderErrorSignals(record.responseBody, depth + 1),
      ...collectProviderErrorSignals(record.body, depth + 1),
      ...collectProviderErrorSignals(error.cause, depth + 1),
    ];
  }
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    return [
      ...collectProviderErrorSignals(record.code, depth + 1),
      ...collectProviderErrorSignals(record.status, depth + 1),
      ...collectProviderErrorSignals(record.statusCode, depth + 1),
      ...collectProviderErrorSignals(record.message, depth + 1),
      ...collectProviderErrorSignals(record.responseBody, depth + 1),
      ...collectProviderErrorSignals(record.body, depth + 1),
      ...collectProviderErrorSignals(record.error, depth + 1),
      ...collectProviderErrorSignals(record.cause, depth + 1),
    ];
  }
  return [];
}

/** 只识别明确余额语义；普通 429/超时不能被误报成“额度不足”。 */
export function isManagedAiCreditExhaustedError(error: unknown): boolean {
  if (error instanceof ManagedAiCreditExhaustedError) return true;
  const signals = collectProviderErrorSignals(error);
  if (signals.some((value) => value.trim() === "402")) return true;
  return /\bAI_CREDIT_(?:EXHAUSTED|INSUFFICIENT)\b|insufficient[\s_-]*(?:balance|quota|credit)|(?:balance|quota|credit)[\s_-]*(?:exhausted|insufficient|depleted)|\b(?:1008)\b|余额不足|额度不足|积分不足/i.test(
    signals.join(" | "),
  );
}

export function toChannelManagedError(error: unknown): Error {
  return isManagedAiCreditExhaustedError(error)
    ? new ManagedAiCreditExhaustedError()
    : new ChannelManagedProviderError();
}

function sanitizeChannelStream<T>(stream: ReadableStream<T>): ReadableStream<T> {
  const reader = stream.getReader();
  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const item = await reader.read();
        if (item.done) {
          controller.close();
          return;
        }
        const value = item.value;
        if (
          value &&
          typeof value === "object" &&
          (value as { type?: unknown }).type === "error"
        ) {
          controller.enqueue({
            ...(value as Record<string, unknown>),
            error: toChannelManagedError(
              (value as { error?: unknown }).error,
            ),
          } as T);
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(toChannelManagedError(error));
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

export function protectChannelModel(model: LanguageModel): LanguageModel {
  if (typeof model === "string") return model;
  return wrapLanguageModel({
    model,
    modelId: "channel-managed",
    providerId: "channel-managed",
    middleware: {
      wrapGenerate: async ({ doGenerate }) => {
        try {
          return await doGenerate();
        } catch (error) {
          throw toChannelManagedError(error);
        }
      },
      wrapStream: async ({ doStream }) => {
        try {
          const result = await doStream();
          return {
            ...result,
            stream: sanitizeChannelStream(result.stream),
          };
        } catch (error) {
          throw toChannelManagedError(error);
        }
      },
    },
  });
}

export function protectChannelEmbeddingModel(
  model: ChannelEmbeddingInput,
): EmbeddingModelV4 {
  return wrapEmbeddingModel({
    model,
    modelId: "channel-managed",
    providerId: "channel-managed",
    middleware: {
      wrapEmbed: async ({ doEmbed }) => {
        try {
          return await doEmbed();
        } catch (error) {
          throw toChannelManagedError(error);
        }
      },
    },
  });
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
  let model: LanguageModel;
  switch (spec.apiFormat) {
    case "anthropic": {
      const provider = createAnthropic({
        apiKey: spec.token,
        ...(spec.baseUrl
          ? { baseURL: normalizeAnthropicBaseUrl(spec.baseUrl) }
          : {}),
      });
      model = provider(spec.model);
      break;
    }
    case "openai_responses": {
      const provider = createOpenAI({
        apiKey: spec.token,
        ...(spec.baseUrl
          ? { baseURL: spec.baseUrl, name: "creatoros-custom" }
          : {}),
      });
      model = provider.responses(spec.model);
      break;
    }
    case "openai_chat": {
      // openai_chat 必须显式选 Chat，不能依赖 SDK 默认 callable。
      if (spec.baseUrl) {
        const provider = createOpenAICompatible({
          name: "creatoros-custom",
          apiKey: spec.token,
          baseURL: spec.baseUrl,
        });
        model = provider.chatModel(spec.model);
        break;
      }
      const provider = createOpenAI({ apiKey: spec.token });
      model = provider.chat(spec.model);
      break;
    }
    default:
      throw new ModelConfigurationError();
  }
  return spec.displayModelKey === "channel-managed"
    ? protectChannelModel(model)
    : model;
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
  try {
    let model: ChannelEmbeddingInput;
    switch (spec.apiFormat) {
      case "anthropic":
        throw new Error(
          "anthropic 协议不提供 embedding 端点:请为该 capability 配置 openai_chat 协议的 embedding 模型(如 SiliconFlow BAAI/bge-m3)",
        );
      case "openai_chat":
      case "openai_responses": {
        if (spec.baseUrl) {
          const provider = createOpenAICompatible({
            name: "creatoros-custom-embedding",
            apiKey: spec.token,
            baseURL: spec.baseUrl,
          });
          model = provider.textEmbeddingModel(spec.model);
          break;
        }
        const provider = createOpenAI({ apiKey: spec.token });
        model = provider.textEmbeddingModel(spec.model);
        break;
      }
      default:
        throw new ModelConfigurationError();
    }
    return spec.displayModelKey === "channel-managed"
      ? protectChannelEmbeddingModel(model)
      : model;
  } catch (error) {
    if (spec.displayModelKey === "channel-managed") {
      throw toChannelManagedError(error);
    }
    throw error;
  }
}
