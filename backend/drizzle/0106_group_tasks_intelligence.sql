-- T1022 共享创作根归组，保留legacy来源account_id，不伪造平台账号。
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE ai_conversations ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_conversations_user_group_idx ON ai_conversations(user_id,group_id);
--> statement-breakpoint
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE ai_tasks ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_tasks_user_group_idx ON ai_tasks(user_id,group_id);
--> statement-breakpoint
ALTER TABLE scheduled_job ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE scheduled_job ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scheduled_job_user_group_idx ON scheduled_job(user_id,group_id);
--> statement-breakpoint
ALTER TABLE intelligence_collections ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE intelligence_collections ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_collections_user_group_idx ON intelligence_collections(user_id,group_id);
--> statement-breakpoint
ALTER TABLE intelligence_sources ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE intelligence_sources ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_sources_user_group_idx ON intelligence_sources(user_id,group_id);
--> statement-breakpoint
ALTER TABLE intelligence_source_collection_memberships ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE intelligence_source_collection_memberships ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_source_collection_memberships_user_group_idx ON intelligence_source_collection_memberships(user_id,group_id);
--> statement-breakpoint
ALTER TABLE intelligence_items ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE intelligence_items ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_items_user_group_idx ON intelligence_items(user_id,group_id);
--> statement-breakpoint
ALTER TABLE intelligence_item_metric_snapshots ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE intelligence_item_metric_snapshots ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_item_metric_snapshots_user_group_idx ON intelligence_item_metric_snapshots(user_id,group_id);
--> statement-breakpoint
ALTER TABLE intelligence_item_transcripts ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE intelligence_item_transcripts ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_item_transcripts_user_group_idx ON intelligence_item_transcripts(user_id,group_id);
--> statement-breakpoint
ALTER TABLE execution_tasks ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE execution_tasks ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS execution_tasks_user_group_idx ON execution_tasks(user_id,group_id);
--> statement-breakpoint
ALTER TABLE intelligence_sync_runs ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE intelligence_sync_runs ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_sync_runs_user_group_idx ON intelligence_sync_runs(user_id,group_id);
--> statement-breakpoint
ALTER TABLE intelligence_sync_run_events ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE intelligence_sync_run_events ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_sync_run_events_user_group_idx ON intelligence_sync_run_events(user_id,group_id);
--> statement-breakpoint
ALTER TABLE intelligence_item_source_observations ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE intelligence_item_source_observations ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_item_source_observations_user_group_idx ON intelligence_item_source_observations(user_id,group_id);
--> statement-breakpoint
ALTER TABLE intelligence_source_snapshots ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE intelligence_source_snapshots ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_source_snapshots_user_group_idx ON intelligence_source_snapshots(user_id,group_id);
--> statement-breakpoint
ALTER TABLE intelligence_transforms ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE intelligence_transforms ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_transforms_user_group_idx ON intelligence_transforms(user_id,group_id);
--> statement-breakpoint
ALTER TABLE project_intelligence_references ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE project_intelligence_references ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS project_intelligence_references_user_group_idx ON project_intelligence_references(user_id,group_id);
--> statement-breakpoint
ALTER TABLE intelligence_migration_ledgers ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
ALTER TABLE intelligence_migration_ledgers ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_migration_ledgers_user_group_idx ON intelligence_migration_ledgers(user_id,group_id);
--> statement-breakpoint
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS group_version INTEGER;
--> statement-breakpoint
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS membership_version INTEGER;
--> statement-breakpoint
ALTER TABLE execution_tasks ADD COLUMN IF NOT EXISTS group_version INTEGER;
--> statement-breakpoint
ALTER TABLE execution_tasks ADD COLUMN IF NOT EXISTS membership_version INTEGER;
--> statement-breakpoint
ALTER TABLE scheduled_job ADD COLUMN IF NOT EXISTS group_version INTEGER;
--> statement-breakpoint
ALTER TABLE scheduled_job ADD COLUMN IF NOT EXISTS membership_version INTEGER;
--> statement-breakpoint
ALTER TABLE job_run ADD COLUMN IF NOT EXISTS group_version INTEGER;
--> statement-breakpoint
ALTER TABLE job_run ADD COLUMN IF NOT EXISTS membership_version INTEGER;
--> statement-breakpoint
ALTER TABLE job_run ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ai_tasks_group_attempt_identity ON ai_tasks(user_id,group_id,task_type,attempt_id) WHERE group_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS execution_tasks_group_idempotency ON execution_tasks(user_id,group_id,kind,idempotency_key) WHERE group_id IS NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS ux_intelligence_collection_sibling;
--> statement-breakpoint
CREATE UNIQUE INDEX ux_intelligence_collection_sibling ON intelligence_collections(user_id,account_id,parent_id,normalized_name) NULLS NOT DISTINCT WHERE group_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_collection_group_sibling ON intelligence_collections(user_id,group_id,parent_id,normalized_name) NULLS NOT DISTINCT WHERE group_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_source_group_identity ON intelligence_sources(user_id,group_id,type,external_key) WHERE group_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_source_group_membership ON intelligence_source_collection_memberships(user_id,group_id,source_id,collection_id) WHERE group_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_item_group_external ON intelligence_items(user_id,group_id,platform,type,external_id) WHERE group_id IS NOT NULL AND external_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_item_group_url ON intelligence_items(user_id,group_id,platform,type,canonical_url_hash) WHERE group_id IS NOT NULL AND external_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_transform_group_idempotency ON intelligence_transforms(user_id,group_id,idempotency_key) WHERE group_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_scheduled_job_group_daily_topic ON scheduled_job(user_id,group_id,source_kind) WHERE group_id IS NOT NULL AND source_kind='topic.daily';
--> statement-breakpoint
