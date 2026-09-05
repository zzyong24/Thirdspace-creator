import type { RequestContext } from "@creatoros/contract";
import { researchFacets, formatUserMaterialFacet } from "@creatoros/ai-worker";
import { assembleCreativeContext, type ContextDeps } from "./creative-context";
export type { MaterialItem } from "@creatoros/ai-worker";
export type GatherDeps = Pick<
  ContextDeps,
  "positioning" | "projectMaterials"
> & {
  assertProject?(ctx: RequestContext, projectId: string): Promise<void>;
};
export interface GatherTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}
/** 仅读取真实上下文；执行及候选生命周期归持久 Worker 宿主。 */
export async function prepareResearchGatherContext(
  ctx: RequestContext,
  task: Pick<GatherTask, "projectId" | "inputData">,
  deps: GatherDeps,
) {
  if (task.projectId) {
    if (!deps.assertProject) throw new Error("素材搜集缺少项目归属读取端口");
    await deps.assertProject(ctx, task.projectId);
  }
  const topic =
    typeof task.inputData.topic === "string" ? task.inputData.topic : "";
  const angle =
    typeof task.inputData.angle === "string" ? task.inputData.angle : "";
  const context = await assembleCreativeContext(
    ctx,
    { projectId: task.projectId, topic, angle },
    { positioning: deps.positioning, projectMaterials: deps.projectMaterials },
  );
  return researchFacets({
    positioningBrief: context.positioningBrief,
    topicTitle: context.topic.title,
    topicAngle: context.topic.angle || undefined,
    userMaterialFacet: context.userMaterialHardBrief
      ? formatUserMaterialFacet(context.userMaterialHardBrief)
      : undefined,
  });
}
