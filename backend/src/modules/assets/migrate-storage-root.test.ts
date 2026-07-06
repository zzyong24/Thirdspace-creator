import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { migrateStorageRoot } from "./migrate-storage-root";

// [T-162] 存储目录迁移 —— 真 tmp 目录集成测（同 localfs-object-storage.integration 的风格）。

let tmp: string;
let oldRoot: string;
let newRoot: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "creatoros-migrate-"));
  oldRoot = path.join(tmp, "old");
  newRoot = path.join(tmp, "new");
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
}

async function read(root: string, rel: string): Promise<string> {
  return fs.readFile(path.join(root, rel), "utf8");
}

describe("migrateStorageRoot", () => {
  it("搬旧树到新(含 T-157 账号分区 + .meta.json sidecar),保留相对结构", async () => {
    // 旧目录:账号分区 + sidecar + 未选号 _default 分区。
    await writeFile(oldRoot, "acct-douyin-1/image/uploads/objkey-1", "IMG-BYTES");
    await writeFile(
      oldRoot,
      "acct-douyin-1/image/uploads/objkey-1.meta.json",
      '{"mimeType":"image/png"}',
    );
    await writeFile(oldRoot, "_default/video/objkey-2", "VID-BYTES");

    const res = await migrateStorageRoot(oldRoot, newRoot);

    expect(res.skipped).toBe(false);
    expect(res.migrated).toBe(3);
    // 文件在新目录的同一相对位置,内容一致。
    expect(await read(newRoot, "acct-douyin-1/image/uploads/objkey-1")).toBe(
      "IMG-BYTES",
    );
    expect(
      await read(newRoot, "acct-douyin-1/image/uploads/objkey-1.meta.json"),
    ).toContain("image/png");
    expect(await read(newRoot, "_default/video/objkey-2")).toBe("VID-BYTES");
  });

  it("同路径(resolve 后相等)→ skipped no-op", async () => {
    await writeFile(oldRoot, "a/b", "x");
    const res = await migrateStorageRoot(oldRoot, oldRoot);
    expect(res).toEqual({ migrated: 0, skipped: true });
  });

  it("旧目录不存在 → skipped(无文件可搬)", async () => {
    const res = await migrateStorageRoot(
      path.join(tmp, "does-not-exist"),
      newRoot,
    );
    expect(res).toEqual({ migrated: 0, skipped: true });
  });

  it("旧目录空 → skipped", async () => {
    await fs.mkdir(oldRoot, { recursive: true });
    const res = await migrateStorageRoot(oldRoot, newRoot);
    expect(res).toEqual({ migrated: 0, skipped: true });
  });

  it("新目录非空 → 合并(保留新目录既有文件 + 搬入旧文件)", async () => {
    await writeFile(newRoot, "existing/keep.txt", "KEEP");
    await writeFile(oldRoot, "a/moved.txt", "MOVED");

    const res = await migrateStorageRoot(oldRoot, newRoot);

    expect(res.skipped).toBe(false);
    expect(res.migrated).toBe(1); // 旧目录 1 个文件
    expect(await read(newRoot, "existing/keep.txt")).toBe("KEEP"); // 既有保留
    expect(await read(newRoot, "a/moved.txt")).toBe("MOVED"); // 旧文件搬入
  });
});
