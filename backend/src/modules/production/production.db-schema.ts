// Production Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies PRODUCTION_DDL at init alongside
// PROJECTS_DDL / ARTIFACTS_DDL / ASSETS_DDL / … (foundation §1: the pglite/Drizzle
// db factory is the shared-infra home). This module file is the in-module surface
// the repository imports; re-exporting keeps ONE source of truth for the schema
// (mirrors artifacts.db-schema.ts ↔ backend/src/schema/artifacts.ts).
export {
  productions,
  productionSegments,
  segmentAssets,
  exportRecords,
  PRODUCTION_DDL,
} from "@creatoros/backend";
