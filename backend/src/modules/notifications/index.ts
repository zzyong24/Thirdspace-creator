// Notifications module — the ONLY public entry (foundation §1 / MODULE-ARCH §2).
// The composite transport imports Notifications ONLY through this file (never its
// internals): the service + repository factories to construct it over the shared
// db, the transport factory + op-id list the composite merges, NOTIFICATIONS_DDL,
// the contract DTO, and the error class the dispatch route maps. No cross-module
// repository import.

export {
  createNotificationsService,
  type NotificationsService,
  type ServiceDeps,
} from "./notifications.service";

export {
  createNotificationRepository,
  type NotificationRepository,
  type NotificationRow,
} from "./notifications.repository";

export {
  createNotificationsTransport,
  NOTIFICATION_OP_IDS,
} from "./notifications.transport";

export { NOTIFICATIONS_DDL } from "./notifications.db-schema";

export { OwnershipError } from "./notifications.errors";

export {
  notificationResource,
  type NotificationResource,
} from "./notifications.schema";
