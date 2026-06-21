import {
  and,
  eq,
  desc,
  isNull,
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

export type NotificationRow = typeof notifications.$inferSelect;

export interface NotificationRepository {
  // Seed helper for the canonical dataset (singleton build). Idempotent against a
  // fresh db; ids are explicit so re-seeding the same rows is a no-op insert.
  seed(rows: NotificationRow[]): Promise<void>;
  list(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{ rows: NotificationRow[]; total: number }>;
  countUnread(userId: string): Promise<number>;
  markRead(
    userId: string,
    notificationId: string,
    now: string,
  ): Promise<NotificationRow>;
}

export function createNotificationRepository(db: Db): NotificationRepository {
  return {
    async seed(rows) {
      if (rows.length === 0) return;
      await db.insert(notifications).values(rows).onConflictDoNothing();
    },

    async list(userId, page, pageSize) {
      const scoped = eq(notifications.userId, userId);
      const rows = await db
        .select()
        .from(notifications)
        .where(scoped)
        .orderBy(desc(notifications.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      // `total` ignores the page window — a sibling count() on the SAME scoped
      // predicate so pagination meta reflects the user's full ledger size.
      const totalRows = await db
        .select({ value: count() })
        .from(notifications)
        .where(scoped);
      return { rows, total: Number(totalRows[0]?.value ?? 0) };
    },

    async countUnread(userId) {
      const rows = await db
        .select({ value: count() })
        .from(notifications)
        .where(
          and(eq(notifications.userId, userId), isNull(notifications.readAt)),
        );
      return Number(rows[0]?.value ?? 0);
    },

    async markRead(userId, notificationId, now) {
      // Fetch user-scoped first: a cross-user / unknown id is indistinguishable
      // (foundation §2: 404, never reveal existence) → OwnershipError.
      const scoped = and(
        eq(notifications.userId, userId),
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
