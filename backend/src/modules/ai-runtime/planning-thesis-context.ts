import type { RequestContext } from "@creatoros/contract";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
function thesisFacets(
  context: CreativeContext,
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——按通用爆款逻辑构建论点树）",
    // [T-270] 立项硬锚(项目态;creative-context 已装配含「必须遵守」段头,账号态为空则整段省略)。
    projectBriefHard: context.projectBriefHard
      ? `\n${context.projectBriefHard}`
      : "",
    // [T-284a] 复刻补链 G1:复刻参照段(段头含诚实门,creative-context 已装配)—— core 论点可借鉴原
    // 爆款「为什么爆」的底层逻辑,但换本账号定位立论,不照搬。非复刻/账号态为空,整段省略。
    benchmarkRef: context.benchmarkRefBrief
      ? `\n${context.benchmarkRefBrief}`
      : "",
    learnings: context.learningsBrief
      ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
      : "",
    // [T-269] 用户素材=论点/证据的可溯弹药(此前论点树生成链完全没传素材)。
    userMaterialHard: context.userMaterialHardBrief
      ? `\n${context.userMaterialHardBrief}`
      : "",
    userMaterialRef: context.userMaterialRefBrief
      ? `\n【参考素材(AI 搜集,参考级)】\n${context.userMaterialRefBrief}`
      : "",
    topic: context.topic.title
      ? `\n【本期选题】${context.topic.title}${context.topic.angle ? `（切入：${context.topic.angle}）` : ""}`
      : "",
  };
}
/** 完整复用旧论点树上下文；只读取已归属资料，不生成内容或写入工件。 */
export async function preparePlanningThesisContext(
  ctx: RequestContext,
  task: {
    projectId: string | null;
    inputData: Record<string, unknown>;
  },
  deps: ContextDeps,
) {
  if (!task.projectId)
    throw new Error("planning-runner: projectId is required");
  const topic =
    typeof task.inputData.topic === "string" ? task.inputData.topic : "";
  const context = await assembleCreativeContext(
    ctx,
    { projectId: task.projectId, topic },
    deps,
  );
  return {
    facets: thesisFacets(context),
    grounding: [
      context.positioningBrief,
      context.projectBriefHard,
      context.userMaterialHardBrief,
      context.userMaterialRefBrief,
      context.knowledgeBrief,
      context.topic.title,
      context.topic.angle,
    ],
  };
}
