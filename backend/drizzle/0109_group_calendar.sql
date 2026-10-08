ALTER TABLE content_calendar_entries ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE content_calendar_entries ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE content_calendar_entries ADD COLUMN IF NOT EXISTS membership_version INTEGER;
--> statement-breakpoint
ALTER TABLE publishing_cadences ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE publishing_cadences ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
DROP INDEX IF EXISTS content_calendar_entries_active_project_ux;
--> statement-breakpoint
CREATE UNIQUE INDEX content_calendar_entries_active_project_ux ON content_calendar_entries(user_id,account_id,project_id) WHERE group_id IS NULL AND project_id IS NOT NULL AND status IN ('planned','missed');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS content_calendar_entries_group_active_project_ux ON content_calendar_entries(user_id,group_id,project_id) WHERE group_id IS NOT NULL AND project_id IS NOT NULL AND status IN ('planned','missed');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS content_calendar_entries_group_window_ix ON content_calendar_entries(user_id,group_id,planned_date);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publishing_cadences_group_ux ON publishing_cadences(user_id,group_id) WHERE group_id IS NOT NULL;
--> statement-breakpoint
