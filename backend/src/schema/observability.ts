// 仅观测事实、授权和发送状态。明文异常上下文永不存库。
export const OBSERVABILITY_DDL = `
CREATE TABLE IF NOT EXISTS observability_installation (
 id TEXT PRIMARY KEY CHECK(id='installation'), installation_alias TEXT NOT NULL,
 last_attempt_at TEXT, changed_at TEXT, last_uploaded_at TEXT, last_receipt_id TEXT,
 last_error_code TEXT, last_data_kind TEXT, dropped_log_count INTEGER NOT NULL DEFAULT 0, config JSONB, sequence INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS observability_consents (
 user_id TEXT PRIMARY KEY, log_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 metrics_enabled BOOLEAN NOT NULL DEFAULT FALSE, consent_version INTEGER NOT NULL DEFAULT 2,
 changed_at TEXT NOT NULL, metrics_granted_at TEXT
);
CREATE TABLE IF NOT EXISTS observability_events (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, occurred_at TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('operation','exception')), payload JSONB NOT NULL,
 batch_id TEXT
);
CREATE INDEX IF NOT EXISTS observability_events_pending ON observability_events(user_id,batch_id,occurred_at);
CREATE TABLE IF NOT EXISTS observability_exception_seen (
 event_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS observability_outbox (
 batch_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, body TEXT NOT NULL,
 body_sha256 TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS observability_log_receipts (
 snapshot_sha256 TEXT PRIMARY KEY, session_id TEXT NOT NULL, receipt_id TEXT NOT NULL,
 received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS observability_log_pending (
 snapshot_sha256 TEXT PRIMARY KEY, user_id TEXT NOT NULL, metadata JSONB NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS observability_task_cursor (
 user_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, task_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS observability_attempt_clocks (
 task_id TEXT NOT NULL, attempt INTEGER NOT NULL, user_id TEXT NOT NULL,
 created_at TEXT NOT NULL, started_at TEXT NOT NULL,
 kind TEXT, finished_at TEXT, result TEXT, was_unknown BOOLEAN NOT NULL DEFAULT FALSE, reported BOOLEAN NOT NULL DEFAULT FALSE,
 PRIMARY KEY(task_id,attempt)
);
`;
