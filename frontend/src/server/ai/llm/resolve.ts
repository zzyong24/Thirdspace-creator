import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { ModelConfigInternal } from "@/server/modules/settings/settings.service";
import {
  LlmCredentialError,
  type ApiFormat,
  type ResolvedLlmConfig,
} from "./provider";

export interface ResolveDeps {
  getModelConfig: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelConfigInternal | null>;
  env: Record<string, string | undefined>;
}

// "env:FOO" → env.FOO ; trims; returns "" for missing/blank (cc-switch first_non_empty:
// an empty-string placeholder must be SKIPPED, not treated as present).
function resolveSecret(
  secretRef: string | undefined,
  env: Record<string, string | undefined>,
): string {
  if (!secretRef) return "";
  const m = /^env:(.+)$/.exec(secretRef.trim());
  if (!m) return "";
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
function tryDbRow(
  row: ModelConfigInternal | null,
  env: Record<string, string | undefined>,
): ResolvedLlmConfig | null {
  if (!row) return null;
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

export async function resolveLlmConfig(
  ctx: RequestContext,
  capability: string,
  deps: ResolveDeps,
): Promise<ResolvedLlmConfig> {
  const { env } = deps;

  // Tier 1 — the user-configured DB row. Prefer the per-capability row, then the
  // global "default" row. A stored secretValue wins; else the env-ref resolves.
  const fromCap = tryDbRow(await deps.getModelConfig(ctx, capability), env);
  if (fromCap) return fromCap;
  if (capability !== DEFAULT_CAPABILITY) {
    const fromDefault = tryDbRow(
      await deps.getModelConfig(ctx, DEFAULT_CAPABILITY),
      env,
    );
    if (fromDefault) return fromDefault;
  }

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
    `capability "${capability}" 无可用 LLM 凭据:请在 .env.local 设置 CREATOROS_LLM_SECRET_REF 指向的变量(如 MINIMAX_AUTH_TOKEN)或 ANTHROPIC_API_KEY`,
  );
}
