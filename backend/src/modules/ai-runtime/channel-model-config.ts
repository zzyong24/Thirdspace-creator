import type { ModelConfigInternal } from "@creatoros/backend/modules/settings";
import type { ApiFormat, ResolvedLlmConfig } from "./llm/provider";
import type { MultimodalSpec } from "./multimodal/resolve";

export type ChannelModelPayload = Readonly<Record<string, unknown>>;

function field(payload: ChannelModelPayload, ...names: string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(payload, name)) {
      return payload[name];
    }
  }
  return undefined;
}

export class ChannelModelConfigurationError extends Error {
  constructor() {
    super("渠道模型配置不完整，请联系官方处理");
    this.name = "ChannelModelConfigurationError";
  }
}

function apiFormat(payload: ChannelModelPayload): ApiFormat {
  const explicit = field(payload, "apiFormat");
  switch (explicit) {
    case "anthropic":
    case "openai_chat":
    case "openai_responses":
      return explicit;
    default:
      // 渠道 payload 是 opaque 输入；缺失、错类型或未知值都不得按 provider/model 猜协议。
      throw new ChannelModelConfigurationError();
  }
}

function baseUrl(payload: ChannelModelPayload): string | null {
  const value = field(payload, "baseURL", "baseUrl");
  return value === undefined ? null : (value as string);
}

function token(payload: ChannelModelPayload): string {
  return field(payload, "apiKey") as string;
}

function model(payload: ChannelModelPayload): string {
  return field(payload, "model", "modelName") as string;
}

function settings(payload: ChannelModelPayload): Record<string, unknown> {
  const value = field(payload, "settings");
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** configured payload 的文本投影；协议族必须显式合法，其余字段由正式调用验证且不存在 local fallback。 */
export function channelLlmConfig(
  payload: ChannelModelPayload,
): ResolvedLlmConfig {
  const url = baseUrl(payload);
  const format = apiFormat(payload);
  return {
    apiFormat: format,
    baseUrl: url,
    model: model(payload),
    // authStyle 是 CreatorOS provider adapter 的内部字段，不从渠道 JSON 的未知字段猜造。
    authStyle: format === "anthropic" ? "x-api-key" : "bearer",
    token: token(payload),
    settings: settings(payload),
    displayModelKey: "channel-managed",
  };
}

/** configured payload 的多模态/ASR 投影；无效字段留给正式调用诚实失败。 */
export function channelMultimodalSpec(
  payload: ChannelModelPayload,
  kind: MultimodalSpec["kind"],
): MultimodalSpec {
  return {
    provider: field(payload, "provider") as string,
    baseUrl: baseUrl(payload),
    model: model(payload),
    token: token(payload),
    kind,
    displayModelKey: "channel-managed",
  };
}

/** configured payload 的 settings-compatible 投影，仅供既有专用 resolver 复用。 */
export function channelModelRow(
  payload: ChannelModelPayload,
): ModelConfigInternal {
  return {
    provider: field(payload, "provider") as string,
    modelName: model(payload),
    baseUrl: baseUrl(payload),
    apiFormat: apiFormat(payload),
    secretReference: "",
    secretValue: token(payload),
    settings: settings(payload),
  };
}
