CREATE TABLE "work_material_associations" (
 "id" text PRIMARY KEY NOT NULL,"user_id" text NOT NULL,"account_id" text NOT NULL,"project_id" text NOT NULL,"composition_id" text NOT NULL,"snapshot" jsonb NOT NULL,"rule_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_material_receipts" (
 "id" text PRIMARY KEY NOT NULL,"user_id" text NOT NULL,"account_id" text NOT NULL,"composition_id" text NOT NULL,"request_id" text NOT NULL,"request_digest" text NOT NULL,"snapshot" jsonb NOT NULL,"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "work_material_receipts_scope_ux" ON "work_material_receipts" ("user_id","account_id","request_id");
--> statement-breakpoint
CREATE TABLE "work_dependencies" (
 "id" text PRIMARY KEY NOT NULL,"user_id" text NOT NULL,"account_id" text NOT NULL,"project_id" text NOT NULL,"composition_id" text NOT NULL,"snapshot" jsonb NOT NULL,"material_target" jsonb,"created_at" text NOT NULL
);
