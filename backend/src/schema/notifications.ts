import { pgTable, text } from "drizzle-orm/pg-core";

// Notifications table (data-model NOTIFICATION block; SPEC §13 "通知" group).
// Canonical defs live in shared infra (@creatoros/backend) because createDb()
// applies NOTIFICATIONS_DDL at init alongside PROJECTS_DDL / IDENTITY_DDL /
// TAXONOMY_DDL (foundation §1: the pglite/Drizzle db factory is the shared-infra
// home). The notifications module (frontend/src/server/modules/notifications)
// re-exports these so there is ONE source of truth, mirroring identity
// (backend/src/schema/identity.ts ↔ identity.db-schema.ts).
//
// Notifications are an append-only ledger with a single `unread → read`
// transition (the nullable `read_at` column IS the transition state). Notification
// extends BaseEntity only (no Timestamped), so there is no `updated_at`. ISO-8601
// text timestamps match the contract `iso8601` primitive; ids are minted by the
// service/seed layer (no DB defaultRandom in the deterministic substrate). Every
// owned row carries user_id (foundation §2 ownership).

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  notificationType: text("notification_type").notNull(), // task|publish|import|system|ai
  title: text("title").notNull(),
  body: text("body").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  readAt: text("read_at"), // nullable → contract iso8601|null (the unread→read flag)
  createdAt: text("created_at").notNull(),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - notifications_user_created_ix: user-scoped newest-first list lookups.
//   - notifications_user_unread_ix: user-scoped unread count (read_at IS NULL).
export const NOTIFICATIONS_DDL = `
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user_created_ix ON notifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS notifications_user_unread_ix ON notifications(user_id, read_at);
`;
