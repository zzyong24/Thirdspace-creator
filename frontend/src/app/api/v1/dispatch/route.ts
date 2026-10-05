import { NextResponse } from "next/server";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ENDPOINTS,
  ErrorCode,
  ERROR_HTTP,
  getCliOperationPolicy,
  listEnvelope,
  successEnvelope,
  type Endpoint,
} from "@creatoros/contract";
import {
  compositeTransport,
  getCliInvocationService,
  getReportingLocal,
} from "@/server/persistence-client";
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

const CLI_ACCESS_HEADER = "x-creatoros-cli-access";
const CLI_ACTIVITY_WINDOW_MS = 5 * 60 * 1000;
const cliActivity = new Map<string, number>();

function secretsEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface ExpectedCliCredential {
  readonly accessToken: string;
  readonly productId: string | null;
  readonly packageId: string | null;
  readonly launchNonce: string | null;
}

function expectedCliCredential(): ExpectedCliCredential | null {
  const credentialFile = process.env.CREATOROS_CLI_ACCESS_FILE?.trim();
  if (credentialFile) {
    try {
      const value = JSON.parse(readFileSync(credentialFile, "utf8")) as {
        schema?: unknown;
        productId?: unknown;
        packageId?: unknown;
        cliAccessToken?: unknown;
        launchNonce?: unknown;
      };
      if (
        value.schema !== "creatoros-cli-credential/v1" ||
        typeof value.productId !== "string" || !value.productId.trim() ||
        typeof value.packageId !== "string" || !value.packageId.trim() ||
        typeof value.cliAccessToken !== "string" || !value.cliAccessToken.trim() ||
        typeof value.launchNonce !== "string" || !value.launchNonce.trim()
      ) return null;
      return {
        accessToken: value.cliAccessToken,
        productId: value.productId,
        packageId: value.packageId,
        launchNonce: value.launchNonce,
      };
    } catch {
      // 文件不存在 = 用户未开启或刚撤销；每次请求重读，撤销立即生效。
      return null;
    }
  }
  // 显式开发/聚焦测试兼容；正式桌面始终注入 CREATOROS_CLI_ACCESS_FILE。
  const accessToken = process.env.CREATOROS_CLI_ACCESS_TOKEN?.trim();
  return accessToken
    ? { accessToken, productId: null, packageId: null, launchNonce: null }
    : null;
}

function recordCliActivity(clientId: string): void {
  const credentialFile = process.env.CREATOROS_CLI_ACCESS_FILE?.trim();
  if (!credentialFile) return;
  const now = Date.now();
  cliActivity.set(clientId, now);
  for (const [id, seenAt] of cliActivity) {
    if (now - seenAt > CLI_ACTIVITY_WINDOW_MS) cliActivity.delete(id);
  }
  const activityPath = join(dirname(credentialFile), "activity.json");
  const temp = `${activityPath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    writeFileSync(
      temp,
      JSON.stringify({
        schema: "creatoros-cli-activity/v1",
        activeConnections: cliActivity.size,
        lastInvocationAt: now,
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    chmodSync(temp, 0o600);
    renameSync(temp, activityPath);
  } catch {
    // 活动展示是可观测性旁路；失败不能改变真实授权或业务调用结果。
    try { rmSync(temp, { force: true }); } catch { /* 旁路清理同样不影响调用 */ }
  }
}

export function validateCliInvocation(
  req: Request,
  endpoint: Endpoint,
): Response | null {
  const supplied = req.headers.get(CLI_ACCESS_HEADER);
  if (!supplied) return null;
  const expected = expectedCliCredential();
  if (!expected || !secretsEqual(supplied, expected.accessToken)) {
    return NextResponse.json(
      { error: { code: "CLI_ACCESS_DENIED", message: "CLI 完整访问未开启或已撤销。" } },
      { status: 403 },
    );
  }
  if (
    expected.productId !== null &&
    (
      req.headers.get("x-creatoros-cli-product-id") !== expected.productId ||
      req.headers.get("x-creatoros-cli-package-id") !== expected.packageId ||
      !secretsEqual(
        req.headers.get("x-creatoros-cli-launch-nonce") ?? "",
        expected.launchNonce ?? "",
      )
    )
  ) {
    return NextResponse.json(
      { error: { code: "CLI_LAUNCH_IDENTITY_MISMATCH", message: "CLI 包身份或本次启动 nonce 不匹配。" } },
      { status: 403 },
    );
  }
  const clientId = req.headers.get("x-creatoros-cli-client-id")?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: { code: "CLI_CLIENT_ID_REQUIRED", message: "CLI 调用缺少客户端审计 ID。" } },
      { status: 409 },
    );
  }
  recordCliActivity(clientId);
  const policy = getCliOperationPolicy(endpoint.id);
  if (!policy) {
    return NextResponse.json(
      { error: { code: "CLI_POLICY_MISSING", message: "该操作缺少 CLI 安全策略。" } },
      { status: 501 },
    );
  }
  if (policy.effect === "read") return null;
  if (req.headers.get("x-creatoros-cli-apply") !== "1") {
    return NextResponse.json(
      { error: { code: "CLI_APPLY_REQUIRED", message: "写操作必须显式使用 --apply。" } },
      { status: 409 },
    );
  }
  if (!req.headers.get("x-idempotency-key")?.trim()) {
    return NextResponse.json(
      { error: { code: "CLI_IDEMPOTENCY_REQUIRED", message: "写操作必须提供幂等键。" } },
      { status: 409 },
    );
  }
  if (
    policy.confirmation === "confirm_impact" &&
    !req.headers.get("x-creatoros-cli-confirm-impact")?.trim()
  ) {
    return NextResponse.json(
      { error: { code: "CLI_IMPACT_REQUIRED", message: "高影响操作必须明确 --confirm-impact 目标。" } },
      { status: 409 },
    );
  }
  return null;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

function cliInputHash(input: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(input)).digest("hex")}`;
}

