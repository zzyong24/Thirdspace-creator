import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@/server/modules/ai";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
import type {
  LlmCompleteOptions,
  LlmCompleter,
} from "@/server/ai/llm/provider";

// 结构方案 runner (planning.outline node, 策划 stage — 脚本阶段的入口票). It reads the
// creative context (内容合同 + 论点树 + 定位 + 选题) and DRAFTS ONE 结构方案: a structure
// type, an opening strategy, the ordered paragraph/段落 arrangement, an ending, and a CTA.
// It records an `artifact_version` CANDIDATE; on 采纳, the AI service's EXISTING
// artifact_version confirm branch appends a new ArtifactVersion (createdByType:"ai") onto
// the project's `content_outline` artifact — we REUSE that path. No web tools.
//
// The contentData shape (writer ↔ reader contract):
//   `{ structureType, opening, sections: [{ label, intent }], ending, cta }`
// — what the 脚本 stage reads back as the structure the script fleshes out.

export interface PlanningOutlineDeps extends ContextDeps {
  ai: AiService;
  llm: LlmCompleter;
}

type Complete = (
  prompt: string,
  opts?: LlmCompleteOptions,
) => Promise<{ text: string }>;

export interface PlanningOutlineTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

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

function buildOutlinePrompt(context: CreativeContext): string {
  const positioning = context.positioningBrief
    ? context.positioningBrief
    : "（创作者尚未设置定位——按通用爆款逻辑产结构方案）";
  const contract = context.contractBrief
    ? `\n【已确认的内容合同】\n${context.contractBrief}`
    : "";
  const thesis = context.thesisBrief
    ? `\n【已搭好的论点树】\n${context.thesisBrief}`
    : "";
  const topic = context.topic.title
    ? `\n【本期选题】${context.topic.title}${
        context.topic.angle ? `（切入：${context.topic.angle}）` : ""
      }`
    : "";
  return `你是这位创作者的「策划 agent」，负责把内容合同 + 论点树落成一份**结构方案**——这是脚本阶段的入口票。

【创作者定位】
${positioning}${contract}${thesis}${topic}

【任务】产 **1 个**结构方案，让脚本作者照着就能写：
- 结构类型：这条内容用哪种叙事结构(如 总分总 / 问题-解决 / 故事线 / 清单体)；
- 开头策略：前 3-5 秒怎么开场抓人；
- 段落安排：按顺序列出每个段落/节拍(如 钩子→痛点→价值→卡点)，每段说清楚要完成什么；
- 结尾：怎么收束、留下什么记忆点；
- 行动召唤：结尾 CTA。

【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹)，形如：
{"structureType":"...","opening":"...","sections":[{"label":"钩子","intent":"..."},{"label":"痛点","intent":"..."}],"ending":"...","cta":"..."}`;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text) return null;
  let body = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  if (fence?.[1]) body = fence[1].trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function draftOutline(
  context: CreativeContext,
  complete: Complete,
): Promise<Outline> {
  const { text } = await complete(buildOutlinePrompt(context), {
    schema: true,
  });
  const obj = parseJsonObject(text) ?? {};
  const rawSections = Array.isArray(obj.sections) ? obj.sections : [];
  const sections = rawSections
    .map((raw): OutlineSection | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
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

export async function runPlanningOutline(
  ctx: RequestContext,
  task: PlanningOutlineTask,
  deps: PlanningOutlineDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id);
    const artifactId =
      typeof task.inputData.artifactId === "string"
        ? task.inputData.artifactId
        : "";
    if (!artifactId) {
      throw new Error("planning-outline-runner: inputData.artifactId is required");
    }
    const topic =
      typeof task.inputData.topic === "string" ? task.inputData.topic : "";
    const context = await assembleCreativeContext(
      ctx,
      { projectId: task.projectId, topic },
      deps,
    );
    const outline = await draftOutline(context, (prompt, opts) =>
      deps.llm(ctx, "planning.outline", prompt, opts),
    );
    if (outline.sections.length === 0 && !outline.structureType) {
      throw new Error(
        "planning-outline-runner: agent returned no parseable outline",
      );
    }
    await deps.ai.recordCandidate(ctx, task.id, {
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
    });
  } catch (err) {
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* already terminal */
    }
    console.error(
      `[planning-outline-runner] draft failed for task ${task.id}:`,
      err,
    );
  }
}
