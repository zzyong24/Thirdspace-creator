import {requireWorkspace} from "../../workspace-scope";
import type { RequestContext } from "@creatoros/contract";
import { requireAccountId } from "@creatoros/backend";
import type {
  SearchRepository,
  EmbeddingSnapshot,
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

// [T-093] hybrid 检索结果:真实索引文档 + 命中来源标注(exact=ILIKE 精确子串,
// semantic=embedding 余弦)。score 仅语义命中携带(0~1 余弦相似度)。
export interface HybridSearchHit {
  document: SearchDocumentResource;
  matchType: "exact" | "semantic";
  score: number | null;
}

export interface HybridSearchOpts {
  entityType?: string;
  limit?: number;
  /**
   * 查询向量(调用方经可配 embedding capability 算好注入;null/缺省 = 未配置模型,
   * 纯关键词路径——诚实降级,不静默装 AI)。
   */
  queryEmbedding?: number[] | null;
  /** undefined沿原v1；v2仅比较本次冻结模型与实际维度。 */
  embeddingConfigDigest?:string;
}

// [T-093] 语义命中阈值:余弦低于它的候选直接截断(不足额不硬凑,SPEC §3.1)。
export const SEMANTIC_MIN_SCORE = 0.35;

/** 余弦相似度(维度不符/零向量 → null,视为不可比,不凑分)。 */
export function cosineSimilarity(
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number>,
): number | null {
  if (a.length === 0 || a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface SearchService {
  listMissingEmbeddings(ctx: RequestContext, entityType: string, limit: number, embeddingConfigDigest?:string): Promise<EmbeddingSnapshot[]>;
  fillMissingEmbedding(ctx: RequestContext, snapshot: EmbeddingSnapshot, embedding: number[], signal?: AbortSignal, embeddingConfigDigest?:string): Promise<boolean>;
  upsertDocument(ctx: RequestContext, input: UpsertInput): Promise<SearchDocumentResource>;
  removeDocument(ctx: RequestContext, entityType: string, entityId: string): Promise<void>;
  search(ctx: RequestContext, query: string, opts?: SearchOpts): Promise<SearchDocumentResource[]>;
  /**
   * [T-093] hybrid 检索(SPEC §3.1 方案 B 为核 + A 兜底):ILIKE 精确命中排最前,
   * 其余按 queryEmbedding 与文档 embedding 的余弦分数补位(阈值截断,不足额不硬凑);
   * queryEmbedding 缺省/null = 纯关键词(诚实降级)。只读,不产实体。
   */
  hybridSearch(
    ctx: RequestContext,
    query: string,
    opts?: HybridSearchOpts,
  ): Promise<HybridSearchHit[]>;
  /**
   * [T-093] 某 entityType 的全部索引文档(embedding 回填挑无向量行用)。
   */
  listDocumentsByEntityType(
    ctx: RequestContext,
    entityType: string,
  ): Promise<SearchDocumentResource[]>;
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
  // [T-332 S2 · SPEC §4.2] 未选号 = 引导态,搜索面禁读写:每个经 ctx 的入口先断言
  // ctx.accountId 非空(缺失 → AccountRequiredError,前端译成绑定引导)。search_history
  // 虽是 user 级表,但它只经搜索面到达,同门处理(不给引导态留旁路)。系统重建走
  // rebuildSearchIndexSystem(search.seed.ts),不经这里。
  return {
    async upsertDocument(ctx, input) {
      requireWorkspace(ctx);
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
      requireWorkspace(ctx);
      // Idempotent: the repo DELETE is a no-op when the (user-scoped) doc is
      // absent. Removal of DERIVED data never errors on "not found".
      await repoForCtx(ctx).removeDocument(entityType, entityId);
    },

    async search(ctx, query, opts) {
      requireWorkspace(ctx);
      const rows = await repoForCtx(ctx).search(query, opts);
      return rows.map(toResource);
    },

    async hybridSearch(ctx, query, opts) {
      requireWorkspace(ctx);
      const trimmed = query.trim();
      if (trimmed === "") return [];
      const repo = repoForCtx(ctx);
      const limit = opts?.limit ?? 20;
      const entityType = opts?.entityType;

      // 精确层(方案 A 兜底 + 融合时排最前):既有 ILIKE 路径原样复用。
      const exactRows = await repo.search(trimmed, { entityType, limit });
      const hits: HybridSearchHit[] = exactRows.map((row) => ({
        document: toResource(row),
        matchType: "exact" as const,
        score: null,
      }));

      // 语义层(方案 B 核心):调用方注入 queryEmbedding(可配 capability 算出);
      // 未注入 = 未配置模型 → 纯关键词返回(诚实降级,调用方渲提示条)。
      const queryEmbedding = opts?.queryEmbedding ?? null;
      if(opts?.embeddingConfigDigest!==undefined&&!/^sha256:[a-f0-9]{64}$/.test(opts.embeddingConfigDigest))throw new Error("向量模型身份摘要无效");
      if (queryEmbedding && queryEmbedding.length > 0 && entityType) {
        const seen = new Set(exactRows.map((r) => r.id));
        const all = await repo.listByEntityType(entityType);
        const scored: Array<{ row: SearchDocumentRow; score: number }> = [];
        for (const row of all) {
          if (seen.has(row.id)) continue;
          const emb = row.embedding as number[] | null;
          if (!Array.isArray(emb) || emb.length === 0) continue;
          const identity=row.embeddingIdentity;
          if(opts?.embeddingConfigDigest!==undefined&&(!identity||identity.schemaVersion!==1||identity.configDigest!==opts.embeddingConfigDigest||identity.dimensions!==queryEmbedding.length||identity.dimensions!==emb.length))continue;
          const score = cosineSimilarity(queryEmbedding, emb);
          // 阈值截断:低分不进结果(不足额不硬凑)。
          if (score === null || score < SEMANTIC_MIN_SCORE) continue;
          scored.push({ row, score });
        }
        scored.sort((a, b) => b.score - a.score);
        for (const { row, score } of scored) {
          if (hits.length >= limit) break;
          hits.push({
            document: toResource(row),
            matchType: "semantic",
            score,
          });
        }
      }
      return hits.slice(0, limit);
    },

    async listMissingEmbeddings(ctx, entityType, limit, embeddingConfigDigest) {
      requireWorkspace(ctx);
      if (!Number.isInteger(limit) || limit < 1 || limit > 16) throw new Error("索引补算批次必须为 1–16 条");
      return repoForCtx(ctx).listMissingEmbeddings(entityType, limit, embeddingConfigDigest);
    },
    async fillMissingEmbedding(ctx, snapshot, embedding, signal, embeddingConfigDigest) {
      requireWorkspace(ctx);
      signal?.throwIfAborted();
      if (!embedding.length || !embedding.every(Number.isFinite)) throw new Error("向量结果无效");
      return repoForCtx(ctx).fillMissingEmbedding(structuredClone(snapshot), [...embedding], signal, embeddingConfigDigest);
    },
    async listDocumentsByEntityType(ctx, entityType) {
      requireWorkspace(ctx);
      const rows = await repoForCtx(ctx).listByEntityType(entityType);
      return rows.map(toResource);
    },

    async facets(ctx, query) {
      requireWorkspace(ctx);
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
      requireWorkspace(ctx);
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
      requireWorkspace(ctx);
      const repo = repoForCtx(ctx);
      // [T-332 S2] 语义收窄:strict repo 下这里重建的是**当前号**的索引切片(删当前号
      // 文档、以当前号 stamp 重播)。跨全用户的多号重建走 rebuildSearchIndexSystem。
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
      requireWorkspace(ctx);
      return repoForCtx(ctx).listHistory(limit);
    },
  };
}
