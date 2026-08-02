// Positioning Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies POSITIONING_DDL at init alongside
// PROJECTS_DDL / LEARNINGS_DDL / … (foundation §1: the pglite/Drizzle db factory is
// the shared-infra home). This module file is the in-module surface the repository
// imports; re-exporting keeps ONE source of truth for the schema (mirrors
// learnings.db-schema.ts ↔ backend/src/schema/learnings.ts).
export {
  creatorProfiles,
  positioningStatements,
  positioningDiscoverySessions,
  POSITIONING_DDL,
} from "@creatoros/backend";
