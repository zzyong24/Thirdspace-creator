import { executionTimeoutMs } from "@creatoros/contract/timeout-policy";
import "server-only";

import { randomBytes } from "node:crypto";

import {
  ClientConfigPullError,
  requestFreshClientConfigAccess,
  type FreshClientConfigAccess,
} from "./client-config.server";

const LINK_SESSION_PATH = "/api/ai-credit-link-sessions";
const MAX_RESPONSE_BYTES = 32_768;

export type AiCreditPortalLink = {
  readonly openUrl: string;
  readonly expiresAt: string;
  readonly expiresIn: number;
};

export class AiCreditLinkError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiCreditLinkError";
  }
}

type Dependencies = {
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
  readonly requestAccess?: () => Promise<FreshClientConfigAccess>;
  readonly idempotencyKey?: () => string;
  readonly env?: Record<string, string | undefined>;
  readonly nonce?: () => string;
  readonly signal?: AbortSignal;
  readonly readVerdict?: import("./model-benefit.server").ModelBenefitDependencies["readVerdict"];
};

function fail(code: string, message: string, retryable: boolean): never {
  throw new AiCreditLinkError(code, message, retryable);
}

function exactObject(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

async function readJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > MAX_RESPONSE_BYTES) {
    return fail("AI_CREDIT_LINK_INVALID", "额度服务响应无法验证", true);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) {
    return fail("AI_CREDIT_LINK_INVALID", "额度服务响应无法验证", true);
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return fail("AI_CREDIT_LINK_INVALID", "额度服务响应无法验证", true);
  }
}

function validateNoStore(response: Response): void {
  const cacheControl = response.headers.get("cache-control") ?? "";
  const contentType = response.headers.get("content-type") ?? "";
  if (
    !/(?:^|,)\s*(?:private,\s*)?no-store(?:\s*,|$)/i.test(cacheControl) ||
    !contentType.toLowerCase().startsWith("application/json")
  ) {
    fail("AI_CREDIT_LINK_INVALID", "额度服务响应无法验证", true);
  }
}

function mapHttpError(status: number): never {
  if (status >= 500) {
    return fail(
      "AI_CREDIT_LINK_UNAVAILABLE",
      "AI 额度服务暂时不可用，请稍后重试",
      true,
    );
  }
  if (status === 409) {
    return fail(
      "AI_CREDIT_ACCOUNT_PENDING",
      "AI 额度账户正在准备，请先重新同步模型配置后再试",
      true,
    );
  }
  if (status === 410) {
    return fail(
      "AI_CREDIT_ACCESS_EXPIRED",
      "本次连接已过期，请重新打开额度中心",
      true,
    );
  }
  return fail(
    "AI_CREDIT_ACCESS_DENIED",
    "当前激活权益暂时无法打开 AI 额度",
    false,
  );
}

/**
 * 创建一次性额度连接。ticket 和 userCode 都只存在于本次 server 内存；返回地址把 code
 * 放在 fragment 中，禁止 query、日志和普通缓存。
 */
