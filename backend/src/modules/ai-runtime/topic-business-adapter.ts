import { assessAudienceTask } from "../candidate";
import { topicSourceRead, type TopicRecommendationContext } from "@creatoros/contract";
import { z } from "zod";
import type { RequestContext } from "@creatoros/contract";
import { structuredGenerationInputSchema } from "@creatoros/contract/execution-worker";
import {
  topicFacets,
  normalizeTopics,
  topicArraySchema,
  dailyTopicInputSchema,
} from "@creatoros/ai-worker";
import { assembleCreativeContext, type ContextDeps } from "./creative-context";
import {
  assembleSignalQualityInputs,
  buildSignalQualityProfile,
  formatFilteredSignalsBrief,
  renderSignalQualityBrief,
} from "./signal-quality";
import { normalizeTopicTaskBasis } from "./topic-basis";
import type {EnabledTrendSource} from "../trend-sources";
type TrendSourceProjection=Pick<EnabledTrendSource,"id"|"name"|"url"|"sourceType"|"domain">;
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
  topicWorkspace?: {getContext(ctx:RequestContext,projectId:string|null):Promise<TopicRecommendationContext>};
}
export async function prepareTopicGenerateContext(
  ctx: RequestContext,
  task: { projectId: string | null; inputData: Record<string, unknown> },
  deps: TopicGeneratePrepareDeps,
  options: {mode?: "daily"} = {},
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
  const basis = options.mode === "daily" ? "positioning" : normalizeTopicTaskBasis(task.inputData.basis);
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
    (basis === "comments" || options.mode === "daily")
      ? qualityInputs.signals.length
        ? formatFilteredSignalsBrief(qualityInputs.signals)
        : context.signalsBrief
      : basis === "knowledge"
        ? context.knowledgeBrief
        : "";
  let trendSources: TrendSourceProjection[] = [];
  if ((basis === "trend" || options.mode === "daily") && deps.sourceReader) {
    try {
      trendSources = await deps.sourceReader.listEnabledSources(ctx);
    } catch {
      /* 保留旧信源列表读取失败的诚实空降级。 */
    }
  }
  return topicGenerateFrozenSchema.parse({
    version: 1,
    // T-1074：新任务不再默认消费退役的网格；旧冻结输入仍由既有投影兼容。
    ...(options.mode ? {mode:options.mode} : {}),
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
/** SEMANTIC_BOUNDARY_ALLOW: 从冻结网络步骤计数，只分配执行容量，不判断内容价值。 */
export function topicAdditionalCalls(facets:Readonly<Record<string,string|undefined>>):number {
  if(facets.__dailyTopic && dailyTopicInputSchema.parse(JSON.parse(facets.__dailyTopic)).skipReason)return 0;
  const frozen=topicGenerateFrozenSchema.parse(JSON.parse(facets.__topicGenerate??'null'));
  if(frozen.basis!=='trend'&&frozen.mode!=='daily')return 0;
  return 1+(frozen.audienceTaskContext?1:0)+frozen.trendSources.reduce((sum,source)=>sum+(source.sourceType==='web'?2:1),0);
}
export function createTopicGenerateBusinessAdapter(
  deps: TopicGeneratePrepareDeps,
): StructuredBusinessAdapter {
  return {
    skillId: "topic.generate",
    capability: "topic.generate",
    additionalCalls:topicAdditionalCalls,
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
      const frozen=topicGenerateFrozenSchema.parse(
        JSON.parse(input.facets.__topicGenerate ?? "null"),
      );
      const items = normalizeTopics(topicArraySchema.parse(object).topics);
      if (!items.length) throw new Error("选题未返回可用候选");
      const projected=projectAudienceTopicItems(items,object,frozen);
      return {resultType:"candidate_list",resultData:{items:projected,...(frozen.audienceTaskContext?{originalAudienceItems:projected}:{})}};
    },
  };
}

export function projectAudienceTopicItems(items:ReturnType<typeof normalizeTopics>,object:unknown,frozen:TopicGenerateFrozen){
 const reads=z.array(topicSourceRead).parse((object as {sourceReads?:unknown}).sourceReads??[]);
 return items.map((item,index)=>({...item,...(frozen.audienceTaskContext?{proposalId:`proposal:${index}`,audienceTask:assessAudienceTask(item.audienceTask??{},frozen.audienceTaskContext,frozen.qualityNow,reads)}:{})}));
}
