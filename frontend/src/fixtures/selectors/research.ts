/**
 * Research Workspace selector.
 *
 * Maps the canonical dataset to the `ResearchViewModel` consumed by the
 * Research Workspace page. Pure and deterministic — no `Date.now`,
 * `Math.random` or network access. Page components import
 * `buildResearchViewModel` from `@/fixtures/selectors` and never
 * dereference `canonicalDataset` for data shaping.
 */

import { canonicalDataset, getProjectById } from "../canonical";
import type {
  CompetitorRow,
  ResearchSourceRow,
  ResearchSummaryCard,
  ResearchViewModel,
} from "@/types/view-models";

const DEFAULT_SOURCE_TABS: ReadonlyArray<ResearchViewModel["sourceTabs"][number]> = [
  { id: "all", label: "全部" },
  { id: "article", label: "文章" },
  { id: "video", label: "视频" },
  { id: "report", label: "报告" },
  { id: "podcast", label: "播客" },
];

export function buildResearchViewModel(projectId: string): ResearchViewModel {
  const project = getProjectById(resolveProjectIdSlug(projectId));
  if (!project) {
    return {
      scenario: "empty",
      kind: "research",
      projectId,
      idea: { title: "未找到项目", summary: "" },
      trendCards: [],
      competitors: [],
      sourceTabs: DEFAULT_SOURCE_TABS,
      sources: [],
      notes: [],
      evidence: [],
      relatedTags: [],
      loading: false,
      error: null,
    };
  }

  return {
    scenario: "default",
    kind: "research",
    projectId: project.id,
    idea: {
      title: project.title,
      summary: project.brief,
    },
    trendCards: buildTrendCards(project.id),
    competitors: buildCompetitors(),
    sourceTabs: DEFAULT_SOURCE_TABS,
    sources: buildSources(project.id),
    notes: buildNotes(project.id),
    evidence: buildEvidence(project.id),
    relatedTags: buildRelatedTags(project.id),
    loading: false,
    error: null,
  };
}

/**
 * The route segment for a project is a URL slug (e.g. `ai-native-browser`)
 * while the canonical dataset uses prefixed IDs (e.g.
 * `project-ainativebrowser`). Translate between them so the page
 * content can resolve the canonical project.
 *
 * Falls back to the original slug if no canonical match is found, in
 * which case the caller surfaces the "未找到项目" empty state.
 */
function resolveProjectIdSlug(slug: string): string {
  if (!slug) return slug;
  const knownIds = canonicalDataset.projects.map((project) => project.id);
  if (knownIds.includes(slug)) return slug;
  const candidate = `project-${slug.replace(/-/g, "")}`;
  if (knownIds.includes(candidate)) return candidate;
  return slug;
}

function buildTrendCards(projectId: string): ReadonlyArray<ResearchSummaryCard> {
  const knowledgeCount = canonicalDataset.knowledgeItems.filter(
    (item) => item.userId === canonicalDataset.user.id,
  ).length;
  const evidenceCount = canonicalDataset.evidenceLinks.filter((link) =>
    canonicalDataset.thesisNodes.some(
      (node) =>
        node.id === link.thesisNodeId &&
        node.artifactVersionId === "av-ainativebrowser-thesis-tree",
    ),
  ).length;
  void projectId;
  return [
    {
      id: "trend-market",
      title: "浏览器市场",
      metric: "2.8 亿用户",
      description: "AI Native 浏览器赛道同比 +42%",
      tone: "positive",
    },
    {
      id: "trend-knowledge",
      title: "研究沉淀",
      metric: `${knowledgeCount} 条知识`,
      description: "已收集 120 份用户调研样本",
      tone: "info",
    },
    {
      id: "trend-evidence",
      title: "证据完整度",
      metric: `${evidenceCount} 条证据`,
      description: "覆盖三个核心论点",
      tone: "warning",
    },
  ];
}

function buildCompetitors(): ReadonlyArray<CompetitorRow> {
  return [
    {
      id: "competitor-arc",
      name: "Arc",
      platform: "youtube",
      views: 18_400,
      threat: "medium",
      note: "AI 入口与代理任务浏览器",
    },
    {
      id: "competitor-dia",
      name: "Dia",
      platform: "bilibili",
      views: 9_340,
      threat: "low",
      note: "面向知识工作者的浏览器",
    },
    {
      id: "competitor-sigma-os",
      name: "Sigma OS",
      platform: "youtube",
      views: 22_100,
      threat: "high",
      note: "本地优先代理操作系统",
    },
    {
      id: "competitor-privacy-crusader",
      name: "Privacy Crusader",
      platform: "youtube",
      views: 6_120,
      threat: "low",
      note: "以隐私为卖点的轻量浏览器",
    },
    {
      id: "competitor-openai-atlas",
      name: "Open AI Atlas",
      platform: "bilibili",
      views: 41_800,
      threat: "high",
      note: "Open AI 推出的 AI Native 浏览器",
    },
  ];
}

