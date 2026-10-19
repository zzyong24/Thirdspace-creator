ALTER TABLE projects ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE projects ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE projects p SET group_id=g.id FROM account_groups g WHERE g.user_id=p.user_id AND g.id='grp_legacy_'||p.account_id AND p.group_id IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS projects_group_scope_ix ON projects(user_id,group_id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION stamp_project_group() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.group_id IS NULL AND NEW.account_id IS NOT NULL THEN
  SELECT group_id INTO NEW.group_id FROM account_group_memberships WHERE user_id=NEW.user_id AND platform_account_id=NEW.account_id AND left_at IS NULL;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS project_group_stamp ON projects;
--> statement-breakpoint
CREATE TRIGGER project_group_stamp BEFORE INSERT ON projects FOR EACH ROW EXECUTE FUNCTION stamp_project_group();
