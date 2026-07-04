import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { ModelConfigInternal } from "@creatoros/backend/modules/settings";

// 联网检索 model-config 解析(SPEC 2026-07-03 §1.1 T-084a)—— 与多模态 `resolveMultimodalSpec`
// (../multimodal/resolve.ts)、文本 `resolveLlmConfig`(../llm/resolve.ts)**并列**的一层:把
// 用户在 model_configurations 表里为 `web.search` capability 配的 provider/baseUrl/key,按同款三层
// 优先级(库存密钥 > env > 抛错)投影成 SearchSpec,喂给 ai-worker 的 searchWeb 工厂。
//
// capability `web.search` 在 contract 全线是自由字符串(settings/ai resources 皆 z.string(),无枚举
// 校验),故新增此值**零 contract/schema 改动**——与 `transcribe.audio`/`asset.classify` 加入时同理。
//
// 分层沿用既定切分:**解析(读 ctx + DB row)在 frontend,provider REST 调用在 ai-worker**。故此处
// SearchSpec 是与 ai-worker search-factory.SearchSpec **结构对齐的本地声明**(和 MultimodalSpec 两处
// 独立声明、结构投影同款——resolve 层不反向依赖 factory 层实现)。

/** 与 ai-worker search-factory.SearchSpec 结构对齐(见上方分层说明)。 */
export interface SearchSpec {
  provider: string;
  baseUrl: string | null;
  model: string;
  token: string;
}

export interface ResolveSearchDeps {
  getModelConfig: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelConfigInternal | null>;
  env: Record<string, string | undefined>;
}

/** 未配 / 无凭据 —— 上层(gatherMaterials)接住 → 降级 model_memory(诚实,不假装能搜)。
 *  与多模态 MultimodalConfigError 平行。 */
export class SearchConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchConfigError";
  }
}

// "env:FOO" → env.FOO;trim;缺/空 → ""(cc-switch first_non_empty:空串占位必须 SKIP)。
// 与 multimodal/resolve.ts resolveSecret 同语义。
function resolveSecret(
  secretRef: string | undefined,
  env: Record<string, string | undefined>,
): string {
  if (!secretRef) return "";
  const m = /^env:(.+)$/.exec(secretRef.trim());
  if (!m) return "";
  return (env[m[1]] ?? "").trim();
}

// 从一条 DB row 投影成 SearchSpec,无可用 token 时返 null(库存 secretValue 优先于 env-ref
// secretReference —— cc-switch first_non_empty,与多模态层 tryDbRow 一致)。model 可空(多数搜索
// provider 无「模型」概念;serpapi 用它当 engine)。
function tryDbRow(
  row: ModelConfigInternal | null,
  env: Record<string, string | undefined>,
): SearchSpec | null {
  if (!row) return null;
  const token =
    row.secretValue?.trim() || resolveSecret(row.secretReference, env);
  if (!token) return null;
  return {
    provider: row.provider,
    baseUrl: row.baseUrl ?? null,
    model: row.modelName ?? "",
    token,
  };
}

// env 默认档变量名(与文本层 CREATOROS_LLM_*、多模态层 CREATOROS_IMAGE_* 并列)。
const ENV_KEYS = {
  secretRef: "CREATOROS_SEARCH_SECRET_REF",
  baseUrl: "CREATOROS_SEARCH_BASE_URL",
  provider: "CREATOROS_SEARCH_PROVIDER",
  model: "CREATOROS_SEARCH_MODEL",
} as const;

// env 默认档:与多模态一样**没有免配兜底**——搜索必须真配 provider+key(model 选填),否则诚实抛错。
function tryEnvRow(env: Record<string, string | undefined>): SearchSpec | null {
  const token = resolveSecret(env[ENV_KEYS.secretRef], env);
  if (!token) return null;
  const provider = env[ENV_KEYS.provider]?.trim();
  // provider 是分派与调用的必要项,缺则不成档(不瞎猜默认 provider)。model 对搜索选填。
  if (!provider) return null;
  return {
    provider,
    baseUrl: env[ENV_KEYS.baseUrl]?.trim() || null,
    model: env[ENV_KEYS.model]?.trim() || "",
    token,
  };
}

/**
 * 仿 resolveMultimodalSpec 优先级把 `web.search` 解析成 SearchSpec:
 *   Tier 1 库存密钥:web.search 行 → search.default 行;库存 secretValue > env-ref。
 *   Tier 2 env 默认:CREATOROS_SEARCH_*(需 provider+key,model 选填)。
 *   Tier 3 未配:抛 SearchConfigError(上层 gatherMaterials 接住 → grounding=model_memory 降级)。
 * 与多模态一致:**无免配兜底**,不假装能搜。
 */
export async function resolveSearchSpec(
  ctx: RequestContext,
  deps: ResolveSearchDeps,
): Promise<SearchSpec> {
  const { env } = deps;

  // Tier 1 — 用户配的 DB row(先 per-capability web.search,再 search.default 默认行)。
  const fromCap = tryDbRow(await deps.getModelConfig(ctx, "web.search"), env);
  if (fromCap) return fromCap;
  const fromDefault = tryDbRow(
    await deps.getModelConfig(ctx, "search.default"),
    env,
  );
  if (fromDefault) return fromDefault;

  // Tier 2 — env 默认档。
  const fromEnv = tryEnvRow(env);
  if (fromEnv) return fromEnv;

  // Tier 3 — 未配:诚实抛错(不假装能搜)。
  throw new SearchConfigError(
    `capability "web.search" 未配置联网检索:请在设置里为 web.search 配 provider/key(bocha/tavily/serpapi),` +
      `或设置 .env.local 的 ${ENV_KEYS.provider}/${ENV_KEYS.secretRef}`,
  );
}
