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
  readonly usageTracker?: ManagedAsrUsageTracker;
};

export interface ManagedAsrUsageTracker {
  begin(
    ctx: RequestContext,
    input: {
      readonly intentId: string;
      readonly idempotencyKey: string;
      readonly requestFingerprint: string;
      readonly serviceId: "qwen-asr-main";
      readonly durationSeconds: number;
      readonly byteLength: number;
    },
  ): Promise<unknown>;
  recordLease(
    ctx: RequestContext,
    intentId: string,
    lease: Pick<ManagedAsrLease, "leaseRef" | "chargedUnits" | "expiresAt">,
  ): Promise<void>;
  recordLeaseUncertain(ctx: RequestContext, intentId: string, reason: string): Promise<void>;
  recordLeaseRejected(ctx: RequestContext, intentId: string, reason: string): Promise<void>;
  recordProviderUsed(ctx: RequestContext, intentId: string): Promise<void>;
  recordFallbackPending(ctx: RequestContext, intentId: string, reason: string): Promise<void>;
}

const MANAGED_ASR_USAGE = Symbol("managed-asr-usage");
type TrackedManagedSpec = MultimodalSpec & {
  readonly [MANAGED_ASR_USAGE]?: {
    readonly ctx: RequestContext;
    readonly intentId: string;
    readonly tracker: ManagedAsrUsageTracker;
  };
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

function managedAsrRequestFingerprint(input: {
  readonly durationSeconds: number;
  readonly byteLength: number;
  readonly expectedBaseUrl: string;
  readonly expectedModel: string;
}): string {
  return `sha256:${createHash("sha256").update(JSON.stringify({
    serviceId: "qwen-asr-main",
    capability: "transcribe.audio",
    ...input,
  })).digest("hex")}`;
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
  const idempotencyKey = managedAsrIdempotencyKey(ctx, input.intentId);
  const tracker = dependencies.usageTracker;
  if (tracker) {
    await tracker.begin(ctx, {
      intentId: input.intentId,
      idempotencyKey,
      requestFingerprint: managedAsrRequestFingerprint({
        durationSeconds,
        byteLength,
        expectedBaseUrl: spec.baseUrl,
        expectedModel: "qwen3-asr-flash",
      }),
      serviceId: "qwen-asr-main",
      durationSeconds,
      byteLength,
    });
  }
  try {
    lease = await (dependencies.requestLease ?? requestManagedAsrLease)({
      serviceId: "qwen-asr-main",
      durationSeconds,
      byteLength,
      idempotencyKey,
      expectedBaseUrl: spec.baseUrl,
      expectedModel: "qwen3-asr-flash",
    });
  } catch (error) {
    if (tracker) {
      const code = error instanceof ManagedCredentialLeaseError
        ? error.code
        : "ASR_LEASE_UNEXPECTED";
      const definitelyNotIssued = new Set([
        "AI_CREDIT_ACCOUNT_LINK_REQUIRED",
        "AI_CREDIT_INSUFFICIENT",
        "ASR_LEASE_INPUT_INVALID",
        "ASR_LEASE_DENIED",
      ]).has(code);
      if (definitelyNotIssued) {
        await tracker.recordLeaseRejected(ctx, input.intentId, code);
      } else {
        await tracker.recordLeaseUncertain(ctx, input.intentId, code);
      }
    }
    if (error instanceof ManagedCredentialLeaseError && error.fallbackLocal) {
      return localWhisperSpec();
    }
    throw error;
  }
  if (tracker) {
    await tracker.recordLease(ctx, input.intentId, {
      leaseRef: lease.leaseRef,
      chargedUnits: lease.chargedUnits,
      expiresAt: lease.expiresAt,
    });
  }
  const prepared: TrackedManagedSpec = {
    ...spec,
    baseUrl: lease.baseUrl,
    model: lease.model,
    token: lease.token,
  };
  if (tracker) {
    Object.defineProperty(prepared, MANAGED_ASR_USAGE, {
      enumerable: false,
      value: { ctx, intentId: input.intentId, tracker },
    });
  }
  return prepared;
}

/** 短效凭据已经签发后 provider 仍失败时，只允许同一次音频改走本地 Whisper；不得
 * 生成新幂等键或再申请一枚凭据，避免重复扣费。 */
export async function transcribeWithManagedFallback<T>(
  spec: MultimodalSpec,
  invoke: (current: MultimodalSpec) => Promise<T>,
): Promise<T> {
  const usage = (spec as TrackedManagedSpec)[MANAGED_ASR_USAGE];
  let result: T;
  try {
    result = await invoke(spec);
  } catch (error) {
    if (spec.credentialLifecycle !== "per_request") throw error;
    if (usage) {
      await usage.tracker.recordFallbackPending(
        usage.ctx,
        usage.intentId,
        error instanceof Error ? error.name : "UnknownError",
      );
      throw new ManagedCredentialLeaseError(
        "ASR_PROVIDER_FAILED_RECONCILE_PENDING",
        "云端转写失败，费用核对中；本次未再次扣费。请稍后重试或明确改用本地转写。",
        false,
        false,
      );
    }
    return invoke(localWhisperSpec());
  }
  if (usage) {
    await usage.tracker.recordProviderUsed(usage.ctx, usage.intentId);
  }
  return result;
}
