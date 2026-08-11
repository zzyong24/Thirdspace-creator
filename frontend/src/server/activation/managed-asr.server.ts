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
      readonly inputFingerprint: string;
      readonly sourceRef: string;
      readonly trigger: string;
      readonly authorityDigest: string;
      readonly serviceId: "qwen-asr-main";
      readonly durationSeconds: number;
      readonly byteLength: number;
    },
  ): Promise<{
    readonly intentId: string;
    readonly idempotencyKey: string;
    readonly inputFingerprint: string;
    readonly requestFingerprint: string;
    readonly authorityDigest: string;
    readonly durationSeconds: number;
    readonly byteLength: number;
  }>;
  recordLease(
    ctx: RequestContext,
    intentId: string,
    lease: Pick<ManagedAsrLease, "leaseRef" | "chargedUnits" | "expiresAt">,
  ): Promise<void>;
  recordLeaseUncertain(ctx: RequestContext, intentId: string, reason: string): Promise<void>;
  recordLeaseRejected(ctx: RequestContext, intentId: string, reason: string): Promise<void>;
  recordLeaseStatus(
    ctx: RequestContext,
    intentId: string,
    status: {
      readonly result: "not_issued" | "provider_unknown" | "released" | "charged_expired";
      readonly leaseRef: string | null;
      readonly chargedUnits: number;
    },
  ): Promise<void>;
  recordProviderUsed(ctx: RequestContext, intentId: string): Promise<void>;
  recordProviderFailed(ctx: RequestContext, intentId: string, reason: string): Promise<void>;
}

