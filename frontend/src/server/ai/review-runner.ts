import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec } from "@creatoros/ai-worker";
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

// Parse the agent's final text into reusable learnings (parse 逻辑原样保留)。
function parseLearnings(text: string): LearningItem[] {
  return parseJsonArray(text)
    .map((raw): LearningItem | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      if (!title) return null;
      return { title, insight: typeof o.insight === "string" ? o.insight : "" };
    })
    .filter((l): l is LearningItem => l !== null);
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
    // Vercel AI SDK 路径:按 capability 解析 model + 跑 ai-worker 通用模板节点(外置 review.insights 模板),
    // 步骤事件落 ai_task_steps。弃旧 LlmCompleter。
    const spec = await deps.resolveModelSpec(ctx, "review.insights");
    const { modelFor, runTemplatedNode, REVIEW_INSIGHTS_TEMPLATE } =
      await import("@creatoros/ai-worker");
    const { text } = await runTemplatedNode({
      model: modelFor(spec),
      template: REVIEW_INSIGHTS_TEMPLATE,
      facets: reviewFacets(context),
      onStep: async (e) => {
        await deps.ai.recordStep(ctx, task.id, {
          stepNo: e.stepNo,
          kind: e.toolCalls.length > 0 ? "tool_call" : "step",
          text: e.text,
          toolCalls: e.toolCalls,
        });
      },
    });
    const items = parseLearnings(text);
    if (items.length === 0) {
      throw new Error("review-runner: agent returned no parseable learnings");
    }
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
