import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, ReviewInsightsOutput } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
import { parseJsonArray } from "./agent-run";

// 复盘 runner (review.analyze node, 机制③④⑤). Extracts reusable 爆款要素/方法论 from a piece
// of content (against the creator's positioning) as `learning_list` candidates; on 采纳,
// each becomes a Learning. Those Learnings then feed BACK into the next topic.generate /
// script.draft context (机制⑤ flywheel — closed via creative-context's LearningsReader).
// v1 reasons from positioning + the content topic (metrics are mock this wave); richer
// metric-grounded attribution lands once Analytics snapshots are real.

export interface LearningItem {
  title: string;
  insight: string;
}

export interface ReviewDeps extends ContextDeps {
  ai: AiService;
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export interface ReviewTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

// 把 CreativeContext 映射成 review.insights 模板的 facets(占位化原 buildReviewPrompt 的上下文块）。
// subject(本次复盘对象)是必需 facet,沿用原 prompt 的兜底文案(未指定内容时按账号整体表现提炼)。
function reviewFacets(
  context: CreativeContext,
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（未设置定位——按通用内容方法论提炼）",
    priorLearnings: context.learningsBrief
      ? `\n【已有经验(避免重复)】\n${context.learningsBrief}`
      : "",
    subject: context.topic.title
      ? context.topic.title
      : "（未指定具体内容,按这个账号的整体表现提炼)",
  };
}

// 导出 facets 映射 + parse 供 ChatBox 的 review.analyze 工具复用(对话里产经验候选,与本 runner
// 同一份模板 + parse,不造影子)。
export { reviewFacets };

// Normalize the schema-validated learnings array into reusable learnings (T-025:结构化后拿的是
// 已解析对象,归一逻辑原样保留 —— trim、滤掉缺 title 的项)。
function normalizeLearnings(
  learnings: ReviewInsightsOutput["learnings"],
): LearningItem[] {
  return (learnings ?? [])
    .map((o): LearningItem | null => {
      const title = (o.title ?? "").trim();
      if (!title) return null;
      return { title, insight: o.insight ?? "" };
    })
    .filter((l): l is LearningItem => l !== null);
}

// Tolerant text → learnings parse for the CHAT path (chat-runner 的 analyzeReview 工具仍走
// runTemplatedNode 拿自由文本)。结构化 runner 已改走 normalizeLearnings(拿已校验数组);这里是
// 文本兜底薄壳:宽容抽 JSON 数组 → 交给同一 normalizeLearnings(容错单点收口)。
export function parseLearnings(text: string): LearningItem[] {
  return normalizeLearnings(parseJsonArray(text) as ReviewInsightsOutput["learnings"]);
}

export async function runReviewAnalyze(
  ctx: RequestContext,
  task: ReviewTask,
  deps: ReviewDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id);
    const topic =
      typeof task.inputData.topic === "string" ? task.inputData.topic : "";
    const context = await assembleCreativeContext(
      ctx,
      { projectId: task.projectId, topic },
      deps,
    );
    // Vercel AI SDK 路径:按 capability 解析 model + 跑 ai-worker 结构化节点(外置 review.insights 模板
    // + outputSchema)。T-025:改 runStructuredNode(generateObject 绑 schema,落空→文本兜底),让
    // 用户默认的 MiniMax 也稳定吐可解析经验列表(旧 runTemplatedNode 自由文本路径 MiniMax 下常失败)。
    // 顶层是对象,取 object.learnings 再 normalize(归一逻辑原样保留)。
    const spec = await deps.resolveModelSpec(ctx, "review.insights");
    const { modelFor, runStructuredNode, REVIEW_INSIGHTS_TEMPLATE } =
      await import("@creatoros/ai-worker");
    const { object } = await runStructuredNode<ReviewInsightsOutput>({
      model: modelFor(spec),
      template: REVIEW_INSIGHTS_TEMPLATE,
      facets: reviewFacets(context),
    });
    const items = normalizeLearnings(object.learnings);
    if (items.length === 0) {
      throw new Error("review-runner: agent returned no parseable learnings");
    }
    // 结构化路径单发,补一条完成步事件喂窗口步骤日志(诚实:就一步)。
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 1,
      kind: "step",
      text: `已提炼复盘经验（${items.length} 条）`,
      toolCalls: [],
    });
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "learning_list",
      resultData: { items },
    });
  } catch (err) {
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* already terminal */
    }
    // eslint-disable-next-line no-console
    console.error(`[review-runner] analyze failed for task ${task.id}:`, err);
  }
}
