// Knowledge Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies KNOWLEDGE_DDL at init alongside
// PROJECTS_DDL / IDENTITY_DDL / TAXONOMY_DDL / NOTIFICATIONS_DDL / SEARCH_DDL /
// SETTINGS_DDL (foundation §1: the pglite/Drizzle db factory is the shared-infra
// home). This module file is the in-module surface the repository imports;
// re-exporting keeps ONE source of truth for the schema (mirrors
// search.db-schema.ts ↔ backend/src/schema/search.ts).
export {
  knowledgeItems,
  knowledgeRevisions,
  knowledgeRelations,
  knowledgeFolders,
  KNOWLEDGE_DDL,
} from "@creatoros/backend";
