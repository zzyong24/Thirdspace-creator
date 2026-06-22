import type { RequestContext } from "@creatoros/contract";
import type {
  NotificationRepository,
  NotificationRow,
} from "./notifications.repository";

// Notifications service (foundation §5.3) — RequestContext-taking methods that
// pass `ctx.userId` to the user-scoped repository (foundation §2). Notifications
// have NO multi-state §12 machine: the only mutation is a single guarded
// `unread → read` transition, which the repository owns (idempotent, no reverse;
// SPEC §12 lists no Notification machine, roadmap §398 confirms only unread→read).
//
// The clock is injected (`deps.now`) for deterministic tests, matching the
// persistence-client FIXED_NOW seam. `getUnreadCount` is built now (SPEC §19) so
// the Wave-4 DashboardQueryService can compose it; it is not consumed here.

export interface ServiceDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
}

export interface NotificationsService {
  list(
    ctx: RequestContext,
    q: { page: number; pageSize: number },
  ): Promise<{ items: NotificationRow[]; total: number }>;
  markRead(ctx: RequestContext, notificationId: string): Promise<NotificationRow>;
  getUnreadCount(ctx: RequestContext): Promise<number>;
}

export function createNotificationsService(
  repo: NotificationRepository,
  deps: ServiceDeps,
): NotificationsService {
  return {
    async list(ctx, q) {
      const page = q.page ?? 1;
      const pageSize = q.pageSize ?? 20;
      const { rows, total } = await repo.list(ctx.userId, page, pageSize);
      return { items: rows, total };
    },

    async markRead(ctx, notificationId) {
      // Delegates the unread→read transition + idempotency to the repo; a
      // cross-user / unknown id surfaces the repo's OwnershipError unswallowed
      // (the dispatch route maps it to 404).
      return repo.markRead(ctx.userId, notificationId, deps.now());
    },

    async getUnreadCount(ctx) {
      return repo.countUnread(ctx.userId);
    },
  };
}
