import {sql} from "drizzle-orm";
import {
  pgTable,index,
  text,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";

// Timestamps are stored as ISO-8601 text to match the contract resource schemas
// (iso8601 strings) exactly — no driver tz/format round-tripping. Enums are text,
// validated by the contract's Zod schemas on output.

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  // [T-136 多账号] 按号隔离维度(soft FK → platform_accounts.id)。nullable —— 存量行/
  // 全局视图 accountId=null 兜底(SPEC §6 MAJOR-3:nullable 是稳定终态,新行由 service
  // 层强制带号,非 DB 约束)。迁移 0025 建默认号后 backfill。
  groupId: text("group_id"),
  accountId: text("account_id"), // [T-332 S1] per-account 收口 NOT NULL(迁移 0042)
  title: text("title").notNull(),
  brief: text("brief").notNull().default(""),
  // 结构化 Brief(立项 Brief 地基 / PRD §5.2)—— jsonb 扩展位(沿用 facets/card 模式,
  // 不新建 project_brief 表)。装 {targetAudience, contentGoal, contentFormat,
  // targetPlatforms[], durationEstimate, coreMessage, successCriteria}。默认空对象。
  briefDetail: jsonb("brief_detail").notNull().default({}),
  contentCategory: text("content_category").notNull().default(""),
  // 数据底座(宪法 §7 / SPEC §1.2 + migration 0008)。source: manual(手动新建)/
  // topic(选题立项)/ imported(真实采集导入)。platform_ref: 导入项目的平台引用
  // { platform, externalId, shareUrl?, publishedAt? };非导入项目为 {}。存量行
  // source 默认 manual、platform_ref 默认 {},行为不变。
  source: text("source").notNull().default("manual"),
  platformRef: jsonb("platform_ref").notNull().default({}),
  creationMode: text("creation_mode").notNull(),
  status: text("status").notNull(),
  currentStage: text("current_stage").notNull(),
  progressPct: integer("progress_pct").notNull().default(0),
  starred: boolean("starred").notNull().default(false),
  startedAt: text("started_at").notNull(),
  targetCompletedAt: text("target_completed_at"),
  completedAt: text("completed_at"),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
},t=>[index("projects_group_scope_ix").on(t.userId,t.groupId)]);

// T1382：原始资料仅归属项目，不代表用户已确认来源或采纳候选。
export const projectSourceReferences = pgTable("project_source_references", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  sourceKey: text("source_key").notNull(),
  sourceKind: text("source_kind").notNull(),
  itemId: text("item_id"),
  snapshotId: text("snapshot_id"),
  accountId: text("account_id"),
  platform: text("platform"),
  externalId: text("external_id"),
  url: text("url"),
  bodyAvailable: boolean("body_available").notNull().default(false),
  sourceDigest: text("source_digest"),
  transcriptHash: text("transcript_hash"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  uniqueIndex("project_source_references_project_key_ux").on(table.projectId, table.sourceKey),
  index("project_source_references_item_ix").on(table.itemId),
  index("project_source_references_snapshot_ix").on(table.snapshotId),
  check("project_source_references_source_key_ck", sql`length(btrim(${table.sourceKey})) > 0`),
  check("project_source_references_source_shape_ck", sql`
    (${table.sourceKind} = 'intelligence_item'
      AND ${table.itemId} IS NOT NULL AND length(btrim(${table.itemId})) > 0
      AND ${table.snapshotId} IS NOT NULL AND length(btrim(${table.snapshotId})) > 0)
    OR
    (${table.sourceKind} = 'platform_work'
      AND ${table.accountId} IS NOT NULL AND length(btrim(${table.accountId})) > 0
      AND ${table.platform} IS NOT NULL AND length(btrim(${table.platform})) > 0
      AND ${table.externalId} IS NOT NULL AND length(btrim(${table.externalId})) > 0)
  `),
]);

// projectId 为持久回执的原身份：删除项目后仍保留，不因同键重试另建项目。
export const projectIntakes = pgTable("project_intakes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  scopeKind: text("scope_kind").notNull(),
  scopeId: text("scope_id").notNull(),
  source: text("source").notNull(),
  intakeKey: text("intake_key").notNull(),
  requestDigest: text("request_digest").notNull(),
  projectId: text("project_id").notNull(),
  preparationTaskId: text("preparation_task_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  uniqueIndex("project_intakes_scope_key_ux").on(table.userId, table.scopeKind, table.scopeId, table.source, table.intakeKey),
  index("project_intakes_project_ix").on(table.projectId),
  check("project_intakes_scope_kind_ck", sql`${table.scopeKind} IN ('group', 'legacy-account')`),
  check("project_intakes_identity_ck", sql`
    length(btrim(${table.userId})) > 0 AND length(btrim(${table.scopeId})) > 0
    AND length(btrim(${table.intakeKey})) > 0 AND length(btrim(${table.requestDigest})) > 0
    AND length(btrim(${table.projectId})) > 0
  `),
  check("project_intakes_source_ck", sql`${table.source} IN ('manual', 'topic', 'radar', 'imported', 'assistant', 'quick_create')`),
]);

