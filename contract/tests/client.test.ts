import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { defineEndpoint } from "../src/endpoints";
import { createClient } from "../src/client";
import type { Transport } from "../src/transport";

const getThing = defineEndpoint({
  id: "things.get",
  method: "GET",
  path: "/things/:thingId",
  params: z.object({ thingId: z.string() }),
  response: z.object({ id: z.string(), name: z.string() }),
});

describe("createClient", () => {
  it("invokes the transport and validates the response", async () => {
    const transport: Transport = {
      request: vi.fn(async () => ({
        data: { id: "t1", name: "Widget" },
        meta: { requestId: "r1" },
      })),
    };
    const client = createClient({ getThing }, transport);
    const result = await client.getThing({
      params: { thingId: "t1" },
      query: undefined,
      body: undefined,
    });
    expect(result.id).toBe("t1");
    expect(transport.request).toHaveBeenCalledOnce();
  });

  it("throws when the transport returns a shape that fails the response schema", async () => {
    const transport: Transport = {
      request: vi.fn(async () => ({ data: { id: 1 }, meta: { requestId: "r1" } })),
    };
    const client = createClient({ getThing }, transport);
    await expect(
      client.getThing({ params: { thingId: "t1" }, query: undefined, body: undefined }),
    ).rejects.toThrow();
  });
});
