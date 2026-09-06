import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "@creatoros/backend";
import { createAssetRepository } from "./assets.repository";
import { createAssetsService } from "./assets.service";
import { createMockObjectStorage } from "./object-storage";

const ctx = { userId: "reader", accountId: "account", requestId: "read", source: "user" as const };
const url = "https://example.com/original";
let opened: Awaited<ReturnType<typeof createDb>>;
let repo: ReturnType<typeof createAssetRepository>;
let service: ReturnType<typeof createAssetsService>;
const getObject = vi.fn(async (key: string) => new TextEncoder().encode(key));

beforeEach(async () => {
  opened = await createDb();
  let seq = 0;
  let tick = 0;
  const deps = { now: () => new Date(Date.UTC(2026, 8, 6) + tick++).toISOString(), nextId: (prefix: string) => `${prefix}-${++seq}` };
  repo = createAssetRepository(opened.db, deps);
  getObject.mockClear();
  service = createAssetsService(repo, async () => ({
    ...createMockObjectStorage({ nextKey: () => `key-${++seq}` }), getObject,
  }), deps);
});
afterEach(async () => { await opened.client.close(); });

async function document(status = "pending", owner = ctx) {
  const asset = await repo.insertAsset(owner.userId, {
    assetType: "document", name: "正文", currentFileId: null, status,
  }, owner.accountId);
  const append = async (sourceUrl: string, key: string) => repo.insertAssetFile(owner.userId, {
    assetId: asset.id, storageKey: `${asset.id}/${key}`, mimeType: "text/plain",
    fileSize: 10, checksum: key, width: null, height: null, durationMs: null,
    mediaMetadata: { sourceUrl },
  }, owner.accountId);
  const first = await append(url, "first");
  const second = await append("https://example.com/replacement", "second");
  await repo.updateAssetStatus(owner.userId, asset.id, { currentFileId: second.id }, owner.accountId);
  return { asset, first, second };
}

describe("网页缓存只认当前正文版本", () => {
  it("历史文件的来源不能命中已经换稿的素材", async () => {
    const { asset } = await document();
    expect(await service.findAssetBySourceUrl(ctx, url)).toBeNull();
    expect((await service.findAssetBySourceUrl(ctx, "https://example.com/replacement"))?.id).toBe(asset.id);
  });

  it("回到早期版本后，来源与字节都读取选中的文件", async () => {
    const { asset, first } = await document();
    await repo.updateAssetStatus(ctx.userId, asset.id, { currentFileId: first.id }, ctx.accountId);
    expect((await service.findAssetBySourceUrl(ctx, url))?.id).toBe(asset.id);
    expect(await service.findAssetBySourceUrl(ctx, "https://example.com/replacement")).toBeNull();
    const result = await service.getAssetBytes(ctx, asset.id);
    expect(new TextDecoder().decode(result?.bytes)).toBe(first.storageKey);
    expect(getObject).toHaveBeenCalledWith(first.storageKey);
  });

  it("当前指针缺失时不能悄悄回退另一版正文", async () => {
    const { asset } = await document();
    await repo.updateAssetStatus(ctx.userId, asset.id, { currentFileId: "missing-file" }, ctx.accountId);
    expect(await service.getAssetBytes(ctx, asset.id)).toBeNull();
    expect(await service.findAssetBySourceUrl(ctx, url)).toBeNull();
    expect(getObject).not.toHaveBeenCalled();
  });

  it.each(["account", "other"])("指针指向 %s 账号的另一素材时不能跨素材读字节或命中来源", async (accountId) => {
    const { asset } = await document();
    const foreign = await document("pending", { ...ctx, accountId });
    await repo.updateAssetStatus(ctx.userId, asset.id, { currentFileId: foreign.first.id }, ctx.accountId);
    expect(await service.getAssetBytes(ctx, asset.id)).toBeNull();
    expect(await service.findAssetBySourceUrl(ctx, url)).toBeNull();
    expect(getObject).not.toHaveBeenCalled();
  });

  it("新素材只有历史版本命中时，仍可找到较早的有效缓存", async () => {
    const older = await document();
    await repo.updateAssetStatus(ctx.userId, older.asset.id, { currentFileId: older.first.id }, ctx.accountId);
    await document();
    expect((await service.findAssetBySourceUrl(ctx, url))?.id).toBe(older.asset.id);
  });

  it.each(["pending", "active", "archived", "deleted"])("缓存遵循素材状态 %s", async (status) => {
    const item = await document(status);
    await repo.updateAssetStatus(ctx.userId, item.asset.id, { currentFileId: item.first.id }, ctx.accountId);
    const found = await service.findAssetBySourceUrl(ctx, url);
    if (status === "pending" || status === "active") expect(found?.id).toBe(item.asset.id);
    else expect(found).toBeNull();
  });

  it("其他账号和用户不能复用缓存或读取字节", async () => {
    const owned = await document();
    await repo.updateAssetStatus(ctx.userId, owned.asset.id, { currentFileId: owned.first.id }, ctx.accountId);
    expect(await service.findAssetBySourceUrl({ ...ctx, accountId: "other" }, url)).toBeNull();
    expect(await service.findAssetBySourceUrl({ ...ctx, userId: "other" }, url)).toBeNull();
    await expect(service.getAssetBytes({ ...ctx, accountId: "other" }, owned.asset.id)).rejects.toThrow();
    await expect(service.getAssetBytes({ ...ctx, userId: "other" }, owned.asset.id)).rejects.toThrow();
    expect(getObject).not.toHaveBeenCalled();
  });

  it("未完成文件装配的素材返回空值", async () => {
    const asset = await repo.insertAsset(ctx.userId, {
      assetType: "document", name: "尚无正文", currentFileId: null, status: "pending",
    }, ctx.accountId);
    expect(await service.getAssetBytes(ctx, asset.id)).toBeNull();
    expect(await service.findAssetBySourceUrl(ctx, url)).toBeNull();
    expect(getObject).not.toHaveBeenCalled();
  });
});
