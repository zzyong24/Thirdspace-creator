-- T1042：原正常迁移器幂等合并报表/画布两条0101谱系，保留历史回执与数据。
CREATE TABLE IF NOT EXISTS reporting_consents (
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('diagnostics','creator')),
  account_id TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  consent_version INTEGER NOT NULL,
  consent_epoch INTEGER NOT NULL DEFAULT 0,
  account_alias TEXT,
  changed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, scope, account_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reporting_outbox (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  account_id TEXT NOT NULL DEFAULT '',
  work_alias TEXT,
  consent_epoch INTEGER NOT NULL,
  encrypted_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reporting_outbox_owner_scope ON reporting_outbox(user_id,scope,account_id,created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reporting_consent_changes (
  user_id TEXT NOT NULL,
  change_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  account_id TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL,
  changed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, change_id)
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS creative_canvases (
 id text PRIMARY KEY, user_id text NOT NULL, account_id text NOT NULL,
 title text NOT NULL, project_id text, document_json jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 1, created_at text NOT NULL, updated_at text NOT NULL, archived_at text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS creative_canvases_owner_updated_idx ON creative_canvases(user_id,account_id,updated_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS canvas_generation_links (
 id text PRIMARY KEY, user_id text NOT NULL, account_id text NOT NULL,
 canvas_id text NOT NULL, node_id text NOT NULL, attempt_id text NOT NULL UNIQUE, task_id text UNIQUE,
 input_revision integer NOT NULL, input_digest text NOT NULL, input_json jsonb NOT NULL, reference_file_id text, reference_checksum text,
 result_asset_id text, created_at text NOT NULL, updated_at text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS canvas_generation_links_canvas_idx ON canvas_generation_links(user_id,account_id,canvas_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS canvas_agent_proposals (
 id text PRIMARY KEY, user_id text NOT NULL, account_id text NOT NULL, canvas_id text NOT NULL,
 base_revision integer NOT NULL, operations_json jsonb NOT NULL, status text NOT NULL,
 applied_revision integer, applied_canvas_json jsonb, created_at text NOT NULL, expires_at text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS canvas_agent_proposals_canvas_idx ON canvas_agent_proposals(user_id,account_id,canvas_id);
