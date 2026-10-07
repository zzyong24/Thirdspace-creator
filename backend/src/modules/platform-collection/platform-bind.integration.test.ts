import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb } from "../../db";
import { platformAccounts } from "../../schema/platform-account";
import { platformBindAttempts, platformCollectionBindings } from "../../schema/platform-collection";
import { createPlatformCollectionService } from "./platform-collection.service";
import { createVerifiedAccountBindingPort } from "../platform-account";

const time = "2026-09-30T00:00:00.000Z";
const ctx = (userId: string) => ({ userId, requestId: "request", source: "user" as const });

async function fixture() {
  const { db, client } = await createDb();
  let n = 0;
  const clock = { value: time };
  const cleanupState = { fail: false };
  const cleanup: string[] = [];
  const service = createPlatformCollectionService({ db, now: () => clock.value,
    nextId: prefix => `${prefix}-${++n}`,
    sourceAdapters: { xiaohongshu: ["bind", "workCatalog"].map(capability => ({
      platform: "xiaohongshu" as const, capability: capability as "bind" | "workCatalog",
      supported: true, authState: "authorized" as const, runtimeState: "ready" as const,
      reasonCode: null, lastVerifiedAt: time,
    })) },
    revokeTemporaryProfile: async attemptId => { cleanup.push(attemptId); if (cleanupState.fail) throw new Error("cleanup unavailable"); },
    accountBindingPort: createVerifiedAccountBindingPort({ now: () => clock.value,
      nextId: prefix => `${prefix}-${++n}`, allowedPlatforms: new Set(["xiaohongshu"]) }),
  });
  const proof = (bindAttemptId: string, platformIdentity = "platform-id") => ({
    bindAttemptId, platform: "xiaohongshu", platformIdentity, proofSource: "trusted-adapter",
    scopes: ["workCatalog" as const, "accountOverview" as const], verifiedAt: time, expiresAt: null,
  });
  return { db, client, service, clock, cleanup, cleanupState, proof };
}

