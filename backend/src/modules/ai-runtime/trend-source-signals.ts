import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec, TrendExtractOutput } from "@creatoros/ai-worker";

// [T-235b] 热点信源信号采集(通用网页信源主路 + RSS 辅路,SPEC 2026-07-11 §2.2)。
//
// 职责:出题(trend basis / topic.daily)时,对用户登记的 enabled 信源逐个抓信号:
//   · web 型(主路):readUrl(带 .auth/web 登录态,T-217b,注入端口)读正文 →
//     **AI 结构化抽取**信号(trend.extract 模板,runStructuredNode 绑 Zod —— 无热度字段
//     一律 null 不编,T-224 诚实门同源);
//   · rss 型(辅路):直接 fetch feed 解析(复用 search-rss parseFeed,注入端口),
//     不走 AI(feed 本身就是结构化的)。
// 容错(同采集容错纪律):单源失败(登录墙/网络/抽取失败)→ 记日志 + 跳过该源,不拖垮
//   整批;全部失败 → 返回 [](诚实空,上层 brief 少一段,不崩)。
//
// 铁律:不 import 浏览器层/fetch —— readWebSource / fetchRssSignals / extractSignals 全部
//   注入(host 在 persistence-client 绑真件;测试注 fake),本文件纯编排可单测。

/** 一条信源信号(拼 trend brief 的最小消费形状;heat 无则 null,绝不编)。 */
export interface TrendSourceSignal {
  title: string;
  url: string | null;
  heat: number | null;
  publishedAt: string | null;
  /** 来源信源展示名(brief 里标注出处)。 */
  sourceName: string;
}

/** 抓取用信源投影(与 trend-sources.service.EnabledTrendSource 结构兼容)。 */
export interface TrendSourceProjection {
  id: string;
  name: string;
  url: string;
  sourceType: "web" | "rss";
  domain: string;
}

/** 正文喂给 AI 抽取前的截断上限(控 token;热榜信号都在页面前部)。 */
export const TREND_SOURCE_TEXT_LIMIT = 6000;
/** 每信源最多取几条信号(防单源灌爆 brief)。 */
export const DEFAULT_SIGNALS_PER_SOURCE = 8;

export interface TrendSourceSignalsDeps {
  /** 列该 ctx(含号)enabled 的信源。host 绑 trendSourcesService.listEnabledSources。 */
  listEnabledSources: (ctx: RequestContext) => Promise<TrendSourceProjection[]>;
  /** web 型:带登录态读正文(host 绑 readUrl(webAuthDirFor(domain)),T-217b —— 只 import 不改)。
   *  抛错 = 该源读取失败(登录墙/网络)→ 跳过该源。 */
  readWebSource: (
    ctx: RequestContext,
    source: TrendSourceProjection,
  ) => Promise<{ text: string }>;
  /** web 型:正文 → AI 结构化抽取信号(host 绑 createTrendExtractPort;测试注 fake)。
   *  抛错(未配模型/模型失败)→ 跳过该源。 */
  extractSignals: (
    ctx: RequestContext,
    input: { sourceName: string; pageText: string },
  ) => Promise<TrendExtractOutput["signals"]>;
  /** rss 型(辅路):fetch feed → parseFeed 解析(host 绑 fetch + ai-worker parseFeed)。
   *  抛错 → 跳过该源。 */
  fetchRssSignals: (
    ctx: RequestContext,
    source: TrendSourceProjection,
  ) => Promise<TrendSourceSignal[]>;
  /** 每信源信号上限(默认 8)。 */
  maxSignalsPerSource?: number;
}

/**
 * 逐 enabled 信源抓信号(web 主路 AI 抽取 / rss 辅路 feed 解析)。单源失败跳过不拖垮;
 * 无信源/全失败 → [](诚实空)。返回信号带 sourceName 出处。
 */
