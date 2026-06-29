import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
import type {
  LlmCompleteOptions,
  LlmCompleter,
} from "@/server/ai/llm/provider";

// 论点树 runner (planning.thesis node, 机制③④). Mirrors script-runner but DRAFTS a
// thesis tree (论点树) from the creative context, then records an `artifact_version`
// CANDIDATE. On 采纳, the AI service's EXISTING artifact_version confirm branch appends
// a new ArtifactVersion (createdByType:"ai") onto the project's `thesis_tree` artifact —
// we REUSE that path (the candidate carries `artifactId` + `resultData.body`/`summary`/
// `contentData`). No web tools: the draft is grounded purely in positioningBrief +
// topic + learningsBrief.
//
// The contentData shape (writer ↔ reader contract): `{ nodes: [{ column, title, summary }] }`
// where column ∈ "core"|"support"|"evidence"|"counter" — exactly the ThesisNodeView shape
// the planning workspace reads back (planning-workspace-data.ts).

export interface PlanningDeps extends ContextDeps {
  ai: AiService;
  llm: LlmCompleter;
}

type Complete = (
  prompt: string,
  opts?: LlmCompleteOptions,
) => Promise<{ text: string }>;

export interface PlanningTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

// One thesis-tree branch — the agent's JSON branch element.
type ThesisColumn = "support" | "evidence" | "counter";

interface ThesisBranch {
  column: ThesisColumn;
  title: string;
  summary: string;
}

// The parsed thesis tree the agent returns: a single core thesis + the branches.
interface ThesisTree {
  core: { title: string; summary: string };
  branches: ThesisBranch[];
}

// A serialized node as it rides into contentData.nodes (writer side of the contract).
interface ThesisNode {
  column: "core" | ThesisColumn;
  title: string;
  summary: string;
}

function buildThesisPrompt(context: CreativeContext): string {
  const positioning = context.positioningBrief
    ? context.positioningBrief
    : "（创作者尚未设置定位——按通用爆款逻辑构建论点树）";
  const learnings = context.learningsBrief
    ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
    : "";
  const topic = context.topic.title
    ? `\n【本期选题】${context.topic.title}${
        context.topic.angle ? `（切入：${context.topic.angle}）` : ""
      }`
    : "";
  return `你是这位创作者的「策划 agent」，负责为一期内容搭建**论点树**。

【创作者定位】
${positioning}${learnings}${topic}

【任务】基于定位(+过往爆款要素)+选题,构建一棵**论点树**:
- 一个**核心论点**(core):整期内容要立的那个观点,一句话标题 + 一句话展开。
- 3-6 个**分支**,每个分支属于以下三类之一:
  · support(支撑依据):为核心论点提供逻辑支撑的子论点;
  · evidence(证据):可引用的事实/数据/案例;
  · counter(反驳):预判受众的反对意见并给出回应。
分支要覆盖至少 support / evidence / counter 三类,使论点树立得住、辩得赢。

【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹),形如:
{"core":{"title":"核心论点标题","summary":"一句话展开"},
 "branches":[{"column":"support","title":"...","summary":"..."},
             {"column":"evidence","title":"...","summary":"..."},
             {"column":"counter","title":"...","summary":"..."}]}`;
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

function normalizeColumn(raw: unknown): ThesisColumn | null {
  if (raw === "support" || raw === "evidence" || raw === "counter") return raw;
  if (raw === "支撑" || raw === "支持" || raw === "支持依据") return "support";
  if (raw === "证据") return "evidence";
  if (raw === "反驳" || raw === "反对") return "counter";
  return null;
}

async function draftThesisTree(
  context: CreativeContext,
  complete: Complete,
): Promise<ThesisTree> {
  const { text } = await complete(buildThesisPrompt(context), { schema: true });
  const obj = parseJsonObject(text);
  const coreRaw = (obj?.core ?? {}) as Record<string, unknown>;
  const core = {
    title: typeof coreRaw.title === "string" ? coreRaw.title.trim() : "",
    summary: typeof coreRaw.summary === "string" ? coreRaw.summary.trim() : "",
  };
  const branchesRaw = Array.isArray(obj?.branches) ? obj!.branches : [];
  const branches = branchesRaw
    .map((raw): ThesisBranch | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const column = normalizeColumn(o.column);
      const title = typeof o.title === "string" ? o.title.trim() : "";
      const summary = typeof o.summary === "string" ? o.summary.trim() : "";
      if (!column || (!title && !summary)) return null;
      return { column, title, summary };
    })
    .filter((b): b is ThesisBranch => b !== null);
  return { core, branches };
}

// Serialize the parsed tree into the contentData.nodes the planning workspace reads back
// (writer side of the contract): one core node + the branch nodes.
function renderNodes(tree: ThesisTree): ThesisNode[] {
  const nodes: ThesisNode[] = [];
  if (tree.core.title || tree.core.summary) {
    nodes.push({
      column: "core",
      title: tree.core.title,
      summary: tree.core.summary,
    });
  }
  for (const b of tree.branches) {
    nodes.push({ column: b.column, title: b.title, summary: b.summary });
  }
  return nodes;
}

const COLUMN_LABEL: Record<"core" | ThesisColumn, string> = {
  core: "核心论点",
  support: "支撑依据",
  evidence: "证据",
  counter: "反驳",
};

// A readable Markdown rendering (the ArtifactVersion's contentText) — used for search and
// as the flat blob the confirm branch requires (`resultData.body`).
function renderBody(tree: ThesisTree): string {
  const lines: string[] = ["# 论点树", ""];
  if (tree.core.title) {
    lines.push(`## 核心论点：${tree.core.title}`);
    if (tree.core.summary) lines.push(tree.core.summary);
    lines.push("");
  }
  for (const column of ["support", "evidence", "counter"] as const) {
    const branch = tree.branches.filter((b) => b.column === column);
    if (branch.length === 0) continue;
    lines.push(`### ${COLUMN_LABEL[column]}`);
    for (const b of branch) {
      lines.push(`- **${b.title}**${b.summary ? `：${b.summary}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export async function runPlanningThesis(
  ctx: RequestContext,
  task: PlanningTask,
  deps: PlanningDeps,
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
      throw new Error("planning-runner: inputData.artifactId is required");
    }
    const topic =
      typeof task.inputData.topic === "string" ? task.inputData.topic : "";
    const context = await assembleCreativeContext(
      ctx,
      { projectId: task.projectId, topic },
      deps,
    );
    const tree = await draftThesisTree(context, (prompt, opts) =>
      deps.llm(ctx, "planning.thesis", prompt, opts),
    );
    const nodes = renderNodes(tree);
    if (nodes.length === 0) {
      throw new Error("planning-runner: agent returned no parseable thesis nodes");
    }
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "artifact_version",
      artifactId,
      resultData: {
        body: renderBody(tree),
        summary: "AI 论点树草稿",
        // Raw nodes — kept so the 采纳 card preview (PlanningThesisIsland.parseNodes)
        // renders the columns/titles/summaries.
        nodes,
        // Structured editable payload forwarded by the AI confirm branch to
        // createVersion as `contentData` (round-trips into the 策划 论点树 read side).
        contentData: { nodes },
      },
    });
  } catch (err) {
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* already terminal */
    }
    // eslint-disable-next-line no-console
    console.error(`[planning-runner] draft failed for task ${task.id}:`, err);
  }
}
