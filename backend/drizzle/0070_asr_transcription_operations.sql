ALTER TABLE "asr_usage_intents" ADD COLUMN "source_ref" text;
--> statement-breakpoint
ALTER TABLE "asr_usage_intents" ADD COLUMN "input_fingerprint" text;
--> statement-breakpoint
ALTER TABLE "asr_usage_intents" ADD COLUMN "trigger" text;
--> statement-breakpoint
ALTER TABLE "asr_usage_intents" ADD COLUMN "authority_digest" text;
--> statement-breakpoint
ALTER TABLE "asr_usage_intents" ADD COLUMN "active_operation_key" text;
--> statement-breakpoint
ALTER TABLE "asr_usage_intents" ADD COLUMN "phase" text DEFAULT 'preflight' NOT NULL;
--> statement-breakpoint
ALTER TABLE "asr_usage_intents" DROP CONSTRAINT "asr_usage_intents_no_token_columns";
--> statement-breakpoint
ALTER TABLE "asr_usage_intents" ADD CONSTRAINT "asr_usage_intents_no_token_columns"
CHECK ("service_id" = 'qwen-asr-main' AND ("charged_units" IS NULL OR "charged_units" IN (0, 25000)));
--> statement-breakpoint
UPDATE "asr_usage_intents"
SET
  "source_ref" = "intent_id",
  "input_fingerprint" = "request_fingerprint",
  "trigger" = 'legacy',
  "authority_digest" = "request_fingerprint"
WHERE "source_ref" IS NULL;
--> statement-breakpoint
ALTER TABLE "asr_usage_intents" ALTER COLUMN "source_ref" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "asr_usage_intents" ALTER COLUMN "input_fingerprint" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "asr_usage_intents" ALTER COLUMN "trigger" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "asr_usage_intents" ALTER COLUMN "authority_digest" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "asr_usage_intents_active_operation_unique"
ON "asr_usage_intents" USING btree ("active_operation_key");
