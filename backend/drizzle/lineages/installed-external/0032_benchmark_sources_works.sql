-- =====================================================================================
-- [T-212a] 对标源 + 对标作品表（选题/对标强化，SPEC 2026-07-11 §2.1）。
--
-- benchmark_sources:用户登记的"他号"对标博主(douyin sec_uid + 主页 + enabled 开关 + 备注)。
-- benchmark_works:采集 job 逐源抓的公开作品(含 detectViral 爆款判定 + 拆解状态)，供 T-212c
--   拆解转化进选题池(candidate.source=benchmark)。
--
-- material_links 是**项目内**用料链(BoM，project_id NOT NULL / entityType=knowledge|asset)，
--   语义完全不同，故新表(不硬塞进 material_links 滥用 project 维度)。account_id 复用 T-201 账号锚点。
--
-- additive only:全新表 + 索引，IF NOT EXISTS 幂等，可重跑。
-- =====================================================================================

CREATE TABLE IF NOT EXISTS benchmark_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  platform TEXT NOT NULL DEFAULT 'douyin',
  external_account_id TEXT NOT NULL,
  nickname TEXT,
  home_url TEXT,
  note TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS benchmark_works (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
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
  teardown_status TEXT NOT NULL DEFAULT 'pending',
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_benchmark_sources_identity ON benchmark_sources (user_id, platform, external_account_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_benchmark_sources_user_account ON benchmark_sources (user_id, account_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_benchmark_works_aweme ON benchmark_works (user_id, platform, aweme_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_benchmark_works_source ON benchmark_works (source_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_benchmark_works_user_viral ON benchmark_works (user_id, is_viral, teardown_status);
