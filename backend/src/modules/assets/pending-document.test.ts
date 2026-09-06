import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, assets, assetFiles, eq, sql } from "@creatoros/backend";
import { pendingDocumentCommits } from "../../schema/pending-document-commits";
import { createPendingDocumentService } from "./pending-document.service";
import type { DocumentCommitAuthorization } from "./pending-document.repository";
import { createLocalFsObjectStorage } from "./localfs-object-storage";

const ctx = { userId: "u", accountId: "a", requestId: "r", source: "user" as const };
const input = { operationKey: "web.read:call-1:evidence-1", name: "正文·页面", sourceUrl: "https://example.com/article", fullText: "这是网页实际读取到的正文。" };
let opened: Awaited<ReturnType<typeof createDb>>;
let root: string;
let storage: ReturnType<typeof createLocalFsObjectStorage>;
const authorize = vi.fn<DocumentCommitAuthorization>(async () => {});
const now = () => "2026-09-06T00:00:00.000Z";
const service = () => createPendingDocumentService({ db: opened.db, objectStorageForCtx: async () => storage, now, authorize });

beforeEach(async () => {
  opened = await createDb();
  root = await mkdtemp(join(tmpdir(), "t915-document-"));
  storage = createLocalFsObjectStorage({ rootPath: root, publicBaseUrl: "/blob" }, { nextKey: () => "unused" });
  authorize.mockReset();
  authorize.mockResolvedValue();
});
afterEach(async () => { await opened.client.close(); await rm(root, { recursive: true, force: true }); });

async function rows() {
  return { receipts: await opened.db.select().from(pendingDocumentCommits), assets: await opened.db.select().from(assets), files: await opened.db.select().from(assetFiles) };
}

