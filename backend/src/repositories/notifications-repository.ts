import { eq, and, desc, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { notifications } from "../schema/notifications";

// Injected dependencies — mirrors project/knowledge-repository's RepoDeps so the
// repo stays deterministic (no Date.now / Math.random / fetch inside) and
// user-scoped (foundation §2 ownership).
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type NotificationType = "task" | "publish" | "import" | "system" | "ai";

type NotificationRow = typeof notifications.$inferSelect;

// Notifications are EVENT-EMITTED, not user-authored: the owning module (tasks,
// publishing, ingestion, system, ai) calls insert(...) post-commit. The owner of
// the row is fixed by deps.userId (the recipient threaded from RequestContext),
// not by the caller — so the entityType/entityId point back at the source row.
export interface NotificationInsert {
  notificationType: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
}

export interface NotificationsRepository {
  seedNotifications(rows: NotificationRow[]): Promise<void>;
  insert(input: NotificationInsert): Promise<NotificationRow>;
  list(): Promise<NotificationRow[]>;
  countUnread(): Promise<number>;
  markRead(notificationId: string): Promise<NotificationRow>;
}

export function createNotificationsRepository(
  db: Db,
  deps: RepoDeps,
): NotificationsRepository {
  // Owner-scoped read: a row owned by another user is invisible → same
  // "not found" surface project/knowledge-repository use for cross-user / missing
  // rows (OwnershipError → 404 at the boundary).
  async function get(notificationId: string): Promise<NotificationRow> {
    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, deps.userId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: notification not found: ${notificationId}`);
    }
    return row;
  }

  return {
    async seedNotifications(rows) {
      if (rows.length === 0) return;
      await db.insert(notifications).values(rows).onConflictDoNothing();
    },

    // Event-emitted append: the owning module calls this post-commit. read_at is
    // null at birth (the unread→read flag); the row joins the append-only ledger.
    async insert(input) {
      const ts = deps.now();
      const inserted = await db
        .insert(notifications)
        .values({
          id: deps.nextId("notification"),
          userId: deps.userId,
          notificationType: input.notificationType,
          title: input.title,
          body: input.body,
          entityType: input.entityType,
          entityId: input.entityId,
          readAt: null,
          createdAt: ts,
        })
        .returning();
      return inserted[0]!;
    },

    // User-scoped, newest-first (notifications_user_created_ix).
    async list() {
      return db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, deps.userId))
        .orderBy(desc(notifications.createdAt));
    },

    // User-scoped unread count (read_at IS NULL → notifications_user_unread_ix).
    async countUnread() {
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, deps.userId),
            isNull(notifications.readAt),
          ),
        );
      return Number(rows[0]?.count ?? 0);
    },

    // Idempotent: re-marking is a no-op. read_at is stamped ONCE — if it is
    // already set we leave the original timestamp untouched and return the row.
    async markRead(notificationId) {
      const existing = await get(notificationId); // ownership + existence gate
      if (existing.readAt !== null) {
        return existing;
      }
      const ts = deps.now();
      const updated = await db
        .update(notifications)
        .set({ readAt: ts })
        .where(
          and(
            eq(notifications.id, notificationId),
            eq(notifications.userId, deps.userId),
            isNull(notifications.readAt),
          ),
        )
        .returning();
      // Concurrent racer may have stamped it between the read and the write; fall
      // back to the durable row so the result is still the canonical state.
      return updated[0] ?? (await get(notificationId));
    },
  };
}
