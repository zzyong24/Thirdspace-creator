// Notifications module schema surface — the contract Zod DTO this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs
// for this module"). The transport's toResource(row) and the contract test
// validate their outputs against this; the contract is the single source of truth
// for the wire shape (contract/src/resources/notifications.ts).
//
// Verified topology: the @creatoros/contract root barrel re-exports `ENDPOINTS`
// but NOT the resource files or `notificationsOperations`. The per-op response
// schema is reachable as ENDPOINTS.listNotifications.response (===
// markNotificationRead.response === notificationResource). So derive the DTO + its
// TS type from ENDPOINTS, not a non-existent `@creatoros/contract/resources/...`
// subpath (package.json exposes only the root export).
import { ENDPOINTS } from "@creatoros/contract";
import type { z } from "zod";

export const notificationResource = ENDPOINTS.listNotifications.response; // === markNotificationRead.response
export type NotificationResource = z.infer<typeof notificationResource>;
