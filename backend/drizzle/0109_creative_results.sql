CREATE TABLE IF NOT EXISTS "creative_results" (
  "id" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL, "account_id" text NOT NULL,
  "project_id" text NOT NULL, "output_id" text NOT NULL, "output_type" text NOT NULL,
  "target_platform" text, "kind" text NOT NULL, "owner" text NOT NULL,
  "candidate_id" text, "task_id" text, "base_version_id" text,
  "rule_snapshot_ref" text, "source_refs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "applied_rules" text NOT NULL DEFAULT 'not_applied', "request_digest" text NOT NULL,
  "client_request_id" text NOT NULL, "status" text NOT NULL DEFAULT 'queued',
  "error_code" text, "adoption_receipt" jsonb, "adoption_digest" text,
  "retry_of" text, "bundle_id" text, "created_at" text NOT NULL, "updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creative_results_request_ux" ON "creative_results" ("user_id", "account_id", "client_request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_results_output_ix" ON "creative_results" ("user_id", "account_id", "output_id", "created_at", "id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creative_result_bundles" (
  "id" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL, "account_id" text NOT NULL,
  "project_id" text NOT NULL, "output_id" text NOT NULL, "items" jsonb NOT NULL,
  "request_digest" text NOT NULL, "client_request_id" text NOT NULL, "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creative_result_bundles_request_ux" ON "creative_result_bundles" ("user_id", "account_id", "client_request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "creative_result_bundles_output_ix" ON "creative_result_bundles" ("user_id", "account_id", "output_id", "created_at", "id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "output_media_attempts" (
  "id" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL, "account_id" text NOT NULL,
  "project_id" text NOT NULL, "output_id" text NOT NULL, "kind" text NOT NULL,
  "task_id" text NOT NULL, "candidate_id" text, "asset_id" text, "asset_file_id" text,
  "client_request_id" text NOT NULL, "request_digest" text NOT NULL, "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "output_media_attempts_task_ux" ON "output_media_attempts" ("task_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "output_media_attempts_request_ux" ON "output_media_attempts" ("user_id", "account_id", "client_request_id");
