import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type { ArtifactsService } from "./artifacts.service";
import type {
  ArtifactRow,
  ArtifactVersionRow,
  ArtifactRelationRow,
} from "./artifacts.repository";
import type {
  ArtifactResource,
  ArtifactVersionResource,
  ArtifactRelationResource,
} from "./artifacts.schema";

// Artifacts transport (foundation §5.4) — the module's contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized
// knowledge/assets transports: a `Transport` whose request(endpoint,input,ctx)
// switches on endpoint.id, threads ctx into the service, and returns the SPEC §14
// envelope. A persisted op reached with NO ctx is an unauthenticated dispatch →
// AuthenticationError (→401). Ops this transport does not own throw
// UnsupportedOperationError so the composite never masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from ARTIFACT_OP_IDS (adding the module = registering it).

export const ARTIFACT_OP_IDS = [
  "artifacts.list",
  "artifacts.create",
  "artifacts.get",
  "artifacts.versions.create",
  "artifacts.scriptPatches.apply",
  "artifacts.versions.list",
  "artifacts.restore",
  "artifacts.relations.create",
] as const;

function toArtifactResource(row: ArtifactRow): ArtifactResource {
  return {
    id: row.id,
    projectId: row.projectId,
    contentOutputId: row.contentOutputId ?? null,
    // currentVersionId is nullable in the DB only during the create UoW; a
    // fully-formed artifact always has it set. Coerce the rare pre-link null to ""
    // so the wire shape (non-null id) stays valid.
    currentVersionId: row.currentVersionId ?? "",
    stage: row.stage as ArtifactResource["stage"],
    artifactType: row.artifactType as ArtifactResource["artifactType"],
    title: row.title,
    status: row.status as ArtifactResource["status"],
    archivedAt: row.archivedAt ?? null,
    // F1 (T-030-D4): surface provenance so consumers (F2) can distinguish an
    // AI-reconstructed artifact from a user-confirmed one. Legacy null → null.
    origin: (row.origin ?? null) as ArtifactResource["origin"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toVersionResource(row: ArtifactVersionRow): ArtifactVersionResource {
  return {
    id: row.id,
    artifactId: row.artifactId,
    versionNumber: row.versionNumber,
    contentText: row.contentText,
    contentData: (row.contentData ?? {}) as Record<string, unknown>,
    changeSummary: row.changeSummary,
    createdByType:
      row.createdByType as ArtifactVersionResource["createdByType"],
    aiTaskId: row.aiTaskId ?? null,
    createdAt: row.createdAt,
  };
}

function toRelationResource(
  row: ArtifactRelationRow,
): ArtifactRelationResource {
  return {
    id: row.id,
    sourceArtifactId: row.sourceArtifactId,
    targetArtifactId: row.targetArtifactId,
    relationType: row.relationType as ArtifactRelationResource["relationType"],
    createdAt: row.createdAt,
  };
}

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createArtifactsTransport(
  serviceFactory: () => ArtifactsService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // All owned ops are persisted. No ctx ⇒ unauthenticated dispatch ⇒
      // reject before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;

      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { projectId?: string; artifactId?: string };
      const q = (query ?? {}) as { page?: number; pageSize?: number };

      switch (endpoint.id) {
        case "artifacts.list": {
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const rows = await service.listProjectArtifacts(
            ctx,
            p.projectId ?? "",
          );
          return {
            data: rows.map(toArtifactResource),
            meta: { requestId, page, pageSize, total: rows.length },
          };
        }
        case "artifacts.create": {
          const b = (body ?? {}) as {
            title: string;
            artifactType: string;
            stage: string;
            contentOutputId?: string | null;
          };
          const row = await service.createArtifact(ctx, {
            projectId: p.projectId ?? "",
            title: b.title,
            artifactType: b.artifactType,
            stage: b.stage,
            contentOutputId: b.contentOutputId ?? null,
          });
          return { data: toArtifactResource(row), meta: { requestId } };
        }
        case "artifacts.get": {
          const row = await service.getArtifact(ctx, p.artifactId ?? "");
          return { data: toArtifactResource(row), meta: { requestId } };
        }
        case "artifacts.versions.create": {
          const b = (body ?? {}) as {
            expectedCurrentVersionId?: string;
            contentText?: string;
            changeSummary?: string;
            contentData?: Record<string, unknown>;
          };
          const row = await service.createVersion(ctx, p.artifactId ?? "", b);
          return { data: toVersionResource(row), meta: { requestId } };
        }
        case "artifacts.scriptPatches.apply": {
          const b = (body ?? {}) as {
            expectedVersionId: string;
            sectionId: string;
            expectedOriginalText: string;
            replacementText: string;
            changeSummary?: string;
          };
          const row = await service.applyScriptPatch(
            ctx,
            p.artifactId ?? "",
            b,
          );
          return {
            data: {
              ...toVersionResource(row),
              previousVersionId: row.previousVersionId,
            },
            meta: { requestId },
          };
        }
        case "artifacts.versions.list": {
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const rows = await service.listVersions(ctx, p.artifactId ?? "");
          return {
            data: rows.map(toVersionResource),
            meta: { requestId, page, pageSize, total: rows.length },
          };
        }
        case "artifacts.restore": {
          const b = (body ?? {}) as {
            versionId: string;
            expectedCurrentVersionId?: string;
          };
          const row = await service.restoreVersion(
            ctx,
            p.artifactId ?? "",
            b.versionId,
            b.expectedCurrentVersionId,
          );
          return { data: toArtifactResource(row), meta: { requestId } };
        }
        case "artifacts.relations.create": {
          const b = (body ?? {}) as {
            targetArtifactId: string;
            relationType: string;
          };
          const row = await service.createRelation(ctx, p.artifactId ?? "", b);
          return { data: toRelationResource(row), meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
