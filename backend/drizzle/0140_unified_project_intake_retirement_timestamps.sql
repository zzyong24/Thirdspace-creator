-- 0139 已执行身份保持不变；仅修复它退役的旧父任务及可证明独占的选题子任务。
-- 保留原取消时刻与微秒，不用本次启动时间替代历史事实。
WITH retired AS (
  SELECT task.id
  FROM execution_tasks task
  WHERE task.last_error_code = 'SYSTEM_UPGRADED'
    AND task.last_error_message = '系统已升级，请重新点击升级为项目'
    AND (
      (task.kind = 'radar_project_upgrade' AND task.status = 'cancelled')
      OR (task.kind = 'topic_preview' AND task.owner_type = 'transform'
        AND task.status IN ('cancelled', 'unknown_result')
        AND EXISTS (
          SELECT 1 FROM execution_tasks parent
          WHERE parent.kind = 'radar_project_upgrade' AND parent.status = 'cancelled'
            AND parent.last_error_code = 'SYSTEM_UPGRADED'
            AND task.idempotency_key = parent.id || ':preview'
            AND task.owner_id = parent.owner_id AND task.user_id = parent.user_id
            AND task.account_id IS NOT DISTINCT FROM parent.account_id
            AND task.group_id IS NOT DISTINCT FROM parent.group_id
        ))
    )
)
UPDATE execution_tasks task
SET updated_at = to_char(task.updated_at::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
FROM retired
WHERE task.id = retired.id
  AND task.updated_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?[+-][0-9]{2}(:[0-9]{2})?$';
--> statement-breakpoint
-- 沿现有尝试结算字段补结束时间；没有开始记录就不造记录，未知子调用也不冒终态。
UPDATE observability_attempt_clocks clock
SET finished_at = task.updated_at, result = 'cancelled', kind = task.kind, reported = FALSE
FROM execution_tasks task
WHERE clock.task_id = task.id AND clock.user_id = task.user_id AND clock.attempt = task.attempt
  AND clock.finished_at IS NULL AND task.status = 'cancelled'
  AND task.last_error_code = 'SYSTEM_UPGRADED'
  AND task.last_error_message = '系统已升级，请重新点击升级为项目'
  AND task.updated_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$'
  AND (
    task.kind = 'radar_project_upgrade'
    OR (task.kind = 'topic_preview' AND task.owner_type = 'transform'
      AND EXISTS (
        SELECT 1 FROM execution_tasks parent
        WHERE parent.kind = 'radar_project_upgrade' AND parent.status = 'cancelled'
          AND parent.last_error_code = 'SYSTEM_UPGRADED'
          AND task.idempotency_key = parent.id || ':preview'
          AND task.owner_id = parent.owner_id AND task.user_id = parent.user_id
          AND task.account_id IS NOT DISTINCT FROM parent.account_id
          AND task.group_id IS NOT DISTINCT FROM parent.group_id
      ))
  );
