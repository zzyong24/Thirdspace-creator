import { pgTable, text, boolean } from "drizzle-orm/pg-core";

// [T-235b] 通用网页信源表(热点多源证据,SPEC 2026-07-11 daily-topic-autopilot §2.2)。
//
// 定位:用户登记任意站点/页面为「选题热点信源」(热榜页/垂类社区/搜索结果页/RSS feed)。
//   出题(trend basis / topic.daily)时逐 enabled 源抓取:web 型走 readUrl(带 .auth/web
//   登录态读正文)→ AI 结构化抽取信号;rss 型直接 fetch feed 解析。信号并进 trend brief。
//   与 benchmark_sources(对标博主)并列管理,范式同款(不硬塞对标表 —— 语义不同:对标是
//   「他号身份」,信源是「任意 URL」)。
//
// Ownership:user_id NOT NULL(写时从 ctx.userId stamp);account_id nullable(按号隔离,T-201)。
// 身份键:url(同 user 重复登记同一 URL → 幂等更新不新建)。
// source_type:web | rss(登记时按 URL 派生,可显式指定)。
// domain:URL 派生的 hostname(读取时查 .auth/web/<domain> 登录态用;rss 型也存,诊断用)。
//
// canonical 定义落 shared infra(@creatoros/backend)—— 迁移 0035 建表,db.ts schema 并入,
//   模块 trend-sources.db-schema.ts 再 re-export(ONE source of truth,同 benchmark)。

export const trendSources = pgTable("trend_sources", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  groupId: text("group_id"), // 所有权边界
  accountId: text("account_id"), // [T-201] 按号隔离;nullable 稳定终态
  name: text("name").notNull().default(""), // 展示名(缺省用 domain)
  url: text("url").notNull(), // 信源 URL(幂等锚)
  sourceType: text("source_type").notNull().default("web"), // web | rss
  domain: text("domain").notNull().default(""), // URL 派生 hostname(登录态目录键)
  note: text("note"), // 备注(可选,如「只看前 10 条」)
  enabled: boolean("enabled").notNull().default(true), // 抓取开关(停抓不删)
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Raw DDL(参考/文档用;实际建表经版本化迁移 0035,同 benchmark)。IF NOT EXISTS 幂等。
export const TREND_SOURCES_DDL = `
CREATE TABLE IF NOT EXISTS trend_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'web',
  domain TEXT NOT NULL DEFAULT '',
  note TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- [T-332 S1] 唯一键补 account 维(迁移 0042):两个号登记同一 URL 信源合法。account_id 已 NOT NULL。
CREATE UNIQUE INDEX IF NOT EXISTS ux_trend_sources_identity_v2 ON trend_sources (user_id, account_id, url);
CREATE INDEX IF NOT EXISTS ix_trend_sources_user_account ON trend_sources (user_id, account_id);
`;
