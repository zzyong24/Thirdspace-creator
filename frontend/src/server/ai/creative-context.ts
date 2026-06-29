import "server-only";
import type { RequestContext } from "@creatoros/contract";

// 机制② CreativeContext — the "接力棒" every AI node reads. It is assembled (read-only)
// from each upstream module's PUBLIC service, never by importing module internals: this
// is the ONLY place modules coordinate to feed an agent, so adding a context source =
// adding one read here, with zero change to the downstream node.
//
// v1 (research_gather node) needs the smallest useful slice: the creator's active
// positioning (the constraint) + the topic for this project. Later nodes (script_draft,
// platform_adapt, review_analyze) extend this object with research/script/learnings.

export interface CreativeContext {
  // A human-readable positioning brief the agent reasons against (人设/领域/人群/差异化/
  // 关键词/变现锚). Empty string when the user has not set positioning yet.
  positioningBrief: string;
  // 飞轮回流 — a brief of past 复盘 爆款要素 (Learnings). Empty until the learnings reader
  // is wired (机制②扩展, plan A7); the field exists now so topic/script nodes can read it.
  learningsBrief: string;
  // 素材库 brief — a compact listing of the creator's asset library (id | name (type))
  // so a production-stage node (material.match) can propose which real assets to use.
  // Empty string until the assets reader is wired (Plan D2) or when the library is empty.
  assetsBrief: string;
  // 论点树 brief — a compact rendering of the project's ADOPTED thesis tree (核心论点 +
  // 支撑/证据/反驳). The 策划 stage's downstream nodes (planning.contract / planning.outline)
  // read it as the upstream 编导判断 they build on. Empty string until the thesis reader is
  // wired or when the project has no adopted thesis tree yet.
  thesisBrief: string;
  // 内容合同 brief — a compact rendering of the project's ADOPTED content contract (受众定位/
  // 价值主张/核心节奏/行动召唤). planning.outline reads it as the constraint the structure
  // must honor. Empty string until the contract reader is wired or when the project has no
  // adopted content contract yet.
  contractBrief: string;
  topic: { title: string; angle: string };
  projectId: string | null;
}

// The narrow read port — mirrors how the AI module reaches Artifacts/Knowledge through a
// port rather than a module import. The composition root (persistence-client) supplies a
// reader bound to the positioning service.
export interface PositioningReader {
  getPositioningCenter(ctx: RequestContext): Promise<{
    profile: {
      persona: string;
      field: string;
      audience: string;
      differentiation: string;
      capabilities: string[];
    } | null;
    currentStatement: { oneLiner: string; keywords: string[] } | null;
  }>;
}

// 飞轮回流 reader — the project's relevant past 复盘 Learnings (爆款要素). Optional: nodes
// that benefit from the flywheel (topic.generate / script.draft) pass it; others omit it.
export interface LearningsReader {
  getSuggestions(
    ctx: RequestContext,
    opts: { limit?: number },
  ): Promise<Array<{ title: string; insight: string }>>;
}

// 素材库 reader — the creator's asset library (id + name + type). Optional: only the
// production-stage material-match node passes it; other nodes omit it. The composition
// root binds it to the Assets public service's list method.
export interface AssetsReader {
  list(
    ctx: RequestContext,
  ): Promise<Array<{ id: string; name: string; type?: string }>>;
}

// 论点树 reader — the project's ADOPTED thesis tree (核心论点 + 支撑/证据/反驳 分支), read
// back from the `thesis_tree` artifact's current ArtifactVersion `contentData.nodes`.
// Optional: only the 策划 downstream nodes (planning.contract / planning.outline) pass it;
// other nodes omit it. The composition root binds it to the Artifacts public service.
export interface ThesisReader {
  getThesisNodes(
    ctx: RequestContext,
    projectId: string,
  ): Promise<Array<{ column: string; title: string; summary: string }>>;
}

// 内容合同 reader — the project's ADOPTED content contract (受众定位/价值主张/核心节奏/
// 行动召唤), read back from the `content_contract` artifact's current ArtifactVersion
// `contentData.cards`. Optional: only planning.outline passes it; other nodes omit it.
export interface ContractReader {
  getContractCards(
    ctx: RequestContext,
    projectId: string,
  ): Promise<Array<{ title: string; body: string }>>;
}

export interface ContextDeps {
  positioning: PositioningReader;
  learnings?: LearningsReader;
  assets?: AssetsReader;
  thesis?: ThesisReader;
  contract?: ContractReader;
}

