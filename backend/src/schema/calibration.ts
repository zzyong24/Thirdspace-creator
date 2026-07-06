import { pgTable, text, integer, jsonb } from "drizzle-orm/pg-core";

// Calibration tables (七步整合设计 §6 — 校准闭环: Rubric + RubricVersion + Prediction
// + CalibrationResult; contract v0.4 resources/calibration.ts; SPEC §13 "校准
// (calibration)" group). The canonical defs live in shared infra (@creatoros/backend)
// because createDb() applies CALIBRATION_DDL at init alongside PROJECTS_DDL /
// MONETIZATION_DDL / … (foundation §1: the pglite/Drizzle db factory is the
// shared-infra home). The calibration module (frontend/src/server/modules/calibration)
// re-exports these so there is ONE source of truth, mirroring monetization/positioning
// (db-schema.ts ↔ backend/src/schema/*).
//
// Ownership: a denormalized `user_id TEXT NOT NULL` lives on EVERY owned row (the
// ownership boundary; SPEC §10/§20 — stamped at write time from ctx.userId; the §6.2
// ER omits it). Timestamps are ISO-8601 TEXT (to match the contract `iso8601`
// strings). Structured payloads (dimensions / predictedMetrics / predictedConversion /
// actualMetrics / deviation) are jsonb. `predictedScore` is decimal-as-TEXT (mirror the
// data-model decimal storage; the mapper coerces to number for the DTO).
//
// Immutability invariants (§6.2 / data-model 约束 6, ArtifactVersion 范式):
//   - rubric_versions rows are NEVER updated — editing = a NEW row (bumpVersion).
//   - a prediction with status='locked' is NEVER updated (盲预测不可改; the lock SQL
//     guard `status='draft'` backs the invariant at the DB layer too).
//   - calibration_results: one row per prediction (UNIQUE prediction_id; idempotent
//     re-submit returns the existing row — never double-feeds the rubric/Learning).

// Rubric — points at its current immutable version (circular-FK first-insert: the
// rubric is inserted with NULL current_version_id, the v1 version is inserted, then
// current_version_id is patched — §7.5 工程债).
export const rubrics = pgTable("rubrics", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id"), // [T-136 多账号] 按号隔离(校准闭环 per 号);nullable 稳定终态
  name: text("name").notNull(),
  currentVersionId: text("current_version_id"), // nullable until first version inserted
  createdAt: text("created_at").notNull(),
});

// RubricVersion — immutable version chain (变现加权 维度: hook 强度 / 利他性 / 人群匹配 /
// CTA 清晰度 / 为产品铺路程度). UNIQUE (rubric_id, version_number). Rows are never updated.
export const rubricVersions = pgTable("rubric_versions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id"), // [T-136 多账号] 按号隔离;nullable 稳定终态
  rubricId: text("rubric_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  dimensions: jsonb("dimensions").notNull().default([]), // array of { key, label, weight }
  changeSummary: text("change_summary").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

// Prediction — 发布前盲预测, locked-at-creation immutable (§6.2). predictedScore is
// derived server-side (变现加权 weighted sum); status draft→locked is terminal.
export const predictions = pgTable("predictions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id"), // [T-136 多账号] 按号隔离;nullable 稳定终态
  subjectType: text("subject_type").notNull(), // content_output|publication
  subjectId: text("subject_id").notNull(),
  rubricVersionId: text("rubric_version_id").notNull(),
  predictedMetrics: jsonb("predicted_metrics").notNull().default({}),
  predictedConversion: jsonb("predicted_conversion").notNull().default({}), // 变现加权
  predictedScore: text("predicted_score").notNull().default("0"), // decimal-as-text
  confidence: text("confidence").notNull(), // high|med|low
  status: text("status").notNull().default("draft"), // draft|locked
  lockedAt: text("locked_at"), // nullable — set only at lock
  createdAt: text("created_at").notNull(),
});

// CalibrationResult — 预测 vs 实际偏差. actualMetrics recycled via Ingestion (§C-4 — a
// REAL IngestionRun, RISK-005). UNIQUE prediction_id (one result per prediction).
export const calibrationResults = pgTable("calibration_results", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id"), // [T-136 多账号] 按号隔离;nullable 稳定终态
  predictionId: text("prediction_id").notNull(),
  ingestionRunId: text("ingestion_run_id").notNull(), // §C-4: references a real IngestionRun
  actualMetrics: jsonb("actual_metrics").notNull().default({}),
  deviation: jsonb("deviation").notNull().default({}), // computed server-side
  createdAt: text("created_at").notNull(),
});

