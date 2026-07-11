import type { RequestContext } from "@creatoros/contract";
import type { CollectResult, ReportProgress } from "./scheduled-collection-runner";
import {
  assembleCreativeContext,
  type ContextDeps,
} from "./creative-context";
import {
  assembleTrendBrief,
  type ModelSpec,
  type TrendHit,
} from "./topic-task-adapter";
// [T-235b] 已登记信源信号(通用网页信源主路 + RSS 辅路)—— 与 web 搜索并行拼热点段。
import { type TrendSourceSignal } from "./trend-source-signals";
// [T-212d] 防茧房护栏纯函数(与 candidate.service 的 rankGuardrail 同一真源;跨模块只引纯函数,
//   同 benchmark-collector 引 ../benchmark/benchmark.viral 的先例——无 IO、无 repo)。
import {
  computePreferenceAdjustment,
  rankWithExploration,
  type ActivePreference,
  type ScoredCandidate,
} from "../candidate/topic-preference-guardrail";

// [T-235a] 每天自动出题采集器(topic.daily sourceKind)—— 装进 scheduled-collection-runner 的
// collectors["topic.daily"](SPEC 2026-07-11 daily-topic-autopilot §2.1)。与其它 collector 不同:
// 它不抓抖音(不碰 douyinGateway),而是**多依据合并出一批选题**直接落 pool:
//   ① 装配依据:复用 assembleCreativeContext(定位简报 + 评论信号 + 知识库)+ trendSearch
//      (T-126 联网检索,复用 topic-task-adapter 的 buildTrendQuery/formatTrendBrief)拼多依据 brief;
//   ② 出题:注入的 generateTopics 端口(host 绑 ai-worker runTopicNode = topic.generate 同模板;
//      测试注 fake)—— 不在此重造 prompt/解析;
//   ③ 护栏排序(T-212d 硬前置):产出候选按「预测分 + 偏好调整量」过 rankWithExploration(探索位
//      保底),取 top(剩余配额)入池 —— 每天自动出题最怕越出越窄,探索位防茧房;
//   ④ 落 pool:candidates.create(source 透传模型标注的真实渠道 trend/benchmark/demand);
//   ⑤ 防灌库:≤N/天(配置化,默认 5;按当天已建候选计数,达上限诚实跳过)。
//
// 诚实降级:
//   - 未配文本模型(resolveModelSpec 抛)→ itemsNew=0 + message「未配文本模型,跳过出题」
//     (不抛不空转不编;成功终态,非失败);
//   - 当天候选已达上限 → itemsNew=0 + message 注明(幂等重触发/手动 runNow 不灌库);
//   - trendSearch 未绑/未配/失败 → 热点段空,其余依据照常(与 topic-task-adapter trend 分支同款);
//   - 出题节点抛错(模型运行时错)→ 直接上抛,runner 按普通失败落 job_run(诚实失败,不吞)。
//
// 可测性:所有 IO 经注入端口(generateTopics / listActivePreferences / countCandidatesCreatedToday /
//   createCandidate / resolveModelSpec / trendSearch + ContextDeps readers),纯逻辑可单测。

/** 防灌库默认上限(条/天)。host 可经 env CREATOROS_TOPIC_DAILY_LIMIT 覆盖。 */
export const DEFAULT_TOPIC_DAILY_LIMIT = 5;

/** 出题节点产出的一条选题(TopicItem 的消费子集;多余字段结构兼容)。 */
export interface DailyTopicItem {
  title: string;
  angle: string;
  /** 模型标注的来源渠道(trend | benchmark | demand;其它值归一 trend)。 */
  source: string;
  predictedScore: number | null;
  reason: string;
}

/** candidate source 枚举里 AI 出题可透传的三个真实渠道。 */
const AI_CANDIDATE_SOURCES = new Set(["trend", "benchmark", "demand"]);
function normalizeSource(raw: string): "trend" | "benchmark" | "demand" {
  return AI_CANDIDATE_SOURCES.has(raw)
    ? (raw as "trend" | "benchmark" | "demand")
    : "trend";
}

