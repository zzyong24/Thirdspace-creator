DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['benchmark_sources','benchmark_works','trend_sources','favorites_folders','favorites_items','topic_attributions'] LOOP
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS group_id TEXT',t);
  EXECUTE format('UPDATE %I r SET group_id=g.id FROM account_groups g WHERE r.group_id IS NULL AND r.user_id=g.user_id AND g.id=''grp_legacy_''||r.account_id',t);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(user_id,group_id)',t||'_group_ix',t);
 END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE benchmark_sources ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE benchmark_works ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE trend_sources ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE topic_attributions ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS ux_benchmark_sources_identity_v2;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_benchmark_sources_identity_v2 ON benchmark_sources(user_id,account_id,platform,external_account_id) WHERE group_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_benchmark_sources_group_identity ON benchmark_sources(user_id,group_id,platform,external_account_id) WHERE group_id IS NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS ux_benchmark_works_aweme_v2;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_benchmark_works_aweme_v2 ON benchmark_works(user_id,account_id,platform,aweme_id) WHERE group_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_benchmark_works_group_aweme ON benchmark_works(user_id,group_id,platform,aweme_id) WHERE group_id IS NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS ux_trend_sources_identity_v2;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_trend_sources_identity_v2 ON trend_sources(user_id,account_id,url) WHERE group_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_trend_sources_group_identity ON trend_sources(user_id,group_id,url) WHERE group_id IS NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS ux_favorites_folders_identity_v2;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_folders_identity_v2 ON favorites_folders(user_id,account_id,name) WHERE group_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_folders_group_identity ON favorites_folders(user_id,group_id,account_id,name) WHERE group_id IS NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS ux_favorites_items_identity_v2;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_items_identity_v2 ON favorites_items(user_id,account_id,aweme_id) WHERE group_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_items_group_identity ON favorites_items(user_id,group_id,aweme_id) WHERE group_id IS NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION research_child_group_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.group_id IS NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='favorites_items' THEN
  SELECT group_id,account_id INTO NEW.group_id,NEW.account_id FROM favorites_folders WHERE id=NEW.folder_id AND user_id=NEW.user_id AND account_id=NEW.account_id;
 ELSIF TG_TABLE_NAME='benchmark_works' THEN
  IF NEW.discovery='darkhorse' THEN RETURN NEW; END IF;
  SELECT group_id INTO NEW.group_id FROM benchmark_sources WHERE id=NEW.source_id AND user_id=NEW.user_id AND group_id IS NOT DISTINCT FROM NEW.group_id;
 ELSIF TG_TABLE_NAME='topic_attributions' THEN
  SELECT group_id,account_id INTO NEW.group_id,NEW.account_id FROM publications WHERE id=NEW.publication_id AND user_id=NEW.user_id AND group_id IS NOT DISTINCT FROM NEW.group_id;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['benchmark_works','favorites_items','topic_attributions'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS research_child_group_stamp ON %I',t);
  EXECUTE format('CREATE TRIGGER research_child_group_stamp BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION research_child_group_stamp()',t);
 END LOOP;
END $$;
