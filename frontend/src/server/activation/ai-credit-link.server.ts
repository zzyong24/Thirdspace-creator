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
  const access = await (dependencies.requestAccess ??
    requestFreshClientConfigAccess)();
  const growthOrigin = new URL(access.growthOrigin);
  const endpoint = new URL(LINK_SESSION_PATH, growthOrigin);
  const idempotencyKey = (
    dependencies.idempotencyKey ??
    (() => randomBytes(18).toString("base64url"))
  )();
  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)(endpoint.toString(), {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(executionTimeoutMs(10_000)),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${access.configAccessTicket}`,
        "Idempotency-Key": idempotencyKey,
      },
    });
  } catch {
    return fail(
      "AI_CREDIT_LINK_UNAVAILABLE",
      "AI 额度服务暂时不可用，请稍后重试",
      true,
    );
  }
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
