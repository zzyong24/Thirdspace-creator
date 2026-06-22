import { pgTable, text, integer } from "drizzle-orm/pg-core";

// Taxonomy tables (data-model §5 TAG / ENTITY_TAG). Canonical defs live in
// shared infra (@creatoros/backend) because createDb() applies TAXONOMY_DDL at
// init alongside PROJECTS_DDL / IDENTITY_DDL (foundation §1: the pglite/Drizzle
// db factory is the shared-infra home). The taxonomy module
// (frontend/src/server/modules/taxonomy) re-exports these so there is ONE source
// of truth, mirroring identity (backend/src/schema/identity.ts ↔
// identity.db-schema.ts).
//
// Conventions follow the Projects/Identity exemplars: TEXT primary keys (ids are
// minted deterministically by the repository's injected nextId — no DB
// defaultRandom in the deterministic substrate), ISO-8601 text timestamps, enums
// as text. Owned rows carry user_id; entity_tags denormalizes user_id from the
// owning tag so the join table is independently user-scoped (never needs a
// cross-table read to enforce ownership).

export const tags = pgTable("tags", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#888888"),
  kind: text("kind"),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const entityTags = pgTable("entity_tags", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // denormalized from owning tag → independent scoping
  tagId: text("tag_id").notNull(),
  entityType: text("entity_type").notNull(), // one of TagEntityType
  entityId: text("entity_id").notNull(),
  createdAt: text("created_at").notNull(),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - tags_user_name_uq: tag names unique per user → DuplicateTagError via the
//     DB constraint.
//   - entity_tags_tag_entity_uq: one assignment per (tag, entity) → re-assign is
//     idempotent (SPEC §8 unique-constraint idempotency).
//   - entity_tags_entity_ix / entity_tags_tag_ix: user-scoped lookup indexes.
export const TAXONOMY_DDL = `
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#888888',
  kind TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS tags_user_name_uq ON tags(user_id, name);
CREATE TABLE IF NOT EXISTS entity_tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS entity_tags_tag_entity_uq ON entity_tags(tag_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS entity_tags_entity_ix ON entity_tags(user_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS entity_tags_tag_ix ON entity_tags(user_id, tag_id);
`;
