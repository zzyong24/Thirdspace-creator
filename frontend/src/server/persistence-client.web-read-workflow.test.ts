// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import { assets, assetFiles, eq } from "@creatoros/backend";
import { getChatRuntime, __resetPersistenceForTests } from "./persistence-client";

const fixture = vi.hoisted(() => ({
  root: "",
  db: null as import("@creatoros/backend").Db | null,
  dispose: async () => {},
  read: vi.fn(),
}));
vi.mock("@creatoros/backend", async (importOriginal) => {
  const original = await importOriginal<typeof import("@creatoros/backend")>();
  return { ...original,
    createConfiguredDb: async () => {
      const opened = await original.createDb(); fixture.db = opened.db;
      fixture.dispose = () => opened.client.close();
      return { db: opened.db, driver: { kind: "memory-pglite" }, dispose: fixture.dispose };
    },
    resolveMasterKey: () => ({ key: Buffer.alloc(32, 7), degraded: false }),
  };
});
vi.mock("@creatoros/backend/modules/assets",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@creatoros/backend/modules/assets")>();
  return {...original,createMockObjectStorage:(deps:any)=>original.createLocalFsObjectStorage({rootPath:fixture.root,publicBaseUrl:"/fixture-blob"},deps)};
});
vi.mock("@/server/ingestion/web-reader", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/ingestion/web-reader")>(), readUrl: fixture.read,
}));

const ctx = { userId: "workflow-test", accountId: "workflow-account", requestId: "request-1", source: "user" as const };
let runtime: Awaited<ReturnType<typeof getChatRuntime>>;
beforeAll(async () => { fixture.root=await mkdtemp(join(tmpdir(),"t915-web-cache-")); __resetPersistenceForTests(); runtime = await getChatRuntime(); });
afterAll(async () => { await fixture.dispose(); await rm(fixture.root,{recursive:true,force:true}); __resetPersistenceForTests(); });

describe("正式 readWebUrl 装配消费共享读取流程", () => {
  it("真实领域服务保存 pending、原始来源和完整正文后才返回结果", async () => {
    const url = "https://example.com/original";
    const fullText = "正文内容".repeat(4000);
    fixture.read.mockResolvedValueOnce({ text: fullText, title: "标题", finalUrl: "https://example.com/redirect", extractor: "readability", extractPath: "readability", turnCount: null });
    const result = await runtime.readWebUrl(ctx, { url });
    expect(result).toMatchObject({ needLogin: false, sourceUrl: url, fullText, fromCache: false, excerpt: fullText.slice(0, 280) });
    if ("blocked" in result || result.needLogin) throw new Error("预期实际正文素材");
    const [asset] = await fixture.db!.select().from(assets).where(eq(assets.id, result.assetId));
    const [file] = await fixture.db!.select().from(assetFiles).where(eq(assetFiles.id, asset!.currentFileId!));
    expect(asset).toMatchObject({ userId: ctx.userId, accountId: ctx.accountId, status: "pending", name: "正文·标题" });
    expect(file).toMatchObject({ extractedText: fullText, extractStatus: "done", mediaMetadata: { sourceUrl: url } });
    expect(fixture.read).toHaveBeenCalledTimes(1);
  });

  it("正式入口缓存命中不启动第二次网页读取，修复原文件且不重复素材",async()=>{
    const [before]=await fixture.db!.select().from(assets);
    await fixture.db!.update(assetFiles).set({extractedText:null,extractStatus:"pending"}).where(eq(assetFiles.id,before!.currentFileId!));
    const result=await runtime.readWebUrl(ctx,{url:"https://example.com/original"});
    expect(result).toMatchObject({fromCache:true,assetId:before!.id,fullText:"正文内容".repeat(4000)});
    expect(fixture.read).toHaveBeenCalledTimes(1);expect(await fixture.db!.select().from(assets)).toHaveLength(1);
    const [file]=await fixture.db!.select().from(assetFiles).where(eq(assetFiles.id,before!.currentFileId!));
    expect(file).toMatchObject({extractStatus:"done",extractedText:"正文内容".repeat(4000)});
  });

  it("已取消的正式调用不读取网页，也不创建第二份素材", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(runtime.readWebUrl(ctx, { url: "https://example.com/cancelled", signal: controller.signal })).rejects.toThrow();
    expect(fixture.read).toHaveBeenCalledTimes(1);
    expect(await fixture.db!.select().from(assets)).toHaveLength(1);
  });
});
