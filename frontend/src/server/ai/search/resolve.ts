import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { ModelConfigInternal } from "@creatoros/backend/modules/settings";
import {
  channelModelRow,
  type ChannelModelPayload,
} from "@creatoros/backend/modules/ai-runtime";

// 联网检索 model-config 解析(SPEC 2026-07-03 §1.1 T-084a)—— 与多模态 `resolveMultimodalSpec`
// (backend/src/modules/ai-runtime/multimodal/resolve.ts)、文本 `resolveLlmConfig`
// (backend/src/modules/ai-runtime/llm/resolve.ts)**并列**的一层:把
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
  displayModelKey?: "channel-managed";
}

export interface ResolveSearchDeps {
  getModelConfig: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelConfigInternal | null>;
  env: Record<string, string | undefined>;
  getChannelModelConfig?: () => Promise<ChannelModelPayload | null>;
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
  const channel = await deps.getChannelModelConfig?.();
  if (channel) {
    const row = channelModelRow(channel, "web.search");
    return {
      provider: row.provider,
      baseUrl: row.baseUrl,
      model: row.modelName,
      token: row.secretValue as string,
      displayModelKey: "channel-managed",
    };
  }

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

  // Tier 3 — [T-191] 未配 provider → **默认走浏览器搜索 adapter**(免 key,已注册进 searchWeb
  //   registry:persistence-client `browser: createBrowserScrapeAdapter()`)。零配置即真联网:
  //   无头 Chromium 抓 Bing SERP → 解析结果。不再抛 SearchConfigError/掉训练记忆。
  //   诚实边界:browser adapter(search-browser.ts)★★脆(SERP 反爬/结构变)→ 抓不到时抛
  //   SearchExecutionError → gatherMaterials 接住 → grounding=model_memory 诚实降级(不产垃圾/不假装)。
  //   用户仍可在设置里配 bocha/tavily/serpapi(Tier 1)覆盖浏览器档换更稳的 provider。
  return { provider: "browser", baseUrl: null, model: "", token: "" };
}
