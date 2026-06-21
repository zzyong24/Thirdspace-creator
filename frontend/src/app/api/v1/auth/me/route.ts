import { NextResponse } from "next/server";
import { ErrorCode } from "@creatoros/contract";
import { getIdentityService } from "@/server/persistence-client";
import {
  AuthenticationError,
  OwnershipError,
} from "@/server/modules/identity";
import { errorResponse, nextRequestId, readSessionCookie } from "../_session";

// GET /api/v1/auth/me (Module 00, Task 9). Read the cookie → resolve ctx →
// getCurrentUser → user DTO. No/invalid cookie → 401 (SPEC §14). Goes through
// identity.service only (SPEC §22).

export async function GET(req: Request): Promise<Response> {
  const rawToken = readSessionCookie(req);
  if (!rawToken) {
    return errorResponse(ErrorCode.AuthenticationError, "Not authenticated");
  }

  const identity = await getIdentityService();
  try {
    const ctx = await identity.resolveContextFromToken(rawToken);
    const user = await identity.getCurrentUser(ctx);
    return NextResponse.json({
      data: user,
      meta: { requestId: nextRequestId() },
    });
  } catch (err) {
    if (err instanceof AuthenticationError) {
      return errorResponse(ErrorCode.AuthenticationError, err.message);
    }
    if (err instanceof OwnershipError) {
      return errorResponse(ErrorCode.OwnershipError, err.message);
    }
    throw err;
  }
}
