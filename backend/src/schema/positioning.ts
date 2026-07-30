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
  // [T-136 多账号 · SPEC §C] 定位母版 per-account:UNIQUE(user_id) → UNIQUE(user_id,
  // account_id)(迁移 0025 换约束)。account_id nullable 稳定终态(SPEC §6 MAJOR-3);
  // 一号一套定位母版。
  accountId: text("account_id").notNull(), // [T-332 S1] per-account 收口 NOT NULL(迁移 0042)
  persona: text("persona").notNull().default(""),
  field: text("field").notNull().default(""), // 领域/赛道
  audience: text("audience").notNull().default(""), // 目标人群
  differentiation: text("differentiation").notNull().default(""), // 差异化
  capabilities: jsonb("capabilities").notNull().default([]), // 能力清单 (string[])
  // 定位中心重建 (迁移 0003) — the richer self-knowledge facets (内容范围/不做什么/
  // 核心痛点/核心价值/表达风格/当前状态) as ONE jsonb object, and the 5 定位规则
  // (选题/写稿/项目/禁止/表达) as ONE jsonb object. Additive, default '{}' — every
  // existing row reads back an empty object; the mapper fills missing keys.
  facets: jsonb("facets").notNull().default({}),
  downstreamRules: jsonb("downstream_rules").notNull().default({}),
  // [T-623] 新建定位母版时不删除不可变陈述历史，而是记录“旧母版截至哪个版本”。
  // currentStatement 只从 version_number > floor 的行中选择；存量 0 完全兼容。
  statementVersionFloor: integer("statement_version_floor").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const positioningStatements = pgTable("positioning_statements", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // denormalized ownership column (foundation §1)
  accountId: text("account_id").notNull(), // [T-332 S1] per-account 收口 NOT NULL(承 profile 的号);UNIQUE(profile_id, version_number) 不变
  profileId: text("profile_id").notNull(), // FK → creator_profiles
  oneLiner: text("one_liner").notNull().default(""), // 我是谁+帮谁+解决什么+怎么表达
  keywords: jsonb("keywords").notNull().default([]), // exactly 3 strings (service guard)
  productAnchorIds: jsonb("product_anchor_ids").notNull().default([]), // Product id[]
  versionNumber: integer("version_number").notNull(),
  createdByType: text("created_by_type").notNull().default("human"), // human|ai
  aiTaskId: text("ai_task_id"), // nullable — FK soft to ai_tasks (AI 演进回流)
  // [T-231⑥] 修改原因(团队留痕)—— 这次为什么开新版本。additive,存量行 ''(迁移 0034)。
  changeReason: text("change_reason").notNull().default(""),
  createdAt: text("created_at").notNull(),
  // NO updated_at — rows never update (immutable version chain).
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - uq_creator_profiles_user: one CreatorProfile per user (OQ1).
//   - uq_positioning_statements_version: one row per (profile, version) — append-only.
//   - idx_positioning_statements_current: backs the "current = max version" read.
//   - [T-332 S1] project→定位版本 anchor(projects.positioning_statement_id)幽灵列已退役
//     (迁移 0042 DROP;Drizzle projects 从不建模、全仓无代码读写 —— grep 实证)。
export const POSITIONING_DDL = `
CREATE TABLE IF NOT EXISTS creator_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  persona TEXT NOT NULL DEFAULT '',
  field TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  differentiation TEXT NOT NULL DEFAULT '',
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  facets JSONB NOT NULL DEFAULT '{}'::jsonb,
  downstream_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  statement_version_floor INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS facets JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS downstream_rules JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS statement_version_floor INTEGER NOT NULL DEFAULT 0;
-- [T-136 多账号 · SPEC §C] 定位母版 per-account:加 account_id + 换唯一约束
-- UNIQUE(user_id) → UNIQUE(user_id, account_id)。迁移 0025 有序做「建号→backfill→换约束」;
-- 此 inline DDL 供 pglite/seed 新库初始化到终态(幂等:先删旧唯一索引再建复合)。
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS account_id TEXT;
DROP INDEX IF EXISTS uq_creator_profiles_user;
CREATE UNIQUE INDEX IF NOT EXISTS uq_creator_profiles_user_account ON creator_profiles (user_id, account_id);
CREATE TABLE IF NOT EXISTS positioning_statements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  one_liner TEXT NOT NULL DEFAULT '',
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  product_anchor_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  version_number INTEGER NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'human',
  ai_task_id TEXT,
  change_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_positioning_statements_version ON positioning_statements (profile_id, version_number);
CREATE INDEX IF NOT EXISTS idx_positioning_statements_current ON positioning_statements (user_id, profile_id, version_number DESC);
-- [T-332 S1] 幽灵列 projects.positioning_statement_id 已退役(迁移 0042 DROP;Drizzle 从不建模、全仓无读写)。
-- [T-136 多账号] positioning_statements 按号隔离列(additive、幂等)。存量行 NULL,迁移 0025 backfill。
ALTER TABLE positioning_statements ADD COLUMN IF NOT EXISTS account_id TEXT;
-- [T-231⑥] 修改原因(团队留痕,additive、幂等)。存量行 ''(真库走迁移 0034,此处供 pglite/seed 新库)。
ALTER TABLE positioning_statements ADD COLUMN IF NOT EXISTS change_reason TEXT NOT NULL DEFAULT '';
`;
