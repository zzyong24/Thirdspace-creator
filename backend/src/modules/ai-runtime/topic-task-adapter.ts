import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ContextDeps } from "./creative-context";
// [T-235b] 已登记信源信号(通用网页信源主路 + RSS 辅路)—— trend basis 与 web 搜索并行拼 brief。
import {
  formatTrendSourceBrief,
  type TrendSourceSignal,
} from "./trend-source-signals";
// 聊天和每日选题仍共享趋势读取组装；持久任务执行由 topic-business-adapter + Worker 承担。

const TOPIC_BASES = new Set(["positioning", "comments", "knowledge", "trend"]);
type Basis = "positioning" | "comments" | "knowledge" | "trend";
export function normalizeTopicTaskBasis(raw: unknown): Basis {
  return typeof raw === "string" && TOPIC_BASES.has(raw)
    ? (raw as Basis)
    : "positioning";
}

export interface ModelSpec {
  apiFormat: "anthropic" | "openai_chat" | "openai_responses";
  baseUrl: string | null;
  model: string;
  token: string;
}

/** [T-182c] trend 出题联网检索命中项(T-126 SearchResult 的子集,只取出题所需字段)。 */
export interface TrendHit {
  title: string;
  snippet?: string;
}

export interface TopicTaskAdapterDeps extends ContextDeps {
  ai: AiService;
  /** 按 capability 解析出可用 model 规格;无可用 key 时抛错(LlmCredentialError)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
  // [T-182c] trend 出题依据检索端口 —— 复用 T-126 联网检索(rss 免 key / browser 无头采集,
  // 组合根绑 searchWebPort)。抓当前热点拼进 basisBrief 喂 topic.generate,不在此重造采集器。
  // 未绑 / 未配 web.search / 检索失败 → 空 brief,靠 basis="trend" 让节点走无热点降级路径,不崩。
  trendSearch?: (
    ctx: RequestContext,
    query: string,
    opts?: { count?: number },
  ) => Promise<TrendHit[]>;
  // [T-235b] 已登记信源信号端口(可选,host 绑 collectTrendSourceSignals:web 型 readUrl+AI
  // 抽取 / rss 型 feed 解析)。与 trendSearch **并行**拉,单路失败只丢该段(诚实降级)。
  trendSourceSignals?: (ctx: RequestContext) => Promise<TrendSourceSignal[]>;
}

// 共享纯格式化函数：任务、聊天和每日选题使用同一实现。
import { buildTrendQuery, formatTrendBrief } from "@creatoros/ai-worker";
export { buildTrendQuery, formatTrendBrief } from "@creatoros/ai-worker";

/**
 * [T-235b] trend 依据多源并行装配:**已登记信源信号(主路)+ 联网 web 搜索(既有)**同时拉,
 * 拼成一份分段 brief。单路失败/未绑只丢该段(Promise.allSettled,诚实降级空);两路全空 → ""
 * (节点走无热点降级路径,与旧行为一致)。topic-task-adapter 的 trend 分支与 daily-topic-business-adapter
 * 共用(端口形状兼容,additive 扩展)。
 */
export async function assembleTrendBrief(
  ctx: RequestContext,
  positioningBrief: string,
  deps: Pick<TopicTaskAdapterDeps, "trendSearch" | "trendSourceSignals">,
): Promise<string> {
  return (await assembleTrendBriefDetailed(ctx, positioningBrief, deps)).brief;
}

/** [T-245] trend brief 装配明细(additive):除 brief 外带两路各自拉到的条数,供调用方(对话
 *  编导 topic.generate)在信源信号为空时产诚实降级注记(「本次未拉到信源信号」),不猜不编。 */
export interface TrendBriefDetail {
  /** 分段 brief(与 assembleTrendBrief 返回值完全一致;两路全空 → "")。 */
  brief: string;
  /** 已登记信源实拉到的信号条数(端口未绑/整体失败 → 0,诚实)。 */
  sourceSignalCount: number;
  /** web 联网搜索命中条数(未配/失败 → 0,诚实)。 */
  searchHitCount: number;
  /** [T-238] 实拉到信号的 distinct 信源名个数(质量画像「几路信源」用;additive)。 */
  sourceNameCount: number;
}

export async function assembleTrendBriefDetailed(
  ctx: RequestContext,
  positioningBrief: string,
  deps: Pick<TopicTaskAdapterDeps, "trendSearch" | "trendSourceSignals">,
): Promise<TrendBriefDetail> {
  const [signalsSettled, searchSettled] = await Promise.allSettled([
    deps.trendSourceSignals
      ? deps.trendSourceSignals(ctx)
      : Promise.resolve([]),
    deps.trendSearch
      ? deps.trendSearch(ctx, buildTrendQuery(positioningBrief), { count: 8 })
      : Promise.resolve([]),
  ]);
  const sections: string[] = [];
  let sourceSignalCount = 0;
  let searchHitCount = 0;
  let sourceNameCount = 0;
  if (signalsSettled.status === "fulfilled") {
    sourceSignalCount = signalsSettled.value.length;
    // [T-238] distinct 信源名(质量画像「几路信源」;空名不计)。
    sourceNameCount = new Set(
      signalsSettled.value
        .map((s) => (s.sourceName ?? "").trim())
        .filter(Boolean),
    ).size;
    const brief = formatTrendSourceBrief(signalsSettled.value);
    if (brief) sections.push(brief);
  } // rejected → 信源段空(collectTrendSourceSignals 内已单源容错,这里兜整体失败)
  if (searchSettled.status === "fulfilled") {
    searchHitCount = searchSettled.value.length;
    const brief = formatTrendBrief(searchSettled.value);
    if (brief) sections.push(brief);
  } // rejected(未配 web.search / 检索失败)→ 搜索段空,诚实降级
  return {
    brief: sections.join("\n\n"),
    sourceSignalCount,
    searchHitCount,
    sourceNameCount,
  };
}

/** [T-238] 由 trend 装配明细派生画像的 trend 指标:信源路数 = distinct 已登记信源名 + web 搜索
 *  算一路(有命中才算);信号总数 = 两路条数之和。纯函数,导出供单测。 */
export function trendQualityFromDetail(detail: TrendBriefDetail): {
  sourceCount: number;
  signalCount: number;
} {
  return {
    sourceCount: detail.sourceNameCount + (detail.searchHitCount > 0 ? 1 : 0),
    signalCount: detail.sourceSignalCount + detail.searchHitCount,
  };
}
