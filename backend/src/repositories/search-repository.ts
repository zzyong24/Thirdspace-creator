import { eq, and, asc, desc, sql } from "drizzle-orm";
import type { Db } from "../db";
import { searchDocuments, searchHistory } from "../schema/search";

// Injected dependencies — mirrors project-repository's / knowledge-repository's
// RepoDeps so the repo stays deterministic (no Date.now / Math.random / fetch
// inside) and user-scoped from RequestContext.
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type DocumentRow = typeof searchDocuments.$inferSelect;
type HistoryRow = typeof searchHistory.$inferSelect;

// search_text is the denormalized FTS column: `${title}\n${body}`.lowercase().
// Computed here so the (entity_type, entity_id) idempotent upsert always writes
// a consistent, queryable value (schema/search.ts note).
const toSearchText = (title: string, body: string): string =>
  `${title}\n${body}`.toLowerCase();

export interface SearchRepository {
  // --- SearchDocument: a DERIVED, user-scoped index (SPEC §16). May be dropped
  // and rebuilt; never the source of business truth. ---
  seedDocuments(rows: DocumentRow[]): Promise<void>;
  listDocuments(): Promise<DocumentRow[]>;
  getDocument(documentId: string): Promise<DocumentRow>;
  // Idempotent upsert keyed on the (user_id, entity_type, entity_id) UNIQUE
  // index: re-indexing the same entity refreshes its row rather than duplicating.
  indexDocument(input: {
    entityType: string;
    entityId: string;
    title: string;
    body?: string;
    embedding?: number[];
  }): Promise<DocumentRow>;
  // ILIKE scan over the denormalized search_text column (pgvector/tsvector swap
  // is a stage-N change behind this same seam — schema/search.ts note). Newest
  // indexed first.
  search(query: string): Promise<DocumentRow[]>;
  removeDocument(documentId: string): Promise<void>;

  // --- SearchHistory: append-only log of issued queries, newest-first. ---
  recordHistory(input: {
    query: string;
    filters?: Record<string, unknown>;
    resultCount?: number;
  }): Promise<HistoryRow>;
  listHistory(): Promise<HistoryRow[]>;
}

export function createSearchRepository(db: Db, deps: RepoDeps): SearchRepository {
  // Owner-scoped read: a row owned by another user is invisible → same
  // "not found" surface project-/knowledge-repository use for cross-user / missing
  // rows (foundation §2 ownership).
  async function getDocument(documentId: string): Promise<DocumentRow> {
    const rows = await db
      .select()
      .from(searchDocuments)
      .where(
        and(
          eq(searchDocuments.id, documentId),
          eq(searchDocuments.userId, deps.userId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: search document not found: ${documentId}`);
    }
    return row;
  }

  return {
    async seedDocuments(rows) {
      if (rows.length === 0) return;
      await db.insert(searchDocuments).values(rows).onConflictDoNothing();
    },

    async listDocuments() {
      return db
        .select()
        .from(searchDocuments)
        .where(eq(searchDocuments.userId, deps.userId))
        .orderBy(desc(searchDocuments.indexedAt));
    },

    getDocument,

    // Idempotent upsert: the (user_id, entity_type, entity_id) UNIQUE index is the
    // ON CONFLICT target. First index inserts; re-index refreshes title/body/
    // search_text/embedding/indexed_at for the SAME row (no duplicate, stable id).
    async indexDocument({ entityType, entityId, title, body, embedding }) {
      const ts = deps.now();
      const bodyText = body ?? "";
      const searchText = toSearchText(title, bodyText);
      const embeddingVec = embedding ?? [];

      const inserted = await db
        .insert(searchDocuments)
        .values({
          id: deps.nextId("searchdoc"),
          userId: deps.userId,
          entityType,
          entityId,
          title,
          body: bodyText,
          searchText,
          embedding: embeddingVec,
          indexedAt: ts,
        })
        .onConflictDoUpdate({
          target: [
            searchDocuments.userId,
            searchDocuments.entityType,
            searchDocuments.entityId,
          ],
          set: {
            title,
            body: bodyText,
            searchText,
            embedding: embeddingVec,
            indexedAt: ts,
          },
        })
        .returning();
      return inserted[0]!;
    },

    async search(query) {
      const needle = `%${query.toLowerCase()}%`;
      return db
        .select()
        .from(searchDocuments)
        .where(
          and(
            eq(searchDocuments.userId, deps.userId),
            sql`${searchDocuments.searchText} ILIKE ${needle}`,
          ),
        )
        .orderBy(desc(searchDocuments.indexedAt));
    },

    async removeDocument(documentId) {
      await getDocument(documentId); // ownership + existence gate
      await db.delete(searchDocuments).where(eq(searchDocuments.id, documentId));
    },

    // Append-only: every issued query is a new row; existing history is never
    // mutated.
    async recordHistory({ query, filters, resultCount }) {
      const inserted = await db
        .insert(searchHistory)
        .values({
          id: deps.nextId("searchhist"),
          userId: deps.userId,
          query,
          filters: filters ?? {},
          resultCount: resultCount ?? 0,
          searchedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async listHistory() {
      return db
        .select()
        .from(searchHistory)
        .where(eq(searchHistory.userId, deps.userId))
        .orderBy(desc(searchHistory.searchedAt));
    },
  };
}
