import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createAssetRepository,
  type AssetRepository,
} from "./assets.repository";
import { OwnershipError } from "./assets.errors";

// A2 + B1–B6 — user-scoped repository integration test (pglite-backed). Ownership
// is the sole boundary (foundation §2): user A cannot list/get/update user B's
// assets, files, or upload sessions; a cross-user id is indistinguishable from a
// missing one (null → service raises OwnershipError → 404). Plus: the schema
// round-trips, asset_files.storage_key uniqueness holds, default-scope listing is
// active-only, and versionNumber auto-increments.

const A = "user-a";
const B = "user-b";
const NOW = "2026-06-21T00:00:00.000Z";

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
let repo: AssetRepository;

beforeEach(async () => {
  ({ db } = await createDb());
  repo = createAssetRepository(db, deterministicDeps());
});

async function makeAsset(userId: string, name = "素材") {
  return repo.insertAsset(userId, {
    assetType: "image",
    name,
    currentFileId: null,
  });
}

describe("assets.repository — schema round-trip + uniqueness (A2)", () => {
  it("inserts an asset + a file and reads them back", async () => {
    const asset = await makeAsset(A, "封面");
    const file = await repo.insertAssetFile(A, {
      assetId: asset.id,
      storageKey: "k/1.png",
      mimeType: "image/png",
      fileSize: 1234,
      checksum: "c1",
      width: 100,
      height: 200,
      durationMs: null,
      mediaMetadata: { foo: "bar" },
    });
    expect(file.versionNumber).toBe(1);
    const readBack = await repo.getAsset(A, asset.id);
    expect(readBack?.name).toBe("封面");
    expect(readBack?.assetType).toBe("image");
    const files = await repo.listAssetFiles(A, asset.id);
    expect(files).toHaveLength(1);
    expect(files[0]!.storageKey).toBe("k/1.png");
    expect(files[0]!.fileSize).toBe(1234);
    expect(files[0]!.mediaMetadata).toEqual({ foo: "bar" });
  });

  it("rejects a duplicate storage_key (unique constraint)", async () => {
    const a1 = await makeAsset(A);
    const a2 = await makeAsset(A);
    await repo.insertAssetFile(A, {
      assetId: a1.id,
      storageKey: "dup/key",
      mimeType: "image/png",
      fileSize: 1,
      checksum: "",
      width: null,
      height: null,
      durationMs: null,
      mediaMetadata: {},
    });
    await expect(
      repo.insertAssetFile(A, {
        assetId: a2.id,
        storageKey: "dup/key",
        mimeType: "image/png",
        fileSize: 1,
        checksum: "",
        width: null,
        height: null,
        durationMs: null,
        mediaMetadata: {},
      }),
    ).rejects.toThrow();
  });
});

describe("assets.repository — ownership enforced (multi-tenant, B1–B5)", () => {
  it("listAssets is user-scoped + active-only", async () => {
    const a1 = await makeAsset(A, "A1");
    await makeAsset(A, "A2");
    await makeAsset(A, "A3");
    const trashed = await makeAsset(A, "A-trashed");
    await repo.updateAssetStatus(A, trashed.id, {
      status: "deleted",
      deletedAt: NOW,
    });
    await makeAsset(B, "B1");
    await makeAsset(B, "B2");

    const aRows = await repo.listAssets(A, { limit: 50, cursor: null });
    expect(aRows).toHaveLength(3);
    expect(aRows.every((r) => r.userId === A)).toBe(true);
    expect(aRows.some((r) => r.id === trashed.id)).toBe(false);
    expect(aRows.some((r) => r.id === a1.id)).toBe(true);
  });

  it("getAsset(B, aId) → null (no existence leak)", async () => {
    const a = await makeAsset(A);
    expect(await repo.getAsset(B, a.id)).toBeNull();
    expect(await repo.getAsset(A, a.id)).not.toBeNull();
  });

  it("insertAsset stamps userId", async () => {
    const a = await makeAsset(A);
    expect(a.userId).toBe(A);
    expect(a.status).toBe("active");
  });

  it("updateAssetStatus under wrong user touches 0 rows → null", async () => {
    const a = await makeAsset(A);
    const wrong = await repo.updateAssetStatus(B, a.id, {
      status: "deleted",
      deletedAt: NOW,
    });
    expect(wrong).toBeNull();
    // A's row is untouched.
    expect((await repo.getAsset(A, a.id))?.status).toBe("active");
  });

  it("insertAssetFile auto-increments versionNumber per asset", async () => {
    const a = await makeAsset(A);
    const f1 = await repo.insertAssetFile(A, {
      assetId: a.id,
      storageKey: "v/1",
      mimeType: "image/png",
      fileSize: 1,
      checksum: "",
      width: null,
      height: null,
      durationMs: null,
      mediaMetadata: {},
    });
    const f2 = await repo.insertAssetFile(A, {
      assetId: a.id,
      storageKey: "v/2",
      mimeType: "image/png",
      fileSize: 1,
      checksum: "",
      width: null,
      height: null,
      durationMs: null,
      mediaMetadata: {},
    });
    expect(f1.versionNumber).toBe(1);
    expect(f2.versionNumber).toBe(2);
    // currentFileId is NOT mutated by the repo (service owns that).
    expect((await repo.getAsset(A, a.id))?.currentFileId).toBeNull();
  });

  it("insertAssetFile on a foreign asset throws OwnershipError", async () => {
    const a = await makeAsset(A);
    await expect(
      repo.insertAssetFile(B, {
        assetId: a.id,
        storageKey: "x/1",
        mimeType: "image/png",
        fileSize: 1,
        checksum: "",
        width: null,
        height: null,
        durationMs: null,
        mediaMetadata: {},
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});

describe("assets.repository — upload sessions user-scoped (B6)", () => {
  it("getUploadSession(B, aUploadId) → null", async () => {
    const session = await repo.createUploadSession(A, {
      assetType: "image",
      mimeType: "image/png",
      fileSize: 100,
      storageKey: "uploads/k1",
      expiresAt: NOW,
    });
    expect(await repo.getUploadSession(B, session.id)).toBeNull();
    expect(await repo.getUploadSession(A, session.id)).not.toBeNull();
  });

  it("markUploadCompleted flips status (scoped)", async () => {
    const session = await repo.createUploadSession(A, {
      assetType: "image",
      mimeType: "image/png",
      fileSize: 100,
      storageKey: "uploads/k2",
      expiresAt: NOW,
    });
    expect(session.status).toBe("created");
    await repo.markUploadCompleted(A, session.id);
    expect((await repo.getUploadSession(A, session.id))?.status).toBe(
      "completed",
    );
  });
});
