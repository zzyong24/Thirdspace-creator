import { describe, it, expect, beforeEach } from "vitest";
import { AuthenticationError } from "@creatoros/backend";
import type { Endpoint } from "@creatoros/contract";
import type { RequestContext } from "@creatoros/backend";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";

// Task 8 — the transport signature gains a `ctx` parameter (foundation §2, the
// one cross-cutting substrate change). This proves the composite transport
// threads ctx end-to-end:
//   - a PERSISTED op with a ctx → returns the ctx-owner's rows
//   - a PERSISTED op with NO ctx → AuthenticationError (unauthenticated dispatch)
//   - a NON-persisted (mock) op → ignores ctx, still resolves (back-compat: the
//     browser-side typed client + static pages have no ctx)

const ep = (id: string, isList = false) => ({ id, isList }) as unknown as Endpoint;

// [T-332 S2] strict 账号门:per-account op 必须带 ctx.accountId(未选号 → AccountRequiredError,
// SPEC §4.2)。测试号按 userId 派生(天然 A/B 异号,双用户隔离断言语义保持);composite 层
// ctx 是可信输入(属主校验在 dispatch route 的 withVerifiedAccount),故无需真建账号行。
const ctx = (userId: string, accountId = `acct-of-${userId}`): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
  accountId,
});

const noInput = { params: undefined, query: undefined, body: undefined } as never;

beforeEach(() => {
  __resetPersistenceForTests();
});

describe("compositeTransport ctx threading (Task 8)", () => {
  it("returns the ctx-owner's rows for a persisted op called with a ctx", async () => {
    // [T-050] demo 项目种子已退役 → 测试自建一行再断言(不再依赖 seed 数据)。
    await compositeTransport.request(
      ep("projects.create"),
      {
        params: undefined,
        query: undefined,
        body: { title: "ctx 穿线测试项目", brief: "" },
      } as never,
      ctx(canonicalDataset.user.id),
    );
    const res = (await compositeTransport.request(
      ep("projects.list", true),
      { params: undefined, query: { page: 1, pageSize: 20 }, body: undefined } as never,
      ctx(canonicalDataset.user.id),
    )) as { data: Array<{ id: string; userId: string }> };

    expect(res.data.length).toBeGreaterThan(0);
    // every returned project is owned by the ctx user (multi-tenant scope)
    for (const row of res.data) {
      expect(row.userId).toBe(canonicalDataset.user.id);
    }
  });

  it("throws AuthenticationError for a persisted op called with NO ctx", async () => {
    await expect(
      compositeTransport.request(
        ep("projects.list", true),
        { params: undefined, query: { page: 1, pageSize: 20 }, body: undefined } as never,
      ),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("the composed dashboard page op is persisted + auth-gated (Wave-4 takeover)", async () => {
    // `pages.dashboard.get` was an unauthenticated mock op pre-Wave-4; the
    // query-services module (module Q) took it over, so it is now PERSISTED and
    // ctx-gated: with a ctx it composes the owner's page; with NO ctx it is an
    // unauthenticated dispatch → AuthenticationError (the page route always
    // resolves ctx from the session before calling it).
    const withCtx = await compositeTransport.request(
      ep("pages.dashboard.get"),
      noInput,
      ctx(canonicalDataset.user.id),
    );
    expect(withCtx).toBeDefined();
    await expect(
      compositeTransport.request(ep("pages.dashboard.get"), noInput),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});
