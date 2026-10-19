-- T-1062: 原三份历史SQL不重放；本版本仅按核验后的物理catalog补齐结构。
--> statement-breakpoint
SELECT set_config('creatoros.first_group_upgrade', (to_regclass('public.account_groups') IS NULL)::text, true);
--> statement-breakpoint
SELECT set_config('creatoros.existing_group_tables',COALESCE((SELECT jsonb_agg(table_name)::text FROM information_schema.columns WHERE table_schema='public' AND column_name='group_id'),'[]'),true);
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS public."work_review_confirmations_ordinal_seq";
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS public."work_review_reports_ordinal_seq";
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS public."work_review_requests_ordinal_seq";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."account_group_commands" ("user_id" text NOT NULL, "idempotency_key" text NOT NULL, "kind" text NOT NULL, "input_hash" text NOT NULL, "result" jsonb NOT NULL, "created_at" text NOT NULL);
--> statement-breakpoint
ALTER TABLE public."account_group_commands" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_commands" ADD COLUMN IF NOT EXISTS "idempotency_key" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_commands" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_commands" ADD COLUMN IF NOT EXISTS "input_hash" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_commands" ADD COLUMN IF NOT EXISTS "result" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_commands" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."account_group_memberships" ("id" text NOT NULL, "user_id" text NOT NULL, "group_id" text NOT NULL, "platform_account_id" text NOT NULL, "version" integer DEFAULT 1 NOT NULL, "joined_at" text NOT NULL, "left_at" text);
--> statement-breakpoint
ALTER TABLE public."account_group_memberships" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_memberships" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_memberships" ADD COLUMN IF NOT EXISTS "group_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_memberships" ADD COLUMN IF NOT EXISTS "platform_account_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_memberships" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_memberships" ADD COLUMN IF NOT EXISTS "joined_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_memberships" ADD COLUMN IF NOT EXISTS "left_at" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."account_group_migrations" ("id" text NOT NULL, "user_id" text NOT NULL, "from_group_id" text NOT NULL, "to_group_id" text NOT NULL, "idempotency_key" text NOT NULL, "input_hash" text NOT NULL, "status" text NOT NULL, "before_image" jsonb NOT NULL, "after_digest" text NOT NULL, "created_at" text NOT NULL, "undone_at" text);
--> statement-breakpoint
ALTER TABLE public."account_group_migrations" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_migrations" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_migrations" ADD COLUMN IF NOT EXISTS "from_group_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_migrations" ADD COLUMN IF NOT EXISTS "to_group_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_migrations" ADD COLUMN IF NOT EXISTS "idempotency_key" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_migrations" ADD COLUMN IF NOT EXISTS "input_hash" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_migrations" ADD COLUMN IF NOT EXISTS "status" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_migrations" ADD COLUMN IF NOT EXISTS "before_image" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_migrations" ADD COLUMN IF NOT EXISTS "after_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_migrations" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_group_migrations" ADD COLUMN IF NOT EXISTS "undone_at" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."account_groups" ("id" text NOT NULL, "user_id" text NOT NULL, "name" text NOT NULL, "status" text DEFAULT 'active'::text NOT NULL, "version" integer DEFAULT 1 NOT NULL, "created_at" text NOT NULL, "updated_at" text NOT NULL);
--> statement-breakpoint
ALTER TABLE public."account_groups" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_groups" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_groups" ADD COLUMN IF NOT EXISTS "name" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_groups" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active'::text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_groups" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_groups" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_groups" ADD COLUMN IF NOT EXISTS "updated_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_skill_overlay_versions" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_skill_overlay_versions" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."account_skill_overlays" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_skill_overlays" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."ai_conversations" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."ai_conversations" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."ai_tasks" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."ai_tasks" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."ai_tasks" ADD COLUMN IF NOT EXISTS "group_version" integer;
--> statement-breakpoint
ALTER TABLE public."ai_tasks" ADD COLUMN IF NOT EXISTS "membership_version" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."article_anchors" ("output_id" text NOT NULL, "project_id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "artifact_id" text NOT NULL, "client_request_id" text, "created_at" text NOT NULL, "request_digest" text, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."article_anchors" ADD COLUMN IF NOT EXISTS "output_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_anchors" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_anchors" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_anchors" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."article_anchors" ADD COLUMN IF NOT EXISTS "artifact_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_anchors" ADD COLUMN IF NOT EXISTS "client_request_id" text;
--> statement-breakpoint
ALTER TABLE public."article_anchors" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_anchors" ADD COLUMN IF NOT EXISTS "request_digest" text;
--> statement-breakpoint
ALTER TABLE public."article_anchors" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."article_candidates" ("id" text NOT NULL, "project_id" text NOT NULL, "output_id" text NOT NULL, "artifact_id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "base_version_id" text NOT NULL, "method_version" text NOT NULL, "brand_profile_version_id" text, "client_request_id" text NOT NULL, "proposal" jsonb NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."article_candidates" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_candidates" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_candidates" ADD COLUMN IF NOT EXISTS "output_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_candidates" ADD COLUMN IF NOT EXISTS "artifact_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_candidates" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_candidates" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."article_candidates" ADD COLUMN IF NOT EXISTS "base_version_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_candidates" ADD COLUMN IF NOT EXISTS "method_version" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_candidates" ADD COLUMN IF NOT EXISTS "brand_profile_version_id" text;
--> statement-breakpoint
ALTER TABLE public."article_candidates" ADD COLUMN IF NOT EXISTS "client_request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_candidates" ADD COLUMN IF NOT EXISTS "proposal" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_candidates" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_candidates" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."article_text_candidates" ("id" text NOT NULL, "project_id" text NOT NULL, "output_id" text NOT NULL, "artifact_id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "base_version_id" text NOT NULL, "kind" text NOT NULL, "value" text NOT NULL, "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL, "rule_snapshot_ref" jsonb, "applied_rules" text NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."article_text_candidates" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_text_candidates" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_text_candidates" ADD COLUMN IF NOT EXISTS "output_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_text_candidates" ADD COLUMN IF NOT EXISTS "artifact_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_text_candidates" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_text_candidates" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."article_text_candidates" ADD COLUMN IF NOT EXISTS "base_version_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_text_candidates" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_text_candidates" ADD COLUMN IF NOT EXISTS "value" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_text_candidates" ADD COLUMN IF NOT EXISTS "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_text_candidates" ADD COLUMN IF NOT EXISTS "rule_snapshot_ref" jsonb;
--> statement-breakpoint
ALTER TABLE public."article_text_candidates" ADD COLUMN IF NOT EXISTS "applied_rules" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_text_candidates" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_text_candidates" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."artifacts" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."artifacts" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."asset_tag_adoptions" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."asset_tag_adoptions" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."asset_uploads" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."asset_uploads" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."assets" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."assets" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."audience_signals" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."audience_snapshots" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."benchmark_sources" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."benchmark_sources" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."benchmark_works" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."benchmark_works" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."calibration_results" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."calibration_results" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."calibration_rule_suggestions" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."calibration_rule_suggestions" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."candidates" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."candidates" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."canvas_agent_proposals" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "canvas_id" text NOT NULL, "base_revision" integer NOT NULL, "operations_json" jsonb NOT NULL, "status" text NOT NULL, "applied_revision" integer, "applied_canvas_json" jsonb, "created_at" text NOT NULL, "expires_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."canvas_agent_proposals" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_agent_proposals" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_agent_proposals" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."canvas_agent_proposals" ADD COLUMN IF NOT EXISTS "canvas_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_agent_proposals" ADD COLUMN IF NOT EXISTS "base_revision" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_agent_proposals" ADD COLUMN IF NOT EXISTS "operations_json" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_agent_proposals" ADD COLUMN IF NOT EXISTS "status" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_agent_proposals" ADD COLUMN IF NOT EXISTS "applied_revision" integer;
--> statement-breakpoint
ALTER TABLE public."canvas_agent_proposals" ADD COLUMN IF NOT EXISTS "applied_canvas_json" jsonb;
--> statement-breakpoint
ALTER TABLE public."canvas_agent_proposals" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_agent_proposals" ADD COLUMN IF NOT EXISTS "expires_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_agent_proposals" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."canvas_generation_links" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "canvas_id" text NOT NULL, "node_id" text NOT NULL, "attempt_id" text NOT NULL, "task_id" text, "input_revision" integer NOT NULL, "input_digest" text NOT NULL, "input_json" jsonb NOT NULL, "reference_file_id" text, "reference_checksum" text, "result_asset_id" text, "created_at" text NOT NULL, "updated_at" text NOT NULL, "group_id" text, "group_version" integer, "membership_version" integer);
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "canvas_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "node_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "attempt_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "task_id" text;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "input_revision" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "input_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "input_json" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "reference_file_id" text;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "reference_checksum" text;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "result_asset_id" text;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "updated_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "group_version" integer;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ADD COLUMN IF NOT EXISTS "membership_version" integer;
--> statement-breakpoint
ALTER TABLE public."content_calendar_entries" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."content_calendar_entries" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."content_calendar_entries" ADD COLUMN IF NOT EXISTS "membership_version" integer;
--> statement-breakpoint
ALTER TABLE public."content_outputs" ADD COLUMN IF NOT EXISTS "target_platform" text;
--> statement-breakpoint
ALTER TABLE public."content_outputs" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."creative_canvases" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "title" text NOT NULL, "project_id" text, "document_json" jsonb NOT NULL, "revision" integer DEFAULT 1 NOT NULL, "created_at" text NOT NULL, "updated_at" text NOT NULL, "archived_at" text, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."creative_canvases" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_canvases" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_canvases" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."creative_canvases" ADD COLUMN IF NOT EXISTS "title" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_canvases" ADD COLUMN IF NOT EXISTS "project_id" text;
--> statement-breakpoint
ALTER TABLE public."creative_canvases" ADD COLUMN IF NOT EXISTS "document_json" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_canvases" ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_canvases" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_canvases" ADD COLUMN IF NOT EXISTS "updated_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_canvases" ADD COLUMN IF NOT EXISTS "archived_at" text;
--> statement-breakpoint
ALTER TABLE public."creative_canvases" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."creative_result_bundles" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "project_id" text NOT NULL, "output_id" text, "items" jsonb NOT NULL, "request_digest" text NOT NULL, "client_request_id" text NOT NULL, "created_at" text NOT NULL, "conversion_context" jsonb, "target_creation_key" text, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."creative_result_bundles" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_result_bundles" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_result_bundles" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."creative_result_bundles" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_result_bundles" ADD COLUMN IF NOT EXISTS "output_id" text;
--> statement-breakpoint
ALTER TABLE public."creative_result_bundles" ADD COLUMN IF NOT EXISTS "items" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_result_bundles" ADD COLUMN IF NOT EXISTS "request_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_result_bundles" ADD COLUMN IF NOT EXISTS "client_request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_result_bundles" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_result_bundles" ADD COLUMN IF NOT EXISTS "conversion_context" jsonb;
--> statement-breakpoint
ALTER TABLE public."creative_result_bundles" ADD COLUMN IF NOT EXISTS "target_creation_key" text;
--> statement-breakpoint
ALTER TABLE public."creative_result_bundles" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."creative_results" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "project_id" text NOT NULL, "output_id" text NOT NULL, "output_type" text NOT NULL, "target_platform" text, "kind" text NOT NULL, "owner" text NOT NULL, "candidate_id" text, "task_id" text, "base_version_id" text, "rule_snapshot_ref" text, "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL, "applied_rules" text DEFAULT 'not_applied'::text NOT NULL, "request_digest" text NOT NULL, "client_request_id" text NOT NULL, "status" text DEFAULT 'queued'::text NOT NULL, "error_code" text, "adoption_receipt" jsonb, "adoption_digest" text, "retry_of" text, "bundle_id" text, "created_at" text NOT NULL, "updated_at" text NOT NULL, "target_section_id" text, "conversion_context" jsonb, "adoption_client_request_id" text, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "output_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "output_type" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "target_platform" text;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "owner" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "candidate_id" text;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "task_id" text;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "base_version_id" text;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "rule_snapshot_ref" text;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "applied_rules" text DEFAULT 'not_applied'::text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "request_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "client_request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'queued'::text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "error_code" text;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "adoption_receipt" jsonb;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "adoption_digest" text;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "retry_of" text;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "bundle_id" text;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "updated_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "target_section_id" text;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "conversion_context" jsonb;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "adoption_client_request_id" text;
--> statement-breakpoint
ALTER TABLE public."creative_results" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."creator_profiles" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creator_profiles" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."execution_control_receipts" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "idempotency_key" text NOT NULL, "request_digest" text NOT NULL, "result" jsonb NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."execution_control_receipts" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."execution_control_receipts" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."execution_control_receipts" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."execution_control_receipts" ADD COLUMN IF NOT EXISTS "idempotency_key" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."execution_control_receipts" ADD COLUMN IF NOT EXISTS "request_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."execution_control_receipts" ADD COLUMN IF NOT EXISTS "result" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."execution_control_receipts" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."execution_control_receipts" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."execution_tasks" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."execution_tasks" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."execution_tasks" ADD COLUMN IF NOT EXISTS "group_version" integer;
--> statement-breakpoint
ALTER TABLE public."execution_tasks" ADD COLUMN IF NOT EXISTS "membership_version" integer;
--> statement-breakpoint
ALTER TABLE public."export_records" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."external_sources" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."external_sources" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."favorites_folders" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."favorites_items" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."graphic_post_anchors" ("output_id" text NOT NULL, "project_id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "artifact_id" text NOT NULL, "client_request_id" text NOT NULL, "request_digest" text NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."graphic_post_anchors" ADD COLUMN IF NOT EXISTS "output_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_anchors" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_anchors" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_anchors" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."graphic_post_anchors" ADD COLUMN IF NOT EXISTS "artifact_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_anchors" ADD COLUMN IF NOT EXISTS "client_request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_anchors" ADD COLUMN IF NOT EXISTS "request_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_anchors" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_anchors" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."graphic_post_text_candidates" ("id" text NOT NULL, "output_id" text NOT NULL, "project_id" text NOT NULL, "artifact_id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "base_version_id" text NOT NULL, "kind" text NOT NULL, "value" jsonb NOT NULL, "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL, "rule_snapshot_ref" jsonb, "applied_rules" text NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."graphic_post_text_candidates" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_text_candidates" ADD COLUMN IF NOT EXISTS "output_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_text_candidates" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_text_candidates" ADD COLUMN IF NOT EXISTS "artifact_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_text_candidates" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_text_candidates" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."graphic_post_text_candidates" ADD COLUMN IF NOT EXISTS "base_version_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_text_candidates" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_text_candidates" ADD COLUMN IF NOT EXISTS "value" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_text_candidates" ADD COLUMN IF NOT EXISTS "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_text_candidates" ADD COLUMN IF NOT EXISTS "rule_snapshot_ref" jsonb;
--> statement-breakpoint
ALTER TABLE public."graphic_post_text_candidates" ADD COLUMN IF NOT EXISTS "applied_rules" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_text_candidates" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_text_candidates" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."group_onboarding_states" ("user_id" text NOT NULL, "group_id" text NOT NULL, "origin" text, "hidden" boolean DEFAULT false NOT NULL, "collapsed" boolean DEFAULT true NOT NULL, "completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL, "updated_at" text NOT NULL);
--> statement-breakpoint
ALTER TABLE public."group_onboarding_states" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."group_onboarding_states" ADD COLUMN IF NOT EXISTS "group_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."group_onboarding_states" ADD COLUMN IF NOT EXISTS "origin" text;
--> statement-breakpoint
ALTER TABLE public."group_onboarding_states" ADD COLUMN IF NOT EXISTS "hidden" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE public."group_onboarding_states" ADD COLUMN IF NOT EXISTS "collapsed" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE public."group_onboarding_states" ADD COLUMN IF NOT EXISTS "completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."group_onboarding_states" ADD COLUMN IF NOT EXISTS "updated_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."ingestion_runs" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."ingestion_runs" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."ingestion_runs" ADD COLUMN IF NOT EXISTS "group_version" integer;
--> statement-breakpoint
ALTER TABLE public."ingestion_runs" ADD COLUMN IF NOT EXISTS "membership_version" integer;
--> statement-breakpoint
ALTER TABLE public."intelligence_collections" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_collections" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."intelligence_item_metric_snapshots" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_item_metric_snapshots" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."intelligence_item_source_observations" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_item_source_observations" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."intelligence_item_transcripts" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_item_transcripts" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."intelligence_items" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_items" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."intelligence_migration_ledgers" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_migration_ledgers" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."intelligence_source_collection_memberships" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_source_collection_memberships" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."intelligence_source_snapshots" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_source_snapshots" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."intelligence_sources" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_sources" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."intelligence_sync_run_events" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_sync_run_events" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."intelligence_sync_runs" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_sync_runs" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."intelligence_transforms" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_transforms" ALTER COLUMN "positioning_version_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_transforms" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."job_run" ADD COLUMN IF NOT EXISTS "group_version" integer;
--> statement-breakpoint
ALTER TABLE public."job_run" ADD COLUMN IF NOT EXISTS "membership_version" integer;
--> statement-breakpoint
ALTER TABLE public."job_run" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."knowledge_adoptions" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."knowledge_adoptions" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."knowledge_folders" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."knowledge_folders" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."knowledge_items" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."knowledge_items" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."learning_applications" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."learning_applications" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."learnings" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."learnings" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."material_links" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."material_links" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."metric_snapshots" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."metric_snapshots" ADD COLUMN IF NOT EXISTS "native_platform" text;
--> statement-breakpoint
ALTER TABLE public."metric_values" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."moments_anchors" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "project_id" text NOT NULL, "artifact_id" text NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."moments_anchors" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_anchors" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_anchors" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."moments_anchors" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_anchors" ADD COLUMN IF NOT EXISTS "artifact_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_anchors" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_anchors" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."moments_candidates" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "moments_id" text NOT NULL, "root_id" text NOT NULL, "record" jsonb NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."moments_candidates" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_candidates" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_candidates" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."moments_candidates" ADD COLUMN IF NOT EXISTS "moments_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_candidates" ADD COLUMN IF NOT EXISTS "root_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_candidates" ADD COLUMN IF NOT EXISTS "record" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_candidates" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."moments_requests" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "request_id" text NOT NULL, "request_digest" text NOT NULL, "operation" text NOT NULL, "params" jsonb, "input" jsonb NOT NULL, "target_id" text, "version_id" text, "status" text NOT NULL, "error_code" text, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."moments_requests" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_requests" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_requests" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."moments_requests" ADD COLUMN IF NOT EXISTS "request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_requests" ADD COLUMN IF NOT EXISTS "request_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_requests" ADD COLUMN IF NOT EXISTS "operation" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_requests" ADD COLUMN IF NOT EXISTS "params" jsonb;
--> statement-breakpoint
ALTER TABLE public."moments_requests" ADD COLUMN IF NOT EXISTS "input" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_requests" ADD COLUMN IF NOT EXISTS "target_id" text;
--> statement-breakpoint
ALTER TABLE public."moments_requests" ADD COLUMN IF NOT EXISTS "version_id" text;
--> statement-breakpoint
ALTER TABLE public."moments_requests" ADD COLUMN IF NOT EXISTS "status" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_requests" ADD COLUMN IF NOT EXISTS "error_code" text;
--> statement-breakpoint
ALTER TABLE public."moments_requests" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_requests" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."output_create_requests" ("user_id" text NOT NULL, "account_id" text, "client_request_id" text NOT NULL, "request_digest" text NOT NULL, "project_id" text NOT NULL, "output_id" text NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."output_create_requests" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_create_requests" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."output_create_requests" ADD COLUMN IF NOT EXISTS "client_request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_create_requests" ADD COLUMN IF NOT EXISTS "request_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_create_requests" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_create_requests" ADD COLUMN IF NOT EXISTS "output_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_create_requests" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_create_requests" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."output_media_attempts" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "project_id" text NOT NULL, "output_id" text NOT NULL, "kind" text NOT NULL, "task_id" text NOT NULL, "candidate_id" text, "asset_id" text, "asset_file_id" text, "client_request_id" text NOT NULL, "request_digest" text NOT NULL, "created_at" text NOT NULL, "group_id" text, "group_version" integer, "membership_version" integer);
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "output_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "task_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "candidate_id" text;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "asset_id" text;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "asset_file_id" text;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "client_request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "request_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "group_version" integer;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ADD COLUMN IF NOT EXISTS "membership_version" integer;
--> statement-breakpoint
ALTER TABLE public."pending_document_commits" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."pending_document_commits" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."pending_generated_asset_commits" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."pending_generated_asset_commits" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."platform_account_metric_snapshots" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text NOT NULL, "platform" text NOT NULL, "metric_key" text NOT NULL, "value" double precision, "availability" text NOT NULL, "unit" text NOT NULL, "metric_window" jsonb NOT NULL, "window_key" text NOT NULL, "source" text NOT NULL, "source_snapshot_key" text, "source_snapshot_key_index" text NOT NULL, "captured_at" text NOT NULL, "observed_at" text NOT NULL, "ingested_at" text NOT NULL);
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "account_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "metric_key" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "value" double precision;
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "availability" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "unit" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "metric_window" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "window_key" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "source" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "source_snapshot_key" text;
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "source_snapshot_key_index" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "captured_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "observed_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_account_metric_snapshots" ADD COLUMN IF NOT EXISTS "ingested_at" text NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."platform_bind_attempts" ("id" text NOT NULL, "user_id" text NOT NULL, "platform" text NOT NULL, "client_request_id" text NOT NULL, "status" text NOT NULL, "platform_identity" text, "proof_source" text, "scopes" jsonb, "proof_verified_at" text, "proof_expires_at" text, "account_id" text, "cleanup_pending_at" text, "expires_at" text NOT NULL, "created_at" text NOT NULL, "updated_at" text NOT NULL);
--> statement-breakpoint
ALTER TABLE public."platform_bind_attempts" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_bind_attempts" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_bind_attempts" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_bind_attempts" ADD COLUMN IF NOT EXISTS "client_request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_bind_attempts" ADD COLUMN IF NOT EXISTS "status" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_bind_attempts" ADD COLUMN IF NOT EXISTS "platform_identity" text;
--> statement-breakpoint
ALTER TABLE public."platform_bind_attempts" ADD COLUMN IF NOT EXISTS "proof_source" text;
--> statement-breakpoint
ALTER TABLE public."platform_bind_attempts" ADD COLUMN IF NOT EXISTS "scopes" jsonb;
--> statement-breakpoint
ALTER TABLE public."platform_bind_attempts" ADD COLUMN IF NOT EXISTS "proof_verified_at" text;
--> statement-breakpoint
ALTER TABLE public."platform_bind_attempts" ADD COLUMN IF NOT EXISTS "proof_expires_at" text;
--> statement-breakpoint
ALTER TABLE public."platform_bind_attempts" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."platform_bind_attempts" ADD COLUMN IF NOT EXISTS "cleanup_pending_at" text;
--> statement-breakpoint
ALTER TABLE public."platform_bind_attempts" ADD COLUMN IF NOT EXISTS "expires_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_bind_attempts" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_bind_attempts" ADD COLUMN IF NOT EXISTS "updated_at" text NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."platform_catalogs" ("account_id" text NOT NULL, "user_id" text NOT NULL, "platform" text NOT NULL, "generation" integer DEFAULT 0 NOT NULL, "completed_at" text, "work_count" integer DEFAULT 0 NOT NULL);
--> statement-breakpoint
ALTER TABLE public."platform_catalogs" ADD COLUMN IF NOT EXISTS "account_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_catalogs" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_catalogs" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_catalogs" ADD COLUMN IF NOT EXISTS "generation" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_catalogs" ADD COLUMN IF NOT EXISTS "completed_at" text;
--> statement-breakpoint
ALTER TABLE public."platform_catalogs" ADD COLUMN IF NOT EXISTS "work_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."platform_collection_bindings" ("account_id" text NOT NULL, "user_id" text NOT NULL, "platform" text NOT NULL, "platform_identity" text NOT NULL, "scopes" jsonb NOT NULL, "proof_source" text NOT NULL, "verified_at" text NOT NULL, "expires_at" text, "revoked_at" text);
--> statement-breakpoint
ALTER TABLE public."platform_collection_bindings" ADD COLUMN IF NOT EXISTS "account_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_bindings" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_bindings" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_bindings" ADD COLUMN IF NOT EXISTS "platform_identity" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_bindings" ADD COLUMN IF NOT EXISTS "scopes" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_bindings" ADD COLUMN IF NOT EXISTS "proof_source" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_bindings" ADD COLUMN IF NOT EXISTS "verified_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_bindings" ADD COLUMN IF NOT EXISTS "expires_at" text;
--> statement-breakpoint
ALTER TABLE public."platform_collection_bindings" ADD COLUMN IF NOT EXISTS "revoked_at" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."platform_collection_migration_conflicts" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "platform" text NOT NULL, "external_id" text, "publication_id" text NOT NULL, "reason_code" text NOT NULL, "detected_at" text NOT NULL);
--> statement-breakpoint
ALTER TABLE public."platform_collection_migration_conflicts" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_migration_conflicts" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_migration_conflicts" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."platform_collection_migration_conflicts" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_migration_conflicts" ADD COLUMN IF NOT EXISTS "external_id" text;
--> statement-breakpoint
ALTER TABLE public."platform_collection_migration_conflicts" ADD COLUMN IF NOT EXISTS "publication_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_migration_conflicts" ADD COLUMN IF NOT EXISTS "reason_code" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_migration_conflicts" ADD COLUMN IF NOT EXISTS "detected_at" text NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."platform_collection_pages" ("id" text NOT NULL, "run_id" text NOT NULL, "generation" integer NOT NULL, "scan_pass" integer NOT NULL, "page_index" integer NOT NULL, "request_cursor" text, "next_cursor" text, "source_snapshot_key" text, "page_digest" text NOT NULL, "platform_reported_total" integer, "total_source" text, "total_observed_at" text, "terminal_evidence" jsonb, "payload_digest" text NOT NULL, "has_more" integer NOT NULL, "record_ids" jsonb NOT NULL, "works" jsonb NOT NULL, "metrics" jsonb NOT NULL, "observed_at" text NOT NULL, "created_at" text NOT NULL);
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "run_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "generation" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "scan_pass" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "page_index" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "request_cursor" text;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "next_cursor" text;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "source_snapshot_key" text;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "page_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "platform_reported_total" integer;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "total_source" text;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "total_observed_at" text;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "terminal_evidence" jsonb;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "payload_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "has_more" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "record_ids" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "works" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "metrics" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "observed_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_pages" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."platform_collection_runs" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text NOT NULL, "platform" text NOT NULL, "platform_identity" text NOT NULL, "capability" text NOT NULL, "client_request_id" text NOT NULL, "status" text NOT NULL, "generation" integer NOT NULL, "lease_token" text, "lease_expires_at" text, "source_snapshot_key" text, "committed_pages" integer DEFAULT 0 NOT NULL, "complete_catalog_generation" integer, "reason_code" text, "started_at" text NOT NULL, "updated_at" text NOT NULL);
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "account_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "platform_identity" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "capability" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "client_request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "status" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "generation" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "lease_token" text;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "lease_expires_at" text;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "source_snapshot_key" text;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "committed_pages" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "complete_catalog_generation" integer;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "reason_code" text;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "started_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_collection_runs" ADD COLUMN IF NOT EXISTS "updated_at" text NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."platform_visibility_tombstones" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text NOT NULL, "platform" text NOT NULL, "external_id" text NOT NULL, "visibility" text NOT NULL, "source" text NOT NULL, "source_priority" integer NOT NULL, "observed_at" text NOT NULL, "created_at" text NOT NULL);
--> statement-breakpoint
ALTER TABLE public."platform_visibility_tombstones" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_visibility_tombstones" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_visibility_tombstones" ADD COLUMN IF NOT EXISTS "account_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_visibility_tombstones" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_visibility_tombstones" ADD COLUMN IF NOT EXISTS "external_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_visibility_tombstones" ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_visibility_tombstones" ADD COLUMN IF NOT EXISTS "source" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_visibility_tombstones" ADD COLUMN IF NOT EXISTS "source_priority" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_visibility_tombstones" ADD COLUMN IF NOT EXISTS "observed_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_visibility_tombstones" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."platform_work_metric_snapshots" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text NOT NULL, "platform" text NOT NULL, "metric_key" text NOT NULL, "value" double precision, "availability" text NOT NULL, "unit" text NOT NULL, "metric_window" jsonb NOT NULL, "window_key" text NOT NULL, "source" text NOT NULL, "source_snapshot_key" text, "source_snapshot_key_index" text NOT NULL, "captured_at" text NOT NULL, "observed_at" text NOT NULL, "ingested_at" text NOT NULL, "platform_work_id" text NOT NULL);
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "account_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "metric_key" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "value" double precision;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "availability" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "unit" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "metric_window" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "window_key" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "source" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "source_snapshot_key" text;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "source_snapshot_key_index" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "captured_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "observed_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "ingested_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_work_metric_snapshots" ADD COLUMN IF NOT EXISTS "platform_work_id" text NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."platform_works" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text NOT NULL, "platform" text NOT NULL, "external_id" text NOT NULL, "kind" text NOT NULL, "published_at" text, "visibility" text NOT NULL, "visibility_source" text NOT NULL, "visibility_priority" integer NOT NULL, "visibility_observed_at" text NOT NULL, "source" text NOT NULL, "observed_at" text NOT NULL, "ingested_at" text NOT NULL, "catalog_generation" integer NOT NULL, "publication_id" text, "legacy_project_id" text, "legacy_publication_id" text, "outbound_frozen_at" text, "uncertain_visibility_at" text, "title" text);
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "account_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "external_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "published_at" text;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "visibility_source" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "visibility_priority" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "visibility_observed_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "source" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "observed_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "ingested_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "catalog_generation" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "publication_id" text;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "legacy_project_id" text;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "legacy_publication_id" text;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "outbound_frozen_at" text;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "uncertain_visibility_at" text;
--> statement-breakpoint
ALTER TABLE public."platform_works" ADD COLUMN IF NOT EXISTS "title" text;
--> statement-breakpoint
ALTER TABLE public."positioning_discovery_sessions" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."positioning_discovery_sessions" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."positioning_statements" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."positioning_statements" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."predictions" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."predictions" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."production_edit_versions" ("id" text NOT NULL, "user_id" text NOT NULL, "production_id" text NOT NULL, "revision" integer NOT NULL, "request_id" text, "request_digest" text, "plan_digest" text NOT NULL, "source" text NOT NULL, "plan" jsonb NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."production_edit_versions" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_edit_versions" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_edit_versions" ADD COLUMN IF NOT EXISTS "production_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_edit_versions" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_edit_versions" ADD COLUMN IF NOT EXISTS "request_id" text;
--> statement-breakpoint
ALTER TABLE public."production_edit_versions" ADD COLUMN IF NOT EXISTS "request_digest" text;
--> statement-breakpoint
ALTER TABLE public."production_edit_versions" ADD COLUMN IF NOT EXISTS "plan_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_edit_versions" ADD COLUMN IF NOT EXISTS "source" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_edit_versions" ADD COLUMN IF NOT EXISTS "plan" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_edit_versions" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_edit_versions" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."production_editor_file_binding_requests" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "output_id" text NOT NULL, "request_id" text NOT NULL, "request_digest" text NOT NULL, "production_id" text NOT NULL, "revision" integer NOT NULL, "plan_digest" text NOT NULL, "source_commit_request_id" text NOT NULL, "source_commit_digest" text NOT NULL, "frozen_input" jsonb NOT NULL, "status" text NOT NULL, "created_at" text NOT NULL, "group_id" text, "group_version" integer, "membership_version" integer);
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "output_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "request_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "production_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "plan_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "source_commit_request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "source_commit_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "frozen_input" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "status" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "group_version" integer;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ADD COLUMN IF NOT EXISTS "membership_version" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."production_editor_file_bindings" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "output_id" text NOT NULL, "production_id" text NOT NULL, "revision" integer NOT NULL, "plan_digest" text NOT NULL, "location" text NOT NULL, "reference" text NOT NULL, "asset_id" text NOT NULL, "asset_file_id" text NOT NULL, "file_digest" text NOT NULL, "binding_request_id" text NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ADD COLUMN IF NOT EXISTS "output_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ADD COLUMN IF NOT EXISTS "production_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ADD COLUMN IF NOT EXISTS "plan_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ADD COLUMN IF NOT EXISTS "location" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ADD COLUMN IF NOT EXISTS "reference" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ADD COLUMN IF NOT EXISTS "asset_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ADD COLUMN IF NOT EXISTS "asset_file_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ADD COLUMN IF NOT EXISTS "file_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ADD COLUMN IF NOT EXISTS "binding_request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."production_media_requests" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "output_id" text NOT NULL, "request_id" text NOT NULL, "request_digest" text NOT NULL, "kind" text NOT NULL, "frozen_input" jsonb NOT NULL, "task_id" text, "created_at" text NOT NULL, "group_id" text, "group_version" integer, "membership_version" integer);
--> statement-breakpoint
ALTER TABLE public."production_media_requests" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_media_requests" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_media_requests" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."production_media_requests" ADD COLUMN IF NOT EXISTS "output_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_media_requests" ADD COLUMN IF NOT EXISTS "request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_media_requests" ADD COLUMN IF NOT EXISTS "request_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_media_requests" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_media_requests" ADD COLUMN IF NOT EXISTS "frozen_input" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_media_requests" ADD COLUMN IF NOT EXISTS "task_id" text;
--> statement-breakpoint
ALTER TABLE public."production_media_requests" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_media_requests" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."production_media_requests" ADD COLUMN IF NOT EXISTS "group_version" integer;
--> statement-breakpoint
ALTER TABLE public."production_media_requests" ADD COLUMN IF NOT EXISTS "membership_version" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."production_render_requests" ("id" text NOT NULL, "user_id" text NOT NULL, "production_id" text NOT NULL, "request_id" text NOT NULL, "request_digest" text NOT NULL, "revision" integer NOT NULL, "spec" jsonb NOT NULL, "attempt_id" text NOT NULL, "task_id" text, "asset_id" text, "created_at" text NOT NULL, "group_id" text, "group_version" integer, "membership_version" integer);
--> statement-breakpoint
ALTER TABLE public."production_render_requests" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_render_requests" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_render_requests" ADD COLUMN IF NOT EXISTS "production_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_render_requests" ADD COLUMN IF NOT EXISTS "request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_render_requests" ADD COLUMN IF NOT EXISTS "request_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_render_requests" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_render_requests" ADD COLUMN IF NOT EXISTS "spec" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_render_requests" ADD COLUMN IF NOT EXISTS "attempt_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_render_requests" ADD COLUMN IF NOT EXISTS "task_id" text;
--> statement-breakpoint
ALTER TABLE public."production_render_requests" ADD COLUMN IF NOT EXISTS "asset_id" text;
--> statement-breakpoint
ALTER TABLE public."production_render_requests" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_render_requests" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."production_render_requests" ADD COLUMN IF NOT EXISTS "group_version" integer;
--> statement-breakpoint
ALTER TABLE public."production_render_requests" ADD COLUMN IF NOT EXISTS "membership_version" integer;
--> statement-breakpoint
ALTER TABLE public."production_segments" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."productions" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."project_intelligence_references" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."project_intelligence_references" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."project_transcription_requests" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."project_transcription_requests" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."projects" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."projects" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."publication_cover_requests" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "output_id" text NOT NULL, "publication_id" text NOT NULL, "client_request_id" text NOT NULL, "request_digest" text NOT NULL, "input_json" jsonb NOT NULL, "status" text NOT NULL, "result_revision_id" text, "result_json" jsonb, "created_at" text NOT NULL, "committed_at" text, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."publication_cover_requests" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_cover_requests" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_cover_requests" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."publication_cover_requests" ADD COLUMN IF NOT EXISTS "output_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_cover_requests" ADD COLUMN IF NOT EXISTS "publication_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_cover_requests" ADD COLUMN IF NOT EXISTS "client_request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_cover_requests" ADD COLUMN IF NOT EXISTS "request_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_cover_requests" ADD COLUMN IF NOT EXISTS "input_json" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_cover_requests" ADD COLUMN IF NOT EXISTS "status" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_cover_requests" ADD COLUMN IF NOT EXISTS "result_revision_id" text;
--> statement-breakpoint
ALTER TABLE public."publication_cover_requests" ADD COLUMN IF NOT EXISTS "result_json" jsonb;
--> statement-breakpoint
ALTER TABLE public."publication_cover_requests" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_cover_requests" ADD COLUMN IF NOT EXISTS "committed_at" text;
--> statement-breakpoint
ALTER TABLE public."publication_cover_requests" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."publication_result_adoptions" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "client_request_id" text NOT NULL, "request_digest" text NOT NULL, "candidate_id" text NOT NULL, "publication_id" text NOT NULL, "revision_id" text NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."publication_result_adoptions" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_result_adoptions" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_result_adoptions" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."publication_result_adoptions" ADD COLUMN IF NOT EXISTS "client_request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_result_adoptions" ADD COLUMN IF NOT EXISTS "request_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_result_adoptions" ADD COLUMN IF NOT EXISTS "candidate_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_result_adoptions" ADD COLUMN IF NOT EXISTS "publication_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_result_adoptions" ADD COLUMN IF NOT EXISTS "revision_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_result_adoptions" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_result_adoptions" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."publication_result_anchors" ("user_id" text NOT NULL, "account_id" text, "output_id" text NOT NULL, "platform" text NOT NULL, "publication_id" text NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."publication_result_anchors" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_result_anchors" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."publication_result_anchors" ADD COLUMN IF NOT EXISTS "output_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_result_anchors" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_result_anchors" ADD COLUMN IF NOT EXISTS "publication_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_result_anchors" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_result_anchors" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."publication_revisions" ADD COLUMN IF NOT EXISTS "cover_asset_file_id" text;
--> statement-breakpoint
ALTER TABLE public."publication_revisions" ADD COLUMN IF NOT EXISTS "visual_adoption_key" text;
--> statement-breakpoint
ALTER TABLE public."publication_revisions" ADD COLUMN IF NOT EXISTS "visual_adoption_digest" text;
--> statement-breakpoint
ALTER TABLE public."publication_sync_state" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."publication_text_candidates" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "project_id" text NOT NULL, "output_id" text NOT NULL, "platform" text NOT NULL, "kind" text NOT NULL, "value" jsonb NOT NULL, "publication_id" text, "base_revision_id" text, "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL, "rule_snapshot_ref" jsonb, "applied_rules" text NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ADD COLUMN IF NOT EXISTS "output_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ADD COLUMN IF NOT EXISTS "value" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ADD COLUMN IF NOT EXISTS "publication_id" text;
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ADD COLUMN IF NOT EXISTS "base_revision_id" text;
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ADD COLUMN IF NOT EXISTS "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ADD COLUMN IF NOT EXISTS "rule_snapshot_ref" jsonb;
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ADD COLUMN IF NOT EXISTS "applied_rules" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."publication_traffic" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."publications" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."publications" ADD COLUMN IF NOT EXISTS "group_version" integer;
--> statement-breakpoint
ALTER TABLE public."publications" ADD COLUMN IF NOT EXISTS "membership_version" integer;
--> statement-breakpoint
ALTER TABLE public."publishing_cadences" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publishing_cadences" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."reporting_consent_changes" ("user_id" text NOT NULL, "change_id" text NOT NULL, "scope" text NOT NULL, "account_id" text DEFAULT ''::text NOT NULL, "enabled" boolean NOT NULL, "changed_at" text NOT NULL);
--> statement-breakpoint
ALTER TABLE public."reporting_consent_changes" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_consent_changes" ADD COLUMN IF NOT EXISTS "change_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_consent_changes" ADD COLUMN IF NOT EXISTS "scope" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_consent_changes" ADD COLUMN IF NOT EXISTS "account_id" text DEFAULT ''::text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_consent_changes" ADD COLUMN IF NOT EXISTS "enabled" boolean NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_consent_changes" ADD COLUMN IF NOT EXISTS "changed_at" text NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."reporting_consents" ("user_id" text NOT NULL, "scope" text NOT NULL, "account_id" text DEFAULT ''::text NOT NULL, "enabled" boolean DEFAULT false NOT NULL, "consent_version" integer NOT NULL, "consent_epoch" integer DEFAULT 0 NOT NULL, "account_alias" text, "changed_at" text NOT NULL);
--> statement-breakpoint
ALTER TABLE public."reporting_consents" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_consents" ADD COLUMN IF NOT EXISTS "scope" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_consents" ADD COLUMN IF NOT EXISTS "account_id" text DEFAULT ''::text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_consents" ADD COLUMN IF NOT EXISTS "enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_consents" ADD COLUMN IF NOT EXISTS "consent_version" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_consents" ADD COLUMN IF NOT EXISTS "consent_epoch" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_consents" ADD COLUMN IF NOT EXISTS "account_alias" text;
--> statement-breakpoint
ALTER TABLE public."reporting_consents" ADD COLUMN IF NOT EXISTS "changed_at" text NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."reporting_outbox" ("event_id" text NOT NULL, "user_id" text NOT NULL, "scope" text NOT NULL, "account_id" text DEFAULT ''::text NOT NULL, "work_alias" text, "consent_epoch" integer NOT NULL, "encrypted_payload" text NOT NULL, "created_at" text NOT NULL, "expires_at" text NOT NULL);
--> statement-breakpoint
ALTER TABLE public."reporting_outbox" ADD COLUMN IF NOT EXISTS "event_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_outbox" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_outbox" ADD COLUMN IF NOT EXISTS "scope" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_outbox" ADD COLUMN IF NOT EXISTS "account_id" text DEFAULT ''::text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_outbox" ADD COLUMN IF NOT EXISTS "work_alias" text;
--> statement-breakpoint
ALTER TABLE public."reporting_outbox" ADD COLUMN IF NOT EXISTS "consent_epoch" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_outbox" ADD COLUMN IF NOT EXISTS "encrypted_payload" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_outbox" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reporting_outbox" ADD COLUMN IF NOT EXISTS "expires_at" text NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."resource_access_grant_uses" ("id" text NOT NULL, "user_id" text NOT NULL, "grant_id" text NOT NULL, "consumer_type" text NOT NULL, "consumer_id" text NOT NULL, "created_at" text NOT NULL);
--> statement-breakpoint
ALTER TABLE public."resource_access_grant_uses" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."resource_access_grant_uses" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."resource_access_grant_uses" ADD COLUMN IF NOT EXISTS "grant_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."resource_access_grant_uses" ADD COLUMN IF NOT EXISTS "consumer_type" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."resource_access_grant_uses" ADD COLUMN IF NOT EXISTS "consumer_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."resource_access_grant_uses" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."resource_access_grants" ("id" text NOT NULL, "user_id" text NOT NULL, "target_group_id" text NOT NULL, "resource_type" text NOT NULL, "resource_id" text NOT NULL, "origin_group_id" text NOT NULL, "migration_id" text NOT NULL, "created_at" text NOT NULL, "revoked_at" text);
--> statement-breakpoint
ALTER TABLE public."resource_access_grants" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."resource_access_grants" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."resource_access_grants" ADD COLUMN IF NOT EXISTS "target_group_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."resource_access_grants" ADD COLUMN IF NOT EXISTS "resource_type" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."resource_access_grants" ADD COLUMN IF NOT EXISTS "resource_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."resource_access_grants" ADD COLUMN IF NOT EXISTS "origin_group_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."resource_access_grants" ADD COLUMN IF NOT EXISTS "migration_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."resource_access_grants" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."resource_access_grants" ADD COLUMN IF NOT EXISTS "revoked_at" text;
--> statement-breakpoint
ALTER TABLE public."retention_points" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."review_insights" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."review_insights" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."reviews" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reviews" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."rubric_versions" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."rubric_versions" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."rubrics" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."rubrics" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."scheduled_job" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."scheduled_job" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."scheduled_job" ADD COLUMN IF NOT EXISTS "group_version" integer;
--> statement-breakpoint
ALTER TABLE public."scheduled_job" ADD COLUMN IF NOT EXISTS "membership_version" integer;
--> statement-breakpoint
ALTER TABLE public."search_documents" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."search_documents" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."segment_assets" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."topic_attributions" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_attributions" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."topic_preferences" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_preferences" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."topic_promotions" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_promotions" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."topic_proposal_feedback" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "project_id" text, "task_id" text NOT NULL, "proposal_id" text NOT NULL, "proposition_key" text NOT NULL, "title" text NOT NULL, "angle" text NOT NULL, "reason" text NOT NULL, "note" text NOT NULL, "positioning_version_id" text, "request_hash" text NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ADD COLUMN IF NOT EXISTS "project_id" text;
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ADD COLUMN IF NOT EXISTS "task_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ADD COLUMN IF NOT EXISTS "proposal_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ADD COLUMN IF NOT EXISTS "proposition_key" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ADD COLUMN IF NOT EXISTS "title" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ADD COLUMN IF NOT EXISTS "angle" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ADD COLUMN IF NOT EXISTS "reason" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ADD COLUMN IF NOT EXISTS "note" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ADD COLUMN IF NOT EXISTS "positioning_version_id" text;
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ADD COLUMN IF NOT EXISTS "request_hash" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."topic_workspaces" ("user_id" text NOT NULL, "account_id" text, "version" integer NOT NULL, "config" jsonb NOT NULL, "receipts" jsonb DEFAULT '{}'::jsonb NOT NULL, "updated_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."topic_workspaces" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_workspaces" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."topic_workspaces" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_workspaces" ADD COLUMN IF NOT EXISTS "config" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_workspaces" ADD COLUMN IF NOT EXISTS "receipts" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_workspaces" ADD COLUMN IF NOT EXISTS "updated_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_workspaces" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."trend_sources" ALTER COLUMN "account_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."trend_sources" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."visual_template_favorites" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "snapshot" jsonb NOT NULL, "revision" integer DEFAULT 1 NOT NULL, "created_at" text NOT NULL, "updated_at" text NOT NULL, "deleted_at" text, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."visual_template_favorites" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."visual_template_favorites" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."visual_template_favorites" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."visual_template_favorites" ADD COLUMN IF NOT EXISTS "snapshot" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."visual_template_favorites" ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE public."visual_template_favorites" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."visual_template_favorites" ADD COLUMN IF NOT EXISTS "updated_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."visual_template_favorites" ADD COLUMN IF NOT EXISTS "deleted_at" text;
--> statement-breakpoint
ALTER TABLE public."visual_template_favorites" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."visual_template_mutation_receipts" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "attempt_id" text NOT NULL, "digest" text NOT NULL, "response" jsonb, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."visual_template_mutation_receipts" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."visual_template_mutation_receipts" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."visual_template_mutation_receipts" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."visual_template_mutation_receipts" ADD COLUMN IF NOT EXISTS "attempt_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."visual_template_mutation_receipts" ADD COLUMN IF NOT EXISTS "digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."visual_template_mutation_receipts" ADD COLUMN IF NOT EXISTS "response" jsonb;
--> statement-breakpoint
ALTER TABLE public."visual_template_mutation_receipts" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."visual_template_mutation_receipts" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."work_composition_requests" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "request_id" text NOT NULL, "request_digest" text NOT NULL, "composition_id" text, "operation" text NOT NULL, "input" jsonb NOT NULL, "status" text NOT NULL, "result_revision" integer, "member_reservation" jsonb, "error_code" text, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."work_composition_requests" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_composition_requests" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_composition_requests" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."work_composition_requests" ADD COLUMN IF NOT EXISTS "request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_composition_requests" ADD COLUMN IF NOT EXISTS "request_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_composition_requests" ADD COLUMN IF NOT EXISTS "composition_id" text;
--> statement-breakpoint
ALTER TABLE public."work_composition_requests" ADD COLUMN IF NOT EXISTS "operation" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_composition_requests" ADD COLUMN IF NOT EXISTS "input" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_composition_requests" ADD COLUMN IF NOT EXISTS "status" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_composition_requests" ADD COLUMN IF NOT EXISTS "result_revision" integer;
--> statement-breakpoint
ALTER TABLE public."work_composition_requests" ADD COLUMN IF NOT EXISTS "member_reservation" jsonb;
--> statement-breakpoint
ALTER TABLE public."work_composition_requests" ADD COLUMN IF NOT EXISTS "error_code" text;
--> statement-breakpoint
ALTER TABLE public."work_composition_requests" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_composition_requests" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."work_composition_versions" ("id" text NOT NULL, "composition_id" text NOT NULL, "revision" integer NOT NULL, "snapshot" jsonb NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."work_composition_versions" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_composition_versions" ADD COLUMN IF NOT EXISTS "composition_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_composition_versions" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_composition_versions" ADD COLUMN IF NOT EXISTS "snapshot" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_composition_versions" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_composition_versions" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."work_compositions" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "project_id" text NOT NULL, "current_revision" integer NOT NULL, "created_at" text NOT NULL, "updated_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."work_compositions" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_compositions" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_compositions" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."work_compositions" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_compositions" ADD COLUMN IF NOT EXISTS "current_revision" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_compositions" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_compositions" ADD COLUMN IF NOT EXISTS "updated_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_compositions" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."work_dependencies" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "project_id" text NOT NULL, "composition_id" text NOT NULL, "snapshot" jsonb NOT NULL, "material_target" jsonb, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."work_dependencies" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_dependencies" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_dependencies" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."work_dependencies" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_dependencies" ADD COLUMN IF NOT EXISTS "composition_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_dependencies" ADD COLUMN IF NOT EXISTS "snapshot" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_dependencies" ADD COLUMN IF NOT EXISTS "material_target" jsonb;
--> statement-breakpoint
ALTER TABLE public."work_dependencies" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_dependencies" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."work_material_associations" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "project_id" text NOT NULL, "composition_id" text NOT NULL, "snapshot" jsonb NOT NULL, "rule_refs" jsonb DEFAULT '[]'::jsonb NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."work_material_associations" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_associations" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_associations" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."work_material_associations" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_associations" ADD COLUMN IF NOT EXISTS "composition_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_associations" ADD COLUMN IF NOT EXISTS "snapshot" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_associations" ADD COLUMN IF NOT EXISTS "rule_refs" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_associations" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_associations" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."work_material_receipts" ("id" text NOT NULL, "user_id" text NOT NULL, "account_id" text, "composition_id" text NOT NULL, "request_id" text NOT NULL, "request_digest" text NOT NULL, "snapshot" jsonb NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."work_material_receipts" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_receipts" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_receipts" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."work_material_receipts" ADD COLUMN IF NOT EXISTS "composition_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_receipts" ADD COLUMN IF NOT EXISTS "request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_receipts" ADD COLUMN IF NOT EXISTS "request_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_receipts" ADD COLUMN IF NOT EXISTS "snapshot" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_receipts" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_receipts" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."work_review_confirmations" ("id" text NOT NULL, "ordinal" bigint DEFAULT nextval('work_review_confirmations_ordinal_seq'::regclass) NOT NULL, "user_id" text NOT NULL, "account_id" text, "project_id" text NOT NULL, "composition_id" text NOT NULL, "scope_key" text NOT NULL, "confirmation" jsonb NOT NULL, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."work_review_confirmations" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_confirmations" ADD COLUMN IF NOT EXISTS "ordinal" bigint DEFAULT nextval('work_review_confirmations_ordinal_seq'::regclass) NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_confirmations" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_confirmations" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."work_review_confirmations" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_confirmations" ADD COLUMN IF NOT EXISTS "composition_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_confirmations" ADD COLUMN IF NOT EXISTS "scope_key" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_confirmations" ADD COLUMN IF NOT EXISTS "confirmation" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_confirmations" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_confirmations" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."work_review_reports" ("id" text NOT NULL, "ordinal" bigint DEFAULT nextval('work_review_reports_ordinal_seq'::regclass) NOT NULL, "user_id" text NOT NULL, "account_id" text, "project_id" text NOT NULL, "composition_id" text NOT NULL, "scope_key" text NOT NULL, "snapshot" jsonb NOT NULL, "frozen_context" jsonb NOT NULL, "attempt_id" text NOT NULL, "task_id" text, "execution_task_id" text, "settled_call_id" text, "status" text NOT NULL, "outcome" jsonb, "error_code" text, "created_at" text NOT NULL, "group_id" text, "group_version" integer, "membership_version" integer);
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "ordinal" bigint DEFAULT nextval('work_review_reports_ordinal_seq'::regclass) NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "composition_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "scope_key" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "snapshot" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "frozen_context" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "attempt_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "task_id" text;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "execution_task_id" text;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "settled_call_id" text;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "status" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "outcome" jsonb;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "error_code" text;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "group_version" integer;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ADD COLUMN IF NOT EXISTS "membership_version" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."work_review_requests" ("id" text NOT NULL, "ordinal" bigint DEFAULT nextval('work_review_requests_ordinal_seq'::regclass) NOT NULL, "user_id" text NOT NULL, "account_id" text, "project_id" text NOT NULL, "composition_id" text NOT NULL, "request_id" text NOT NULL, "request_digest" text NOT NULL, "operation" text NOT NULL, "input" jsonb NOT NULL, "status" text NOT NULL, "report_id" text, "confirmation_id" text, "error_code" text, "created_at" text NOT NULL, "group_id" text);
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "ordinal" bigint DEFAULT nextval('work_review_requests_ordinal_seq'::regclass) NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "project_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "composition_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "request_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "request_digest" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "operation" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "input" jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "status" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "report_id" text;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "confirmation_id" text;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "error_code" text;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public."workspace_blob_objects" ("storage_key" text NOT NULL, "user_id" text NOT NULL, "group_id" text, "account_id" text, "expires_at" text NOT NULL);
--> statement-breakpoint
ALTER TABLE public."workspace_blob_objects" ADD COLUMN IF NOT EXISTS "storage_key" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."workspace_blob_objects" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."workspace_blob_objects" ADD COLUMN IF NOT EXISTS "group_id" text;
--> statement-breakpoint
ALTER TABLE public."workspace_blob_objects" ADD COLUMN IF NOT EXISTS "account_id" text;
--> statement-breakpoint
ALTER TABLE public."workspace_blob_objects" ADD COLUMN IF NOT EXISTS "expires_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_skill_overlay_versions" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."account_skill_overlays" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."ai_conversations" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."ai_tasks" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_anchors" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_candidates" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."article_text_candidates" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."artifacts" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."asset_tag_adoptions" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."asset_uploads" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."assets" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."benchmark_sources" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."benchmark_works" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."calibration_results" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."calibration_rule_suggestions" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."candidates" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_agent_proposals" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."canvas_generation_links" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."content_calendar_entries" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_canvases" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_result_bundles" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creative_results" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."creator_profiles" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."execution_control_receipts" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."execution_tasks" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."external_sources" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_anchors" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."graphic_post_text_candidates" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."ingestion_runs" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_collections" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_item_metric_snapshots" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_item_source_observations" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_item_transcripts" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_items" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_migration_ledgers" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_source_collection_memberships" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_source_snapshots" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_sources" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_sync_run_events" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_sync_runs" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."intelligence_transforms" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."knowledge_adoptions" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."knowledge_folders" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."knowledge_items" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."learning_applications" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."learnings" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."material_links" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_anchors" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_candidates" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."moments_requests" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."notifications" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_create_requests" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."output_media_attempts" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."pending_document_commits" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."pending_generated_asset_commits" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."positioning_discovery_sessions" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."positioning_statements" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."predictions" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_binding_requests" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_editor_file_bindings" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."production_media_requests" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."project_intelligence_references" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."project_transcription_requests" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."projects" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_cover_requests" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_result_adoptions" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_result_anchors" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publication_text_candidates" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."publishing_cadences" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."review_insights" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."reviews" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."rubric_versions" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."rubrics" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."scheduled_job" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."search_documents" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_attributions" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_preferences" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_promotions" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_proposal_feedback" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."topic_workspaces" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."trend_sources" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."visual_template_favorites" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."visual_template_mutation_receipts" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_composition_requests" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_compositions" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_dependencies" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_associations" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_material_receipts" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_confirmations" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_reports" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."work_review_requests" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public."workspace_blob_objects" ALTER COLUMN account_id DROP NOT NULL;
--> statement-breakpoint
ALTER SEQUENCE public."work_review_confirmations_ordinal_seq" OWNED BY public."work_review_confirmations"."ordinal";
--> statement-breakpoint
ALTER SEQUENCE public."work_review_reports_ordinal_seq" OWNED BY public."work_review_reports"."ordinal";
--> statement-breakpoint
ALTER SEQUENCE public."work_review_requests_ordinal_seq" OWNED BY public."work_review_requests"."ordinal";
--> statement-breakpoint
DROP INDEX IF EXISTS public."asset_tag_adoptions_scope_ux";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_benchmark_sources_identity_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_benchmark_works_aweme_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."content_calendar_entries_active_project_ux";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_favorites_folders_identity_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_favorites_items_identity_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_ingestion_runs_source_idem";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_intelligence_collection_sibling";
--> statement-breakpoint
DROP INDEX IF EXISTS public."knowledge_adoptions_scope_ux";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_learnings_active_content_fingerprint";
--> statement-breakpoint
DROP INDEX IF EXISTS public."publications_external_ux";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_topic_preferences_identity_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_trend_sources_identity_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."publications_external_ux";
--> statement-breakpoint
DROP INDEX IF EXISTS public."asset_tag_adoptions_scope_ux";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_benchmark_sources_identity_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_benchmark_works_aweme_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."content_calendar_entries_active_project_ux";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_favorites_folders_identity_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_favorites_items_identity_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_ingestion_runs_source_idem";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_intelligence_collection_sibling";
--> statement-breakpoint
DROP INDEX IF EXISTS public."knowledge_adoptions_scope_ux";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_learnings_active_content_fingerprint";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_topic_preferences_identity_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_trend_sources_identity_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."asset_tag_adoptions_scope_ux";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_benchmark_sources_identity_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_benchmark_works_aweme_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."content_calendar_entries_active_project_ux";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_favorites_folders_identity_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_favorites_items_identity_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_ingestion_runs_source_idem";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_intelligence_collection_sibling";
--> statement-breakpoint
DROP INDEX IF EXISTS public."knowledge_adoptions_scope_ux";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_learnings_active_content_fingerprint";
--> statement-breakpoint
DROP INDEX IF EXISTS public."publications_external_ux";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_topic_preferences_identity_v2";
--> statement-breakpoint
DROP INDEX IF EXISTS public."ux_trend_sources_identity_v2";
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."account_group_memberships"'::regclass AND conname='account_group_memberships_pkey') THEN ALTER TABLE public."account_group_memberships" ADD CONSTRAINT "account_group_memberships_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."account_group_migrations"'::regclass AND conname='account_group_migrations_pkey') THEN ALTER TABLE public."account_group_migrations" ADD CONSTRAINT "account_group_migrations_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."account_groups"'::regclass AND conname='account_groups_pkey') THEN ALTER TABLE public."account_groups" ADD CONSTRAINT "account_groups_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."account_groups"'::regclass AND conname='account_groups_status_check') THEN ALTER TABLE public."account_groups" ADD CONSTRAINT "account_groups_status_check" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text])); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."article_anchors"'::regclass AND conname='article_anchors_pkey') THEN ALTER TABLE public."article_anchors" ADD CONSTRAINT "article_anchors_pkey" PRIMARY KEY (output_id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."article_candidates"'::regclass AND conname='article_candidates_pkey') THEN ALTER TABLE public."article_candidates" ADD CONSTRAINT "article_candidates_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."article_text_candidates"'::regclass AND conname='article_text_candidates_pkey') THEN ALTER TABLE public."article_text_candidates" ADD CONSTRAINT "article_text_candidates_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."canvas_agent_proposals"'::regclass AND conname='canvas_agent_proposals_pkey') THEN ALTER TABLE public."canvas_agent_proposals" ADD CONSTRAINT "canvas_agent_proposals_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."canvas_generation_links"'::regclass AND conname='canvas_generation_links_attempt_id_key') THEN ALTER TABLE public."canvas_generation_links" ADD CONSTRAINT "canvas_generation_links_attempt_id_key" UNIQUE (attempt_id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."canvas_generation_links"'::regclass AND conname='canvas_generation_links_pkey') THEN ALTER TABLE public."canvas_generation_links" ADD CONSTRAINT "canvas_generation_links_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."canvas_generation_links"'::regclass AND conname='canvas_generation_links_task_id_key') THEN ALTER TABLE public."canvas_generation_links" ADD CONSTRAINT "canvas_generation_links_task_id_key" UNIQUE (task_id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."creative_canvases"'::regclass AND conname='creative_canvases_pkey') THEN ALTER TABLE public."creative_canvases" ADD CONSTRAINT "creative_canvases_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."creative_result_bundles"'::regclass AND conname='creative_result_bundles_pending_conversion_ck') THEN ALTER TABLE public."creative_result_bundles" ADD CONSTRAINT "creative_result_bundles_pending_conversion_ck" CHECK (output_id IS NOT NULL OR conversion_context IS NOT NULL AND target_creation_key IS NOT NULL); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."creative_result_bundles"'::regclass AND conname='creative_result_bundles_pkey') THEN ALTER TABLE public."creative_result_bundles" ADD CONSTRAINT "creative_result_bundles_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."creative_results"'::regclass AND conname='creative_results_pkey') THEN ALTER TABLE public."creative_results" ADD CONSTRAINT "creative_results_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."execution_control_receipts"'::regclass AND conname='execution_control_receipts_pkey') THEN ALTER TABLE public."execution_control_receipts" ADD CONSTRAINT "execution_control_receipts_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."external_sources"'::regclass AND conname='external_sources_real_account_check') THEN ALTER TABLE public."external_sources" ADD CONSTRAINT "external_sources_real_account_check" CHECK (account_id IS NOT NULL OR source_type = 'manual'::text); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."graphic_post_anchors"'::regclass AND conname='graphic_post_anchors_pkey') THEN ALTER TABLE public."graphic_post_anchors" ADD CONSTRAINT "graphic_post_anchors_pkey" PRIMARY KEY (output_id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."graphic_post_text_candidates"'::regclass AND conname='graphic_post_text_candidates_pkey') THEN ALTER TABLE public."graphic_post_text_candidates" ADD CONSTRAINT "graphic_post_text_candidates_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."group_onboarding_states"'::regclass AND conname='group_onboarding_states_completed_steps_check') THEN ALTER TABLE public."group_onboarding_states" ADD CONSTRAINT "group_onboarding_states_completed_steps_check" CHECK (jsonb_typeof(completed_steps) = 'array'::text); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."group_onboarding_states"'::regclass AND conname='group_onboarding_states_origin_check') THEN ALTER TABLE public."group_onboarding_states" ADD CONSTRAINT "group_onboarding_states_origin_check" CHECK (origin = ANY (ARRAY['fresh'::text, 'existing'::text])); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."group_onboarding_states"'::regclass AND conname='group_onboarding_states_pkey') THEN ALTER TABLE public."group_onboarding_states" ADD CONSTRAINT "group_onboarding_states_pkey" PRIMARY KEY (user_id, group_id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."ingestion_runs"'::regclass AND conname='ingestion_runs_real_account_check') THEN ALTER TABLE public."ingestion_runs" ADD CONSTRAINT "ingestion_runs_real_account_check" CHECK (account_id IS NOT NULL OR run_type = 'manual'::text); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."moments_anchors"'::regclass AND conname='moments_anchors_pkey') THEN ALTER TABLE public."moments_anchors" ADD CONSTRAINT "moments_anchors_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."moments_candidates"'::regclass AND conname='moments_candidates_pkey') THEN ALTER TABLE public."moments_candidates" ADD CONSTRAINT "moments_candidates_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."moments_requests"'::regclass AND conname='moments_requests_pkey') THEN ALTER TABLE public."moments_requests" ADD CONSTRAINT "moments_requests_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."output_media_attempts"'::regclass AND conname='output_media_attempts_pkey') THEN ALTER TABLE public."output_media_attempts" ADD CONSTRAINT "output_media_attempts_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."platform_account_metric_snapshots"'::regclass AND conname='platform_account_metric_snapshots_pkey') THEN ALTER TABLE public."platform_account_metric_snapshots" ADD CONSTRAINT "platform_account_metric_snapshots_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."platform_bind_attempts"'::regclass AND conname='platform_bind_attempts_pkey') THEN ALTER TABLE public."platform_bind_attempts" ADD CONSTRAINT "platform_bind_attempts_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."platform_catalogs"'::regclass AND conname='platform_catalogs_pkey') THEN ALTER TABLE public."platform_catalogs" ADD CONSTRAINT "platform_catalogs_pkey" PRIMARY KEY (account_id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."platform_collection_bindings"'::regclass AND conname='platform_collection_bindings_pkey') THEN ALTER TABLE public."platform_collection_bindings" ADD CONSTRAINT "platform_collection_bindings_pkey" PRIMARY KEY (account_id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."platform_collection_migration_conflicts"'::regclass AND conname='platform_collection_migration_conflicts_pkey') THEN ALTER TABLE public."platform_collection_migration_conflicts" ADD CONSTRAINT "platform_collection_migration_conflicts_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."platform_collection_pages"'::regclass AND conname='platform_collection_pages_pkey') THEN ALTER TABLE public."platform_collection_pages" ADD CONSTRAINT "platform_collection_pages_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."platform_collection_runs"'::regclass AND conname='platform_collection_runs_pkey') THEN ALTER TABLE public."platform_collection_runs" ADD CONSTRAINT "platform_collection_runs_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."platform_visibility_tombstones"'::regclass AND conname='platform_visibility_tombstones_pkey') THEN ALTER TABLE public."platform_visibility_tombstones" ADD CONSTRAINT "platform_visibility_tombstones_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."platform_work_metric_snapshots"'::regclass AND conname='platform_work_metric_snapshots_pkey') THEN ALTER TABLE public."platform_work_metric_snapshots" ADD CONSTRAINT "platform_work_metric_snapshots_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."platform_works"'::regclass AND conname='platform_works_pkey') THEN ALTER TABLE public."platform_works" ADD CONSTRAINT "platform_works_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_edit_versions"'::regclass AND conname='production_edit_versions_pkey') THEN ALTER TABLE public."production_edit_versions" ADD CONSTRAINT "production_edit_versions_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_binding_requests"'::regclass AND conname='production_editor_file_bindin_user_id_account_id_output_id__key') THEN ALTER TABLE public."production_editor_file_binding_requests" ADD CONSTRAINT "production_editor_file_bindin_user_id_account_id_output_id__key" UNIQUE (user_id, account_id, output_id, request_id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_binding_requests"'::regclass AND conname='production_editor_file_binding_reque_source_commit_digest_check') THEN ALTER TABLE public."production_editor_file_binding_requests" ADD CONSTRAINT "production_editor_file_binding_reque_source_commit_digest_check" CHECK (source_commit_digest ~ '^[a-f0-9]{64}$'::text); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_binding_requests"'::regclass AND conname='production_editor_file_binding_requests_pkey') THEN ALTER TABLE public."production_editor_file_binding_requests" ADD CONSTRAINT "production_editor_file_binding_requests_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_binding_requests"'::regclass AND conname='production_editor_file_binding_requests_plan_digest_check') THEN ALTER TABLE public."production_editor_file_binding_requests" ADD CONSTRAINT "production_editor_file_binding_requests_plan_digest_check" CHECK (plan_digest ~ '^sha256:[a-f0-9]{64}$'::text); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_binding_requests"'::regclass AND conname='production_editor_file_binding_requests_request_digest_check') THEN ALTER TABLE public."production_editor_file_binding_requests" ADD CONSTRAINT "production_editor_file_binding_requests_request_digest_check" CHECK (request_digest ~ '^[a-f0-9]{64}$'::text); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_binding_requests"'::regclass AND conname='production_editor_file_binding_requests_revision_check') THEN ALTER TABLE public."production_editor_file_binding_requests" ADD CONSTRAINT "production_editor_file_binding_requests_revision_check" CHECK (revision >= 1); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_binding_requests"'::regclass AND conname='production_editor_file_binding_requests_status_check') THEN ALTER TABLE public."production_editor_file_binding_requests" ADD CONSTRAINT "production_editor_file_binding_requests_status_check" CHECK (status = ANY (ARRAY['reserved'::text, 'committed'::text])); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_bindings"'::regclass AND conname='production_editor_file_bindin_user_id_account_id_output_id_key1') THEN ALTER TABLE public."production_editor_file_bindings" ADD CONSTRAINT "production_editor_file_bindin_user_id_account_id_output_id_key1" UNIQUE (user_id, account_id, output_id, revision, location); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_bindings"'::regclass AND conname='production_editor_file_bindings_file_digest_check') THEN ALTER TABLE public."production_editor_file_bindings" ADD CONSTRAINT "production_editor_file_bindings_file_digest_check" CHECK (file_digest ~ '^[a-f0-9]{64}$'::text); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_bindings"'::regclass AND conname='production_editor_file_bindings_pkey') THEN ALTER TABLE public."production_editor_file_bindings" ADD CONSTRAINT "production_editor_file_bindings_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_bindings"'::regclass AND conname='production_editor_file_bindings_plan_digest_check') THEN ALTER TABLE public."production_editor_file_bindings" ADD CONSTRAINT "production_editor_file_bindings_plan_digest_check" CHECK (plan_digest ~ '^sha256:[a-f0-9]{64}$'::text); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_bindings"'::regclass AND conname='production_editor_file_bindings_revision_check') THEN ALTER TABLE public."production_editor_file_bindings" ADD CONSTRAINT "production_editor_file_bindings_revision_check" CHECK (revision >= 1); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_media_requests"'::regclass AND conname='production_media_requests_pkey') THEN ALTER TABLE public."production_media_requests" ADD CONSTRAINT "production_media_requests_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_render_requests"'::regclass AND conname='production_render_requests_pkey') THEN ALTER TABLE public."production_render_requests" ADD CONSTRAINT "production_render_requests_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."publication_cover_requests"'::regclass AND conname='publication_cover_requests_check') THEN ALTER TABLE public."publication_cover_requests" ADD CONSTRAINT "publication_cover_requests_check" CHECK (status = 'reserved'::text AND result_revision_id IS NULL AND result_json IS NULL AND committed_at IS NULL OR status = 'committed'::text AND result_revision_id IS NOT NULL AND result_json IS NOT NULL AND committed_at IS NOT NULL); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."publication_cover_requests"'::regclass AND conname='publication_cover_requests_pkey') THEN ALTER TABLE public."publication_cover_requests" ADD CONSTRAINT "publication_cover_requests_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."publication_cover_requests"'::regclass AND conname='publication_cover_requests_request_ux') THEN ALTER TABLE public."publication_cover_requests" ADD CONSTRAINT "publication_cover_requests_request_ux" UNIQUE (user_id, account_id, client_request_id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."publication_cover_requests"'::regclass AND conname='publication_cover_requests_status_check') THEN ALTER TABLE public."publication_cover_requests" ADD CONSTRAINT "publication_cover_requests_status_check" CHECK (status = ANY (ARRAY['reserved'::text, 'committed'::text])); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."publication_result_adoptions"'::regclass AND conname='publication_result_adoptions_pkey') THEN ALTER TABLE public."publication_result_adoptions" ADD CONSTRAINT "publication_result_adoptions_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."publication_text_candidates"'::regclass AND conname='publication_text_candidates_pkey') THEN ALTER TABLE public."publication_text_candidates" ADD CONSTRAINT "publication_text_candidates_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."reporting_consent_changes"'::regclass AND conname='reporting_consent_changes_pkey') THEN ALTER TABLE public."reporting_consent_changes" ADD CONSTRAINT "reporting_consent_changes_pkey" PRIMARY KEY (user_id, change_id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."reporting_consents"'::regclass AND conname='reporting_consents_pkey') THEN ALTER TABLE public."reporting_consents" ADD CONSTRAINT "reporting_consents_pkey" PRIMARY KEY (user_id, scope, account_id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."reporting_consents"'::regclass AND conname='reporting_consents_scope_check') THEN ALTER TABLE public."reporting_consents" ADD CONSTRAINT "reporting_consents_scope_check" CHECK (scope = ANY (ARRAY['diagnostics'::text, 'creator'::text])); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."reporting_outbox"'::regclass AND conname='reporting_outbox_pkey') THEN ALTER TABLE public."reporting_outbox" ADD CONSTRAINT "reporting_outbox_pkey" PRIMARY KEY (event_id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."resource_access_grant_uses"'::regclass AND conname='resource_access_grant_uses_grant_id_consumer_type_consumer__key') THEN ALTER TABLE public."resource_access_grant_uses" ADD CONSTRAINT "resource_access_grant_uses_grant_id_consumer_type_consumer__key" UNIQUE (grant_id, consumer_type, consumer_id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."resource_access_grant_uses"'::regclass AND conname='resource_access_grant_uses_pkey') THEN ALTER TABLE public."resource_access_grant_uses" ADD CONSTRAINT "resource_access_grant_uses_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."resource_access_grants"'::regclass AND conname='resource_access_grants_pkey') THEN ALTER TABLE public."resource_access_grants" ADD CONSTRAINT "resource_access_grants_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."topic_proposal_feedback"'::regclass AND conname='topic_proposal_feedback_pkey') THEN ALTER TABLE public."topic_proposal_feedback" ADD CONSTRAINT "topic_proposal_feedback_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."visual_template_favorites"'::regclass AND conname='visual_template_favorites_pkey') THEN ALTER TABLE public."visual_template_favorites" ADD CONSTRAINT "visual_template_favorites_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."visual_template_mutation_receipts"'::regclass AND conname='visual_template_mutation_receipts_pkey') THEN ALTER TABLE public."visual_template_mutation_receipts" ADD CONSTRAINT "visual_template_mutation_receipts_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."work_composition_requests"'::regclass AND conname='work_composition_requests_pkey') THEN ALTER TABLE public."work_composition_requests" ADD CONSTRAINT "work_composition_requests_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."work_composition_versions"'::regclass AND conname='work_composition_versions_pkey') THEN ALTER TABLE public."work_composition_versions" ADD CONSTRAINT "work_composition_versions_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."work_compositions"'::regclass AND conname='work_compositions_pkey') THEN ALTER TABLE public."work_compositions" ADD CONSTRAINT "work_compositions_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."work_dependencies"'::regclass AND conname='work_dependencies_pkey') THEN ALTER TABLE public."work_dependencies" ADD CONSTRAINT "work_dependencies_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."work_material_associations"'::regclass AND conname='work_material_associations_pkey') THEN ALTER TABLE public."work_material_associations" ADD CONSTRAINT "work_material_associations_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."work_material_receipts"'::regclass AND conname='work_material_receipts_pkey') THEN ALTER TABLE public."work_material_receipts" ADD CONSTRAINT "work_material_receipts_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."work_review_confirmations"'::regclass AND conname='work_review_confirmations_pkey') THEN ALTER TABLE public."work_review_confirmations" ADD CONSTRAINT "work_review_confirmations_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."work_review_reports"'::regclass AND conname='work_review_report_status') THEN ALTER TABLE public."work_review_reports" ADD CONSTRAINT "work_review_report_status" CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."work_review_reports"'::regclass AND conname='work_review_report_success') THEN ALTER TABLE public."work_review_reports" ADD CONSTRAINT "work_review_report_success" CHECK (status <> 'succeeded'::text OR task_id IS NOT NULL AND execution_task_id IS NOT NULL AND settled_call_id IS NOT NULL AND outcome IS NOT NULL); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."work_review_reports"'::regclass AND conname='work_review_reports_pkey') THEN ALTER TABLE public."work_review_reports" ADD CONSTRAINT "work_review_reports_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."work_review_requests"'::regclass AND conname='work_review_request_failure') THEN ALTER TABLE public."work_review_requests" ADD CONSTRAINT "work_review_request_failure" CHECK (status <> 'failed'::text OR error_code IS NOT NULL); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."work_review_requests"'::regclass AND conname='work_review_request_operation') THEN ALTER TABLE public."work_review_requests" ADD CONSTRAINT "work_review_request_operation" CHECK (operation = ANY (ARRAY['create'::text, 'confirm'::text])); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."work_review_requests"'::regclass AND conname='work_review_request_status') THEN ALTER TABLE public."work_review_requests" ADD CONSTRAINT "work_review_request_status" CHECK (status = ANY (ARRAY['reserved'::text, 'committed'::text, 'failed'::text])); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."work_review_requests"'::regclass AND conname='work_review_request_target') THEN ALTER TABLE public."work_review_requests" ADD CONSTRAINT "work_review_request_target" CHECK (status <> 'committed'::text OR operation = 'create'::text AND report_id IS NOT NULL AND confirmation_id IS NULL OR operation = 'confirm'::text AND confirmation_id IS NOT NULL); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."work_review_requests"'::regclass AND conname='work_review_requests_pkey') THEN ALTER TABLE public."work_review_requests" ADD CONSTRAINT "work_review_requests_pkey" PRIMARY KEY (id); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."workspace_blob_objects"'::regclass AND conname='workspace_blob_objects_pkey') THEN ALTER TABLE public."workspace_blob_objects" ADD CONSTRAINT "workspace_blob_objects_pkey" PRIMARY KEY (storage_key); END IF; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS group_command_user_key_ux ON public.account_group_commands USING btree (user_id, idempotency_key);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS group_membership_current_ux ON public.account_group_memberships USING btree (user_id, platform_account_id) WHERE (left_at IS NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS group_migration_user_key_ux ON public.account_group_migrations USING btree (user_id, idempotency_key);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_group_skill_overlay_versions_revision ON public.account_skill_overlay_versions USING btree (user_id, group_id, skill_id, row_revision) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_group_skill_overlays_owner_skill ON public.account_skill_overlays USING btree (user_id, group_id, skill_id) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_conversations_user_group_idx ON public.ai_conversations USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ai_tasks_group_attempt_identity ON public.ai_tasks USING btree (user_id, group_id, task_type, attempt_id) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_tasks_user_group_idx ON public.ai_tasks USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS article_anchors_artifact_ux ON public.article_anchors USING btree (artifact_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS article_anchors_group_46c5ab4b ON public.article_anchors USING btree (user_id, group_id, client_request_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS article_anchors_group_scope_idx ON public.article_anchors USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS article_anchors_request_ux ON public.article_anchors USING btree (user_id, account_id, client_request_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS article_candidates_group_46c5ab4b ON public.article_candidates USING btree (user_id, group_id, client_request_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS article_candidates_group_scope_idx ON public.article_candidates USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS article_candidates_request_ux ON public.article_candidates USING btree (user_id, account_id, client_request_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS article_text_candidates_group_scope_idx ON public.article_text_candidates USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS article_text_candidates_output_idx ON public.article_text_candidates USING btree (account_id, output_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS artifacts_user_group_ix ON public.artifacts USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS asset_tag_adoptions_group_scope_ux ON public.asset_tag_adoptions USING btree (user_id, group_id, proposal_id) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS asset_tag_adoptions_legacy_scope_ux ON public.asset_tag_adoptions USING btree (user_id, account_id, proposal_id) WHERE (group_id IS NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS asset_uploads_group_ix ON public.asset_uploads USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS assets_group_ix ON public.assets USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audience_signals_user_group_ix ON public.audience_signals USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audience_snapshots_group_ix ON public.audience_snapshots USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS benchmark_sources_group_ix ON public.benchmark_sources USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_benchmark_sources_group_identity ON public.benchmark_sources USING btree (user_id, group_id, platform, external_account_id) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_benchmark_sources_identity_v2 ON public.benchmark_sources USING btree (user_id, account_id, platform, external_account_id) WHERE (group_id IS NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS benchmark_works_group_ix ON public.benchmark_works USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_benchmark_works_aweme_v2 ON public.benchmark_works USING btree (user_id, account_id, platform, aweme_id) WHERE (group_id IS NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_benchmark_works_group_aweme ON public.benchmark_works USING btree (user_id, group_id, platform, aweme_id) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS calibration_results_user_group_ix ON public.calibration_results USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS calibration_rule_suggestions_user_group_ix ON public.calibration_rule_suggestions USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS candidates_user_group_ix ON public.candidates USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS canvas_agent_proposals_canvas_idx ON public.canvas_agent_proposals USING btree (user_id, account_id, canvas_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS canvas_agent_proposals_group_scope_idx ON public.canvas_agent_proposals USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS canvas_generation_links_canvas_idx ON public.canvas_generation_links USING btree (user_id, account_id, canvas_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS canvas_generation_links_group_scope_idx ON public.canvas_generation_links USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS content_calendar_entries_active_project_ux ON public.content_calendar_entries USING btree (user_id, account_id, project_id) WHERE ((group_id IS NULL) AND (project_id IS NOT NULL) AND (status = ANY (ARRAY['planned'::text, 'missed'::text])));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS content_calendar_entries_group_active_project_ux ON public.content_calendar_entries USING btree (user_id, group_id, project_id) WHERE ((group_id IS NOT NULL) AND (project_id IS NOT NULL) AND (status = ANY (ARRAY['planned'::text, 'missed'::text])));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS content_calendar_entries_group_window_ix ON public.content_calendar_entries USING btree (user_id, group_id, planned_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS creative_canvases_group_scope_idx ON public.creative_canvases USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS creative_canvases_owner_updated_idx ON public.creative_canvases USING btree (user_id, account_id, updated_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS creative_result_bundles_group_46c5ab4b ON public.creative_result_bundles USING btree (user_id, group_id, client_request_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS creative_result_bundles_group_scope_idx ON public.creative_result_bundles USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS creative_result_bundles_output_ix ON public.creative_result_bundles USING btree (user_id, account_id, output_id, created_at, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS creative_result_bundles_request_ux ON public.creative_result_bundles USING btree (user_id, account_id, client_request_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS creative_results_group_46c5ab4b ON public.creative_results USING btree (user_id, group_id, client_request_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS creative_results_group_scope_idx ON public.creative_results USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS creative_results_output_ix ON public.creative_results USING btree (user_id, account_id, output_id, created_at, id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS creative_results_request_ux ON public.creative_results USING btree (user_id, account_id, client_request_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS creator_profiles_group_scope_ix ON public.creator_profiles USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS creator_profiles_group_ux ON public.creator_profiles USING btree (user_id, group_id) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS execution_control_receipts_group_715b2c6d ON public.execution_control_receipts USING btree (user_id, group_id, idempotency_key) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS execution_control_receipts_group_scope_idx ON public.execution_control_receipts USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS execution_control_receipts_scope_key_uq ON public.execution_control_receipts USING btree (user_id, account_id, idempotency_key);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS execution_tasks_group_idempotency ON public.execution_tasks USING btree (user_id, group_id, kind, idempotency_key) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS execution_tasks_user_group_idx ON public.execution_tasks USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS favorites_folders_group_ix ON public.favorites_folders USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_folders_group_identity ON public.favorites_folders USING btree (user_id, group_id, account_id, name) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_folders_identity_v2 ON public.favorites_folders USING btree (user_id, account_id, name) WHERE (group_id IS NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS favorites_items_group_ix ON public.favorites_items USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_items_group_identity ON public.favorites_items USING btree (user_id, group_id, aweme_id) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_items_identity_v2 ON public.favorites_items USING btree (user_id, account_id, aweme_id) WHERE (group_id IS NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS graphic_post_anchors_account_output_ux ON public.graphic_post_anchors USING btree (account_id, output_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS graphic_post_anchors_artifact_ux ON public.graphic_post_anchors USING btree (artifact_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS graphic_post_anchors_group_46c5ab4b ON public.graphic_post_anchors USING btree (user_id, group_id, client_request_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS graphic_post_anchors_group_scope_idx ON public.graphic_post_anchors USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS graphic_post_anchors_request_ux ON public.graphic_post_anchors USING btree (user_id, account_id, client_request_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS graphic_post_text_candidates_group_scope_idx ON public.graphic_post_text_candidates USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS graphic_post_text_candidates_output_idx ON public.graphic_post_text_candidates USING btree (account_id, output_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_runs_group_source_idem ON public.ingestion_runs USING btree (user_id, group_id, external_source_id, idempotency_key) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_runs_source_idem ON public.ingestion_runs USING btree (external_source_id, idempotency_key) WHERE (group_id IS NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_collections_user_group_idx ON public.intelligence_collections USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_collection_group_sibling ON public.intelligence_collections USING btree (user_id, group_id, parent_id, normalized_name) NULLS NOT DISTINCT WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_collection_sibling ON public.intelligence_collections USING btree (user_id, account_id, parent_id, normalized_name) NULLS NOT DISTINCT WHERE (group_id IS NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_item_metric_snapshots_user_group_idx ON public.intelligence_item_metric_snapshots USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_item_source_observations_user_group_idx ON public.intelligence_item_source_observations USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_item_transcripts_user_group_idx ON public.intelligence_item_transcripts USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_items_user_group_idx ON public.intelligence_items USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_item_group_external ON public.intelligence_items USING btree (user_id, group_id, platform, type, external_id) WHERE ((group_id IS NOT NULL) AND (external_id IS NOT NULL));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_item_group_url ON public.intelligence_items USING btree (user_id, group_id, platform, type, canonical_url_hash) WHERE ((group_id IS NOT NULL) AND (external_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_migration_ledgers_user_group_idx ON public.intelligence_migration_ledgers USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_source_collection_memberships_user_group_idx ON public.intelligence_source_collection_memberships USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_source_group_membership ON public.intelligence_source_collection_memberships USING btree (user_id, group_id, source_id, collection_id) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_source_snapshots_user_group_idx ON public.intelligence_source_snapshots USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_sources_user_group_idx ON public.intelligence_sources USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_source_group_identity ON public.intelligence_sources USING btree (user_id, group_id, type, external_key) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_sync_run_events_user_group_idx ON public.intelligence_sync_run_events USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_sync_runs_user_group_idx ON public.intelligence_sync_runs USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS intelligence_transforms_user_group_idx ON public.intelligence_transforms USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_intelligence_transform_group_idempotency ON public.intelligence_transforms USING btree (user_id, group_id, idempotency_key) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_adoptions_group_scope_ux ON public.knowledge_adoptions USING btree (user_id, group_id, proposal_id) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_adoptions_legacy_scope_ux ON public.knowledge_adoptions USING btree (user_id, account_id, proposal_id) WHERE (group_id IS NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_folders_group_scope_ix ON public.knowledge_folders USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_items_group_scope_ix ON public.knowledge_items USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS learning_applications_user_group_ix ON public.learning_applications USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS learnings_user_group_ix ON public.learnings USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_learnings_active_content_fingerprint ON public.learnings USING btree (user_id, account_id, content_fingerprint) WHERE ((account_id IS NOT NULL) AND (validation_status <> 'discarded'::text) AND (content_fingerprint IS NOT NULL));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_learnings_group_content_fingerprint ON public.learnings USING btree (user_id, group_id, content_fingerprint) WHERE ((group_id IS NOT NULL) AND (validation_status <> 'discarded'::text) AND (content_fingerprint IS NOT NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS material_links_workspace_ix ON public.material_links USING btree (user_id, group_id, account_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS metric_snapshots_group_ix ON public.metric_snapshots USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS metric_values_group_ix ON public.metric_values USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS moments_anchors_artifact_ux ON public.moments_anchors USING btree (artifact_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS moments_anchors_group_scope_idx ON public.moments_anchors USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS moments_candidates_group_scope_idx ON public.moments_candidates USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS moments_candidates_scope_idx ON public.moments_candidates USING btree (user_id, account_id, moments_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS moments_requests_group_d4edcb23 ON public.moments_requests USING btree (user_id, group_id, request_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS moments_requests_group_scope_idx ON public.moments_requests USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS moments_requests_scope_ux ON public.moments_requests USING btree (user_id, account_id, request_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notifications_group_ix ON public.notifications USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS output_create_requests_group_46c5ab4b ON public.output_create_requests USING btree (user_id, group_id, client_request_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS output_create_requests_group_scope_idx ON public.output_create_requests USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS output_create_requests_owner_key_ux ON public.output_create_requests USING btree (user_id, account_id, client_request_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS output_media_attempts_group_46c5ab4b ON public.output_media_attempts USING btree (user_id, group_id, client_request_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS output_media_attempts_group_scope_idx ON public.output_media_attempts USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS output_media_attempts_request_ux ON public.output_media_attempts USING btree (user_id, account_id, client_request_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS output_media_attempts_task_ux ON public.output_media_attempts USING btree (task_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_account_metrics_evidence_ux ON public.platform_account_metric_snapshots USING btree (user_id, account_id, metric_key, window_key, source, observed_at, source_snapshot_key_index);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS platform_bind_attempts_expiry_ix ON public.platform_bind_attempts USING btree (status, expires_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_bind_attempts_request_ux ON public.platform_bind_attempts USING btree (user_id, platform, client_request_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_collection_bindings_identity_ux ON public.platform_collection_bindings USING btree (user_id, platform, platform_identity);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_collection_migration_conflicts_publication_ux ON public.platform_collection_migration_conflicts USING btree (publication_id, reason_code);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_collection_pages_position_ux ON public.platform_collection_pages USING btree (run_id, generation, scan_pass, page_index);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS platform_collection_runs_account_ix ON public.platform_collection_runs USING btree (user_id, account_id, started_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_collection_runs_active_ux ON public.platform_collection_runs USING btree (account_id, capability) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_collection_runs_request_ux ON public.platform_collection_runs USING btree (user_id, account_id, capability, client_request_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_visibility_tombstones_evidence_ux ON public.platform_visibility_tombstones USING btree (user_id, account_id, platform, external_id, source, observed_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_work_metrics_evidence_ux ON public.platform_work_metric_snapshots USING btree (user_id, account_id, platform_work_id, metric_key, window_key, source, observed_at, source_snapshot_key_index);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS platform_works_catalog_ix ON public.platform_works USING btree (user_id, account_id, catalog_generation);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_works_external_scope_ux ON public.platform_works USING btree (user_id, account_id, platform, external_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS positioning_discovery_sessions_group_scope_ix ON public.positioning_discovery_sessions USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS positioning_statements_group_scope_ix ON public.positioning_statements USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS predictions_user_group_ix ON public.predictions USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_edit_versions_request_ux ON public.production_edit_versions USING btree (production_id, request_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_edit_versions_revision_ux ON public.production_edit_versions USING btree (production_id, revision);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_editor_file_binding_requests_group_68016e59 ON public.production_editor_file_binding_requests USING btree (user_id, group_id, output_id, request_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_editor_file_binding_requests_group_scope_idx ON public.production_editor_file_binding_requests USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_editor_file_bindings_group_bb5f5789 ON public.production_editor_file_bindings USING btree (user_id, group_id, output_id, revision, location) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_editor_file_bindings_group_scope_idx ON public.production_editor_file_bindings USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_media_requests_group_68016e59 ON public.production_media_requests USING btree (user_id, group_id, output_id, request_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_media_requests_group_scope_idx ON public.production_media_requests USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_media_requests_scope_ux ON public.production_media_requests USING btree (user_id, account_id, output_id, request_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS production_render_requests_request_ux ON public.production_render_requests USING btree (production_id, request_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS project_intelligence_references_user_group_idx ON public.project_intelligence_references USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS project_transcription_requests_group_scope_ux ON public.project_transcription_requests USING btree (user_id, group_id, attempt_id) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS project_transcription_requests_legacy_scope_ux ON public.project_transcription_requests USING btree (user_id, account_id, attempt_id) WHERE (group_id IS NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS projects_group_scope_ix ON public.projects USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publication_cover_requests_group_46c5ab4b ON public.publication_cover_requests USING btree (user_id, group_id, client_request_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS publication_cover_requests_group_scope_idx ON public.publication_cover_requests USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS publication_cover_requests_owner_target_idx ON public.publication_cover_requests USING btree (user_id, account_id, publication_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publication_result_adoptions_group_46c5ab4b ON public.publication_result_adoptions USING btree (user_id, group_id, client_request_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS publication_result_adoptions_group_scope_idx ON public.publication_result_adoptions USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publication_result_adoptions_request_ux ON public.publication_result_adoptions USING btree (user_id, account_id, client_request_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publication_result_anchors_group_7db09e7f ON public.publication_result_anchors USING btree (user_id, group_id, output_id, platform) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS publication_result_anchors_group_scope_idx ON public.publication_result_anchors USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publication_result_anchors_output_platform_ux ON public.publication_result_anchors USING btree (user_id, account_id, output_id, platform);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publication_result_anchors_publication_ux ON public.publication_result_anchors USING btree (publication_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publication_revisions_visual_adoption_ux ON public.publication_revisions USING btree (publication_id, visual_adoption_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS publication_text_candidates_group_scope_idx ON public.publication_text_candidates USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS publication_text_candidates_output_idx ON public.publication_text_candidates USING btree (account_id, output_id, platform);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publications_external_account_ux ON public.publications USING btree (user_id, account_id, platform, external_id) WHERE (external_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS publications_group_ix ON public.publications USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publishing_cadences_group_ux ON public.publishing_cadences USING btree (user_id, group_id) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reporting_outbox_owner_scope ON public.reporting_outbox USING btree (user_id, scope, account_id, created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS resource_grant_current_ux ON public.resource_access_grants USING btree (user_id, target_group_id, resource_type, resource_id) WHERE (revoked_at IS NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS review_insights_user_group_ix ON public.review_insights USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reviews_user_group_ix ON public.reviews USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rubric_versions_user_group_ix ON public.rubric_versions USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rubrics_user_group_ix ON public.rubrics USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scheduled_job_user_group_idx ON public.scheduled_job USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_scheduled_job_group_daily_topic ON public.scheduled_job USING btree (user_id, group_id, source_kind) WHERE ((group_id IS NOT NULL) AND (source_kind = 'topic.daily'::text));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS search_documents_group_ix ON public.search_documents USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS topic_attributions_group_ix ON public.topic_attributions USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS topic_preferences_user_group_ix ON public.topic_preferences USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_topic_preferences_group_identity ON public.topic_preferences USING btree (user_id, group_id, keyword, direction) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_topic_preferences_identity_v2 ON public.topic_preferences USING btree (user_id, account_id, keyword, direction) WHERE (account_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS topic_promotions_user_group_ix ON public.topic_promotions USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_topic_feedback_scope ON public.topic_proposal_feedback USING btree (user_id, account_id, project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS topic_proposal_feedback_group_scope_idx ON public.topic_proposal_feedback USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS topic_proposal_feedback_user_group_ix ON public.topic_proposal_feedback USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS topic_workspaces_group_scope_idx ON public.topic_workspaces USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS topic_workspaces_group_ux ON public.topic_workspaces USING btree (user_id, group_id) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS topic_workspaces_legacy_ux ON public.topic_workspaces USING btree (user_id, account_id) WHERE (account_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS topic_workspaces_user_group_ix ON public.topic_workspaces USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS trend_sources_group_ix ON public.trend_sources USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_trend_sources_group_identity ON public.trend_sources USING btree (user_id, group_id, url) WHERE (group_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_trend_sources_identity_v2 ON public.trend_sources USING btree (user_id, account_id, url) WHERE (group_id IS NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS visual_template_favorites_group_scope_idx ON public.visual_template_favorites USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS visual_template_favorites_owner_idx ON public.visual_template_favorites USING btree (user_id, account_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS visual_template_mutation_attempt_ux ON public.visual_template_mutation_receipts USING btree (user_id, account_id, attempt_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS visual_template_mutation_receipts_group_3eed8954 ON public.visual_template_mutation_receipts USING btree (user_id, group_id, attempt_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS visual_template_mutation_receipts_group_scope_idx ON public.visual_template_mutation_receipts USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_composition_requests_group_d4edcb23 ON public.work_composition_requests USING btree (user_id, group_id, request_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_composition_requests_group_scope_idx ON public.work_composition_requests USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_composition_requests_scope_ux ON public.work_composition_requests USING btree (user_id, account_id, request_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_composition_versions_revision_ux ON public.work_composition_versions USING btree (composition_id, revision);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_compositions_group_scope_idx ON public.work_compositions USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_dependencies_group_scope_idx ON public.work_dependencies USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_material_associations_group_scope_idx ON public.work_material_associations USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_material_receipts_group_d4edcb23 ON public.work_material_receipts USING btree (user_id, group_id, request_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_material_receipts_group_scope_idx ON public.work_material_receipts USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_material_receipts_scope_ux ON public.work_material_receipts USING btree (user_id, account_id, request_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_review_confirmation_scope_idx ON public.work_review_confirmations USING btree (user_id, account_id, composition_id, scope_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_review_confirmations_group_scope_idx ON public.work_review_confirmations USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_review_report_attempt_ux ON public.work_review_reports USING btree (user_id, account_id, attempt_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_review_report_call_ux ON public.work_review_reports USING btree (settled_call_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_review_report_scope_idx ON public.work_review_reports USING btree (user_id, account_id, composition_id, scope_key);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_review_report_task_ux ON public.work_review_reports USING btree (task_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_review_reports_group_3eed8954 ON public.work_review_reports USING btree (user_id, group_id, attempt_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_review_reports_group_scope_idx ON public.work_review_reports USING btree (user_id, group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_review_request_scope_ux ON public.work_review_requests USING btree (user_id, account_id, request_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_review_requests_group_d4edcb23 ON public.work_review_requests USING btree (user_id, group_id, request_id) WHERE ((group_id IS NOT NULL) AND (account_id IS NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_review_requests_group_scope_idx ON public.work_review_requests USING btree (user_id, group_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS workspace_blob_objects_group_scope_idx ON public.workspace_blob_objects USING btree (user_id, group_id);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."moments_candidates"'::regclass AND conname='moments_candidates_moments_id_fkey') THEN ALTER TABLE public."moments_candidates" ADD CONSTRAINT "moments_candidates_moments_id_fkey" FOREIGN KEY (moments_id) REFERENCES moments_anchors(id) ON DELETE CASCADE; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_binding_requests"'::regclass AND conname='production_editor_file_binding_requ_production_id_revision_fkey') THEN ALTER TABLE public."production_editor_file_binding_requests" ADD CONSTRAINT "production_editor_file_binding_requ_production_id_revision_fkey" FOREIGN KEY (production_id, revision) REFERENCES production_edit_versions(production_id, revision) ON DELETE CASCADE; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_binding_requests"'::regclass AND conname='production_editor_file_binding_requests_output_id_fkey') THEN ALTER TABLE public."production_editor_file_binding_requests" ADD CONSTRAINT "production_editor_file_binding_requests_output_id_fkey" FOREIGN KEY (output_id) REFERENCES content_outputs(id) ON DELETE CASCADE; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_bindings"'::regclass AND conname='production_editor_file_bindings_binding_request_id_fkey') THEN ALTER TABLE public."production_editor_file_bindings" ADD CONSTRAINT "production_editor_file_bindings_binding_request_id_fkey" FOREIGN KEY (binding_request_id) REFERENCES production_editor_file_binding_requests(id) ON DELETE CASCADE; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_bindings"'::regclass AND conname='production_editor_file_bindings_output_id_fkey') THEN ALTER TABLE public."production_editor_file_bindings" ADD CONSTRAINT "production_editor_file_bindings_output_id_fkey" FOREIGN KEY (output_id) REFERENCES content_outputs(id) ON DELETE CASCADE; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."production_editor_file_bindings"'::regclass AND conname='production_editor_file_bindings_production_id_revision_fkey') THEN ALTER TABLE public."production_editor_file_bindings" ADD CONSTRAINT "production_editor_file_bindings_production_id_revision_fkey" FOREIGN KEY (production_id, revision) REFERENCES production_edit_versions(production_id, revision) ON DELETE CASCADE; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."publication_cover_requests"'::regclass AND conname='publication_cover_requests_publication_id_fkey') THEN ALTER TABLE public."publication_cover_requests" ADD CONSTRAINT "publication_cover_requests_publication_id_fkey" FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."publication_cover_requests"'::regclass AND conname='publication_cover_requests_result_revision_id_fkey') THEN ALTER TABLE public."publication_cover_requests" ADD CONSTRAINT "publication_cover_requests_result_revision_id_fkey" FOREIGN KEY (result_revision_id) REFERENCES publication_revisions(id) ON DELETE CASCADE; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."resource_access_grant_uses"'::regclass AND conname='resource_access_grant_uses_grant_id_fkey') THEN ALTER TABLE public."resource_access_grant_uses" ADD CONSTRAINT "resource_access_grant_uses_grant_id_fkey" FOREIGN KEY (grant_id) REFERENCES resource_access_grants(id); END IF; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.bump_page_read_revision()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE page_read_revision SET version = version + 1 WHERE id = 1;
  RETURN NULL;
