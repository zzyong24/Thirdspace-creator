import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type { KnowledgeService } from "./knowledge.service";
import type {
  KnowledgeItemRow,
  KnowledgeRevisionRow,
  KnowledgeRelationRow,
} from "./knowledge.repository";
import type {
  KnowledgeItemResource,
  KnowledgeRevisionResource,
  KnowledgeRelationResource,
} from "./knowledge.schema";

// Knowledge transport (foundation §5.4) — the module's 5 contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized
// notifications/projects transports: a `Transport` whose request(endpoint,input,
// ctx) switches on endpoint.id, mints a per-ctx service, and returns the SPEC §14
// envelope. A persisted op reached with NO ctx is an unauthenticated dispatch →
// AuthenticationError (→401). Ops this transport does not own throw
// UnsupportedOperationError so the composite never masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from KNOWLEDGE_OP_IDS (adding the module = registering it).

export const KNOWLEDGE_OP_IDS = [
  "knowledge.list",
  "knowledge.create",
  "knowledge.get",
  "knowledge.revisions.create",
  "knowledge.relations.create",
] as const;

function toItemResource(row: KnowledgeItemRow): KnowledgeItemResource {
  return {
    id: row.id,
    userId: row.userId,
    currentRevisionId: row.currentRevisionId,
    knowledgeType: row.knowledgeType as KnowledgeItemResource["knowledgeType"],
    title: row.title,
    sourceType: row.sourceType as KnowledgeItemResource["sourceType"],
    sourceUrl: row.sourceUrl ?? null,
    sourceMetadata: (row.sourceMetadata ?? {}) as Record<string, unknown>,
    status: row.status as KnowledgeItemResource["status"],
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRevisionResource(
  row: KnowledgeRevisionRow,
): KnowledgeRevisionResource {
  return {
    id: row.id,
    knowledgeItemId: row.knowledgeItemId,
    revisionNumber: row.revisionNumber,
    content: row.content,
    structuredData: (row.structuredData ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

function toRelationResource(
  row: KnowledgeRelationRow,
): KnowledgeRelationResource {
  return {
    id: row.id,
    sourceKnowledgeId: row.sourceKnowledgeId,
    targetKnowledgeId: row.targetKnowledgeId,
    relationType: row.relationType,
    strength: row.strength,
    createdByType: row.createdByType as KnowledgeRelationResource["createdByType"],
  };
}

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createKnowledgeTransport(
  serviceFactory: (ctx: RequestContext) => KnowledgeService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // All 5 ops are persisted (owned). No ctx ⇒ unauthenticated dispatch ⇒
      // reject before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory(ctx);

      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { knowledgeId?: string };
      const q = (query ?? {}) as { page?: number; pageSize?: number };

      switch (endpoint.id) {
        case "knowledge.list": {
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const items = await service.listKnowledge(ctx);
          return {
            data: items.map(toItemResource),
            meta: { requestId: ctx.requestId, page, pageSize, total: items.length },
          };
        }
        case "knowledge.create": {
          const b = (body ?? {}) as {
            title: string;
            knowledgeType?: string;
            content?: string;
          };
          const row = await service.createKnowledge(ctx, b);
          return {
            data: toItemResource(row),
            meta: { requestId: ctx.requestId },
          };
        }
        case "knowledge.get": {
          const row = await service.getKnowledge(ctx, p.knowledgeId ?? "");
          return {
            data: toItemResource(row),
            meta: { requestId: ctx.requestId },
          };
        }
        case "knowledge.revisions.create": {
          const b = (body ?? {}) as { content: string };
          const row = await service.createRevision(ctx, p.knowledgeId ?? "", b);
          return {
            data: toRevisionResource(row),
            meta: { requestId: ctx.requestId },
          };
        }
        case "knowledge.relations.create": {
          const b = (body ?? {}) as {
            targetKnowledgeId: string;
            relationType: string;
          };
          const row = await service.createRelation(ctx, p.knowledgeId ?? "", b);
          return {
            data: toRelationResource(row),
            meta: { requestId: ctx.requestId },
          };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
