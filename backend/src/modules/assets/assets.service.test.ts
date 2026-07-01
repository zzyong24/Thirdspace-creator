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
};
const ctxB: RequestContext = {
  userId: "user-b",
  requestId: "req-b",
  source: "user",
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

  it("second complete on the same session → ConflictError (idempotency)", async () => {
    const session = await service.createUpload(ctxA, {
      assetType: "image",
      mimeType: "image/png",
      fileSize: 1,
    });
    await service.completeUpload(ctxA, session.uploadId, { name: "x" });
    await expect(
      service.completeUpload(ctxA, session.uploadId, { name: "x" }),
    ).rejects.toBeInstanceOf(ConflictError);
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