export interface TopicDailyCollectorDeps extends ContextDeps {
  /** 按 capability 解析文本模型;未配 → 抛(LlmCredentialError)→ 本采集器诚实跳过。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
  /** [T-126] 联网检索热点(可选)。未绑/未配/失败 → 热点段空(诚实降级,不崩)。 */
  trendSearch?: (
    ctx: RequestContext,
    query: string,
    opts?: { count?: number },
  ) => Promise<TrendHit[]>;
  /** [T-235b] 已登记信源信号(可选,host 绑 collectTrendSourceSignals)。与 trendSearch
   *  并行拉;单路失败只丢该段(诚实降级)。 */
  trendSourceSignals?: (ctx: RequestContext) => Promise<TrendSourceSignal[]>;
  /** 跑一次出题节点(host 绑 ai-worker runTopicNode + modelFor = topic.generate 同模板;测试注 fake)。
   *  抛错 = 模型运行时失败 → 采集器上抛,runner 落普通失败(诚实,不吞)。 */
  generateTopics: (
    ctx: RequestContext,
    input: {
      spec: ModelSpec;
      positioningBrief: string;
      basisBrief: string;
      knowledgeBrief?: string;
      learningsBrief?: string;
    },
  ) => Promise<DailyTopicItem[]>;
  /** [T-212d] 该用户 active 硬偏好(host 绑 candidateService.listActiveTopicPreferences)。
   *  读失败 → 空(偏好调整量 0,仍出题,不阻断)。 */
  listActivePreferences: (
    ctx: RequestContext,
  ) => Promise<ActivePreference[]>;
  /** 当天(自然日,UTC 同 dayKey 口径)已建候选数 —— 防灌库计数(host 绑 candidates 当天
   *  createdAt 计数)。 */
  countCandidatesCreatedToday: (ctx: RequestContext) => Promise<number>;
  /** 落一条候选进 pool(host 绑 candidateService.createCandidate,内部算 positioningFit)。 */
  createCandidate: (
    ctx: RequestContext,
    input: {
      title: string;
      angle?: string;
      source: "trend" | "benchmark" | "demand";
    },
  ) => Promise<{ id: string }>;
  now: () => string;
  /** 防灌库上限(条/天;缺省 DEFAULT_TOPIC_DAILY_LIMIT)。host 读 env 配置化。 */
  dailyLimit?: number;
  /** 进度上报(可选;runner 注入 → 写 job_run.progress)。 */
  report?: ReportProgress;
}

/** 排序护栏的候选投影(id=数组下标字符串,纯内存,不落库前先排)。 */
interface ScoredTopic extends ScoredCandidate {
  topic: DailyTopicItem;
}

const clamp0to100 = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * 每天自动出题:多依据合并 → 出题 → 护栏排序取 top(剩余配额)→ 候选落 pool。
 * 返回 { itemsNew: 实际入池数, itemsUpdated: 0 }(诚实计数)+ message(跳过/概要说明)。
 */
