import { describe, expect, it, vi } from "vitest";

import {
  ManagedCredentialLeaseError,
  requestManagedAsrLease,
} from "./managed-credential-lease.server";

const NOW = new Date("2026-08-06T12:00:00.000Z");
const requestAccess = async () => ({
  configAccessTicket: "ticket-secret-value",
  expiresAt: "2026-08-06T12:01:00.000Z",
  growthOrigin: "https://growth.example.com",
});

function okResponse(token = "temporary-secret-token") {
  return new Response(JSON.stringify({
    contractVersion: "growth-managed-model-credential-lease-v1",
    leaseRef: "lease-1",
    serviceId: "qwen-asr-main",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3-asr-flash",
    credential: { type: "api_key", token },
    expiresAt: "2026-08-06T12:01:00.000Z",
    chargedUnits: 25_000,
    limits: { maxDurationSeconds: 300, maxBytes: 10_485_760 },
  }), {
    status: 201,
    headers: {
      "cache-control": "private, no-store",
      pragma: "no-cache",
      "content-type": "application/json",
    },
  });
}

const INPUT = {
  serviceId: "qwen-asr-main" as const,
  durationSeconds: 60,
  byteLength: 480_000,
  idempotencyKey: "asr-intent-12345678",
  expectedBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  expectedModel: "qwen3-asr-flash" as const,
};

describe("requestManagedAsrLease", () => {
  it("ticket 获取失败明确标记为尚未申请 lease", async () => {
    await expect(requestManagedAsrLease(INPUT, {
      requestAccess: async () => {
        throw new Error("activity unavailable");
      },
    })).rejects.toMatchObject({
      code: "ASR_TICKET_UNAVAILABLE",
      phase: "ticket_acquiring",
      leaseResult: "not_issued",
    });
  });

  it("POST 响应丢失标记 lease_unknown，调用方只能同 key 重放", async () => {
    await expect(requestManagedAsrLease(INPUT, {
      requestAccess,
      fetchImpl: vi.fn(async () => {
        throw new Error("socket reset");
      }) as typeof fetch,
    })).rejects.toMatchObject({
      code: "ASR_LEASE_UNAVAILABLE",
      phase: "lease_requesting",
      leaseResult: "lease_unknown",
    });
  });

  it("使用当前权益 ticket 和稳定幂等键换取单次内存凭据", async () => {
    const fetchImpl = vi.fn(
      async (_input: Parameters<typeof fetch>[0], _init?: RequestInit) =>
        okResponse(),
    );
    const lease = await requestManagedAsrLease(INPUT, {
      fetchImpl: fetchImpl as typeof fetch,
      requestAccess,
      now: () => NOW,
    });
    expect(lease).toMatchObject({
      leaseRef: "lease-1",
      token: "temporary-secret-token",
      chargedUnits: 25_000,
      model: "qwen3-asr-flash",
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://growth.example.com/api/client-config/managed-credential-leases");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer ticket-secret-value",
      "Idempotency-Key": INPUT.idempotencyKey,
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      serviceId: "qwen-asr-main",
      capability: "transcribe.audio",
      durationSeconds: 60,
      byteLength: 480_000,
    });
  });

  it("文件超限在申请 ticket 和网络请求之前拒绝", async () => {
    const access = vi.fn(requestAccess);
    const fetchImpl = vi.fn();
    await expect(requestManagedAsrLease({ ...INPUT, byteLength: 10_485_761 }, {
      requestAccess: access,
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toMatchObject({ code: "ASR_LEASE_INPUT_INVALID", fallbackLocal: true });
    expect(access).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("额度不足只给用户额度入口，不暴露服务实现", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ code: "AI_CREDIT_INSUFFICIENT" }),
      { status: 409, headers: {
        "cache-control": "private, no-store",
        pragma: "no-cache",
        "content-type": "application/json",
      } },
    ));
    await expect(requestManagedAsrLease(INPUT, {
      fetchImpl: fetchImpl as typeof fetch,
      requestAccess,
    })).rejects.toEqual(expect.objectContaining({
      name: "ManagedCredentialLeaseError",
      code: "AI_CREDIT_INSUFFICIENT",
      message: "AI 额度不足，请充值后再试。",
      openCredits: true,
    } satisfies Partial<ManagedCredentialLeaseError>));
  });

  it("服务状态不确定时允许明确回退本地但不另领一枚 token", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ code: "ASR_LEASE_PROVIDER_UNKNOWN" }),
      { status: 409, headers: {
        "cache-control": "private, no-store",
        pragma: "no-cache",
        "content-type": "application/json",
      } },
    ));
    await expect(requestManagedAsrLease(INPUT, {
      fetchImpl: fetchImpl as typeof fetch,
      requestAccess,
    })).rejects.toMatchObject({ fallbackLocal: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("解析无 token 的签发后过期终态，不再混成通用 expired", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      contractVersion: "growth-managed-model-credential-lease-status-v1",
      result: "charged_expired",
      leaseRef: "lease-safe-ref",
      chargeState: "committed",
      chargedUnits: 25_000,
      terminalStatus: "expired",
    }), { status: 200, headers: {
      "cache-control": "private, no-store",
      pragma: "no-cache",
      "content-type": "application/json",
    } }));
    await expect(requestManagedAsrLease(INPUT, {
      fetchImpl: fetchImpl as typeof fetch,
      requestAccess,
    })).rejects.toMatchObject({
      code: "ASR_LEASE_CHARGED_EXPIRED",
      phase: "lease_status",
      leaseResult: "charged_expired",
      leaseRef: "lease-safe-ref",
      chargedUnits: 25_000,
    });
  });
});
