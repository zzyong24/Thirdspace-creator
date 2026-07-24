import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createDb } from "../../db";
import {
  executionTasks,
  intelligenceCollections,
  intelligenceItems,
  itemMetricSnapshots,
} from "./intelligence.db-schema";

const now = "2026-07-23T00:00:00.000Z";

describe("T-482 内容情报数据库约束", () => {
  it("同账号同级分类名幂等，跨账号允许同名", async () => {
    const { db, client } = await createDb();
    const row = {
      id: randomUUID(),
      userId: "user_1",
      accountId: "account_1",
      parentId: null,
      name: "AI 工具",
      normalizedName: "ai 工具",
      kind: "custom",
      sortOrder: 0,
      version: 1,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await db.insert(intelligenceCollections).values(row);
      await expect(
        db
          .insert(intelligenceCollections)
          .values({ ...row, id: randomUUID() }),
      ).rejects.toThrow();
      await expect(
        db.insert(intelligenceCollections).values({
          ...row,
          id: randomUUID(),
          accountId: "account_2",
        }),
      ).resolves.toBeDefined();
    } finally {
      await client.close();
    }
  });

  it("同一外部作品按账号隔离，评论未知原样保存 null", async () => {
    const { db, client } = await createDb();
    const baseItem = {
      id: "item_1",
      userId: "user_1",
      accountId: "account_1",
      type: "video",
      platform: "douyin",
      externalId: "aweme_1",
      canonicalUrl: "https://www.douyin.com/video/aweme_1",
      canonicalUrlHash: "urlhash_1",
      authorId: "author_1",
      authorName: "作者",
      title: "标题",
      summary: null,
      coverUrl: null,
      coverAssetId: null,
      publishedAt: now,
      durationMs: 1000,
      capturedAt: now,
      availability: "available",
      createdAt: now,
      updatedAt: now,
    };
    try {
      await db.insert(intelligenceItems).values(baseItem);
      await expect(
        db
          .insert(intelligenceItems)
          .values({ ...baseItem, id: "item_duplicate" }),
      ).rejects.toThrow();
      await db.insert(intelligenceItems).values({
        ...baseItem,
        id: "item_account_2",
        accountId: "account_2",
      });
      const [metric] = await db
        .insert(itemMetricSnapshots)
        .values({
          id: "metric_1",
          userId: "user_1",
          accountId: "account_1",
          itemId: "item_1",
          capturedAt: now,
          likeCount: 12,
          commentCount: null,
          collectCount: null,
          shareCount: null,
          followerCount: null,
          metricSource: "douyin",
          qualityFlags: ["comment_count_missing"],
        })
        .returning();
      expect(metric?.commentCount).toBeNull();
    } finally {
      await client.close();
    }
  });

  it("持久任务的 kind + idempotencyKey 在账号内唯一", async () => {
    const { db, client } = await createDb();
    const task = {
      id: "task_1",
      userId: "user_1",
      accountId: "account_1",
      kind: "source_sync",
      ownerType: "source",
      ownerId: "source_1",
      status: "queued",
      priority: 10,
      idempotencyKey: "sync:source_1:first",
      payload: {},
      checkpoint: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      attempt: 0,
      maxAttempts: 3,
      costEstimate: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await db.insert(executionTasks).values(task);
      await expect(
        db.insert(executionTasks).values({ ...task, id: "task_2" }),
      ).rejects.toThrow();
    } finally {
      await client.close();
    }
  });
});
