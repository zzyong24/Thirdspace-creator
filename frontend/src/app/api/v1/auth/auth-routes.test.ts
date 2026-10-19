import { describe, it, expect, beforeEach } from "vitest";
import { POST as loginPOST } from "./login/route";
import { POST as registerPOST } from "./register/route";
import { POST as logoutPOST } from "./logout/route";
import { GET as meGET } from "./me/route";
import { resetStore } from "@/server/mock-backend/index";
import { getIdentityService, __resetPersistenceForTests } from "@/server/persistence-client";
let localUserId: string;

// Module 00, Task 9 — the three bare auth routes (foundation §2, SPEC §13):
//   POST /api/v1/auth/login   — email+password → set httpOnly session cookie
//   POST /api/v1/auth/logout  — revoke + clear the cookie (idempotent)
//   GET  /api/v1/auth/me      — resolve ctx from cookie → current user DTO
// Routes go through identity.service / compositeTransport only (never the db
// client directly — SPEC §22) and emit the SPEC §14 envelope shapes.

// [用户裁决 2026-07-06] canonical 用户属性不 seed(email/displayName 空)→ canonical 不能
// email-login。故 email-login 端点(login/valid-cookie)改用**注册的专用测试用户**覆盖;
// 免登录路径(无/坏 cookie 直通本机主用户 = canonical seed)通过真实 resolveLocalContext 核本例主用户。
const TEST_EMAIL = "tester@creatoros.local";
const TEST_PASSWORD = "test-pass-123";

function loginReq(body: unknown): Request {
  return new Request("http://localhost/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function withCookie(url: string, method: string, cookie?: string): Request {
  return new Request(url, {
    method,
    headers: cookie ? { cookie } : {},
  });
}

/** Pull the `creatoros_session=...` cookie pair out of a Set-Cookie header. */
function sessionCookieFrom(res: Response): string | undefined {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return undefined;
  const match = /creatoros_session=([^;]*)/.exec(setCookie);
  if (!match) return undefined;
  return `creatoros_session=${match[1]}`;
}

function registerReq(body: unknown): Request {
  return new Request("http://localhost/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// 注册一个专用测试用户(带真 email)—— email-login 端点测试的主体(canonical 已无 email)。
// 返回 register 响应携带的 session cookie + 新用户 id。
async function registerTestUser(): Promise<{ id: string; cookie?: string }> {
  const res = await registerPOST(
    registerReq({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      displayName: "Tester",
    }),
  );
  const json = (await res.json()) as { data: { id: string } };
  return { id: json.data.id, cookie: sessionCookieFrom(res) };
}

beforeEach(async () => {
  resetStore();
  __resetPersistenceForTests();
  localUserId = (await (await getIdentityService()).resolveLocalContext()).userId;
});

describe("POST /api/v1/auth/login", () => {
  it("with valid creds(注册用户)→ 200, sets HttpOnly session cookie + user DTO", async () => {
    const { id } = await registerTestUser();
    const res = await loginPOST(
      loginReq({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    );
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/creatoros_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const json = (await res.json()) as {
      data: { id: string; email: string; passwordHash?: unknown };
      meta: { requestId: string };
    };
    expect(json.data.id).toBe(id);
    expect(json.data.email).toBe(TEST_EMAIL);
    expect(json.data).not.toHaveProperty("passwordHash");
    expect(typeof json.meta.requestId).toBe("string");
  });

  it("with a wrong password → 401 AuthenticationError envelope, no cookie", async () => {
    await registerTestUser();
    const res = await loginPOST(
      loginReq({ email: TEST_EMAIL, password: "nope" }),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("AuthenticationError");
  });

  it("with a malformed body → 400 ValidationError envelope", async () => {
    const res = await loginPOST(loginReq({ email: "x" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("ValidationError");
  });
});

describe("GET /api/v1/auth/me", () => {
  it("with a valid session cookie → 200 + that session's user(注册用户)", async () => {
    // 注册即下发 session cookie;/me 用它解析 → 该注册用户(非免登录的 canonical)。
    const { id, cookie } = await registerTestUser();
    expect(cookie).toBeDefined();

    const res = await meGET(
      withCookie("http://localhost/api/v1/auth/me", "GET", cookie),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: string; email: string } };
    expect(json.data.id).toBe(id);
    expect(json.data.email).toBe(TEST_EMAIL);
  });

  // [T-046 单机免登录] 无/坏 cookie 不再 401,以本机主用户(最早创建的真实本机主用户)直通。
  it("without a cookie → 200 直通本机主用户(T-046 单机免登录)", async () => {
    const res = await meGET(
      withCookie("http://localhost/api/v1/auth/me", "GET"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: string } };
    expect(json.data.id).toBe(localUserId);
  });

  it("with a garbage cookie → 200 直通本机主用户(失效 token 与无 token 同路径)", async () => {
    const res = await meGET(
      withCookie(
        "http://localhost/api/v1/auth/me",
        "GET",
        "creatoros_session=not-a-real-token",
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: string } };
    expect(json.data.id).toBe(localUserId);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("clears the cookie and revokes the session(撤销后旧 cookie 走单机直通,不再 401)", async () => {
    const { cookie } = await registerTestUser();
    expect(cookie).toBeDefined();

    const out = await logoutPOST(
      withCookie("http://localhost/api/v1/auth/logout", "POST", cookie),
    );
    expect(out.status).toBe(200);
    // Cookie is cleared (Max-Age=0 / Expires in the past).
    const cleared = out.headers.get("set-cookie") ?? "";
    expect(cleared).toMatch(/creatoros_session=/);
    expect(cleared).toMatch(/Max-Age=0|Expires=/i);
    const outJson = (await out.json()) as { data: { ok: boolean } };
    expect(outJson.data.ok).toBe(true);

    // [T-046] 撤销的 token 不再换来 401 —— 失效 token 与无 token 同路径,直通本机主用户。
    const me = await meGET(
      withCookie("http://localhost/api/v1/auth/me", "GET", cookie),
    );
    expect(me.status).toBe(200);
    const meJson = (await me.json()) as { data: { id: string } };
    expect(meJson.data.id).toBe(localUserId);
  });

  it("is idempotent — logout with no cookie → 200", async () => {
    const out = await logoutPOST(
      withCookie("http://localhost/api/v1/auth/logout", "POST"),
    );
    expect(out.status).toBe(200);
  });
});
