CREATE TABLE IF NOT EXISTS "output_create_requests" (
  "user_id" text NOT NULL,
  "account_id" text NOT NULL,
  "client_request_id" text NOT NULL,
  "request_digest" text NOT NULL,
  "project_id" text NOT NULL,
  "output_id" text NOT NULL,
  "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "output_create_requests_owner_key_ux" ON "output_create_requests" ("user_id", "account_id", "client_request_id");
--> statement-breakpoint
ALTER TABLE "article_anchors" ADD COLUMN IF NOT EXISTS "request_digest" text;
