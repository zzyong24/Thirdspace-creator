import { pgTable, text, integer, jsonb } from "drizzle-orm/pg-core";

// Search tables (data-model SEARCH_DOCUMENT + SEARCH_HISTORY blocks; SPEC §16
// "AI、搜索和系统" group). Canonical defs live in shared infra (@creatoros/backend)
// because createDb() applies SEARCH_DDL at init alongside PROJECTS_DDL /
// IDENTITY_DDL / TAXONOMY_DDL / NOTIFICATIONS_DDL (foundation §1: the
// pglite/Drizzle db factory is the shared-infra home). The search module
// (frontend/src/server/modules/search) re-exports these so there is ONE source
// of truth, mirroring identity (backend/src/schema/identity.ts ↔
// identity.db-schema.ts).
//
// SearchDocument is a DERIVED index over user-owned entities (SPEC §16): it may
// be dropped and rebuilt; it is never the source of business truth. Both entities
// extend BaseEntity only (no Timestamped) per contract/src/resources/search.ts,
// so neither carries created_at/updated_at. ISO-8601 text timestamps match the
// contract iso8601 primitive; ids are minted by the service/seed layer (no DB
// defaultRandom in the deterministic substrate). Every owned row carries user_id
// (foundation §2 ownership).

export const searchDocuments = pgTable("search_documents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  // [T-136 多账号 · SPEC §B MAJOR-4] 搜索索引按号隔离(防跨号串味);启动重建投影时按号
  // stamp。派生可重建,nullable 稳定终态。search_history 是 user 级查询日志,不按号隔离。
  accountId: text("account_id"),
  entityType: text("entity_type").notNull(), // project|knowledge|asset|video|...
  entityId: text("entity_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  // search_text is the denormalized FTS column: `${title}\n${body}`.lowercase().
  // The exact/lexical layer is queried via ILIKE (pgvector/tsvector swap for the
  // lexical layer is a stage-N change behind the same column + SearchService.search
  // seam — roadmap §59).
  searchText: text("search_text").notNull(),
  // embedding drives the semantic layer of hybridSearch (T-093): cosine similarity
  // against the query embedding with a threshold cutoff (see search.service.ts
  // hybridSearch; persistence-client hybridSearch lazily backfills doc embeddings
  // and computes the query embedding at runtime). The exact layer still goes through
  // ILIKE; the semantic layer complements it by queryEmbedding cosine. jsonb
  // array-of-number per searchDocumentResource.embedding; avoids a pgvector dep.
  embedding: jsonb("embedding").notNull().default([]),
  indexedAt: text("indexed_at").notNull(),
});

export const searchHistory = pgTable("search_history", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  query: text("query").notNull(),
  filters: jsonb("filters").notNull().default({}),
  resultCount: integer("result_count").notNull().default(0),
  searchedAt: text("searched_at").notNull(),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - search_documents_user_entity_uniq: SearchDocument(entity_type, entity_id)
//     unique WITHIN a user (data-model §868) — the ON CONFLICT target for the
//     idempotent upsert.
//   - search_documents_user_indexed_ix: user-scoped newest-first result ordering.
//   - search_history_user_searched_ix: user-scoped newest-first history list.
export const SEARCH_DDL = `
CREATE TABLE IF NOT EXISTS search_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL,
  embedding JSONB NOT NULL DEFAULT '[]',
  indexed_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS search_documents_user_entity_uniq ON search_documents (user_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS search_documents_user_indexed_ix ON search_documents(user_id, indexed_at);
-- [T-136 多账号 · MAJOR-4] search_documents 按号隔离列(additive、幂等)。存量行 NULL;派生索引
-- 可重建,迁移 0025 也 backfill 默认号(重建时会重新 stamp)。搜索按 ctx.accountId 过滤。
ALTER TABLE search_documents ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_search_documents_user_account ON search_documents (user_id, account_id, indexed_at);
CREATE TABLE IF NOT EXISTS search_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  query TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  result_count INTEGER NOT NULL DEFAULT 0,
  searched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS search_history_user_searched_ix ON search_history(user_id, searched_at);
`;
