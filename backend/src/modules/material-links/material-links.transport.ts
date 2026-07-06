import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./material-links.errors";
import type { MaterialLinksService } from "./material-links.service";

// MaterialLink transport (foundation §5.4) — the module's 3 contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. A `Transport` whose
// request(endpoint,input,ctx) switches on endpoint.id, threads ctx into the service, and
// returns the §14 envelope (list for materialLinks.list, single-resource otherwise). A
// persisted op reached with NO ctx is an unauthenticated dispatch → AuthenticationError
// (→401). Ops this transport does not own throw UnsupportedOperationError so the
// composite never masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds PERSISTED_OPS
// from MATERIAL_LINKS_OP_IDS (adding the module = registering it).

export const MATERIAL_LINKS_OP_IDS = [
  "materialLinks.list",
  "materialLinks.create",
  "materialLinks.delete",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createMaterialLinksTransport(
  serviceFactory: () => MaterialLinksService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { linkId?: string };

      switch (endpoint.id) {
        case "materialLinks.list": {
          const q = (query ?? {}) as {
            projectId?: string;
            page?: number;
            pageSize?: number;
          };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 100;
          const { rows, total } = await service.list(ctx, {
            // [T-060③b] 缺省 = 全量(按项目分组反查);空串同缺省。
            projectId: q.projectId?.trim() ? q.projectId : undefined,
            page,
            pageSize,
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "materialLinks.create": {
          const b = (body ?? {}) as {
            projectId: string;
            contentOutputId?: string | null;
            entityType: "knowledge" | "asset";
            entityId: string;
            role?: string;
            stage?: string;
            addedByType?: string;
            priority?: string;
          };
          const created = await service.create(ctx, {
            projectId: b.projectId,
            contentOutputId: b.contentOutputId ?? null,
            entityType: b.entityType,
            entityId: b.entityId,
            role: b.role,
            stage: b.stage,
            // [T-146 切片 b] provenance + 优先级透传(缺省 → service 派生 high)。
            addedByType: b.addedByType,
            priority: b.priority,
          });
          return { data: created, meta: { requestId } };
        }
        case "materialLinks.delete": {
          const deleted = await service.delete(ctx, p.linkId ?? "");
          return { data: deleted, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
