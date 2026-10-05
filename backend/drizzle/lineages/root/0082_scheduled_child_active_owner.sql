-- T-915：等待持久子执行的定时父任务仍占同作业互斥位，不能在下一分钟另起一轮。
DROP INDEX IF EXISTS ux_execution_task_active_scheduled_job;
--> statement-breakpoint
CREATE UNIQUE INDEX ux_execution_task_active_scheduled_job
 ON execution_tasks(user_id,account_id,kind,owner_type,owner_id)
 WHERE kind='automation_sync' AND owner_type='scheduled_job'
 AND (status IN ('queued','running','pause_requested','paused','cancel_requested')
 OR (payload ? '__scheduledChild' AND status IN ('blocked','waiting_user','unknown_result','retry_wait')));
