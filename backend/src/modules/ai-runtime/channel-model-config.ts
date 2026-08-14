import type { ModelConfigInternal } from "@creatoros/backend/modules/settings";
import type { ApiFormat, ResolvedLlmConfig } from "./llm/provider";
import type { MultimodalSpec } from "./multimodal/resolve";

export type ChannelModelPayload = Readonly<Record<string, unknown>>;

type ChannelCapabilityKind = "llm" | MultimodalSpec["kind"];

export interface ChannelServiceLinks {
  readonly portalUrl: string | null;
  readonly purchaseUrl: string | null;
  readonly rechargeUrl: string | null;
  readonly helpUrl: string | null;
}

export interface ChannelCapabilityRoute {
  readonly capability: string;
  readonly kind: ChannelCapabilityKind;
  readonly serviceId: string | null;
  readonly serviceName: string;
  readonly credentialSource: "user_input" | "activation_managed" | null;
  readonly credentialLifecycle: "persistent" | "per_request" | null;
  readonly links: ChannelServiceLinks;
  readonly provider: string;
  readonly baseUrl: string | null;
  readonly apiFormat: ApiFormat | string;
  readonly model: string;
  readonly modelName: string;
  readonly optionId: string | null;
  readonly modelOptions: readonly {
    readonly id: string;
    readonly name: string;
    readonly model: string;
    readonly isDefault: boolean;
  }[];
  readonly settings: Record<string, unknown>;
  /** 只兼容旧版已验签 flat payload；新版 graph 的 Key 必须从本地 service credential 读取。 */
  readonly inlineToken: string | null;
}

function field(payload: ChannelModelPayload, ...names: string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(payload, name)) {
      return payload[name];
    }
  }
  return undefined;
}

function object(value: unknown): ChannelModelPayload | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ChannelModelPayload)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectArray(value: unknown): readonly ChannelModelPayload[] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.map(object);
  return rows.every((row): row is ChannelModelPayload => row !== null)
    ? rows
    : null;
}

function record(value: unknown): Record<string, unknown> | null {
  const row = object(value);
  return row ? { ...row } : null;
}

