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

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
export const PROJECTS_DDL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
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
`;
