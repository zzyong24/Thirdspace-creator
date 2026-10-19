ALTER TABLE execution_tasks ADD COLUMN IF NOT EXISTS retry_at TEXT;
--> statement-breakpoint
ALTER TABLE execution_tasks ADD COLUMN IF NOT EXISTS retry_of_call_id TEXT;
