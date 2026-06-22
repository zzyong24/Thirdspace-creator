// Calibration Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies CALIBRATION_DDL at init alongside
// PROJECTS_DDL / MONETIZATION_DDL / … (foundation §1: the pglite/Drizzle db factory is
// the shared-infra home). This module file is the in-module surface the repository
// imports; re-exporting keeps ONE source of truth for the schema (mirrors
// monetization.db-schema.ts ↔ backend/src/schema/monetization.ts).
export {
  rubrics,
  rubricVersions,
  predictions,
  calibrationResults,
  CALIBRATION_DDL,
} from "@creatoros/backend";
