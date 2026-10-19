ALTER TABLE execution_calls ADD COLUMN IF NOT EXISTS parent_call_id TEXT REFERENCES execution_calls(id);
