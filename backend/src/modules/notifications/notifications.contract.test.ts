import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db, UnsupportedOperationError } from "@creatoros/backend";
import {
  ENDPOINTS,
  createClient,
  listEnvelope,
  successEnvelope,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import {
  createNotificationRepository,
  type NotificationRow,
} from "./notifications.repository";
import { createNotificationsService } from "./notifications.service";
import { createNotificationsTransport } from "./notifications.transport";
import { notificationResource } from "./notifications.schema";

// Section E4 — drive each op through an in-process client (createClient over the
// transport) so the endpoint's own `response` schema parses the envelope: a call
// returning without throw == DTO conformance. Also parse the raw envelope with
// listEnvelope / successEnvelope for an explicit assertion. Asserts readAt:null
// (unread notif-1) AND a non-null readAt (read notif-2) both conform. Unknown op
// id → UnsupportedOperationError.

const NOW = "2026-06-21T00:00:00.000Z";

const ctx: RequestContext = {
  userId: "user-c",
  requestId: "req-c",
  source: "user",
};

function row(over: Partial<NotificationRow> & { id: string }): NotificationRow {
  return {
    id: over.id,
    userId: over.userId ?? ctx.userId,
    // [T-332 S2] 缺省 null = 系统级(全局可见);ctx 无号时也可见。
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

const ep = (id: string, isList = false) => ({ id, isList }) as unknown as Endpoint;

describe("notifications.transport (contract conformance)", () => {
  let db: Db;
  let transport: Transport;

  beforeEach(async () => {
    ({ db } = await createDb());
    const repo = createNotificationRepository(db);
    await repo.seed([
      // notif-1 unread (readAt null), notif-2 read (readAt non-null).
      row({ id: "notif-1", notificationType: "task", readAt: null, createdAt: "2026-06-20T00:00:00.000Z" }),
      row({
        id: "notif-2",
        notificationType: "publish",
        readAt: "2026-06-12T12:00:00.000Z",
        createdAt: "2026-06-12T10:30:00.000Z",
      }),
    ]);
    let seq = 0;
    transport = createNotificationsTransport(() =>
      createNotificationsService(repo, {
        now: () => NOW,
        nextId: (prefix: string) => `${prefix}-${++seq}`,
      }),
    );
  });

  it("listNotifications → NotificationResource[] list envelope (readAt null + non-null both conform)", async () => {
    const client = createClient(ENDPOINTS, transport, ctx);
    const items = (await client.listNotifications({
      params: undefined,
      query: { page: 1, pageSize: 20 },
      body: undefined,
    })) as unknown as unknown[];
    expect(items).toHaveLength(2);
    items.forEach((r) => expect(() => notificationResource.parse(r)).not.toThrow());

    // Explicit raw-envelope assertion (listEnvelope over the DTO).
    const raw = await transport.request(
      ep("notifications.list", true),
      { query: { page: 1, pageSize: 20 } } as never,
      ctx,
    );
    const parsed = listEnvelope(notificationResource).parse(raw);
    const byId = new Map(parsed.data.map((n) => [n.id, n]));
    expect(byId.get("notif-1")?.readAt).toBeNull(); // unread passes
    expect(byId.get("notif-2")?.readAt).not.toBeNull(); // read passes
  });

  it("markNotificationRead → NotificationResource single envelope", async () => {
    const client = createClient(ENDPOINTS, transport, ctx);
    const read = await client.markNotificationRead({
      params: { notificationId: "notif-1" },
      query: undefined,
      body: undefined,
    });
    expect(() => notificationResource.parse(read)).not.toThrow();
    expect(read.readAt).toBe(NOW);

    // Explicit raw-envelope assertion (successEnvelope over the DTO).
    const raw = await transport.request(
      ep("notifications.read"),
      { params: { notificationId: "notif-2" } } as never,
      ctx,
    );
    const parsed = successEnvelope(notificationResource).parse(raw);
    expect(parsed.data.readAt).not.toBeNull();
  });

  it("unknown op id → UnsupportedOperationError", async () => {
    await expect(
      transport.request(ep("notifications.nope"), { } as never, ctx),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });
});
