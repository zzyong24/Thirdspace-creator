import {localWhisperSpec} from "@creatoros/ai-worker";
export {localWhisperSpec,transcribeWithLocalFallback,LocalWhisperTranscribeError,type TranscribeExecutionMode,type TranscribeWithFallbackResult,type LocalWhisperFailureCode} from "@creatoros/ai-worker";
import "server-only";

import { createHash } from "node:crypto";

import type { RequestContext } from "@creatoros/contract";
import type { MultimodalSpec } from "@creatoros/backend/modules/ai-runtime";

import {
  requestManagedAsrLease,
  type ManagedAsrLease,
} from "./managed-credential-lease.server";

const MAX_DURATION_SECONDS = 300;
const MAX_BYTES = 10_485_760;
const EXTRACTED_AUDIO_BITS_PER_SECOND = 64_000;

type Dependencies = {
  readonly requestLease?: typeof requestManagedAsrLease;
};

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
 * 把已验签的 per_request 语音规格换成当前一次调用可用的内存规格。超限、未绑定、
 * 额度不足、服务状态未知、短效授权过期或任意在线准备失败都只回退本地 Whisper。
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
  } catch {
    // T-768：在线配置、票据、额度、lease、网络或合同验证任一步失败，都只丢弃
    // 在线路径并回退本地。坏签名/坏响应不会被使用；回退不代表放宽在线校验。
    return localWhisperSpec();
  }
  return {
    ...spec,
    baseUrl: lease.baseUrl,
    model: lease.model,
    token: lease.token,
  };
}