END;
$function$
;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.creatoros_stamp_legacy_shared_group()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE parent_group TEXT;
BEGIN
 IF NEW.group_id IS NULL THEN
  IF to_jsonb(NEW)->>'project_id' IS NOT NULL THEN
   SELECT group_id INTO parent_group FROM projects WHERE id=to_jsonb(NEW)->>'project_id' AND user_id=NEW.user_id;
  END IF;
  IF parent_group IS NOT NULL THEN NEW.group_id=parent_group;
  ELSIF NEW.account_id IS NOT NULL THEN
   SELECT group_id INTO NEW.group_id FROM account_group_memberships WHERE platform_account_id=NEW.account_id AND user_id=NEW.user_id AND left_at IS NULL;
   IF NEW.group_id IS NULL THEN NEW.group_id='grp_legacy_'||NEW.account_id; END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$function$
;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.record_workspace_grant_use()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE d jsonb:=to_jsonb(NEW); target_group text; owner_id text; ref_id text; ref_type text; payload jsonb; refs jsonb:='[]'; r jsonb; origin_group text; resource_status text; selected_grant_id text;
BEGIN
 owner_id:=d->>'user_id';target_group:=d->>'group_id';
 IF TG_TABLE_NAME IN ('material_links','content_outputs') THEN SELECT user_id,group_id INTO owner_id,target_group FROM projects WHERE id=d->>'project_id';
 ELSIF TG_TABLE_NAME='publication_revisions' THEN SELECT user_id,group_id INTO owner_id,target_group FROM publications WHERE id=d->>'publication_id';
 ELSIF TG_TABLE_NAME='segment_assets' THEN SELECT p.user_id,p.group_id INTO owner_id,target_group FROM production_segments seg JOIN productions prod ON prod.id=seg.production_id JOIN content_outputs o ON o.id=prod.content_output_id JOIN projects p ON p.id=o.project_id WHERE seg.id=d->>'production_segment_id' AND seg.user_id=d->>'user_id' AND prod.user_id=d->>'user_id';
 ELSIF TG_TABLE_NAME='export_records' THEN SELECT p.user_id,p.group_id INTO owner_id,target_group FROM productions prod JOIN content_outputs o ON o.id=prod.content_output_id JOIN projects p ON p.id=o.project_id WHERE prod.id=d->>'production_id' AND prod.user_id=d->>'user_id';
 ELSIF TG_TABLE_NAME='ai_messages' THEN SELECT user_id,group_id INTO owner_id,target_group FROM ai_conversations WHERE id=d->>'conversation_id';END IF;
 -- 迁移前的NULL组沿用已有父权限；不能把NULL组当作跨组通行证。
 IF target_group IS NULL OR owner_id IS NULL THEN RETURN NEW;END IF;
 IF NOT EXISTS(SELECT 1 FROM account_groups WHERE id=target_group AND user_id=owner_id) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='GROUP_RESOURCE_SCOPE_CONFLICT:引用账号组不存在';END IF;
 IF TG_TABLE_NAME='material_links' THEN ref_id:=d->>'entity_id';ref_type:=d->>'entity_type';
 ELSIF TG_TABLE_NAME='content_outputs' THEN ref_id:=d->>'primary_asset_id';ref_type:='asset';
 ELSIF TG_TABLE_NAME='publication_revisions' THEN ref_id:=d->>'cover_asset_id';ref_type:='asset';
 ELSIF TG_TABLE_NAME IN ('knowledge_items','segment_assets') THEN ref_id:=d->>'asset_id';ref_type:='asset';
 ELSIF TG_TABLE_NAME='export_records' THEN ref_id:=d->>'result_asset_id';ref_type:='asset';
 ELSIF TG_TABLE_NAME='ai_messages' THEN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('type','asset','id',v#>>'{}')),'[]') INTO refs FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d->'attachments')='array' THEN d->'attachments' ELSE '[]' END) v WHERE jsonb_typeof(v)='string';
 ELSIF TG_TABLE_NAME='ai_tasks' THEN
  payload:=d->'input_data';
  -- 明确协议字段才是资源引用；正文中恰好出现资源ID不授予也不消费权限。
  SELECT COALESCE(jsonb_agg(jsonb_build_object('type',t.kind,'id',v#>>'{}')),'[]') INTO refs FROM (
   SELECT 'asset' AS kind,jsonb_path_query(payload,'$.**.assetId') AS v UNION ALL SELECT 'asset',jsonb_path_query(payload,'$.**.assetIds[*]')
   UNION ALL SELECT 'knowledge',jsonb_path_query(payload,'$.**.knowledgeId') UNION ALL SELECT 'knowledge',jsonb_path_query(payload,'$.**.knowledgeIds[*]')
   UNION ALL SELECT 'knowledge',jsonb_path_query(payload,'$.**.knowledgeItemId') UNION ALL SELECT 'knowledge',jsonb_path_query(payload,'$.**.knowledgeItemIds[*]')
  ) t WHERE jsonb_typeof(v)='string';
 END IF;
 IF ref_id IS NOT NULL AND ref_type IN ('asset','knowledge') THEN refs:=refs||jsonb_build_array(jsonb_build_object('type',ref_type,'id',ref_id));END IF;
 FOR r IN SELECT DISTINCT value FROM jsonb_array_elements(refs) LOOP
  origin_group:=NULL;resource_status:=NULL;selected_grant_id:=NULL;
  IF r->>'type'='asset' THEN SELECT group_id,status INTO origin_group,resource_status FROM assets WHERE id=r->>'id' AND user_id=owner_id FOR SHARE;
  ELSE SELECT group_id,status INTO origin_group,resource_status FROM knowledge_items WHERE id=r->>'id' AND user_id=owner_id FOR SHARE;END IF;
  IF NOT FOUND OR resource_status='deleted' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='GROUP_RESOURCE_SCOPE_CONFLICT:引用资源不存在或已删除，请先修复引用';END IF;
  IF origin_group=target_group THEN CONTINUE;END IF;
  SELECT g.id INTO selected_grant_id FROM resource_access_grants g WHERE g.user_id=owner_id AND g.target_group_id=target_group AND g.origin_group_id=origin_group AND g.resource_type=r->>'type' AND g.resource_id=r->>'id' AND g.revoked_at IS NULL ORDER BY g.id LIMIT 1 FOR SHARE;
  IF selected_grant_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='GROUP_RESOURCE_SCOPE_CONFLICT:共享授权已撤销或不存在，请先修复引用';END IF;
  INSERT INTO resource_access_grant_uses(id,user_id,grant_id,consumer_type,consumer_id,created_at) VALUES('grant-use-'||md5(selected_grant_id||':'||TG_TABLE_NAME||':'||(d->>'id')),owner_id,selected_grant_id,TG_TABLE_NAME,d->>'id',now()::text) ON CONFLICT(grant_id,consumer_type,consumer_id) DO NOTHING;
 END LOOP;
 RETURN NEW;
END $function$
;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.research_child_group_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN
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
END $function$
;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.stamp_material_link_workspace()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN
 SELECT group_id,account_id INTO NEW.group_id,NEW.account_id FROM projects WHERE id=NEW.project_id AND user_id=NEW.user_id;
 RETURN NEW;
END $function$
;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.stamp_metric_group()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN
 SELECT group_id,platform INTO NEW.group_id,NEW.native_platform FROM publications WHERE id=NEW.publication_id AND user_id=NEW.user_id AND account_id=NEW.account_id;
 RETURN NEW; END $function$
;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.stamp_metric_value_group()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN
 SELECT group_id INTO NEW.group_id FROM metric_snapshots WHERE id=NEW.metric_snapshot_id AND user_id=NEW.user_id AND account_id=NEW.account_id;
 RETURN NEW; END $function$
;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.stamp_project_group()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 IF NEW.group_id IS NULL AND NEW.account_id IS NOT NULL THEN
  SELECT group_id INTO NEW.group_id FROM account_group_memberships WHERE user_id=NEW.user_id AND platform_account_id=NEW.account_id AND left_at IS NULL;
 END IF;
 RETURN NEW;
END $function$
;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.stamp_publication_child_group()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN
 SELECT group_id INTO NEW.group_id FROM publications WHERE id=NEW.publication_id AND user_id=NEW.user_id AND account_id=NEW.account_id;
 RETURN NEW; END $function$
;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.stamp_publication_group()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN
 IF NEW.group_id IS NULL THEN SELECT group_id INTO NEW.group_id FROM projects WHERE id=(SELECT project_id FROM content_outputs WHERE id=NEW.content_output_id) AND user_id=NEW.user_id; END IF;
 IF NEW.group_id IS NULL THEN SELECT group_id INTO NEW.group_id FROM account_group_memberships WHERE user_id=NEW.user_id AND platform_account_id=NEW.account_id AND left_at IS NULL; END IF;
 RETURN NEW; END $function$
;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.stamp_shared_domain_group()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN
 IF NEW.group_id IS NULL AND NEW.account_id IS NOT NULL THEN
  SELECT group_id INTO NEW.group_id FROM account_group_memberships
   WHERE user_id=NEW.user_id AND platform_account_id=NEW.account_id AND left_at IS NULL;
 END IF;
 RETURN NEW;
END $function$
;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.t1022_freeze_audience_publication_group()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE fact_group text;
BEGIN
  IF NEW.publication_id IS NOT NULL THEN
    SELECT p.group_id INTO fact_group FROM publications p
      WHERE p.id=NEW.publication_id AND p.user_id=NEW.user_id AND p.account_id=NEW.account_id;
    IF FOUND THEN NEW.group_id:=fact_group; END IF;
  END IF;
  RETURN NEW;
END $function$
;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.validate_workspace_resource_grant()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE origin_group text; resource_status text;
BEGIN
 IF NEW.revoked_at IS NOT NULL THEN RETURN NEW;END IF;
 IF NOT EXISTS(SELECT 1 FROM account_groups WHERE id=NEW.origin_group_id AND user_id=NEW.user_id) OR NOT EXISTS(SELECT 1 FROM account_groups WHERE id=NEW.target_group_id AND user_id=NEW.user_id) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='GROUP_RESOURCE_SCOPE_CONFLICT:授权组不属于当前用户';END IF;
 IF NEW.resource_type='asset' THEN SELECT group_id,status INTO origin_group,resource_status FROM assets WHERE id=NEW.resource_id AND user_id=NEW.user_id FOR SHARE;
 ELSIF NEW.resource_type='knowledge' THEN SELECT group_id,status INTO origin_group,resource_status FROM knowledge_items WHERE id=NEW.resource_id AND user_id=NEW.user_id FOR SHARE;
 ELSE RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='GROUP_RESOURCE_SCOPE_CONFLICT:资源类型不支持';END IF;
 IF NOT FOUND OR origin_group IS DISTINCT FROM NEW.origin_group_id OR resource_status='deleted' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='GROUP_RESOURCE_SCOPE_CONFLICT:资源不可用或归属已变化';END IF;
 RETURN NEW;
END $function$
;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."account_skill_overlay_versions";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON account_skill_overlay_versions FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."account_skill_overlays";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON account_skill_overlays FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "workspace_grant_use" ON public."ai_messages";
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF attachments ON ai_messages FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "workspace_grant_use" ON public."ai_tasks";
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF input_data ON ai_tasks FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."artifacts";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON artifacts FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."artifacts";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON artifacts FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."asset_uploads";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON asset_uploads FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."assets";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON assets FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."audience_signals";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON audience_signals FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "t1022_audience_publication_group" ON public."audience_signals";
--> statement-breakpoint
CREATE TRIGGER t1022_audience_publication_group BEFORE INSERT OR UPDATE OF publication_id, account_id, user_id, group_id ON audience_signals FOR EACH ROW EXECUTE FUNCTION t1022_freeze_audience_publication_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "publication_child_group_stamp" ON public."audience_snapshots";
--> statement-breakpoint
CREATE TRIGGER publication_child_group_stamp BEFORE INSERT ON audience_snapshots FOR EACH ROW EXECUTE FUNCTION stamp_publication_child_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "research_child_group_stamp" ON public."benchmark_works";
--> statement-breakpoint
CREATE TRIGGER research_child_group_stamp BEFORE INSERT ON benchmark_works FOR EACH ROW EXECUTE FUNCTION research_child_group_stamp();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."calibration_results";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON calibration_results FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."calibration_results";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON calibration_results FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."calibration_rule_suggestions";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON calibration_rule_suggestions FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "page_read_revision_changed" ON public."candidates";
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON candidates FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."candidates";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON candidates FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "page_read_revision_changed" ON public."content_outputs";
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON content_outputs FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "workspace_grant_use" ON public."content_outputs";
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF primary_asset_id ON content_outputs FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "workspace_grant_use" ON public."export_records";
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF result_asset_id ON export_records FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "research_child_group_stamp" ON public."favorites_items";
--> statement-breakpoint
CREATE TRIGGER research_child_group_stamp BEFORE INSERT ON favorites_items FOR EACH ROW EXECUTE FUNCTION research_child_group_stamp();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."knowledge_folders";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON knowledge_folders FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."knowledge_items";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON knowledge_items FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "workspace_grant_use" ON public."knowledge_items";
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF asset_id ON knowledge_items FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."learning_applications";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON learning_applications FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."learning_applications";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON learning_applications FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."learnings";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON learnings FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."learnings";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON learnings FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "material_link_workspace_stamp" ON public."material_links";
--> statement-breakpoint
CREATE TRIGGER material_link_workspace_stamp BEFORE INSERT ON material_links FOR EACH ROW EXECUTE FUNCTION stamp_material_link_workspace();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "workspace_grant_use" ON public."material_links";
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF entity_id, entity_type ON material_links FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "metric_snapshots_group_stamp" ON public."metric_snapshots";
--> statement-breakpoint
CREATE TRIGGER metric_snapshots_group_stamp BEFORE INSERT ON metric_snapshots FOR EACH ROW EXECUTE FUNCTION stamp_metric_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "page_read_revision_changed" ON public."metric_snapshots";
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON metric_snapshots FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "metric_values_group_stamp" ON public."metric_values";
--> statement-breakpoint
CREATE TRIGGER metric_values_group_stamp BEFORE INSERT ON metric_values FOR EACH ROW EXECUTE FUNCTION stamp_metric_value_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "page_read_revision_changed" ON public."metric_values";
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON metric_values FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."pending_document_commits";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON pending_document_commits FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."pending_generated_asset_commits";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON pending_generated_asset_commits FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."predictions";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON predictions FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."predictions";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON predictions FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "page_read_revision_changed" ON public."projects";
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON projects FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "project_group_stamp" ON public."projects";
--> statement-breakpoint
CREATE TRIGGER project_group_stamp BEFORE INSERT ON projects FOR EACH ROW EXECUTE FUNCTION stamp_project_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "page_read_revision_changed" ON public."publication_revisions";
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON publication_revisions FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "workspace_grant_use" ON public."publication_revisions";
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF cover_asset_id ON publication_revisions FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "publication_child_group_stamp" ON public."publication_sync_state";
--> statement-breakpoint
CREATE TRIGGER publication_child_group_stamp BEFORE INSERT ON publication_sync_state FOR EACH ROW EXECUTE FUNCTION stamp_publication_child_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "publication_child_group_stamp" ON public."publication_traffic";
--> statement-breakpoint
CREATE TRIGGER publication_child_group_stamp BEFORE INSERT ON publication_traffic FOR EACH ROW EXECUTE FUNCTION stamp_publication_child_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "page_read_revision_changed" ON public."publications";
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON publications FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "publications_group_stamp" ON public."publications";
--> statement-breakpoint
CREATE TRIGGER publications_group_stamp BEFORE INSERT ON publications FOR EACH ROW EXECUTE FUNCTION stamp_publication_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "workspace_resource_grant_alive" ON public."resource_access_grants";
--> statement-breakpoint
CREATE TRIGGER workspace_resource_grant_alive BEFORE INSERT OR UPDATE OF revoked_at, resource_id, origin_group_id, target_group_id, user_id ON resource_access_grants FOR EACH ROW EXECUTE FUNCTION validate_workspace_resource_grant();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "page_read_revision_changed" ON public."retention_points";
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON retention_points FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "publication_child_group_stamp" ON public."retention_points";
--> statement-breakpoint
CREATE TRIGGER publication_child_group_stamp BEFORE INSERT ON retention_points FOR EACH ROW EXECUTE FUNCTION stamp_publication_child_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."review_insights";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON review_insights FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."review_insights";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON review_insights FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."reviews";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON reviews FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."reviews";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON reviews FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."rubric_versions";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON rubric_versions FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."rubric_versions";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON rubric_versions FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "legacy_shared_group_stamp" ON public."rubrics";
--> statement-breakpoint
CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON rubrics FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."rubrics";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON rubrics FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "workspace_grant_use" ON public."segment_assets";
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF asset_id ON segment_assets FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "research_child_group_stamp" ON public."topic_attributions";
--> statement-breakpoint
CREATE TRIGGER research_child_group_stamp BEFORE INSERT ON topic_attributions FOR EACH ROW EXECUTE FUNCTION research_child_group_stamp();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."topic_preferences";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON topic_preferences FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."topic_promotions";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON topic_promotions FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."topic_proposal_feedback";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON topic_proposal_feedback FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "shared_domain_group_stamp" ON public."topic_workspaces";
--> statement-breakpoint
CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON topic_workspaces FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group();
--> statement-breakpoint
DO $$ BEGIN IF current_setting('creatoros.first_group_upgrade')='true' THEN
INSERT INTO account_groups(id,user_id,name,status,version,created_at,updated_at)
 SELECT 'grp_legacy_'||id,user_id,account_handle,'active',1,created_at,updated_at FROM platform_accounts ON CONFLICT(id) DO NOTHING;


INSERT INTO account_group_memberships(id,user_id,group_id,platform_account_id,version,joined_at)
 SELECT 'gm_legacy_'||id,user_id,'grp_legacy_'||id,id,1,created_at FROM platform_accounts ON CONFLICT DO NOTHING;
 END IF; END $$;
--> statement-breakpoint
UPDATE public."account_skill_overlay_versions" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'account_skill_overlay_versions') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."account_skill_overlays" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'account_skill_overlays') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."ai_conversations" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."ai_conversations" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'ai_conversations') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."ai_tasks" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."ai_tasks" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'ai_tasks') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."article_anchors" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."article_anchors" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'article_anchors') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."article_candidates" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."article_candidates" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'article_candidates') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."article_text_candidates" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."article_text_candidates" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'article_text_candidates') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."artifacts" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."artifacts" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'artifacts') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."asset_tag_adoptions" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'asset_tag_adoptions') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."asset_uploads" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'asset_uploads') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."assets" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'assets') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."audience_signals" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'audience_signals') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."audience_snapshots" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'audience_snapshots') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."benchmark_sources" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'benchmark_sources') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."benchmark_works" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'benchmark_works') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."calibration_results" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'calibration_results') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."calibration_rule_suggestions" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'calibration_rule_suggestions') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."candidates" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'candidates') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."canvas_agent_proposals" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'canvas_agent_proposals') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."canvas_generation_links" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'canvas_generation_links') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."content_calendar_entries" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."content_calendar_entries" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'content_calendar_entries') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."creative_canvases" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."creative_canvases" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'creative_canvases') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."creative_result_bundles" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."creative_result_bundles" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'creative_result_bundles') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."creative_results" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."creative_results" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'creative_results') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."creator_profiles" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'creator_profiles') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."execution_control_receipts" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'execution_control_receipts') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."execution_tasks" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'execution_tasks') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."external_sources" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'external_sources') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."favorites_folders" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'favorites_folders') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."favorites_items" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'favorites_items') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."graphic_post_anchors" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."graphic_post_anchors" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'graphic_post_anchors') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."graphic_post_text_candidates" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."graphic_post_text_candidates" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'graphic_post_text_candidates') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."ingestion_runs" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'ingestion_runs') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."intelligence_collections" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'intelligence_collections') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."intelligence_item_metric_snapshots" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'intelligence_item_metric_snapshots') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."intelligence_item_source_observations" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'intelligence_item_source_observations') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."intelligence_item_transcripts" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'intelligence_item_transcripts') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."intelligence_items" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'intelligence_items') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."intelligence_migration_ledgers" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'intelligence_migration_ledgers') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."intelligence_source_collection_memberships" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'intelligence_source_collection_memberships') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."intelligence_source_snapshots" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'intelligence_source_snapshots') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."intelligence_sources" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'intelligence_sources') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."intelligence_sync_run_events" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'intelligence_sync_run_events') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."intelligence_sync_runs" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'intelligence_sync_runs') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."intelligence_transforms" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'intelligence_transforms') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."knowledge_adoptions" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'knowledge_adoptions') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."knowledge_folders" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'knowledge_folders') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."knowledge_items" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'knowledge_items') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."learning_applications" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."learning_applications" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'learning_applications') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."learnings" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."learnings" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'learnings') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."material_links" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."material_links" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'material_links') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."metric_snapshots" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'metric_snapshots') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."metric_values" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'metric_values') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."moments_anchors" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."moments_anchors" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'moments_anchors') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."moments_candidates" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'moments_candidates') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."moments_requests" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'moments_requests') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."notifications" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'notifications') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."output_create_requests" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."output_create_requests" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'output_create_requests') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."output_media_attempts" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."output_media_attempts" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'output_media_attempts') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."pending_document_commits" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'pending_document_commits') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."pending_generated_asset_commits" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'pending_generated_asset_commits') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."positioning_discovery_sessions" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'positioning_discovery_sessions') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."positioning_statements" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'positioning_statements') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."predictions" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'predictions') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."production_editor_file_binding_requests" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'production_editor_file_binding_requests') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."production_editor_file_bindings" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'production_editor_file_bindings') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."production_media_requests" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'production_media_requests') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."project_intelligence_references" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."project_intelligence_references" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'project_intelligence_references') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."project_transcription_requests" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."project_transcription_requests" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'project_transcription_requests') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."projects" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'projects') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."publication_cover_requests" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'publication_cover_requests') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."publication_result_adoptions" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'publication_result_adoptions') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."publication_result_anchors" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'publication_result_anchors') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."publication_sync_state" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'publication_sync_state') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."publication_text_candidates" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."publication_text_candidates" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'publication_text_candidates') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."publication_traffic" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'publication_traffic') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."publications" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'publications') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."publishing_cadences" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'publishing_cadences') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."retention_points" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'retention_points') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."review_insights" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'review_insights') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."reviews" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."reviews" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'reviews') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."rubric_versions" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'rubric_versions') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."rubrics" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'rubrics') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."scheduled_job" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'scheduled_job') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."search_documents" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'search_documents') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."topic_attributions" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."topic_attributions" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'topic_attributions') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."topic_preferences" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'topic_preferences') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."topic_promotions" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."topic_promotions" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'topic_promotions') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."topic_proposal_feedback" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."topic_proposal_feedback" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'topic_proposal_feedback') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."topic_workspaces" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'topic_workspaces') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."trend_sources" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'trend_sources') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."visual_template_favorites" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'visual_template_favorites') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."visual_template_mutation_receipts" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'visual_template_mutation_receipts') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."work_composition_requests" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'work_composition_requests') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."work_compositions" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."work_compositions" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'work_compositions') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."work_dependencies" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."work_dependencies" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'work_dependencies') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."work_material_associations" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."work_material_associations" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'work_material_associations') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."work_material_receipts" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'work_material_receipts') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."work_review_confirmations" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."work_review_confirmations" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'work_review_confirmations') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."work_review_reports" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."work_review_reports" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'work_review_reports') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."work_review_requests" child SET group_id=parent.group_id FROM projects parent WHERE child.group_id IS NULL AND child.project_id=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."work_review_requests" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'work_review_requests') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."workspace_blob_objects" child SET group_id=origin.id FROM account_groups origin WHERE child.group_id IS NULL AND NOT (current_setting('creatoros.existing_group_tables')::jsonb ? 'workspace_blob_objects') AND origin.id='grp_legacy_'||child.account_id AND origin.user_id=child.user_id;
--> statement-breakpoint
UPDATE public."canvas_generation_links" child SET group_id=parent.group_id FROM public."creative_canvases" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'canvas_generation_links')) AND child."canvas_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."canvas_agent_proposals" child SET group_id=parent.group_id FROM public."creative_canvases" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'canvas_agent_proposals')) AND child."canvas_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."work_composition_versions" child SET group_id=parent.group_id FROM public."work_compositions" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'work_composition_versions')) AND child."composition_id"=parent.id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."production_edit_versions" child SET group_id=parent.group_id FROM public."productions" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'production_edit_versions')) AND child."production_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."production_render_requests" child SET group_id=parent.group_id FROM public."productions" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'production_render_requests')) AND child."production_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."content_outputs" child SET group_id=parent.group_id FROM public."projects" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'content_outputs')) AND child."project_id"=parent.id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."productions" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'productions')) AND child."content_output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."production_segments" child SET group_id=parent.group_id FROM public."productions" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'production_segments')) AND child."production_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."production_edit_versions" child SET group_id=parent.group_id FROM public."productions" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'production_edit_versions')) AND child."production_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."production_render_requests" child SET group_id=parent.group_id FROM public."productions" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'production_render_requests')) AND child."production_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."segment_assets" child SET group_id=parent.group_id FROM public."production_segments" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'segment_assets')) AND child."production_segment_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."export_records" child SET group_id=parent.group_id FROM public."productions" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'export_records')) AND child."production_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."moments_candidates" child SET group_id=parent.group_id FROM public."moments_anchors" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'moments_candidates')) AND child."moments_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."moments_requests" child SET group_id=parent.group_id FROM public."moments_anchors" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'moments_requests')) AND child."target_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."work_composition_requests" child SET group_id=parent.group_id FROM public."work_compositions" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'work_composition_requests')) AND child."composition_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."work_material_receipts" child SET group_id=parent.group_id FROM public."work_compositions" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'work_material_receipts')) AND child."composition_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."work_material_associations" child SET group_id=parent.group_id FROM public."work_compositions" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'work_material_associations')) AND child."composition_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."work_dependencies" child SET group_id=parent.group_id FROM public."work_compositions" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'work_dependencies')) AND child."composition_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."work_review_reports" child SET group_id=parent.group_id FROM public."work_compositions" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'work_review_reports')) AND child."composition_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."work_review_confirmations" child SET group_id=parent.group_id FROM public."work_compositions" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'work_review_confirmations')) AND child."composition_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."work_review_requests" child SET group_id=parent.group_id FROM public."work_compositions" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'work_review_requests')) AND child."composition_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."publication_result_adoptions" child SET group_id=parent.group_id FROM public."publications" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'publication_result_adoptions')) AND child."publication_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."publication_cover_requests" child SET group_id=parent.group_id FROM public."publications" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'publication_cover_requests')) AND child."publication_id"=parent.id AND child.user_id=parent.user_id AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."article_anchors" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'article_anchors')) AND child."output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."article_candidates" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'article_candidates')) AND child."output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."article_text_candidates" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'article_text_candidates')) AND child."output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."creative_result_bundles" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'creative_result_bundles')) AND child."output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."creative_results" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'creative_results')) AND child."output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."graphic_post_anchors" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'graphic_post_anchors')) AND child."output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."graphic_post_text_candidates" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'graphic_post_text_candidates')) AND child."output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."output_create_requests" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'output_create_requests')) AND child."output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."output_media_attempts" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'output_media_attempts')) AND child."output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."production_editor_file_binding_requests" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'production_editor_file_binding_requests')) AND child."output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."production_editor_file_bindings" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'production_editor_file_bindings')) AND child."output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."production_media_requests" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'production_media_requests')) AND child."output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."publication_cover_requests" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'publication_cover_requests')) AND child."output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."publication_result_anchors" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'publication_result_anchors')) AND child."output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."publication_text_candidates" child SET group_id=parent.group_id FROM public."content_outputs" parent WHERE (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'publication_text_candidates')) AND child."output_id"=parent.id AND EXISTS(SELECT 1 FROM projects owner WHERE owner.id=parent.project_id AND owner.user_id=child.user_id) AND parent.group_id IS NOT NULL;
--> statement-breakpoint
UPDATE public."canvas_generation_links" child SET group_id=task.group_id,group_version=task.group_version,membership_version=task.membership_version FROM ai_tasks task WHERE child.task_id=task.id AND child.user_id=task.user_id AND task.group_id IS NOT NULL AND (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'canvas_generation_links'));
--> statement-breakpoint
UPDATE public."production_media_requests" child SET group_id=task.group_id,group_version=task.group_version,membership_version=task.membership_version FROM ai_tasks task WHERE child.task_id=task.id AND child.user_id=task.user_id AND task.group_id IS NOT NULL AND (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'production_media_requests'));
--> statement-breakpoint
UPDATE public."production_render_requests" child SET group_id=task.group_id,group_version=task.group_version,membership_version=task.membership_version FROM ai_tasks task WHERE child.task_id=task.id AND child.user_id=task.user_id AND task.group_id IS NOT NULL AND (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'production_render_requests'));
--> statement-breakpoint
UPDATE public."output_media_attempts" child SET group_id=task.group_id,group_version=task.group_version,membership_version=task.membership_version FROM ai_tasks task WHERE child.task_id=task.id AND child.user_id=task.user_id AND task.group_id IS NOT NULL AND (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'output_media_attempts'));
--> statement-breakpoint
UPDATE public."work_review_reports" child SET group_id=task.group_id,group_version=task.group_version,membership_version=task.membership_version FROM ai_tasks task WHERE child.task_id=task.id AND child.user_id=task.user_id AND task.group_id IS NOT NULL AND (child.group_id IS NULL OR NOT(current_setting('creatoros.existing_group_tables')::jsonb ? 'work_review_reports'));
