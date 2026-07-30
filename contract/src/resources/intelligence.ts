import { z } from "zod";

import { id, iso8601 } from "../primitives";

export const intelligenceCollectionKind = z.enum(["system", "custom"]);
export const intelligenceSourceType = z.enum([
  "creator_profile",
  "favorites_folder",
  "web",
  "rss",
  "darkhorse_query",
]);
export const intelligenceSourceStatus = z.enum([
  "draft",
  "active",
  "paused",
  "archived",
]);
export const intelligenceItemType = z.enum([
  "video",
  "article",
  "trend_signal",
]);
export const intelligenceTranscriptStatus = z.enum([
  "not_requested",
  "queued",
  "running",
  "done",
  "skipped",
  "failed",
  "blocked",
]);
export const intelligenceTranscriptState = z.enum([
  "not_extracted",
  "processing",
  "extracted",
  "attention",
]);
export const intelligenceTopicState = z.enum([
  "not_generated",
  "generating",
  "awaiting_confirmation",
  "converted",
  "attention",
]);
export const intelligenceProgressState = z.enum([
  "pending_transcript",
  "transcript_processing",
  "pending_topic",
  "topic_generating",
  "awaiting_confirmation",
  "converted",
  "attention",
]);
export const adapterStatus = z.enum([
  "succeeded_with_items",
  "succeeded_no_change",
  "partial",
  "blocked",
  "failed",
]);
export const intelligenceRunStatus = z.enum([
  "queued",
  "running",
  ...adapterStatus.options,
]);
export const adapterErrorCode = z.enum([
  "LOGIN_REQUIRED",
  "CAPTCHA",
  "PERMISSION_DENIED",
  "IDENTITY_INVALID",
  "FOLDER_MISSING",
  "SIGNATURE_FAILED",
  "NO_VALID_RESPONSE",
  "RESPONSE_SHAPE_CHANGED",
  "UNSAFE_URL",
  "LOGIN_WALL",
  "HTTP_ERROR",
  "EMPTY_BODY",
  "PARSE_FAILED",
  "INVALID_FEED",
  "RESPONSE_TOO_LARGE",
  "TIMEOUT",
  "MODEL_NOT_CONFIGURED",
  "RATE_LIMITED",
]);
export const executionTaskStatusV2 = z.enum([
  "queued",
  "running",
  "pause_requested",
  "paused",
  "cancel_requested",
  "cancelled",
  "succeeded",
  "failed",
  "blocked",
]);
export const executionTaskKindV2 = z.enum([
  "source_sync",
  "share_import",
  "transcribe",
  "topic_preview",
  "script_candidate",
  "automation_sync",
  "migration",
]);

const nullableCount = z.number().int().nonnegative().nullable();
const diagnosticValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
const jsonObject = z.record(z.string(), z.unknown());

export const intelligenceCollectionResource = z
  .object({
    id,
    userId: id,
    accountId: id,
    parentId: id.nullable(),
    name: z.string().min(1),
    kind: intelligenceCollectionKind,
    sortOrder: z.number().int(),
    version: z.number().int().positive(),
    archivedAt: iso8601.nullable(),
    createdAt: iso8601,
    updatedAt: iso8601,
  })
  .strict();

export const intelligenceSourceConfig = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("creator_profile"),
      collectorAccountId: id,
      canonicalUrl: z.string().url(),
      externalAccountId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("favorites_folder"),
      collectorAccountId: id,
      folderId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("web"),
      url: z.string().url(),
      browserSessionRef: z.string().min(1).nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("rss"),
      url: z.string().url(),
      browserSessionRef: z.string().min(1).nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("darkhorse_query"),
      collectorAccountId: id,
      keyword: z.string().min(1),
      board: z.literal("low_follower_breakout"),
    })
    .strict(),
]);

export const intelligenceCollectorResource = z
  .object({
    accountId: id,
    accountHandle: z.string().min(1).nullable(),
    platform: z.literal("douyin").nullable(),
    availability: z.enum(["active", "archived", "missing"]),
  })
  .strict();

