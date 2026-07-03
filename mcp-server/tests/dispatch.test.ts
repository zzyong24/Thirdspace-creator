// DispatchClient 单测(mock fetch):登录拿 cookie、dispatch 带 cookie、401 自动重登
// 重试、免登录裸调、错误信息抽取、Set-Cookie 解析。
import { describe, expect, it, vi } from "vitest";
import {
  DispatchClient,
  DispatchError,
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
  it("无凭据:不 login,直接裸调 dispatch(无 cookie 头)", async () => {
    const fetchImpl = vi.fn(async (_url: any, _init?: any) =>
      jsonResponse({ data: [], meta: { requestId: "r3" } }),
    );
    const client = new DispatchClient({
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
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const err = (await client.dispatch("nope").catch((e) => e)) as DispatchError;
    expect(err).toBeInstanceOf(DispatchError);
    expect(err.status).toBe(404);
    expect(err.message).toContain("unknown operation: nope");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
