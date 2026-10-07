export * from "./resources/work-source-select";
export * from "./resources/production-time-mapping";
export const CONTRACT_API_BASE = "/api/v1";
export * from "./resources/production-editor";

export * from "./envelope";
export * from "./primitives";
export * from "./endpoints";
export * from "./request-context";
export * from "./transport";
export * from "./client";
export * from "./local-platform";
export * from "./cli-policy";
export * from "./version";
export {canvasDocumentSchema,canvasNodeSchema,canvasEdgeSchema,creativeCanvasResource,canvasGenerationLinkResource,emptyCanvasDocument,type CanvasDocument,type CanvasNode,type CreativeCanvasResource} from "./resources/creative-canvas";
export {canvasProposalOperationSchema,canvasProposalResource} from "./resources/creative-canvas";
export * from "./resources/articles";
export * from "./resources/graphic-posts";
export * from "./resources/production-main-track";
export * from "./resources/creative-results";
export * from "./resources/output-conversions";
export { contentOutputResource, type ContentOutputResource } from "./resources/projects";

export {
  knowledgeFolderResource,
  type KnowledgeFolderResource,
} from "./resources/knowledge";

// Taxonomy resource DTOs (module-04). Resources are normally reached via
// `ENDPOINTS.<op>.response`, but the taxonomy module's `<module>.schema.ts`
// re-exports these named Zod schemas + types directly (foundation §5 / Step 0c:
// "export the resource from contract/src/index.ts"), so the service/repository
// layer can validate against the single source of truth.
export {
  tagResource,
  entityTagResource,
  tagEntityType,
  type TagResource,
  type EntityTagResource,
  type TagEntityType,
} from "./resources/taxonomy";

// contract v0.4 — 七步 (seven-step) module resource DTOs. Re-exported so each
// module's `<module>.schema.ts` can validate against the single source of truth
// (same convention as taxonomy above).
export {
  creatorProfileResource,
  positioningStatementResource,
  positioningGateResultResource,
  positioningCenterResource,
  positioningDiscoverySourceMode,
  positioningDiscoveryThemeId,
  positioningDiscoverySessionResource,
  positioningDiscoveryAnswerResource,
  positioningDiscoveryWebReferenceResource,
  positioningDiscoveryProposalResource,
  positioningDiscoveryConfirmResultResource,
  type CreatorProfileResource,
  type PositioningStatementResource,
  type PositioningGateResultResource,
  type PositioningCenterResource,
  type PositioningDiscoverySourceMode,
  type PositioningDiscoveryThemeId,
  type PositioningDiscoverySessionResource,
  type PositioningDiscoveryAnswerResource,
  type PositioningDiscoveryWebReferenceResource,
  type PositioningDiscoveryProposalResource,
  type PositioningDiscoveryConfirmResultResource,
} from "./resources/positioning";
// [T-052 裁决③] monetization resource 导出(product/offer/lead/conversionEvent/
// contentOutputProduct/funnelStage/monetizationFunnel)已随变现中心物理删除(宪法 §8)。
export {
  candidateResource,
  candidateCard,
  candidateSourceReference,
  benchmarkTeardownRef,
  audienceSignalResource,
  topicPromotionResource,
  topicsOverviewResource,
  type CandidateResource,
  type CandidateCard,
  type CandidateSourceReference,
  type BenchmarkTeardownRef,
  type AudienceSignalResource,
  type TopicPromotionResource,
  type TopicsOverviewResource,
} from "./resources/candidate";
export {
  rubricResource,
  rubricVersionResource,
  predictionResource,
  calibrationResultResource,
  type RubricResource,
  type RubricVersionResource,
  type PredictionResource,
  type CalibrationResultResource,
} from "./resources/calibration";
export {
  platformAccountResource,
  type PlatformAccountResource,
} from "./resources/platform-accounts";
export * from "./resources/platform-capabilities";
export {
  contentCalendarEntryResource,
  publishingCadenceResource,
  cadenceAttainmentResource,
  type ContentCalendarEntryResource,
  type PublishingCadenceResource,
  type CadenceAttainmentResource,
} from "./resources/content-calendar";
export {
  materialLinkResource,
  type MaterialLinkResource,
} from "./resources/material-links";
// [T-248 批C] settings.agents.create op 已删(孤 op),但 backend settings 模块的
// service/repository 仍以该 resource 为 DTO 真值(agent_configurations 表保留)。
// op 删除后无法再经 ENDPOINTS.createAgent.response 派生,故按 taxonomy 同款约定
// 从 barrel 直接 re-export 单一真值。
export {
  aiTaskResultDataResource,
  aiTaskResultResource,
  type AITaskResultDataResource,
  type AITaskResultResource,
} from "./resources/ai";
export {
  agentConfigurationResource,
  channelModelCredentialResource,
  type AgentConfigurationResource,
  type ChannelModelCredentialResource,
} from "./resources/settings";
export {
  benchmarkSourceResource,
  type BenchmarkSourceResource,
  benchmarkWorkResource,
  type BenchmarkWorkResource,
  // [T-349b] 对标作品列表投影(信号源弹窗「对标作品」面板)。
  benchmarkWorkListItemResource,
  type BenchmarkWorkListItemResource,
} from "./resources/benchmark";
// [T-235b] 热点信源(热点多源证据)。
export {
  trendSourceResource,
  type TrendSourceResource,
} from "./resources/trend-source";
// [T-235c] 指定抖音收藏夹(收藏夹跟拍信号源)。
export {
  favoritesFolderResource,
  type FavoritesFolderResource,
} from "./resources/favorites-folder";
// [T-235d] 选题归因(正向归因回流,选题验证库)。
export {
  topicAttributionResource,
  type TopicAttributionResource,
} from "./resources/topic-attribution";
export {
  scheduledJobResource,
  jobRunResource,
  jobRunProgress,
  type ScheduledJobResource,
  type JobRunResource,
  type JobRunProgress,
} from "./resources/scheduling";
// T-086 编导文案审核门 —— 规则库行 + 稿面审核报告 DTO(backend review 模块 schema.ts
// 与 frontend 报告卡共用单一真值;同上各模块 re-export 约定,additive)。
export {
  reviewRuleResource,
  reviewRuleTier,
  reviewRuleStatus,
  reviewRuleMatchType,
  lintFindingResource,
  llmFindingResource,
  scriptReviewVerdict,
  scriptReviewReportResource,
  type ReviewRuleResource,
  type LintFindingResource,
  type LlmFindingResource,
  type ScriptReviewReportResource,
} from "./resources/review-gate";

