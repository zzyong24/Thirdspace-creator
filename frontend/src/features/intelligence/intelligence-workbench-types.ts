import type { ExecutionTaskResourceV2, ProjectPreparationResource, ProjectEnsureResult, ProjectEnsureInput } from "@creatoros/contract";
export interface RadarScope { groupId?: string; accountId?: string; }
export type RadarScopeInput = RadarScope | string;
export function radarScope(input: RadarScopeInput): RadarScope { return typeof input === "string" ? {accountId: input} : input; }
export function radarScopeKey(input: RadarScopeInput): string { const scope=radarScope(input); return scope.groupId ? `group:${scope.groupId}` : `account:${scope.accountId ?? ""}`; }
export function radarTaskInScope(task: {groupId?: string | null; accountId?: string | null}, input: RadarScopeInput): boolean { const scope=radarScope(input); return scope.groupId ? task.groupId === scope.groupId : (!task.groupId || task.groupId === `grp_legacy_${scope.accountId}`) && task.accountId === scope.accountId; }
export function radarAccountInput(scope: RadarScope): {accountId?: string} { return !scope.groupId && scope.accountId ? {accountId:scope.accountId} : {}; }

export interface RadarCollection {
  id: string;
  parentId: string | null;
  name: string;
  kind: "system" | "custom";
  sortOrder: number;
  version: number;
}

export interface RadarSource {
  id: string;
  collectionId: string | null;
  type:
    | "creator_profile"
    | "favorites_folder"
    | "web"
    | "rss"
    | "darkhorse_query";
  displayName: string;
  canonicalUrl: string | null;
  collector: {
    accountId: string|null;
    accountHandle: string | null;
    platform: "douyin" | null;
    availability: "active" | "archived" | "missing";
  } | null;
  monitorEnabled: boolean;
  syncPolicy: Record<string, unknown>;
  status: "draft" | "active" | "paused" | "archived";
  lastRunAt: string | null;
  nextRunAt: string | null;
  version: number;
}

export type RadarRunStatus =
  | "queued"
  | "running"
  | "succeeded_with_items"
  | "succeeded_no_change"
  | "partial"
  | "blocked"
  | "failed";

export interface RadarRun {
  id: string;
  sourceId: string;
  trigger: "manual" | "schedule" | "initial" | "retry";
  status: RadarRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  scannedCount: number;
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errorCode: string | null;
  errorSummary: string | null;
  nextAction: "login" | "configure_model" | "retry" | "edit" | "none";
  createdAt: string;
}

export interface RadarRunEvent {
  id: string;
  runId: string;
  step: string;
  status:
    | "succeeded_with_items"
    | "succeeded_no_change"
    | "partial"
    | "blocked"
    | "failed";
  occurredAt: string;
  message: string;
}

export interface RadarMetric {
  id: string;
  capturedAt: string;
  likeCount: number | null;
  commentCount: number | null;
  collectCount: number | null;
  shareCount: number | null;
}

export interface RadarItem {
  id: string;
  projectId?: string;
  type: "video" | "article" | "trend_signal";
  platform: string;
  canonicalUrl: string;
  authorName: string | null;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  capturedAt: string;
}

export interface RadarItemRow {
  item: RadarItem;
  latestMetric: RadarMetric | null;
  sourceCount: number;
  transcriptState?:
    | "not_extracted"
    | "processing"
    | "extracted"
    | "attention";
  topicState?:
    | "not_generated"
    | "generating"
    | "awaiting_confirmation"
    | "converted"
    | "attention";
  progressState?:
    | "pending_transcript"
    | "transcript_processing"
    | "pending_topic"
    | "topic_generating"
    | "awaiting_confirmation"
    | "converted"
    | "attention";
}

