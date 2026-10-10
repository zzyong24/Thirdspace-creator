CREATE TABLE IF NOT EXISTS "external_agent_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "client_kind" text NOT NULL,
  "account_id" text NOT NULL,
  "project_id" text,
  "allowed_ops" jsonb NOT NULL,
  "revision" text NOT NULL,
  "credential_hash" text NOT NULL,
  "credential_expires_at" text NOT NULL,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL,
  "last_invocation_at" text,
  "revoked_at" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_external_agent_connections_user" ON "external_agent_connections" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_external_agent_connections_create" ON "external_agent_connections" ("user_id","account_id","idempotency_key");