function cliTargetRefs(input: unknown, accountId: string | null | undefined): string[] {
  const refs = new Set<string>();
  if (accountId) refs.add(accountId);
  const visit = (value: unknown, key = ""): void => {
    if (typeof value === "string") {
      if (
        /(?:^id$|Id$)/.test(key) &&
        /^[a-zA-Z0-9._:-]{1,200}$/.test(value)
      ) refs.add(value);
      return;
    }
    if (Array.isArray(value)) {
      if (/Ids$/.test(key)) value.forEach((item) => visit(item, "id"));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      visit(child, childKey);
    }
  };
  visit(input);
  return [...refs].sort();
}

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
  // SEMANTIC_BOUNDARY_ALLOW: 识别数据库资源授权守卫的固定错误协议，不按业务正文猜错误。
  let resourceError:unknown=err;
  for(let depth=0;depth<5&&resourceError&&typeof resourceError==='object';depth++){
    const row=resourceError as {code?:unknown;message?:unknown;cause?:unknown};
    if(row.code==='40001'&&typeof row.message==='string'&&row.message.startsWith('GROUP_RESOURCE_SCOPE_CONFLICT:'))return errorEnvelope(ErrorCode.ConflictError,row.message.slice('GROUP_RESOURCE_SCOPE_CONFLICT:'.length).trim());
    resourceError=row.cause;
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

export function safeDispatchErrorDiagnostic(
  operation: string,
  err: unknown,
): {
  readonly operation: string;
  readonly errorName: string;
  readonly errorCode: string | null;
} {
  const errorName =
    err instanceof Error
      ? err.name
      : typeof (err as { name?: unknown } | null)?.name === "string"
        ? String((err as { name: string }).name)
        : "UnknownError";
  const rawCode = (err as { code?: unknown } | null)?.code;
  return {
    operation,
    errorName,
    errorCode: typeof rawCode === "string" ? rawCode : null,
  };
}

export function shouldCaptureDispatchFailure(operationId:string,err:unknown):boolean {
  if(operationId.startsWith("settings.reporting."))return false;
  const rawCode=(err as {code?:unknown}|null)?.code;
  const mappedStatus=typeof rawCode==="string" && rawCode in ERROR_HTTP ? ERROR_HTTP[rawCode as ErrorCode] : null;
  return mappedStatus===null || mappedStatus>=500;
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

  const cliRejection = validateCliInvocation(req, endpoint);
  if (cliRejection) return cliRejection;
  const isCliInvocation = Boolean(req.headers.get(CLI_ACCESS_HEADER));

  // Derive RequestContext. [T-046 单机免登录] 有 session cookie 照旧验 token;无/失效
  // cookie 以本机主用户直通(登录页已下线)。401 仅剩「库中无任何用户」的异常态兜底。
  // [T-136 切片 a → T-332 S3·关 GAP-02] x-account-id header = 前端当前选中的抖音号(从
  // localStorage 注入)。**绝不信任**:resolveRequestContext 内部以真实 userId 查号验属主
  // + active;验不过(不存在/不属主/已归档)→ 抛 OwnershipError → 下方转 404 **拒绝**,
  // 不再静默降级 null(降级会把失效号伪装成「未选号引导态」,不诚实;SPEC §4.3)。
  const rawToken = readSessionCookie(req);
  // 用户域管理读不依赖当前选择；失效选择也要能从真实账号组列表恢复。
  const selectionIndependentRead=new Set(["accountGroups.list","accountGroups.get","accounts.list","accounts.get","accounts.bindingCapabilities"]).has(endpoint.id);
  const accountId = selectionIndependentRead?null:req.headers.get("x-account-id");
  // [RT-H01] 状态变更类 op 要求「明确身份或拒绝」:present-but-invalid cookie 不静默降级
  //   主用户 → 上抛 → 401(缺失 cookie 仍走单机免登录直通,读 op 保持宽松)。契约 HttpMethod
  //   只有 GET/POST/PATCH/PUT/DELETE(无 HEAD),故「非 GET 即写路径」。
  const isMutation = endpoint.method !== "GET";
  let ctx;
  try {
    ctx = await resolveRequestContext(rawToken, accountId, {
      rejectInvalidToken: isMutation,
      groupId: req.headers.get("x-group-id"),
      groupSelectionMode:selectionIndependentRead?"unselected":"reject",
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

  let cliInvocationId: string | null = null;
  try {
    if (isCliInvocation) {
      const policy = getCliOperationPolicy(endpoint.id);
      if (!policy) {
        return NextResponse.json(
          { error: { code: "CLI_POLICY_MISSING", message: "该操作缺少 CLI 安全策略。" } },
          { status: 501 },
        );
      }
      const invocationService = await getCliInvocationService();
      const targetRefs = cliTargetRefs(payload.input ?? {}, ctx.accountId);
      const impact = req.headers.get("x-creatoros-cli-confirm-impact")?.trim() ?? "";
      const confirmedRefs = new Set(
        impact.split(/[^a-zA-Z0-9._:-]+/).filter(Boolean),
      );
      if (
        policy.confirmation === "confirm_impact" &&
        targetRefs.length > 0 &&
        !targetRefs.some((ref) => confirmedRefs.has(ref))
      ) {
        return NextResponse.json(
          {
            error: {
              code: "CLI_IMPACT_TARGET_MISMATCH",
              message: "--confirm-impact 必须明确包含本次操作的真实账号或实体 ID。",
              details: { targetRefs },
            },
          },
          { status: 409 },
        );
      }
      const begin = await invocationService.begin(ctx, {
        operation: endpoint.id,
        effect: policy.effect,
        clientId: req.headers.get("x-creatoros-cli-client-id")!.trim(),
        idempotencyKey: req.headers.get("x-idempotency-key")?.trim() || null,
        inputHash: cliInputHash(payload.input ?? {}),
        targetRefs,
      });
      if (begin.kind === "conflict") {
        return NextResponse.json(
          {
            error: {
              code: "CLI_IDEMPOTENCY_CONFLICT",
              message: "同一幂等键已用于不同输入，未执行任何业务写入。",
              details: { originalRequestId: begin.requestId },
            },
          },
          { status: 409 },
        );
      }
      if (begin.kind === "cached") {
        return NextResponse.json(begin.response);
      }
      if (begin.kind === "receipt") {
        const status = begin.receipt.outcomeUnknown ? 409 : begin.receipt.status === "running" ? 202 : 200;
        return NextResponse.json(
          { data: null, receipt: begin.receipt, meta: { requestId: begin.receipt.requestId } },
          { status },
        );
      }
      cliInvocationId = begin.invocationId;
    }
    const rawEnvelope = await compositeTransport.request(
      endpoint,
      (payload.input ?? {}) as never,
      ctx,
    );
    // 普通 UI 路径保持现状；CLI 的跨进程幂等缓存只接受 contract 验证过的响应，禁止把
    // 运行时偶发的畸形 envelope 加密固化 24 小时。
    const envelope = isCliInvocation
      ? (endpoint.isList
          ? listEnvelope(endpoint.response)
          : successEnvelope(endpoint.response)
        ).parse(rawEnvelope)
      : rawEnvelope;
    if (cliInvocationId) {
      await (await getCliInvocationService()).succeed(cliInvocationId, envelope);
    }
    return NextResponse.json(envelope);
  } catch (err) {
    if (cliInvocationId) {
      const rawCode = (err as { code?: unknown } | null)?.code;
      await (await getCliInvocationService()).fail(
        cliInvocationId,
        typeof rawCode === "string" ? rawCode : null,
      ).catch(() => undefined);
    }
    // [T-546] UI 不能再出现“报错但日志无证据”。只记操作 ID、异常类型与契约码，
    // 不记 message/details/input，避免 URL query、Cookie、Authorization 或用户正文落日志。
    console.error(
      "[CreatorOS] DISPATCH_FAILED",
      JSON.stringify(safeDispatchErrorDiagnostic(id, err)),
    );
    if (shouldCaptureDispatchFailure(id,err)) {
      void getReportingLocal()
        .then(reporting=>reporting.captureDiagnostic(ctx,"operation_failed",ctx.requestId,new Date().toISOString(),id))
        .catch(()=>undefined);
    }
    return dispatchErrorResponse(err);
  }
}
