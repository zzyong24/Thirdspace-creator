// Ingestion Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies INGESTION_DDL at init alongside
// ANALYTICS_DDL / PUBLISHING_DDL / … (foundation §1: the pglite/Drizzle db factory
// is the shared-infra home). This module file is the in-module surface the
// repository imports; re-exporting keeps ONE source of truth for the schema
// (mirrors analytics.db-schema.ts ↔ backend/src/schema/analytics.ts).
export {
  externalSources,
  ingestionRuns,
  ingestionErrors,
  ingestionRecords,
  INGESTION_DDL,
} from "@creatoros/backend";
