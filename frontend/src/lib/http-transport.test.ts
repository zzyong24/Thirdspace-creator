import { describe, it, expect, vi, afterEach } from "vitest";
import { createHttpTransport } from "./http-transport";
import type { Endpoint } from "@creatoros/contract";

const endpoint = { id: "projects.list", isList: true } as unknown as Endpoint;

afterEach(() => vi.restoreAllMocks());

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
});
