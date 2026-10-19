ALTER TABLE audience_signals ADD COLUMN IF NOT EXISTS publication_id TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_audience_signals_pub ON audience_signals (user_id, publication_id);
