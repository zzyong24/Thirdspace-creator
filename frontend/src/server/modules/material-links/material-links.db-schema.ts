// MaterialLink Drizzle table + DDL. The canonical definition lives in shared infra
// (@creatoros/backend) because createDb() applies MATERIAL_LINKS_DDL at init alongside
// the other module DDLs (foundation §1: the pglite/Drizzle db factory is the shared-infra
// home). This module file is the in-module surface the repository imports; re-exporting
// keeps ONE source of truth for the schema (mirrors platform-account.db-schema.ts ↔
// backend/src/schema/platform-account.ts).
export { materialLinks, MATERIAL_LINKS_DDL } from "@creatoros/backend";
