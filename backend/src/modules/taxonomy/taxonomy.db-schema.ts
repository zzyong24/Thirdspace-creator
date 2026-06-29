// Taxonomy Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies TAXONOMY_DDL at init alongside
// PROJECTS_DDL / IDENTITY_DDL (foundation §1: the pglite/Drizzle db factory is
// the shared-infra home). This module file is the in-module surface the
// repository imports; re-exporting keeps ONE source of truth for the schema
// (mirrors identity.db-schema.ts ↔ backend/src/schema/identity.ts).
export { tags, entityTags, TAXONOMY_DDL } from "@creatoros/backend";
