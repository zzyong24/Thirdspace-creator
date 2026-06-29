import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
import { parseJsonArray } from "./agent-run";
import type {
  LlmCompleteOptions,
  LlmCompleter,
} from "@/server/ai/llm/provider";

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
  llm: LlmCompleter;
}

type Complete = (
  prompt: string,
  opts?: LlmCompleteOptions,
) => Promise<{ text: string }>;

export interface ReviewTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

function buildReviewPrompt(context: CreativeContext): string {
  const positioning = context.positioningBrief
    ? context.positioningBrief
    : "（未设置定位——按通用内容方法论提炼）";
  const topic = context.topic.title
    ? context.topic.title
    : "（未指定具体内容,按这个账号的整体表现提炼)";
  const priorLearnings = context.learningsBrief
    ? `\n【已有经验(避免重复)】\n${context.learningsBrief}`
    : "";
  return `你是这位创作者的「复盘 agent」。

【创作者定位】
${positioning}${priorLearnings}

【本次复盘对象】${topic}

【任务】像专业编导做数据复盘那样,提炼 3-6 条**可复用的爆款要素/方法论**作为经验沉淀(钩子、节奏、选题角度、CTA、踩坑等),要具体、可迁移到下一条内容,且与已有经验不重复。
【输出】最后只输出一个 JSON 数组,每条:{"title"(一句话方法论,如"前3秒用具体数字承诺收益"),"insight"(为什么有效/适用场景,一两句中文)}。不要多余文字、不要代码块包裹。`;
}

async function analyzeReview(
  context: CreativeContext,
  complete: Complete,
): Promise<LearningItem[]> {
  const { text } = await complete(buildReviewPrompt(context), { schema: true });
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
    const items = await analyzeReview(context, (prompt, opts) =>
      deps.llm(ctx, "review.insights", prompt, opts),
    );
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
