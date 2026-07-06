import {
  and,
  eq,
  desc,
  ilike,
  type Db,
} from "@creatoros/backend";
import { searchDocuments, searchHistory } from "./search.db-schema";

// Search repository (foundation §5.2) — user-scoped queries ONLY. The repo is
// constructed per-user via RepoDeps.userId; EVERY select/update/delete filters on
// that userId and EVERY insert stamps it (foundation §1/§2, SPEC §10/§20). There
// is NO unscoped db.select/update/delete.
//
// SearchDocument is DERIVED data (SPEC §16): upsert is idempotent (ON CONFLICT
// update on the (user_id, entity_type, entity_id) unique index), remove is an
// idempotent no-op when absent, and deleteAllDocuments backs rebuildUserIndex.
// search() does FTS via ILIKE over the denormalized search_text column (the
// pgvector/tsvector swap is a stage-N change behind this same seam — roadmap §59).

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner for created/queried rows
  // [T-136 切片 b · SPEC §B MAJOR-4] 搜索索引按号隔离维度(防跨号串味)。search_documents
  // 是 owned-root(有 account_id);search_history 是 user 级查询日志,不按号隔离。null =
  // 未选号 / 全局视图 / 存量兜底(§E 退化):scopedDoc 叠加为 undefined → 只按 userId 过滤。
  accountId: string | null;
}

export type SearchDocumentRow = typeof searchDocuments.$inferSelect;
export type SearchHistoryRow = typeof searchHistory.$inferSelect;

export interface UpsertDocumentInput {
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  searchText: string;
  embedding?: number[];
}

export interface AppendHistoryInput {
  query: string;
  filters: Record<string, unknown>;
  resultCount: number;
}

export interface SearchOpts {
  entityType?: string;
  limit?: number;
}

export interface SearchRepository {
  upsertDocument(input: UpsertDocumentInput): Promise<SearchDocumentRow>;
  removeDocument(entityType: string, entityId: string): Promise<void>;
  search(query: string, opts?: SearchOpts): Promise<SearchDocumentRow[]>;
  /**
   * Rows matching `query` WITHOUT the entityType narrowing — the raw material the
   * service aggregates into facet buckets. Same FTS predicate as `search()`
   * (user-scoped ILIKE over search_text), but never filtered by entityType so the
   * service can count EVERY dimension's values from one read. Empty/whitespace
   * query ⇒ [] (no full-table dump), matching `search()`. No limit: facet counts
   * must reflect the whole match set, not the first page.
   */
  facetMatches(query: string): Promise<SearchDocumentRow[]>;
  /**
   * [T-093] 该用户某 entityType 的全部索引文档(user-scoped 全量读)——语义检索的
   * 进程内余弦扫描原料(库量级几百条,<10ms;>5000 条再上 pgvector,seam 不变)。
   * 也用于 embedding 回填(挑出 embedding 为空的行补算)。
   */
  listByEntityType(entityType: string): Promise<SearchDocumentRow[]>;
  appendHistory(input: AppendHistoryInput): Promise<SearchHistoryRow>;
  listHistory(limit?: number): Promise<SearchHistoryRow[]>;
  deleteAllDocuments(): Promise<void>;
  seedDocuments(rows: SearchDocumentRow[]): Promise<void>;
  seedHistory(rows: SearchHistoryRow[]): Promise<void>;
}

