import { describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import type { MultimodalSpec } from "@creatoros/backend/modules/ai-runtime";

import { ManagedCredentialLeaseError } from "./managed-credential-lease.server";
import {
  managedAsrIdempotencyKey,
  prepareManagedTranscribeSpec,
  transcribeWithManagedFallback,
  type ManagedAsrUsageTracker,
} from "./managed-asr.server";

const ctx: RequestContext = {
  userId: "u1",
  accountId: "a1",
  requestId: "r1",
  source: "user",
};
const SPEC: MultimodalSpec = {
  provider: "qwen",
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  model: "qwen3-asr-flash",
  token: "",
  kind: "audio",
  credentialLifecycle: "per_request",
  serviceId: "qwen-asr-main",
  apiFormat: "qwen_chat_audio",
  displayModelKey: "channel-managed",
  settings: { maxDurationSeconds: 300, maxBytes: 10_485_760, chargeUnits: 25_000 },
};

describe("prepareManagedTranscribeSpec", () => {
  it("同一转写意图稳定复用同一个幂等键", () => {
    expect(managedAsrIdempotencyKey(ctx, "task:t1:aweme:w1")).toBe(
      managedAsrIdempotencyKey({ ...ctx, requestId: "another" }, "task:t1:aweme:w1"),
    );
  });

  it("prepare 不领取或返回 token，只有 provider 回调内短时可见", async () => {
    const requestLease = vi.fn(async () => ({
      leaseRef: "lease-1",
      baseUrl: SPEC.baseUrl!,
      model: SPEC.model,
      token: "ephemeral-token",
      expiresAt: "2026-08-06T12:01:00.000Z",
      chargedUnits: 25_000,
    }));
    const prepared = await prepareManagedTranscribeSpec(ctx, SPEC, {
      audioBytes: new Uint8Array(480_000),
      intentId: "task:t1:aweme:w1",
    }, { requestLease });
    expect(requestLease).not.toHaveBeenCalled();
    expect(prepared.token).toBe("");
    expect(JSON.stringify(prepared)).not.toContain("ephemeral-token");

    const invoke = vi.fn(async (current: MultimodalSpec) => current.token);
    await expect(transcribeWithManagedFallback(prepared, invoke)).resolves.toBe(
      "ephemeral-token",
    );
    expect(requestLease).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(SPEC.token).toBe("");
  });

  it("音频超限不申请凭据并回退本地 Whisper", async () => {
    const requestLease = vi.fn();
    const prepared = await prepareManagedTranscribeSpec(ctx, SPEC, {
      audioBytes: new Uint8Array(10_485_761),
      intentId: "too-large",
    }, { requestLease });
    expect(requestLease).not.toHaveBeenCalled();
    expect(prepared).toMatchObject({ provider: "whisper-local", token: "" });
  });

  it("provider_unknown 不换新 key 重领，直接回退本地", async () => {
    const requestLease = vi.fn(async () => {
      throw new ManagedCredentialLeaseError(
        "ASR_LEASE_PROVIDER_UNKNOWN",
        "语音转文字服务暂时不可用，已改用本地转写",
        true,
        false,
      );
    });
    const prepared = await prepareManagedTranscribeSpec(ctx, SPEC, {
      audioBytes: new Uint8Array(8_000),
      intentId: "provider-unknown",
    }, { requestLease });
    const invoke = vi.fn(async () => "本地逐字稿");
    await expect(transcribeWithManagedFallback(prepared, invoke)).rejects.toMatchObject({
      code: "ASR_LEASE_PROVIDER_UNKNOWN",
    });
    expect(requestLease).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("拒绝绕过 operation 直接把短效 token 塞进通用 spec", async () => {
    const invoke = vi.fn();
    await expect(transcribeWithManagedFallback({ ...SPEC, token: "temporary" }, invoke))
      .rejects.toMatchObject({ code: "ASR_OPERATION_REQUIRED" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("先持久化 intent，再保存 leaseRef；provider 失败进入核对队列并明确报错，不用本地结果掩盖收费", async () => {
    const events: string[] = [];
    const tracker: ManagedAsrUsageTracker = {
      begin: vi.fn(async (_ctx, input) => {
        events.push("intent");
        return input;
      }),
      recordLease: vi.fn(async () => { events.push("lease"); }),
      recordLeaseUncertain: vi.fn(async () => { events.push("uncertain"); }),
      recordLeaseRejected: vi.fn(async () => { events.push("rejected"); }),
      recordLeaseStatus: vi.fn(async () => { events.push("status"); }),
      recordProviderUsed: vi.fn(async () => { events.push("used"); }),
      recordProviderFailed: vi.fn(async () => { events.push("provider-failed"); }),
    };
    const requestLease = vi.fn(async () => {
      events.push("request");
      return {
        leaseRef: "lease-support-ref",
        baseUrl: SPEC.baseUrl!,
        model: SPEC.model,
        token: "ephemeral-token",
        expiresAt: "2026-08-06T12:01:00.000Z",
        chargedUnits: 25_000,
      };
    });
    const prepared = await prepareManagedTranscribeSpec(ctx, SPEC, {
      audioBytes: new Uint8Array(480_000),
      intentId: "tracked-intent",
    }, { requestLease, usageTracker: tracker });
    expect(events).toEqual(["intent"]);
    expect(JSON.stringify(prepared)).not.toContain("ephemeral-token");

    const invoke = vi.fn(async () => {
      throw new Error("timeout");
    });
    await expect(transcribeWithManagedFallback(prepared, invoke)).rejects.toMatchObject({
      code: "ASR_PROVIDER_FAILED",
      message: expect.not.stringContaining("费用核对中"),
    });
    expect(events).toEqual(["intent", "request", "lease", "provider-failed"]);
    expect(tracker.recordLease).toHaveBeenCalledWith(
      ctx,
      "tracked-intent",
      expect.objectContaining({ leaseRef: "lease-support-ref", chargedUnits: 25_000 }),
    );
    expect(JSON.stringify(prepared)).not.toContain("lease-support-ref");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("签发后过期状态写回原 operation，不再记录为费用未知", async () => {
    const tracker: ManagedAsrUsageTracker = {
      begin: vi.fn(async (_ctx, input) => input),
      recordLease: vi.fn(async () => {}),
      recordLeaseUncertain: vi.fn(async () => {}),
      recordLeaseRejected: vi.fn(async () => {}),
      recordLeaseStatus: vi.fn(async () => {}),
      recordProviderUsed: vi.fn(async () => {}),
      recordProviderFailed: vi.fn(async () => {}),
    };
    const requestLease = vi.fn(async () => {
      throw new ManagedCredentialLeaseError(
        "ASR_LEASE_CHARGED_EXPIRED",
        "本次云端转写授权已结束",
        true,
        false,
        {
          phase: "lease_status",
          leaseResult: "charged_expired",
          leaseRef: "lease-safe-ref",
          chargedUnits: 25_000,
        },
      );
    });
    const prepared = await prepareManagedTranscribeSpec(ctx, SPEC, {
      audioBytes: new Uint8Array(8_000),
      intentId: "expired-operation",
      sourceRef: "douyin:aweme:expired",
      trigger: "task:expired",
    }, { requestLease, usageTracker: tracker });

    await expect(transcribeWithManagedFallback(prepared, vi.fn())).rejects.toMatchObject({
      leaseResult: "charged_expired",
    });
    expect(tracker.recordLeaseStatus).toHaveBeenCalledWith(
      ctx,
      "expired-operation",
      {
        result: "charged_expired",
        leaseRef: "lease-safe-ref",
        chargedUnits: 25_000,
      },
    );
    expect(tracker.recordLeaseUncertain).not.toHaveBeenCalled();
  });
});
