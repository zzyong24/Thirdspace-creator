import { describe, expect, it } from "vitest";

import { createDb } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createPersistentTaskService } from "../execution";
import { createIntelligenceService } from "./intelligence.service";

const ctx: RequestContext = {
  userId: "user-share",
  accountId: "account-share",
  requestId: "request-share",
  source: "user",
};

describe("T-482 抖音分享链接单条建档", () => {
  it("自动创建博主来源、归档作品且重复分享幂等，不自动排逐字稿", async () => {
    const { db, client } = await createDb();
    let serial = 0;
    const deps = {
      now: () => "2026-07-23T18:00:00.000Z",
      nextId: (prefix: string) => `${prefix}-${++serial}`,
    };
    const tasks = createPersistentTaskService(db, deps);
    const intelligence = createIntelligenceService(db, { ...deps, tasks });
    const collection = await intelligence.createCollection(ctx, {
      parentId: null,
      name: "对标账号",
      idempotencyKey: "collection-share",
    });
    const item = {
      type: "video" as const,
      platform: "douyin",
      externalId: "7350000000000000001",
      canonicalUrl:
        "https://www.douyin.com/video/7350000000000000001?share_token=x",
      authorId: "MS4wLjABAAAAauthor",
      authorName: "被分享的博主",
      title: "这条视频如何建立认知反差",
      summary: "先提出常见误区，再用三个步骤解释。",
      coverUrl: "https://p3.douyinpic.com/cover.jpeg",
      publishedAt: "2026-07-22T12:00:00.000Z",
      durationMs: 42_000,
      metrics: {
        likeCount: 1200,
        commentCount: 87,
        collectCount: 430,
        shareCount: 51,
        followerCount: null,
        metricSource: "douyin_share_detail",
        qualityFlags: [],
      },
    };
    const queued = await intelligence.enqueueDouyinShareImport(ctx, {
      collectionId: collection.id,
      idempotencyKey: "share-import-1",
      shareInput: "分享给你 https://v.douyin.com/test/",
    });
    expect(queued.task).toMatchObject({
      kind: "share_import",
      ownerType: "item_import",
      status: "queued",
    });
    const firstClaim = await tasks.claimTask({
      taskId: queued.task.id,
      workerId: "share-worker-1",
    });
    if (!firstClaim) throw new Error("expected first share claim");
    try {
      const first = await intelligence.importDouyinSharedItem(ctx, {
        taskId: queued.task.id,
        lease: firstClaim.lease,
        collectionId: collection.id,
        browserSessionRef: "douyin-profile:account-share",
        item,
      });
      expect(first).toMatchObject({
        createdSource: true,
        createdItem: true,
        transcriptQueued: false,
        source: {
          collectionId: collection.id,
          type: "creator_profile",
          displayName: "被分享的博主",
        },
        item: {
          externalId: "7350000000000000001",
          authorName: "被分享的博主",
        },
      });
      expect(first.item.canonicalUrl).toBe(
        "https://www.douyin.com/video/7350000000000000001",
      );
      const detail = await intelligence.getItem(ctx, first.item.id);
      expect(detail.transcript.status).toBe("not_requested");
      expect(detail.observations).toHaveLength(1);
      expect(detail.snapshots[0]?.finalUrl).toBe(first.item.canonicalUrl);
      expect(await tasks.get(ctx, queued.task.id)).toMatchObject({
        status: "succeeded",
        checkpoint: {
          result: {
            item: { id: first.item.id },
            deduplicated: false,
            transcriptStatus: "not_requested",
            transcriptQueued: false,
          },
        },
      });

      const secondCollection = await intelligence.createCollection(ctx, {
        parentId: null,
        name: "待复盘",
        idempotencyKey: "collection-share-2",
      });
      const queuedAgain = await intelligence.enqueueDouyinShareImport(ctx, {
        collectionId: secondCollection.id,
        idempotencyKey: "share-import-2",
        shareInput: "https://www.douyin.com/video/7350000000000000001",
      });
      const secondClaim = await tasks.claimTask({
        taskId: queuedAgain.task.id,
        workerId: "share-worker-2",
      });
      if (!secondClaim) throw new Error("expected second share claim");
      const again = await intelligence.importDouyinSharedItem(ctx, {
        taskId: queuedAgain.task.id,
        lease: secondClaim.lease,
        collectionId: secondCollection.id,
        browserSessionRef: "douyin-profile:account-share",
        item,
      });
      expect(again).toMatchObject({
        createdSource: false,
        createdItem: false,
        transcriptQueued: false,
      });
      expect(again.item.id).toBe(first.item.id);
      expect((await intelligence.listSources(ctx)).rows).toHaveLength(1);
      expect(
        (await intelligence.listSources(ctx, {
          collectionId: secondCollection.id,
        })).rows,
      ).toHaveLength(1);
      expect((await intelligence.getWorkspace(ctx)).memberships).toHaveLength(
        2,
      );
      expect((await intelligence.listItems(ctx)).rows).toHaveLength(1);

      const queuedAnotherWork =
        await intelligence.enqueueDouyinShareImport(ctx, {
          collectionId: collection.id,
          idempotencyKey: "share-import-3",
          shareInput: "https://www.douyin.com/video/7350000000000000002",
        });
      const thirdClaim = await tasks.claimTask({
        taskId: queuedAnotherWork.task.id,
        workerId: "share-worker-3",
      });
      if (!thirdClaim) throw new Error("expected third share claim");
      const anotherWork = await intelligence.importDouyinSharedItem(ctx, {
        taskId: queuedAnotherWork.task.id,
        lease: thirdClaim.lease,
        collectionId: collection.id,
        browserSessionRef: "douyin-profile:account-share",
        item: {
          ...item,
          externalId: "7350000000000000002",
          canonicalUrl:
            "https://www.douyin.com/video/7350000000000000002",
          title: "同一博主的另一条作品",
        },
      });
      expect(anotherWork).toMatchObject({
        createdSource: false,
        createdItem: true,
        source: { id: first.source.id },
      });
      expect((await intelligence.listSources(ctx)).rows).toHaveLength(1);
      expect(
        (
          await intelligence.listItems(ctx, {
            sourceId: first.source.id,
          })
        ).rows,
      ).toHaveLength(2);
    } finally {
      await client.close();
    }
  });
});
