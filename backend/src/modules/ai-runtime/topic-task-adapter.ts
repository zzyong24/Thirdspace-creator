import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { TopicTaskPorts } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
} from "./creative-context";
// [T-235b] 已登记信源信号(通用网页信源主路 + RSS 辅路)—— trend basis 与 web 搜索并行拼 brief。
import {
  formatTrendSourceBrief,
  type TrendSourceSignal,
} from "./trend-source-signals";
// [T-238] 信号质量画像:各依据源真实数据 → 确定性画像 → 渲成「依据质量画像」段注入出题 prompt,
// 让 AI 动态定权(评论少且噪声高→降权只取强信号;定位完整→当骨架)。评论进 brief 前滤噪
// (666/纯 emoji/夸赞不进,强信号带 ★)。chat 出题(本文件)与 topic.daily(collector)共享。
import {
  assembleSignalQualityInputs,
  buildSignalQualityProfile,
  formatFilteredSignalsBrief,
  renderSignalQualityBrief,
} from "./signal-quality";

// 选题节点 live 接线(Phase 3 A 路径)—— 把 topic.generate 任务跑在新 Agent Runtime 上,
// 而不是旧的 runClaudeAgent 订阅路径。这层只做「装配 + 注入」:解析按 capability 配的 model
// (用户在设置页配的 DeepSeek/GPT/Claude/MiniMax)、装配 positioningBrief、把 ai service 包成
// runTopicTask 的 ports。runtime / 节点 / 编排在 @creatoros/ai-worker(懒加载,避免把 AI SDK
// 顶层 bundle 进 Next server)。
//
// 没配 model(resolveModelSpec 抛 LlmCredentialError)→ cancelTask:任务进终态、前端显示
// 失败+重试,绝不假成功。配了 key 自动启用步骤日志。

const TOPIC_BASES = new Set(["positioning", "comments", "knowledge", "trend"]);
type Basis = "positioning" | "comments" | "knowledge" | "trend";
function normalizeBasis(raw: unknown): Basis {
  return typeof raw === "string" && TOPIC_BASES.has(raw)
    ? (raw as Basis)
    : "positioning";
}

