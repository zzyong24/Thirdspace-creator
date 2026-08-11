import "server-only";

import {
  requestFreshClientConfigAccess,
  type FreshClientConfigAccess,
} from "./client-config.server";

const LEASE_PATH = "/api/client-config/managed-credential-leases";
const CONTRACT = "growth-managed-model-credential-lease-v1";
const MAX_RESPONSE_BYTES = 32_768;

export type ManagedAsrLease = {
  readonly leaseRef: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly token: string;
  readonly expiresAt: string;
  readonly chargedUnits: number;
};

export class ManagedCredentialLeaseError extends Error {
  readonly phase: "preflight" | "ticket_acquiring" | "lease_requesting" | "lease_status" | "provider_calling";
  readonly leaseResult: "not_issued" | "lease_unknown" | "provider_unknown" | "released" | "charged_expired" | null;
  readonly leaseRef: string | null;
  readonly chargedUnits: number | null;

  constructor(
    readonly code: string,
    message: string,
    readonly fallbackLocal: boolean,
    readonly openCredits: boolean,
    meta: {
      readonly phase?: ManagedCredentialLeaseError["phase"];
      readonly leaseResult?: ManagedCredentialLeaseError["leaseResult"];
      readonly leaseRef?: string | null;
      readonly chargedUnits?: number | null;
    } = {},
  ) {
    super(message);
    this.name = "ManagedCredentialLeaseError";
    this.phase = meta.phase ?? "preflight";
    this.leaseResult = meta.leaseResult ?? null;
    this.leaseRef = meta.leaseRef ?? null;
    this.chargedUnits = meta.chargedUnits ?? null;
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
  fallbackLocal = false,
  openCredits = false,
  meta: ConstructorParameters<typeof ManagedCredentialLeaseError>[4] = {},
): never {
  throw new ManagedCredentialLeaseError(
    code,
    message,
    fallbackLocal,
    openCredits,
    meta,
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
  const notIssued = {
    phase: "lease_status" as const,
    leaseResult: "not_issued" as const,
  };
  if (code === "AI_CREDIT_ACCOUNT_LINK_REQUIRED") {
    return fail(code, "请先连接 AI 额度账户", false, true, notIssued);
  }
  if (code === "AI_CREDIT_INSUFFICIENT") {
    return fail(code, "AI 额度不足，请充值后再试。", false, true, notIssued);
  }
  if (code === "ASR_LEASE_EXPIRED" || code === "ASR_LEASE_PROVIDER_UNKNOWN") {
    return fail(code, "语音转文字服务暂时不可用，已改用本地转写", true);
  }
  if (status === 422 || code === "ASR_LEASE_INPUT_INVALID") {
    return fail(code ?? "ASR_LEASE_INPUT_INVALID", "音频不符合在线转写要求", true, false, notIssued);
  }
  if (status >= 500 || status === 429) {
    return fail(code ?? "ASR_LEASE_UNAVAILABLE", "语音转文字服务暂时不可用，已改用本地转写", true);
  }
  return fail(code ?? "ASR_LEASE_DENIED", "当前激活权益暂时无法使用语音转文字", false, false, notIssued);
}

function parseLeaseStatus(value: unknown): never | void {
  if (
    !exactObject(value, [
      "chargeState",
      "chargedUnits",
      "contractVersion",
      "leaseRef",
      "result",
      "terminalStatus",
    ]) ||
    value.contractVersion !== "growth-managed-model-credential-lease-status-v1" ||
    !["not_issued", "provider_unknown", "released", "charged_expired"].includes(
      String(value.result),
    ) ||
    (value.leaseRef !== null && (typeof value.leaseRef !== "string" || !value.leaseRef.trim()))
  ) {
    return;
  }
  const expected = {
    not_issued: ["none", 0, "released"],
    provider_unknown: ["reserved", 0, "pending"],
    released: ["none", 0, "released"],
    charged_expired: ["committed", 25_000, "expired"],
  } as const;
  const result = value.result as keyof typeof expected;
  const [chargeState, chargedUnits, terminalStatus] = expected[result];
  if (
    value.chargeState !== chargeState ||
    value.chargedUnits !== chargedUnits ||
    value.terminalStatus !== terminalStatus ||
    (result !== "not_issued" && typeof value.leaseRef !== "string")
  ) {
    return;
  }
  const code = {
    not_issued: "ASR_LEASE_NOT_ISSUED",
    provider_unknown: "ASR_LEASE_PROVIDER_UNKNOWN",
    released: "ASR_LEASE_RELEASED",
    charged_expired: "ASR_LEASE_CHARGED_EXPIRED",
  }[result];
  return fail(
    code,
    result === "charged_expired"
      ? "本次云端转写授权已结束，请重新发起或改用本地转写"
      : "语音转文字服务暂时不可用，可以改用本地转写",
    result !== "not_issued",
    false,
    {
      phase: "lease_status",
      leaseResult: result,
      leaseRef: value.leaseRef as string | null,
      chargedUnits,
    },
  );
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
  let access: FreshClientConfigAccess;
  try {
    access = await (dependencies.requestAccess ?? requestFreshClientConfigAccess)();
  } catch {
    return fail(
      "ASR_TICKET_UNAVAILABLE",
      "暂时无法验证当前权益，请稍后重试",
      false,
      false,
      { phase: "ticket_acquiring", leaseResult: "not_issued" },
    );
  }
  const endpoint = new URL(LEASE_PATH, access.growthOrigin);
  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)(endpoint.toString(), {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
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
    return fail(
      "ASR_LEASE_UNAVAILABLE",
      "语音转文字服务暂时不可用，可以改用本地转写",
      true,
      false,
      { phase: "lease_requesting", leaseResult: "lease_unknown" },
    );
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
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).contractVersion ===
      "growth-managed-model-credential-lease-status-v1"
  ) {
    parseLeaseStatus(value);
    return fail("ASR_LEASE_RESPONSE_INVALID", "语音转文字服务响应无法验证");
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
    leaseRef: value.leaseRef as string,
    baseUrl: value.baseURL as string,
    model: value.model as string,
    token: credential.token,
    expiresAt: value.expiresAt,
    chargedUnits: value.chargedUnits as number,
  };
}