// Escape LIKE/ILIKE wildcards in user input so a query like "50%" matches the
// literal text, not "any chars". `\` is the default escape char in Postgres LIKE.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function createSearchRepository(db: Db, deps: RepoDeps): SearchRepository {
  // [T-136 切片 b] scopedDoc 升级为「userId + 按号门」复合条件:有号叠加
  // `eq(searchDocuments.accountId, …)`,null 时 accountGate 为 undefined → drizzle
  // `and()` 忽略 → 退化为只按 userId 过滤(返该 user 全部索引文档)。所有 search_documents
  // owned-root 读/删点(search/facetMatches/listByEntityType/removeDocument/
  // deleteAllDocuments)复用它,一处升级全覆盖。search_history 不按号隔离,scopedHist 不变。
  const accountGate = deps.accountId
    ? eq(searchDocuments.accountId, deps.accountId)
    : undefined;
  const scopedDoc = and(eq(searchDocuments.userId, deps.userId), accountGate);
  const scopedHist = eq(searchHistory.userId, deps.userId);

  return {
    async upsertDocument(input) {
      const indexedAt = deps.now();
      const inserted = await db
        .insert(searchDocuments)
        .values({
          id: deps.nextId("searchdoc"),
          userId: deps.userId,
          // [T-136 切片 b] create stamp:投影索引归到当前号(null 兜底,派生可重建)。诚实
          // 存疑:唯一键 (user_id, entity_type, entity_id) **不含 account_id** —— 同一 entity
          // 若在两个号下被索引会撞唯一约束(设计层:索引是 per-entity 派生,当前不支持同
          // entity 跨号双份,非本切片能定)。
          accountId: deps.accountId,
          entityType: input.entityType,
          entityId: input.entityId,
          title: input.title,
          body: input.body,
          searchText: input.searchText,
          embedding: input.embedding ?? [],
          indexedAt,
        })
        .onConflictDoUpdate({
          target: [
            searchDocuments.userId,
            searchDocuments.entityType,
            searchDocuments.entityId,
          ],
          set: {
            // conflict 时刷新归属号(重建/重索引把 stale 号纠正到当前号)。
            accountId: deps.accountId,
            title: input.title,
            body: input.body,
            searchText: input.searchText,
            embedding: input.embedding ?? [],
            indexedAt,
          },
        })
        .returning();
      return inserted[0]!;
    },

    async removeDocument(entityType, entityId) {
      await db
        .delete(searchDocuments)
        .where(
          and(
            scopedDoc,
            eq(searchDocuments.entityType, entityType),
            eq(searchDocuments.entityId, entityId),
          ),
        );
    },

    async search(query, opts) {
      // Empty / whitespace query → [] (no full-table dump).
      const trimmed = query.trim();
      if (trimmed === "") return [];
      const pattern = `%${escapeLike(trimmed.toLowerCase())}%`;
      const predicate = opts?.entityType
        ? and(
            scopedDoc,
            eq(searchDocuments.entityType, opts.entityType),
            ilike(searchDocuments.searchText, pattern),
          )
        : and(scopedDoc, ilike(searchDocuments.searchText, pattern));
      return db
        .select()
        .from(searchDocuments)
        .where(predicate)
        .orderBy(desc(searchDocuments.indexedAt))
        .limit(opts?.limit ?? 50);
    },

    async facetMatches(query) {
      // Empty / whitespace query → [] (no full-table dump), same guard as search().
      const trimmed = query.trim();
      if (trimmed === "") return [];
      const pattern = `%${escapeLike(trimmed.toLowerCase())}%`;
      // Deliberately NO entityType narrowing: the service buckets across every
      // dimension from this one match set. No limit (facet counts are over the
      // whole match set). Ordered for a deterministic read.
      return db
        .select()
        .from(searchDocuments)
        .where(and(scopedDoc, ilike(searchDocuments.searchText, pattern)))
        .orderBy(desc(searchDocuments.indexedAt));
    },

    async listByEntityType(entityType) {
      // [T-093] user-scoped 全量读(语义扫描/回填用);ordered 保证确定性。
      return db
        .select()
        .from(searchDocuments)
        .where(and(scopedDoc, eq(searchDocuments.entityType, entityType)))
        .orderBy(desc(searchDocuments.indexedAt));
    },

    async appendHistory(input) {
      const inserted = await db
        .insert(searchHistory)
        .values({
          id: deps.nextId("searchhist"),
          userId: deps.userId,
          query: input.query,
          filters: input.filters,
          resultCount: input.resultCount,
          searchedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async listHistory(limit = 10) {
      return db
        .select()
        .from(searchHistory)
        .where(scopedHist)
        .orderBy(desc(searchHistory.searchedAt))
        .limit(limit);
    },

    async deleteAllDocuments() {
      await db.delete(searchDocuments).where(scopedDoc);
    },

    async seedDocuments(rows) {
      if (rows.length === 0) return;
      await db.insert(searchDocuments).values(rows).onConflictDoNothing();
    },

    async seedHistory(rows) {
      if (rows.length === 0) return;
      await db.insert(searchHistory).values(rows).onConflictDoNothing();
    },
  };
}
