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

  it("每次调用只申请一次短效凭据并只放入返回的内存 spec", async () => {
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
    expect(requestLease).toHaveBeenCalledTimes(1);
    expect(prepared.token).toBe("ephemeral-token");
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
    expect(requestLease).toHaveBeenCalledTimes(1);
    expect(prepared.provider).toBe("whisper-local");
  });

  it("短效凭据调用失败后只改走本地，不再次申请凭据", async () => {
    const invoke = vi.fn(async (current: MultimodalSpec) => {
      if (current.credentialLifecycle === "per_request") throw new Error("timeout");
      return "本地逐字稿";
    });
    await expect(transcribeWithManagedFallback({ ...SPEC, token: "temporary" }, invoke))
      .resolves.toBe("本地逐字稿");
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1]?.[0]).toMatchObject({ provider: "whisper-local" });
  });

  it("先持久化 intent，再保存 leaseRef；provider 失败进入核对队列并明确报错，不用本地结果掩盖收费", async () => {
    const events: string[] = [];
    const tracker: ManagedAsrUsageTracker = {
      begin: vi.fn(async () => { events.push("intent"); }),
      recordLease: vi.fn(async () => { events.push("lease"); }),
      recordLeaseUncertain: vi.fn(async () => { events.push("uncertain"); }),
      recordLeaseRejected: vi.fn(async () => { events.push("rejected"); }),
      recordProviderUsed: vi.fn(async () => { events.push("used"); }),
      recordFallbackPending: vi.fn(async () => { events.push("fallback-pending"); }),
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
    expect(events).toEqual(["intent", "request", "lease"]);
    expect(tracker.recordLease).toHaveBeenCalledWith(
      ctx,
      "tracked-intent",
      expect.objectContaining({ leaseRef: "lease-support-ref", chargedUnits: 25_000 }),
    );
    expect(JSON.stringify(prepared)).not.toContain("lease-support-ref");

    const invoke = vi.fn(async (current: MultimodalSpec) => {
      if (current.credentialLifecycle === "per_request") throw new Error("timeout");
      events.push("local-fallback");
      return "本地逐字稿";
    });
    await expect(transcribeWithManagedFallback(prepared, invoke)).rejects.toMatchObject({
      code: "ASR_PROVIDER_FAILED_RECONCILE_PENDING",
      message: expect.stringContaining("费用核对中"),
    });
    expect(events.at(-1)).toBe("fallback-pending");
    expect(events).not.toContain("local-fallback");
  });
});
