import { createHash, randomUUID } from "node:crypto";

import {
  and,
  asc,
  benchmarkSources,
  benchmarkWorks,
  desc,
  eq,
  executionTasks,
  favoritesFolders,
  favoritesItems,
  inArray,
  intelligenceCollections,
  intelligenceItems,
  intelligenceMigrationLedgers,
  projectIntelligenceReferences,
  intelligenceSources,
  intelligenceSourceCollectionMemberships,
  intelligenceSyncRunEvents,
  intelligenceSyncRuns,
  intelligenceTransforms,
  itemMetricSnapshots,
  itemSourceObservations,
  itemTranscripts,
  isNull,
  lte,
  or,
  sourceSnapshots,
  trendSources,
  type Db,
} from "@creatoros/backend";
import type {
  ExecutionTaskResourceV2,
  IntelligenceCollectionResource,
  IntelligenceItemResource,
  IntelligenceSourceResource,
  RequestContext,
} from "@creatoros/contract";
import type {
  PersistentTaskService,
  PersistentTaskStatus,
} from "../execution";
import {
  IntelligenceConflictError,
  IntelligenceValidationError,
  OwnershipError,
  requireAccountId,
} from "./intelligence.errors";

type CollectionRow = typeof intelligenceCollections.$inferSelect;
type SourceRow = typeof intelligenceSources.$inferSelect;
type SourceMembershipRow =
  typeof intelligenceSourceCollectionMemberships.$inferSelect;
type ItemRow = typeof intelligenceItems.$inferSelect;
type MetricRow = typeof itemMetricSnapshots.$inferSelect;
type TranscriptRow = typeof itemTranscripts.$inferSelect;
type RunRow = typeof intelligenceSyncRuns.$inferSelect;
type RunEventRow = typeof intelligenceSyncRunEvents.$inferSelect;
type ObservationRow = typeof itemSourceObservations.$inferSelect;
type SnapshotRow = typeof sourceSnapshots.$inferSelect;
type TransformRow = typeof intelligenceTransforms.$inferSelect;
type ExecutionTaskRow = typeof executionTasks.$inferSelect;
type MigrationLedgerRow = typeof intelligenceMigrationLedgers.$inferSelect;

type TranscriptState =
  | "not_extracted"
  | "processing"
  | "extracted"
  | "attention";
type TopicState =
  | "not_generated"
  | "generating"
  | "awaiting_confirmation"
  | "converted"
  | "attention";
type ProgressState =
  | "pending_transcript"
  | "transcript_processing"
  | "pending_topic"
  | "topic_generating"
  | "awaiting_confirmation"
  | "converted"
  | "attention";

const ACTIVE_TOPIC_TASK_STATUSES = new Set([
  "queued",
  "running",
  "pause_requested",
  "paused",
  "cancel_requested",
]);

function hasTopicCandidate(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return false;
  }
  const value = snapshot as Record<string, unknown>;
  // 旧快照没有阶段元数据，沿用“非空即候选”的既有投影；新分段快照只有真正形成
  // 最小选题卡后才进入待确认，纯拆解/待补卡片显示 attention。
  if (!("generationProgress" in value)) return true;
  return [
    value.title,
    value.angle,
    value.differentiation,
    value.sourceSummary,
  ].every((field) => typeof field === "string" && field.trim().length > 0);
}

function itemWorkflowProjection(
  transcript: TranscriptRow | undefined,
  transforms: TransformRow[],
  taskStatusById: Map<string, ExecutionTaskRow["status"]>,
): {
  transcriptState: TranscriptState;
  topicState: TopicState;
  progressState: ProgressState;
} {
  const transcriptState: TranscriptState =
    transcript?.status === "queued" || transcript?.status === "running"
      ? "processing"
      : transcript?.status === "done" && Boolean(transcript.text?.trim())
        ? "extracted"
        : transcript?.status === "failed" ||
            transcript?.status === "blocked"
          ? "attention"
          : "not_extracted";

  const confirmed = transforms.some(
    (transform) =>
      transform.status === "confirmed" && Boolean(transform.targetTopicId),
  );
  const candidate = transforms.some(
    (transform) =>
      transform.status === "candidate" &&
      hasTopicCandidate(transform.outputSnapshot),
  );
  const partialCandidate = transforms.some(
    (transform) =>
      transform.status === "candidate" && transform.outputSnapshot !== null,
  );
  const latest = transforms[0];
  const latestTaskStatus = latest?.aiTaskId
    ? taskStatusById.get(latest.aiTaskId)
    : undefined;
  const topicState: TopicState = confirmed
    ? "converted"
    : latestTaskStatus && ACTIVE_TOPIC_TASK_STATUSES.has(latestTaskStatus)
        ? "generating"
        : latestTaskStatus === "failed" || latestTaskStatus === "blocked"
          ? "attention"
          : candidate
            ? "awaiting_confirmation"
            : partialCandidate
              ? "attention"
              : "not_generated";

  const progressState: ProgressState =
    topicState === "converted"
      ? "converted"
      : topicState === "awaiting_confirmation"
        ? "awaiting_confirmation"
        : topicState === "generating"
          ? "topic_generating"
          : transcriptState === "processing"
            ? "transcript_processing"
            : transcriptState === "attention" || topicState === "attention"
              ? "attention"
              : transcriptState === "not_extracted"
                ? "pending_transcript"
                : "pending_topic";
  return { transcriptState, topicState, progressState };
}

export interface ReusableTopicDecomposition {
  hook: string;
  structureSteps: string[];
  coreClaims: string[];
  reusablePattern: string;
  factRisks: string[];
}

export interface ReusableTopicCandidate {
  title: string;
  angle: string;
  differentiation: string;
  sourceSummary: string;
  targetAudience: string;
  audiencePain: string;
  coreConflict: string;
  format: string;
  adaptationStrategy: {
    keep: string[];
    replace: string[];
    add: string[];
    avoid: string[];
  };
}

function reusableTopicDecomposition(
  snapshot: unknown,
  transcriptHash: string,
): ReusableTopicDecomposition | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const value = snapshot as Record<string, unknown>;
  const nonEmptyStrings = (candidate: unknown, min = 1) =>
    Array.isArray(candidate) &&
    candidate.length >= min &&
    candidate.every(
      (entry) => typeof entry === "string" && entry.trim().length > 0,
    );
  if (
    value.transcriptHash !== transcriptHash ||
    value.decompositionVersion !== "v1" ||
    typeof value.hook !== "string" ||
    !value.hook.trim() ||
    !nonEmptyStrings(value.structureSteps, 2) ||
    !nonEmptyStrings(value.coreClaims) ||
    typeof value.reusablePattern !== "string" ||
    !value.reusablePattern.trim() ||
    !nonEmptyStrings(value.factRisks, 0)
  ) {
    return null;
  }
  return {
    hook: value.hook,
    structureSteps: value.structureSteps as string[],
    coreClaims: value.coreClaims as string[],
    reusablePattern: value.reusablePattern,
    factRisks: value.factRisks as string[],
  };
}

function topicCandidateFromSnapshot(
  snapshot: unknown,
  transcriptHash: string,
): ReusableTopicCandidate | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const value = snapshot as Record<string, unknown>;
  const strategy =
    value.adaptationStrategy &&
    typeof value.adaptationStrategy === "object" &&
    !Array.isArray(value.adaptationStrategy)
      ? (value.adaptationStrategy as Record<string, unknown>)
      : null;
  const strings = [
    "title",
    "angle",
    "differentiation",
    "sourceSummary",
    "targetAudience",
    "audiencePain",
    "coreConflict",
    "format",
  ] as const;
  const stringArray = (candidate: unknown) =>
    Array.isArray(candidate) &&
    candidate.every(
      (entry) => typeof entry === "string" && entry.trim().length > 0,
    );
  if (
    value.transcriptHash !== transcriptHash ||
    strings.some(
      (field) =>
        typeof value[field] !== "string" || !value[field].trim(),
    ) ||
    !strategy ||
    !stringArray(strategy.keep) ||
    !stringArray(strategy.replace) ||
    !stringArray(strategy.add) ||
    !stringArray(strategy.avoid)
  ) {
    return null;
  }
  return {
    title: value.title as string,
    angle: value.angle as string,
    differentiation: value.differentiation as string,
    sourceSummary: value.sourceSummary as string,
    targetAudience: value.targetAudience as string,
    audiencePain: value.audiencePain as string,
    coreConflict: value.coreConflict as string,
    format: value.format as string,
    adaptationStrategy: {
      keep: strategy.keep as string[],
      replace: strategy.replace as string[],
      add: strategy.add as string[],
      avoid: strategy.avoid as string[],
    },
  };
}

function reusableTopicCandidate(
  snapshot: unknown,
  transcriptHash: string,
): ReusableTopicCandidate | null {
  const candidate = topicCandidateFromSnapshot(snapshot, transcriptHash);
  if (!candidate || !snapshot || typeof snapshot !== "object") return null;
  const progress = (snapshot as Record<string, unknown>).generationProgress;
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
    return null;
  }
  const state = progress as Record<string, unknown>;
  const topic =
    state.topic && typeof state.topic === "object" && !Array.isArray(state.topic)
      ? (state.topic as Record<string, unknown>)
      : null;
  const draft =
    state.draft && typeof state.draft === "object" && !Array.isArray(state.draft)
      ? (state.draft as Record<string, unknown>)
      : null;
  return topic?.status === "completed" &&
    (draft?.status === "failed" || draft?.status === "completed")
    ? candidate
    : null;
}

type SourceType =
  | "creator_profile"
  | "favorites_folder"
  | "web"
  | "rss"
  | "darkhorse_query";
type AdapterStatus =
  | "succeeded_with_items"
  | "succeeded_no_change"
  | "partial"
  | "blocked"
  | "failed";

type SourceConfig =
  | {
      type: "creator_profile";
      collectorAccountId: string;
      canonicalUrl: string;
      externalAccountId: string;
    }
  | {
      type: "favorites_folder";
      collectorAccountId: string;
      folderId: string;
    }
  | {
      type: "web" | "rss";
      url: string;
      browserSessionRef?: string | null;
    }
  | {
      type: "darkhorse_query";
      collectorAccountId: string;
      keyword: string;
      board: "low_follower_breakout";
    };

export interface CollectorAccountProjection {
  accountId: string;
  accountHandle: string;
  platform: string;
  status: "active" | "archived";
}

export interface CollectorAccountReadPort {
  listCollectorAccounts(
    ctx: RequestContext,
  ): Promise<CollectorAccountProjection[]>;
  getCollectorAccount(
    ctx: RequestContext,
    accountId: string,
  ): Promise<CollectorAccountProjection | null>;
}

export interface IntelligenceAdapterItem {
  type: "video" | "article" | "trend_signal";
  platform: string;
  externalId: string | null;
  canonicalUrl: string;
  authorId: string | null;
  authorName: string | null;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  durationMs: number | null;
  metrics?: {
    likeCount: number | null;
    commentCount: number | null;
    collectCount: number | null;
    shareCount: number | null;
    followerCount: number | null;
    metricSource: string;
    qualityFlags: string[];
  };
  snapshot?: {
    finalUrl: string;
    title: string | null;
    contentHash: string;
    safeExtract: string | null;
    storageRef: string | null;
    retentionUntil: string | null;
    privacyClass: "public" | "authorized" | "restricted";
  };
}

export interface IntelligenceAdapterEnvelope {
  adapterStatus: AdapterStatus;
  upstreamEvidence: {
    adapter:
      | "douyin_profile"
      | "douhot_darkhorse"
      | "douyin_favorites"
      | "web"
      | "rss";
    responseShape: string;
    capturedAt: string;
    finalUrl?: string;
    listValid: boolean;
    upstreamWindow?: string;
  };
  items: IntelligenceAdapterItem[];
  checkpoint: unknown | null;
  errorCode: string | null;
  safeDiagnostics: Record<string, string | number | boolean | null>;
}

export interface IntelligenceServiceDeps {
  tasks: PersistentTaskService;
  collectorAccounts?: CollectorAccountReadPort;
  positioning?: {
    getVersion(
      ctx: RequestContext,
      positioningVersionId: string,
    ): Promise<{
      id: string;
      oneLiner: string;
      keywords: string[];
    }>;
  };
  topics?: {
    create(
      ctx: RequestContext,
      input: {
        title: string;
        angle: string;
        card?: {
          oneLiner: string;
          targetAudience?: string;
          audiencePain?: string;
          coreConflict?: string;
          hook?: string;
          contentStructure?: string[];
          format?: string;
          materialBasis?: string;
          riskNote?: string;
          proposal?: string;
          sourceDecomposition?: {
            hook: string;
            structureSteps: string[];
            coreClaims: string[];
            reusablePattern: string;
            factRisks: string[];
          };
          adaptationStrategy?: {
            keep: string[];
            replace: string[];
            add: string[];
            avoid: string[];
          };
          adaptedDraft?: {
            contentText: string;
            generatedFromTranscriptHash: string;
            strategyHash: string;
            templateVersion: string;
          };
        };
        sourceReferences?: Array<{
          kind: "original_video" | "source_page";
          platform: string;
          label: string;
          url: string;
          intelligenceItemId?: string;
        }>;
      },
    ): Promise<{ id: string }>;
  };
  now?: () => string;
  nextId?: (prefix: string) => string;
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|spm|from|share_)/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  return url.toString();
}

/**
 * 旧版 trend_sources 曾把整段分享口令写进 url 列。新入口继续严格校验 URL；只有
 * 一次性历史迁移允许从自由文本里提取首个有效 http(s) 地址，避免一条脏记录让
 * getWorkspace 整体抛 ERR_INVALID_URL。
 */
function canonicalUrlFromLegacyText(value: string): string | null {
  const candidates = value.match(/https?:\/\/[^\s<>"']+/giu) ?? [];
  for (const raw of candidates) {
    const candidate = raw.replace(/[，。！？；、)\]}>”’…]+$/gu, "");
    try {
      return canonicalUrl(candidate);
    } catch {
      // 继续尝试同一段历史文本中的下一个 URL；完全无有效地址时由迁移记 orphan。
    }
  }
  return null;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function adaptationStrategyHash(strategy: {
  keep: string[];
  replace: string[];
  add: string[];
  avoid: string[];
}): string {
  return `sha256:${hash(
    JSON.stringify({
      keep: strategy.keep,
      replace: strategy.replace,
      add: strategy.add,
      avoid: strategy.avoid,
    }),
  )}`;
}

function adaptationStrategyFromSnapshot(
  snapshot: Record<string, unknown>,
): ReusableTopicCandidate["adaptationStrategy"] | null {
  const value = snapshot.adaptationStrategy;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const strategy = value as Record<string, unknown>;
  const stringArray = (candidate: unknown): candidate is string[] =>
    Array.isArray(candidate) &&
    candidate.every(
      (entry) => typeof entry === "string" && entry.trim().length > 0,
    );
  return stringArray(strategy.keep) &&
    stringArray(strategy.replace) &&
    stringArray(strategy.add) &&
    stringArray(strategy.avoid)
    ? {
        keep: strategy.keep,
        replace: strategy.replace,
        add: strategy.add,
        avoid: strategy.avoid,
      }
    : null;
}

function legacyId(kind: string, value: string): string {
  return `intelligence-${kind}-legacy-${hash(value).slice(0, 24)}`;
}

function legacyPublishedAt(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const numeric = Number(value);
  const milliseconds =
    Number.isFinite(numeric) && numeric > 0
      ? numeric < 10_000_000_000
        ? numeric * 1_000
        : numeric
      : Date.parse(value);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null;
}

function toCollection(row: CollectionRow): IntelligenceCollectionResource {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    parentId: row.parentId,
    name: row.name,
    kind: row.kind as "system" | "custom",
    sortOrder: row.sortOrder,
    version: row.version,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function collectorAccountIdOf(row: SourceRow): string | null {
  if (
    row.type !== "creator_profile" &&
    row.type !== "favorites_folder" &&
    row.type !== "darkhorse_query"
  ) {
    return null;
  }
  const value = (row.adapterConfig as { collectorAccountId?: unknown } | null)
    ?.collectorAccountId;
  if (typeof value === "string" && value.length > 0) return value;
  const legacyRef = row.browserSessionRef;
  return legacyRef === `douyin-profile:${row.accountId}`
    ? row.accountId
    : null;
}

/**
 * 旧版内容雷达把“采集账号=来源 owner”只编码在受控的 browserSessionRef 里，
 * adapterConfig 尚无 collectorAccountId。展示层一直能识别该兼容形态，但执行层此前
 * 直接强转 adapterConfig，导致同一来源“看起来已绑定、点击同步却报账号不存在”。
 *
 * 这里只接受与 row.accountId 完全一致的历史引用，绝不从任意字符串猜账号；新来源仍
 * 以显式 collectorAccountId 为真值。
 */
function sourceConfigForExecution(row: SourceRow): SourceConfig {
  const config = row.adapterConfig as SourceConfig;
  if (
    config.type !== "creator_profile" &&
    config.type !== "favorites_folder" &&
    config.type !== "darkhorse_query"
  ) {
    return config;
  }
  const collectorAccountId = collectorAccountIdOf(row);
  return collectorAccountId && !config.collectorAccountId
    ? ({ ...config, collectorAccountId } as SourceConfig)
    : config;
}

function toSource(
  row: SourceRow,
  collector?: CollectorAccountProjection | null,
): IntelligenceSourceResource {
  const collectorAccountId = collectorAccountIdOf(row);
  const loginSource = collectorAccountId !== null;
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    collectionId: row.collectionId,
    type: row.type as SourceType,
    platform: row.platform,
    displayName: row.displayName,
    canonicalUrl: row.canonicalUrl,
    externalKey: row.externalKey,
    browserSessionRef: loginSource ? null : row.browserSessionRef,
    collector: collectorAccountId
      ? {
          accountId: collectorAccountId,
          accountHandle: collector?.accountHandle ?? null,
          platform: collector?.platform === "douyin" ? "douyin" : null,
          availability:
            collector?.status === "active"
              ? "active"
              : collector?.status === "archived"
                ? "archived"
                : "missing",
        }
      : null,
    monitorEnabled: row.monitorEnabled,
    syncPolicy: (row.syncPolicy ?? {}) as Record<string, unknown>,
    extractionInstruction: row.extractionInstruction,
    status: row.status as IntelligenceSourceResource["status"],
    version: row.version,
    lastRunAt: row.lastRunAt,
    nextRunAt: row.nextRunAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSourceMembership(row: SourceMembershipRow) {
  return {
    id: row.id,
    sourceId: row.sourceId,
    collectionId: row.collectionId,
    createdAt: row.createdAt,
  };
}

function toItem(row: ItemRow): IntelligenceItemResource {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    type: row.type as IntelligenceItemResource["type"],
    platform: row.platform,
    externalId: row.externalId,
    canonicalUrl: row.canonicalUrl,
    authorId: row.authorId,
    authorName: row.authorName,
    title: row.title,
    summary: row.summary,
    coverUrl: row.coverUrl,
    coverAssetId: row.coverAssetId,
    publishedAt: row.publishedAt,
    durationMs: row.durationMs,
    capturedAt: row.capturedAt,
    availability: row.availability as IntelligenceItemResource["availability"],
  };
}

function toMetric(row: MetricRow) {
  return {
    id: row.id,
    itemId: row.itemId,
    capturedAt: row.capturedAt,
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    collectCount: row.collectCount,
    shareCount: row.shareCount,
    followerCount: row.followerCount,
    metricSource: row.metricSource,
    qualityFlags: (row.qualityFlags ?? []) as string[],
  };
}

function toTranscript(row: TranscriptRow) {
  return {
    itemId: row.itemId,
    status: row.status as
      | "not_requested"
      | "queued"
      | "running"
      | "done"
      | "skipped"
      | "failed"
      | "blocked",
    text: row.text,
    source: row.source as "asr" | "caption" | "manual" | null,
    provider: row.provider,
    model: row.model,
    language: row.language,
    executionTaskId: row.executionTaskId,
    queuedAt: row.queuedAt,
    completedAt: row.completedAt,
    errorCode: row.errorCode,
  };
}

function toRun(row: RunRow) {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    sourceId: row.sourceId,
    executionTaskId: row.executionTaskId,
    trigger: row.trigger as "manual" | "schedule" | "initial" | "retry",
    status: row.status as "queued" | "running" | AdapterStatus,
    checkpoint: row.checkpoint,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    scannedCount: row.scannedCount,
    newCount: row.newCount,
    updatedCount: row.updatedCount,
    skippedCount: row.skippedCount,
    failedCount: row.failedCount,
    errorCode: row.errorCode as never,
    errorSummary: row.errorSummary,
    nextAction: row.nextAction as
      | "login"
      | "configure_model"
      | "retry"
      | "edit"
      | "none",
    createdAt: row.createdAt,
  };
}

