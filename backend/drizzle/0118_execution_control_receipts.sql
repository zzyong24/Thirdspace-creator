CREATE TABLE "execution_control_receipts" (
 "id" text PRIMARY KEY NOT NULL,
 "user_id" text NOT NULL,
 "account_id" text NOT NULL,
 "idempotency_key" text NOT NULL,
 "request_digest" text NOT NULL,
 "result" jsonb NOT NULL,
 "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "execution_control_receipts_scope_key_uq" ON "execution_control_receipts" ("user_id", "account_id", "idempotency_key");