export const projectActivities = pgTable("project_activities", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  eventData: jsonb("event_data").notNull(),
  occurredAt: text("occurred_at").notNull(),
});

// Wave-2 Projects module additions (data-model §3 + SPEC §9). Child rows reach
// ownership through their parent project FK; queries always filter via the
// parent's userId, never exposing a child to another tenant.

// ≤1 row per (project, stage) — the project's six fixed stages.
export const projectStages = pgTable("project_stages", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  stage: text("stage").notNull(),
  status: text("status").notNull(),
  progressPct: integer("progress_pct").notNull().default(0),
  skipped: boolean("skipped").notNull().default(false),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  updatedAt: text("updated_at").notNull(),
});

// Target-platform intent (≤1 row per (project, platform)) — planning only.
export const projectTargetPlatforms = pgTable("project_target_platforms", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  platform: text("platform").notNull(),
  priority: integer("priority").notNull().default(0),
  planningNote: text("planning_note").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

// A content output owned (transitively) by the project. `contentRole` is the
// monetization-weighted intent layer (七步整合设计 §4.4): traffic | trust |
// conversion (nullable for outputs created before the field).
export const contentOutputs = pgTable("content_outputs", {
 groupId:text("group_id"),
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  contentType: text("content_type").notNull(),
  targetPlatform: text("target_platform"),
  format: text("format").notNull().default(""),
  aspectRatio: text("aspect_ratio").notNull().default(""),
  targetDurationSeconds: integer("target_duration_seconds").notNull().default(0),
  status: text("status").notNull(),
  contentRole: text("content_role"),
  primaryAssetId: text("primary_asset_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const outputCreateRequests = pgTable("output_create_requests", {
 groupId:text("group_id"),
  userId: text("user_id").notNull(),
  accountId: text("account_id"),
  clientRequestId: text("client_request_id").notNull(),
  requestDigest: text("request_digest").notNull(),
  projectId: text("project_id").notNull(),
  outputId: text("output_id").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [
 uniqueIndex("output_create_requests_group_46c5ab4b").on(table.userId,table.groupId,table.clientRequestId).where(sql`${table.groupId} IS NOT NULL AND ${table.accountId} IS NULL`),
 index("output_create_requests_group_scope_idx").on(table.userId,table.groupId),uniqueIndex("output_create_requests_owner_key_ux").on(table.userId, table.accountId, table.clientRequestId)]);

// Output's four independent stages (script/production/publishing/review);
// ≤1 row per (content_output, stage).
export const outputStages = pgTable("output_stages", {
  id: text("id").primaryKey(),
  contentOutputId: text("content_output_id").notNull(),
  stage: text("stage").notNull(),
  status: text("status").notNull(),
  progressPct: integer("progress_pct").notNull().default(0),
  skipped: boolean("skipped").notNull().default(false),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  updatedAt: text("updated_at").notNull(),
});

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  contentOutputId: text("content_output_id"),
  stage: text("stage").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull(),
  priority: integer("priority").notNull().default(3),
  dueAt: text("due_at"),
  completedAt: text("completed_at"),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
export const PROJECTS_DDL = `
CREATE TABLE IF NOT EXISTS output_create_requests (
  user_id TEXT NOT NULL, account_id TEXT NOT NULL, client_request_id TEXT NOT NULL,
  request_digest TEXT NOT NULL, project_id TEXT NOT NULL, output_id TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS output_create_requests_owner_key_ux ON output_create_requests(user_id, account_id, client_request_id);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  title TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  brief_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_category TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  platform_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  creation_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  current_stage TEXT NOT NULL,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  starred BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TEXT NOT NULL,
  target_completed_at TEXT,
  completed_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- [T-136 多账号] 按号隔离列(additive、幂等)。存量行 NULL,迁移 0025 backfill 默认号。
ALTER TABLE projects ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_user_account ON projects (user_id, account_id);
CREATE TABLE IF NOT EXISTS project_activities (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_data JSONB NOT NULL,
  occurred_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_stages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  skipped BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, stage)
);
CREATE TABLE IF NOT EXISTS project_target_platforms (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  planning_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (project_id, platform)
);
CREATE TABLE IF NOT EXISTS content_outputs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL,
  target_platform TEXT,
  format TEXT NOT NULL DEFAULT '',
  aspect_ratio TEXT NOT NULL DEFAULT '',
  target_duration_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  content_role TEXT,
  primary_asset_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
ALTER TABLE content_outputs ADD COLUMN IF NOT EXISTS target_platform TEXT;
CREATE TABLE IF NOT EXISTS output_stages (
  id TEXT PRIMARY KEY,
  content_output_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  skipped BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (content_output_id, stage)
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  content_output_id TEXT,
  stage TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 3,
  due_at TEXT,
  completed_at TEXT
);
`;
