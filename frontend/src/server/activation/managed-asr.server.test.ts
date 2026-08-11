import { describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import type { MultimodalSpec } from "@creatoros/backend/modules/ai-runtime";

import { ManagedCredentialLeaseError } from "./managed-credential-lease.server";
import {
  LocalWhisperTranscribeError,
  managedAsrIdempotencyKey,
  prepareManagedTranscribeSpec,
  transcribeWithLocalFallback,
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

  it.each([
    ["未绑定额度账户", "AI_CREDIT_ACCOUNT_LINK_REQUIRED", true],
    ["额度不足", "AI_CREDIT_INSUFFICIENT", true],
    ["权益拒绝", "ASR_LEASE_DENIED", false],
  ])("%s 也必须回退本地 Whisper", async (_label, code, openCredits) => {
    const requestLease = vi.fn(async () => {
      throw new ManagedCredentialLeaseError(
        code,
        "在线语音转文字不可用",
        false,
        openCredits,
      );
    });
    const prepared = await prepareManagedTranscribeSpec(ctx, SPEC, {
      audioBytes: new Uint8Array(8_000),
      intentId: `fallback-${code}`,
    }, { requestLease });
    expect(requestLease).toHaveBeenCalledTimes(1);
    expect(prepared).toMatchObject({ provider: "whisper-local", token: "" });
  });

  it("普通异常同样回退本地，不把票据或网络异常变成阻断", async () => {
    const requestLease = vi.fn(async () => {
      throw new TypeError("fetch failed: secret-ticket");
    });
    const prepared = await prepareManagedTranscribeSpec(ctx, SPEC, {
      audioBytes: new Uint8Array(8_000),
      intentId: "generic-error",
    }, { requestLease });
    expect(prepared.provider).toBe("whisper-local");
  });
});

describe("transcribeWithLocalFallback", () => {
  it("短效凭据调用失败后只改走本地，不再次申请凭据", async () => {
    const invoke = vi.fn(async (current: MultimodalSpec) => {
      if (current.credentialLifecycle === "per_request") throw new Error("timeout");
      return { text: "本地逐字稿" };
    });
    const result = await transcribeWithLocalFallback(
      { ...SPEC, token: "temporary" },
      invoke,
    );
    expect(result.transcript.text).toBe("本地逐字稿");
    expect(result.mode).toBe("whisper-local");
    expect(result.effectiveSpec.provider).toBe("whisper-local");
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1]?.[0]).toMatchObject({ provider: "whisper-local" });
  });

  it("用户自配云端 ASR 失败也回退本地", async () => {
    const configuredCloud: MultimodalSpec = {
      provider: "siliconflow",
      baseUrl: "https://api.example.com/v1",
      model: "asr-model",
      token: "user-secret",
      kind: "audio",
    };
    const invoke = vi.fn(async (current: MultimodalSpec) => {
      if (current.provider !== "whisper-local") throw new Error("HTTP 401");
      return { text: "本地结果" };
    });
    const result = await transcribeWithLocalFallback(configuredCloud, invoke);
    expect(result.mode).toBe("whisper-local");
    expect(result.transcript.text).toBe("本地结果");
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("在线返回空文本也计为失败并只回退一次", async () => {
    const invoke = vi.fn(async (current: MultimodalSpec) =>
      current.provider === "whisper-local"
        ? { text: "本地补回的逐字稿" }
        : { text: "   " });
    const result = await transcribeWithLocalFallback(SPEC, invoke);
    expect(result.transcript.text).toBe("本地补回的逐字稿");
    expect(result.mode).toBe("whisper-local");
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("在线成功不调用本地，并返回真实在线执行模式", async () => {
    const invoke = vi.fn(async () => ({ text: "在线逐字稿" }));
    const result = await transcribeWithLocalFallback(SPEC, invoke);
    expect(result.transcript.text).toBe("在线逐字稿");
    expect(result.mode).toBe("channel-managed");
    expect(result.effectiveSpec).toBe(SPEC);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("用户自配云端成功记录 configured-cloud，而不是渠道或本地", async () => {
    const configuredCloud: MultimodalSpec = {
      provider: "siliconflow",
      baseUrl: "https://api.example.com/v1",
      model: "asr-model",
      token: "user-secret",
      kind: "audio",
    };
    const invoke = vi.fn(async () => ({ text: "用户云端逐字稿" }));
    const result = await transcribeWithLocalFallback(configuredCloud, invoke);
    expect(result.mode).toBe("configured-cloud");
    expect(result.effectiveSpec).toBe(configuredCloud);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("本地 Whisper 自身失败不递归，且不泄露底层路径和 stderr", async () => {
    const invoke = vi.fn(async () => {
      throw new Error(
        "ffmpeg /Users/private/bin/ffmpeg stderr=token-secret; ONNX worker crashed",
      );
    });
    await expect(
      transcribeWithLocalFallback(
        {
          provider: "whisper-local",
          baseUrl: null,
          model: "small",
          token: "",
          kind: "audio",
        },
        invoke,
      ),
    ).rejects.toEqual(expect.objectContaining({
      name: "LocalWhisperTranscribeError",
      message: "本地转写失败，请重试。",
    } satisfies Partial<LocalWhisperTranscribeError>));
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
