-- T-915：仅新增映射，历史任务不自动重排。未核对的在途调用不得迁为可重试。
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS execution_task_id TEXT REFERENCES execution_tasks(id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ai_tasks_execution_task_id_unique ON ai_tasks(execution_task_id);
