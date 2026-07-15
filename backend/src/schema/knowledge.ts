import { pgTable, text, integer, jsonb } from "drizzle-orm/pg-core";

// Knowledge tables (data-model §5 + contract/src/resources/knowledge.ts; SPEC §13
// "知识库" group). Canonical defs live in shared infra (@creatoros/backend) because
// createDb() applies KNOWLEDGE_DDL at init alongside PROJECTS_DDL / IDENTITY_DDL /
// … (foundation §1: the pglite/Drizzle db factory is the shared-infra home). The
// knowledge module (frontend/src/server/modules/knowledge) re-exports these so
// there is ONE source of truth, mirroring notifications
// (backend/src/schema/notifications.ts ↔ notifications.db-schema.ts).
//
// Ownership: `user_id` lives on the owned root row only (knowledge_items); the
// children (revisions/relations) inherit ownership via their FK to the item and
// are scoped through the parent's ownership check (foundation §2). Timestamps are
// ISO-8601 text (contract `iso8601`), enums are text, json is jsonb. §12: items
// are born `active` (one-way → archived); revisions are append-only/immutable
// (no updated_at).

export const knowledgeItems = pgTable("knowledge_items", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  // [T-136 多账号 · OQ1 裁决=按号独立] 按号隔离维度(soft FK → platform_accounts.id)。
  // nullable 稳定终态(SPEC §6 MAJOR-3)。子表 revisions/relations 无 user_id、经父门透传
  // 属主,不加 account_id(同 user_id 范式)。
  accountId: text("account_id").notNull(), // [T-332 S1] per-account 收口 NOT NULL(迁移 0042;C-01=A 案独立)
  currentRevisionId: text("current_revision_id").notNull(),
  knowledgeType: text("knowledge_type").notNull().default("note"),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull().default("manual"),
  sourceUrl: text("source_url"), // nullable → contract string|null
  sourceMetadata: jsonb("source_metadata").notNull().default({}),
  status: text("status").notNull().default("active"),
  archivedAt: text("archived_at"), // nullable → contract iso8601|null
  // [T-079a] 出处与可信度(迁移 0018)。nullable → contract string|null。
  sourceNote: text("source_note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const knowledgeRevisions = pgTable("knowledge_revisions", {
  id: text("id").primaryKey(),
  knowledgeItemId: text("knowledge_item_id").notNull(),
  revisionNumber: integer("revision_number").notNull(),
  content: text("content").notNull().default(""),
  structuredData: jsonb("structured_data").notNull().default({}),
  createdAt: text("created_at").notNull(),
  // No updated_at — revisions are immutable (matches knowledgeRevisionResource).
});

export const knowledgeRelations = pgTable("knowledge_relations", {
  id: text("id").primaryKey(),
  sourceKnowledgeId: text("source_knowledge_id").notNull(),
  targetKnowledgeId: text("target_knowledge_id").notNull(),
  relationType: text("relation_type").notNull(),
  // `strength` is the contract's `z.number()` stored as the decimal string (same
  // text-for-decimal approach the slice uses for ISO timestamps); the repo
  // Number()-parses it on read so the DTO stays numeric.
  strength: text("strength").notNull().default("1"),
  createdByType: text("created_by_type").notNull().default("user"),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - knowledge_items_user_created_ix: user-scoped list lookups (created_at asc).
//   - knowledge_revisions_item_ix: per-item revision lookups (max revisionNumber).
//   - knowledge_relations_source_ix: per-source relation lookups.
export const KNOWLEDGE_DDL = `
CREATE TABLE IF NOT EXISTS knowledge_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  current_revision_id TEXT NOT NULL,
  knowledge_type TEXT NOT NULL DEFAULT 'note',
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_url TEXT,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  archived_at TEXT,
  source_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS knowledge_items_user_created_ix ON knowledge_items(user_id, created_at);
-- [T-136 多账号] 按号隔离列(additive、幂等)。存量行 NULL,迁移 0025 backfill 默认号。
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_account ON knowledge_items (user_id, account_id);
CREATE TABLE IF NOT EXISTS knowledge_revisions (
  id TEXT PRIMARY KEY,
  knowledge_item_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS knowledge_revisions_item_ix ON knowledge_revisions(knowledge_item_id, revision_number);
CREATE TABLE IF NOT EXISTS knowledge_relations (
  id TEXT PRIMARY KEY,
  source_knowledge_id TEXT NOT NULL,
  target_knowledge_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  strength TEXT NOT NULL DEFAULT '1',
  created_by_type TEXT NOT NULL DEFAULT 'user'
);
CREATE INDEX IF NOT EXISTS knowledge_relations_source_ix ON knowledge_relations(source_knowledge_id);
`;
