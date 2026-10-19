CREATE TABLE IF NOT EXISTS calibration_rule_suggestions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  learning_id TEXT NOT NULL,
  rubric_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  proposed_dimension JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale TEXT NOT NULL DEFAULT '',
  adopted_version_id TEXT,
  created_at TEXT NOT NULL,
  adopted_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS calibration_rule_suggestions_user_idx ON calibration_rule_suggestions (user_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS calibration_rule_suggestions_learning_idx ON calibration_rule_suggestions (learning_id);
