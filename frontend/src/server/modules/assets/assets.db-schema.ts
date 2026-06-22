// Assets Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies ASSETS_DDL at init alongside
// PROJECTS_DDL / IDENTITY_DDL / … / KNOWLEDGE_DDL (foundation §1: the
// pglite/Drizzle db factory is the shared-infra home). This module file is the
// in-module surface the repository imports; re-exporting keeps ONE source of
// truth for the schema (mirrors knowledge.db-schema.ts ↔
// backend/src/schema/knowledge.ts).
export {
  assets,
  assetFiles,
  assetUploads,
  ASSETS_DDL,
} from "@creatoros/backend";
