import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

// Timestamps are stored as ISO-8601 text to match the contract resource schemas
// (iso8601 strings) exactly — no driver tz/format round-tripping. Enums are text,
// validated by the contract's Zod schemas on output.

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  brief: text("brief").notNull().default(""),
  // 结构化 Brief(立项 Brief 地基 / PRD §5.2)—— jsonb 扩展位(沿用 facets/card 模式,
  // 不新建 project_brief 表)。装 {targetAudience, contentGoal, contentFormat,
  // targetPlatforms[], durationEstimate, coreMessage, successCriteria}。默认空对象。
  briefDetail: jsonb("brief_detail").notNull().default({}),
  contentCategory: text("content_category").notNull().default(""),
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
});

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
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  contentType: text("content_type").notNull(),
  format: text("format").notNull().default(""),
  aspectRatio: text("aspect_ratio").notNull().default(""),
  targetDurationSeconds: integer("target_duration_seconds").notNull().default(0),
  status: text("status").notNull(),
  contentRole: text("content_role"),
  primaryAssetId: text("primary_asset_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

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
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  brief_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_category TEXT NOT NULL DEFAULT '',
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
  format TEXT NOT NULL DEFAULT '',
  aspect_ratio TEXT NOT NULL DEFAULT '',
  target_duration_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  content_role TEXT,
  primary_asset_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
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
