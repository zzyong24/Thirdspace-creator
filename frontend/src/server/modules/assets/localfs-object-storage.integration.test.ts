import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createLocalFsObjectStorage } from "./localfs-object-storage";
import { verifyBlobToken } from "./blob-security";

// Exercises the local-fs adapter against a REAL tmp dir: createPresignedUpload
// writes a sidecar + mints a token URL, a manual byte-write simulates the FE PUT,
// and headObject reads back the real size + sha256 checksum.

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "creatoros-localfs-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function makeStorage() {
  let n = 0;
  return createLocalFsObjectStorage(
    { rootPath: root, publicBaseUrl: "/api/v1/blob", expiresInMs: 60_000 },
    { nextKey: () => `uploads/objkey-${++n}`, now: () => 1_000_000 },
  );
}

describe("localfs-object-storage", () => {
  it("createPresignedUpload writes a sidecar + a token-gated PUT URL", async () => {
    const storage = makeStorage();
    const up = await storage.createPresignedUpload({
      assetType: "image",
      mimeType: "image/png",
      fileSize: 2048,
    });
    expect(up.storageKey).toBe("image/uploads/objkey-1");
    expect(up.uploadUrl).toContain("/api/v1/blob/image/uploads/objkey-1");
    expect(up.uploadUrl).toContain("token=");

    // The minted token verifies for PUT on this key at the embedded exp.
    const u = new URL(up.uploadUrl, "http://localhost");
    const exp = Number(u.searchParams.get("exp"));
    const token = u.searchParams.get("token");
    expect(verifyBlobToken("PUT", up.storageKey, exp, token, 1_000_001).ok).toBe(
      true,
    );

    // The sidecar exists with the declared metadata.
    const sidecar = JSON.parse(
      await fs.readFile(path.join(root, `${up.storageKey}.meta.json`), "utf8"),
    );
    expect(sidecar.mimeType).toBe("image/png");
    expect(sidecar.width).toBe(1920);
  });

  it("headObject returns the REAL on-disk size + sha256 checksum", async () => {
    const storage = makeStorage();
    const up = await storage.createPresignedUpload({
      assetType: "document",
      mimeType: "text/plain",
      fileSize: 5,
    });
    // Simulate the FE PUT: write the real bytes to disk under the key.
    const abs = path.join(root, up.storageKey);
    await fs.writeFile(abs, "hello world"); // 11 bytes (not 5 — disk is truth)

    const head = await storage.headObject(up.storageKey);
    expect(head.fileSize).toBe(11);
    expect(head.mimeType).toBe("text/plain");
    expect(head.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("getSignedUrl mints a GET-bound token URL", async () => {
    const storage = makeStorage();
    const url = await storage.getSignedUrl("image/uploads/objkey-1");
    const u = new URL(url, "http://localhost");
    const exp = Number(u.searchParams.get("exp"));
    const token = u.searchParams.get("token");
    expect(
      verifyBlobToken("GET", "image/uploads/objkey-1", exp, token, 1_000_001)
        .ok,
    ).toBe(true);
    // A GET token must NOT validate as PUT.
    expect(
      verifyBlobToken("PUT", "image/uploads/objkey-1", exp, token, 1_000_001)
        .ok,
    ).toBe(false);
  });

  it("createPresignedUpload rejects a traversal storageKey via safeJoin", async () => {
    // nextKey is server-controlled, but assert the guard is wired: a malicious
    // key shape would throw before any fs write.
    const storage = createLocalFsObjectStorage(
      { rootPath: root, publicBaseUrl: "/api/v1/blob" },
      { nextKey: () => "../../../etc/evil" },
    );
    await expect(
      storage.createPresignedUpload({
        assetType: "image",
        mimeType: "image/png",
        fileSize: 1,
      }),
    ).rejects.toThrow();
  });
});
