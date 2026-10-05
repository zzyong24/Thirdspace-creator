import { describe, expect, it } from "vitest";
import {
  accountMetricSnapshotResource,
  collectionPageCommit,
  collectionStartRequest,
  platformCapabilityState,
  platformBindConfirmRequest,
  platformMetricsReadResponse,
  platformWorksListResponse,
  platformWorkResource,
  workMetricSnapshotResource,
} from "../src/resources/platform-capabilities";
import { platformAccountOperations } from "../src/operations/platform-accounts";

const at = "2026-09-30T00:00:00.000Z";
const work = {
  id: "work-1",
  userId: "user-a",
  accountId: "account-a",
  platform: "xiaohongshu",
  externalId: "note-1",
  title: "真实笔记标题",
  kind: "image",
  publishedAt: at,
  visibility: { visibility: "public", source: "creator-detail", sourcePriority: 10, observedAt: at },
  source: "creator-catalog",
  observedAt: at,
  ingestedAt: at,
  catalogGeneration: 1,
  publicationId: null,
  legacyProjectId: null,
  legacyPublicationId: null,
  directoryState: "current",
  directoryReasonCode: null,
} as const;
const metric = {
  id: "metric-1",
  userId: "user-a",
  accountId: "account-a",
  platform: "xiaohongshu",
  metricKey: "follower_count",
  value: 0,
  availability: "available",
  unit: "count",
  window: { kind: "lifetime" },
  source: "creator-overview",
  sourceSnapshotKey: null,
  capturedAt: at,
  observedAt: at,
  ingestedAt: at,
} as const;
const sourceWork = {
  externalId: "note-1",
  kind: "image",
  publishedAt: at,
  visibility: { visibility: "public", source: "creator-detail", observedAt: at },
  source: "creator-catalog",
  observedAt: at,
} as const;

