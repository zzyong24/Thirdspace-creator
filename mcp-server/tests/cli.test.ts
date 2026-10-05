import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENDPOINTS } from "@creatoros/contract";

import { runCliCommand, serveMcpStdio } from "../src/cli";
import { EventEmitter } from "node:events";

describe("T-843 creatoros CLI", () => {
  const originalBaseUrl = process.env.CREATOROS_BASE_URL;
  const originalToken = process.env.CREATOROS_CLI_ACCESS_TOKEN;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.CREATOROS_BASE_URL = "http://127.0.0.1:43127";
    process.env.CREATOROS_CLI_ACCESS_TOKEN = "cli-test-grant";
  });

  afterEach(() => {
    if (originalBaseUrl === undefined) delete process.env.CREATOROS_BASE_URL;
    else process.env.CREATOROS_BASE_URL = originalBaseUrl;
    if (originalToken === undefined) delete process.env.CREATOROS_CLI_ACCESS_TOKEN;
    else process.env.CREATOROS_CLI_ACCESS_TOKEN = originalToken;
    globalThis.fetch = originalFetch;
  });

  it("稳定列出当前全部 contract operations 并展示 contract policy", async () => {
    const result = await runCliCommand(["operations", "list", "--json"]) as {
      count: number;
      operations: Array<{ operation: string; effect: string }>;
    };
    expect(result.count).toBe(Object.keys(ENDPOINTS).length);
    expect(result.operations.map((item) => item.operation)).toEqual(
      [...result.operations.map((item) => item.operation)].sort(),
    );
    expect(result.operations.find((item) => item.operation === "projects.delete")?.effect).toBe("destructive");
    expect(result.operations.find((item) => item.operation === "ingestion.douyin.refresh")?.effect).toBe("external");
  });

  it("写、破坏性和外部调用在发请求前校验执行语义", async () => {
    await expect(runCliCommand(["call", "projects.create", "--input", "{}"])).rejects.toThrow("--apply");
    await expect(runCliCommand([
      "call", "projects.delete", "--input", "{}", "--apply", "--idempotency-key", "idem-1",
    ])).rejects.toThrow("--confirm-impact");
  });

  it("帮助、版本可离线读取，未知参数明确失败", async () => {
    await expect(runCliCommand(["status", "--acount", "acct-a"])).rejects.toThrow("未知参数");
    await expect(runCliCommand(["call", "projects.list", "--account"])).rejects.toThrow("缺少值");
    expect(await runCliCommand(["--help"])).toMatchObject({ ok: true, writeFlags: expect.any(String) });
    expect(await runCliCommand(["--version"])).toEqual({
      ok: true,
      cliVersion: "0.1.0",
      contractVersion: "0.4.0",
    });
  });

  it("operations describe 与 MCP/服务端共享 artifact 枚举和关联字段", async () => {
    const described = (await runCliCommand([
      "operations",
      "describe",
      "artifacts.create",
      "--json",
    ])) as any;
    const body = described.inputSchema.properties.body;
    expect(body.properties.artifactType.enum).toContain("output_script");
    // 历史正式数据曾写入 cover_copy；CLI/页面读侧必须继续能解析，
    // 否则 artifacts.list 会因一条旧产物让整个项目脚本区降级为空。
    expect(body.properties.artifactType.enum).toContain("cover_copy");
    expect(body.properties.stage.enum).toContain("script");
    expect(body.properties.contentOutputId).toBeDefined();
  });

  it("内容雷达的博主、作品、完整逐字稿和补跑 operation 都可由 CLI 动态发现", async () => {
    const listed = await runCliCommand(["operations", "list", "--json"]) as {
      operations: Array<{
        operation: string;
        effect: string;
        asyncTask: boolean;
      }>;
    };
    const byId = new Map(listed.operations.map((item) => [item.operation, item]));

    expect([
      "intelligence.sources.previewProfile",
      "intelligence.sources.create",
      "intelligence.sources.list",
      "intelligence.runs.start",
      "intelligence.runs.list",
      "intelligence.runs.get",
      "intelligence.items.list",
      "intelligence.items.get",
      "intelligence.transcripts.enqueue",
    ].every((operation) => byId.has(operation))).toBe(true);
    expect(byId.get("intelligence.items.list")).toMatchObject({ effect: "read", asyncTask: false });
    expect(byId.get("intelligence.items.get")).toMatchObject({ effect: "read", asyncTask: false });
    expect(byId.get("intelligence.transcripts.enqueue")).toMatchObject({ effect: "external", asyncTask: true });
  });

  it("自动调用不静默套用默认账号，显式 --account 才发送账号头", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(
      JSON.stringify({ data: { id: "project-1" }, meta: { requestId: "request-1" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const common = [
      "call", "projects.create", "--input", JSON.stringify({ body: { title: "CLI" } }),
      "--apply", "--idempotency-key", "idem-create",
    ];
    await runCliCommand(common);
    const firstHeaders = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(firstHeaders["x-account-id"]).toBeUndefined();

    await runCliCommand([...common, "--account", "acct-a"]);
    const secondHeaders = (fetchMock.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>;
    expect(secondHeaders["x-account-id"]).toBe("acct-a");
  });

  it("列表调用保留 contract 分页元数据，让自动化能够证明已经取全", async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({
        data: [{ item: { id: "item-1", title: "一条真实标题" } }],
        meta: { requestId: "request-items", page: 1, pageSize: 1, total: 3 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as unknown as typeof fetch;

    const result = await runCliCommand([
      "call", "intelligence.items.list",
      "--input", JSON.stringify({
        query: { accountId: "acct-a", sort: "published_desc", page: 1, pageSize: 1 },
      }),
      "--account", "acct-a",
    ]);

    expect(result).toMatchObject({
      ok: true,
      operation: "intelligence.items.list",
      requestId: "request-items",
      accountId: "acct-a",
      data: [{ item: { id: "item-1", title: "一条真实标题" } }],
      meta: { requestId: "request-items", page: 1, pageSize: 1, total: 3 },
    });
  });

  it("tasks get 复用现有 task operations，不创建第二套状态 API", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const id = JSON.parse(String(init?.body)).id as string;
      if (id === "ai.tasks.get") {
        return new Response(JSON.stringify({ error: { message: "not found" } }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ data: { id: "task-1", status: "running" }, meta: { requestId: "request-task" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await runCliCommand(["tasks", "get", "task-1", "--account", "acct-a", "--json"]) as {
      sourceOperation: string;
      accountId: string;
    };
    expect(result).toMatchObject({
      sourceOperation: "execution.tasks.get",
      accountId: "acct-a",
    });
  });

  it("douyin refresh 复用当前账号唯一的 self.detail 作业并显式带号", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { id: string };
      const body = request.id === "scheduledJobs.list"
        ? { data: [{ id: "job-self-detail", sourceKind: "self.detail" }], meta: { requestId: "list" } }
        : { data: { jobRunId: "run-1", aiTaskId: "task-1", deduped: false }, meta: { requestId: "run" } };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await runCliCommand([
      "douyin", "refresh", "--account", "acct-a", "--apply",
      "--idempotency-key", "refresh-a", "--confirm-impact", "acct-a",
    ]);
    expect(result).toMatchObject({
      operation: "scheduledJobs.runNow",
      accountId: "acct-a",
      data: { jobRunId: "run-1" },
    });
    const secondRequest = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(secondRequest).toMatchObject({
      id: "scheduledJobs.runNow",
      input: { params: { jobId: "job-self-detail" } },
    });
  });

  it("douyin login 与分享导入都复用正式 operation 并保留显式账号", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { id: string };
      const data = request.id === "ingestion.douyin.login"
        ? { taskId: "login-task", status: "queued" }
        : { taskId: "import-task", itemId: "item-1" };
      return new Response(
        JSON.stringify({ data, meta: { requestId: `request-${request.id}` } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await runCliCommand([
      "douyin", "login", "--account", "acct-a", "--force-new", "--apply",
      "--idempotency-key", "login-a", "--confirm-impact", "acct-a",
    ]);
    const imported = await runCliCommand([
      "douyin", "import", "--account", "acct-a", "--share", "https://v.douyin.com/example/",
      "--collection", "collection-1", "--apply", "--idempotency-key", "import-a",
      "--confirm-impact", "acct-a",
    ]);
    expect(imported).toMatchObject({
      operation: "intelligence.items.importDouyinShare",
      accountId: "acct-a",
      data: { taskId: "import-task", itemId: "item-1" },
    });
    const requests = fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(requests[0]).toMatchObject({
      id: "ingestion.douyin.login",
      input: { body: { accountId: "acct-a", forceNew: true } },
    });
    expect(requests[1]).toMatchObject({
      id: "intelligence.items.importDouyinShare",
      input: { body: { accountId: "acct-a", collectionId: "collection-1" } },
    });
  });

  it("三账号并发调用各自发送 accountId 与幂等键，不依赖共享默认号", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      return new Response(
        JSON.stringify({
          data: { accountId: headers["x-account-id"] },
          meta: { requestId: `request-${headers["x-account-id"]}` },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const accounts = ["acct-a", "acct-b", "acct-c"];
    const results = await Promise.all(accounts.map((accountId) => runCliCommand([
      "call", "projects.create",
      "--input", JSON.stringify({ body: { title: accountId } }),
      "--account", accountId,
      "--apply",
      "--idempotency-key", `create-${accountId}`,
    ])));
    expect(results).toHaveLength(3);
    expect(fetchMock.mock.calls.map((call) => {
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      return [headers["x-account-id"], headers["x-idempotency-key"]];
    })).toEqual([
      ["acct-a", "create-acct-a"],
      ["acct-b", "create-acct-b"],
      ["acct-c", "create-acct-c"],
    ]);
  });
});


describe("T-1060 MCP stdio lifecycle", () => {
  it.each(["end", "SIGINT", "SIGTERM"])("%s closes only the local MCP server exactly once", async (event) => {
    const input = new EventEmitter();
    const signals = new EventEmitter();
    const server = { connect: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
    const transport = {};
    const waiting = serveMcpStdio(server, transport, input, signals);
    await Promise.resolve();
    (event === "end" ? input : signals).emit(event);
    input.emit("end");
    signals.emit("SIGINT");
    signals.emit("SIGTERM");
    await waiting;
    expect(server.connect).toHaveBeenCalledWith(transport);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(input.listenerCount("end")).toBe(0);
    expect(signals.listenerCount("SIGINT")).toBe(0);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
  });

  it("connect failure releases owned listeners and local server without pretending ready", async () => {
    const input = new EventEmitter();
    const signals = new EventEmitter();
    const server = { connect: vi.fn().mockRejectedValue(new Error("connect rejected")), close: vi.fn().mockResolvedValue(undefined) };
    await expect(serveMcpStdio(server, {}, input, signals)).rejects.toThrow("connect rejected");
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(input.listenerCount("end")).toBe(0);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
  });

  it("close failure is reported and does not leave listeners or repeat close", async () => {
    const input = new EventEmitter();
    const signals = new EventEmitter();
    const server = { connect: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockRejectedValue(new Error("close rejected")) };
    const waiting = serveMcpStdio(server, {}, input, signals);
    const result = expect(waiting).rejects.toThrow("close rejected");
    await Promise.resolve();
    input.emit("end");
    await result;
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(signals.listenerCount("SIGINT")).toBe(0);
  });
});


it("T-1060 stdio EOF releases a transport that is still connecting", async () => {
  const input = new EventEmitter();
  const signals = new EventEmitter();
  const server = { connect: vi.fn(() => new Promise<void>(() => {})), close: vi.fn().mockResolvedValue(undefined) };
  const waiting = serveMcpStdio(server, {}, input, signals);
  input.emit("end");
  await waiting;
  expect(server.close).toHaveBeenCalledTimes(1);
  expect(signals.listenerCount("SIGTERM")).toBe(0);
});