export async function collectTrendSourceSignals(
  ctx: RequestContext,
  deps: TrendSourceSignalsDeps,
): Promise<TrendSourceSignal[]> {
  const cap = deps.maxSignalsPerSource ?? DEFAULT_SIGNALS_PER_SOURCE;
  let sources: TrendSourceProjection[] = [];
  try {
    sources = await deps.listEnabledSources(ctx);
  } catch (err) {
    console.error("[trend-sources] 读信源列表失败(诚实空,不崩出题):", err);
    return [];
  }
  if (sources.length === 0) return [];

  const out: TrendSourceSignal[] = [];
  for (const source of sources) {
    try {
      if (source.sourceType === "rss") {
        // 辅路:feed 本身结构化,直接解析(不调 AI)。
        const signals = await deps.fetchRssSignals(ctx, source);
        out.push(...signals.slice(0, cap));
      } else {
        // 主路:带登录态读正文 → AI 结构化抽取(无热度 null 不编)。
        const { text } = await deps.readWebSource(ctx, source);
        const pageText = (text ?? "").slice(0, TREND_SOURCE_TEXT_LIMIT);
        if (!pageText.trim()) {
          console.warn(`[trend-sources] 信源「${source.name}」正文为空,跳过`);
          continue;
        }
        const signals = await deps.extractSignals(ctx, {
          sourceName: source.name,
          pageText,
        });
        out.push(
          ...signals
            .filter((s) => (s.title ?? "").trim().length > 0) // 空标题条目 = 噪声,过滤
            .slice(0, cap)
            .map((s) => ({
              title: s.title.trim(),
              url: s.url ?? null,
              heat: s.heat ?? null,
              publishedAt: s.publishedAt ?? null,
              sourceName: source.name,
            })),
        );
      }
      console.log(
        `[trend-sources] 信源「${source.name}」(${source.sourceType}) 抓到信号(累计 ${out.length} 条)`,
      );
    } catch (err) {
      // 单源失败(登录墙/网络/未配模型/抽取失败)→ 跳过该源,不拖垮整批(诚实记错)。
      console.error(
        `[trend-sources] 信源「${source.name}」(${source.url}) 抓取失败,跳过该源:`,
        err,
      );
    }
  }
  return out;
}

/** 信号 → brief 段(空数组 → 空串,诚实降级;与 formatTrendBrief 并列的另一段)。 */
export function formatTrendSourceBrief(
  signals: ReadonlyArray<TrendSourceSignal>,
): string {
  const lines = signals
    .map((s) => {
      const title = (s.title ?? "").trim();
      if (!title) return "";
      const parts = [title];
      if (s.heat != null) parts.push(`热度 ${s.heat}`);
      if (s.publishedAt) parts.push(`发布 ${s.publishedAt}`);
      if (s.url) parts.push(s.url);
      return `${parts.join(" —— ")}(来源:${s.sourceName})`;
    })
    .filter((s) => s !== "")
    .map((s, i) => `${i + 1}. ${s}`);
  return lines.length > 0
    ? ["【已登记信源信号】", ...lines].join("\n")
    : "";
}

// ── AI 抽取端口真件工厂(host 用;测试注 fake extractSignals 不走这条)──────────────
/** 用 runStructuredNode 跑 trend.extract 结构化节点。capability 复用 topic.generate(信号抽取
 *  服务于出题,不另立能力行;未配文本模型 → resolveModelSpec 抛 → 调用方按单源失败跳过)。 */
export interface TrendExtractPortDeps {
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export function createTrendExtractPort(deps: TrendExtractPortDeps) {
  return async (
    ctx: RequestContext,
    input: { sourceName: string; pageText: string },
  ): Promise<TrendExtractOutput["signals"]> => {
    const spec = await deps.resolveModelSpec(ctx, "topic.generate");
    const { modelFor, runStructuredNode, getTemplate } = await import(
      "@creatoros/ai-worker"
    );
    const { object } = await runStructuredNode<TrendExtractOutput>({
      model: modelFor(spec),
      template: getTemplate("trend.extract"),
      facets: { sourceName: input.sourceName, pageText: input.pageText },
    });
    return object.signals;
  };
}
