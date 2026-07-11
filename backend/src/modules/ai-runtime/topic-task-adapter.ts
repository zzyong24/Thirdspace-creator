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
  const [signalsSettled, searchSettled] = await Promise.allSettled([
    deps.trendSourceSignals
      ? deps.trendSourceSignals(ctx)
      : Promise.resolve([]),
    deps.trendSearch
      ? deps.trendSearch(ctx, buildTrendQuery(positioningBrief), { count: 8 })
      : Promise.resolve([]),
  ]);
  const sections: string[] = [];
  if (signalsSettled.status === "fulfilled") {
    const brief = formatTrendSourceBrief(signalsSettled.value);
    if (brief) sections.push(brief);
  } // rejected → 信源段空(collectTrendSourceSignals 内已单源容错,这里兜整体失败)
  if (searchSettled.status === "fulfilled") {
    const brief = formatTrendBrief(searchSettled.value);
    if (brief) sections.push(brief);
  } // rejected(未配 web.search / 检索失败)→ 搜索段空,诚实降级
  return sections.join("\n\n");
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
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: "" },
      deps,
    );
    // Sfix(basis 装配 bug):按出题依据装配对应 brief 一起喂进去,让 4 个按钮真的不同
    // (评论→评论信号 / 知识→知识库 / 热点→联网检索)。之前只传 positioningBrief,导致各 basis 出一样的题。
    let basisBrief = "";
    if (basis === "comments") {
      basisBrief = context.signalsBrief;
    } else if (basis === "knowledge") {
      basisBrief = context.knowledgeBrief;
    } else if (basis === "trend") {
      // [T-182c→T-235b] trend 出题多源并行:已登记信源信号(readUrl+AI 抽取 / rss feed,主路)
      // + T-126 联网检索(既有)拼分段 brief。单路失败只丢该段;两路全空 → 空 brief,basis="trend"
      // 仍透传给节点当降级 hint,不崩。
      basisBrief = await assembleTrendBrief(ctx, context.positioningBrief, deps);
    }
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
