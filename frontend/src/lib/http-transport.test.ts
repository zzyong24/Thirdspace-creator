import { describe, it, expect, vi, afterEach } from "vitest";
import { createHttpTransport, CURRENT_ACCOUNT_KEY } from "./http-transport";
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
});
