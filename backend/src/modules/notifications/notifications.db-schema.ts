// Notifications Drizzle table + DDL. The canonical definitions live in shared
// infra (@creatoros/backend) because createDb() applies NOTIFICATIONS_DDL at init
// alongside PROJECTS_DDL / IDENTITY_DDL / TAXONOMY_DDL (foundation §1: the
// pglite/Drizzle db factory is the shared-infra home). This module file is the
// in-module surface the repository imports; re-exporting keeps ONE source of
// truth for the schema (mirrors taxonomy.db-schema.ts ↔
// backend/src/schema/taxonomy.ts).
export { notifications, NOTIFICATIONS_DDL } from "@creatoros/backend";
