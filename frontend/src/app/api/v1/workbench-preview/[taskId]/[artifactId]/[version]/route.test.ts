import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { PNG } from "pngjs";
import { PDFParse } from "pdf-parse";
import { createDb, type Db } from "@creatoros/backend";
import { createWorkbenchArtifactReadService, createWorkbenchArtifactService, createPersistentTaskService } from "@creatoros/backend/modules/execution";
import { createLocalFsObjectStorage, createWorkbenchBlobService } from "@creatoros/backend/modules/assets";

const mocks = vi.hoisted(() => ({
  trusted: true,
  ctx: null as { userId: string; accountId: string; requestId: string; source: "user" } | null,
  resolve: vi.fn(),
  runtime: null as ReturnType<typeof createWorkbenchArtifactReadService> | null,
}));
vi.mock("@/lib/loopback-guard.server", () => ({
  isTrustedLocalRequest: () => mocks.trusted,
  loopbackForbidden: () => Response.json({ error: "forbidden" }, { status: 403 }),
}));
vi.mock("@/lib/request-context.server", () => ({
  readRequestAccountId: (req: Request) => req.headers.get("x-account-id"),
  resolveRequestContext: mocks.resolve,
  isAuthError: (error: { name?: string }) => error?.name === "AuthenticationError",
  isOwnershipError: (error: { name?: string }) => error?.name === "OwnershipError",
}));
vi.mock("@/app/api/v1/auth/_session", () => ({ readSessionCookie: () => "session" }));
vi.mock("@/server/persistence-client", () => ({ getWorkbenchPreviewRuntime: async () => mocks.runtime }));

import { GET } from "./route";

let db: Db;
let closeDb: () => Promise<void>;
let root: string;
let blobs: ReturnType<typeof createWorkbenchBlobService>;

beforeAll(async () => {
  const opened = await createDb(); db = opened.db; closeDb = () => opened.client.close();
  root = await mkdtemp(join(tmpdir(), "t1009-preview-"));
  const storage = createLocalFsObjectStorage({ rootPath: root, publicBaseUrl: "/blob" },
    { nextKey: () => { throw new Error("不应生成任意 key"); } });
  blobs = createWorkbenchBlobService(async () => storage);
  mocks.runtime = createWorkbenchArtifactReadService(db, { blobs });
});
afterAll(async () => { await closeDb?.(); await rm(root, { recursive: true, force: true }); });
beforeEach(() => {
  vi.clearAllMocks(); mocks.trusted = true; mocks.ctx = null;
  mocks.resolve.mockImplementation(async () => mocks.ctx);
});

async function registered(mime: "text/html" | "text/markdown" | "text/csv" | "image/png" | "application/pdf", bytes: Uint8Array) {
  const nonce = randomUUID(), ctx = { userId: `user-${nonce}`, accountId: `account-${nonce}`,
    requestId: nonce, source: "user" as const };
  const tasks = createPersistentTaskService(db);
  const task = await tasks.enqueue(ctx, { kind: "ai_task", ownerType: "ai_task", ownerId: nonce,
    idempotencyKey: nonce, payload: {} });
  const claim = (await tasks.claimTask({ taskId: task.id, workerId: `worker-${nonce}` }))!;
  const writer = createWorkbenchArtifactService(db, { blobs,
    readTaskFile: async () => ({ bytes: Uint8Array.from(bytes), version: 1 }) });
  const artifact = await writer.register({ executionTaskId: task.id, attempt: claim.lease.attempt,
    fenceToken: claim.lease.fenceToken }, `operation-${nonce}`, { path: "report", mime });
  mocks.ctx = ctx;
  async function registerMore(path: string, mime: "image/png", content: Uint8Array) {
    const next = createWorkbenchArtifactService(db, { blobs,
      readTaskFile: async () => ({ bytes: Uint8Array.from(content), version: 1 }) });
    return next.register({ executionTaskId: task.id, attempt: claim.lease.attempt,
      fenceToken: claim.lease.fenceToken }, `operation-${randomUUID()}`, { path, mime });
  }
  return { ctx, task, artifact, registerMore };
}
function request(taskId: string, artifactId: string, version: number) {
  return new Request(`http://localhost:3000/api/v1/workbench-preview/${taskId}/${artifactId}/${version}`, {
    headers: { "x-account-id": mocks.ctx?.accountId ?? "account" },
  });
}
function call(taskId: string, artifactId: string, version: number) {
  return GET(request(taskId, artifactId, version), {
    params: Promise.resolve({ taskId, artifactId, version: String(version) }),
  });
}
function callFormat(taskId:string,artifactId:string,version:number,format:string){
 const base=request(taskId,artifactId,version);
 return GET(new Request(`${base.url}?format=${format}`,{headers:base.headers}),{
  params:Promise.resolve({taskId,artifactId,version:String(version)}),
 });
}

