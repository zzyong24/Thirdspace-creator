import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, OutlineOutput } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";

// 结构方案 runner (planning.outline node, 策划 stage — 脚本阶段的入口票). It reads the
// creative context (内容合同 + 定位 + 选题) and DRAFTS ONE 结构方案: a structure
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
    // Vercel AI SDK 路径:按 capability 解析 model + 跑 ai-worker 结构化节点(外置 planning.outline 模板
    // + outputSchema)。T-025:改 runStructuredNode(generateObject 绑 schema,落空→文本兜底),让 MiniMax
    // 也稳定吐可解析结构方案(旧 runTemplatedNode 自由文本路径 MiniMax 下常失败→cancelled)。
    const spec = await deps.resolveModelSpec(ctx, "planning.outline");
    // T-040b:运行时 getTemplate 取被服务端覆盖后的 REGISTRY 对象(而非编译期 import 快照),
    // 让 planning.outline 的 system/template/tools 也能吃到 skill_config_overrides 覆盖。
    const { modelFor, runStructuredNode, getTemplate } =
      await import("@creatoros/ai-worker");
    const { object } = await runStructuredNode<OutlineOutput>({
      model: modelFor(spec),
      template: getTemplate("planning.outline"),
      facets: outlineFacets(context),
    });
    const outline = normalizeOutline(object);
    if (outline.sections.length === 0 && !outline.structureType) {
      throw new Error(
        "planning-outline-runner: agent returned no parseable outline",
      );
    }
    // 结构化路径单发,补一条完成步事件喂窗口步骤日志(诚实:就一步)。
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 1,
      kind: "step",
      text: `已生成结构方案（${outline.sections.length} 段）`,
      toolCalls: [],
    });
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
