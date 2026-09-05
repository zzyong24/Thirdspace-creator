import type { RequestContext } from "@creatoros/contract";
import type { OutlineOutput } from "@creatoros/ai-worker";
import type { RecordCandidateInput } from "../ai/ai.service";
import { assembleCreativeContext,type ContextDeps,type CreativeContext } from "./creative-context";

interface OutlineSection {
  label: string; // the段落/beat label, e.g. "钩子" / "痛点" / "价值"
  intent: string; // what this section must accomplish, one sentence
}

interface Outline {
  structureType: string; // e.g. "总分总" / "问题-解决" / "故事线"
  opening: string; // 开头策略
  sections: OutlineSection[]; // ordered 段落安排
  ending: string; // 结尾
  cta: string; // 行动召唤
}

// 把 CreativeContext 映射成 planning.outline 模板的 facets(占位化原 buildOutlinePrompt 的上下文块）。
function outlineFacets(
  context: CreativeContext,
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——按通用爆款逻辑产结构方案）",
    // [T-284a] 复刻补链 G1:复刻参照段(段头含诚实门,creative-context 已装配)—— 结构方案可参照原
    // 爆款的结构编排/钩子逻辑,但换本账号定位重排,不照搬原文案。非复刻/账号态为空,整段省略。
    benchmarkRef: context.benchmarkRefBrief
      ? `\n${context.benchmarkRefBrief}`
      : "",
    contract: context.contractBrief
      ? `\n【已确认的内容合同】\n${context.contractBrief}`
      : "",
    topic: context.topic.title
      ? `\n【本期选题】${context.topic.title}${
          context.topic.angle ? `（切入：${context.topic.angle}）` : ""
        }`
      : "",
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Normalize the schema-validated object into an Outline (T-025:结构化后拿的是已解析对象,
// trim + 滤掉空段的容错原样保留)。
function normalizeOutline(obj: OutlineOutput): Outline {
  const sections = (obj.sections ?? [])
    .map((o): OutlineSection | null => {
      const label = str(o.label);
      const intent = str(o.intent);
      if (!label && !intent) return null;
      return { label, intent };
    })
    .filter((s): s is OutlineSection => s !== null);
  return {
    structureType: str(obj.structureType),
    opening: str(obj.opening),
    sections,
    ending: str(obj.ending),
    cta: str(obj.cta),
  };
}

// A readable Markdown rendering (the ArtifactVersion's contentText) — used for search and
// as the flat blob the confirm branch requires (`resultData.body`).
function renderBody(outline: Outline): string {
  const lines: string[] = ["# 结构方案", ""];
  if (outline.structureType) {
    lines.push(`**结构类型**：${outline.structureType}`, "");
  }
  if (outline.opening) lines.push(`**开头策略**：${outline.opening}`, "");
  if (outline.sections.length > 0) {
    lines.push("## 段落安排", "");
    outline.sections.forEach((s, i) => {
      lines.push(
        `${i + 1}. **${s.label || `段落 ${i + 1}`}**${s.intent ? `：${s.intent}` : ""}`,
      );
    });
    lines.push("");
  }
  if (outline.ending) lines.push(`**结尾**：${outline.ending}`, "");
  if (outline.cta) lines.push(`**行动召唤**：${outline.cta}`);
  return lines.join("\n").trimEnd();
}

function renderSummary(outline: Outline): string {
  const type = outline.structureType ? `${outline.structureType} · ` : "";
  return `AI 结构方案 · ${type}${outline.sections.length} 段`;
}

function requireArtifactId(inputData:Record<string,unknown>){
  const artifactId=typeof inputData.artifactId==="string" ? inputData.artifactId : "";
  if(!artifactId)throw new Error("结构方案缺少目标文稿");
  return artifactId;
}
export async function preparePlanningOutlineContext(ctx:RequestContext,task:{projectId:string|null;inputData:Record<string,unknown>},deps:ContextDeps){
  requireArtifactId(task.inputData);
  const topic=typeof task.inputData.topic==="string" ? task.inputData.topic : "";
  return outlineFacets(await assembleCreativeContext(ctx,{projectId:task.projectId,topic},deps));
}
export function projectPlanningOutlineCandidate(inputData:Record<string,unknown>,object:OutlineOutput):RecordCandidateInput{
  const artifactId=requireArtifactId(inputData);
  const outline=normalizeOutline(object);
  if(outline.sections.length===0 && !outline.structureType)throw new Error("模型没有返回有效结构方案");
  return {
      resultType: "artifact_version",
      artifactId,
      resultData: {
        body: renderBody(outline),
        summary: renderSummary(outline),
        // Raw outline — kept so the 采纳 card preview (PlanningOutlineIsland.parseOutline)
        // renders the structure type + sections.
        structureType: outline.structureType,
        opening: outline.opening,
        sections: outline.sections,
        ending: outline.ending,
        cta: outline.cta,
        // Structured editable payload forwarded by the AI confirm branch to createVersion
        // as `contentData` (the 脚本 stage reads it back as the structure to flesh out).
        contentData: {
          structureType: outline.structureType,
          opening: outline.opening,
          sections: outline.sections,
          ending: outline.ending,
          cta: outline.cta,
        },
      },
  };
}
