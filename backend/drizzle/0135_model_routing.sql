ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS model_routing JSONB;
--> statement-breakpoint
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS model_routing_revision INTEGER NOT NULL DEFAULT 0 CHECK (model_routing_revision >= 0);
