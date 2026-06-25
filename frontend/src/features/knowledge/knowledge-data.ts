import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import {
  buildKnowledgeViewModel,
  buildRecentRowsFromItems,
} from "@/fixtures/selectors";
import type {
  KnowledgeViewModel,
  KnowledgeTag as KnowledgeTagVm,
  KnowledgeInsight as KnowledgeInsightVm,
  KnowledgeUnsorted as KnowledgeUnsortedVm,
  KnowledgeSnippet as KnowledgeSnippetVm,
} from "./knowledge-page";
import type { MetricCard as MetricCardVm } from "@/types/view-models";

/**
 * Knowledge & Memory READ-side data assembly ("知识库读侧做真").
 *
 * Assembles a REAL `KnowledgeViewModel` for the `/knowledge` route from the
 * real read ops the page has — `knowledge.list`, `knowledge.relations.list`
 * (fanned out per item), and `taxonomy.tags.list` (pglite, user-scoped).
 *
 *   - `metrics`     → 知识条目 (total), 本周新增 (createdAt within 7d), 复用片段
 *                     (knowledgeType==="snippet"), 知识关联 (real edge count,
 *                     aggregated via knowledge.relations.list over every item).
 *                     These four are REAL counts. 记忆命中率 (km-memory) has NO
 *                     read op (no memory analytics) → rendered as a 「规划中」
 *                     placeholder (value "—") instead of a fabricated number.
 *   - `categories`  → REAL tally by `knowledgeType` over the live list.
 *   - `recent`      → REAL rows (via buildRecentRowsFromItems).
 *   - `snippets`    → REAL rows where knowledgeType==="snippet" (the snippet
 *                     LIST, not just the count). Empty → honest empty state.
 *   - `unsorted`    → REAL rows with NO relation edge (neither source nor
 *                     target of any knowledge.relations edge). The resource
 *                     `status` enum is only active/archived (no "draft"), so
 *                     the "未整理" signal is "unlinked", derived from the same
 *                     relations fan-out used for the metric/graph. Empty →
 *                     honest "全部已整理" empty state.
 *   - `graphSeries` → REAL graph: one bucket per knowledgeType node with its
 *                     incident-edge count, derived from the collected edges.
 *   - `popularTags` → REAL tags from `taxonomy.tags.list`, ranked by the
 *                     server-derived `usageCount` (descending). Tag read fails
 *                     or empty → its own empty state, does not block the rest.
 *   - `memoryInsights` → light insights DERIVED from the relations graph (most
 *                     connected items). No edges → fixture fallback (page-specs
 *                     §11 keeps the block non-empty).
 *
 * Honest tri-state (GAP-KM-tristate): the primary `knowledge.list` read drives
 * the page state —
 *   - read SUCCEEDS, rows present → real VM (scenario "default"),
 *   - read SUCCEEDS, no rows      → real EMPTY VM (scenario "default", all
 *                                    collections empty) → the page renders its
 *                                    honest 空态. A fresh empty account reads
 *                                    EMPTY, never user-zyongzhu's seed,
 *   - read FAILS                  → scenario "error" + an `error` payload (NOT
 *                                    the fixture VM). The wholesale "read fail →
 *                                    fixture VM" fallback is removed in this lane.
 * Secondary reads (relations, tags) stay independently guarded but degrade to
 * EMPTY, not to seed fixtures: an empty account's relations/tags blocks read
 * empty. The 记忆命中率 metric still has no op → 「规划中」 placeholder. The
 * contract client is injected (and the route passes a session-scoped client) so
 * reads stay ctx.userId-scoped and the helper stays unit-testable.
 */

// Minimal structural DTO — `knowledge.list` returns KnowledgeItemResource rows;
// we only read the fields we map. NOTE: the contract resource `status` enum is
// `active | archived` (no "draft"); we keep the wider union only to stay
// assignable from the fixture row type.
interface KnowledgeListDto {
  readonly id: string;
  readonly title: string;
  readonly knowledgeType: string;
  readonly status: "active" | "archived" | "draft";
  readonly createdAt: string;
  readonly updatedAt: string;
}

// `knowledge.relations.list` returns KnowledgeRelationResource rows for ONE
// source item; we read the endpoints + type to build graph edges.
interface KnowledgeRelationDto {
  readonly id: string;
  readonly sourceKnowledgeId: string;
  readonly targetKnowledgeId: string;
  readonly relationType: string;
}

// `taxonomy.tags.list` returns TagResource rows; `usageCount` is the
// server-derived denormalized popularity counter.
interface TagDto {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly usageCount: number;
}

