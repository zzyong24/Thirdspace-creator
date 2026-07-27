import { describe, expect, it } from "vitest";

import {
  createDb,
  intelligenceItems,
  intelligenceTransforms,
  itemTranscripts,
  sourceSnapshots,
} from "@creatoros/backend";
import {
  projectIntelligenceReferenceResource,
  type RequestContext,
} from "@creatoros/contract";
import { createProjectIntelligenceReferenceService } from "./project-reference.service";

const ctx: RequestContext = {
  userId: "user-project-reference",
  accountId: "account-project-reference",
  requestId: "request-project-reference",
  source: "user",
};
const now = "2026-07-23T18:00:00.000Z";

async function seedConfirmedRadarTopic(
  db: Awaited<ReturnType<typeof createDb>>["db"],
) {
  await db.insert(intelligenceItems).values({
    id: "item-1",
    userId: ctx.userId,
    accountId: ctx.accountId!,
    type: "video",
    platform: "douyin",
    externalId: "aweme-1",
    canonicalUrl: "https://www.douyin.com/video/aweme-1",
    canonicalUrlHash: "url-hash-1",
    authorId: "author-1",
    authorName: "对标作者",
    title: "一条已拆写的对标作品",
    summary: "摘要",
    coverUrl: null,
    coverAssetId: null,
    publishedAt: now,
    durationMs: 60_000,
    capturedAt: now,
    availability: "available",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(sourceSnapshots).values({
    id: "snapshot-1",
    userId: ctx.userId,
    accountId: ctx.accountId!,
    sourceId: "source-1",
    runId: "run-1",
    itemId: "item-1",
    capturedAt: now,
    finalUrl: "https://www.douyin.com/video/aweme-1",
    title: "一条已拆写的对标作品",
    contentHash: "snapshot-content-hash",
    safeExtract: "公开摘要证据",
    storageRef: null,
    retentionUntil: null,
    privacyClass: "public",
  });
  await db.insert(itemTranscripts).values({
    itemId: "item-1",
    userId: ctx.userId,
    accountId: ctx.accountId!,
    status: "done",
    text: "这是用户手动发起并完成的逐字稿正文。",
    source: "douyin_audio",
    provider: "test-asr",
    model: "test-model",
    language: "zh-CN",
    executionTaskId: "task-transcript-1",
    queuedAt: now,
    completedAt: now,
    errorCode: null,
    updatedAt: now,
  });
  await db.insert(intelligenceTransforms).values({
    id: "transform-1",
    userId: ctx.userId,
    accountId: ctx.accountId!,
    itemId: "item-1",
    sourceSnapshotId: "snapshot-1",
    kind: "topic",
    positioningVersionId: "positioning-1",
    aiTaskId: "task-topic-1",
    idempotencyKey: "topic-preview-1",
    status: "confirmed",
    outputSnapshot: {
      title: "自己的选题",
      structureSteps: ["钩子", "论证", "收束"],
      reusablePattern: "问题—证据—行动",
    },
    targetTopicId: "candidate-1",
    createdAt: now,
    updatedAt: now,
  });
}

describe("T-482 Project 来源逐字稿透传", () => {
  it("promote 后固定 transform 与逐字稿 hash，脚本读取返回链接+拆写+正文", async () => {
    const { db, client } = await createDb();
    let serial = 0;
    const service = createProjectIntelligenceReferenceService(db, {
      now: () => now,
      nextId: (prefix) => `${prefix}-${++serial}`,
      projects: {
        assertExists: async (_ctx, projectId) => {
          if (projectId !== "project-1") throw new Error("project missing");
        },
      },
    });
    try {
      await seedConfirmedRadarTopic(db);
      const attached = await service.attachFromPromotion(ctx, {
        projectId: "project-1",
        topicId: "candidate-1",
      });
      expect(
        projectIntelligenceReferenceResource.parse(attached),
      ).toMatchObject({
        projectId: "project-1",
        topicId: "candidate-1",
        itemId: "item-1",
        sourceSnapshotId: "snapshot-1",
        transformId: "transform-1",
      });
      expect(attached?.transcriptHash).toMatch(/^sha256:[a-f0-9]{64}$/);

      // promote/composition 重放不新增第二条引用。
      const replay = await service.attachFromPromotion(ctx, {
        projectId: "project-1",
        topicId: "candidate-1",
      });
      expect(replay?.id).toBe(attached?.id);

      const [source] = await service.getSourceContexts(ctx, {
        projectId: "project-1",
        referenceIds: [attached!.id],
      });
      expect(source?.item.canonicalUrl).toBe(
        "https://www.douyin.com/video/aweme-1",
      );
      expect(source?.transform.outputSnapshot).toMatchObject({
        structureSteps: ["钩子", "论证", "收束"],
      });
      expect(source?.transcript.text).toBe(
        "这是用户手动发起并完成的逐字稿正文。",
      );
      expect(source?.transcript.hash).toBe(attached?.transcriptHash);
    } finally {
      await client.close();
    }
  });

  it("普通候选不伪造来源；逐字稿发生漂移时拒绝给脚本生成使用", async () => {
    const { db, client } = await createDb();
    let serial = 0;
    const service = createProjectIntelligenceReferenceService(db, {
      now: () => now,
      nextId: (prefix) => `${prefix}-${++serial}`,
    });
    try {
      expect(
        await service.attachFromPromotion(ctx, {
          projectId: "project-manual",
          topicId: "candidate-manual",
        }),
      ).toBeNull();

      await seedConfirmedRadarTopic(db);
      const attached = await service.attach(ctx, {
        projectId: "project-1",
        topicId: "candidate-1",
        itemId: "item-1",
        sourceSnapshotId: "snapshot-1",
        idempotencyKey: "attach-1",
      });
      await db
        .update(itemTranscripts)
        .set({
          text: "逐字稿被替换成了另一份内容。",
          updatedAt: "2026-07-23T19:00:00.000Z",
        });
      await expect(
        service.getSourceContexts(ctx, {
          projectId: "project-1",
          referenceIds: [attached.id],
        }),
      ).rejects.toMatchObject({
        name: "ConflictError",
        message: "来源逐字稿已变化，请重新确认来源后再生成稿件",
      });
    } finally {
      await client.close();
    }
  });
});
