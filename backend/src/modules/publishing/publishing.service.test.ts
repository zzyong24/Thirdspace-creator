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
