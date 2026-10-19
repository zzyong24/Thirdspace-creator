ALTER TABLE publications ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
UPDATE publications t SET group_id=g.id FROM account_groups g WHERE t.group_id IS NULL AND t.user_id=g.user_id AND g.id='grp_legacy_'||t.account_id;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS publications_group_ix ON publications(user_id,group_id);
--> statement-breakpoint
ALTER TABLE metric_snapshots ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
UPDATE metric_snapshots t SET group_id=g.id FROM account_groups g WHERE t.group_id IS NULL AND t.user_id=g.user_id AND g.id='grp_legacy_'||t.account_id;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS metric_snapshots_group_ix ON metric_snapshots(user_id,group_id);
--> statement-breakpoint
ALTER TABLE metric_values ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
UPDATE metric_values t SET group_id=g.id FROM account_groups g WHERE t.group_id IS NULL AND t.user_id=g.user_id AND g.id='grp_legacy_'||t.account_id;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS metric_values_group_ix ON metric_values(user_id,group_id);
--> statement-breakpoint
ALTER TABLE audience_snapshots ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
UPDATE audience_snapshots t SET group_id=g.id FROM account_groups g WHERE t.group_id IS NULL AND t.user_id=g.user_id AND g.id='grp_legacy_'||t.account_id;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audience_snapshots_group_ix ON audience_snapshots(user_id,group_id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION stamp_publication_group() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.group_id IS NULL THEN SELECT group_id INTO NEW.group_id FROM projects WHERE id=(SELECT project_id FROM content_outputs WHERE id=NEW.content_output_id) AND user_id=NEW.user_id; END IF;
 IF NEW.group_id IS NULL THEN SELECT group_id INTO NEW.group_id FROM account_group_memberships WHERE user_id=NEW.user_id AND platform_account_id=NEW.account_id AND left_at IS NULL; END IF;
 RETURN NEW; END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS publications_group_stamp ON publications;
--> statement-breakpoint
CREATE TRIGGER publications_group_stamp BEFORE INSERT ON publications FOR EACH ROW EXECUTE FUNCTION stamp_publication_group();
--> statement-breakpoint
ALTER TABLE metric_snapshots ADD COLUMN IF NOT EXISTS native_platform TEXT;
--> statement-breakpoint
UPDATE metric_snapshots t SET native_platform=p.platform FROM publications p WHERE t.native_platform IS NULL AND t.publication_id=p.id AND t.user_id=p.user_id AND t.account_id=p.account_id;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION stamp_metric_group() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 SELECT group_id,platform INTO NEW.group_id,NEW.native_platform FROM publications WHERE id=NEW.publication_id AND user_id=NEW.user_id AND account_id=NEW.account_id;
 RETURN NEW; END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS metric_snapshots_group_stamp ON metric_snapshots;
--> statement-breakpoint
CREATE TRIGGER metric_snapshots_group_stamp BEFORE INSERT ON metric_snapshots FOR EACH ROW EXECUTE FUNCTION stamp_metric_group();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION stamp_metric_value_group() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 SELECT group_id INTO NEW.group_id FROM metric_snapshots WHERE id=NEW.metric_snapshot_id AND user_id=NEW.user_id AND account_id=NEW.account_id;
 RETURN NEW; END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS metric_values_group_stamp ON metric_values;
--> statement-breakpoint
CREATE TRIGGER metric_values_group_stamp BEFORE INSERT ON metric_values FOR EACH ROW EXECUTE FUNCTION stamp_metric_value_group();

--> statement-breakpoint
ALTER TABLE retention_points ADD COLUMN IF NOT EXISTS group_id TEXT;

--> statement-breakpoint
ALTER TABLE publications ADD COLUMN IF NOT EXISTS group_version INTEGER;
--> statement-breakpoint
ALTER TABLE publications ADD COLUMN IF NOT EXISTS membership_version INTEGER;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION stamp_publication_child_group() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 SELECT group_id INTO NEW.group_id FROM publications WHERE id=NEW.publication_id AND user_id=NEW.user_id AND account_id=NEW.account_id;
 RETURN NEW; END $$;
--> statement-breakpoint
DO $$ DECLARE name TEXT; BEGIN
 FOREACH name IN ARRAY ARRAY['retention_points','audience_snapshots'] LOOP
  EXECUTE format('UPDATE %I t SET group_id=p.group_id FROM publications p WHERE t.group_id IS NULL AND t.publication_id=p.id AND t.user_id=p.user_id AND t.account_id=p.account_id',name);
  EXECUTE format('DROP TRIGGER IF EXISTS publication_child_group_stamp ON %I',name);
  EXECUTE format('CREATE TRIGGER publication_child_group_stamp BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION stamp_publication_child_group()',name);
 END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE external_sources ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE external_sources ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE ingestion_runs ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE ingestion_runs ADD COLUMN IF NOT EXISTS group_version INTEGER;
--> statement-breakpoint
ALTER TABLE ingestion_runs ADD COLUMN IF NOT EXISTS membership_version INTEGER;
--> statement-breakpoint
ALTER TABLE ingestion_runs ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
UPDATE ingestion_runs t SET group_id=g.id FROM account_groups g WHERE t.group_id IS NULL AND t.user_id=g.user_id AND g.id='grp_legacy_'||t.account_id;
--> statement-breakpoint
DROP INDEX IF EXISTS ux_ingestion_runs_source_idem;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_runs_source_idem ON ingestion_runs(external_source_id,idempotency_key) WHERE group_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_runs_group_source_idem ON ingestion_runs(user_id,group_id,external_source_id,idempotency_key) WHERE group_id IS NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='external_sources_real_account_check') THEN ALTER TABLE external_sources ADD CONSTRAINT external_sources_real_account_check CHECK(account_id IS NOT NULL OR source_type='manual'); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ingestion_runs_real_account_check') THEN ALTER TABLE ingestion_runs ADD CONSTRAINT ingestion_runs_real_account_check CHECK(account_id IS NOT NULL OR run_type='manual'); END IF;
END $$;
--> statement-breakpoint
UPDATE ingestion_runs t SET group_version=g.version,membership_version=m.version
 FROM account_groups g,account_group_memberships m
 WHERE t.group_id=g.id AND t.user_id=g.user_id AND m.user_id=t.user_id AND m.platform_account_id=t.account_id AND m.group_id=t.group_id AND m.left_at IS NULL AND t.membership_version IS NULL;
--> statement-breakpoint

ALTER TABLE publication_traffic ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE publication_sync_state ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
DO $$ DECLARE name TEXT; BEGIN
 FOREACH name IN ARRAY ARRAY['publication_traffic','publication_sync_state'] LOOP
  EXECUTE format('UPDATE %I t SET group_id=p.group_id FROM publications p WHERE t.group_id IS NULL AND t.publication_id=p.id AND t.user_id=p.user_id AND t.account_id=p.account_id',name);
  EXECUTE format('DROP TRIGGER IF EXISTS publication_child_group_stamp ON %I',name);
  EXECUTE format('CREATE TRIGGER publication_child_group_stamp BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION stamp_publication_child_group()',name);
 END LOOP;
END $$;
--> statement-breakpoint
