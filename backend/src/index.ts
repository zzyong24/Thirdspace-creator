export {
  createDb,
  createRuntimeDb,
  createConfiguredDb,
  resolveDbDriver,
  defaultPgliteDataDir,
  schema,
  type Db,
  type CreateDbOptions,
  type RuntimeDb,
  type ConfiguredDb,
  type ResolvedDbDriver,
  type ResolveDbDriverOptions,
  type DbDriverKind,
} from "./db";
export {
  createProjectRepository,
  type ProjectRepository,
  type RepoDeps,
} from "./repositories/project-repository";
export {
  createPersistenceTransport,
  UnsupportedOperationError,
} from "./persistence-transport";
export { AuthenticationError, OwnershipError } from "./errors";
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
  storageConfigs,
  skillConfigOverrides,
  SETTINGS_DDL,
} from "./schema/settings";
export type { SkillConfigOverrideRow } from "./schema/settings";
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
export {
  productions,
  productionSegments,
  segmentAssets,
  exportRecords,
  PRODUCTION_DDL,
} from "./schema/production";
export {
  publications,
  publicationRevisions,
  PUBLISHING_DDL,
} from "./schema/publishing";
export {
  metricSnapshots,
  metricValues,
  retentionPoints,
  audienceSnapshots,
  ANALYTICS_DDL,
} from "./schema/analytics";
export {
  externalSources,
  ingestionRuns,
  ingestionErrors,
  ingestionRecords,
  douyinThrottleState,
  INGESTION_DDL,
  DOUYIN_THROTTLE_STATE_DDL,
} from "./schema/ingestion";
export {
  reviews,
  reviewInsights,
  reviewPublications,
  REVIEWS_DDL,
} from "./schema/reviews";
export {
  learnings,
  learningApplications,
  LEARNINGS_DDL,
} from "./schema/learnings";
export {
  aiConversations,
  aiMessages,
  aiTasks,
  aiTaskReferences,
  aiTaskResults,
  aiTaskSteps,
  AI_DDL,
} from "./schema/ai";
export {
  creatorProfiles,
  positioningStatements,
  POSITIONING_DDL,
} from "./schema/positioning";
// [T-052 裁决③] monetization schema 导出(products/offers/leads/conversionEvents/
// contentOutputProducts/MONETIZATION_DDL)已随变现中心物理删除(宪法 §8)。
// 数据库中已建的表留存无害(迁移基线不回滚),仅代码层不再引用。
export {
  candidates,
  audienceSignals,
  topicPromotions,
  CANDIDATE_DDL,
} from "./schema/candidate";
export {
  rubrics,
  rubricVersions,
  predictions,
  calibrationResults,
  calibrationRuleSuggestions,
  CALIBRATION_DDL,
} from "./schema/calibration";
export {
  platformAccounts,
  PLATFORM_ACCOUNT_DDL,
} from "./schema/platform-account";
export {
  contentCalendarEntries,
  publishingCadences,
  CONTENT_CALENDAR_DDL,
} from "./schema/content-calendar";
export {
  materialLinks,
  MATERIAL_LINKS_DDL,
} from "./schema/material-links";
export {
  scheduledJobs,
  jobRuns,
  SCHEDULING_DDL,
} from "./schema/scheduling";
export type { RequestContext } from "./request-context";
// Re-export the drizzle query helpers modules need so per-module repositories
// under the Next app (which does not declare drizzle-orm directly) build their
// user-scoped queries against the ONE shared-infra drizzle (foundation §1: the
// db factory + ORM live in @creatoros/backend). Identity's repository is the
// first such in-app module.
export { eq, and, or, asc, desc, sql, isNull, count, ilike, inArray, gte, lte } from "drizzle-orm";
