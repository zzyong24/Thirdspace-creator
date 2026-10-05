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
//   1. list forwards ctx.userId + ctx.accountId + pagination to the repo;
//   2. markRead returns the read row; readAt equals the injected `now`;
//   3. markRead on an already-read notification returns it unchanged (idempotent);
//   4. markRead on another user's id surfaces OwnershipError (not swallowed);
//   5. getUnreadCount returns the repo's user-scoped count.
//   6. [T-332 S2 · C-02] 账号语义:写路径 stamp `ctx.accountId ?? null`;读走
//      「当前号 + 系统级」可见集;未选号只见系统级;**不上 requireAccountId**
//      (user 级表,0 号也要能收系统通知)。

const NOW = "2026-06-21T00:00:00.000Z";
const ACC_A = "acct-a";
const ACC_A2 = "acct-a2";

const ctxA: RequestContext = {
  userId: "user-a",
  accountId: ACC_A,
  requestId: "req-a",
  source: "user",
};
// 同 user 的第二个号(账号可见集断言用)。
const ctxA2: RequestContext = {
  userId: "user-a",
  accountId: ACC_A2,
  requestId: "req-a2",
  source: "user",
};
// 未选号 / 系统 ctx(无号):通知不禁读写(user 级表)。
const ctxNoAccount: RequestContext = {
  userId: "user-a",
  requestId: "req-na",
  source: "user",
};

function deterministicDeps() {
  let seq = 0;
  return { now: () => NOW, nextId: (prefix: string) => `${prefix}-${++seq}` };
}

function row(over: Partial<NotificationRow> & { id: string }): NotificationRow {
  return {
    id: over.id,
    userId: over.userId ?? "user-a",
    accountId: over.accountId ?? null, // 缺省 null = 系统级(全局可见,设计语义)
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
  it("C2.1: list forwards ctx.userId + ctx.accountId + pagination to the repo", async () => {
    const calls: Array<{
      userId: string;
      accountId: import("./notifications.repository").NotificationAccountScope;
      page: number;
      pageSize: number;
    }> = [];
    const fakeRepo: NotificationRepository = {
      async seed() {},
      async create(r) {
        return r;
      },
      async list(userId, accountId, page, pageSize) {
        calls.push({ userId, accountId, page, pageSize });
        return { rows: [row({ id: "n-1" })], total: 7 };
      },
      async countUnread() {
        return 0;
      },
      async markRead() {
        throw new Error("unused");
      },
    };
    const service = createNotificationsService(fakeRepo, deterministicDeps());
    const out = await service.list(ctxA, { page: 2, pageSize: 5 });
    expect(calls).toEqual([
      { userId: "user-a", accountId: ACC_A, page: 2, pageSize: 5 },
    ]);
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
      service = createNotificationsService(repo, deterministicDeps());
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

    // ── [T-332 S2 · C-02] 账号语义 ────────────────────────────────────────────
    it("写路径 stamp:有号 ctx → 落当前号;无号 ctx → NULL(系统级)", async () => {
      const stamped = await service.create(ctxA, {
        notificationType: "task",
        title: "号a 采集失败",
        body: "详情",
        entityType: "job",
        entityId: "job-1",
      });
      expect(stamped.accountId).toBe(ACC_A);
      expect(stamped.readAt).toBeNull();
      expect(stamped.createdAt).toBe(NOW);

      const system = await service.create(ctxNoAccount, {
        notificationType: "system",
        title: "版本更新",
        body: "v2 可用",
        entityType: "system",
        entityId: "release-2",
      });
      expect(system.accountId).toBeNull(); // 系统级,全局可见
    });

    it("系统级 NULL 通知两号都可见;A 号业务通知在 A2 号不可见", async () => {
      await service.create(ctxA, {
        notificationType: "task",
        title: "号a 事件",
        body: "b",
        entityType: "job",
        entityId: "j1",
      });
      await service.create(ctxNoAccount, {
        notificationType: "system",
        title: "系统通知",
        body: "b",
        entityType: "system",
        entityId: "s1",
      });
      // seed 的 3 行 accountId 均为 null(系统级):A 号 = 系统级 + 号a 事件。
      const seenByA = await service.list(ctxA, { page: 1, pageSize: 20 });
      expect(seenByA.items.some((r) => r.title === "号a 事件")).toBe(true);
      expect(seenByA.items.some((r) => r.title === "系统通知")).toBe(true);
      // A2 号:见系统级,不见号a 事件。
      const seenByA2 = await service.list(ctxA2, { page: 1, pageSize: 20 });
      expect(seenByA2.items.some((r) => r.title === "系统通知")).toBe(true);
      expect(seenByA2.items.some((r) => r.title === "号a 事件")).toBe(false);
      // 跨号业务通知 markRead → 404。
      const target = seenByA.items.find((r) => r.title === "号a 事件")!;
      await expect(
        service.markRead(ctxA2, target.id),
      ).rejects.toBeInstanceOf(OwnershipError);
    });

    it("未选号 ctx:只见系统级,不抛 AccountRequiredError(user 级表)", async () => {
      await service.create(ctxA, {
        notificationType: "task",
        title: "号a 事件",
        body: "b",
        entityType: "job",
        entityId: "j1",
      });
      const seen = await service.list(ctxNoAccount, { page: 1, pageSize: 20 });
      // seed 3 行系统级可见,号a 事件不可见。
      expect(seen.items.some((r) => r.title === "号a 事件")).toBe(false);
      expect(seen.items.length).toBeGreaterThan(0);
      // 未读计数同语义(seed 系统级未读 2 行:a-unread + b-unread 属 user-b 除外)。
      expect(await service.getUnreadCount(ctxNoAccount)).toBe(1);
    });
  });
});
