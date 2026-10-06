import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import type { Db } from "@creatoros/backend";
import { DispatchClient } from "../../../../../../mcp-server/src/dispatch";
import { main as cliMain } from "../../../../../../mcp-server/src/cli";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  dispatchErrorResponse,
  safeDispatchErrorDiagnostic,
  shouldCaptureDispatchFailure,
  validateCliInvocation,
  POST,
} from "./route";
import { ENDPOINTS } from "@creatoros/contract";
import { resetStore } from "@/server/mock-backend/index";
import { __resetPersistenceForTests, compositeTransport } from "@/server/persistence-client";
import { ConflictError as PublishingConflictError } from "@creatoros/backend/modules/publishing";

const receiptDb = vi.hoisted(() => ({ db: null as Db | null }));
// 只持有真实内存库以核对原 invocation/零业务重执；不替换任何服务、事务或响应。
vi.mock("@creatoros/backend", async (load) => {
  const actual = await load<typeof import("@creatoros/backend")>();
  return { ...actual, createConfiguredDb: async (...args: Parameters<typeof actual.createConfiguredDb>) => {
    const opened = await actual.createConfiguredDb(...args);
    receiptDb.db = opened.db;
    return opened;
  } };
});

// Task 9 — dispatch derives ctx from the `creatoros_session` cookie.
// [用户裁决 2026-07-06] canonical email 已置空(用户属性不 seed)→ 不再 email-login。
// 走 T-046 单机免登录:不带 cookie → 本机主用户(= seed canonical user-zyongzhu)直通,
// dispatch 照旧解析到规范租户,无需 mint 会话。
const SESSION_COOKIE = "";

it("T-1024 only queues unexpected dispatch failures, never consent recursion or ordinary client errors",()=>{
  expect(shouldCaptureDispatchFailure("projects.get",{code:"OwnershipError"})).toBe(false);
  expect(shouldCaptureDispatchFailure("settings.reporting.consent.set",new Error("db"))).toBe(false);
  expect(shouldCaptureDispatchFailure("projects.scripts.generateCandidate",{code:"ExternalDependencyError"})).toBe(true);
  expect(shouldCaptureDispatchFailure("projects.scripts.generateCandidate",new Error("unexpected"))).toBe(true);
});

