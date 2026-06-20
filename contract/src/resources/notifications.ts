import { z } from "zod";
import { id, iso8601 } from "../primitives.js";

// NotificationType is not exported by primitives.ts; define it locally with the
// exact members from frontend/src/types/domain.ts.
const notificationType = z.enum(["task", "publish", "import", "system", "ai"]);

// Notification extends BaseEntity only (no Timestamped). It declares its own
// `createdAt` but no `updatedAt`, so no timestamp spread.
export const notificationResource = z.object({
  id,
  userId: id,
  notificationType,
  title: z.string(),
  body: z.string(),
  entityType: z.string(),
  entityId: id,
  readAt: iso8601.nullable(),
  createdAt: iso8601,
});
export type NotificationResource = z.infer<typeof notificationResource>;
