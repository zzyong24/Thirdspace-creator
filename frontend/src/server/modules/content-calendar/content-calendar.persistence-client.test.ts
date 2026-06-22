import { describe, it, expect, beforeEach } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { CONTENT_CALENDAR_OP_IDS } from "./content-calendar.transport";

// Step 4/6 — the 8 calendar ops are registered into the composite (PERSISTED_OPS) and a
// create→list round-trips through compositeTransport against the seeded pglite store.
// Proves the module is wired into the SAME store server reads + the /api/v1 route share
// (foundation §1 registry), the account-ownership gate routes through the real
// PlatformAccountService (a canonical account is required), and the multi-tenant
// boundary holds end-to-end.

const ACC = "acct-canonical-douyin"; // seeded for the canonical user
const ep = (id: string, isList = false) =>
  ({ id, isList }) as unknown as Endpoint;
const ctx = (userId: string): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
});
const WINDOW = { from: "2026-07-01T00:00:00.000Z", to: "2026-07-31T00:00:00.000Z" };

beforeEach(() => {
  __resetPersistenceForTests();
});

describe("content-calendar ops registered in the composite transport", () => {
  it("the 8 calendar op ids are persistence-backed (not the mock)", async () => {
    // A persisted op called with NO ctx throws AuthenticationError; a mock op would
    // resolve. Use that to assert each id routes to the real user-scoped transport.
    for (const id of CONTENT_CALENDAR_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    expect(CONTENT_CALENDAR_OP_IDS).toHaveLength(8);
  });

  it("entries.create round-trips: the new entry is then listable in window", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const created = (await compositeTransport.request(
      ep("accounts.calendar.entries.create"),
      {
        params: { accountId: ACC },
        query: undefined,
        body: { plannedAt: "2026-07-21T09:00:00.000Z", note: "smoke" },
      } as never,
      owner,
    )) as { data: { id: string; status: string; accountId: string } };
    expect(created.data.status).toBe("planned");
    expect(created.data.accountId).toBe(ACC);

    const list = (await compositeTransport.request(
      ep("accounts.calendar.list", true),
      {
        params: { accountId: ACC },
        query: { ...WINDOW, page: 1, pageSize: 50 },
        body: undefined,
      } as never,
      owner,
    )) as { data: Array<{ id: string; userId: string }> };
    expect(list.data.some((r) => r.id === created.data.id)).toBe(true);
    for (const row of list.data) {
      expect(row.userId).toBe(canonicalDataset.user.id);
    }
  });

  it("multi-tenant: a non-owner cannot list the owner's account calendar (OwnershipError)", async () => {
    await expect(
      compositeTransport.request(
        ep("accounts.calendar.list", true),
        {
          params: { accountId: ACC },
          query: { ...WINDOW, page: 1, pageSize: 50 },
          body: undefined,
        } as never,
        ctx("user-intruder"),
      ),
    ).rejects.toThrow();
  });
});
