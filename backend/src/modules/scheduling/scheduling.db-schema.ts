// Scheduling Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because the pglite/Drizzle db factory is the shared-infra home
// (foundation §1) — createConfiguredDb() applies the versioned migrations
// (backend/drizzle/0009_scheduled_job_and_run.sql) that build these tables, and db.ts's
// `schema` union includes the scheduling module so drizzle types/queries know them. This
// module file is the in-module surface the repository imports; re-exporting keeps ONE
// source of truth for the schema (mirrors candidate.db-schema.ts ↔
// backend/src/schema/candidate.ts).
export {
  scheduledJobs,
  jobRuns,
  SCHEDULING_DDL,
} from "@creatoros/backend";
