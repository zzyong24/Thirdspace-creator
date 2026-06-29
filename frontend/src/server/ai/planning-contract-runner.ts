import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";

// 内容合同 runner (planning.contract node, 策划 stage). It reads the creative context
// (定位 + 选题 + 已采纳的论点树) and DRAFTS a 内容合同 — the creator's contract with the
// audience across four fixed angles: 受众定位 / 价值主张 / 核心节奏 / 行动召唤(CTA). It
// records an `artifact_version` CANDIDATE; on 采纳, the AI service's EXISTING
// artifact_version confirm branch appends a new ArtifactVersion (createdByType:"ai") onto
// the project's `content_contract` artifact — we REUSE that path (the candidate carries
// `artifactId` + `resultData.body`/`summary`/`contentData`). No web tools: the draft is
// grounded purely in positioningBrief + thesisBrief + topic.
//
// The contentData shape (writer ↔ reader contract):
//   `{ cards: [{ id, title, body }] }`
// where id ∈ "contract-audience"|"contract-value"|"contract-pacing"|"contract-cta" —
// exactly the ContractCard ids the 策划 workspace reads back (planning-workspace-data.ts).

export interface PlanningContractDeps extends ContextDeps {
  ai: AiService;
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export interface PlanningContractTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

// The four locked contract angles (id ↔ title), in the page's locked order. The agent
// fills each angle's `body`; the id/title are fixed so the read side renders the same four
// ContractCard slots (受众定位 / 价值主张 / 核心节奏 / 行动召唤).
const CONTRACT_ANGLES: ReadonlyArray<{ id: string; title: string }> = [
  { id: "contract-audience", title: "受众定位" },
  { id: "contract-value", title: "价值主张" },
  { id: "contract-pacing", title: "核心节奏" },
  { id: "contract-cta", title: "行动召唤" },
];

interface ContractCardDraft {
  id: string;
  title: string;
  body: string;
}

// 把 CreativeContext 映射成 planning.contract 模板的 facets(占位化原 buildContractPrompt 的上下文块）。
function contractFacets(
  context: CreativeContext,
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——按通用爆款逻辑产内容合同）",
    learnings: context.learningsBrief
      ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
      : "",
    thesis: context.thesisBrief
      ? `\n【已搭好的论点树(策划判断)】\n${context.thesisBrief}`
      : "",
    topic: context.topic.title
      ? `\n【本期选题】${context.topic.title}${
          context.topic.angle ? `（切入：${context.topic.angle}）` : ""
        }`
      : "",
  };
}

// Robustly pull a single JSON object out of the agent's final text (tolerate ``` fences /
// leading prose). Returns null when nothing parseable.
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

// Map the agent's title-keyed object onto the four locked ContractCard slots. The agent may
// key by Chinese title (受众定位…) or by id (contract-audience…) — accept either; drop a
// card only when its body is empty.
function pickBody(
  obj: Record<string, unknown>,
  id: string,
  title: string,
): string {
  const byTitle = obj[title];
  if (typeof byTitle === "string" && byTitle.trim()) return byTitle.trim();
  const byId = obj[id];
  if (typeof byId === "string" && byId.trim()) return byId.trim();
  return "";
}

// Parse the agent's final text into the four locked ContractCard slots (parse 逻辑原样保留)。
function parseContract(text: string): ContractCardDraft[] {
  const obj = parseJsonObject(text) ?? {};
  return CONTRACT_ANGLES.map((angle): ContractCardDraft => ({
    id: angle.id,
    title: angle.title,
    body: pickBody(obj, angle.id, angle.title),
  })).filter((card) => card.body.length > 0);
}

// A readable Markdown rendering (the ArtifactVersion's contentText) — used for search and
// as the flat blob the confirm branch requires (`resultData.body`).
function renderBody(cards: ContractCardDraft[]): string {
  const lines: string[] = ["# 内容合同", ""];
  for (const card of cards) {
    lines.push(`## ${card.title}`, card.body, "");
  }
  return lines.join("\n").trimEnd();
}

export async function runPlanningContract(
  ctx: RequestContext,
  task: PlanningContractTask,
  deps: PlanningContractDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id);
    const artifactId =
      typeof task.inputData.artifactId === "string"
        ? task.inputData.artifactId
        : "";
    if (!artifactId) {
      // The confirm path appends a NEW ArtifactVersion onto this artifact; without it the
      // candidate cannot be materialized. Fail loud (caught below → cancelTask).
      throw new Error("planning-contract-runner: inputData.artifactId is required");
    }
    const topic =
      typeof task.inputData.topic === "string" ? task.inputData.topic : "";
    const context = await assembleCreativeContext(
      ctx,
      { projectId: task.projectId, topic },
      deps,
    );
    // Vercel AI SDK 路径:按 capability 解析 model + 跑 ai-worker 通用模板节点(外置 planning.contract 模板),
    // 步骤事件落 ai_task_steps。弃旧 LlmCompleter。
    const spec = await deps.resolveModelSpec(ctx, "planning.contract");
    const { modelFor, runTemplatedNode, PLANNING_CONTRACT_TEMPLATE } =
      await import("@creatoros/ai-worker");
    const { text } = await runTemplatedNode({
      model: modelFor(spec),
      template: PLANNING_CONTRACT_TEMPLATE,
      facets: contractFacets(context),
      onStep: async (e) => {
        await deps.ai.recordStep(ctx, task.id, {
          stepNo: e.stepNo,
          kind: e.toolCalls.length > 0 ? "tool_call" : "step",
          text: e.text,
          toolCalls: e.toolCalls,
        });
      },
    });
    const cards = parseContract(text);
    if (cards.length === 0) {
      throw new Error(
        "planning-contract-runner: agent returned no parseable contract cards",
      );
    }
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "artifact_version",
      artifactId,
      resultData: {
        body: renderBody(cards),
        summary: "AI 内容合同草稿",
        // Raw cards — kept so the 采纳 card preview (PlanningContractIsland.parseCards)
        // renders the four contract angles.
        cards,
        // Structured editable payload forwarded by the AI confirm branch to createVersion
        // as `contentData` (round-trips into the 策划 内容合同 read side).
        contentData: { cards },
      },
    });
  } catch (err) {
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* already terminal */
    }
    console.error(
      `[planning-contract-runner] draft failed for task ${task.id}:`,
      err,
    );
  }
}