export interface AssembleInput {
  projectId: string | null;
  topic: string;
  angle?: string;
}

export async function assembleCreativeContext(
  ctx: RequestContext,
  input: AssembleInput,
  deps: ContextDeps,
): Promise<CreativeContext> {
  let positioningBrief = "";
  try {
    const center = await deps.positioning.getPositioningCenter(ctx);
    positioningBrief = formatPositioning(center);
  } catch {
    // Positioning is optional context — a brand-new creator can still gather material;
    // the agent just loses the relevance constraint. Degrade, never block.
    positioningBrief = "";
  }

  let learningsBrief = "";
  if (deps.learnings) {
    try {
      const rows = await deps.learnings.getSuggestions(ctx, { limit: 5 });
      learningsBrief = rows
        .map((l) => `· ${l.title}${l.insight ? `：${l.insight}` : ""}`)
        .join("\n");
    } catch {
      learningsBrief = ""; // 飞轮 is best-effort context; never block a node on it
    }
  }

  let assetsBrief = "";
  if (deps.assets) {
    try {
      const rows = await deps.assets.list(ctx);
      assetsBrief = rows
        .map((a) => `· ${a.id} | ${a.name}${a.type ? ` (${a.type})` : ""}`)
        .join("\n");
    } catch {
      assetsBrief = ""; // 素材库 is best-effort context; never block a node on it
    }
  }

  let thesisBrief = "";
  if (deps.thesis && input.projectId) {
    try {
      const nodes = await deps.thesis.getThesisNodes(ctx, input.projectId);
      thesisBrief = formatThesisNodes(nodes);
    } catch {
      thesisBrief = ""; // 论点树 is best-effort context; never block a node on it
    }
  }

  let contractBrief = "";
  if (deps.contract && input.projectId) {
    try {
      const cards = await deps.contract.getContractCards(ctx, input.projectId);
      contractBrief = cards
        .map((c) => `· ${c.title.trim()}：${c.body.trim()}`)
        .filter((line) => line.length > 3)
        .join("\n");
    } catch {
      contractBrief = ""; // 内容合同 is best-effort context; never block a node on it
    }
  }

  return {
    positioningBrief,
    learningsBrief,
    assetsBrief,
    thesisBrief,
    contractBrief,
    topic: { title: input.topic, angle: input.angle ?? "" },
    projectId: input.projectId,
  };
}

// Render the adopted thesis nodes into a compact brief the downstream 策划 nodes reason
// against (grouped by column, in the locked 核心论点→支撑→证据→反驳 order).
const THESIS_COLUMN_LABEL: Record<string, string> = {
  core: "核心论点",
  support: "支撑依据",
  evidence: "证据",
  counter: "反驳",
};

function formatThesisNodes(
  nodes: Array<{ column: string; title: string; summary: string }>,
): string {
  if (nodes.length === 0) return "";
  const lines: string[] = [];
  for (const column of ["core", "support", "evidence", "counter"]) {
    const inColumn = nodes.filter((n) => n.column === column);
    if (inColumn.length === 0) continue;
    lines.push(`【${THESIS_COLUMN_LABEL[column] ?? column}】`);
    for (const n of inColumn) {
      const title = n.title.trim();
      const summary = n.summary.trim();
      if (!title && !summary) continue;
      lines.push(`· ${title}${title && summary ? "：" : ""}${summary}`);
    }
  }
  return lines.join("\n");
}

function formatPositioning(center: {
  profile: {
    persona: string;
    field: string;
    audience: string;
    differentiation: string;
    capabilities: string[];
  } | null;
  currentStatement: { oneLiner: string; keywords: string[] } | null;
}): string {
  const lines: string[] = [];
  if (center.currentStatement?.oneLiner) {
    lines.push(`定位一句话：${center.currentStatement.oneLiner}`);
  }
  if (center.currentStatement?.keywords?.length) {
    lines.push(`关键词：${center.currentStatement.keywords.join("、")}`);
  }
  const p = center.profile;
  if (p) {
    if (p.persona) lines.push(`人设：${p.persona}`);
    if (p.field) lines.push(`领域：${p.field}`);
    if (p.audience) lines.push(`目标人群：${p.audience}`);
    if (p.differentiation) lines.push(`差异化：${p.differentiation}`);
    if (p.capabilities?.length) lines.push(`能力清单：${p.capabilities.join("、")}`);
  }
  return lines.join("\n");
}
