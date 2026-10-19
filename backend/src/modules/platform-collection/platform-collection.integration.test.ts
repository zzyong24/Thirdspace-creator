import { describe, expect, it } from "vitest";
import { platformWorksListResponse, platformMetricsReadResponse } from "@creatoros/contract";
import { createDb } from "../../db";
import { platformAccounts } from "../../schema/platform-account";
import { platformCollectionBindings, platformCatalogs, platformCollectionPages, platformCollectionRuns,
  platformVisibilityTombstones, platformWorks } from "../../schema/platform-collection";
import { computeProbeDigest, createPlatformCollectionService } from "./platform-collection.service";
import { eq } from "drizzle-orm";

const t = "2026-09-30T00:00:00.000Z";
const ctx = (userId: string, accountId: string) => ({ userId, accountId, requestId: "r", source: "user" as const });
const work = (externalId: string, visibility: "public" | "hidden" | "unknown" = "public") => ({
  externalId, kind: "video" as const, publishedAt: t,
  visibility: { visibility, source: "manage", observedAt: t }, source: "manage", observedAt: t,
});

async function fixture() {
  const { db, client } = await createDb();
  const clock = { value: t };
  let n = 0;
  for (const accountId of ["acct-a", "acct-b"]) {
    const userId = accountId === "acct-a" ? "user-a" : "user-b";
    await db.insert(platformAccounts).values({ id: accountId, userId, platform: "douyin",
      accountHandle: accountId, externalAccountId: `identity-${accountId}`, createdAt: t, updatedAt: t });
    await db.insert(platformCollectionBindings).values({ accountId, userId, platform: "douyin",
      platformIdentity: `identity-${accountId}`, scopes: ["workCatalog", "accountOverview", "workMetrics"],
      proofSource: "test-trusted-adapter", verifiedAt: t });
  }
  const ownerStates = new Map<string, {status:string}>();
  const svc = createPlatformCollectionService({ db, now: () => clock.value,
    readScheduledOwner: async (_ctx, taskId) => ownerStates.get(taskId) ?? null,
    nextId: prefix => `${prefix}-${++n}`, visibilitySourcePriority: { manage: 100, feed: 10 },
    sourceAdapters: { douyin: ["workCatalog", "accountOverview", "workMetrics"].map(capability => ({
      platform: "douyin" as const, capability: capability as "workCatalog" | "accountOverview" | "workMetrics",
      supported: true, authState: "authorized" as const, runtimeState: "ready" as const,
      reasonCode: null, lastVerifiedAt: t,
    })) },
    metricDictionary: { douyin: { follower_count: { metricKey: "follower_count", unit: "count" },
      play_count: { metricKey: "play_count", unit: "count" } } },
  });
  async function begin(accountId = "acct-a", capability: "workCatalog" | "accountOverview" | "workMetrics" = "workCatalog") {
    const userId = accountId === "acct-a" ? "user-a" : "user-b";
    const run = await svc.start(ctx(userId, accountId), { accountId, capability, clientRequestId: `${capability}-${accountId}` });
    const lease = await svc.claim(run.attemptId, "test-worker");
    return { run, lease };
  }
  function page(lease: Awaited<ReturnType<typeof begin>>["lease"], options: {
    scanPass?: 1 | 2; pageIndex?: number; requestCursor?: string | null; nextCursor?: string | null;
    hasMore?: boolean; works?: ReturnType<typeof work>[]; sourceSnapshotKey?: string | null;
    platformReportedTotal?: number | null;
  } = {}) {
    const hasMore = options.hasMore ?? false;
    const { leaseExpiresAt: _leaseExpiresAt, ...pageLease } = lease;
    return { ...pageLease, capability: "workCatalog" as const,
      sourceSnapshotKey: options.sourceSnapshotKey ?? null,
      scanPass: options.scanPass ?? 1, pageIndex: options.pageIndex ?? 0,
      requestCursor: options.requestCursor ?? null, nextCursor: options.nextCursor ?? null,
      pageDigest: "adapter-digest", hasMore, observedAt: t,
      platformReportedTotal: options.platformReportedTotal ?? null,
      totalSource: options.platformReportedTotal == null ? null : "manage",
      totalObservedAt: options.platformReportedTotal == null ? null : t,
      terminalEvidence: hasMore ? null : { kind: "platformHasMoreFalse" as const, source: "manage", observedAt: t },
      works: options.works ?? [], accountMetrics: [], workMetrics: [],
    };
  }
  return { db, client, svc, begin, page, clock, ownerStates };
}

