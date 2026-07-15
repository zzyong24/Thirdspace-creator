import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createPublishingService,
  type PublishingService,
} from "./publishing.service";
import { createMockPublisher, type MockPublisher } from "./platform-publisher";
import {
  ConflictError,
  OwnershipError,
  ValidationError,
} from "./publishing.errors";

// Step 3 — service: §12 state machine (draft → scheduled → published; draft →
// published; scheduled → failed; published → removed), external fact-of-record via
// MockPublisher, idempotency (re-publish reuses the row; same-status transition is
// a no-op), removed retains externalId, createRevision increments + becomes
// current, invalid-platform guard.

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };

let db: Db;
let publisher: MockPublisher;
let service: PublishingService;
let calls: {
  markPublished: number;
  search: number;
  activity: number;
  notify: number;
};

function build(db: Db) {
  let seq = 0;
  publisher = createMockPublisher();
  calls = { markPublished: 0, search: 0, activity: 0, notify: 0 };
  service = createPublishingService({
    db,
    now: () => NOW,
    nextId: (p: string) => `${p}-${++seq}`,
    publisher,
    markOutputPublished: () => {
      calls.markPublished += 1;
      return Promise.resolve();
    },
    searchIndex: () => {
      calls.search += 1;
      return Promise.resolve();
    },
    recordActivity: () => {
      calls.activity += 1;
      return Promise.resolve();
    },
    notify: () => {
      calls.notify += 1;
      return Promise.resolve();
    },
  });
}

beforeEach(async () => {
  ({ db } = await createDb());
  build(db);
});

