import { pgTable, text, integer, jsonb } from "drizzle-orm/pg-core";

// Reviews tables (data-model §"分析、复盘和经验" REVIEW / REVIEW_PUBLICATION /
// REVIEW_INSIGHT, lines 577-602; contract/src/resources/reviews.ts; SPEC §13
// "复盘"). Canonical defs live in shared infra (@creatoros/backend) because
// createDb() applies REVIEWS_DDL at init alongside PROJECTS_DDL / ANALYTICS_DDL /
// … (foundation §1: the pglite/Drizzle db factory is the shared-infra home). The
// reviews module (frontend/src/server/modules/reviews) re-exports these so there
// is ONE source of truth, mirroring analytics (backend/src/schema/analytics.ts ↔
// analytics.db-schema.ts).
//
// Ownership: a denormalized `user_id TEXT NOT NULL` lives on EVERY owned row (the
// ownership boundary; SPEC §10/§20 — stamped at write time from ctx.userId). It is
// NOT in the data-model ER diagram (which omits the tenant column); it is the
// required ownership column per foundation §1/§2 so every read filters
// eq(table.userId, ctx.userId) and no row leaks across tenants. Timestamps are
// ISO-8601 TEXT (to match the contract `iso8601` strings, same convention as
// projects/analytics). JSON columns are jsonb.
//
// State machine (SPEC §12 / roadmap §4): Review.status `in_progress → completed`
// (via reviews.complete) | `in_progress → abandoned` (terminal; no op this wave —
// schema-valid but unwired). The status guard lives in the service, not the schema.
//
// Monetization-weighted (seven-step spec §2.0/§4.4): the insight layer carries the
// conversion-oriented signal — `evidence` jsonb holds the reduced Analytics
// snapshot the AI review node (G15) and the FE render both read (conversion-funnel
// metrics, not traffic-only), and `insight_type` covers the conversion-learning
// taxonomy (success | issue | action | hypothesis).

export const reviews = pgTable("reviews", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(), // [T-136 多账号] 按号隔离(复盘归到号);nullable 稳定终态
  projectId: text("project_id").notNull(),
  contentOutputId: text("content_output_id"), // nullable — only set when reviewType="output"
  reportArtifactId: text("report_artifact_id"), // nullable — optional review_report ArtifactVersion link
  reviewType: text("review_type").notNull(),
  status: text("status").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"), // nullable until reviews.complete stamps it
});

export const reviewInsights = pgTable("review_insights", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(), // [T-136 多账号] 按号隔离;nullable 稳定终态
  reviewId: text("review_id").notNull(),
  insightType: text("insight_type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  evidence: jsonb("evidence").notNull().default({}),
  priority: integer("priority").notNull().default(0),
});

export const reviewPublications = pgTable("review_publications", {
  // The contract reviewPublicationResource has an `id`; the data-model ER omits it
  // — add `id` so the row is addressable.
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  reviewId: text("review_id").notNull(),
  publicationId: text("publication_id").notNull(),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - reviews_review_publication_uq: a publication is included in a review at most
//     once (data-model REVIEW_PUBLICATION join) — backs the idempotent attach.
//   - idx_reviews_project / idx_review_insights_review: the user-scoped read paths.
export const REVIEWS_DDL = `
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  content_output_id TEXT,
  report_artifact_id TEXT,
  review_type TEXT NOT NULL,
  status TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews (user_id, project_id);
CREATE TABLE IF NOT EXISTS review_insights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_review_insights_review ON review_insights (user_id, review_id, priority);
CREATE TABLE IF NOT EXISTS review_publications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  publication_id TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS reviews_review_publication_uq ON review_publications (review_id, publication_id);
-- [T-136 多账号] 按号隔离列(additive、幂等)。review_publications 是 join 表、其两端
-- (reviews / publications)均已按号隔离,不重复加 account_id。存量行 NULL,迁移 0025 backfill。
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE review_insights ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_reviews_user_account ON reviews (user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_review_insights_user_account ON review_insights (user_id, account_id);
`;
