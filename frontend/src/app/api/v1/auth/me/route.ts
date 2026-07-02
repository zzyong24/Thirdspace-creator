import { NextResponse } from "next/server";
import { ErrorCode } from "@creatoros/contract";
import { getIdentityService } from "@/server/persistence-client";
import {
  AuthenticationError,
  OwnershipError,
} from "@creatoros/backend/modules/identity";
import { errorResponse, nextRequestId, readSessionCookie } from "../_session";
import { resolveRequestContext } from "@/lib/request-context.server";

// GET /api/v1/auth/me (Module 00, Task 9). Read the cookie → resolve ctx →
// getCurrentUser → user DTO. [T-046 单机免登录] 无/失效 cookie 以本机主用户直通;
// 401 仅剩「库中无任何用户」的异常态兜底。Goes through identity.service only (SPEC §22).

export async function GET(req: Request): Promise<Response> {
  const rawToken = readSessionCookie(req);
  const identity = await getIdentityService();
  try {
    const ctx = await resolveRequestContext(rawToken);
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
