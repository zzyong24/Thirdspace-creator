import { NextResponse } from "next/server";
import { ErrorCode } from "@creatoros/contract";
import { getIdentityService } from "@/server/persistence-client";
import { EmailTakenError } from "@creatoros/backend/modules/identity";
import {
  errorResponse,
  nextRequestId,
  sessionCookieValue,
} from "../_session";

// POST /api/v1/auth/register (P2 — 用户注册真账号). Validate { email, password,
// displayName? }; call identity.register; on success set the httpOnly session
// cookie + return the new user DTO (the registrant lands authenticated, like a
// post-login redirect); on EmailTakenError → 409 (SPEC §14). The route goes
// through identity.service only (never the db client — SPEC §22). The raw token
// is set on the cookie and NEVER returned in the body or logged (SPEC §20/§21).
//
// Input validation is hand-rolled (mirroring login/route.ts): the frontend
// package does not depend on zod directly and the contract doesn't re-export it,
// so a manual guard keeps the dependency surface unchanged.

interface RegisterBody {
  email: string;
  password: string;
  displayName?: string;
}

function parseRegisterBody(body: unknown): RegisterBody | null {
  if (typeof body !== "object" || body === null) return null;
  const { email, password, displayName } = body as Record<string, unknown>;
  if (typeof email !== "string" || email.length < 1) return null;
  if (typeof password !== "string" || password.length < 1) return null;
  if (displayName !== undefined && typeof displayName !== "string") return null;
  return {
    email,
    password,
    ...(typeof displayName === "string" && displayName.length > 0
      ? { displayName }
      : {}),
  };
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(ErrorCode.ValidationError, "Invalid JSON body");
  }

  const input = parseRegisterBody(body);
  if (!input) {
    return errorResponse(ErrorCode.ValidationError, "Invalid register input");
  }

  const identity = await getIdentityService();
  try {
    const { user, rawToken, expiresAt } = await identity.register(input);
    const res = NextResponse.json({
      data: user,
      meta: { requestId: nextRequestId() },
    });
    res.headers.set("set-cookie", sessionCookieValue(rawToken, expiresAt));
    return res;
  } catch (err) {
    if (err instanceof EmailTakenError) {
      // 409 — the chosen email is taken. Unlike login, registration MUST signal
      // the conflict so the user can pick another address.
      return errorResponse(ErrorCode.ConflictError, err.message);
    }
    throw err;
  }
}
