-- T-517:同一 scheduled_job 同时至多一个活跃 automation_sync。
-- execution_tasks 仍是唯一执行状态机；该部分唯一索引只提供 overlap fence，
-- 不新增 activeRunId/第二状态机。终态任务不占 fence，后续计划 tick 可正常入队。
CREATE UNIQUE INDEX IF NOT EXISTS ux_execution_task_active_scheduled_job
  ON execution_tasks (user_id, account_id, kind, owner_type, owner_id)
  WHERE kind = 'automation_sync'
    AND owner_type = 'scheduled_job'
    AND status IN (
      'queued',
      'running',
      'pause_requested',
      'paused',
      'cancel_requested'
    );
