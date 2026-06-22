// PlatformAccount Drizzle table + DDL. The canonical definition lives in shared infra
// (@creatoros/backend) because createDb() applies PLATFORM_ACCOUNT_DDL at init
// alongside PROJECTS_DDL / PUBLISHING_DDL / … (foundation §1: the pglite/Drizzle db
// factory is the shared-infra home). This module file is the in-module surface the
// repository imports; re-exporting keeps ONE source of truth for the schema (mirrors
// candidate.db-schema.ts ↔ backend/src/schema/candidate.ts).
export {
  platformAccounts,
  PLATFORM_ACCOUNT_DDL,
} from "@creatoros/backend";
