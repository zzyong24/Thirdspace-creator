import type { RequestContext } from "@creatoros/contract";
import type { ModelConfigInternal } from "@creatoros/backend/modules/settings";
import { SECRET_DECRYPT_FAIL_SENTINEL } from "@creatoros/backend/modules/settings";
import {
  LlmCredentialError,
  type ApiFormat,
  type ResolvedLlmConfig,
} from "./provider";
import {
  channelLlmConfigFromRoute,
  resolveChannelCapabilityRoute,
  type ChannelModelPayload,
} from "../channel-model-config";

export interface ResolveDeps {
  getModelConfig: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelConfigInternal | null>;
  env: Record<string, string | undefined>;
  getChannelModelConfig?: () => Promise<ChannelModelPayload | null>;
  getChannelModelCredential?: (serviceId: string) => Promise<string | null>;
  getChannelModelSelection?: (capability: string) => Promise<string | null>;
}

async function channelConfigFor(
  deps: ResolveDeps,
  payload: ChannelModelPayload,
  capability: string,
  allowDefaultFallback: boolean,
): Promise<ResolvedLlmConfig | null> {
  const route = resolveChannelCapabilityRoute(payload, capability, {
    allowDefaultFallback,
    selectedOptionId: await deps.getChannelModelSelection?.(capability),
  });
  if (!route) return null;
  const credential = route.serviceId
    ? await deps.getChannelModelCredential?.(route.serviceId)
    : null;
  return channelLlmConfigFromRoute(route, credential);
}

// "env:FOO" → env.FOO ; trims; returns "" for missing/blank (cc-switch first_non_empty:
// an empty-string placeholder must be SKIPPED, not treated as present).
function resolveSecret(
  secretRef: string | undefined,
  env: Record<string, string | undefined>,
): string {
  if (!secretRef) return "";
  const m = /^env:(.+)$/.exec(secretRef.trim());
  if (!m || !m[1]) return "";
  return (env[m[1]] ?? "").trim();
}

// For the anthropic family: a custom baseUrl (relay / MiniMax) authenticates with a
// Bearer token; the official endpoint (no baseUrl) uses x-api-key.
function deriveAuthStyle(baseUrl: string | null): "bearer" | "x-api-key" {
  return baseUrl ? "bearer" : "x-api-key";
}

// The global-default capability key. A per-capability lookup that misses falls
// back to this row (cc-switch's "global default" + per-app override, mapped to
// per-capability granularity) before the env default.
const DEFAULT_CAPABILITY = "default";

// Build a ResolvedLlmConfig from a user-configured DB row, or null when no usable
// token. A stored secretValue (the local-db key) takes precedence over an
// env-ref secretReference (cc-switch first_non_empty).
// [T-453] secretValue === SECRET_DECRYPT_FAIL_SENTINEL 时视为「无 token」但**上层要
//   区分**——用 __decryptFailed 附加位透出去,让 resolveLlmConfig 抛清楚错文案。
function tryDbRow(
  row: ModelConfigInternal | null,
  env: Record<string, string | undefined>,
): (ResolvedLlmConfig & { __decryptFailed?: never }) | null {
  if (!row) return null;
  if (row.secretValue === SECRET_DECRYPT_FAIL_SENTINEL) return null; // 上层单独判
  const token =
    row.secretValue?.trim() || resolveSecret(row.secretReference, env);
  if (!token) return null;
  const baseUrl = row.baseUrl ?? null;
  return {
    apiFormat: row.apiFormat,
    baseUrl,
    model: row.modelName,
    authStyle: deriveAuthStyle(baseUrl),
    token,
    settings: row.settings ?? {},
  };
}

// [T-453] 判定"曾配但密钥不可用"——secretValue 是解密失败 sentinel。resolve 主路径靠
//   这个决定给用户的诚实文案(而非通用「未配」)。
function rowIsDecryptFailed(row: ModelConfigInternal | null): boolean {
  return !!row && row.secretValue === SECRET_DECRYPT_FAIL_SENTINEL;
}

/**
 * [T-239b] **只认专配行**的解析(不回退 "default" 行、不回退 env)—— 给「必须与主模型不同」
 * 的能力用(如 chat.fallback 备用对话模型:回退 default 会解析成主模型自己,fallback 失去意义)。
 * 未配 / 无可用 token → null(诚实降级,调用方按未配处理)。
 */
