import {
  pgTable,
  uniqueIndex,
  text,
  integer,
  jsonb,
  doublePrecision,
} from "drizzle-orm/pg-core";

// Analytics tables (data-model §9 "数据与分析" group + contract/src/resources/
// analytics.ts; SPEC §13 "数据与分析"). Canonical defs live in shared infra
// (@creatoros/backend) because createDb() applies ANALYTICS_DDL at init alongside
// PUBLISHING_DDL / PROJECTS_DDL / … (foundation §1: the pglite/Drizzle db factory
// is the shared-infra home). The analytics module
// (frontend/src/server/modules/analytics) re-exports these so there is ONE source
// of truth, mirroring publishing (backend/src/schema/publishing.ts ↔
// publishing.db-schema.ts).
//
// These four entities are APPEND-ONLY metric FACTS — no lifecycle / state machine
// (SPEC §12: Analytics owns none; roadmap §4 "No machine for … append-only"). The
// sole invariant is IDEMPOTENCY: MetricSnapshot(publication_id, source,
// captured_at) is UNIQUE (data-model §9 #11; roadmap §4 note 4) so a duplicate
// idempotency key OR identical captured_at never creates a duplicate snapshot.
//
// Ownership: a denormalized `user_id TEXT NOT NULL` lives on EVERY table (the
// ownership boundary; SPEC §10/§20 — stamped at append time from ctx.userId), so
// reads never cross-module-join to publications. Timestamps are ISO-8601 TEXT (to
// match the contract `iso8601` strings, same convention as publishing). JSON
// columns are jsonb.
//
// Monetization-weighted (seven-step spec §2.0/§4.4): the metric layer carries the
// conversion-oriented signal from the start, not traffic-only — `metric_values`
// keys cover the conversion funnel (引导点击 / 转化 / 私域沉淀) and `audience_snapshots`
// carries the conversion-intent dimensions (intent / paying — see the contract
// dimensionType enum). The raw_metrics jsonb keeps the platform's full payload so
// no conversion field is dropped at ingestion.

export const metricSnapshots = pgTable("metric_snapshots", {
  nativePlatform: text("native_platform"),
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  groupId: text("group_id"),
  accountId: text("account_id").notNull(), // [T-136 多账号 · SPEC §D] 采集 stamp 归到号;nullable 稳定终态
  publicationId: text("publication_id").notNull(),
  ingestionRunId: text("ingestion_run_id"), // nullable — seed/fixture appends carry null
  capturedAt: text("captured_at").notNull(),
  source: text("source").notNull(),
  rawMetrics: jsonb("raw_metrics").notNull().default({}),
  createdAt: text("created_at").notNull(),
});

export const metricValues = pgTable("metric_values", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  groupId: text("group_id"),
  accountId: text("account_id").notNull(), // [T-136 多账号] 按号隔离;nullable 稳定终态
  metricSnapshotId: text("metric_snapshot_id").notNull(),
  metricKey: text("metric_key").notNull(),
  numericValue: doublePrecision("numeric_value").notNull(),
  unit: text("unit").notNull().default(""),
  dimensions: jsonb("dimensions").notNull().default({}),
});

export const retentionPoints = pgTable("retention_points", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  groupId: text("group_id"),
  accountId: text("account_id").notNull(), // [T-136 多账号] 按号隔离;nullable 稳定终态
  publicationId: text("publication_id").notNull(),
  capturedAt: text("captured_at").notNull(),
  positionMs: integer("position_ms").notNull(),
  retentionRate: doublePrecision("retention_rate").notNull(),
  viewerCount: integer("viewer_count").notNull(),
});

export const audienceSnapshots = pgTable("audience_snapshots", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  groupId: text("group_id"),
  accountId: text("account_id").notNull(), // [T-136 多账号] 按号隔离;nullable 稳定终态
  publicationId: text("publication_id").notNull(),
  capturedAt: text("captured_at").notNull(),
  dimensionType: text("dimension_type").notNull(),
  dimensionValue: text("dimension_value").notNull(),
  percentage: doublePrecision("percentage").notNull(),
  audienceCount: integer("audience_count").notNull(),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - uq_metric_snapshot_pub_source_captured: the IDEMPOTENCY anchor — UNIQUE on
//     (publication_id, source, captured_at) (data-model §9 #11). A re-submitted
//     snapshot with the same key (or identical captured_at) is a no-op insert.
//   - idx_metric_snapshots_pub: per-publication read path, captured-at ordered.
//   - idx_metric_snapshots_user: user-scoped sweep.
export const ANALYTICS_DDL = `
CREATE TABLE IF NOT EXISTS metric_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  ingestion_run_id TEXT,
  captured_at TEXT NOT NULL,
  source TEXT NOT NULL,
  raw_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_snapshot_pub_source_captured ON metric_snapshots (publication_id, source, captured_at);
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_pub ON metric_snapshots (user_id, publication_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_user ON metric_snapshots (user_id);
CREATE TABLE IF NOT EXISTS metric_values (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  metric_snapshot_id TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  numeric_value DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_metric_values_snapshot ON metric_values (user_id, metric_snapshot_id);
CREATE TABLE IF NOT EXISTS retention_points (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  position_ms INTEGER NOT NULL,
  retention_rate DOUBLE PRECISION NOT NULL,
  viewer_count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_retention_points_pub ON retention_points (user_id, publication_id, position_ms);
CREATE TABLE IF NOT EXISTS audience_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  dimension_type TEXT NOT NULL,
  dimension_value TEXT NOT NULL,
  percentage DOUBLE PRECISION NOT NULL,
  audience_count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audience_snapshots_pub ON audience_snapshots (user_id, publication_id);
-- [T-136 多账号] 按号隔离列(additive、幂等)。存量行 NULL,迁移 0025 backfill 默认号。
ALTER TABLE metric_snapshots ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE metric_values ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE retention_points ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE audience_snapshots ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_user_account ON metric_snapshots (user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_metric_values_user_account ON metric_values (user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_retention_points_user_account ON retention_points (user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_audience_snapshots_user_account ON audience_snapshots (user_id, account_id);
`;

/** 独立明细与持久待采状态；成功数据保留至下一次成功，不污染基本指标快照。 */
export const publicationTraffic = pgTable('publication_traffic',{
 publicationId:text('publication_id').primaryKey(),userId:text('user_id').notNull(),groupId:text('group_id'),accountId:text('account_id').notNull(),externalId:text('external_id').notNull(),
 lastTaskId:text('last_task_id'),requestedAt:text('requested_at').notNull(),attemptedAt:text('attempted_at'),capturedAt:text('captured_at'),status:text('status').notNull(),error:text('error'),data:jsonb('data'),
});

/** 各作品/能力成功水位；不以最后尝试时间冒充新鲜度。 */
export const publicationSyncState=pgTable('publication_sync_state',{
 userId:text('user_id').notNull(),groupId:text('group_id'),accountId:text('account_id').notNull(),publicationId:text('publication_id').notNull(),capability:text('capability').notNull(),externalId:text('external_id').notNull(),lastSucceededAt:text('last_succeeded_at'),attemptedAt:text('attempted_at').notNull(),retryAt:text('retry_at'),failures:integer('failures').notNull().default(0),error:text('error'),
},t=>({scope:uniqueIndex('publication_sync_state_scope').on(t.userId,t.accountId,t.publicationId,t.capability)}));
