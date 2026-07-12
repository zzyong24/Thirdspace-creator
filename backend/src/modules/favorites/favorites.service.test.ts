import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createFavoritesService,
  type FavoritesService,
} from "./favorites.service";
import { OwnershipError, ValidationError } from "./favorites.errors";

// [T-235c] Favorites service 单测(fake now/nextId, pglite db,照 trend-sources.service.test
// 范式)—— 收藏夹登记 CRUD 可见性、同名幂等 upsert、toggle/remove ownership 404-class、按号隔离
// + items 侧:recordItems (user, aweme_id) 去重、listPendingItems FIFO 限量、markItemPromoted
// 流转、updateFolderSync 回填 collectsId/lastSyncedAt。

const NOW = "2026-07-12T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "r1", source: "user", accountId: "acc-a" };
const ctxB: RequestContext = { userId: "user-b", requestId: "r2", source: "user", accountId: "acc-b" };

function makeService(db: Db): FavoritesService {
  let seq = 0;
  return createFavoritesService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
  });
}

const PAGE = { page: 1, pageSize: 100 };

function item(awemeId: string, over: Partial<{ title: string; authorNickname: string; url: string }> = {}) {
  return {
    awemeId,
    title: over.title ?? `视频 ${awemeId}`,
    authorNickname: over.authorNickname ?? "作者甲",
    url: over.url ?? `https://www.douyin.com/video/${awemeId}`,
  };
}

describe("favorites service", () => {
  let db: Db;
  let svc: FavoritesService;
  beforeEach(async () => {
    ({ db } = await createDb());
    svc = makeService(db);
  });

  it("create → list 可见;collectsId 初始 null(首采匹配回填)、默认 enabled、按号 stamp", async () => {
    const created = await svc.createFolder(ctxA, { name: "选题库", note: "对标爆款" });
    expect(created.name).toBe("选题库");
    expect(created.collectsId).toBeNull();
    expect(created.lastSyncedAt).toBeNull();
    expect(created.enabled).toBe(true);
    expect(created.accountId).toBe("acc-a");
    const { rows, total } = await svc.listFolders(ctxA, PAGE);
    expect(total).toBe(1);
    expect(rows[0]!.note).toBe("对标爆款");
  });

  it("幂等:同名重复登记 → 更新不新建(collectsId 保留既有匹配)", async () => {
    const first = await svc.createFolder(ctxA, { name: "选题库" });
    await svc.updateFolderSync(ctxA, first.id, {
      collectsId: "7372169017362909234",
      lastSyncedAt: NOW,
    });
    const second = await svc.createFolder(ctxA, { name: "选题库", note: "新备注" });
    expect(second.id).toBe(first.id); // 同一行(upsert,不新建)
    expect(second.note).toBe("新备注");
    expect(second.collectsId).toBe("7372169017362909234"); // 既有匹配不被冲掉
    const { total } = await svc.listFolders(ctxA, PAGE);
    expect(total).toBe(1);
  });

  it("空名 → ValidationError(登记时挡住,匹配必失败的脏输入不进库)", async () => {
    await expect(svc.createFolder(ctxA, { name: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("toggle enabled 生效,listEnabledFolders 反映", async () => {
    const f = await svc.createFolder(ctxA, { name: "选题库" });
    expect((await svc.listEnabledFolders(ctxA)).length).toBe(1);
    const toggled = await svc.toggleFolder(ctxA, f.id, false);
    expect(toggled.enabled).toBe(false);
    expect((await svc.listEnabledFolders(ctxA)).length).toBe(0);
  });

  it("跨用户 toggle/remove/updateFolderSync → OwnershipError(404-class)", async () => {
    const f = await svc.createFolder(ctxA, { name: "选题库" });
    await expect(svc.toggleFolder(ctxB, f.id, false)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(svc.removeFolder(ctxB, f.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(
      svc.updateFolderSync(ctxB, f.id, { collectsId: "x" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("updateFolderSync 回填 collectsId + lastSyncedAt(首采按名匹配)", async () => {
    const f = await svc.createFolder(ctxA, { name: "选题库" });
    const synced = await svc.updateFolderSync(ctxA, f.id, {
      collectsId: "7372169017362909234",
      lastSyncedAt: NOW,
    });
    expect(synced.collectsId).toBe("7372169017362909234");
    expect(synced.lastSyncedAt).toBe(NOW);
  });

  it("recordItems 幂等:同 aweme_id 只插新;返回真写入条数", async () => {
    const f = await svc.createFolder(ctxA, { name: "选题库" });
    const first = await svc.recordItems(ctxA, f.id, [
      item("aw-1"),
      item("aw-2"),
    ]);
    expect(first.recordedNew).toBe(2);
    // 重采同视频 + 一条新的 → 只有新的算写入。
    const second = await svc.recordItems(ctxA, f.id, [
      item("aw-1"),
      item("aw-3"),
    ]);
    expect(second.recordedNew).toBe(1);
    // 无锚脏条目跳过(不落台账不计数)。
    const dirty = await svc.recordItems(ctxA, f.id, [item("")]);
    expect(dirty.recordedNew).toBe(0);
  });

  it("listPendingItems FIFO 限量 + markItemPromoted 流转(promoted 不再出现在 pending)", async () => {
    const f = await svc.createFolder(ctxA, { name: "选题库" });
    await svc.recordItems(ctxA, f.id, [item("aw-1"), item("aw-2"), item("aw-3")]);
    const pending = await svc.listPendingItems(ctxA, 2);
    expect(pending).toHaveLength(2); // 限量(防灌库 ≤N/run 语义)
    expect(pending[0]!.awemeId).toBe("aw-1"); // FIFO:先收藏先进池
    await svc.markItemPromoted(ctxA, pending[0]!.id, "cand-1");
    const rest = await svc.listPendingItems(ctxA, 10);
    expect(rest.map((r) => r.awemeId)).toEqual(["aw-2", "aw-3"]); // promoted 已出列
  });

  it("跨用户 markItemPromoted → OwnershipError;按号隔离 ctxB 看不到 ctxA 的夹/条目", async () => {
    const f = await svc.createFolder(ctxA, { name: "选题库" });
    await svc.recordItems(ctxA, f.id, [item("aw-1")]);
    const [pending] = await svc.listPendingItems(ctxA, 1);
    await expect(
      svc.markItemPromoted(ctxB, pending!.id, "cand-x"),
    ).rejects.toBeInstanceOf(OwnershipError);
    expect((await svc.listFolders(ctxB, PAGE)).total).toBe(0);
    expect((await svc.listPendingItems(ctxB, 10)).length).toBe(0);
  });

  it("remove 删除登记后 list 不再可见(items 台账保留溯源)", async () => {
    const f = await svc.createFolder(ctxA, { name: "选题库" });
    await svc.recordItems(ctxA, f.id, [item("aw-1")]);
    await svc.removeFolder(ctxA, f.id);
    expect((await svc.listFolders(ctxA, PAGE)).total).toBe(0);
    // 台账不随夹删(去重锚跨夹有效:重新登记同名夹也不重复进池)。
    expect((await svc.listPendingItems(ctxA, 10)).length).toBe(1);
  });
});
