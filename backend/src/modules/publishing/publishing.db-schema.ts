// Publishing Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies PUBLISHING_DDL at init alongside
// PROJECTS_DDL / PRODUCTION_DDL / … (foundation §1: the pglite/Drizzle db factory
// is the shared-infra home). This module file is the in-module surface the
// repository imports; re-exporting keeps ONE source of truth for the schema
// (mirrors production.db-schema.ts ↔ backend/src/schema/production.ts).
export {
  publications,
  publicationRevisions,
  PUBLISHING_DDL,
} from "@creatoros/backend";
