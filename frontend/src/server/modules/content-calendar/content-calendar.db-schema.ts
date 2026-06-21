// ContentCalendar Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies CONTENT_CALENDAR_DDL at init
// alongside PLATFORM_ACCOUNT_DDL / PUBLISHING_DDL / … (foundation §1: the pglite/Drizzle
// db factory is the shared-infra home). This module file is the in-module surface the
// repository imports; re-exporting keeps ONE source of truth for the schema (mirrors
// platform-account.db-schema.ts ↔ backend/src/schema/platform-account.ts).
export {
  contentCalendarEntries,
  publishingCadences,
  CONTENT_CALENDAR_DDL,
} from "@creatoros/backend";
