import { executionTimeoutMs } from "@creatoros/contract/timeout-policy";
import "server-only";

import {
  requestFreshClientConfigAccess,
  type FreshClientConfigAccess,
} from "./client-config.server";

const LEASE_PATH = "/api/client-config/managed-credential-leases";
const CONTRACT = "growth-managed-model-credential-lease-v1";
const MAX_RESPONSE_BYTES = 32_768;

export type ManagedAsrLease = {
  readonly baseUrl: string;
  readonly model: string;
  readonly token: string;
  readonly expiresAt: string;
  readonly chargedUnits: number;
};

export class ManagedCredentialLeaseError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fallbackLocal: boolean,
    readonly openCredits: boolean,
  ) {
    super(message);
    this.name = "ManagedCredentialLeaseError";
  }
}

type Dependencies = {
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
  readonly requestAccess?: () => Promise<FreshClientConfigAccess>;
};

function fail(
  code: string,
  message: string,
  fallbackLocal = true,
  openCredits = false,
): never {
  throw new ManagedCredentialLeaseError(
    code,
    message,
    fallbackLocal,
    openCredits,
  );
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
    return fail("ASR_LEASE_RESPONSE_INVALID", "语音转文字服务响应无法验证");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) {
    return fail("ASR_LEASE_RESPONSE_INVALID", "语音转文字服务响应无法验证");
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return fail("ASR_LEASE_RESPONSE_INVALID", "语音转文字服务响应无法验证");
  }
}

function responseErrorCode(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.code === "string") return row.code;
  const error = row.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  return typeof (error as Record<string, unknown>).code === "string"
    ? ((error as Record<string, unknown>).code as string)
    : null;
}

function mapHttpError(status: number, code: string | null): never {
  if (code === "AI_CREDIT_ACCOUNT_LINK_REQUIRED") {
    return fail(code, "请先连接 AI 额度账户", true, true);
  }
  if (code === "AI_CREDIT_INSUFFICIENT") {
    return fail(code, "AI 额度不足，请充值后再试。", true, true);
  }
  if (code === "ASR_LEASE_EXPIRED" || code === "ASR_LEASE_PROVIDER_UNKNOWN") {
    return fail(code, "语音转文字服务暂时不可用，已改用本地转写", true);
  }
  if (status === 422 || code === "ASR_LEASE_INPUT_INVALID") {
    return fail(code ?? "ASR_LEASE_INPUT_INVALID", "音频不符合在线转写要求", true);
  }
  if (status >= 500 || status === 429) {
    return fail(code ?? "ASR_LEASE_UNAVAILABLE", "语音转文字服务暂时不可用，已改用本地转写", true);
  }
  return fail(code ?? "ASR_LEASE_DENIED", "当前激活权益暂时无法使用语音转文字", true);
}

/**
 * 申请一次按次语音转文字授权。短效 token 只从本函数返回给当前服务端调用栈；调用方
 * 必须立即使用并丢弃，禁止保存到数据库、系统密钥库、URL、日志或埋点。
 */
export async function requestManagedAsrLease(
  input: {
    readonly serviceId: "qwen-asr-main";
    readonly durationSeconds: number;
    readonly byteLength: number;
    readonly idempotencyKey: string;
    readonly expectedBaseUrl: string;
    readonly expectedModel: "qwen3-asr-flash";
  },
  dependencies: Dependencies = {},
): Promise<ManagedAsrLease> {
  if (
    !Number.isInteger(input.durationSeconds) ||
    input.durationSeconds < 1 ||
    input.durationSeconds > 300 ||
    !Number.isInteger(input.byteLength) ||
    input.byteLength < 1 ||
    input.byteLength > 10_485_760 ||
    !/^[A-Za-z0-9._:-]{8,200}$/.test(input.idempotencyKey)
  ) {
    return fail("ASR_LEASE_INPUT_INVALID", "音频不符合在线转写要求", true);
  }
  const access = await (dependencies.requestAccess ?? requestFreshClientConfigAccess)();
  const endpoint = new URL(LEASE_PATH, access.growthOrigin);
  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)(endpoint.toString(), {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(executionTimeoutMs(10_000)),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${access.configAccessTicket}`,
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
        Pragma: "no-cache",
      },
      body: JSON.stringify({
        serviceId: input.serviceId,
        capability: "transcribe.audio",
        durationSeconds: input.durationSeconds,
        byteLength: input.byteLength,
      }),
    });
  } catch {
    return fail("ASR_LEASE_UNAVAILABLE", "语音转文字服务暂时不可用，已改用本地转写", true);
  }
  const cacheControl = response.headers.get("cache-control") ?? "";
  const pragma = response.headers.get("pragma") ?? "";
  const contentType = response.headers.get("content-type") ?? "";
  if (
    !/no-store/i.test(cacheControl) ||
    !/no-cache/i.test(pragma) ||
    !contentType.toLowerCase().startsWith("application/json")
  ) {
    return fail("ASR_LEASE_RESPONSE_INVALID", "语音转文字服务响应无法验证");
  }
  const value = await readJson(response);
  if (response.status !== 201 && response.status !== 200) {
    mapHttpError(response.status, responseErrorCode(value));
  }
  if (
    !exactObject(value, [
      "baseURL",
      "chargedUnits",
      "contractVersion",
      "credential",
      "expiresAt",
      "leaseRef",
      "limits",
      "model",
      "serviceId",
    ])
  ) {
    return fail("ASR_LEASE_RESPONSE_INVALID", "语音转文字服务响应无法验证");
  }
  const credential = value.credential;
  const limits = value.limits;
  if (
    value.contractVersion !== CONTRACT ||
    value.serviceId !== input.serviceId ||
    typeof value.leaseRef !== "string" ||
    !value.leaseRef.trim() ||
    value.baseURL !== input.expectedBaseUrl.replace(/\/$/, "") ||
    value.model !== input.expectedModel ||
    value.chargedUnits !== 25_000 ||
    !exactObject(credential, ["token", "type"]) ||
    credential.type !== "api_key" ||
    typeof credential.token !== "string" ||
    !credential.token.trim() ||
    !exactObject(limits, ["maxBytes", "maxDurationSeconds"]) ||
    limits.maxDurationSeconds !== 300 ||
    limits.maxBytes !== 10_485_760 ||
    typeof value.expiresAt !== "string"
  ) {
    return fail("ASR_LEASE_RESPONSE_INVALID", "语音转文字服务响应无法验证");
  }
  const expiresAtMs = Date.parse(value.expiresAt);
  const nowMs = (dependencies.now ?? (() => new Date()))().getTime();
  if (
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= nowMs ||
    expiresAtMs - nowMs > 120_000
  ) {
    return fail("ASR_LEASE_RESPONSE_INVALID", "语音转文字服务响应无法验证");
  }
  return {
    baseUrl: value.baseURL as string,
    model: value.model as string,
    token: credential.token,
    expiresAt: value.expiresAt,
    chargedUnits: value.chargedUnits as number,
  };
}
