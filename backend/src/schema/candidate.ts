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
  title: text("title").notNull(),
  angle: text("angle").notNull().default(""), // 切入角度
  source: text("source").notNull(), // trend|benchmark|demand|idea
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
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const audienceSignals = pgTable("audience_signals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // denormalized ownership column
  source: text("source").notNull(), // comment|dm|consultation|review
  rawText: text("raw_text").notNull().default(""),
  demandTag: text("demand_tag"), // 需求标签 (nullable)
  payingIntent: text("paying_intent"), // 付费意向 (nullable)
  linkedCandidateId: text("linked_candidate_id"), // nullable — links to a Candidate
  ingestionRunId: text("ingestion_run_id"), // set when via Ingestion (C-4 provenance)
  createdAt: text("created_at").notNull(),
});

export const topicPromotions = pgTable("topic_promotions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // denormalized ownership column
  candidateId: text("candidate_id").notNull(), // FK → candidates
  projectId: text("project_id").notNull(), // FK → projects (the promoted Project)
  promotedAt: text("promoted_at").notNull(),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - ix_audience_signals_candidate: powers the demand_count aggregation.
//   - ix_candidates_user_status: backs the user-scoped pool listing/sort.
//   - uq_topic_promotions_candidate: at most one promotion per Candidate (the
//     promote op guards a double-promote; the unique index is the backstop).
// All idempotent (CREATE … IF NOT EXISTS).
export const CANDIDATE_DDL = `
CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audience_signals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  raw_text TEXT NOT NULL DEFAULT '',
  demand_tag TEXT,
  paying_intent TEXT,
  linked_candidate_id TEXT,
  ingestion_run_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS topic_promotions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  promoted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audience_signals_candidate ON audience_signals (linked_candidate_id);
CREATE INDEX IF NOT EXISTS ix_candidates_user_status ON candidates (user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_topic_promotions_candidate ON topic_promotions (candidate_id);
`;
