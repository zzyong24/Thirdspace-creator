-- =====================================================================================
-- [T-235c] 指定抖音收藏夹采集(收藏夹跟拍信号源,SPEC 2026-07-11 daily-topic-autopilot 追加)。
--
-- ① favorites_folders:用户按夹名登记的「指定收藏夹」(须与抖音收藏夹同名)。定时 job
--    (sourceKind=favorites)每天拉本人收藏夹列表 → 按 name 精确匹配 → 回填 collects_id +
--    last_synced_at。**只采登记的指定夹,不碰其他收藏**(隐私红线)。幂等唯一键 (user_id, name)
--    (登记时用户只知道夹名;同名重复登记 → 更新不新建)。
--
-- ② favorites_items:夹内视频台账(采集去重锚 + 进池流转)。幂等唯一键 (user_id, aweme_id)
--    (跨夹收藏同视频也只记一次)。status:pending(待进池)| promoted(已进池,candidate_id
--    溯源)。collector 每 run 只 promote ≤3 条(防灌库)。
--
-- additive only:两张新表,IF NOT EXISTS 幂等,可重跑;不动任何存量表。
-- =====================================================================================

CREATE TABLE IF NOT EXISTS favorites_folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  name TEXT NOT NULL,
  collects_id TEXT,
  note TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_folders_identity ON favorites_folders (user_id, name);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_favorites_folders_user_account ON favorites_folders (user_id, account_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS favorites_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  folder_id TEXT NOT NULL,
  aweme_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  author_nickname TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  candidate_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_items_identity ON favorites_items (user_id, aweme_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_favorites_items_user_account ON favorites_items (user_id, account_id);