export interface ModelSpec {
  apiFormat: "anthropic" | "openai_chat";
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

/** [T-182c] 由定位简报派生 trend 检索 query(有定位则贴领域,无则通用),空白归一。 */
export function buildTrendQuery(positioningBrief: string): string {
  const seed = (positioningBrief ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  return seed ? `${seed} 最新热点 趋势` : "内容创作 最新热点 趋势";
}

/** [T-182c] 把联网检索到的热点结果拼成 trend 出题依据 brief(空数组 → 空串,诚实降级)。 */
export function formatTrendBrief(hits: ReadonlyArray<TrendHit>): string {
  const lines = hits
    .map((h) => {
      const title = (h.title ?? "").trim();
      if (!title) return "";
      const snip = (h.snippet ?? "").trim();
      return snip ? `${title} —— ${snip}` : title;
    })
    .filter((s) => s !== "")
    .map((s, i) => `${i + 1}. ${s}`);
  return lines.length > 0
    ? ["【当前热点(联网检索)】", ...lines].join("\n")
    : "";
}

/**
 * [T-235b] trend 依据多源并行装配:**已登记信源信号(主路)+ 联网 web 搜索(既有)**同时拉,
 * 拼成一份分段 brief。单路失败/未绑只丢该段(Promise.allSettled,诚实降级空);两路全空 → ""
 * (节点走无热点降级路径,与旧行为一致)。topic-task-adapter 的 trend 分支与 topic-daily-collector
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

export interface TopicTask {
  id: string;
  inputData: Record<string, unknown>;
}

/** topic.generate 触发器调用入口:跑在新 Agent Runtime 上,落步骤 + 候选。 */
export async function runTopicGenerateV2(
  ctx: RequestContext,
  task: TopicTask,
  deps: TopicTaskAdapterDeps,
): Promise<void> {
  const basis = normalizeBasis(task.inputData.basis);
  try {
    // 1) 解析 model(没配 key 在这里抛错 → 下面 catch → cancelTask)。
    const spec = await deps.resolveModelSpec(ctx, "topic.generate");
    // 2) 懒加载 runtime(AI SDK 不进 Next server 顶层 bundle)。
    const { modelFor, runTopicTask } = await import("@creatoros/ai-worker");
    // 3) 装配定位简报。
    // [T-284d G4] 出题不裸奔:有项目上下文时(inputData.projectId 由创建 task 的 dispatch 带入)
    //   透传真 projectId → assembleCreativeContext 能吃到该项目的策划/立项沉淀(thesis/contract/
    //   outline/brief/materials 项目态 facet),让选题站在项目已有沉淀之上。账号态出题(topic.daily
    //   等无项目上下文)inputData 无 projectId → 保持 null(此时本就无项目态数据,行为正确不变)。
    //   注:chat 出题路径的 context 已由 chat-runner(T-039a)透传 chatContext.projectId,本片补的是
    //   ai_task(runTopicGenerateV2)这条 dispatch。
    const projectId =
      typeof task.inputData.projectId === "string" && task.inputData.projectId
        ? task.inputData.projectId
        : null;
    const context = await assembleCreativeContext(
      ctx,
      { projectId, topic: "" },
      deps,
    );
    // [T-238] 信号质量画像输入:best-effort 读评论信号/定位中心/知识库原始行(单源失败 → 空,
    // 绝不阻断出题)。signals 行同时供 comments basis 滤噪 brief 复用(不双读)。
    const qualityInputs = await assembleSignalQualityInputs(ctx, deps);
    let trendQuality = { sourceCount: 0, signalCount: 0 };
    // Sfix(basis 装配 bug):按出题依据装配对应 brief 一起喂进去,让 4 个按钮真的不同
    // (评论→评论信号 / 知识→知识库 / 热点→联网检索)。之前只传 positioningBrief,导致各 basis 出一样的题。
    let basisBrief = "";
    if (basis === "comments") {
      // [T-238] 强信号过滤:666/纯 emoji/夸赞类噪声不进 brief,强信号条目带 ★ 标注。
      // 信号读源未绑/读空 → 退回 context.signalsBrief(与旧行为一致,诚实降级)。
      basisBrief =
        qualityInputs.signals.length > 0
          ? formatFilteredSignalsBrief(qualityInputs.signals)
          : context.signalsBrief;
    } else if (basis === "knowledge") {
      basisBrief = context.knowledgeBrief;
    } else if (basis === "trend") {
      // [T-182c→T-235b] trend 出题多源并行:已登记信源信号(readUrl+AI 抽取 / rss feed,主路)
      // + T-126 联网检索(既有)拼分段 brief。单路失败只丢该段;两路全空 → 空 brief,basis="trend"
      // 仍透传给节点当降级 hint,不崩。
      const detail = await assembleTrendBriefDetailed(
        ctx,
        context.positioningBrief,
        deps,
      );
      basisBrief = detail.brief;
      trendQuality = trendQualityFromDetail(detail);
    }
    // [T-238] 画像 → 「依据质量画像」段,注入 topic.generate prompt(模板 v3 指引动态定权)。
    const signalQualityBrief = renderSignalQualityBrief(
      buildSignalQualityProfile({
        signals: qualityInputs.signals,
        positioning: qualityInputs.positioning,
        knowledge: qualityInputs.knowledge,
        trend: trendQuality,
      }),
    );
    // 4) 跑整条编排:markRunning → 跑节点(发步骤)→ recordCandidate;失败 cancelTask。
    await runTopicTask({
      taskId: task.id,
      model: modelFor(spec),
      positioningBrief: context.positioningBrief,
      basisBrief,
      // [T-062b gate-F3] KNOW-X 修真:知识库参考 + 已验证经验约束全 basis 注入;
      // basis=knowledge 时知识已进 basisBrief,置空防重复。
      knowledgeBrief: basis === "knowledge" ? undefined : context.knowledgeBrief || undefined,
      learningsBrief: context.learningsBrief || undefined,
      // [T-238] 依据质量画像段(恒非空;模板 v3 据它动态定权、reason 注明主要依据+权重理由)。
      signalQualityBrief,
      basis,
      ports: {
        markRunning: (id: string) => deps.ai.markRunning(ctx, id),
        recordStep: (id: string, step) => deps.ai.recordStep(ctx, id, step),
        recordCandidate: async (id: string, items) => {
          await deps.ai.recordCandidate(ctx, id, {
            resultType: "candidate_list",
            resultData: { items },
          });
        },
        cancelTask: async (id: string) => {
          await deps.ai.cancelTask(ctx, id);
        },
      } satisfies TopicTaskPorts,
    });
  } catch (err) {
    // model 解析 / 上下文装配在 markRunning 之前就失败 → 兜底 cancelTask(queued→cancelled)。
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* already terminal */
    }
    // eslint-disable-next-line no-console
    console.error(`[topic-v2] setup failed for task ${task.id}:`, err);
  }
}