export async function resolveDedicatedLlmConfig(
  ctx: RequestContext,
  capability: string,
  deps: ResolveDeps,
): Promise<ResolvedLlmConfig | null> {
  const channel = await deps.getChannelModelConfig?.();
  if (channel) {
    const managed = await channelConfigFor(deps, channel, capability, false);
    if (managed) return managed;
  }
  return tryDbRow(await deps.getModelConfig(ctx, capability), deps.env);
}

export async function resolveLlmConfig(
  ctx: RequestContext,
  capability: string,
  deps: ResolveDeps,
): Promise<ResolvedLlmConfig> {
  const { env } = deps;
  const channel = await deps.getChannelModelConfig?.();
  if (channel) {
    const managed = await channelConfigFor(deps, channel, capability, true);
    if (managed) return managed;
  }

  // Tier 1 — the user-configured DB row. Prefer the per-capability row, then the
  // global "default" row. A stored secretValue wins; else the env-ref resolves.
  // [T-432] 记住是否存在配置行(哪怕其 key 解不开)—— decRow 在 master key 不符时把
  //   secretValue 静默置 null(settings.repository:200-212),使「已配但密钥解密失败」与
  //   「从未配置」在这里都表现为 null token。用「行是否存在」区分,给诚实文案:前者叫用户
  //   去设置**重填密钥**(而非误导去改 .env.local),后者才提示配置/env。
  const capRow = await deps.getModelConfig(ctx, capability);
  const fromCap = tryDbRow(capRow, env);
  if (fromCap) return fromCap;
  let defaultRow: ModelConfigInternal | null = null;
  if (capability !== DEFAULT_CAPABILITY) {
    defaultRow = await deps.getModelConfig(ctx, DEFAULT_CAPABILITY);
    const fromDefault = tryDbRow(defaultRow, env);
    if (fromDefault) return fromDefault;
  }
  const hasConfiguredRow = Boolean(capRow) || Boolean(defaultRow);
  // [T-453] 具体到"曾配但密钥不可用"——decRow 把解密失败写成 sentinel,这里认它就能给
  //   诚实文案(区别于"从未配过"),避免用户以为要重配一堆中转来试(→ 被引流到山寨中转)。
  const hasDecryptFailedRow =
    rowIsDecryptFailed(capRow) || rowIsDecryptFailed(defaultRow);

  // Tier 2 — the .env.local default provider.
  const envToken = resolveSecret(env.CREATOROS_LLM_SECRET_REF, env);
  if (envToken) {
    const baseUrl = env.CREATOROS_LLM_BASE_URL?.trim() || null;
    const apiFormat = (env.CREATOROS_LLM_API_FORMAT?.trim() ||
      "anthropic") as ApiFormat;
    const authStyle =
      env.CREATOROS_LLM_AUTH_STYLE?.trim() === "x-api-key"
        ? "x-api-key"
        : env.CREATOROS_LLM_AUTH_STYLE?.trim() === "bearer"
          ? "bearer"
          : deriveAuthStyle(baseUrl);
    return {
      apiFormat,
      baseUrl,
      model: env.CREATOROS_LLM_MODEL?.trim() || "claude-opus-4-8",
      authStyle,
      token: envToken,
      settings: {},
    };
  }

  // Tier 3 — built-in default: Anthropic official Messages API.
  const builtinToken = (env.ANTHROPIC_API_KEY ?? "").trim();
  if (builtinToken) {
    return {
      apiFormat: "anthropic",
      baseUrl: null,
      model: "claude-opus-4-8",
      authStyle: "x-api-key",
      token: builtinToken,
      settings: {},
    };
  }

  throw new LlmCredentialError(
    hasDecryptFailedRow
      ? `已配置模型但密钥无法解密(master key 与保存时不符——本机重置 / 应用签名变化 / .master-key 文件丢失)。请到「设置 → 模型配置」重新填写 API 密钥并保存,即刻恢复。`
      : hasConfiguredRow
      ? `已配置模型但密钥不可用:很可能是密钥解密失败(换机 / 重置工作区 / master key 变化，或密钥未填)。请到「设置 → 模型配置」重新填写 API 密钥并保存。`
      : `capability "${capability}" 无可用 LLM 凭据:请到「设置 → 模型配置」配置模型与密钥;或(开发 / 自托管)在 .env.local 设置 CREATOROS_LLM_SECRET_REF 指向的变量(如 MINIMAX_AUTH_TOKEN)或 ANTHROPIC_API_KEY。`,
  );
}
