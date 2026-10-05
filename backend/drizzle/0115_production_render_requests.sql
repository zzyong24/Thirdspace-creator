CREATE TABLE IF NOT EXISTS production_render_requests (
  id TEXT PRIMARY KEY,user_id TEXT NOT NULL,production_id TEXT NOT NULL,request_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,revision INTEGER NOT NULL,spec JSONB NOT NULL,attempt_id TEXT NOT NULL,
  task_id TEXT,asset_id TEXT,created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_render_requests_request_ux ON production_render_requests(production_id,request_id);
