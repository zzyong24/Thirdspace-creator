import { pgTable, text, integer, jsonb, boolean } from "drizzle-orm/pg-core";

// 调度 Agent 作业 tables (T-007 / data-source-pipeline-design §4). The canonical defs
// live in shared infra (@creatoros/backend) because the pglite/Drizzle db factory is
// the shared-infra home (foundation §1) — createConfiguredDb() applies the versioned
// migrations (backend/drizzle/0009_scheduled_job_and_run.sql) which build these tables,
// and the `schema` union in db.ts must include this module so drizzle types + queries
// know the tables. The scheduling module (backend/src/modules/scheduling) re-exports
// these so there is ONE source of truth, mirroring candidate/ai (db-schema.ts ↔
// backend/src/schema/*).
//
// Ownership (foundation §2 / SPEC §10/§20): BOTH tables are owned-ROOT — each carries a
// denormalized `user_id TEXT NOT NULL` stamped at write time from ctx.userId. `job_run`
// additionally references `scheduled_job` via `job_id`; it is reached through the
// requireJob ownership gate (the service asserts the parent job belongs to ctx.userId
// before any run read/write), so a run row is never reachable cross-user.
//
// Conventions mirror the candidate/ai exemplars: text PKs, ISO-8601 TEXT timestamps,
// enums/status as TEXT validated by the contract Zod on output, jsonb for json columns,
// boolean for the enabled flag. Mutable fields (enabled/recipe/last_run_at/next_run_at)
// bump updated_at on change (ai_conversations pattern).
//
// `scheduled_job` = 通用作业定义(prompt + schedule + 目标源 ∈ self.metrics|comments +
// 工具授权 + recipe)。`job_run` = 瘦"调度触发记录"(一次到点触发一行):步骤日志不落这,
// 复用 ai_task_steps(经 ai_task_id → ai_tasks → ai_task_steps),job_run 只剩 调度触发 +
// 新鲜度统计(items_new/items_updated)。调度器/采集分支/回填是 D3 的活,D1 只建模 + CRUD。

export const scheduledJobs = pgTable("scheduled_job", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // ownership boundary (owned-root)
  // [T-200] 第二属主维度(按抖音号):建 job 时从 ctx.accountId stamp。cron 到点触发时,采集
  //   runtime ctx.accountId 由此列派生(triggerScheduledJob),使采集落库 stamp 正确 account_id,
  //   而非系统调度 ctx 的 null 号(串号根因)。
  // [T-332 S1] per-account 收口 NOT NULL(迁移 0042);绑号 bootstrap 建的采集 job 全部账号绑定。
  accountId: text("account_id"),
  groupId: text("group_id"),
  groupVersion: integer("group_version"),
  membershipVersion: integer("membership_version"),
  name: text("name").notNull(),
  prompt: text("prompt").notNull().default(""), // Agent 发现路径用;内建采集器源可空
  sourceKind: text("source_kind").notNull(), // self.metrics | comments (contract Zod 校验)
  target: jsonb("target").notNull().default({}), // 源标识(自己源 / 评论源,结构不同)
  schedule: text("schedule").notNull(), // cron 表达式(node-cron,D3)
  toolGrants: jsonb("tool_grants").notNull().default([]), // 工具白名单(偏只读 + 落库)
  recipe: jsonb("recipe"), // nullable — Agent 发现产出的确定性重放配方
  enabled: boolean("enabled").notNull().default(true), // 启用开关
  lastRunAt: text("last_run_at"), // nullable — 上次到点触发时刻
  nextRunAt: text("next_run_at"), // nullable — 下次到点时刻(node-cron 算)
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const jobRuns = pgTable("job_run", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // ownership boundary (owned-root)
  groupId:text("group_id"),
  groupVersion: integer("group_version"),
  membershipVersion: integer("membership_version"),
  jobId: text("job_id").notNull(), // → scheduled_job (reached via requireJob gate)
  // [T-332 S1 · GAP-08] 计划触发时刻锚(迁移 0042)。nullable —— 存量 run / 临时「立即运行」不带;
  // cron 到点触发时由 S2/D3 写入(计划 tick 的 ISO 时刻),与 (job_id, scheduled_for) 部分唯一
  // 配合根治「先查再建」无约束下的重复触发。约束仅在 scheduled_for IS NOT NULL 时生效(部分唯一)。
  scheduledFor: text("scheduled_for"),
  aiTaskId: text("ai_task_id"), // nullable — 本次触发产的 ai_task id(D3 回填)
  status: text("status").notNull().default("running"), // running|succeeded|failed|needs_reconnect
  itemsNew: integer("items_new").notNull().default(0), // 本次新增条数
  itemsUpdated: integer("items_updated").notNull().default(0), // 本次更新条数
  error: text("error"), // nullable — 失败原因 / "需重连 Chrome"
  // [T-152] 采集实时进度(additive、nullable)。running 态由 runner/collector best-effort +
  // 节流写入,前端 2s 轮询显示阶段 + 累计条数。形状:{ stage, processed, total, message?,
  // updatedAt }(见 0026_job_run_progress.sql)。旧 run / 旧客户端读到 NULL 不崩(向后兼容)。
  progress: jsonb("progress"), // nullable — { stage, processed, total, message?, updatedAt }
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"), // nullable until terminal
});

