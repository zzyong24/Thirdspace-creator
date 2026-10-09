ALTER TABLE platform_collection_runs ADD COLUMN group_id text;
--> statement-breakpoint
ALTER TABLE platform_collection_runs ADD COLUMN group_version integer;
--> statement-breakpoint
ALTER TABLE platform_collection_runs ADD COLUMN membership_version integer;
--> statement-breakpoint
CREATE TABLE platform_native_reports (id text PRIMARY KEY,user_id text NOT NULL,group_id text NOT NULL,account_id text NOT NULL,membership_version integer NOT NULL,platform text NOT NULL,kind text NOT NULL,sha256 text NOT NULL,selection_key text NOT NULL,payload jsonb NOT NULL,observed_at text NOT NULL,ingested_at text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX platform_native_reports_evidence_ux ON platform_native_reports(user_id,group_id,account_id,platform,kind,sha256,selection_key);
--> statement-breakpoint
CREATE INDEX platform_native_reports_scope_ix ON platform_native_reports(user_id,group_id,account_id,observed_at);
