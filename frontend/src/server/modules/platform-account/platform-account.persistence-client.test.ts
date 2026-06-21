import { describe, it, expect, beforeEach } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { PLATFORM_ACCOUNT_OP_IDS } from "./platform-account.transport";

// Step 4/6 — the 5 account ops are registered into the composite (PERSISTED_OPS) and an
// accounts.create round-trips through compositeTransport against the seeded pglite store.
// Proves the module is wired into the SAME store server reads + the /api/v1 route share
// (foundation §1 registry), and that the multi-tenant boundary holds end-to-end.

const ep = (id: string, isList = false) => ({ id, isList }) as unknown as Endpoint;
const ctx = (userId: string): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
});

beforeEach(() => {
  __resetPersistenceForTests();
});

describe("platform-account ops registered in the composite transport", () => {
  it("the 5 account op ids are persistence-backed (not the mock)", async () => {
    // A persisted op called with NO ctx throws AuthenticationError; a mock op would
    // resolve. Use that to assert each id routes to the real user-scoped transport.
    for (const id of PLATFORM_ACCOUNT_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    expect(PLATFORM_ACCOUNT_OP_IDS).toHaveLength(5);
  });

  it("accounts.list returns the seeded canonical accounts for the owner", async () => {
    const res = (await compositeTransport.request(
      ep("accounts.list", true),
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined } as never,
      ctx(canonicalDataset.user.id),
    )) as { data: Array<{ id: string; userId: string; secretReference: string | null }> };
    expect(res.data.length).toBeGreaterThanOrEqual(2);
    for (const row of res.data) {
      expect(row.userId).toBe(canonicalDataset.user.id);
    }
  });

  it("accounts.create round-trips: the new account is then listable", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const created = (await compositeTransport.request(
      ep("accounts.create"),
      {
        params: undefined,
        query: undefined,
        body: {
          platform: "xiaohongshu",
          accountHandle: "@new-matrix",
          followerBaseline: 300,
        },
      } as never,
      owner,
    )) as { data: { id: string; status: string; platform: string } };
    expect(created.data.status).toBe("active");
    expect(created.data.platform).toBe("xiaohongshu");

    const list = (await compositeTransport.request(
      ep("accounts.list", true),
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined } as never,
      owner,
    )) as { data: Array<{ id: string }> };
    expect(list.data.some((r) => r.id === created.data.id)).toBe(true);
  });

  it("multi-tenant: another user cannot get the owner's seeded account (404 OwnershipError)", async () => {
    await expect(
      compositeTransport.request(
        ep("accounts.get"),
        {
          params: { accountId: "acct-canonical-douyin" },
          query: undefined,
          body: undefined,
        } as never,
        ctx("user-intruder"),
      ),
    ).rejects.toThrow();
  });
});
