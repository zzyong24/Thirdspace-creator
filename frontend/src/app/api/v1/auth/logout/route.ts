import { NextResponse } from "next/server";
import { getIdentityService } from "@/server/persistence-client";
import { AuthenticationError } from "@creatoros/backend/modules/identity";
import {
  clearSessionCookieValue,
  nextRequestId,
  readSessionCookie,
} from "../_session";

// POST /api/v1/auth/logout (Module 00, Task 9). Read the cookie → resolve ctx →
// user-scoped revoke; always clear the cookie and return 200 (logout is
// idempotent — a missing/invalid cookie is still a successful "you're logged
// out"). Goes through identity.service only (SPEC §22).

export async function POST(req: Request): Promise<Response> {
  const rawToken = readSessionCookie(req);
  const identity = await getIdentityService();

  if (rawToken) {
    try {
      const ctx = await identity.resolveContextFromToken(rawToken);
      await identity.logout(ctx, rawToken); // user-scoped revoke
    } catch (err) {
      // An already-invalid/expired session is a no-op: still log the user out.
      if (!(err instanceof AuthenticationError)) throw err;
    }
  }

  const res = NextResponse.json({
    data: { ok: true },
    meta: { requestId: nextRequestId() },
  });
  res.headers.set("set-cookie", clearSessionCookieValue());
  return res;
}
