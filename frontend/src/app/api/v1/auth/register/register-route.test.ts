import { describe, it, expect, beforeEach } from "vitest";
import { POST as registerPOST } from "./route";
import { POST as loginPOST } from "../login/route";
import { GET as meGET } from "../me/route";
import { resetStore } from "@/server/mock-backend/index";
import { __resetPersistenceForTests } from "@/server/persistence-client";

// P2 — 用户注册真账号. POST /api/v1/auth/register mints a brand-new account,
// sets the httpOnly session cookie, and returns the new user DTO. Routes go
// through identity.service / compositeTransport only (never the db client —
// SPEC §22) and emit the SPEC §14 envelope shapes.

function jsonReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function registerReq(body: unknown): Request {
  return jsonReq("http://localhost/api/v1/auth/register", body);
}

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

describe("POST /api/v1/auth/register", () => {
  it("with a fresh email → 200, sets HttpOnly session cookie + user DTO", async () => {
    const res = await registerPOST(
      registerReq({
        email: "fresh@creatoros.local",
        password: "s3cret-pw",
        displayName: "Fresh User",
      }),
    );
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/creatoros_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const json = (await res.json()) as {
      data: { email: string; displayName: string; id: string };
    };
    expect(json.data.email).toBe("fresh@creatoros.local");
    expect(json.data.displayName).toBe("Fresh User");
    expect(json.data).not.toHaveProperty("passwordHash");

    // The issued cookie resolves the current user (the registrant is logged in).
    const cookie = sessionCookieFrom(res)!;
    const me = await meGET(
      new Request("http://localhost/api/v1/auth/me", { headers: { cookie } }),
    );
    expect(me.status).toBe(200);
    const meJson = (await me.json()) as { data: { id: string } };
    expect(meJson.data.id).toBe(json.data.id);
  });

  it("the new account can subsequently log in with the same credentials", async () => {
    await registerPOST(
      registerReq({ email: "loops@creatoros.local", password: "pw-123" }),
    );
    const login = await loginPOST(
      jsonReq("http://localhost/api/v1/auth/login", {
        email: "loops@creatoros.local",
        password: "pw-123",
      }),
    );
    expect(login.status).toBe(200);
  });

  it("a duplicate email → 409 ConflictError envelope", async () => {
    await registerPOST(
      registerReq({ email: "dupe@creatoros.local", password: "pw-1" }),
    );
    const res = await registerPOST(
      registerReq({ email: "dupe@creatoros.local", password: "pw-2" }),
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("ConflictError");
  });

  it("missing password → 400 ValidationError, no cookie set", async () => {
    const res = await registerPOST(
      registerReq({ email: "x@creatoros.local" }),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
