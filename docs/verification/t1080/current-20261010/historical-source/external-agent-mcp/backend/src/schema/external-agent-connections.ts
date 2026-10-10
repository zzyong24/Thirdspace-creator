import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

/** 持久配对授权。短期令牌只保存摘要；撤销和换范围由 revision 使旧令牌失效。 */
export const externalAgentConnections = pgTable("external_agent_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  clientKind: text("client_kind").notNull(),
  accountId: text("account_id").notNull(),
  projectId: text("project_id"),
  allowedOps: jsonb("allowed_ops").$type<string[]>().notNull(),
  revision: text("revision").notNull(),
  credentialHash: text("credential_hash").notNull(),
  credentialExpiresAt: text("credential_expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastInvocationAt: text("last_invocation_at"),
  revokedAt: text("revoked_at"),
}, table => [index("ix_external_agent_connections_user").on(table.userId),uniqueIndex("ux_external_agent_connections_create").on(table.userId,table.accountId,table.idempotencyKey)]);

export type ExternalAgentConnectionRow = typeof externalAgentConnections.$inferSelect;
