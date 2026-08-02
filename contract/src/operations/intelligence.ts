import { z } from "zod";

import { defineEndpoint } from "../endpoints";
import { id, paginationQuery } from "../primitives";
import {
  adapterErrorCode,
  executionTaskResourceV2,
  intelligenceCollectionResource,
  intelligenceCollectorResource,
  intelligenceItemResource,
  intelligenceProgressState,
  intelligenceRunStatus,
  intelligenceSourceConfig,
  intelligenceSourceMembershipResource,
  intelligenceSourceResource,
  intelligenceSourceStatus,
  intelligenceSourceType,
  intelligenceTopicState,
  intelligenceTranscriptState,
  intelligenceTranscriptStatus,
  intelligenceTransformResource,
  itemMetricSnapshotResource,
  itemSourceObservationResource,
  itemTranscriptResource,
  projectIntelligenceReferenceResource,
  sourceSnapshotResource,
  syncRunEventResource,
  syncRunResource,
} from "../resources/intelligence";

const accountQuery = z.object({ accountId: id });
const collectionParams = z.object({ collectionId: id });
const sourceParams = z.object({ sourceId: id });
const runParams = z.object({ runId: id });
const itemParams = z.object({ itemId: id });
const transformParams = z.object({ transformId: id });
const migrationParams = z.object({ migrationId: id });
const projectParams = z.object({ projectId: id });

const favoriteFolderPreview = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    itemCount: z.number().int().nonnegative().nullable(),
  })
  .strict();

const sourceHealth = z
  .object({
    sourceId: id,
    lastRunId: id.nullable(),
    lastRunStatus: intelligenceRunStatus.nullable(),
    blockedCount: z.number().int().nonnegative(),
    lastErrorCode: adapterErrorCode.nullable(),
    scannedCount: z.number().int().nonnegative(),
    newCount: z.number().int().nonnegative(),
    updatedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
  })
  .strict();

const topicCandidate = z
  .object({
    title: z.string().min(1),
    angle: z.string().min(1),
    differentiation: z.string().min(1),
    sourceSummary: z.string().min(1),
    targetAudience: z.string().min(1),
    audiencePain: z.string().min(1),
    coreConflict: z.string().min(1),
    format: z.string().min(1),
    adaptationStrategy: z
      .object({
        keep: z.array(z.string().min(1)).max(8),
        replace: z.array(z.string().min(1)).max(8),
        add: z.array(z.string().min(1)).max(8),
        avoid: z.array(z.string().min(1)).max(8),
      })
      .strict(),
  })
  .strict();

const migrationStage = z.enum([
  "inventory",
  "backed_up",
  "migrated",
  "validated",
  "write_fenced",
  "consumers_switched",
  "observing",
  "retired",
  "rolled_back",
]);