function buildSources(projectId: string): ReadonlyArray<ResearchSourceRow> {
  void projectId;
  return [
    {
      id: "source-arc-research",
      title: "Arc / Dia 用户调研报告",
      source: "Gemic · 2026-05",
      capturedAt: "2026-05-30T10:00:00+08:00",
      tags: ["AI", "浏览器", "调研"],
    },
    {
      id: "source-local-memory",
      title: "本地优先栈趋势观察",
      source: "Notion · 2026-05-25",
      capturedAt: "2026-05-25T10:00:00+08:00",
      tags: ["本地优先", "知识"],
    },
    {
      id: "source-hook-formula",
      title: "Hook 公式:三段式开场",
      source: "内部知识库 · 2026-04",
      capturedAt: "2026-04-12T10:00:00+08:00",
      tags: ["Hook", "脚本"],
    },
  ];
}

// Resolve canonical knowledge item ids so research notes / evidence carry a real
// `knowledgeId` the F2 islands thread into the knowledge ops (Module 06 F2a/F2b).
// Falls back to the first knowledge item when a specific id is absent so the VM
// is never missing the field.
function knowledgeIdOr(fallbackIndex: number, preferredId?: string): string {
  const items = canonicalDataset.knowledgeItems;
  if (preferredId && items.some((k) => k.id === preferredId)) return preferredId;
  return items[fallbackIndex]?.id ?? items[0]?.id ?? "knowledge-arc-dia-research";
}

function buildNotes(projectId: string): ResearchViewModel["notes"] {
  void projectId;
  return [
    {
      id: "note-1",
      content: "代理浏览器重塑入口:用户从打开标签页转为发起代理任务。",
      knowledgeId: knowledgeIdOr(1, "knowledge-local-memory-trend"),
    },
    {
      id: "note-2",
      content: "本地优先栈成为独立创作者的默认选择(2026 趋势观察)。",
      knowledgeId: knowledgeIdOr(0, "knowledge-arc-dia-research"),
    },
    {
      id: "note-3",
      content: "研究阶段需引用至少 100 份用户样本,降低结论误差。",
      knowledgeId: knowledgeIdOr(2, "knowledge-hook-formula"),
    },
  ];
}

function buildEvidence(projectId: string): ResearchViewModel["evidence"] {
  void projectId;
  // Each evidence row is a KnowledgeItem (source); the link target is the
  // research subject's primary knowledge item. `关联证据` creates a
  // source→target KnowledgeRelation (relationType:'supports').
  const target = knowledgeIdOr(1, "knowledge-local-memory-trend");
  return [
    {
      id: "ev-1",
      title: "Arc / Dia 用户调研摘录",
      type: "知识条目",
      knowledgeId: knowledgeIdOr(0, "knowledge-arc-dia-research"),
      targetKnowledgeId: target,
    },
    {
      id: "ev-2",
      title: "本地优先栈趋势",
      type: "知识条目",
      knowledgeId: knowledgeIdOr(1, "knowledge-local-memory-trend"),
      targetKnowledgeId: knowledgeIdOr(0, "knowledge-arc-dia-research"),
    },
    {
      id: "ev-3",
      title: "代理任务覆盖度对比",
      type: "知识条目",
      knowledgeId: knowledgeIdOr(2, "knowledge-hook-formula"),
      targetKnowledgeId: target,
    },
  ];
}

function buildRelatedTags(projectId: string): ResearchViewModel["relatedTags"] {
  const ids = canonicalDataset.entityTags
    .filter(
      (entityTag) =>
        entityTag.entityType === "project" && entityTag.entityId === projectId,
    )
    .map((entityTag) =>
      canonicalDataset.tags.find((tag) => tag.id === entityTag.tagId)?.name ?? "",
    )
    .filter((name) => name !== "");
  if (ids.length > 0) return Array.from(new Set(ids));
  return ["AI", "浏览器"];
}
