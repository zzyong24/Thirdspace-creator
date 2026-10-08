import {
  pgTable,
  text,
  integer,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Learnings tables (data-model §"分析、复盘和经验" LEARNING / LEARNING_APPLICATION,
// lines 386-409; contract/src/resources/learnings.ts; SPEC §13 "复盘与学习"). The
// canonical defs live in shared infra (@creatoros/backend) because createDb()
// applies LEARNINGS_DDL at init alongside PROJECTS_DDL / REVIEWS_DDL / … (foundation
// §1: the pglite/Drizzle db factory is the shared-infra home). The learnings module
// (frontend/src/server/modules/learnings) re-exports these so there is ONE source of
// truth, mirroring reviews (backend/src/schema/reviews.ts ↔ reviews.db-schema.ts).
//
// Ownership: a denormalized `user_id TEXT NOT NULL` lives on EVERY owned row (the
// ownership boundary; SPEC §10/§20 — stamped at write time from ctx.userId). On
// `learnings` it matches the data-model `userId`; on `learning_applications` it is
// NOT in the data-model ER diagram (which scopes the application transitively through
// its parent Learning) — it is the required denormalized ownership column per
// foundation §1/§2 so every application read filters eq(table.userId, ctx.userId)
// without a parent join. Timestamps are ISO-8601 TEXT (to match the contract
// `iso8601` strings, same convention as projects/reviews). JSON (`outcome`) is jsonb.
//
// State machine (SPEC §12 / contract validationStatus enum):
//   candidate → validated | discarded ; validated → discarded. `discarded` is
//   terminal. The status guard lives in the service, not the schema.
//
// Monetization-weighted (seven-step spec §2.0/§4.6): `learning_type` carries the
// conversion-oriented taxonomy — beyond the traffic-only strategy/hook/structure/
// failure/process, it accepts `conversion_pattern` / `offer_insight` (the contract
// learningType enum is the source of truth; additive — existing values still parse),
// so a validated conversion learning is a first-class, reusable monetization signal.

export const learnings = pgTable(
  "learnings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    groupId: text("group_id"),
  accountId: text("account_id"), // [T-136 多账号] 按号隔离(经验/复盘归到号);nullable 稳定终态
    reviewId: text("review_id"), // nullable — a Learning can exist without a Review (SPEC §22 reuse)
    // [T-118a gate-F3] 复盘产经验的来源作品(project-scoped 读的锚)。nullable —— 手录/非复盘
    // 来源的经验没有归属作品。review.analyze 的 learning_list 采纳时带上 task.projectId(见
    // ai.service learning_list confirm 分支),让复盘页能读「本作品的 candidate learnings」。
    // additive:旧行 project_id 为 NULL,行为不变(全站库读不过滤时照旧全出)。
    projectId: text("project_id"),
    learningType: text("learning_type").notNull().default("strategy"),
    title: text("title").notNull(),
    insight: text("insight").notNull().default(""),
    recommendation: text("recommendation").notNull().default(""),
    validationStatus: text("validation_status").notNull().default("candidate"),
    confidenceScore: integer("confidence_score").notNull().default(0),
    // [T-284c G3-A] 真实证据强度派生列:'grounded' = 该经验扎在真实发布数据上(review.insights
    // 来自已发布+有 metric_snapshots 的作品复盘;attribution 来自逐字稿依据 + ≥N 条真实指标),
    // capture 时算好并据此自动 validated;NULL = 无真实数据背书(纯 AI 推断)→ 留 candidate 人工裁决。
    // 守宪法②:只放行「客观真实数据背书」的经验自动流,凭空推断仍卡第二道人工门。
    evidenceStrength: text("evidence_strength"),
    // [T-610] 人工采纳的稳定内容键。仅活动经验占键；同内容历史重复行会被标 discarded
    // 并清空键，既保留审计与引用，又保证知识库只出现一个活动事实。
    contentFingerprint: text("content_fingerprint"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_learnings_group_content_fingerprint")
      .on(table.userId, table.groupId, table.contentFingerprint)
      .where(sql`${table.groupId} IS NOT NULL AND ${table.validationStatus} <> 'discarded' AND ${table.contentFingerprint} IS NOT NULL`),
    uniqueIndex("ux_learnings_active_content_fingerprint")
      .on(table.userId, table.accountId, table.contentFingerprint)
      .where(
        sql`${table.accountId} IS NOT NULL AND ${table.validationStatus} <> 'discarded' AND ${table.contentFingerprint} IS NOT NULL`,
      ),
  ],
);

export const learningApplications = pgTable("learning_applications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // denormalized ownership column (foundation §1)
  groupId: text("group_id"),
  accountId: text("account_id"), // [T-136 多账号] 按号隔离;nullable 稳定终态
  learningId: text("learning_id").notNull(),
  projectId: text("project_id").notNull(),
  contentOutputId: text("content_output_id"), // nullable
  applicationNote: text("application_note").notNull().default(""),
  outcome: jsonb("outcome").notNull().default({}),
  appliedAt: text("applied_at").notNull(),
  evaluatedAt: text("evaluated_at"), // nullable until an outcome evaluation lands
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - idx_learnings_status: backs the list-by-status / getSuggestions read.
//   - idx_learning_apps_learning: backs the per-learning reuse count.
export const LEARNINGS_DDL = `
CREATE TABLE IF NOT EXISTS learnings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  review_id TEXT,
  project_id TEXT,
  learning_type TEXT NOT NULL DEFAULT 'strategy',
  title TEXT NOT NULL,
  insight TEXT NOT NULL DEFAULT '',
  recommendation TEXT NOT NULL DEFAULT '',
  validation_status TEXT NOT NULL DEFAULT 'candidate',
  confidence_score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_learnings_status ON learnings (user_id, validation_status);
-- [T-118a gate-F3] additive:给既有 learnings 表补 project_id 列(project-scoped 复盘读的锚)。
-- ADD COLUMN IF NOT EXISTS 幂等且不动存量行(旧行 NULL);同款范式见 positioning.ts / publishing.ts。
ALTER TABLE learnings ADD COLUMN IF NOT EXISTS project_id TEXT;
CREATE INDEX IF NOT EXISTS idx_learnings_project ON learnings (user_id, project_id, validation_status);
-- [T-284c G3-A] additive:真实证据强度派生列('grounded' | NULL)。ADD COLUMN IF NOT EXISTS 幂等,
-- 不动存量行(旧行 NULL,行为不变:候选仍走人工裁决门)。同款范式见上方 project_id / positioning.ts。
ALTER TABLE learnings ADD COLUMN IF NOT EXISTS evidence_strength TEXT;
ALTER TABLE learnings ADD COLUMN IF NOT EXISTS content_fingerprint TEXT;
CREATE TABLE IF NOT EXISTS learning_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  learning_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  content_output_id TEXT,
  application_note TEXT NOT NULL DEFAULT '',
  outcome JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TEXT NOT NULL,
  evaluated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_learning_apps_learning ON learning_applications (user_id, learning_id);
-- [T-136 多账号] 按号隔离列(additive、幂等)。存量行 NULL,迁移 0025 backfill 默认号。
ALTER TABLE learnings ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE learning_applications ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_learnings_user_account ON learnings (user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_learning_apps_user_account ON learning_applications (user_id, account_id);
`;
