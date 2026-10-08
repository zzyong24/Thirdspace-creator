import {workspaceKey} from "../../workspace-scope";
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
// [T-332 S2 · C-02] 账号语义(SPEC 2026-07-15 account-full-isolation §3.2/§3.3):
// notifications 是 user 级表 → **不上 requireAccountId**(0 号/未选号也要能收
// 系统通知,引导态不禁读)。号维度以 `ctx.accountId ?? null` 透传:
//   - 读:有号 → 当前号事件 + 系统级(设计性 OR-NULL,全仓唯一例外);
//         无号 → 只见系统级(NULL)。
//   - 写(create):stamp `accountId: ctx.accountId ?? null`——账号域事件 ctx 有号
//     → 落当前号;系统 ctx 无号 → 落 NULL(= 全局所有号可见),不隐式填号。
//
// The clock is injected (`deps.now`) for deterministic tests, matching the
// persistence-client FIXED_NOW seam. `getUnreadCount` is built now (SPEC §19) so
// the Wave-4 DashboardQueryService can compose it; it is not consumed here.

export interface ServiceDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
}

export interface CreateNotificationInput {
  notificationType: string; // task|publish|import|system|ai
  title: string;
  body: string;
  entityType: string;
  entityId: string;
}

export interface NotificationsService {
  list(
    ctx: RequestContext,
    q: { page: number; pageSize: number },
  ): Promise<{ items: NotificationRow[]; total: number }>;
  markRead(ctx: RequestContext, notificationId: string): Promise<NotificationRow>;
  getUnreadCount(ctx: RequestContext): Promise<number>;
  // [T-332 S2] 写路径(组合根 notify seam / 未来 create op 用):stamp 号维度。
  create(
    ctx: RequestContext,
    input: CreateNotificationInput,
  ): Promise<NotificationRow>;
}

export function createNotificationsService(
  repo: NotificationRepository,
  deps: ServiceDeps,
): NotificationsService {
  return {
    async list(ctx, q) {
      const page = q.page ?? 1;
      const pageSize = q.pageSize ?? 20;
      const { rows, total } = await repo.list(
        ctx.userId,
        // [T-332 S2] 号可见集:有号 → 当前号 + 系统级;无号 → 只见系统级。
        ctx.groupId ? workspaceKey(ctx) : ctx.accountId ?? null,
        page,
        pageSize,
      );
      return { items: rows, total };
    },

    async markRead(ctx, notificationId) {
      // Delegates the unread→read transition + idempotency to the repo; a
      // cross-user / 跨号 / unknown id surfaces the repo's OwnershipError
      // unswallowed (the dispatch route maps it to 404).
      return repo.markRead(
        ctx.userId,
        ctx.groupId ? workspaceKey(ctx) : ctx.accountId ?? null,
        notificationId,
        deps.now(),
      );
    },

    async getUnreadCount(ctx) {
      return repo.countUnread(ctx.userId, ctx.groupId ? workspaceKey(ctx) : ctx.accountId ?? null);
    },

    async create(ctx, input) {
      // [T-332 S2] 写路径 stamp:账号域事件 ctx 有号 → 落当前号;系统 ctx 无号 →
      // NULL(系统级,全局可见)。通知是 user 级表,不抛 AccountRequiredError。
      return repo.create({
        id: deps.nextId("notif"),
        userId: ctx.userId,
        groupId: ctx.groupId ?? null,
        accountId: ctx.accountId ?? null,
        notificationType: input.notificationType,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
        readAt: null,
        createdAt: deps.now(),
      });
    },
  };
}