describe("T-1020 platform service contract fixtures", () => {
  it("accepts a real zero and distinct account/work metric ownership", () => {
    expect(platformWorkResource.parse(work).accountId).toBe("account-a");
    expect(platformWorkResource.safeParse({ ...work, title: null }).success).toBe(true);
    expect(platformWorkResource.safeParse({ ...work, title: "" }).success).toBe(false);
    expect(accountMetricSnapshotResource.parse(metric).value).toBe(0);
    expect(workMetricSnapshotResource.parse({ ...metric, platformWorkId: "work-1", metricKey: "play_count" }).platformWorkId).toBe("work-1");
  });

  it("rejects a fabricated zero for unavailable metrics and negative values", () => {
    expect(accountMetricSnapshotResource.safeParse({ ...metric, availability: "sourceMissing" }).success).toBe(false);
    expect(accountMetricSnapshotResource.safeParse({ ...metric, value: null }).success).toBe(false);
    expect(accountMetricSnapshotResource.safeParse({ ...metric, value: -1 }).success).toBe(false);
    expect(accountMetricSnapshotResource.safeParse({ ...metric, unit: "people" }).success).toBe(false);
    expect(accountMetricSnapshotResource.safeParse({ ...metric, value: null, availability: "sourceMissing" }).success).toBe(true);
    expect(workMetricSnapshotResource.safeParse({ ...metric, platformWorkId: "work-1" }).success).toBe(false);
    expect(workMetricSnapshotResource.safeParse({ ...metric, platformWorkId: "work-1", metricKey: "follower_gain" }).success).toBe(false);
    expect(workMetricSnapshotResource.safeParse({
      ...metric, platformWorkId: "work-1", metricKey: "follower_gain",
      window: { kind: "interval", start: "2026-09-29T00:00:00.000Z", end: at, timeZone: "Asia/Shanghai" },
    }).success).toBe(true);
    expect(workMetricSnapshotResource.safeParse({
      ...metric, platformWorkId: "work-1", metricKey: "follower_gain",
      window: { kind: "interval", start: "2026-09-30T00:00:00Z",
        end: "2026-09-30T00:00:00.100Z", timeZone: "Asia/Shanghai" },
    }).success).toBe(true);
  });

  it("returns account-scoped pages with one published catalog generation", () => {
    expect(platformWorksListResponse.safeParse({
      accountId: "account-a", catalogGeneration: 1, catalogCompleteness: "verifiedComplete",
      catalogCompletedAt: at, total: 1, currentTotal: 1, unavailableTotal: 0, nextCursor: null, items: [work],
    }).success).toBe(true);
    expect(platformWorksListResponse.safeParse({
      accountId: "account-a", catalogGeneration: 0, catalogCompleteness: "legacyPartial",
      catalogCompletedAt: null, total: 1, currentTotal: 1, unavailableTotal: 0, nextCursor: null,
      items: [{ ...work, catalogGeneration: 0, visibility: { ...work.visibility, visibility: "unknown" } }],
    }).success).toBe(true);
    expect(platformWorksListResponse.safeParse({
      accountId: "account-a", catalogGeneration: 2, catalogCompleteness: "verifiedComplete",
      catalogCompletedAt: at, total: 1, currentTotal: 0, unavailableTotal: 1, nextCursor: null,
      items: [{ ...work, catalogGeneration: 1, directoryState: "unavailable",
        directoryReasonCode: "ABSENT_UNCONFIRMED",
        visibility: { visibility: "unknown", source: "ABSENT_UNCONFIRMED", sourcePriority: 0, observedAt: at } }],
    }).success).toBe(true);
    expect(platformWorksListResponse.safeParse({
      accountId: "account-a", catalogGeneration: 0, catalogCompleteness: "verifiedComplete",
      catalogCompletedAt: null, total: 1, currentTotal: 1, unavailableTotal: 0, nextCursor: null,
      items: [{ ...work, catalogGeneration: 0 }],
    }).success).toBe(false);
    expect(platformMetricsReadResponse.safeParse({
      accountId: "account-a", nextCursor: null, accountMetrics: [metric], workMetrics: [],
    }).success).toBe(true);
    expect(platformWorksListResponse.safeParse({
      accountId: "account-a", catalogGeneration: 1, catalogCompleteness: "verifiedComplete",
      catalogCompletedAt: at, total: 1, currentTotal: 1, unavailableTotal: 0, nextCursor: null,
      items: [{ ...work, accountId: "account-b" }],
    }).success).toBe(false);
  });

  it("rejects ready when unsupported and requires a reason for unavailable", () => {
    const ready = {
      platform: "kuaishou", capability: "workCatalog", supported: true,
      authState: "authorized", runtimeState: "ready", reasonCode: null, lastVerifiedAt: at,
    };
    expect(platformCapabilityState.safeParse(ready).success).toBe(true);
    expect(platformCapabilityState.safeParse({ ...ready, supported: false }).success).toBe(false);
    expect(platformCapabilityState.safeParse({ ...ready, runtimeState: "needsAuth" }).success).toBe(false);
    expect(platformCapabilityState.safeParse({ ...ready, runtimeState: "needsAuth", reasonCode: "SCOPE_MISSING" }).success).toBe(true);
  });

  it("requires explicit page identity and accepts only the shape of an empty terminal page", () => {
    const page = {
      attemptId: "attempt-1", accountId: "account-a", platform: "xiaohongshu", capability: "workCatalog",
      expectedPlatformIdentity: "platform-user-a", generation: 1, leaseToken: "lease-1",
      sourceSnapshotKey: null, scanPass: 1,
      platformReportedTotal: 0, totalSource: "creator-catalog", totalObservedAt: at,
      terminalEvidence: { kind: "platformHasMoreFalse", source: "creator-catalog", observedAt: at },
      pageIndex: 0, requestCursor: null, nextCursor: null,
      pageDigest: "sha256:empty", hasMore: false, observedAt: at, works: [],
      accountMetrics: [], workMetrics: [],
    };
    expect(collectionPageCommit.safeParse(page).success).toBe(true);
    expect(collectionPageCommit.safeParse({ ...page, leaseToken: "" }).success).toBe(false);
    expect(collectionPageCommit.safeParse({ ...page, pageIndex: -1 }).success).toBe(false);
    expect(collectionPageCommit.safeParse({ ...page, works: [sourceWork] }).success).toBe(true);
    expect(collectionPageCommit.safeParse({ ...page, works: [{ ...sourceWork, userId: "user-b" }] }).success).toBe(false);
    expect(collectionPageCommit.safeParse({ ...page, works: [sourceWork, sourceWork] }).success).toBe(false);
    expect(collectionPageCommit.safeParse({ ...page, cookie: "secret" }).success).toBe(false);
    expect(collectionPageCommit.safeParse({ ...page, terminalEvidence: null }).success).toBe(false);
    expect(collectionPageCommit.safeParse({ ...page, platformReportedTotal: null }).success).toBe(false);
    expect(collectionPageCommit.safeParse({ ...page, hasMore: true, nextCursor: "next" }).success).toBe(false);
    expect(collectionPageCommit.safeParse({ ...page, accountMetrics: [{ sourceField: "fans" }] }).success).toBe(false);
    expect(platformBindConfirmRequest.safeParse({ bindAttemptId: "attempt-1", verifiedPlatformIdentity: "attacker" }).success).toBe(false);
  });

  it("requires probe facts for a reported-total terminal candidate", () => {
    const base = {
      attemptId: "attempt-1", accountId: "account-a", platform: "xiaohongshu", capability: "workCatalog",
      expectedPlatformIdentity: "platform-user-a", generation: 1, leaseToken: "lease-1",
      sourceSnapshotKey: null, scanPass: 1, platformReportedTotal: 1,
      totalSource: "creator-catalog", totalObservedAt: at, pageIndex: 0,
      requestCursor: null, nextCursor: "cursor-4", pageDigest: "sha256:page",
      hasMore: false, observedAt: at, works: [sourceWork], accountMetrics: [], workMetrics: [],
      terminalEvidence: {
        kind: "reportedTotalAndProbe", source: "creator-catalog", observedAt: at,
        probe: { requestCursor: "cursor-4", nextCursor: null, recordIds: ["note-1"], responseDigest: "sha256:probe", observedAt: at },
      },
    } as const;
    expect(collectionPageCommit.safeParse(base).success).toBe(true);
    expect(collectionPageCommit.safeParse({ ...base, terminalEvidence: {
      ...base.terminalEvidence, probe: { ...base.terminalEvidence.probe, requestCursor: "wrong" },
    } }).success).toBe(false);
    expect(collectionPageCommit.safeParse({ ...base, terminalEvidence: {
      ...base.terminalEvidence, probe: { ...base.terminalEvidence.probe, nextCursor: "cursor-5" },
    } }).success).toBe(false);
  });

  it("keeps the old manual account create contract closed to new platforms", () => {
    const body = platformAccountOperations.createAccount.body;
    expect(body.safeParse({ platform: "douyin", accountHandle: "owned" }).success).toBe(true);
    expect(body.safeParse({ platform: "kuaishou", accountHandle: "owned" }).success).toBe(false);
    expect(body.safeParse({ platform: "wechatOfficialAccount", accountHandle: "owned" }).success).toBe(false);
  });

  it("only starts collection capabilities, never publishing side effects", () => {
    expect(collectionStartRequest.safeParse({ accountId: "account-a", capability: "workCatalog", clientRequestId: "r1" }).success).toBe(true);
    expect(collectionStartRequest.safeParse({ accountId: "account-a", capability: "publish", clientRequestId: "r1" }).success).toBe(false);
    expect(collectionStartRequest.safeParse({ accountId: "account-a", capability: "comments", clientRequestId: "r1" }).success).toBe(false);
  });
});