export const intelligenceSourceResource = z
  .object({
    id,
    userId: id,
    accountId: id,
    collectionId: id.nullable(),
    type: intelligenceSourceType,
    platform: z.string().min(1),
    displayName: z.string().min(1),
    canonicalUrl: z.string().url().nullable(),
    externalKey: z.string().min(1),
    browserSessionRef: z.string().min(1).nullable(),
    collector: intelligenceCollectorResource.nullable(),
    monitorEnabled: z.boolean(),
    syncPolicy: jsonObject,
    extractionInstruction: z.string().nullable(),
    status: intelligenceSourceStatus,
    version: z.number().int().positive(),
    lastRunAt: iso8601.nullable(),
    nextRunAt: iso8601.nullable(),
    createdAt: iso8601,
    updatedAt: iso8601,
  })
  .strict();

export const intelligenceSourceMembershipResource = z
  .object({
    id,
    sourceId: id,
    collectionId: id,
    createdAt: iso8601,
  })
  .strict();

export const intelligenceItemResource = z
  .object({
    id,
    userId: id,
    accountId: id,
    type: intelligenceItemType,
    platform: z.string().min(1),
    externalId: z.string().nullable(),
    canonicalUrl: z.string().url(),
    authorId: z.string().nullable(),
    authorName: z.string().nullable(),
    title: z.string(),
    summary: z.string().nullable(),
    coverUrl: z.string().url().nullable(),
    coverAssetId: id.nullable(),
    publishedAt: iso8601.nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
    capturedAt: iso8601,
    availability: z.enum(["available", "unavailable", "unknown"]),
  })
  .strict();

export const itemMetricSnapshotResource = z
  .object({
    id,
    itemId: id,
    capturedAt: iso8601,
    likeCount: nullableCount,
    commentCount: nullableCount,
    collectCount: nullableCount,
    shareCount: nullableCount,
    followerCount: nullableCount,
    metricSource: z.string().min(1),
    qualityFlags: z.array(z.string()).default([]),
  })
  .strict();

export const itemTranscriptResource = z
  .object({
    itemId: id,
    status: intelligenceTranscriptStatus,
    text: z.string().nullable(),
    source: z.enum(["asr", "caption", "manual"]).nullable(),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    language: z.string().nullable(),
    executionTaskId: id.nullable(),
    queuedAt: iso8601.nullable(),
    completedAt: iso8601.nullable(),
    errorCode: z.string().nullable(),
  })
  .strict();

export const syncRunResource = z
  .object({
    id,
    userId: id,
    accountId: id,
    sourceId: id,
    executionTaskId: id,
    trigger: z.enum(["manual", "schedule", "initial", "retry"]),
    status: intelligenceRunStatus,
    checkpoint: z.unknown().nullable(),
    startedAt: iso8601.nullable(),
    finishedAt: iso8601.nullable(),
    scannedCount: z.number().int().nonnegative(),
    newCount: z.number().int().nonnegative(),
    updatedCount: z.number().int().nonnegative(),
    skippedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    errorCode: adapterErrorCode.nullable(),
    errorSummary: z.string().nullable(),
    nextAction: z.enum([
      "login",
      "configure_model",
      "retry",
      "edit",
      "none",
    ]),
    createdAt: iso8601,
  })
  .strict();

export const syncRunEventResource = z
  .object({
    id,
    runId: id,
    step: z.string().min(1),
    status: adapterStatus,
    occurredAt: iso8601,
    itemRef: z.string().nullable(),
    message: z.string(),
    safeDetails: z.record(z.string(), diagnosticValue),
  })
  .strict();

export const itemSourceObservationResource = z
  .object({
    id,
    userId: id,
    accountId: id,
    itemId: id,
    sourceId: id,
    runId: id,
    externalRef: z.string().min(1),
    firstSeenAt: iso8601,
    lastSeenAt: iso8601,
    discoveryContext: jsonObject,
  })
  .strict();

