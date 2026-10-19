CREATE TABLE "production_media_requests" (
 "id" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL, "account_id" text NOT NULL, "output_id" text NOT NULL,
 "request_id" text NOT NULL, "request_digest" text NOT NULL, "kind" text NOT NULL, "frozen_input" jsonb NOT NULL,
 "task_id" text, "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "production_media_requests_scope_ux" ON "production_media_requests" ("user_id", "account_id", "output_id", "request_id");
