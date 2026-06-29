import type { RequestContext } from "@creatoros/contract";
import type {
  SearchRepository,
  SearchDocumentRow,
  SearchHistoryRow,
  SearchOpts,
} from "./search.repository";
import type { SearchDocumentResource } from "./search.schema";

// SearchService (foundation §5.3) — RequestContext-taking methods exposing the
// SPEC §16 internal API verbatim: upsertDocument / removeDocument / search /
// recordSearch / rebuildUserIndex. Each builds a user-scoped repo from
// `ctx.userId` (foundation §2). Search has NO §12 business state machine
// (roadmap §398: "No machine for … Search"); its invariants are the SPEC §16
// DERIVED-INDEX rules, encoded as guards:
//   - the index is derived data — it may be dropped and rebuilt; it is never the
//     source of business truth (rebuildUserIndex);
//   - index/history failure NEVER rolls back business truth — recordSearch wraps
//     the write and returns a non-throwing { ok:false; retryable:true } outcome
//     (SPEC §16/§11, foundation §4);
//   - upsert is idempotent (ON CONFLICT update); removeDocument is an idempotent
//     no-op when absent.
//
// The repo is supplied via a per-ctx factory (mirrors the notifications service
// factory), so the service stays db-agnostic and the error-swallow path is
// unit-testable with a stub repo.

export type SearchIndexOutcome =
  | { ok: true }
  | { ok: false; retryable: true; error: string };

// One selectable facet value + its hit count over the current match set.
export interface SearchFacetValue {
  value: string;
  count: number;
}

// Per-dimension facet aggregation for a query. DERIVED at read time from the
// matched SearchDocument rows; never stored. Buckets are ordered descending by
// count then ascending by value for a deterministic wire shape.
export interface SearchFacets {
  query: string;
  entityType: SearchFacetValue[];
  tag: SearchFacetValue[];
}

export interface UpsertInput {
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  /** Optional: when omitted the service derives it from title + body. */
  searchText?: string;
  embedding?: number[];
}

export interface RebuildDoc {
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  searchText?: string;
  embedding?: number[];
}

export interface ServiceDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
}

export interface SearchService {
  upsertDocument(ctx: RequestContext, input: UpsertInput): Promise<SearchDocumentResource>;
  removeDocument(ctx: RequestContext, entityType: string, entityId: string): Promise<void>;
  search(ctx: RequestContext, query: string, opts?: SearchOpts): Promise<SearchDocumentResource[]>;
  /**
   * Aggregate the documents matching `query` into per-dimension facet buckets
   * (entityType / tag) with hit counts. DERIVED read over the same user-scoped
   * index `search()` queries — stores nothing. Empty/whitespace query ⇒ all
   * buckets empty (matches the `search()` empty-query contract).
   */
  facets(ctx: RequestContext, query: string): Promise<SearchFacets>;
  recordSearch(
    ctx: RequestContext,
    input: { query: string; filters: Record<string, unknown>; resultCount: number },
  ): Promise<SearchIndexOutcome>;
  rebuildUserIndex(ctx: RequestContext, docs: RebuildDoc[]): Promise<{ count: number }>;
  listHistory(ctx: RequestContext, limit?: number): Promise<SearchHistoryRow[]>;
}

// Derive the denormalized FTS text deterministically: `${title}\n${body}`,
// lowercased + trimmed. Computed HERE so every owning module passes only
// title+body and the index column has ONE source (the service). No Date.now /
// Math.random — the value is a pure function of its inputs.
function deriveSearchText(title: string, body: string): string {
  return `${title}\n${body}`.toLowerCase().trim();
}

// Owning modules denormalize card-only fields (incl. `tags` for knowledge docs)
// as a JSON payload in `body` at upsert time (same convention the page composer
// reads). Parse defensively: plain-text bodies (e.g. legacy seeds) carry no tags.
function parseTags(body: string): string[] {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object") return [];
    const tags = (parsed as Record<string, unknown>).tags;
    return Array.isArray(tags)
      ? tags.filter((t): t is string => typeof t === "string" && t.trim() !== "")
      : [];
  } catch {
    return [];
  }
}

// Turn a value→count map into a stable bucket array: descending count, then
// ascending value (locale-independent) so the wire shape is deterministic.
function toBuckets(counts: Map<string, number>): SearchFacetValue[] {
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (b.count - a.count) || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
}

function toResource(row: SearchDocumentRow): SearchDocumentResource {
  return {
    id: row.id,
    userId: row.userId,
    entityType: row.entityType,
    entityId: row.entityId,
    title: row.title,
    body: row.body,
    searchText: row.searchText,
    embedding: (row.embedding as number[]) ?? [],
    indexedAt: row.indexedAt,
  };
}

export function createSearchService(
  repoForCtx: (ctx: RequestContext) => SearchRepository,
  _deps: ServiceDeps,
): SearchService {
  return {
    async upsertDocument(ctx, input) {
      const repo = repoForCtx(ctx);
      const row = await repo.upsertDocument({
        entityType: input.entityType,
        entityId: input.entityId,
        title: input.title,
        body: input.body,
        searchText: input.searchText ?? deriveSearchText(input.title, input.body),
        embedding: input.embedding,
      });
      return toResource(row);
    },

    async removeDocument(ctx, entityType, entityId) {
      // Idempotent: the repo DELETE is a no-op when the (user-scoped) doc is
      // absent. Removal of DERIVED data never errors on "not found".
      await repoForCtx(ctx).removeDocument(entityType, entityId);
    },

    async search(ctx, query, opts) {
      const rows = await repoForCtx(ctx).search(query, opts);
      return rows.map(toResource);
    },

    async facets(ctx, query) {
      const normalized = query.trim();
      // Empty/whitespace query ⇒ all buckets empty (mirrors search()'s guard;
      // the repo also short-circuits, so this is belt-and-suspenders).
      if (normalized === "") {
        return { query: "", entityType: [], tag: [] };
      }
      const rows = await repoForCtx(ctx).facetMatches(query);
      const entityTypeCounts = new Map<string, number>();
      const tagCounts = new Map<string, number>();
      for (const row of rows) {
        entityTypeCounts.set(
          row.entityType,
          (entityTypeCounts.get(row.entityType) ?? 0) + 1,
        );
        for (const tag of parseTags(row.body)) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }
      }
      return {
        query: normalized,
        entityType: toBuckets(entityTypeCounts),
        tag: toBuckets(tagCounts),
      };
    },

    async recordSearch(ctx, input) {
      // Index/history failure must NEVER roll back the owning module's write
      // (SPEC §16/§11). Swallow the repo error into a retryable record instead of
      // throwing — the caller (the read transport) ignores the outcome and the
      // page still renders.
      try {
        await repoForCtx(ctx).appendHistory({
          query: input.query,
          filters: input.filters,
          resultCount: input.resultCount,
        });
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          retryable: true,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async rebuildUserIndex(ctx, docs) {
      const repo = repoForCtx(ctx);
      // Drop the user's whole index then re-upsert — the index is derived and
      // rebuildable (SPEC §16). All under ctx.userId (the repo is user-scoped).
      await repo.deleteAllDocuments();
      for (const doc of docs) {
        await repo.upsertDocument({
          entityType: doc.entityType,
          entityId: doc.entityId,
          title: doc.title,
          body: doc.body,
          searchText: doc.searchText ?? deriveSearchText(doc.title, doc.body),
          embedding: doc.embedding,
        });
      }
      return { count: docs.length };
    },

    async listHistory(ctx, limit) {
      return repoForCtx(ctx).listHistory(limit);
    },
  };
}
