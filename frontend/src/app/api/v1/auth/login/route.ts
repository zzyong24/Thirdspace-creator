import { NextResponse } from "next/server";
import { ErrorCode } from "@creatoros/contract";
import { getIdentityService } from "@/server/persistence-client";
import { AuthenticationError } from "@/server/modules/identity";
import {
  errorResponse,
  nextRequestId,
  sessionCookieValue,
} from "../_session";

// POST /api/v1/auth/login (Module 00, Task 9). Validate { email, password };
// call identity.login; on success set the httpOnly session cookie + return the
// user DTO; on AuthenticationError → 401 (SPEC §14). The route goes through
// identity.service only (never the db client — SPEC §22). The raw token is set
// on the cookie and NEVER returned in the body or logged (SPEC §20/§21).
//
// Input validation is hand-rolled (two non-empty strings) rather than zod: the
// frontend package does not depend on zod directly and the contract doesn't
// re-export it, so a manual guard keeps the dependency surface unchanged.

interface LoginBody {
  email: string;
  password: string;
}

function parseLoginBody(body: unknown): LoginBody | null {
  if (typeof body !== "object" || body === null) return null;
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== "string" || email.length < 1) return null;
  if (typeof password !== "string" || password.length < 1) return null;
  return { email, password };
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(ErrorCode.ValidationError, "Invalid JSON body");
  }

  const input = parseLoginBody(body);
  if (!input) {
    return errorResponse(ErrorCode.ValidationError, "Invalid login input");
  }

  const identity = await getIdentityService();
  try {
    const { user, rawToken, expiresAt } = await identity.login(input);
    const res = NextResponse.json({
      data: user,
      meta: { requestId: nextRequestId() },
    });
    res.headers.set("set-cookie", sessionCookieValue(rawToken, expiresAt));
    return res;
  } catch (err) {
    if (err instanceof AuthenticationError) {
      // Same generic message regardless of unknown-email vs wrong-password
      // (no user enumeration — SPEC §20).
      return errorResponse(ErrorCode.AuthenticationError, err.message);
    }
    throw err;
  }
}
