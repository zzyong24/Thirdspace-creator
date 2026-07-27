import { describe, expect, it } from "vitest";

import { ENDPOINTS } from "../src/endpoints";
import {
  adapterEnvelope,
  executionTaskResourceV2,
  intelligenceItemResource,
  itemMetricSnapshotResource,
} from "../src/resources/intelligence";

const EXPECTED_OPERATION_IDS = [
  "intelligence.workspace.get",
  "intelligence.collections.create",
  "intelligence.collections.update",
  "intelligence.collections.delete",
  "intelligence.collectors.list",
  "intelligence.sources.previewProfile",
  "intelligence.sources.previewWeb",
  "intelligence.sources.listFavoriteFolders",
  "intelligence.sources.create",
  "intelligence.sources.list",
  "intelligence.sources.update",
  "intelligence.sources.delete",
  "intelligence.runs.start",
  "intelligence.runs.list",
  "intelligence.runs.get",
  "intelligence.items.list",
  "intelligence.items.get",
  "intelligence.items.importDouyinShare",
  "intelligence.transcripts.enqueue",
  "execution.tasks.command",
  "execution.tasks.list",
  "intelligence.transforms.previewTopic",
  "intelligence.transforms.confirmTopic",
  "projects.intelligence.attach",
  "projects.scripts.generateCandidate",
  "projects.scripts.acceptCandidate",
  "intelligence.migrations.inventory",
  "intelligence.migrations.start",
  "intelligence.migrations.report",
  "intelligence.migrations.rollback",
  "browserSessions.openLogin",
  "browserSessions.clear",
] as const;

describe("T-482 内容雷达 contract", () => {
  it("注册完整的内容雷达 operation scope envelope", () => {
    const ids = new Set(Object.values(ENDPOINTS).map((endpoint) => endpoint.id));
    expect(EXPECTED_OPERATION_IDS.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("[T-537] 三类登录来源只接受 collectorAccountId，客户端不能提交 browserSessionRef", () => {
    const profile = ENDPOINTS.createIntelligenceSource.body.safeParse({
      accountId: "account-owner",
      collectionId: null,
      type: "creator_profile",
      config: {
        type: "creator_profile",
        collectorAccountId: "account-observer",
        canonicalUrl: "https://www.douyin.com/user/sec-observer",
        externalAccountId: "sec-observer",
      },
      monitorEnabled: true,
      runInitial: true,
      idempotencyKey: "t537-profile",
    });
    expect(profile.success).toBe(true);

    const forged = ENDPOINTS.createIntelligenceSource.body.safeParse({
      accountId: "account-owner",
      collectionId: null,
      type: "favorites_folder",
      config: {
        type: "favorites_folder",
        collectorAccountId: "account-observer",
        folderId: "folder-1",
        browserSessionRef: "douyin-profile:forged",
      },
      monitorEnabled: true,
      runInitial: true,
      idempotencyKey: "t537-forged",
    });
    expect(forged.success).toBe(false);

    expect(
      ENDPOINTS.previewIntelligenceProfile.body.safeParse({
        accountId: "account-owner",
        collectorAccountId: "account-observer",
        url: "https://www.douyin.com/user/sec-observer",
      }).success,
    ).toBe(true);
    expect(
      ENDPOINTS.listIntelligenceFavoriteFolders.query.safeParse({
        accountId: "account-owner",
        collectorAccountId: "account-observer",
      }).success,
    ).toBe(true);
  });

  it("指标缺失保持 null，不把评论数伪造成 0", () => {
    expect(
      itemMetricSnapshotResource.parse({
        id: "metric_1",
        itemId: "item_1",
        capturedAt: "2026-07-23T00:00:00.000Z",
        likeCount: 10,
        commentCount: null,
        collectCount: null,
        shareCount: null,
        followerCount: null,
        metricSource: "douyin",
        qualityFlags: ["comment_count_missing"],
      }).commentCount,
    ).toBeNull();
  });

  it("adapter 信封拒绝 Cookie/签名等未声明敏感字段", () => {
    const parsed = adapterEnvelope(intelligenceItemResource).safeParse({
      adapterStatus: "blocked",
      upstreamEvidence: {
        adapter: "douhot_darkhorse",
        responseShape: "code/data/objs",
        capturedAt: "2026-07-23T00:00:00.000Z",
        listValid: false,
      },
      items: [],
      checkpoint: null,
      errorCode: "LOGIN_REQUIRED",
      safeDiagnostics: { stage: "identity" },
      cookie: "session-secret",
    });
    expect(parsed.success).toBe(false);
  });

  it("持久任务暴露租约、检查点和可恢复状态", () => {
    const task = executionTaskResourceV2.parse({
      id: "task_1",
      userId: "user_1",
      accountId: "account_1",
      kind: "source_sync",
      ownerType: "source",
      ownerId: "source_1",
      status: "queued",
      priority: 10,
      idempotencyKey: "source:1",
      checkpoint: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      attempt: 0,
      maxAttempts: 3,
      errorCode: null,
      errorMessage: null,
      costEstimate: null,
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
    });
    expect(task.status).toBe("queued");
    expect(task.maxAttempts).toBe(3);
    expect(task.errorCode).toBeNull();
  });
});