const MANAGED_ASR_USAGE = Symbol("managed-asr-usage");
type TrackedManagedSpec = MultimodalSpec & {
  readonly [MANAGED_ASR_USAGE]?: {
    readonly ctx: RequestContext;
    readonly intentId: string;
    readonly tracker?: ManagedAsrUsageTracker;
    readonly leaseInput: Parameters<typeof requestManagedAsrLease>[0];
    readonly requestLease: typeof requestManagedAsrLease;
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

function sha256(value: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function managedAsrRequestFingerprint(input: {
  readonly durationSeconds: number;
  readonly byteLength: number;
}): string {
  return sha256(JSON.stringify({
    serviceId: "qwen-asr-main",
    capability: "transcribe.audio",
    ...input,
  }));
}

function managedAsrAuthorityDigest(spec: MultimodalSpec): string {
  return sha256(JSON.stringify({
    serviceId: spec.serviceId,
    provider: spec.provider,
    baseUrl: spec.baseUrl,
    apiFormat: spec.apiFormat,
    model: spec.model,
  }));
}

/**
 * 为 per_request 语音建立可恢复的非敏感 operation。此阶段不领取短时 token，只有真正
 * 调用 provider 的回调边界才申请；输入超限或签名规格不兼容时直接回退本地 Whisper。
 */
export async function prepareManagedTranscribeSpec(
  ctx: RequestContext,
  spec: MultimodalSpec,
  input: {
    readonly audioBytes: Uint8Array;
    readonly intentId: string;
    readonly sourceRef?: string;
    readonly trigger?: string;
  },
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
  const idempotencyKey = managedAsrIdempotencyKey(ctx, input.intentId);
  const tracker = dependencies.usageTracker;
  const inputFingerprint = sha256(input.audioBytes);
  const authorityDigest = managedAsrAuthorityDigest(spec);
  const requestFingerprint = managedAsrRequestFingerprint({
    durationSeconds,
    byteLength,
  });
  let frozen = {
    intentId: input.intentId,
    idempotencyKey,
    inputFingerprint,
    requestFingerprint,
    authorityDigest,
    durationSeconds,
    byteLength,
  };
  if (tracker) {
    frozen = await tracker.begin(ctx, {
      intentId: input.intentId,
      idempotencyKey,
      requestFingerprint,
      inputFingerprint,
      sourceRef: input.sourceRef ?? input.intentId,
      trigger: input.trigger ?? "operation",
      authorityDigest,
      serviceId: "qwen-asr-main",
      durationSeconds,
      byteLength,
    });
  }
  if (
    frozen.inputFingerprint !== inputFingerprint ||
    frozen.authorityDigest !== authorityDigest
  ) {
    throw new ManagedCredentialLeaseError(
      "ASR_OPERATION_INPUT_CONFLICT",
      "本次转写输入或服务配置已变化，请重新发起转写",
      false,
      false,
    );
  }
  const prepared: TrackedManagedSpec = { ...spec, token: "" };
  Object.defineProperty(prepared, MANAGED_ASR_USAGE, {
    enumerable: false,
    value: {
      ctx,
      intentId: frozen.intentId,
      tracker,
      requestLease: dependencies.requestLease ?? requestManagedAsrLease,
      leaseInput: {
        serviceId: "qwen-asr-main",
        durationSeconds: frozen.durationSeconds,
        byteLength: frozen.byteLength,
        idempotencyKey: frozen.idempotencyKey,
        expectedBaseUrl: spec.baseUrl,
        expectedModel: "qwen3-asr-flash",
      },
    },
  });
  return prepared;
}

/** token 只在 provider 回调期间可达；签发后调用失败时记录本次 operation，禁止在同一
 * 调用链生成新幂等键或再申请一枚凭据，避免重复扣费。 */
export async function transcribeWithManagedFallback<T>(
  spec: MultimodalSpec,
  invoke: (current: MultimodalSpec) => Promise<T>,
): Promise<T> {
  const usage = (spec as TrackedManagedSpec)[MANAGED_ASR_USAGE];
  if (!usage) {
    if (spec.credentialLifecycle === "per_request") {
      throw new ManagedCredentialLeaseError(
        "ASR_OPERATION_REQUIRED",
        "本次转写未建立安全操作，请重新发起",
        false,
        false,
      );
    }
    return invoke(spec);
  }
  let lease: ManagedAsrLease;
  try {
    lease = await usage.requestLease(usage.leaseInput);
  } catch (error) {
    const code = error instanceof ManagedCredentialLeaseError
      ? error.code
      : "ASR_LEASE_UNEXPECTED";
    const definitelyNotIssued = new Set([
      "AI_CREDIT_ACCOUNT_LINK_REQUIRED",
      "AI_CREDIT_INSUFFICIENT",
      "ASR_LEASE_INPUT_INVALID",
      "ASR_LEASE_DENIED",
    ]).has(code);
    if (usage.tracker) {
      if (error instanceof ManagedCredentialLeaseError && error.leaseResult &&
        error.leaseResult !== "lease_unknown") {
        await usage.tracker.recordLeaseStatus(usage.ctx, usage.intentId, {
          result: error.leaseResult,
          leaseRef: error.leaseRef,
          chargedUnits: error.chargedUnits ?? 0,
        });
      } else if (definitelyNotIssued) {
        await usage.tracker.recordLeaseRejected(usage.ctx, usage.intentId, code);
      } else {
        await usage.tracker.recordLeaseUncertain(usage.ctx, usage.intentId, code);
      }
    }
    throw error;
  }
  if (usage.tracker) {
    await usage.tracker.recordLease(usage.ctx, usage.intentId, {
      leaseRef: lease.leaseRef,
      chargedUnits: lease.chargedUnits,
      expiresAt: lease.expiresAt,
    });
  }
  const ephemeralSpec: MultimodalSpec = {
    ...spec,
    baseUrl: lease.baseUrl,
    model: lease.model,
    token: lease.token,
  };
  try {
    const result = await invoke(ephemeralSpec);
    if (usage.tracker) {
      await usage.tracker.recordProviderUsed(usage.ctx, usage.intentId);
    }
    return result;
  } catch (error) {
    if (usage.tracker) {
      await usage.tracker.recordProviderFailed(
        usage.ctx,
        usage.intentId,
        error instanceof Error ? error.name : "UnknownError",
      );
    }
    throw new ManagedCredentialLeaseError(
      "ASR_PROVIDER_FAILED",
      "云端语音转文字暂时不可用，本次不会重复申请；你可以改用本地转写。",
      true,
      false,
    );
  }
}
