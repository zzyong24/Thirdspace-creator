import { describe, it, expect, beforeEach } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { CONTENT_CALENDAR_OP_IDS } from "@creatoros/backend/modules/content-calendar";

// Step 4/6 — the 8 calendar ops are registered into the composite (PERSISTED_OPS) and a
// create→list round-trips through compositeTransport against the seeded pglite store.
// Proves the module is wired into the SAME store server reads + the /api/v1 route share
// (foundation §1 registry), the account-ownership gate routes through the real
// PlatformAccountService (a canonical account is required), and the multi-tenant
// boundary holds end-to-end.

// [T-135] canonical platform account seed(acct-canonical-douyin)已退役(开箱空)。日历条目的
// account-ownership gate 走真 PlatformAccountService 校验属主,故账号必须真实存在 —— 每条测试
// 里先由 owner 自建一条账号(公开 accounts.create op),再用它的 id 当 accountId。
const ep = (id: string, isList = false) =>
  ({ id, isList }) as unknown as Endpoint;
// [T-332 S2] strict 账号门 + 号一致性门(SPEC §4.2/§4.5):日历 op 的 params.accountId
// 必须等于 ctx.accountId(assertCurrentAccount),且账号须真实存在(ownership gate 走真
// PlatformAccountService)。故先建真账号,再用 onAccount 把该号落进 ctx 当「当前选中号」。
const ctx = (userId: string, accountId = `acct-of-${userId}`): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
  accountId,
});
// 把真建出来的账号 id 设为 ctx 当前号(写路径 stamp / 号一致性门都取自它)。
const onAccount = (base: RequestContext, accountId: string): RequestContext => ({
  ...base,
  accountId,
});
const WINDOW = { from: "2026-07-01T00:00:00.000Z", to: "2026-07-31T00:00:00.000Z" };

async function createAccount(owner: RequestContext): Promise<string> {
  const created = (await compositeTransport.request(
    ep("accounts.create"),
    {
      params: undefined,
      query: undefined,
      body: {
        platform: "douyin",
        accountHandle: "@t135-calendar-fixture",
        followerBaseline: 300,
      },
    } as never,
    owner,
  )) as { data: { id: string } };
  return created.data.id;
}

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
    const ACC = await createAccount(owner);
    // [T-332 S2] 号一致性门:params.accountId 必须 = ctx.accountId → 后续调用切到真建号。
    const ownerOnAcc = onAccount(owner, ACC);
    const created = (await compositeTransport.request(
      ep("accounts.calendar.entries.create"),
      {
        params: { accountId: ACC },
        query: undefined,
        body: { plannedAt: "2026-07-21T09:00:00.000Z", note: "smoke" },
      } as never,
      ownerOnAcc,
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
      ownerOnAcc,
    )) as { data: Array<{ id: string; userId: string }> };
    expect(list.data.some((r) => r.id === created.data.id)).toBe(true);
    for (const row of list.data) {
      expect(row.userId).toBe(canonicalDataset.user.id);
    }
  });

  it("multi-tenant: a non-owner cannot list the owner's account calendar (OwnershipError)", async () => {
    const ACC = await createAccount(ctx(canonicalDataset.user.id));
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
