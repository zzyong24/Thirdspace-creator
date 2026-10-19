// DispatchClient 单测(mock fetch):登录拿 cookie、dispatch 带 cookie、401 自动重登
// 重试、免登录裸调、错误信息抽取、Set-Cookie 解析。
import { describe, expect, it, vi } from "vitest";
import { Agent } from "undici";
import {
  DispatchClient,
  DispatchError,
  DispatchObservationError,
  dispatchObservationMs,
  parseSessionCookie,
} from "../src/dispatch";

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

const LOGIN_COOKIE =
  "creatoros_session=tok-abc123; HttpOnly; SameSite=Lax; Path=/; Expires=Fri, 01 Jan 2027 00:00:00 GMT";

describe("parseSessionCookie", () => {
  it("从 Set-Cookie 抽出 session 值", () => {
    expect(parseSessionCookie(LOGIN_COOKIE)).toBe("tok-abc123");
  });
  it("URL 编码的值解码", () => {
    expect(parseSessionCookie("creatoros_session=a%2Bb; Path=/")).toBe("a+b");
  });
  it("无该 cookie / 空值 → null", () => {
    expect(parseSessionCookie(null)).toBeNull();
    expect(parseSessionCookie("other=1; Path=/")).toBeNull();
    expect(parseSessionCookie("creatoros_session=; Max-Age=0")).toBeNull();
  });
});

