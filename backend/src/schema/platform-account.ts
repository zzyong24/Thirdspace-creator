import { pgTable, text, integer } from "drizzle-orm/pg-core";

// PlatformAccount table (七步整合设计 §7.1 — 多账号矩阵; contract v0.4
// resources/platform-accounts.ts; SPEC §13 "平台账号" group). The canonical def
// lives in shared infra (@creatoros/backend) because createDb() applies
// PLATFORM_ACCOUNT_DDL at init alongside PROJECTS_DDL / PUBLISHING_DDL / … (foundation
// §1: the pglite/Drizzle db factory is the shared-infra home). The platform-account
// module (frontend/src/server/modules/platform-account) re-exports this so there is
// ONE source of truth, mirroring monetization/candidate (db-schema.ts ↔
// backend/src/schema/*).
//
// Ownership: a denormalized `user_id TEXT NOT NULL` lives on the owned row (the
// ownership boundary; foundation §1/§3 — stamped at write time from ctx.userId).
// Timestamps are ISO-8601 TEXT (to match the contract `iso8601`). `follower_baseline`
// is the at-onboarding 涨粉 attribution zero-point (a static registration field, NOT
// live-tracked — live follower counts flow through MetricSnapshot, plan OQ4).
// `secret_reference` is an opaque *reference* (settings.ts precedent) — this module
// NEVER stores or fetches a raw token (§7.1 + Settings precedent).
//
// [T-201b] 身份键 = 稳定的 external_account_id(抖音 sec_uid),不再是可变 account_handle。
// 旧 UNIQUE(user_id, platform, account_handle) 迁走 → UNIQUE(user_id, platform,
// external_account_id)(migration 0031)。account_handle 降级为**可编辑显示名**(display_name
// 语义:可改、非唯一;物理列名保留 account_handle 以免波及 repo/DTO/契约/前端/测试,只换语义 —— 见
// 0031 迁移头注)。回填不到 sec_uid 的存量号 external_account_id=NULL(PG 多个 NULL 不冲突,可共存)。
// Scoped uniqueness 仍是 per-user:同一 sec_uid 可被不同 user 各自登记一行。

export const platformAccounts = pgTable("platform_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  // [T-201b] 显示名(display name):可编辑、非唯一,缺省用采集昵称;**绝不参与身份解析**。
  accountHandle: text("account_handle").notNull(),
  // [T-201b] 稳定身份锚(抖音 sec_uid)。nullable:首绑/回填不到时为 NULL(退化到「复用任一 active 号」)。
  externalAccountId: text("external_account_id"),
  secretReference: text("secret_reference"), // nullable → contract string|null
  followerBaseline: integer("follower_baseline").notNull().default(0),
  status: text("status").notNull().default("active"), // active|archived
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - [T-201b] platform_accounts_external_ux: UNIQUE (user_id, platform,
//     external_account_id) — 身份唯一键 = 稳定 sec_uid(旧 handle_ux 退役,见 migration 0031);
//     the create dedup + ConflictError anchor. NULL external_account_id 可共存(PG 多 NULL 不冲突)。
//   - platform_accounts_user_created_ix: user-scoped list lookups (created_at desc via
//     the repo order-by; the index covers the user filter).
//
// Consumer-column re-anchoring (§7.1): publications + project_target_platforms gain a
// NULLABLE `account_id` edge into platform_accounts.id. These tables are OWNED by
// Publishing/Projects; the ALTER … ADD COLUMN IF NOT EXISTS is additive/backward-
// compatible (the existing `account_reference` string stays accepted — plan OQ1
// additive recommendation; the cross-module binding is validated in the SERVICE layer,
// no DB FK across module schemas in the modular monolith). The ALTERs live HERE so the
// whole §7.1 re-anchoring is one DDL surface, and run after PROJECTS_DDL /
// PUBLISHING_DDL in createDb() so the target tables exist.
export const PLATFORM_ACCOUNT_DDL = `
CREATE TABLE IF NOT EXISTS platform_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_handle TEXT NOT NULL,
  external_account_id TEXT,
  secret_reference TEXT,
  follower_baseline INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- [T-201b] 身份键 = (user_id, platform, external_account_id)(稳定 sec_uid);account_handle 降级为
--   非唯一显示名,旧 handle 唯一索引退役(见 migration 0031)。此 const 是 baseline 文档,运行/测试
--   schema 由 drizzle 迁移(含 0031)权威构建,二者保持一致。
CREATE UNIQUE INDEX IF NOT EXISTS platform_accounts_external_ux ON platform_accounts(user_id, platform, external_account_id);
CREATE INDEX IF NOT EXISTS platform_accounts_user_created_ix ON platform_accounts(user_id, created_at);
ALTER TABLE publications ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS publications_account_ix ON publications(account_id);
ALTER TABLE project_target_platforms ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS project_target_platforms_account_ix ON project_target_platforms(account_id);
`;
