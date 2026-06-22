/**
 * Knowledge & Memory selector.
 *
 * Maps the canonical dataset to the `KnowledgeViewModel` consumed by the
 * Knowledge & Memory page. Pure and deterministic — no `Date.now`,
 * `Math.random` or network access. The page imports
 * `buildKnowledgeViewModel` from `@/fixtures/selectors` and never
 * dereferences `canonicalDataset` for data shaping.
 *
 * The view-model shape used by this page differs structurally from the
 * `KnowledgeViewModel` exported by `@/types/view-models`, so the
 * page-local types are re-declared here verbatim. Only the public
 * `MetricCard` type is shared.
 */

import { canonicalDataset } from "../canonical";
import type {
  BasePageViewModel,
  MetricCard as MetricCardVm,
} from "@/types/view-models";

// ---------------------------------------------------------------------------
// View model types (structurally identical to the page-local declarations)
// ---------------------------------------------------------------------------

export interface KnowledgeViewModel extends BasePageViewModel {
  readonly kind: "knowledge";
  readonly metrics: ReadonlyArray<MetricCardVm>;
  readonly categories: ReadonlyArray<KnowledgeCategory>;
  readonly recent: ReadonlyArray<KnowledgeRow>;
  readonly popularTags: ReadonlyArray<KnowledgeTag>;
  readonly memoryInsights: ReadonlyArray<KnowledgeInsight>;
  readonly unsorted: ReadonlyArray<KnowledgeUnsorted>;
  readonly snippets: ReadonlyArray<KnowledgeSnippet>;
  readonly graphSeries: ReadonlyArray<{ readonly label: string; readonly value: number }>;
}

interface KnowledgeCategory {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly tone: "neutral" | "brand" | "success" | "warning" | "info";
}

interface KnowledgeRow {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly updatedAt: string;
  readonly status: "active" | "archived" | "draft";
  readonly tags: ReadonlyArray<string>;
}

interface KnowledgeTag {
  readonly id: string;
  readonly name: string;
  readonly tone: "neutral" | "brand" | "success" | "warning" | "info";
}

