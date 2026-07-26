import { NextResponse } from "next/server";
import {
  ENDPOINTS,
  ErrorCode,
  ERROR_HTTP,
  type Endpoint,
} from "@creatoros/contract";
import { compositeTransport } from "@/server/persistence-client";
import {
  AuthenticationError,
  OwnershipError,
} from "@creatoros/backend/modules/identity";
import { readSessionCookie } from "../auth/_session";
import {
  resolveRequestContext,
  isAuthError,
  isOwnershipError,
} from "@/lib/request-context.server";
import {
  isTrustedLocalRequest,
  loopbackForbidden,
} from "@/lib/loopback-guard.server";

// RPC dispatch over HTTP. The browser's HttpTransport POSTs { id, input };
// this runs the matching contract operation against the SERVER store and
// returns the contract envelope.
//
// Task 9: this route now DERIVES the RequestContext from the session cookie
// (foundation §2 "RequestContext derivation"). No/invalid cookie → 401. The ctx
// is threaded as the transport's third arg (Task 8 signature). Thrown domain
// errors map to the SPEC §14 status table (OwnershipError → 404,
// AuthenticationError → 401, ConflictError → 409, else 501/400).

const ENDPOINTS_BY_ID: Record<string, Endpoint> = Object.fromEntries(
  Object.values(ENDPOINTS).map((e) => [e.id, e]),
);

function errorEnvelope(
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json(
    { error: { code, message, details }, meta: { requestId: "dispatch" } },
    { status: ERROR_HTTP[code] },
  );
}

export function dispatchErrorResponse(err: unknown): Response {
  // SPEC §14 status mapping for thrown domain errors.
  if (err instanceof AuthenticationError) {
    return errorEnvelope(ErrorCode.AuthenticationError, err.message);
  }
  if (err instanceof OwnershipError) {
    return errorEnvelope(ErrorCode.OwnershipError, err.message);
  }
  // Module/CDP errors carry a contract ErrorCode in `.code`. Keeping the
  // structured envelope here is what lets HttpTransport and UI act on the code.
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && code in ERROR_HTTP) {
    const rawDetails = (err as { details?: unknown }).details;
    const details =
      rawDetails && typeof rawDetails === "object"
        ? (rawDetails as Record<string, unknown>)
        : {};
    return errorEnvelope(
      code as ErrorCode,
      err instanceof Error ? err.message : String(err),
      details,
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  const status = /not implemented/i.test(message) ? 501 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request): Promise<Response> {
  // [RT-H01] 有副作用的 RPC 入口:先挡非本机/跨站请求(DNS rebinding + CSRF)。
  if (!isTrustedLocalRequest(req)) return loopbackForbidden();

  let payload: { id?: unknown; input?: unknown };
  try {
    payload = (await req.json()) as { id?: unknown; input?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const id = typeof payload.id === "string" ? payload.id : "";
  const endpoint = ENDPOINTS_BY_ID[id];
  if (!endpoint) {
    return NextResponse.json({ error: `unknown operation: ${id}` }, { status: 404 });
  }

  // Derive RequestContext. [T-046 单机免登录] 有 session cookie 照旧验 token;无/失效
  // cookie 以本机主用户直通(登录页已下线)。401 仅剩「库中无任何用户」的异常态兜底。
  // [T-136 切片 a → T-332 S3·关 GAP-02] x-account-id header = 前端当前选中的抖音号(从
  // localStorage 注入)。**绝不信任**:resolveRequestContext 内部以真实 userId 查号验属主
  // + active;验不过(不存在/不属主/已归档)→ 抛 OwnershipError → 下方转 404 **拒绝**,
  // 不再静默降级 null(降级会把失效号伪装成「未选号引导态」,不诚实;SPEC §4.3)。
  const rawToken = readSessionCookie(req);
  const accountId = req.headers.get("x-account-id");
  // [RT-H01] 状态变更类 op 要求「明确身份或拒绝」:present-but-invalid cookie 不静默降级
  //   主用户 → 上抛 → 401(缺失 cookie 仍走单机免登录直通,读 op 保持宽松)。契约 HttpMethod
  //   只有 GET/POST/PATCH/PUT/DELETE(无 HEAD),故「非 GET 即写路径」。
  const isMutation = endpoint.method !== "GET";
  let ctx;
  try {
    ctx = await resolveRequestContext(rawToken, accountId, {
      rejectInvalidToken: isMutation,
    });
  } catch (err) {
    // 结构化识别鉴权错误(跨 Next bundle 边界 instanceof 不可靠,故并用 code/name)。
    if (isAuthError(err)) {
      return errorEnvelope(
        ErrorCode.AuthenticationError,
        err instanceof Error ? err.message : "unauthorized",
      );
    }
    // [T-332 S3] 无效 x-account-id(不存在/不属主/已归档)→ 404 拒绝(同貌不泄露存在性;
    // 已归档时 details.reason = "account_archived",前端可给「重新激活」文案)。
    if (isOwnershipError(err)) {
      const rawDetails = (err as { details?: unknown }).details;
      return errorEnvelope(
        ErrorCode.OwnershipError,
        err instanceof Error ? err.message : "not found",
        rawDetails && typeof rawDetails === "object"
          ? (rawDetails as Record<string, unknown>)
          : {},
      );
    }
    throw err;
  }

  try {
    const envelope = await compositeTransport.request(
      endpoint,
      (payload.input ?? {}) as never,
      ctx,
    );
    return NextResponse.json(envelope);
  } catch (err) {
    return dispatchErrorResponse(err);
  }
}
