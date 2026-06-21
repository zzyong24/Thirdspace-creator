import { describe, it, expect, beforeEach } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { KNOWLEDGE_OP_IDS } from "./knowledge.transport";

// D2 — the 5 knowledge ops are registered into the composite (PERSISTED_OPS) and
// a knowledge.create round-trips through compositeTransport against the seeded
// pglite store. Proves the module is wired into the same store server reads +
// the /api/v1 route share (foundation §1 registry).

const ep = (id: string, isList = false) => ({ id, isList }) as unknown as Endpoint;
const ctx = (userId: string): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
});

beforeEach(() => {
  __resetPersistenceForTests();
});

describe("knowledge ops registered in the composite transport", () => {
  it("the 5 knowledge op ids are persistence-backed (not the mock)", async () => {
    // A persisted op called with NO ctx throws AuthenticationError; a mock op
    // would resolve. Use that to assert each id is routed to the real transport.
    for (const id of KNOWLEDGE_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    expect(KNOWLEDGE_OP_IDS).toHaveLength(5);
  });

  it("knowledge.list returns the seeded canonical items for the owner", async () => {
    const res = (await compositeTransport.request(
      ep("knowledge.list", true),
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined } as never,
      ctx(canonicalDataset.user.id),
    )) as { data: Array<{ id: string; userId: string }> };
    expect(res.data.length).toBeGreaterThan(0);
    for (const row of res.data) {
      expect(row.userId).toBe(canonicalDataset.user.id);
    }
  });

  it("knowledge.create round-trips: the new item is then listable", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const created = (await compositeTransport.request(
      ep("knowledge.create"),
      {
        params: undefined,
        query: undefined,
        body: { title: "新建知识", knowledgeType: "note", content: "正文" },
      } as never,
      owner,
    )) as { data: { id: string; status: string; currentRevisionId: string } };
    expect(created.data.status).toBe("active");
    expect(created.data.currentRevisionId).toBeTruthy();

    const list = (await compositeTransport.request(
      ep("knowledge.list", true),
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined } as never,
      owner,
    )) as { data: Array<{ id: string }> };
    expect(list.data.some((r) => r.id === created.data.id)).toBe(true);
  });
});
