// Reviews Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies REVIEWS_DDL at init alongside
// PROJECTS_DDL / ANALYTICS_DDL / … (foundation §1: the pglite/Drizzle db factory
// is the shared-infra home). This module file is the in-module surface the
// repository imports; re-exporting keeps ONE source of truth for the schema
// (mirrors analytics.db-schema.ts ↔ backend/src/schema/analytics.ts).
export {
  reviews,
  reviewInsights,
  reviewPublications,
  REVIEWS_DDL,
} from "@creatoros/backend";
