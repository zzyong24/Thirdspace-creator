-- T-546: 同一内容雷达来源同时至多一个活跃 source_sync。
-- 先诚实终止历史重复任务，避免给已有脏数据的用户升级时创建索引失败；
-- 关联 intelligence run 会在下一次 startRun 时按 task 终态收敛。
WITH ranked_active_source_sync AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, account_id, kind, owner_type, owner_id
      ORDER BY created_at ASC, id ASC
    ) AS active_rank
  FROM execution_tasks
  WHERE kind = 'source_sync'
    AND owner_type = 'source'
    AND status IN (
      'queued',
      'running',
      'pause_requested',
      'paused',
      'cancel_requested'
    )
)
UPDATE execution_tasks
SET
  status = 'failed',
  lease_owner = NULL,
  lease_expires_at = NULL,
  heartbeat_at = NULL,
  last_error_code = 'DUPLICATE_ACTIVE_OWNER',
  last_error_message = '升级时收敛重复的活跃来源同步任务',
  updated_at = CURRENT_TIMESTAMP::TEXT
WHERE id IN (
  SELECT id
  FROM ranked_active_source_sync
  WHERE active_rank > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_execution_task_active_source
  ON execution_tasks (user_id, account_id, kind, owner_type, owner_id)
  WHERE kind = 'source_sync'
    AND owner_type = 'source'
    AND status IN (
      'queued',
      'running',
      'pause_requested',
      'paused',
      'cancel_requested'
    );
