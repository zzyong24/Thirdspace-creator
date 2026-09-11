import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./analytics.errors";
import type { AnalyticsService } from "./analytics.service";
import type { MetricSnapshotRow } from "./analytics.repository";
import type { MetricSnapshotResource } from "./analytics.schema";

// Analytics transport (foundation §5.4) — the module's two contract READ ops served
// over REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized
// publishing/production transports: a `Transport` whose request(endpoint,input,ctx)
// switches on endpoint.id, threads ctx into the service, and returns the SPEC §14
// list envelope. A persisted op reached with NO ctx is an unauthenticated dispatch
// → AuthenticationError (→401). Ops this transport does not own throw
// UnsupportedOperationError so the composite never masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from ANALYTICS_OP_IDS (adding the module = registering it).

export const ANALYTICS_OP_IDS = [
  "analytics.publications.get",
  "analytics.traffic.get",
  "analytics.traffic.refresh",
  "analytics.projects.get",
] as const;

// Drizzle row → metricSnapshotResource DTO. Drops user_id and never leaks the row
// type (SPEC §9). rawMetrics is the persisted jsonb (record<string, unknown>).
function toSnapshotResource(row: MetricSnapshotRow): MetricSnapshotResource {
  return {
    id: row.id,
    publicationId: row.publicationId,
    ingestionRunId: row.ingestionRunId ?? null,
    capturedAt: row.capturedAt,
    source: row.source,
    rawMetrics: (row.rawMetrics ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

type Input = { params?: unknown; query?: unknown; body?: unknown };

// The contract paginationQuery is { page, pageSize } (1-based). Tolerate a raw
// { page, pageSize } and default to page 1 / pageSize 20.
function paginationFrom(query: unknown): { page: number; pageSize: number } {
  const q = (query ?? {}) as { page?: number; pageSize?: number };
  return { page: q.page ?? 1, pageSize: q.pageSize ?? 20 };
}

export function createAnalyticsTransport(
  serviceFactory: () => AnalyticsService,
  traffic?: {getProject:import('./traffic.service').TrafficService['getProject'];refresh:(ctx:RequestContext,projectId:string)=>Promise<{queued:number;jobRunId:string|null;aiTaskId:string|null}>},
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // Both ops are persisted (owned). No ctx ⇒ unauthenticated dispatch ⇒ reject
      // before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query } = (input ?? {}) as Input;
      const p = (params ?? {}) as {
        publicationId?: string;
        projectId?: string;
      };
      const { page, pageSize } = paginationFrom(query);

      switch (endpoint.id) {
        case 'analytics.traffic.get':
          if(!traffic)throw new Error('流量来源服务尚未接入');
          return {data:await traffic.getProject(ctx,p.projectId??''),meta:{requestId}};
        case 'analytics.traffic.refresh':
          if(!traffic)throw new Error('流量来源服务尚未接入');
          return {data:await traffic.refresh(ctx,p.projectId??''),meta:{requestId}};
        case "analytics.publications.get": {
          const { rows, total } = await service.getPublicationAnalytics(
            ctx,
            p.publicationId ?? "",
            page,
            pageSize,
          );
          return {
            data: rows.map(toSnapshotResource),
            meta: { requestId, page, pageSize, total },
          };
        }
        case "analytics.projects.get": {
          const { rows, total } = await service.getProjectAnalytics(
            ctx,
            p.projectId ?? "",
            page,
            pageSize,
          );
          return {
            data: rows.map(toSnapshotResource),
            meta: { requestId, page, pageSize, total },
          };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
