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
  // 抖音账号画像 brief — the creator's connected platform accounts (平台 | 账号 | 粉丝量).
  // Feeds the positioning.generate node so the agent grounds a positioning *suggestion* in
  // who this person already is on-platform. Empty until the accounts reader is wired
  // (Plan Phase A) or when the creator has connected no accounts.
  accountsBrief: string;
  // 受众信号 brief — a compact listing of the creator's audience signals (评论/私信/咨询/
  // 复盘 raw text + demand tag) so the topic.generate `comments` basis can出题 from real
  // demand. Empty until the signals reader is wired or when there are no signals.
  signalsBrief: string;
  // 知识库 brief — a compact listing of the creator's KnowledgeItems (title (type)) so the
  // topic.generate `knowledge` basis can出题 from accumulated material. Empty until the
  // knowledge reader is wired or when the library is empty.
  knowledgeBrief: string;
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
// The richer facets + 5 downstream rules (定位中心重建) the brief now injects so
// 选题/写稿/项目 runners read them as hard constraints. Optional on the read shape
// (a partial reader / empty profile degrades to the legacy 5-field brief).
export interface PositioningFacets {
  contentScope?: string;
  avoid?: string;
  corePain?: string;
  coreValue?: string;
  tone?: string;
  statusNote?: string;
}
export interface PositioningDownstreamRules {
  topicRule?: string;
  scriptRule?: string;
  projectRule?: string;
  forbidRule?: string;
  expressionRule?: string;
}

export interface PositioningReader {
  getPositioningCenter(ctx: RequestContext): Promise<{
    profile: {
      persona: string;
      field: string;
      audience: string;
      differentiation: string;
      capabilities: string[];
      facets?: PositioningFacets;
      downstreamRules?: PositioningDownstreamRules;
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

// 抖音账号 reader — the creator's connected platform accounts (platform + handle +
// follower baseline). Optional: only the positioning.generate node passes it (it grounds
// a positioning suggestion in the on-platform identity); other nodes omit it. The
// composition root binds it to the platform-account public service's list method.
export interface AccountsReader {
  list(
    ctx: RequestContext,
  ): Promise<
    Array<{ platform: string; accountHandle: string; followerBaseline: number }>
  >;
}

// 受众信号 reader — the creator's audience signals (评论/私信/咨询/复盘). Optional: only
// the topic.generate node (comments basis) passes it. The composition root binds it to
// the candidate public service's listSignals method.
export interface SignalsReader {
  list(
    ctx: RequestContext,
    opts: { limit?: number },
  ): Promise<Array<{ source: string; rawText: string; demandTag: string | null }>>;
}

// 知识库 reader — the creator's KnowledgeItems (title + type). Optional: only the
// topic.generate node (knowledge basis) passes it. The composition root binds it to the
// knowledge public service's listKnowledge method.
export interface KnowledgeReader {
  list(
    ctx: RequestContext,
    opts: { limit?: number },
  ): Promise<Array<{ title: string; knowledgeType: string }>>;
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
  accounts?: AccountsReader;
  signals?: SignalsReader;
  knowledge?: KnowledgeReader;
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

  let accountsBrief = "";
  if (deps.accounts) {
    try {
      const rows = await deps.accounts.list(ctx);
      accountsBrief = rows
        .map(
          (a) =>
            `· ${a.platform} | ${a.accountHandle} | 粉丝 ${a.followerBaseline}`,
        )
        .join("\n");
    } catch {
      accountsBrief = ""; // 抖音账号画像 is best-effort context; never block a node on it
    }
  }

  let signalsBrief = "";
  if (deps.signals) {
    try {
      const rows = await deps.signals.list(ctx, { limit: 30 });
      signalsBrief = rows
        .map(
          (s) =>
            `· [${s.source}]${s.demandTag ? ` (${s.demandTag})` : ""} ${s.rawText}`,
        )
        .join("\n");
    } catch {
      signalsBrief = ""; // 受众信号 is best-effort context; never block a node on it
    }
  }

  let knowledgeBrief = "";
  if (deps.knowledge) {
    try {
      const rows = await deps.knowledge.list(ctx, { limit: 40 });
      knowledgeBrief = rows
        .map((k) => `· ${k.title}${k.knowledgeType ? ` (${k.knowledgeType})` : ""}`)
        .join("\n");
    } catch {
      knowledgeBrief = ""; // 知识库 is best-effort context; never block a node on it
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
    accountsBrief,
    signalsBrief,
    knowledgeBrief,
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
    facets?: PositioningFacets;
    downstreamRules?: PositioningDownstreamRules;
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
    // 账号定位 facet 补全 — the richer self-knowledge the downstream node grounds against.
    const f = p.facets;
    if (f) {
      if (f.contentScope) lines.push(`内容范围：${f.contentScope}`);
      if (f.avoid) lines.push(`不做什么：${f.avoid}`);
      if (f.corePain) lines.push(`核心痛点：${f.corePain}`);
      if (f.coreValue) lines.push(`核心价值：${f.coreValue}`);
      if (f.tone) lines.push(`表达风格：${f.tone}`);
      if (f.statusNote) lines.push(`当前状态：${f.statusNote}`);
    }
    // 定位规则（供下游模块使用）— injected as explicit HARD constraints so the agent
    // treats them as rules, not background. This is the "定位规则约束下游" landing point.
    const r = p.downstreamRules;
    if (r) {
      const ruleLines: string[] = [];
      if (r.topicRule) ruleLines.push(`· 选题规则：${r.topicRule}`);
      if (r.scriptRule) ruleLines.push(`· 写稿规则：${r.scriptRule}`);
      if (r.projectRule) ruleLines.push(`· 项目规则：${r.projectRule}`);
      if (r.forbidRule) ruleLines.push(`· 禁止事项：${r.forbidRule}`);
      if (r.expressionRule) ruleLines.push(`· 表达风格规则：${r.expressionRule}`);
      if (ruleLines.length > 0) {
        lines.push(`【定位规则（必须遵守）】\n${ruleLines.join("\n")}`);
      }
    }
  }
  return lines.join("\n");
}
