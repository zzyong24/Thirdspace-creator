import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, ReviewInsightsOutput } from "@creatoros/ai-worker";
import type { ContextDeps } from "./creative-context";
import { prepareReviewContext, projectReviewCandidate, normalizeLearnings, type LearningItem, type ReviewTask } from "./review-context";
export { reviewFacets, normalizeLearnings } from "./review-context";
export type { LearningItem, ReviewTask } from "./review-context";
import { parseJsonArray } from "./agent-run";

// 复盘 runner (review.analyze node, 机制③④⑤). Extracts reusable 爆款要素/方法论 from a piece
// of content (against the creator's positioning) as `learning_list` candidates; on 采纳,
// each becomes a Learning. Those Learnings then feed BACK into the next topic.generate /
// script.draft context (机制⑤ flywheel — closed via creative-context's LearningsReader).
// 仅消费当前项目真实发布数据或评论，材料缺失时不生成复盘经验。

export interface ReviewDeps extends ContextDeps {
  ai: AiService;
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
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
    const facets = await prepareReviewContext(ctx, task, deps);
    // Vercel AI SDK 路径:按 capability 解析 model + 跑 ai-worker 结构化节点(外置 review.insights 模板
    // + outputSchema)。T-025:改 runStructuredNode(generateObject 绑 schema,落空→文本兜底),让
    // 用户默认的 MiniMax 也稳定吐可解析经验列表(旧 runTemplatedNode 自由文本路径 MiniMax 下常失败)。
    // 顶层是对象,取 object.learnings 再 normalize(归一逻辑原样保留)。
    const spec = await deps.resolveModelSpec(ctx, "review.insights");
    // T-040b:运行时 getTemplate 取被服务端覆盖后的 REGISTRY 对象(而非编译期 import 快照),
    // 让 review.insights 的 system/template/tools 也能吃到 skill_config_overrides 的下发覆盖。
    const { modelFor, runStructuredNode, getTemplate } =
      await import("@creatoros/ai-worker");
    const { object } = await runStructuredNode<ReviewInsightsOutput>({
      model: modelFor(spec),
      template: getTemplate("review.insights"),
      facets,
    });
    const candidate = projectReviewCandidate(task.inputData, object);
    const items = candidate.resultData.items as LearningItem[];
    // 结构化路径单发,补一条完成步事件喂窗口步骤日志(诚实:就一步)。
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 1,
      kind: "step",
      text: `已提炼复盘经验（${items.length} 条）`,
      toolCalls: [],
    });
    await deps.ai.recordCandidate(ctx, task.id, candidate);
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