export async function createAiCreditPortalLink(
  dependencies: Dependencies = {},
): Promise<AiCreditPortalLink> {
  const idempotencyKey = (
    dependencies.idempotencyKey ??
    (() => randomBytes(18).toString("base64url"))
  )();
  let response: Response;
  let growthOrigin: URL;
  try {
    if ((dependencies.env ?? process.env).CREATOROS_MODEL_BENEFITS_ENABLED === "1") {
      const result = await (await import("./model-benefit.server")).requestModelBenefitLink(dependencies, idempotencyKey);
      response = result.response;
      growthOrigin = result.growthOrigin;
    } else {
      const access = await (dependencies.requestAccess ??
        (() => requestFreshClientConfigAccess({ purpose: "ai-credit-link", signal: dependencies.signal })))();
      growthOrigin = new URL(access.growthOrigin);
      const endpoint = new URL(LINK_SESSION_PATH, growthOrigin);
      response = await (dependencies.fetchImpl ?? fetch)(endpoint.toString(), {
      method: "POST",
      redirect: "manual",
      signal: dependencies.signal ? AbortSignal.any([dependencies.signal, AbortSignal.timeout(executionTimeoutMs(10_000))]) : AbortSignal.timeout(executionTimeoutMs(10_000)),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${access.configAccessTicket}`,
        "Idempotency-Key": idempotencyKey,
      },
      });
    }
  } catch (cause) {
    if (dependencies.signal?.aborted) throw new DOMException("本次额度页面打开已取消", "AbortError");
    if (cause instanceof ClientConfigPullError && cause.code === 'MODEL_BENEFIT_BINDING_STALE')
      return fail(cause.code,'当前电脑的原授权绑定需要核对，请使用升级原激活码入口恢复后再试',false);
    throw asAiCreditLinkError(cause);
  }
  if (dependencies.signal?.aborted) throw new DOMException("本次额度页面打开已取消", "AbortError");
  validateNoStore(response);
  const value = await readJson(response);
  if (response.status !== 200 && response.status !== 201) {
    mapHttpError(response.status);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("AI_CREDIT_LINK_INVALID", "额度服务响应无法验证", true);
  }
  const row = value as Record<string, unknown>;
  const flow = row.flow === undefined ? "link" : row.flow;
  const isLink = flow === "link";
  const isPortal = flow === "portal";
  const expectedKeys = isPortal
    ? ["expiresAt", "expiresIn", "flow", "linkRef", "verificationUrl"]
    : row.flow === undefined
      ? ["expiresAt", "expiresIn", "linkRef", "userCode", "verificationUrl"]
      : ["expiresAt", "expiresIn", "flow", "linkRef", "userCode", "verificationUrl"];
  if (
    (!isLink && !isPortal) ||
    !exactObject(row, expectedKeys) ||
    typeof row.linkRef !== "string" ||
    !row.linkRef.trim() ||
    typeof row.verificationUrl !== "string" ||
    typeof row.expiresAt !== "string" ||
    typeof row.expiresIn !== "number" ||
    !Number.isSafeInteger(row.expiresIn) ||
    row.expiresIn < 1 ||
    row.expiresIn > 600 ||
    (isLink &&
      (typeof row.userCode !== "string" ||
        !/^[A-Za-z0-9_-]{8,256}$/.test(row.userCode)))
  ) {
    return fail("AI_CREDIT_LINK_INVALID", "额度服务响应无法验证", true);
  }
  let verificationUrl: URL;
  try {
    verificationUrl = new URL(row.verificationUrl);
  } catch {
    return fail("AI_CREDIT_LINK_INVALID", "额度页面地址无法验证", true);
  }
  const expectedPath = isPortal ? "/credits/launch" : "/credits/connect";
  if (
    verificationUrl.origin !== growthOrigin.origin ||
    verificationUrl.protocol !== "https:" ||
    verificationUrl.username ||
    verificationUrl.password ||
    verificationUrl.pathname !== expectedPath ||
    verificationUrl.search ||
    (isPortal && !/^[#][A-Za-z0-9_-]{8,256}$/.test(verificationUrl.hash)) ||
    (isLink &&
      verificationUrl.hash &&
      verificationUrl.hash !== `#${row.userCode as string}`)
  ) {
    return fail("AI_CREDIT_LINK_INVALID", "额度页面地址无法验证", true);
  }
  const expiresAtMs = Date.parse(row.expiresAt);
  const nowMs = (dependencies.now ?? (() => new Date()))().getTime();
  if (
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= nowMs ||
    expiresAtMs - nowMs > 660_000
  ) {
    return fail("AI_CREDIT_LINK_INVALID", "额度连接有效期无法验证", true);
  }
  if (isLink && !verificationUrl.hash) {
    verificationUrl.hash = row.userCode as string;
  }
  return {
    openUrl: verificationUrl.toString(),
    expiresAt: row.expiresAt,
    expiresIn: row.expiresIn,
  };
}

export function asAiCreditLinkError(error: unknown): AiCreditLinkError {
  if (error instanceof AiCreditLinkError) return error;
  if (error instanceof ClientConfigPullError) {
    return new AiCreditLinkError(error.code, error.message, error.retryable);
  }
  return new AiCreditLinkError(
    "AI_CREDIT_LINK_UNAVAILABLE",
    "AI 额度服务暂时不可用，请稍后重试",
    true,
  );
}

const BOOTSTRAP_PATH = "/api/client-config/ai-credit-bootstrap-redemptions";
export type AiCreditBootstrapOperation = {
  readonly contractVersion: "growth-ai-credit-bootstrap-v1";
  readonly operationRef: string;
  readonly status: "pending" | "provider_unknown" | "applied" | "expired";
  readonly creditUnits: number;
  readonly expiresAt: string;
};
export class AiCreditBootstrapError extends AiCreditLinkError {
  constructor(code: string, message: string, retryable: boolean, readonly uncertain: boolean) {
    super(code, message, retryable);
    this.name = "AiCreditBootstrapError";
  }
}
export function isAiCreditBootstrapRef(value: unknown): value is string {
  return typeof value === "string" && /^AICLE-[A-Za-z0-9_-]{6,96}$/.test(value);
}
function bootstrapError(code: string, message: string, uncertain = false, retryable = false): never {
  throw new AiCreditBootstrapError(code, message, retryable, uncertain);
}
function bootstrapResult(value: unknown, operationRef?: string): AiCreditBootstrapOperation {
  if (!exactObject(value, ["contractVersion", "operationRef", "status", "creditUnits", "expiresAt"]) ||
      value.contractVersion !== "growth-ai-credit-bootstrap-v1" ||
      !isAiCreditBootstrapRef(value.operationRef) ||
      (operationRef !== undefined && value.operationRef !== operationRef) ||
      typeof value.status !== "string" || !["pending", "provider_unknown", "applied", "expired"].includes(value.status) ||
      typeof value.creditUnits !== "number" || !Number.isSafeInteger(value.creditUnits) || value.creditUnits <= 0 ||
      typeof value.expiresAt !== "string" || !/(?:Z|\+00:00)$/.test(value.expiresAt) ||
      !Number.isFinite(Date.parse(value.expiresAt))) {
    return bootstrapError("AI_CREDIT_BOOTSTRAP_INVALID", "开通结果无法验证，请查询原操作，不要更换充值码", true, true);
  }
  return value as unknown as AiCreditBootstrapOperation;
}
function bootstrapHttpError(response: Response, value: unknown, creating: boolean): never {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const detail = row.error && typeof row.error === "object" ? row.error as Record<string, unknown> : {};
  const code = typeof detail.code === "string" ? detail.code : "AI_CREDIT_BOOTSTRAP_UNAVAILABLE";
  if (response.status === 409 && code === "AI_CREDIT_BOOTSTRAP_ALREADY_CONFIGURED") {
    return bootstrapError(code, "已有官方额度账户，请打开额度中心沿原流程充值");
  }
  if ((response.status === 409 && code === "AI_CREDIT_CODE_UNAVAILABLE") ||
      (response.status === 422 && code === "AI_CREDIT_INPUT_INVALID")) {
    return bootstrapError(code, "充值码当前不可兑换，请核对原充值码");
  }
  if (response.status === 404 && code === "AI_CREDIT_BOOTSTRAP_NOT_FOUND") {
    return bootstrapError(code, "未找到当前权益下的操作，请核对原操作编号");
  }
  if (response.status === 401 || response.status === 403) {
    return bootstrapError("AI_CREDIT_ACCESS_DENIED", "当前权益无法开通官方额度，请重新校验授权");
  }
  // 不转发上游 message、凭据、账户身份或未经登记的错误字段。
  return bootstrapError("AI_CREDIT_BOOTSTRAP_UNAVAILABLE", "到账结果尚未确认，请保留原操作并查询，不要更换充值码", creating, true);
}
async function requestCreditBootstrap(
  input: { readonly action: "reserve"; readonly serviceId: string; readonly code: string; readonly idempotencyKey: string } |
         { readonly action: "read" | "resume"; readonly operationRef: string },
  dependencies: Dependencies = {},
): Promise<AiCreditBootstrapOperation> {
  if (input.action === "reserve") {
    if (input.serviceId !== "omnihi-main" || !/^AICR-[A-Za-z0-9_-]{35,59}$/.test(input.code) ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey)) {
      return bootstrapError("AI_CREDIT_INPUT_INVALID", "请输入自己的有效充值码");
    }
  } else if (!isAiCreditBootstrapRef(input.operationRef)) {
    return bootstrapError("AI_CREDIT_INPUT_INVALID", "请填写原操作编号");
  }
  // 该 private purpose 的票据兼容片段需由 Root 串行接入；默认 fresh/ASR/报价仍 v3。
  const access = await (dependencies.requestAccess ??
    (() => requestFreshClientConfigAccess({ purpose: "ai-credit-bootstrap" })))();
  const growthOrigin = new URL(access.growthOrigin);
  if (growthOrigin.protocol !== "https:" || growthOrigin.username || growthOrigin.password || growthOrigin.search || growthOrigin.hash) {
    return bootstrapError("AI_CREDIT_ACCESS_DENIED", "额度服务地址无法验证");
  }
  const creating = input.action === "reserve";
  const path = creating ? BOOTSTRAP_PATH : `${BOOTSTRAP_PATH}/${encodeURIComponent(input.operationRef)}${input.action === "resume" ? "/resume" : ""}`;
  const endpoint = new URL(path, growthOrigin);
  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)(endpoint.toString(), {
      method: input.action === "read" ? "GET" : "POST", redirect: "manual", cache: "no-store",
      signal: AbortSignal.timeout(executionTimeoutMs(120_000)),
      headers: {
        Accept: "application/json", Authorization: `Bearer ${access.configAccessTicket}`,
        ...(input.action === "read" ? {} : { "Content-Type": "application/json" }),
        ...(creating ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      ...(creating ? { body: JSON.stringify({ serviceId: input.serviceId, code: input.code }) } :
          input.action === "resume" ? { body: "{}" } : {}),
    });
  } catch {
    return bootstrapError("AI_CREDIT_BOOTSTRAP_UNAVAILABLE", "到账结果尚未确认，请保留原操作并查询，不要更换充值码", creating, true);
  }
  let value: unknown;
  try { validateNoStore(response); value = await readJson(response); }
  catch { return bootstrapError("AI_CREDIT_BOOTSTRAP_INVALID", "开通结果无法验证，请查询原操作，不要更换充值码", creating, true); }
  if (!response.ok) bootstrapHttpError(response, value, creating);
  if (![200, 201, 202].includes(response.status)) {
    return bootstrapError("AI_CREDIT_BOOTSTRAP_INVALID", "开通结果无法验证，请查询原操作，不要更换充值码", creating, true);
  }
  return bootstrapResult(value, creating ? undefined : input.operationRef);
}
export function reserveAiCreditBootstrap(input: { serviceId: string; code: string; idempotencyKey: string }, dependencies: Dependencies = {}) {
  return requestCreditBootstrap({ action: "reserve", ...input }, dependencies);
}
export function readAiCreditBootstrap(operationRef: string, dependencies: Dependencies = {}) {
  return requestCreditBootstrap({ action: "read", operationRef }, dependencies);
}
export function resumeAiCreditBootstrap(operationRef: string, dependencies: Dependencies = {}) {
  return requestCreditBootstrap({ action: "resume", operationRef }, dependencies);
}

/** 本地请求的同一 session 校验与有界 closed body；不解析上游 scope 或金额。 */
export async function authorizeAiCreditBootstrapRequest(request: Request): Promise<void> {
  if (new URL(request.url).search || ["x-project-key", "x-channel-ref", "x-client-id", "x-account-ref"].some(key => request.headers.has(key))) {
    return bootstrapError("AI_CREDIT_INPUT_INVALID", "请求格式不正确");
  }
  const { readSessionCookie } = await import("@/app/api/v1/auth/_session");
  const { resolveRequestWorkspaceContext } = await import("@/lib/request-context.server");
  try {
    await resolveRequestWorkspaceContext(readSessionCookie(request), request, { rejectInvalidToken: true, groupSelectionMode: "reject" });
  } catch { return bootstrapError("AI_CREDIT_SESSION_INVALID", "当前账号状态无效，请重新打开软件后重试"); }
}
export async function readAiCreditBootstrapBody(request: Request, kind: "reserve" | "read" | "resume"): Promise<Record<string, unknown>> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared.trim()) || Number(declared) > 1024)) {
    return bootstrapError("AI_CREDIT_INPUT_INVALID", "请求格式不正确");
  }
  if (kind !== "read" && request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return bootstrapError("AI_CREDIT_INPUT_INVALID", "请求格式不正确");
  }
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    if (reader) for (;;) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.byteLength;
      if (length > 1024) return bootstrapError("AI_CREDIT_INPUT_INVALID", "请求格式不正确");
      chunks.push(next.value);
    }
  } finally { try { await reader?.cancel(); } catch { /* 已结束 */ } }
  if (kind === "read") {
    if (length) return bootstrapError("AI_CREDIT_INPUT_INVALID", "查询不接受请求内容");
    return {};
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let value: unknown; try { value = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return bootstrapError("AI_CREDIT_INPUT_INVALID", "请求格式不正确"); }
  if (!exactObject(value, kind === "reserve" ? ["serviceId", "code"] : [])) {
    return bootstrapError("AI_CREDIT_INPUT_INVALID", "请求格式不正确");
  }
  if (kind === "reserve" && (value.serviceId !== "omnihi-main" || typeof value.code !== "string")) {
    return bootstrapError("AI_CREDIT_INPUT_INVALID", "请求格式不正确");
  }
  return value;
}
export function aiCreditBootstrapLocalFailure(cause: unknown): { readonly body: object; readonly status: number } {
  const error = asAiCreditLinkError(cause);
  const uncertain = cause instanceof AiCreditBootstrapError && cause.uncertain;
  const status = error.code === "AI_CREDIT_SESSION_INVALID" ? 401 : error.code === "AI_CREDIT_INPUT_INVALID" ? 422 :
    error.code === "AI_CREDIT_BOOTSTRAP_ALREADY_CONFIGURED" ? 409 : error.retryable ? 503 : 403;
  return { body: { error: error.message, code: error.code, retryable: error.retryable, uncertain }, status };
}
