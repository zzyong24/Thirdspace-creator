import { sql } from "drizzle-orm";
import { pgTable, text, integer, uniqueIndex, index, check } from "drizzle-orm/pg-core";

// T-731：按次收费 ASR 的本地非敏感追踪。严禁增加 token、ticket、machineId 或音频字段。
export const asrUsageIntents = pgTable(
  "asr_usage_intents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountScope: text("account_scope").notNull(),
    intentId: text("intent_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    serviceId: text("service_id").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    byteLength: integer("byte_length").notNull(),
    leaseRef: text("lease_ref"),
    chargedUnits: integer("charged_units"),
    expiresAt: text("expires_at"),
    providerOutcome: text("provider_outcome").notNull().default("not_started"),
    fallbackReason: text("fallback_reason"),
    reconcileState: text("reconcile_state").notNull().default("requesting"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("asr_usage_intents_idempotency_unique").on(table.idempotencyKey),
    uniqueIndex("asr_usage_intents_scope_intent_unique").on(
      table.userId,
      table.accountScope,
      table.intentId,
    ),
    index("asr_usage_intents_reconcile_idx").on(
      table.reconcileState,
      table.updatedAt,
    ),
    check(
      "asr_usage_intents_no_token_columns",
      sql`${table.serviceId} = 'qwen-asr-main' AND (${table.chargedUnits} IS NULL OR ${table.chargedUnits} = 25000)`,
    ),
  ],
);

export type AsrUsageIntentRow = typeof asrUsageIntents.$inferSelect;
