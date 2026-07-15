import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createNotificationRepository,
  type NotificationRepository,
  type NotificationRow,
} from "./notifications.repository";
import { OwnershipError } from "./notifications.errors";

// Section A3 + B3 — pglite-backed repository integration tests. Asserts:
//   - A3: a notification round-trips all 10 columns with readAt nullable;
//   - B3.1: list returns only the user's rows, newest-first, paginated (total
//     ignores the page window);
//   - B3.2: MULTI-TENANT ownership — user A never sees user B's rows; markRead
//     on user B's id by user A throws OwnershipError (404, no existence leak);
//   - B3.3: countUnread counts only the user's unread rows;
//   - B3.4: markRead sets readAt; a second markRead is idempotent (same readAt).
//   - [T-332 S2 · C-02] 账号可见集:有号 → 当前号 + 系统级(NULL,设计性 OR-NULL,
//     全仓唯一例外);无号 → 只见系统级;跨号业务通知 by-id → 404。

const NOW = "2026-06-21T00:00:00.000Z";
const ACC_A = "acct-a";
const ACC_B = "acct-b";

function row(over: Partial<NotificationRow> & { id: string }): NotificationRow {
  return {
    id: over.id,
    userId: over.userId ?? "user-a",
    // [T-332 S2] 缺省 null = 系统级通知(全局所有号可见,设计语义)。
    accountId: over.accountId ?? null,
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

  it("A3: round-trips all 10 columns with readAt/accountId nullable", async () => {
    await repo.seed([
      row({
        id: "n-rt",
        userId: "user-a",
        accountId: ACC_A,
        notificationType: "publish",
        title: "数据已采集",
        body: "已回传",
        entityType: "publication",
        entityId: "pub-1",
        readAt: null,
        createdAt: NOW,
      }),
    ]);
    const { rows, total } = await repo.list("user-a", ACC_A, 1, 20);
    expect(total).toBe(1);
    const r = rows[0]!;
    expect(r).toMatchObject({
      id: "n-rt",
      userId: "user-a",
      accountId: ACC_A,
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
    const page1 = await repo.list("user-a", ACC_A, 1, 2);
    expect(page1.total).toBe(3); // total ignores the page window
    expect(page1.rows.map((r) => r.id)).toEqual(["a-new", "a-mid"]); // newest first
    const page2 = await repo.list("user-a", ACC_A, 2, 2);
    expect(page2.rows.map((r) => r.id)).toEqual(["a-old"]);
    // user-b's row never appears in user-a's list.
    expect(
      [...page1.rows, ...page2.rows].some((r) => r.userId !== "user-a"),
    ).toBe(false);
  });

  it("B3.2: enforces ownership — A excludes B's rows and markRead on B's id 404s", async () => {
    await repo.seed([row({ id: "b-notif", userId: "user-b", readAt: null })]);
    const aList = await repo.list("user-a", ACC_A, 1, 20);
    expect(aList.rows).toHaveLength(0);
    await expect(
      repo.markRead("user-a", ACC_A, "b-notif", NOW),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("B3.3: countUnread counts only the user's unread rows", async () => {
    await repo.seed([
      row({ id: "a-u1", userId: "user-a", readAt: null }),
      row({ id: "a-u2", userId: "user-a", readAt: null }),
      row({ id: "a-read", userId: "user-a", readAt: NOW }),
      row({ id: "b-u", userId: "user-b", readAt: null }),
    ]);
    expect(await repo.countUnread("user-a", ACC_A)).toBe(2);
    expect(await repo.countUnread("user-b", ACC_B)).toBe(1);
  });

  it("B3.4: markRead sets readAt and is idempotent on a second call", async () => {
    await repo.seed([row({ id: "a-mark", userId: "user-a", readAt: null })]);
    const first = await repo.markRead("user-a", ACC_A, "a-mark", NOW);
    expect(first.readAt).toBe(NOW);
    const LATER = "2026-06-22T00:00:00.000Z";
    const second = await repo.markRead("user-a", ACC_A, "a-mark", LATER);
    expect(second.readAt).toBe(NOW); // unchanged — original readAt preserved
    expect(await repo.countUnread("user-a", ACC_A)).toBe(0);
  });

  // ── [T-332 S2 · C-02] 账号可见集(设计性 OR-NULL,非存量兼容,全仓唯一例外)──
  describe("account visibility (T-332 S2 · C-02)", () => {
    beforeEach(async () => {
      await repo.seed([
        // 系统级(NULL):激活到期——所有号可见。
        row({ id: "sys-1", accountId: null, notificationType: "system", title: "激活到期" }),
        // A 号业务通知 / B 号业务通知。
        row({ id: "acc-a-1", accountId: ACC_A, notificationType: "task", title: "号a 采集失败" }),
        row({ id: "acc-b-1", accountId: ACC_B, notificationType: "task", title: "号b 任务完成" }),
      ]);
    });

    it("系统级 NULL 通知两号都可见;A 号业务通知 B 号不可见", async () => {
      const seenByA = await repo.list("user-a", ACC_A, 1, 20);
      expect(seenByA.rows.map((r) => r.id).sort()).toEqual(["acc-a-1", "sys-1"]);
      const seenByB = await repo.list("user-a", ACC_B, 1, 20);
      expect(seenByB.rows.map((r) => r.id).sort()).toEqual(["acc-b-1", "sys-1"]);
    });

    it("未选号(null)只见系统级", async () => {
      const seen = await repo.list("user-a", null, 1, 20);
      expect(seen.rows.map((r) => r.id)).toEqual(["sys-1"]);
      expect(seen.total).toBe(1);
      // 未读计数同语义。
      expect(await repo.countUnread("user-a", null)).toBe(1);
    });

    it("未读计数按可见集(当前号 + 系统级)", async () => {
      expect(await repo.countUnread("user-a", ACC_A)).toBe(2); // sys-1 + acc-a-1
      expect(await repo.countUnread("user-a", ACC_B)).toBe(2); // sys-1 + acc-b-1
    });

    it("markRead:可标系统级与本号;跨号业务通知 404;未选号可标系统级", async () => {
      // A 号视角:可标系统级 + 本号。
      expect((await repo.markRead("user-a", ACC_A, "sys-1", NOW)).readAt).toBe(NOW);
      expect((await repo.markRead("user-a", ACC_A, "acc-a-1", NOW)).readAt).toBe(NOW);
      // 跨号业务通知 → OwnershipError(404,不泄露存在)。
      await expect(
        repo.markRead("user-a", ACC_A, "acc-b-1", NOW),
      ).rejects.toBeInstanceOf(OwnershipError);
      // 未选号:只可标系统级(0 号也能收/读系统通知)。
      await repo.seed([row({ id: "sys-2", accountId: null, notificationType: "system" })]);
      expect((await repo.markRead("user-a", null, "sys-2", NOW)).readAt).toBe(NOW);
      await expect(
        repo.markRead("user-a", null, "acc-b-1", NOW),
      ).rejects.toBeInstanceOf(OwnershipError);
    });

    it("create 落库带 stamp;NULL stamp = 系统级", async () => {
      const stamped = await repo.create(
        row({ id: "c-1", accountId: ACC_A, title: "号a 事件" }),
      );
      expect(stamped.accountId).toBe(ACC_A);
      const global = await repo.create(
        row({ id: "c-2", accountId: null, notificationType: "system" }),
      );
      expect(global.accountId).toBeNull();
      // 两号都能见系统级 c-2;c-1 只有 A 号见。
      const byB = await repo.list("user-a", ACC_B, 1, 20);
      expect(byB.rows.some((r) => r.id === "c-2")).toBe(true);
      expect(byB.rows.some((r) => r.id === "c-1")).toBe(false);
    });
  });
});
