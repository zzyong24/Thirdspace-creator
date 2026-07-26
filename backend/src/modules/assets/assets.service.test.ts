import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createAssetRepository } from "./assets.repository";
import { createMockObjectStorage } from "./object-storage";
import { createAssetsService, type AssetsService } from "./assets.service";
import {
  OwnershipError,
  InvalidTransitionError,
  ConflictError,
  UploadValidationError,
} from "./assets.errors";

// C1–C8 / F1 — service-level §12 state-machine guards (valid + invalid) for
// trash/restore/archive, two-phase upload validation, and OwnershipError on
// foreign ids. Uses a fixed clock + the deterministic MockObjectStorage fake.

const NOW = "2026-06-21T02:00:00.000Z";
const ctxA: RequestContext = {
  userId: "user-a",
  requestId: "req-a",
  source: "user",
  accountId: "acct-a", // [T-332 S2] per-account strict:service 入口 requireAccountId
};
const ctxB: RequestContext = {
  userId: "user-b",
  requestId: "req-b",
  source: "user",
  accountId: "acct-b",
};

function deterministicDeps() {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${n}`;
    },
  };
}

let db: Db;
let service: AssetsService;

beforeEach(async () => {
  ({ db } = await createDb());
  const deps = deterministicDeps();
  const repo = createAssetRepository(db, deps);
  let keySeq = 0;
  const storage = createMockObjectStorage({
    nextKey: () => `uploads/key-${++keySeq}`,
  });
  // item B: AssetsService now takes a per-ctx storage factory (not a singleton).
  // The test pins ONE deterministic mock for every ctx.
  service = createAssetsService(repo, async () => storage, deps);
});

// Helper: run the full two-phase upload, returning the created asset resource.
async function upload(ctx: RequestContext, name = "新素材") {
  const session = await service.createUpload(ctx, {
    assetType: "image",
    mimeType: "image/png",
    fileSize: 2048,
  });
  return service.completeUpload(ctx, session.uploadId, { name });
}

describe("assets.service — createUpload (C3)", () => {
  it("returns the upload DTO + persists a created session", async () => {
    const session = await service.createUpload(ctxA, {
      assetType: "image",
      mimeType: "image/png",
      fileSize: 100,
    });
    expect(session.uploadId).toBeTruthy();
    expect(session.assetId).toBeTruthy();
    expect(session.storageKey).toBeTruthy();
    expect(session.uploadUrl).toContain(session.storageKey);
    expect(session.expiresAt).toBe(NOW);
  });

  it("rejects fileSize=0 / empty mimeType / bad assetType", async () => {
    await expect(
      service.createUpload(ctxA, {
        assetType: "image",
        mimeType: "image/png",
        fileSize: 0,
      }),
    ).rejects.toBeInstanceOf(UploadValidationError);
    await expect(
      service.createUpload(ctxA, {
        assetType: "image",
        mimeType: "",
        fileSize: 1,
      }),
    ).rejects.toBeInstanceOf(UploadValidationError);
    await expect(
      service.createUpload(ctxA, {
        assetType: "nope",
        mimeType: "image/png",
        fileSize: 1,
      }),
    ).rejects.toBeInstanceOf(UploadValidationError);
  });
});

describe("assets.service — completeUpload (C4)", () => {
  it("creates asset + first file (v1) and links currentFileId", async () => {
    const asset = await upload(ctxA);
    expect(asset.status).toBe("active");
    expect(asset.currentFileId).toBeTruthy();
    const got = await service.getAsset(ctxA, asset.id);
    expect(got.currentFileId).toBe(asset.currentFileId);
    expect(got.name).toBe("新素材");
  });

  it("second complete on the same session replays the same asset", async () => {
    const session = await service.createUpload(ctxA, {
      assetType: "image",
      mimeType: "image/png",
      fileSize: 1,
    });
    const first = await service.completeUpload(ctxA, session.uploadId, { name: "x" });
    const replay = await service.completeUpload(ctxA, session.uploadId, { name: "x" });
    expect(replay.id).toBe(first.id);
    expect(replay.currentFileId).toBe(first.currentFileId);
  });

  it("session for the wrong user → OwnershipError", async () => {
    const session = await service.createUpload(ctxA, {
      assetType: "image",
      mimeType: "image/png",
      fileSize: 1,
    });
    await expect(
      service.completeUpload(ctxB, session.uploadId, { name: "x" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});

describe("assets.service — createGeneratedAsset (L5 asset.generate)", () => {
  it("direct-writes server bytes + materializes asset (active) with a first file, listable", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const asset = await service.createGeneratedAsset(ctxA, {
      assetType: "image",
      name: "AI 生成图",
      bytes,
      mimeType: "image/png",
    });
    expect(asset.status).toBe("active");
    expect(asset.assetType).toBe("image");
    expect(asset.name).toBe("AI 生成图");
    expect(asset.currentFileId).toBeTruthy();
    // The generated asset is listable for its owner (born in the library).
    const list = await service.listAssets(ctxA, { limit: 50, cursor: null });
    expect(list.some((a) => a.id === asset.id)).toBe(true);
  });

  it("rejects empty bytes / bad assetType / empty mimeType (UploadValidationError)", async () => {
    await expect(
      service.createGeneratedAsset(ctxA, {
        assetType: "image",
        name: "n",
        bytes: new Uint8Array([]),
        mimeType: "image/png",
      }),
    ).rejects.toBeInstanceOf(UploadValidationError);
    await expect(
      service.createGeneratedAsset(ctxA, {
        assetType: "nope",
        name: "n",
        bytes: new Uint8Array([1]),
        mimeType: "image/png",
      }),
    ).rejects.toBeInstanceOf(UploadValidationError);
    await expect(
      service.createGeneratedAsset(ctxA, {
        assetType: "video",
        name: "n",
        bytes: new Uint8Array([1]),
        mimeType: "",
      }),
    ).rejects.toBeInstanceOf(UploadValidationError);
  });
});

describe("assets.service — [T-219] pending 截图 → 确认门 commitPendingAsset", () => {
  it("createGeneratedAsset({pending:true}) 生 pending → 不进素材库 list;commit 后才进库", async () => {
    const asset = await service.createGeneratedAsset(ctxA, {
      assetType: "image",
      name: "网页截图",
      bytes: new Uint8Array([1, 2, 3, 4]),
      mimeType: "image/png",
      pending: true,
    });
    expect(asset.status).toBe("pending");
    // 铁律②:未确认 → 素材库 list(active-only)不显示。
    let list = await service.listAssets(ctxA, { limit: 50, cursor: null });
    expect(list.some((a) => a.id === asset.id)).toBe(false);
    // 确认门:commit → active → 进库。
    const committed = await service.commitPendingAsset(ctxA, asset.id);
    expect(committed.status).toBe("active");
    list = await service.listAssets(ctxA, { limit: 50, cursor: null });
    expect(list.some((a) => a.id === asset.id)).toBe(true);
  });

  it("createGeneratedAsset 默认(不传 pending)仍生 active(封面/AI 生成直落场景不变)", async () => {
    const asset = await service.createGeneratedAsset(ctxA, {
      assetType: "image",
      name: "封面",
      bytes: new Uint8Array([9]),
      mimeType: "image/png",
    });
    expect(asset.status).toBe("active");
  });

  it("commitPendingAsset 越权 / 不存在 → OwnershipError(404)", async () => {
    const asset = await service.createGeneratedAsset(ctxA, {
      assetType: "image",
      name: "A 截图",
      bytes: new Uint8Array([1]),
      mimeType: "image/png",
      pending: true,
    });
    await expect(
      service.commitPendingAsset(ctxB, asset.id),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      service.commitPendingAsset(ctxA, "nope"),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});

describe("assets.service — getAsset / listAssets (C1/C2)", () => {
  it("getAsset(foreign id) → OwnershipError", async () => {
    const asset = await upload(ctxA);
    await expect(service.getAsset(ctxB, asset.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(service.getAsset(ctxA, "nope")).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("listAssets returns only active rows for the ctx user", async () => {
    await upload(ctxA, "A1");
    const trashable = await upload(ctxA, "A2");
    await service.trashAsset(ctxA, trashable.id);
    await upload(ctxB, "B1");
    const rows = await service.listAssets(ctxA, { limit: 50, cursor: null });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("A1");
  });

  // [T-248 批B] 回收站视图读侧:status:"deleted" 只返已回收行(user-scoped),
  // restore 后回到 active 视图、离开回收站视图 —— 还原闭环的读侧保证。
  it("listAssets({status:'deleted'}) 只返回收站行;restore 后回活跃视图", async () => {
    await upload(ctxA, "A1");
    const trashable = await upload(ctxA, "A2");
    await service.trashAsset(ctxA, trashable.id);
    const trashed = await service.listAssets(ctxA, {
      limit: 50,
      cursor: null,
      status: "deleted",
    });
    expect(trashed).toHaveLength(1);
    expect(trashed[0]!.name).toBe("A2");
    await service.restoreAsset(ctxA, trashable.id);
    const afterRestore = await service.listAssets(ctxA, {
      limit: 50,
      cursor: null,
      status: "deleted",
    });
    expect(afterRestore).toHaveLength(0);
    const active = await service.listAssets(ctxA, { limit: 50, cursor: null });
    expect(active.map((r) => r.name).sort()).toEqual(["A1", "A2"]);
  });
});

describe("assets.service — addAssetFile (C5)", () => {
  it("appends v2 + re-points currentFileId", async () => {
    const asset = await upload(ctxA);
    const v1 = asset.currentFileId;
    const file = await service.addAssetFile(ctxA, asset.id, {
      storageKey: "extra/file",
    });
    expect(file.versionNumber).toBe(2);
    const got = await service.getAsset(ctxA, asset.id);
    expect(got.currentFileId).toBe(file.id);
    expect(got.currentFileId).not.toBe(v1);
  });

  it("foreign asset → OwnershipError", async () => {
    const asset = await upload(ctxA);
    await expect(
      service.addAssetFile(ctxB, asset.id, { storageKey: "k" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});

describe("assets.service — §12 trash/restore (C6/C7)", () => {
  it("active → deleted sets deletedAt", async () => {
    const asset = await upload(ctxA);
    const trashed = await service.trashAsset(ctxA, asset.id);
    expect(trashed.status).toBe("deleted");
    expect(trashed.deletedAt).toBe(NOW);
  });

  it("trashing an already-deleted asset → InvalidTransitionError", async () => {
    const asset = await upload(ctxA);
    await service.trashAsset(ctxA, asset.id);
    await expect(service.trashAsset(ctxA, asset.id)).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
  });

  it("deleted → active clears deletedAt", async () => {
    const asset = await upload(ctxA);
    await service.trashAsset(ctxA, asset.id);
    const restored = await service.restoreAsset(ctxA, asset.id);
    expect(restored.status).toBe("active");
    expect(restored.deletedAt).toBeNull();
  });

  it("restoring an active asset → InvalidTransitionError", async () => {
    const asset = await upload(ctxA);
    await expect(service.restoreAsset(ctxA, asset.id)).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
  });
});

describe("assets.service — §12 archive (C8)", () => {
  it("active ↔ archived both ways; illegal pair → InvalidTransitionError", async () => {
    const asset = await upload(ctxA);
    const archived = await service.archiveAsset(ctxA, asset.id);
    expect(archived.status).toBe("archived");
    const unarchived = await service.unarchiveAsset(ctxA, asset.id);
    expect(unarchived.status).toBe("active");
    // archiving from active works; archiving a deleted asset is illegal.
    await service.trashAsset(ctxA, asset.id);
    await expect(service.archiveAsset(ctxA, asset.id)).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
  });
});

// [T-332 S2] service 入口账号断言 + 双账号隔离(未选号=引导态;by-id 跨号 404)。
describe("assets.service — per-account strict (T-332 S2)", () => {
  it("未选号(ctx.accountId 缺失)读写与 createUpload 都拒绝", async () => {
    const noAcct: RequestContext = {
      userId: "user-a",
      requestId: "req-na",
      source: "user",
      accountId: null,
    };
    await expect(
      service.listAssets(noAcct, { limit: 10, cursor: null }),
    ).rejects.toMatchObject({ name: "AccountRequiredError" });
    await expect(service.getAsset(noAcct, "asset-x")).rejects.toMatchObject({
      name: "AccountRequiredError",
    });
    await expect(
      service.createUpload(noAcct, {
        assetType: "image",
        mimeType: "image/png",
        fileSize: 10,
      }),
    ).rejects.toMatchObject({ name: "AccountRequiredError" });
  });

  it("upload intent 固定账号，切号 complete 与不存在同貌", async () => {
    const session = await service.createUpload(ctxA, {
      assetType: "image",
      mimeType: "image/png",
      fileSize: 10,
    });
    const switched: RequestContext = { ...ctxA, accountId: "acct-other" };
    await expect(
      service.completeUpload(switched, session.uploadId, { name: "x" }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(service.completeUpload(ctxA, session.uploadId, { name: "x" }))
      .resolves.toMatchObject({ id: session.assetId });
  });

  it("双账号 asset 隔离 + by-id 跨号 404(同 user 两个号)", async () => {
    const ctxA2: RequestContext = {
      userId: "user-a",
      requestId: "req-a2",
      source: "user",
      accountId: "acct-a2",
    };
    const a1 = await upload(ctxA, "号1素材");
    const a2 = await upload(ctxA2, "号2素材");
    const list1 = await service.listAssets(ctxA, { limit: 50, cursor: null });
    expect(list1.map((r) => r.name)).toContain("号1素材");
    expect(list1.map((r) => r.name)).not.toContain("号2素材");
    // by-id 跨号 → OwnershipError 404(号一致性门,§4.5)。
    await expect(service.getAsset(ctxA, a2.id)).rejects.toMatchObject({
      name: "OwnershipError",
    });
    await expect(service.trashAsset(ctxA2, a1.id)).rejects.toMatchObject({
      name: "OwnershipError",
    });
    // 本号内正常。
    await expect(service.getAsset(ctxA2, a2.id)).resolves.toMatchObject({
      id: a2.id,
    });
  });
});
