import type { RequestContext } from "@creatoros/contract";
import type {
  ContextDeps,
  KnowledgeRow,
  PositioningDownstreamRules,
  PositioningFacets,
  SignalRow,
} from "./creative-context";

// [T-238] 出题依据的信号质量画像 —— 治「4 枚举依据平权」病(用户真机洞察:评论 5 条/覆盖 1 作品/
// 半数 666 类噪声,却与完整定位平起平坐,编导自招「没法设权重或剔噪声」)。
//
// 设计(SPEC 2026-07-11 daily-topic-autopilot §2.1 增强):**非硬性打分表** ——
//   · 画像(本文件,确定性纯函数,可单测):每依据源算质量指标(评论条数/覆盖作品数/强信号占比/
//     噪声占比;定位 9 facets + 5 规则完整度;知识条数/新鲜度;热点来源数/信号数);
//   · AI 判断(topic.generate 模板 v3):画像渲成「依据质量画像」段注入 prompt,模板指引按画像
//     动态定权,每条候选 reason 注明主要依据+权重理由。
// 装配层共享:topic-task-adapter(chat 出题 topic.generate)与 daily-topic-business-adapter(每日出题)
// 都经 assembleSignalQualityInputs(best-effort 读源)+ buildSignalQualityProfile(纯函数)。
//
// 另一半修法(同任务):评论**强信号过滤** —— 666/纯 emoji/夸颜值类噪声不进 brief,强信号(含问题/
// 诉求)条目带 ★ 标注,见 splitCommentSignals / formatFilteredSignalsBrief。

/** 各依据源的质量画像(全部确定性可测;AI 只做「按画像定权」的判断)。 */
import type { SignalQualityProfile } from "@creatoros/ai-worker";
export { renderSignalQualityBrief, type SignalQualityProfile } from "@creatoros/ai-worker";

// ── 评论强信号/噪声启发式(纯函数,导出供单测)─────────────────────────────────────

// 强信号 = 含问题/诉求的评论(受众真需求,出题最值钱的信号)。
const STRONG_SIGNAL_RE =
  /[?？]|怎么|如何|为什么|为啥|求教|求个|求一|求推荐|求分享|多少钱?|哪里|在哪|什么时候|能不能|可不可以|可以吗|行吗|有没有|教程|教教|教一下|想知道|想了解|请问|推荐一下|什么软件|什么工具|怎样/;

// 夸赞/灌水词(整条只有这类词 + 语气/标点 → 噪声)。
const PRAISE_ONLY_RE =
  /^(?:很|好|太|真|超|超级|真的|好好)?(?:看|听|美|帅|棒|赞|牛|强|绝|好看|漂亮|厉害|牛逼|牛批|优秀|完美|绝了|爱了|无敌|支持|加油|冲|顶|沙发|来了|学习了|收藏了|马住|码住|路过|打卡|哈+|哇+|噢+|哦+|嗯+|666*|欧耶)+(?:呀|啊|哦|呢|了|哟|喔|~+)?$/;