describe("platform bind with durable attempts and an atomic account port", () => {
  it("binds only a trusted recorded identity, and replays begin/confirm without duplicate accounts", async () => {
    const f = await fixture();
    try {
      const input = { platform: "xiaohongshu", clientRequestId: "req-1" };
      const attempt = await f.service.bindBegin(ctx("user-a"), input);
      expect(await f.service.bindBegin(ctx("user-a"), input)).toEqual(attempt);
      await expect(f.service.bindConfirm(ctx("user-a"), { bindAttemptId: attempt.bindAttemptId }))
        .rejects.toMatchObject({ code: "WRONG_PLATFORM_IDENTITY" });
      await expect(f.service.recordVerifiedIdentity({ ...f.proof(attempt.bindAttemptId), platform: "kuaishou" }))
        .rejects.toMatchObject({ code: "WRONG_PLATFORM_IDENTITY" });
      await f.service.recordVerifiedIdentity(f.proof(attempt.bindAttemptId));
      await expect(f.service.recordVerifiedIdentity(f.proof(attempt.bindAttemptId, "other-id")))
        .rejects.toMatchObject({ code: "WRONG_PLATFORM_IDENTITY" });
      const bound = await f.service.bindConfirm(ctx("user-a"), { bindAttemptId: attempt.bindAttemptId });
      expect(bound).toMatchObject({ status: "bound", verifiedPlatformIdentity: "platform-id" });
      expect(await f.service.bindConfirm(ctx("user-a"), { bindAttemptId: attempt.bindAttemptId })).toEqual(bound);
      expect((await f.db.select().from(platformAccounts).where(eq(platformAccounts.userId, "user-a"))).length).toBe(1);
      expect((await f.db.select().from(platformCollectionBindings)).length).toBe(1);
      expect(f.cleanup).toContain(attempt.bindAttemptId);
    } finally { await f.client.close(); }
  });

  it("keeps the same platform identity separately owned for two CreatorOS users", async () => {
    const f = await fixture();
    try {
      const a = await f.service.bindBegin(ctx("user-a"), { platform: "xiaohongshu", clientRequestId: "r" });
      const b = await f.service.bindBegin(ctx("user-b"), { platform: "xiaohongshu", clientRequestId: "r" });
      await f.service.recordVerifiedIdentity(f.proof(a.bindAttemptId));
      await f.service.recordVerifiedIdentity(f.proof(b.bindAttemptId));
      const boundA = await f.service.bindConfirm(ctx("user-a"), { bindAttemptId: a.bindAttemptId });
      const boundB = await f.service.bindConfirm(ctx("user-b"), { bindAttemptId: b.bindAttemptId });
      expect(boundA.accountId).not.toBe(boundB.accountId);
      await expect(f.service.bindConfirm(ctx("user-b"), { bindAttemptId: a.bindAttemptId }))
        .rejects.toMatchObject({ code: "FORBIDDEN_ACCOUNT" });
      expect((await f.db.select().from(platformCollectionBindings)).length).toBe(2);
    } finally { await f.client.close(); }
  });

  it("persists expiry and cancel, rejecting late proof and cleanup", async () => {
    const f = await fixture();
    try {
      const expired = await f.service.bindBegin(ctx("user-a"), { platform: "xiaohongshu", clientRequestId: "expire" });
      await f.service.recordVerifiedIdentity(f.proof(expired.bindAttemptId));
      f.clock.value = "2026-09-30T00:11:00.000Z";
      await expect(f.service.bindConfirm(ctx("user-a"), { bindAttemptId: expired.bindAttemptId }))
        .rejects.toMatchObject({ code: "BIND_EXPIRED" });
      const [row] = await f.db.select().from(platformBindAttempts).where(eq(platformBindAttempts.id, expired.bindAttemptId));
      expect(row?.status).toBe("expired");
      expect(f.cleanup).toContain(expired.bindAttemptId);
      const cancelled = await f.service.bindBegin(ctx("user-a"), { platform: "xiaohongshu", clientRequestId: "cancel" });
      expect((await f.service.bindCancel(ctx("user-a"), { bindAttemptId: cancelled.bindAttemptId })).status).toBe("cancelled");
      await expect(f.service.recordVerifiedIdentity({ ...f.proof(cancelled.bindAttemptId), verifiedAt: time }))
        .rejects.toMatchObject({ code: "BIND_EXPIRED" });
      expect((await f.db.select().from(platformAccounts)).length).toBe(0);
    } finally { await f.client.close(); }
  });

  it("does not let an old manually active account collect without a verified binding", async () => {
    const f = await fixture();
    try {
      await f.db.insert(platformAccounts).values({ id: "manual", userId: "user-a", platform: "xiaohongshu",
        accountHandle: "manual", externalAccountId: "platform-id", createdAt: time, updatedAt: time });
      await expect(f.service.start({ ...ctx("user-a"), accountId: "manual" }, {
        accountId: "manual", capability: "workCatalog", clientRequestId: "collect",
      })).rejects.toMatchObject({ code: "SCOPE_MISSING" });
    } finally { await f.client.close(); }
  });

  it("rejects proof observed before begin and keeps cleanup failures retryable after a successful bind", async () => {
    const f = await fixture();
    try {
      const attempt = await f.service.bindBegin(ctx("user-a"), { platform: "xiaohongshu", clientRequestId: "r" });
      await expect(f.service.recordVerifiedIdentity({ ...f.proof(attempt.bindAttemptId), verifiedAt: "2026-09-29T23:59:59.000Z" }))
        .rejects.toMatchObject({ code: "WRONG_PLATFORM_IDENTITY" });
      await expect(f.service.recordVerifiedIdentity({ ...f.proof(attempt.bindAttemptId), verifiedAt: "2026-09-30T00:30:00+01:00" }))
        .rejects.toMatchObject({ code: "WRONG_PLATFORM_IDENTITY" });
      await f.service.recordVerifiedIdentity({ ...f.proof(attempt.bindAttemptId), verifiedAt: "2026-09-30T01:00:00+01:00" });
      f.cleanupState.fail = true;
      const bound = await f.service.bindConfirm(ctx("user-a"), { bindAttemptId: attempt.bindAttemptId });
      expect(bound.status).toBe("bound");
      const [row] = await f.db.select().from(platformBindAttempts).where(eq(platformBindAttempts.id, attempt.bindAttemptId));
      expect(row?.cleanupPendingAt).not.toBeNull();
      f.cleanupState.fail = false;
      expect(await f.service.retryBindCleanup(attempt.bindAttemptId)).toBe(true);
      const [cleaned] = await f.db.select().from(platformBindAttempts).where(eq(platformBindAttempts.id, attempt.bindAttemptId));
      expect(cleaned?.cleanupPendingAt).toBeNull();
    } finally { await f.client.close(); }
  });

  it("rejects another user's account ID and an existing wrong identity in the production account port", async () => {
    const f = await fixture();
    try {
      await f.db.insert(platformAccounts).values({ id: "owned-by-b", userId: "user-b", platform: "xiaohongshu",
        accountHandle: "B", externalAccountId: "platform-id", createdAt: time, updatedAt: time });
      await f.db.insert(platformAccounts).values({ id: "wrong-a", userId: "user-a", platform: "xiaohongshu",
        accountHandle: "A", externalAccountId: "another-id", createdAt: time, updatedAt: time });
      const port = createVerifiedAccountBindingPort({ now: () => time,
        nextId: prefix => `${prefix}-new`, allowedPlatforms: new Set(["xiaohongshu"]) });
      await expect(f.db.transaction(tx => port.claimVerifiedAccount(tx, { userId: "user-a", platform: "xiaohongshu",
        platformIdentity: "platform-id", existingAccountId: "owned-by-b" })))
        .rejects.toMatchObject({ code: "FORBIDDEN_ACCOUNT" });
      await expect(f.db.transaction(tx => port.claimVerifiedAccount(tx, { userId: "user-a", platform: "xiaohongshu",
        platformIdentity: "platform-id", existingAccountId: "wrong-a" })))
        .rejects.toMatchObject({ code: "WRONG_PLATFORM_IDENTITY" });
      expect((await f.db.select().from(platformAccounts)).length).toBe(2);
    } finally { await f.client.close(); }
  });

  it("rejects offset-encoded expired proof and stores valid proof times as UTC", async () => {
    const f = await fixture();
    try {
      const attempt = await f.service.bindBegin(ctx("user-a"), { platform: "xiaohongshu", clientRequestId: "offset-proof" });
      await expect(f.service.recordVerifiedIdentity({ ...f.proof(attempt.bindAttemptId),
        expiresAt: "2026-09-30T00:30:00+01:00" })).rejects.toMatchObject({ code: "WRONG_PLATFORM_IDENTITY" });
      await f.service.recordVerifiedIdentity({ ...f.proof(attempt.bindAttemptId),
        verifiedAt: "2026-09-30T01:00:00+01:00", expiresAt: "2026-09-30T02:00:00+01:00" });
      const [recorded] = await f.db.select().from(platformBindAttempts).where(eq(platformBindAttempts.id, attempt.bindAttemptId));
      expect(recorded?.proofVerifiedAt).toBe("2026-09-30T00:00:00.000Z");
      expect(recorded?.proofExpiresAt).toBe("2026-09-30T01:00:00.000Z");
      await f.db.update(platformBindAttempts).set({ proofExpiresAt: "2026-09-30T00:30:00+01:00" })
        .where(eq(platformBindAttempts.id, attempt.bindAttemptId));
      await expect(f.service.bindConfirm(ctx("user-a"), { bindAttemptId: attempt.bindAttemptId }))
        .rejects.toMatchObject({ code: "BIND_EXPIRED" });
      expect((await f.db.select().from(platformAccounts)).length).toBe(0);
    } finally { await f.client.close(); }
  });
});

