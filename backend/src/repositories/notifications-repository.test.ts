import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createNotificationsRepository,
  type NotificationsRepository,
} from "./notifications-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";
const LATER_NOW = "2026-06-13T12:00:00+08:00";

function deterministicDeps(overrides?: { now?: () => string; userId?: string }) {
  const counters = new Map<string, number>();
  const userId = overrides?.userId ?? "user-1";
  // id namespace is keyed off the owner so two repos over the same db (multi-user
  // isolation test) never collide on the notifications primary key.
  return {
    now: overrides?.now ?? (() => FIXED_NOW),
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${userId}-${n}`;
    },
    userId,
  };
}

let db: Db;
let repo: NotificationsRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createNotificationsRepository(db, deterministicDeps());
});

describe("NotificationsRepository (pglite-backed real persistence)", () => {
  it("event-emitted insert persists an unread row read back from SQL", async () => {
    const created = await repo.insert({
      notificationType: "task",
      title: "任务完成",
      body: "脚本已生成",
      entityType: "project",
      entityId: "project-1",
    });
    expect(created.id).toBe("notification-user-1-1");
    expect(created.userId).toBe("user-1");
    expect(created.notificationType).toBe("task");
    expect(created.readAt).toBeNull();
    expect(created.createdAt).toBe(FIXED_NOW);

    const list = await repo.list();
    expect(list.map((n) => n.id)).toEqual(["notification-user-1-1"]);
    expect(list[0]!.title).toBe("任务完成");
  });

  it("accepts every event-emitted notification type", async () => {
    for (const t of ["task", "publish", "import", "system", "ai"] as const) {
      await repo.insert({
        notificationType: t,
        title: t,
        body: t,
        entityType: "x",
        entityId: "x-1",
      });
    }
    const list = await repo.list();
    expect(list.map((n) => n.notificationType).sort()).toEqual(
      ["ai", "import", "publish", "system", "task"],
    );
  });

  it("lists newest-first and counts only unread rows", async () => {
    const a = await repo.insert({
      notificationType: "task",
      title: "A",
      body: "",
      entityType: "project",
      entityId: "p1",
    });
    const b = await repo.insert({
      notificationType: "publish",
      title: "B",
      body: "",
      entityType: "project",
      entityId: "p1",
    });

    // both unread initially
    expect(await repo.countUnread()).toBe(2);

    // newest-first ordering by createdAt (b inserted after a)
    const list = await repo.list();
    expect(list.map((n) => n.id)).toEqual([b.id, a.id]);

    await repo.markRead(a.id);
    expect(await repo.countUnread()).toBe(1);
  });

  it("markRead stamps read_at once and is idempotent (re-mark is a no-op)", async () => {
    const created = await repo.insert({
      notificationType: "system",
      title: "S",
      body: "",
      entityType: "system",
      entityId: "sys-1",
    });
    expect(created.readAt).toBeNull();

    // First mark stamps read_at with the current clock.
    const repoAtFirst = createNotificationsRepository(
      db,
      deterministicDeps({ now: () => FIXED_NOW }),
    );
    const firstRead = await repoAtFirst.markRead(created.id);
    expect(firstRead.readAt).toBe(FIXED_NOW);

    // Re-marking with a LATER clock must NOT move read_at (idempotent, set once).
    const repoAtLater = createNotificationsRepository(
      db,
      deterministicDeps({ now: () => LATER_NOW }),
    );
    const secondRead = await repoAtLater.markRead(created.id);
    expect(secondRead.readAt).toBe(FIXED_NOW);

    // persisted: a fresh list read reflects the single timestamp
    const persisted = (await repo.list()).find((n) => n.id === created.id)!;
    expect(persisted.readAt).toBe(FIXED_NOW);
    expect(await repo.countUnread()).toBe(0);
  });

  it("throws OwnershipError 404 surface for a missing notification", async () => {
    await expect(repo.markRead("nope")).rejects.toThrow(/not found/);
  });

  it("user-scopes list/count and hides other users' rows on markRead", async () => {
    // user-1 owns one notification
    await repo.insert({
      notificationType: "task",
      title: "mine",
      body: "",
      entityType: "project",
      entityId: "p1",
    });

    // user-2 (separate repo, same db) owns another
    const otherRepo = createNotificationsRepository(
      db,
      deterministicDeps({ userId: "user-2" }),
    );
    const theirs = await otherRepo.insert({
      notificationType: "ai",
      title: "theirs",
      body: "",
      entityType: "project",
      entityId: "p2",
    });

    // each user sees only their own rows
    expect((await repo.list()).map((n) => n.title)).toEqual(["mine"]);
    expect(await repo.countUnread()).toBe(1);
    expect((await otherRepo.list()).map((n) => n.title)).toEqual(["theirs"]);

    // user-1 cannot mark user-2's notification read (isolation → not found)
    await expect(repo.markRead(theirs.id)).rejects.toThrow(/not found/);
    // and it remains unread for its real owner
    expect(await otherRepo.countUnread()).toBe(1);
  });

  it("seeds notifications idempotently", async () => {
    const seedRow = {
      id: "seed-1",
      userId: "user-1",
      notificationType: "system",
      title: "种子通知",
      body: "",
      entityType: "system",
      entityId: "sys-1",
      readAt: null,
      createdAt: FIXED_NOW,
    };
    await repo.seedNotifications([seedRow]);
    await repo.seedNotifications([seedRow]); // again — conflict ignored
    const list = await repo.list();
    expect(list.filter((n) => n.id === "seed-1")).toHaveLength(1);
  });
});