describe("DispatchClient(登录模式)", () => {
  it("首次 dispatch 先 login 拿 cookie,后续请求带 cookie", async () => {
    const fetchImpl = vi.fn(async (url: any, init?: any) => {
      if (String(url).endsWith("/api/v1/auth/login")) {
        return jsonResponse(
          { data: { id: "u1" } },
          { headers: { "set-cookie": LOGIN_COOKIE } },
        );
      }
      return jsonResponse({ data: [], meta: { requestId: "r1" } });
    });
    const client = new DispatchClient({
      baseUrl: "http://localhost:3000",
      email: "a@b.c",
      password: "pw",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const envelope = await client.dispatch("projects.list", { query: {} });
    expect(envelope).toEqual({ data: [], meta: { requestId: "r1" } });

    // 第 1 发是 login,第 2 发是 dispatch 且带 cookie。
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [loginUrl, loginInit] = fetchImpl.mock.calls[0]!;
    expect(String(loginUrl)).toBe("http://localhost:3000/api/v1/auth/login");
    expect(JSON.parse(loginInit.body)).toEqual({ email: "a@b.c", password: "pw" });
    const [dispatchUrl, dispatchInit] = fetchImpl.mock.calls[1]!;
    expect(String(dispatchUrl)).toBe("http://localhost:3000/api/v1/dispatch");
    expect(dispatchInit.headers.cookie).toBe("creatoros_session=tok-abc123");
    expect(JSON.parse(dispatchInit.body)).toEqual({
      id: "projects.list",
      input: { query: {} },
    });
  });

  it("dispatch 401 → 自动重登一次并重试成功", async () => {
    let dispatchCount = 0;
    const fetchImpl = vi.fn(async (url: any) => {
      if (String(url).endsWith("/auth/login")) {
        return jsonResponse(
          { data: { id: "u1" } },
          { headers: { "set-cookie": LOGIN_COOKIE } },
        );
      }
      dispatchCount += 1;
      if (dispatchCount === 1) {
        return jsonResponse(
          { error: { code: "AUTHENTICATION_ERROR", message: "expired" } },
          { status: 401 },
        );
      }
      return jsonResponse({ data: { ok: true }, meta: { requestId: "r2" } });
    });
    const client = new DispatchClient({
      baseUrl: "http://localhost:3000",
      email: "a@b.c",
      password: "pw",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const envelope = await client.dispatch("pages.dashboard.get");
    expect(envelope).toEqual({ data: { ok: true }, meta: { requestId: "r2" } });
    // login ×2(懒登录 + 401 重登)+ dispatch ×2。
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("登录失败 → 抛 DispatchError 带服务端 message", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { error: { code: "AUTHENTICATION_ERROR", message: "Invalid credentials" } },
        { status: 401 },
      ),
    );
    const client = new DispatchClient({
      baseUrl: "http://localhost:3000",
      email: "a@b.c",
      password: "wrong",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.dispatch("projects.list")).rejects.toThrow(
      /auth\.login.*Invalid credentials/,
    );
  });
});

describe("DispatchClient(T-046 免登录模式)", () => {
  it.each(["failed", "outcome_unknown"])("T1062 非2xx保留%s公开回执与原编号，只解析一次且不重试", async (status) => {
    const receipt = { duplicate: true, requestId: "original-invocation", status, taskId: "original-task", targetRefs: ["original-output"], resultExpired: false, outcomeUnknown: status === "outcome_unknown", manualReconcileRequired: status === "outcome_unknown" };
    const response = jsonResponse({ data: null, receipt: { ...receipt, errorCode: "private-audit-code", secret: "not-public" }, meta: { requestId: receipt.requestId, privateToken: "not-public" } }, { status: 409 });
    const json = vi.spyOn(response, "json");
    const fetchImpl = vi.fn(async () => response);
    const client = new DispatchClient({ baseUrl: "http://127.0.0.1:43127", fetchImpl: fetchImpl as typeof fetch });
    const error = await client.dispatch("projects.create").catch((value: unknown) => value);
    expect(error).toBeInstanceOf(DispatchError);
    expect(error).toMatchObject({ status: 409, requestId: receipt.requestId, receipt });
    expect(error).not.toHaveProperty("receipt.errorCode");
    expect(error).not.toHaveProperty("receipt.secret");
    expect(error).not.toHaveProperty("meta.privateToken");
    expect(json).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: "running", http: 202, expired: false },
    { status: "succeeded", http: 200, expired: true },
  ])("T1062 $status回执保留原公开成功HTTP语义，不重发业务", async ({ status, http, expired }) => {
    const receipt = { duplicate: true, requestId: "original-invocation", status, taskId: "original-task", targetRefs: ["original-output"], resultExpired: expired, outcomeUnknown: false, manualReconcileRequired: false };
    const body = { data: null, receipt, meta: { requestId: receipt.requestId } };
    const fetchImpl = vi.fn(async () => jsonResponse(body, { status: http }));
    const client = new DispatchClient({ baseUrl: "http://127.0.0.1:43127", fetchImpl: fetchImpl as typeof fetch });
    expect(await client.dispatch("projects.create")).toEqual(body);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("T1062 非JSON与畸形receipt保持普通失败，不透传任意正文", async () => {
    for (const response of [
      new Response("unstructured server failure", { status: 503 }),
      jsonResponse({ error: { message: "original failure" }, receipt: { duplicate: true, requestId: "bad", status: "failed", secret: "not-public" }, meta: { requestId: "not-a-proven-receipt" } }, { status: 409 }),
    ]) {
      const fetchImpl = vi.fn(async () => response);
      const client = new DispatchClient({ baseUrl: "http://127.0.0.1:43127", fetchImpl: fetchImpl as typeof fetch });
      const error = await client.dispatch("projects.create").catch((value: unknown) => value);
      expect(error).toBeInstanceOf(DispatchError);
      expect(error).not.toHaveProperty("receipt");
      expect(error).not.toHaveProperty("requestId");
      expect(error).not.toHaveProperty("secret");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("无凭据:不 login,直接裸调 dispatch(无 cookie 头)", async () => {
    const fetchImpl = vi.fn(async (_url: any, _init?: any) =>
      jsonResponse({ data: [], meta: { requestId: "r3" } }),
    );
    const client = new DispatchClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(client.hasCredentials).toBe(false);

    await client.dispatch("projects.list");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init as any).headers.cookie).toBeUndefined();
  });

  it("无凭据遇 4xx:不重试,抛 DispatchError(结构化与纯串错误都能抽 message)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "unknown operation: nope" }, { status: 404 }),
    );
    const client = new DispatchClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const err = (await client.dispatch("nope").catch((e) => e)) as DispatchError;
    expect(err).toBeInstanceOf(DispatchError);
    expect(err.status).toBe(404);
    expect(err.message).toContain("unknown operation: nope");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("安装版调用携带 handshake、CLI grant、显式账号与执行语义头", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      jsonResponse({ data: { id: "p1" }, meta: { requestId: "r4" } }),
    );
    const client = new DispatchClient({
      baseUrl: "http://127.0.0.1:43127",
      handshakeToken: "hs-secret",
      cliAccessToken: "cli-secret",
      clientId: "cli-test-client",
      productId: "creatoros",
      packageId: "cloud.aitongban.creatoros",
      launchNonce: "launch-nonce",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.dispatch(
      "projects.update",
      { params: { projectId: "p1" }, body: { title: "新标题" } },
      {
        accountId: "acct-a",
        idempotencyKey: "idem-a",
        apply: true,
        confirmImpact: "project:p1",
      },
    );

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init?.headers).toMatchObject({
      "x-creatoros-handshake": "hs-secret",
      "x-creatoros-cli-access": "cli-secret",
      "x-creatoros-cli-client-id": "cli-test-client",
      "x-creatoros-cli-product-id": "creatoros",
      "x-creatoros-cli-package-id": "cloud.aitongban.creatoros",
      "x-creatoros-cli-launch-nonce": "launch-nonce",
      "x-account-id": "acct-a",
      "x-idempotency-key": "idem-a",
      "x-creatoros-cli-apply": "1",
      "x-creatoros-cli-confirm-impact": "project:p1",
    });
  });
});

describe("T1252 私有HTTP完整观察与原回执", () => {
  it("完整默认串行不漏原401路径，非法/不足预算网络前拒绝", async () => {
    expect(dispatchObservationMs(false)).toBe(8_280_000);
    expect(dispatchObservationMs(true)).toBe(17_940_000);
    const fetchImpl = vi.fn(async () => jsonResponse({ data: "real" }));
    const client = new DispatchClient({ baseUrl: "http://localhost", fetchImpl: fetchImpl as typeof fetch });
    for (const observationMs of [0, NaN, Infinity, -1, 120_000, 2_147_483_648])
      await expect(client.dispatch("projects.list", {}, {}, { observationMs })).rejects.toThrow("BUDGET_INVALID");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("每个dispatch独立Agent及有限signal，全headers和原scope/key保持", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) => jsonResponse({ data: "real" }));
    const client = new DispatchClient({ baseUrl: "http://localhost", fetchImpl: fetchImpl as typeof fetch,
      handshakeToken: "h", cliAccessToken: "a", clientId: "client", productId: "p", packageId: "pkg", launchNonce: "launch" });
    const opts = { groupId: "group", accountId: "account", idempotencyKey: "key", apply: true, confirmImpact: "impact" };
    await client.dispatch("projects.create", { body: { name: "original" } }, opts);
    await client.dispatch("projects.create", { body: { name: "original" } }, opts);
    const first = fetchImpl.mock.calls[0]![1] as RequestInit & { dispatcher: Agent };
    const second = fetchImpl.mock.calls[1]![1] as RequestInit & { dispatcher: Agent };
    expect(first.dispatcher).toBeInstanceOf(Agent); expect(first.dispatcher).not.toBe(second.dispatcher);
    expect(first.signal).toBeInstanceOf(AbortSignal);
    expect(first.headers).toMatchObject({ "x-group-id": "group", "x-account-id": "account", "x-idempotency-key": "key",
      "x-creatoros-cli-apply": "1", "x-creatoros-cli-confirm-impact": "impact", "x-creatoros-handshake": "h",
      "x-creatoros-cli-access": "a", "x-creatoros-cli-client-id": "client", "x-creatoros-cli-product-id": "p",
      "x-creatoros-cli-package-id": "pkg", "x-creatoros-cli-launch-nonce": "launch" });
  });

  it("网络前取消0请求，已发取消保本地未知并且不走login/retry", async () => {
    const stopped = new AbortController(); stopped.abort();
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => await new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(Error("aborted")), { once: true });
    }));
    const client = new DispatchClient({ baseUrl: "http://localhost", fetchImpl: fetchImpl as typeof fetch });
    await expect(client.dispatch("projects.create", {}, { idempotencyKey: "same-key" }, { signal: stopped.signal })).rejects.toBeTruthy();
    expect(fetchImpl).toHaveBeenCalledTimes(0);
    const active = new AbortController();
    const pending = client.dispatch("projects.create", {}, { idempotencyKey: "same-key" }, { signal: active.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: "DispatchObservationError", phase: "request_sent", outcomeUnknown: true });
    active.abort(); await rejected; expect(await pending.catch(error => error)).toBeInstanceOf(DispatchObservationError); expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("已headers未EOF仍等待原body；取消不把partial JSON当成功", async () => {
    let body!: ReadableStreamDefaultController<Uint8Array>;
    const active = new AbortController();
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({ start(controller) { body = controller; controller.enqueue(new TextEncoder().encode('{"data":')); } });
      init!.signal!.addEventListener("abort", () => body.error(Error("owned read cancelled")), { once: true });
      return new Response(stream, { status: 200 });
    });
    const client = new DispatchClient({ baseUrl: "http://localhost", fetchImpl: fetchImpl as typeof fetch });
    const pending = client.dispatch("projects.list", {}, {}, { signal: active.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: "DispatchObservationError", phase: "body_read", outcomeUnknown: true });
    await Promise.resolve(); await Promise.resolve(); active.abort(); await rejected;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("login成功raw/empty body及401都先EOF，原cookie合同不新增JSON质量门", async () => {
    const bodies: string[] = [], stages: string[] = [];
    const fetchImpl = vi.fn(async (url: unknown) => {
      const index = fetchImpl.mock.calls.length;
      const text = index === 1 ? "raw legal login" : index === 2 ? '{"error":"unauthorized"}' : index === 3 ? "" : '{"data":"original"}';
      const res = new Response(text, { status: index === 2 ? 401 : 200, headers: { "set-cookie": LOGIN_COOKIE } });
      const read = res.text.bind(res);
      res.text = async () => { stages.push(String(url).endsWith("auth/login") ? "login-eof" : "post-eof"); const out = await read(); bodies.push(out); return out; };
      return res;
    });
    const client = new DispatchClient({ baseUrl: "http://localhost", email: "user", password: "password", fetchImpl: fetchImpl as typeof fetch });
    expect(await client.dispatch("projects.list")).toEqual({ data: "original" });
    expect(fetchImpl).toHaveBeenCalledTimes(4); expect(stages).toEqual(["login-eof", "post-eof", "login-eof", "post-eof"]);
    expect(bodies).toEqual(["raw legal login", '{"error":"unauthorized"}', "", '{"data":"original"}']);
  });

  it.each(["success", "error"] as const)("%s完整JSON不被cleanup同步异常/诊断异常覆写", async kind => {
    const receipt = { duplicate: true, requestId: "original-request", status: "outcome_unknown", taskId: "task",
      targetRefs: [], resultExpired: false, outcomeUnknown: true, manualReconcileRequired: true };
    const fetchImpl = vi.fn(async () => jsonResponse(kind === "success" ? { data: "delivered" } : { error: "original-error", receipt }, { status: kind === "success" ? 200 : 409 }));
    const close = vi.spyOn(Agent.prototype, "close").mockRejectedValueOnce(Error("private close failure"));
    const destroy = vi.spyOn(Agent.prototype, "destroy").mockImplementationOnce(() => { throw Error("private destroy failure"); });
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => { throw Error("private logger failure"); });
    try {
      const client = new DispatchClient({ baseUrl: "http://localhost", fetchImpl: fetchImpl as typeof fetch });
      if (kind === "success") expect(await client.dispatch("projects.create", {}, { idempotencyKey: "key" })).toEqual({ data: "delivered" });
      else await expect(client.dispatch("projects.create", {}, { idempotencyKey: "key" })).rejects.toMatchObject({ name: "DispatchError", status: 409, requestId: "original-request", receipt });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(diagnostic).toHaveBeenCalledWith("CREATOROS_HTTP_CLEANUP_UNCONFIRMED", { opId: "projects.create", phase: "cleanup", code: "OWN_AGENT_CLOSE_UNCONFIRMED" });
    } finally { close.mockRestore(); destroy.mockRestore(); diagnostic.mockRestore(); }
  });
});

it("T1252 partial-body字节不续一次绝对HTTP观察", async () => {
  vi.useFakeTimers();
  let body!: ReadableStreamDefaultController<Uint8Array>;
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { body = controller; controller.enqueue(new TextEncoder().encode('{"data":"')); } });
    init!.signal!.addEventListener("abort", () => body.error(Error("original deadline exhausted")), { once: true });
    return new Response(stream, { status: 200 });
  });
  try {
    const client = new DispatchClient({ baseUrl: "http://localhost", fetchImpl: fetchImpl as typeof fetch });
    const pending = client.dispatch("projects.list");
    const rejected = expect(pending).rejects.toMatchObject({ name: "DispatchObservationError", phase: "body_read", outcomeUnknown: true });
    await Promise.resolve(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(4_000_000); body.enqueue(new TextEncoder().encode("partial"));
    await vi.advanceTimersByTimeAsync(4_100_001); await rejected;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});

it("T1252取消一个并发dispatch不销毁另一私有Agent或消费其body", async () => {
  const first = new AbortController();
  const seen: Array<RequestInit & { dispatcher: Agent }> = [];
  let release!: () => void;
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    seen.push(init as RequestInit & { dispatcher: Agent });
    if (seen.length === 1) return await new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(Error("cancelled first")), { once: true }));
    return await new Promise<Response>(resolve => { release = () => resolve(jsonResponse({ data: "second-original" })); });
  });
  const client = new DispatchClient({ baseUrl: "http://localhost", fetchImpl: fetchImpl as typeof fetch });
  const a = client.dispatch("projects.list", {}, {}, { signal: first.signal });
  const rejected = expect(a).rejects.toMatchObject({ outcomeUnknown: true });
  const b = client.dispatch("projects.list");
  first.abort(); await rejected;
  expect(seen[0]!.dispatcher).not.toBe(seen[1]!.dispatcher);
  expect(seen[1]!.signal!.aborted).toBe(false);
  release(); expect(await b).toEqual({ data: "second-original" }); expect(fetchImpl).toHaveBeenCalledTimes(2);
});