// [DATA-H03] create 前校验 outputId 归属:复用已注入的 resolveOutputOwner 端口(越权/不存在
// → null → OwnershipError,不建悬空/跨属主 publication)。端口未注入(单测退化态)→ 放行。
describe("createPublication — [DATA-H03] output 归属校验", () => {
  it("output 不属当前用户 / 不存在 → OwnershipError,不建悬空 publication", async () => {
    let seq = 0;
    const guarded = createPublishingService({
      db,
      now: () => NOW,
      nextId: (p: string) => `${p}-h03-${++seq}`,
      publisher: createMockPublisher(),
      resolveOutputOwner: (_c, outputId) =>
        Promise.resolve(
          outputId === "output-mine"
            ? { projectId: "proj-mine", source: "manual" }
            : null,
        ),
    });
    await expect(
      guarded.createPublication(ctx, "output-theirs", {
        platform: "douyin",
        accountReference: "@a",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
    // 属主 output → 正常建(currentRevisionId 非空,auto-mint revision-1)。
    const ok = await guarded.createPublication(ctx, "output-mine", {
      platform: "douyin",
      accountReference: "@a",
    });
    expect(ok.status).toBe("draft");
    expect(ok.currentRevisionId).not.toBe("");
  });

  it("端口未注入(退化态)→ 跳过校验放行(生产组合根恒接线)", async () => {
    // 默认 build() 不注入 resolveOutputOwner → createPublication 不被校验拦。
    const pub = await service.createPublication(ctx, "output-any", {
      platform: "douyin",
      accountReference: "@a",
    });
    expect(pub.status).toBe("draft");
  });
});

// [DATA-H04] 平台发布副作用与本地 rollup 三步非原子:先调平台 → 更 publication → 更
// output/project。若 rollup 中途失败,publication 已 published 但项目永久未跃迁。同状态重试
// 补跑幂等 rollup 让其自愈(不重发平台)。
describe("transition — [DATA-H04] 已发布重试补跑 rollup 对账", () => {
  it("首发 rollup 失败(项目未跃迁)→ 同状态重试补跑成功,平台不重发", async () => {
    let seq = 0;
    let promoted = false;
    let attempts = 0;
    const mock = createMockPublisher();
    const svc = createPublishingService({
      db,
      now: () => NOW,
      nextId: (p: string) => `${p}-h04-${++seq}`,
      publisher: mock,
      markOutputPublished: () => {
        attempts += 1;
        if (attempts === 1) {
          // 首发 rollup 失败:publish 已落库(published),项目留在未跃迁态。
          throw new Error("rollup failed mid-flight");
        }
        promoted = true;
        return Promise.resolve();
      },
    });
    const pub = await svc.createPublication(ctx, "output-1", {
      platform: "bilibili",
      accountReference: "@a",
    });
    // 首发:平台 publish 成功、publication → published,但 rollup 抛错使 transition 抛。
    await expect(
      svc.transition(ctx, pub.id, { status: "published" }),
    ).rejects.toThrow();
    const after = await svc.getPublication(ctx, pub.id);
    expect(after.status).toBe("published"); // 平台事实已落
    expect(promoted).toBe(false); // 但项目未跃迁
    // 同状态重试 → 命中重试对账,补跑 rollup 成功(平台不重发)。
    await svc.transition(ctx, pub.id, { status: "published" });
    expect(promoted).toBe(true);
    expect(mock.records().length).toBe(1); // 平台只发过一次
  });
});

describe("createPublication (OQ4: auto-mints revision 1)", () => {
  it("auto-creates an empty revision-1 and sets it current so currentRevisionId is a real id", async () => {
    const pub = await service.createPublication(ctx, "output-1", {
      platform: "bilibili",
      accountReference: "@a",
    });
    expect(pub.status).toBe("draft");
    expect(pub.currentRevisionId).not.toBeNull();
    expect(pub.currentRevisionId).not.toBe("");
  });

  it("throws ValidationError on an unknown platform string", async () => {
    await expect(
      service.createPublication(ctx, "output-1", {
        platform: "myspace",
        accountReference: "@a",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("createRevision", () => {
  it("increments revisionNumber and updates currentRevisionId to the new revision", async () => {
    const pub = await service.createPublication(ctx, "output-1", {
      platform: "youtube",
      accountReference: "@a",
    });
    const rev = await service.createRevision(ctx, pub.id, {
      title: "新标题",
      description: "desc",
    });
    expect(rev.revisionNumber).toBe(2); // revision 1 was auto-minted at create
    const after = await service.getPublication(ctx, pub.id);
    expect(after.currentRevisionId).toBe(rev.id);
  });
});

describe("transition — valid paths", () => {
  it("draft → scheduled stamps scheduledAt; no publisher call", async () => {
    const pub = await service.createPublication(ctx, "output-1", {
      platform: "douyin",
      accountReference: "@a",
    });
    const out = await service.transition(ctx, pub.id, { status: "scheduled" });
    expect(out.status).toBe("scheduled");
    expect(out.scheduledAt).toBe(NOW);
    expect(publisher.records().length).toBe(0);
  });

  it("scheduled → published calls publisher.publish once, stamps external fields + publishedAt, markOutputPublished once", async () => {
    const pub = await service.createPublication(ctx, "output-1", {
      platform: "bilibili",
      accountReference: "@a",
    });
    await service.transition(ctx, pub.id, { status: "scheduled" });
    const spy = vi.spyOn(publisher, "publish");
    const out = await service.transition(ctx, pub.id, { status: "published" });
    expect(out.status).toBe("published");
    expect(out.externalId).not.toBeNull();
    expect(out.externalUrl).not.toBeNull();
    expect(out.publishedAt).toBe(NOW);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(calls.markPublished).toBe(1);
  });

  it("draft → published (immediate publish) is allowed", async () => {
    const pub = await service.createPublication(ctx, "output-1", {
      platform: "x",
      accountReference: "@a",
    });
    const out = await service.transition(ctx, pub.id, { status: "published" });
    expect(out.status).toBe("published");
    expect(out.externalId).not.toBeNull();
  });
});

describe("transition — invalid paths", () => {
  it("draft → removed (illegal) throws ConflictError", async () => {
    const pub = await service.createPublication(ctx, "output-1", {
      platform: "bilibili",
      accountReference: "@a",
    });
    await expect(
      service.transition(ctx, pub.id, { status: "removed" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("published → scheduled (backward) throws ConflictError", async () => {
    const pub = await service.createPublication(ctx, "output-1", {
      platform: "bilibili",
      accountReference: "@a",
    });
    await service.transition(ctx, pub.id, { status: "published" });
    await expect(
      service.transition(ctx, pub.id, { status: "scheduled" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("transition — idempotency (SPEC §17/§22)", () => {
  it("transition to published twice does not re-publish or re-fan-out; same externalId", async () => {
    const pub = await service.createPublication(ctx, "output-1", {
      platform: "bilibili",
      accountReference: "@a",
    });
    const first = await service.transition(ctx, pub.id, { status: "published" });
    const spy = vi.spyOn(publisher, "publish");
    const second = await service.transition(ctx, pub.id, {
      status: "published",
    });
    expect(spy).not.toHaveBeenCalled();
    expect(second.externalId).toBe(first.externalId);
    expect(second.status).toBe("published");
    // [DATA-H04] 平台 publish 不重放,但幂等 rollup 在重进 published 时补跑对账
    //   (自愈「已发布但项目未跃迁」)—— markOutputPublished 两次调用。派生副作用
    //   (search/activity/notify)不重放(仍各 1 次)。
    expect(calls.markPublished).toBe(2);
    expect(calls.search).toBe(1);
    expect(calls.notify).toBe(1);
  });

  it("same-status transition is a no-op returning the existing DTO", async () => {
    const pub = await service.createPublication(ctx, "output-1", {
      platform: "douyin",
      accountReference: "@a",
    });
    await service.transition(ctx, pub.id, { status: "scheduled" });
    const out = await service.transition(ctx, pub.id, { status: "scheduled" });
    expect(out.status).toBe("scheduled");
    expect(publisher.records().length).toBe(0);
  });
});

describe("transition — removed retains externalId", () => {
  it("published → removed stamps removedAt, retains externalId, calls publisher.remove once", async () => {
    const pub = await service.createPublication(ctx, "output-1", {
      platform: "bilibili",
      accountReference: "@a",
    });
    const published = await service.transition(ctx, pub.id, {
      status: "published",
    });
    const removeSpy = vi.spyOn(publisher, "remove");
    const removed = await service.transition(ctx, pub.id, {
      status: "removed",
    });
    expect(removed.status).toBe("removed");
    expect(removed.removedAt).toBe(NOW);
    // externalId retained (not nulled) — metrics history anchor (SPEC §13.3).
    expect(removed.externalId).toBe(published.externalId);
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});

describe("scheduled → failed", () => {
  it("is allowed and sets status failed", async () => {
    const pub = await service.createPublication(ctx, "output-1", {
      platform: "bilibili",
      accountReference: "@a",
    });
    await service.transition(ctx, pub.id, { status: "scheduled" });
    const out = await service.transition(ctx, pub.id, { status: "failed" });
    expect(out.status).toBe("failed");
  });
});

describe("getRecentPublications", () => {
  it("returns the user's publications newest-first across outputs", async () => {
    await service.createPublication(ctx, "output-1", {
      platform: "bilibili",
      accountReference: "@a",
    });
    await service.createPublication(ctx, "output-2", {
      platform: "douyin",
      accountReference: "@a",
    });
    const recent = await service.getRecentPublications(ctx, { limit: 10 });
    expect(recent.length).toBe(2);
  });
});

// [T-073] 平台侧可见性同步:抖音端「仅自己可见/已隐藏」→ hidden_at 非空(不碰 status)。
describe("setVisibilityByExternalKey ([T-073] 平台侧可见性)", () => {
  it("按 (platform, externalId) 置 hidden_at,再次同步 hidden=false 清空", async () => {
    const pub = await service.createImportedPublication(ctx, "output-1", {
      platform: "douyin",
      externalId: "aweme-1",
    });
    expect(pub.hiddenAt).toBeNull();

    const hidden = await service.setVisibilityByExternalKey(ctx, {
      platform: "douyin",
      externalId: "aweme-1",
      hidden: true,
    });
    expect(hidden?.hiddenAt).toBe(NOW);
    // status 状态机不受影响(隐藏 ≠ 下架)。
    expect(hidden?.status).toBe("published");

    const visible = await service.setVisibilityByExternalKey(ctx, {
      platform: "douyin",
      externalId: "aweme-1",
      hidden: false,
    });
    expect(visible?.hiddenAt).toBeNull();
  });

  it("幂等:已是目标态不再写(updatedAt 不变)", async () => {
    await service.createImportedPublication(ctx, "output-1", {
      platform: "douyin",
      externalId: "aweme-2",
    });
    const first = await service.setVisibilityByExternalKey(ctx, {
      platform: "douyin",
      externalId: "aweme-2",
      hidden: true,
    });
    const second = await service.setVisibilityByExternalKey(ctx, {
      platform: "douyin",
      externalId: "aweme-2",
      hidden: true,
    });
    expect(second?.hiddenAt).toBe(first?.hiddenAt);
    expect(second?.updatedAt).toBe(first?.updatedAt);
  });

  it("找不到该 (platform, externalId)(作品未导入)→ 诚实返 null", async () => {
    const out = await service.setVisibilityByExternalKey(ctx, {
      platform: "douyin",
      externalId: "aweme-missing",
      hidden: true,
    });
    expect(out).toBeNull();
  });
});

// [T-078] 封面回填的读侧(缺封面候选集)与落账(setCover append-only 幂等)。
describe("listPublicationsMissingCover / setCover ([T-078] 作品封面)", () => {
  it("导入作品(无 revision)进候选集;setCover 后离开候选集(幂等的根)", async () => {
    const pub = await service.createImportedPublication(ctx, "output-1", {
      platform: "douyin",
      externalId: "aweme-c1",
    });
    let missing = await service.listPublicationsMissingCover(ctx, {
      platform: "douyin",
    });
    expect(missing.map((p) => p.id)).toEqual([pub.id]);

    const rev = await service.setCover(ctx, pub.id, "asset-cover-1");
    expect(rev.coverAssetId).toBe("asset-cover-1");
    // 新 revision 已置 current。
    const after = await service.getPublication(ctx, pub.id);
    expect(after.currentRevisionId).toBe(rev.id);

    missing = await service.listPublicationsMissingCover(ctx, {
      platform: "douyin",
    });
    expect(missing).toEqual([]);
  });

  it("setCover 幂等:当前 revision 已有封面 → 原样返回,不覆盖(用户手选优先)", async () => {
    const pub = await service.createImportedPublication(ctx, "output-1", {
      platform: "douyin",
      externalId: "aweme-c2",
    });
    const first = await service.setCover(ctx, pub.id, "asset-user-picked");
    const second = await service.setCover(ctx, pub.id, "asset-collector");
    expect(second.id).toBe(first.id);
    expect(second.coverAssetId).toBe("asset-user-picked");
  });

  it("setCover 复制当前 revision 字段追加新版(append-only,标题/标签不丢)", async () => {
    const pub = await service.createPublication(ctx, "output-1", {
      platform: "douyin",
      accountReference: "@a",
    });
    await service.createRevision(ctx, pub.id, {
      title: "真标题",
      description: "desc",
      platformTags: ["tag1"],
    });
    const rev = await service.setCover(ctx, pub.id, "asset-cover-2");
    expect(rev.title).toBe("真标题");
    expect(rev.platformTags).toEqual(["tag1"]);
    expect(rev.coverAssetId).toBe("asset-cover-2");
    expect(rev.revisionNumber).toBe(3); // v1 空版 + v2 真标题 + v3 带封面
  });

  it("候选集过滤:无 externalId(草稿)/ 已隐藏 / 其他平台 都不进", async () => {
    // 站内草稿(published=false 且无 externalId)。
    await service.createPublication(ctx, "output-1", {
      platform: "douyin",
      accountReference: "@a",
    });
    // 其他平台的导入作品。
    await service.createImportedPublication(ctx, "output-2", {
      platform: "bilibili",
      externalId: "bv-1",
    });
    // 已隐藏的抖音作品。
    await service.createImportedPublication(ctx, "output-3", {
      platform: "douyin",
      externalId: "aweme-hidden",
    });
    await service.setVisibilityByExternalKey(ctx, {
      platform: "douyin",
      externalId: "aweme-hidden",
      hidden: true,
    });
    const missing = await service.listPublicationsMissingCover(ctx, {
      platform: "douyin",
    });
    expect(missing).toEqual([]);
  });

  it("setCover 走 assertCoverOwned 校验:非本用户 asset → ValidationError", async () => {
    // 重建 service,接一个只认 asset-mine 的 cover 校验 seam。
    let seq = 100;
    const guarded = createPublishingService({
      db,
      now: () => NOW,
      nextId: (p: string) => `${p}-${++seq}`,
      publisher,
      assertCoverOwned: async (_c, assetId) => {
        if (assetId !== "asset-mine") throw new Error("not yours");
      },
    });
    const pub = await guarded.createImportedPublication(ctx, "output-1", {
      platform: "douyin",
      externalId: "aweme-c3",
    });
    await expect(
      guarded.setCover(ctx, pub.id, "asset-theirs"),
    ).rejects.toBeInstanceOf(ValidationError);
    const ok = await guarded.setCover(ctx, pub.id, "asset-mine");
    expect(ok.coverAssetId).toBe("asset-mine");
  });
});

// [T-323] register 重锚:日拉自动建的 imported 空壳占用了作品,用户手动项目 register 时
// 让位重锚(把作品换锚到手动 output)+ 归档空壳。用 fake 端口注入 owner 判据 + 归档 seam。
describe("registerOwnerPublication ([T-323] 重锚 + 归档空壳)", () => {
  let markedOwners: string[];
  let archived: string[];
  let owners: Map<string, { projectId: string; source: string }>;

  // injectOwnerSeams=false 模拟组合根未注入 resolveOutputOwner/archiveProjectSeam 的退化态。
  function buildWithSeams(injectOwnerSeams: boolean): PublishingService {
    let seq = 0;
    markedOwners = [];
    archived = [];
    owners = new Map();
    return createPublishingService({
      db,
      now: () => NOW,
      nextId: (p: string) => `${p}-${++seq}`,
      publisher: createMockPublisher(),
      markOwnerProjectPublished: (_c, outputId) => {
        markedOwners.push(outputId);
        return Promise.resolve();
      },
      ...(injectOwnerSeams
        ? {
            resolveOutputOwner: (_c: RequestContext, outputId: string) =>
              Promise.resolve(owners.get(outputId) ?? null),
            archiveProjectSeam: (_c: RequestContext, projectId: string) => {
              archived.push(projectId);
              return Promise.resolve();
            },
          }
        : {}),
    });
  }

  it("重锚:imported 空壳持有 aweme → 手动 output register → 换锚 + 归档空壳 + markPublished(手动 output)", async () => {
    const svc = buildWithSeams(true);
    owners.set("output-shell", { projectId: "proj-shell", source: "imported" });
    owners.set("output-manual", { projectId: "proj-manual", source: "manual" });
    // 日拉先为真实作品建了 imported 空壳,pub 锚在空壳 output。
    const shellPub = await svc.createImportedPublication(ctx, "output-shell", {
      platform: "douyin",
      externalId: "aweme-reanchor",
    });
    // 用户手动新建项目,同链接登记已发布 → 命中被空壳占用的作品。
    const result = await svc.registerOwnerPublication(ctx, "output-manual", {
      platform: "douyin",
      externalId: "aweme-reanchor",
    });
    // 同一 pub 行(未新建),content_output 重锚到手动 output。
    expect(result.id).toBe(shellPub.id);
    expect(result.contentOutputId).toBe("output-manual");
    // 旧空壳项目被归档。
    expect(archived).toContain("proj-shell");
    // 手动 output 属主项目跃迁已发布。
    expect(markedOwners).toContain("output-manual");
    // 落库确认重锚是持久的,且 status/external_id 不变(只换锚)。
    const after = await svc.getPublication(ctx, shellPub.id);
    expect(after.contentOutputId).toBe("output-manual");
    expect(after.status).toBe("published");
    expect(after.externalId).toBe("aweme-reanchor");
  });

  it("不抢:existing 已属真实手动项目 → 不 archive、不重锚、返回 existing", async () => {
    const svc = buildWithSeams(true);
    owners.set("output-A", { projectId: "proj-A", source: "manual" });
    owners.set("output-B", { projectId: "proj-B", source: "manual" });
    const pubA = await svc.createImportedPublication(ctx, "output-A", {
      platform: "douyin",
      externalId: "aweme-nosteal",
    });
    const result = await svc.registerOwnerPublication(ctx, "output-B", {
      platform: "douyin",
      externalId: "aweme-nosteal",
    });
    expect(result.id).toBe(pubA.id);
    expect(result.contentOutputId).toBe("output-A"); // 未重锚
    expect(archived).toEqual([]); // 未归档
    // 保守跃迁 existing 的属主 output(不动用户项目归属)。
    expect(markedOwners).toContain("output-A");
  });

  it("幂等:existing 已锚在同 output → 只 markPublished、不重锚、不归档", async () => {
    const svc = buildWithSeams(true);
    owners.set("output-X", { projectId: "proj-X", source: "manual" });
    const pub = await svc.createImportedPublication(ctx, "output-X", {
      platform: "douyin",
      externalId: "aweme-idem",
    });
    const result = await svc.registerOwnerPublication(ctx, "output-X", {
      platform: "douyin",
      externalId: "aweme-idem",
    });
    expect(result.id).toBe(pub.id);
    expect(result.contentOutputId).toBe("output-X");
    expect(archived).toEqual([]);
    expect(markedOwners).toContain("output-X");
  });

  it("新建:无 existing → 建 published pub(带 external_id)+ markPublished(本 output)", async () => {
    const svc = buildWithSeams(true);
    const result = await svc.registerOwnerPublication(ctx, "output-new", {
      platform: "douyin",
      externalId: "aweme-fresh",
      externalUrl: "https://douyin.example/aweme-fresh",
    });
    expect(result.status).toBe("published");
    expect(result.externalId).toBe("aweme-fresh");
    expect(result.contentOutputId).toBe("output-new");
    expect(markedOwners).toContain("output-new");
    expect(archived).toEqual([]);
  });

  it("端口未注入退化:缺 resolveOutputOwner/archiveProjectSeam → 走保守「不抢」,不炸", async () => {
    const svc = buildWithSeams(false); // 不注入 owner seams(仅 markOwnerProjectPublished 在)
    const shellPub = await svc.createImportedPublication(ctx, "output-shell", {
      platform: "douyin",
      externalId: "aweme-degraded",
    });
    const result = await svc.registerOwnerPublication(ctx, "output-manual", {
      platform: "douyin",
      externalId: "aweme-degraded",
    });
    // 拿不到 owner 信息 → 不重锚(保守),返回 existing(锚在空壳,未动)。
    expect(result.id).toBe(shellPub.id);
    expect(result.contentOutputId).toBe("output-shell");
    expect(archived).toEqual([]);
    // 仍 best-effort 跃迁 existing 的属主(markOwnerProjectPublished 已注入)。
    expect(markedOwners).toContain("output-shell");
  });

  it("未知平台 → ValidationError(与 createImportedPublication 同门禁)", async () => {
    const svc = buildWithSeams(true);
    await expect(
      svc.registerOwnerPublication(ctx, "output-1", {
        platform: "myspace",
        externalId: "x-1",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
