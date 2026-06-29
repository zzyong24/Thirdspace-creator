// Identity Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies IDENTITY_DDL at init alongside
// PROJECTS_DDL (foundation §1: the pglite/Drizzle db factory is the shared-infra
// home). This module file is the in-module surface the repository (Task 3) and
// service import; re-exporting keeps ONE source of truth for the schema.
export {
  users,
  sessions,
  IDENTITY_DDL,
} from "@creatoros/backend";
