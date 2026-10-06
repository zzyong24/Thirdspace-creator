CREATE TABLE "asr_usage_intents" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "account_scope" text NOT NULL,
  "intent_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "service_id" text NOT NULL,
  "duration_seconds" integer NOT NULL,
  "byte_length" integer NOT NULL,
  "lease_ref" text,
  "charged_units" integer,
  "expires_at" text,
  "provider_outcome" text DEFAULT 'not_started' NOT NULL,
  "fallback_reason" text,
  "reconcile_state" text DEFAULT 'requesting' NOT NULL,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL,
  CONSTRAINT "asr_usage_intents_no_token_columns" CHECK (
    "service_id" = 'qwen-asr-main' AND
    ("charged_units" IS NULL OR "charged_units" = 25000)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "asr_usage_intents_idempotency_unique" ON "asr_usage_intents" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "asr_usage_intents_scope_intent_unique" ON "asr_usage_intents" USING btree ("user_id","account_scope","intent_id");
--> statement-breakpoint
CREATE INDEX "asr_usage_intents_reconcile_idx" ON "asr_usage_intents" USING btree ("reconcile_state","updated_at");
