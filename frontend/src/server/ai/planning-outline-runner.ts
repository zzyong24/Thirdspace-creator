import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";

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
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

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

// 把 CreativeContext 映射成 planning.outline 模板的 facets(占位化原 buildOutlinePrompt 的上下文块）。
function outlineFacets(
  context: CreativeContext,
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——按通用爆款逻辑产结构方案）",
    contract: context.contractBrief
      ? `\n【已确认的内容合同】\n${context.contractBrief}`
      : "",
    thesis: context.thesisBrief
      ? `\n【已搭好的论点树】\n${context.thesisBrief}`
      : "",
    topic: context.topic.title
      ? `\n【本期选题】${context.topic.title}${
          context.topic.angle ? `（切入：${context.topic.angle}）` : ""
        }`
      : "",
  };
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

// Parse the agent's final text into an Outline (parse 逻辑原样保留,只换"拿 text"的来源)。
function parseOutline(text: string): Outline {
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
    // Vercel AI SDK 路径:按 capability 解析 model + 跑 ai-worker 通用模板节点(外置 planning.outline 模板),
    // 步骤事件落 ai_task_steps。弃旧 LlmCompleter。
    const spec = await deps.resolveModelSpec(ctx, "planning.outline");
    const { modelFor, runTemplatedNode, PLANNING_OUTLINE_TEMPLATE } =
      await import("@creatoros/ai-worker");
    const { text } = await runTemplatedNode({
      model: modelFor(spec),
      template: PLANNING_OUTLINE_TEMPLATE,
      facets: outlineFacets(context),
      onStep: async (e) => {
        await deps.ai.recordStep(ctx, task.id, {
          stepNo: e.stepNo,
          kind: e.toolCalls.length > 0 ? "tool_call" : "step",
          text: e.text,
          toolCalls: e.toolCalls,
        });
      },
    });
    const outline = parseOutline(text);
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
