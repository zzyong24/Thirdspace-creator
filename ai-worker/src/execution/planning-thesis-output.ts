import { z } from "zod";
import {
  thesisTreeSchema,
  type ThesisTreeOutput,
} from "../prompt/templates/planning-thesis";
import {
  buildGroundingHaystack,
  annotateUngroundedClaims,
} from "../prompt/grounding-facets";
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

function normalizeColumn(raw: unknown): ThesisColumn | null {
  if (raw === "support" || raw === "evidence" || raw === "counter") return raw;
  if (raw === "支撑" || raw === "支持" || raw === "支持依据") return "support";
  if (raw === "证据") return "evidence";
  if (raw === "反驳" || raw === "反对") return "counter";
  return null;
}

// Normalize the schema-validated object into a ThesisTree (T-025:结构化后拿的是已解析对象,
// 归一逻辑原样保留 —— normalizeColumn 归一列名、trim、滤掉空分支)。
function normalizeThesisTree(obj: ThesisTreeOutput): ThesisTree {
  const core = {
    title: (obj.core?.title ?? "").trim(),
    summary: (obj.core?.summary ?? "").trim(),
  };
  const branches = (obj.branches ?? [])
    .map((o): ThesisBranch | null => {
      const column = normalizeColumn(o.column);
      const title = (o.title ?? "").trim();
      const summary = (o.summary ?? "").trim();
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

// SEMANTIC_BOUNDARY_ALLOW: 已知列名归一及非空检查只守输出协议，不判断论点质量。
export const planningThesisGroundingSchema = z.array(z.string()).length(7);
export const planningThesisOutputSchema = thesisTreeSchema.refine(
  (value) => renderNodes(normalizeThesisTree(value)).length > 0,
  "planning-runner: agent returned no parseable thesis nodes",
);
/** 与旧runner同一份候选呈现；grounding只追加核实提醒，不替模型删改论点。 */
export function projectPlanningThesis(object: unknown, grounding: string[]) {
  const tree = normalizeThesisTree(planningThesisOutputSchema.parse(object));
  const haystack = buildGroundingHaystack(
    ...planningThesisGroundingSchema.parse(grounding),
  );
  tree.core.summary = annotateUngroundedClaims(
    tree.core.summary,
    haystack,
  ).text;
  for (const branch of tree.branches)
    branch.summary = annotateUngroundedClaims(branch.summary, haystack).text;
  const nodes = renderNodes(tree);
  return {
    body: renderBody(tree),
    summary: "AI 论点树草稿",
    nodes,
    contentData: { nodes },
  };
}
