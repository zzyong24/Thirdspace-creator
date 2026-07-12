import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./favorites.errors";
import type { FavoritesService } from "./favorites.service";

// [T-235c] Favorites transport(foundation §5.4,照 trend-sources.transport 先例)—— 收藏夹登记
// 4 ops over REAL SQL,同 /api/v1/dispatch。no-ctx → AuthenticationError(401);本 transport
// 不认的 op → UnsupportedOperationError(composite 不掩真错)。items 台账不暴露 wire(采集侧内部)。

export const FAVORITES_OP_IDS = [
  "favorites.folders.list",
  "favorites.folders.create",
  "favorites.folders.toggle",
  "favorites.folders.remove",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createFavoritesTransport(
  serviceFactory: () => FavoritesService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { folderId?: string };

      switch (endpoint.id) {
        case "favorites.folders.list": {
          const q = (query ?? {}) as { page?: number; pageSize?: number };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 100;
          const { rows, total } = await service.listFolders(ctx, { page, pageSize });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "favorites.folders.create": {
          const b = (body ?? {}) as {
            name: string;
            note?: string | null;
          };
          const created = await service.createFolder(ctx, {
            name: b.name,
            note: b.note ?? null,
          });
          return { data: created, meta: { requestId } };
        }
        case "favorites.folders.toggle": {
          const b = (body ?? {}) as { enabled?: boolean };
          const updated = await service.toggleFolder(
            ctx,
            p.folderId ?? "",
            b.enabled ?? true,
          );
          return { data: updated, meta: { requestId } };
        }
        case "favorites.folders.remove": {
          const removed = await service.removeFolder(ctx, p.folderId ?? "");
          return { data: removed, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
