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
    // [T-157] 未传 accountId → `_default/` 头段(账号分区,存量/未选号回退)。
    expect(up.storageKey).toBe("_default/image/uploads/objkey-1");
    expect(up.uploadUrl).toContain(
      "/api/v1/blob/_default/image/uploads/objkey-1",
    );
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

  it("[T-157] createPresignedUpload 按 accountId 分区 key 头段(存量回退 _default)", async () => {
    const storage = makeStorage();
    const up = await storage.createPresignedUpload({
      assetType: "image",
      mimeType: "image/png",
      fileSize: 2048,
      accountId: "acct-douyin-1",
    });
    // 选号 → key 头段 = 该号(物理目录按抖音号隔离)。
    expect(up.storageKey).toBe("acct-douyin-1/image/uploads/objkey-1");
    expect(up.uploadUrl).toContain(
      "/api/v1/blob/acct-douyin-1/image/uploads/objkey-1",
    );
    // 未选号(null)→ _default 回退,向后兼容。
    const up2 = await storage.createPresignedUpload({
      assetType: "video",
      mimeType: "video/mp4",
      fileSize: 1,
      accountId: null,
    });
    expect(up2.storageKey).toBe("_default/video/uploads/objkey-2");
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

  it("putObject direct-writes server bytes to disk; headObject reads them back (asset.generate)", async () => {
    const storage = makeStorage();
    const up = await storage.createPresignedUpload({
      assetType: "video",
      mimeType: "video/mp4",
      fileSize: 4,
    });
    // Server-side direct write (no HTTP blob-route PUT) — the runner already holds bytes.
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
    await storage.putObject({
      storageKey: up.storageKey,
      bytes,
      mimeType: "video/mp4",
      assetType: "video",
    });
    // Bytes really landed on disk under the key.
    const onDisk = await fs.readFile(path.join(root, up.storageKey));
    expect(Array.from(onDisk)).toEqual([1, 2, 3, 4, 5, 6]);
    // headObject echoes the real size + refreshed MIME/dims + a real sha256.
    const head = await storage.headObject(up.storageKey);
    expect(head.fileSize).toBe(6);
    expect(head.mimeType).toBe("video/mp4");
    expect(head.width).toBe(1920);
    expect(head.durationMs).toBe(1000);
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
