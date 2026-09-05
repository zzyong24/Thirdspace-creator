import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const intelligenceCollections = pgTable("intelligence_collections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  kind: text("kind").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  version: integer("version").notNull().default(1),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const intelligenceSources = pgTable("intelligence_sources", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  collectionId: text("collection_id"),
  type: text("type").notNull(),
  platform: text("platform").notNull(),
  displayName: text("display_name").notNull(),
  canonicalUrl: text("canonical_url"),
  canonicalUrlHash: text("canonical_url_hash"),
  externalKey: text("external_key").notNull(),
  browserSessionRef: text("browser_session_ref"),
  adapterConfig: jsonb("adapter_config").notNull().default({}),
  monitorEnabled: boolean("monitor_enabled").notNull().default(false),
  syncPolicy: jsonb("sync_policy").notNull().default({}),
  extractionInstruction: text("extraction_instruction"),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// 一个稳定博主/来源可以出现在多个用户分类里；source 本体仍按稳定 externalKey
// 全账号复用，分类只增加 membership，不复制作者或作品。
export const intelligenceSourceCollectionMemberships = pgTable(
  "intelligence_source_collection_memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    sourceId: text("source_id").notNull(),
    collectionId: text("collection_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_intelligence_source_collection_membership").on(
      table.userId,
      table.accountId,
      table.sourceId,
      table.collectionId,
    ),
  ],
);

