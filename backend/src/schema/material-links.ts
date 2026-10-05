import { pgTable, text } from "drizzle-orm/pg-core";

// MaterialLink table (用料链 / Bill-of-Materials, Plan A4) — the edge that records a
// project (and optionally a specific content output) USES a library item: a
// KnowledgeItem or an Asset. It is a thin, self-contained provenance/role join so the
// 料库 (knowledge + asset libraries) ⇄ 创作 (project/output) relationship is first-class
// and queryable, without a DB FK across module schemas (the modular monolith validates
// ownership in the SERVICE layer; foundation §1).
//
// Ownership: a denormalized `user_id TEXT NOT NULL` lives on the owned row (stamped at
// write time from ctx.userId; foundation §1/§3). EVERY query filters by it. `created_at`
// is ISO-8601 TEXT (to match the contract `iso8601`). All columns are TEXT — there is
// nothing numeric to track on this edge.
//
//   - entity_type: 'knowledge' | 'asset' — which library the linked item lives in.
//   - role:  reference | evidence | broll | clip | cover | snippet (default 'reference').
//   - stage: the creation stage the link was added in (default 'research').
//   - added_by_type: 'user' (default) | 'ai' — provenance of who created the link.

export const materialLinks = pgTable("material_links", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  groupId:text("group_id"),
  accountId:text("account_id"),
  projectId: text("project_id").notNull(),
  contentOutputId: text("content_output_id"), // nullable → contract string|null
  entityType: text("entity_type").notNull(), // 'knowledge' | 'asset'
  entityId: text("entity_id").notNull(),
  role: text("role").notNull().default("reference"),
  stage: text("stage").notNull().default("research"),
  addedByType: text("added_by_type").notNull().default("user"),
  // [T-146 切片 b] priority: 'high' | 'normal'. 项目内优先级(用户第一手素材 = high,
  // AI 找的二手 = normal)。派生在 service 层(addedByType→priority),枚举 service 校验(不加
  // DB CHECK,gate minor 驳回:本仓枚举一律 service 校验)。DEFAULT 'normal' 兜住直插/存量行。
  priority: text("priority").notNull().default("normal"),
  createdAt: text("created_at").notNull(),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet). All
// CREATE … IF NOT EXISTS (idempotent). The user+project index covers the list lookup
// (the primary read: every link a project uses); the entity index supports the inverse
// "where is this library item used" query (Plan A4 cross-link 点穿).
export const MATERIAL_LINKS_DDL = `
CREATE TABLE IF NOT EXISTS material_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  content_output_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'reference',
  stage TEXT NOT NULL DEFAULT 'research',
  added_by_type TEXT NOT NULL DEFAULT 'user',
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS material_links_user_project_ix ON material_links(user_id, project_id);
CREATE INDEX IF NOT EXISTS material_links_entity_ix ON material_links(user_id, entity_type, entity_id);
`;
