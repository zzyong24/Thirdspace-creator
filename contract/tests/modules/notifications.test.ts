import { describe, it, expect } from "vitest";
import { notificationResource } from "../../src/resources/notifications";
import { notificationsOperations } from "../../src/operations/notifications";

describe("notifications contract", () => {
  it("parses a Notification resource", () => {
    const n = notificationResource.parse({
      id: "notif-1",
      userId: "user-zyongzhu",
      notificationType: "task",
      title: "脚本大纲即将到期",
      body: "AI Native Browser 项目的脚本大纲还有 1 天到期。",
      entityType: "task",
      entityId: "task-ainativebrowser-script-outline",
      readAt: null,
      createdAt: "2026-06-13T02:00:00.000Z",
    });
    expect(n.notificationType).toBe("task");
    expect(n.readAt).toBeNull();
  });

  it("registers the list + read endpoints with FR ids", () => {
    expect(notificationsOperations.listNotifications.method).toBe("GET");
    expect(notificationsOperations.listNotifications.path).toBe(
      "/notifications",
    );
    expect(notificationsOperations.listNotifications.isList).toBe(true);
    expect(notificationsOperations.markNotificationRead.method).toBe("POST");
    expect(notificationsOperations.markNotificationRead.path).toBe(
      "/notifications/:notificationId/read",
    );
    expect(
      notificationsOperations.listNotifications.fr.length,
    ).toBeGreaterThan(0);
  });
});
