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
  llm: LlmCompleter;
}

type Complete = (
  prompt: string,
  opts?: LlmCompleteOptions,
) => Promise<{ text: string }>;

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

function buildContractPrompt(context: CreativeContext): string {
  const positioning = context.positioningBrief
    ? context.positioningBrief
    : "（创作者尚未设置定位——按通用爆款逻辑产内容合同）";
  const learnings = context.learningsBrief
    ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
    : "";
  const thesis = context.thesisBrief
    ? `\n【已搭好的论点树(策划判断)】\n${context.thesisBrief}`
    : "";
  const topic = context.topic.title
    ? `\n【本期选题】${context.topic.title}${
        context.topic.angle ? `（切入：${context.topic.angle}）` : ""
      }`
    : "";
  return `你是这位创作者的「策划 agent」，负责为一期内容产一份**内容合同**——也就是这条内容与观众立下的契约。

【创作者定位】
${positioning}${learnings}${thesis}${topic}

【任务】基于定位(+论点树+选题)，从四个固定角度写清楚这条内容对观众的承诺：
- 受众定位：目标人群是谁、他们的痛点与触发场景；
- 价值主张：这条内容承诺的独特价值与差异化收益；
- 核心节奏：开场 15 秒怎么抓人、幕间过渡、高潮节点的节奏安排；
- 行动召唤：结尾的 CTA 文案与转化路径。
每个角度写 1-3 句具体、可执行的承诺，别空泛。

【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹)，形如：
{"受众定位":"...","价值主张":"...","核心节奏":"...","行动召唤":"..."}`;
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

async function draftContract(
  context: CreativeContext,
  complete: Complete,
): Promise<ContractCardDraft[]> {
  const { text } = await complete(buildContractPrompt(context), {
    schema: true,
  });
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
    const cards = await draftContract(context, (prompt, opts) =>
      deps.llm(ctx, "planning.contract", prompt, opts),
    );
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
