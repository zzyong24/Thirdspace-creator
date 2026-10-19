-- =====================================================================================
-- [T-235b] 热点多源证据(SPEC 2026-07-11 daily-topic-autopilot §2.2)。
--
-- ① trend_sources:用户登记的「通用网页信源」(热榜页/垂类社区/RSS feed 任意 URL)。
--    定时/出题时逐源抓取(web 型走 readUrl 带登录态读正文 → AI 结构化抽取信号;rss 型直接
--    fetch feed 解析),信号并进 trend 出题 brief。与 benchmark_sources(对标博主)并列管理,
--    范式同款(user/account-scoped + enabled 开关 + 幂等唯一键)。
--    source_type:web | rss(登记时派生/显式);domain:URL 派生(查 .auth/web 登录态用)。
--
-- ② benchmark_works 加「发现方式」维度(低粉黑马雷达,darkhorse.py 方法论移植):
--    discovery:benchmark(对标源采集,默认,存量行不变)| darkhorse(关键词搜索黑马雷达)。
--    author_follower_count:作者粉丝数(黑马核心信号「赞粉比」的分母;对标源采集不抓,NULL)。
--    discovery_keyword:黑马命中的搜索关键词(溯源/诊断)。
--    黑马行的 viral_multiple 存**赞粉比**(digg/fans,黑马语义;对标行仍存 digg/median)。
--
-- additive only:新表 + 新列,IF NOT EXISTS 幂等,可重跑;存量行 discovery 默认 'benchmark'。
-- =====================================================================================

CREATE TABLE IF NOT EXISTS trend_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  name TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'web',
  domain TEXT NOT NULL DEFAULT '',
  note TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_trend_sources_identity ON trend_sources (user_id, url);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_trend_sources_user_account ON trend_sources (user_id, account_id);
--> statement-breakpoint
ALTER TABLE benchmark_works ADD COLUMN IF NOT EXISTS discovery TEXT NOT NULL DEFAULT 'benchmark';
--> statement-breakpoint
ALTER TABLE benchmark_works ADD COLUMN IF NOT EXISTS author_follower_count INTEGER;
--> statement-breakpoint
ALTER TABLE benchmark_works ADD COLUMN IF NOT EXISTS discovery_keyword TEXT;
