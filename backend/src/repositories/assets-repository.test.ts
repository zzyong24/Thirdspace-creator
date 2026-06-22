import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createAssetsRepository,
  type AssetsRepository,
} from "./assets-repository";

const FIXED_NOW = "2026-06-13T02:00:00.000Z";

function deterministicDeps(userId = "user-1") {
  const counters = new Map<string, number>();
  return {
    now: () => FIXED_NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-db-${n}`;
    },
    userId,
  };
}

let db: Db;
let repo: AssetsRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createAssetsRepository(db, deterministicDeps());
});

// Helper: run the two-phase upload to produce a persisted active asset.
async function uploadAsset(name = "封面图") {
  const upload = await repo.createUpload({
    assetType: "image",
    mimeType: "image/png",
    fileSize: 2048,
  });
  return repo.completeUpload(upload.uploadId, {
    name,
    width: 1920,
    height: 1080,
    checksum: "sha256:abc",
    mediaMetadata: { camera: "test" },
  });
}

describe("AssetsRepository (pglite-backed real persistence)", () => {
  it("runs the two-phase upload: create records pending, complete finalizes", async () => {
    const upload = await repo.createUpload({
      assetType: "image",
      mimeType: "image/png",
      fileSize: 2048,
    });
    expect(upload.uploadId).toBe("upload-db-1");
    expect(upload.storageKey).toBe("uploads/user-1/upload-db-1");
    expect(upload.uploadUrl).toContain(upload.storageKey);
    // 24h presign window off the injected clock — deterministic.
    expect(upload.expiresAt).toBe("2026-06-14T02:00:00.000Z");

    const asset = await repo.completeUpload(upload.uploadId, {
      name: "封面图",
      width: 1920,
      height: 1080,
      checksum: "sha256:abc",
      mediaMetadata: { camera: "test" },
    });
    expect(asset.id).toBe("asset-db-1");
    expect(asset.status).toBe("active");
    expect(asset.assetType).toBe("image");
    expect(asset.name).toBe("封面图");
    expect(asset.currentFileId).toBe("file-db-1");
    expect(asset.deletedAt).toBeNull();

    // First version file carries the media metadata from the finalized upload.
    const files = await repo.listFiles(asset.id);
    expect(files).toHaveLength(1);
    expect(files[0]!.versionNumber).toBe(1);
    expect(files[0]!.storageKey).toBe(upload.storageKey);
    expect(files[0]!.fileSize).toBe(2048);
    expect(typeof files[0]!.fileSize).toBe("number");
    expect(files[0]!.width).toBe(1920);
    expect(files[0]!.height).toBe(1080);
    expect(files[0]!.checksum).toBe("sha256:abc");
    expect(files[0]!.mediaMetadata).toEqual({ camera: "test" });
  });

  it("reads an asset back and lists it (user-scoped)", async () => {
    const asset = await uploadAsset();
    const fetched = await repo.get(asset.id);
    expect(fetched.name).toBe("封面图");

    const list = await repo.list();
    expect(list.map((a) => a.id)).toContain(asset.id);
  });

  it("throws for a missing asset", async () => {
    await expect(repo.get("nope")).rejects.toThrow(/not found/);
  });

  it("throws for a missing upload on complete", async () => {
    await expect(
      repo.completeUpload("nope", { name: "x" }),
    ).rejects.toThrow(/not found/);
  });

  it("rejects double-finalizing an upload", async () => {
    const upload = await repo.createUpload({
      assetType: "video",
      mimeType: "video/mp4",
      fileSize: 1000,
    });
    await repo.completeUpload(upload.uploadId, { name: "v" });
    await expect(
      repo.completeUpload(upload.uploadId, { name: "v again" }),
    ).rejects.toThrow(/already completed/);
  });

  it("appends a new immutable version file and repoints currentFileId", async () => {
    const asset = await uploadAsset();
    const v2 = await repo.addFile(asset.id, {
      storageKey: "uploads/user-1/v2",
      mimeType: "image/png",
      fileSize: 4096,
    });
    expect(v2.versionNumber).toBe(2);
    expect(v2.fileSize).toBe(4096);

    const refreshed = await repo.get(asset.id);
    expect(refreshed.currentFileId).toBe(v2.id);

    const files = await repo.listFiles(asset.id);
    expect(files.map((f) => f.versionNumber)).toEqual([1, 2]);
  });

  it("archives and unarchives (active ↔ archived)", async () => {
    const asset = await uploadAsset();
    const archived = await repo.archive(asset.id);
    expect(archived.status).toBe("archived");
    expect(archived.deletedAt).toBeNull();

    const active = await repo.unarchive(asset.id);
    expect(active.status).toBe("active");
  });

  it("trashes and restores (active → deleted → active)", async () => {
    const asset = await uploadAsset();
    const trashed = await repo.trash(asset.id);
    expect(trashed.status).toBe("deleted");
    expect(trashed.deletedAt).toBe(FIXED_NOW);

    const restored = await repo.restore(asset.id);
    expect(restored.status).toBe("active");
    expect(restored.deletedAt).toBeNull();
  });

  it("rejects a non-adjacent transition (archived → deleted)", async () => {
    const asset = await uploadAsset();
    await repo.archive(asset.id); // active → archived
    await expect(repo.trash(asset.id)).rejects.toThrow(
      /illegal asset transition archived -> deleted/,
    );
  });

  it("hides assets owned by another user (ownership scoping)", async () => {
    const mine = await uploadAsset();
    const otherRepo = createAssetsRepository(db, deterministicDeps("user-2"));
    await expect(otherRepo.get(mine.id)).rejects.toThrow(/not found/);
    expect(await otherRepo.list()).toHaveLength(0);
  });

  it("seeds assets idempotently", async () => {
    const seedRow = {
      id: "seed-1",
      userId: "user-1",
      currentFileId: null,
      assetType: "image",
      name: "种子素材",
      description: "",
      status: "active",
      deletedAt: null,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    };
    await repo.seedAssets([seedRow]);
    await repo.seedAssets([seedRow]); // again — conflict ignored
    const list = await repo.list();
    expect(list.filter((a) => a.id === "seed-1")).toHaveLength(1);
  });
});
