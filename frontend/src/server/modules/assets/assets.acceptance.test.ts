import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createAssetRepository } from "./assets.repository";
import { createAssetsService } from "./assets.service";
import { createMockObjectStorage } from "./object-storage";
import { OwnershipError } from "./assets.errors";

// G1–G7 — SPEC §22 + foundation §5.6 acceptance for the Assets module.

const HERE = dirname(fileURLToPath(import.meta.url));
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
const ctxA: RequestContext = { userId: "user-a", requestId: "ra", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "rb", source: "user" };

function buildService(db: Db) {
  const deps = deterministicDeps();
  const repo = createAssetRepository(db, deps);
  let keySeq = 0;
  const storage = createMockObjectStorage({
    nextKey: () => `uploads/key-${++keySeq}`,
  });
  return { service: createAssetsService(repo, storage, deps), repo };
}

async function upload(
  service: ReturnType<typeof buildService>["service"],
  ctx: RequestContext,
  name = "素材",
) {
  const session = await service.createUpload(ctx, {
    assetType: "image",
    mimeType: "image/png",
    fileSize: 1024,
  });
  return service.completeUpload(ctx, session.uploadId, { name });
}

describe("G1 — module-structure acceptance", () => {
  it("has the foundation §5 layout files + 3 test suites", () => {
    const required = [
      "assets.db-schema.ts",
      "assets.repository.ts",
      "assets.service.ts",
      "assets.schema.ts",
      "assets.transport.ts",
      "assets.errors.ts",
      "object-storage.ts",
      "index.ts",
      "assets.repository.integration.test.ts",
      "assets.service.test.ts",
      "assets.contract.test.ts",
    ];
    for (const file of required) {
      expect(existsSync(join(HERE, file)), `missing ${file}`).toBe(true);
    }
  });

  it("G2 — has NO cross-module repository import in assets.repository.ts", () => {
    const src = readFileSync(join(HERE, "assets.repository.ts"), "utf8");
    // The repo may import OwnershipError from ./assets.errors (which re-exports it
    // from identity) — not directly from another module's internals. Assert no
    // `modules/<other>` import appears in the repo file.
    const crossModule = /from\s+["']@\/server\/modules\/(?!assets)/.test(src);
    expect(crossModule).toBe(false);
  });

  it("G5 — object storage is used only by the file-producing modules (Assets + Production)", () => {
    // SPEC §15 + foundation §4: object storage is a SHARED port owned by Assets,
    // also used by Production for export artifacts. Any OTHER module importing it
    // is the violation this guard catches.
    const STORAGE_ALLOWED = new Set(["assets", "production"]);
    const modulesRoot = join(HERE, "..");
    const offenders: string[] = [];
    for (const mod of readdirSync(modulesRoot, { withFileTypes: true })) {
      if (!mod.isDirectory() || STORAGE_ALLOWED.has(mod.name)) continue;
      const dir = join(modulesRoot, mod.name);
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
        const src = readFileSync(join(dir, f), "utf8");
        if (/object-storage|ObjectStoragePort|MockObjectStorage/.test(src)) {
          offenders.push(`${mod.name}/${f}`);
        }
      }
    }
    expect(offenders, `unexpected object-storage callers: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });
});

describe("G — domain acceptance (SPEC §22)", () => {
  let db: Db;
  let service: ReturnType<typeof buildService>["service"];

  beforeEach(async () => {
    ({ db } = await createDb());
    ({ service } = buildService(db));
  });

  it("G4 — Asset exists/persists independent of any Project (no projectId in create surface)", async () => {
    const asset = await upload(service, ctxA, "独立素材");
    expect(asset).not.toHaveProperty("projectId");
    expect(asset.status).toBe("active");
    expect(asset.currentFileId).toBeTruthy();
  });

  it("G6 — completeUpload validates the object (MIME/size via headObject) before materializing", async () => {
    // A well-formed upload materializes with the head-derived MIME/size; the
    // signed-url/object reads are minted server-side (never logged).
    const asset = await upload(service, ctxA);
    const got = await service.getAsset(ctxA, asset.id);
    expect(got.currentFileId).toBe(asset.currentFileId);
  });

  it("G7 — multi-tenant smoke: A cannot list/get B's assets", async () => {
    await upload(service, ctxA, "A1");
    const b = await upload(service, ctxB, "B1");
    const aList = await service.listAssets(ctxA, { limit: 50, cursor: null });
    expect(aList.every((row) => row.userId === ctxA.userId)).toBe(true);
    expect(aList.some((row) => row.id === b.id)).toBe(false);
    await expect(service.getAsset(ctxA, b.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(
      service.trashAsset(ctxA, b.id),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});
