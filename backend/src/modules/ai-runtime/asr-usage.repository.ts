import { and, eq, type Db, type RequestContext } from "@creatoros/backend";
import { asrUsageIntents } from "@creatoros/backend";
import { createHash } from "node:crypto";

export type AsrUsageIntent = typeof asrUsageIntents.$inferSelect;

export type BeginAsrUsageInput = {
  readonly intentId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly inputFingerprint: string;
  readonly sourceRef: string;
  readonly trigger: string;
  readonly authorityDigest: string;
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
  recordLeaseStatus(
    ctx: RequestContext,
    intentId: string,
    status: {
      readonly result: "not_issued" | "provider_unknown" | "released" | "charged_expired";
      readonly leaseRef: string | null;
      readonly chargedUnits: number;
    },
  ): Promise<void>;
  recordProviderUsed(ctx: RequestContext, intentId: string): Promise<void>;
  recordProviderFailed(ctx: RequestContext, intentId: string, reason: string): Promise<void>;
  listPending(ctx: RequestContext): Promise<AsrUsageIntent[]>;
  listByIntent(ctx: RequestContext, intentId: string): Promise<AsrUsageIntent[]>;
}

function scope(ctx: RequestContext): string {
  return ctx.accountId ?? "no-account";
}

function activeOperationKey(ctx: RequestContext, sourceRef: string): string {
  return `sha256:${createHash("sha256")
    .update([ctx.userId, scope(ctx), sourceRef].join(":"))
    .digest("hex")}`;
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
      const activeKey = activeOperationKey(ctx, input.sourceRef);
      await db.insert(asrUsageIntents).values({
        id: deps.nextId("asr_intent"),
        userId: ctx.userId,
        accountScope: scope(ctx),
        ...input,
        activeOperationKey: activeKey,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();

      const [row] = await db.select().from(asrUsageIntents).where(
        eq(asrUsageIntents.idempotencyKey, input.idempotencyKey),
      ).limit(1);
      if (!row) {
        const [active] = await db.select().from(asrUsageIntents).where(
          eq(asrUsageIntents.activeOperationKey, activeKey),
        ).limit(1);
        if (active) throw new Error("ASR_USAGE_ACTIVE_CONFLICT");
        throw new Error("ASR_USAGE_BEGIN_FAILED");
      }
      if (
        row.userId !== ctx.userId ||
        row.accountScope !== scope(ctx) ||
        row.intentId !== input.intentId ||
        row.sourceRef !== input.sourceRef ||
        row.inputFingerprint !== input.inputFingerprint ||
        row.authorityDigest !== input.authorityDigest
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
        phase: "provider_calling",
        reconcileState: "issued",
        updatedAt: deps.now(),
      }).where(owned(ctx, intentId));
    },

    async recordLeaseUncertain(ctx, intentId, reason) {
      await db.update(asrUsageIntents).set({
        providerOutcome: "lease_uncertain",
        phase: "lease_requesting",
        fallbackReason: reason,
        reconcileState: "manual_review",
        updatedAt: deps.now(),
      }).where(owned(ctx, intentId));
    },

    async recordLeaseRejected(ctx, intentId, reason) {
      await db.update(asrUsageIntents).set({
        providerOutcome: "not_issued",
        phase: "ticket_acquiring",
        fallbackReason: reason,
        reconcileState: "refunded",
        updatedAt: deps.now(),
      }).where(owned(ctx, intentId));
    },

    async recordLeaseStatus(ctx, intentId, status) {
      const terminal = status.result === "released" || status.result === "charged_expired";
      await db.update(asrUsageIntents).set({
        leaseRef: status.leaseRef,
        chargedUnits: status.chargedUnits,
        providerOutcome: status.result,
        reconcileState: terminal ? "terminal" : status.result === "provider_unknown"
          ? "provider_unknown"
          : "requesting",
        phase: "lease_requesting",
        activeOperationKey: terminal ? null : undefined,
        updatedAt: deps.now(),
      }).where(owned(ctx, intentId));
    },

    async recordProviderUsed(ctx, intentId) {
      await db.update(asrUsageIntents).set({
        providerOutcome: "succeeded",
        reconcileState: "used",
        phase: "used",
        activeOperationKey: null,
        updatedAt: deps.now(),
      }).where(owned(ctx, intentId));
    },

    async recordProviderFailed(ctx, intentId, reason) {
      await db.update(asrUsageIntents).set({
        providerOutcome: "charged_provider_failed",
        fallbackReason: reason,
        reconcileState: "terminal",
        phase: "provider_calling",
        activeOperationKey: null,
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

    async listByIntent(ctx, intentId) {
      return db.select().from(asrUsageIntents).where(owned(ctx, intentId));
    },
  };
}
