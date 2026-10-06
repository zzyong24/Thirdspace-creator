ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS runtime_data JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS attempt_id TEXT;
--> statement-breakpoint
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;
--> statement-breakpoint
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS retry_of_task_id TEXT;
--> statement-breakpoint
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS lease_owner TEXT;
--> statement-breakpoint
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS lease_token TEXT;
--> statement-breakpoint
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS lease_expires_at TEXT;
--> statement-breakpoint
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS model_call_started_at TEXT;
--> statement-breakpoint
UPDATE ai_tasks
SET attempt_id = COALESCE(attempt_id, 'legacy-attempt:' || id),
    request_fingerprint = COALESCE(request_fingerprint, 'sha256:' || repeat('0', 64))
WHERE attempt_id IS NULL OR request_fingerprint IS NULL;
--> statement-breakpoint
ALTER TABLE ai_tasks ALTER COLUMN attempt_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE ai_tasks ALTER COLUMN request_fingerprint SET NOT NULL;
--> statement-breakpoint
ALTER TABLE ai_tasks ALTER COLUMN attempt_id SET DEFAULT gen_random_uuid()::text;
--> statement-breakpoint
ALTER TABLE ai_tasks ALTER COLUMN request_fingerprint SET DEFAULT ('sha256:' || repeat('0', 64));
--> statement-breakpoint
DROP INDEX IF EXISTS ai_tasks_user_idempotency;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ai_tasks_attempt_identity
  ON ai_tasks (user_id, account_id, task_type, attempt_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_task_model_call_started
  ON ai_task_steps (ai_task_id) WHERE kind = 'model_call_started';
