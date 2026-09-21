import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalFsObjectStorage } from "./localfs-object-storage";
import { createWorkbenchBlobService, type WorkbenchBlobMime } from "./workbench-blob.service";

const ctx = { userId: "user-1", accountId: "account-1", requestId: "req-1", source: "ai" as const };
const scope = { taskId: "task-1", operationId: "operation-1" };
let root: string;
let storage: ReturnType<typeof createLocalFsObjectStorage>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "t1009-blob-"));
  storage = createLocalFsObjectStorage(
    { rootPath: root, publicBaseUrl: "/blob" },
    { nextKey: () => { throw new Error("不应由适配器随机生成 key"); } },
  );
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const service = () => createWorkbenchBlobService(async () => storage);
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function objectKeys(directory = root): Promise<string[]> {
  const keys: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) keys.push(...await objectKeys(full));
    else if (!entry.name.endsWith(".meta.json")) keys.push(full.slice(root.length + 1));
  }
  return keys;
}

describe("T-1009 工作台产物字节窄端口", () => {
  it.each([
    ["text/html", "<html><body>中文</body></html>"],
    ["text/markdown", "# 标题\n正文"],
    ["text/csv", "列一,列二\n甲,乙"],
    ["image/png", "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082"],
    ["application/pdf", "%PDF-1.7\n测试字节"],
  ] as const)("真实 local-fs 存取 %s", async (mime, content) => {
    const bytes = mime === "image/png" ? Uint8Array.from(Buffer.from(content, "hex")) : new TextEncoder().encode(content);
    const receipt = await service().submit(ctx, { ...scope, mime, bytes });
    expect(receipt).toEqual({ hash: digest(bytes), size: bytes.byteLength });
    expect(await service().read(ctx, { ...scope, hash: receipt.hash, mime })).toEqual(bytes);
    const keys = await objectKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^account-1\/workbench\//);
    expect(keys[0]).toContain(receipt.hash);
    expect(await readFile(join(root, keys[0]!))).toEqual(Buffer.from(bytes));
  });

  it("同一作用域和字节重试复用同一对象，不重写", async () => {
    const bytes = new TextEncoder().encode("<h1>快照</h1>");
    const first = await service().submit(ctx, { ...scope, mime: "text/html", bytes });
    const put = vi.spyOn(storage, "putObject");
    const second = await service().submit(ctx, { ...scope, mime: "text/html", bytes });
    expect(second).toEqual(first);
    expect(put).not.toHaveBeenCalled();
    expect(await objectKeys()).toHaveLength(1);
  });

  it("写入成功但回执丢失时，同键重试只读取既有字节", async () => {
    const bytes = new TextEncoder().encode("# 持久快照");
    const put = storage.putObject.bind(storage);
    storage.putObject = vi.fn(async (value) => { await put(value); throw new Error("写后断开"); });
    await expect(service().submit(ctx, { ...scope, mime: "text/markdown", bytes })).rejects.toThrow("写后断开");
    storage.putObject = vi.fn(async () => { throw new Error("不应再次写入"); });
    const receipt = await service().submit(ctx, { ...scope, mime: "text/markdown", bytes });
    expect(receipt).toEqual({ hash: digest(bytes), size: bytes.byteLength });
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(await objectKeys()).toHaveLength(1);
  });

  it("跨用户、账号、任务和操作不能凭 hash 回读", async () => {
    const bytes = new TextEncoder().encode("# 私有快照");
    const receipt = await service().submit(ctx, { ...scope, mime: "text/markdown", bytes });
    const ref = { ...scope, hash: receipt.hash, mime: "text/markdown" as const };
    await expect(service().read({ ...ctx, userId: "user-2" }, ref)).rejects.toThrow();
    await expect(service().read({ ...ctx, accountId: "account-2" }, ref)).rejects.toThrow();
    await expect(service().read(ctx, { ...ref, taskId: "task-2" })).rejects.toThrow();
    await expect(service().read(ctx, { ...ref, operationId: "operation-2" })).rejects.toThrow();
    await expect(service().read(ctx, { ...ref, hash: "0".repeat(64) })).rejects.toThrow();
    expect(await service().read(ctx, ref)).toEqual(bytes);
  });

  it("账号分区安全字符收窄后仍不共享对象", async () => {
    const bytes = new TextEncoder().encode("账号隔离");
    const firstCtx = { ...ctx, accountId: "a.b" };
    const secondCtx = { ...ctx, accountId: "a/b" };
    const first = await service().submit(firstCtx, { ...scope, mime: "text/markdown", bytes });
    await expect(service().read(secondCtx, { ...scope, hash: first.hash, mime: "text/markdown" })).rejects.toThrow();
    const second = await service().submit(secondCtx, { ...scope, mime: "text/markdown", bytes });
    expect(second).toEqual(first);
    expect(await objectKeys()).toHaveLength(2);
  });

  it("存储 MIME 元数据被改写时拒绝回读", async () => {
    const bytes = new TextEncoder().encode("<h1>报告</h1>");
    const receipt = await service().submit(ctx, { ...scope, mime: "text/html", bytes });
    const key = (await objectKeys())[0]!;
    await writeFile(join(root, `${key}.meta.json`), JSON.stringify({ mimeType: "text/plain", fileSize: bytes.byteLength }));
    await expect(service().read(ctx, { ...scope, hash: receipt.hash, mime: "text/html" })).rejects.toThrow(/MIME/);
  });

  it("磁盘字节被改写后拒绝读取和同键重试", async () => {
    const bytes = new TextEncoder().encode("a,b\n1,2");
    const receipt = await service().submit(ctx, { ...scope, mime: "text/csv", bytes });
    const key = (await objectKeys())[0]!;
    await writeFile(join(root, key), "a,b\n9,9");
    await expect(service().read(ctx, { ...scope, hash: receipt.hash, mime: "text/csv" })).rejects.toThrow(/完整|校验|不匹配/);
    const put = vi.spyOn(storage, "putObject");
    await expect(service().submit(ctx, { ...scope, mime: "text/csv", bytes })).rejects.toThrow(/完整|校验|不匹配/);
    expect(put).not.toHaveBeenCalled();
  });

  it("对账三态只把权威不存在认作 absent，坏对象保持 unknown", async () => {
    const bytes = new TextEncoder().encode("待核对"), hash = digest(bytes), ref = { ...scope, hash, mime: "text/markdown" as const };
    expect(await service().inspect(ctx, ref)).toBe("absent");
    await service().submit(ctx, { ...scope, mime: "text/markdown", bytes });
    expect(await service().inspect(ctx, ref)).toBe("present");
    const key = (await objectKeys())[0]!;await writeFile(join(root, key), "损坏");
    expect(await service().inspect(ctx, ref)).toBe("unknown");
  });

  it("拒绝错 MIME、超限、空字节和未选号，不触及存储", async () => {
    const bytes = new TextEncoder().encode("正文");
    await expect(service().submit(ctx, { ...scope, mime: "text/plain" as WorkbenchBlobMime, bytes })).rejects.toThrow();
    await expect(service().submit(ctx, { ...scope, mime: "text/html", bytes: new Uint8Array(20 * 1024 * 1024 + 1) })).rejects.toThrow();
    await expect(service().submit(ctx, { ...scope, mime: "text/html", bytes: new Uint8Array() })).rejects.toThrow();
    await expect(service().submit({ ...ctx, accountId: null }, { ...scope, mime: "text/html", bytes })).rejects.toThrow();
    expect(await objectKeys()).toEqual([]);
  });
});