function toEvent(row: RunEventRow) {
  return {
    id: row.id,
    runId: row.runId,
    step: row.step,
    status: row.status as AdapterStatus,
    occurredAt: row.occurredAt,
    itemRef: row.itemRef,
    message: row.message,
    safeDetails: (row.safeDetails ?? {}) as Record<
      string,
      string | number | boolean | null
    >,
  };
}

function toObservation(row: ObservationRow) {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    itemId: row.itemId,
    sourceId: row.sourceId,
    runId: row.runId,
    externalRef: row.externalRef,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    discoveryContext: (row.discoveryContext ?? {}) as Record<string, unknown>,
  };
}

function toSnapshot(row: SnapshotRow) {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    sourceId: row.sourceId,
    runId: row.runId,
    itemId: row.itemId,
    capturedAt: row.capturedAt,
    finalUrl: row.finalUrl,
    title: row.title,
    contentHash: row.contentHash,
    safeExtract: row.safeExtract,
    storageRef: row.storageRef,
    retentionUntil: row.retentionUntil,
    privacyClass: row.privacyClass as "public" | "authorized" | "restricted",
  };
}

function toTransform(
  row: TransformRow,
  task: ExecutionTaskResourceV2 | null = null,
) {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    itemId: row.itemId,
    sourceSnapshotId: row.sourceSnapshotId,
    kind: "topic" as const,
    positioningVersionId: row.positioningVersionId,
    aiTaskId: row.aiTaskId,
    idempotencyKey: row.idempotencyKey,
    status: row.status as "candidate" | "confirmed" | "cancelled",
    outputSnapshot: (row.outputSnapshot ?? null) as Record<
      string,
      unknown
    > | null,
    targetTopicId: row.targetTopicId,
    taskStatus: task?.status ?? null,
    taskErrorCode: task?.errorCode ?? null,
    taskErrorMessage: task?.errorMessage ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sourceIdentity(config: SourceConfig): {
  platform: string;
  externalKey: string;
  canonicalUrl: string | null;
  browserSessionRef: string | null;
  defaultName: string;
} {
  switch (config.type) {
    case "creator_profile":
      return {
        platform: "douyin",
        externalKey: `profile:${config.collectorAccountId}:${config.externalAccountId}`,
        canonicalUrl: canonicalUrl(config.canonicalUrl),
        browserSessionRef: `douyin-profile:${config.collectorAccountId}`,
        defaultName: config.externalAccountId,
      };
    case "favorites_folder":
      return {
        platform: "douyin",
        externalKey: `favorites:${config.collectorAccountId}:${config.folderId}`,
        canonicalUrl: null,
        browserSessionRef: `douyin-profile:${config.collectorAccountId}`,
        defaultName: "我的收藏",
      };
    case "web":
    case "rss": {
      const url = canonicalUrl(config.url);
      return {
        platform: "web",
        externalKey: hash(url),
        canonicalUrl: url,
        browserSessionRef: config.browserSessionRef ?? null,
        defaultName: url,
      };
    }
    case "darkhorse_query": {
      const keyword = normalizedName(config.keyword);
      return {
        platform: "douyin",
        externalKey: `darkhorse:${config.collectorAccountId}:${config.board}:${keyword}`,
        canonicalUrl: null,
        browserSessionRef: `douyin-profile:${config.collectorAccountId}`,
        defaultName: `黑马：${config.keyword.trim()}`,
      };
    }
  }
}

function assertSafeDiagnostics(
  diagnostics: Record<string, string | number | boolean | null>,
): void {
  const forbidden = /(cookie|authorization|password|secret|signature|token)/i;
  const unsafe = Object.keys(diagnostics).find((key) => forbidden.test(key));
  if (unsafe) {
    throw new IntelligenceValidationError(
      `safeDiagnostics 包含禁止字段: ${unsafe}`,
    );
  }
}

function nextActionFor(errorCode: string | null) {
  if (
    errorCode === "LOGIN_REQUIRED" ||
    errorCode === "LOGIN_WALL" ||
    errorCode === "CAPTCHA"
  ) {
    return "login";
  }
  if (errorCode === "MODEL_NOT_CONFIGURED") return "configure_model";
  if (errorCode === "FOLDER_MISSING") return "edit";
  return errorCode ? "retry" : "none";
}

const DAILY_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1_000;

function nextDailyRunAt(value: string): string {
  const parsed = Date.parse(value);
  const base = Number.isFinite(parsed) ? parsed : Date.now();
  return new Date(base + DAILY_SYNC_INTERVAL_MS).toISOString();
}

export function createIntelligenceService(
  db: Db,
  deps: IntelligenceServiceDeps,
) {
  const now = deps.now ?? (() => new Date().toISOString());
  const nextId =
    deps.nextId ?? ((prefix: string) => `${prefix}_${randomUUID()}`);

  async function account(ctx: RequestContext, op: string): Promise<string> {
    return requireAccountId(ctx.accountId, op);
  }

  async function assertCollectorEligible(
    ctx: RequestContext,
    collectorAccountId: string,
  ): Promise<CollectorAccountProjection> {
    if (!deps.collectorAccounts) {
      throw new IntelligenceValidationError("采集账号服务尚未接入");
    }
    const collector = await deps.collectorAccounts.getCollectorAccount(
      ctx,
      collectorAccountId,
    );
    if (!collector) {
      throw new OwnershipError("Collector account not found");
    }
    if (collector.status !== "active") {
      throw new IntelligenceValidationError("采集账号已归档，请重新选择");
    }
    if (collector.platform !== "douyin") {
      throw new IntelligenceValidationError("采集账号必须是抖音账号");
    }
    return collector;
  }

  async function presentSource(
    ctx: RequestContext,
    row: SourceRow,
    knownCollector?: CollectorAccountProjection | null,
  ): Promise<IntelligenceSourceResource> {
    const collectorAccountId = collectorAccountIdOf(row);
    if (!collectorAccountId) return toSource(row);
    if (knownCollector !== undefined) return toSource(row, knownCollector);
    const collector = deps.collectorAccounts
      ? await deps.collectorAccounts
          .getCollectorAccount(ctx, collectorAccountId)
          .catch(() => null)
      : null;
    return toSource(row, collector);
  }

  async function ensureSystemCollections(ctx: RequestContext) {
    const accountId = await account(ctx, "intelligence.workspace.bootstrap");
    const stamp = now();
    const rows = [
      { name: "我的收藏", sortOrder: 0 },
      { name: "黑马发现", sortOrder: 1 },
    ];
    for (const row of rows) {
      await db
        .insert(intelligenceCollections)
        .values({
          id: nextId("intelligence-collection"),
          userId: ctx.userId,
          accountId,
          parentId: null,
          name: row.name,
          normalizedName: normalizedName(row.name),
          kind: "system",
          sortOrder: row.sortOrder,
          version: 1,
          archivedAt: null,
          createdAt: stamp,
          updatedAt: stamp,
        })
        .onConflictDoNothing();
    }
  }

  async function requireCollection(
    ctx: RequestContext,
    id: string,
  ): Promise<CollectionRow> {
    const accountId = await account(ctx, "intelligence.collection");
    const [row] = await db
      .select()
      .from(intelligenceCollections)
      .where(
        and(
          eq(intelligenceCollections.id, id),
          eq(intelligenceCollections.userId, ctx.userId),
          eq(intelligenceCollections.accountId, accountId),
        ),
      )
      .limit(1);
    if (!row) throw new OwnershipError("Intelligence collection not found");
    return row;
  }

  async function requireSource(
    ctx: RequestContext,
    id: string,
  ): Promise<SourceRow> {
    const accountId = await account(ctx, "intelligence.source");
    const [row] = await db
      .select()
      .from(intelligenceSources)
      .where(
        and(
          eq(intelligenceSources.id, id),
          eq(intelligenceSources.userId, ctx.userId),
          eq(intelligenceSources.accountId, accountId),
        ),
      )
      .limit(1);
    if (!row) throw new OwnershipError("Intelligence source not found");
    return row;
  }

  async function requireRun(
    ctx: RequestContext,
    id: string,
  ): Promise<RunRow> {
    const accountId = await account(ctx, "intelligence.run");
    const [row] = await db
      .select()
      .from(intelligenceSyncRuns)
      .where(
        and(
          eq(intelligenceSyncRuns.id, id),
          eq(intelligenceSyncRuns.userId, ctx.userId),
          eq(intelligenceSyncRuns.accountId, accountId),
        ),
      )
      .limit(1);
    if (!row) throw new OwnershipError("Intelligence run not found");
    return row;
  }

  async function requireItem(
    ctx: RequestContext,
    id: string,
  ): Promise<ItemRow> {
    const accountId = await account(ctx, "intelligence.item");
    const [row] = await db
      .select()
      .from(intelligenceItems)
      .where(
        and(
          eq(intelligenceItems.id, id),
          eq(intelligenceItems.userId, ctx.userId),
          eq(intelligenceItems.accountId, accountId),
        ),
      )
      .limit(1);
    if (!row) throw new OwnershipError("Intelligence item not found");
    return row;
  }

  async function requireSnapshot(
    ctx: RequestContext,
    id: string,
  ): Promise<SnapshotRow> {
    const accountId = await account(ctx, "intelligence.snapshot");
    const [row] = await db
      .select()
      .from(sourceSnapshots)
      .where(
        and(
          eq(sourceSnapshots.id, id),
          eq(sourceSnapshots.userId, ctx.userId),
          eq(sourceSnapshots.accountId, accountId),
        ),
      )
      .limit(1);
    if (!row) throw new OwnershipError("Intelligence snapshot not found");
    return row;
  }

  async function requireTransform(
    ctx: RequestContext,
    id: string,
  ): Promise<TransformRow> {
    const accountId = await account(ctx, "intelligence.transform");
    const [row] = await db
      .select()
      .from(intelligenceTransforms)
      .where(
        and(
          eq(intelligenceTransforms.id, id),
          eq(intelligenceTransforms.userId, ctx.userId),
          eq(intelligenceTransforms.accountId, accountId),
        ),
      )
      .limit(1);
    if (!row) throw new OwnershipError("Intelligence transform not found");
    return row;
  }

  async function transcriptTopicLock(
    ctx: RequestContext,
    itemId: string,
  ): Promise<{ locked: boolean; topicBusy: boolean }> {
    const accountId = await account(ctx, "intelligence.transcript.lock");
    const transforms = await db
      .select()
      .from(intelligenceTransforms)
      .where(
        and(
          eq(intelligenceTransforms.itemId, itemId),
          eq(intelligenceTransforms.userId, ctx.userId),
          eq(intelligenceTransforms.accountId, accountId),
        ),
      )
      .orderBy(desc(intelligenceTransforms.createdAt));
    if (transforms.some((transform) => transform.outputSnapshot !== null)) {
      return { locked: true, topicBusy: false };
    }
    const taskIds = transforms
      .map((transform) => transform.aiTaskId)
      .filter((id): id is string => Boolean(id));
    if (taskIds.length === 0) {
      return { locked: false, topicBusy: false };
    }
    const tasks = await db
      .select({ status: executionTasks.status })
      .from(executionTasks)
      .where(
        and(
          eq(executionTasks.userId, ctx.userId),
          eq(executionTasks.accountId, accountId),
          inArray(executionTasks.id, taskIds),
        ),
      );
    return {
      locked: false,
      topicBusy: tasks.some((task) =>
        ACTIVE_TOPIC_TASK_STATUSES.has(task.status),
      ),
    };
  }

  async function ensureSourceMembership(
    ctx: RequestContext,
    source: SourceRow,
    collectionId: string | null,
  ): Promise<SourceMembershipRow | null> {
    if (!collectionId) return null;
    await requireCollection(ctx, collectionId);
    const [created] = await db
      .insert(intelligenceSourceCollectionMemberships)
      .values({
        id: nextId("intelligence-source-membership"),
        userId: source.userId,
        accountId: source.accountId,
        sourceId: source.id,
        collectionId,
        createdAt: now(),
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const [existing] = await db
      .select()
      .from(intelligenceSourceCollectionMemberships)
      .where(
        and(
          eq(intelligenceSourceCollectionMemberships.userId, source.userId),
          eq(
            intelligenceSourceCollectionMemberships.accountId,
            source.accountId,
          ),
          eq(intelligenceSourceCollectionMemberships.sourceId, source.id),
          eq(
            intelligenceSourceCollectionMemberships.collectionId,
            collectionId,
          ),
        ),
      )
      .limit(1);
    return existing ?? null;
  }

  /**
   * T-482 旧「信号源」到内容雷达的一次性兼容迁移。
   *
   * 旧表只作为只读输入；新表使用稳定 legacy id + 领域唯一键双重幂等。迁移完成后
   * ledger.writeFenceEnabled=true，表示产品写入口必须只走 intelligence.*。旧表暂不物理
   * 删除，留作数量/抽样核对与可恢复证据。
   */
  async function readLegacyInventory(ctx: RequestContext) {
    const accountId = await account(ctx, "intelligence.migrations.inventory");
    const [
      oldBenchmarkSources,
      oldBenchmarkWorks,
      oldTrendSources,
      oldFavoritesFolders,
      oldFavoritesItems,
    ] = await Promise.all([
      db
        .select()
        .from(benchmarkSources)
        .where(
          and(
            eq(benchmarkSources.userId, ctx.userId),
            eq(benchmarkSources.accountId, accountId),
          ),
        ),
      db
        .select()
        .from(benchmarkWorks)
        .where(
          and(
            eq(benchmarkWorks.userId, ctx.userId),
            eq(benchmarkWorks.accountId, accountId),
          ),
        ),
      db
        .select()
        .from(trendSources)
        .where(
          and(
            eq(trendSources.userId, ctx.userId),
            eq(trendSources.accountId, accountId),
          ),
        ),
      db
        .select()
        .from(favoritesFolders)
        .where(
          and(
            eq(favoritesFolders.userId, ctx.userId),
            eq(favoritesFolders.accountId, accountId),
          ),
        ),
      db
        .select()
        .from(favoritesItems)
        .where(
          and(
            eq(favoritesItems.userId, ctx.userId),
            eq(favoritesItems.accountId, accountId),
          ),
        ),
    ]);
    const counts = {
      legacyBenchmarkSources: oldBenchmarkSources.length,
      legacyBenchmarkWorks: oldBenchmarkWorks.length,
      legacyTrendSources: oldTrendSources.length,
      legacyFavoritesFolders: oldFavoritesFolders.length,
      legacyFavoritesItems: oldFavoritesItems.length,
    };
    return {
      accountId,
      counts,
      inventoryHash: hash(
        JSON.stringify(
          Object.entries(counts).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
      ),
      oldBenchmarkSources,
      oldBenchmarkWorks,
      oldTrendSources,
      oldFavoritesFolders,
      oldFavoritesItems,
    };
  }

  async function migrateLegacySignalSourcesOnce(
    ctx: RequestContext,
  ): Promise<MigrationLedgerRow | null> {
    const {
      accountId,
      counts: inventoryCounts,
      inventoryHash,
      oldBenchmarkSources,
      oldBenchmarkWorks,
      oldTrendSources,
      oldFavoritesFolders,
      oldFavoritesItems,
    } = await readLegacyInventory(ctx);
    const inventoryTotal = Object.values(inventoryCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    if (inventoryTotal === 0) return null;

    const idempotencyKey = "legacy-signal-sources-v1";
    const [existing] = await db
      .select()
      .from(intelligenceMigrationLedgers)
      .where(
        and(
          eq(intelligenceMigrationLedgers.userId, ctx.userId),
          eq(intelligenceMigrationLedgers.accountId, accountId),
          eq(
            intelligenceMigrationLedgers.idempotencyKey,
            idempotencyKey,
          ),
        ),
      )
      .limit(1);
    if (
      existing &&
      existing.inventoryHash === inventoryHash &&
      existing.stage === "retired" &&
      existing.writeFenceEnabled
    ) {
      return existing;
    }

    const stamp = now();
    const ledgerId =
      existing?.id ??
      legacyId("migration", `${ctx.userId}:${accountId}:${idempotencyKey}`);
    if (!existing) {
      await db.insert(intelligenceMigrationLedgers).values({
        id: ledgerId,
        userId: ctx.userId,
        accountId,
        idempotencyKey,
        inventoryHash,
        stage: "inventory",
        checkpoint: null,
        counts: inventoryCounts,
        orphanReport: null,
        writeFenceEnabled: false,
        createdAt: stamp,
        updatedAt: stamp,
      });
    }

    await db
      .insert(intelligenceCollections)
      .values({
        id: legacyId("collection", `${ctx.userId}:${accountId}:历史信源`),
        userId: ctx.userId,
        accountId,
        parentId: null,
        name: "历史信源",
        normalizedName: normalizedName("历史信源"),
        kind: "custom",
        sortOrder: 20,
        version: 1,
        archivedAt: null,
        createdAt: stamp,
        updatedAt: stamp,
      })
      .onConflictDoNothing();
    const collections = await db
      .select()
      .from(intelligenceCollections)
      .where(
        and(
          eq(intelligenceCollections.userId, ctx.userId),
          eq(intelligenceCollections.accountId, accountId),
        ),
      );
    const historyCollection = collections.find(
      (row) => row.normalizedName === normalizedName("历史信源"),
    );
    const favoritesCollection = collections.find(
      (row) => row.normalizedName === normalizedName("我的收藏"),
    );
    const darkhorseCollection = collections.find(
      (row) => row.normalizedName === normalizedName("黑马发现"),
    );
    if (!historyCollection || !favoritesCollection || !darkhorseCollection) {
      throw new Error("legacy migration collections not ready");
    }

    const migratedSourceIds = new Set<string>();
    const migratedItemIds = new Set<string>();
    const orphanSamples: string[] = [];
    const sourceByLegacyId = new Map<string, SourceRow>();

    const ensureLegacySource = async (input: {
      legacyKey: string;
      type: SourceType;
      platform: string;
      displayName: string;
      canonicalUrl: string | null;
      externalKey: string;
      browserSessionRef: string | null;
      adapterConfig: SourceConfig;
      monitorEnabled: boolean;
      collectionId: string;
      lastRunAt?: string | null;
    }): Promise<SourceRow> => {
      const canonical = input.canonicalUrl
        ? canonicalUrl(input.canonicalUrl)
        : null;
      await db
        .insert(intelligenceSources)
        .values({
          id: legacyId("source", input.legacyKey),
          userId: ctx.userId,
          accountId,
          collectionId: input.collectionId,
          type: input.type,
          platform: input.platform,
          displayName: input.displayName.trim() || input.externalKey,
          canonicalUrl: canonical,
          canonicalUrlHash: canonical ? hash(canonical) : null,
          externalKey: input.externalKey,
          browserSessionRef: input.browserSessionRef,
          adapterConfig: input.adapterConfig,
          monitorEnabled: input.monitorEnabled,
          syncPolicy: input.monitorEnabled
            ? { mode: "scheduled", interval: "daily" }
            : { mode: "manual" },
          extractionInstruction: null,
          status: "active",
          version: 1,
          lastRunAt: input.lastRunAt ?? null,
          nextRunAt: null,
          createdAt: stamp,
          updatedAt: stamp,
        })
        .onConflictDoNothing();
      const [source] = await db
        .select()
        .from(intelligenceSources)
        .where(
          and(
            eq(intelligenceSources.userId, ctx.userId),
            eq(intelligenceSources.accountId, accountId),
            eq(intelligenceSources.type, input.type),
            eq(intelligenceSources.externalKey, input.externalKey),
          ),
        )
        .limit(1);
      if (!source) throw new Error("legacy source migration failed");
      await ensureSourceMembership(ctx, source, input.collectionId);
      migratedSourceIds.add(source.id);
      return source;
    };

    for (const old of oldBenchmarkSources) {
      const homeUrl =
        old.homeUrl?.trim() ||
        `https://www.douyin.com/user/${encodeURIComponent(
          old.externalAccountId,
        )}`;
      const source = await ensureLegacySource({
        legacyKey: `benchmark:${old.id}`,
        type: "creator_profile",
        platform: old.platform,
        displayName: old.nickname ?? old.externalAccountId,
        canonicalUrl: homeUrl,
        externalKey: old.externalAccountId,
        browserSessionRef: `douyin-profile:${accountId}`,
        adapterConfig: {
          type: "creator_profile",
          collectorAccountId: accountId,
          canonicalUrl: homeUrl,
          externalAccountId: old.externalAccountId,
        },
        monitorEnabled: old.enabled,
        collectionId: historyCollection.id,
      });
      sourceByLegacyId.set(old.id, source);
    }

    for (const old of oldTrendSources) {
      const type: "web" | "rss" =
        old.sourceType === "rss" ? "rss" : "web";
      const normalizedUrl = canonicalUrlFromLegacyText(old.url);
      if (!normalizedUrl) {
        orphanSamples.push(`trend_source:${old.id}:invalid_url`);
        continue;
      }
      const sourceDomain = new URL(normalizedUrl).hostname;
      const source = await ensureLegacySource({
        legacyKey: `trend:${old.id}`,
        type,
        platform: "web",
        displayName: old.name || old.domain || normalizedUrl,
        canonicalUrl: normalizedUrl,
        externalKey: hash(normalizedUrl),
        browserSessionRef:
          type === "web" ? `web-domain:${sourceDomain}` : null,
        adapterConfig:
          type === "web"
            ? {
                type: "web",
                url: normalizedUrl,
                browserSessionRef: `web-domain:${sourceDomain}`,
              }
            : { type: "rss", url: normalizedUrl },
        monitorEnabled: old.enabled,
        collectionId: historyCollection.id,
      });
      sourceByLegacyId.set(old.id, source);
    }

    for (const old of oldFavoritesFolders) {
      const folderKey = old.collectsId?.trim() || old.name;
      const source = await ensureLegacySource({
        legacyKey: `favorites:${old.id}`,
        type: "favorites_folder",
        platform: "douyin",
        displayName: old.name,
        canonicalUrl: null,
        externalKey: folderKey,
        browserSessionRef: `douyin-profile:${accountId}`,
        adapterConfig: {
          type: "favorites_folder",
          collectorAccountId: accountId,
          folderId: folderKey,
        },
        monitorEnabled: old.enabled,
        collectionId: favoritesCollection.id,
        lastRunAt: old.lastSyncedAt,
      });
      sourceByLegacyId.set(old.id, source);
    }

    const ensureLegacyItem = async (input: {
      legacyKey: string;
      source: SourceRow;
      awemeId: string;
      url: string;
      title: string;
      authorId: string | null;
      authorName: string | null;
      publishedAt: string | null;
      durationMs: number | null;
      capturedAt: string;
      metrics?: {
        likeCount: number | null;
        commentCount: number | null;
        collectCount: number | null;
        shareCount: number | null;
        followerCount: number | null;
        metricSource: string;
      };
      transcript: string | null;
      transcriptStatus: string | null;
      discovery: Record<string, unknown>;
    }): Promise<void> => {
      const url = canonicalUrl(input.url);
      const itemId = legacyId("item", `${input.source.platform}:${input.awemeId}`);
      await db
        .insert(intelligenceItems)
        .values({
          id: itemId,
          userId: ctx.userId,
          accountId,
          type: "video",
          platform: "douyin",
          externalId: input.awemeId,
          canonicalUrl: url,
          canonicalUrlHash: hash(url),
          authorId: input.authorId,
          authorName: input.authorName,
          title: input.title,
          summary: input.title || null,
          coverUrl: null,
          coverAssetId: null,
          publishedAt: input.publishedAt,
          durationMs: input.durationMs,
          capturedAt: input.capturedAt,
          availability: "available",
          createdAt: stamp,
          updatedAt: stamp,
        })
        .onConflictDoNothing();
      const [item] = await db
        .select()
        .from(intelligenceItems)
        .where(
          and(
            eq(intelligenceItems.userId, ctx.userId),
            eq(intelligenceItems.accountId, accountId),
            eq(intelligenceItems.platform, "douyin"),
            eq(intelligenceItems.type, "video"),
            eq(intelligenceItems.externalId, input.awemeId),
          ),
        )
        .limit(1);
      if (!item) throw new Error("legacy item migration failed");
      migratedItemIds.add(item.id);
      const runId = `legacy-migration:${ledgerId}`;
      await db
        .insert(itemSourceObservations)
        .values({
          id: legacyId("observation", input.legacyKey),
          userId: ctx.userId,
          accountId,
          itemId: item.id,
          sourceId: input.source.id,
          runId,
          externalRef: input.legacyKey,
          firstSeenAt: input.capturedAt,
          lastSeenAt: input.capturedAt,
          discoveryContext: input.discovery,
        })
        .onConflictDoNothing();
      const safeExtract = input.title.trim() || null;
      await db
        .insert(sourceSnapshots)
        .values({
          id: legacyId("snapshot", input.legacyKey),
          userId: ctx.userId,
          accountId,
          sourceId: input.source.id,
          runId,
          itemId: item.id,
          capturedAt: input.capturedAt,
          finalUrl: url,
          title: input.title || null,
          contentHash: hash(`${url}\n${input.title}`),
          safeExtract,
          storageRef: null,
          retentionUntil: null,
          privacyClass: "public",
        })
        .onConflictDoNothing();
      if (input.metrics) {
        await db
          .insert(itemMetricSnapshots)
          .values({
            id: legacyId("metric", input.legacyKey),
            userId: ctx.userId,
            accountId,
            itemId: item.id,
            capturedAt: input.capturedAt,
            ...input.metrics,
            qualityFlags: [
              ...(input.metrics.commentCount === null
                ? ["comment_count_missing"]
                : []),
              "migrated_from_legacy_signal_source",
            ],
          })
          .onConflictDoNothing();
      }
      const transcriptText = input.transcript?.trim() || null;
      const transcriptStatus =
        transcriptText
          ? "done"
          : input.transcriptStatus === "failed" ||
              input.transcriptStatus === "skipped" ||
              input.transcriptStatus === "blocked"
            ? input.transcriptStatus
            : "not_requested";
      await db
        .insert(itemTranscripts)
        .values({
          itemId: item.id,
          userId: ctx.userId,
          accountId,
          status: transcriptStatus,
          text: transcriptText,
          source: transcriptText ? "legacy_migration" : null,
          provider: null,
          model: null,
          language: transcriptText ? "zh" : null,
          executionTaskId: null,
          queuedAt: null,
          completedAt: transcriptText ? input.capturedAt : null,
          errorCode: null,
          updatedAt: stamp,
        })
        .onConflictDoNothing();
    };

    for (const old of oldBenchmarkWorks) {
      let source = sourceByLegacyId.get(old.sourceId);
      if (old.discovery === "darkhorse" && old.discoveryKeyword?.trim()) {
        const keyword = old.discoveryKeyword.trim();
        source = await ensureLegacySource({
          legacyKey: `darkhorse:${keyword}`,
          type: "darkhorse_query",
          platform: "douyin",
          displayName: `黑马：${keyword}`,
          canonicalUrl: null,
          externalKey: `low_follower_breakout:${normalizedName(keyword)}`,
          browserSessionRef: `douyin-profile:${accountId}`,
          adapterConfig: {
            type: "darkhorse_query",
            collectorAccountId: accountId,
            keyword,
            board: "low_follower_breakout",
          },
          monitorEnabled: true,
          collectionId: darkhorseCollection.id,
        });
      }
      if (!source) {
        orphanSamples.push(`benchmark_work:${old.id}:missing_source`);
        continue;
      }
      await ensureLegacyItem({
        legacyKey: `benchmark-work:${old.id}`,
        source,
        awemeId: old.awemeId,
        url: `https://www.douyin.com/video/${old.awemeId}`,
        title: old.description,
        authorId: old.sourceExternalAccountId,
        authorName: source.displayName,
        publishedAt: legacyPublishedAt(old.createTime),
        durationMs: old.duration,
        capturedAt: old.capturedAt,
        metrics: {
          likeCount: old.diggCount,
          commentCount: old.commentCount,
          collectCount: old.collectCount,
          shareCount: old.shareCount,
          followerCount: old.authorFollowerCount,
          metricSource:
            old.discovery === "darkhorse"
              ? "legacy_darkhorse"
              : "legacy_benchmark",
        },
        transcript: old.transcript,
        transcriptStatus: old.transcriptStatus,
        discovery: {
          kind: old.discovery,
          keyword: old.discoveryKeyword,
          viral: old.isViral,
          viralMultiple: old.viralMultiple,
        },
      });
    }

    for (const old of oldFavoritesItems) {
      const source = sourceByLegacyId.get(old.folderId);
      if (!source) {
        orphanSamples.push(`favorites_item:${old.id}:missing_folder`);
        continue;
      }
      await ensureLegacyItem({
        legacyKey: `favorites-item:${old.id}`,
        source,
        awemeId: old.awemeId,
        url:
          old.url.trim() ||
          `https://www.douyin.com/video/${old.awemeId}`,
        title: old.title,
        authorId: null,
        authorName: old.authorNickname || null,
        publishedAt: null,
        durationMs: null,
        capturedAt: old.updatedAt || old.createdAt,
        transcript: old.transcript,
        transcriptStatus: null,
        discovery: {
          kind: "favorites",
          candidateId: old.candidateId,
          legacyStatus: old.status,
          distillStatus: old.distillStatus,
        },
      });
    }

    const counts = {
      ...inventoryCounts,
      migratedSources: migratedSourceIds.size,
      migratedItems: migratedItemIds.size,
      orphanCount: orphanSamples.length,
      duplicateCount:
        oldBenchmarkWorks.length +
        oldFavoritesItems.length -
        migratedItemIds.size -
        orphanSamples.filter(
          (sample) =>
            sample.startsWith("benchmark_work:") ||
            sample.startsWith("favorites_item:"),
        ).length,
    };
    const [updated] = await db
      .update(intelligenceMigrationLedgers)
      .set({
        inventoryHash,
        // UI、消费者和旧写者均已切换到内容雷达；旧表只保留为只读恢复证据。
        stage: "retired",
        checkpoint: {
          sourceIds: [...migratedSourceIds],
          itemIds: [...migratedItemIds],
        },
        counts,
        orphanReport: {
          count: orphanSamples.length,
          samples: orphanSamples.slice(0, 20),
        },
        writeFenceEnabled: true,
        updatedAt: now(),
      })
      .where(eq(intelligenceMigrationLedgers.id, ledgerId))
      .returning();
    if (!updated) throw new Error("legacy migration ledger update failed");
    return updated;
  }

  async function reconcileActiveRunWithTask(
    run: RunRow,
    task: ExecutionTaskResourceV2,
  ): Promise<{ run: RunRow; active: boolean }> {
    if (task.status === "queued" && run.status === "running") {
      const [updated] = await db
        .update(intelligenceSyncRuns)
        .set({
          status: "queued",
          updatedAt: now(),
        })
        .where(
          and(
            eq(intelligenceSyncRuns.id, run.id),
            eq(intelligenceSyncRuns.status, "running"),
          ),
        )
        .returning();
      return {
        run: updated ?? { ...run, status: "queued", updatedAt: now() },
        active: true,
      };
    }

    const terminal =
      task.status === "failed" ||
      task.status === "cancelled" ||
      task.status === "paused" ||
      task.status === "blocked" ||
      task.status === "succeeded";
    if (!terminal) return { run, active: true };

    const runStatus =
      task.status === "blocked"
        ? "blocked"
        : task.status === "succeeded"
          ? "succeeded_no_change"
          : "failed";
    const errorCode =
      task.status === "blocked" &&
      (task.errorCode === "LOGIN_REQUIRED" || task.errorCode === "CAPTCHA")
        ? task.errorCode
        : null;
    const errorSummary =
      task.status === "cancelled"
        ? "execution task cancelled"
        : task.status === "paused"
          ? "execution task paused"
          : task.status === "failed"
            ? "execution task failed"
            : task.status === "blocked"
              ? "execution task blocked"
              : null;
    const stamp = now();
    const [updated] = await db
      .update(intelligenceSyncRuns)
      .set({
        status: runStatus,
        finishedAt: stamp,
        failedCount:
          runStatus === "failed"
            ? Math.max(1, run.failedCount)
            : run.failedCount,
        errorCode,
        errorSummary,
        nextAction:
          runStatus === "failed" ? "retry" : nextActionFor(errorCode),
        updatedAt: stamp,
      })
      .where(
        and(
          eq(intelligenceSyncRuns.id, run.id),
          inArray(intelligenceSyncRuns.status, ["queued", "running"]),
        ),
      )
      .returning();
    return {
      run:
        updated ?? {
          ...run,
          status: runStatus,
          finishedAt: stamp,
          errorCode,
          errorSummary,
          updatedAt: stamp,
        },
      active: false,
    };
  }

  async function startRun(
    ctx: RequestContext,
    sourceId: string,
    input: {
      trigger: "manual" | "schedule" | "initial" | "retry";
      idempotencyKey: string;
    },
  ): Promise<{ run: ReturnType<typeof toRun>; task: ExecutionTaskResourceV2 }> {
    const source = await requireSource(ctx, sourceId);
    const config = sourceConfigForExecution(source);
    if (
      config.type === "creator_profile" ||
      config.type === "favorites_folder" ||
      config.type === "darkhorse_query"
    ) {
      await assertCollectorEligible(ctx, config.collectorAccountId);
    }
    if (source.status !== "active") {
      throw new IntelligenceConflictError(
        `来源当前为 ${source.status}，不能开始同步`,
      );
    }
    // APP 退出时来源任务可能停在 running；租约过期后若不先恢复，run 表仍会
    // 永久保持 active，页面只能一直转圈且所有后续点击都被冲突闸拦住。
    await deps.tasks.recoverExpiredLeases();
    let active = await db
      .select()
      .from(intelligenceSyncRuns)
      .where(
        and(
          eq(intelligenceSyncRuns.sourceId, sourceId),
          inArray(intelligenceSyncRuns.status, ["queued", "running"]),
        ),
      )
      .limit(1);
    if (active[0]) {
      const task = await deps.tasks.get(ctx, active[0].executionTaskId);
      const reconciled = await reconcileActiveRunWithTask(active[0], task);
      active = reconciled.active ? [reconciled.run] : [];
    }
    if (active[0]) {
      const task = await deps.tasks.get(ctx, active[0].executionTaskId);
      // queued 既可能是首次同步，也可能是本次刚恢复的过期租约。复用同一
      // run/task 交给装配层立即重新驱动，避免制造第二条任务或返回永久 409。
      if (task.status === "queued") {
        return {
          run: toRun(active[0]),
          task,
        };
      }
      if (input.trigger === "initial" && task.status === "running") {
        return { run: toRun(active[0]), task };
      }
      throw new IntelligenceConflictError("该来源已有排队或运行中的同步");
    }
    const task = await deps.tasks.enqueue(ctx, {
      kind: "source_sync",
      ownerType: "source",
      ownerId: sourceId,
      idempotencyKey: input.idempotencyKey,
      payload: {
        sourceId,
        sourceType: source.type,
        trigger: input.trigger,
      },
      priority: input.trigger === "manual" ? 20 : 10,
    });
    const [existing] = await db
      .select()
      .from(intelligenceSyncRuns)
      .where(eq(intelligenceSyncRuns.executionTaskId, task.id))
      .limit(1);
    if (existing) return { run: toRun(existing), task };
    const stamp = now();
    const [run] = await db
      .insert(intelligenceSyncRuns)
      .values({
        id: nextId("intelligence-run"),
        userId: source.userId,
        accountId: source.accountId,
        sourceId,
        executionTaskId: task.id,
        trigger: input.trigger,
        status: "queued",
        checkpoint: null,
        adapterEvidence: null,
        startedAt: null,
        finishedAt: null,
        scannedCount: 0,
        newCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        errorCode: null,
        errorSummary: null,
        nextAction: "none",
        createdAt: stamp,
        updatedAt: stamp,
      })
      // manual/schedule 并发可能都复用了 active-owner 栅栏返回的同一个 task；
      // executionTaskId 唯一索引决定唯一赢家，失败方随后回读同一 run。
      .onConflictDoNothing()
      .returning();
    if (run) return { run: toRun(run), task };
    const [racedRun] = await db
      .select()
      .from(intelligenceSyncRuns)
      .where(eq(intelligenceSyncRuns.executionTaskId, task.id))
      .limit(1);
    if (!racedRun) throw new Error("failed to create intelligence run");
    return { run: toRun(racedRun), task };
  }

  const service = {
    async listCollectorAccounts(ctx: RequestContext) {
      await account(ctx, "intelligence.collectors.list");
      if (!deps.collectorAccounts) {
        throw new IntelligenceValidationError("采集账号服务尚未接入");
      }
      const collectors =
        await deps.collectorAccounts.listCollectorAccounts(ctx);
      return collectors
        .filter(
          (collector) =>
            collector.status === "active" &&
            collector.platform === "douyin",
        )
        .sort(
          (left, right) =>
            left.accountHandle.localeCompare(right.accountHandle, "zh-CN") ||
            left.accountId.localeCompare(right.accountId),
        )
        .map((collector) => ({
          accountId: collector.accountId,
          accountHandle: collector.accountHandle,
          platform: "douyin" as const,
        }));
    },

    /**
     * 旧信号源写栅栏。迁移 ledger 进入 write_fenced 之后的任一终态，旧 benchmark /
     * favorites 定时采集器都必须短路，禁止继续写旧表或直接创建候选。
     */
    async isLegacySignalSourceWriteFenced(
      ctx: RequestContext,
    ): Promise<boolean> {
      const accountId = await account(
        ctx,
        "intelligence.migrations.write-fence",
      );
      const [ledger] = await db
        .select({
          stage: intelligenceMigrationLedgers.stage,
          enabled: intelligenceMigrationLedgers.writeFenceEnabled,
        })
        .from(intelligenceMigrationLedgers)
        .where(
          and(
            eq(intelligenceMigrationLedgers.userId, ctx.userId),
            eq(intelligenceMigrationLedgers.accountId, accountId),
            eq(
              intelligenceMigrationLedgers.idempotencyKey,
              "legacy-signal-sources-v1",
            ),
          ),
        )
        .limit(1);
      return Boolean(
        ledger?.enabled &&
          [
            "write_fenced",
            "consumers_switched",
            "observing",
            "retired",
          ].includes(ledger.stage),
      );
    },

    async inventoryLegacyMigration(ctx: RequestContext) {
      const inventory = await readLegacyInventory(ctx);
      return {
        inventoryHash: inventory.inventoryHash,
        counts: inventory.counts,
        writers: [
          "intelligence.service",
        ],
        readers: [
          "intelligence.workspace",
          "intelligence.migrations.report",
        ],
        risks: [
          "旧表保留为只读核对来源，禁止继续作为产品写入口",
          "迁移按账号执行，未知来源关系会进入 orphan 报告",
        ],
      };
    },

    async startLegacyMigration(
      ctx: RequestContext,
      input: { inventoryHash: string; idempotencyKey: string },
    ) {
      const inventory = await readLegacyInventory(ctx);
      if (inventory.inventoryHash !== input.inventoryHash) {
        throw new IntelligenceConflictError(
          "旧信源盘点已变化，请重新盘点后再迁移",
        );
      }
      await ensureSystemCollections(ctx);
      const ownerId = legacyId(
        "migration",
        `${ctx.userId}:${inventory.accountId}:legacy-signal-sources-v1`,
      );
      const task = await deps.tasks.enqueue(ctx, {
        kind: "migration",
        ownerType: "migration",
        ownerId,
        idempotencyKey: input.idempotencyKey,
        payload: {
          inventoryHash: input.inventoryHash,
          migrationKind: "legacy_signal_sources_v1",
        },
        priority: 100,
        maxAttempts: 1,
      });
      const claim = await deps.tasks.claimTask({
        taskId: task.id,
        workerId: `intelligence-migration:${task.id}`,
        leaseSeconds: 300,
      });
      const ledger = await migrateLegacySignalSourcesOnce(ctx);
      let completedTask = task;
      if (claim) {
        completedTask = await deps.tasks.finish({
          taskId: task.id,
          workerId: claim.lease.workerId,
          attempt: claim.lease.attempt,
          status: "succeeded",
        });
      } else {
        completedTask = await deps.tasks.get(ctx, task.id);
      }
      return {
        migrationId: ledger?.id ?? ownerId,
        task: completedTask,
      };
    },

    async getLegacyMigrationReport(
      ctx: RequestContext,
      migrationId: string,
    ) {
      const accountId = await account(ctx, "intelligence.migrations.report");
      const [ledger] = await db
        .select()
        .from(intelligenceMigrationLedgers)
        .where(
          and(
            eq(intelligenceMigrationLedgers.id, migrationId),
            eq(intelligenceMigrationLedgers.userId, ctx.userId),
            eq(intelligenceMigrationLedgers.accountId, accountId),
          ),
        )
        .limit(1);
      if (!ledger) throw new OwnershipError("Intelligence migration not found");
      const counts = (ledger.counts ?? {}) as Record<string, number>;
      const orphanReport = (ledger.orphanReport ?? {}) as {
        count?: number;
        samples?: string[];
      };
      return {
        migrationId: ledger.id,
        stage: ledger.stage as
          | "inventory"
          | "backed_up"
          | "migrated"
          | "validated"
          | "write_fenced"
          | "consumers_switched"
          | "observing"
          | "retired"
          | "rolled_back",
        counts,
        orphanCount: orphanReport.count ?? counts.orphanCount ?? 0,
        duplicateCount: counts.duplicateCount ?? 0,
        writeFenceEnabled: ledger.writeFenceEnabled,
        sampleErrors: orphanReport.samples ?? [],
      };
    },

    async rollbackLegacyMigration(
      ctx: RequestContext,
      migrationId: string,
      input: { confirmToken: string; idempotencyKey: string },
    ) {
      if (!input.confirmToken.trim()) {
        throw new IntelligenceValidationError("回滚需要确认令牌");
      }
      const report = await service.getLegacyMigrationReport(ctx, migrationId);
      const accountId = await account(ctx, "intelligence.migrations.rollback");
      const [ledger] = await db
        .select()
        .from(intelligenceMigrationLedgers)
        .where(eq(intelligenceMigrationLedgers.id, migrationId))
        .limit(1);
      if (!ledger) throw new OwnershipError("Intelligence migration not found");
      const checkpoint = (ledger.checkpoint ?? {}) as {
        sourceIds?: string[];
        itemIds?: string[];
      };
      const task = await deps.tasks.enqueue(ctx, {
        kind: "migration",
        ownerType: "migration",
        ownerId: migrationId,
        idempotencyKey: `rollback:${input.idempotencyKey}`,
        payload: {
          migrationId,
          action: "rollback",
          preservation: {
            itemIds: checkpoint.itemIds ?? [],
            writeFenceWasEnabled: report.writeFenceEnabled,
          },
        },
        priority: 100,
        maxAttempts: 1,
      });
      const claim = await deps.tasks.claimTask({
        taskId: task.id,
        workerId: `intelligence-migration-rollback:${task.id}`,
        leaseSeconds: 300,
      });
      const sourceIds = checkpoint.sourceIds ?? [];
      if (sourceIds.length > 0) {
        await db
          .update(intelligenceSources)
          .set({
            status: "archived",
            monitorEnabled: false,
            updatedAt: now(),
          })
          .where(
            and(
              eq(intelligenceSources.userId, ctx.userId),
              eq(intelligenceSources.accountId, accountId),
              inArray(intelligenceSources.id, sourceIds),
            ),
          );
      }
      await db
        .update(intelligenceMigrationLedgers)
        .set({
          stage: "rolled_back",
          writeFenceEnabled: false,
          updatedAt: now(),
        })
        .where(eq(intelligenceMigrationLedgers.id, migrationId));
      const completedTask = claim
        ? await deps.tasks.finish({
            taskId: task.id,
            workerId: claim.lease.workerId,
            attempt: claim.lease.attempt,
            status: "succeeded",
          })
        : await deps.tasks.get(ctx, task.id);
      return {
        preservationReportId: legacyId(
          "preservation-report",
          `${migrationId}:${input.idempotencyKey}`,
        ),
        task: completedTask,
      };
    },

    async getWorkspace(ctx: RequestContext) {
      await ensureSystemCollections(ctx);
      await migrateLegacySignalSourcesOnce(ctx);
      const accountId = await account(ctx, "intelligence.workspace.get");
      // 工作台读取也要做恢复对账；否则 APP 退出时遗留的 running run 会在每次进页面时
      // 被前端当成新同步恢复 spinner，即使它对应的任务租约早已过期。
      await deps.tasks.recoverExpiredLeases();
      const [collections, sources, memberships, taskRows, rawRuns] =
        await Promise.all([
        db
          .select()
          .from(intelligenceCollections)
          .where(
            and(
              eq(intelligenceCollections.userId, ctx.userId),
              eq(intelligenceCollections.accountId, accountId),
              isNull(intelligenceCollections.archivedAt),
            ),
          )
          .orderBy(asc(intelligenceCollections.sortOrder)),
        db
          .select()
          .from(intelligenceSources)
          .where(
            and(
              eq(intelligenceSources.userId, ctx.userId),
              eq(intelligenceSources.accountId, accountId),
            ),
          )
          .orderBy(asc(intelligenceSources.displayName)),
        db
          .select()
          .from(intelligenceSourceCollectionMemberships)
          .where(
            and(
              eq(intelligenceSourceCollectionMemberships.userId, ctx.userId),
              eq(
                intelligenceSourceCollectionMemberships.accountId,
                accountId,
              ),
            ),
          ),
        deps.tasks.list(ctx, { limit: 1_000, offset: 0 }),
        db
          .select()
          .from(intelligenceSyncRuns)
          .where(
            and(
              eq(intelligenceSyncRuns.userId, ctx.userId),
              eq(intelligenceSyncRuns.accountId, accountId),
            ),
          )
          .orderBy(desc(intelligenceSyncRuns.createdAt)),
      ]);
      const runs = await Promise.all(
        rawRuns.map(async (run) => {
          if (run.status !== "queued" && run.status !== "running") return run;
          const task = await deps.tasks.get(ctx, run.executionTaskId);
          return (await reconcileActiveRunWithTask(run, task)).run;
        }),
      );
      const latestBySource = new Map<string, RunRow>();
      for (const run of runs) {
        if (!latestBySource.has(run.sourceId)) latestBySource.set(run.sourceId, run);
      }
      const presentedSources = await Promise.all(
        sources.map((source) => presentSource(ctx, source)),
      );
      return {
        collections: collections.map(toCollection),
        sources: presentedSources,
        memberships: memberships.map(toSourceMembership),
        health: sources.map((source) => {
          const latest = latestBySource.get(source.id);
          return {
            sourceId: source.id,
            lastRunId: latest?.id ?? null,
            lastRunStatus:
              (latest?.status as "queued" | "running" | AdapterStatus) ?? null,
            blockedCount: runs.filter(
              (run) => run.sourceId === source.id && run.status === "blocked",
            ).length,
            lastErrorCode: (latest?.errorCode ?? null) as never,
            scannedCount: latest?.scannedCount ?? 0,
            newCount: latest?.newCount ?? 0,
            updatedCount: latest?.updatedCount ?? 0,
            failedCount: latest?.failedCount ?? 0,
          };
        }),
        pendingCount: taskRows.rows.filter((task) =>
          (
            [
              "queued",
              "running",
              "pause_requested",
              "paused",
              "cancel_requested",
            ] as PersistentTaskStatus[]
          ).includes(task.status)
        ).length,
        blockedCount: taskRows.rows.filter((task) => task.status === "blocked")
          .length,
      };
    },

    async createCollection(
      ctx: RequestContext,
      input: {
        parentId?: string | null;
        name: string;
        idempotencyKey: string;
      },
    ) {
      const accountId = await account(ctx, "intelligence.collections.create");
      const name = input.name.trim().replace(/\s+/g, " ");
      if (!name) throw new IntelligenceValidationError("分类名不能为空");
      if (input.parentId) await requireCollection(ctx, input.parentId);
      const [duplicate] = await db
        .select()
        .from(intelligenceCollections)
        .where(
          and(
            eq(intelligenceCollections.userId, ctx.userId),
            eq(intelligenceCollections.accountId, accountId),
            input.parentId
              ? eq(intelligenceCollections.parentId, input.parentId)
              : isNull(intelligenceCollections.parentId),
            eq(intelligenceCollections.normalizedName, normalizedName(name)),
          ),
        )
        .limit(1);
      if (duplicate) {
        throw new IntelligenceConflictError("同级已存在同名分类");
      }
      const stamp = now();
      const [row] = await db
        .insert(intelligenceCollections)
        .values({
          id: nextId("intelligence-collection"),
          userId: ctx.userId,
          accountId,
          parentId: input.parentId ?? null,
          name,
          normalizedName: normalizedName(name),
          kind: "custom",
          sortOrder: 0,
          version: 1,
          archivedAt: null,
          createdAt: stamp,
          updatedAt: stamp,
        })
        .returning();
      if (!row) throw new Error("failed to create collection");
      return toCollection(row);
    },

    async updateCollection(
      ctx: RequestContext,
      collectionId: string,
      input: {
        name?: string;
        parentId?: string | null;
        sortOrder?: number;
        archived?: boolean;
        expectedVersion: number;
      },
    ) {
      const current = await requireCollection(ctx, collectionId);
      if (current.kind === "system" && input.archived) {
        throw new IntelligenceConflictError("系统分类不能归档");
      }
      if (current.version !== input.expectedVersion) {
        throw new IntelligenceConflictError("分类已被其他操作修改，请刷新后重试");
      }
      if (input.parentId === collectionId) {
        throw new IntelligenceConflictError("分类不能成为自己的父分类");
      }
      if (input.parentId) {
        let cursor: CollectionRow | undefined = await requireCollection(
          ctx,
          input.parentId,
        );
        const visited = new Set<string>();
        while (cursor) {
          if (cursor.id === collectionId) {
            throw new IntelligenceConflictError("分类移动会形成循环");
          }
          if (!cursor.parentId || visited.has(cursor.parentId)) break;
          visited.add(cursor.id);
          cursor = await requireCollection(ctx, cursor.parentId);
        }
      }
      const name = input.name
        ? input.name.trim().replace(/\s+/g, " ")
        : current.name;
      const parentId =
        input.parentId === undefined ? current.parentId : input.parentId;
      const [duplicate] = await db
        .select()
        .from(intelligenceCollections)
        .where(
          and(
            eq(intelligenceCollections.userId, current.userId),
            eq(intelligenceCollections.accountId, current.accountId),
            parentId
              ? eq(intelligenceCollections.parentId, parentId)
              : isNull(intelligenceCollections.parentId),
            eq(intelligenceCollections.normalizedName, normalizedName(name)),
          ),
        );
      if (duplicate && duplicate.id !== collectionId) {
        throw new IntelligenceConflictError("同级已存在同名分类");
      }
      const [updated] = await db
        .update(intelligenceCollections)
        .set({
          name,
          normalizedName: normalizedName(name),
          parentId,
          sortOrder: input.sortOrder ?? current.sortOrder,
          archivedAt:
            input.archived === undefined
              ? current.archivedAt
              : input.archived
                ? now()
                : null,
          version: current.version + 1,
          updatedAt: now(),
        })
        .where(
          and(
            eq(intelligenceCollections.id, collectionId),
            eq(intelligenceCollections.version, input.expectedVersion),
          ),
        )
        .returning();
      if (!updated) {
        throw new IntelligenceConflictError("分类版本冲突");
      }
      return toCollection(updated);
    },

    async deleteCollection(
      ctx: RequestContext,
      collectionId: string,
      input: { mode: "unlink" | "permanent"; confirmToken?: string },
    ) {
      const current = await requireCollection(ctx, collectionId);
      if (current.kind === "system") {
        throw new IntelligenceConflictError("系统分类不能删除");
      }
      if (input.mode === "permanent" && !input.confirmToken) {
        throw new IntelligenceValidationError("永久删除需要确认令牌");
      }
      return db.transaction(async (tx) => {
        const sources = await tx
          .select()
          .from(intelligenceSources)
          .where(
            and(
              eq(intelligenceSources.userId, current.userId),
              eq(intelligenceSources.accountId, current.accountId),
              eq(intelligenceSources.collectionId, collectionId),
            ),
          );
        const memberships = await tx
          .select()
          .from(intelligenceSourceCollectionMemberships)
          .where(
            and(
              eq(
                intelligenceSourceCollectionMemberships.userId,
                current.userId,
              ),
              eq(
                intelligenceSourceCollectionMemberships.accountId,
                current.accountId,
              ),
              eq(
                intelligenceSourceCollectionMemberships.collectionId,
                collectionId,
              ),
            ),
          );
        await tx
          .delete(intelligenceSourceCollectionMemberships)
          .where(
            and(
              eq(
                intelligenceSourceCollectionMemberships.userId,
                current.userId,
              ),
              eq(
                intelligenceSourceCollectionMemberships.accountId,
                current.accountId,
              ),
              eq(
                intelligenceSourceCollectionMemberships.collectionId,
                collectionId,
              ),
            ),
          );
        await tx
          .update(intelligenceSources)
          .set({ collectionId: null, updatedAt: now() })
          .where(
            and(
              eq(intelligenceSources.userId, current.userId),
              eq(intelligenceSources.accountId, current.accountId),
              eq(intelligenceSources.collectionId, collectionId),
            ),
          );
        await tx
          .update(intelligenceCollections)
          .set({ parentId: null, updatedAt: now() })
          .where(
            and(
              eq(intelligenceCollections.userId, current.userId),
              eq(intelligenceCollections.accountId, current.accountId),
              eq(intelligenceCollections.parentId, collectionId),
            ),
          );
        await tx
          .delete(intelligenceCollections)
          .where(eq(intelligenceCollections.id, collectionId));
        return {
          unlinked: new Set([
            ...sources.map((source) => source.id),
            ...memberships.map((membership) => membership.sourceId),
          ]).size,
          deleted: 1,
          preserved: new Set([
            ...sources.map((source) => source.id),
            ...memberships.map((membership) => membership.sourceId),
          ]).size,
        };
      });
    },

    async createSource(
      ctx: RequestContext,
      input: {
        collectionId: string | null;
        type: SourceType;
        config: SourceConfig;
        displayName?: string;
        extractionInstruction?: string;
        monitorEnabled: boolean;
        runInitial: boolean;
        idempotencyKey: string;
      },
    ) {
      const accountId = await account(ctx, "intelligence.sources.create");
      if (input.type !== input.config.type) {
        throw new IntelligenceValidationError("source type 与 config 不一致");
      }
      if (input.collectionId) await requireCollection(ctx, input.collectionId);
      const collector =
        input.config.type === "creator_profile" ||
        input.config.type === "favorites_folder" ||
        input.config.type === "darkhorse_query"
          ? await assertCollectorEligible(
              ctx,
              input.config.collectorAccountId,
            )
          : null;
      const identity = sourceIdentity(input.config);
      const [existing] = await db
        .select()
        .from(intelligenceSources)
        .where(
          and(
            eq(intelligenceSources.userId, ctx.userId),
            eq(intelligenceSources.accountId, accountId),
            eq(intelligenceSources.type, input.type),
            eq(intelligenceSources.externalKey, identity.externalKey),
          ),
        )
        .limit(1);
      let source = existing;
      if (!source) {
        const stamp = now();
        [source] = await db
          .insert(intelligenceSources)
          .values({
            id: nextId("intelligence-source"),
            userId: ctx.userId,
            accountId,
            collectionId: input.collectionId,
            type: input.type,
            platform: identity.platform,
            displayName: input.displayName?.trim() || identity.defaultName,
            canonicalUrl: identity.canonicalUrl,
            canonicalUrlHash: identity.canonicalUrl
              ? hash(identity.canonicalUrl)
              : null,
            externalKey: identity.externalKey,
            browserSessionRef: identity.browserSessionRef,
            adapterConfig: input.config,
            monitorEnabled: input.monitorEnabled,
            syncPolicy: input.monitorEnabled
              ? { mode: "scheduled", interval: "daily" }
              : { mode: "manual" },
            extractionInstruction: input.extractionInstruction ?? null,
            status: "active",
            version: 1,
            lastRunAt: null,
            nextRunAt: input.monitorEnabled ? nextDailyRunAt(stamp) : null,
            createdAt: stamp,
            updatedAt: stamp,
          })
          .returning();
      }
      if (!source) throw new Error("failed to create source");
      await ensureSourceMembership(ctx, source, input.collectionId);
      const started = input.runInitial
        ? await startRun(ctx, source.id, {
            trigger: "initial",
            idempotencyKey: `${input.idempotencyKey}:initial`,
          })
        : null;
      return {
        source: await presentSource(ctx, source, collector),
        run: started?.run ?? null,
        task: started?.task ?? null,
      };
    },

    async listSources(
      ctx: RequestContext,
      query: {
        collectionId?: string;
        type?: SourceType;
        status?: IntelligenceSourceResource["status"];
        limit?: number;
        offset?: number;
      } = {},
    ) {
      const accountId = await account(ctx, "intelligence.sources.list");
      const filters = [
        eq(intelligenceSources.userId, ctx.userId),
        eq(intelligenceSources.accountId, accountId),
      ];
      if (query.type) filters.push(eq(intelligenceSources.type, query.type));
      if (query.status) {
        filters.push(eq(intelligenceSources.status, query.status));
      }
      let rows = await db
        .select()
        .from(intelligenceSources)
        .where(and(...filters))
        .orderBy(asc(intelligenceSources.displayName));
      if (query.collectionId) {
        const memberships = await db
          .select()
          .from(intelligenceSourceCollectionMemberships)
          .where(
            and(
              eq(
                intelligenceSourceCollectionMemberships.userId,
                ctx.userId,
              ),
              eq(
                intelligenceSourceCollectionMemberships.accountId,
                accountId,
              ),
              eq(
                intelligenceSourceCollectionMemberships.collectionId,
                query.collectionId,
              ),
            ),
          );
        const memberIds = new Set(
          memberships.map((membership) => membership.sourceId),
        );
        rows = rows.filter(
          (source) =>
            source.collectionId === query.collectionId ||
            memberIds.has(source.id),
        );
      }
      const offset = Math.max(0, query.offset ?? 0);
      const limit = Math.max(1, query.limit ?? 20);
      return {
        rows: await Promise.all(
          rows
            .slice(offset, offset + limit)
            .map((source) => presentSource(ctx, source)),
        ),
        total: rows.length,
      };
    },

    async updateSource(
      ctx: RequestContext,
      sourceId: string,
      input: {
        collectionId?: string | null;
        displayName?: string;
        monitorEnabled?: boolean;
        syncPolicy?: Record<string, unknown>;
        instruction?: string | null;
        expectedVersion: number;
      },
    ) {
      const current = await requireSource(ctx, sourceId);
      if (current.version !== input.expectedVersion) {
        throw new IntelligenceConflictError("来源已被其他操作修改，请刷新后重试");
      }
      if (input.collectionId) await requireCollection(ctx, input.collectionId);
      const monitorEnabled =
        input.monitorEnabled ?? current.monitorEnabled;
      const syncPolicy =
        input.syncPolicy ??
        (monitorEnabled
          ? current.monitorEnabled
            ? current.syncPolicy
            : { mode: "scheduled", interval: "daily" }
          : { mode: "manual" });
      const nextRunAt = monitorEnabled
        ? current.nextRunAt ?? nextDailyRunAt(now())
        : null;
      const [updated] = await db
        .update(intelligenceSources)
        .set({
          collectionId:
            input.collectionId === undefined
              ? current.collectionId
              : input.collectionId,
          displayName: input.displayName?.trim() || current.displayName,
          monitorEnabled,
          syncPolicy,
          nextRunAt,
          extractionInstruction:
            input.instruction === undefined
              ? current.extractionInstruction
              : input.instruction,
          version: current.version + 1,
          updatedAt: now(),
        })
        .where(
          and(
            eq(intelligenceSources.id, sourceId),
            eq(intelligenceSources.version, input.expectedVersion),
          ),
        )
        .returning();
      if (!updated) throw new IntelligenceConflictError("来源版本冲突");
      if (input.collectionId) {
        await ensureSourceMembership(ctx, updated, input.collectionId);
      }
      return presentSource(ctx, updated);
    },

    async deleteSource(
      ctx: RequestContext,
      sourceId: string,
      input: {
        mode: "pause" | "archive" | "permanent";
        confirmToken?: string;
      },
    ) {
      const current = await requireSource(ctx, sourceId);
      if (
        input.mode === "permanent" &&
        input.confirmToken !== sourceId
      ) {
        throw new IntelligenceValidationError("永久删除确认令牌无效");
      }
      const observations = await db
        .select()
        .from(itemSourceObservations)
        .where(eq(itemSourceObservations.sourceId, sourceId));
      const snapshots = await db
        .select()
        .from(sourceSnapshots)
        .where(eq(sourceSnapshots.sourceId, sourceId));
      if (input.mode === "permanent") {
        const accountId = requireAccountId(
          ctx.accountId,
          "intelligence.sources.delete",
        );
        const runs = await db
          .select()
          .from(intelligenceSyncRuns)
          .where(
            and(
              eq(intelligenceSyncRuns.userId, ctx.userId),
              eq(intelligenceSyncRuns.accountId, accountId),
              eq(intelligenceSyncRuns.sourceId, sourceId),
            ),
          );
        const activeRun = runs.find((run) =>
          [
            "queued",
            "running",
            "pause_requested",
            "paused",
            "cancel_requested",
          ].includes(run.status),
        );
        if (activeRun) {
          throw new IntelligenceConflictError(
            "该来源仍在同步中，请等待同步完成后再删除",
          );
        }

        const itemIds = [...new Set(observations.map((row) => row.itemId))];
        const projectReferences =
          itemIds.length > 0
            ? await db
                .select()
                .from(projectIntelligenceReferences)
                .where(
                  and(
                    eq(projectIntelligenceReferences.userId, ctx.userId),
                    eq(projectIntelligenceReferences.accountId, accountId),
                    inArray(projectIntelligenceReferences.itemId, itemIds),
                  ),
                )
            : [];
        const confirmedTransforms =
          itemIds.length > 0
            ? (
                await db
                  .select()
                  .from(intelligenceTransforms)
                  .where(
                    and(
                      eq(intelligenceTransforms.userId, ctx.userId),
                      eq(intelligenceTransforms.accountId, accountId),
                      inArray(intelligenceTransforms.itemId, itemIds),
                    ),
                  )
              ).filter(
                (row) =>
                  row.status === "confirmed" && Boolean(row.targetTopicId),
              )
            : [];
        const protectedItemIds = new Set([
          ...projectReferences.map((row) => row.itemId),
          ...confirmedTransforms.map((row) => row.itemId),
        ]);
        const protectedSnapshotIds = new Set([
          ...projectReferences.map((row) => row.sourceSnapshotId),
          ...confirmedTransforms.map((row) => row.sourceSnapshotId),
        ]);
        const otherObservations =
          itemIds.length > 0
            ? (
                await db
                  .select()
                  .from(itemSourceObservations)
                  .where(
                    and(
                      eq(itemSourceObservations.userId, ctx.userId),
                      eq(itemSourceObservations.accountId, accountId),
                      inArray(itemSourceObservations.itemId, itemIds),
                    ),
                  )
              ).filter((row) => row.sourceId !== sourceId)
            : [];
        const sharedItemIds = new Set(
          otherObservations.map((row) => row.itemId),
        );
        const deletableItemIds = itemIds.filter(
          (itemId) =>
            !sharedItemIds.has(itemId) && !protectedItemIds.has(itemId),
        );
        const projectOnlyItemIds = [...protectedItemIds].filter(
          (itemId) => !sharedItemIds.has(itemId),
        );
        const deletableSnapshotIds = snapshots
          .filter((snapshot) => !protectedSnapshotIds.has(snapshot.id))
          .map((snapshot) => snapshot.id);
        const deletableTransforms =
          deletableSnapshotIds.length > 0
            ? await db
                .select()
                .from(intelligenceTransforms)
                .where(
                  and(
                    eq(intelligenceTransforms.userId, ctx.userId),
                    eq(intelligenceTransforms.accountId, accountId),
                    inArray(
                      intelligenceTransforms.sourceSnapshotId,
                      deletableSnapshotIds,
                    ),
                  ),
                )
            : [];
        const transcriptTasks =
          deletableItemIds.length > 0
            ? await db
                .select()
                .from(itemTranscripts)
                .where(
                  and(
                    eq(itemTranscripts.userId, ctx.userId),
                    eq(itemTranscripts.accountId, accountId),
                    inArray(itemTranscripts.itemId, deletableItemIds),
                  ),
                )
            : [];
        const taskIds = [
          ...runs.map((run) => run.executionTaskId),
          ...deletableTransforms
            .map((transform) => transform.aiTaskId)
            .filter((id): id is string => Boolean(id)),
          ...transcriptTasks
            .map((transcript) => transcript.executionTaskId)
            .filter((id): id is string => Boolean(id)),
        ];
        const runIds = runs.map((run) => run.id);

        await db.transaction(async (tx) => {
          if (runIds.length > 0) {
            await tx
              .delete(intelligenceSyncRunEvents)
              .where(inArray(intelligenceSyncRunEvents.runId, runIds));
          }
          if (deletableTransforms.length > 0) {
            await tx
              .delete(intelligenceTransforms)
              .where(
                inArray(
                  intelligenceTransforms.id,
                  deletableTransforms.map((row) => row.id),
                ),
              );
          }
          if (deletableSnapshotIds.length > 0) {
            await tx
              .delete(sourceSnapshots)
              .where(inArray(sourceSnapshots.id, deletableSnapshotIds));
          }
          await tx
            .delete(itemSourceObservations)
            .where(eq(itemSourceObservations.sourceId, sourceId));
          if (deletableItemIds.length > 0) {
            await tx
              .delete(itemMetricSnapshots)
              .where(inArray(itemMetricSnapshots.itemId, deletableItemIds));
            await tx
              .delete(itemTranscripts)
              .where(inArray(itemTranscripts.itemId, deletableItemIds));
            await tx
              .delete(intelligenceItems)
              .where(inArray(intelligenceItems.id, deletableItemIds));
          }
          if (projectOnlyItemIds.length > 0) {
            await tx
              .update(intelligenceItems)
              .set({ availability: "archived", updatedAt: now() })
              .where(inArray(intelligenceItems.id, projectOnlyItemIds));
          }
          if (runIds.length > 0) {
            await tx
              .delete(intelligenceSyncRuns)
              .where(inArray(intelligenceSyncRuns.id, runIds));
          }
          if (taskIds.length > 0) {
            await tx
              .delete(executionTasks)
              .where(inArray(executionTasks.id, [...new Set(taskIds)]));
          }
          await tx
            .delete(executionTasks)
            .where(
              and(
                eq(executionTasks.userId, ctx.userId),
                eq(executionTasks.accountId, accountId),
                eq(executionTasks.ownerType, "source"),
                eq(executionTasks.ownerId, sourceId),
              ),
            );
          await tx
            .delete(intelligenceSourceCollectionMemberships)
            .where(
              and(
                eq(
                  intelligenceSourceCollectionMemberships.userId,
                  ctx.userId,
                ),
                eq(
                  intelligenceSourceCollectionMemberships.accountId,
                  accountId,
                ),
                eq(
                  intelligenceSourceCollectionMemberships.sourceId,
                  sourceId,
                ),
              ),
            );
          await tx
            .delete(intelligenceSources)
            .where(
              and(
                eq(intelligenceSources.id, sourceId),
                eq(intelligenceSources.userId, ctx.userId),
                eq(intelligenceSources.accountId, accountId),
              ),
            );
        });

        return {
          affectedItems: deletableItemIds.length,
          preservedSnapshots: protectedSnapshotIds.size,
          status: "deleted" as const,
        };
      }

      const status = input.mode === "pause" ? "paused" : "archived";
      await db
        .update(intelligenceSources)
        .set({
          status,
          monitorEnabled: false,
          nextRunAt: null,
          version: current.version + 1,
          updatedAt: now(),
        })
        .where(eq(intelligenceSources.id, sourceId));
      return {
        affectedItems: new Set(observations.map((row) => row.itemId)).size,
        preservedSnapshots: snapshots.length,
        status,
      };
    },

    startRun,

    /**
     * T-598 统一自动化 handler 入口：只扫描当前 `(userId, accountId)` 的到期来源。
     * 账号上下文由 scheduled_job 行派生；禁止跨库扫描后再从来源行拼 owner。
     */
    async enqueueDueSourceRuns(
      ctx: RequestContext,
      limit = 50,
    ): Promise<number> {
      const accountId = requireAccountId(
        ctx.accountId,
        "intelligence.enqueueDueSourceRuns",
      );
      const stamp = now();
      const due = await db
        .select()
        .from(intelligenceSources)
        .where(
          and(
            eq(intelligenceSources.userId, ctx.userId),
            eq(intelligenceSources.accountId, accountId),
            eq(intelligenceSources.status, "active"),
            eq(intelligenceSources.monitorEnabled, true),
            or(
              isNull(intelligenceSources.nextRunAt),
              lte(intelligenceSources.nextRunAt, stamp),
            ),
          ),
        )
        .orderBy(asc(intelligenceSources.nextRunAt))
        .limit(Math.max(1, limit));
      let enqueued = 0;
      for (const source of due) {
        const [latest] = await db
          .select({ status: intelligenceSyncRuns.status })
          .from(intelligenceSyncRuns)
          .where(eq(intelligenceSyncRuns.sourceId, source.id))
          .orderBy(desc(intelligenceSyncRuns.createdAt))
          .limit(1);
        // 登录/验证码受阻后停跑，避免每分钟重新撞站点；用户处理后手动“同步”
        // 一次即可恢复，并由成功 run 重算下次每日计划。
        if (latest?.status === "blocked") continue;
        const sourceCtx: RequestContext = {
          userId: ctx.userId,
          accountId,
          requestId: `intelligence-scheduler:${source.id}:${stamp}`,
          source: "ingestion",
        };
        try {
          await startRun(sourceCtx, source.id, {
            trigger: "schedule",
            idempotencyKey: `scheduled:${source.id}:${source.nextRunAt ?? stamp.slice(0, 10)}`,
          });
          await db
            .update(intelligenceSources)
            .set({
              nextRunAt: nextDailyRunAt(stamp),
              updatedAt: stamp,
            })
            .where(eq(intelligenceSources.id, source.id));
          enqueued += 1;
        } catch (error) {
          // 手动/首次同步已在运行时，让现有 run 完成后重算下次时间，不重复排队。
          if (error instanceof IntelligenceConflictError) continue;
          throw error;
        }
      }
      return enqueued;
    },

    /** Worker internal read port: returns adapter config only after account-scoped source ownership. */
    async getSourceExecutionInput(
      ctx: RequestContext,
      sourceId: string,
    ): Promise<{
      source: IntelligenceSourceResource;
      config: SourceConfig;
      extractionInstruction: string | null;
    }> {
      const source = await requireSource(ctx, sourceId);
      const config = sourceConfigForExecution(source);
      if (
        config.type === "creator_profile" ||
        config.type === "favorites_folder" ||
        config.type === "darkhorse_query"
      ) {
        await assertCollectorEligible(ctx, config.collectorAccountId);
      }
      return {
        source: await presentSource(ctx, source),
        config,
        extractionInstruction: source.extractionInstruction,
      };
    },

    async getRunByTaskForExecution(
      ctx: RequestContext,
      taskId: string,
    ): Promise<ReturnType<typeof toRun>> {
      const accountId = await account(
        ctx,
        "intelligence.runByTaskForExecution",
      );
      const [run] = await db
        .select()
        .from(intelligenceSyncRuns)
        .where(
          and(
            eq(intelligenceSyncRuns.executionTaskId, taskId),
            eq(intelligenceSyncRuns.userId, ctx.userId),
            eq(intelligenceSyncRuns.accountId, accountId),
          ),
        )
        .limit(1);
      if (!run) throw new OwnershipError("Intelligence run not found");
      return toRun(run);
    },

    /** Worker-only transcript read port; taskId is resolved inside the current account scope. */
    async getTranscriptTaskForExecution(
      ctx: RequestContext,
      taskId: string,
    ): Promise<{
      itemId: string;
      canonicalUrl: string;
      externalId: string | null;
      status: string;
    }> {
      const accountId = await account(
        ctx,
        "intelligence.transcriptByTaskForExecution",
      );
      const [transcript] = await db
        .select()
        .from(itemTranscripts)
        .where(
          and(
            eq(itemTranscripts.executionTaskId, taskId),
            eq(itemTranscripts.userId, ctx.userId),
            eq(itemTranscripts.accountId, accountId),
          ),
        )
        .limit(1);
      if (!transcript) throw new OwnershipError("Transcript task not found");
      const item = await requireItem(ctx, transcript.itemId);
      return {
        itemId: item.id,
        canonicalUrl: item.canonicalUrl,
        externalId: item.externalId,
        status: transcript.status,
      };
    },

    async markTranscriptRunning(
      ctx: RequestContext,
      taskId: string,
    ): Promise<void> {
      const target = await service.getTranscriptTaskForExecution(ctx, taskId);
      await db
        .update(itemTranscripts)
        .set({ status: "running", errorCode: null, updatedAt: now() })
        .where(eq(itemTranscripts.itemId, target.itemId));
    },

    async finishTranscript(
      ctx: RequestContext,
      input: {
        taskId: string;
        status: "done" | "skipped" | "failed" | "blocked";
        text?: string | null;
        provider?: string | null;
        model?: string | null;
        language?: string | null;
        errorCode?: string | null;
      },
    ): Promise<void> {
      const target = await service.getTranscriptTaskForExecution(
        ctx,
        input.taskId,
      );
      const [current] = await db
        .select()
        .from(itemTranscripts)
        .where(eq(itemTranscripts.itemId, target.itemId))
        .limit(1);
      const retainPrevious =
        input.status !== "done" && Boolean(current?.text?.trim());
      await db
        .update(itemTranscripts)
        .set({
          status: retainPrevious ? "done" : input.status,
          text:
            input.status === "done"
              ? (input.text ?? null)
              : retainPrevious
                ? (current?.text ?? null)
                : null,
          source:
            input.status === "done"
              ? "asr"
              : retainPrevious
                ? (current?.source ?? null)
                : "asr",
          provider: retainPrevious
            ? (current?.provider ?? null)
            : (input.provider ?? null),
          model: retainPrevious
            ? (current?.model ?? null)
            : (input.model ?? null),
          language: retainPrevious
            ? (current?.language ?? null)
            : (input.language ?? null),
          completedAt: now(),
          errorCode: input.errorCode ?? null,
          updatedAt: now(),
        })
        .where(eq(itemTranscripts.itemId, target.itemId));
    },

    async listRuns(
      ctx: RequestContext,
      sourceId: string,
      query: { status?: string; limit?: number; offset?: number } = {},
    ) {
      await requireSource(ctx, sourceId);
      const filters = [eq(intelligenceSyncRuns.sourceId, sourceId)];
      if (query.status) {
        filters.push(eq(intelligenceSyncRuns.status, query.status));
      }
      const rows = await db
        .select()
        .from(intelligenceSyncRuns)
        .where(and(...filters))
        .orderBy(desc(intelligenceSyncRuns.createdAt));
      const offset = Math.max(0, query.offset ?? 0);
      const limit = Math.max(1, query.limit ?? 20);
      return {
        rows: rows.slice(offset, offset + limit).map(toRun),
        total: rows.length,
      };
    },

    async getRun(ctx: RequestContext, runId: string) {
      let run = await requireRun(ctx, runId);
      if (run.status === "queued" || run.status === "running") {
        await deps.tasks.recoverExpiredLeases();
        const task = await deps.tasks.get(ctx, run.executionTaskId);
        run = (await reconcileActiveRunWithTask(run, task)).run;
      }
      const events = await db
        .select()
        .from(intelligenceSyncRunEvents)
        .where(eq(intelligenceSyncRunEvents.runId, runId))
        .orderBy(asc(intelligenceSyncRunEvents.occurredAt));
      return { run: toRun(run), events: events.map(toEvent) };
    },

    async listItems(
      ctx: RequestContext,
      query: {
        collectionId?: string;
        sourceId?: string;
        query?: string;
        sort?:
          | "newest"
          | "growth_desc"
          | "published_desc"
          | "engagement_desc"
          | "collect_desc"
          | "like_desc";
        transcriptStatus?: string;
        transcriptState?: TranscriptState;
        topicState?: TopicState;
        limit?: number;
        offset?: number;
      } = {},
    ) {
      const accountId = await account(ctx, "intelligence.items.list");
      if (query.sourceId) await requireSource(ctx, query.sourceId);
      if (query.collectionId) await requireCollection(ctx, query.collectionId);
      let rows = await db
        .select()
        .from(intelligenceItems)
        .where(
          and(
            eq(intelligenceItems.userId, ctx.userId),
            eq(intelligenceItems.accountId, accountId),
          ),
        );
      const observations = await db
        .select()
        .from(itemSourceObservations)
        .where(
          and(
            eq(itemSourceObservations.userId, ctx.userId),
            eq(itemSourceObservations.accountId, accountId),
          ),
        );
      const sources = await db
        .select()
        .from(intelligenceSources)
        .where(
          and(
            eq(intelligenceSources.userId, ctx.userId),
            eq(intelligenceSources.accountId, accountId),
          ),
        );
      rows = rows.filter((item) => item.availability !== "archived");
      const memberships = query.collectionId
        ? await db
            .select()
            .from(intelligenceSourceCollectionMemberships)
            .where(
              and(
                eq(
                  intelligenceSourceCollectionMemberships.userId,
                  ctx.userId,
                ),
                eq(
                  intelligenceSourceCollectionMemberships.accountId,
                  accountId,
                ),
                eq(
                  intelligenceSourceCollectionMemberships.collectionId,
                  query.collectionId,
                ),
              ),
            )
        : [];
      const sourceIdsForCollection = query.collectionId
        ? new Set(
            [
              ...sources
                .filter((source) => source.collectionId === query.collectionId)
                .map((source) => source.id),
              ...memberships.map((membership) => membership.sourceId),
            ],
          )
        : null;
      if (query.sourceId || sourceIdsForCollection) {
        const allowedItems = new Set(
          observations
            .filter(
              (observation) =>
                (!query.sourceId ||
                  observation.sourceId === query.sourceId) &&
                (!sourceIdsForCollection ||
                  sourceIdsForCollection.has(observation.sourceId)),
            )
            .map((observation) => observation.itemId),
        );
        rows = rows.filter((item) => allowedItems.has(item.id));
      }
      const needle = query.query?.trim().toLocaleLowerCase("zh-CN");
      if (needle) {
        rows = rows.filter((item) =>
          [item.title, item.summary, item.authorName]
            .filter(Boolean)
            .some((value) =>
              value!.toLocaleLowerCase("zh-CN").includes(needle),
            ),
        );
      }
      const transcripts = await db
        .select()
        .from(itemTranscripts)
        .where(
          and(
            eq(itemTranscripts.userId, ctx.userId),
            eq(itemTranscripts.accountId, accountId),
          ),
        );
      const transcriptByItem = new Map(
        transcripts.map((transcript) => [transcript.itemId, transcript]),
      );
      if (query.transcriptStatus) {
        const allowedItems = new Set(
          transcripts
            .filter((row) => row.status === query.transcriptStatus)
            .map((row) => row.itemId),
        );
        rows = rows.filter((item) => allowedItems.has(item.id));
      }
      const transforms = await db
        .select()
        .from(intelligenceTransforms)
        .where(
          and(
            eq(intelligenceTransforms.userId, ctx.userId),
            eq(intelligenceTransforms.accountId, accountId),
          ),
        )
        .orderBy(desc(intelligenceTransforms.createdAt));
      const transformsByItem = new Map<string, TransformRow[]>();
      for (const transform of transforms) {
        const current = transformsByItem.get(transform.itemId) ?? [];
        current.push(transform);
        transformsByItem.set(transform.itemId, current);
      }
      const taskIds = transforms
        .map((transform) => transform.aiTaskId)
        .filter((id): id is string => Boolean(id));
      const topicTasks =
        taskIds.length > 0
          ? await db
              .select()
              .from(executionTasks)
              .where(
                and(
                  eq(executionTasks.userId, ctx.userId),
                  eq(executionTasks.accountId, accountId),
                  inArray(executionTasks.id, taskIds),
                ),
              )
          : [];
      const taskStatusById = new Map(
        topicTasks.map((task) => [task.id, task.status]),
      );
      const projectionByItem = new Map(
        rows.map((item) => [
          item.id,
          itemWorkflowProjection(
            transcriptByItem.get(item.id),
            transformsByItem.get(item.id) ?? [],
            taskStatusById,
          ),
        ]),
      );
      if (query.transcriptState) {
        rows = rows.filter(
          (item) =>
            projectionByItem.get(item.id)?.transcriptState ===
            query.transcriptState,
        );
      }
      if (query.topicState) {
        rows = rows.filter(
          (item) =>
            projectionByItem.get(item.id)?.topicState === query.topicState,
        );
      }
      const metrics = await db
        .select()
        .from(itemMetricSnapshots)
        .where(
          and(
            eq(itemMetricSnapshots.userId, ctx.userId),
            eq(itemMetricSnapshots.accountId, accountId),
          ),
        )
        .orderBy(desc(itemMetricSnapshots.capturedAt));
      const latestMetric = new Map<string, MetricRow>();
      for (const metric of metrics) {
        if (!latestMetric.has(metric.itemId)) {
          latestMetric.set(metric.itemId, metric);
        }
      }
      const sourceCount = new Map<string, number>();
      for (const observation of observations) {
        const key = `${observation.itemId}:${observation.sourceId}`;
        if (
          !observations.some(
            (other) =>
              other !== observation &&
              `${other.itemId}:${other.sourceId}` === key &&
              other.id < observation.id,
          )
        ) {
          sourceCount.set(
            observation.itemId,
            (sourceCount.get(observation.itemId) ?? 0) + 1,
          );
        }
      }
      const timestamp = (value: string | null | undefined): number | null => {
        if (!value) return null;
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const metricSortValue = (item: ItemRow): number | null => {
        const metric = latestMetric.get(item.id);
        if (query.sort === "engagement_desc") {
          return (
            (metric?.likeCount ?? 0) +
            (metric?.commentCount ?? 0) +
            (metric?.collectCount ?? 0) +
            (metric?.shareCount ?? 0)
          );
        }
        if (query.sort === "collect_desc") {
          return metric?.collectCount ?? null;
        }
        if (query.sort === "like_desc") {
          return metric?.likeCount ?? null;
        }
        // “最新发布”只认作品真实发布时间。缺失发布时间不能拿收录时间
        // 冒充，否则晚采集的旧作品会错误排到最前面。
        return query.sort === "published_desc"
          ? timestamp(item.publishedAt)
          : timestamp(item.capturedAt);
      };
      rows.sort((left, right) => {
        const leftValue = metricSortValue(left);
        const rightValue = metricSortValue(right);
        if (leftValue === null && rightValue !== null) return 1;
        if (leftValue !== null && rightValue === null) return -1;
        if (
          leftValue !== null &&
          rightValue !== null &&
          leftValue !== rightValue
        ) {
          return rightValue - leftValue;
        }
        const captured =
          (timestamp(right.capturedAt) ?? 0) -
          (timestamp(left.capturedAt) ?? 0);
        return captured !== 0 ? captured : right.id.localeCompare(left.id);
      });
      const offset = Math.max(0, query.offset ?? 0);
      const limit = Math.max(1, query.limit ?? 20);
      return {
        rows: rows.slice(offset, offset + limit).map((item) => {
          const projection =
            projectionByItem.get(item.id) ??
            itemWorkflowProjection(undefined, [], new Map());
          return {
            item: toItem(item),
            latestMetric: latestMetric.has(item.id)
              ? toMetric(latestMetric.get(item.id)!)
              : null,
            sourceCount: Math.max(1, sourceCount.get(item.id) ?? 1),
            ...projection,
          };
        }),
        total: rows.length,
      };
    },

    async getItem(ctx: RequestContext, itemId: string) {
      const item = await requireItem(ctx, itemId);
      let [transcript] = await db
        .select()
        .from(itemTranscripts)
        .where(eq(itemTranscripts.itemId, itemId))
        .limit(1);
      if (!transcript) {
        [transcript] = await db
          .insert(itemTranscripts)
          .values({
            itemId,
            userId: item.userId,
            accountId: item.accountId,
            status: "not_requested",
            text: null,
            source: null,
            provider: null,
            model: null,
            language: null,
            executionTaskId: null,
            queuedAt: null,
            completedAt: null,
            errorCode: null,
            updatedAt: now(),
          })
          .onConflictDoNothing()
          .returning();
        if (!transcript) {
          [transcript] = await db
            .select()
            .from(itemTranscripts)
            .where(eq(itemTranscripts.itemId, itemId))
            .limit(1);
        }
      }
      if (!transcript) throw new Error("failed to create transcript state");
      const [metrics, observations, snapshots, transforms] = await Promise.all([
        db
          .select()
          .from(itemMetricSnapshots)
          .where(eq(itemMetricSnapshots.itemId, itemId))
          .orderBy(desc(itemMetricSnapshots.capturedAt)),
        db
          .select()
          .from(itemSourceObservations)
          .where(eq(itemSourceObservations.itemId, itemId))
          .orderBy(desc(itemSourceObservations.lastSeenAt)),
        db
          .select()
          .from(sourceSnapshots)
          .where(eq(sourceSnapshots.itemId, itemId))
          .orderBy(desc(sourceSnapshots.capturedAt), desc(sourceSnapshots.id)),
        db
          .select()
          .from(intelligenceTransforms)
          .where(eq(intelligenceTransforms.itemId, itemId))
          .orderBy(desc(intelligenceTransforms.createdAt)),
      ]);
      const transformTasks = await Promise.all(
        transforms.map(async (transform) => {
          if (!transform.aiTaskId) return null;
          try {
            return await deps.tasks.get(ctx, transform.aiTaskId);
          } catch {
            // 兼容极早期迁移残留：任务已不存在时不伪造成“运行中”，由 null 明确
            // 告知客户端状态不可用并给重新生成入口。
            return null;
          }
        }),
      );
      return {
        item: toItem(item),
        metrics: metrics.map(toMetric),
        observations: observations.map(toObservation),
        snapshots: snapshots.map(toSnapshot),
        transcript: toTranscript(transcript),
        transforms: transforms.map((transform, index) =>
          toTransform(transform, transformTasks[index] ?? null),
        ),
      };
    },

    async uploadManualTranscript(
      ctx: RequestContext,
      input: {
        itemId: string;
        inputMode?: "paste" | "file";
        format?: "txt" | "md" | "srt" | "vtt";
        fileName?: string;
        text: string;
      },
    ) {
      const supportedFormats = new Set(["txt", "md", "srt", "vtt"]);
      const inputMode = input.inputMode ?? "file";
      if (inputMode === "file") {
        if (!input.format || !supportedFormats.has(input.format)) {
          throw new IntelligenceValidationError(
            "TRANSCRIPT_FILE_UNSUPPORTED_FORMAT",
          );
        }
        const fileName = input.fileName?.trim() ?? "";
        const extension = fileName.split(".").pop()?.toLowerCase();
        if (!fileName || extension !== input.format) {
          throw new IntelligenceValidationError(
            "TRANSCRIPT_FILE_EXTENSION_MISMATCH",
          );
        }
      }
      const text = input.text
        .replace(/^\ufeff/, "")
        .replace(/\r\n?/g, "\n")
        .trim();
      if (!text) {
        throw new IntelligenceValidationError("TRANSCRIPT_FILE_EMPTY");
      }
      if (text.includes("\ufffd")) {
        throw new IntelligenceValidationError(
          "TRANSCRIPT_FILE_INVALID_ENCODING",
        );
      }
      if (
        text.length > 500_000 ||
        Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024
      ) {
        throw new IntelligenceValidationError("TRANSCRIPT_FILE_TOO_LARGE");
      }

      const item = await requireItem(ctx, input.itemId);
      const initial = (await service.getItem(ctx, item.id)).transcript;
      if (initial.status === "done") {
        if (initial.text === text) return initial;
      }
      const lock = await transcriptTopicLock(ctx, item.id);
      if (lock.locked) {
        throw new IntelligenceConflictError("TRANSCRIPT_LOCKED");
      }
      if (lock.topicBusy) {
        throw new IntelligenceConflictError("TRANSCRIPT_TOPIC_BUSY");
      }
      if (initial.status === "queued" || initial.status === "running") {
        throw new IntelligenceConflictError("TRANSCRIPT_BUSY");
      }

      const stamp = now();
      const [updated] = await db
        .update(itemTranscripts)
        .set({
          status: "done",
          text,
          source: "manual",
          provider: null,
          model: null,
          language: null,
          executionTaskId: null,
          queuedAt: null,
          completedAt: stamp,
          errorCode: null,
          updatedAt: stamp,
        })
        .where(
          and(
            eq(itemTranscripts.itemId, item.id),
            eq(itemTranscripts.userId, ctx.userId),
            eq(itemTranscripts.accountId, item.accountId),
            inArray(itemTranscripts.status, [
              "not_requested",
              "failed",
              "blocked",
              "skipped",
              "done",
            ]),
          ),
        )
        .returning();
      if (updated) return toTranscript(updated);

      const [current] = await db
        .select()
        .from(itemTranscripts)
        .where(
          and(
            eq(itemTranscripts.itemId, item.id),
            eq(itemTranscripts.userId, ctx.userId),
            eq(itemTranscripts.accountId, item.accountId),
          ),
        )
        .limit(1);
      if (current?.status === "done" && current.text === text) {
        return toTranscript(current);
      }
      if (current?.status === "queued" || current?.status === "running") {
        throw new IntelligenceConflictError("TRANSCRIPT_BUSY");
      }
      const currentLock = await transcriptTopicLock(ctx, item.id);
      if (currentLock.locked) {
        throw new IntelligenceConflictError("TRANSCRIPT_LOCKED");
      }
      if (currentLock.topicBusy) {
        throw new IntelligenceConflictError("TRANSCRIPT_TOPIC_BUSY");
      }
      throw new IntelligenceConflictError("TRANSCRIPT_BUSY");
    },

    /**
     * 分享文本先落持久任务，HTTP 立即返回。真正的短链解析和 CDP 读取由 host worker
     * 完成；普通分享只保存用户输入和目标分类。仅 Copilot 明确取得转写授权时，
     * payload 才带 transcribeAfterImport，由本 service 在建档完成后幂等续接逐字稿任务。
     */
    async enqueueDouyinShareImport(
      ctx: RequestContext,
      input: {
        collectionId: string | null;
        shareInput: string;
        idempotencyKey: string;
        /** Copilot 内部授权位；普通分享不传，恒不触发逐字稿。 */
        transcribeAfterImport?: boolean;
      },
    ) {
      if (input.collectionId) await requireCollection(ctx, input.collectionId);
      const shareInput = input.shareInput.trim();
      if (!shareInput) {
        throw new IntelligenceValidationError("请粘贴抖音分享链接");
      }
      const task = await deps.tasks.enqueue(ctx, {
        kind: "share_import",
        ownerType: "item_import",
        ownerId: `share-import-${hash(shareInput).slice(0, 24)}`,
        idempotencyKey: input.idempotencyKey,
        payload: {
          collectionId: input.collectionId,
          shareInput,
          requestedBy: "user",
          ...(input.transcribeAfterImport
            ? { transcribeAfterImport: true }
            : {}),
        },
        priority: 20,
      });
      return { task };
    },

    /**
     * 单条抖音分享链接建档。host 只负责在登录态中解析真实作品元数据；所有领域写入
     * 仍经本 service：按作者复用/创建博主来源，再复用标准 adapter batch 做作品、
     * 指标、observation 与来源快照的幂等落库。普通分享不创建逐字稿任务；只有调用方
     * 显式传入 transcribeAfterImport=true 时，才在导入任务终态前续接逐字稿任务。
     */
    async importDouyinSharedItem(
      ctx: RequestContext,
      input: {
        taskId: string;
        lease: { workerId: string; attempt: number };
        collectionId: string | null;
        item: IntelligenceAdapterItem;
        browserSessionRef: string;
        /** 仅当用户本轮明确要求转写时为 true；普通分享建档不得升级。 */
        transcribeAfterImport?: boolean;
      },
    ) {
      const accountId = await account(
        ctx,
        "intelligence.items.importDouyinShare",
      );
      const task = await deps.tasks.get(ctx, input.taskId);
      if (
        task.kind !== "share_import" ||
        task.ownerType !== "item_import" ||
        task.status !== "running"
      ) {
        throw new IntelligenceConflictError(
          "分享建档任务未处于可执行状态",
        );
      }
      if (input.collectionId) await requireCollection(ctx, input.collectionId);
      if (
        input.item.type !== "video" ||
        input.item.platform !== "douyin" ||
        !input.item.externalId ||
        !input.item.authorId ||
        !input.item.authorName?.trim()
      ) {
        throw new IntelligenceValidationError(
          "分享链接必须解析出真实的抖音作品和作者身份",
        );
      }
      const itemUrl = canonicalUrl(input.item.canonicalUrl);
      const [before] = await db
        .select()
        .from(intelligenceItems)
        .where(
          and(
            eq(intelligenceItems.userId, ctx.userId),
            eq(intelligenceItems.accountId, accountId),
            eq(intelligenceItems.platform, "douyin"),
            eq(intelligenceItems.externalId, input.item.externalId),
          ),
        )
        .limit(1);
      const [sourceBefore] = await db
        .select()
        .from(intelligenceSources)
        .where(
          and(
            eq(intelligenceSources.userId, ctx.userId),
            eq(intelligenceSources.accountId, accountId),
            eq(intelligenceSources.type, "creator_profile"),
            eq(
              intelligenceSources.externalKey,
              `profile:${accountId}:${input.item.authorId}`,
            ),
          ),
        )
        .limit(1);
      const profileUrl = `https://www.douyin.com/user/${encodeURIComponent(input.item.authorId)}`;
      const sourceResult = await service.createSource(ctx, {
        collectionId: input.collectionId,
        type: "creator_profile",
        config: {
          type: "creator_profile",
          collectorAccountId: accountId,
          canonicalUrl: profileUrl,
          externalAccountId: input.item.authorId,
        },
        displayName: input.item.authorName.trim(),
        // 分享导入只建档，不擅自把该作者升级成每日监控来源。
        monitorEnabled: false,
        runInitial: false,
        idempotencyKey: `${input.taskId}:creator`,
      });
      const source = await requireSource(ctx, sourceResult.source.id);
      let [run] = await db
        .select()
        .from(intelligenceSyncRuns)
        .where(eq(intelligenceSyncRuns.executionTaskId, input.taskId))
        .limit(1);
      if (!run) {
        const stamp = now();
        [run] = await db
          .insert(intelligenceSyncRuns)
          .values({
            id: nextId("intelligence-run"),
            userId: ctx.userId,
            accountId,
            sourceId: source.id,
            executionTaskId: input.taskId,
            trigger: "manual",
            status: "running",
            checkpoint: null,
            adapterEvidence: null,
            startedAt: stamp,
            finishedAt: null,
            scannedCount: 0,
            newCount: 0,
            updatedCount: 0,
            skippedCount: 0,
            failedCount: 0,
            errorCode: null,
            errorSummary: null,
            nextAction: "none",
            createdAt: stamp,
            updatedAt: stamp,
          })
          .returning();
      }
      if (!run) throw new Error("failed to create share import run");
      await service.applyAdapterBatch(ctx, {
        runId: run.id,
        lease: input.lease,
        // 先落真实作品，再把结果引用写入 task checkpoint；第二个 finalize batch
        // 才结束任务，使 execution.tasks.get 能读到稳定结果。
        terminal: false,
        envelope: {
          adapterStatus: "succeeded_with_items",
          upstreamEvidence: {
            adapter: "douyin_profile",
            responseShape: "shared_item_detail",
            capturedAt: now(),
            finalUrl: itemUrl,
            listValid: true,
          },
          items: [
            {
              ...input.item,
              canonicalUrl: itemUrl,
              snapshot: input.item.snapshot
                ? {
                    ...input.item.snapshot,
                    finalUrl: itemUrl,
                  }
                : {
                    finalUrl: itemUrl,
                    title: input.item.title,
                    contentHash: hash(
                      `${input.item.title}\n${input.item.summary ?? ""}`,
                    ),
                    safeExtract: input.item.summary,
                    storageRef: null,
                    retentionUntil: null,
                    privacyClass: "public",
                  },
            },
          ],
          checkpoint: null,
          errorCode: null,
          safeDiagnostics: {
            importMode: "user_shared_link",
          },
        },
      });
      const [item] = await db
        .select()
        .from(intelligenceItems)
        .where(
          and(
            eq(intelligenceItems.userId, ctx.userId),
            eq(intelligenceItems.accountId, accountId),
            eq(intelligenceItems.platform, "douyin"),
            eq(intelligenceItems.externalId, input.item.externalId),
          ),
        )
        .limit(1);
      if (!item) {
        throw new IntelligenceConflictError(
          "该分享链接正在由另一个任务建档，请稍后刷新",
        );
      }
      // 明确转写授权在 share_import 任务终态前，经领域 service 幂等排入持久
      // transcribe 任务。即使 host 随后退出，启动恢复仍能从持久队列续跑。
      const transcriptDispatch = input.transcribeAfterImport
        ? await service.enqueueTranscripts(ctx, {
            itemIds: [item.id],
            idempotencyKey: `${input.taskId}:transcript`,
          })
        : { tasks: [], skipped: [] };
      const [[snapshot], [transcript]] = await Promise.all([
        db
          .select()
          .from(sourceSnapshots)
          .where(
            and(
              eq(sourceSnapshots.sourceId, source.id),
              eq(sourceSnapshots.itemId, item.id),
            ),
          )
          .orderBy(desc(sourceSnapshots.capturedAt))
          .limit(1),
        db
          .select()
          .from(itemTranscripts)
          .where(eq(itemTranscripts.itemId, item.id))
          .limit(1),
      ]);
      if (!snapshot || !transcript) {
        throw new Error("share import evidence is incomplete");
      }
      const result = {
        source: await presentSource(ctx, source),
        item: toItem(item),
        snapshot: toSnapshot(snapshot),
        createdSource: !sourceBefore,
        createdItem: !before,
        deduplicated: Boolean(before),
        transcriptStatus: transcript.status,
        transcriptQueued: transcriptDispatch.tasks.length > 0,
        transcriptTaskIds: transcriptDispatch.tasks.map((task) => task.id),
      };
      await service.applyAdapterBatch(ctx, {
        runId: run.id,
        lease: input.lease,
        terminal: true,
        envelope: {
          adapterStatus: "succeeded_with_items",
          upstreamEvidence: {
            adapter: "douyin_profile",
            responseShape: "shared_item_detail:finalized",
            capturedAt: now(),
            finalUrl: itemUrl,
            listValid: true,
          },
          items: [],
          checkpoint: { result },
          errorCode: null,
          safeDiagnostics: {
            importMode: "user_shared_link",
            finalized: true,
          },
        },
      });
      return result;
    },

    async startTopicPreview(
      ctx: RequestContext,
      input: {
        itemId: string;
        sourceSnapshotId: string;
        positioningVersionId: string;
        idempotencyKey: string;
      },
    ) {
      const item = await requireItem(ctx, input.itemId);
      const snapshot = await requireSnapshot(ctx, input.sourceSnapshotId);
      if (snapshot.itemId !== item.id) {
        throw new IntelligenceValidationError(
          "sourceSnapshotId 不属于当前作品",
        );
      }
      const accountId = await account(ctx, "intelligence.transform.preview");
      const [latestSnapshot] = await db
        .select({ id: sourceSnapshots.id })
        .from(sourceSnapshots)
        .where(
          and(
            eq(sourceSnapshots.itemId, item.id),
            eq(sourceSnapshots.userId, ctx.userId),
            eq(sourceSnapshots.accountId, accountId),
          ),
        )
        .orderBy(desc(sourceSnapshots.capturedAt), desc(sourceSnapshots.id))
        .limit(1);
      if (!latestSnapshot || latestSnapshot.id !== snapshot.id) {
        throw new IntelligenceConflictError("SOURCE_SNAPSHOT_STALE");
      }
      const [transcript] = await db
        .select()
        .from(itemTranscripts)
        .where(eq(itemTranscripts.itemId, item.id))
        .limit(1);
      if (
        !transcript ||
        transcript.status !== "done" ||
        !transcript.text?.trim()
      ) {
        throw new IntelligenceConflictError(
          "请先手动转写并等待逐字稿完成，再拆解生成选题",
        );
      }
      if (!deps.positioning) {
        throw new IntelligenceValidationError("当前账号尚未配置定位");
      }
      await deps.positioning.getVersion(ctx, input.positioningVersionId);
      const task = await deps.tasks.enqueue(ctx, {
        kind: "topic_preview",
        ownerType: "transform",
        ownerId: item.id,
        idempotencyKey: input.idempotencyKey,
        payload: {
          itemId: item.id,
          sourceSnapshotId: snapshot.id,
          positioningVersionId: input.positioningVersionId,
        },
        priority: 20,
      });
      const [existing] = await db
        .select()
        .from(intelligenceTransforms)
        .where(
          and(
            eq(intelligenceTransforms.userId, ctx.userId),
            eq(intelligenceTransforms.accountId, accountId),
            eq(
              intelligenceTransforms.idempotencyKey,
              input.idempotencyKey,
            ),
          ),
        )
        .limit(1);
      if (existing) return { transform: toTransform(existing), task };
      const stamp = now();
      const [created] = await db
        .insert(intelligenceTransforms)
        .values({
          id: nextId("intelligence-transform"),
          userId: ctx.userId,
          accountId,
          itemId: item.id,
          sourceSnapshotId: snapshot.id,
          kind: "topic",
          positioningVersionId: input.positioningVersionId,
          aiTaskId: task.id,
          idempotencyKey: input.idempotencyKey,
          status: "candidate",
          outputSnapshot: null,
          targetTopicId: null,
          createdAt: stamp,
          updatedAt: stamp,
        })
        .returning();
      if (!created) throw new Error("failed to create intelligence transform");
      return { transform: toTransform(created), task };
    },

    async getTopicPreviewForExecution(
      ctx: RequestContext,
      taskId: string,
    ): Promise<{
      transformId: string;
      item: ReturnType<typeof toItem>;
      snapshot: ReturnType<typeof toSnapshot>;
      positioning: {
        id: string;
        oneLiner: string;
        keywords: string[];
      };
      transcript: {
        text: string;
        hash: string;
        completedAt: string | null;
        provider: string | null;
        model: string | null;
      };
      reusableDecomposition: ReusableTopicDecomposition | null;
      reusableCandidate: ReusableTopicCandidate | null;
    }> {
      const accountId = await account(
        ctx,
        "intelligence.transformByTaskForExecution",
      );
      const [transform] = await db
        .select()
        .from(intelligenceTransforms)
        .where(
          and(
            eq(intelligenceTransforms.aiTaskId, taskId),
            eq(intelligenceTransforms.userId, ctx.userId),
            eq(intelligenceTransforms.accountId, accountId),
          ),
        )
        .limit(1);
      if (!transform) throw new OwnershipError("Transform task not found");
      const item = await requireItem(ctx, transform.itemId);
      const snapshot = await requireSnapshot(
        ctx,
        transform.sourceSnapshotId,
      );
      if (!deps.positioning) {
        throw new IntelligenceValidationError("当前账号尚未配置定位");
      }
      const positioning = await deps.positioning.getVersion(
        ctx,
        transform.positioningVersionId,
      );
      const [transcript] = await db
        .select()
        .from(itemTranscripts)
        .where(eq(itemTranscripts.itemId, item.id))
        .limit(1);
      if (
        !transcript ||
        transcript.status !== "done" ||
        !transcript.text?.trim()
      ) {
        throw new IntelligenceConflictError(
          "逐字稿未完成，不能执行选题拆解",
        );
      }
      const transcriptText = transcript.text.trim();
      const transcriptHash = `sha256:${hash(transcriptText)}`;
      const priorTransforms = await db
        .select({
          outputSnapshot: intelligenceTransforms.outputSnapshot,
          sourceSnapshotId: intelligenceTransforms.sourceSnapshotId,
          positioningVersionId: intelligenceTransforms.positioningVersionId,
        })
        .from(intelligenceTransforms)
        .where(
          and(
            eq(intelligenceTransforms.itemId, item.id),
            eq(intelligenceTransforms.userId, ctx.userId),
            eq(intelligenceTransforms.accountId, accountId),
          ),
        )
        .orderBy(desc(intelligenceTransforms.createdAt));
      const reusableDecomposition =
        priorTransforms
          .filter(
            (row) =>
              row.sourceSnapshotId === transform.sourceSnapshotId &&
              row.positioningVersionId === transform.positioningVersionId,
          )
          .map((row) =>
            reusableTopicDecomposition(row.outputSnapshot, transcriptHash),
          )
          .find(
            (candidate): candidate is ReusableTopicDecomposition =>
              candidate !== null,
          ) ?? null;
      const reusableCandidate =
        priorTransforms
          .filter(
            (row) =>
              row.sourceSnapshotId === transform.sourceSnapshotId &&
              row.positioningVersionId === transform.positioningVersionId,
          )
          .map((row) =>
            reusableTopicCandidate(row.outputSnapshot, transcriptHash),
          )
          .find(
            (candidate): candidate is ReusableTopicCandidate =>
              candidate !== null,
          ) ?? null;
      return {
        transformId: transform.id,
        item: toItem(item),
        snapshot: toSnapshot(snapshot),
        positioning,
        transcript: {
          text: transcriptText,
          hash: transcriptHash,
          completedAt: transcript.completedAt,
          provider: transcript.provider,
          model: transcript.model,
        },
        reusableDecomposition,
        reusableCandidate,
      };
    },

    async saveTopicPreviewCheckpoint(
      ctx: RequestContext,
      transformId: string,
      checkpoint:
        | {
            stage: "decomposition";
            value: ReusableTopicDecomposition;
            sourceUrl: string;
            transcriptHash: string;
          }
        | {
            stage: "topic";
            value: ReusableTopicCandidate;
            sourceUrl: string;
            transcriptHash: string;
          }
        | {
            stage: "draft";
            value: { contentText: string };
            sourceUrl: string;
            transcriptHash: string;
          },
    ) {
      const transform = await requireTransform(ctx, transformId);
      const [currentTranscript] = await db
        .select()
        .from(itemTranscripts)
        .where(eq(itemTranscripts.itemId, transform.itemId))
        .limit(1);
      const currentText = currentTranscript?.text?.trim() ?? "";
      const currentTranscriptHash = currentText
        ? `sha256:${hash(currentText)}`
        : null;
      if (
        currentTranscript?.status !== "done" ||
        currentTranscriptHash !== checkpoint.transcriptHash
      ) {
        throw new IntelligenceConflictError(
          "TRANSCRIPT_CHANGED_DURING_TOPIC_GENERATION",
        );
      }
      const previous =
        transform.outputSnapshot &&
        typeof transform.outputSnapshot === "object" &&
        !Array.isArray(transform.outputSnapshot)
          ? (transform.outputSnapshot as Record<string, unknown>)
          : {};
      const previousProgress =
        previous.generationProgress &&
        typeof previous.generationProgress === "object" &&
        !Array.isArray(previous.generationProgress)
          ? (previous.generationProgress as Record<string, unknown>)
          : {};
      const previousStrategy = adaptationStrategyFromSnapshot(previous);
      if (checkpoint.stage === "draft" && !previousStrategy) {
        throw new IntelligenceConflictError(
          "ADAPTATION_STRATEGY_REQUIRED_BEFORE_DRAFT",
        );
      }
      const stamp = now();
      const stagePatch =
        checkpoint.stage === "decomposition"
          ? {
              ...checkpoint.value,
              decompositionVersion: "v1",
            }
          : checkpoint.stage === "topic"
            ? checkpoint.value
            : {
                adaptedDraft: {
                  contentText: checkpoint.value.contentText.trim(),
                  generatedFromTranscriptHash: checkpoint.transcriptHash,
                  strategyHash: adaptationStrategyHash(
                    previousStrategy!,
                  ),
                  templateVersion: "intelligence-topic-draft-v1",
                },
              };
      if (
        checkpoint.stage === "draft" &&
        !checkpoint.value.contentText.trim()
      ) {
        throw new IntelligenceValidationError("adaptedDraft 不能为空");
      }
      const [updated] = await db
        .update(intelligenceTransforms)
        .set({
          outputSnapshot: {
            ...previous,
            ...stagePatch,
            sourceUrl: checkpoint.sourceUrl,
            transcriptHash: checkpoint.transcriptHash,
            generationProgress: {
              ...previousProgress,
              [checkpoint.stage]: {
                status: "completed",
                completedAt: stamp,
              },
            },
          },
          updatedAt: stamp,
        })
        .where(eq(intelligenceTransforms.id, transform.id))
        .returning();
      if (!updated) throw new Error("failed to save topic preview checkpoint");
      return toTransform(updated);
    },

    async markTopicPreviewStageFailed(
      ctx: RequestContext,
      transformId: string,
      input: {
        stage: "decomposition" | "topic" | "draft";
        errorCode: string;
      },
    ) {
      const transform = await requireTransform(ctx, transformId);
      const previous =
        transform.outputSnapshot &&
        typeof transform.outputSnapshot === "object" &&
        !Array.isArray(transform.outputSnapshot)
          ? (transform.outputSnapshot as Record<string, unknown>)
          : {};
      const previousProgress =
        previous.generationProgress &&
        typeof previous.generationProgress === "object" &&
        !Array.isArray(previous.generationProgress)
          ? (previous.generationProgress as Record<string, unknown>)
          : {};
      const [updated] = await db
        .update(intelligenceTransforms)
        .set({
          outputSnapshot: {
            ...previous,
            generationProgress: {
              ...previousProgress,
              [input.stage]: {
                status: "failed",
                errorCode: input.errorCode,
                failedAt: now(),
              },
            },
          },
          updatedAt: now(),
        })
        .where(eq(intelligenceTransforms.id, transform.id))
        .returning();
      if (!updated) throw new Error("failed to mark topic preview stage");
      return toTransform(updated);
    },

    async finishTopicPreview(
      ctx: RequestContext,
      transformId: string,
      output: {
        hook: string;
        structureSteps: string[];
        coreClaims: string[];
        reusablePattern: string;
        factRisks: string[];
        title: string;
        angle: string;
        differentiation: string;
        sourceSummary: string;
        targetAudience: string;
        audiencePain: string;
        coreConflict: string;
        format: string;
        adaptationStrategy: {
          keep: string[];
          replace: string[];
          add: string[];
          avoid: string[];
        };
        adaptedDraft: string;
        sourceUrl: string;
        transcriptHash: string;
      },
    ) {
      const transform = await requireTransform(ctx, transformId);
      for (const [key, value] of Object.entries({
        hook: output.hook,
        reusablePattern: output.reusablePattern,
        adaptedDraft: output.adaptedDraft,
        sourceUrl: output.sourceUrl,
        transcriptHash: output.transcriptHash,
      })) {
        if (!value.trim()) {
          throw new IntelligenceValidationError(`${key} 不能为空`);
        }
      }
      if (
        output.structureSteps.length < 2 ||
        output.structureSteps.some((step) => !step.trim())
      ) {
        throw new IntelligenceValidationError(
          "structureSteps 至少需要两个非空步骤",
        );
      }
      if (
        output.coreClaims.length === 0 ||
        output.coreClaims.some((claim) => !claim.trim())
      ) {
        throw new IntelligenceValidationError(
          "coreClaims 至少需要一个非空主张",
        );
      }
      const [currentTranscript] = await db
        .select()
        .from(itemTranscripts)
        .where(eq(itemTranscripts.itemId, transform.itemId))
        .limit(1);
      const currentText = currentTranscript?.text?.trim() ?? "";
      const currentTranscriptHash = currentText
        ? `sha256:${hash(currentText)}`
        : null;
      if (
        currentTranscript?.status !== "done" ||
        currentTranscriptHash !== output.transcriptHash
      ) {
        throw new IntelligenceConflictError(
          "TRANSCRIPT_CHANGED_DURING_TOPIC_GENERATION",
        );
      }
      const [updated] = await db
        .update(intelligenceTransforms)
        .set({
          outputSnapshot: {
            ...((transform.outputSnapshot as Record<string, unknown> | null) ??
              {}),
            ...output,
            adaptedDraft: {
              contentText: output.adaptedDraft.trim(),
              generatedFromTranscriptHash: output.transcriptHash,
              strategyHash: adaptationStrategyHash(output.adaptationStrategy),
              templateVersion: "intelligence-topic-draft-v1",
            },
            decompositionVersion: "v1",
            generationProgress: {
              decomposition: { status: "completed", completedAt: now() },
              topic: { status: "completed", completedAt: now() },
              draft: { status: "completed", completedAt: now() },
            },
          },
          updatedAt: now(),
        })
        .where(eq(intelligenceTransforms.id, transform.id))
        .returning();
      if (!updated) throw new Error("failed to finish topic preview");
      return toTransform(updated);
    },

    async confirmTopic(
      ctx: RequestContext,
      transformId: string,
      input: {
        editedCandidate: {
          title: string;
          angle: string;
          differentiation: string;
          sourceSummary: string;
          targetAudience: string;
          audiencePain: string;
          coreConflict: string;
          format: string;
          adaptationStrategy: {
            keep: string[];
            replace: string[];
            add: string[];
            avoid: string[];
          };
        };
        idempotencyKey: string;
      },
    ) {
      const transform = await requireTransform(ctx, transformId);
      if (transform.status === "confirmed" && transform.targetTopicId) {
        return {
          transform: toTransform(transform),
          topicId: transform.targetTopicId,
          provenance: {
            itemId: transform.itemId,
            sourceSnapshotId: transform.sourceSnapshotId,
            positioningVersionId: transform.positioningVersionId,
          },
        };
      }
      if (!transform.outputSnapshot) {
        throw new IntelligenceConflictError("选题候选尚未生成完成");
      }
      const persistedSnapshot = transform.outputSnapshot as Record<
        string,
        unknown
      >;
      const generationProgress = persistedSnapshot.generationProgress;
      if (
        generationProgress &&
        typeof generationProgress === "object" &&
        !Array.isArray(generationProgress)
      ) {
        const progress = generationProgress as Record<string, unknown>;
        const topicProgress =
          progress.topic &&
          typeof progress.topic === "object" &&
          !Array.isArray(progress.topic)
            ? (progress.topic as Record<string, unknown>)
            : null;
        const draftProgress =
          progress.draft &&
          typeof progress.draft === "object" &&
          !Array.isArray(progress.draft)
            ? (progress.draft as Record<string, unknown>)
            : null;
        const task = transform.aiTaskId
          ? await deps.tasks.get(ctx, transform.aiTaskId).catch(() => null)
          : null;
        if (
          task?.status !== "succeeded" ||
          topicProgress?.status !== "completed" ||
          draftProgress?.status !== "completed"
        ) {
          throw new IntelligenceConflictError("TOPIC_PREVIEW_NOT_READY");
        }
      }
      if (!deps.topics) {
        throw new IntelligenceValidationError("选题服务尚未接入");
      }
      // transport 的 strict schema 只允许这四个字段；service 也显式投影一次，避免
      // 内部调用误把拆解数组等 provenance 一并当字符串校验/写入。
      const candidate = {
        title: input.editedCandidate.title,
        angle: input.editedCandidate.angle,
        differentiation: input.editedCandidate.differentiation,
        sourceSummary: input.editedCandidate.sourceSummary,
        targetAudience: input.editedCandidate.targetAudience,
        audiencePain: input.editedCandidate.audiencePain,
        coreConflict: input.editedCandidate.coreConflict,
        format: input.editedCandidate.format,
        adaptationStrategy: input.editedCandidate.adaptationStrategy,
      };
      for (const [key, value] of Object.entries({
        title: candidate.title,
        angle: candidate.angle,
        differentiation: candidate.differentiation,
        sourceSummary: candidate.sourceSummary,
        targetAudience: candidate.targetAudience,
        audiencePain: candidate.audiencePain,
        coreConflict: candidate.coreConflict,
        format: candidate.format,
      })) {
        if (!value.trim()) {
          throw new IntelligenceValidationError(`${key} 不能为空`);
        }
      }
      const sourceItem = await requireItem(ctx, transform.itemId);
      const preview = transform.outputSnapshot as {
        hook?: unknown;
        structureSteps?: unknown;
        coreClaims?: unknown;
        reusablePattern?: unknown;
        factRisks?: unknown;
        adaptedDraft?: unknown;
      };
      const structureSteps = Array.isArray(preview.structureSteps)
        ? preview.structureSteps.filter(
            (step): step is string =>
              typeof step === "string" && step.trim().length > 0,
          )
        : [];
      const factRisks = Array.isArray(preview.factRisks)
        ? preview.factRisks.filter(
            (risk): risk is string =>
              typeof risk === "string" && risk.trim().length > 0,
          )
        : [];
      const coreClaims = Array.isArray(preview.coreClaims)
        ? preview.coreClaims.filter(
            (claim): claim is string =>
              typeof claim === "string" && claim.trim().length > 0,
          )
        : [];
      const reusablePattern =
        typeof preview.reusablePattern === "string"
          ? preview.reusablePattern.trim()
          : "";
      const adaptedDraft =
        preview.adaptedDraft &&
        typeof preview.adaptedDraft === "object" &&
        !Array.isArray(preview.adaptedDraft)
          ? (preview.adaptedDraft as Record<string, unknown>)
          : null;
      const expectedStrategyHash = adaptationStrategyHash(
        candidate.adaptationStrategy,
      );
      if (
        !adaptedDraft ||
        typeof adaptedDraft.contentText !== "string" ||
        !adaptedDraft.contentText.trim() ||
        adaptedDraft.strategyHash !== expectedStrategyHash
      ) {
        throw new IntelligenceConflictError(
          "改写策略与初稿版本不一致，请重新生成后再采纳",
        );
      }
      const topic = await deps.topics.create(ctx, {
        title: candidate.title,
        angle: `${candidate.angle}\n差异化：${candidate.differentiation}\n来源：${candidate.sourceSummary}`,
        card: {
          oneLiner: candidate.title,
          targetAudience: candidate.targetAudience,
          audiencePain: candidate.audiencePain,
          coreConflict: candidate.coreConflict,
          ...(typeof preview.hook === "string" && preview.hook.trim()
            ? { hook: preview.hook }
            : {}),
          ...(structureSteps.length > 0
            ? { contentStructure: structureSteps }
            : {}),
          format: candidate.format,
          materialBasis: candidate.sourceSummary,
          ...(factRisks.length > 0
            ? { riskNote: factRisks.join("；") }
            : {}),
          proposal: `差异化切法：${candidate.differentiation}`,
          ...(typeof preview.hook === "string" &&
          preview.hook.trim() &&
          structureSteps.length >= 2 &&
          coreClaims.length > 0 &&
          reusablePattern
            ? {
                sourceDecomposition: {
                  hook: preview.hook.trim(),
                  structureSteps,
                  coreClaims,
                  reusablePattern,
                  factRisks,
                },
              }
            : {}),
          adaptationStrategy: candidate.adaptationStrategy,
          ...(adaptedDraft &&
          typeof adaptedDraft.contentText === "string" &&
          typeof adaptedDraft.generatedFromTranscriptHash === "string" &&
          typeof adaptedDraft.strategyHash === "string" &&
          typeof adaptedDraft.templateVersion === "string"
            ? {
                adaptedDraft: {
                  contentText: adaptedDraft.contentText,
                  generatedFromTranscriptHash:
                    adaptedDraft.generatedFromTranscriptHash,
                  strategyHash: adaptedDraft.strategyHash,
                  templateVersion: adaptedDraft.templateVersion,
                },
              }
            : {}),
        },
        sourceReferences: [
          {
            kind:
              sourceItem.type === "video"
                ? "original_video"
                : "source_page",
            platform: sourceItem.platform,
            label: sourceItem.type === "video" ? "原视频" : "来源页面",
            url: sourceItem.canonicalUrl,
            intelligenceItemId: transform.itemId,
          },
        ],
      });
      const [updated] = await db
        .update(intelligenceTransforms)
        .set({
          status: "confirmed",
          // 用户只编辑选题候选四字段；逐字稿拆解、来源 URL 与 hash 是不可变
          // provenance，确认时必须保留，不能被编辑表单覆盖掉。
          outputSnapshot: {
            ...(transform.outputSnapshot as Record<string, unknown>),
            ...candidate,
          },
          targetTopicId: topic.id,
          updatedAt: now(),
        })
        .where(eq(intelligenceTransforms.id, transform.id))
        .returning();
      if (!updated) throw new Error("failed to confirm topic transform");
      return {
        transform: toTransform(updated),
        topicId: topic.id,
        provenance: {
          itemId: transform.itemId,
          sourceSnapshotId: transform.sourceSnapshotId,
          positioningVersionId: transform.positioningVersionId,
        },
      };
    },

    async applyAdapterBatch(
      ctx: RequestContext,
      input: {
        runId: string;
        lease: { workerId: string; attempt: number };
        envelope: IntelligenceAdapterEnvelope;
        terminal: boolean;
      },
    ) {
      assertSafeDiagnostics(input.envelope.safeDiagnostics);
      const run = await requireRun(ctx, input.runId);
      const sourceForSchedule = await requireSource(ctx, run.sourceId);
      if (
        !["queued", "running"].includes(run.status) &&
        input.terminal
      ) {
        const observations = await db
          .select()
          .from(itemSourceObservations)
          .where(eq(itemSourceObservations.runId, run.id));
        return {
          run: toRun(run),
          itemIds: [...new Set(observations.map((row) => row.itemId))],
          counts: {
            scanned: run.scannedCount,
            created: run.newCount,
            updated: run.updatedCount,
            skipped: run.skippedCount,
          },
        };
      }
      await deps.tasks.heartbeat({
        taskId: run.executionTaskId,
        workerId: input.lease.workerId,
        attempt: input.lease.attempt,
      });

      const stamp = input.envelope.upstreamEvidence.capturedAt;
      const accountId = await account(ctx, "intelligence.applyAdapterBatch");
      let created = 0;
      let updated = 0;
      const itemIds: string[] = [];
      await db.transaction(async (tx) => {
        for (const candidate of input.envelope.items) {
          const url = canonicalUrl(candidate.canonicalUrl);
          const urlHash = hash(url);
          const identity = candidate.externalId
            ? and(
                eq(intelligenceItems.userId, ctx.userId),
                eq(intelligenceItems.accountId, accountId),
                eq(intelligenceItems.platform, candidate.platform),
                eq(intelligenceItems.type, candidate.type),
                eq(intelligenceItems.externalId, candidate.externalId),
              )
            : and(
                eq(intelligenceItems.userId, ctx.userId),
                eq(intelligenceItems.accountId, accountId),
                eq(intelligenceItems.platform, candidate.platform),
                eq(intelligenceItems.type, candidate.type),
                eq(intelligenceItems.canonicalUrlHash, urlHash),
              );
          let [item] = await tx
            .select()
            .from(intelligenceItems)
            .where(identity)
            .limit(1);
          if (item) {
            [item] = await tx
              .update(intelligenceItems)
              .set({
                canonicalUrl: url,
                canonicalUrlHash: urlHash,
                authorId: candidate.authorId,
                authorName: candidate.authorName,
                title: candidate.title,
                summary: candidate.summary,
                coverUrl: candidate.coverUrl,
                publishedAt: candidate.publishedAt,
                durationMs: candidate.durationMs,
                capturedAt: stamp,
                availability: "available",
                updatedAt: now(),
              })
              .where(eq(intelligenceItems.id, item.id))
              .returning();
            updated += 1;
          } else {
            [item] = await tx
              .insert(intelligenceItems)
              .values({
                id: nextId("intelligence-item"),
                userId: ctx.userId,
                accountId,
                type: candidate.type,
                platform: candidate.platform,
                externalId: candidate.externalId,
                canonicalUrl: url,
                canonicalUrlHash: urlHash,
                authorId: candidate.authorId,
                authorName: candidate.authorName,
                title: candidate.title,
                summary: candidate.summary,
                coverUrl: candidate.coverUrl,
                coverAssetId: null,
                publishedAt: candidate.publishedAt,
                durationMs: candidate.durationMs,
                capturedAt: stamp,
                availability: "available",
                createdAt: now(),
                updatedAt: now(),
              })
              .returning();
            created += 1;
          }
          if (!item) throw new Error("failed to upsert intelligence item");
          itemIds.push(item.id);
          await tx
            .insert(itemTranscripts)
            .values({
              itemId: item.id,
              userId: ctx.userId,
              accountId,
              status: "not_requested",
              text: null,
              source: null,
              provider: null,
              model: null,
              language: null,
              executionTaskId: null,
              queuedAt: null,
              completedAt: null,
              errorCode: null,
              updatedAt: now(),
            })
            .onConflictDoNothing();
          if (candidate.metrics) {
            await tx
              .insert(itemMetricSnapshots)
              .values({
                id: nextId("intelligence-metric"),
                userId: ctx.userId,
                accountId,
                itemId: item.id,
                capturedAt: stamp,
                likeCount: candidate.metrics.likeCount,
                commentCount: candidate.metrics.commentCount,
                collectCount: candidate.metrics.collectCount,
                shareCount: candidate.metrics.shareCount,
                followerCount: candidate.metrics.followerCount,
                metricSource: candidate.metrics.metricSource,
                qualityFlags: candidate.metrics.qualityFlags,
              })
              .onConflictDoNothing();
          }
          const externalRef = candidate.externalId ?? urlHash;
          const [observation] = await tx
            .select()
            .from(itemSourceObservations)
            .where(
              and(
                eq(itemSourceObservations.userId, ctx.userId),
                eq(itemSourceObservations.accountId, accountId),
                eq(itemSourceObservations.itemId, item.id),
                eq(itemSourceObservations.sourceId, run.sourceId),
                eq(itemSourceObservations.externalRef, externalRef),
              ),
            )
            .limit(1);
          if (observation) {
            await tx
              .update(itemSourceObservations)
              .set({
                runId: run.id,
                lastSeenAt: stamp,
                discoveryContext: {
                  adapter: input.envelope.upstreamEvidence.adapter,
                },
              })
              .where(eq(itemSourceObservations.id, observation.id));
          } else {
            await tx.insert(itemSourceObservations).values({
              id: nextId("intelligence-observation"),
              userId: ctx.userId,
              accountId,
              itemId: item.id,
              sourceId: run.sourceId,
              runId: run.id,
              externalRef,
              firstSeenAt: stamp,
              lastSeenAt: stamp,
              discoveryContext: {
                adapter: input.envelope.upstreamEvidence.adapter,
              },
            });
          }
          if (candidate.snapshot) {
            const [priorSnapshot] = await tx
              .select()
              .from(sourceSnapshots)
              .where(
                and(
                  eq(sourceSnapshots.sourceId, run.sourceId),
                  eq(sourceSnapshots.runId, run.id),
                  eq(sourceSnapshots.itemId, item.id),
                  eq(
                    sourceSnapshots.contentHash,
                    candidate.snapshot.contentHash,
                  ),
                ),
              )
              .limit(1);
            if (!priorSnapshot) {
              await tx.insert(sourceSnapshots).values({
                id: nextId("intelligence-snapshot"),
                userId: ctx.userId,
                accountId,
                sourceId: run.sourceId,
                runId: run.id,
                itemId: item.id,
                capturedAt: stamp,
                finalUrl: canonicalUrl(candidate.snapshot.finalUrl),
                title: candidate.snapshot.title,
                contentHash: candidate.snapshot.contentHash,
                safeExtract: candidate.snapshot.safeExtract,
                storageRef: candidate.snapshot.storageRef,
                retentionUntil: candidate.snapshot.retentionUntil,
                privacyClass: candidate.snapshot.privacyClass,
              });
            }
          }
        }
        const terminalStatus = input.terminal
          ? input.envelope.adapterStatus
          : "running";
        await tx
          .update(intelligenceSyncRuns)
          .set({
            status: terminalStatus,
            checkpoint: input.envelope.checkpoint,
            adapterEvidence: input.envelope.upstreamEvidence,
            startedAt: run.startedAt ?? now(),
            finishedAt: input.terminal ? now() : null,
            scannedCount: run.scannedCount + input.envelope.items.length,
            newCount: run.newCount + created,
            updatedCount: run.updatedCount + updated,
            failedCount:
              run.failedCount +
              (input.envelope.adapterStatus === "failed" ? 1 : 0),
            errorCode: input.envelope.errorCode,
            errorSummary: input.envelope.errorCode
              ? `adapter ${input.envelope.upstreamEvidence.adapter}: ${input.envelope.errorCode}`
              : null,
            nextAction: nextActionFor(input.envelope.errorCode),
            updatedAt: now(),
          })
          .where(eq(intelligenceSyncRuns.id, run.id));
        await tx.insert(intelligenceSyncRunEvents).values({
          id: nextId("intelligence-run-event"),
          userId: ctx.userId,
          accountId,
          runId: run.id,
          step: input.envelope.upstreamEvidence.adapter,
          status: input.envelope.adapterStatus,
          occurredAt: now(),
          itemRef: null,
          message: input.envelope.errorCode
            ? `同步未完成：${input.envelope.errorCode}`
            : `已处理 ${input.envelope.items.length} 条`,
          safeDetails: input.envelope.safeDiagnostics,
        });
        await tx
          .update(intelligenceSources)
          .set({
            lastRunAt: input.terminal ? now() : run.startedAt ?? now(),
            nextRunAt: input.terminal
              ? sourceForSchedule.monitorEnabled &&
                input.envelope.adapterStatus !== "blocked"
                ? nextDailyRunAt(now())
                : null
              : sourceForSchedule.nextRunAt,
            updatedAt: now(),
          })
          .where(eq(intelligenceSources.id, run.sourceId));
      });
      await deps.tasks.saveCheckpoint({
        taskId: run.executionTaskId,
        workerId: input.lease.workerId,
        attempt: input.lease.attempt,
        checkpoint: input.envelope.checkpoint,
      });
      if (input.terminal) {
        await deps.tasks.finish({
          taskId: run.executionTaskId,
          workerId: input.lease.workerId,
          attempt: input.lease.attempt,
          status:
            input.envelope.adapterStatus === "failed"
              ? "failed"
              : input.envelope.adapterStatus === "blocked"
                ? "blocked"
                : "succeeded",
          errorCode: input.envelope.errorCode,
          errorMessage: input.envelope.errorCode,
        });
      }
      const latest = await requireRun(ctx, run.id);
      return {
        run: toRun(latest),
        itemIds,
        counts: {
          scanned: input.envelope.items.length,
          created,
          updated,
          skipped: 0,
        },
      };
    },

    async enqueueTranscripts(
      ctx: RequestContext,
      input: { itemIds: string[]; idempotencyKey: string },
    ) {
      const ids = [...new Set(input.itemIds)];
      if (ids.length !== input.itemIds.length || ids.length === 0) {
        throw new IntelligenceValidationError(
          "itemIds 必须非空且不得重复",
        );
      }
      const tasks: ExecutionTaskResourceV2[] = [];
      const skipped: Array<{ itemId: string; reason: string }> = [];
      for (const itemId of ids) {
        const item = await requireItem(ctx, itemId);
        const [transcript] = await db
          .select()
          .from(itemTranscripts)
          .where(eq(itemTranscripts.itemId, itemId))
          .limit(1);
        if (
          transcript &&
          ["queued", "running"].includes(transcript.status)
        ) {
          skipped.push({
            itemId,
            reason: "TRANSCRIPT_ALREADY_QUEUED",
          });
          continue;
        }
        const lock = await transcriptTopicLock(ctx, itemId);
        if (lock.locked) {
          skipped.push({ itemId, reason: "TRANSCRIPT_LOCKED" });
          continue;
        }
        if (lock.topicBusy) {
          skipped.push({ itemId, reason: "TRANSCRIPT_TOPIC_BUSY" });
          continue;
        }
        const task = await deps.tasks.enqueue(ctx, {
          kind: "transcribe",
          ownerType: "item",
          ownerId: itemId,
          idempotencyKey: `${input.idempotencyKey}:${itemId}`,
          payload: {
            itemId,
            sourceUrl: item.canonicalUrl,
            requestedBy: "user",
          },
          priority: 20,
          costEstimate: null,
        });
        await db
          .insert(itemTranscripts)
          .values({
            itemId,
            userId: item.userId,
            accountId: item.accountId,
            status: "queued",
            text: null,
            source: null,
            provider: null,
            model: null,
            language: null,
            executionTaskId: task.id,
            queuedAt: now(),
            completedAt: null,
            errorCode: null,
            updatedAt: now(),
          })
          .onConflictDoUpdate({
            target: itemTranscripts.itemId,
            set: {
              status: "queued",
              executionTaskId: task.id,
              queuedAt: now(),
              completedAt: null,
              errorCode: null,
              updatedAt: now(),
            },
          });
        tasks.push(task);
      }
      return { tasks, skipped };
    },

    /** Deterministic fixture seam; production ingestion goes through applyAdapterBatch. */
    async seedItemForTest(
      ctx: RequestContext,
      input: { canonicalUrl: string; externalId: string | null; title: string },
    ) {
      const accountId = await account(ctx, "intelligence.seedItemForTest");
      const url = canonicalUrl(input.canonicalUrl);
      const stamp = now();
      const id = nextId("intelligence-item");
      await db.insert(intelligenceItems).values({
        id,
        userId: ctx.userId,
        accountId,
        type: "video",
        platform: "douyin",
        externalId: input.externalId,
        canonicalUrl: url,
        canonicalUrlHash: hash(url),
        authorId: null,
        authorName: null,
        title: input.title,
        summary: null,
        coverUrl: null,
        coverAssetId: null,
        publishedAt: null,
        durationMs: null,
        capturedAt: stamp,
        availability: "available",
        createdAt: stamp,
        updatedAt: stamp,
      });
      await db.insert(itemTranscripts).values({
        itemId: id,
        userId: ctx.userId,
        accountId,
        status: "not_requested",
        text: null,
        source: null,
        provider: null,
        model: null,
        language: null,
        executionTaskId: null,
        queuedAt: null,
        completedAt: null,
        errorCode: null,
        updatedAt: stamp,
      });
      return id;
    },
  };

  return service;
}

export type IntelligenceService = ReturnType<typeof createIntelligenceService>;