export const intelligenceItems = pgTable("intelligence_items", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  type: text("type").notNull(),
  platform: text("platform").notNull(),
  externalId: text("external_id"),
  canonicalUrl: text("canonical_url").notNull(),
  canonicalUrlHash: text("canonical_url_hash").notNull(),
  authorId: text("author_id"),
  authorName: text("author_name"),
  title: text("title").notNull().default(""),
  summary: text("summary"),
  coverUrl: text("cover_url"),
  coverAssetId: text("cover_asset_id"),
  publishedAt: text("published_at"),
  durationMs: integer("duration_ms"),
  capturedAt: text("captured_at").notNull(),
  availability: text("availability").notNull().default("available"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const itemMetricSnapshots = pgTable(
  "intelligence_item_metric_snapshots",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    itemId: text("item_id").notNull(),
    capturedAt: text("captured_at").notNull(),
    likeCount: integer("like_count"),
    commentCount: integer("comment_count"),
    collectCount: integer("collect_count"),
    shareCount: integer("share_count"),
    followerCount: integer("follower_count"),
    metricSource: text("metric_source").notNull(),
    qualityFlags: jsonb("quality_flags").notNull().default([]),
  },
);

export const itemTranscripts = pgTable("intelligence_item_transcripts", {
  itemId: text("item_id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  status: text("status").notNull().default("not_requested"),
  text: text("text"),
  source: text("source"),
  provider: text("provider"),
  model: text("model"),
  language: text("language"),
  executionTaskId: text("execution_task_id"),
  queuedAt: text("queued_at"),
  completedAt: text("completed_at"),
  errorCode: text("error_code"),
  updatedAt: text("updated_at").notNull(),
});

export const executionTasks = pgTable("execution_tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  kind: text("kind").notNull(),
  ownerType: text("owner_type").notNull(),
  ownerId: text("owner_id").notNull(),
  status: text("status").notNull().default("queued"),
  priority: integer("priority").notNull().default(0),
  idempotencyKey: text("idempotency_key").notNull(),
  payload: jsonb("payload").notNull().default({}),
  checkpoint: jsonb("checkpoint"),
  leaseOwner: text("lease_owner"),
  fenceToken: text("fence_token"),
  deadlineAt: text("deadline_at"),
  executionBudget: jsonb("execution_budget"),
  retryAt: text("retry_at"),
  retryOfCallId: text("retry_of_call_id"),
  leaseExpiresAt: text("lease_expires_at"),
  heartbeatAt: text("heartbeat_at"),
  attempt: integer("attempt").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  costEstimate: jsonb("cost_estimate"),
  lastErrorCode: text("last_error_code"),
  lastErrorMessage: text("last_error_message"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const executionCalls = pgTable("execution_calls", {
  id: text("id").primaryKey(),
  executionTaskId: text("execution_task_id").notNull().references(() => executionTasks.id),
  sequence: integer("sequence").notNull(),
  operationKey: text("operation_key").notNull(),
  retryOfCallId: text("retry_of_call_id"),
  kind: text("kind").notNull(),
  inputDigest: text("input_digest").notNull(),
  status: text("status").notNull(),
  reservedTokens: integer("reserved_tokens").notNull(),
  startedAttempt: integer("started_attempt"),
  usage: jsonb("usage"),
  resultText: text("result_text"),
  totalTokens: integer("total_tokens"),
  resultRef: text("result_ref"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => ({sequenceUnique: uniqueIndex("execution_calls_sequence_unique").on(table.executionTaskId, table.sequence)}));

export const intelligenceSyncRuns = pgTable("intelligence_sync_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  sourceId: text("source_id").notNull(),
  executionTaskId: text("execution_task_id").notNull(),
  trigger: text("trigger").notNull(),
  status: text("status").notNull().default("queued"),
  checkpoint: jsonb("checkpoint"),
  adapterEvidence: jsonb("adapter_evidence"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  scannedCount: integer("scanned_count").notNull().default(0),
  newCount: integer("new_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  errorCode: text("error_code"),
  errorSummary: text("error_summary"),
  nextAction: text("next_action").notNull().default("none"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const intelligenceSyncRunEvents = pgTable(
  "intelligence_sync_run_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    runId: text("run_id").notNull(),
    step: text("step").notNull(),
    status: text("status").notNull(),
    occurredAt: text("occurred_at").notNull(),
    itemRef: text("item_ref"),
    message: text("message").notNull(),
    safeDetails: jsonb("safe_details").notNull().default({}),
  },
);

export const itemSourceObservations = pgTable(
  "intelligence_item_source_observations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    itemId: text("item_id").notNull(),
    sourceId: text("source_id").notNull(),
    runId: text("run_id").notNull(),
    externalRef: text("external_ref").notNull(),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    discoveryContext: jsonb("discovery_context").notNull().default({}),
  },
);

export const sourceSnapshots = pgTable("intelligence_source_snapshots", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  sourceId: text("source_id").notNull(),
  runId: text("run_id").notNull(),
  itemId: text("item_id"),
  capturedAt: text("captured_at").notNull(),
  finalUrl: text("final_url").notNull(),
  title: text("title"),
  contentHash: text("content_hash").notNull(),
  safeExtract: text("safe_extract"),
  storageRef: text("storage_ref"),
  retentionUntil: text("retention_until"),
  privacyClass: text("privacy_class").notNull().default("public"),
});

export const intelligenceTransforms = pgTable("intelligence_transforms", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  itemId: text("item_id").notNull(),
  sourceSnapshotId: text("source_snapshot_id").notNull(),
  kind: text("kind").notNull().default("topic"),
  positioningVersionId: text("positioning_version_id").notNull(),
  aiTaskId: text("ai_task_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull().default("candidate"),
  outputSnapshot: jsonb("output_snapshot"),
  targetTopicId: text("target_topic_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projectIntelligenceReferences = pgTable(
  "project_intelligence_references",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    projectId: text("project_id").notNull(),
    topicId: text("topic_id").notNull(),
    itemId: text("item_id").notNull(),
    sourceSnapshotId: text("source_snapshot_id").notNull(),
    // 固定到用户确认时的拆写结果，避免后续同一作品再次生成候选后 Project
    // 悄悄读到另一版结构。
    transformId: text("transform_id").notNull(),
    // 固定到 Project 创建时的逐字稿内容；脚本生成读取时会重新计算并校验，
    // 转写若被替换必须重新建立引用，不能静默漂移。
    transcriptHash: text("transcript_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
);

export const intelligenceMigrationLedgers = pgTable(
  "intelligence_migration_ledgers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    inventoryHash: text("inventory_hash").notNull(),
    stage: text("stage").notNull().default("inventory"),
    checkpoint: jsonb("checkpoint"),
    counts: jsonb("counts").notNull().default({}),
    orphanReport: jsonb("orphan_report"),
    writeFenceEnabled: boolean("write_fence_enabled").notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);
