import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, intelligenceItems } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createPersistentTaskService } from "../execution";
import { createIntelligenceService } from "./intelligence.service";

const ctx: RequestContext = {
  userId: "cover-user", accountId: "cover-account", requestId: "cover-read", source: "user",
};
const stamp = "2026-09-14T00:00:00.000Z";
type Item = typeof intelligenceItems.$inferInsert;
function item(id: string, changes: Partial<Item> = {}): Item {
  return {
    id, userId: ctx.userId, accountId: ctx.accountId!, type: "video", platform: "douyin",
    externalId: id, canonicalUrl: `https://www.douyin.com/video/${id}`,
    canonicalUrlHash: id, title: id, coverUrl: `https://cdn.example/${id}.jpg`,
    capturedAt: stamp, createdAt: stamp, updatedAt: stamp, ...changes,
  };
}

describe("T985 已有封面缓存只读查询", () => {
  let database: Awaited<ReturnType<typeof createDb>>;
  let service: ReturnType<typeof createIntelligenceService>;
  beforeEach(async () => {
    // 不传 dataDir：测试只使用全新内存数据库，不访问安装版用户数据。
    database = await createDb();
    service = createIntelligenceService(database.db, {
      tasks: createPersistentTaskService(database.db),
    });
  });
  afterEach(async () => { await database.client.close(); });

  it("批量按当前用户、账号、平台与 video 精确匹配，只返回封面所需字段", async () => {
    await database.db.insert(intelligenceItems).values([
      item("owned-a"), item("owned-b"), item("not-requested"),
      item("foreign-user", { externalId: "owned-a", userId: "other-user" }),
      item("foreign-account", { externalId: "owned-a", accountId: "other-account" }),
      item("foreign-platform", { externalId: "owned-a", platform: "web" }),
      item("foreign-type", { externalId: "owned-a", type: "article" }),
    ]);
    const select = vi.spyOn(database.db, "select");
    const result = await service.findCachedCovers(ctx, {
      platform: "douyin", externalIds: ["owned-a", "owned-b", "owned-a", "missing"],
    });
    expect(result).toEqual([
      { externalId: "owned-a", coverUrl: "https://cdn.example/owned-a.jpg", itemId: "owned-a" },
      { externalId: "owned-b", coverUrl: "https://cdn.example/owned-b.jpg", itemId: "owned-b" },
    ]);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("归档、null、空白封面均不能作为可恢复缓存", async () => {
    await database.db.insert(intelligenceItems).values([
      item("archived", { availability: "archived" }),
      item("null", { coverUrl: null }), item("empty", { coverUrl: "" }),
      item("spaces", { coverUrl: "  \t\n" }), item("valid"),
    ]);
    expect(await service.findCachedCovers(ctx, {
      platform: "douyin", externalIds: ["archived", "null", "empty", "spaces", "valid"],
    })).toEqual([{ externalId: "valid", coverUrl: "https://cdn.example/valid.jpg", itemId: "valid" }]);
  });

  it("旧库重复身份按最新有效记录择新，更新时间相同用 itemId 确定性裁决", async () => {
    // 正常迁移已有唯一约束；仅在本测试内存库模拟历史导入留下重复记录。
    await database.client.exec("DROP INDEX ux_intelligence_item_external");
    await database.db.insert(intelligenceItems).values([
      item("old", { externalId: "same" }),
      item("new-b", { externalId: "same", updatedAt: "2026-09-14T01:00:00.000Z" }),
      item("new-a", { externalId: "same", updatedAt: "2026-09-14T01:00:00.000Z" }),
      item("new-empty", { externalId: "same", updatedAt: "2026-09-14T02:00:00.000Z", coverUrl: " " }),
      item("new-archived", { externalId: "same", updatedAt: "2026-09-14T03:00:00.000Z", availability: "archived" }),
    ]);
    expect(await service.findCachedCovers(ctx, { platform: "douyin", externalIds: ["same"] }))
      .toEqual([{ externalId: "same", coverUrl: "https://cdn.example/new-a.jpg", itemId: "new-a" }]);
  });

  it("空批次不扫描数据库，缺少当前账号仍拒绝读取", async () => {
    const select = vi.spyOn(database.db, "select");
    expect(await service.findCachedCovers(ctx, { platform: "douyin", externalIds: [] })).toEqual([]);
    expect(select).not.toHaveBeenCalled();
    await expect(service.findCachedCovers({ ...ctx, accountId: undefined }, {
      platform: "douyin", externalIds: ["owned-a"],
    })).rejects.toThrow();
    expect(select).not.toHaveBeenCalled();
  });
});
