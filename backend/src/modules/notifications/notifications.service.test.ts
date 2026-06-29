import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createNotificationRepository,
  type NotificationRepository,
  type NotificationRow,
} from "./notifications.repository";
import { createNotificationsService } from "./notifications.service";
import { OwnershipError } from "./notifications.errors";

// Section C2 — service tests. Asserts:
//   1. list forwards ctx.userId + pagination to the repo and returns {items,total};
//   2. markRead returns the read row; readAt equals the injected `now`;
//   3. markRead on an already-read notification returns it unchanged (idempotent);
//   4. markRead on another user's id surfaces OwnershipError (not swallowed);
//   5. getUnreadCount returns the repo's user-scoped count.

const NOW = "2026-06-21T00:00:00.000Z";

const ctxA: RequestContext = {
  userId: "user-a",
  requestId: "req-a",
  source: "user",
};

function row(over: Partial<NotificationRow> & { id: string }): NotificationRow {
  return {
    id: over.id,
    userId: over.userId ?? "user-a",
    notificationType: over.notificationType ?? "task",
    title: over.title ?? "标题",
    body: over.body ?? "正文",
    entityType: over.entityType ?? "task",
    entityId: over.entityId ?? "task-1",
    readAt: over.readAt ?? null,
    createdAt: over.createdAt ?? NOW,
  };
}

describe("notifications.service", () => {
  it("C2.1: list forwards ctx.userId + pagination to the repo", async () => {
    const calls: Array<{ userId: string; page: number; pageSize: number }> = [];
    const fakeRepo: NotificationRepository = {
      async seed() {},
      async list(userId, page, pageSize) {
        calls.push({ userId, page, pageSize });
        return { rows: [row({ id: "n-1" })], total: 7 };
      },
      async countUnread() {
        return 0;
      },
      async markRead() {
        throw new Error("unused");
      },
    };
    const service = createNotificationsService(fakeRepo, { now: () => NOW });
    const out = await service.list(ctxA, { page: 2, pageSize: 5 });
    expect(calls).toEqual([{ userId: "user-a", page: 2, pageSize: 5 }]);
    expect(out.total).toBe(7);
    expect(out.items.map((i) => i.id)).toEqual(["n-1"]);
  });

  describe("over a pglite-backed repo", () => {
    let db: Db;
    let repo: NotificationRepository;
    let service: ReturnType<typeof createNotificationsService>;

    beforeEach(async () => {
      ({ db } = await createDb());
      repo = createNotificationRepository(db);
      service = createNotificationsService(repo, { now: () => NOW });
      await repo.seed([
        row({ id: "a-unread", userId: "user-a", readAt: null }),
        row({ id: "a-read", userId: "user-a", readAt: "2026-06-01T00:00:00.000Z" }),
        row({ id: "b-unread", userId: "user-b", readAt: null }),
      ]);
    });

    it("C2.2: markRead returns the read row with readAt === injected now", async () => {
      const read = await service.markRead(ctxA, "a-unread");
      expect(read.id).toBe("a-unread");
      expect(read.readAt).toBe(NOW);
    });

    it("C2.3: markRead on an already-read notification returns it unchanged", async () => {
      const read = await service.markRead(ctxA, "a-read");
      expect(read.readAt).toBe("2026-06-01T00:00:00.000Z"); // original preserved
    });

    it("C2.4: markRead on another user's id surfaces OwnershipError", async () => {
      await expect(
        service.markRead(ctxA, "b-unread"),
      ).rejects.toBeInstanceOf(OwnershipError);
    });

    it("C2.5: getUnreadCount returns the user-scoped count", async () => {
      expect(await service.getUnreadCount(ctxA)).toBe(1);
    });
  });
});
