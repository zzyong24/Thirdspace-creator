import {workspaceFilter,workspaceStamp,assertWritableWorkspace} from "../../workspace-scope";
import {
  and,
  eq,
  sql,
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
  // [T-332 S2 · ISO-02/03] 搜索索引按号隔离维度(防跨号串味),**必填 strict**:
  // service 入口已 requireAccountId(未选号 = 引导态,禁读写,SPEC §4.2),不存在
  // 「无号 → 退化全量」分支。search_history 是 user 级查询日志,不按号隔离。
  accountId: string|null;
  groupId?: string|null;
}

export type SearchDocumentRow = Omit<typeof searchDocuments.$inferSelect,"groupId"|"embeddingIdentity"> & {groupId?:string|null;embeddingIdentity?:EmbeddingIdentity|null};
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

export type EmbeddingIdentity={schemaVersion:1;configDigest:string;dimensions:number};
export type EmbeddingSnapshot = Pick<SearchDocumentRow, "id" | "entityType" | "entityId" | "indexedAt" | "title" | "body" | "searchText"> & {embedding?:unknown;embeddingIdentity?:EmbeddingIdentity|null};

export interface SearchRepository {
  listMissingEmbeddings(entityType: string, limit: number, embeddingConfigDigest?:string): Promise<SearchDocumentRow[]>;
  fillMissingEmbedding(snapshot: EmbeddingSnapshot, embedding: number[], signal?: AbortSignal, embeddingConfigDigest?:string): Promise<boolean>;
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
  // [T-332 S2 · ISO-02] scopedDoc = 「userId + strict 按号门」复合条件:accountId 必填,
  // 恒叠 `workspaceFilter(searchDocuments, deps)`(跨号文档在本号搜不到)。原
  // 「null → 退化只按 userId」分支已随 SPEC §4.2 裁决(未选号 = 引导态)收掉。所有
  // search_documents owned-root 读/删点(search/facetMatches/listByEntityType/
  // removeDocument/deleteAllDocuments)复用它。search_history 不按号隔离,scopedHist 不变。
  const scopedDoc = and(
    eq(searchDocuments.userId, deps.userId),
    workspaceFilter(searchDocuments, deps),
  );
  const scopedHist = eq(searchHistory.userId, deps.userId);

  return {
    async listMissingEmbeddings(entityType, limit, embeddingConfigDigest) {
      if(embeddingConfigDigest!==undefined&&!/^sha256:[a-f0-9]{64}$/.test(embeddingConfigDigest))throw new Error("向量模型身份摘要无效");
      return db.select().from(searchDocuments).where(and(scopedDoc,
        eq(searchDocuments.entityType, entityType), embeddingConfigDigest===undefined?sql`${searchDocuments.embedding} = '[]'::jsonb`:sql`(${searchDocuments.embedding} = '[]'::jsonb OR ${searchDocuments.embeddingIdentity}->>'configDigest' IS DISTINCT FROM ${embeddingConfigDigest} OR ${searchDocuments.embeddingIdentity}->>'schemaVersion' IS DISTINCT FROM '1' OR ${searchDocuments.embeddingIdentity}->>'dimensions' IS DISTINCT FROM jsonb_array_length(${searchDocuments.embedding})::text)`,
      )).orderBy(desc(searchDocuments.indexedAt)).limit(limit);
    },
    async fillMissingEmbedding(snapshot, embedding, signal, embeddingConfigDigest) {
      if(embeddingConfigDigest!==undefined&&(!/^sha256:[a-f0-9]{64}$/.test(embeddingConfigDigest)||!Array.isArray(snapshot.embedding)))throw new Error("向量模型身份或原向量快照无效");
      if(!embedding.length||!embedding.every(Number.isFinite))throw new Error("向量结果无效");
      const embeddingIdentity=embeddingConfigDigest===undefined?null:{schemaVersion:1 as const,configDigest:embeddingConfigDigest,dimensions:embedding.length};
      // SEMANTIC_BOUNDARY_ALLOW: 精确内容/旧向量/旧身份CAS只防迟到覆盖，不判断正文语义或选择模型。
      return db.transaction(async tx => {
        signal?.throwIfAborted();
        const rows = await tx.update(searchDocuments).set({embedding,embeddingIdentity}).where(and(
          scopedDoc, eq(searchDocuments.id, snapshot.id),
          eq(searchDocuments.entityType, snapshot.entityType), eq(searchDocuments.entityId, snapshot.entityId),
          eq(searchDocuments.indexedAt, snapshot.indexedAt), eq(searchDocuments.title, snapshot.title),
          eq(searchDocuments.body, snapshot.body), eq(searchDocuments.searchText, snapshot.searchText),
          embeddingConfigDigest===undefined?sql`${searchDocuments.embedding} = '[]'::jsonb`:and(sql`${searchDocuments.embedding} = ${JSON.stringify(snapshot.embedding)}::jsonb`,snapshot.embeddingIdentity==null?sql`${searchDocuments.embeddingIdentity} IS NULL`:sql`${searchDocuments.embeddingIdentity} = ${JSON.stringify(snapshot.embeddingIdentity)}::jsonb`),
        )).returning({id: searchDocuments.id});
        signal?.throwIfAborted();
        return rows.length === 1;
      });
    },
    async upsertDocument(input) {
      await assertWritableWorkspace(db,{...deps,requestId:"search-index",source:"user"});
      const indexedAt = deps.now();
      const inserted = await db
        .insert(searchDocuments)
        .values({
          id: deps.nextId("searchdoc"),
          userId: deps.userId,
          // [T-332 S2 · ISO-03/§4.6] create stamp:投影索引归到当前号(必填,无 null 兜底)。
          // 唯一键 (user_id, entity_type, entity_id) 不含 account_id 是安全的:源实体本身
          // per-account(一个 entity 只属一个号),同 entity 不存在跨号双份索引。
          ...workspaceStamp(deps),
          entityType: input.entityType,
          entityId: input.entityId,
          title: input.title,
          body: input.body,
          searchText: input.searchText,
          embedding: input.embedding ?? [],
          embeddingIdentity:null,
          indexedAt,
        })
        .onConflictDoUpdate({
          target: [
            searchDocuments.userId,
            searchDocuments.entityType,
            searchDocuments.entityId,
          ],
          set: {
            // conflict 时刷新归属号(重建/重索引把 stale 号纠正到当前号;strict 必填)。
            ...workspaceStamp(deps),
            title: input.title,
            body: input.body,
            searchText: input.searchText,
            embedding: input.embedding ?? [],
          embeddingIdentity:null,
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
