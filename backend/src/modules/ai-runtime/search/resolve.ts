import type { RequestContext } from "@creatoros/contract";
import type { ModelConfigInternal } from "@creatoros/backend/modules/settings";
import {
  channelRouteToken,
  resolveChannelCapabilityRoute,
  type ChannelModelPayload,
} from "../channel-model-config";

// 领域配置解析属于后端；渠道优先，再查用户能力/默认行、环境，最后返回 browser。
export type SearchSpec = import("@creatoros/contract/execution-worker").ChatWebReadSearchSpec;

export interface ResolveSearchDeps {
  getModelConfig: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelConfigInternal | null>;
  env: Record<string, string | undefined>;
  getChannelModelConfig?: () => Promise<ChannelModelPayload | null>;
  getChannelModelCredential?: (serviceId: string) => Promise<string | null>;
}

// "env:FOO" → env.FOO;trim;缺/空 → ""(cc-switch first_non_empty:空串占位必须 SKIP)。
// 与 multimodal/resolve.ts resolveSecret 同语义。
function resolveSecret(
  secretRef: string | undefined,
  env: Record<string, string | undefined>,
): string {
  if (!secretRef) return "";
  const m = /^env:(.+)$/.exec(secretRef.trim());
  if (!m?.[1]) return "";
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

// 环境档只有 provider 和密钥齐全时生效，否则继续使用浏览器默认档。
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

/** 不访问搜索供应商；只从当前上下文解析配置，秘密不进入模型或任务载荷。 */
export async function resolveSearchSpec(
  ctx: RequestContext,
  deps: ResolveSearchDeps,
): Promise<SearchSpec> {
  const { env } = deps;
  const channel = await deps.getChannelModelConfig?.();
  if (channel) {
    const route = resolveChannelCapabilityRoute(channel, "web.search");
    if (route) {
      const credential = route.serviceId
        ? await deps.getChannelModelCredential?.(route.serviceId)
        : null;
      return {
        provider: route.provider,
        baseUrl: route.baseUrl,
        model: route.model,
        token: channelRouteToken(route, credential),
        displayModelKey: "channel-managed",
      };
    }
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
