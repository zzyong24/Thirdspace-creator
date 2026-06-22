import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import {
  buildKnowledgeViewModel,
  buildRecentRowsFromItems,
} from "@/fixtures/selectors";
import type { KnowledgeViewModel } from "./knowledge-page";
import type { MetricCard as MetricCardVm } from "@/types/view-models";

/**
 * Knowledge & Memory READ-side data assembly ("知识库读侧做真").
 *
 * Assembles a REAL `KnowledgeViewModel` for the `/knowledge` route from the
 * one real read op the page has — `knowledge.list` (pglite, user-scoped). The
 * prior page derived only the `recent` table from this op; this helper extends
 * the real derivation to the parts that the list can actually support:
 *
 *   - `metrics`     → 知识条目 (total), 本周新增 (createdAt within 7d), 复用片段
 *                     (knowledgeType==="snippet"), 知识关联 (real edge count,
 *                     aggregated via knowledge.relations.list over every item).
 *                     These four are REAL counts. 记忆命中率 has no read op
 *                     (no memory analytics) → kept from the fixture metrics.
 *   - `categories`  → REAL tally by `knowledgeType` over the live list. Empty
 *                     list → honest empty category panel (no fake counts).
 *   - `recent`      → REAL rows (unchanged behavior, via buildRecentRowsFromItems).
 *
 * Everything else (popularTags / memoryInsights / unsorted / snippets list /
 * graphSeries) has no real read path this wave and stays fixture-backed so the
 * insight rail + knowledge-graph chart remain non-empty (page-specs §11 keeps
 * the MemoryInsights block visible). AI-search-confirmed material that writes a
 * KnowledgeItem (knowledge.create, sourceType "ai") flows into `knowledge.list`,
 * so the new entry is reflected in the total / 本周新增 / category counts.
 *
 * Degrades gracefully: the whole assembly is wrapped in try/catch and falls
 * back to the pure fixture VM (`buildKnowledgeViewModel()`) if the list read
 * throws, preserving the previous render. The contract client is injected so
 * this helper is unit-testable without the in-process backend.
 */

// Minimal structural DTO — `knowledge.list` returns KnowledgeItemResource rows;
// we only read the fields we map.
interface KnowledgeListDto {
  readonly id: string;
  readonly title: string;
  readonly knowledgeType: string;
  readonly status: "active" | "archived" | "draft";
  readonly createdAt: string;
  readonly updatedAt: string;
}

// `knowledge.relations.list` returns KnowledgeRelationResource rows for ONE
// source item; we only count them.
interface KnowledgeRelationDto {
  readonly id: string;
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
  // The fixture VM is the per-field fallback source for everything without a
  // real read path, and the WHOLE fallback if the list read fails.
  const base = buildKnowledgeViewModel();

  let items: ReadonlyArray<KnowledgeListDto>;
  try {
    items = (await client.listKnowledge({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as ReadonlyArray<KnowledgeListDto>;
  } catch {
    // List read failed — preserve the previous fixture render wholesale.
    return base;
  }

  // REAL 知识关联 count: relations are stored per source item, so we fan out
  // `knowledge.relations.list` across every live item and sum the edges. A null
  // result (read threw on every item) signals "no real source" → buildMetrics
  // keeps the fixture km-relations card instead of showing a fake 0.
  const relationCount = await countRelations(client, items);

  return {
    ...base,
    metrics: buildMetrics(items, base.metrics, relationCount),
    categories: buildCategories(items),
    recent: buildRecentRowsFromItems(items),
  };
}

/**
 * Sum the outgoing relations of every knowledge item via
 * `knowledge.relations.list`. Each per-item read is independently try/caught so
 * one failure does not zero the whole count. Returns `null` ONLY if the list was
 * empty or EVERY per-item read failed (no real signal → keep the fixture card);
 * otherwise the real edge total (which may legitimately be 0).
 */
async function countRelations(
  client: KnowledgeDataClient,
  items: ReadonlyArray<KnowledgeListDto>,
): Promise<number | null> {
  if (items.length === 0) return null;
  let total = 0;
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
        total += rels.length;
      } catch {
        // Per-item read failed — skip it, keep aggregating the rest.
      }
    }),
  );
  return anyOk ? total : null;
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
      // km-memory has no real source — keep the fixture card.
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

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}