describe("platform collection service with real PGlite transactions", () => {
  it("keeps old catalog until an independent second scan agrees, with account isolation", async () => {
    const f = await fixture();
    try {
      const { run, lease } = await f.begin();
      const first = f.page(lease, { works: [work("same-id")] });
      expect((await f.svc.commitPage(first)).completeCatalogGeneration).toBeNull();
      expect(await f.svc.listWorks(ctx("user-a", "acct-a"), { accountId: "acct-a" })).toMatchObject({ total: 0 });
      expect((await f.svc.commitPage(first)).disposition).toBe("replayed");
      await expect(f.svc.commitPage({ ...first, works: [work("changed")] })).rejects.toMatchObject({ code: "PAGE_DIGEST_CONFLICT" });
      expect((await f.svc.commitPage(f.page(lease, { scanPass: 2, works: [work("same-id")] }))).completeCatalogGeneration).toBe(1);
      expect(await f.svc.listWorks(ctx("user-a", "acct-a"), { accountId: "acct-a" })).toMatchObject({ total: 1, catalogGeneration: 1 });
      expect(platformWorksListResponse.safeParse(await f.svc.listWorks(ctx("user-a", "acct-a"), { accountId: "acct-a" })).success).toBe(true);
      await expect(f.svc.listWorks(ctx("user-b", "acct-b"), { accountId: "acct-a" })).rejects.toMatchObject({ code: "FORBIDDEN_ACCOUNT" });
      await expect(f.svc.status(ctx("user-b", "acct-b"), "acct-b", run.attemptId)).rejects.toMatchObject({ code: "FORBIDDEN_ACCOUNT" });
      const b = await f.begin("acct-b");
      await f.svc.commitPage(f.page(b.lease, { works: [work("same-id")], sourceSnapshotKey: "stable-b" }));
      expect((await f.svc.listWorks(ctx("user-b", "acct-b"), { accountId: "acct-b" })).items).toHaveLength(1);
    } finally { await f.client.close(); }
  });

  it("rejects late pages after cancel and never publishes an incomplete directory", async () => {
    const f = await fixture();
    try {
      const { run, lease } = await f.begin();
      await f.svc.commitPage(f.page(lease, { works: [work("one")], hasMore: true, nextCursor: "2" }));
      expect((await f.svc.listWorks(ctx("user-a", "acct-a"), { accountId: "acct-a" })).total).toBe(0);
      await f.svc.cancel(ctx("user-a", "acct-a"), "acct-a", run.attemptId);
      await expect(f.svc.commitPage(f.page(lease, { pageIndex: 1, requestCursor: "2", works: [work("two")] }))).rejects.toMatchObject({ code: "GENERATION_STALE" });
      expect((await f.db.select().from(platformCatalogs)).length).toBe(0);
      expect((await f.db.select().from(platformCollectionPages).where(eq(platformCollectionPages.runId, run.attemptId))).length).toBe(1);
    } finally { await f.client.close(); }
  });

  it("persists a nonpublic safety tombstone even when the catalog has not completed", async () => {
    const f = await fixture();
    try {
      const { lease } = await f.begin();
      await f.svc.commitPage(f.page(lease, { works: [work("hidden-id", "hidden")], hasMore: true, nextCursor: "2" }));
      const tombstones = await f.db.select().from(platformVisibilityTombstones);
      expect(tombstones).toMatchObject([{ externalId: "hidden-id", visibility: "hidden" }]);
      expect((await f.svc.listWorks(ctx("user-a", "acct-a"), { accountId: "acct-a" })).total).toBe(0);
    } finally { await f.client.close(); }
  });

  it("rejects forged terminal probes and retains the previous complete generation", async () => {
    const f = await fixture();
    try {
      const { lease } = await f.begin();
      await f.svc.commitPage(f.page(lease, { sourceSnapshotKey: "stable-v1", works: [work("one")] }));
      const run2 = await f.svc.start(ctx("user-a", "acct-a"), { accountId: "acct-a", capability: "workCatalog", clientRequestId: "second-scan" });
      const lease2 = await f.svc.claim(run2.attemptId, "worker");
      const probe = { requestCursor: "cursor-4", nextCursor: null, recordIds: ["unexpected"], observedAt: t };
      const candidate = { ...f.page(lease2, { works: [work("two")], nextCursor: "cursor-4", platformReportedTotal: 1 }),
        terminalEvidence: { kind: "reportedTotalAndProbe" as const, source: "manage", observedAt: t,
          probe: { ...probe, responseDigest: computeProbeDigest(probe) } } };
      await expect(f.svc.commitPage(candidate)).rejects.toMatchObject({ code: "INCOMPLETE_CATALOG" });
      expect(await f.svc.listWorks(ctx("user-a", "acct-a"), { accountId: "acct-a" })).toMatchObject({ total: 1, catalogGeneration: 1 });
    } finally { await f.client.close(); }
  });

  it("keeps a hidden watermark against an equally old public scan", async () => {
    const f = await fixture();
    try {
      const { lease } = await f.begin();
      await f.svc.commitPage(f.page(lease, { sourceSnapshotKey: "hidden-snapshot", works: [work("item", "hidden")] }));
      const run2 = await f.svc.start(ctx("user-a", "acct-a"), { accountId: "acct-a", capability: "workCatalog", clientRequestId: "public-scan" });
      const lease2 = await f.svc.claim(run2.attemptId, "worker");
      await f.svc.commitPage(f.page(lease2, { sourceSnapshotKey: "public-snapshot", works: [work("item", "public")] }));
      const result = await f.svc.listWorks(ctx("user-a", "acct-a"), { accountId: "acct-a" });
      expect(result.items[0]?.visibility.visibility).toBe("hidden");
    } finally { await f.client.close(); }
  });

  it("stores a real zero follower total and returns it only to the owning account", async () => {
    const f = await fixture();
    try {
      const { lease } = await f.begin("acct-a", "accountOverview");
      const { leaseExpiresAt: _leaseExpiresAt, ...pageLease } = lease;
      await f.svc.commitPage({ ...pageLease, capability: "accountOverview", sourceSnapshotKey: "followers-1",
        scanPass: 1, pageIndex: 0, requestCursor: null, nextCursor: null, pageDigest: "followers",
        hasMore: false, observedAt: t, platformReportedTotal: null, totalSource: null,
        totalObservedAt: null, terminalEvidence: { kind: "platformHasMoreFalse", source: "manage", observedAt: t },
        works: [], workMetrics: [], accountMetrics: [{ externalWorkId: null, sourceField: "follower_count",
          sourceUnit: "count", value: 0, availability: "available", window: { kind: "lifetime" },
          source: "manage", capturedAt: t, observedAt: t }],
      });
      const metrics = await f.svc.readMetrics(ctx("user-a", "acct-a"), { accountId: "acct-a" });
      expect(metrics.accountMetrics[0]).toMatchObject({ metricKey: "follower_count", value: 0, availability: "available" });
      expect(platformMetricsReadResponse.safeParse(metrics).success).toBe(true);
      await expect(f.svc.readMetrics(ctx("user-b", "acct-b"), { accountId: "acct-a" })).rejects.toMatchObject({ code: "FORBIDDEN_ACCOUNT" });
    } finally { await f.client.close(); }
  });

  it("marks a changed second scan partial and keeps the previous complete catalog", async () => {
    const f = await fixture();
    try {
      const first = await f.begin();
      await f.svc.commitPage(f.page(first.lease, { sourceSnapshotKey: "stable-old", works: [work("old")] }));
      const next = await f.svc.start(ctx("user-a", "acct-a"), { accountId: "acct-a", capability: "workCatalog", clientRequestId: "changed-catalog" });
      const lease = await f.svc.claim(next.attemptId, "worker");
      await f.svc.commitPage(f.page(lease, { works: [work("new-1")], platformReportedTotal: 1 }));
      const receipt = await f.svc.commitPage(f.page(lease, { scanPass: 2, works: [work("new-2")], platformReportedTotal: 1 }));
      expect(receipt.completeCatalogGeneration).toBeNull();
      expect(await f.svc.status(ctx("user-a", "acct-a"), "acct-a", next.attemptId)).toMatchObject({ status: "partial", reasonCode: "INCOMPLETE_CATALOG" });
      const visible = await f.svc.listWorks(ctx("user-a", "acct-a"), { accountId: "acct-a" });
      expect(visible).toMatchObject({ total: 1, catalogGeneration: 1 });
      expect(visible.items[0]?.externalId).toBe("old");
    } finally { await f.client.close(); }
  });

  it("marks adapter failure and rejects late pages while preserving the last complete catalog", async () => {
    const f = await fixture();
    try {
      const previous = await f.begin();
      await f.svc.commitPage(f.page(previous.lease, { sourceSnapshotKey: "old-snapshot", works: [work("old")] }));
      const next = await f.svc.start(ctx("user-a", "acct-a"), {
        accountId: "acct-a", capability: "workCatalog", clientRequestId: "adapter-failed",
      });
      const lease = await f.svc.claim(next.attemptId, "worker");
      await f.svc.commitPage(f.page(lease, { works: [work("new")], hasMore: true, nextCursor: "2" }));
      await expect(f.svc.failRun(next.attemptId, lease.generation, "wrong-token", "needsAuth", "LOGIN_REQUIRED"))
        .rejects.toMatchObject({ code: "GENERATION_STALE" });
      expect(await f.svc.failRun(next.attemptId, lease.generation, lease.leaseToken, "needsAuth", "LOGIN_REQUIRED"))
        .toMatchObject({ status: "needsAuth", reasonCode: "LOGIN_REQUIRED" });
      await expect(f.svc.commitPage(f.page(lease, { pageIndex: 1, requestCursor: "2", works: [work("late")] })))
        .rejects.toMatchObject({ code: "GENERATION_STALE" });
      const visible = await f.svc.listWorks(ctx("user-a", "acct-a"), { accountId: "acct-a" });
      expect(visible).toMatchObject({ total: 1, catalogGeneration: 1 });
      expect(visible.items[0]?.externalId).toBe("old");
    } finally { await f.client.close(); }
  });

  it("expires the old worker token and increments generation on a new claim", async () => {
    const f = await fixture();
    try {
      const { run, lease } = await f.begin();
      f.clock.value = "2026-09-30T00:02:00.000Z";
      await expect(f.svc.commitPage(f.page(lease, { works: [work("late")] }))).rejects.toMatchObject({ code: "LEASE_EXPIRED" });
      expect(await f.svc.status(ctx("user-a", "acct-a"), "acct-a", run.attemptId)).toMatchObject({
        status: "partial", reasonCode: "LEASE_EXPIRED", generation: lease.generation + 1,
      });
      const nextLease = await f.svc.claim(run.attemptId, "new-worker");
      expect(nextLease.generation).toBe(lease.generation + 2);
      await expect(f.svc.commitPage(f.page(lease, { works: [work("late")] }))).rejects.toMatchObject({ code: "GENERATION_STALE" });
      expect((await f.svc.listWorks(ctx("user-a", "acct-a"), { accountId: "acct-a" })).total).toBe(0);
    } finally { await f.client.close(); }
  });

  it("foreign status and forged page cannot expire another account's run", async () => {
    const f = await fixture();
    try {
      const { run, lease } = await f.begin("acct-a");
      f.clock.value = "2026-09-30T00:02:00.000Z";
      await expect(f.svc.status(ctx("user-b", "acct-b"), "acct-b", run.attemptId))
        .rejects.toMatchObject({ code: "FORBIDDEN_ACCOUNT" });
      await expect(f.svc.commitPage({ ...f.page(lease), accountId: "acct-b" }))
        .rejects.toMatchObject({ code: "LEASE_EXPIRED" });
      const [stored] = await f.db.select().from(platformCollectionRuns)
        .where(eq(platformCollectionRuns.id, run.attemptId));
      expect(stored).toMatchObject({ status: "running", generation: lease.generation,
        leaseToken: lease.leaseToken });
      expect(await f.svc.status(ctx("user-a", "acct-a"), "acct-a", run.attemptId))
        .toMatchObject({ status: "partial", reasonCode: "LEASE_EXPIRED" });
    } finally { await f.client.close(); }
  });

  it("sweeps abandoned leases to persistent partial without replacing the prior catalog", async () => {
    const f = await fixture();
    try {
      const previous = await f.begin();
      await f.svc.commitPage(f.page(previous.lease, { works: [work("old")] }));
      await f.svc.commitPage(f.page(previous.lease, { scanPass: 2, works: [work("old")] }));
      const pending = await f.svc.start(ctx("user-a", "acct-a"), {
        accountId: "acct-a", capability: "workCatalog", clientRequestId: "abandoned-run",
      });
      const lease = await f.svc.claim(pending.attemptId, "abandoned-worker");
      await f.svc.commitPage(f.page(lease, { works: [work("new")], hasMore: true, nextCursor: "2" }));
      f.clock.value = "2026-09-30T00:02:00.000Z";
      expect(await f.svc.sweepExpiredLeases()).toBe(1);
      expect(await f.svc.status(ctx("user-a", "acct-a"), "acct-a", pending.attemptId))
        .toMatchObject({ status: "partial", reasonCode: "LEASE_EXPIRED" });
      await expect(f.svc.commitPage(f.page(lease, { pageIndex: 1, requestCursor: "2", works: [work("new-2")] })))
        .rejects.toMatchObject({ code: "GENERATION_STALE" });
      const listed = await f.svc.listWorks(ctx("user-a", "acct-a"), { accountId: "acct-a" });
      expect(listed).toMatchObject({ total: 1, catalogGeneration: 1 });
      expect(listed.items[0]?.externalId).toBe("old");
      const next = await f.svc.start(ctx("user-a", "acct-a"), {
        accountId: "acct-a", capability: "workCatalog", clientRequestId: "after-sweep",
      });
      expect(next.status).toBe("queued");
    } finally { await f.client.close(); }
  });

  it("freezes old public works on unknown visibility and complete-catalog absence", async () => {
    const f = await fixture();
    try {
      const first = await f.begin();
      await f.svc.commitPage(f.page(first.lease, { sourceSnapshotKey: "stable-1", works: [work("old")] }));
      const run2 = await f.svc.start(ctx("user-a", "acct-a"), { accountId: "acct-a", capability: "workCatalog", clientRequestId: "unknown" });
      const lease2 = await f.svc.claim(run2.attemptId, "worker");
      const uncertain = { ...work("old"), visibility: { visibility: "unknown" as const, source: "unmapped-source", observedAt: t } };
      await f.svc.commitPage(f.page(lease2, { hasMore: true, nextCursor: "2", works: [uncertain] }));
      let [old] = await f.db.select().from(platformWorks).where(eq(platformWorks.externalId, "old"));
      expect(old?.outboundFrozenAt).not.toBeNull();
      expect(old?.uncertainVisibilityAt).toBe(t);
      await f.svc.cancel(ctx("user-a", "acct-a"), "acct-a", run2.attemptId);
      const run3 = await f.svc.start(ctx("user-a", "acct-a"), { accountId: "acct-a", capability: "workCatalog", clientRequestId: "empty" });
      const lease3 = await f.svc.claim(run3.attemptId, "worker");
      await f.svc.commitPage(f.page(lease3, { sourceSnapshotKey: "stable-empty", works: [] }));
      [old] = await f.db.select().from(platformWorks).where(eq(platformWorks.externalId, "old"));
      expect(old?.outboundFrozenAt).not.toBeNull();
      const local = await f.svc.listWorks(ctx("user-a", "acct-a"), { accountId: "acct-a" });
      expect(local.total).toBe(1);
      expect(local.items[0]).toMatchObject({ externalId: "old", directoryState: "unavailable",
        directoryReasonCode: "ABSENT_UNCONFIRMED", visibility: {
          visibility: "unknown", source: "ABSENT_UNCONFIRMED", sourcePriority: 0,
        } });
      expect(platformWorksListResponse.safeParse(local).success).toBe(true);
    } finally { await f.client.close(); }
  });

  it("paginates current and frozen unavailable works without leaking them across accounts", async () => {
    const f = await fixture();
    try {
      const first = await f.begin();
      await f.svc.commitPage(f.page(first.lease, { sourceSnapshotKey: "catalog-1", works: [work("old")] }));
      const run2 = await f.svc.start(ctx("user-a", "acct-a"), { accountId: "acct-a", capability: "workCatalog", clientRequestId: "catalog-2" });
      const lease2 = await f.svc.claim(run2.attemptId, "worker");
      await f.svc.commitPage(f.page(lease2, { sourceSnapshotKey: "catalog-2", works: [work("new")] }));
      const firstPage = await f.svc.listWorks(ctx("user-a", "acct-a"), { accountId: "acct-a", pageSize: 1 });
      expect(firstPage).toMatchObject({ total: 2, currentTotal: 1, unavailableTotal: 1,
        nextCursor: "1", items: [{ externalId: "new", directoryState: "current" }] });
      const secondPage = await f.svc.listWorks(ctx("user-a", "acct-a"), { accountId: "acct-a", pageSize: 1, cursor: firstPage.nextCursor });
      expect(secondPage).toMatchObject({ total: 2, currentTotal: 1, unavailableTotal: 1,
        nextCursor: null, items: [{ externalId: "old", directoryState: "unavailable",
        directoryReasonCode: "ABSENT_UNCONFIRMED", visibility: { visibility: "unknown" } }] });
      expect(platformWorksListResponse.safeParse(firstPage).success).toBe(true);
      expect(platformWorksListResponse.safeParse(secondPage).success).toBe(true);
      expect((await f.svc.listWorks(ctx("user-b", "acct-b"), { accountId: "acct-b" })).total).toBe(0);
    } finally { await f.client.close(); }
  });

  it("rejects collection after its scope is revoked, even with a valid lease", async () => {
    const f = await fixture();
    try {
      const { lease } = await f.begin();
      await f.db.update(platformCollectionBindings).set({ scopes: [] }).where(eq(platformCollectionBindings.accountId, "acct-a"));
      await expect(f.svc.commitPage(f.page(lease, { works: [] }))).rejects.toMatchObject({ code: "SCOPE_MISSING" });
    } finally { await f.client.close(); }
  });

  it("rejects unsupported account metrics before storing a response unreadable by contract", async () => {
    const f = await fixture();
    try {
      const { lease } = await f.begin("acct-a", "accountOverview");
      const unsupported = { ...f.page(lease), capability: "accountOverview" as const,
        accountMetrics: [{ externalWorkId: null, sourceField: "play_count", sourceUnit: "count",
          value: 5, availability: "available" as const, window: { kind: "lifetime" as const },
          source: "manage", capturedAt: t, observedAt: t }] };
      await expect(f.svc.commitPage(unsupported)).rejects.toMatchObject({ code: "SOURCE_UNMAPPED" });
      expect((await f.db.select().from(platformCollectionPages).where(eq(platformCollectionPages.runId, lease.attemptId))))
        .toHaveLength(0);
    } finally { await f.client.close(); }
  });

  it("rejects offset-encoded expired binding at start and at page commit", async () => {
    const f = await fixture();
    try {
      await f.db.update(platformCollectionBindings).set({ expiresAt: "2026-09-30T00:30:00+01:00" })
        .where(eq(platformCollectionBindings.accountId, "acct-a"));
      await expect(f.svc.start(ctx("user-a", "acct-a"), { accountId: "acct-a",
        capability: "workCatalog", clientRequestId: "expired-start" })).rejects.toMatchObject({ code: "SCOPE_MISSING" });
      await f.db.update(platformCollectionBindings).set({ expiresAt: "2026-09-30T02:00:00+01:00" })
        .where(eq(platformCollectionBindings.accountId, "acct-a"));
      const { lease } = await f.begin();
      await f.db.update(platformCollectionBindings).set({ expiresAt: "2026-09-30T00:30:00+01:00" })
        .where(eq(platformCollectionBindings.accountId, "acct-a"));
      await expect(f.svc.commitPage(f.page(lease, { sourceSnapshotKey: "expired", works: [] })))
        .rejects.toMatchObject({ code: "SCOPE_MISSING" });
      expect((await f.db.select().from(platformCollectionPages)).length).toBe(0);
    } finally { await f.client.close(); }
  });

  it("allows one active run per account and capability and renews the worker lease", async () => {
    const f = await fixture();
    try {
      const first = await f.svc.start(ctx("user-a", "acct-a"), { accountId: "acct-a", capability: "workCatalog", clientRequestId: "first" });
      await expect(f.svc.start(ctx("user-a", "acct-a"), { accountId: "acct-a", capability: "workCatalog", clientRequestId: "second" }))
        .rejects.toMatchObject({ code: "LEASE_EXPIRED" });
      const lease = await f.svc.claim(first.attemptId, "worker");
      f.clock.value = "2026-09-30T00:00:40.000Z";
      const renewed = await f.svc.renewLease(first.attemptId, lease.generation, lease.leaseToken);
      expect(renewed.leaseExpiresAt).toBe("2026-09-30T00:01:40.000Z");
      f.clock.value = "2026-09-30T00:01:20.000Z";
      expect((await f.svc.commitPage(f.page(lease, { sourceSnapshotKey: "stable", works: [] }))).completeCatalogGeneration).toBe(1);
    } finally { await f.client.close(); }
  });

  it("applies a hidden safety watermark found only on the second scan", async () => {
    const f = await fixture();
    try {
      const { lease } = await f.begin();
      await f.svc.commitPage(f.page(lease, { works: [work("one", "public")] }));
      await f.svc.commitPage(f.page(lease, { scanPass: 2, works: [work("one", "hidden")] }));
      const result = await f.svc.listWorks(ctx("user-a", "acct-a"), { accountId: "acct-a" });
      expect(result.items[0]?.visibility.visibility).toBe("hidden");
      const [row] = await f.db.select().from(platformWorks).where(eq(platformWorks.externalId, "one"));
      expect(row?.outboundFrozenAt).not.toBeNull();
      expect((await f.db.select().from(platformVisibilityTombstones)).length).toBe(1);
    } finally { await f.client.close(); }
  });

  it("freezes a newly published first-pass public item when second-pass visibility is unknown", async () => {
    const f = await fixture();
    try {
      const { lease } = await f.begin();
      await f.svc.commitPage(f.page(lease, { works: [work("one", "public")] }));
      const unknown = { ...work("one"), visibility: { visibility: "unknown" as const,
        source: "unmapped-source", observedAt: t } };
      await f.svc.commitPage(f.page(lease, { scanPass: 2, works: [unknown] }));
      const [row] = await f.db.select().from(platformWorks).where(eq(platformWorks.externalId, "one"));
      expect(row?.outboundFrozenAt).not.toBeNull();
      expect(row?.uncertainVisibilityAt).toBe(t);
    } finally { await f.client.close(); }
  });

  it("keeps a high trust hidden state when a newer low trust public item arrives", async () => {
    const f = await fixture();
    try {
      const { lease } = await f.begin();
      await f.svc.commitPage(f.page(lease, { sourceSnapshotKey: "hidden", works: [work("one", "hidden")] }));
      const run2 = await f.svc.start(ctx("user-a", "acct-a"), { accountId: "acct-a", capability: "workCatalog", clientRequestId: "later-feed" });
      const lease2 = await f.svc.claim(run2.attemptId, "worker");
      const laterPublic = { ...work("one", "public"), visibility: {
        visibility: "public" as const, source: "feed", observedAt: "2026-10-01T00:00:00.000Z" } };
      await f.svc.commitPage(f.page(lease2, { sourceSnapshotKey: "feed", works: [laterPublic] }));
      const [row] = await f.db.select().from(platformWorks).where(eq(platformWorks.externalId, "one"));
      expect(row?.visibility).toBe("hidden");
      expect(row?.outboundFrozenAt).not.toBeNull();
    } finally { await f.client.close(); }
  });

  it("定期采集只读取当前属主账号最近一次运行", async () => {
    const f = await fixture();
    try {
      expect(await f.svc.latestRun(ctx("user-a", "acct-a"), "acct-a", "workCatalog")).toBeNull();
      const first = await f.begin();
      expect(await f.svc.latestRun(ctx("user-a", "acct-a"), "acct-a", "workCatalog"))
        .toMatchObject({ attemptId: first.run.attemptId, accountId: "acct-a" });
      await expect(f.svc.latestRun(ctx("user-b", "acct-b"), "acct-a", "workCatalog"))
        .rejects.toMatchObject({ code: "FORBIDDEN_ACCOUNT" });
    } finally { await f.client.close(); }
  });
});

