ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS assistant_execution_engine text CHECK (assistant_execution_engine IN ('pi', 'codex'));