// CalibrationRuleSuggestion — 复盘飞轮回流 轨B (Learning→校准). A 复盘 Learning is promoted
// into an EXPLICIT, actionable rule suggestion against a Rubric: 「把这条复盘结论变成约束未来
// 评分的维度」. The suggestion is a REAL row the 校准中心 reads + the user 采纳 (→ a NEW
// RubricVersion folding in `proposed_dimension`, renormalized). `learning_id` is the source
// 复盘结论; `proposed_dimension` is the 维度建议 jsonb ({ key, label, weight, description });
// status pending→adopted|dismissed is terminal (an adopted/dismissed suggestion is never
// re-actioned). `adopted_version_id` records the RubricVersion the 采纳 minted (provenance).
// The table lives in the calibration module (它是校准的承载体；学习模块经注入端口写入,零跨
// 模块 repo import).
export const calibrationRuleSuggestions = pgTable(
  "calibration_rule_suggestions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountId: text("account_id"), // [T-136 多账号] 按号隔离;nullable 稳定终态
    learningId: text("learning_id").notNull(), // the source 复盘 Learning
    rubricId: text("rubric_id").notNull(), // the target Rubric this suggestion bumps
    status: text("status").notNull().default("pending"), // pending|adopted|dismissed
    proposedDimension: jsonb("proposed_dimension").notNull().default({}), // { key, label, weight, description }
    rationale: text("rationale").notNull().default(""), // 一句话说明为什么从这条复盘得出
    adoptedVersionId: text("adopted_version_id"), // the RubricVersion 采纳 minted (nullable until adopted)
    createdAt: text("created_at").notNull(),
    adoptedAt: text("adopted_at"), // nullable — set only at 采纳/dismiss terminal
  },
);

// Raw DDL applied at db init (pglite has no migration runner wired here yet). All
// CREATE … IF NOT EXISTS (idempotent — re-run on a re-built singleton is a no-op).
//   - rubric_versions_rubric_ver_uq: one row per (rubric, version) — append-only chain.
//   - calibration_results_prediction_uq: one result per prediction (idempotent recycle).
//   - calibration_results_run_idx: backs the RISK-005 reverse lookup by ingestion run.
export const CALIBRATION_DDL = `
CREATE TABLE IF NOT EXISTS rubrics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  name TEXT NOT NULL,
  current_version_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rubric_versions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  rubric_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  change_summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS rubric_versions_rubric_ver_uq ON rubric_versions (rubric_id, version_number);
CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  rubric_version_id TEXT NOT NULL,
  predicted_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  predicted_conversion JSONB NOT NULL DEFAULT '{}'::jsonb,
  predicted_score TEXT NOT NULL DEFAULT '0',
  confidence TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  locked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS calibration_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  prediction_id TEXT NOT NULL,
  ingestion_run_id TEXT NOT NULL,
  actual_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  deviation JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS calibration_results_prediction_uq ON calibration_results (prediction_id);
CREATE INDEX IF NOT EXISTS calibration_results_run_idx ON calibration_results (ingestion_run_id);
CREATE TABLE IF NOT EXISTS calibration_rule_suggestions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  learning_id TEXT NOT NULL,
  rubric_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  proposed_dimension JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale TEXT NOT NULL DEFAULT '',
  adopted_version_id TEXT,
  created_at TEXT NOT NULL,
  adopted_at TEXT
);
CREATE INDEX IF NOT EXISTS calibration_rule_suggestions_user_idx ON calibration_rule_suggestions (user_id, status);
CREATE INDEX IF NOT EXISTS calibration_rule_suggestions_learning_idx ON calibration_rule_suggestions (learning_id);
-- [T-136 多账号] 按号隔离列(additive、幂等)。存量行 NULL,迁移 0025 backfill 默认号。
ALTER TABLE rubrics ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE rubric_versions ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE calibration_results ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE calibration_rule_suggestions ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_rubrics_user_account ON rubrics (user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_rubric_versions_user_account ON rubric_versions (user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user_account ON predictions (user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_calibration_results_user_account ON calibration_results (user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_calibration_rule_suggestions_user_account ON calibration_rule_suggestions (user_id, account_id);
`;
