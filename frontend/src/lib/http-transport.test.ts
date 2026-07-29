import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createHttpTransport,
  CURRENT_ACCOUNT_KEY,
  CURRENT_ACCOUNT_COOKIE,
  HttpTransportError,
  isAccountRequiredError,
  fetchCreatorApi,
} from "./http-transport";
import type { Endpoint } from "@creatoros/contract";

const endpoint = { id: "projects.list", isList: true } as unknown as Endpoint;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// 提取本次 fetch 调用的 headers(归一为 Record,兼容 plain object headers)。
function headersOf(fetchMock: ReturnType<typeof vi.fn>): Record<string, string> {
  const init = fetchMock.mock.calls[0]![1] as RequestInit;
  return (init.headers ?? {}) as Record<string, string>;
}

function stubLocalStorage(store: Record<string, string>) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k]! : null),
    },
  });
}

describe("createHttpTransport", () => {
  it("POSTs { id, input } to the dispatch route and returns the envelope", async () => {
    const envelope = { data: [{ id: "p1" }], meta: { requestId: "x" } };
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(envelope), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const transport = createHttpTransport("/api/v1");
    const input = { params: undefined, query: { page: 1, pageSize: 20 }, body: undefined };
    const result = await transport.request(endpoint, input as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/dispatch");
    expect(init!.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toEqual({ id: "projects.list", input });
    expect(result).toEqual(envelope);
  });

  it("throws when the route responds non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 501 })));
    const transport = createHttpTransport();
    await expect(transport.request(endpoint, {} as never)).rejects.toThrow(/501/);
  });

  // [T-136 切片 a] x-account-id 注入。
  it("localStorage 有当前号 → 注入 x-account-id header", async () => {
    stubLocalStorage({ [CURRENT_ACCOUNT_KEY]: "acct-42" });
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await createHttpTransport().request(endpoint, {} as never);
    expect(headersOf(fetchMock)["x-account-id"]).toBe("acct-42");
  });

  it("localStorage 无当前号 → 不带 x-account-id header(server 退化全局)", async () => {
    stubLocalStorage({});
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await createHttpTransport().request(endpoint, {} as never);
    expect(headersOf(fetchMock)["x-account-id"]).toBeUndefined();
  });

  it("读 localStorage 抛错(隐私模式)→ 降级不带 header,不崩", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("storage disabled");
        },
      },
    });
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createHttpTransport().request(endpoint, {} as never),
    ).resolves.toBeDefined();
    expect(headersOf(fetchMock)["x-account-id"]).toBeUndefined();
  });

  // [T-332 S3·关 GAP-01] 当前号镜像进服务端可读 cookie(RSC 首屏与 RPC 同号)。
  it("请求前把当前号镜像进 current-account cookie(localStorage 真值 → cookie 投影)", async () => {
    stubLocalStorage({ [CURRENT_ACCOUNT_KEY]: "acct-42" });
    const doc = { cookie: "" };
    vi.stubGlobal("document", doc);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })),
    );
    await createHttpTransport().request(endpoint, {} as never);
    expect(doc.cookie).toContain(`${CURRENT_ACCOUNT_COOKIE}=acct-42`);
    expect(doc.cookie).toContain("Path=/");
  });

  it("未选号 → 清除 current-account cookie(Max-Age=0),RSC 退未选号引导态", async () => {
    stubLocalStorage({});
    const doc = { cookie: "" };
    vi.stubGlobal("document", doc);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })),
    );
    await createHttpTransport().request(endpoint, {} as never);
    expect(doc.cookie).toContain(`${CURRENT_ACCOUNT_COOKIE}=;`);
    expect(doc.cookie).toContain("Max-Age=0");
  });

  it("document 不可用(SSR)→ 静默跳过 cookie 镜像,请求照发", async () => {
    stubLocalStorage({ [CURRENT_ACCOUNT_KEY]: "acct-42" });
    vi.stubGlobal("document", undefined); // jsdom 环境显式抹掉,模拟 SSR
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createHttpTransport().request(endpoint, {} as never),
    ).resolves.toBeDefined();
    expect(headersOf(fetchMock)["x-account-id"]).toBe("acct-42");
  });

  // [T-332 S3] 结构化错误 → 类型化 HttpTransportError(S4 按码翻译引导的消费面)。
  it("dispatch 428 AccountRequiredError → 抛 HttpTransportError 带 status/code/details,isAccountRequiredError 可判", async () => {
    const body = {
      error: {
        code: "AccountRequiredError",
        message: "当前未选择账号:请先绑定/选择一个抖音号",
        details: {},
      },
      meta: { requestId: "dispatch" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status: 428 })),
    );
    const err = await createHttpTransport()
      .request(endpoint, {} as never)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(HttpTransportError);
    const te = err as HttpTransportError;
    expect(te.status).toBe(428);
    expect(te.code).toBe("AccountRequiredError");
    expect(isAccountRequiredError(te)).toBe(true);
    // message 保持既有拼串格式(既有按文案匹配的 catch 不回归)。
    expect(te.message).toContain("HttpTransport: 428 for projects.list");
    expect(te.message).toContain("请先绑定/选择一个抖音号");
  });

  it("dispatch 404 OwnershipError(无效号被拒)→ code/details 透传(archived 场景给 reason)", async () => {
    const body = {
      error: {
        code: "OwnershipError",
        message: "OwnershipError: platform account is archived: acct-old",
        details: { reason: "account_archived" },
      },
      meta: { requestId: "dispatch" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status: 404 })),
    );
    const err = (await createHttpTransport()
      .request(endpoint, {} as never)
      .then(
        () => null,
        (e: unknown) => e,
      )) as HttpTransportError;
    expect(err.code).toBe("OwnershipError");
    expect(err.details).toEqual({ reason: "account_archived" });
    expect(isAccountRequiredError(err)).toBe(false);
  });

  it("纯串错误体(旧形状)→ 仍抛 HttpTransportError,code=null,message 兼容", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 400 })),
    );
    const err = (await createHttpTransport()
      .request(endpoint, {} as never)
      .then(
        () => null,
        (e: unknown) => e,
      )) as HttpTransportError;
    expect(err).toBeInstanceOf(HttpTransportError);
    expect(err.code).toBeNull();
    expect(err.message).toContain("HttpTransport: 400 for projects.list: boom");
  });

  it("[T-520] 收藏结构化错误经过 HttpTransport 后保留 code/details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "DOUYIN_FAVORITES_UPSTREAM",
                message: "抖音收藏接口拒绝请求",
                details: { upstreamStatusCode: 2190008 },
              },
              meta: { requestId: "request-520" },
            }),
            { status: 502 },
          ),
      ),
    );
    const err = (await createHttpTransport()
      .request(endpoint, {} as never)
      .then(
        () => null,
        (error: unknown) => error,
      )) as HttpTransportError;
    expect(err.code).toBe("DOUYIN_FAVORITES_UPSTREAM");
    expect(err.details).toEqual({ upstreamStatusCode: 2190008 });
  });
});

describe("fetchCreatorApi — 直连 API 统一账号上下文", () => {
  it("给 escape-hatch API 自动带当前账号、同源凭据，并保留调用方 headers", async () => {
    stubLocalStorage({ [CURRENT_ACCOUNT_KEY]: "acct-current" });
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchCreatorApi("/api/knowledge/relate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-feature": "relate" },
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("x-account-id")).toBe("acct-current");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-feature")).toBe("relate");
    expect(init?.credentials).toBe("same-origin");
  });

  it("未选号时不伪造账号，但请求仍正常发出", async () => {
    stubLocalStorage({});
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchCreatorApi("/api/knowledge/search", { method: "POST" });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init?.headers).has("x-account-id")).toBe(false);
  });
});
