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

function apiFormat(payload: ChannelModelPayload): ApiFormat {
  const explicit = field(payload, "apiFormat");
  if (explicit !== undefined) return explicit as ApiFormat;
  const provider = field(payload, "provider");
  if (provider === "anthropic") return "anthropic";
  if (provider === "openai-compatible") return "openai_chat";
  // 不猜未知 provider。无效值会在正式 provider adapter 中诚实失败，不能触发本地回退。
  return undefined as unknown as ApiFormat;
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

/** configured payload 的文本投影；不做语义验证，也不存在 local fallback。 */
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
