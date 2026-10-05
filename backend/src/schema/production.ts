import {sql} from "drizzle-orm";
import { pgTable,index, text, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

// Production tables (data-model §9 lines 464-507 + contract/src/resources/
// production.ts; SPEC §13 "制作 / Production" group). Canonical defs live in shared
// infra (@creatoros/backend) because createDb() applies PRODUCTION_DDL at init
// alongside PROJECTS_DDL / ARTIFACTS_DDL / ASSETS_DDL / … (foundation §1: the
// pglite/Drizzle db factory is the shared-infra home). The production module
// (frontend/src/server/modules/production) re-exports these so there is ONE source
// of truth, mirroring artifacts (backend/src/schema/artifacts.ts ↔
// production.db-schema.ts).
//
// Ownership: `user_id` lives on EVERY owned row (it is NOT in the data-model ER
// diagram — it is the ownership column required by foundation §1/§3). Children
// (segments / segment_assets / export_records) are additionally scoped through
// the parent production's ownership gate (foundation §2). Timestamps are ISO-8601
// text (contract `iso8601`), enums are text, json is jsonb. §12 state machines
// (Production.status drafting→…→ready; ExportRecord.status queued→…→ready) are
// enforced in the SERVICE, not the schema.

export const productions = pgTable("productions", {
 groupId:text("group_id"),
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  contentOutputId: text("content_output_id").notNull(),
  productionMode: text("production_mode").notNull().default("remote_recording"),
  status: text("status").notNull().default("drafting"),
  recordingConfig: jsonb("recording_config").notNull().default({}),
  subtitleConfig: jsonb("subtitle_config").notNull().default({}),
  startedAt: text("started_at"), // nullable → contract iso8601|null
  completedAt: text("completed_at"), // nullable → contract iso8601|null
  updatedAt: text("updated_at").notNull(),
});

export const productionSegments = pgTable("production_segments", {
 groupId:text("group_id"),
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  productionId: text("production_id").notNull(),
  scriptSectionId: text("script_section_id"), // nullable — TimelineSegment source ref (SPEC §405)
  title: text("title").notNull(),
  position: integer("position").notNull().default(0),
  startMs: integer("start_ms").notNull().default(0),
  endMs: integer("end_ms").notNull().default(0),
  segmentConfig: jsonb("segment_config").notNull().default({}),
});

// Schema only this wave; the asset-attach button is decorative (plan Step 5). No
// op wired against this table — it exists so the source ref is durable.
export const segmentAssets = pgTable("segment_assets", {
 groupId:text("group_id"),
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  productionSegmentId: text("production_segment_id").notNull(),
  assetId: text("asset_id").notNull(),
  usageType: text("usage_type").notNull(),
  position: integer("position").notNull().default(0),
});

export const exportRecords = pgTable("export_records", {
 groupId:text("group_id"),
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  productionId: text("production_id").notNull(),
  resultAssetId: text("result_asset_id"), // nullable until complete → stamped on exports.complete
  format: text("format").notNull(),
  resolution: text("resolution").notNull(),
  aspectRatio: text("aspect_ratio").notNull(),
  bitrate: integer("bitrate").notNull().default(0),
  status: text("status").notNull().default("queued"),
  exportConfig: jsonb("export_config").notNull().default({}),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"), // nullable → contract iso8601|null
});

// 版本同时持有该次提交的幂等回执；历史永远不是第二份当前方案。
export const productionEditVersions = pgTable("production_edit_versions", {
 groupId:text("group_id"),
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  productionId: text("production_id").notNull(),
  revision: integer("revision").notNull(),
  requestId: text("request_id"),
  requestDigest: text("request_digest"),
  planDigest: text("plan_digest").notNull(),
  source: text("source").notNull(),
  plan: jsonb("plan").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [

  uniqueIndex("production_edit_versions_revision_ux").on(t.productionId,t.revision),
  uniqueIndex("production_edit_versions_request_ux").on(t.productionId,t.requestId),
]);

export const productionRenderRequests=pgTable("production_render_requests",{
 groupId:text("group_id"),
 groupVersion:integer("group_version"),
 membershipVersion:integer("membership_version"),
  id:text("id").primaryKey(),userId:text("user_id").notNull(),productionId:text("production_id").notNull(),
  requestId:text("request_id").notNull(),requestDigest:text("request_digest").notNull(),revision:integer("revision").notNull(),
  spec:jsonb("spec").notNull(),attemptId:text("attempt_id").notNull(),taskId:text("task_id"),assetId:text("asset_id"),createdAt:text("created_at").notNull(),
},t=>[
 uniqueIndex("production_render_requests_request_ux").on(t.productionId,t.requestId)]);

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - productions_output_ux: data-model CONTENT_OUTPUT ||--o| PRODUCTION is 0..1,
//     so (content_output_id) is UNIQUE — ensureProductionForOutput is idempotent.
//   - productions_user_ix: user-scoped lookups.
//   - production_segments_production_ix: per-production segment ordering.
//   - export_records_production_ix: per-production export lookups.
export const PRODUCTION_DDL = `
CREATE TABLE IF NOT EXISTS productions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content_output_id TEXT NOT NULL,
  production_mode TEXT NOT NULL DEFAULT 'remote_recording',
  status TEXT NOT NULL DEFAULT 'drafting',
  recording_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  subtitle_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS productions_output_ux ON productions(content_output_id);
CREATE INDEX IF NOT EXISTS productions_user_ix ON productions(user_id);
CREATE TABLE IF NOT EXISTS production_segments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  production_id TEXT NOT NULL,
  script_section_id TEXT,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  start_ms INTEGER NOT NULL DEFAULT 0,
  end_ms INTEGER NOT NULL DEFAULT 0,
  segment_config JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS production_segments_production_ix ON production_segments(production_id, position);
CREATE TABLE IF NOT EXISTS segment_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  production_segment_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  usage_type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS segment_assets_segment_ix ON segment_assets(production_segment_id, position);
CREATE TABLE IF NOT EXISTS export_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  production_id TEXT NOT NULL,
  result_asset_id TEXT,
  format TEXT NOT NULL,
  resolution TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  bitrate INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  export_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS export_records_production_ix ON export_records(production_id);
CREATE TABLE IF NOT EXISTS production_edit_versions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, production_id TEXT NOT NULL,
  revision INTEGER NOT NULL, request_id TEXT, request_digest TEXT,
  plan_digest TEXT NOT NULL, source TEXT NOT NULL, plan JSONB NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS production_edit_versions_revision_ux ON production_edit_versions(production_id, revision);
CREATE UNIQUE INDEX IF NOT EXISTS production_edit_versions_request_ux ON production_edit_versions(production_id, request_id);
CREATE TABLE IF NOT EXISTS production_render_requests (
  id TEXT PRIMARY KEY,user_id TEXT NOT NULL,production_id TEXT NOT NULL,request_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,revision INTEGER NOT NULL,spec JSONB NOT NULL,attempt_id TEXT NOT NULL,
  task_id TEXT,asset_id TEXT,created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS production_render_requests_request_ux ON production_render_requests(production_id,request_id);
`;

export const productionMediaRequests=pgTable("production_media_requests",{
 groupId:text("group_id"),
 groupVersion:integer("group_version"),
 membershipVersion:integer("membership_version"),
 id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id"),outputId:text("output_id").notNull(),
 requestId:text("request_id").notNull(),requestDigest:text("request_digest").notNull(),kind:text("kind").notNull(),
 frozenInput:jsonb("frozen_input").notNull(),taskId:text("task_id"),createdAt:text("created_at").notNull(),
},t=>[
 uniqueIndex("production_media_requests_group_68016e59").on(t.userId,t.groupId,t.outputId,t.requestId).where(sql`${t.groupId} IS NOT NULL AND ${t.accountId} IS NULL`),
 index("production_media_requests_group_scope_idx").on(t.userId,t.groupId),uniqueIndex("production_media_requests_scope_ux").on(t.userId,t.accountId,t.outputId,t.requestId)]);
