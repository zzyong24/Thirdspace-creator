import { describe, it, expect, beforeEach } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { PLATFORM_ACCOUNT_OP_IDS } from "@creatoros/backend/modules/platform-account";

// Step 4/6 — the 6 account ops are registered into the composite (PERSISTED_OPS) and an
// accounts.create round-trips through compositeTransport against the seeded pglite store.
// Proves the module is wired into the SAME store server reads + the /api/v1 route share
// (foundation §1 registry), and that the multi-tenant boundary holds end-to-end.

const ep = (id: string, isList = false) => ({ id, isList }) as unknown as Endpoint;
const ctx = (userId: string): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
});

// [T-135] canonical platform account seed(acct-canonical-douyin)已退役(开箱空)。原来
// 依赖「启动时 seed 一个抖音账号」的这几条集成测试改成**自建 fixture 账号**——走公开
// accounts.create op 真造一条(与下方 round-trip 测试同一路径),验的是「账号 ops + 多租户
// 边界」而非「seed 存在」。
async function createAccount(
  owner: RequestContext,
  handle = "@t135-fixture",
): Promise<string> {
  const created = (await compositeTransport.request(
    ep("accounts.create"),
    {
      params: undefined,
      query: undefined,
      body: {
        platform: "douyin",
        accountHandle: handle,
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

describe("platform-account ops registered in the composite transport", () => {
  it("the 6 account op ids are persistence-backed (not the mock)", async () => {
    // A persisted op called with NO ctx throws AuthenticationError; a mock op would
    // resolve. Use that to assert each id routes to the real user-scoped transport.
    for (const id of PLATFORM_ACCOUNT_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    expect(PLATFORM_ACCOUNT_OP_IDS).toEqual(["accounts.list","accounts.bindingCapabilities","accounts.create","accounts.get","accounts.update","accounts.archive"]);
  });

  it("[T-135] 开箱空:owner 的 accounts.list 初始为空,建一条后可列出(全部本人)", async () => {
    const owner = ctx(canonicalDataset.user.id);
    // 开箱空态:没有任何 canonical 账号 seed。
    const empty = (await compositeTransport.request(
      ep("accounts.list", true),
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined } as never,
      owner,
    )) as { data: Array<{ id: string }> };
    expect(empty.data).toHaveLength(0);

    // 自建一条账号后可列出,且行属主 = 本人。
    const createdId = await createAccount(owner);
    const res = (await compositeTransport.request(
      ep("accounts.list", true),
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined } as never,
      owner,
    )) as { data: Array<{ id: string; userId: string }> };
    expect(res.data.some((r) => r.id === createdId)).toBe(true);
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

  it("multi-tenant: another user cannot get the owner's account (404 OwnershipError)", async () => {
    // [T-135] 不再依赖 canonical seed:先由 owner 自建一条账号,再验闯入者取不到。
    const ownedId = await createAccount(ctx(canonicalDataset.user.id));
    await expect(
      compositeTransport.request(
        ep("accounts.get"),
        {
          params: { accountId: ownedId },
          query: undefined,
          body: undefined,
        } as never,
        ctx("user-intruder"),
      ),
    ).rejects.toThrow();
  });
});
