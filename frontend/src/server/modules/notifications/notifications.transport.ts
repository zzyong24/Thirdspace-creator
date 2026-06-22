import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type { NotificationsService } from "./notifications.service";
import type { NotificationRow } from "./notifications.repository";
import type { NotificationResource } from "./notifications.schema";

// Notifications transport (foundation §5.4) — the module's two contract ops served
// over REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized
// persistence/taxonomy transports: a `Transport` whose request(endpoint,input,ctx)
// switches on endpoint.id, delegates to a per-ctx service, and returns the SPEC
// §14 envelope. A persisted op reached with NO ctx is an unauthenticated dispatch
// → AuthenticationError (→401). Ops this transport does not own throw
// UnsupportedOperationError so the composite never masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from NOTIFICATION_OP_IDS (adding the module = registering it).

export const NOTIFICATION_OP_IDS = [
  "notifications.list",
  "notifications.read",
] as const;

// Map a DB row → the contract NotificationResource shape. Notification has no
// `updatedAt` (BaseEntity only); readAt passes through as iso8601|null.
function toResource(row: NotificationRow): NotificationResource {
  return {
    id: row.id,
    userId: row.userId,
    notificationType: row.notificationType as NotificationResource["notificationType"],
    title: row.title,
    body: row.body,
    entityType: row.entityType,
    entityId: row.entityId,
    readAt: row.readAt ?? null,
    createdAt: row.createdAt,
  };
}

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createNotificationsTransport(
  serviceFactory: (ctx: RequestContext) => NotificationsService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // Both ops are persisted (owned). No ctx ⇒ unauthenticated dispatch ⇒ reject
      // before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory(ctx);

      const { params, query } = (input ?? {}) as Input;
      const p = (params ?? {}) as { notificationId?: string };
      const q = (query ?? {}) as { page?: number; pageSize?: number };

      switch (endpoint.id) {
        case "notifications.list": {
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const { items, total } = await service.list(ctx, { page, pageSize });
          return {
            data: items.map(toResource),
            meta: { requestId: ctx.requestId, page, pageSize, total },
          };
        }
        case "notifications.read": {
          const row = await service.markRead(ctx, p.notificationId ?? "");
          return { data: toResource(row), meta: { requestId: ctx.requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
