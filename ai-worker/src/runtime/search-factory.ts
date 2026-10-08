import {executionTimeoutMs} from "@creatoros/contract/timeout-policy";
// 联网检索 provider 工厂(SPEC 2026-07-03 素材能力升级 §1.1 T-084a)—— 把「一次运行解析出来
// 的搜索模型规格(SearchSpec)」变成统一契约的 REST 检索调用。与多模态 `generateImage`
// (multimodal-factory.ts)并列的一层:文本走 Vercel AI SDK 的 LanguageModel、多模态走自建 REST,
// **联网检索也走自建 REST**(各家搜索 API 形状异构:bocha 返 data.webPages.value、tavily 返
// results、serpapi 返 organic_results)。
//
// ── 关键设计立场(SPEC §0.5-D / §1.2)────────────────────────────────────────
// 检索**不是模型的工具**,而是**节点的前置步骤**:调用方先 `searchWeb(spec, query)` 拿真实结果,
// 再把结果当 facet 注入 `generateObject` 综合。这保住了「任何模型都产可解析输出」(ffb7951 教训:
// 回自由文本工具循环会让 MiniMax 崩),又补回真实信源。
//
// ── 统一上层契约(provider 中立)────────────────────────────────────────────
// `searchWeb` 上层只返 `SearchResult[]`(title/url/snippet/publishedAt?/siteName?)。各家响应形状
// 差异全部由适配器**内部**消化,上层不感知。按 `spec.provider` 分派到适配器(工厂 keyed by
// provider,与多模态层 keyed by provider 同套路:加 provider = 加一个适配器,不改上层与业务代码)。
//
// ── 诚实边界(SPEC §7 / §6)─────────────────────────────────────────────────
// 本环境无任何搜索 provider 真 key,**无法零成本端到端验**。各适配器的 HTTP 结构按各家公开文档
// 写(bochaai.com / tavily.com / serpapi.com),响应映射逻辑由 fake fetch 单测零成本覆盖。真产物
// 验收留给用户配 key 后。超时/失败 → 抛错(SearchExecutionError),由调用方 catch 成 model_memory
// 降级,不 crash。

/** 一次联网检索需要的最小规格(由上层 resolveSearchSpec 按 capability=web.search 解析后投影)。
 *  与多模态 MultimodalSpec 并列;`provider` 名做分派开关(各家搜索 REST 形状彼此异构)。 */
export interface SearchSpec {
  /** 分派开关:"bocha" | "tavily" | "serpapi"(加 provider = 在工厂注册一个适配器)。 */
  provider: string;
  /** 自定义端点;null = 用该 provider 适配器的内置默认端点。 */
  baseUrl: string | null;
  /** 搜索模型/引擎 id,可空(多数 provider 无「模型」概念;serpapi 用它当 engine,默认 google)。 */
  model: string;
  /** 用户自带 API key(复用 secret 存储)。 */
  token: string;
}

/** 统一上层检索结果契约 —— 无论 provider,只有这几个字段(源自各家响应的归一映射)。 */
export interface SearchResult {
  /** 网页标题。 */
  title: string;
  /** 网页 URL(一等公民,采纳后写 sourceMetadata.sourceUrl)。 */
  url: string;
  /** 摘要/正文片段。 */
  snippet: string;
  /** 发布时间(各家有则映射,无则省略)。 */
  publishedAt?: string;
  /** 站点名/域名(各家有则映射,无则省略)。 */
  siteName?: string;
}

export interface SearchWebOptions {
  signal?: AbortSignal;
  /** 取回结果条数上限(top N,SPEC §1.2 建议 8~10)。默认 10。 */
  count?: number;
  /** 单次检索超时(ms)。SPEC §1.2:10s 失败降级。默认 10000。 */
  timeoutMs?: number;
}

/** 一个搜索 provider 适配器要实现的形状。各家响应异构,但对工厂/上层而言签名都返
 *  `Promise<SearchResult[]>` —— 差异被封装在适配器内。 */
export interface SearchProviderAdapter {
  search(
    spec: SearchSpec,
    query: string,
    opts: Required<Pick<SearchWebOptions, "count" | "timeoutMs">> & Pick<SearchWebOptions, "signal">,
  ): Promise<SearchResult[]>;
}

export type SearchProviderRegistry = Record<string, SearchProviderAdapter>;

/** 未配 / 未知 provider —— 上层适配器可接住 → 降级 model_memory,不假成功。与多模态
 *  MultimodalConfigError 平行。 */
export class SearchConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchConfigError";
  }
}

/** provider 检索过程本身失败(HTTP 非 2xx / 超时 / 响应不可解析等)。调用方 catch 成
 *  model_memory 降级(SPEC §1.3),不 crash。 */
export class SearchExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchExecutionError";
  }
}

const DEFAULT_COUNT = 10;
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * 按 spec.provider 取适配器,执行一次联网检索 → 统一 `SearchResult[]`。
 * 未知 provider → SearchConfigError;检索失败/超时 → SearchExecutionError(适配器内抛)。
 * 加 provider = 在工厂注册一个实现 SearchProviderAdapter 的适配器,上层不改(与多模态同款)。
 */
export async function searchWeb(
  spec: SearchSpec,
  query: string,
  registry: SearchProviderRegistry,
  opts?: SearchWebOptions,
): Promise<SearchResult[]> {
  opts?.signal?.throwIfAborted();
  const adapter = registry[spec.provider];
  if (!adapter) {
    throw new SearchConfigError(
      `未知搜索 provider: "${spec.provider}"(未在工厂注册适配器)`,
    );
  }
  const trimmed = query.trim();
  if (!trimmed) return [];
  return adapter.search(spec, trimmed, {
    ...(opts?.signal ? {signal: opts.signal} : {}),
    count: opts?.count ?? DEFAULT_COUNT,
    timeoutMs: executionTimeoutMs(opts?.timeoutMs, DEFAULT_TIMEOUT_MS),
  });
}