// T1101：原平台运行必须归原scheduled owner管理；旧真实binding可补齐调度，凭据失效不伪报。
it('T1101持久owner识别、旧绑定证明、扫码后原needsAuth恢复和generation隔离',async()=>{
 const f=await fixture(),scope=ctx('user-a','acct-a');try{
 f.ownerStates.set('original-task',{status:'running'});
 expect(await f.svc.hasCredentialEvidence(scope,'acct-a')).toBe(true);
 const run=await f.svc.start(scope,{accountId:'acct-a',capability:'workCatalog',clientRequestId:'scheduled-original-task-catalog'});
 expect(await f.svc.scheduledOwnerTaskId(scope,'acct-a',run.attemptId)).toBe('original-task');
 const lease=await f.svc.claim(run.attemptId,'worker');await f.svc.failRun(run.attemptId,lease.generation,lease.leaseToken,'needsAuth','LOGIN_REQUIRED');
 await f.svc.resumeScheduledAuthorization(scope,'acct-a',run.attemptId,'original-task');expect((await f.svc.status(scope,'acct-a',run.attemptId)).status).toBe('needsAuth');
 await expect(f.svc.resumeScheduledAuthorization(scope,'acct-a',run.attemptId,'another-task')).rejects.toThrow('原调度');
 f.clock.value='2026-09-30T00:01:00.000Z';await f.db.update(platformCollectionBindings).set({verifiedAt:f.clock.value}).where(eq(platformCollectionBindings.accountId,'acct-a'));
 await f.svc.resumeScheduledAuthorization(scope,'acct-a',run.attemptId,'original-task');expect((await f.svc.status(scope,'acct-a',run.attemptId)).status).toBe('partial');
 const resumed=await f.svc.claim(run.attemptId,'worker');expect(resumed.generation).toBeGreaterThan(lease.generation);
 const metric=await f.svc.start(scope,{accountId:'acct-a',capability:'workMetrics',clientRequestId:run.attemptId+'-metrics'});expect(await f.svc.scheduledOwnerTaskId(scope,'acct-a',metric.attemptId)).toBe('original-task');
 await f.svc.cancel(scope,'acct-a',run.attemptId);await f.svc.resumeScheduledAuthorization(scope,'acct-a',run.attemptId,'original-task');expect((await f.svc.status(scope,'acct-a',run.attemptId)).status).toBe('cancelled');
 await f.db.update(platformCollectionBindings).set({revokedAt:f.clock.value}).where(eq(platformCollectionBindings.accountId,'acct-a'));expect(await f.svc.hasCredentialEvidence(scope,'acct-a')).toBe(false);
 await expect(f.svc.hasCredentialEvidence(ctx('user-b','acct-a'),'acct-a')).rejects.toThrow();
 }finally{await f.client.close();}
});

