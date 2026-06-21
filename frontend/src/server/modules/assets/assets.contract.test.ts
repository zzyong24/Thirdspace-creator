import { describe, it, expect, beforeEach } from "vitest";
import {
  createDb,
  type Db,
  UnsupportedOperationError,
} from "@creatoros/backend";
import {
  ENDPOINTS,
  listEnvelope,
  successEnvelope,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createAssetRepository } from "./assets.repository";
import { createAssetsService } from "./assets.service";
import { createMockObjectStorage } from "./object-storage";
import { createAssetsTransport } from "./assets.transport";
import { assetResource, assetFileResource, assetUpload } from "./assets.schema";

// D8 / F3 — drive each of the 7 ops through the transport against a seeded pglite
// db and assert the envelope `data` validates against the op's contract response
// DTO (foundation §5.4). Confirms numeric fileSize/versionNumber, record
// mediaMetadata, nullable deletedAt/width/height/durationMs serialize.

const NOW = "2026-06-21T02:00:00.000Z";
const ctx: RequestContext = {
  userId: "user-1",
  requestId: "req-1",
  source: "user",
};
const ep = (id: string, isList = false) =>
  ({ id, isList }) as unknown as Endpoint;

function deterministicDeps() {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-c-${n}`;
    },
  };
}

let db: Db;
let transport: Transport;

beforeEach(async () => {
  ({ db } = await createDb());
  const deps = deterministicDeps();
  const repo = createAssetRepository(db, deps);
  let keySeq = 0;
  const storage = createMockObjectStorage({
    nextKey: () => `uploads/k-${++keySeq}`,
  });
  const service = createAssetsService(repo, storage, deps);
  transport = createAssetsTransport(() => service);
});

async function call(id: string, input: unknown, isList = false) {
  return transport.request(ep(id, isList), input as never, ctx);
}

// Helper: run the full upload, returning the created asset id.
async function uploadAsset(name = "封面"): Promise<string> {
  const up = await call("assets.uploads.create", {
    body: { assetType: "image", mimeType: "image/png", fileSize: 4096 },
  });
  const uploadId = (up as { data: { uploadId: string } }).data.uploadId;
  const done = await call("assets.uploads.complete", {
    params: { uploadId },
    body: { name },
  });
  return (done as { data: { id: string } }).data.id;
}

describe("assets.transport — 7-op contract conformance", () => {
  it("assets.uploads.create → assetUpload DTO", async () => {
    const up = await call("assets.uploads.create", {
      body: { assetType: "image", mimeType: "image/png", fileSize: 4096 },
    });
    expect(() => successEnvelope(assetUpload).parse(up)).not.toThrow();
  });

  it("assets.uploads.complete / get → assetResource", async () => {
    const up = await call("assets.uploads.create", {
      body: { assetType: "image", mimeType: "image/png", fileSize: 4096 },
    });
    const uploadId = (up as { data: { uploadId: string } }).data.uploadId;
    const done = await call("assets.uploads.complete", {
      params: { uploadId },
      body: { name: "封面" },
    });
    const parsed = successEnvelope(assetResource).parse(done);
    expect(parsed.data.status).toBe("active");
    expect(parsed.data.currentFileId).toBeTruthy();
    expect(parsed.data.deletedAt).toBeNull();

    const got = await call("assets.get", {
      params: { assetId: parsed.data.id },
    });
    expect(() => successEnvelope(assetResource).parse(got)).not.toThrow();
  });

  it("assets.list → assetResource[] (active only)", async () => {
    await uploadAsset("A1");
    const list = await call("assets.list", { query: { page: 1, pageSize: 50 } }, true);
    const parsed = listEnvelope(assetResource).parse(list);
    expect(parsed.data.length).toBe(1);
    expect(parsed.data[0]!.deletedAt).toBeNull();
  });

  it("assets.files.create → assetFileResource (numeric fields)", async () => {
    const assetId = await uploadAsset();
    const file = await call("assets.files.create", {
      params: { assetId },
      body: { storageKey: "extra/file-1" },
    });
    const parsed = successEnvelope(assetFileResource).parse(file);
    expect(parsed.data.versionNumber).toBe(2);
    expect(typeof parsed.data.fileSize).toBe("number");
    expect(parsed.data.mediaMetadata).toEqual({});
  });

  it("assets.trash → assetResource (deleted) then assets.restore → active", async () => {
    const assetId = await uploadAsset();
    const trashed = await call("assets.trash", { params: { assetId } });
    const pt = successEnvelope(assetResource).parse(trashed);
    expect(pt.data.status).toBe("deleted");
    expect(pt.data.deletedAt).toBe(NOW);

    const restored = await call("assets.restore", { params: { assetId } });
    const pr = successEnvelope(assetResource).parse(restored);
    expect(pr.data.status).toBe("active");
    expect(pr.data.deletedAt).toBeNull();
  });

  it("covers all 7 op ids + unknown → UnsupportedOperationError", async () => {
    const owned = [
      "assets.list",
      "assets.uploads.create",
      "assets.uploads.complete",
      "assets.get",
      "assets.files.create",
      "assets.trash",
      "assets.restore",
    ];
    const ids = Object.values(ENDPOINTS)
      .filter((e) => owned.includes(e.id))
      .map((e) => e.id);
    expect(ids).toHaveLength(7);

    await expect(
      transport.request(ep("assets.nope"), {} as never, ctx),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });
});
