import { pgTable, text, integer, jsonb } from "drizzle-orm/pg-core";

// Positioning tables (七步整合设计 §3.2 — account-level 定位; contract v0.4
// resources/positioning.ts; SPEC §13 "定位" group). The canonical defs live in
// shared infra (@creatoros/backend) because createDb() applies POSITIONING_DDL at
// init alongside PROJECTS_DDL / LEARNINGS_DDL / … (foundation §1: the pglite/Drizzle
// db factory is the shared-infra home). The positioning module
// (frontend/src/server/modules/positioning) re-exports these so there is ONE source
// of truth, mirroring learnings/reviews (db-schema.ts ↔ backend/src/schema/*).
//
// Ownership: a denormalized `user_id TEXT NOT NULL` lives on EVERY owned row (the
// ownership boundary; SPEC §10/§20 — stamped at write time from ctx.userId).
// CreatorProfile is account-scoped (UNIQUE user_id — one profile per user this
// wave, OQ1). PositioningStatement is owned through `profile_id` but ALSO stamps
// `user_id` for direct scoping (same denormalized pattern Learnings used for child
// rows). Timestamps are ISO-8601 TEXT (to match the contract `iso8601` strings).
// JSON (`capabilities` / `keywords` / `product_anchor_ids`) is jsonb.
//
// Immutability invariant (七步 §3.2 + data-model rule 6, ArtifactVersion-style):
// `positioning_statements` rows NEVER update/delete — a new "version" is a NEW row
// with `version_number = max+1`. No `updated_at` column. UNIQUE
// `(profile_id, version_number)` (one row per version, mirrors ArtifactVersion).
// The guard lives in the service + repository (no update/delete method); the schema
// just backs the read with the (user_id, profile_id, version_number DESC) index.

export const creatorProfiles = pgTable("creator_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  persona: text("persona").notNull().default(""),
  field: text("field").notNull().default(""), // 领域/赛道
  audience: text("audience").notNull().default(""), // 目标人群
  differentiation: text("differentiation").notNull().default(""), // 差异化
  capabilities: jsonb("capabilities").notNull().default([]), // 能力清单 (string[])
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const positioningStatements = pgTable("positioning_statements", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // denormalized ownership column (foundation §1)
  profileId: text("profile_id").notNull(), // FK → creator_profiles
  oneLiner: text("one_liner").notNull().default(""), // 我是谁+帮谁+解决什么+怎么表达
  keywords: jsonb("keywords").notNull().default([]), // exactly 3 strings (service guard)
  productAnchorIds: jsonb("product_anchor_ids").notNull().default([]), // Product id[]
  versionNumber: integer("version_number").notNull(),
  createdByType: text("created_by_type").notNull().default("human"), // human|ai
  aiTaskId: text("ai_task_id"), // nullable — FK soft to ai_tasks (AI 演进回流)
  createdAt: text("created_at").notNull(),
  // NO updated_at — rows never update (immutable version chain).
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - uq_creator_profiles_user: one CreatorProfile per user (OQ1).
//   - uq_positioning_statements_version: one row per (profile, version) — append-only.
//   - idx_positioning_statements_current: backs the "current = max version" read.
//   - ALTER projects ADD positioning_statement_id: the project→定位版本 anchor (七步
//     §3.3 "可空"). Runs AFTER PROJECTS_DDL in the shared init ordering. Idempotent.
export const POSITIONING_DDL = `
CREATE TABLE IF NOT EXISTS creator_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  persona TEXT NOT NULL DEFAULT '',
  field TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  differentiation TEXT NOT NULL DEFAULT '',
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_creator_profiles_user ON creator_profiles (user_id);
CREATE TABLE IF NOT EXISTS positioning_statements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  one_liner TEXT NOT NULL DEFAULT '',
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  product_anchor_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  version_number INTEGER NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'human',
  ai_task_id TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_positioning_statements_version ON positioning_statements (profile_id, version_number);
CREATE INDEX IF NOT EXISTS idx_positioning_statements_current ON positioning_statements (user_id, profile_id, version_number DESC);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS positioning_statement_id TEXT;
`;
