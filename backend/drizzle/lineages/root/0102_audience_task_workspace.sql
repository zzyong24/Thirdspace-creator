CREATE TABLE topic_workspaces (user_id TEXT NOT NULL, account_id TEXT NOT NULL, version INTEGER NOT NULL, config JSONB NOT NULL, receipts JSONB NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL, PRIMARY KEY(user_id, account_id));
--> statement-breakpoint
CREATE TABLE topic_proposal_feedback (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL, project_id TEXT, task_id TEXT NOT NULL, proposal_id TEXT NOT NULL, proposition_key TEXT NOT NULL, title TEXT NOT NULL, angle TEXT NOT NULL, reason TEXT NOT NULL, note TEXT NOT NULL, positioning_version_id TEXT, request_hash TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX ix_topic_feedback_scope ON topic_proposal_feedback(user_id,account_id,project_id);
--> statement-breakpoint
