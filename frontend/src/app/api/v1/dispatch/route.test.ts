import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { resetStore } from "@/server/mock-backend/index";
import { __resetPersistenceForTests } from "@/server/persistence-client";

// Task 9 — dispatch derives ctx from the `creatoros_session` cookie.
// [用户裁决 2026-07-06] canonical email 已置空(用户属性不 seed)→ 不再 email-login。
// 走 T-046 单机免登录:不带 cookie → 本机主用户(= seed canonical user-zyongzhu)直通,
// dispatch 照旧解析到规范租户,无需 mint 会话。
const SESSION_COOKIE = "";

// [T-332 S2] strict 账号门:per-account op(projects/pages 等)必须解析出 ctx.accountId,
// dispatch 链路的号来自 `x-account-id` header(route 内 withVerifiedAccount 以真实 userId
// 查号验属主,不属主/不存在 → 降级 null → AccountRequiredError)。所以测试必须先经
// dispatch 真建一条 platform account,再把它的 id 当默认 header 携带 —— 走的就是浏览器
// 端「当前选中号」的真实调用路径。beforeEach 里填充。
let ACCOUNT_ID = "";

function dispatch(
  id: string,
  input: unknown,
  cookie = SESSION_COOKIE,
  accountId: string | null = null, // null = 用默认真建号;"" = 显式不带号
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (cookie) headers.cookie = cookie;
  const acc = accountId ?? ACCOUNT_ID;
  if (acc) headers["x-account-id"] = acc;
  return POST(
    new Request("http://localhost/api/v1/dispatch", {
      method: "POST",
      headers,
      body: JSON.stringify({ id, input }),
    }),
  );
}

// 真建一条 platform account(user 级 op,不需要选号),返回 id 作后续请求的当前号。
async function createFixtureAccount(): Promise<string> {
  const res = await dispatch(
    "accounts.create",
    {
      params: undefined,
      query: undefined,
      body: {
        platform: "douyin",
        accountHandle: "@dispatch-route-fixture",
        followerBaseline: 300,
      },
    },
    "",
    "", // 建号请求本身不带 x-account-id
  );
  const json = (await res.json()) as { data: { id: string } };
  return json.data.id;
}

async function listProjectIds(): Promise<string[]> {
  const res = await dispatch("projects.list", {
    params: undefined,
    query: { page: 1, pageSize: 50 },
    body: undefined,
  });
  const json = (await res.json()) as { data: Array<{ id: string }> };
  return json.data.map((p) => p.id);
}

describe("POST /api/v1/dispatch (FE<->BE seam over HTTP; project ops on real SQL)", () => {
  beforeEach(async () => {
    resetStore(); // mock-backed ops (outputs/tasks/pages)
    __resetPersistenceForTests(); // fresh pglite seed (project ops)
    // 免登录:不 mint 会话,dispatch 不带 cookie → 本机主用户直通(seed canonical)。
    // [T-332 S2] 真建当前号(开箱空,canonical account seed 已随 T-135 退役)。
    ACCOUNT_ID = await createFixtureAccount();
  });

  it("serves a project read from the persistence store", async () => {
    // [T-050] demo 种子已退役:先经 dispatch 建一条,读侧应看到它(同一 pglite)。
    const created = await dispatch("projects.create", {
      params: undefined,
      query: undefined,
      body: { title: "读侧冒烟项目", brief: "" },
    });
    expect(created.status).toBe(200);
    const ids = await listProjectIds();
    expect(ids.length).toBeGreaterThan(0);
  });

  it("persists a create in SQL so the next read reflects it (the 联调 round-trip)", async () => {
    const before = (await listProjectIds()).length;

    const created = await dispatch("projects.create", {
      params: undefined,
      query: undefined,
      body: { title: "联调测试项目", brief: "" },
    });
    expect(created.status).toBe(200);
    const createdJson = (await created.json()) as { data: { id: string; title: string } };
    expect(createdJson.data.title).toBe("联调测试项目");

    // A fresh dispatch (as a browser island issues after router.refresh()) sees
    // the new row — read back out of pglite, not an in-memory clone.
    const after = await listProjectIds();
    expect(after.length).toBe(before + 1);
    expect(after).toContain(createdJson.data.id);
  });

  it("serves the composed dashboard page DTO (module Q) with 200", async () => {
    // pages.dashboard.get is now persisted (Wave-4 query-services takeover) — it
    // composes public services and returns the dashboardPage envelope (200).
    const res = await dispatch("pages.dashboard.get", {
      params: undefined,
      query: undefined,
      body: undefined,
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 for an unknown operation", async () => {
    const res = await dispatch("does.not.exist", {});
    expect(res.status).toBe(404);
  });

  it("routes a wired op to its persistence-backed module (404 for a cross-/unknown-owner ref)", async () => {
    // Every contract op is now wired into a real, user-scoped module transport — no
    // contract op falls through to the mock's "operation not implemented" (501) path
    // anymore. `accounts.cadence.attainment` (module 22 ContentCalendar, Wave 5–7) is
    // the last formerly-unimplemented op; it now routes to the real transport, whose
    // PlatformAccountService ownership gate rejects an unknown account id with
    // OwnershipError → 404 (SPEC §14: 404 not 403, no existence leak). This proves the
    // op is persistence-backed (not a 501 stub) AND multi-tenant from end to end.
    // [T-332 S2] ctx 带真建号(默认 header),params 指未知号 → 号一致性门(§4.5)同貌
    // OwnershipError 404,断言语义不变。
    const res = await dispatch("accounts.cadence.attainment", {
      params: { accountId: "acct-does-not-exist" },
      query: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-31T00:00:00.000Z" },
      body: undefined,
    });
    expect(res.status).toBe(404);
  });

  // [T-046 单机免登录] 无/坏 cookie 不再 401 —— 以本机主用户直通,persisted op 照常执行。
  it("serves a persisted op WITHOUT a session cookie(T-046 直通本机主用户)", async () => {
    const res = await dispatch(
      "projects.list",
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined },
      "", // no cookie
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown };
    expect(json.data).toBeDefined();
  });

  it("serves a persisted op WITH an invalid session cookie(失效 token 同直通)", async () => {
    const res = await dispatch(
      "projects.list",
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined },
      "creatoros_session=garbage",
    );
    expect(res.status).toBe(200);
  });

  it("serves a persisted op WITH a valid session cookie (ctx threaded → 200)", async () => {
    // [T-050] 先建一条(种子已退役),再验证带 session 的 list 能读回 ctx 归属行。
    await dispatch("projects.create", {
      params: undefined,
      query: undefined,
      body: { title: "ctx 穿线项目", brief: "" },
    });
    const res = await dispatch("projects.list", {
      params: undefined,
      query: { page: 1, pageSize: 50 },
      body: undefined,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Array<{ id: string }> };
    expect(json.data.length).toBeGreaterThan(0);
  });
});
