import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createNotificationRepository,
  type NotificationRepository,
  type NotificationRow,
} from "./notifications.repository";
import { OwnershipError } from "./notifications.errors";

// Section A3 + B3 — pglite-backed repository integration tests. Asserts:
//   - A3: a notification round-trips all 9 columns with readAt nullable;
//   - B3.1: list returns only the user's rows, newest-first, paginated (total
//     ignores the page window);
//   - B3.2: MULTI-TENANT ownership — user A never sees user B's rows; markRead
//     on user B's id by user A throws OwnershipError (404, no existence leak);
//   - B3.3: countUnread counts only the user's unread rows;
//   - B3.4: markRead sets readAt; a second markRead is idempotent (same readAt).

const NOW = "2026-06-21T00:00:00.000Z";

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

describe("notifications.repository (pglite)", () => {
  let db: Db;
  let repo: NotificationRepository;

  beforeEach(async () => {
    ({ db } = await createDb());
    repo = createNotificationRepository(db);
  });

  it("A3: round-trips all 9 columns with readAt nullable", async () => {
    await repo.seed([
      row({
        id: "n-rt",
        userId: "user-a",
        notificationType: "publish",
        title: "数据已采集",
        body: "已回传",
        entityType: "publication",
        entityId: "pub-1",
        readAt: null,
        createdAt: NOW,
      }),
    ]);
    const { rows, total } = await repo.list("user-a", 1, 20);
    expect(total).toBe(1);
    const r = rows[0]!;
    expect(r).toMatchObject({
      id: "n-rt",
      userId: "user-a",
      notificationType: "publish",
      title: "数据已采集",
      body: "已回传",
      entityType: "publication",
      entityId: "pub-1",
      readAt: null,
      createdAt: NOW,
    });
  });

  it("B3.1: lists only the user's rows, newest-first, paginated", async () => {
    await repo.seed([
      row({ id: "a-old", userId: "user-a", createdAt: "2026-06-01T00:00:00.000Z" }),
      row({ id: "a-new", userId: "user-a", createdAt: "2026-06-10T00:00:00.000Z" }),
      row({ id: "a-mid", userId: "user-a", createdAt: "2026-06-05T00:00:00.000Z" }),
      row({ id: "b-1", userId: "user-b", createdAt: "2026-06-09T00:00:00.000Z" }),
    ]);
    const page1 = await repo.list("user-a", 1, 2);
    expect(page1.total).toBe(3); // total ignores the page window
    expect(page1.rows.map((r) => r.id)).toEqual(["a-new", "a-mid"]); // newest first
    const page2 = await repo.list("user-a", 2, 2);
    expect(page2.rows.map((r) => r.id)).toEqual(["a-old"]);
    // user-b's row never appears in user-a's list.
    expect(
      [...page1.rows, ...page2.rows].some((r) => r.userId !== "user-a"),
    ).toBe(false);
  });

  it("B3.2: enforces ownership — A excludes B's rows and markRead on B's id 404s", async () => {
    await repo.seed([row({ id: "b-notif", userId: "user-b", readAt: null })]);
    const aList = await repo.list("user-a", 1, 20);
    expect(aList.rows).toHaveLength(0);
    await expect(
      repo.markRead("user-a", "b-notif", NOW),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("B3.3: countUnread counts only the user's unread rows", async () => {
    await repo.seed([
      row({ id: "a-u1", userId: "user-a", readAt: null }),
      row({ id: "a-u2", userId: "user-a", readAt: null }),
      row({ id: "a-read", userId: "user-a", readAt: NOW }),
      row({ id: "b-u", userId: "user-b", readAt: null }),
    ]);
    expect(await repo.countUnread("user-a")).toBe(2);
    expect(await repo.countUnread("user-b")).toBe(1);
  });

  it("B3.4: markRead sets readAt and is idempotent on a second call", async () => {
    await repo.seed([row({ id: "a-mark", userId: "user-a", readAt: null })]);
    const first = await repo.markRead("user-a", "a-mark", NOW);
    expect(first.readAt).toBe(NOW);
    const LATER = "2026-06-22T00:00:00.000Z";
    const second = await repo.markRead("user-a", "a-mark", LATER);
    expect(second.readAt).toBe(NOW); // unchanged — original readAt preserved
    expect(await repo.countUnread("user-a")).toBe(0);
  });
});
