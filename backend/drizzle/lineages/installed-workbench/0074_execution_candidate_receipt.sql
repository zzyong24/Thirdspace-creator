ALTER TABLE ai_task_results ADD COLUMN IF NOT EXISTS execution_call_id TEXT REFERENCES execution_calls(id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ai_task_results_execution_call_unique ON ai_task_results(execution_call_id);
