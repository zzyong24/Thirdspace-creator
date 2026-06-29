CREATE TABLE IF NOT EXISTS ai_task_steps (
  id TEXT PRIMARY KEY,
  ai_task_id TEXT NOT NULL,
  step_no INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'step',
  text TEXT NOT NULL DEFAULT '',
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ai_task_steps_task ON ai_task_steps (ai_task_id, step_no);
