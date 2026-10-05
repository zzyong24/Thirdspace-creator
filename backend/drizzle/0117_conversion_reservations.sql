ALTER TABLE "creative_result_bundles" ADD COLUMN "conversion_context" jsonb;
--> statement-breakpoint
ALTER TABLE "creative_result_bundles" ADD COLUMN "target_creation_key" text;
--> statement-breakpoint
ALTER TABLE "creative_result_bundles" ALTER COLUMN "output_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "creative_result_bundles" ADD CONSTRAINT "creative_result_bundles_pending_conversion_ck" CHECK ("output_id" IS NOT NULL OR ("conversion_context" IS NOT NULL AND "target_creation_key" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "creative_results" ADD COLUMN "conversion_context" jsonb;
--> statement-breakpoint
ALTER TABLE "creative_results" ADD COLUMN "adoption_client_request_id" text;