it('T1101取消或失败的真实原owner释放queued，暂停保留，伪造请求键不冒充owner',async()=>{
 const f=await fixture(),scope=ctx('user-a','acct-a');try{
 const manual=await f.svc.start(scope,{accountId:'acct-a',capability:'workCatalog',clientRequestId:'scheduled-fiction-catalog'});
 expect(await f.svc.scheduledOwnerTaskId(scope,'acct-a',manual.attemptId)).toBeNull();
 await f.svc.cancel(scope,'acct-a',manual.attemptId);
 f.ownerStates.set('original-task',{status:'paused'});
 const original=await f.svc.start(scope,{accountId:'acct-a',capability:'workCatalog',clientRequestId:'scheduled-original-task-catalog'});
 await expect(f.svc.start(scope,{accountId:'acct-a',capability:'workCatalog',clientRequestId:'next-catalog'})).rejects.toMatchObject({code:'LEASE_EXPIRED'});
 expect((await f.svc.status(scope,'acct-a',original.attemptId)).status).toBe('queued');
 f.ownerStates.set('original-task',{status:'cancelled'});
 const next=await f.svc.start(scope,{accountId:'acct-a',capability:'workCatalog',clientRequestId:'next-catalog'});
 expect((await f.svc.status(scope,'acct-a',original.attemptId)).status).toBe('cancelled');expect(next.attemptId).not.toBe(original.attemptId);
 await f.svc.cancel(scope,'acct-a',next.attemptId);
 f.ownerStates.set('failed-task',{status:'failed'});
 const failed=await f.svc.start(scope,{accountId:'acct-a',capability:'workCatalog',clientRequestId:'scheduled-failed-task-catalog'});
 const afterFailed=await f.svc.start(scope,{accountId:'acct-a',capability:'workCatalog',clientRequestId:'after-failed'});
 await f.svc.cancel(scope,'acct-a',afterFailed.attemptId);
 expect((await f.svc.status(scope,'acct-a',failed.attemptId)).status).toBe('partial');
 f.ownerStates.set('failed-task',{status:'queued'});
 const resumed=await f.svc.start(scope,{accountId:'acct-a',capability:'workCatalog',clientRequestId:'scheduled-failed-task-catalog'});
 expect(resumed.attemptId).toBe(failed.attemptId);expect((await f.svc.claim(resumed.attemptId,'retry-worker')).attemptId).toBe(failed.attemptId);
 }finally{await f.client.close();}
});
