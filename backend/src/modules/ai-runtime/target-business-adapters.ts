import type { RequestContext } from "@creatoros/contract";
import { structuredGenerationInputSchema } from "@creatoros/contract/execution-worker";
import { topicCardSchema, materialMatchSchema } from "@creatoros/ai-worker";
import { z } from "zod";
import {
  assembleCreativeContext,
  type ContextDeps,
  type AssetsReader,
} from "./creative-context";
import {
  enrichFacets,
  normalizeCard,
  type CandidateReader,
} from "./topic-enrich-runner";
import { matchFacets, normalizeMatches } from "./material-match-runner";
import type { StructuredBusinessAdapter } from "./structured-business-execution.service";
const targetSchema = z.object({ candidateId: z.string().min(1) });
const materialGroundingSchema = z.object({
  projectId: z.string().min(1),
  outputId: z.string(),
  assetIds: z.array(z.string().min(1)),
});
function readFacets(
  execution: Parameters<StructuredBusinessAdapter["project"]>[2],
  skillId: string,
) {
  const frozen = structuredGenerationInputSchema.parse(execution?.frozenInput);
  if (frozen.skillId !== skillId || frozen.capability !== skillId)
    throw new Error("生成任务冻结类型不一致");
  return frozen.facets;
}
export function createTopicEnrichBusinessAdapter(
  deps: ContextDeps & { candidate: CandidateReader },
): StructuredBusinessAdapter {
  return {
    skillId: "topic.enrich",
    capability: "topic.enrich",
    async prepare(ctx, task) {
      const target = targetSchema.parse(task.inputData);
      const subject = await deps.candidate.get(ctx, target.candidateId);
      const context = await assembleCreativeContext(
        ctx,
        { projectId: null, topic: subject.title, angle: subject.angle },
        deps,
      );
      return {
        ...enrichFacets(context, subject),
        __topicEnrichTarget: JSON.stringify(target),
      };
    },
    project(_input, object, execution) {
      const target = targetSchema.parse(
        JSON.parse(
          readFacets(execution, "topic.enrich").__topicEnrichTarget ?? "null",
        ),
      );
      const card = normalizeCard(topicCardSchema.parse(object));
      if (!card) throw new Error("选题补全未返回可用选题卡");
      return { resultType: "topic_card", resultData: { ...target, card } };
    },
  };
}
export function createMaterialMatchBusinessAdapter(
  deps: ContextDeps & {
    assets: AssetsReader;
    assertProject(ctx: RequestContext, projectId: string): Promise<void>;
  },
): StructuredBusinessAdapter {
  return {
    skillId: "material.match",
    capability: "material.match",
    async prepare(ctx, task) {
      if (!task.projectId) throw new Error("素材匹配缺少所属项目");
      await deps.assertProject(ctx, task.projectId);
      // 同一份真实读取同时生成提示上下文和允许ID，避免两次读取之间的素材变化。
      let rows: Awaited<ReturnType<AssetsReader["list"]>> = [];
      try {
        rows = await deps.assets.list(ctx);
      } catch {
        /* 保留原可选素材上下文的空值降级。 */
      }
      const topic =
        typeof task.inputData.topic === "string" ? task.inputData.topic : "";
      const context = await assembleCreativeContext(
        ctx,
        { projectId: task.projectId, topic },
        { ...deps, assets: { list: async () => rows } },
      );
      return {
        ...matchFacets(context, topic),
        __materialMatchGrounding: JSON.stringify({
          projectId: task.projectId,
          outputId:
            typeof task.inputData.outputId === "string"
              ? task.inputData.outputId
              : "",
          assetIds: rows.map((row) => row.id),
        }),
      };
    },
    project(_input, object, execution) {
      const grounding = materialGroundingSchema.parse(
        JSON.parse(
          readFacets(execution, "material.match").__materialMatchGrounding ??
            "null",
        ),
      );
      // SEMANTIC_BOUNDARY_ALLOW: 仅验证真实ID范围；素材相关性、角色和理由仍由模型决定。
      const allowed = new Set(grounding.assetIds);
      const matches = normalizeMatches(
        materialMatchSchema.parse(object).matches,
      ).filter((match) => allowed.has(match.assetId));
      if (!matches.length) throw new Error("素材匹配未返回可用的真实素材");
      return {
        resultType: "material_link_list",
        resultData: { matches, outputId: grounding.outputId },
      };
    },
  };
}
