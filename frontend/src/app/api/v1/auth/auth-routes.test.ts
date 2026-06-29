import { describe, it, expect, beforeEach } from "vitest";
import { POST as loginPOST } from "./login/route";
import { POST as logoutPOST } from "./logout/route";
import { GET as meGET } from "./me/route";
import { resetStore } from "@/server/mock-backend/index";
import { __resetPersistenceForTests } from "@/server/persistence-client";
import { DEV_PASSWORD, CANONICAL_USER_ID } from "@creatoros/backend/modules/identity";

// Module 00, Task 9 — the three bare auth routes (foundation §2, SPEC §13):
//   POST /api/v1/auth/login   — email+password → set httpOnly session cookie
//   POST /api/v1/auth/logout  — revoke + clear the cookie (idempotent)
//   GET  /api/v1/auth/me      — resolve ctx from cookie → current user DTO
// Routes go through identity.service / compositeTransport only (never the db
// client directly — SPEC §22) and emit the SPEC §14 envelope shapes.

const CANONICAL_EMAIL = "zyongzhu@creatoros.local";

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

beforeEach(() => {
  resetStore();
  __resetPersistenceForTests();
});

describe("POST /api/v1/auth/login", () => {
  it("with canonical creds → 200, sets HttpOnly session cookie + user DTO", async () => {
    const res = await loginPOST(
      loginReq({ email: CANONICAL_EMAIL, password: DEV_PASSWORD }),
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
    expect(json.data.id).toBe(CANONICAL_USER_ID);
    expect(json.data.email).toBe(CANONICAL_EMAIL);
    expect(json.data).not.toHaveProperty("passwordHash");
    expect(typeof json.meta.requestId).toBe("string");
  });

  it("with a wrong password → 401 AuthenticationError envelope, no cookie", async () => {
    const res = await loginPOST(
      loginReq({ email: CANONICAL_EMAIL, password: "nope" }),
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
  it("with a valid session cookie → 200 + the canonical user", async () => {
    const login = await loginPOST(
      loginReq({ email: CANONICAL_EMAIL, password: DEV_PASSWORD }),
    );
    const cookie = sessionCookieFrom(login);
    expect(cookie).toBeDefined();

    const res = await meGET(
      withCookie("http://localhost/api/v1/auth/me", "GET", cookie),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: string; email: string } };
    expect(json.data.id).toBe(CANONICAL_USER_ID);
    expect(json.data.email).toBe(CANONICAL_EMAIL);
  });

  it("without a cookie → 401", async () => {
    const res = await meGET(
      withCookie("http://localhost/api/v1/auth/me", "GET"),
    );
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("AuthenticationError");
  });

  it("with a garbage cookie → 401", async () => {
    const res = await meGET(
      withCookie(
        "http://localhost/api/v1/auth/me",
        "GET",
        "creatoros_session=not-a-real-token",
      ),
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("clears the cookie and revokes the session (a later /me with the old cookie → 401)", async () => {
    const login = await loginPOST(
      loginReq({ email: CANONICAL_EMAIL, password: DEV_PASSWORD }),
    );
    const cookie = sessionCookieFrom(login);
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

    // The revoked token is now rejected.
    const me = await meGET(
      withCookie("http://localhost/api/v1/auth/me", "GET", cookie),
    );
    expect(me.status).toBe(401);
  });

  it("is idempotent — logout with no cookie → 200", async () => {
    const out = await logoutPOST(
      withCookie("http://localhost/api/v1/auth/logout", "POST"),
    );
    expect(out.status).toBe(200);
  });
});
