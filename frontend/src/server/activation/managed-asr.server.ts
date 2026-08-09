import "server-only";

import { createHash } from "node:crypto";

import type { RequestContext } from "@creatoros/contract";
import type { MultimodalSpec } from "@creatoros/backend/modules/ai-runtime";

import {
  ManagedCredentialLeaseError,
  requestManagedAsrLease,
  type ManagedAsrLease,
} from "./managed-credential-lease.server";

const MAX_DURATION_SECONDS = 300;
const MAX_BYTES = 10_485_760;
const EXTRACTED_AUDIO_BITS_PER_SECOND = 64_000;

type Dependencies = {
  readonly requestLease?: typeof requestManagedAsrLease;
};

export function localWhisperSpec(): MultimodalSpec {
  return {
    provider: "whisper-local",
    baseUrl: null,
    model: "small",
    token: "",
    kind: "audio",
  };
}

export function estimateExtractedAudioDurationSeconds(byteLength: number): number {
  return Math.max(1, Math.ceil((byteLength * 8) / EXTRACTED_AUDIO_BITS_PER_SECOND));
}

export function managedAsrIdempotencyKey(
  ctx: RequestContext,
  intentId: string,
): string {
  const scope = [ctx.userId, ctx.accountId ?? "no-account", intentId].join(":");
  return `creatoros-asr-${createHash("sha256").update(scope).digest("hex").slice(0, 40)}`;
}

/**
 * 把已验签的 per_request 语音规格换成当前一次调用可用的内存规格。超限、服务状态未知
 * 或短效授权过期都只回退本地 Whisper；额度不足/未连接账户保留为用户可行动错误。
 */
export async function prepareManagedTranscribeSpec(
  ctx: RequestContext,
  spec: MultimodalSpec,
  input: { readonly audioBytes: Uint8Array; readonly intentId: string },
  dependencies: Dependencies = {},
): Promise<MultimodalSpec> {
  if (spec.credentialLifecycle !== "per_request") return spec;
  if (
    spec.serviceId !== "qwen-asr-main" ||
    spec.provider !== "qwen" ||
    spec.apiFormat !== "qwen_chat_audio" ||
    spec.model !== "qwen3-asr-flash" ||
    !spec.baseUrl
  ) {
    return localWhisperSpec();
  }
  const byteLength = input.audioBytes.byteLength;
  const durationSeconds = estimateExtractedAudioDurationSeconds(byteLength);
  const maxDuration = Number(spec.settings?.maxDurationSeconds ?? MAX_DURATION_SECONDS);
  const maxBytes = Number(spec.settings?.maxBytes ?? MAX_BYTES);
  if (
    byteLength < 1 ||
    byteLength > Math.min(MAX_BYTES, maxBytes) ||
    durationSeconds > Math.min(MAX_DURATION_SECONDS, maxDuration)
  ) {
    return localWhisperSpec();
  }
  let lease: ManagedAsrLease;
  try {
    lease = await (dependencies.requestLease ?? requestManagedAsrLease)({
      serviceId: "qwen-asr-main",
      durationSeconds,
      byteLength,
      idempotencyKey: managedAsrIdempotencyKey(ctx, input.intentId),
      expectedBaseUrl: spec.baseUrl,
      expectedModel: "qwen3-asr-flash",
    });
  } catch (error) {
    if (error instanceof ManagedCredentialLeaseError && error.fallbackLocal) {
      return localWhisperSpec();
    }
    throw error;
  }
  return {
    ...spec,
    baseUrl: lease.baseUrl,
    model: lease.model,
    token: lease.token,
  };
}

/** 短效凭据已经签发后 provider 仍失败时，只允许同一次音频改走本地 Whisper；不得
 * 生成新幂等键或再申请一枚凭据，避免重复扣费。 */
export async function transcribeWithManagedFallback<T>(
  spec: MultimodalSpec,
  invoke: (current: MultimodalSpec) => Promise<T>,
): Promise<T> {
  try {
    return await invoke(spec);
  } catch (error) {
    if (spec.credentialLifecycle !== "per_request") throw error;
    return invoke(localWhisperSpec());
  }
}
