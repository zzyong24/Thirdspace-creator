import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createPublishingService,
  type PublishingService,
} from "./publishing.service";
import { createMockPublisher, type MockPublisher } from "./platform-publisher";
import { ConflictError, ValidationError } from "./publishing.errors";

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
    // markOutputPublished ran exactly once across both calls.
    expect(calls.markPublished).toBe(1);
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
