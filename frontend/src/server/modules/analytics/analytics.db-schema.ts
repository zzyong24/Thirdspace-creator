// Analytics Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies ANALYTICS_DDL at init alongside
// PUBLISHING_DDL / PROJECTS_DDL / … (foundation §1: the pglite/Drizzle db factory
// is the shared-infra home). This module file is the in-module surface the
// repository imports; re-exporting keeps ONE source of truth for the schema
// (mirrors publishing.db-schema.ts ↔ backend/src/schema/publishing.ts).
export {
  metricSnapshots,
  metricValues,
  retentionPoints,
  audienceSnapshots,
  ANALYTICS_DDL,
} from "@creatoros/backend";