/** 去掉 emoji / 空白 / 常见标点后的「实质字符」。 */
function stripDecorations(text: string): string {
  return (text ?? "")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍]/gu, "")
    .replace(/[\s。，、．.!！?？~～…·\-—_+*<>()（）\[\]【】"'「」:：;；]/g, "");
}

/** [T-238] 强信号启发式:含问题/诉求(?/怎么/求/多少/为什么/如何/能不能/有没有…)。 */
export function isStrongSignal(rawText: string): boolean {
  return STRONG_SIGNAL_RE.test(rawText ?? "");
}

/** [T-238] 噪声启发式:纯 emoji / 666 类 / 纯夸赞灌水(强信号优先 —— 含问题诉求的不算噪声)。 */
export function isNoiseSignal(rawText: string): boolean {
  if (isStrongSignal(rawText)) return false;
  const core = stripDecorations(rawText ?? "");
  if (core.length === 0) return true; // 纯 emoji / 纯标点
  if (/^6+$/.test(core)) return true; // 666
  // 短评论且整条只由夸赞/灌水词构成(夸颜值/夸内容不带任何具体信息)。
  return core.length <= 12 && PRAISE_ONLY_RE.test(core);
}

/** [T-238] 评论信号三分:strong(强信号,含问题/诉求)/ normal / noise(不进 brief)。 */
export function splitCommentSignals(rows: SignalRow[]): {
  strong: SignalRow[];
  normal: SignalRow[];
  noise: SignalRow[];
} {
  const strong: SignalRow[] = [];
  const normal: SignalRow[] = [];
  const noise: SignalRow[] = [];
  for (const r of rows) {
    if (isStrongSignal(r.rawText)) strong.push(r);
    else if (isNoiseSignal(r.rawText)) noise.push(r);
    else normal.push(r);
  }
  return { strong, normal, noise };
}

/**
 * [T-238] 滤噪后的评论信号 brief:噪声(666/纯 emoji/夸颜值)不进 brief;强信号条目带「★强信号」
 * 标注排前,normal 排后。行格式沿用 creative-context.signalsBrief(「· [source] (tag) text」)。
 * 滤后全空 → 空串(下游按惯例整段省略);末尾带一行滤噪说明(诚实:AI 知道被滤掉了多少)。
 */
export function formatFilteredSignalsBrief(rows: SignalRow[]): string {
  const { strong, normal, noise } = splitCommentSignals(rows);
  const line = (s: SignalRow, star: boolean) =>
    `· ${star ? "★强信号 " : ""}[${s.source}]${s.demandTag ? ` (${s.demandTag})` : ""} ${s.rawText}`;
  const lines = [
    ...strong.map((s) => line(s, true)),
    ...normal.map((s) => line(s, false)),
  ];
  if (lines.length === 0) return "";
  if (noise.length > 0) {
    lines.push(
      `（另有 ${noise.length} 条噪声评论——666/纯表情/纯夸赞——已过滤,不作为出题依据）`,
    );
  }
  return lines.join("\n");
}

// ── 画像纯函数 ────────────────────────────────────────────────────────────────────

/** 定位中心读回形状(getPositioningCenter 返回值的消费子集)。 */
export interface PositioningCenterLike {
  profile: {
    persona: string;
    field: string;
    audience: string;
    differentiation: string;
    capabilities: string[];
    facets?: PositioningFacets;
    downstreamRules?: PositioningDownstreamRules;
  } | null;
  currentStatement: { oneLiner: string; keywords: string[] } | null;
}

export interface BuildProfileInput {
  signals: SignalRow[];
  positioning: PositioningCenterLike | null;
  knowledge: KnowledgeRow[];
  trend: { sourceCount: number; signalCount: number };
  /** 「近 30 天」判定的当前时刻(ISO;测试注入,live 缺省 now)。 */
  nowIso?: string;
}

const POSITIONING_TOTAL_FACETS = 9;
const KNOWLEDGE_RECENT_DAYS = 30;

const ratio = (part: number, total: number): number =>
  total > 0 ? part / total : 0;

/** [T-238] 质量画像纯函数:各依据源原始数据 → SignalQualityProfile(全确定性,可单测)。 */
export function buildSignalQualityProfile(
  input: BuildProfileInput,
): SignalQualityProfile {
  // 评论:条数 / 覆盖作品数(distinct publicationId)/ 强信号占比 / 噪声占比。
  const rows = input.signals ?? [];
  const { strong, noise } = splitCommentSignals(rows);
  const coveredWorks = new Set(
    rows.map((r) => r.publicationId).filter((p): p is string => Boolean(p)),
  ).size;

  // 定位:9 facets + 5 下游规则完整度。
  const p = input.positioning?.profile ?? null;
  const f = p?.facets;
  const facetValues = [
    p?.persona,
    p?.field,
    p?.audience,
    p?.differentiation,
    f?.contentScope,
    f?.avoid,
    f?.corePain,
    f?.coreValue,
    f?.tone,
  ];
  const filledFacets = facetValues.filter(
    (v) => typeof v === "string" && v.trim().length > 0,
  ).length;
  const r = p?.downstreamRules;
  const rulesFilled = [
    r?.topicRule,
    r?.scriptRule,
    r?.projectRule,
    r?.forbidRule,
    r?.expressionRule,
  ].filter((v) => typeof v === "string" && v.trim().length > 0).length;

  // 知识:条数 + 近 30 天占比(读源不带 createdAt → null,诚实「新鲜度未知」)。
  const kRows = input.knowledge ?? [];
  const dated = kRows.filter((k) => Boolean(k.createdAt));
  let recentRatio: number | null = null;
  if (dated.length > 0) {
    const now = input.nowIso ? Date.parse(input.nowIso) : Date.now();
    const cutoff = now - KNOWLEDGE_RECENT_DAYS * 24 * 60 * 60 * 1000;
    const recent = dated.filter((k) => {
      const t = Date.parse(k.createdAt as string);
      return Number.isFinite(t) && t >= cutoff;
    }).length;
    recentRatio = ratio(recent, dated.length);
  }

  return {
    comments: {
      count: rows.length,
      coveredWorks,
      strongSignalRatio: ratio(strong.length, rows.length),
      noiseRatio: ratio(noise.length, rows.length),
    },
    positioning: {
      filledFacets,
      totalFacets: POSITIONING_TOTAL_FACETS,
      rulesFilled,
      completeness: ratio(filledFacets, POSITIONING_TOTAL_FACETS),
    },
    knowledge: { count: kRows.length, recentRatio },
    trend: {
      sourceCount: Math.max(0, input.trend?.sourceCount ?? 0),
      signalCount: Math.max(0, input.trend?.signalCount ?? 0),
    },
  };
}

// ── 画像渲染(注入出题 prompt 的「依据质量画像」段)──────────────────────────────────

// ── best-effort 装配(读源 IO;chat 出题 / 每日出题共用)──────────────────────────────

export interface SignalQualityInputs {
  signals: SignalRow[];
  positioning: PositioningCenterLike | null;
  knowledge: KnowledgeRow[];
}

/**
 * [T-238] 画像输入装配:best-effort 读评论信号 / 定位中心 / 知识库(单源失败/未绑 → 空,诚实
 * 降级,绝不阻断出题)。signals 行同时供「滤噪进 brief」复用(不双读)。
 */
export async function assembleSignalQualityInputs(
  ctx: RequestContext,
  deps: Pick<ContextDeps, "signals" | "positioning" | "knowledge">,
): Promise<SignalQualityInputs> {
  let signals: SignalRow[] = [];
  if (deps.signals) {
    try {
      signals = await deps.signals.list(ctx, { limit: 30 });
    } catch {
      signals = [];
    }
  }
  let positioning: PositioningCenterLike | null = null;
  try {
    positioning = await deps.positioning.getPositioningCenter(ctx);
  } catch {
    positioning = null;
  }
  let knowledge: KnowledgeRow[] = [];
  if (deps.knowledge) {
    try {
      knowledge = await deps.knowledge.list(ctx, { limit: 40 });
    } catch {
      knowledge = [];
    }
  }
  return { signals, positioning, knowledge };
}
