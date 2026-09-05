import type { RequestContext } from "@creatoros/contract";
import { structuredGenerationInputSchema } from "@creatoros/contract/execution-worker";
import {
  topicFacets,
  normalizeTopics,
  topicArraySchema,
} from "@creatoros/ai-worker";
import { assembleCreativeContext, type ContextDeps } from "./creative-context";
import {
  assembleSignalQualityInputs,
  buildSignalQualityProfile,
  formatFilteredSignalsBrief,
  renderSignalQualityBrief,
} from "./signal-quality";
import { normalizeTopicTaskBasis } from "./topic-task-adapter";
import type { TrendSourceProjection } from "./trend-source-signals";
import type { StructuredBusinessAdapter } from "./structured-business-execution.service";

export {
  topicGenerateFrozenSchema,
  type TopicGenerateFrozen,
} from "@creatoros/ai-worker";
import {
  topicGenerateFrozenSchema,
  type TopicGenerateFrozen,
} from "@creatoros/ai-worker";
export interface TopicGeneratePrepareDeps extends ContextDeps {
  assertProject?(ctx: RequestContext, projectId: string): Promise<void>;
  sourceReader?: {
    listEnabledSources(ctx: RequestContext): Promise<TrendSourceProjection[]>;
  };
  now?: () => string;
}
export async function prepareTopicGenerateContext(
  ctx: RequestContext,
  task: { projectId: string | null; inputData: Record<string, unknown> },
  deps: TopicGeneratePrepareDeps,
): Promise<TopicGenerateFrozen> {
  const inputProject =
    typeof task.inputData.projectId === "string" && task.inputData.projectId
      ? task.inputData.projectId
      : null;
  if (task.projectId && inputProject && task.projectId !== inputProject)
    throw new Error("选题项目归属不一致");
  const projectId = task.projectId || inputProject;
  if (projectId) {
    if (!deps.assertProject) throw new Error("选题缺少项目归属读取端口");
    await deps.assertProject(ctx, projectId);
  }
  const basis = normalizeTopicTaskBasis(task.inputData.basis);
  const context = await assembleCreativeContext(
    ctx,
    { projectId, topic: "" },
    deps,
  );
  const qualityInputs = await assembleSignalQualityInputs(ctx, deps);
  const qualityNow = deps.now?.() ?? new Date().toISOString();
  const qualityProfile = buildSignalQualityProfile({
    ...qualityInputs,
    trend: { sourceCount: 0, signalCount: 0 },
    nowIso: qualityNow,
  });
  const basisBrief =
    basis === "comments"
      ? qualityInputs.signals.length
        ? formatFilteredSignalsBrief(qualityInputs.signals)
        : context.signalsBrief
      : basis === "knowledge"
        ? context.knowledgeBrief
        : "";
  let trendSources: TrendSourceProjection[] = [];
  if (basis === "trend" && deps.sourceReader) {
    try {
      trendSources = await deps.sourceReader.listEnabledSources(ctx);
    } catch {
      /* 保留旧信源列表读取失败的诚实空降级。 */
    }
  }
  return topicGenerateFrozenSchema.parse({
    version: 1,
    basis,
    projectId,
    context: {
      positioningBrief: context.positioningBrief,
      knowledgeBrief: context.knowledgeBrief,
      learningsBrief: context.learningsBrief,
    },
    qualityInputs,
    qualityNow,
    qualityProfile,
    basisBrief,
    trendSources: trendSources.map(({ id, name, url, domain, sourceType }) => ({
      id,
      name,
      url,
      domain,
      sourceType,
    })),
  });
}
export function createTopicGenerateBusinessAdapter(
  deps: TopicGeneratePrepareDeps,
): StructuredBusinessAdapter {
  return {
    skillId: "topic.generate",
    capability: "topic.generate",
    async prepare(ctx, task) {
      const frozen = await prepareTopicGenerateContext(ctx, task, deps);
      return {
        ...topicFacets(
          frozen.context.positioningBrief,
          frozen.basis,
          frozen.basisBrief,
          frozen.basis === "knowledge"
            ? undefined
            : frozen.context.knowledgeBrief || undefined,
          frozen.context.learningsBrief || undefined,
          renderSignalQualityBrief(frozen.qualityProfile),
        ),
        __topicGenerate: JSON.stringify(frozen),
      };
    },
    project(_input, object, execution) {
      const input = structuredGenerationInputSchema.parse(
        execution?.frozenInput,
      );
      if (
        input.skillId !== "topic.generate" ||
        input.capability !== "topic.generate"
      )
        throw new Error("选题冻结任务类型不一致");
      topicGenerateFrozenSchema.parse(
        JSON.parse(input.facets.__topicGenerate ?? "null"),
      );
      const items = normalizeTopics(topicArraySchema.parse(object).topics);
      if (!items.length) throw new Error("选题未返回可用候选");
      return { resultType: "candidate_list", resultData: { items } };
    },
  };
}