export async function collectDailyTopics(
  ctx: RequestContext,
  deps: TopicDailyCollectorDeps,
): Promise<CollectResult> {
  const report = deps.report;
  const limit = deps.dailyLimit ?? DEFAULT_TOPIC_DAILY_LIMIT;

  // ⑤ 防灌库:当天已建候选 ≥ 上限 → 诚实跳过(不出题、不调模型)。计数含手动/对标转化等
  //   全部当天候选(候选池按天的总供给闸,防各路自动供给叠加灌库)。
  report?.({ stage: "topic", processed: 0, total: null, message: "检查当日候选配额" });
  const todayCount = await deps.countCandidatesCreatedToday(ctx);
  const remaining = limit - todayCount;
  if (remaining <= 0) {
    const message = `今日已产 ${todayCount} 条候选(≥防灌库上限 ${limit}),跳过出题`;
    console.log(`[topic.daily] ${message}`);
    return { itemsNew: 0, itemsUpdated: 0, message };
  }

  // 未配文本模型 → 诚实跳过(itemsNew=0 + 注明;成功终态,非失败——没配模型不是故障)。
  let spec: ModelSpec;
  try {
    spec = await deps.resolveModelSpec(ctx, "topic.generate");
  } catch {
    const message = "未配文本模型,跳过出题";
    console.log(`[topic.daily] ${message}`);
    return { itemsNew: 0, itemsUpdated: 0, message };
  }

  // ① 多依据装配:定位简报 + 评论信号 + 知识库(assembleCreativeContext 各源 best-effort 空兜底)
  //   + 热点(trendSearch,失败诚实空)。与 topic-task-adapter 单 basis 不同,这里**合并成一份
  //   分段 brief**(每日自动出题 = 全依据合并出一批,SPEC §2.1)。
  report?.({ stage: "topic", processed: 0, total: null, message: "装配出题依据" });
  const context = await assembleCreativeContext(
    ctx,
    { projectId: null, topic: "" },
    deps,
  );
  // [T-235b] 热点段多源并行:已登记信源信号(readUrl+AI 抽取 / rss feed,主路)+ web 搜索
  //   (既有)。单路失败只丢该段;两路全空 → 热点段空(诚实降级,其余依据照常)。
  const trendBrief = await assembleTrendBrief(
    ctx,
    context.positioningBrief,
    deps,
  );
  const basisSections: string[] = [];
  if (context.signalsBrief) {
    basisSections.push(`【受众评论信号】\n${context.signalsBrief}`);
  }
  if (trendBrief) basisSections.push(trendBrief); // 自带【已登记信源信号】/【当前热点(联网检索)】段头
  const basisBrief = basisSections.join("\n\n");

  // ② 出题(topic.generate 同模板,host 绑 runTopicNode;knowledgeBrief/learningsBrief 走模板
  //   的知识库参考/经验约束 facet,与手动出题同口径)。节点抛错 → 上抛给 runner 落诚实失败。
  report?.({ stage: "topic", processed: 0, total: null, message: "AI 出题中" });
  const topics = await deps.generateTopics(ctx, {
    spec,
    positioningBrief: context.positioningBrief,
    basisBrief,
    knowledgeBrief: context.knowledgeBrief || undefined,
    learningsBrief: context.learningsBrief || undefined,
  });
  if (topics.length === 0) {
    const message = "本次未产出选题(节点空产)";
    console.log(`[topic.daily] ${message}`);
    return { itemsNew: 0, itemsUpdated: 0, message };
  }

  // ③ [T-212d] 护栏排序(硬前置):baseScore=模型预测分(缺省 50 中性),偏好调整量经
  //   computePreferenceAdjustment(±10 封顶/≥3 例硬偏好/8 周衰减)注入 adjustedScore;
  //   rankWithExploration 取 top(剩余配额),**探索位 1 保底**(被偏好压制但本身不差的题留活路)。
  let preferences: ActivePreference[] = [];
  try {
    preferences = await deps.listActivePreferences(ctx);
  } catch {
    preferences = []; // 偏好读失败 → 调整量 0(仍出题;护栏排序退化为预测分序)
  }
  const nowIso = deps.now();
  const scored: ScoredTopic[] = topics.map((topic, i) => {
    const baseScore = clamp0to100(topic.predictedScore ?? 50);
    const adjustment = computePreferenceAdjustment(
      `${topic.title} ${topic.angle}`,
      preferences,
      nowIso,
    );
    return {
      id: String(i),
      baseScore,
      adjustedScore: clamp0to100(baseScore + adjustment),
      topic,
    };
  });
  const ranked = rankWithExploration(scored, {
    limit: remaining,
    explorationSlots: 1,
  });

  // ④ 落 pool(source 透传模型标注的真实渠道)。单条失败跳过不崩整批(诚实计数)。
  let itemsNew = 0;
  for (const s of ranked) {
    try {
      await deps.createCandidate(ctx, {
        title: s.topic.title,
        angle: s.topic.angle,
        source: normalizeSource(s.topic.source),
      });
      itemsNew += 1;
      report?.({
        stage: "topic",
        processed: itemsNew,
        total: ranked.length,
        message: `已入池 ${itemsNew}/${ranked.length} 条选题`,
      });
    } catch (err) {
      console.error(
        `[topic.daily] 候选入池失败(跳过该条,不崩整批):${s.topic.title}`,
        err,
      );
    }
  }
  const message = `多依据合并出题 ${topics.length} 条,护栏排序取 ${ranked.length} 条(探索位保底),入池 ${itemsNew} 条`;
  console.log(`[topic.daily] ${message}`);
  return { itemsNew, itemsUpdated: 0, message };
}
