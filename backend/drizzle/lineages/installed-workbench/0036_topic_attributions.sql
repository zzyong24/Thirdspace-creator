-- =====================================================================================
-- [T-235d] 正向归因回流 —— 选题验证库(SPEC 2026-07-11 daily-topic-autopilot §2.4)。
--
-- topic_attributions:已发布作品实绩按**选题维度**归因(gate-F3 枚举字段可聚合 +
--   受限自由文本带逐字稿引用),沉淀「哪类选题在我账号被验证过」;next_experiments 由
--   runner 转化进候选池(title 前缀「实验|」,card.attributionId 溯源)。
--
-- [gate-F1] 与 learnings(脚本级经验)边界:不共写同一表、不互相触发 —— 本表由发布实绩
--   (self.detail 采集)触发,learnings 由复盘/编辑触发;关联锚 = project_id 溯源。
--
-- 幂等锚:(user_id, publication_id) 唯一 —— 一条发布作品至多一条归因(重跑 upsert 更新)。
-- 表现分层 performance_tier ∈ viral|normal|low 按**相对本账号基线**算(baseline_ratio 存
--   分层依据倍数;绝对阈值不抄 dy--)。
--
-- additive only:纯新表,IF NOT EXISTS 幂等,可重跑。
-- =====================================================================================

CREATE TABLE IF NOT EXISTS topic_attributions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT,
  publication_id TEXT NOT NULL,
  project_id TEXT,
  performance_tier TEXT NOT NULL DEFAULT 'normal',
  baseline_ratio DOUBLE PRECISION,
  topic_type TEXT NOT NULL,
  hook_type TEXT NOT NULL,
  structure_formula TEXT NOT NULL,
  why_worked TEXT NOT NULL DEFAULT '',
  why_failed TEXT NOT NULL DEFAULT '',
  reusable_formula TEXT NOT NULL DEFAULT '',
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_topic_attributions_pub ON topic_attributions (user_id, publication_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_topic_attributions_user_account ON topic_attributions (user_id, account_id);