// PAGE composition DTOs (SPEC §19). The dashboard / projectOverview / globalSearch
// DTOs are reachable via `ENDPOINTS.<op>.response`; `publishingCenterPage` has NO
// endpoint (composed server-side by the query-services module), so it is surfaced
// here so the module's `<module>.schema.ts` can validate against the single source
// of truth (same convention as the resource re-exports above).
export {
  dashboardPage,
  metricCard,
  scheduleReminderReadState,
  type DashboardPage,
  type MetricCard,
  type ScheduleReminderReadState,
} from "./pages/dashboard";
export {
  projectOverviewPage,
  type ProjectOverviewPage,
} from "./pages/project-overview";
export {
  globalSearchPage,
  type GlobalSearchPage,
} from "./pages/global-search";
export {
  publishingCenterPage,
  type PublishingCenterPage,
} from "./pages/publishing-center";

// [T-255a] 执行层(脑手分离)契约 —— backend execution 模块 schema 与前端执行确认卡
// 共用单一真值(同各模块 resource re-export 约定,additive)。
export {
  executionTaskType,
  executionTaskInput,
  executionConstraints,
  executionTaskSpec,
  executionArtifact,
  executionManifest,
  executionTaskResource,
  type ExecutionTaskType,
  type ExecutionTaskInput,
  type ExecutionConstraints,
  type ExecutionTaskSpec,
  type ExecutionArtifact,
  type ExecutionManifest,
  type ExecutionTaskResource,
} from "./resources/execution";

// T-482 内容雷达领域与持久任务契约。
export * from "./resources/intelligence";

// [T-254a] video.render 决策 props 契约(渲染器无关)—— T-254b 决策 runner(写侧)与
// backend execution video.render executor(读侧)共用单一真值(additive re-export)。
export {
  videoRenderTone,
  videoCardMotion,
  videoCardVisualPlan,
  videoCardSceneGraph,
  videoRenderDelivery,
  videoRenderMeta,
  videoRenderTalkingHead,
  videoSubtitleEmphasis,
  videoRenderCaption,
  videoRenderDirection,
  videoRenderCard,
  videoRenderSpecial,
  videoRenderScene,
  videoRenderBroll,
  videoRenderProps,
  videoRenderParams,
  type VideoRenderTone,
  type VideoCardMotion,
  type VideoCardVisualPlan,
  type VideoCardSceneGraph,
  type VideoRenderDelivery,
  type VideoRenderMeta,
  type VideoRenderTalkingHead,
  type VideoSubtitleEmphasis,
  type VideoRenderCaption,
  type VideoRenderDirection,
  type VideoRenderCard,
  type VideoRenderSpecial,
  type VideoRenderScene,
  type VideoRenderBroll,
  type VideoRenderProps,
  type VideoRenderParams,
} from "./resources/video-render";

