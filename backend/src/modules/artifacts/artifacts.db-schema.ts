// Artifacts Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies ARTIFACTS_DDL at init alongside
// PROJECTS_DDL / KNOWLEDGE_DDL / ASSETS_DDL / … (foundation §1: the pglite/Drizzle
// db factory is the shared-infra home). This module file is the in-module surface
// the repository imports; re-exporting keeps ONE source of truth for the schema
// (mirrors assets.db-schema.ts ↔ backend/src/schema/assets.ts).
export {
  artifacts,
  artifactVersions,
  artifactRelations,
  scriptSections,
  timelineSegments,
  ARTIFACTS_DDL,
} from "@creatoros/backend";
