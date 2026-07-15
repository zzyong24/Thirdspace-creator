import { describe, it, expect, beforeEach } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  dashboardPage,
  projectOverviewPage,
  globalSearchPage,
} from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { QUERY_SERVICES_OP_IDS } from "@creatoros/backend/modules/query-services";

// Task 4/6 — the 3 page-read ops are registered into the composite (PERSISTED_OPS)
// and resolve through compositeTransport against the seeded pglite store. Proves
// the composition module is wired into the SAME store the server reads + the
// /api/v1 route share (foundation §1 registry). Each op output validates against
// its contract page DTO; the ownership-404 path + the multi-tenant smoke prove the
// inherited-scope invariant end-to-end (SPEC §19/§20; foundation §9).

const ep = (id: string) => ({ id }) as unknown as Endpoint;
// [T-332 S2] strict 账号门:页面组合读的底层 service 全部 per-account,ctx 必须带
// accountId(未选号 → AccountRequiredError,SPEC §4.2)。测试号按 userId 派生 →
// OWNER/OTHER 天然异号:OTHER 读 OWNER 项目走 (userId, accountId) 双维过滤落空 →
// OwnershipError 404(跨租户断言语义保持,且不会误抛 AccountRequiredError)。
const ctx = (userId: string, accountId = `acct-of-${userId}`): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
  accountId,
});

const OWNER = canonicalDataset.user.id; // user-zyongzhu (seeded)
const OTHER = "user-b"; // no seeded data
// [T-050] demo 项目种子已退役 → 每个用例前自建一个 OWNER 项目当被读对象。
let PROJECT_ID = "";

beforeEach(async () => {
  __resetPersistenceForTests();
  const created = (await compositeTransport.request(
    ep("projects.create"),
    {
      params: undefined,
      query: undefined,
      body: { title: "query-services 集成测试项目", brief: "" },
    } as never,
    ctx(OWNER),
  )) as { data: { id: string } };
  PROJECT_ID = created.data.id;
});

describe("query-services ops registered in the composite transport", () => {
  it("the 3 page-read op ids are persistence-backed (reject without ctx)", async () => {
    for (const id of QUERY_SERVICES_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    expect(QUERY_SERVICES_OP_IDS).toHaveLength(3);
  });

  it("pages.dashboard.get → valid dashboardPage, kind=dashboard", async () => {
    const res = (await compositeTransport.request(
      ep("pages.dashboard.get"),
      { params: undefined, query: undefined, body: undefined } as never,
      ctx(OWNER),
    )) as { data: unknown };
    expect(() => dashboardPage.parse(res.data)).not.toThrow();
    expect((res.data as { kind: string }).kind).toBe("dashboard");
  });

  it("pages.projectOverview.get → valid projectOverviewPage echoing projectId", async () => {
    const res = (await compositeTransport.request(
      ep("pages.projectOverview.get"),
      { params: { projectId: PROJECT_ID }, query: undefined, body: undefined } as never,
      ctx(OWNER),
    )) as { data: { projectId: string } };
    expect(() => projectOverviewPage.parse(res.data)).not.toThrow();
    expect(res.data.projectId).toBe(PROJECT_ID);
  });

  it("pages.projectOverview.get on ANOTHER user's project id → 404/OwnershipError (no leak)", async () => {
    await expect(
      compositeTransport.request(
        ep("pages.projectOverview.get"),
        { params: { projectId: PROJECT_ID }, query: undefined, body: undefined } as never,
        ctx(OTHER),
      ),
    ).rejects.toMatchObject({ code: expect.stringMatching(/Ownership/i) });
  });

  it("pages.search.get → valid globalSearchPage, query echoed, 4 locked tabs", async () => {
    const res = (await compositeTransport.request(
      ep("pages.search.get"),
      { params: undefined, query: { q: "钩子", type: undefined }, body: undefined } as never,
      ctx(OWNER),
    )) as { data: { query: string; kind: string; resultTabs: Array<{ id: string }> } };
    expect(() => globalSearchPage.parse(res.data)).not.toThrow();
    expect(res.data.query).toBe("钩子");
    expect(res.data.kind).toBe("search");
    expect(res.data.resultTabs.map((t) => t.id)).toEqual([
      "project",
      "knowledge",
      "asset",
      "video",
    ]);
  });

  // ------------------------------------------------------------------------
  // Multi-tenant smoke (foundation §9): user-b sees none of user-zyongzhu's data.
  // ------------------------------------------------------------------------
  it("multi-tenant: dashboard as user-b never surfaces the owner's publications/suggestions", async () => {
    const res = (await compositeTransport.request(
      ep("pages.dashboard.get"),
      { params: undefined, query: undefined, body: undefined } as never,
      ctx(OTHER),
    )) as { data: unknown };
    expect(() => dashboardPage.parse(res.data)).not.toThrow();
    const data = res.data as {
      recentPublications: unknown[];
      suggestions: unknown[];
      todos: unknown[];
    };
    // user-b has no seeded rows → empty composition (no cross-tenant leak).
    expect(data.recentPublications).toEqual([]);
    expect(data.suggestions).toEqual([]);
    expect(data.todos).toEqual([]);
  });

  it("multi-tenant: search as user-b returns no owner documents", async () => {
    const res = (await compositeTransport.request(
      ep("pages.search.get"),
      { params: undefined, query: { q: "AI", type: undefined }, body: undefined } as never,
      ctx(OTHER),
    )) as { data: { projects: unknown[]; knowledge: unknown[]; assets: unknown[]; videos: unknown[] } };
    expect(res.data.projects).toEqual([]);
    expect(res.data.knowledge).toEqual([]);
    expect(res.data.assets).toEqual([]);
    expect(res.data.videos).toEqual([]);
  });
});
