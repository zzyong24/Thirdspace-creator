import {
  and,
  eq,
  desc,
  isNull,
  or,
  count,
  type Db,
} from "@creatoros/backend";
import { notifications } from "./notifications.db-schema";
import { OwnershipError } from "./notifications.errors";

// Notifications repository (foundation §5.2) — user-scoped queries ONLY. Every
// read/write filters on `userId` and inserts stamp `ctx.userId` (passed in by the
// service); there is NO unscoped select/update (foundation §1/§2, SPEC §10/§20).
// Notifications are an append-only ledger with a single `unread → read`
// transition; `markRead` is the only mutation and it is idempotent (never
// overwrites an existing `readAt`, never reverses).
//
// [T-332 S2 · C-02] 账号可见集(SPEC 2026-07-15 account-full-isolation §3.2):
// notifications 是 user 级表,但账号域事件通知带 account_id stamp。读语义:
//   - ctx 有号   → `account_id = 当前号 OR account_id IS NULL`(当前号事件 + 系统级)。
//     **这是设计性 OR-NULL,非存量兼容,全仓唯一例外**——NULL 的含义是「系统级
//     通知,全局所有号可见」(激活到期/版本更新),不是「待认领的存量行」。
//   - ctx 无号   → 只见 `account_id IS NULL`(引导态也要能收系统通知,0 号可用)。
// markRead 的可见集同语义:跨号的业务通知 by-id → OwnershipError(404,不泄露存在)。

export type NotificationRow = typeof notifications.$inferSelect;

// 读方视角的号维度:string = 当前号;null = 未选号(只见系统级)。
export type NotificationAccountScope = string | null;

export interface NotificationRepository {
  // Seed helper for the canonical dataset (singleton build). Idempotent against a
  // fresh db; ids are explicit so re-seeding the same rows is a no-op insert.
  seed(rows: NotificationRow[]): Promise<void>;
  // [T-332 S2] 写路径:service 装配整行(含 accountId stamp:ctx.accountId ?? null),
  // repo 只负责落库 + 回读。
  create(row: NotificationRow): Promise<NotificationRow>;
  list(
    userId: string,
    accountId: NotificationAccountScope,
    page: number,
    pageSize: number,
  ): Promise<{ rows: NotificationRow[]; total: number }>;
  countUnread(
    userId: string,
    accountId: NotificationAccountScope,
  ): Promise<number>;
  markRead(
    userId: string,
    accountId: NotificationAccountScope,
    notificationId: string,
    now: string,
  ): Promise<NotificationRow>;
}

export function createNotificationRepository(db: Db): NotificationRepository {
  // [T-332 S2 · C-02] 账号可见集谓词(设计性 OR-NULL,非存量兼容,全仓唯一例外):
  // 有号 → 当前号事件 + 系统级(NULL);无号 → 只见系统级(NULL)。
  const accountVisibility = (accountId: NotificationAccountScope) =>
    accountId
      ? or(
          eq(notifications.accountId, accountId),
          isNull(notifications.accountId),
        )
      : isNull(notifications.accountId);

  return {
    async seed(rows) {
      if (rows.length === 0) return;
      await db.insert(notifications).values(rows).onConflictDoNothing();
    },

    async create(row) {
      // [T-332 S2] 写路径落库:accountId 已由 service stamp(账号域事件 = ctx 当前号;
      // 系统 ctx 无号 = NULL 全局)。append-only,无更新语义。
      const inserted = await db.insert(notifications).values(row).returning();
      return inserted[0]!;
    },

    async list(userId, accountId, page, pageSize) {
      const scoped = and(
        eq(notifications.userId, userId),
        accountVisibility(accountId),
      );
      const rows = await db
        .select()
        .from(notifications)
        .where(scoped)
        .orderBy(desc(notifications.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      // `total` ignores the page window — a sibling count() on the SAME scoped
      // predicate so pagination meta reflects the user's full visible ledger size.
      const totalRows = await db
        .select({ value: count() })
        .from(notifications)
        .where(scoped);
      return { rows, total: Number(totalRows[0]?.value ?? 0) };
    },

    async countUnread(userId, accountId) {
      const rows = await db
        .select({ value: count() })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            // [T-332 S2] 未读计数与 list 同一账号可见集(当前号 + 系统级)。
            accountVisibility(accountId),
            isNull(notifications.readAt),
          ),
        );
      return Number(rows[0]?.value ?? 0);
    },

    async markRead(userId, accountId, notificationId, now) {
      // Fetch user-scoped first: a cross-user / unknown id is indistinguishable
      // (foundation §2: 404, never reveal existence) → OwnershipError.
      // [T-332 S2] 可见集同 list:允许标当前可见集内的(当前号事件 + 系统级);
      // 跨号的业务通知 by-id → 404(号一致性门,§4.5 同语义)。
      const scoped = and(
        eq(notifications.userId, userId),
        accountVisibility(accountId),
        eq(notifications.id, notificationId),
      );
      const existing = await db.select().from(notifications).where(scoped);
      const row = existing[0];
      if (!row) throw new OwnershipError("Notification not found");

      // Idempotent: if already read, return it unchanged (preserve the original
      // `readAt`; the single unread→read transition never reverses or re-stamps).
      if (row.readAt !== null) return row;

      const updated = await db
        .update(notifications)
        .set({ readAt: now })
        .where(scoped)
        .returning();
      return updated[0]!;
    },
  };
}