// Settings skill 覆盖行 DTO(T-040/T-077a)—— 设置「技能」页签(frontend route/纯数据层)
// 需要按 override 行判「已定制」与生效值投影,与上面各模块 resource 同约定从根出口复用
// 单一真值(additive re-export,契约零删除)。
export {
  skillConfigOverrideResource,
  type SkillConfigOverrideResource,
  skillConfigOverrideVersionResource,
  type SkillConfigOverrideVersionResource,
  completionPolicyV1Resource,
  type CompletionPolicyV1Resource,
  accountSkillOverlayPatchResource,
  type AccountSkillOverlayPatchResource,
  editableSkillValuesResource,
  accountSkillOverlayCompatibilityErrorResource,
  accountSkillOverlayResource,
  type AccountSkillOverlayResource,
  accountSkillOverlayVersionResource,
  type AccountSkillOverlayVersionResource,
} from "./resources/settings";

// [T-163 Batch 3] Copilot 对话工具中文词表 —— chat-runner(backend,下沉后)与
// ai-copilot-content(client)+ ai-error-humanize 共用单一真值,故从前端 lib 提到 contract
// 共享包(纯常量/纯函数,零依赖,前后端安全 import)。
export * from "./chat-tool-labels";

export { agenticProposal, knowledgeProposal, assetTagProposal, agenticProposalSource,
  type AgenticProposal, type KnowledgeProposal, type AssetTagProposal } from "./resources/agentic-proposal";
export {trafficSourcePayloadSchema,publicationTrafficResource,type TrafficSourcePayload,type PublicationTrafficResource} from './resources/analytics';
export {operationsSyncSchema,DEFAULT_OPERATIONS_SYNC,type OperationsSync} from './operations-sync';

export { onboardingStepKey, onboardingPatchResource, onboardingStateResource, type OnboardingPatch, type OnboardingStateResource } from "./resources/settings";

export { dailyReportQuery, type DailyReportQuery } from "./pages/daily-report";
export {dailyReportAnalysis,type DailyReportAnalysis} from "./pages/daily-report-analysis";

export * from "./resources/audience-task";

export type {GroupResourceGrantResource,GroupResourceRevokePreview,AccountGroupResource,GroupMemberResource,GroupTransferPreview} from "./resources/account-groups";

export {groupWorkspaceQuery,groupWorkspaceMeta,groupDashboardPage,type GroupWorkspaceQuery} from "./pages/group-workspace";

export {platformAccountCapabilitiesResource,type PlatformAccountCapabilitiesResource} from "./resources/platform-accounts";

export {accountBindingStart,accountBindingResource,type AccountBindingResource} from "./resources/platform-accounts";

export {groupOnboardingStateResource,type GroupOnboardingStateResource} from "./resources/settings";

export {WORKSPACE_OPERATION_SCOPES,type WorkspaceOperationScope} from "./workspace-operation-scope";
export * from "./resources/visual-templates";
export {canvasVisualGroupSchema,type CanvasVisualGroup} from "./resources/creative-canvas";
export {publicationVisualNoteSchema,type PublicationVisualNote} from "./resources/publishing";
export * from "./resources/work-sources";
export * from "./resources/work-basis";
export * from "./resources/work-compositions";
export * from "./resources/work-reviews";
export * from "./resources/moments";

export {workReviewRequestResource} from "./operations/work-compositions";

export * from './resources/production-transcripts';

export * from './resources/production-conversion';

export * from './resources/production-rough-cut';

export {publicationCoverSaveBody,publicationCoverState,publicationCoverRead,publicationCoverCommitReceipt,publicationCoverSaveResult,publicationCoverOriginalRequest} from "./resources/publication-cover";

export * from "./resources/creative-canvas";
export * from "./resources/canvas-material-selection";
export * from './resources/reference-editor';

export * from './resources/production-native-rough';

export * from "./resources/project-script-source";

export {noteRelayLayout,type NoteRelayLayout} from "./resources/noterelay-layout";

export * from "./resources/production-native-document";
export * from "./resources/work-editor";
export * from "./resources/work-creation";
