import "server-only";

import { createHash } from "node:crypto";

import type { RequestContext } from "@creatoros/contract";
import type { MultimodalSpec } from "@creatoros/backend/modules/ai-runtime";
import type { GeneratedTranscript } from "@creatoros/ai-worker";

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

export type TranscribeExecutionMode =
  | "channel-managed"
  | "configured-cloud"
  | "whisper-local";

export type TranscribeWithFallbackResult = {
  readonly transcript: GeneratedTranscript;
  readonly effectiveSpec: MultimodalSpec;
  readonly mode: TranscribeExecutionMode;
};

/** 本地推理失败的稳定用户面错误。底层 ffmpeg/ONNX/worker 信息不得进入 message。 */
export class LocalWhisperTranscribeError extends Error {
  constructor() {
    super("本地转写失败，请重试。");
    this.name = "LocalWhisperTranscribeError";
  }
}

function hasTranscriptText(value: GeneratedTranscript): boolean {
  return typeof value?.text === "string" && value.text.trim().length > 0;
}

function executionModeFor(spec: MultimodalSpec): TranscribeExecutionMode {
  if (spec.provider === "whisper-local") return "whisper-local";
  return spec.displayModelKey === "channel-managed"
    ? "channel-managed"
    : "configured-cloud";
}

async function invokeLocalWhisper(
  invoke: (current: MultimodalSpec) => Promise<GeneratedTranscript>,
): Promise<TranscribeWithFallbackResult> {
  const effectiveSpec = localWhisperSpec();
  try {
    const transcript = await invoke(effectiveSpec);
    if (!hasTranscriptText(transcript)) throw new Error("empty local transcript");
    return { transcript, effectiveSpec, mode: "whisper-local" };
  } catch {
    // 不附带 cause，避免调用方把绝对路径、stderr、token 或 worker 细节序列化到用户面。
    throw new LocalWhisperTranscribeError();
  }
}

/**
 * 任意非本地 ASR 失败（含空文本/坏结果）后，同一音频只改走一次本地 Whisper。
 * 本函数不申请凭据，因此不会换幂等键或重复扣费；本地失败不会递归。
 */
export async function transcribeWithLocalFallback(
  spec: MultimodalSpec,
  invoke: (current: MultimodalSpec) => Promise<GeneratedTranscript>,
): Promise<TranscribeWithFallbackResult> {
  if (spec.provider === "whisper-local") {
    return invokeLocalWhisper(invoke);
  }
  try {
    const transcript = await invoke(spec);
    if (!hasTranscriptText(transcript)) throw new Error("empty online transcript");
    return {
      transcript,
      effectiveSpec: spec,
      mode: executionModeFor(spec),
    };
  } catch {
    return invokeLocalWhisper(invoke);
  }
}
