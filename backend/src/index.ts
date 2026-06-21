export { createDb, schema, type Db, type CreateDbOptions } from "./db";
export {
  createProjectRepository,
  type ProjectRepository,
  type RepoDeps,
} from "./repositories/project-repository";
export {
  createPersistenceTransport,
  UnsupportedOperationError,
} from "./persistence-transport";
export { AuthenticationError } from "./errors";
export {
  projects,
  projectActivities,
  projectStages,
  projectTargetPlatforms,
  contentOutputs,
  outputStages,
  tasks,
  PROJECTS_DDL,
} from "./schema/projects";
export { users, sessions, IDENTITY_DDL } from "./schema/identity";
export { tags, entityTags, TAXONOMY_DDL } from "./schema/taxonomy";
export { notifications, NOTIFICATIONS_DDL } from "./schema/notifications";
export { searchDocuments, searchHistory, SEARCH_DDL } from "./schema/search";
export {
  userPreferences,
  modelConfigurations,
  agentConfigurations,
  SETTINGS_DDL,
} from "./schema/settings";
export {
  knowledgeItems,
  knowledgeRevisions,
  knowledgeRelations,
  KNOWLEDGE_DDL,
} from "./schema/knowledge";
export {
  assets,
  assetFiles,
  assetUploads,
  ASSETS_DDL,
} from "./schema/assets";
export {
  artifacts,
  artifactVersions,
  artifactRelations,
  thesisNodes,
  scriptSections,
  evidenceLinks,
  timelineSegments,
  ARTIFACTS_DDL,
} from "./schema/artifacts";
export type { RequestContext } from "./request-context";
// Re-export the drizzle query helpers modules need so per-module repositories
// under the Next app (which does not declare drizzle-orm directly) build their
// user-scoped queries against the ONE shared-infra drizzle (foundation §1: the
// db factory + ORM live in @creatoros/backend). Identity's repository is the
// first such in-app module.
export { eq, and, or, asc, desc, sql, isNull, count, ilike } from "drizzle-orm";
