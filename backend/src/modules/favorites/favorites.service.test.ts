import { describe, it, expect, beforeEach } from "vitest";
import { createDb, projects, type Db } from "@creatoros/backend";
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

  // ── [T-235d-distill] 蒸馏链落点(transcript 落点 / 判库裁决 / 确认门读面 / origin 隔离) ──
  describe("蒸馏链落点", () => {
    it("listItemsForDistill:distill_status IS NULL 才入批,FIFO 限量;落裁决后出批", async () => {
      const f = await svc.createFolder(ctxA, { name: "选题库" });
      await svc.recordItems(ctxA, f.id, [item("aw-1"), item("aw-2"), item("aw-3")]);
      const batch = await svc.listItemsForDistill(ctxA, 2);
      expect(batch).toHaveLength(2); // 限量(≤N/run 防超载)
      expect(batch[0]!.awemeId).toBe("aw-1"); // FIFO:先收藏先蒸
      expect(batch[0]!.transcript).toBeNull(); // 未转写
      // 落裁决 → 出 NULL 批(防 FIFO 头阻塞)。
      await svc.saveDistillVerdict(ctxA, batch[0]!.id, {
        status: "topic",
        result: { reason: "纯跟拍" },
      });
      const rest = await svc.listItemsForDistill(ctxA, 10);
      expect(rest.map((r) => r.awemeId)).toEqual(["aw-2", "aw-3"]);
    });

    it("saveTranscript:逐字稿落 favorites_items 自身(他人作品独立落点),复用批可读到", async () => {
      const f = await svc.createFolder(ctxA, { name: "选题库" });
      await svc.recordItems(ctxA, f.id, [item("aw-1")]);
      const [it0] = await svc.listItemsForDistill(ctxA, 1);
      await svc.saveTranscript(ctxA, it0!.id, "这是一条逐字稿正文");
      // transcript 已落但未判库 → 仍在 NULL 批(distill_status 还没写),且 transcript 可读(省流复用)。
      const [again] = await svc.listItemsForDistill(ctxA, 1);
      expect(again!.transcript).toBe("这是一条逐字稿正文");
    });

    it("saveDistillVerdict(knowledge)→ listDistillPending 读到 atoms(确认门候选,人采纳才落库)", async () => {
      const f = await svc.createFolder(ctxA, { name: "选题库" });
      await svc.recordItems(ctxA, f.id, [item("aw-1"), item("aw-2")]);
      const batch = await svc.listItemsForDistill(ctxA, 2);
      await svc.saveDistillVerdict(ctxA, batch[0]!.id, {
        status: "knowledge",
        result: {
          reason: "含方法论",
          atoms: [{ type: "claim", title: "观点本体", note: "", sourceNote: "" }],
          suggestedTags: ["方法论"],
        },
      });
      await svc.saveDistillVerdict(ctxA, batch[1]!.id, {
        status: "skip",
        result: { reason: "无信息量" },
      });
      const pending = await svc.listDistillPending(ctxA, 10);
      expect(pending).toHaveLength(1); // 只 knowledge 进确认门读面
      expect(pending[0]!.awemeId).toBe("aw-1");
      const atoms = pending[0]!.distillResult.atoms as Array<{ title: string }>;
      expect(atoms[0]!.title).toBe("观点本体");
    });

    it("origin 隔离:蒸馏落点全在 favorites_items,绝不建 projects 行(他人作品≠imported)", async () => {
      const f = await svc.createFolder(ctxA, { name: "选题库" });
      await svc.recordItems(ctxA, f.id, [item("aw-1")]);
      const [it0] = await svc.listItemsForDistill(ctxA, 1);
      await svc.saveTranscript(ctxA, it0!.id, "逐字稿");
      await svc.saveDistillVerdict(ctxA, it0!.id, {
        status: "knowledge",
        result: { atoms: [], suggestedTags: [] },
      });
      // 收藏作品蒸馏后,projects 表**零行**(逐字稿没绑成 imported script artifact,origin 隔离守住)。
      const projectRows = await db.select().from(projects);
      expect(projectRows).toHaveLength(0);
    });

    it("按号隔离 + 跨用户:distill 读面各自 scoped", async () => {
      const f = await svc.createFolder(ctxA, { name: "选题库" });
      await svc.recordItems(ctxA, f.id, [item("aw-1")]);
      const [it0] = await svc.listItemsForDistill(ctxA, 1);
      await svc.saveDistillVerdict(ctxA, it0!.id, {
        status: "knowledge",
        result: { atoms: [] },
      });
      expect((await svc.listDistillPending(ctxB, 10)).length).toBe(0);
      expect((await svc.listItemsForDistill(ctxB, 10)).length).toBe(0);
    });
  });

  // [T-326 DATA-H02] 唯一键升级为账号维度(迁移 0041,NULLS NOT DISTINCT):同一用户的
  //   第二个号可以登记同名夹 / 收藏同一视频(各自成行),不再复用/改写第一号的数据;
  //   同号(含"未选号"的 NULL 桶)重复写仍幂等。
  describe("账号维度唯一键 (T-326 DATA-H02)", () => {
    const ctxA1: RequestContext = {
      userId: "user-a",
      requestId: "r-a1",
      source: "user",
      accountId: "acct-1",
    };
    const ctxA2: RequestContext = {
      userId: "user-a",
      requestId: "r-a2",
      source: "user",
      accountId: "acct-2",
    };
    // 未选号 ctx(存量/兜底写路径 → account_id NULL 桶)。
    const ctxANull: RequestContext = {
      userId: "user-a",
      requestId: "r-an",
      source: "user",
    };

    it("同 user 两个号登记同名夹 → 各自成行,互不改写", async () => {
      const f1 = await svc.createFolder(ctxA1, { name: "选题库", note: "号1" });
      const f2 = await svc.createFolder(ctxA2, { name: "选题库", note: "号2" });
      expect(f2.id).not.toBe(f1.id); // 第二号新建,不复用第一号的行
      expect(f1.accountId).toBe("acct-1");
      expect(f2.accountId).toBe("acct-2");
      // 号1 视图只见自己的夹,note 未被号2 改写。
      const { rows: rows1 } = await svc.listFolders(ctxA1, PAGE);
      expect(rows1.length).toBe(1);
      expect(rows1[0]!.note).toBe("号1");
    });

    it("未选号(NULL 桶)同名重复登记仍幂等(NULLS NOT DISTINCT)", async () => {
      const first = await svc.createFolder(ctxANull, { name: "存量夹" });
      const second = await svc.createFolder(ctxANull, { name: "存量夹", note: "更新" });
      expect(second.id).toBe(first.id); // NULL 桶自身归并,不产平行行
      // 存量 NULL 行在全局视图(未选号)仍可读。
      const { rows } = await svc.listFolders(ctxANull, PAGE);
      expect(rows.some((r) => r.id === first.id)).toBe(true);
    });

    it("两个号收藏同一视频 → 各记一行台账(第二号不再被吞)", async () => {
      const f1 = await svc.createFolder(ctxA1, { name: "夹1" });
      const f2 = await svc.createFolder(ctxA2, { name: "夹2" });
      const r1 = await svc.recordItems(ctxA1, f1.id, [item("aw-1")]);
      expect(r1.recordedNew).toBe(1);
      const r2 = await svc.recordItems(ctxA2, f2.id, [item("aw-1")]);
      expect(r2.recordedNew).toBe(1); // 旧唯一键 (user, aweme) 下这里会是 0(被号1吞掉)
      // 同号重复收藏仍去重。
      const r1again = await svc.recordItems(ctxA1, f1.id, [item("aw-1")]);
      expect(r1again.recordedNew).toBe(0);
      // 各号 pending 各自可见一条。
      expect((await svc.listPendingItems(ctxA1, 10)).length).toBe(1);
      expect((await svc.listPendingItems(ctxA2, 10)).length).toBe(1);
    });
  });
});
