ALTER TABLE "model_configurations" ADD COLUMN IF NOT EXISTS "keyring_ref" text;
--> statement-breakpoint
ALTER TABLE "model_configurations" ADD COLUMN IF NOT EXISTS "credential_migration_state" text NOT NULL DEFAULT 'not_required';
--> statement-breakpoint
ALTER TABLE "model_configurations" ADD COLUMN IF NOT EXISTS "rotated_at" text;
--> statement-breakpoint
ALTER TABLE "channel_model_credentials" ALTER COLUMN "encrypted_secret" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "channel_model_credentials" ADD COLUMN IF NOT EXISTS "keyring_ref" text;
--> statement-breakpoint
ALTER TABLE "channel_model_credentials" ADD COLUMN IF NOT EXISTS "service_type" text NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE "channel_model_credentials" ADD COLUMN IF NOT EXISTS "credential_status" text NOT NULL DEFAULT 'migration_pending';
--> statement-breakpoint
ALTER TABLE "channel_model_credentials" ADD COLUMN IF NOT EXISTS "migration_state" text NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "channel_model_credentials" ADD COLUMN IF NOT EXISTS "rotated_at" text;