// Raw DDL — the single source of truth for the table shape, kept in lockstep with the
// drizzle defs above and with backend/drizzle/0009_scheduled_job_and_run.sql (the
// migration is what actually builds the tables at createConfiguredDb() time; this const
// mirrors the ai/candidate DDL convention so a future seed/doc path has one place to
// read the shape). All idempotent (CREATE … IF NOT EXISTS).
//   - ix_scheduled_job_user_enabled: backs the user-scoped enabled-job listing (调度器
//     到点扫 enabled job / 任务中心列表按 user).
//   - ix_job_run_job: backs listRunsByJob (per-job run history).
export const SCHEDULING_DDL = `
CREATE TABLE IF NOT EXISTS scheduled_job (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  source_kind TEXT NOT NULL,
  target JSONB NOT NULL DEFAULT '{}'::jsonb,
  schedule TEXT NOT NULL,
  tool_grants JSONB NOT NULL DEFAULT '[]'::jsonb,
  recipe JSONB,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS job_run (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  ai_task_id TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  items_new INTEGER NOT NULL DEFAULT 0,
  items_updated INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  scheduled_for TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
-- [T-152] 采集实时进度列(additive、幂等、nullable)。与 0026_job_run_progress.sql 对齐
-- (迁移才是运行时真正建列的那份;此 const 供 seed/doc 有处可读)。
ALTER TABLE job_run ADD COLUMN IF NOT EXISTS progress JSONB;
-- [T-332 S1 · GAP-08] 计划触发时刻锚 + (job_id, scheduled_for) 部分唯一(迁移 0042)。
ALTER TABLE job_run ADD COLUMN IF NOT EXISTS scheduled_for TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_job_run_job_scheduled_for ON job_run (job_id, scheduled_for) WHERE scheduled_for IS NOT NULL;
-- [T-200] scheduled_job 按号维度列(additive、幂等、nullable)。与 0030_scheduled_job_account.sql
-- 对齐(迁移才是运行时真正建列的那份)。cron 到点触发的采集 ctx.accountId 由此列派生。
ALTER TABLE scheduled_job ADD COLUMN IF NOT EXISTS account_id TEXT;
CREATE INDEX IF NOT EXISTS ix_scheduled_job_user_enabled ON scheduled_job (user_id, enabled);
CREATE INDEX IF NOT EXISTS ix_job_run_job ON job_run (job_id, started_at);
-- [T-367] 采集类 job 的 (user_id, account_id, source_kind) 部分唯一 —— 同 user+号+采集
-- kind 至多一条,DB 层兜底并发 TOCTOU(应用层 createJob 幂等复用 + 前端模板卡查重是
-- 主路径,这里是最后一道闸)。部分索引仅约束 6 类采集 kind,不限制未来非采集类 job
-- 多实例。与 0046_scheduled_job_unique_source.sql 对齐(迁移才是运行时真正建索引的那份;
-- 迁移同时清了存量重复:enabled 优先 → created_at 最早保留)。
CREATE UNIQUE INDEX IF NOT EXISTS ux_scheduled_job_user_account_source ON scheduled_job (user_id, account_id, source_kind) WHERE source_kind IN ('self.metrics','self.detail','comments','benchmark','topic.daily','favorites','intelligence.sync');
`;
