import { z } from "zod";
import { defineEndpoint } from "../endpoint-definition";
import { id, paginationQuery } from "../primitives";
import { notificationResource } from "../resources/notifications";

// SPEC §13 "通知" group.
export const notificationsOperations = {
  listNotifications: defineEndpoint({
    id: "notifications.list",
    method: "GET",
    path: "/notifications",
    query: paginationQuery,
    response: notificationResource,
    isList: true,
    fr: ["FR-NOTIFICATIONS-LIST"],
  }),
  markNotificationRead: defineEndpoint({
    id: "notifications.read",
    method: "POST",
    path: "/notifications/:notificationId/read",
    params: z.object({ notificationId: id }),
    response: notificationResource,
    fr: ["FR-NOTIFICATIONS-READ"],
  }),
} as const;
