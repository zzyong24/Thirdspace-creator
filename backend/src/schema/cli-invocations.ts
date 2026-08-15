import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

// T-843 delegated CLI invocation 审计 + Gateway 幂等收据。只存 input hash/目标引用；
// 业务响应以 master-key 密文短期缓存，正文和密钥不进入审计明文字段。
export const cliInvocations = pgTable(
  "cli_invocations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountId: text("account_id"),
    accountScope: text("account_scope").notNull(),
    clientId: text("client_id").notNull(),
    operation: text("operation").notNull(),
    effect: text("effect").notNull(),
    idempotencyKey: text("idempotency_key"),
    inputHash: text("input_hash").notNull(),
    targetRefs: jsonb("target_refs").$type<string[]>().notNull().default([]),
    requestId: text("request_id").notNull(),
    status: text("status").notNull(),
    taskId: text("task_id"),
    errorCode: text("error_code"),
    receivedAt: text("received_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    finishedAt: text("finished_at"),
  },
  (table) => [
    uniqueIndex("ux_cli_invocations_idempotency").on(
      table.userId,
      table.accountScope,
      table.operation,
      table.idempotencyKey,
    ),
    index("ix_cli_invocations_recent").on(table.userId, table.updatedAt),
  ],
);

// 与审计行物理分表：短期、可删除的响应密文不污染长期 invocation 审计。
export const cliInvocationResults = pgTable("cli_invocation_results", {
  invocationId: text("invocation_id").primaryKey(),
  resultEncrypted: text("result_encrypted").notNull(),
  responseSchemaVersion: text("response_schema_version").notNull(),
  resultExpiresAt: text("result_expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export type CliInvocationRow = typeof cliInvocations.$inferSelect;
export type CliInvocationResultRow = typeof cliInvocationResults.$inferSelect;
