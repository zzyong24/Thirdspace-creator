import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
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
  return { ctx, task, artifact };
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
  it("真实登记与 local-fs HTML 回读带 opaque sandbox 和离线 CSP", async () => {
    const html = "<style>h1{color:red}</style><h1>真实报告</h1><script>window.parent.secret=1</script>";
    const item = await registered("text/html", Buffer.from(html));
    const res = await call(item.task.id, item.artifact.artifactId, 1);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(html);
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
