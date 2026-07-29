import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  OwnershipError,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type { IntelligenceService } from "./intelligence.service";
import type { ProjectIntelligenceReferenceService } from "./project-reference.service";
import type { ProjectScriptCandidateService } from "./project-script-candidate.service";

export const INTELLIGENCE_OP_IDS = [
  "intelligence.workspace.get",
  "intelligence.collectors.list",
  "intelligence.collections.create",
  "intelligence.collections.update",
  "intelligence.collections.delete",
  "intelligence.sources.previewProfile",
  "intelligence.sources.previewWeb",
  "intelligence.sources.listFavoriteFolders",
  "intelligence.sources.create",
  "intelligence.sources.list",
  "intelligence.sources.update",
  "intelligence.sources.delete",
  "intelligence.runs.start",
  "intelligence.runs.list",
  "intelligence.runs.get",
  "intelligence.items.list",
  "intelligence.items.get",
  "intelligence.items.importDouyinShare",
  "intelligence.transcripts.enqueue",
  "intelligence.transcripts.uploadManual",
  "intelligence.transforms.previewTopic",
  "intelligence.transforms.confirmTopic",
  "intelligence.migrations.inventory",
  "intelligence.migrations.start",
  "intelligence.migrations.report",
  "intelligence.migrations.rollback",
  "projects.intelligence.attach",
  "projects.scripts.generateCandidate",
  "projects.scripts.acceptCandidate",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

function assertAccount(ctx: RequestContext, requested: unknown): void {
  if (
    typeof requested === "string" &&
    requested.length > 0 &&
    requested !== ctx.accountId
  ) {
    throw new OwnershipError("Intelligence resource not found");
  }
}

export function createIntelligenceTransport(
  serviceFactory: () => IntelligenceService,
  projectReferencesFactory?: () => ProjectIntelligenceReferenceService,
  projectScriptsFactory?: () => ProjectScriptCandidateService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, rawCtx) {
      if (!rawCtx) throw new AuthenticationError();
      const ctx = rawCtx as RequestContext;
      const service = serviceFactory();
      const requestId = ctx.requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as {
        collectionId?: string;
        sourceId?: string;
        runId?: string;
        itemId?: string;
        transformId?: string;
        migrationId?: string;
        projectId?: string;
        taskId?: string;
      };

      switch (endpoint.id) {
        case "intelligence.workspace.get": {
          const q = (query ?? {}) as { accountId?: string };
          assertAccount(ctx, q.accountId);
          return {
            data: await service.getWorkspace(ctx),
            meta: { requestId },
          };
        }
        case "intelligence.collectors.list": {
          const q = (query ?? {}) as { accountId?: string };
          assertAccount(ctx, q.accountId);
          const rows = await service.listCollectorAccounts(ctx);
          return {
            data: rows,
            meta: {
              requestId,
              page: 1,
              pageSize: Math.max(1, rows.length),
              total: rows.length,
            },
          };
        }
        case "intelligence.collections.create": {
          const b = (body ?? {}) as {
            accountId?: string;
            parentId?: string | null;
            name?: string;
            idempotencyKey?: string;
          };
          assertAccount(ctx, b.accountId);
          const row = await service.createCollection(ctx, {
            parentId: b.parentId ?? null,
            name: b.name ?? "",
            idempotencyKey: b.idempotencyKey ?? "",
          });
          return { data: row, meta: { requestId } };
        }
        case "intelligence.collections.update": {
          const b = (body ?? {}) as {
            name?: string;
            parentId?: string | null;
            sortOrder?: number;
            archived?: boolean;
            expectedVersion?: number;
          };
          const row = await service.updateCollection(
            ctx,
            p.collectionId ?? "",
            {
              ...(b.name !== undefined ? { name: b.name } : {}),
              ...(b.parentId !== undefined ? { parentId: b.parentId } : {}),
              ...(b.sortOrder !== undefined ? { sortOrder: b.sortOrder } : {}),
              ...(b.archived !== undefined ? { archived: b.archived } : {}),
              expectedVersion: b.expectedVersion ?? 0,
            },
          );
          return { data: row, meta: { requestId } };
        }
        case "intelligence.collections.delete": {
          const b = (body ?? {}) as {
            mode?: "unlink" | "permanent";
            confirmToken?: string;
          };
          const result = await service.deleteCollection(
            ctx,
            p.collectionId ?? "",
            {
              mode: b.mode ?? "unlink",
              ...(b.confirmToken ? { confirmToken: b.confirmToken } : {}),
            },
          );
          return { data: result, meta: { requestId } };
        }
        case "intelligence.sources.create": {
          const b = (body ?? {}) as {
            accountId?: string;
            collectionId?: string | null;
            type?: Parameters<IntelligenceService["createSource"]>[1]["type"];
            config?: Parameters<IntelligenceService["createSource"]>[1]["config"];
            displayName?: string;
            extractionInstruction?: string;
            monitorEnabled?: boolean;
            runInitial?: boolean;
            idempotencyKey?: string;
          };
          assertAccount(ctx, b.accountId);
          if (!b.type || !b.config) {
            throw new UnsupportedOperationError(
              "intelligence.sources.create.invalid",
            );
          }
          const result = await service.createSource(ctx, {
            collectionId: b.collectionId ?? null,
            type: b.type,
            config: b.config,
            ...(b.displayName ? { displayName: b.displayName } : {}),
            ...(b.extractionInstruction !== undefined
              ? { extractionInstruction: b.extractionInstruction }
              : {}),
            monitorEnabled: b.monitorEnabled ?? false,
            runInitial: b.runInitial ?? false,
            idempotencyKey: b.idempotencyKey ?? "",
          });
          return { data: result, meta: { requestId } };
        }
        case "intelligence.sources.list": {
          const q = (query ?? {}) as {
            accountId?: string;
            collectionId?: string;
            type?: NonNullable<
              Parameters<IntelligenceService["listSources"]>[1]
            >["type"];
            status?: NonNullable<
              Parameters<IntelligenceService["listSources"]>[1]
            >["status"];
            page?: number;
            pageSize?: number;
          };
          assertAccount(ctx, q.accountId);
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const result = await service.listSources(ctx, {
            ...(q.collectionId ? { collectionId: q.collectionId } : {}),
            ...(q.type ? { type: q.type } : {}),
            ...(q.status ? { status: q.status } : {}),
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
          return {
            data: result.rows,
            meta: { requestId, page, pageSize, total: result.total },
          };
        }
        case "intelligence.sources.update": {
          const b = (body ?? {}) as Parameters<
            IntelligenceService["updateSource"]
          >[2];
          const row = await service.updateSource(
            ctx,
            p.sourceId ?? "",
            b,
          );
          return { data: row, meta: { requestId } };
        }
        case "intelligence.sources.delete": {
          const b = (body ?? {}) as {
            mode?: "pause" | "archive" | "permanent";
            confirmToken?: string;
          };
          const result = await service.deleteSource(
            ctx,
            p.sourceId ?? "",
            {
              mode: b.mode ?? "pause",
              ...(b.confirmToken ? { confirmToken: b.confirmToken } : {}),
            },
          );
          return { data: result, meta: { requestId } };
        }
        case "intelligence.runs.start": {
          const b = (body ?? {}) as {
            trigger?: "manual" | "initial" | "retry";
            idempotencyKey?: string;
          };
          const result = await service.startRun(ctx, p.sourceId ?? "", {
            trigger: b.trigger ?? "manual",
            idempotencyKey: b.idempotencyKey ?? "",
          });
          return { data: result, meta: { requestId } };
        }
        case "intelligence.runs.list": {
          const q = (query ?? {}) as {
            status?: string;
            page?: number;
            pageSize?: number;
          };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const result = await service.listRuns(ctx, p.sourceId ?? "", {
            ...(q.status ? { status: q.status } : {}),
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
          return {
            data: result.rows,
            meta: { requestId, page, pageSize, total: result.total },
          };
        }
        case "intelligence.runs.get":
          return {
            data: await service.getRun(ctx, p.runId ?? ""),
            meta: { requestId },
          };
        case "intelligence.items.list": {
          const q = (query ?? {}) as {
            accountId?: string;
            collectionId?: string;
            sourceId?: string;
            query?: string;
            sort?: NonNullable<
              Parameters<IntelligenceService["listItems"]>[1]
            >["sort"];
            transcriptStatus?: string;
            page?: number;
            pageSize?: number;
          };
          assertAccount(ctx, q.accountId);
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const result = await service.listItems(ctx, {
            ...(q.collectionId ? { collectionId: q.collectionId } : {}),
            ...(q.sourceId ? { sourceId: q.sourceId } : {}),
            ...(q.query ? { query: q.query } : {}),
            ...(q.transcriptStatus
              ? { transcriptStatus: q.transcriptStatus }
              : {}),
            sort: q.sort ?? "newest",
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
          return {
            data: result.rows,
            meta: { requestId, page, pageSize, total: result.total },
          };
        }
        case "intelligence.items.get":
          return {
            data: await service.getItem(ctx, p.itemId ?? ""),
            meta: { requestId },
          };
        case "intelligence.items.importDouyinShare": {
          const b = (body ?? {}) as {
            accountId?: string;
            collectionId?: string | null;
            shareInput?: string;
            idempotencyKey?: string;
          };
          assertAccount(ctx, b.accountId);
          return {
            data: await service.enqueueDouyinShareImport(ctx, {
              collectionId: b.collectionId ?? null,
              shareInput: b.shareInput ?? "",
              idempotencyKey: b.idempotencyKey ?? "",
            }),
            meta: { requestId },
          };
        }
        case "intelligence.transcripts.enqueue": {
          const b = (body ?? {}) as {
            itemIds?: string[];
            idempotencyKey?: string;
          };
          return {
            data: await service.enqueueTranscripts(ctx, {
              itemIds: b.itemIds ?? [],
              idempotencyKey: b.idempotencyKey ?? "",
            }),
            meta: { requestId },
          };
        }
        case "intelligence.transcripts.uploadManual": {
          const b = (body ?? {}) as {
            itemId?: string;
            format?: "txt" | "md" | "srt" | "vtt";
            fileName?: string;
            text?: string;
          };
          return {
            data: {
              transcript: await service.uploadManualTranscript(ctx, {
                itemId: b.itemId ?? "",
                format: b.format ?? "txt",
                fileName: b.fileName ?? "",
                text: b.text ?? "",
              }),
            },
            meta: { requestId },
          };
        }
        case "intelligence.transforms.previewTopic": {
          const b = (body ?? {}) as {
            itemId?: string;
            sourceSnapshotId?: string;
            positioningVersionId?: string;
            idempotencyKey?: string;
          };
          return {
            data: await service.startTopicPreview(ctx, {
              itemId: b.itemId ?? "",
              sourceSnapshotId: b.sourceSnapshotId ?? "",
              positioningVersionId: b.positioningVersionId ?? "",
              idempotencyKey: b.idempotencyKey ?? "",
            }),
            meta: { requestId },
          };
        }
        case "intelligence.transforms.confirmTopic": {
          const b = (body ?? {}) as {
            editedCandidate?: {
              title: string;
              angle: string;
              differentiation: string;
              sourceSummary: string;
            };
            idempotencyKey?: string;
          };
          if (!b.editedCandidate) {
            throw new UnsupportedOperationError(
              "intelligence.transforms.confirmTopic.invalid",
            );
          }
          return {
            data: await service.confirmTopic(
              ctx,
              p.transformId ?? "",
              {
                editedCandidate: b.editedCandidate,
                idempotencyKey: b.idempotencyKey ?? "",
              },
            ),
            meta: { requestId },
          };
        }
        case "intelligence.migrations.inventory": {
          const q = (query ?? {}) as { accountId?: string };
          assertAccount(ctx, q.accountId);
          return {
            data: await service.inventoryLegacyMigration(ctx),
            meta: { requestId },
          };
        }
        case "intelligence.migrations.start": {
          const b = (body ?? {}) as {
            accountId?: string;
            inventoryHash?: string;
            idempotencyKey?: string;
          };
          assertAccount(ctx, b.accountId);
          return {
            data: await service.startLegacyMigration(ctx, {
              inventoryHash: b.inventoryHash ?? "",
              idempotencyKey: b.idempotencyKey ?? "",
            }),
            meta: { requestId },
          };
        }
        case "intelligence.migrations.report":
          return {
            data: await service.getLegacyMigrationReport(
              ctx,
              p.migrationId ?? "",
            ),
            meta: { requestId },
          };
        case "intelligence.migrations.rollback": {
          const b = (body ?? {}) as {
            confirmToken?: string;
            idempotencyKey?: string;
          };
          return {
            data: await service.rollbackLegacyMigration(
              ctx,
              p.migrationId ?? "",
              {
                confirmToken: b.confirmToken ?? "",
                idempotencyKey: b.idempotencyKey ?? "",
              },
            ),
            meta: { requestId },
          };
        }
        case "projects.intelligence.attach": {
          if (!projectReferencesFactory) {
            throw new UnsupportedOperationError(endpoint.id);
          }
          const b = (body ?? {}) as {
            topicId?: string;
            itemId?: string;
            sourceSnapshotId?: string;
            idempotencyKey?: string;
          };
          return {
            data: await projectReferencesFactory().attach(ctx, {
              projectId: p.projectId ?? "",
              topicId: b.topicId ?? "",
              itemId: b.itemId,
              sourceSnapshotId: b.sourceSnapshotId,
              idempotencyKey: b.idempotencyKey ?? "",
            }),
            meta: { requestId },
          };
        }
        case "projects.scripts.generateCandidate": {
          if (!projectScriptsFactory) {
            throw new UnsupportedOperationError(endpoint.id);
          }
          const b = (body ?? {}) as {
            referenceIds?: string[];
            strategy?: string;
            idempotencyKey?: string;
          };
          return {
            data: await projectScriptsFactory().generate(ctx, {
              projectId: p.projectId ?? "",
              referenceIds: b.referenceIds ?? [],
              strategy: b.strategy ?? "",
              idempotencyKey: b.idempotencyKey ?? "",
            }),
            meta: { requestId },
          };
        }
        case "projects.scripts.acceptCandidate": {
          if (!projectScriptsFactory) {
            throw new UnsupportedOperationError(endpoint.id);
          }
          const b = (body ?? {}) as {
            editedText?: string;
            idempotencyKey?: string;
          };
          return {
            data: await projectScriptsFactory().accept(ctx, {
              projectId: p.projectId ?? "",
              taskId: p.taskId ?? "",
              ...(b.editedText !== undefined
                ? { editedText: b.editedText }
                : {}),
              idempotencyKey: b.idempotencyKey ?? "",
            }),
            meta: { requestId },
          };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
