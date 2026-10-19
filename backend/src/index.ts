export {executionStreamEvents} from "./schema/execution-stream";
export {creativeCanvases,canvasGenerationLinks,canvasAgentProposals} from "./schema/creative-canvas";
export { articleAnchors, articleCandidates } from "./schema/articles";
export { creativeResults, creativeResultBundles, outputMediaAttempts } from "./schema/creative-results";
export { graphicPostAnchors, graphicPostTextCandidates } from "./modules/graphic-posts/graphic-posts.schema";
export {workbenchArtifactLineages,workbenchArtifactLineageVersions} from "./schema/workbench-artifacts";

export {
  createDb,
  createRuntimeDb,
  createConfiguredDb,
  resolveDbDriver,
  defaultPgliteDataDir,
  isFilesystemAccessError,
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
  executionTasks,
  executionControlReceipts,
  intelligenceCollections,
  executionCalls,
  executionEvidence,
  intelligenceItems,
  intelligenceMigrationLedgers,
  intelligenceSources,
  intelligenceSourceCollectionMemberships,
  intelligenceSyncRunEvents,
  intelligenceSyncRuns,
  intelligenceTransforms,
  itemMetricSnapshots,
  itemSourceObservations,
  itemTranscripts,
  projectIntelligenceReferences,
  sourceSnapshots,
} from "./schema/intelligence";
export {
  createProjectRepository,
  type ProjectRepository,
  type RepoDeps,
} from "./repositories/project-repository";
export {
  createPersistenceTransport,
  UnsupportedOperationError,
} from "./persistence-transport";
export {
  AuthenticationError,
  OwnershipError,
  // [T-332 S2] 账号全域隔离:未选号访问 per-account 域的引导态错误 + service 入口统一断言。
  AccountRequiredError,
  requireAccountId,
} from "./errors";
export {
  projects,
  projectActivities,
  projectStages,
  projectTargetPlatforms,
  contentOutputs,
  outputCreateRequests,
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
  channelModelCredentials,
  agentConfigurations,
  storageConfigs,
  skillConfigOverrides,
  skillConfigOverrideVersions,
  accountSkillOverlays,
  accountSkillOverlayVersions,
  reportingConsents,
  reportingOutbox,
  reportingConsentChanges,
  SETTINGS_DDL,
} from "./schema/settings";
export type {
  SkillConfigOverrideRow,
  SkillConfigOverrideVersionRow,
  AccountSkillOverlayRow,
  AccountSkillOverlayVersionRow,
} from "./schema/settings";
export {
  knowledgeItems,
  knowledgeRevisions,
  knowledgeRelations,
  knowledgeFolders,
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
  scriptSections,
  timelineSegments,
  ARTIFACTS_DDL,
} from "./schema/artifacts";
export {
  productions,
  productionSegments,
  productionEditVersions,
  productionRenderRequests,
  productionMediaRequests,
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
// T-086 审核门(违禁词 lint 规则库 + 稿面审核报告)。
export {
  reviewRules,
  scriptReviewReports,
  REVIEW_GATE_DDL,
} from "./schema/review-gate";
export {
  learnings,
  learningApplications,
  LEARNINGS_DDL,
} from "./schema/learnings";
export {
  aiConversations,
  aiMessages,
  aiTasks,
  projectTranscriptionRequests,
  aiTaskReferences,
  aiTaskResults,
  aiTaskSteps,
  AI_DDL,
} from "./schema/ai";
export {
  creatorProfiles,
  positioningStatements,
  positioningDiscoverySessions,
  POSITIONING_DDL,
} from "./schema/positioning";
// [T-052 裁决③] monetization schema 导出(products/offers/leads/conversionEvents/
// contentOutputProducts/MONETIZATION_DDL)已随变现中心物理删除(宪法 §8)。
// 数据库中已建的表留存无害(迁移基线不回滚),仅代码层不再引用。
export {
  candidates,
  audienceSignals,
  topicPromotions,
  topicPreferences,
  topicWorkspaces,
  topicProposalFeedback,
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
// [T-212a] 对标源 + 对标作品(选题/对标强化)。
export {
  benchmarkSources,
  benchmarkWorks,
  BENCHMARK_DDL,
} from "./schema/benchmark";
// [T-235b] 通用网页信源(热点多源证据)。
export {
  trendSources,
  TREND_SOURCES_DDL,
} from "./schema/trend-sources";
// [T-235c] 指定抖音收藏夹(收藏夹跟拍信号源)。
export {
  favoritesFolders,
  favoritesItems,
  FAVORITES_DDL,
} from "./schema/favorites";
// [T-235d] 正向归因回流(选题验证库)。
export {
  topicAttributions,
  TOPIC_ATTRIBUTION_DDL,
} from "./schema/topic-attribution";
// [T-370a] 浏览器登录态系统化(web 域 storageState 加密单一真值;抖音红线不进本表)。
export {
  browserSessions,
  BROWSER_SESSIONS_DDL,
} from "./schema/browser-sessions";
// T-147 P5 桌面激活授权(activation_state 一机一码激活态表)。
export { activationState } from "./schema/activation";
export {
  cliInvocations,
  cliInvocationResults,
  type CliInvocationRow,
  type CliInvocationResultRow,
} from "./schema/cli-invocations";
export {
  createCliInvocationService,
  type CliInvocationService,
  type CliInvocationReceipt,
  type BeginCliInvocationInput,
  type BeginCliInvocationResult,
} from "./modules/cli-invocations/cli-invocations.service";
export type { ActivationStateRow } from "./schema/activation";
export type { RequestContext } from "./request-context";
// [T-363] 清库/重置保留表单一真值清单 + 「重置工作区」归档后的 user 级资产迁回。
export { PRESERVE_TABLES, PRESERVE_TABLE_SET } from "./reset-preserve";
export {
  restorePreservedUserAssets,
  findPreserveRestoreCandidate,
  PRESERVE_RESTORE_MARKER,
} from "./workspace-restore";
export type {
  WorkspaceRestoreReport,
  RestoreTableReport,
  RestoreTableStatus,
} from "./workspace-restore";
// T-147 P2 本地加密 —— 模型 API key 静态加密工具(AES-256-GCM + keychain/env master key)。
// settings.repository 透明加解密引用它;脚本(key 初始化/存量迁移)也从这里取。
export {
  ENC_PREFIX,
  isEncrypted,
  encryptSecret,
  decryptSecret,
  resolveMasterKey,
} from "./secret-crypto";
export type { ResolvedMasterKey, MasterKeySource } from "./secret-crypto";
// Re-export the drizzle query helpers modules need so per-module repositories
// under the Next app (which does not declare drizzle-orm directly) build their
// user-scoped queries against the ONE shared-infra drizzle (foundation §1: the
// db factory + ORM live in @creatoros/backend). Identity's repository is the
// first such in-app module.
export { eq, and, or, asc, desc, sql, isNull, count, like, ilike, inArray, gte, lte, lt } from "drizzle-orm";

export { assetTagAdoptions, knowledgeAdoptions } from "./schema/proposal-adoptions";

export { executionBrowserProfileLeases } from "./schema/execution-browser-profile-leases";

export {workspaceKey,workspaceFilter,workspaceStamp,requireWorkspace,assertWritableWorkspace,type WorkspaceKey} from "./workspace-scope";

export {ConflictError} from "./errors";

export {resourceAccessGrants,workspaceBlobObjects} from "./schema/resource-access";

export {resourceAccessGrantUses} from "./schema/resource-access";
export {momentsAnchors,momentsRequests} from "./schema/moments";

export {workCompositions,workCompositionVersions,workCompositionRequests} from "./schema/work-compositions";

export {workMaterialAssociations,workMaterialReceipts,workDependencies} from "./schema/work-materials";

export {workReviewReports,workReviewConfirmations,workReviewRequests} from "./schema/work-reviews";

export {productionFileBindingRequests,productionFileBindings} from "./schema/production-file-bindings";

export {momentsCandidates} from "./schema/moments-model";

export * from "./schema/creative-canvas";

export {publicationCoverRequests} from "./schema/publication-cover";
