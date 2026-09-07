import { EXTRA_BRIEF_HEADING } from "@creatoros/ai-worker/chat";
import type { normalizeDiagnosis } from "./calibration-diagnose-runner";

// 聊天未绑定工作台 rubric，保持既有通用诊断维度。
const GENERIC_RUBRIC_DIMENSIONS: ReadonlyArray<{
  key: string;
  label: string;
  description: string;
}> = [
  { key: "hook", label: "开头钩子", description: "前 3 秒能否抓住注意力" },
  { key: "value", label: "价值密度", description: "信息/情绪价值是否扎实" },
  { key: "structure", label: "结构节奏", description: "推进是否清晰不拖沓" },
  { key: "audience_fit", label: "人群契合", description: "是否打中目标受众的痛点" },
  { key: "conversion", label: "转化引导", description: "是否自然引导到信任/转化" },
];
export const chatDiagnosisKeys = () => new Set(GENERIC_RUBRIC_DIMENSIONS.map(d => d.key));
export function prepareChatDiagnosis(
  context: { positioningBrief: string; learningsBrief: string }, selectionTitle: string,
  input: { title?: string; script?: string; extraBrief?: string },
) {
  return { capability: "calibration.diagnose" as const, facets: {
    positioning: context.positioningBrief || "（创作者尚未设置定位——按通用爆款逻辑判断）",
    learnings: context.learningsBrief ? `\n【过往复盘爆款要素】\n${context.learningsBrief}` : "",
    extraBrief: input.extraBrief ? `\n${EXTRA_BRIEF_HEADING}\n${input.extraBrief}` : "",
    rubricBlock: GENERIC_RUBRIC_DIMENSIONS.map((d, i) => `${i + 1}. ${d.label}（key=${d.key}） —— ${d.description}`).join("\n"),
    title: (input.title?.trim() ? input.title : selectionTitle) || "（未提供标题）",
    script: input.script?.trim() ? input.script : "（暂无文稿——请基于标题与定位做尽力诊断,拿不准的指标给 null）",
  } };
}
export function projectChatDiagnosis(parsed: ReturnType<typeof normalizeDiagnosis>) {
  if (!parsed) return null;
  return { dimensions: parsed.dimensions, verdict: parsed.verdict, mainIssues: parsed.mainIssues, priorityFixes: parsed.priorityFixes };
}
