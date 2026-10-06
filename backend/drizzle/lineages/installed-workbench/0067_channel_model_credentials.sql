CREATE TABLE IF NOT EXISTS "channel_model_credentials" (
	"user_id" text NOT NULL,
	"scope_id" text NOT NULL,
	"service_id" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "channel_model_credentials_user_id_scope_id_service_id_unique" UNIQUE("user_id","scope_id","service_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_channel_model_credentials_owner_scope_service" ON "channel_model_credentials" USING btree ("user_id","scope_id","service_id");