it('T1069 持久绑定复用真实授权事务，不转移旧身份且失败完整回滚',async()=>{
 const f=await fixture();try{
  const begin=await f.service.bindBegin(ctx('user-a'),{platform:'xiaohongshu',clientRequestId:'original'});await f.service.recordVerifiedIdentity(f.proof(begin.bindAttemptId));const bound=await f.service.bindConfirm(ctx('user-a'),{bindAttemptId:begin.bindAttemptId});
  const service=f.service as typeof f.service&{commitVerifiedBinding:(...args:any[])=>Promise<void>};expect(service.commitVerifiedBinding).toBeTypeOf('function');
  const {bindAttemptId:_,...proof}=f.proof(begin.bindAttemptId);const input={...proof,accountId:bound.accountId!};
  await f.db.transaction(tx=>service.commitVerifiedBinding(tx,ctx('user-a'),input));expect(await f.db.select().from(platformCollectionBindings)).toHaveLength(1);
  await expect(f.db.transaction(tx=>service.commitVerifiedBinding(tx,ctx('user-a'),{...input,accountId:'other-real-id'}))).rejects.toMatchObject({code:'WRONG_PLATFORM_IDENTITY'});
  await expect(f.db.transaction(async tx=>{await service.commitVerifiedBinding(tx,ctx('user-a'),{...input,proofSource:'new-proof'});throw Error('finish transaction rejected');})).rejects.toThrow('finish transaction rejected');
  expect((await f.db.select().from(platformCollectionBindings))[0].proofSource).toBe(proof.proofSource);
 }finally{await f.client.close();}
});
