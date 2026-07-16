import { pgTable, text, integer, boolean, doublePrecision } from "drizzle-orm/pg-core";

// [T-212a] 对标源 + 对标作品表（选题/对标强化，SPEC 2026-07-11 §2.1）。
//
// 定位:对标源 = 用户登记的"他号"对标博主（douyin sec_uid），采集 job 逐源抓其公开作品列表 →
//   detectViral 筛爆款 → 落 benchmark_works 供 T-212c 拆解转化进选题池。material_links 是
//   **项目内**用料链(BoM，project_id NOT NULL / entityType=knowledge|asset)，语义完全不同，
//   故新表(不硬塞进 material_links 滥用 project 维度)。
//
// Ownership:每行 user_id TEXT NOT NULL(所有权边界，写时从 ctx.userId stamp)。
//   account_id TEXT nullable —— 按抖音号隔离(复用 T-201/T-136 账号锚点);对标源属"哪个号在对标"。
// 身份键:external_account_id = sec_uid(稳定身份，治锚点漂移，同 platform_accounts T-201b)。
// 时间戳:ISO-8601 TEXT(对齐 contract iso8601)。
//
// canonical 定义落 shared infra(@creatoros/backend)—— 迁移 0032 建表,db.ts schema 并入,
//   模块 benchmark.db-schema.ts 再 re-export(ONE source of truth，同 candidate/material-links)。

export const benchmarkSources = pgTable("benchmark_sources", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // 所有权边界
  accountId: text("account_id").notNull(), // [T-201] 按号隔离(哪个号在对标);nullable 稳定终态
  platform: text("platform").notNull().default("douyin"),
  externalAccountId: text("external_account_id").notNull(), // sec_uid(稳定身份键)
  nickname: text("nickname"), // 博主昵称/备注名(可选)
  homeUrl: text("home_url"), // 主页链接(可选)
  note: text("note"), // 备注(可选)
  enabled: boolean("enabled").notNull().default(true), // 采集开关(停采不删)
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const benchmarkWorks = pgTable("benchmark_works", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // 所有权边界
  accountId: text("account_id").notNull(), // [T-201] 按号隔离;nullable 稳定终态
  sourceId: text("source_id").notNull(), // soft FK → benchmark_sources.id
  sourceExternalAccountId: text("source_external_account_id").notNull(), // 冗余 sec_uid(便于按源查)
  platform: text("platform").notNull().default("douyin"),
  awemeId: text("aweme_id").notNull(), // 作品 id(幂等锚)
  description: text("description").notNull().default(""), // 标题/desc
  diggCount: integer("digg_count").notNull().default(0),
  commentCount: integer("comment_count"),
  collectCount: integer("collect_count"),
  shareCount: integer("share_count"),
  duration: integer("duration"), // 时长(ms)
  createTime: text("create_time"), // 作品发布时间(ISO/unix，采集抽取原值)
  isViral: boolean("is_viral").notNull().default(false), // detectViral 判定
  // [T-235b] 黑马行的 viralMultiple 存**赞粉比**(digg/fans);对标行仍存 digg/median(黑马语义,darkhorse.py)。
  viralMultiple: doublePrecision("viral_multiple"), // digg/median 或 赞粉比(诊断/排序)
  // [T-235b] 发现方式维度(低粉黑马雷达):benchmark=对标源采集(默认,存量不变)| darkhorse=关键词黑马。
  discovery: text("discovery").notNull().default("benchmark"),
  authorFollowerCount: integer("author_follower_count"), // 作者粉丝数(黑马赞粉比分母;对标采集不抓,NULL)
  discoveryKeyword: text("discovery_keyword"), // 黑马命中的搜索关键词(溯源;对标行 NULL)
  teardownStatus: text("teardown_status").notNull().default("pending"), // 拆解状态:pending 待拆(T-212c 转 done)
  // [T-349] 对标作品逐字稿(单条按需抓)。**origin 隔离铁律**:他人对标作品逐字稿落 benchmark_works
  //   **自身**(同 favorites_items.transcript 先例 T-235d-distill),**永不建 imported project/artifact**
  //   (否则污染 creative-context/candidate 的 imported/reconstructed origin 隔离,把他人作品当本人已确认前提)。
  transcript: text("transcript"), // 逐字稿(NULL=未抓;图集/无口播 → skipped 且此列 NULL)
  transcriptStatus: text("transcript_status"), // null(未抓)/pending(抓取中)/done/failed(可重试)/skipped(诚实,非失败)
  capturedAt: text("captured_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Raw DDL(参考/文档用;实际建表经版本化迁移 0032，与 candidate/scheduling 同款）。全部 IF NOT EXISTS 幂等。
//   - ux_benchmark_sources_identity:同 user+platform+sec_uid 唯一(重复登记同一博主命中 → 更新不新建)。
//   - ux_benchmark_works_aweme:同 user+platform+aweme_id 唯一(跨采集 run 幂等 upsert，防灌库)。
export const BENCHMARK_DDL = `
CREATE TABLE IF NOT EXISTS benchmark_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'douyin',
  external_account_id TEXT NOT NULL,
  nickname TEXT,
  home_url TEXT,
  note TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS benchmark_works (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_external_account_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'douyin',
  aweme_id TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  digg_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER,
  collect_count INTEGER,
  share_count INTEGER,
  duration INTEGER,
  create_time TEXT,
  is_viral BOOLEAN NOT NULL DEFAULT FALSE,
  viral_multiple DOUBLE PRECISION,
  discovery TEXT NOT NULL DEFAULT 'benchmark',
  author_follower_count INTEGER,
  discovery_keyword TEXT,
  teardown_status TEXT NOT NULL DEFAULT 'pending',
  -- [T-349] 对标作品逐字稿单条按需抓;origin 隔离:落本表自身,永不建 imported project/artifact。
  transcript TEXT,
  transcript_status TEXT,
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- [T-332 S1] 唯一键补 account 维(迁移 0042):两个号对标同博主/采同 aweme 合法。account_id 已 NOT NULL。
CREATE UNIQUE INDEX IF NOT EXISTS ux_benchmark_sources_identity_v2 ON benchmark_sources (user_id, account_id, platform, external_account_id);
CREATE INDEX IF NOT EXISTS ix_benchmark_sources_user_account ON benchmark_sources (user_id, account_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_benchmark_works_aweme_v2 ON benchmark_works (user_id, account_id, platform, aweme_id);
CREATE INDEX IF NOT EXISTS ix_benchmark_works_source ON benchmark_works (source_id);
CREATE INDEX IF NOT EXISTS ix_benchmark_works_user_viral ON benchmark_works (user_id, is_viral, teardown_status);
`;
