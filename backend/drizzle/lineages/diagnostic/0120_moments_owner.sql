CREATE TABLE "moments_anchors" (
 "id" text PRIMARY KEY NOT NULL,"user_id" text NOT NULL,"account_id" text NOT NULL,
 "project_id" text NOT NULL,"artifact_id" text NOT NULL,"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "moments_anchors_artifact_ux" ON "moments_anchors" ("artifact_id");
--> statement-breakpoint
CREATE TABLE "moments_requests" (
 "id" text PRIMARY KEY NOT NULL,"user_id" text NOT NULL,"account_id" text NOT NULL,
 "request_id" text NOT NULL,"request_digest" text NOT NULL,"operation" text NOT NULL,
 "params" jsonb,"input" jsonb NOT NULL,"target_id" text,"version_id" text,"status" text NOT NULL,"error_code" text,"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "moments_requests_scope_ux" ON "moments_requests" ("user_id","account_id","request_id");
