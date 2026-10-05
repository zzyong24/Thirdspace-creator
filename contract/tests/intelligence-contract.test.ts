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

  it("[T-622] 列表契约接受组合筛选和收藏/点赞排序，并返回服务端进度投影", () => {
    expect(
      ENDPOINTS.listIntelligenceItems.query.safeParse({
        accountId: "account_1",
        sort: "collect_desc",
        transcriptState: "extracted",
        topicState: "not_generated",
      }).success,
    ).toBe(true);
    expect(
      ENDPOINTS.listIntelligenceItems.query.safeParse({
        accountId: "account_1",
        sort: "like_desc",
        topicState: "converted",
      }).success,
    ).toBe(true);
    expect(
      ENDPOINTS.listIntelligenceItems.response.safeParse({
        item: {
          id: "item_1",
          userId: "user_1",
          accountId: "account_1",
          type: "video",
          platform: "douyin",
          externalId: "1",
          canonicalUrl: "https://www.douyin.com/video/1",
          authorId: null,
          authorName: "作者",
          title: "作品",
          summary: null,
          coverUrl: null,
          coverAssetId: null,
          publishedAt: null,
          durationMs: null,
          capturedAt: "2026-07-29T00:00:00.000Z",
          availability: "available",
        },
        latestMetric: null,
        sourceCount: 1,
        transcriptState: "extracted",
        topicState: "not_generated",
        progressState: "pending_topic",
      }).success,
    ).toBe(true);
  });

  it("[T-622] 逐字稿写入契约区分粘贴与文件导入", () => {
    expect(
      ENDPOINTS.uploadManualIntelligenceTranscript.body.safeParse({
        itemId: "item_1",
        inputMode: "paste",
        text: "直接粘贴的逐字稿",
      }).success,
    ).toBe(true);
    expect(
      ENDPOINTS.uploadManualIntelligenceTranscript.body.safeParse({
        itemId: "item_1",
        inputMode: "file",
        format: "srt",
        fileName: "访谈.srt",
        text: "文件导入的逐字稿",
      }).success,
    ).toBe(true);
    expect(
      ENDPOINTS.uploadManualIntelligenceTranscript.body.safeParse({
        itemId: "item_1",
        inputMode: "file",
        text: "缺少文件证据",
      }).success,
    ).toBe(false);
  });
});

it("[T-944] 确认允许可选内容目的，但不能改写只读推荐理由或提交未知分类", () => {
  const editedCandidate = { title: "选题", angle: "", differentiation: "", sourceSummary: "", targetAudience: "", audiencePain: "", coreConflict: "", format: "", adaptationStrategy: { keep: [], replace: [], add: [], avoid: [] } };
  const schema = ENDPOINTS.confirmIntelligenceTopic.body;
  for (const contentRole of [undefined, null, "traffic", "trust", "conversion"]) {
    expect(schema.safeParse({ editedCandidate: { ...editedCandidate, contentRole }, idempotencyKey: "confirm" }).success).toBe(true);
  }
  for (const extra of [{ contentRole: "段子" }, { contentRoleReason: "伪造模型理由" }, { recommendedContentRole: "conversion" }]) {
    expect(schema.safeParse({ editedCandidate: { ...editedCandidate, ...extra }, idempotencyKey: "confirm" }).success).toBe(false);
  }
});

describe("[T-1017] 改写首稿契约兼容", () => {
  const preview = { itemId: "item", sourceSnapshotId: "snapshot", idempotencyKey: "preview" };
  it("无定位版本也能请求，旧客户端版本字段继续接受；不开放内部旧链切换", () => {
    expect(ENDPOINTS.previewIntelligenceTopic.body.safeParse(preview).success).toBe(true);
    expect(ENDPOINTS.previewIntelligenceTopic.body.safeParse({ ...preview, positioningVersionId: "old-version" }).success).toBe(true);
    expect(ENDPOINTS.previewIntelligenceTopic.body.safeParse({ ...preview, strategyBacked: true }).success).toBe(false);
  });
  it("采纳改写仅需幂等键，可提交正文编辑，拒绝空正文和伪造来源", () => {
    const schema = ENDPOINTS.confirmIntelligenceTopic.body;
    expect(schema.safeParse({ idempotencyKey: "adopt" }).success).toBe(true);
    expect(schema.safeParse({ idempotencyKey: "adopt", editedDraftContentText: "我编辑的正文" }).success).toBe(true);
    expect(schema.safeParse({ idempotencyKey: "adopt", editedDraftContentText: "" }).success).toBe(false);
    expect(schema.safeParse({ idempotencyKey: "adopt", sourceSnapshotId: "forged" }).success).toBe(false);
  });
});
