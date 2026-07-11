import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./trend-sources.errors";
import type { TrendSourcesService } from "./trend-sources.service";

// [T-235b] TrendSources transport(foundation §5.4,照 benchmark.transport 先例)—— 热点信源
// 4 ops over REAL SQL,同 /api/v1/dispatch。no-ctx → AuthenticationError(401);本 transport
// 不认的 op → UnsupportedOperationError(composite 不掩真错)。

export const TREND_SOURCES_OP_IDS = [
  "trend.sources.list",
  "trend.sources.create",
  "trend.sources.toggle",
  "trend.sources.remove",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createTrendSourcesTransport(
  serviceFactory: () => TrendSourcesService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { sourceId?: string };

      switch (endpoint.id) {
        case "trend.sources.list": {
          const q = (query ?? {}) as { page?: number; pageSize?: number };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 100;
          const { rows, total } = await service.listSources(ctx, { page, pageSize });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "trend.sources.create": {
          const b = (body ?? {}) as {
            url: string;
            name?: string | null;
            note?: string | null;
            sourceType?: "web" | "rss";
            enabled?: boolean;
          };
          const created = await service.createSource(ctx, {
            url: b.url,
            name: b.name ?? null,
            note: b.note ?? null,
            sourceType: b.sourceType,
            enabled: b.enabled,
          });
          return { data: created, meta: { requestId } };
        }
        case "trend.sources.toggle": {
          const b = (body ?? {}) as { enabled?: boolean };
          const updated = await service.toggleSource(
            ctx,
            p.sourceId ?? "",
            b.enabled ?? true,
          );
          return { data: updated, meta: { requestId } };
        }
        case "trend.sources.remove": {
          const removed = await service.removeSource(ctx, p.sourceId ?? "");
          return { data: removed, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
