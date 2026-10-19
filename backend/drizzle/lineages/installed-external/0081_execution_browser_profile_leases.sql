CREATE TABLE IF NOT EXISTS execution_browser_profile_leases (
 user_id TEXT NOT NULL,
 domain TEXT NOT NULL,
 owner_execution_task_id TEXT NOT NULL,
 attempt INTEGER NOT NULL,
 fence_token TEXT NOT NULL,
 lease_id TEXT PRIMARY KEY,
 acquired_at TEXT NOT NULL,
 released_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_execution_browser_profile_owner ON execution_browser_profile_leases(user_id, domain);
