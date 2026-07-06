export const CONTRACT_API_BASE = "/api/v1";

export * from "./envelope";
export * from "./primitives";
export * from "./endpoints";
export * from "./request-context";
export * from "./transport";
export * from "./client";

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
  type CreatorProfileResource,
  type PositioningStatementResource,
  type PositioningGateResultResource,
  type PositioningCenterResource,
} from "./resources/positioning";
// [T-052 裁决③] monetization resource 导出(product/offer/lead/conversionEvent/
// contentOutputProduct/funnelStage/monetizationFunnel)已随变现中心物理删除(宪法 §8)。
export {
  candidateResource,
  candidateCard,
  audienceSignalResource,
  topicPromotionResource,
  topicsOverviewResource,
  type CandidateResource,
  type CandidateCard,
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
  type DashboardPage,
  type MetricCard,
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

// Settings skill 覆盖行 DTO(T-040/T-077a)—— 设置「技能」页签(frontend route/纯数据层)
// 需要按 override 行判「已定制」与生效值投影,与上面各模块 resource 同约定从根出口复用
// 单一真值(additive re-export,契约零删除)。
export {
  skillConfigOverrideResource,
  type SkillConfigOverrideResource,
} from "./resources/settings";
