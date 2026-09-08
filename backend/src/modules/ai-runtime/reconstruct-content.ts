import type {ReconstructProjectOutput} from "@creatoros/ai-worker";
import type {CreativeContext} from "./creative-context";

export function reconstructFacets(
  context: CreativeContext,
  transcript: string,
  metrics: string,
  title: string,
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——按通用短视频逻辑反推）",
    transcript,
    metrics: metrics || "（暂无真实指标）",
    title: title || "（无标题）",
  };
}

export function renderResearch(research: ReconstructProjectOutput["research"]): {
  contentText: string;
  contentData: Record<string, unknown>;
} {
  const lines: string[] = ["# 研究重建（AI 历史反推）", ""];
  lines.push(`## 核心主题\n${research.coreTopic}`, "");
  if (research.keyPoints.length > 0) {
    lines.push("## 要点");
    for (const p of research.keyPoints) lines.push(`- ${p}`);
    lines.push("");
  }
  if (research.cases.length > 0) {
    lines.push("## 案例");
    for (const c of research.cases)
      lines.push(`- **${c.title}**${c.note ? `：${c.note}` : ""}`);
    lines.push("");
  }
  if (research.dataPoints.length > 0) {
    lines.push("## 数据点");
    for (const d of research.dataPoints)
      lines.push(`- ${d.stat}${d.note ? `（${d.note}）` : ""}`);
    lines.push("");
  }
  return {
    contentText: lines.join("\n").trimEnd(),
    contentData: { ...research, reconstructed: true },
  };
}