export const sourceSnapshotResource = z
  .object({
    id,
    userId: id,
    accountId: id,
    sourceId: id,
    runId: id,
    itemId: id.nullable(),
    capturedAt: iso8601,
    finalUrl: z.string().url(),
    title: z.string().nullable(),
    contentHash: z.string().min(1),
    safeExtract: z.string().nullable(),
    storageRef: z.string().nullable(),
    retentionUntil: iso8601.nullable(),
    privacyClass: z.enum(["public", "authorized", "restricted"]),
  })
  .strict();

export const intelligenceTransformResource = z
  .object({
    id,
    userId: id,
    accountId: id,
    itemId: id,
    sourceSnapshotId: id,
    kind: z.literal("topic"),
    positioningVersionId: id,
    aiTaskId: id.nullable(),
    idempotencyKey: z.string().min(1),
    status: z.enum(["candidate", "confirmed", "cancelled"]),
    outputSnapshot: jsonObject.nullable(),
    targetTopicId: id.nullable(),
    // transform 只保存候选内容；真实执行终态仍来自 execution_tasks。
    // 详情投影这三列后，客户端才能把失败/受阻与“仍在生成”区分开。
    taskStatus: executionTaskStatusV2.nullable(),
    taskErrorCode: z.string().nullable(),
    taskErrorMessage: z.string().nullable(),
    createdAt: iso8601,
    updatedAt: iso8601,
  })
  .strict();

export const projectIntelligenceReferenceResource = z
  .object({
    id,
    projectId: id,
    topicId: id,
    itemId: id,
    sourceSnapshotId: id,
    transformId: id,
    transcriptHash: z.string().min(1),
    createdAt: iso8601,
  })
  .strict();

export const executionTaskResourceV2 = z
  .object({
    id,
    userId: id,
    accountId: id,
    kind: executionTaskKindV2,
    ownerType: z.enum([
      "source",
      "item_import",
      "item",
      "transform",
      "project",
      "scheduled_job",
      "migration",
    ]),
    ownerId: id,
    status: executionTaskStatusV2,
    priority: z.number().int(),
    idempotencyKey: z.string().min(1),
    checkpoint: z.unknown().nullable(),
    leaseOwner: z.string().nullable(),
    leaseExpiresAt: iso8601.nullable(),
    heartbeatAt: iso8601.nullable(),
    attempt: z.number().int().nonnegative(),
    maxAttempts: z.number().int().positive(),
    // 直接投影 execution_tasks 已有错误列；状态卡据此区分登录、验证码、模型配置等
    // 可恢复原因，不在 intelligence 复制第二份状态。
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    costEstimate: z
      .object({
        unit: z.string().min(1),
        min: z.number().nonnegative(),
        max: z.number().nonnegative(),
      })
      .strict()
      .nullable(),
    createdAt: iso8601,
    updatedAt: iso8601,
  })
  .strict();

export function adapterEnvelope<TItem extends z.ZodTypeAny>(
  item: TItem,
) {
  return z
    .object({
      adapterStatus,
      upstreamEvidence: z
        .object({
          adapter: z.enum([
            "douyin_profile",
            "douhot_darkhorse",
            "douyin_favorites",
            "web",
            "rss",
          ]),
          responseShape: z.string().min(1),
          capturedAt: iso8601,
          finalUrl: z.string().url().optional(),
          listValid: z.boolean(),
          upstreamWindow: z.string().optional(),
        })
        .strict(),
      items: z.array(item),
      checkpoint: z.unknown().nullable(),
      errorCode: adapterErrorCode.nullable(),
      safeDiagnostics: z.record(z.string(), diagnosticValue),
    })
    .strict();
}

export type IntelligenceCollectionResource = z.infer<
  typeof intelligenceCollectionResource
>;
export type IntelligenceSourceResource = z.infer<
  typeof intelligenceSourceResource
>;
export type IntelligenceItemResource = z.infer<
  typeof intelligenceItemResource
>;
export type ExecutionTaskResourceV2 = z.infer<
  typeof executionTaskResourceV2
>;
export type ProjectIntelligenceReferenceResource = z.infer<
  typeof projectIntelligenceReferenceResource
>;
