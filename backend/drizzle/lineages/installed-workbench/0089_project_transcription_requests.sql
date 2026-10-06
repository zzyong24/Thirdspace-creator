CREATE TABLE IF NOT EXISTS project_transcription_requests (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 account_id TEXT NOT NULL,
 attempt_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 aweme_id TEXT NOT NULL,
 ai_task_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(user_id, account_id, attempt_id)
);
