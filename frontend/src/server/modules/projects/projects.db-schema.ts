// Projects Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies PROJECTS_DDL at init alongside
// the other modules' DDL (foundation §1: the pglite/Drizzle db factory is the
// shared-infra home). This module file is the in-module surface the repository
// imports; re-exporting keeps ONE source of truth for the schema (mirrors
// notifications.db-schema.ts ↔ backend/src/schema/projects.ts).
export {
  projects,
  projectActivities,
  projectStages,
  projectTargetPlatforms,
  contentOutputs,
  outputStages,
  tasks,
  PROJECTS_DDL,
} from "@creatoros/backend";