interface KnowledgeInsight {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

interface KnowledgeUnsorted {
  readonly id: string;
  readonly title: string;
  readonly ageLabel: string;
}

interface KnowledgeSnippet {
  readonly id: string;
  readonly title: string;
  readonly preview: string;
}

// ---------------------------------------------------------------------------
// Locked default knowledge metrics (5 cards, single row, in spec order)
// ---------------------------------------------------------------------------

const DEFAULT_METRICS: ReadonlyArray<MetricCardVm> = [
  {
    id: "km-total",
    label: "知识条目",
    value: "1,328",
    delta: "+24",
    trend: "up",
    tone: "positive",
  },
  {
    id: "km-week",
    label: "本周新增",
    value: "42",
    delta: "+12%",
    trend: "up",
    tone: "positive",
  },
  {
    id: "km-relations",
    label: "知识关联",
    value: "386",
    delta: "+18",
    trend: "up",
    tone: "info",
  },
  {
    id: "km-snippets",
    label: "复用片段",
    value: "118",
    delta: "+5",
    trend: "up",
    tone: "info",
  },
  {
    id: "km-memory",
    label: "记忆命中率",
    value: "78%",
    delta: "-2%",
    trend: "down",
    tone: "warning",
  },
];

// ---------------------------------------------------------------------------
// Locked default categories (fallback when canonical dataset is empty)
// ---------------------------------------------------------------------------

const DEFAULT_CATEGORIES: ReadonlyArray<KnowledgeCategory> = [
  { id: "cat-research", name: "用户调研", count: 124, tone: "brand" },
  { id: "cat-trend", name: "趋势观察", count: 86, tone: "info" },
  { id: "cat-snippet", name: "可复用片段", count: 118, tone: "success" },
  { id: "cat-transcript", name: "访谈记录", count: 64, tone: "warning" },
  { id: "cat-note", name: "随手笔记", count: 936, tone: "neutral" },
];

// ---------------------------------------------------------------------------
// Locked default recent knowledge rows (fallback)
// ---------------------------------------------------------------------------

const DEFAULT_RECENT: ReadonlyArray<KnowledgeRow> = [
  {
    id: "kr-1",
    title: "Arc / Dia 用户调研",
    type: "参考",
    updatedAt: "2026-05-30",
    status: "active",
    tags: ["调研", "Arc"],
  },
  {
    id: "kr-2",
    title: "本地优先栈趋势",
    type: "笔记",
    updatedAt: "2026-05-25",
    status: "active",
    tags: ["趋势"],
  },
  {
    id: "kr-3",
    title: "Hook 公式",
    type: "片段",
    updatedAt: "2026-04-12",
    status: "active",
    tags: ["Hook"],
  },
  {
    id: "kr-4",
    title: "发布前自检清单",
    type: "笔记",
    updatedAt: "2026-04-01",
    status: "active",
    tags: ["发布"],
  },
  {
    id: "kr-5",
    title: "独立创作者访谈 01",
    type: "记录",
    updatedAt: "2026-03-20",
    status: "active",
    tags: ["访谈"],
  },
];

// ---------------------------------------------------------------------------
// Locked default popular tags (fallback)
// ---------------------------------------------------------------------------

const DEFAULT_POPULAR_TAGS: ReadonlyArray<KnowledgeTag> = [
  { id: "t-knowledge", name: "知识", tone: "brand" },
  { id: "t-hook", name: "Hook", tone: "warning" },
  { id: "t-trend", name: "趋势", tone: "info" },
  { id: "t-publish", name: "发布", tone: "success" },
  { id: "t-research", name: "调研", tone: "brand" },
  { id: "t-snippet", name: "片段", tone: "success" },
  { id: "t-interview", name: "访谈", tone: "warning" },
  { id: "t-local", name: "本地优先", tone: "info" },
];

// ---------------------------------------------------------------------------
// Locked default memory insights (fallback) — page-specs §11 requires
// this block to remain visible.
// ---------------------------------------------------------------------------

const DEFAULT_MEMORY_INSIGHTS: ReadonlyArray<KnowledgeInsight> = [
  {
    id: "mi-1",
    title: "高频钩子:反差开场",
    body: "近 30 天调用 12 次，完播率比平均高 14 个百分点。",
  },
  {
    id: "mi-2",
    title: "低复用:产品对比表格",
    body: "出现 3 次但 0 次被引用，建议合并到一条主条目。",
  },
  {
    id: "mi-3",
    title: "趋势:本地优先栈",
    body: "5 月新增 8 条，关联到「创作流程」主条目。",
  },
];

// ---------------------------------------------------------------------------
// Locked default unsorted items (fallback)
// ---------------------------------------------------------------------------

const DEFAULT_UNSORTED: ReadonlyArray<KnowledgeUnsorted> = [
  { id: "u-1", title: "AI Copilot 复盘", ageLabel: "12 天前" },
  { id: "u-2", title: "采访脚本草稿", ageLabel: "5 天前" },
  { id: "u-3", title: "Vlog 拍摄备忘", ageLabel: "3 天前" },
];

// ---------------------------------------------------------------------------
// Locked default reusable snippets (fallback)
// ---------------------------------------------------------------------------

const DEFAULT_SNIPPETS: ReadonlyArray<KnowledgeSnippet> = [
  {
    id: "s-1",
    title: "3 秒钩子模板",
    preview: "「你以为的 X，其实只是 Y」— 用于反差开场。",
  },
  {
    id: "s-2",
    title: "结尾 CTA 模板",
    preview: "「如果这期对你有用，留言告诉我下一步想看什么」。",
  },
  {
    id: "s-3",
    title: "标题公式",
    preview: "「[人群]+[痛点]+[收益]」— 16 字以内效果最佳。",
  },
];

// ---------------------------------------------------------------------------
// Locked default graph series (fallback) — used by the KnowledgeGraph
// chart, which stays on the same page (page-specs §11).
// ---------------------------------------------------------------------------

const DEFAULT_GRAPH_SERIES: ReadonlyArray<{ readonly label: string; readonly value: number }> = [
  { label: "调研", value: 18 },
  { label: "趋势", value: 26 },
  { label: "片段", value: 34 },
  { label: "笔记", value: 48 },
  { label: "访谈", value: 22 },
  { label: "脚本", value: 30 },
  { label: "素材", value: 28 },
];

// ---------------------------------------------------------------------------
// View model — derived from canonical dataset, with deterministic
// fallbacks so the page is never empty.
// ---------------------------------------------------------------------------

export function buildKnowledgeViewModel(): KnowledgeViewModel {
  return {
    scenario: "default",
    kind: "knowledge",
    loading: false,
    error: null,
    metrics: DEFAULT_METRICS,
    categories: buildCategories(),
    recent: buildRecentRows(),
    popularTags: buildPopularTags(),
    memoryInsights: buildMemoryInsights(),
    unsorted: DEFAULT_UNSORTED,
    snippets: DEFAULT_SNIPPETS,
    graphSeries: DEFAULT_GRAPH_SERIES,
  };
}

function buildCategories(): ReadonlyArray<KnowledgeCategory> {
  const items = canonicalDataset.knowledgeItems;
  if (items.length === 0) return DEFAULT_CATEGORIES;
  const tally = new Map<string, number>();
  for (const item of items) {
    tally.set(item.knowledgeType, (tally.get(item.knowledgeType) ?? 0) + 1);
  }
  const toneFor: Record<string, KnowledgeCategory["tone"]> = {
    reference: "brand",
    note: "neutral",
    snippet: "success",
    transcript: "warning",
  };
  const labelFor: Record<string, string> = {
    reference: "参考",
    note: "笔记",
    snippet: "片段",
    transcript: "记录",
  };
  return Array.from(tally.entries()).map(([type, count]) => ({
    id: `cat-${type}`,
    name: labelFor[type] ?? type,
    count,
    tone: toneFor[type] ?? "neutral",
  }));
}

function buildRecentRows(): ReadonlyArray<KnowledgeRow> {
  const items = canonicalDataset.knowledgeItems;
  if (items.length === 0) return DEFAULT_RECENT;
  return items
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
    .map<KnowledgeRow>((item) => ({
      id: item.id,
      title: item.title,
      type: knowledgeTypeLabel(item.knowledgeType),
      updatedAt: item.updatedAt.slice(0, 10),
      status: item.status,
      tags: tagsForKnowledge(item.id),
    }));
}

// Map a list of real KnowledgeItemResource rows (from `knowledge.list`) into the
// page's `recent` VM rows. Module 06 F1a: the server read switches to the real op
// and maps `KnowledgeItemResource[]` here so the search input + the 5 type chips
// (which filter over the Chinese `type` label) keep working unchanged. Tags are
// derived from the canonical entity_tags index (decorative — Taxonomy owns them).
export interface KnowledgeListItem {
  readonly id: string;
  readonly title: string;
  readonly knowledgeType: string;
  readonly status: KnowledgeRow["status"];
  readonly updatedAt: string;
}

export function buildRecentRowsFromItems(
  items: ReadonlyArray<KnowledgeListItem>,
): ReadonlyArray<KnowledgeRow> {
  if (items.length === 0) return [];
  return items
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map<KnowledgeRow>((item) => ({
      id: item.id,
      title: item.title,
      type: knowledgeTypeLabel(item.knowledgeType),
      updatedAt: item.updatedAt.slice(0, 10),
      status: item.status,
      tags: tagsForKnowledge(item.id),
    }));
}

export function knowledgeTypeLabel(type: string): string {
  switch (type) {
    case "reference":
      return "参考";
    case "note":
      return "笔记";
    case "snippet":
      return "片段";
    case "transcript":
      return "记录";
    default:
      return type;
  }
}

function tagsForKnowledge(knowledgeId: string): ReadonlyArray<string> {
  const links = canonicalDataset.entityTags.filter(
    (row) => row.entityType === "knowledge" && row.entityId === knowledgeId,
  );
  return links
    .map((link) => canonicalDataset.tags.find((tag) => tag.id === link.tagId)?.name)
    .filter((name): name is string => Boolean(name));
}

function buildPopularTags(): ReadonlyArray<KnowledgeTag> {
  const tags = canonicalDataset.tags;
  if (tags.length === 0) return DEFAULT_POPULAR_TAGS;
  const toneFor: Record<string, KnowledgeTag["tone"]> = {
    "#f59e0b": "warning",
    "#0ea5e9": "info",
    "#22c55e": "success",
    "#a855f7": "brand",
  };
  return tags.slice(0, 8).map<KnowledgeTag>((tag) => ({
    id: tag.id,
    name: tag.name,
    tone: toneFor[tag.color] ?? "neutral",
  }));
}

function buildMemoryInsights(): ReadonlyArray<KnowledgeInsight> {
  // The MemoryInsights block is required by page-specs §11 — never
  // collapse it into another section. We always render at least the
  // canonical fallback so the rail is non-empty.
  return DEFAULT_MEMORY_INSIGHTS;
}
