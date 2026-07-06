import { pgTable, text, integer, jsonb } from "drizzle-orm/pg-core";

// Ingestion tables (data-model §17 "外置 Skill 写入" + contract/src/resources/
// ingestion.ts; SPEC §17). Canonical defs live in shared infra (@creatoros/backend)
// because createDb() applies INGESTION_DDL at init alongside ANALYTICS_DDL /
// PUBLISHING_DDL / … (foundation §1: the pglite/Drizzle db factory is the
// shared-infra home). The ingestion module (frontend/src/server/modules/ingestion)
// re-exports these so there is ONE source of truth, mirroring analytics
// (backend/src/schema/analytics.ts ↔ analytics.db-schema.ts).
//
// Ownership (data-model deviation, decided in the module plan §Architecture): the
// data-model gives INGESTION_RUN / INGESTION_ERROR no user_id (they FK only to
// external_source_id / ingestion_run_id). Foundation §1/§2 require user_id on every
// OWNED row, so this module ADDS user_id to all three tables and scopes directly
// (avoids a join-through-source on every query) — same spirit as Identity adding
// session/password_hash. Stamped from ctx.userId at write time.
//
// INVARIANTS (SPEC §17):
//   (1) ingestion_runs (external_source_id, idempotency_key) UNIQUE — a duplicate
//       createRun returns the ORIGINAL run, never a second row.
//   (2) ingestion_records (ingestion_run_id, record_key) UNIQUE — a re-pushed
//       record is skipped (counts toward the original result, not double-written).
// ingestion_records is an INTERNAL ledger (not in the contract DTO) that enforces
// invariant (2) and feeds the per-record written/rejected counters.
//
// Timestamps are ISO-8601 TEXT (match the contract `iso8601` strings, same
// convention as analytics). JSON columns (configuration / rejected_payload) are
// jsonb.

export const externalSources = pgTable("external_sources", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  // [T-136 多账号 · SPEC §D] 采集源按号隔离(区分同 user 的多号源)。nullable 稳定终态。
  accountId: text("account_id"),
  sourceType: text("source_type").notNull(),
  name: text("name").notNull(),
  sourceIdentifier: text("source_identifier").notNull().default(""),
  secretReference: text("secret_reference").notNull().default(""),
  configuration: jsonb("configuration").notNull().default({}),
  createdAt: text("created_at").notNull(),
});

export const ingestionRuns = pgTable("ingestion_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  // [T-136 多账号 · SPEC §D] 采集 run 按号隔离(采集结果归到「哪个号」)。nullable 稳定终态。
  // 子表 ingestion_errors/ingestion_records 无独立归属需要,经 run 透传,不加 account_id。
  accountId: text("account_id"),
  externalSourceId: text("external_source_id").notNull(),
  runType: text("run_type").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull().default("pending"),
  recordsReceived: integer("records_received").notNull().default(0),
  recordsWritten: integer("records_written").notNull().default(0),
  recordsRejected: integer("records_rejected").notNull().default(0),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
});

export const ingestionErrors = pgTable("ingestion_errors", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  ingestionRunId: text("ingestion_run_id").notNull(),
  recordKey: text("record_key").notNull(),
  errorCode: text("error_code").notNull(),
  errorMessage: text("error_message").notNull().default(""),
  rejectedPayload: jsonb("rejected_payload").notNull().default({}),
});

// 抖音采集限流/退避的持久状态(T-038 / SPEC §4.3)。每 channel(creator-center /
// iesdouyin)一行,由 DouyinRequestGateway 跨进程重启恢复 cooldown/consecutive,防重启
// 后 thundering herd 撞风控([gate-F3] readyPromise barrier 的持久面)。**非 user-scoped**
// —— 采集是账号级全局,单用户本地部署,不带 user_id(SPEC §4.3 [gate-F2])。时间戳用
// ISO-8601 TEXT,与 scheduled_job / job_run 全仓惯例一致(不引入 timestamptz 列型)。
export const douyinThrottleState = pgTable("douyin_throttle_state", {
  channel: text("channel").primaryKey(), // "creator-center" | "iesdouyin"
  cooldownUntil: text("cooldown_until"), // nullable — 退避到期 ISO;null = 无 cooldown
  consecutiveThrottles: integer("consecutive_throttles").notNull().default(0),
  lastRequestAt: text("last_request_at"), // nullable — 该 channel 上次放行时刻 ISO
  updatedAt: text("updated_at").notNull(),
});

// Internal per-record ledger (NOT a contract entity) — enforces SPEC §17.2 via the
// UNIQUE (ingestion_run_id, record_key) index and records whether each record was
// written or rejected so a re-push is a no-op.
export const ingestionRecords = pgTable("ingestion_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  ingestionRunId: text("ingestion_run_id").notNull(),
  recordKey: text("record_key").notNull(),
  result: text("result").notNull(), // "written" | "rejected"
  createdAt: text("created_at").notNull(),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - ux_ingestion_runs_source_idem: SPEC §17.1 idempotency anchor.
//   - ux_ingestion_records_run_key: SPEC §17.2 per-record idempotency anchor.
export const INGESTION_DDL = `
CREATE TABLE IF NOT EXISTS external_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  source_type TEXT NOT NULL,
  name TEXT NOT NULL,
  source_identifier TEXT NOT NULL DEFAULT '',
  secret_reference TEXT NOT NULL DEFAULT '',
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_external_sources_user ON external_sources (user_id);
-- [T-136 多账号] external_sources 按号隔离列(additive、幂等)。存量行 NULL,迁移 0025 backfill。
ALTER TABLE external_sources ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_external_sources_user_account ON external_sources (user_id, account_id);
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  external_source_id TEXT NOT NULL,
  run_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  records_received INTEGER NOT NULL DEFAULT 0,
  records_written INTEGER NOT NULL DEFAULT 0,
  records_rejected INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_runs_source_idem ON ingestion_runs (external_source_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_user ON ingestion_runs (user_id);
-- [T-136 多账号] ingestion_runs 按号隔离列(additive、幂等)。存量行 NULL,迁移 0025 backfill。
ALTER TABLE ingestion_runs ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_user_account ON ingestion_runs (user_id, account_id);
CREATE TABLE IF NOT EXISTS ingestion_errors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ingestion_run_id TEXT NOT NULL,
  record_key TEXT NOT NULL,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL DEFAULT '',
  rejected_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_ingestion_errors_run ON ingestion_errors (user_id, ingestion_run_id);
CREATE TABLE IF NOT EXISTS ingestion_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ingestion_run_id TEXT NOT NULL,
  record_key TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_records_run_key ON ingestion_records (ingestion_run_id, record_key);
CREATE INDEX IF NOT EXISTS idx_ingestion_records_run ON ingestion_records (user_id, ingestion_run_id);
`;

// Raw DDL for 抖音限流状态表(T-038 / SPEC §4.3),与 backend/drizzle/0012_douyin_throttle_state.sql
// 逐字对齐(迁移才是真正在 createConfiguredDb() 建表的那份;此 const 供 seed/doc 有处可读,
// 沿用 INGESTION_DDL 惯例)。全部 idempotent (CREATE … IF NOT EXISTS)。
export const DOUYIN_THROTTLE_STATE_DDL = `
CREATE TABLE IF NOT EXISTS douyin_throttle_state (
  channel TEXT PRIMARY KEY,
  cooldown_until TEXT,
  consecutive_throttles INTEGER NOT NULL DEFAULT 0,
  last_request_at TEXT,
  updated_at TEXT NOT NULL
);
`;
