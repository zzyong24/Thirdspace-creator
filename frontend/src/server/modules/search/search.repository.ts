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
  const scopedDoc = eq(searchDocuments.userId, deps.userId);
  const scopedHist = eq(searchHistory.userId, deps.userId);

  return {
    async upsertDocument(input) {
      const indexedAt = deps.now();
      const inserted = await db
        .insert(searchDocuments)
        .values({
          id: deps.nextId("searchdoc"),
          userId: deps.userId,
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
