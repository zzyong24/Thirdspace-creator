import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type {
  DashboardQueryService,
  ProjectOverviewQueryService,
  GlobalSearchQueryService,
} from "./query-services.service";

// Query-services transport (foundation §5.4) — THREE page-read HTTP ops served
// over the same /api/v1/dispatch route by composing public upstream services
// (SPEC §19). A persisted op reached with NO ctx is an unauthenticated dispatch →
// AuthenticationError (→401). Ops this transport does not own throw
// UnsupportedOperationError so the composite never masks a real error.
//
// `publishingCenterPage`: NO endpoint per contract/src/operations/pages.ts:7-10 —
// composed client/server-side via PublishingCenterQueryService (Task 5), so it is
// deliberately NOT registered here.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from QUERY_SERVICES_OP_IDS. This module TAKES OVER `pages.search.get`
// from the Search module's Wave-1 interim composer (foundation §6) — the composite
// routes that op id here, and the Search interim registration is removed so exactly
// one handler owns it.

export const QUERY_SERVICES_OP_IDS = [
  "pages.dashboard.get",
  "pages.groupWorkspace.get",
  "pages.groupOverview.get",
  "pages.groupTrend.get",
  "pages.dailyReport.get",
  "pages.projectOverview.get",
  "pages.search.get",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export interface QueryServicesTransportDeps {
  dashboard: DashboardQueryService;
  groupOverview?:{getWorkspace?(ctx:RequestContext,groupId:string,query:unknown):Promise<unknown>;get(ctx:RequestContext,groupId:string,query:unknown):Promise<unknown>;getTrend?(ctx:RequestContext,groupId:string,query:unknown):Promise<unknown>};
  dailyReport?: {getDailyReport(ctx: RequestContext, query?: {date?: string;startDate?: string;endDate?: string}): Promise<unknown>};
  overview: ProjectOverviewQueryService;
  search: GlobalSearchQueryService;
}

export function createQueryServicesTransport(
  deps: QueryServicesTransportDeps,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // All three ops are persisted (owned). No ctx ⇒ unauthenticated dispatch ⇒
      // reject before composing any downstream read.
      if (!ctx) throw new AuthenticationError();

      const { params, query } = (input ?? {}) as Input;

      switch (endpoint.id) {
        case "pages.groupWorkspace.get": {
          if(!deps.groupOverview?.getWorkspace)throw new UnsupportedOperationError(endpoint.id);
          return wrap(await deps.groupOverview.getWorkspace(ctx,(params as {groupId:string}).groupId,query??{}),ctx);
        }
        case "pages.groupTrend.get": {
          if(!deps.groupOverview?.getTrend)throw new UnsupportedOperationError(endpoint.id);
          return wrap(await deps.groupOverview.getTrend(ctx,(params as {groupId:string}).groupId,query??{}),ctx);
        }
        case "pages.groupOverview.get": {
          if(!deps.groupOverview)throw new UnsupportedOperationError(endpoint.id);
          return wrap(await deps.groupOverview.get(ctx,(params as {groupId:string}).groupId,query??{}),ctx);
        }
        case "pages.dailyReport.get": {
          if (!deps.dailyReport) throw new UnsupportedOperationError(endpoint.id);
          const q = (query ?? {}) as {date?: string;startDate?: string;endDate?: string};
          return wrap(await deps.dailyReport.getDailyReport(ctx, q), ctx);
        }
        case "pages.dashboard.get": {
          const data = await deps.dashboard.getDashboard(ctx);
          return wrap(data, ctx);
        }
        case "pages.projectOverview.get": {
          const p = (params ?? {}) as { projectId?: string };
          const projectId = typeof p.projectId === "string" ? p.projectId : "";
          // OwnershipError bubbles so the dispatch route maps it to 404
          // (foundation §2 — cross-user / unknown project never leaks a page).
          const data = await deps.overview.getProjectOverview(ctx, projectId);
          return wrap(data, ctx);
        }
        case "pages.search.get": {
          const q = (query ?? {}) as { q?: string; type?: string };
          const rawQuery = typeof q.q === "string" ? q.q : "";
          const typeFilter =
            typeof q.type === "string" && q.type ? q.type : undefined;
          const data = await deps.search.getGlobalSearch(
            ctx,
            rawQuery,
            typeFilter,
          );
          return wrap(data, ctx);
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}

function wrap(data: unknown, ctx: RequestContext) {
  return { data, meta: { requestId: ctx.requestId } };
}