function safeHttpsUrl(value: unknown): string | null {
  const raw = nonEmptyString(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function optionalSafeHttpsUrl(value: unknown): string | null {
  return value === undefined || value === null || value === ""
    ? null
    : safeHttpsUrl(value);
}

function serviceLinks(service: ChannelModelPayload): ChannelServiceLinks {
  const credential = object(field(service, "credential"));
  const links = object(field(credential ?? {}, "links")) ?? {};
  return {
    portalUrl: optionalSafeHttpsUrl(field(links, "portalUrl")),
    purchaseUrl: optionalSafeHttpsUrl(field(links, "purchaseUrl")),
    rechargeUrl: optionalSafeHttpsUrl(field(links, "rechargeUrl")),
    helpUrl: optionalSafeHttpsUrl(field(links, "helpUrl")),
  };
}

function capabilityKind(capability: string): ChannelCapabilityKind {
  switch (capability) {
    case "transcribe.audio":
      return "audio";
    case "image.generate":
    case "image.edit":
      return "image";
    case "video.generate":
      return "video";
    case "asset.classify":
      return "vision";
    default:
      return "llm";
  }
}

function normalizedApiFormat(value: unknown): ApiFormat | string | null {
  const raw = nonEmptyString(value);
  if (raw === "anthropic_messages") return "anthropic";
  return raw;
}

function normalizedProvider(value: unknown, kind: ChannelCapabilityKind): string | null {
  const raw = nonEmptyString(value);
  if (!raw) return null;
  if (kind === "image" && raw === "openai-compatible") return "openai";
  if (kind === "video" && (raw === "seedance" || raw === "seeddance")) {
    return "omnihi";
  }
  return raw;
}

function adapterSupported(
  kind: ChannelCapabilityKind,
  provider: string,
  apiFormat: string,
): boolean {
  if (kind === "llm") {
    return (
      apiFormat === "anthropic" ||
      apiFormat === "openai_chat" ||
      apiFormat === "openai_responses"
    );
  }
  if (kind === "audio") {
    if (provider === "qwen") return apiFormat === "qwen_chat_audio";
    return new Set([
      "qwen-asr",
      "xiaomi-mimo",
      "siliconflow",
      "openai",
      "groq",
    ]).has(provider);
  }
  if (kind === "image") return provider === "minimax" || provider === "openai";
  if (kind === "video") return provider === "minimax" || provider === "omnihi";
  return provider === "openai" || provider === "minimax";
}

function hasUniqueIds(rows: readonly ChannelModelPayload[]): boolean {
  const ids = rows.map((row) => nonEmptyString(field(row, "id")));
  return ids.every(Boolean) && new Set(ids).size === ids.length;
}

function validManagedServiceSet(
  services: readonly ChannelModelPayload[],
): boolean {
  const sources = services.map((service) => {
    const credential = object(field(service, "credential"));
    return nonEmptyString(field(credential ?? {}, "source"));
  });
  if (!sources.includes("activation_managed")) return true;
  // 受管配置是一张完整签名图，不能与用户自行填写的服务混搭。旧图仅含
  // omnihi-main；新图精确增加 qwen-asr-main，拒绝第三个受管服务。
  if (sources.some((source) => source !== "activation_managed")) return false;
  const ids = services.map((service) => nonEmptyString(field(service, "id")));
  if (ids.some((id) => id === null)) return false;
  const sorted = [...(ids as string[])].sort();
  return (
    (sorted.length === 1 && sorted[0] === "omnihi-main") ||
    (sorted.length === 2 &&
      sorted[0] === "omnihi-main" &&
      sorted[1] === "qwen-asr-main")
  );
}

function exactlyOne<T>(rows: readonly T[], predicate: (row: T) => boolean): T | null {
  const matches = rows.filter(predicate);
  return matches.length === 1 ? matches[0]! : null;
}

function modernGraphRoute(
  payload: ChannelModelPayload,
  capability: string,
  allowDefaultFallback: boolean,
  selectedOptionId?: string | null,
): ChannelCapabilityRoute | null {
  const services = objectArray(field(payload, "services"));
  const connections = objectArray(field(payload, "connections"));
  const models = object(field(payload, "models"));
  if (!services || !connections || !models) return null;
  if (!hasUniqueIds(services) || !hasUniqueIds(connections)) return null;
  if (!validManagedServiceSet(services)) return null;

  const selectedCapability = Object.prototype.hasOwnProperty.call(models, capability)
    ? capability
    : allowDefaultFallback && capabilityKind(capability) === "llm"
      ? "default"
      : null;
  if (!selectedCapability) return null;
  const options = objectArray(field(models, selectedCapability));
  if (!options || options.length === 0 || !hasUniqueIds(options)) return null;
  const selectedOption = selectedOptionId
    ? exactlyOne(options, (row) => nonEmptyString(field(row, "id")) === selectedOptionId)
    : null;
  // Growth 更新白名单移除旧选择时，下一次解析自动回到唯一默认项；绝不落到本地
  // 模型或继续调用已被渠道撤下的 model id。
  const option =
    selectedOption ?? exactlyOne(options, (row) => field(row, "isDefault") === true);
  if (!option) return null;

  const optionId = nonEmptyString(field(option, "id"));
  const optionName = nonEmptyString(field(option, "name"));
  const model = nonEmptyString(field(option, "model", "modelName"));
  const connectionId = nonEmptyString(field(option, "connectionId"));
  const settings = record(field(option, "settings"));
  if (!optionId || !optionName || !model || !connectionId || !settings) return null;

  const connection = exactlyOne(
    connections,
    (row) => nonEmptyString(field(row, "id")) === connectionId,
  );
  if (!connection) return null;
  const serviceId = nonEmptyString(field(connection, "serviceId"));
  const kind = capabilityKind(capability);
  const provider = normalizedProvider(field(connection, "provider"), kind);
  const baseUrl = safeHttpsUrl(field(connection, "baseURL", "baseUrl"));
  const apiFormat = normalizedApiFormat(field(connection, "apiFormat"));
  if (!serviceId || !provider || !baseUrl || !apiFormat) return null;

  const service = exactlyOne(
    services,
    (row) => nonEmptyString(field(row, "id")) === serviceId,
  );
  if (!service) return null;
  const serviceName = nonEmptyString(field(service, "name"));
  const credential = object(field(service, "credential"));
  const credentialSource = nonEmptyString(field(credential ?? {}, "source"));
  const rawLifecycle = nonEmptyString(field(credential ?? {}, "lifecycle"));
  const credentialLifecycle =
    credentialSource === "activation_managed"
      ? rawLifecycle === null
        ? "persistent"
        : rawLifecycle === "persistent" || rawLifecycle === "per_request"
          ? rawLifecycle
          : null
      : null;
  if (
    !serviceName ||
    !credential ||
    field(credential, "type") !== "api_key" ||
    (credentialSource !== "user_input" && credentialSource !== "activation_managed") ||
    (credentialSource === "user_input" && rawLifecycle !== null) ||
    (credentialSource === "activation_managed" && credentialLifecycle === null)
  ) {
    return null;
  }
  if (
    credentialSource === "activation_managed" &&
    (field(credential, "allowMultiple") !== false ||
      !(
        (serviceId === "omnihi-main" &&
          field(service, "provider") === "omnihi" &&
          credentialLifecycle === "persistent") ||
        (serviceId === "qwen-asr-main" &&
          field(service, "provider") === "qwen" &&
          credentialLifecycle === "per_request")
      ))
  ) {
    return null;
  }
  if (
    serviceId === "qwen-asr-main" &&
    (capability !== "transcribe.audio" ||
      connectionId !== "qwen-asr" ||
      provider !== "qwen" ||
      apiFormat !== "qwen_chat_audio" ||
      model !== "qwen3-asr-flash" ||
      optionName !== "语音转文字" ||
      field(option, "isDefault") !== true ||
      settings.maxDurationSeconds !== 300 ||
      settings.maxBytes !== 10_485_760 ||
      settings.chargeUnits !== 25_000)
  ) {
    return null;
  }
  if (!adapterSupported(kind, provider, apiFormat)) return null;

  const modelOptions = options.flatMap((row) => {
    const id = nonEmptyString(field(row, "id"));
    const name = nonEmptyString(field(row, "name"));
    const optionModel = nonEmptyString(field(row, "model", "modelName"));
    if (!id || !name || !optionModel) return [];
    return [{ id, name, model: optionModel, isDefault: field(row, "isDefault") === true }];
  });

  return {
    capability,
    kind,
    serviceId,
    serviceName,
    credentialSource,
    credentialLifecycle,
    links: serviceLinks(service),
    provider,
    baseUrl,
    apiFormat,
    model,
    modelName: optionName,
    optionId,
    modelOptions,
    settings,
    inlineToken: null,
  };
}

export class ChannelModelConfigurationError extends Error {
  constructor() {
    super("渠道模型配置不完整，请联系官方处理");
    this.name = "ChannelModelConfigurationError";
  }
}

export class ChannelModelCredentialRequiredError extends Error {
  readonly capability: string;
  readonly serviceId: string;
  readonly credentialSource: ChannelCapabilityRoute["credentialSource"];

  constructor(
    capability: string,
    serviceId: string,
    credentialSource: ChannelCapabilityRoute["credentialSource"] = null,
  ) {
    super(
      credentialSource === "activation_managed"
        ? `渠道托管的 ${serviceId} 凭据尚未同步，请确认激活权益后重试`
        : `渠道已配置 ${capability}，请先在设置中填写 ${serviceId} 的 API Key`,
    );
    this.name = "ChannelModelCredentialRequiredError";
    this.capability = capability;
    this.serviceId = serviceId;
    this.credentialSource = credentialSource;
  }
}

/** 兼容历史已验签 inline payload；它仍保持旧版 fail-closed，不参与新版 graph 的逐项残缺回退。 */
function legacyInlineRoute(
  payload: ChannelModelPayload,
  capability: string,
  allowDefaultFallback: boolean,
): ChannelCapabilityRoute | null {
  if (field(payload, "services") !== undefined || field(payload, "connections") !== undefined) {
    return null;
  }
  const models = field(payload, "models");
  let option = payload;
  if (models !== undefined) {
    const byCapability = object(models);
    if (!byCapability) throw new ChannelModelConfigurationError();
    const raw =
      field(byCapability, capability) ??
      (allowDefaultFallback ? field(byCapability, "default") : undefined);
    const options = objectArray(raw);
    if (!options || options.length === 0) throw new ChannelModelConfigurationError();
    const defaults = options.filter((row) => field(row, "isDefault") === true);
    if (defaults.length > 1) throw new ChannelModelConfigurationError();
    option = defaults[0] ?? options[0]!;
  }

  const kind = capabilityKind(capability);
  const provider = normalizedProvider(field(option, "provider"), kind);
  const model = nonEmptyString(field(option, "model", "modelName"));
  const token = nonEmptyString(field(option, "apiKey"));
  const rawBaseUrl = field(option, "baseURL", "baseUrl");
  const baseUrl = rawBaseUrl === undefined ? null : safeHttpsUrl(rawBaseUrl);
  const apiFormat =
    kind === "llm" ? normalizedApiFormat(field(option, "apiFormat")) : "legacy";
  if (
    !provider ||
    !model ||
    !token ||
    (rawBaseUrl !== undefined && !baseUrl) ||
    !apiFormat ||
    !adapterSupported(kind, provider, apiFormat)
  ) {
    throw new ChannelModelConfigurationError();
  }
  return {
    capability,
    kind,
    serviceId: null,
    serviceName: "渠道模型",
    credentialSource: null,
    credentialLifecycle: null,
    links: { portalUrl: null, purchaseUrl: null, rechargeUrl: null, helpUrl: null },
    provider,
    baseUrl,
    apiFormat,
    model,
    modelName: nonEmptyString(field(option, "name")) ?? model,
    optionId: null,
    modelOptions: [],
    settings: record(field(option, "settings")) ?? {},
    inlineToken: token,
  };
}

/**
 * 渠道模型唯一逐能力 parser。新版 graph 的缺失、残缺或不支持一律只返回 null，让该能力走本地；
 * 历史 inline payload 保持原有 fail-closed 兼容。
 */
export function resolveChannelCapabilityRoute(
  payload: ChannelModelPayload,
  capability: string,
  options: {
    readonly allowDefaultFallback?: boolean;
    readonly selectedOptionId?: string | null;
  } = {},
): ChannelCapabilityRoute | null {
  const allowDefaultFallback = options.allowDefaultFallback ?? false;
  if (field(payload, "services") !== undefined || field(payload, "connections") !== undefined) {
    return modernGraphRoute(
      payload,
      capability,
      allowDefaultFallback,
      options.selectedOptionId,
    );
  }
  return legacyInlineRoute(payload, capability, allowDefaultFallback);
}

export function channelRouteToken(
  route: ChannelCapabilityRoute,
  credential: string | null | undefined,
): string {
  const token = route.inlineToken ?? credential?.trim() ?? "";
  if (token) return token;
  throw new ChannelModelCredentialRequiredError(
    route.capability,
    route.serviceId ?? "channel-service",
    route.credentialSource,
  );
}

export function channelLlmConfigFromRoute(
  route: ChannelCapabilityRoute,
  credential?: string | null,
): ResolvedLlmConfig {
  const format = route.apiFormat;
  if (
    format !== "anthropic" &&
    format !== "openai_chat" &&
    format !== "openai_responses"
  ) {
    throw new ChannelModelConfigurationError();
  }
  return {
    apiFormat: format,
    baseUrl: route.baseUrl,
    model: route.model,
    authStyle: format === "anthropic" && !route.baseUrl ? "x-api-key" : "bearer",
    token: channelRouteToken(route, credential),
    settings: route.settings,
    displayModelKey: "channel-managed",
  };
}

export function channelMultimodalSpecFromRoute(
  route: ChannelCapabilityRoute,
  credential?: string | null,
): MultimodalSpec {
  if (route.kind === "llm") throw new ChannelModelConfigurationError();
  const token =
    route.credentialLifecycle === "per_request"
      ? ""
      : channelRouteToken(route, credential);
  return {
    provider: route.provider,
    baseUrl: route.baseUrl,
    model: route.model,
    token,
    kind: route.kind,
    settings: route.settings,
    displayModelKey: "channel-managed",
    credentialLifecycle: route.credentialLifecycle ?? undefined,
    serviceId: route.serviceId ?? undefined,
    apiFormat: route.apiFormat,
  };
}

/** 历史调用兼容；新代码应先 resolveChannelCapabilityRoute 再注入本地 service Key。 */
export function channelLlmConfig(
  payload: ChannelModelPayload,
  capability = "default",
  credential?: string | null,
): ResolvedLlmConfig {
  const route = resolveChannelCapabilityRoute(payload, capability, {
    allowDefaultFallback: true,
  });
  if (!route) throw new ChannelModelConfigurationError();
  return channelLlmConfigFromRoute(route, credential);
}

/** 历史调用兼容；新代码应先 resolveChannelCapabilityRoute 再注入本地 service Key。 */
export function channelMultimodalSpec(
  payload: ChannelModelPayload,
  capability: string,
  kind: MultimodalSpec["kind"],
  credential?: string | null,
): MultimodalSpec {
  const route = resolveChannelCapabilityRoute(payload, capability);
  if (!route || route.kind !== kind) throw new ChannelModelConfigurationError();
  return channelMultimodalSpecFromRoute(route, credential);
}

/** configured payload 的 settings-compatible 投影，仅供既有专用 resolver 复用。 */
export function channelModelRow(
  payload: ChannelModelPayload,
  capability = "default",
  credential?: string | null,
): ModelConfigInternal {
  const route = resolveChannelCapabilityRoute(payload, capability, {
    allowDefaultFallback: capability !== "web.search" && capability !== "knowledge.search.embed",
  });
  if (!route) throw new ChannelModelConfigurationError();
  const format = route.apiFormat;
  if (
    format !== "anthropic" &&
    format !== "openai_chat" &&
    format !== "openai_responses"
  ) {
    throw new ChannelModelConfigurationError();
  }
  return {
    provider: route.provider,
    modelName: route.model,
    baseUrl: route.baseUrl,
    apiFormat: format,
    secretReference: "",
    secretValue: channelRouteToken(route, credential),
    settings: route.settings,
  };
}
