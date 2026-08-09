import { and, eq, type Db, type RequestContext } from "@creatoros/backend";
import { asrUsageIntents } from "@creatoros/backend";

export type AsrUsageIntent = typeof asrUsageIntents.$inferSelect;

export type BeginAsrUsageInput = {
  readonly intentId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly serviceId: "qwen-asr-main";
  readonly durationSeconds: number;
  readonly byteLength: number;
};

export interface AsrUsageRepository {
  begin(ctx: RequestContext, input: BeginAsrUsageInput): Promise<AsrUsageIntent>;
  recordLease(
    ctx: RequestContext,
    intentId: string,
    lease: { readonly leaseRef: string; readonly chargedUnits: number; readonly expiresAt: string },
  ): Promise<void>;
  recordLeaseUncertain(ctx: RequestContext, intentId: string, reason: string): Promise<void>;
  recordLeaseRejected(ctx: RequestContext, intentId: string, reason: string): Promise<void>;
  recordProviderUsed(ctx: RequestContext, intentId: string): Promise<void>;
  recordFallbackPending(ctx: RequestContext, intentId: string, reason: string): Promise<void>;
  listPending(ctx: RequestContext): Promise<AsrUsageIntent[]>;
}

function scope(ctx: RequestContext): string {
  return ctx.accountId ?? "no-account";
}

export function createAsrUsageRepository(
  db: Db,
  deps: { readonly now: () => string; readonly nextId: (prefix: string) => string },
): AsrUsageRepository {
  const owned = (ctx: RequestContext, intentId: string) =>
    and(
      eq(asrUsageIntents.userId, ctx.userId),
      eq(asrUsageIntents.accountScope, scope(ctx)),
      eq(asrUsageIntents.intentId, intentId),
    );

  return {
    async begin(ctx, input) {
      const now = deps.now();
      await db.insert(asrUsageIntents).values({
        id: deps.nextId("asr_intent"),
        userId: ctx.userId,
        accountScope: scope(ctx),
        ...input,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing({ target: asrUsageIntents.idempotencyKey });

      const [row] = await db.select().from(asrUsageIntents).where(
        eq(asrUsageIntents.idempotencyKey, input.idempotencyKey),
      ).limit(1);
      if (
        !row ||
        row.userId !== ctx.userId ||
        row.accountScope !== scope(ctx) ||
        row.intentId !== input.intentId ||
        row.requestFingerprint !== input.requestFingerprint
      ) {
        throw new Error("ASR_USAGE_IDEMPOTENCY_CONFLICT");
      }
      return row;
    },

    async recordLease(ctx, intentId, lease) {
      await db.update(asrUsageIntents).set({
        leaseRef: lease.leaseRef,
        chargedUnits: lease.chargedUnits,
        expiresAt: lease.expiresAt,
        providerOutcome: "lease_issued",
        reconcileState: "issued",
        updatedAt: deps.now(),
      }).where(owned(ctx, intentId));
    },

    async recordLeaseUncertain(ctx, intentId, reason) {
      await db.update(asrUsageIntents).set({
        providerOutcome: "lease_uncertain",
        fallbackReason: reason,
        reconcileState: "manual_review",
        updatedAt: deps.now(),
      }).where(owned(ctx, intentId));
    },

    async recordLeaseRejected(ctx, intentId, reason) {
      await db.update(asrUsageIntents).set({
        providerOutcome: "not_issued",
        fallbackReason: reason,
        reconcileState: "refunded",
        updatedAt: deps.now(),
      }).where(owned(ctx, intentId));
    },

    async recordProviderUsed(ctx, intentId) {
      await db.update(asrUsageIntents).set({
        providerOutcome: "succeeded",
        reconcileState: "used",
        updatedAt: deps.now(),
      }).where(owned(ctx, intentId));
    },

    async recordFallbackPending(ctx, intentId, reason) {
      await db.update(asrUsageIntents).set({
        providerOutcome: "failed",
        fallbackReason: reason,
        reconcileState: "reconcile_pending",
        updatedAt: deps.now(),
      }).where(owned(ctx, intentId));
    },

    async listPending(ctx) {
      return db.select().from(asrUsageIntents).where(and(
        eq(asrUsageIntents.userId, ctx.userId),
        eq(asrUsageIntents.accountScope, scope(ctx)),
        eq(asrUsageIntents.reconcileState, "reconcile_pending"),
      ));
    },
  };
}