async function findDataFiles(directory = root): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findDataFiles(path));
    else if (!entry.name.endsWith(".meta.json")) files.push(path);
  }
  return files;
}

describe("T-1009 已登记产物 HTTP 预览", () => {
  it("从同账号已验真 HTML 和已登记相对 PNG 生成真实 PNG/PDF，响应元数据对应交付字节", async () => {
    const chartImage=new PNG({width:1,height:1});chartImage.data.set([0,200,0,255]);
    const chart=PNG.sync.write(chartImage);
    const html='<img src="./chart.png" style="position:absolute;left:0;top:0;width:40px;height:40px"><h1 style="margin-top:100px">真实报告 2026</h1><script>document.body.textContent="伪造"</script>';
    const item=await registered("text/html",Buffer.from(html));
    await item.registerMore("chart.png","image/png",chart);
    for(const format of ["png","pdf"] as const){
      const res=await callFormat(item.task.id,item.artifact.artifactId,1,format);
      expect(res.status).toBe(200);
      const bytes=Buffer.from(await res.arrayBuffer());
      expect(res.headers.get("content-type")).toBe(format==="png"?"image/png":"application/pdf");
      expect(res.headers.get("x-workbench-source-hash")).toBe(item.artifact.hash);
      expect(res.headers.get("x-workbench-hash")).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(res.headers.get("x-workbench-size")).toBe(String(bytes.byteLength));
      expect(decodeURIComponent(res.headers.get("x-workbench-filename")!)).toBe(`report.${format}`);
      if(format==="png"){
        const image=PNG.sync.read(bytes);
        expect(image.width).toBe(1280);
        const pixel=image.data.subarray((20*image.width+20)*4,(20*image.width+20)*4+4);
        expect([...pixel]).toEqual([0,200,0,255]);
      }else{
        const parser=new PDFParse({data:bytes});
        try{const parsed=await parser.getText();expect(parsed.text).toContain("真实报告 2026");
          expect(parsed.text).not.toContain("伪造");}
        finally{await parser.destroy();}
      }
    }
    const raw=await callFormat(item.task.id,item.artifact.artifactId,1,"raw");
    expect(await raw.text()).toBe(html);
    const preview=await call(item.task.id,item.artifact.artifactId,1);
    expect(await preview.text()).toContain("data:image/png;base64,");
    mocks.ctx={...item.ctx,accountId:"other-account"};
    expect((await callFormat(item.task.id,item.artifact.artifactId,1,"png")).status).toBe(404);
  },120_000);

  it("非 HTML 与无效格式在渲染前拒绝",async()=>{
    const item=await registered("text/markdown",Buffer.from("# 内容"));
    expect((await callFormat(item.task.id,item.artifact.artifactId,1,"png")).status).toBe(415);
    expect((await callFormat(item.task.id,item.artifact.artifactId,1,"pdf")).status).toBe(415);
    expect((await callFormat(item.task.id,item.artifact.artifactId,1,"jpeg")).status).toBe(400);
  });

  it("错误编码和缺少随包浏览器时明确失败，不返回伪 PNG",async()=>{
    const invalid=await registered("text/html",Uint8Array.from([0xff,0xfe]));
    expect((await callFormat(invalid.task.id,invalid.artifact.artifactId,1,"png")).status).toBe(422);
    const item=await registered("text/html",Buffer.from("<h1>报告</h1>"));
    const originalDesktop=process.env.CREATOROS_DESKTOP;
    const originalBrowsers=process.env.CREATOROS_BROWSERS_DIR;
    const originalRuntime=process.env.CREATOROS_RUNTIME_ROOT;
    process.env.CREATOROS_DESKTOP="1";
    process.env.CREATOROS_BROWSERS_DIR="/missing/t1009-browsers";
    process.env.CREATOROS_RUNTIME_ROOT="/missing/t1009-runtime";
    try{
      const res=await callFormat(item.task.id,item.artifact.artifactId,1,"png");
      expect(res.status).toBe(503);
      expect(await res.text()).toContain("缺少 HTML 导出所需的 Chromium");
    }finally{
      if(originalDesktop===undefined)delete process.env.CREATOROS_DESKTOP;else process.env.CREATOROS_DESKTOP=originalDesktop;
      if(originalBrowsers===undefined)delete process.env.CREATOROS_BROWSERS_DIR;else process.env.CREATOROS_BROWSERS_DIR=originalBrowsers;
      if(originalRuntime===undefined)delete process.env.CREATOROS_RUNTIME_ROOT;else process.env.CREATOROS_RUNTIME_ROOT=originalRuntime;
    }
  });
  it("真实登记的相对 PNG 随 HTML 一同离线预览，跨账号及坏图片安全跳过", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9GmS8AAAAASUVORK5CYII=", "base64");
    const html = '<h1>真实报告</h1><img src="./chart.png"><img src="./bad.png"><img src="./foreign.png"><img src="../secret.png"><img src="/api/v1/private"><img src="https://evil.test/x.png">';
    const item = await registered("text/html",Buffer.from(html));
    await item.registerMore("chart.png","image/png",png);
    await item.registerMore("bad.png","image/png",Buffer.from("not-a-png"));
    const other=await registered("text/html",Buffer.from("<p>其他账号</p>"));
    await other.registerMore("foreign.png","image/png",png);
    mocks.ctx=item.ctx;
    const res=await call(item.task.id,item.artifact.artifactId,1);
    expect(res.status).toBe(200);
    const body=await res.text();
    expect(body).toContain("真实报告");
    expect(res.headers.get("x-workbench-hash")).toBe(createHash("sha256").update(body).digest("hex"));
    expect(body).toContain(`data:image/png;base64,${png.toString("base64")}`);
    expect(body).not.toContain("bad.png");
    expect(body).not.toContain("foreign.png");
    expect(body).not.toContain("secret.png");
    expect(body).not.toContain("/api/v1/private");
    expect(body).not.toContain("evil.test");
    const candidates = (await findDataFiles()).filter(path => path.includes(`/${item.ctx.accountId}/`));
    const storedChart = (await Promise.all(candidates.map(async path =>
      ({ path, bytes: await readFile(path) })))).find(entry => entry.bytes.equals(png));
    expect(storedChart).toBeDefined();
    await writeFile(storedChart!.path,"corrupted");
    const afterDamage = await call(item.task.id,item.artifact.artifactId,1);
    expect(afterDamage.status).toBe(200);
    const damagedBody=await afterDamage.text();
    expect(damagedBody).toContain("真实报告");
    expect(damagedBody).not.toContain("data:image/png");
    mocks.ctx={...item.ctx,accountId:"other-account"};
    expect((await call(item.task.id,item.artifact.artifactId,1)).status).toBe(404);
  });
  it("真实登记与 local-fs HTML 回读带 opaque sandbox 和离线 CSP", async () => {
    const html = "<style>h1{color:red}</style><h1>真实报告</h1><script>window.parent.secret=1</script>";
    const item = await registered("text/html", Buffer.from(html));
    const res = await call(item.task.id, item.artifact.artifactId, 1);
    expect(res.status).toBe(200);
    const preview = await res.text();
    expect(preview).toContain("真实报告");
    expect(preview).not.toContain("<script");
    expect(preview).not.toContain("window.parent.secret");
    const rawRequest=request(item.task.id,item.artifact.artifactId,1);
    const rawResponse=await GET(new Request(`${rawRequest.url}?format=raw`,{headers:rawRequest.headers}),{
      params:Promise.resolve({taskId:item.task.id,artifactId:item.artifact.artifactId,version:"1"}),
    });
    expect(await rawResponse.text()).toBe(html);
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toContain("sandbox;");
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).not.toContain("allow-scripts");
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("default-src 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(mocks.resolve).toHaveBeenCalledWith("session", item.ctx.accountId, { rejectInvalidToken: true });
  });

  it("跨用户、账号、任务、版本以及损坏字节均不返回正文", async () => {
    const item = await registered("text/html", Buffer.from("<h1>私有内容</h1>"));
    mocks.ctx = { ...item.ctx, userId: "other-user" };
    expect((await call(item.task.id, item.artifact.artifactId, 1)).status).toBe(404);
    mocks.ctx = { ...item.ctx, accountId: "other-account" };
    expect((await call(item.task.id, item.artifact.artifactId, 1)).status).toBe(404);
    mocks.ctx = item.ctx;
    expect((await call("other-task", item.artifact.artifactId, 1)).status).toBe(404);
    expect((await call(item.task.id, item.artifact.artifactId, 2)).status).toBe(404);
    const files = await findDataFiles();
    const target = files.find(path => path.includes(`/${item.ctx.accountId}/`));
    expect(target).toBeDefined();
    await writeFile(target!, "<h1>已损坏</h1>");
    const damaged = await call(item.task.id, item.artifact.artifactId, 1);
    expect(damaged.status).not.toBe(200);
    expect(await damaged.text()).not.toContain("私有内容");
  });

  it.each([
    ["text/markdown", Buffer.from("# 标题")],
    ["text/csv", Buffer.from("count\n0\n")],
    ["image/png", Buffer.from("89504e470d0a1a0a", "hex")],
    ["application/pdf", Buffer.from("%PDF-1.7\n预览")],
  ] as const)("安全显示 %s", async (mime, bytes) => {
    const item = await registered(mime, bytes);
    const res = await call(item.task.id, item.artifact.artifactId, 1);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-workbench-mime")).toBe(mime);
    expect(res.headers.get("content-type")).toBe(
      mime === "text/markdown" || mime === "text/csv" ? "text/plain; charset=utf-8" : mime,
    );
    expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);
  });

  it("raw 模式交付原始 MIME、字节和可读文件信息，不触发下载", async () => {
    const bytes = Buffer.from("# 原始 Markdown\n零条数据");
    const item = await registered("text/markdown", bytes);
    const base = request(item.task.id, item.artifact.artifactId, 1);
    const res = await GET(new Request(`${base.url}?format=raw`, { headers: base.headers }), {
      params: Promise.resolve({ taskId: item.task.id, artifactId: item.artifact.artifactId, version: "1" }),
    });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("content-disposition")).toContain("inline;");
    expect(res.headers.get("content-disposition")).not.toContain("attachment");
    expect(decodeURIComponent(res.headers.get("x-workbench-filename")!)).toBe("report.md");
    expect(res.headers.get("x-workbench-hash")).toBe(item.artifact.hash);
    expect(res.headers.get("x-workbench-size")).toBe(String(bytes.byteLength));
    expect(res.headers.get("content-security-policy")).toContain("sandbox;");
    mocks.ctx = { ...item.ctx, accountId: "other-account" };
    const denied = await GET(new Request(`${base.url}?format=raw`, { headers: base.headers }), {
      params: Promise.resolve({ taskId: item.task.id, artifactId: item.artifact.artifactId, version: "1" }),
    });
    expect(denied.status).toBe(404);
  });

  it("不可信本机请求、失效身份和不合法版本在读取前拒绝", async () => {
    mocks.trusted = false;
    expect((await call("task", "artifact", 1)).status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
    mocks.trusted = true;
    mocks.resolve.mockRejectedValueOnce(Object.assign(new Error("expired"), { name: "AuthenticationError" }));
    expect((await call("task", "artifact", 1)).status).toBe(401);
    const malformed = await GET(request("task", "artifact", 1), {
      params: Promise.resolve({ taskId: "task", artifactId: "artifact", version: "../1" }),
    });
    expect(malformed.status).toBe(400);
  });
});
