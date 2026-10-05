ALTER TABLE execution_calls ADD COLUMN IF NOT EXISTS provider_result JSONB;
--> statement-breakpoint
ALTER TABLE execution_calls ADD COLUMN IF NOT EXISTS rejection_code TEXT;
