-- =====================================================================================
-- T-200 采集账号隔离修复:scheduled_job 加 account_id(第二属主维度 / 按抖音号)。
--
-- 根因:采集管线不带 accountId —— 调度器系统 ctx 无 accountId,cron 到点触发的采集落库
--   一律 account_id=NULL,而 webview 读侧带当前号严格 eq → 排除 null 号数据 → 封面/素材占位。
-- 修复(写侧正确落号,不放宽读侧 gate):建 job 时从 ctx.accountId stamp 到 scheduled_job;
--   cron 到点触发时,采集 runtime ctx.accountId 由 job.account_id 派生,使新采集落正确号。
--
-- additive only:列 nullable、幂等(IF NOT EXISTS),可重跑、可回滚(account_id 设回 NULL)。
--   nullable 是稳定终态(旧 job / 未选号退化),不改 NOT NULL。
-- =====================================================================================

ALTER TABLE scheduled_job ADD COLUMN IF NOT EXISTS account_id TEXT;