describe("pending 网页正文的持久提交", () => {
  it("正文、来源、pending 素材和完整回执一起可见", async () => {
    const result = await service().submit(ctx, input);
    const data = await rows();
    expect(data.assets).toHaveLength(1); expect(data.files).toHaveLength(1);
    expect(data.assets[0]).toMatchObject({ id: result.assetId, currentFileId: result.fileId, status: "pending", userId: "u", accountId: "a" });
    expect(data.files[0]).toMatchObject({ id: result.fileId, extractedText: input.fullText, extractStatus: "done", mediaMetadata: { sourceUrl: input.sourceUrl } });
    expect(data.receipts[0]?.committedAt).toBe(now());
    expect(new TextDecoder().decode(await storage.getObject(data.receipts[0]!.storageKey))).toBe(input.fullText);
  });

  it("写字节后响应失败，重新装配服务恢复同一身份", async () => {
    const put = storage.putObject.bind(storage);
    storage.putObject = vi.fn(async (value) => { await put(value); throw new Error("写后断开"); });
    await expect(service().submit(ctx, input)).rejects.toThrow("写后断开");
    const prepared = (await rows()).receipts[0]!;
    expect((await rows()).assets).toHaveLength(0);
    storage.putObject = vi.fn(async () => { throw new Error("不应重写已完整字节"); });
    const result = await service().submit(ctx, input);
    expect(result.assetId).toBe(prepared.assetId);
    expect(storage.putObject).not.toHaveBeenCalled();
    expect((await rows()).assets).toHaveLength(1);
  });

  it("文件行插入失败回滚素材，保留准备回执供重试", async () => {
    await opened.db.execute(sql.raw("CREATE FUNCTION fail_document_file() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected file insert failure'; END; $$;"));
    await opened.db.execute(sql.raw("CREATE TRIGGER fail_document_file BEFORE INSERT ON asset_files FOR EACH ROW EXECUTE FUNCTION fail_document_file();"));
    await expect(service().submit(ctx, input)).rejects.toThrow();
    const failed = await rows();
    expect(failed.assets).toHaveLength(0); expect(failed.files).toHaveLength(0);
    expect(failed.receipts).toHaveLength(1); expect(failed.receipts[0]?.committedAt).toBeNull();
    await opened.db.execute(sql.raw("DROP TRIGGER fail_document_file ON asset_files;"));
    expect((await service().submit(ctx, input)).assetId).toBe(failed.receipts[0]?.assetId);
  });

  it("提交 ACK 丢失后的回放不读写字节、不覆盖人工编辑", async () => {
    const committed = await service().submit(ctx, input);
    await opened.db.update(assets).set({ name: "用户后来改名", status: "deleted" }).where(eq(assets.id, committed.assetId));
    storage.getObject = vi.fn(async () => { throw new Error("不应读取字节"); });
    storage.putObject = vi.fn(async () => { throw new Error("不应写字节"); });
    authorize.mockRejectedValue(new Error("取消后不允许新动作"));
    expect(await service().submit(ctx, input)).toEqual(committed);
    expect((await rows()).assets).toMatchObject([{ name: "用户后来改名", status: "deleted" }]);
    expect(storage.getObject).not.toHaveBeenCalled(); expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("两个服务并发提交同键只生成一份素材与文件", async () => {
    const get = storage.getObject.bind(storage);
    let release!: () => void;
    const bothMissing = new Promise<void>((resolve) => { release = resolve; });
    let missing = 0;
    storage.getObject = async (key) => {
      try { return await get(key); }
      catch (error) {
        if (++missing === 2) release();
        await bothMissing;
        throw error;
      }
    };
    storage.putObject = vi.fn(storage.putObject.bind(storage));
    const results = await Promise.all([service().submit(ctx, input), service().submit(ctx, input)]);
    expect(results[0]).toEqual(results[1]);
    expect(storage.putObject).toHaveBeenCalledTimes(2);
    const data = await rows(); expect(data.assets).toHaveLength(1); expect(data.files).toHaveLength(1); expect(data.receipts).toHaveLength(1);
  });

  it("同键异正文的并发请求只有一份事实能胜出", async () => {
    const results = await Promise.allSettled([service().submit(ctx, input), service().submit(ctx, { ...input, fullText: "其他正文" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const data = await rows(); expect(data.assets).toHaveLength(1); expect(data.files).toHaveLength(1);
    expect(new TextDecoder().decode(await storage.getObject(data.receipts[0]!.storageKey))).toBe(data.files[0]?.extractedText);
  });

  it("已有半份或冲突字节不能覆盖、不能生成完成回执", async () => {
    const put = storage.putObject.bind(storage);
    storage.putObject = vi.fn(async (value) => { await put(value); throw new Error("暂时失败"); });
    await expect(service().submit(ctx, input)).rejects.toThrow();
    const prepared = (await rows()).receipts[0]!;
    await writeFile(join(root, prepared.storageKey), "损坏");
    storage.putObject = vi.fn(put);
    await expect(service().submit(ctx, input)).rejects.toThrow("字节");
    expect(storage.putObject).not.toHaveBeenCalled();
    expect((await rows()).assets).toHaveLength(0);
    expect((await rows()).receipts[0]?.committedAt).toBeNull();
  });

  it("字节准备期间取消，事务内守卫拒绝新素材", async () => {
    const put = storage.putObject.bind(storage);
    storage.putObject = async (value) => { await put(value); authorize.mockRejectedValue(new Error("已取消")); };
    await expect(service().submit(ctx, input)).rejects.toThrow("已取消");
    expect((await rows()).assets).toHaveLength(0);
    expect((await rows()).receipts[0]?.committedAt).toBeNull();
  });

  it("跨用户、跨账号的相同 operationKey 不共享回执或对象", async () => {
    const results = await Promise.all([
      service().submit(ctx, input), service().submit({ ...ctx, accountId: "other" }, input),
      service().submit({ ...ctx, userId: "other" }, input),
    ]);
    expect(new Set(results.map((r) => r.assetId)).size).toBe(3);
    expect(new Set((await rows()).receipts.map((r) => r.storageKey)).size).toBe(3);
  });

  it("参数和准入不合法时不创建准备对象", async () => {
    await expect(service().submit(ctx, { ...input, fullText: "" })).rejects.toThrow();
    await expect(service().submit(ctx, { ...input, sourceUrl: "file:///private/a" })).rejects.toThrow();
    await expect(service().submit(ctx, { ...input, fullText: "x".repeat(2 * 1024 * 1024 + 1) })).rejects.toThrow();
    authorize.mockRejectedValue(new Error("禁止"));
    await expect(service().submit(ctx, input)).rejects.toThrow("禁止");
    expect((await rows()).receipts).toHaveLength(0);
  });

  it("实际关闭并重开数据库后继续准备回执，迁移可重复启动", async () => {
    await opened.client.close();
    opened = await createDb({ dataDir: join(root, "db") });
    const put = storage.putObject.bind(storage);
    storage.putObject = async (value) => { await put(value); throw new Error("中断"); };
    await expect(service().submit(ctx, input)).rejects.toThrow("中断");
    const prepared = (await rows()).receipts[0]!;
    await opened.client.close();
    opened = await createDb({ dataDir: join(root, "db") });
    storage.putObject = vi.fn(put);
    const result = await service().submit(ctx, input);
    expect(result.assetId).toBe(prepared.assetId); expect(storage.putObject).not.toHaveBeenCalled();
    await opened.client.close();
    opened = await createDb({ dataDir: join(root, "db") });
    expect(await service().submit(ctx, input)).toEqual(result);
    expect((await rows()).assets).toHaveLength(1);
  });

  it("已提交键也不能换来源或标题重放", async () => {
    await service().submit(ctx, input);
    await expect(service().submit(ctx, { ...input, name: "另一个标题" })).rejects.toThrow("其他内容");
    await expect(service().submit(ctx, { ...input, sourceUrl: "https://other.example/" })).rejects.toThrow("其他内容");
    expect((await rows()).assets).toHaveLength(1);
  });

  it("异步准备期间调用方修改输入不会改变已绑定的正文", async () => {
    const mutable = { ...input };
    const put = storage.putObject.bind(storage);
    storage.putObject = async (value) => { await put(value); mutable.fullText = "后来改变的正文"; };
    await service().submit(ctx, mutable);
    expect((await rows()).files[0]?.extractedText).toBe(input.fullText);
  });

  it("异步准备期间切换调用方账号不改变提交与授权归属", async () => {
    const mutable = { ...ctx };
    const put = storage.putObject.bind(storage);
    storage.putObject = async (value) => { await put(value); mutable.accountId = "other"; mutable.userId = "other"; };
    const result = await service().submit(mutable, input);
    expect((await rows()).assets[0]).toMatchObject({ id: result.assetId, userId: ctx.userId, accountId: ctx.accountId });
    expect(authorize).toHaveBeenCalledTimes(2);
    for (const call of authorize.mock.calls) expect(call[0]).toMatchObject({ userId: ctx.userId, accountId: ctx.accountId });
  });
});
