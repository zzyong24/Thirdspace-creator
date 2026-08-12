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
    // [Bug-1 T-014] mimeType=image/png → key 末段拼 .png(让磁盘文件有真 ext,文件夹预览可用)。
    expect(up.storageKey).toBe("_default/image/uploads/objkey-1.png");
    expect(up.uploadUrl).toContain(
      "/api/v1/blob/_default/image/uploads/objkey-1.png",
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
    // [T-296] create 阶段字节还没上传 → 尺寸未知 = null(真尺寸由 headObject 的 ffprobe 在 complete 阶段探)。
    expect(sidecar.width).toBeNull();
  });

  it("[T-157] createPresignedUpload 按 accountId 分区 key 头段(存量回退 _default)", async () => {
    const storage = makeStorage();
    const up = await storage.createPresignedUpload({
      assetType: "image",
      mimeType: "image/png",
      fileSize: 2048,
      accountId: "acct-douyin-1",
    });
    // 选号 → key 头段 = 该号(物理目录按抖音号隔离);[Bug-1 T-014] 拼 ext。
    expect(up.storageKey).toBe("acct-douyin-1/image/uploads/objkey-1.png");
    expect(up.uploadUrl).toContain(
      "/api/v1/blob/acct-douyin-1/image/uploads/objkey-1.png",
    );
    // 未选号(null)→ _default 回退,向后兼容;[Bug-1 T-014] video/mp4 → .mp4。
    const up2 = await storage.createPresignedUpload({
      assetType: "video",
      mimeType: "video/mp4",
      fileSize: 1,
      accountId: null,
    });
    expect(up2.storageKey).toBe("_default/video/uploads/objkey-2.mp4");
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
    // headObject echoes the real size + real sha256. [T-296] dims/时长走 ffprobe:
    // 这里是 6 个假字节(非真视频)→ ffprobe 探不出 → width/durationMs 为 null(诚实,不再假 1920/1000)。
    const head = await storage.headObject(up.storageKey);
    expect(head.fileSize).toBe(6);
    expect(head.mimeType).toBe("video/mp4");
    expect(head.width).toBeNull();
    expect(head.durationMs).toBeNull();
    expect(head.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("[T-782] copyObjectToFile 生成独立可写副本，不污染素材原文件", async () => {
    const storage = makeStorage();
    const up = await storage.createPresignedUpload({
      assetType: "video",
      mimeType: "video/mp4",
      fileSize: 1024 * 1024,
    });
    const sourceBytes = Buffer.alloc(1024 * 1024, 7);
    await fs.writeFile(path.join(root, up.storageKey), sourceBytes);
    const destination = path.join(root, "workspace", "input.mp4");
    await fs.mkdir(path.dirname(destination), { recursive: true });

    await storage.copyObjectToFile!(up.storageKey, destination);
    await fs.writeFile(destination, Buffer.from("task changed its private copy"));

    expect(await fs.readFile(path.join(root, up.storageKey))).toEqual(sourceBytes);
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

  it("[Bug-1 T-014] folder+fileName 分支不叠 ext(原名已有则保留)", async () => {
    // safeName 自带 .png → storageKey 末段是 foo.png(不是 foo.png.png)。
    const storage = makeStorage();
    const up = await storage.createPresignedUpload({
      assetType: "image",
      mimeType: "image/png",
      fileSize: 2048,
      folder: "inbox",
      fileName: "foo.png",
    });
    expect(up.storageKey).toBe("_default/inbox/uploads/objkey-1-foo.png");
  });

  it("[Bug-1 T-014] unknown mimeType 不假拼 ext(诚实不返 .bin 也不瞎猜)", async () => {
    const storage = makeStorage();
    const up = await storage.createPresignedUpload({
      assetType: "image",
      mimeType: "application/x-fantasy-thing",
      fileSize: 2048,
    });
    expect(up.storageKey).toBe("_default/image/uploads/objkey-1"); // 无 ext 末段
  });
});
