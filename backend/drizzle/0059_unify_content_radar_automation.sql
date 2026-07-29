-- T-598：内容雷达到期发现统一进入 scheduled_job / automation-driver。
--
-- 旧 benchmark / favorites 与内容雷达 creator_profile / favorites_folder 来源重叠；
-- 先停用旧 producer，再允许 intelligence.sync 成为同账号唯一系统聚合作业。
-- 历史 job/run 保留用于审计，不物理删除。
UPDATE scheduled_job
SET enabled = FALSE,
    updated_at = CURRENT_TIMESTAMP::TEXT
WHERE source_kind IN ('benchmark', 'favorites')
  AND enabled = TRUE;

DROP INDEX IF EXISTS ux_scheduled_job_user_account_source;
CREATE UNIQUE INDEX ux_scheduled_job_user_account_source
  ON scheduled_job (user_id, account_id, source_kind)
  WHERE source_kind IN (
    'self.metrics',
    'self.detail',
    'comments',
    'benchmark',
    'topic.daily',
    'favorites',
    'intelligence.sync'
  );
