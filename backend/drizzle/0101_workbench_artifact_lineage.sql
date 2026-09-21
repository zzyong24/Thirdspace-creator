CREATE TABLE IF NOT EXISTS "workbench_artifact_lineages" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "account_id" text NOT NULL,
  "conversation_id" text NOT NULL REFERENCES "ai_conversations"("id"),
  "artifact_id" text NOT NULL,
  "current_version" integer DEFAULT 0 NOT NULL,
  "state" text DEFAULT 'committed' NOT NULL,
  "pending_operation_id" text,
  "pending_task_id" text REFERENCES "execution_tasks"("id"),
  "pending_request_digest" text,
  "pending_metadata" jsonb,
  "pending_source" jsonb,
  "pending_html_resources" jsonb,
  "reconciliation_claim_id" text,
  "reconciliation_lease_expires_at" text,
  "last_operation_id" text,
  "last_error_code" text,
  "migration_reason" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workbench_artifact_lineages_owner_artifact_unique"
  ON "workbench_artifact_lineages" ("user_id","account_id","conversation_id","artifact_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workbench_artifact_lineages_pending_operation_unique"
  ON "workbench_artifact_lineages" ("pending_operation_id");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workbench_artifact_lineage_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "lineage_id" text NOT NULL REFERENCES "workbench_artifact_lineages"("id"),
  "artifact_id" text NOT NULL,
  "version" integer NOT NULL,
  "task_id" text NOT NULL REFERENCES "execution_tasks"("id"),
  "operation_id" text NOT NULL REFERENCES "execution_calls"("id"),
  "request_digest" text NOT NULL,
  "metadata" jsonb NOT NULL,
  "source" jsonb NOT NULL,
  "html_resources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workbench_artifact_lineage_versions_lineage_version_unique"
  ON "workbench_artifact_lineage_versions" ("lineage_id","version");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workbench_artifact_lineage_versions_task_operation_unique"
  ON "workbench_artifact_lineage_versions" ("task_id","operation_id");
