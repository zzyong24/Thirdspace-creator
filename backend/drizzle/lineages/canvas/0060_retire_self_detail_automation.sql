-- T-600：self.detail 已与 self.metrics 共用同一 visible-only canonical collector，
-- 不再作为独立自动化任务。保留 job/run 历史，只停用 producer。
UPDATE scheduled_job
SET enabled = FALSE,
    updated_at = TO_CHAR(
      CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
WHERE source_kind = 'self.detail'
  AND enabled = TRUE;
--> statement-breakpoint

-- 只规范系统曾写入的默认名称，不覆盖用户自己改过的任务名。
UPDATE scheduled_job
SET name = '我的作品数据同步',
    updated_at = TO_CHAR(
      CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
WHERE source_kind = 'self.metrics'
  AND name = '每天抓我的新作品指标';
--> statement-breakpoint

UPDATE scheduled_job
SET name = '我的作品评论同步',
    updated_at = TO_CHAR(
      CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
WHERE source_kind = 'comments'
  AND name = '每天抓我作品的最新评论';
--> statement-breakpoint

UPDATE scheduled_job
SET name = '每日自动生成选题',
    updated_at = TO_CHAR(
      CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
WHERE source_kind = 'topic.daily'
  AND name = '每天自动出题';
