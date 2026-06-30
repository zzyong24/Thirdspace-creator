import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./publishing.errors";
import type { PublishingService } from "./publishing.service";
import type {
  PublicationRow,
  PublicationRevisionRow,
} from "./publishing.repository";
import type {
  PublicationResource,
  PublicationRevisionResource,
} from "./publishing.schema";

// Publishing transport (foundation §5.4) — the module's 5 contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized
// production/artifacts transports: a `Transport` whose request(endpoint,input,ctx)
// switches on endpoint.id, threads ctx into the service, and returns the SPEC §14
// envelope. A persisted op reached with NO ctx is an unauthenticated dispatch →
// AuthenticationError (→401). Ops this transport does not own throw
// UnsupportedOperationError so the composite never masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from PUBLISHING_OP_IDS (adding the module = registering it).

export const PUBLISHING_OP_IDS = [
  "outputs.publications.list",
  "outputs.publications.create",
  "publications.get",
  "publications.revisions.create",
  "publications.revisions.list",
  "publications.transition",
] as const;

function toPublicationResource(row: PublicationRow): PublicationResource {
  return {
    id: row.id,
    contentOutputId: row.contentOutputId,
    platform: row.platform as PublicationResource["platform"],
    accountReference: row.accountReference,
    status: row.status as PublicationResource["status"],
    // currentRevisionId is non-nullable in the contract (id, non-empty string).
    // createPublication auto-mints revision-1 (OQ4) so this is always a real id;
    // coerce a defensive null to "" should a legacy row ever lack one (the FE keys
    // off the publication id, not this, for routing).
    currentRevisionId: row.currentRevisionId ?? "",
    externalId: row.externalId ?? null,
    externalUrl: row.externalUrl ?? null,
    scheduledAt: row.scheduledAt ?? null,
    publishedAt: row.publishedAt ?? null,
    removedAt: row.removedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRevisionResource(
  row: PublicationRevisionRow,
): PublicationRevisionResource {
  return {
    id: row.id,
    publicationId: row.publicationId,
    revisionNumber: row.revisionNumber,
    title: row.title,
    description: row.description,
    coverAssetId: row.coverAssetId ?? null,
    category: row.category,
    series: row.series,
    platformTags: (row.platformTags ?? []) as string[],
    platformSettings: (row.platformSettings ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

type Input = { params?: unknown; query?: unknown; body?: unknown };

function paginationFrom(query: unknown): { limit: number; offset: number } {
  // The contract paginationQuery is { page, pageSize } (1-based). Map it to the
  // repository's limit/offset. Tolerate a raw { limit, offset } too (the
  // module's own tests drive the transport directly).
  const q = (query ?? {}) as {
    page?: number;
    pageSize?: number;
    limit?: number;
    offset?: number;
  };
  if (q.limit !== undefined || q.offset !== undefined) {
    return { limit: q.limit ?? 20, offset: q.offset ?? 0 };
  }
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 20;
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

export function createPublishingTransport(
  serviceFactory: () => PublishingService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // All 5 ops are persisted (owned). No ctx ⇒ unauthenticated dispatch ⇒
      // reject before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;

      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as {
        outputId?: string;
        publicationId?: string;
      };

      switch (endpoint.id) {
        case "outputs.publications.list": {
          const page = paginationFrom(query);
          const rows = await service.listPublications(ctx, p.outputId ?? "", page);
          return {
            data: rows.map(toPublicationResource),
            meta: {
              requestId,
              page: Math.floor(page.offset / page.limit) + 1,
              pageSize: page.limit,
              total: rows.length,
            },
          };
        }
        case "outputs.publications.create": {
          const b = (body ?? {}) as {
            platform: string;
            accountReference: string;
          };
          const row = await service.createPublication(ctx, p.outputId ?? "", b);
          return { data: toPublicationResource(row), meta: { requestId } };
        }
        case "publications.get": {
          const row = await service.getPublication(ctx, p.publicationId ?? "");
          return { data: toPublicationResource(row), meta: { requestId } };
        }
        case "publications.revisions.create": {
          const b = (body ?? {}) as {
            title: string;
            description: string;
            // SPEC §8「多平台 标签」:可选标签集随新版本一起落库(append 不可变 revision)。
            platformTags?: string[];
          };
          const row = await service.createRevision(
            ctx,
            p.publicationId ?? "",
            b,
          );
          return { data: toRevisionResource(row), meta: { requestId } };
        }
        case "publications.revisions.list": {
          const page = paginationFrom(query);
          const rows = await service.listRevisions(
            ctx,
            p.publicationId ?? "",
            page,
          );
          return {
            data: rows.map(toRevisionResource),
            meta: {
              requestId,
              page: Math.floor(page.offset / page.limit) + 1,
              pageSize: page.limit,
              total: rows.length,
            },
          };
        }
        case "publications.transition": {
          const b = (body ?? {}) as { status: string };
          const row = await service.transition(ctx, p.publicationId ?? "", b);
          return { data: toPublicationResource(row), meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