// A collected graph edge (one per knowledge.relations row).
interface GraphEdge {
  readonly source: string;
  readonly target: string;
  readonly type: string;
}

export interface KnowledgeDataClient {
  listKnowledge(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listKnowledgeRelations(input: {
    params: { knowledgeId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  // taxonomy.tags.list — paginated tag list; ranked client-side by usageCount.
  listTags(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const CATEGORY_TONE: Record<string, KnowledgeViewModel["categories"][number]["tone"]> = {
  reference: "brand",
  note: "neutral",
  snippet: "success",
  transcript: "warning",
  inspiration: "info",
};

// Chinese labels for the knowledgeType enum — mirrors the selector's
// `knowledgeTypeLabel` (kept local so this helper does not depend on a
// non-barrel-exported symbol from the shared fixtures module).
const CATEGORY_LABEL: Record<string, string> = {
  reference: "参考",
  note: "笔记",
  snippet: "片段",
  transcript: "记录",
  inspiration: "灵感",
};

/**
 * Build the REAL Knowledge ViewModel, degrading to the fixture VM on failure.
 *
 * @param client  the contract client (server-bound). Injected for tests.
 */
export async function buildKnowledgeDashboardViewModel(
  client: KnowledgeDataClient = defaultClient as unknown as KnowledgeDataClient,
): Promise<KnowledgeViewModel> {
  // `base` supplies ONLY the VM shell + the five metric-card identities/order
  // (the five-card row is a test invariant). It is NOT used as a content
  // fallback: an empty account must read EMPTY blocks, not seed fixtures.
  const base = buildKnowledgeViewModel();

  let items: ReadonlyArray<KnowledgeListDto>;
  try {
    items = (await client.listKnowledge({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as ReadonlyArray<KnowledgeListDto>;
  } catch (err) {
    // Primary list read FAILED → honest ERROR tri-state (scenario "error" +
    // payload). We do NOT fall back to the fixture VM: a failure is not data.
    return {
      ...base,
      scenario: "error",
      error: {
        code: "knowledge_read_failed",
        message: err instanceof Error ? err.message : "知识库读取失败",
      },
      metrics: [],
      categories: [],
      recent: [],
      snippets: [],
      unsorted: [],
      graphSeries: [],
      memoryInsights: [],
      popularTags: [],
    };
  }

  // REAL relations: relations are stored per source item, so we fan out
  // `knowledge.relations.list` across every live item and COLLECT the edges
  // (one read serves the 知识关联 metric, the graph, the unsorted "unlinked"
  // signal, and the derived memory insights). A `null` result (empty list, or
  // every per-item read threw) means "no relations signal" → those blocks read
  // EMPTY (honest), never seed fixtures.
  const relations = await collectRelations(client, items);

  // REAL popular tags via taxonomy.tags.list — independently guarded; a read
  // failure or no taxonomy data reads EMPTY (honest), not seed fixtures.
  const popularTags = await buildPopularTags(client);

  return {
    ...base,
    scenario: "default",
    error: null,
    metrics: buildMetrics(items, base.metrics, relations?.count ?? null),
    categories: buildCategories(items),
    recent: buildRecentRowsFromItems(items),
    snippets: buildSnippets(items),
    unsorted: buildUnsorted(items, relations?.edges ?? null),
    graphSeries: buildGraphSeries(items, relations?.edges ?? null),
    memoryInsights: buildMemoryInsights(items, relations?.edges ?? null),
    popularTags,
  };
}

/**
 * Fan out `knowledge.relations.list` across every item and COLLECT both the
 * edge total and the edge list (source/target/type). Each per-item read is
 * independently try/caught so one failure does not zero the whole result.
 * Returns `null` ONLY if the list was empty or EVERY per-item read failed (no
 * real signal → keep fixtures); otherwise `{ count, edges }` where `count` may
 * legitimately be 0 (real, with `edges: []`).
 */
async function collectRelations(
  client: KnowledgeDataClient,
  items: ReadonlyArray<KnowledgeListDto>,
): Promise<{ count: number; edges: ReadonlyArray<GraphEdge> } | null> {
  if (items.length === 0) return null;
  const edges: GraphEdge[] = [];
  let anyOk = false;
  await Promise.all(
    items.map(async (item) => {
      try {
        const rels = (await client.listKnowledgeRelations({
          params: { knowledgeId: item.id },
          query: undefined,
          body: undefined,
        })) as ReadonlyArray<KnowledgeRelationDto>;
        anyOk = true;
        for (const rel of rels) {
          edges.push({
            source: rel.sourceKnowledgeId,
            target: rel.targetKnowledgeId,
            type: rel.relationType,
          });
        }
      } catch {
        // Per-item read failed — skip it, keep aggregating the rest.
      }
    }),
  );
  return anyOk ? { count: edges.length, edges } : null;
}

/**
 * 5 metric cards. Total / this-week / snippets / relations are REAL counts;
 * total/this-week/snippets derive from the live list, 知识关联 from the
 * aggregated relations.list edge count (`relationCount`; `null` ⇒ no real
 * signal ⇒ keep the fixture card). 记忆命中率 (memory hit rate) has no read op,
 * so its fixture card passes through unchanged. Card identity + order are
 * preserved so the row stays exactly five cards (test invariant).
 */
function buildMetrics(
  items: ReadonlyArray<KnowledgeListDto>,
  fixtureMetrics: ReadonlyArray<MetricCardVm>,
  relationCount: number | null,
): ReadonlyArray<MetricCardVm> {
  const total = items.length;
  const now = Date.now();
  const weekCount = items.filter((item) => {
    const ts = Date.parse(item.createdAt);
    return Number.isFinite(ts) && now - ts <= WEEK_MS;
  }).length;
  const snippetCount = items.filter(
    (item) => item.knowledgeType === "snippet",
  ).length;

  return fixtureMetrics.map((card) => {
    switch (card.id) {
      case "km-total":
        return {
          ...card,
          value: formatCount(total),
          delta: "",
          trend: "flat" as const,
        };
      case "km-week":
        return {
          ...card,
          value: formatCount(weekCount),
          delta: "",
          trend: "flat" as const,
        };
      case "km-snippets":
        return {
          ...card,
          value: formatCount(snippetCount),
          delta: "",
          trend: "flat" as const,
        };
      case "km-relations":
        // Real edge count when we have a signal; otherwise keep the fixture card.
        return relationCount === null
          ? card
          : {
              ...card,
              value: formatCount(relationCount),
              delta: "",
              trend: "flat" as const,
            };
      case "km-memory":
        // 记忆命中率 has NO read op (no memory analytics). We refuse to render
        // the fixture number (78%) as if real — show a 「规划中」 placeholder so
        // the five-card row stays intact without fabricating a metric.
        return {
          ...card,
          value: "—",
          delta: "规划中",
          trend: "flat" as const,
          tone: "neutral" as const,
        };
      default:
        return card;
    }
  });
}

/**
 * REAL category counts: tally the live list by `knowledgeType`. An empty list
 * yields an empty array → the CategoryPanel renders its honest empty state
 * instead of fabricated counts.
 */
function buildCategories(
  items: ReadonlyArray<KnowledgeListDto>,
): ReadonlyArray<KnowledgeViewModel["categories"][number]> {
  if (items.length === 0) return [];
  const tally = new Map<string, number>();
  for (const item of items) {
    tally.set(item.knowledgeType, (tally.get(item.knowledgeType) ?? 0) + 1);
  }
  return Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      id: `cat-${type}`,
      name: CATEGORY_LABEL[type] ?? type,
      count,
      tone: CATEGORY_TONE[type] ?? "neutral",
    }));
}

/**
 * REAL reusable-snippets LIST: the live `knowledge.list` rows whose
 * `knowledgeType` is "snippet" (the metric already counts them; this surfaces
 * the actual rows). Most-recently-updated first, capped at 6 for the rail.
 * Empty → `[]` so ReusableSnippets renders its honest empty state (no fixture).
 */
function buildSnippets(
  items: ReadonlyArray<KnowledgeListDto>,
): ReadonlyArray<KnowledgeSnippetVm> {
  return items
    .filter((item) => item.knowledgeType === "snippet")
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6)
    .map<KnowledgeSnippetVm>((item) => ({
      id: item.id,
      title: item.title,
      // No revision body in the list read — surface the type as the preview
      // line so the row is informative without an extra per-item fetch.
      preview: "可复用片段",
    }));
}

/**
 * REAL 未整理 LIST: items that participate in NO relation edge (neither source
 * nor target of any collected `knowledge.relations` edge) — the honest
 * "unlinked / uncategorized" signal. The contract resource `status` enum is
 * only active/archived (no "draft"), so we derive this from the relations graph
 * rather than a status flag. `edges === null` (no relations signal, e.g. empty
 * account) → `[]` (honest empty, NOT seed); real-but-all-linked → `[]` →
 * "全部已整理" empty state.
 */
function buildUnsorted(
  items: ReadonlyArray<KnowledgeListDto>,
  edges: ReadonlyArray<GraphEdge> | null,
): ReadonlyArray<KnowledgeUnsortedVm> {
  if (edges === null) return [];
  const linked = new Set<string>();
  for (const edge of edges) {
    linked.add(edge.source);
    linked.add(edge.target);
  }
  return items
    .filter((item) => !linked.has(item.id))
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8)
    .map<KnowledgeUnsortedVm>((item) => ({
      id: item.id,
      title: item.title,
      ageLabel: ageLabelFor(item.updatedAt),
    }));
}

/**
 * REAL knowledge graph: one series bucket per `knowledgeType`, valued by the
 * number of relation edges incident to items of that type. `edges === null`
 * (no relations signal, e.g. empty account) → `[]` (honest empty, NOT seed).
 * Real-but-no-edges → `[]` → the KnowledgeGraph "暂无数据" summary (handled by
 * the page).
 */
function buildGraphSeries(
  items: ReadonlyArray<KnowledgeListDto>,
  edges: ReadonlyArray<GraphEdge> | null,
): ReadonlyArray<{ readonly label: string; readonly value: number }> {
  if (edges === null) return [];
  const typeOf = new Map<string, string>();
  for (const item of items) typeOf.set(item.id, item.knowledgeType);
  const tally = new Map<string, number>();
  const bump = (id: string) => {
    const type = typeOf.get(id);
    if (type === undefined) return;
    tally.set(type, (tally.get(type) ?? 0) + 1);
  };
  for (const edge of edges) {
    bump(edge.source);
    bump(edge.target);
  }
  return Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, value]) => ({
      label: GRAPH_TYPE_LABEL[type] ?? type,
      value,
    }));
}

/**
 * REAL 记忆洞察 (light): derive a few insights from the relations graph — the
 * most-connected knowledge items ("高关联条目"). `edges === null` or no edges →
 * `[]` (honest empty, NOT seed). The MemoryInsights block stays in the layout
 * (page-specs §11) but renders its own empty state when there are no insights.
 */
function buildMemoryInsights(
  items: ReadonlyArray<KnowledgeListDto>,
  edges: ReadonlyArray<GraphEdge> | null,
): ReadonlyArray<KnowledgeInsightVm> {
  if (edges === null || edges.length === 0) return [];
  const titleOf = new Map<string, string>();
  for (const item of items) titleOf.set(item.id, item.title);
  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);
  for (const edge of edges) {
    bump(edge.source);
    bump(edge.target);
  }
  const ranked = Array.from(degree.entries())
    .filter(([id]) => titleOf.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (ranked.length === 0) return [];
  return ranked.map<KnowledgeInsightVm>(([id, count]) => ({
    id: `mi-rel-${id}`,
    title: `高关联条目:${titleOf.get(id) ?? id}`,
    body: `与其它条目存在 ${count} 条关联,可作为该主题的中心节点。`,
  }));
}

/**
 * REAL 热门标签 via `taxonomy.tags.list`, ranked by the server-derived
 * `usageCount` (descending). The read is independently guarded: any failure or
 * an empty tag set reads EMPTY (`[]`, honest), NOT seed fixtures — the rail
 * block renders its own empty state. A failure here never blocks the rest.
 */
async function buildPopularTags(
  client: KnowledgeDataClient,
): Promise<ReadonlyArray<KnowledgeTagVm>> {
  let tags: ReadonlyArray<TagDto>;
  try {
    tags = (await client.listTags({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as ReadonlyArray<TagDto>;
  } catch {
    return [];
  }
  if (tags.length === 0) return [];
  return tags
    .slice()
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 8)
    .map<KnowledgeTagVm>((tag) => ({
      id: tag.id,
      name: tag.name,
      tone: TAG_COLOR_TONE[tag.color ?? ""] ?? "neutral",
    }));
}

// Chinese labels for the knowledgeType graph buckets (mirrors CATEGORY_LABEL,
// kept separate so graph + category labelling can diverge if needed).
const GRAPH_TYPE_LABEL: Record<string, string> = {
  reference: "参考",
  note: "笔记",
  snippet: "片段",
  transcript: "记录",
  inspiration: "灵感",
};

// Map a tag's `color` hex to a chip tone (mirrors the fixture selector's
// color→tone mapping so real tags render consistently).
const TAG_COLOR_TONE: Record<string, KnowledgeTagVm["tone"]> = {
  "#f59e0b": "warning",
  "#0ea5e9": "info",
  "#22c55e": "success",
  "#a855f7": "brand",
};

// Coarse "N 天前 / N 周前" label from an ISO updatedAt. Deterministic given the
// clock; used only for the 未整理 rail (display-only).
function ageLabelFor(updatedAt: string): string {
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return "";
  const days = Math.max(0, Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)));
  if (days <= 0) return "今天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 个月前`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}
