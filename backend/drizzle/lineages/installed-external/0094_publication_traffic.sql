CREATE TABLE IF NOT EXISTS publication_traffic (
 publication_id TEXT PRIMARY KEY REFERENCES publications(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL, account_id TEXT NOT NULL, external_id TEXT NOT NULL,
 last_task_id TEXT, requested_at TEXT NOT NULL, attempted_at TEXT, captured_at TEXT,
 status TEXT NOT NULL DEFAULT 'pending', error TEXT, data JSONB,
 CONSTRAINT publication_traffic_status CHECK (status IN ('pending','succeeded','failed','needs_reconnect'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_publication_traffic_queue ON publication_traffic(user_id,account_id,status,requested_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_scheduled_traffic_job ON scheduled_job(user_id,account_id,source_kind) WHERE source_kind='self.traffic' AND account_id IS NOT NULL;
