// Candidate Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies CANDIDATE_DDL at init alongside
// PROJECTS_DDL / POSITIONING_DDL / MONETIZATION_DDL / … (foundation §1: the
// pglite/Drizzle db factory is the shared-infra home). This module file is the
// in-module surface the repository imports; re-exporting keeps ONE source of truth
// for the schema (mirrors positioning.db-schema.ts ↔ backend/src/schema/positioning.ts).
export {
  candidates,
  audienceSignals,
  topicPromotions,
  topicPreferences,
  CANDIDATE_DDL,
} from "@creatoros/backend";