export interface RadarItemPage {
  items: RadarItemRow[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface RadarItemDetail {
  item: RadarItem;
  metrics: RadarMetric[];
  observations: Array<{
    id: string;
    sourceId: string;
    firstSeenAt: string;
    lastSeenAt: string;
  }>;
  snapshots: Array<{
    id: string;
    sourceId?: string;
    title: string | null;
    capturedAt: string;
    finalUrl: string;
  }>;
  transcript: {
    itemId: string;
    status:
      | "not_requested"
      | "queued"
      | "running"
      | "done"
      | "skipped"
      | "failed"
      | "blocked"
      | "unknown";
    text: string | null;
    errorCode: string | null;
  };
  transforms: Array<{
    id: string;
    idempotencyKey?: string;
    sourceSnapshotId?: string;
    status: "candidate" | "confirmed" | "cancelled";
    taskStatus?: ExecutionTaskResourceV2["status"] | null;
    executionTaskId?: string | null;
    taskRuntimeStatus?: ExecutionTaskResourceV2["runtimeStatus"];
    taskErrorCode?: string | null;
    taskErrorMessage?: string | null;
    outputSnapshot: {
      generationMode?: "rewrite_only";
      personalizationStatus?: "applied" | "not_applied";
      hook?: string;
      structureSteps?: string[];
      coreClaims?: string[];
      reusablePattern?: string;
      factRisks?: string[];
      title?: string;
      angle?: string;
      differentiation?: string;
      sourceSummary?: string;
      targetAudience?: string;
      audiencePain?: string;
      coreConflict?: string;
      format?: string;
      contentRole?: "traffic" | "trust" | "conversion" | null;
      recommendedContentRole?: "traffic" | "trust" | "conversion" | null;
      contentRoleReason?: string;
      adaptationStrategy?: {
        keep: string[];
        replace: string[];
        add: string[];
        avoid: string[];
      };
      adaptedDraft?:
        | {
            generationMode?: never;
            contentText: string;
            generatedFromTranscriptHash: string;
            strategyHash: string;
            templateVersion: string;
          }
        | {
            generationMode: "rewrite_only";
            contentText: string;
            sourceSnapshotId: string;
            generatedFromTranscriptHash: string;
            positioningVersionId?: string;
            personalizationStatus: "applied" | "not_applied";
            templateVersion: string;
          };
      adoptedDraftContentText?: string;
      sourceUrl?: string;
      transcriptHash?: string;
      decompositionVersion?: string;
      generationProgress?: Partial<
        Record<
          "decomposition" | "topic" | "draft" | "rewriteDraft",
          { status: "pending" | "running" | "completed" | "failed"; completedAt?: string }
        >
      >;
    } | null;
    targetTopicId: string | null;
  }>;
}

export type RadarTopicPreviewStart = {
  transform: {
    id: string;
    status: "candidate" | "confirmed" | "cancelled";
    outputSnapshot: Record<string, unknown> | null;
    targetTopicId: string | null;
  };
  task: { id: string; status: string; runtimeStatus?:ExecutionTaskResourceV2["runtimeStatus"] };
};

export interface RadarWorkspace {
  collections: RadarCollection[];
  sources: RadarSource[];
  memberships: Array<{
    id: string;
    sourceId: string;
    collectionId: string;
    createdAt: string;
  }>;
  health: Array<{
    sourceId: string;
    lastRunId: string | null;
    lastRunStatus: RadarRunStatus | null;
    blockedCount: number;
    lastErrorCode: string | null;
    scannedCount: number;
    newCount: number;
    updatedCount: number;
    failedCount: number;
  }>;
  pendingCount: number;
  blockedCount: number;
}

export interface CreateSourceResult {
  source: RadarSource;
  run: RadarRun | null;
  task: { id: string; status: string } | null;
}

export interface StartRunResult {
  run: RadarRun;
  task: { id: string; status: string; runtimeStatus?:ExecutionTaskResourceV2["runtimeStatus"] };
}

export interface RadarApi {
  ensureProject?(input:Extract<ProjectEnsureInput,{source:"radar"}>):Promise<ProjectEnsureResult>;
  getProjectPreparation?(projectId:string):Promise<ProjectPreparationResource>;
  listShareImportTasks?(input: RadarScope & {ownerId?: string; page?: number}): Promise<ExecutionTaskResourceV2[]>;
  commandTask?(input:{taskId:string;command:"resume"|"cancel"|"retry";idempotencyKey:string}):Promise<void>;
  listCollectors(input: RadarScope): Promise<
    Array<{
      accountId: string;
      accountHandle: string;
      platform: "douyin";
    }>
  >;
  previewProfile(input: {
    accountId?: string;
    groupId?: string;
    collectorAccountId: string;
    url: string;
  }): Promise<{
    externalAccountId: string;
    nickname: string;
    avatarUrl: string | null;
    canonicalUrl: string;
    visibleWorkCount: number | null;
  }>;
  previewWeb(input: {
    accountId?: string;
    groupId?: string;
    url: string;
    instruction: string;
  }): Promise<{
    type: "web" | "rss";
    title: string | null;
    finalUrl: string;
    samples: Array<{ title: string; url: string; summary: string | null }>;
    loginRequired: boolean;
    parser: string;
    browserSessionRef: string | null;
  }>;
  listFavoriteFolders(input: {
    accountId?: string;
    groupId?: string;
    collectorAccountId: string;
  }): Promise<Array<{ id: string; name: string; itemCount: number | null }>>;
  createCollection(input: {
    accountId?: string;
    groupId?: string;
    name: string;
    parentId: string | null;
    idempotencyKey: string;
  }): Promise<unknown>;
  createSource(input: {
    accountId?: string;
    groupId?: string;
    collectionId: string | null;
    type: RadarSource["type"];
    config: Record<string, unknown>;
    displayName?: string;
    extractionInstruction?: string;
    monitorEnabled: boolean;
    runInitial: boolean;
    idempotencyKey: string;
  }): Promise<CreateSourceResult>;
  updateSource(input: {
    sourceId: string;
    monitorEnabled?: boolean;
    syncPolicy?: Record<string, unknown>;
    /** 给未关联采集账号的博主主页补关联。 */
    collectorAccountId?: string;
    expectedVersion: number;
  }): Promise<RadarSource>;
  deleteSource(input: {
    sourceId: string;
    mode: "permanent";
    confirmToken: string;
  }): Promise<{
    affectedItems: number;
    preservedSnapshots: number;
    status: RadarSource["status"] | "deleted";
  }>;
  importDouyinShare(input: {
    accountId?: string;
    groupId?: string;
    collectionId: string | null;
    shareInput: string;
    idempotencyKey: string;
  }): Promise<{task: ExecutionTaskResourceV2}>;
  startRun(input: {
    sourceId: string;
    idempotencyKey: string;
  }): Promise<StartRunResult>;
  reconnectCollector(input: {
    collectorAccountId: string;
    sourceType: RadarSource["type"];
  }): Promise<{ loggedIn: boolean }>;
  listRuns(sourceId: string): Promise<RadarRun[]>;
  getRun(runId: string): Promise<{
    run: RadarRun;
    events: RadarRunEvent[];
  }>;
  listItems(input: {
    accountId?: string;
    groupId?: string;
    page?: number;
    pageSize?: number;
    collectionId?: string;
    sourceId?: string;
    query?: string;
    sort: "published_desc" | "collect_desc" | "like_desc";
    transcriptState?:
      | "not_extracted"
      | "processing"
      | "extracted"
      | "attention";
    topicState?:
      | "not_generated"
      | "generating"
      | "awaiting_confirmation"
      | "converted"
      | "attention";
  }): Promise<RadarItemPage>;
  getItem(itemId: string): Promise<RadarItemDetail>;
  enqueueTranscript(input: {
    itemId: string;
    idempotencyKey: string;
  }): Promise<unknown>;
  uploadTranscript(
    input:
      | {
          itemId: string;
          inputMode: "paste";
          text: string;
        }
      | {
          itemId: string;
          inputMode: "file";
          format: "txt" | "md" | "srt" | "vtt";
          fileName: string;
          text: string;
        },
  ): Promise<RadarItemDetail["transcript"]>;
  previewTopic(input: {
    itemId: string;
    sourceSnapshotId: string;
    positioningVersionId?: string;
    idempotencyKey: string;
  }): Promise<RadarTopicPreviewStart>;
  confirmTopic(input:
    | {
        transformId: string;
        editedCandidate: {
          title: string;
          angle: string;
          differentiation: string;
          sourceSummary: string;
          targetAudience: string;
          audiencePain: string;
          coreConflict: string;
          format: string;
          contentRole?: "traffic" | "trust" | "conversion" | null;
          adaptationStrategy: {
            keep: string[];
            replace: string[];
            add: string[];
            avoid: string[];
          };
        };
        idempotencyKey: string;
      }
    | {
        transformId: string;
        editedDraftContentText?: string;
        idempotencyKey: string;
      }
  ): Promise<{ topicId: string }>;
  promoteCandidate(input: {
    candidateId: string;
  }): Promise<{ projectId: string }>;
}

export type RadarSort = Parameters<RadarApi["listItems"]>[0]["sort"];
export type RadarTranscriptState = NonNullable<
  Parameters<RadarApi["listItems"]>[0]["transcriptState"]
>;
export type RadarTopicState = NonNullable<
  Parameters<RadarApi["listItems"]>[0]["topicState"]
>;
