import { pgTable, text, integer, jsonb } from "drizzle-orm/pg-core";

// Candidate / AudienceSignal / TopicPromotion tables (七步整合设计 §5 — 选题情报层;
// contract v0.4 resources/candidate.ts; SPEC §13 "选题候选 (candidate)" group). The
// canonical defs live in shared infra (@creatoros/backend) because createDb()
// applies CANDIDATE_DDL at init alongside PROJECTS_DDL / POSITIONING_DDL / … (the
// pglite/Drizzle db factory is the shared-infra home, foundation §1). The candidate
// module (frontend/src/server/modules/candidate) re-exports these so there is ONE
// source of truth, mirroring positioning/monetization (db-schema.ts ↔
// backend/src/schema/*).
//
// Ownership: a denormalized `user_id TEXT NOT NULL` lives on EVERY owned row (the
// ownership boundary; SPEC §10/§20 — stamped at write time from ctx.userId).
// Timestamps are ISO-8601 TEXT (to match the contract `iso8601` strings).
//
// `Candidate` owns NO new state machine (hard constraint C-3): AI-sourced rows
// (source ∈ {trend,benchmark,demand}) are FORMALIZED from an AITaskResult through
// CandidateService.createFromAIResult (the AI module's confirmResult callee) —
// there is NO `awaiting`/`confirmed` column here (that machine lives on the AITask).
// `status` is only pool|promoted|dropped (human curation + the promote op).
//
// `demand_count` is a maintained denormalization: the count of audience_signals
// whose linked_candidate_id = candidate.id. The repository bumps it on link/ingest
// and recomputes it from the index; a free patch NEVER sets it (derived-field
// discipline, mirrors Projects' progress cache).
//
// `AudienceSignal` writes go through Ingestion (hard constraint C-4): the signal
// carries `ingestion_run_id` (a real IngestionRun, RISK-005 dangling-ref guard) and
// rides Ingestion's idempotency — this module only reads/aggregates signals.

export const candidates = pgTable("candidates", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // denormalized ownership column (foundation §1)
  accountId: text("account_id"), // [T-136 多账号] 按号隔离(soft FK → platform_accounts.id);nullable 稳定终态
  title: text("title").notNull(),
  angle: text("angle").notNull().default(""), // 切入角度
  source: text("source").notNull(), // trend|benchmark|demand|idea|favorites([T-235c] 收藏夹跟拍)
  contentRole: text("content_role"), // traffic|trust|conversion (nullable)
  productAnchorId: text("product_anchor_id"), // soft FK → Product (monetization)
  positioningFit: integer("positioning_fit"), // 0–100, nullable (PositioningGate)
  predictedScore: integer("predicted_score"), // 变现潜力预测, nullable
  demandCount: integer("demand_count").notNull().default(0), // derived (linked signals)
  status: text("status").notNull().default("pool"), // pool|promoted|dropped
  aiTaskId: text("ai_task_id"), // provenance for AI-sourced (soft FK → ai_tasks)
  // 选题卡 (topic.enrich, 选题中心大改) — the AI-filled 详情/指标 payload (10 详情字段 +
  // 3 指标). Shape is the contract `candidateCard` zod object (all fields optional);
  // `{}` until a topic.enrich task formalizes it. Editable via candidates.patch.card.
  // jsonb so a card grows without a migration; an empty card means 待评估 (no oneLiner).
  card: jsonb("card").notNull().default({}),
  // [T-212d] 防茧房校准 —— 用户淘汰选题时写的一句原因(蒸馏偏好信号的原料,迁移 0033)。
  // NULLABLE:存量与非淘汰候选留空;仅淘汰(status→dropped)带原因时写。
  dropReason: text("drop_reason"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// [T-212d] 选题偏好信号(防茧房校准,SPEC 2026-07-11 §2.4)—— 淘汰原因蒸馏出的**结构化偏好**,
// 喂进选题评分(与 positioningFit 并列,不覆盖)。反过拟合护栏字段全落表(见迁移 0033 注释):
//   weight(±10 封顶)· example_count(≥3 才升级 active)· status(candidate|active|archived)·
//   last_reinforced_at(8 周衰减/归档的时间锚)。身份键 (user_id, keyword, direction) 归并同一偏好。
export const topicPreferences = pgTable("topic_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // denormalized ownership column
  accountId: text("account_id"), // [T-201 账号锚点] 按号 stamp;不入身份唯一键(见迁移注释)
  keyword: text("keyword").notNull(), // 匹配候选标题/角度的短词(护栏按 includes 命中)
  direction: text("direction").notNull().default("avoid"), // avoid(压分)|prefer(抬分)
  signal: text("signal").notNull().default(""), // 一句人话偏好
  exampleCount: integer("example_count").notNull().default(0), // 支持的淘汰原因条数(≥3 → 硬偏好)
  weight: integer("weight").notNull().default(0), // 评分调整量(写入前已 ±10 封顶)
  status: text("status").notNull().default("candidate"), // candidate|active|archived
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastReinforcedAt: text("last_reinforced_at").notNull(), // 8 周衰减/归档时间锚
});

export const audienceSignals = pgTable("audience_signals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // denormalized ownership column
  accountId: text("account_id"), // [T-136 多账号] 按号隔离;采集 stamp 归到「哪个号」的评论/信号
  source: text("source").notNull(), // comment|dm|consultation|review
  rawText: text("raw_text").notNull().default(""),
  demandTag: text("demand_tag"), // 需求标签 (nullable)
  payingIntent: text("paying_intent"), // 付费意向 (nullable)
  linkedCandidateId: text("linked_candidate_id"), // nullable — links to a Candidate
  ingestionRunId: text("ingestion_run_id"), // set when via Ingestion (C-4 provenance)
  // 评论按作品可读 (T-030 §4.2 / D6, 迁移 0011) — the imported publication this signal
  // belongs to. Backfilled at ingest time from the capture's aweme_id (→ publications
  // where externalId=aweme_id). NULLABLE: 表无 aweme_id 锚,存量已入库评论无法回填
  // (F3 诚实边界),只有本次改动后的新采集能带 publication_id;非评论信号 (dm/consultation)
  // 也留空。
  publicationId: text("publication_id"),
  // 评论点赞数 —— 热榜排序依据 (T-042, 迁移 0014). 采集时抓 digg_count 带进来;NULLABLE:
  // 存量评论(0014 之前入库)无点赞值,非评论信号 (dm/consultation/review) 也留空。
  likeCount: integer("like_count"),
  // 评论粒度幂等锚 (T-065, 迁移 0016) —— 形如 `douyin:comment:<cid>`。跨 run 唯一
  // (ux_audience_signals_user_source_external 部分唯一索引),重复采集 onConflict 跳过。
  // NULLABLE:存量行与非评论信号无锚,留空(NULL 不受唯一约束)。
  externalId: text("external_id"),
  createdAt: text("created_at").notNull(),
});