describe("T-843 CLI 完整访问调用门", () => {
  const previous = process.env.CREATOROS_CLI_ACCESS_TOKEN;
  const clientId = "cli-test-client";

  beforeEach(() => {
    process.env.CREATOROS_CLI_ACCESS_TOKEN = "cli-grant-secret";
  });

  it("读操作持有效 grant 可直接通过，错 grant 拒绝", async () => {
    const valid = new Request("http://localhost/api/v1/dispatch", {
      headers: {
        "x-creatoros-cli-access": "cli-grant-secret",
        "x-creatoros-cli-client-id": clientId,
      },
    });
    expect(validateCliInvocation(valid, ENDPOINTS.listProjects)).toBeNull();

    const invalid = new Request("http://localhost/api/v1/dispatch", {
      headers: {
        "x-creatoros-cli-access": "wrong",
        "x-creatoros-cli-client-id": clientId,
      },
    });
    const rejection = validateCliInvocation(invalid, ENDPOINTS.listProjects)!;
    expect(rejection.status).toBe(403);
  });

  it("正式桌面凭据还必须匹配产品、包身份与本次启动 nonce", () => {
    const root = mkdtempSync(join(tmpdir(), "creatoros-cli-credential-"));
    const credential = join(root, "credential.json");
    const previousFile = process.env.CREATOROS_CLI_ACCESS_FILE;
    try {
      writeFileSync(credential, JSON.stringify({
        schema: "creatoros-cli-credential/v1",
        productId: "creatoros",
        packageId: "cloud.aitongban.creatoros",
        cliAccessToken: "bound-token",
        launchNonce: "launch-nonce",
      }));
      process.env.CREATOROS_CLI_ACCESS_FILE = credential;
      const missingIdentity = new Request("http://localhost/api/v1/dispatch", {
        headers: {
          "x-creatoros-cli-access": "bound-token",
          "x-creatoros-cli-client-id": clientId,
        },
      });
      expect(validateCliInvocation(missingIdentity, ENDPOINTS.listProjects)?.status).toBe(403);

      const valid = new Request("http://localhost/api/v1/dispatch", {
        headers: {
          "x-creatoros-cli-access": "bound-token",
          "x-creatoros-cli-client-id": clientId,
          "x-creatoros-cli-product-id": "creatoros",
          "x-creatoros-cli-package-id": "cloud.aitongban.creatoros",
          "x-creatoros-cli-launch-nonce": "launch-nonce",
        },
      });
      expect(validateCliInvocation(valid, ENDPOINTS.listProjects)).toBeNull();
    } finally {
      if (previousFile === undefined) delete process.env.CREATOROS_CLI_ACCESS_FILE;
      else process.env.CREATOROS_CLI_ACCESS_FILE = previousFile;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("写操作必须同时有 --apply 语义与幂等键", async () => {
    const missingApply = new Request("http://localhost/api/v1/dispatch", {
      headers: {
        "x-creatoros-cli-access": "cli-grant-secret",
        "x-creatoros-cli-client-id": clientId,
      },
    });
    expect(validateCliInvocation(missingApply, ENDPOINTS.createProject)?.status).toBe(409);

    const valid = new Request("http://localhost/api/v1/dispatch", {
      headers: {
        "x-creatoros-cli-access": "cli-grant-secret",
        "x-creatoros-cli-client-id": clientId,
        "x-creatoros-cli-apply": "1",
        "x-idempotency-key": "idem-1",
      },
    });
    expect(validateCliInvocation(valid, ENDPOINTS.createProject)).toBeNull();
  });

  it("DELETE 还必须声明真实影响目标", () => {
    const noImpact = new Request("http://localhost/api/v1/dispatch", {
      headers: {
        "x-creatoros-cli-access": "cli-grant-secret",
        "x-creatoros-cli-client-id": clientId,
        "x-creatoros-cli-apply": "1",
        "x-idempotency-key": "idem-delete",
      },
    });
    expect(validateCliInvocation(noImpact, ENDPOINTS.deleteProject)?.status).toBe(409);
  });

  afterAll(() => {
    if (previous === undefined) delete process.env.CREATOROS_CLI_ACCESS_TOKEN;
    else process.env.CREATOROS_CLI_ACCESS_TOKEN = previous;
  });
});

// [T-332 S2] strict 账号门:per-account op(projects/pages 等)必须解析出 ctx.accountId,
// dispatch 链路的号来自 `x-account-id` header(route 内 withVerifiedAccount 以真实 userId
// 查号验属主,不属主/不存在 → 降级 null → AccountRequiredError)。所以测试必须先经
// dispatch 真建一条 platform account,再把它的 id 当默认 header 携带 —— 走的就是浏览器
// 端「当前选中号」的真实调用路径。beforeEach 里填充。
let ACCOUNT_ID = "";

function dispatch(
  id: string,
  input: unknown,
  cookie = SESSION_COOKIE,
  accountId: string | null = null, // null = 用默认真建号;"" = 显式不带号
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (cookie) headers.cookie = cookie;
  const acc = accountId ?? ACCOUNT_ID;
  if (acc) headers["x-account-id"] = acc;
  return POST(
    new Request("http://localhost/api/v1/dispatch", {
      method: "POST",
      headers,
      body: JSON.stringify({ id, input }),
    }),
  );
}

function cliDispatch(
  id: string,
  input: unknown,
  accountId: string,
  idempotencyKey: string,
  confirmImpact?: string,
  groupId?:string,
) {
  return POST(
    new Request("http://localhost/api/v1/dispatch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(accountId?{"x-account-id":accountId}:{}),
        ...(groupId?{"x-group-id":groupId}:{}),
        "x-creatoros-cli-access": "cli-integration-grant",
        "x-creatoros-cli-client-id": "cli-integration-client",
        "x-creatoros-cli-apply": "1",
        "x-idempotency-key": idempotencyKey,
        ...(confirmImpact ? { "x-creatoros-cli-confirm-impact": confirmImpact } : {}),
      },
      body: JSON.stringify({ id, input }),
    }),
  );
}

// 真建一条 platform account(user 级 op,不需要选号),返回 id 作后续请求的当前号。
async function createFixtureAccount(handle = "@dispatch-route-fixture"): Promise<string> {
  const res = await dispatch(
    "accounts.create",
    {
      params: undefined,
      query: undefined,
      body: {
        platform: "douyin",
        accountHandle: handle,
        followerBaseline: 300,
      },
    },
    "",
    "", // 建号请求本身不带 x-account-id
  );
  const json = (await res.json()) as { data: { id: string } };
  return json.data.id;
}

async function listProjectIds(): Promise<string[]> {
  const res = await dispatch("projects.list", {
    params: undefined,
    query: { page: 1, pageSize: 50 },
    body: undefined,
  });
  const json = (await res.json()) as { data: Array<{ id: string }> };
  return json.data.map((p) => p.id);
}

describe("POST /api/v1/dispatch (FE<->BE seam over HTTP; project ops on real SQL)", () => {
  beforeEach(async () => {
    resetStore(); // mock-backed ops (outputs/tasks/pages)
    __resetPersistenceForTests(); // fresh pglite seed (project ops)
    // 免登录:不 mint 会话,dispatch 不带 cookie → 本机主用户直通(seed canonical)。
    // [T-332 S2] 真建当前号(开箱空,canonical account seed 已随 T-135 退役)。
    ACCOUNT_ID = await createFixtureAccount();
  });

  it('T1062 CLI公开缓存不得泄露已显式迁组的project/output，纯组切平台不串缓存',async()=>{
    const previous=process.env.CREATOROS_CLI_ACCESS_TOKEN;process.env.CREATOROS_CLI_ACCESS_TOKEN='cli-integration-grant';
    const userCall=async(id:string,input:unknown,groupId?:string)=>POST(new Request('http://localhost/api/v1/dispatch',{method:'POST',headers:{'content-type':'application/json',...(groupId?{'x-group-id':groupId}:{})},body:JSON.stringify({id,input})}));
    try{const a=ENDPOINTS.createAccountGroup.response.parse((await(await userCall('accountGroups.create',{body:{name:'CLI空组A',idempotencyKey:'cli-empty-a'}})).json()).data),b=ENDPOINTS.createAccountGroup.response.parse((await(await userCall('accountGroups.create',{body:{name:'CLI空组B',idempotencyKey:'cli-empty-b'}})).json()).data);
      const input={body:{title:'真实缓存作品',brief:'迁移后原组不能取缓存'}};const first=await cliDispatch('projects.create',input,'','cli-group-create-key',undefined,a.id);expect(first.status).toBe(200);const project=ENDPOINTS.createProject.response.parse((await first.json()).data);
      const again=await cliDispatch('projects.create',input,'','cli-group-create-key',undefined,a.id);expect(again.status).toBe(200);expect((await again.json()).data.id).toBe(project.id);
      const outputInput={params:{projectId:project.id},body:{title:'真实缓存成品'}};const output=await cliDispatch('projects.outputs.create',outputInput,'','cli-group-output-key',undefined,a.id);expect(output.status).toBe(200);
      const selection={fromGroupId:a.id,toGroupId:b.id,projectIds:[project.id],knowledgeIds:[],conversationIds:[]};const previewResponse=await userCall('accountGroups.migration.preview',{body:selection},a.id);expect(previewResponse.status).toBe(200);const preview=ENDPOINTS.previewAccountGroupMigration.response.parse((await previewResponse.json()).data);const applied=await userCall('accountGroups.migration.apply',{body:{...selection,digest:preview.digest,idempotencyKey:'cli-cache-explicit-move'}},a.id);expect(applied.status).toBe(200);
      expect((await cliDispatch('projects.create',input,'','cli-group-create-key',undefined,a.id)).status).toBe(404);expect((await cliDispatch('projects.outputs.create',outputInput,'','cli-group-output-key',undefined,a.id)).status).toBe(404);
      const other=await cliDispatch('projects.create',input,'','cli-group-create-key',undefined,b.id);expect(other.status).toBe(200);expect((await other.json()).data.id).not.toBe(project.id);
    }finally{if(previous===undefined)delete process.env.CREATOROS_CLI_ACCESS_TOKEN;else process.env.CREATOROS_CLI_ACCESS_TOKEN=previous;}
  },120000);

  it('T1062 CLI成功缓存是历史回读，项目/组归档后不执行旧handler，新键仍拒绝',async()=>{
    const previous=process.env.CREATOROS_CLI_ACCESS_TOKEN;process.env.CREATOROS_CLI_ACCESS_TOKEN='cli-integration-grant';
    const userCall=(id:string,input:unknown,groupId?:string)=>POST(new Request('http://localhost/api/v1/dispatch',{method:'POST',headers:{'content-type':'application/json',...(groupId?{'x-group-id':groupId}:{})},body:JSON.stringify({id,input})}));
    try{
      const created=await userCall('accountGroups.create',{body:{name:'CLI历史组',idempotencyKey:'cli-history-group'}});expect(created.status).toBe(200);const group=ENDPOINTS.createAccountGroup.response.parse((await created.json()).data);
      const input={body:{title:'归档历史项目',brief:'保留原cache'}};const first=await cliDispatch('projects.create',input,'','cli-history-project',undefined,group.id);expect(first.status).toBe(200);const project=ENDPOINTS.createProject.response.parse((await first.json()).data);
      const outputInput={params:{projectId:project.id},body:{title:'归档历史output'}};const outputResponse=await cliDispatch('projects.outputs.create',outputInput,'','cli-history-output',undefined,group.id);expect(outputResponse.status).toBe(200);const output=ENDPOINTS.createOutput.response.parse((await outputResponse.json()).data);
      expect((await userCall('projects.archive',{params:{projectId:project.id}},group.id)).status).toBe(200);
      const projectReplay=await cliDispatch('projects.create',input,'','cli-history-project',undefined,group.id);expect(projectReplay.status).toBe(200);expect(ENDPOINTS.createProject.response.parse((await projectReplay.json()).data).id).toBe(project.id);
      const groupArchived=await userCall('accountGroups.archive',{params:{groupId:group.id},body:{expectedVersion:group.version}});expect(groupArchived.status).toBe(200);
      const outputReplay=await cliDispatch('projects.outputs.create',outputInput,'','cli-history-output',undefined,group.id);expect(outputReplay.status).toBe(200);expect(ENDPOINTS.createOutput.response.parse((await outputReplay.json()).data).id).toBe(output.id);
      expect((await cliDispatch('projects.outputs.create',outputInput,'','cli-history-new-output',undefined,group.id)).status).not.toBe(200);
      const historicalRead=await cliDispatch('projects.get',{params:{projectId:project.id}},'','cli-history-read',undefined,group.id);expect(historicalRead.status).toBe(200);expect(ENDPOINTS.getProject.response.parse((await historicalRead.json()).data).id).toBe(project.id);
    }finally{if(previous===undefined)delete process.env.CREATOROS_CLI_ACCESS_TOKEN;else process.env.CREATOROS_CLI_ACCESS_TOKEN=previous;}
  },120000);

  it("T1062 真实loopback HTTP：素材关联后同key失败仍保持原回执，CLI非零且零重执", async () => {
    const envKeys = ["CREATOROS_BASE_URL", "CREATOROS_CLI_ACCESS_TOKEN", "CREATOROS_CLI_ACCESS_FILE", "CREATOROS_HANDSHAKE_TOKEN", "CREATOROS_EMAIL", "CREATOROS_PASSWORD"] as const;
    const priorEnv = envKeys.map((key) => [key, process.env[key]] as const);
    const priorExitCode = process.exitCode;
    process.env.CREATOROS_CLI_ACCESS_TOKEN = "cli-integration-grant";
    for (const key of envKeys.filter((key) => key !== "CREATOROS_CLI_ACCESS_TOKEN")) delete process.env[key];
    const seen: Array<{ id: string; status: number }> = [];
    const server = createServer(async (incoming, outgoing) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(",") : value);
        }
        const body = Buffer.concat(chunks).toString("utf8");
        const response = await POST(new Request(`http://127.0.0.1${incoming.url}`, { method: "POST", headers, body }));
        seen.push({ id: JSON.parse(body).id, status: response.status });
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(await response.text());
      } catch (error) {
        outgoing.writeHead(500, { "content-type": "application/json" });
        outgoing.end(JSON.stringify({ error: { message: String(error) } }));
      }
    });
    const handler = vi.spyOn(compositeTransport, "request");
    let stdout: ReturnType<typeof vi.spyOn> | undefined;
    try {
      await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("隔离HTTP监听未就绪");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      process.env.CREATOROS_BASE_URL = baseUrl;
      const client = new DispatchClient({ baseUrl, cliAccessToken: "cli-integration-grant", clientId: "real-receipt-loopback" });
      const write = (id: string, input: unknown, key: string, groupId?: string) => client.dispatch(id, input as never, { groupId, apply: true, idempotencyKey: key });
      const groupEnvelope = await write("accountGroups.create", { body: { name: "失败回执隔离组", idempotencyKey: "receipt-fixture-group" } }, "receipt-fixture-group") as { data: { id: string } };
      const groupId = groupEnvelope.data.id;
      const projectEnvelope = await write("projects.create", { body: { title: "隔离失败回放", brief: "" } }, "receipt-fixture-project", groupId) as { data: { id: string } };
      const projectId = projectEnvelope.data.id;
      const outputEnvelope = await write("projects.outputs.create", { params: { projectId }, body: { title: "真实父视频", contentType: "video" } }, "receipt-fixture-output", groupId) as { data: { id: string } };
      const outputId = outputEnvelope.data.id;
      // 既有test对象存储夹具；本测试证明拒绝/幂等/真实SQL与HTTP，不声称视频解码通过。
      const upload = await write("assets.uploads.create", { body: { assetType: "video", mimeType: "video/mp4", fileSize: 32 } }, "receipt-fixture-upload", groupId) as { data: { uploadId: string } };
      const asset = await write("assets.uploads.complete", { params: { uploadId: upload.data.uploadId }, body: { name: "未关联测试原片" } }, "receipt-fixture-complete", groupId) as { data: { id: string; currentFileId: string } };
      const id = "outputs.production.editor.sources.prepare";
      const key = "receipt-original-failed-key";
      const input = { params: { outputId }, body: { assetId: asset.data.id, assetFileId: asset.data.currentFileId, requestId: "receipt-original-source-intent" } };
      await expect(write(id, input, key, groupId)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("请先将该素材加入当前项目") });
      const { cliInvocations, cliInvocationResults, productionMediaRequests, executionTasks, projects, eq } = await import("@creatoros/backend");
      const before = (await receiptDb.db!.select().from(cliInvocations)).find((row) => row.idempotencyKey === key)!;
      expect(before).toMatchObject({ status: "failed", operation: id });
      expect(await receiptDb.db!.select().from(productionMediaRequests)).toHaveLength(0);
      expect(await receiptDb.db!.select().from(executionTasks)).toHaveLength(0);
      await write("materialLinks.create", { body: { projectId, entityType: "asset", entityId: asset.data.id } }, "receipt-fixture-real-link", groupId);
      const links = await client.dispatch("materialLinks.list", { query: { projectId, page: 1, pageSize: 50 } }, { groupId }) as { data: Array<{ entityId: string }> };
      expect(links.data.some((link) => link.entityId === asset.data.id)).toBe(true);
      const expectedReceipt = { duplicate: true, requestId: before.requestId, status: "failed", taskId: null, targetRefs: before.targetRefs, resultExpired: false, outcomeUnknown: false, manualReconcileRequired: false };
      const duplicate = await write(id, input, key, groupId).catch((error: unknown) => error);
      expect.soft(duplicate).toMatchObject({ status: 409, requestId: before.requestId, receipt: expectedReceipt });
      let printed = "";
      stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { printed += String(chunk); return true; });
      process.exitCode = undefined;
      await cliMain(["call", id, "--input", JSON.stringify(input), "--group", groupId, "--apply", "--idempotency-key", key]);
      stdout.mockRestore(); stdout = undefined;
      expect.soft(process.exitCode).toBe(4);
      expect.soft(JSON.parse(printed)).toMatchObject({ ok: false, requestId: before.requestId, receipt: expectedReceipt, meta: { requestId: before.requestId }, error: { code: "HTTP_409" } });
      expect.soft(seen.filter((request) => request.id === id).map((request) => request.status)).toEqual([409, 409, 409]);
      expect(handler.mock.calls.filter(([endpoint]) => endpoint.id === id)).toHaveLength(1);
      expect((await receiptDb.db!.select().from(cliInvocations)).find((row) => row.idempotencyKey === key)).toEqual(before);
      expect(await receiptDb.db!.select().from(productionMediaRequests)).toHaveLength(0);
      expect(await receiptDb.db!.select().from(executionTasks)).toHaveLength(0);
      await expect(client.dispatch("outputs.production.editor.sources.get", { params: { outputId, requestId: input.body.requestId } }, { groupId })).rejects.toMatchObject({ status: 404 });
      await expect(write(id, { ...input, body: { ...input.body, requestId: "receipt-different-input" } }, key, groupId)).rejects.toMatchObject({ status: 409 });
      expect(handler.mock.calls.filter(([endpoint]) => endpoint.id === id)).toHaveLength(1);

      // 仅在另建隔离夹具上放置已有持久终态/过期，不改原failed行；仍经真实HTTP读取既有状态机。
      for (const state of ["running", "succeeded", "outcome_unknown"] as const) {
        const stateKey = `receipt-${state}-fixture`, stateInput = { body: { title: `隔离${state}回执`, brief: "" } };
        const created = await write("projects.create", stateInput, stateKey, groupId) as { data: { id: string }; meta: { requestId: string } };
        expect(await write("projects.create", stateInput, stateKey, groupId)).toEqual(created);
        const invocation = (await receiptDb.db!.select().from(cliInvocations)).find((row) => row.idempotencyKey === stateKey)!;
        if (state === "succeeded") {
          await receiptDb.db!.update(cliInvocationResults).set({ resultExpiresAt: "2000-01-01T00:00:00.000Z" }).where(eq(cliInvocationResults.invocationId, invocation.id));
        } else {
          await receiptDb.db!.update(cliInvocations).set({ status: state }).where(eq(cliInvocations.id, invocation.id));
        }
        const callsBefore = handler.mock.calls.filter(([endpoint]) => endpoint.id === "projects.create").length;
        const projectCount = (await receiptDb.db!.select().from(projects)).length;
        const terminalReceipt = { duplicate: true, requestId: invocation.requestId, status: state, taskId: invocation.taskId, targetRefs: invocation.targetRefs, resultExpired: state === "succeeded", outcomeUnknown: state === "outcome_unknown", manualReconcileRequired: state === "outcome_unknown" };
        const replay = await write("projects.create", stateInput, stateKey, groupId).catch((error: unknown) => error);
        expect(replay).toMatchObject(state === "outcome_unknown"
          ? { status: 409, requestId: invocation.requestId, receipt: terminalReceipt }
          : { data: null, receipt: terminalReceipt, meta: { requestId: invocation.requestId } });
        printed = "";
        stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { printed += String(chunk); return true; });
        process.exitCode = undefined;
        await cliMain(["call", "projects.create", "--input", JSON.stringify(stateInput), "--group", groupId, "--apply", "--idempotency-key", stateKey]);
        stdout.mockRestore(); stdout = undefined;
        expect(JSON.parse(printed)).toMatchObject({ ok: state !== "outcome_unknown", requestId: invocation.requestId, receipt: terminalReceipt, meta: { requestId: invocation.requestId } });
        expect(process.exitCode).toBe(state === "outcome_unknown" ? 4 : undefined);
        expect(seen.slice(-2).map((request) => request.status)).toEqual(state === "running" ? [202, 202] : state === "succeeded" ? [200, 200] : [409, 409]);
        expect(handler.mock.calls.filter(([endpoint]) => endpoint.id === "projects.create")).toHaveLength(callsBefore);
        expect(await receiptDb.db!.select().from(projects)).toHaveLength(projectCount);
      }
      expect((await receiptDb.db!.select().from(cliInvocations)).find((row) => row.idempotencyKey === key)).toEqual(before);
    } finally {
      stdout?.mockRestore(); handler.mockRestore();
      await new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections(); });
      for (const [key, value] of priorEnv) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      process.exitCode = priorExitCode;
      await (globalThis as { __creatorosDisposePersistence?: () => Promise<void> }).__creatorosDisposePersistence?.();
      __resetPersistenceForTests();
    }
  }, 120000);

  it("[T-843] CLI 同号重复写返回原结果、异输入冲突，三个号同 key 不串号", async () => {
    const previous = process.env.CREATOROS_CLI_ACCESS_TOKEN;
    process.env.CREATOROS_CLI_ACCESS_TOKEN = "cli-integration-grant";
    try {
      const secondId = await createFixtureAccount("@dispatch-route-fixture-b");
      const thirdId = await createFixtureAccount("@dispatch-route-fixture-c");
      const payload = (title: string) => ({
        params: undefined,
        query: undefined,
        body: { title, brief: "CLI gateway" },
      });

      const first = await cliDispatch("projects.create", payload("账号 A"), ACCOUNT_ID, "parallel-key");
      expect(first.status).toBe(200);
      const firstJson = (await first.json()) as { data: { id: string } };

      const duplicate = await cliDispatch("projects.create", payload("账号 A"), ACCOUNT_ID, "parallel-key");
      expect(duplicate.status).toBe(200);
      expect((await duplicate.json()) as unknown).toMatchObject({ data: { id: firstJson.data.id } });

      const conflict = await cliDispatch("projects.create", payload("不同输入"), ACCOUNT_ID, "parallel-key");
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({
        error: { code: "CLI_IDEMPOTENCY_CONFLICT" },
      });

      const parallel = await Promise.all([
        cliDispatch("projects.create", payload("账号 B"), secondId, "parallel-key"),
        cliDispatch("projects.create", payload("账号 C"), thirdId, "parallel-key"),
      ]);
      expect(parallel.map((response) => response.status)).toEqual([200, 200]);
    } finally {
      if (previous === undefined) delete process.env.CREATOROS_CLI_ACCESS_TOKEN;
      else process.env.CREATOROS_CLI_ACCESS_TOKEN = previous;
    }
  });

  it("[T-843] 高影响确认必须精确命中真实 ID，错目标零写入", async () => {
    const previous = process.env.CREATOROS_CLI_ACCESS_TOKEN;
    process.env.CREATOROS_CLI_ACCESS_TOKEN = "cli-integration-grant";
    try {
      const created = await dispatch("projects.create", {
        params: undefined,
        query: undefined,
        body: { title: "不能误删", brief: "CLI impact gate" },
      });
      const project = (await created.json()) as { data: { id: string } };
      const rejected = await cliDispatch(
        "projects.delete",
        { params: { projectId: project.data.id } },
        ACCOUNT_ID,
        "delete-wrong-target",
        `${project.data.id}-other`,
      );
      expect(rejected.status).toBe(409);
      expect(await rejected.json()).toMatchObject({
        error: { code: "CLI_IMPACT_TARGET_MISMATCH" },
      });
      expect(await listProjectIds()).toContain(project.data.id);
    } finally {
      if (previous === undefined) delete process.env.CREATOROS_CLI_ACCESS_TOKEN;
      else process.env.CREATOROS_CLI_ACCESS_TOKEN = previous;
    }
  });

  it("serves a project read from the persistence store", async () => {
    // [T-050] demo 种子已退役:先经 dispatch 建一条,读侧应看到它(同一 pglite)。
    const created = await dispatch("projects.create", {
      params: undefined,
      query: undefined,
      body: { title: "读侧冒烟项目", brief: "" },
    });
    expect(created.status).toBe(200);
    const ids = await listProjectIds();
    expect(ids.length).toBeGreaterThan(0);
  });

  it("persists a create in SQL so the next read reflects it (the 联调 round-trip)", async () => {
    const before = (await listProjectIds()).length;

    const created = await dispatch("projects.create", {
      params: undefined,
      query: undefined,
      body: { title: "联调测试项目", brief: "" },
    });
    expect(created.status).toBe(200);
    const createdJson = (await created.json()) as { data: { id: string; title: string } };
    expect(createdJson.data.title).toBe("联调测试项目");

    // A fresh dispatch (as a browser island issues after router.refresh()) sees
    // the new row — read back out of pglite, not an in-memory clone.
    const after = await listProjectIds();
    expect(after.length).toBe(before + 1);
    expect(after).toContain(createdJson.data.id);
  });

  it("serves the composed dashboard page DTO (module Q) with 200", async () => {
    // pages.dashboard.get is now persisted (Wave-4 query-services takeover) — it
    // composes public services and returns the dashboardPage envelope (200).
    const res = await dispatch("pages.dashboard.get", {
      params: undefined,
      query: undefined,
      body: undefined,
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 for an unknown operation", async () => {
    const res = await dispatch("does.not.exist", {});
    expect(res.status).toBe(404);
  });

  it("routes a wired op to its persistence-backed module (404 for a cross-/unknown-owner ref)", async () => {
    // Every contract op is now wired into a real, user-scoped module transport — no
    // contract op falls through to the mock's "operation not implemented" (501) path
    // anymore. `accounts.cadence.attainment` (module 22 ContentCalendar, Wave 5–7) is
    // the last formerly-unimplemented op; it now routes to the real transport, whose
    // PlatformAccountService ownership gate rejects an unknown account id with
    // OwnershipError → 404 (SPEC §14: 404 not 403, no existence leak). This proves the
    // op is persistence-backed (not a 501 stub) AND multi-tenant from end to end.
    // [T-332 S2] ctx 带真建号(默认 header),params 指未知号 → 号一致性门(§4.5)同貌
    // OwnershipError 404,断言语义不变。
    const res = await dispatch("accounts.cadence.attainment", {
      params: { accountId: "acct-does-not-exist" },
      query: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-31T00:00:00.000Z" },
      body: undefined,
    });
    expect(res.status).toBe(404);
  });

  // [T-046 单机免登录] 无/坏 cookie 不再 401 —— 以本机主用户直通,persisted op 照常执行。
  it("serves a persisted op WITHOUT a session cookie(T-046 直通本机主用户)", async () => {
    const res = await dispatch(
      "projects.list",
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined },
      "", // no cookie
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown };
    expect(json.data).toBeDefined();
  });

  it("serves a persisted op WITH an invalid session cookie(失效 token 同直通)", async () => {
    const res = await dispatch(
      "projects.list",
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined },
      "creatoros_session=garbage",
    );
    expect(res.status).toBe(200);
  });

  // ── [T-332 S3] 账号咽喉:无效 x-account-id 拒绝不降级(关 GAP-02)+ 错误码 round-trip ──

  it("[S3] 伪造/不存在的 x-account-id → 404 拒绝(OwnershipError 同貌),不再降级全量", async () => {
    const res = await dispatch(
      "projects.list",
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined },
      "",
      "acct-forged-does-not-exist",
    );
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("OwnershipError");
  });

  it("[T-520] 收藏 query 与当前账号不一致时返回结构化 OwnershipError，不启动浏览器", async () => {
    const res = await dispatch("intelligence.sources.listFavoriteFolders", {
      params: undefined,
      query: {
        accountId: "different-account",
        browserSessionRef: `douyin-profile:${ACCOUNT_ID}`,
      },
      body: undefined,
    });
    expect(res.status).toBe(404);
    const json = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(json.error.code).toBe("OwnershipError");
    expect(json.error.message).toContain("收藏");
  });

  it("[T-520] 收藏 CDP 错误经过 dispatch 仍保留 code/details", async () => {
    const response = dispatchErrorResponse(
      Object.assign(new Error("抖音收藏接口拒绝请求"), {
        code: "DOUYIN_FAVORITES_UPSTREAM",
        details: { upstreamStatusCode: 2190008 },
      }),
    );
    expect(response.status).toBe(502);
    const json = (await response.json()) as {
      error: { code: string; details: { upstreamStatusCode: number } };
    };
    expect(json.error.code).toBe("DOUYIN_FAVORITES_UPSTREAM");
    expect(json.error.details.upstreamStatusCode).toBe(2190008);
  });

  it("[T-724] 发布归属冲突经过 dispatch 保留 409 与 canonical 项目安全引用", async () => {
    const response = dispatchErrorResponse(
      new PublishingConflictError(
        "ConflictError: external work is already owned by another project",
        {
          reason: "external_work_owned_by_another_project",
          canonicalProjectId: "project-canonical",
          canonicalProjectTitle: "原项目",
        },
      ),
    );
    expect(response.status).toBe(409);
    const json = (await response.json()) as {
      error: {
        code: string;
        details: {
          reason: string;
          canonicalProjectId: string;
          canonicalProjectTitle: string;
        };
      };
    };
    expect(json.error).toMatchObject({
      code: "ConflictError",
      details: {
        reason: "external_work_owned_by_another_project",
        canonicalProjectId: "project-canonical",
        canonicalProjectTitle: "原项目",
      },
    });
  });

  it("[T-546] dispatch 失败日志只保留操作与错误类型，不泄漏异常正文/details", () => {
    const diagnostic = safeDispatchErrorDiagnostic(
      "intelligence.runs.start",
      Object.assign(new Error("cookie=secret&url=https://private.example/x"), {
        code: "OwnershipError",
        details: { authorization: "Bearer secret" },
      }),
    );
    expect(diagnostic).toEqual({
      operation: "intelligence.runs.start",
      errorName: "Error",
      errorCode: "OwnershipError",
    });
    expect(JSON.stringify(diagnostic)).not.toContain("secret");
    expect(JSON.stringify(diagnostic)).not.toContain("private.example");
  });

  it("[S3] 已归档号当当前号 → 404 拒绝 + details.reason=account_archived(属主已验实,可诚实)", async () => {
    // 建第二个号再归档它(末号保护:必须还剩 ≥1 个 active 才准归档)。
    const second = await dispatch(
      "accounts.create",
      {
        params: undefined,
        query: undefined,
        body: { platform: "douyin", accountHandle: "@to-be-archived" },
      },
      "",
      "",
    );
    const secondId = ((await second.json()) as { data: { id: string } }).data.id;
    const archived = await dispatch(
      "accounts.archive",
      { params: { accountId: secondId }, query: undefined, body: undefined },
      "",
      "", // 归档操作本身是 user 域 op,不需要当前号
    );
    expect(archived.status).toBe(200);

    const res = await dispatch(
      "projects.list",
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined },
      "",
      secondId,
    );
    expect(res.status).toBe(404);
    const json = (await res.json()) as {
      error: { code: string; details: { reason?: string } };
    };
    expect(json.error.code).toBe("OwnershipError");
    expect(json.error.details.reason).toBe("account_archived");
  });

  it("[S3] 未选号打 per-account op → 428 AccountRequiredError(backend 抛 → dispatch 按 code 映射 → client 可判)", async () => {
    // 完整 round-trip:S2 的 requireAccountId 抛 AccountRequiredError → S3 contract 枚举
    // 收编 + ERROR_HTTP 映射 → 428 结构化 envelope(此前未知 code 走 500 兜底,S2 交接残留)。
    const res = await dispatch(
      "projects.list",
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined },
      "",
      "", // 显式不带 x-account-id = 未选号
    );
    expect(res.status).toBe(428);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("AccountRequiredError");
  });

  it("serves a persisted op WITH a valid session cookie (ctx threaded → 200)", async () => {
    // [T-050] 先建一条(种子已退役),再验证带 session 的 list 能读回 ctx 归属行。
    await dispatch("projects.create", {
      params: undefined,
      query: undefined,
      body: { title: "ctx 穿线项目", brief: "" },
    });
    const res = await dispatch("projects.list", {
      params: undefined,
      query: { page: 1, pageSize: 50 },
      body: undefined,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Array<{ id: string }> };
    expect(json.data.length).toBeGreaterThan(0);
  });
});


it("账号组授权事务冲突透传409，其他数据库错误不冒充授权冲突", async () => {
 const conflict=Object.assign(new Error("GROUP_RESOURCE_SCOPE_CONFLICT: 原组授权已撤销，请重新选择素材"),{code:"40001"});
 const wrapped=new Error("数据库执行失败",{cause:new Error("查询失败",{cause:conflict})});
 const response=dispatchErrorResponse(wrapped);
 expect(response.status).toBe(409);
 expect((await response.json()).error).toMatchObject({code:"ConflictError",message:"原组授权已撤销，请重新选择素材"});
 const other=dispatchErrorResponse(Object.assign(new Error("真实数据库故障"),{code:"40001"}));
 expect(other.status).not.toBe(409);
});