export const intelligenceOperations = {
  getIntelligenceWorkspace: defineEndpoint({
    id: "intelligence.workspace.get",
    method: "GET",
    path: "/intelligence/workspace",
    query: accountQuery,
    response: z
      .object({
        collections: z.array(intelligenceCollectionResource),
        sources: z.array(intelligenceSourceResource),
        memberships: z.array(intelligenceSourceMembershipResource),
        health: z.array(sourceHealth),
        pendingCount: z.number().int().nonnegative(),
        blockedCount: z.number().int().nonnegative(),
      })
      .strict(),
    fr: ["FR-CR-001", "FR-CR-002", "FR-CR-014"],
  }),
  createIntelligenceCollection: defineEndpoint({
    id: "intelligence.collections.create",
    method: "POST",
    path: "/intelligence/collections",
    body: z
      .object({
        accountId: id,
        parentId: id.nullable().optional(),
        name: z.string().min(1),
        idempotencyKey: z.string().min(1),
      })
      .strict(),
    response: intelligenceCollectionResource,
    fr: ["FR-CR-002"],
  }),
  updateIntelligenceCollection: defineEndpoint({
    id: "intelligence.collections.update",
    method: "PATCH",
    path: "/intelligence/collections/:collectionId",
    params: collectionParams,
    body: z
      .object({
        name: z.string().min(1).optional(),
        parentId: id.nullable().optional(),
        sortOrder: z.number().int().optional(),
        archived: z.boolean().optional(),
        expectedVersion: z.number().int().positive(),
      })
      .strict(),
    response: intelligenceCollectionResource,
    fr: ["FR-CR-002"],
  }),
  deleteIntelligenceCollection: defineEndpoint({
    id: "intelligence.collections.delete",
    method: "DELETE",
    path: "/intelligence/collections/:collectionId",
    params: collectionParams,
    body: z
      .object({
        mode: z.enum(["unlink", "permanent"]),
        confirmToken: z.string().min(1).optional(),
      })
      .strict(),
    response: z
      .object({
        unlinked: z.number().int().nonnegative(),
        deleted: z.number().int().nonnegative(),
        preserved: z.number().int().nonnegative(),
      })
      .strict(),
    fr: ["FR-CR-002", "FR-CR-017"],
  }),
  listIntelligenceCollectors: defineEndpoint({
    id: "intelligence.collectors.list",
    method: "GET",
    path: "/intelligence/collectors",
    query: accountQuery,
    response: intelligenceCollectorResource
      .pick({
        accountId: true,
        accountHandle: true,
        platform: true,
      })
      .extend({
        accountHandle: z.string().min(1),
        platform: z.literal("douyin"),
      })
      .strict(),
    isList: true,
    fr: ["FR-537-01"],
  }),
  previewIntelligenceProfile: defineEndpoint({
    id: "intelligence.sources.previewProfile",
    method: "POST",
    path: "/intelligence/sources/preview-profile",
    body: z
      .object({
        accountId: id,
        collectorAccountId: id,
        url: z.string().url(),
      })
      .strict(),
    response: z
      .object({
        platform: z.literal("douyin"),
        externalAccountId: z.string().min(1),
        nickname: z.string().min(1),
        avatarUrl: z.string().url().nullable(),
        canonicalUrl: z.string().url(),
        visibleWorkCount: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    fr: ["FR-CR-003"],
  }),
  previewIntelligenceWeb: defineEndpoint({
    id: "intelligence.sources.previewWeb",
    method: "POST",
    path: "/intelligence/sources/preview-web",
    body: z
      .object({
        accountId: id,
        url: z.string().url(),
        instruction: z.string(),
        browserSessionRef: z.string().min(1).optional(),
      })
      .strict(),
    response: z
      .object({
        type: z.enum(["web", "rss"]),
        title: z.string().nullable(),
        finalUrl: z.string().url(),
        samples: z.array(
          z.object({
            title: z.string(),
            url: z.string().url(),
            summary: z.string().nullable(),
          }),
        ),
        loginRequired: z.boolean(),
        parser: z.string().min(1),
        browserSessionRef: z.string().nullable(),
      })
      .strict(),
    fr: ["FR-CR-009"],
  }),
  listIntelligenceFavoriteFolders: defineEndpoint({
    id: "intelligence.sources.listFavoriteFolders",
    method: "GET",
    path: "/intelligence/sources/favorite-folders",
    query: z
      .object({ accountId: id, collectorAccountId: id })
      .strict(),
    response: favoriteFolderPreview,
    isList: true,
    fr: ["FR-CR-008"],
  }),
  createIntelligenceSource: defineEndpoint({
    id: "intelligence.sources.create",
    method: "POST",
    path: "/intelligence/sources",
    body: z
      .object({
        accountId: id,
        collectionId: id.nullable(),
        type: intelligenceSourceType,
        config: intelligenceSourceConfig,
        displayName: z.string().min(1).optional(),
        extractionInstruction: z.string().optional(),
        monitorEnabled: z.boolean(),
        runInitial: z.boolean(),
        idempotencyKey: z.string().min(1),
      })
      .strict(),
    response: z
      .object({
        source: intelligenceSourceResource,
        run: syncRunResource.nullable(),
        task: executionTaskResourceV2.nullable(),
      })
      .strict(),
    fr: ["FR-CR-003", "FR-CR-008", "FR-CR-009", "FR-CR-010", "FR-CR-015"],
  }),
  listIntelligenceSources: defineEndpoint({
    id: "intelligence.sources.list",
    method: "GET",
    path: "/intelligence/sources",
    query: paginationQuery.extend({
      accountId: id,
      collectionId: id.optional(),
      type: intelligenceSourceType.optional(),
      status: intelligenceSourceStatus.optional(),
      cursor: z.string().optional(),
    }),
    response: intelligenceSourceResource,
    isList: true,
    fr: ["FR-CR-002", "FR-CR-014"],
  }),
  updateIntelligenceSource: defineEndpoint({
    id: "intelligence.sources.update",
    method: "PATCH",
    path: "/intelligence/sources/:sourceId",
    params: sourceParams,
    body: z
      .object({
        collectionId: id.nullable().optional(),
        displayName: z.string().min(1).optional(),
        monitorEnabled: z.boolean().optional(),
        syncPolicy: z.record(z.string(), z.unknown()).optional(),
        instruction: z.string().nullable().optional(),
        expectedVersion: z.number().int().positive(),
      })
      .strict(),
    response: intelligenceSourceResource,
    fr: ["FR-CR-002", "FR-CR-015", "FR-CR-017"],
  }),
  deleteIntelligenceSource: defineEndpoint({
    id: "intelligence.sources.delete",
    method: "DELETE",
    path: "/intelligence/sources/:sourceId",
    params: sourceParams,
    body: z
      .object({
        mode: z.enum(["pause", "archive", "permanent"]),
        confirmToken: z.string().min(1).optional(),
      })
      .strict(),
    response: z
      .object({
        affectedItems: z.number().int().nonnegative(),
        preservedSnapshots: z.number().int().nonnegative(),
        status: intelligenceSourceStatus,
      })
      .strict(),
    fr: ["FR-CR-017"],
  }),
  startIntelligenceRun: defineEndpoint({
    id: "intelligence.runs.start",
    method: "POST",
    path: "/intelligence/sources/:sourceId/runs",
    params: sourceParams,
    body: z
      .object({
        trigger: z.enum(["manual", "initial", "retry"]),
        idempotencyKey: z.string().min(1),
      })
      .strict(),
    response: z
      .object({
        run: syncRunResource,
        task: executionTaskResourceV2,
      })
      .strict(),
    fr: ["FR-CR-004", "FR-CR-014", "FR-CR-020"],
  }),
  listIntelligenceRuns: defineEndpoint({
    id: "intelligence.runs.list",
    method: "GET",
    path: "/intelligence/sources/:sourceId/runs",
    params: sourceParams,
    query: paginationQuery.extend({
      cursor: z.string().optional(),
      status: intelligenceRunStatus.optional(),
    }),
    response: syncRunResource,
    isList: true,
    fr: ["FR-CR-014"],
  }),
  getIntelligenceRun: defineEndpoint({
    id: "intelligence.runs.get",
    method: "GET",
    path: "/intelligence/runs/:runId",
    params: runParams,
    response: z
      .object({
        run: syncRunResource,
        events: z.array(syncRunEventResource),
      })
      .strict(),
    fr: ["FR-CR-014"],
  }),
  listIntelligenceItems: defineEndpoint({
    id: "intelligence.items.list",
    method: "GET",
    path: "/intelligence/items",
    query: paginationQuery.extend({
      accountId: id,
      collectionId: id.optional(),
      sourceId: id.optional(),
      query: z.string().optional(),
      sort: z.enum([
        "newest",
        "growth_desc",
        "published_desc",
        "engagement_desc",
        "collect_desc",
        "like_desc",
      ]),
      cursor: z.string().optional(),
      transcriptStatus: intelligenceTranscriptStatus.optional(),
      transcriptState: intelligenceTranscriptState.optional(),
      topicState: intelligenceTopicState.optional(),
    }),
    response: z
      .object({
        item: intelligenceItemResource,
        latestMetric: itemMetricSnapshotResource.nullable(),
        sourceCount: z.number().int().positive(),
        transcriptState: intelligenceTranscriptState,
        topicState: intelligenceTopicState,
        progressState: intelligenceProgressState,
      })
      .strict(),
    isList: true,
    fr: ["FR-CR-005", "FR-CR-011", "FR-CR-019", "FR-CR-023"],
  }),
  getIntelligenceItem: defineEndpoint({
    id: "intelligence.items.get",
    method: "GET",
    path: "/intelligence/items/:itemId",
    params: itemParams,
    response: z
      .object({
        item: intelligenceItemResource,
        metrics: z.array(itemMetricSnapshotResource),
        observations: z.array(itemSourceObservationResource),
        snapshots: z.array(sourceSnapshotResource),
        transcript: itemTranscriptResource,
        transforms: z.array(intelligenceTransformResource),
      })
      .strict(),
    fr: ["FR-CR-005", "FR-CR-006", "FR-CR-011"],
  }),
  importDouyinShareItem: defineEndpoint({
    id: "intelligence.items.importDouyinShare",
    method: "POST",
    path: "/intelligence/items/import-douyin-share",
    body: z
      .object({
        accountId: id,
        collectionId: id.nullable(),
        shareInput: z.string().trim().min(1).max(2_000),
        idempotencyKey: z.string().min(1),
      })
      .strict(),
    response: z.object({ task: executionTaskResourceV2 }).strict(),
    fr: ["FR-CR-021"],
  }),
  enqueueIntelligenceTranscripts: defineEndpoint({
    id: "intelligence.transcripts.enqueue",
    method: "POST",
    path: "/intelligence/transcripts/enqueue",
    body: z
      .object({
        itemIds: z.array(id).min(1),
        idempotencyKey: z.string().min(1),
      })
      .strict(),
    response: z
      .object({
        tasks: z.array(executionTaskResourceV2),
        skipped: z.array(
          z.object({ itemId: id, reason: z.string().min(1) }).strict(),
        ),
      })
      .strict(),
    fr: ["FR-CR-007", "FR-CR-020"],
  }),
  uploadManualIntelligenceTranscript: defineEndpoint({
    id: "intelligence.transcripts.uploadManual",
    method: "POST",
    path: "/intelligence/transcripts/upload-manual",
    body: z.discriminatedUnion("inputMode", [
      z
        .object({
          itemId: id,
          inputMode: z.literal("paste"),
          text: z.string().min(1).max(500_000),
        })
        .strict(),
      z
        .object({
          itemId: id,
          inputMode: z.literal("file"),
          format: z.enum(["txt", "md", "srt", "vtt"]),
          fileName: z.string().trim().min(1).max(255),
          text: z.string().min(1).max(500_000),
        })
        .strict(),
    ]),
    response: z.object({ transcript: itemTranscriptResource }).strict(),
    fr: ["FR-CR-022"],
  }),
  previewIntelligenceTopic: defineEndpoint({
    id: "intelligence.transforms.previewTopic",
    method: "POST",
    path: "/intelligence/transforms/topic-preview",
    body: z
      .object({
        itemId: id,
        sourceSnapshotId: id,
        positioningVersionId: id,
        idempotencyKey: z.string().min(1),
      })
      .strict(),
    response: z
      .object({
        transform: intelligenceTransformResource,
        task: executionTaskResourceV2,
      })
      .strict(),
    fr: ["FR-CR-012"],
  }),
  confirmIntelligenceTopic: defineEndpoint({
    id: "intelligence.transforms.confirmTopic",
    method: "POST",
    path: "/intelligence/transforms/:transformId/confirm-topic",
    params: transformParams,
    body: z
      .object({
        editedCandidate: topicCandidate,
        idempotencyKey: z.string().min(1),
      })
      .strict(),
    response: z
      .object({
        transform: intelligenceTransformResource,
        topicId: id,
        provenance: z
          .object({
            itemId: id,
            sourceSnapshotId: id,
            positioningVersionId: id,
          })
          .strict(),
      })
      .strict(),
    fr: ["FR-CR-012"],
  }),
  attachProjectIntelligence: defineEndpoint({
    id: "projects.intelligence.attach",
    method: "POST",
    path: "/projects/:projectId/intelligence",
    params: projectParams,
    body: z
      .object({
        topicId: id,
        itemId: id,
        sourceSnapshotId: id,
        idempotencyKey: z.string().min(1),
      })
      .strict(),
    response: projectIntelligenceReferenceResource,
    fr: ["FR-CR-013"],
  }),
  getProjectIntelligence: defineEndpoint({
    id: "projects.intelligence.list",
    method: "GET",
    path: "/projects/:projectId/intelligence",
    params: projectParams,
    response: z
      .object({
        reference: projectIntelligenceReferenceResource,
        item: z
          .object({
            title: z.string(),
            canonicalUrl: z.string().url(),
            authorName: z.string().nullable(),
          })
          .strict(),
        transcript: z
          .object({
            text: z.string().min(1),
            hash: z.string().min(1),
          })
          .strict(),
        // 已确认的本账号改写初稿：Project 读侧可直接恢复双栏，
        // 不需要再去猜 Candidate/Brief 中间态是否丢失。
        adaptedDraft: z.string().min(1).nullable(),
      })
      .strict(),
    isList: true,
    fr: ["FR-CR-013"],
  }),
  generateProjectScriptCandidate: defineEndpoint({
    id: "projects.scripts.generateCandidate",
    method: "POST",
    path: "/projects/:projectId/scripts/candidates",
    params: projectParams,
    body: z
      .object({
        referenceIds: z.array(id).min(1),
        strategy: z.string().min(1),
        idempotencyKey: z.string().min(1),
      })
      .strict(),
    response: executionTaskResourceV2,
    fr: ["FR-CR-013", "FR-CR-020"],
  }),
  acceptProjectScriptCandidate: defineEndpoint({
    id: "projects.scripts.acceptCandidate",
    method: "POST",
    path: "/projects/:projectId/scripts/candidates/:taskId/accept",
    params: z.object({ projectId: id, taskId: id }),
    body: z
      .object({
        editedText: z.string().min(1).optional(),
        idempotencyKey: z.string().min(1),
      })
      .strict(),
    response: z
      .object({
        artifactVersionId: id,
        similarityRisk: z.enum(["low", "medium"]),
        referenceIds: z.array(id),
      })
      .strict(),
    fr: ["FR-CR-013"],
  }),
  inventoryIntelligenceMigration: defineEndpoint({
    id: "intelligence.migrations.inventory",
    method: "GET",
    path: "/intelligence/migrations/inventory",
    query: accountQuery,
    response: z
      .object({
        inventoryHash: z.string().min(1),
        counts: z.record(z.string(), z.number().int().nonnegative()),
        writers: z.array(z.string()),
        readers: z.array(z.string()),
        risks: z.array(z.string()),
      })
      .strict(),
    fr: ["FR-CR-016"],
  }),
  startIntelligenceMigration: defineEndpoint({
    id: "intelligence.migrations.start",
    method: "POST",
    path: "/intelligence/migrations",
    body: z
      .object({
        accountId: id,
        inventoryHash: z.string().min(1),
        idempotencyKey: z.string().min(1),
      })
      .strict(),
    response: z
      .object({
        migrationId: id,
        task: executionTaskResourceV2,
      })
      .strict(),
    fr: ["FR-CR-016"],
  }),
  getIntelligenceMigrationReport: defineEndpoint({
    id: "intelligence.migrations.report",
    method: "GET",
    path: "/intelligence/migrations/:migrationId",
    params: migrationParams,
    response: z
      .object({
        migrationId: id,
        stage: migrationStage,
        counts: z.record(z.string(), z.number().int().nonnegative()),
        orphanCount: z.number().int().nonnegative(),
        duplicateCount: z.number().int().nonnegative(),
        writeFenceEnabled: z.boolean(),
        sampleErrors: z.array(z.string()),
      })
      .strict(),
    fr: ["FR-CR-016"],
  }),
  rollbackIntelligenceMigration: defineEndpoint({
    id: "intelligence.migrations.rollback",
    method: "POST",
    path: "/intelligence/migrations/:migrationId/rollback",
    params: migrationParams,
    body: z
      .object({
        confirmToken: z.string().min(1),
        idempotencyKey: z.string().min(1),
      })
      .strict(),
    response: z
      .object({
        preservationReportId: id,
        task: executionTaskResourceV2,
      })
      .strict(),
    fr: ["FR-CR-016"],
  }),
  openBrowserSessionLogin: defineEndpoint({
    id: "browserSessions.openLogin",
    method: "POST",
    path: "/browser-sessions/open-login",
    body: z
      .object({
        accountId: id,
        site: z.string().min(1),
        returnTo: z.string().min(1),
      })
      .strict(),
    response: z
      .object({
        browserSessionRef: z.string().min(1),
        status: z.enum(["opened", "ready", "failed"]),
      })
      .strict(),
    fr: ["FR-CR-009", "FR-CR-010"],
  }),
  clearBrowserSession: defineEndpoint({
    id: "browserSessions.clear",
    method: "POST",
    path: "/browser-sessions/clear",
    body: z
      .object({
        browserSessionRef: z.string().min(1),
        confirmToken: z.string().min(1),
      })
      .strict(),
    response: z
      .object({
        cleared: z.boolean(),
        blockedSources: z.array(id),
      })
      .strict(),
    fr: ["FR-CR-009", "FR-CR-010"],
  }),
} as const;
