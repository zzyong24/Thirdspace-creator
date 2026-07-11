-- =====================================================================================
-- [T-212d] 防茧房校准:淘汰原因 → 蒸馏偏好信号 + 反过拟合护栏(SPEC 2026-07-11 §2.4)。
--
-- ① candidates.drop_reason:用户淘汰选题时写的一句原因(蒸馏偏好的原料)。additive、nullable、
--    存量与非淘汰候选留空。
-- ② topic_preferences:淘汰原因蒸馏出的**结构化偏好信号**(该创作者「不喜欢 X / 偏好 Y」),
--    喂进选题评分(与 positioningFit 并列)。护栏字段全落表:
--      - weight        评分调整量(写入前已 ±10 封顶;正=prefer 抬分,负=avoid 压分)。
--      - example_count 支持这条偏好的淘汰原因条数(≥3 才升级为 active 硬偏好;单次淘汰只记不升级)。
--      - status        candidate(<3 例,不注入评分)| active(≥3 例硬偏好,注入)| archived(8 周衰减过期)。
--      - last_reinforced_at 最近一次被淘汰原因强化的时间(8 周衰减/归档的时间锚)。
--
-- additive only:新表 + 加列,IF NOT EXISTS 幂等,可重跑。account_id 复用 T-201 账号锚点。
-- =====================================================================================

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS drop_reason TEXT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS topic_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  keyword TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'avoid',
  signal TEXT NOT NULL DEFAULT '',
  example_count INTEGER NOT NULL DEFAULT 0,
  weight INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'candidate',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_reinforced_at TEXT NOT NULL
);
--> statement-breakpoint
-- 身份键**不含 account_id**:account_id 可空(存量/未选号),含它会因 PG「多个 NULL 互不冲突」
-- 让 upsert onConflict 落空、每次淘汰都新插一行。故按 (user_id, keyword, direction) 归并同一条偏好;
-- account_id 仅作 stamp(多号偏好隔离是软概念,单号现实安全)。
CREATE UNIQUE INDEX IF NOT EXISTS ux_topic_preferences_identity ON topic_preferences (user_id, keyword, direction);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_topic_preferences_user_status ON topic_preferences (user_id, status);