export const topicPromotions = pgTable("topic_promotions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // denormalized ownership column
  accountId: text("account_id"), // [T-136 多账号] 按号隔离;nullable 稳定终态
  candidateId: text("candidate_id").notNull(), // FK → candidates
  projectId: text("project_id").notNull(), // FK → projects (the promoted Project)
  promotedAt: text("promoted_at").notNull(),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - ix_audience_signals_candidate: powers the demand_count aggregation.
//   - ix_audience_signals_pub: backs 评论按作品可读 (publications.comments.list, 迁移 0011).
//   - ix_candidates_user_status: backs the user-scoped pool listing/sort.
//   - uq_topic_promotions_candidate: at most one promotion per Candidate (the
//     promote op guards a double-promote; the unique index is the backstop).
// All idempotent (CREATE … IF NOT EXISTS).
export const CANDIDATE_DDL = `
CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  title TEXT NOT NULL,
  angle TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  content_role TEXT,
  product_anchor_id TEXT,
  positioning_fit INTEGER,
  predicted_score INTEGER,
  demand_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pool',
  ai_task_id TEXT,
  card JSONB NOT NULL DEFAULT '{}'::jsonb,
  drop_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audience_signals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  source TEXT NOT NULL,
  raw_text TEXT NOT NULL DEFAULT '',
  demand_tag TEXT,
  paying_intent TEXT,
  linked_candidate_id TEXT,
  ingestion_run_id TEXT,
  publication_id TEXT,
  like_count INTEGER,
  external_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS topic_promotions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  candidate_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  promoted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audience_signals_candidate ON audience_signals (linked_candidate_id);
CREATE INDEX IF NOT EXISTS ix_audience_signals_pub ON audience_signals (user_id, publication_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_audience_signals_user_source_external ON audience_signals (user_id, source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_candidates_user_status ON candidates (user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_topic_promotions_candidate ON topic_promotions (candidate_id);
-- [T-136 多账号] 按号隔离列(additive、幂等)。存量行 NULL,迁移 0025 backfill 默认号。
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE audience_signals ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE topic_promotions ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_candidates_user_account ON candidates (user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_audience_signals_user_account ON audience_signals (user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_topic_promotions_user_account ON topic_promotions (user_id, account_id);
-- [T-212d] 防茧房校准:淘汰原因 + 偏好信号表(additive、幂等,迁移 0033)。
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS drop_reason TEXT;
CREATE TABLE IF NOT EXISTS topic_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  keyword TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'avoid',
  signal TEXT NOT NULL DEFAULT '',
  example_count INTEGER NOT NULL DEFAULT 0,
  weight INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'candidate',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_reinforced_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_topic_preferences_identity ON topic_preferences (user_id, keyword, direction);
CREATE INDEX IF NOT EXISTS ix_topic_preferences_user_status ON topic_preferences (user_id, status);
`;
