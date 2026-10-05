CREATE TABLE "work_compositions" (
 "id" text PRIMARY KEY NOT NULL,"user_id" text NOT NULL,"account_id" text NOT NULL,"project_id" text NOT NULL,
 "current_revision" integer NOT NULL,"created_at" text NOT NULL,"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_composition_versions" (
 "id" text PRIMARY KEY NOT NULL,"composition_id" text NOT NULL,"revision" integer NOT NULL,"snapshot" jsonb NOT NULL,"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "work_composition_versions_revision_ux" ON "work_composition_versions" ("composition_id","revision");
--> statement-breakpoint
CREATE TABLE "work_composition_requests" (
 "id" text PRIMARY KEY NOT NULL,"user_id" text NOT NULL,"account_id" text NOT NULL,"request_id" text NOT NULL,"request_digest" text NOT NULL,
 "composition_id" text,"operation" text NOT NULL,"input" jsonb NOT NULL,"status" text NOT NULL,
 "result_revision" integer,"member_reservation" jsonb,"error_code" text,"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "work_composition_requests_scope_ux" ON "work_composition_requests" ("user_id","account_id","request_id");
