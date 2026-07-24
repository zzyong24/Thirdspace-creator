import { createHash, randomUUID } from "node:crypto";

import {
  and,
  asc,
  benchmarkSources,
  benchmarkWorks,
  desc,
  eq,
  favoritesFolders,
  favoritesItems,
  inArray,
  intelligenceCollections,
  intelligenceItems,
  intelligenceMigrationLedgers,
  intelligenceSources,
  intelligenceSourceCollectionMemberships,
  intelligenceSyncRunEvents,
  intelligenceSyncRuns,
  intelligenceTransforms,
  itemMetricSnapshots,
  itemSourceObservations,
  itemTranscripts,
  isNull,
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
type MigrationLedgerRow = typeof intelligenceMigrationLedgers.$inferSelect;

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
      canonicalUrl: string;
      externalAccountId: string;
      browserSessionRef: string;
    }
  | {
      type: "favorites_folder";
      folderId: string;
      browserSessionRef: string;
    }
  | {
      type: "web" | "rss";
      url: string;
      browserSessionRef?: string | null;
    }
  | {
      type: "darkhorse_query";
      keyword: string;
      board: "low_follower_breakout";
      browserSessionRef: string;
    };

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

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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

function toSource(row: SourceRow): IntelligenceSourceResource {
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
    browserSessionRef: row.browserSessionRef,
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

function toTransform(row: TransformRow) {
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
        externalKey: config.externalAccountId,
        canonicalUrl: canonicalUrl(config.canonicalUrl),
        browserSessionRef: config.browserSessionRef,
        defaultName: config.externalAccountId,
      };
    case "favorites_folder":
      return {
        platform: "douyin",
        externalKey: config.folderId,
        canonicalUrl: null,
        browserSessionRef: config.browserSessionRef,
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
        externalKey: `${config.board}:${keyword}`,
        canonicalUrl: null,
        browserSessionRef: config.browserSessionRef,
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
  return errorCode ? "retry" : "none";
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
          canonicalUrl: homeUrl,
          externalAccountId: old.externalAccountId,
          browserSessionRef: `douyin-profile:${accountId}`,
        },
        monitorEnabled: old.enabled,
        collectionId: historyCollection.id,
      });
      sourceByLegacyId.set(old.id, source);
    }

    for (const old of oldTrendSources) {
      const type: "web" | "rss" =
        old.sourceType === "rss" ? "rss" : "web";
      const normalizedUrl = canonicalUrl(old.url);
      const source = await ensureLegacySource({
        legacyKey: `trend:${old.id}`,
        type,
        platform: "web",
        displayName: old.name || old.domain || normalizedUrl,
        canonicalUrl: normalizedUrl,
        externalKey: hash(normalizedUrl),
        browserSessionRef:
          type === "web" ? `web-domain:${old.domain}` : null,
        adapterConfig:
          type === "web"
            ? {
                type: "web",
                url: normalizedUrl,
                browserSessionRef: `web-domain:${old.domain}`,
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
          folderId: folderKey,
          browserSessionRef: `douyin-profile:${accountId}`,
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
            keyword,
            board: "low_follower_breakout",
            browserSessionRef: `douyin-profile:${accountId}`,
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
        orphanSamples.length,
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

  async function startRun(
    ctx: RequestContext,
    sourceId: string,
    input: {
      trigger: "manual" | "schedule" | "initial" | "retry";
      idempotencyKey: string;
    },
  ): Promise<{ run: ReturnType<typeof toRun>; task: ExecutionTaskResourceV2 }> {
    const source = await requireSource(ctx, sourceId);
    if (source.status !== "active") {
      throw new IntelligenceConflictError(
        `来源当前为 ${source.status}，不能开始同步`,
      );
    }
    const active = await db
      .select()
      .from(intelligenceSyncRuns)
      .where(
        and(
          eq(intelligenceSyncRuns.sourceId, sourceId),
          inArray(intelligenceSyncRuns.status, ["queued", "running"]),
        ),
      )
      .limit(1);
    if (active[0] && input.trigger !== "initial") {
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
      .returning();
    if (!run) throw new Error("failed to create intelligence run");
    return { run: toRun(run), task };
  }

  const service = {
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
      const [collections, sources, memberships, taskRows, runs] =
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
      const latestBySource = new Map<string, RunRow>();
      for (const run of runs) {
        if (!latestBySource.has(run.sourceId)) latestBySource.set(run.sourceId, run);
      }
      return {
        collections: collections.map(toCollection),
        sources: sources.map(toSource),
        memberships: memberships.map(toSourceMembership),
        health: sources.map((source) => {
          const latest = latestBySource.get(source.id);
          return {
            sourceId: source.id,
            lastRunStatus:
              latest &&
              !["queued", "running"].includes(latest.status)
                ? (latest.status as AdapterStatus)
                : null,
            blockedCount: runs.filter(
              (run) => run.sourceId === source.id && run.status === "blocked",
            ).length,
            lastErrorCode: (latest?.errorCode ?? null) as never,
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
            nextRunAt: null,
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
        source: toSource(source),
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
        rows: rows.slice(offset, offset + limit).map(toSource),
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
      const [updated] = await db
        .update(intelligenceSources)
        .set({
          collectionId:
            input.collectionId === undefined
              ? current.collectionId
              : input.collectionId,
          displayName: input.displayName?.trim() || current.displayName,
          monitorEnabled: input.monitorEnabled ?? current.monitorEnabled,
          syncPolicy: input.syncPolicy ?? current.syncPolicy,
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
      return toSource(updated);
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
      if (input.mode === "permanent" && !input.confirmToken) {
        throw new IntelligenceValidationError("永久删除需要确认令牌");
      }
      const observations = await db
        .select()
        .from(itemSourceObservations)
        .where(eq(itemSourceObservations.sourceId, sourceId));
      const snapshots = await db
        .select()
        .from(sourceSnapshots)
        .where(eq(sourceSnapshots.sourceId, sourceId));
      // 即使选择 permanent，也先进入 archived 并保留不可变来源证据；真正物理清理
      // 由带恢复窗的迁移/retention 作业执行，避免误删已被选题或 Project 引用的证据。
      const status = input.mode === "pause" ? "paused" : "archived";
      await db
        .update(intelligenceSources)
        .set({
          status,
          monitorEnabled: false,
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
      return {
        source: toSource(source),
        config: source.adapterConfig as SourceConfig,
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
      await db
        .update(itemTranscripts)
        .set({
          status: input.status,
          text: input.status === "done" ? (input.text ?? null) : null,
          source: "manual",
          provider: input.provider ?? null,
          model: input.model ?? null,
          language: input.language ?? null,
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
      const run = await requireRun(ctx, runId);
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
          | "engagement_desc";
        transcriptStatus?: string;
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
      if (query.transcriptStatus) {
        const allowedItems = new Set(
          transcripts
            .filter((row) => row.status === query.transcriptStatus)
            .map((row) => row.itemId),
        );
        rows = rows.filter((item) => allowedItems.has(item.id));
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
      const score = (item: ItemRow) => {
        const metric = latestMetric.get(item.id);
        if (query.sort === "engagement_desc") {
          return (
            (metric?.likeCount ?? 0) +
            (metric?.commentCount ?? 0) +
            (metric?.collectCount ?? 0) +
            (metric?.shareCount ?? 0)
          );
        }
        return Date.parse(
          query.sort === "published_desc"
            ? (item.publishedAt ?? item.capturedAt)
            : item.capturedAt,
        );
      };
      rows.sort((left, right) => score(right) - score(left));
      const offset = Math.max(0, query.offset ?? 0);
      const limit = Math.max(1, query.limit ?? 20);
      return {
        rows: rows.slice(offset, offset + limit).map((item) => ({
          item: toItem(item),
          latestMetric: latestMetric.has(item.id)
            ? toMetric(latestMetric.get(item.id)!)
            : null,
          sourceCount: Math.max(1, sourceCount.get(item.id) ?? 1),
        })),
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
          .orderBy(desc(sourceSnapshots.capturedAt)),
        db
          .select()
          .from(intelligenceTransforms)
          .where(eq(intelligenceTransforms.itemId, itemId))
          .orderBy(desc(intelligenceTransforms.createdAt)),
      ]);
      return {
        item: toItem(item),
        metrics: metrics.map(toMetric),
        observations: observations.map(toObservation),
        snapshots: snapshots.map(toSnapshot),
        transcript: toTranscript(transcript),
        transforms: transforms.map(toTransform),
      };
    },

    /**
     * 分享文本先落持久任务，HTTP 立即返回。真正的短链解析和 CDP 读取由 host worker
     * 完成；payload 只保存用户输入和目标分类，不会触发逐字稿。
     */
    async enqueueDouyinShareImport(
      ctx: RequestContext,
      input: {
        collectionId: string | null;
        shareInput: string;
        idempotencyKey: string;
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
        },
        priority: 20,
      });
      return { task };
    },

    /**
     * 单条抖音分享链接建档。host 只负责在登录态中解析真实作品元数据；所有领域写入
     * 仍经本 service：按作者复用/创建博主来源，再复用标准 adapter batch 做作品、
     * 指标、observation 与来源快照的幂等落库。此路径绝不创建逐字稿任务。
     */
    async importDouyinSharedItem(
      ctx: RequestContext,
      input: {
        taskId: string;
        lease: { workerId: string; attempt: number };
        collectionId: string | null;
        item: IntelligenceAdapterItem;
        browserSessionRef: string;
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
            eq(intelligenceSources.externalKey, input.item.authorId),
          ),
        )
        .limit(1);
      const profileUrl = `https://www.douyin.com/user/${encodeURIComponent(input.item.authorId)}`;
      const sourceResult = await service.createSource(ctx, {
        collectionId: input.collectionId,
        type: "creator_profile",
        config: {
          type: "creator_profile",
          canonicalUrl: profileUrl,
          externalAccountId: input.item.authorId,
          browserSessionRef: input.browserSessionRef,
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
        source: toSource(source),
        item: toItem(item),
        snapshot: toSnapshot(snapshot),
        createdSource: !sourceBefore,
        createdItem: !before,
        deduplicated: Boolean(before),
        transcriptStatus: transcript.status,
        transcriptQueued: false as const,
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
      const accountId = await account(ctx, "intelligence.transform.preview");
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
      return {
        transformId: transform.id,
        item: toItem(item),
        snapshot: toSnapshot(snapshot),
        positioning,
        transcript: {
          text: transcriptText,
          hash: `sha256:${hash(transcriptText)}`,
          completedAt: transcript.completedAt,
          provider: transcript.provider,
          model: transcript.model,
        },
      };
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
        sourceUrl: string;
        transcriptHash: string;
      },
    ) {
      const transform = await requireTransform(ctx, transformId);
      for (const [key, value] of Object.entries({
        hook: output.hook,
        reusablePattern: output.reusablePattern,
        title: output.title,
        angle: output.angle,
        differentiation: output.differentiation,
        sourceSummary: output.sourceSummary,
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
      const [updated] = await db
        .update(intelligenceTransforms)
        .set({
          outputSnapshot: {
            ...output,
            decompositionVersion: "v1",
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
      };
      for (const [key, value] of Object.entries(candidate)) {
        if (!value.trim()) {
          throw new IntelligenceValidationError(`${key} 不能为空`);
        }
      }
      const sourceItem = await requireItem(ctx, transform.itemId);
      const topic = await deps.topics.create(ctx, {
        title: candidate.title,
        angle: `${candidate.angle}\n差异化：${candidate.differentiation}\n来源：${candidate.sourceSummary}`,
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
          ["queued", "running", "done"].includes(transcript.status)
        ) {
          skipped.push({
            itemId,
            reason:
              transcript.status === "done"
                ? "TRANSCRIPT_ALREADY_DONE"
                : "TRANSCRIPT_ALREADY_QUEUED",
          });
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
