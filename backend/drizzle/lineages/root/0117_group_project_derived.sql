ALTER TABLE material_links ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE material_links ADD COLUMN IF NOT EXISTS account_id TEXT;
--> statement-breakpoint
UPDATE material_links l SET group_id=p.group_id,account_id=p.account_id FROM projects p WHERE l.project_id=p.id AND l.user_id=p.user_id AND l.group_id IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS material_links_workspace_ix ON material_links(user_id,group_id,account_id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION stamp_material_link_workspace() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 SELECT group_id,account_id INTO NEW.group_id,NEW.account_id FROM projects WHERE id=NEW.project_id AND user_id=NEW.user_id;
 RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS material_link_workspace_stamp ON material_links;
--> statement-breakpoint
CREATE TRIGGER material_link_workspace_stamp BEFORE INSERT ON material_links FOR EACH ROW EXECUTE FUNCTION stamp_material_link_workspace();
