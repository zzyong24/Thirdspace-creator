import "server-only";
import {
  createConfiguredDb,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type { Endpoint, Transport, RequestContext } from "@creatoros/contract";
// [T-084c] ENDPOINTS 值导入 —— dispatchGenerateAsset 经 ai transport 起 asset.generate task
// 时用真 endpoint 对象(带 body zod 类型),避免裸 { id } 造成 body 类型收窄为 undefined。
import { ENDPOINTS } from "@creatoros/contract";
import { mockTransport } from "@/server/mock-backend/mock-transport";
import { FIXED_NOW_ISO } from "@/server/mock-backend/store";
import { canonicalDataset } from "@/fixtures/canonical";
// [T-050] 抖音真实数据里只保留金句知识库 seed(项目/发布/指标图谱旧种子已全删)。
// [T-135] DOUYIN_FAN_TOTAL 已随 canonical platform account seed(唯一使用点)退役移除。
import {
} from "@/fixtures/douyin-real";
import type { MetricCard } from "@/types/view-models";
import type { ProjectStageName, TaskStatus } from "@/types/domain";
import {
  createIdentityRepository,
  createIdentityService,
  seedCanonicalUser,
  type IdentityService,
} from "@creatoros/backend/modules/identity";
import {
  createTaxonomyRepository,
  createTaxonomyService,
  createTaxonomyTransport,
  TAXONOMY_OP_IDS,
} from "@creatoros/backend/modules/taxonomy";
import {
  createNotificationRepository,
  createNotificationsService,
  createNotificationsTransport,
  NOTIFICATION_OP_IDS,
} from "@creatoros/backend/modules/notifications";
import {
  createSearchRepository,
  createSearchService,
  createSearchTransport,
  SEARCH_OP_IDS,
  // [T-093] hybrid 检索(exact 优先 + 语义余弦补位)。
  type HybridSearchHit,
} from "@creatoros/backend/modules/search";
import { buildCanonicalSearchDocuments } from "@creatoros/backend/modules/search";
// [T-050 ⑦] 搜索索引真数据投影要直读六张表(根包导出,别名防与本文件局部变量撞名)。
import {
  projects as projectsTable,
  knowledgeItems as knowledgeItemsTable,
  knowledgeRevisions as knowledgeRevisionsTable,
  assets as assetsTable,
  publications as publicationsTable,
  publicationRevisions as publicationRevisionsTable,
} from "@creatoros/backend";
import {
  createSettingsRepository,
  createSettingsService,
  createSettingsTransport,
  SETTINGS_OP_IDS,
  type SettingsService,
  // [T-135] ModelConfigurationRow / UserPreferenceRow / AgentConfigurationRow 已随
  // canonical settings seed(toModelRow/toPreferenceRow/toAgentRow)退役一并移除。
} from "@creatoros/backend/modules/settings";
import {
  createProjectRepository,
  createProjectsService,
  createProjectsTransport,
  ensureTranscriptArtifact,
  PROJECT_OP_IDS,
  type StageGateReadersRef,
} from "@creatoros/backend/modules/projects";
import {
  createKnowledgeRepository,
  createKnowledgeService,
  createKnowledgeTransport,
  KNOWLEDGE_OP_IDS,
  type KnowledgeItemRow,
  type KnowledgeRevisionRow,
} from "@creatoros/backend/modules/knowledge";
import {
  createAssetRepository,
  createAssetsService,
  createAssetsTransport,
  createMockObjectStorage,
  createS3ObjectStorage,
  createLocalFsObjectStorage,
  ensureBucket,
  type ObjectStorageForCtx,
  ASSET_OP_IDS,
  // [T-135] AssetRow / AssetFileRow 已随 canonical assets seed(toAssetRow/toAssetFileRow)退役移除。
} from "@creatoros/backend/modules/assets";
import {
  createArtifactRepository,
  createArtifactsService,
  createArtifactsTransport,
  ARTIFACT_OP_IDS,
  type ArtifactRelationRow,
} from "@creatoros/backend/modules/artifacts";
import {
  createProductionService,
  createProductionTransport,
  PRODUCTION_OP_IDS,
} from "@creatoros/backend/modules/production";
import {
  createPublishingService,
  createPublishingTransport,
  createMockPublisher,
  PUBLISHING_OP_IDS,
} from "@creatoros/backend/modules/publishing";
import {
  createAnalyticsRepository,
  createAnalyticsService,
  createAnalyticsTransport,
  ANALYTICS_OP_IDS,
} from "@creatoros/backend/modules/analytics";
import {
  createIngestionRepository,
  createIngestionService,
  createIngestionTransport,
  createMockIngestionSource,
  INGESTION_OP_IDS,
} from "@creatoros/backend/modules/ingestion";
import {
  createReviewsService,
  createReviewsTransport,
  REVIEWS_OP_IDS,
} from "@creatoros/backend/modules/reviews";
// T-086 文案审核门(review_rules + script_review_reports)。
import {
  createReviewGateService,
  createReviewGateTransport,
  REVIEW_GATE_OP_IDS,
  buildReviewRuleSeedRows,
  createReviewGateRepository,
} from "@creatoros/backend/modules/review";
import { runScriptReview } from "@/server/ai/script-review-runner";
import {
  createLearningsService,
  createLearningsTransport,
  // [T-135] createLearningsRepository / LearningRow 已随 canonical learnings seed 退役移除。
  LEARNINGS_OP_IDS,
} from "@creatoros/backend/modules/learnings";
import {
  createAiService,
  createAiTransport,
  createAiRepository,
  buildAiModelConfigs,
  buildAiAgentConfigs,
  AI_OP_IDS,
  type AiService,
} from "@creatoros/backend/modules/ai";
import type {
  ContextDeps as ChatContextDeps,
  ReviewSubjectReader,
  ProjectMaterialsReader,
  ProjectMaterial,
} from "@/server/ai/creative-context";
import type { ContextReaders as ChatContextReaders } from "@/server/ai/chat-runner";
import { knowledgeRelevanceScore } from "@/server/ai/chat-tools";
import { runGatherMaterial } from "@/server/ai/research-runner";
import { runTopicGenerateV2 } from "@/server/ai/topic-task-adapter";
import * as nodePath from "node:path";
import {
  fetchDouyinMetrics,
  loginDouyin,
  checkDouyinStatus,
  fetchDouyinComments,
  fetchDouyinCommentsForWorks,
  ingestComments,
  type CommentIngestPorts,
  type CommentRecord,
  DouyinNotLoggedInError,
  fetchDouyinVideoUrl,
  streamAudioFromVideo,
  fetchDouyinWorkListExport,
} from "@/server/ingestion/douyin-cdp";
import {
  parseDouyinWorkListXlsx,
  matchDetailsToPublications,
  toDetailMetricRecords,
  visibilityFromDetailStatus,
  type PublicationCatalogEntry,
} from "@/server/ingestion/douyin-work-detail";
// [T-078] 作品封面回填:iesdouyin 分享页 coverUrl → 下载字节 → asset → revision.coverAssetId。
import {
  backfillDouyinCovers,
  downloadDouyinImage,
  DEFAULT_COVER_BACKFILL_LIMIT,
} from "@/server/ingestion/douyin-cover-backfill";
// [T-151 / T-037 缺口 A] 导入作品逐字稿 + 重建触发:给 imported 作品排 transcribe.douyin(逐字稿 D3)
//   + reconstruct.project(反推 research/planning)任务(fire-and-forget;dispatch 链自动跑 runner)。
//   多闸幂等在 helper 内(runner 逐 aweme 跳已转写 / 已有 reconstructed artifact 跳过 / createTask 去重)。
import { enqueueReconstructForImported } from "@/server/ingestion/reconstruct-enqueue";
// T-038b 抖音采集限流网关(单例接线):所有对外抖音请求经它 acquire/report(SPEC §4.4)。
import {
  DouyinRequestGateway,
  type DouyinChannel,
} from "@/server/ingestion/douyin-request-gateway";
import { resolveDouyinThrottleConfig } from "@/server/ingestion/douyin-throttle-config";
import { createPgliteThrottleStatePort } from "@/server/ingestion/douyin-throttle-state-port.pglite";
// [T-084b] 通用网页截图(公开页无头 Chromium)—— material.screenshot 端口用。
import { captureUrl } from "@/server/ingestion/web-capture";
import {
  runScheduledCollection,
  type Collector as ScheduledCollector,
} from "@/server/ai/scheduled-collection-runner";
import {
  runJobNow,
  startScheduler,
  sweepStaleRuns,
  type CronJob as SchedulableCronJob,
  type TriggerDeps,
} from "@/server/ai/scheduled-collection-scheduler";
import { runTopicEnrich } from "@/server/ai/topic-enrich-runner";
import { runCalibrationDiagnose } from "@/server/ai/calibration-diagnose-runner";
import { runCalibrationScore } from "@/server/ai/calibration-score-runner";
import { runScriptDraft } from "@/server/ai/script-runner";
import { runPlanningThesis } from "@/server/ai/planning-runner";
import { runPlanningContract } from "@/server/ai/planning-contract-runner";
import { runPlanningOutline } from "@/server/ai/planning-outline-runner";
import { runReviewAnalyze } from "@/server/ai/review-runner";
import { runPlatformAdapt } from "@/server/ai/platform-adapt-runner";
import { runMaterialMatch } from "@/server/ai/material-match-runner";
import { runPositioningGenerate } from "@/server/ai/positioning-runner";
import { runCopilotAssist } from "@/server/ai/copilot-runner";
import { runAssetGenerate } from "@/server/ai/asset-generate-runner";
import { runTranscribe } from "@/server/ai/transcribe-runner";
import { runAssetClassify } from "@/server/ai/asset-classify-runner";
// [T-146 切片 a] 文档抽取 runner + 未配摘要模型的信号错误(诚实降级)。
import {
  runMaterialExtract,
  MaterialSummaryModelNotConfiguredError,
} from "@/server/ai/material-extract-runner";
import { runReconstruct } from "@/server/ai/reconstruct-runner";
// T-040a 提示词/skill 服务端可配 —— 装配期读 skill_config_overrides 全表 → 套进常驻 REGISTRY。
import {
  applySkillConfigOverridesFromDb,
  createPgliteSkillConfigOverrideReadPort,
} from "@/server/ai/skill-config-overrides";
import { createLlmCompleter, LlmCredentialError } from "@/server/ai/llm/provider";
import { resolveLlmConfig } from "@/server/ai/llm/resolve";
import {
  resolveMultimodalSpec as resolveMultimodalSpecFn,
  resolveTranscribeSpec as resolveTranscribeSpecFn,
} from "@/server/ai/multimodal/resolve";
// [T-084a] 联网检索解析层 —— 与多模态 resolve 并列(web.search capability,自由字符串零契约改)。
import { resolveSearchSpec as resolveSearchSpecFn } from "@/server/ai/search/resolve";
// 多模态 provider 适配器(L5 asset.generate)。createMinimaxAdapter 是纯自建 REST(image
// 同步 / video 异步轮询),不碰 Agent SDK —— 不违 determinism 边界,可在 host 组合层直接注册。
// createOpenaiAsrAdapter(T-030-D2)= OpenAI 兼容 ASR(SiliconFlow/OpenAI/Groq),逐字稿转写用。
// transcribeAudio = ASR 工厂(按 provider 取适配器 → { text })。
import {
  createMinimaxAdapter,
  createOpenaiAsrAdapter,
  transcribeAudio as transcribeAudioFn,
  type MultimodalProviderRegistry,
} from "@creatoros/ai-worker";
// [T-084a] 联网检索工厂 + 三家 provider 适配器 —— host 注册进 registry(keyed by provider),
// gatherMaterials 前置检索用。与多模态 registry 并列;加 provider = 在此注册一个适配器。
import {
  searchWeb as searchWebFn,
  createBochaAdapter,
  createTavilyAdapter,
  createSerpapiAdapter,
  createRssAdapter,
  type SearchProviderRegistry,
} from "@creatoros/ai-worker";
// [T-126b] 浏览器搜索适配器落 frontend/server(需 playwright,复用 web-capture 无头 context)。
import { createBrowserScrapeAdapter } from "@/server/ai/search/search-browser";
import {
  createPositioningService,
  createPositioningTransport,
  // [T-135] createPositioningRepository / CreatorProfileRow / PositioningStatementRow
  // 已随 canonical positioning seed(Zyong Zhu 人设)退役移除——唯一调用点是被删的 seed。
  POSITIONING_OP_IDS,
} from "@creatoros/backend/modules/positioning";
import {
  createCandidateService,
  createCandidateTransport,
  // [T-135] createCandidateRepository / CandidateRow 已随 canonical candidates seed 退役移除。
  CANDIDATE_OP_IDS,
} from "@creatoros/backend/modules/candidate";
import {
  createCalibrationService,
  createCalibrationTransport,
  createCalibrationRepository,
  CALIBRATION_OP_IDS,
  type RubricRow as CalibrationRubricRow,
  type RubricVersionRow as CalibrationRubricVersionRow,
  // [T-135] CalibrationRuleSuggestionRow(RuleSuggestionRow)已随 canonical 复盘回流建议 seed 退役移除。
} from "@creatoros/backend/modules/calibration";
import {
  createPlatformAccountService,
  createPlatformAccountTransport,
  type PlatformAccountService,
  // [T-135] createPlatformAccountRepository / PlatformAccountRow 已随 canonical platform account seed 退役移除。
  PLATFORM_ACCOUNT_OP_IDS,
} from "@creatoros/backend/modules/platform-account";
import {
  createContentCalendarService,
  createContentCalendarTransport,
  CONTENT_CALENDAR_OP_IDS,
  type ContentCalendarService,
} from "@creatoros/backend/modules/content-calendar";
import {
  createMaterialLinksService,
  createMaterialLinksTransport,
  MATERIAL_LINKS_OP_IDS,
} from "@creatoros/backend/modules/material-links";
import {
  createSchedulingService,
  createSchedulingTransport,
  SCHEDULING_OP_IDS,
} from "@creatoros/backend/modules/scheduling";
import {
  createDashboardQueryService,
  createProjectOverviewQueryService,
  createGlobalSearchQueryService,
  createPublishingCenterQueryService,
  createQueryServicesTransport,
  QUERY_SERVICES_OP_IDS,
  type PublishingCenterQueryService,
} from "@creatoros/backend/modules/query-services";

// [T-146 切片 a SPEC §1.2 + §11 gate 处置·卖点收窄] 文档 AI 摘要要点卡的内联 skill 模板 + 输出
// 契约。**复用现有文本模型**(script.draft capability)但用一份**内联** PromptTemplate + 显式 JSON
// schema(逃生口,不注册 registry、不新增 capability,合 gate 处置)。摘要铁律:只提炼原文已有的
// 事实/数据/卖点,不补充原文没有的;卖点尤其收窄(只引用原文已声明,AI 不创造)。
const MATERIAL_SUMMARY_TEMPLATE = {
  id: "material.summarize.inline",
  version: "v1",
  system: [
    "你是短视频创作者的资料分析员。把创作者上传的第一手资料浓缩成结构化「资料要点卡」,供后续写文案紧扣。",
    "",
    "铁律(违反即失职):",
    "1. 只提炼原文**已明确写出**的事实、数据、卖点 —— 逐字有据。原文没写的,一个字都不许补。",
    "2. keyPoints:资料的核心论点/信息(≤6 条,每条一句)。",
    "3. facts:可核验的具体事实与数据(数字、规格、时间、价格等),照抄原文口径,不改写不四舍五入。",
    "4. sellingPoints(卖点):**只允许摘录原文已声明的卖点**,AI 绝不创造新卖点。",
    "   ✅ 原文写「续航 20 小时」→ sellingPoints 可含「长续航(20 小时)」。",
    "   ❌ 原文没提防水 → 绝不得写「防水」;拿不准是不是卖点 → 不放进 sellingPoints。",
    "5. 拿不准、原文没有的字段 → 留空数组。宁缺毋滥,绝不编造。",
    "只输出 JSON,不要多余文字。",
  ].join("\n"),
  template: "以下为创作者上传的资料全文(可能已截断):\n\n{{fullText}}",
  requiredFacets: ["fullText"] as const,
} as const;

// materialSummary 输出契约(JSON Schema,frontend 不引 zod)。runStructuredNode 经 asSchema 吃它,
// generateObject 绑它校验 + 不符自动重试;落空→文本兜底同 schema 再校验(跨模型健壮)。
const MATERIAL_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    keyPoints: { type: "array", items: { type: "string" } },
    facts: { type: "array", items: { type: "string" } },
    sellingPoints: { type: "array", items: { type: "string" } },
  },
  required: ["keyPoints", "facts"],
  additionalProperties: false,
};

// Project-entity operations now served by REAL SQL persistence (@creatoros/backend
// over pglite). Everything else falls back to the in-memory mock. Listed
// explicitly so non-persisted ops (e.g. the static Dashboard page DTO) never
// trigger a pglite init — keeps pglite out of the static build.
const PERSISTED_OPS = new Set<string>([
  // Projects (module 05) — all 15 "项目与流程" ops served by the module's own
  // user-scoped transport (outputs/tasks/stages/activity included).
  ...PROJECT_OP_IDS,
  // Taxonomy (module 04) — tags + entity_tags served by REAL SQL persistence.
  ...TAXONOMY_OP_IDS,
  // Notifications (module 01) — list + read served by REAL SQL persistence.
  ...NOTIFICATION_OP_IDS,
  // Search (module 02) — the composed `pages.search.get` read served by REAL SQL.
  ...SEARCH_OP_IDS,
  // Settings (module 03) — account read + preference/model/agent mutations.
  ...SETTINGS_OP_IDS,
  // Knowledge (module 06) — list/create/get + revisions.create + relations.create.
  ...KNOWLEDGE_OP_IDS,
  // Assets (module 07) — list/get + two-phase upload + files.create + trash/restore.
  ...ASSET_OP_IDS,
  // Artifacts (module 08) — list/create/get + versions.create/list + restore +
  // relations.create, all user-scoped with append-only immutable versions.
  ...ARTIFACT_OP_IDS,
  // Production (module 09) — get/put production + segments.create + exports
  // create/complete, user-scoped with §12 status machine + cross-module fan-out.
  ...PRODUCTION_OP_IDS,
  // Publishing (module 10) — list/create/get publications + revisions.create +
  // transition, user-scoped with §12 publish machine + MockPublisher idempotency.
  ...PUBLISHING_OP_IDS,
  // Analytics (module 11) — publication/project metric reads, user-scoped over the
  // append-only metric store; idempotent appendSnapshot is the Ingestion seam.
  ...ANALYTICS_OP_IDS,
  // Ingestion (module 12) — the 7 batch-push run ops, user-scoped, idempotent
  // (§17), fanning out to peer Services. No FE page (external skill writes only).
  ...INGESTION_OP_IDS,
  // Reviews (module 13) — create/get review + insights.create + complete,
  // user-scoped with §12 Review status machine (idempotent complete). Period from
  // the Publishing window, evidence from the Analytics snapshot (injected ports).
  ...REVIEWS_OP_IDS,
  ...REVIEW_GATE_OP_IDS,
  // Learnings (module 14) — list/create + applications.create + evaluate,
  // user-scoped with the §12 validationStatus machine (candidate→validated|
  // discarded; validated→discarded). Apply-target project ownership + activity via
  // the injected Projects port; reusable across projects (reviewId nullable).
  ...LEARNINGS_OP_IDS,
  // AI (module 15) — conversations list/create + messages.create + tasks
  // create/confirm/cancel, user-scoped with the §12 AI Task state machine. confirmTask
  // formalizes an artifact_version candidate through the Artifacts public service
  // (createVersion createdByType:'ai'); the Agent SDK runs only in @creatoros/ai-worker.
  ...AI_OP_IDS,
  // Query services (module Q, Wave 4) — the 3 page-composition reads
  // (pages.dashboard.get / pages.projectOverview.get / pages.search.get). Composes
  // public upstream services only (SPEC §19); pages.search.get is TAKEN OVER from
  // the Search module's interim composer here. publishingCenterPage has no op.
  ...QUERY_SERVICES_OP_IDS,
  // Positioning (module 17, Wave 5) — 七步①② 定位中心. profile get/upsert +
  // statements list/create/get (append-only immutable version chain) + gate.evaluate
  // (deterministic advisory 0–100 fit) + pages.positioning.get (定位中心 page DTO),
  // all user-scoped. The gate reaches Projects via the injected port; the AI 定位演进
  // 回流 formalizes through createStatementVersion (createdByType:'ai') — no parallel
  // candidate machine (C-3).
  ...POSITIONING_OP_IDS,
  // [T-052 裁决③] Monetization(module 18)已随变现中心物理删除(宪法 §8)。
  // Candidate (module 19, Wave 5) — 七步③ 选题情报层. candidates.list/create/get/
  // patch/promote + audienceSignals.list/linkToCandidate, all user-scoped. AI-sourced
  // candidates arrive via the service's createFromAIResult (C-3 formalize — no
  // duplicate submit/confirm op); AudienceSignal writes ride Ingestion's intake
  // (C-4 — no second write op). promote → Project reaches Projects via the injected
  // port; the PositioningGate is a nullable soft-dep port (fit=null when unwired).
  ...CANDIDATE_OP_IDS,
  // Calibration (module 20, Wave 5–7) — 七步⑤⑥ 校准闭环. rubrics.create/bumpVersion/
  // get + predictions.create/lock/get + results.create, all user-scoped. Prediction is
  // immutable once locked; RubricVersion is an append-only chain; CalibrationResult.
  // actualMetrics is recycled via a verified IngestionRun (§C-4/RISK-005). The §6.3
  // confidence feedback reaches Learnings via an injected port (no cross-module repo
  // import).
  ...CALIBRATION_OP_IDS,
  // PlatformAccount (module 21, Wave 5–7) — 七步⑤ 多账号矩阵. accounts.list/create/
  // get/update/archive, all user-scoped. Promotes 矩阵号 from a free-text
  // account_reference string to a first-class user-scoped entity; the PUBLIC
  // assertOwnedAccount(ctx, accountId, platform) guard is the cross-module binding seam
  // Publishing/Projects call before stamping accountId (no cross-module repo import).
  // secretReference is an opaque reference (§7.1) — never a raw token. archive is a soft
  // flip (attribution preserved); per-account metrics are a read-time rollup over
  // Publication.accountId (C-4 — no new metric write path, no MetricSnapshot.accountId).
  ...PLATFORM_ACCOUNT_OP_IDS,
  // ContentCalendar (module 22, Wave 5–7) — 七步⑦ 发布节奏 / 内容日历. The 8 ops
  // accounts.calendar.list / .entries.create + calendar.entries.update/transition/
  // delete + accounts.cadence.get/upsert/attainment, all user-scoped. Entries hang off
  // an account_id (a soft FK validated via PlatformAccountService — no cross-module repo
  // import). The planned→published/missed reconcile reads already-ingested publishing
  // reality (C-4 — no new external-write path); 断更 fires a Notification only on the
  // planned→missed edge. attainment is a derived read (no stored table).
  ...CONTENT_CALENDAR_OP_IDS,
  // MaterialLinks (用料链 / Bill-of-Materials, Plan A4) — materialLinks.list/create/
  // delete, all user-scoped. The 料库⇄创作 edge: a project (and optionally an output)
  // USES a KnowledgeItem or Asset with a role + stage + provenance. Pure local records
  // (entityId/contentOutputId are soft references validated at the caller's seam, no
  // cross-module repo import); delete is ownership-gated (cross-user → OwnershipError →
  // 404).
  ...MATERIAL_LINKS_OP_IDS,
  // Scheduling (module 23, T-007) — scheduled_job CRUD (create/list/get/update/setEnabled)
  // + job_run reads (listByJob/get). owned-root, transport 按 ctx.userId 收窄, job_run 经
  // requireJob ownership gate。D1 建了 backend module 却没接 dispatch;这条接线让 /automations
  // 的 client island 走 HTTP → dispatch → REAL SQL(pglite 迁移 0009 已建两表),读/管才真跑通。
  ...SCHEDULING_OP_IDS,
]);

// The set of op ids owned by the taxonomy module's transport (module 04).
const TAXONOMY_OPS = new Set<string>(TAXONOMY_OP_IDS);

// The set of op ids owned by the notifications module's transport (module 01).
const NOTIFICATION_OPS = new Set<string>(NOTIFICATION_OP_IDS);

// The set of op ids the Search module's transport handles at DISPATCH time
// (module 02). Wave-4 takeover (foundation §6): the query-services module now owns
// `pages.search.get`, so the Search transport is NO LONGER routed for it. But the
// module DOES still own its own standalone reads — `search.facets`
// (GAP-SRCH-facets, GET /search/facets) is routed here. So this set is
// SEARCH_OP_IDS minus the taken-over page op (rather than a hardcoded empty set):
// adding a new standalone op to SEARCH_OP_IDS auto-registers it for dispatch, while
// pages.search.get stays owned by query-services below. The Search SERVICE is also
// consumed by the GlobalSearchQueryService facade (search/recordSearch/listHistory).
const SEARCH_OPS = new Set<string>(
  SEARCH_OP_IDS.filter((opId) => opId !== "pages.search.get"),
);

// The set of op ids owned by the query-services module's transport (module Q).
const QUERY_SERVICES_OPS = new Set<string>(QUERY_SERVICES_OP_IDS);

// The set of op ids owned by the settings module's transport (module 03).
const SETTINGS_OPS = new Set<string>(SETTINGS_OP_IDS);

// The set of op ids owned by the projects module's transport (module 05).
const PROJECT_OPS = new Set<string>(PROJECT_OP_IDS);

// The set of op ids owned by the knowledge module's transport (module 06).
const KNOWLEDGE_OPS = new Set<string>(KNOWLEDGE_OP_IDS);

// The set of op ids owned by the assets module's transport (module 07).
const ASSET_OPS = new Set<string>(ASSET_OP_IDS);

// The set of op ids owned by the artifacts module's transport (module 08).
const ARTIFACT_OPS = new Set<string>(ARTIFACT_OP_IDS);

// The set of op ids owned by the production module's transport (module 09).
const PRODUCTION_OPS = new Set<string>(PRODUCTION_OP_IDS);

// The set of op ids owned by the publishing module's transport (module 10).
const PUBLISHING_OPS = new Set<string>(PUBLISHING_OP_IDS);

// The set of op ids owned by the analytics module's transport (module 11).
const ANALYTICS_OPS = new Set<string>(ANALYTICS_OP_IDS);

// The set of op ids owned by the ingestion module's transport (module 12).
const INGESTION_OPS = new Set<string>(INGESTION_OP_IDS);

// The set of op ids owned by the reviews module's transport (module 13).
const REVIEWS_OPS = new Set<string>(REVIEWS_OP_IDS);

// T-086 审核门 op ids(reviewRules.* + scriptReviews.*),独立 transport 路由。
const REVIEW_GATE_OPS = new Set<string>(REVIEW_GATE_OP_IDS);

// The set of op ids owned by the learnings module's transport (module 14).
const LEARNINGS_OPS = new Set<string>(LEARNINGS_OP_IDS);

// The set of op ids owned by the ai module's transport (module 15).
const AI_OPS = new Set<string>(AI_OP_IDS);

// The set of op ids owned by the positioning module's transport (module 17).
const POSITIONING_OPS = new Set<string>(POSITIONING_OP_IDS);

// The set of op ids owned by the candidate module's transport (module 19).
const CANDIDATE_OPS = new Set<string>(CANDIDATE_OP_IDS);

// The set of op ids owned by the calibration module's transport (module 20).
const CALIBRATION_OPS = new Set<string>(CALIBRATION_OP_IDS);

// The set of op ids owned by the platform-account module's transport (module 21).
const PLATFORM_ACCOUNT_OPS = new Set<string>(PLATFORM_ACCOUNT_OP_IDS);

// The set of op ids owned by the content-calendar module's transport (module 22).
const CONTENT_CALENDAR_OPS = new Set<string>(CONTENT_CALENDAR_OP_IDS);

// The set of op ids owned by the material-links module's transport (Plan A4).
const MATERIAL_LINKS_OPS = new Set<string>(MATERIAL_LINKS_OP_IDS);

// The set of op ids owned by the scheduling module's transport (module 23, T-007).
const SCHEDULING_OPS = new Set<string>(SCHEDULING_OP_IDS);

// The shared canonical 变现加权 Rubric id seeded below (the calibration page + the 复盘飞轮回流
// 轨B Learning→校准 reflow both target it). Kept as one const so the seed + the reflow seam
// agree on the same key.
const CANONICAL_RUBRIC_ID = "rubric-canonical";

// [T-135] canonical + douyin knowledge seed 全退役 → CanonicalKnowledge/CanonicalRevision 类型
// + toKnowledgeRow/toRevisionRow mapper 一并移除(知识全由用户真实采集/录入进库,不再 seed)。

// [T-099c] 产物版本正文抽取(单一真值,context.artifacts 字数 + context.artifact.text 全文共用)——
// output_script transcript 优先(与 makeReviewSubjectReader.getScript 同读法),回退 contentText,
// 再回退 contentData.sections 拼段 / body(与 scriptSource.getLatestScript 同抽取口径)。无正文 → 空串。
function extractArtifactText(
  contentText: string | null | undefined,
  contentData: unknown,
): string {
  const data =
    contentData && typeof contentData === "object"
      ? (contentData as Record<string, unknown>)
      : null;
  // 逐字稿:contentData.transcript 优先(output_script 的正文落这里)。
  if (data && typeof data.transcript === "string" && data.transcript.trim()) {
    return data.transcript;
  }
  // 通用回退:artifact 版本的 contentText(结构化编辑器落的纯文本快照)。
  if (typeof contentText === "string" && contentText.trim()) {
    return contentText;
  }
  // 结构化产物:sections 拼段(label/text/narration/body 任一非空即取)。
  if (data && Array.isArray(data.sections)) {
    const joined = (data.sections as unknown[])
      .map((s) => {
        const so =
          s && typeof s === "object" ? (s as Record<string, unknown>) : {};
        return [so.label, so.text, so.narration, so.body]
          .filter((x): x is string => typeof x === "string" && x.length > 0)
          .join(" ");
      })
      .filter((line) => line.length > 0)
      .join("\n");
    if (joined.trim()) return joined;
  }
  // 兜底:contentData.body 纯文本字段。
  if (data && typeof data.body === "string" && data.body.trim()) {
    return data.body;
  }
  return "";
}

// [T-135] toKnowledgeRow/toRevisionRow(及 toRelationRow/toAssetRow/toAssetFileRow/
// toPreferenceRow/toModelRow/toAgentRow 等)已随全部 canonical + douyin 内容 seed 退役移除
// (知识/素材/定位等全由用户真实采集或录入进库,不再 seed 固化任何内容)。

// Pin the singleton on globalThis, NOT a module-level `let`: Next/Turbopack give
// the route handler and server components separate module instances, so a
// module-level singleton would be a SEPARATE in-memory pglite per entry — island
// writes (via the route) would never be visible to page reads. globalThis is
// per-process, shared across all module graphs, so both see one store.
// The persistence bundle cached on globalThis: the composite-backing
// persistence transport AND the identity service, BOTH bound to the SAME pglite
// db. Task 9's dispatch + auth routes resolve `RequestContext` from the session
// cookie via `getIdentityService()`, so the ctx they thread into the transport
// reads/writes the same store the persistence transport serves.
interface PersistenceBundle {
  /** T-040c:重读 skill_config_overrides + 重套进常驻 REGISTRY(prompts.put 热更用)。 */
  reapplySkillOverrides: () => Promise<unknown>;
  projects: Transport;
  taxonomy: Transport;
  notifications: Transport;
  search: Transport;
  settings: Transport;
  knowledge: Transport;
  assets: Transport;
  artifacts: Transport;
  production: Transport;
  publishing: Transport;
  analytics: Transport;
  ingestion: Transport;
  reviews: Transport;
  // T-086 审核门 transport(reviewRules.* + scriptReviews.*)。
  reviewGate: Transport;
  learnings: Transport;
  ai: Transport;
  positioning: Transport;
  candidate: Transport;
  calibration: Transport;
  platformAccount: Transport;
  scheduling: Transport;
  contentCalendar: Transport;
  materialLinks: Transport;
  // Query services (module Q, Wave 4): the composite transport for the 3 page
  // reads, plus the Publishing Center composer (no endpoint — the FE calls it
  // server-side via getPublishingCenterService()).
  queryServices: Transport;
  publishingCenter: PublishingCenterQueryService;
  identity: IdentityService;
  // [T-136 切片 a] 暴露 platform-account service(不只 transport),供 resolveRequestContext
  // 在解析 ctx 时对 x-account-id header 做属主硬校验(getAccount 域内查号,不属主抛 404 → 降级
  // null)。与 identity/settingsService 同款「无 dispatch endpoint 的 route 直调服务」逃生口。
  platformAccountService: PlatformAccountService;
  // item B — exposed so the blob route (no dispatch endpoint) can resolve the
  // request user's media root, the same root uploads were minted against.
  settingsService: SettingsService;
  // T-004 ChatBox — exposed so the /api/chat route (no dispatch endpoint; it streams
  // via the Vercel AI SDK, not the RPC envelope) can assemble + persist a turn against
  // the SAME pglite store: aiService (persist conversation/messages), resolveModelSpec
  // (按 capability 解析 model), and the bound CreativeContext readers (定位/飞轮/受众信号/
  // 知识库 数据层注入). Mirrors how getStorageRootForRequest exposes settingsService.
  chatRuntime: ChatRuntime;
  // [T-093] 知识库 AI 搜索 route(/api/knowledge/search,无 dispatch endpoint)的运行时:
  // 可配 embedding(capability knowledge.search.embed,只认专配行)+ 存量回填 + hybrid 检索。
  knowledgeSearchRuntime: {
    hybridSearch: (
      ctx: RequestContext,
      query: string,
    ) => Promise<{
      semanticEnabled: boolean;
      semanticError: string | null;
      hits: HybridSearchHit[];
    }>;
  };
  // [T-055d] Finder「在 Finder 打开/显示」route(无 dispatch endpoint)的最小面。
  localFileRuntime: {
    assetStorageKey: (
      ctx: RequestContext,
      assetId: string,
    ) => Promise<string | null>;
    projectFolder: (
      ctx: RequestContext,
      projectId: string,
    ) => Promise<string | null>;
  };
}

// T-004 ChatBox runtime — the minimal surface the /api/chat route needs from the
// composition root: persist (aiService) + resolve model (resolveModelSpec) + the bound
// context readers (assembleChatAssembly reads them for 数据层注入). The readers are bound
// to the same public services the topic.generate trigger uses (no cross-module repo import).
export interface ChatRuntime {
  ai: AiService;
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<{
    apiFormat: "anthropic" | "openai_chat";
    baseUrl: string | null;
    model: string;
    token: string;
  }>;
  context: ChatContextDeps;
  // 只读 context 工具(context.projects / context.knowledge / context.materials)的真数据读端口。
  // 与 `context`(CreativeContext facet reader,进 system 的记忆)不同:这些是「用户问才实时拉」的
  // 按需读,由 chat-runner 的对应工具 execute 调用。全部 user-scoped(绑到 projects repo / knowledge
  // service / assets service 的 ctx.userId 读)。
  contextReaders: ChatContextReaders;
  // [T-084a] 联网检索端口(gatherMaterials 前置检索用)。probeSearchConfigured 探测 web.search
  // 是否已配(honestyBlock 第 6 条 + 工具动态描述);searchWeb 真执行检索(未配/失败抛错,
  // chat-runner catch 成 model_memory 降级)。
  probeSearchConfigured: (ctx: RequestContext) => Promise<boolean>;
  searchWeb: (
    ctx: RequestContext,
    query: string,
    opts?: { count?: number },
  ) => Promise<
    Array<{
      title: string;
      url: string;
      snippet: string;
      publishedAt?: string;
      siteName?: string;
    }>
  >;
  // [T-084b] material.screenshot 端口 —— captureUrl(真无头浏览器截图公开页)→
  // assetsService.createGeneratedAsset(落字节 + 建 asset,带 sourceUrl 存证)→ 换签名预览 URL。
  // 失败(打不开/HTTP/登录墙)抛错,chat-runner 工具 execute 接住转人话。
  captureScreenshot: (
    ctx: RequestContext,
    input: { url: string; fullPage?: boolean },
  ) => Promise<{
    assetId: string;
    name: string;
    previewUrl: string | null;
    sourceUrl: string;
  }>;
  // [T-084c] material.generate 端口 —— dispatch 既有 asset.generate task(经 ai transport 的
  // ai.tasks.create,复用既有分派链 void runAssetGenerate),立即返回 taskId(不阻塞对话回合)。
  dispatchGenerateAsset: (
    ctx: RequestContext,
    input: { kind: "image" | "video"; prompt: string; projectId?: string | null },
  ) => Promise<{ taskId: string }>;
  // [T-103b] review.script 端口 —— dispatch 既有 script.review ai_task(reviewGateService.triggerReview,
  // 复用 T-086 审核链路 L1 lint + L2 语义审 → 落 script_review_reports),立即返回 taskId。对话审核工具
  // (review.script)据此触发,前端 ChatReviewReportCard 轮询 getTask → 读 getLatestScriptReview 渲报告卡。
  dispatchScriptReview: (
    ctx: RequestContext,
    input: { projectId: string },
  ) => Promise<{ taskId: string }>;
}

const globalForPersistence = globalThis as unknown as {
  __creatorosPersistence?: Promise<PersistenceBundle>;
};

async function buildPersistence(): Promise<PersistenceBundle> {
  // 本地优先存储 driver(L0,SPEC §4.1/§7-L0)—— 三态优先级,经 backend 的
  // createConfiguredDb 统一解析:
  //   1. DATABASE_URL    → 真 Postgres(node-postgres;用户当前 docker-PG + 71 作品走这条,不变)。
  //   2. PGLITE_DATA_DIR → file-backed PGlite 落盘(Postgres-WASM 持久化到本地目录)。
  //   3. 内存 PGlite     → 仅 测试/vitest;runtime 无任何配置则本地优先默认落盘(非内存,重启不丢)。
  // 三条都套同一份 drizzle 迁移(0000…),test/runtime schema 一致。dispose 当前进程不
  // 主动调(singleton 跟随进程生命周期),保留以备未来显式 teardown。
  const { db, driver } = await createConfiguredDb();

  // [T-136 §D 切片 c] 抖音登录态**按号分目录**:`.auth/douyin/<accountId>`(每号独立
  //   persistent context / sessionid,互不顶号)。accountId 为 null(单号 / 未选号 / 存量)→
  //   确定回退目录 `_default`(兼容旧单号,不破)。base 走 env(CREATOROS_DOUYIN_AUTH_DIR)或
  //   默认项目内 `.auth/douyin`(cookie 只在本机、不入 Git)。douyinFetch 端口 + 采集器共用。
  const douyinAuthDirBase =
    process.env.CREATOROS_DOUYIN_AUTH_DIR ??
    nodePath.join(process.cwd(), ".auth", "douyin");
  const douyinAuthDirFor = (accountId?: string | null): string =>
    nodePath.join(douyinAuthDirBase, accountId ?? "_default");

  // Deterministic clock/ids keep the seeded dataset reproducible (visual/test
  // parity); new creates get collision-free ids distinct from the slug seeds.
  // `createSeq` lives at build scope (NOT per-request) so ids stay stable across
  // the many per-ctx repos the factory mints below.
  // Real persistent DB: the deterministic counter RESETS each process but rows
  // PERSIST, so generated ids + timestamps must be PROCESS-UNIQUE — otherwise runtime
  // creates (register user / login session / new project / activity…) collide on PK
  // across restarts (the `duplicate key … _pkey` bug). Seeds use explicit slug ids +
  // fixture timestamps, so seed idempotency is unaffected. L0:**file-backed PGlite
  // 也持久**(落盘),所以它和 postgres 同样要 process-unique ids;只有 内存 PGlite
  // (测试/vitest)保留确定性 `p` base + FIXED_NOW 以复现。
  const persistent = driver.kind !== "memory-pglite";
  const idBase = persistent ? globalThis.crypto.randomUUID().slice(0, 8) : "p";
  let createSeq = 0;
  const deps = {
    now: persistent ? () => new Date().toISOString() : () => FIXED_NOW_ISO,
    nextId: (prefix: string) => `${prefix}-${idBase}-${++createSeq}`,
  };

  // ── T-038b 抖音采集限流网关(单例接线,SPEC §4.1/§4.4)────────────────────────────
  // 一个 module 单例 DouyinRequestGateway(per-channel 串行 + 最小间隔 + jitter + 指数退避 +
  // [gate-F3] readyPromise barrier 从 douyin_throttle_state 恢复 cooldown)。所有对外抖音请求
  // 的插装点(collectors + runTranscribe 的 fetchDouyin*)经它 acquire/report。**注真 PGlite
  // store(与 scheduled_job / job_run 同一个 db 句柄)做持久层**([gate-F2])。gateway 经 DI
  // 注入 douyin-cdp 调用点(下方 host 绑定),douyin-cdp 内部不硬 import 单例(否则单测真等 9s)。
  // 具体类(非窄接口 DouyinChannelGate)—— 下游注入点仍只吃窄接口(acquire/report),但
  // T-038c 可观测要读它的 getChannelStatus,故此处持具体类型。
  const douyinGateway: DouyinRequestGateway = new DouyinRequestGateway({
    config: resolveDouyinThrottleConfig(),
    port: createPgliteThrottleStatePort(db),
    now: () => Date.now(),
    // 真 sleep(setTimeout);gateway 用它落 cooldown/间隔等待(测试侧另注假 sleep,此处 runtime 真等)。
    sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  });

  // T-038c 采集限流可观测读端口:绑到 gateway 单例的 getChannelStatus(读内存镜像,同步)。
  // 遍历两个 channel 组装 contract 的 throttle-status 快照,供 ingestion.douyin.throttleStatus
  // 只读 op 返给自动化。纯读、无副作用、不落表。
  const DOUYIN_CHANNELS: DouyinChannel[] = ["creator-center", "iesdouyin"];
  const readDouyinThrottleStatus = () => ({
    channels: DOUYIN_CHANNELS.map((channel) => {
      const s = douyinGateway.getChannelStatus(channel);
      return {
        channel,
        cooldownActive: s.cooldownActive,
        cooldownEtaMs: s.cooldownEtaMs,
        consecutiveThrottles: s.consecutiveThrottles,
        lastRequestAt: s.lastRequestAt,
      };
    }),
  });

  // [gate-F5] 采集 job/进程级串行闸(与 gateway 的请求级节奏正交):一条 module 级 promise 链,
  // concurrency=1 —— 同时只跑一个采集 job,防两个 Chromium 各打一 channel 并存(gateway 每 channel
  // 并发=1 拦不住 job-A 抓 creator-center + job-B 抓 iesdouyin 两进程并存)。轻量:一条 promise
  // 链尾串行,无需 p-queue。fire-and-forget 的 dispatch 把 runScheduledCollection 挂到链尾。
  let collectionRunTail: Promise<void> = Promise.resolve();
  const enqueueCollectionRun = (run: () => Promise<void>): void => {
    // 串到链尾:上一个采集跑完(无论成败)才开始本次;链尾用 catch 吞错防一次失败堵死后续。
    collectionRunTail = collectionRunTail.then(
      () => run(),
      () => run(),
    );
    // 兜底:链尾自身的 reject 不外溢(fire-and-forget;每个 run 内部已 try/catch 落终态)。
    collectionRunTail = collectionRunTail.catch(() => {});
  };

  // Projects (module 05): one user-scoped repository over the shared db (every
  // query filters eq(userId, ctx.userId) / ownership-checks via the parent). The
  // transport mints a per-ctx service so the §12 state machines run under the
  // caller; the repo is shared (it takes ctx per-call, not at construction).
  const projectsRepo = createProjectRepository(db);
  // §15/§16 内容门禁的只读数据源 holder。projectsService 先于它依赖的 peer service
  // (artifacts / production / publishing / reviews)在本文件下方创建,所以 gate 的
  // reader 用一个可变 holder 后置绑定:此处先传空 holder 构造 service,等所有 peer
  // service 建好后再填 stageGateReadersRef.current(见本文件末尾的「gate readers
  // 后置绑定」)。绑定前 gate 所有项「无数据源」→ 诚实跳过 → gate 恒过(不破坏任何
  // 在 service 构造后、绑定前发生的调用)。
  const stageGateReadersRef: StageGateReadersRef = { current: null };
  // A stable service handle (deterministic deps) reused both by the per-ctx
  // transport factory AND by the Production module's completeExport fan-out
  // (setPrimaryOutputAsset → patchOutput, which also appends the activity). The
  // service is stateless per call (it takes ctx per method), so one instance is
  // safe across requests.
  const projectsService = createProjectsService(
    projectsRepo,
    deps,
    stageGateReadersRef,
  );
  const projectsBaseTransport = createProjectsTransport(() => ({
    service: projectsService,
    repo: projectsRepo,
  }));
  // [全局搜索修复①] 项目写路径的搜索索引 fan-out(composition root 组合,projects 模块
  // 不反向依赖 search)。projects 是四大实体里唯一漏接搜索索引的 —— createProject/
  // patchProject 全程不碰 search_documents,导致「搜项目标题恒 0」。这里在 create/patch
  // 成功后**同步 await** 投影一条 entity_type='project' 的 search_document(载荷 stage/
  // progressPct/snippet 与读侧 toProjectCard 对齐);delete 走 removeDocument。同步(非
  // fire-and-forget)消除「建完即搜」竞态。索引 best-effort:失败只丢检索增益,业务真值
  // 已提交不回滚(SPEC §16 派生索引纪律),故 try/catch 吞掉。
  const indexProjectBestEffort = async (
    ctx: RequestContext,
    data: {
      id?: string;
      title?: string;
      currentStage?: string;
      progressPct?: number;
      brief?: string;
    },
  ): Promise<void> => {
    if (!data.id) return;
    try {
      const title = data.title ?? "";
      const snippet = data.brief ?? "";
      await searchService.upsertDocument(ctx, {
        entityType: "project",
        entityId: data.id,
        title,
        body: JSON.stringify({
          stage: data.currentStage ?? "",
          progressPct: data.progressPct ?? 0,
          snippet,
        }),
        searchText: `${title}\n${snippet}`.toLowerCase().trim(),
      });
    } catch (err) {
      console.warn("[project-index] 索引失败(业务真值不受影响):", err);
    }
  };
  const projects: Transport = {
    async request(endpoint, input, ctx) {
      const result = await projectsBaseTransport.request(endpoint, input, ctx);
      if (ctx) {
        if (
          endpoint.id === "projects.create" ||
          endpoint.id === "projects.patch"
        ) {
          const data = (result as { data?: unknown }).data as
            | {
                id?: string;
                title?: string;
                currentStage?: string;
                progressPct?: number;
                brief?: string;
              }
            | undefined;
          if (data) await indexProjectBestEffort(ctx, data);
        } else if (endpoint.id === "projects.delete") {
          const data = (result as { data?: unknown }).data as
            | { id?: string }
            | undefined;
          if (data?.id) {
            try {
              await searchService.removeDocument(ctx, "project", data.id);
            } catch (err) {
              console.warn("[project-index] 删除索引失败:", err);
            }
          }
        }
      }
      return result;
    },
  };

  // Taxonomy (module 04): one repository over the shared db; its transport mints
  // a per-ctx service so every tag/entity_tag query is scoped to `ctx.userId`.
  // Ids/clock share the deterministic `deps` (createSeq above keeps tag ids
  // collision-free across requests).
  const taxonomyRepo = createTaxonomyRepository(db, deps);
  const taxonomy = createTaxonomyTransport(() =>
    createTaxonomyService(taxonomyRepo),
  );

  // Notifications (module 01): one repository over the shared db; its transport
  // mints a per-ctx service so every list/read is scoped to `ctx.userId`. The
  // clock comes from the deterministic `deps` (FIXED_NOW) so a markRead stamps a
  // reproducible readAt (visual/test parity).
  const notificationsRepo = createNotificationRepository(db);
  const notifications = createNotificationsTransport(() =>
    createNotificationsService(notificationsRepo, deps),
  );

  // Search (module 02): the composed `pages.search.get` read served over the
  // SAME pglite store. The service mints a per-ctx repo internally so every index
  // query + history write is scoped to `ctx.userId`; the transport's per-request
  // serviceFactory can therefore return ONE shared service. Clock/ids share the
  // deterministic `deps` (createSeq keeps searchdoc/searchhist ids collision-free).
  const searchService = createSearchService(
    (ctx) =>
      createSearchRepository(db, {
        ...deps,
        userId: ctx.userId,
        // [T-136 切片 b] 搜索索引按号隔离维度透传;未选号/全局视图为 null(§E 退化)。
        accountId: ctx.accountId ?? null,
      }),
    deps,
  );
  const search = createSearchTransport(() => searchService);

  // Knowledge (module 06): one user-scoped repository over the shared db (the
  // repo takes ctx per-call, not at construction). Its transport mints a per-ctx
  // service so every list/get/create/revise/relate is scoped to `ctx.userId`,
  // and children inherit ownership via the parent item's gate. Clock/ids share
  // the deterministic `deps` (createSeq keeps knowledge/revision/relation ids
  // collision-free across requests).
  const knowledgeRepo = createKnowledgeRepository(db, deps);
  const knowledgeService = createKnowledgeService(knowledgeRepo);
  const knowledgeBaseTransport = createKnowledgeTransport(() => knowledgeService);
  // [T-093] 知识写路径的搜索索引 fan-out(composition root 组合,knowledge 模块不反向
  // 依赖 search):create / revisions.create 成功后 best-effort 重建该条的 search_document
  // (含可配 embedding;失败绝不回滚业务真值——SPEC §16 派生索引纪律)。
  // `indexKnowledgeDocumentBestEffort` 定义在下方 settingsService/resolveModelSpec 之后,
  // 此回调在请求期才执行,闭包引用无 TDZ 问题(与 llmCompleter 同款)。
  const knowledge: Transport = {
    async request(endpoint, input, ctx) {
      const result = await knowledgeBaseTransport.request(endpoint, input, ctx);
      if (
        ctx &&
        (endpoint.id === "knowledge.create" ||
          endpoint.id === "knowledge.revisions.create")
      ) {
        const data = (result as { data?: unknown }).data as
          | { id?: string; knowledgeItemId?: string }
          | undefined;
        const knowledgeId =
          endpoint.id === "knowledge.create" ? data?.id : data?.knowledgeItemId;
        if (knowledgeId) {
          // [全局搜索修复②] 原 `void ...catch()` fire-and-forget 有「建完即搜」竞态:
          // knowledge.create 返回后 search_document 可能尚未落库 → 立刻搜命中不到。改为
          // 同步 await(indexKnowledgeDocumentBestEffort 内部已 try/catch 吞错,失败绝不
          // 回滚业务真值),消除竞态。
          await indexKnowledgeDocumentBestEffort(ctx, knowledgeId);
        }
      }
      return result;
    },
  };

  // Assets (module 07): one user-scoped repository over the shared db (the repo
  // takes ctx per-call, not at construction). The service is the SOLE
  // object-storage caller (SPEC §15) — it gets the MockObjectStorage swap-seam
  // adapter (foundation §4; in-memory, deterministic keys). The transport mints a
  // per-ctx service so every list/get/upload/file/trash/restore is scoped to
  // `ctx.userId`; children inherit ownership via the parent asset's gate.
  // Clock/ids share the deterministic `deps`; the mock's nextKey reuses createSeq
  // so storage keys stay collision-free across requests.
  const assetsRepo = createAssetRepository(db, deps);
  // item B — per-ctx object-storage factory (硬决策 2). AssetsService no longer
  // holds a singleton adapter: each storage-touching method resolves the adapter
  // for the REQUEST's ctx. The choice reads that user's storage_config (via the
  // SettingsService, built below — the factory runs at request time so closing
  // over the later `settingsService` const is TDZ-safe, same as `llmCompleter`):
  //
  //   backend='s3' AND S3_* env present → createS3ObjectStorage (bytes land in the
  //     bucket via presigned PUT/GET),
  //   else → createLocalFsObjectStorage at resolveStorageRoot(ctx) (bytes land on
  //     local disk under the user's configured media root; the FE PUTs to the
  //     token-gated /api/v1/blob route).
  //
  // When no SettingsService is wired yet (defensive) OR neither backend resolves,
  // fall back to the deterministic in-memory mock (vitest / no-storage env).
  const nextKey = () => `uploads/${deps.nextId("objkey")}`;
  const s3Bucket = process.env.S3_BUCKET;
  const s3Cfg = s3Bucket
    ? {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION ?? "us-east-1",
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
        bucket: s3Bucket,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      }
    : null;
  if (s3Cfg) await ensureBucket(s3Cfg);
  // The in-memory mock (no real backend) — pinned once for the vitest / no-storage
  // path so storage keys stay collision-free.
  const mockStorage = createMockObjectStorage({ nextKey });
  // Whether local-fs is usable at all: in vitest we keep the deterministic mock
  // (no real disk writes / blob route). The runtime (Next server) opts in via
  // CREATOROS_STORAGE=local or simply by NOT being a test env.
  const localFsEnabled =
    process.env.CREATOROS_STORAGE === "local" ||
    (process.env.NODE_ENV !== "test" && !process.env.VITEST);

  const objectStorageForCtx: ObjectStorageForCtx = async (ctx) => {
    // Defensive: before settingsService exists, or for the mock path.
    const svc = settingsService as SettingsService | undefined;
    if (!svc) return mockStorage;
    const backend = await svc.resolveStorageBackend(ctx);
    if (backend === "s3" && s3Cfg) {
      return createS3ObjectStorage(s3Cfg, { nextKey });
    }
    if (localFsEnabled) {
      const rootPath = await svc.resolveStorageRoot(ctx);
      return createLocalFsObjectStorage(
        { rootPath, publicBaseUrl: "/api/v1/blob" },
        { nextKey },
      );
    }
    return mockStorage;
  };

  // [T-055d SPEC §7.1] 项目目录名:projects/<safe-title>-<id 后 6 位>。safe-title = 去
  // 文件系统非法字符 + 截 24 字;目录名以创建时标题为准(改名不追改,storageKey 即映射)。
  // getProject 走 projects public service(含归属校验;未知/越权 → null 落 inbox)。
  const safeProjectDirTitle = (title: string): string => {
    const cleaned = title
      .replace(/[\/\\:*?"<>|\x00-\x1f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 24)
      .trim();
    return cleaned || "untitled";
  };
  const resolveProjectFolder = async (
    ctx: RequestContext,
    projectId: string,
  ): Promise<string | null> => {
    try {
      const project = await projectsRepo.get(ctx, projectId);
      const suffix = projectId.slice(-6);
      return `projects/${safeProjectDirTitle(project.title)}-${suffix}`;
    } catch {
      return null;
    }
  };
  const assetsService = createAssetsService(assetsRepo, objectStorageForCtx, {
    ...deps,
    resolveProjectFolder,
  });
  // [T-055d SPEC §7.2] Finder/下载 route 的最小运行时面:assetId → 归属校验 + 当前
  // file 的 storageKey(相对 media root);projectId → 项目目录相对路径。
  const localFileRuntime = {
    assetStorageKey: async (
      ctx: RequestContext,
      assetId: string,
    ): Promise<string | null> => {
      const asset = await assetsService.getAsset(ctx, assetId); // OwnershipError → 上抛
      const files = await assetsRepo.listAssetFiles(ctx.userId, assetId);
      const current =
        files.find((f) => f.id === (asset as { currentFileId?: string | null }).currentFileId) ??
        files[files.length - 1] ??
        null;
      return current?.storageKey ?? null;
    },
    projectFolder: resolveProjectFolder,
  };
  const assets = createAssetsTransport(() => assetsService);

  // Artifacts (module 08): the service builds a per-ctx user-scoped repo over the
  // shared db (the repo bakes userId in; the service mints one per request). The
  // transport returns this ONE shared service. createVersion post-commit re-indexes
  // via the Search service (best-effort, never rolls back); evidence-target
  // ownership is validated through the Knowledge/Assets public services
  // (getKnowledge/getAsset throw OwnershipError) — no cross-module repo import.
  // Clock/ids share the deterministic `deps` (createSeq keeps artifact/version ids
  // collision-free across requests).
  const artifactsService = createArtifactsService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    searchUpsert: (ctx, input) => searchService.upsertDocument(ctx, input),
    assertKnowledgeOwned: (ctx, id) => knowledgeService.getKnowledge(ctx, id),
    assertAssetOwned: (ctx, id) => assetsService.getAsset(ctx, id),
  });
  const artifacts = createArtifactsTransport(() => artifactsService);

  // Production (module 09): the service builds a per-ctx user-scoped repo over the
  // shared db (the repo bakes userId in; the service mints one per request). The
  // transport returns this ONE shared service. completeExport's cross-module
  // fan-out reaches peers ONLY through their public services (no repo import):
  //   - setPrimaryOutputAsset → projectsService.patchOutput (drives ContentOutput
  //     active→ready primary-asset link AND appends the output activity),
  //   - searchIndexAsset → searchService.upsertDocument (best-effort post-commit).
  // Clock/ids share the deterministic `deps` (createSeq keeps production/segment/
  // export ids collision-free across requests).
  const productionService = createProductionService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    setPrimaryOutputAsset: (ctx, input) =>
      projectsService.patchOutput(ctx, input.outputId, {
        primaryAssetId: input.assetId,
      }),
    searchIndexAsset: (ctx, input) => searchService.upsertDocument(ctx, input),
  });
  const production = createProductionTransport(() => productionService);

  // Publishing (module 10): the service builds a per-ctx user-scoped repo over the
  // shared db (the repo bakes userId in; the service mints one per request). The
  // transport returns this ONE shared service. The platform publish/remove
  // side-effect goes through the MockPublisher swap-seam (foundation §4; SPEC §15:
  // Publishing never calls a platform SDK / S3 directly) — deterministic external
  // id for idempotency. The transition fan-out reaches peers ONLY through their
  // public services (no repo import):
  //   - searchIndex → searchService.upsertDocument (best-effort post-commit),
  //   - assertCoverOwned → assetsService.getAsset (cover validation, SPEC §15).
  // The ContentOutput active→published rollup / notify / activity seams are
  // optional and left unwired this wave (best-effort, SPEC §11) — the realized
  // Production module likewise wired only the seams with a concrete peer method.
  // Clock/ids share the deterministic `deps` (createSeq keeps pub/rev ids
  // collision-free across requests).
  const publishingService = createPublishingService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    publisher: createMockPublisher(),
    // [全局搜索修复③] video/publication tab 对齐:publishing.service 发布时投影
    // entity_type='publication',但读侧 search.transport 的 video tab 查的是
    // entity_type='video'(启动 seed 亦投影成 video)→ 已发布作品在 video tab 恒搜不到。
    // 只在 wiring 层把 'publication' 归一为 'video'(不动 publishing.service 业务代码),
    // 与读侧 TAB_DEFS + 启动重建三处一致。
    searchIndex: (ctx, input) =>
      searchService.upsertDocument(ctx, {
        ...input,
        entityType: input.entityType === "publication" ? "video" : input.entityType,
      }),
    assertCoverOwned: (ctx, id) => assetsService.getAsset(ctx, id),
    // Project→ContentOutput-ids resolver — drives Analytics' project metric read
    // (publishing.listPublicationIdsByProject → analytics.projects.get) without an
    // Analytics cross-module join. The project-ownership gate lives in Projects.
    listOutputIdsByProject: (ctx, projectId) =>
      projectsService.listOutputIdsByProject(ctx, projectId),
  });
  const publishing = createPublishingTransport(() => publishingService);

  // 数据底座(SPEC §1.4)「优先读真」接线 —— composition root 是唯一允许跨模块组合读的层。
  // 判据单一:projectsService.hasImportedProjects(ctx)(source='imported' 非空)。判据为真时,
  // 把 dashboard/复盘 的作品级读收窄到"真实导入作品"的 publication 集 —— 让演示 fixture 让位、
  // 界面直接出真值(治 dy-pub-00 假标题/0 播放);为假时(用户尚未拉真账号)三向回退全量
  // fixture 演示态(过渡期不破)。解析链:imported 项目 id → 各项目 ContentOutput id →
  // 各 output 的 publication id,全程经公共 service(projects.listImportedProjectIds /
  // publishing.listPublicationIdsByProject),不跨模块直连 repo(守 SPEC §22)。定义在
  // projects/publishing service 之后、各读侧装配之前,供 dashboard/calibration 复用(无前向引用)。
  const resolveImportedPublicationIds = async (
    ctx: RequestContext,
  ): Promise<string[]> => {
    const projectIds = await projectsService.listImportedProjectIds(ctx);
    if (projectIds.length === 0) return [];
    const ids = new Set<string>();
    for (const projectId of projectIds) {
      const pubIds = await publishingService.listPublicationIdsByProject(
        ctx,
        projectId,
      );
      for (const id of pubIds) ids.add(id);
    }
    return [...ids];
  };

  // Analytics (module 11): one user-scoped repository over the shared db (the repo
  // takes userId per-call — the metric store is append-only). The service reaches
  // Publishing ONLY through the injected AnalyticsPublishingPort (no cross-module
  // repo import): resolvePublication = ownership gate via getPublication;
  // listPublicationIdsByProject = the project→publication resolver. The transport
  // returns this ONE shared service. Clock/ids share the deterministic `deps`.
  const analyticsRepo = createAnalyticsRepository(db, deps);
  const analyticsService = createAnalyticsService({
    repo: analyticsRepo,
    publishing: {
      resolvePublication: (ctx, publicationId) =>
        publishingService.getPublication(ctx, publicationId),
      listPublicationIdsByProject: (ctx, projectId) =>
        publishingService.listPublicationIdsByProject(ctx, projectId),
    },
  });
  const analytics = createAnalyticsTransport(() => analyticsService);

  // Ingestion (module 12): the service builds a per-ctx user-scoped repo over the
  // shared db (the repo bakes userId in; the service mints one per request). It
  // fans out to peer modules ONLY through their public Services, adapted onto the
  // narrow IngestionPorts (no cross-module repository import, SPEC §17.6/.7):
  //   - publishing.resolvePublication → publishingService.resolvePublication,
  //   - analytics.appendSnapshot → analyticsService.appendSnapshot (idempotent),
  //   - knowledge.ingest → knowledgeService.createKnowledge,
  //   - assets.registerExternalAsset → the assets two-phase upload (createUpload +
  //     completeUpload) so the external object lands as a real Asset,
  //   - artifacts.createCandidateVersion → artifactsService.createVersion with
  //     createdByType:"ingestion" (a CANDIDATE append — never current_version;
  //     the downstream adopt gate promotes it, roadmap §401).
  // The transport returns this ONE shared service. Clock/ids share the
  // deterministic `deps`. The MockIngestionSource is the deterministic producer
  // (foundation §4) used by dev/seeds — not on the dispatch path.
  const ingestionMockSource = createMockIngestionSource();
  void ingestionMockSource; // producer-side seam; reserved for dev/seed import flows
  const ingestionService = createIngestionService({
    deps,
    db,
    ports: {
      publishing: {
        resolvePublication: (ctx, ref) =>
          publishingService.resolvePublication(ctx, ref),
        // 数据底座(SPEC §1.3):导入作品落 published publication(external_id=aweme_id)。
        createImportedPublication: (ctx, outputId, input) =>
          publishingService.createImportedPublication(ctx, outputId, input),
      },
      // 数据底座(SPEC §1.3):导入历史项目端口 → projectsService.ensureImportedProject
      //   (建 project source:imported + content_output,经公共 service,不跨模块直连 repo)。
      projects: {
        ensureImportedProject: (ctx, input) =>
          projectsService.ensureImportedProject(ctx, input),
      },
      analytics: {
        appendSnapshot: (ctx, input) =>
          analyticsService.appendSnapshot(ctx, input),
      },
      knowledge: {
        ingest: (ctx, input) =>
          knowledgeService.createKnowledge(ctx, {
            title: input.title,
            knowledgeType: input.knowledgeType,
            content: input.content,
          }),
      },
      assets: {
        registerExternalAsset: async (ctx, input) => {
          const upload = await assetsService.createUpload(ctx, {
            assetType: input.assetType,
            mimeType: "application/octet-stream",
            fileSize: 0,
          });
          return assetsService.completeUpload(ctx, upload.uploadId, {
            name: input.name,
          });
        },
      },
      artifacts: {
        createCandidateVersion: (ctx, input) =>
          artifactsService.createVersion(ctx, input.artifactId, {
            contentText: input.contentText,
            contentData: input.contentData,
            changeSummary: input.changeSummary,
            createdByType: input.createdByType,
          }),
      },
    },
    // 线 B:抖音真抓端口 —— 自起持久化 Chromium(.auth/ 复用扫码登录态,见 douyin-cdp.ts)。
    // [T-136 §D 切片 c] authDir **按号分目录**(douyinAuthDirFor(opts.accountId)):每号独立
    //   登录态,互不顶号;accountId 为 null → `_default` 回退(单号 / 未选号,兼容旧行为)。
    //   测试经各自的 createIngestionService 注入 fake,不连真浏览器。
    douyinFetch: {
      // [T-136 §D] fetchDouyinMetrics 现返回 { records, identity }(identity=登录用户自己的
      //   身份,抓不到 null)—— 直接透传;service 用真实昵称替占位「我的抖音」。
      fetch: (opts) =>
        fetchDouyinMetrics({
          capturedAt: opts.capturedAt,
          authDir: douyinAuthDirFor(opts.accountId),
          gateway: douyinGateway, // [gate-F7 插装点②] creator-center 翻页限流(注真单例)
        }),
      login: (opts) =>
        loginDouyin({
          authDir: douyinAuthDirFor(opts?.accountId),
        }),
      // T-032a:被动状态探针 —— headless 快查登录态(不弹窗),设置页「账号绑定」徽标读它。
      status: (opts) =>
        checkDouyinStatus({
          authDir: douyinAuthDirFor(opts?.accountId),
        }),
    },
    // T-038c:限流可观测读端口 —— 绑 gateway 单例 getChannelStatus(内存镜像,同步无 IO)。
    throttleStatus: { read: readDouyinThrottleStatus },
    // [T-144] 扫码绑定时 ensure 平台账号 —— 让「设置徽标 / 切换器 / 日历」三处账号状态同源
    // (都基于真实 platform_account)。幂等:先 listAccounts 找同 (platform, handle) 既有,无则
    // createAccount(catch ConflictError 兜并发)。thunk 引用 platformAccountService(下方构造,
    // ensureAccount 只在扫码运行时被调,晚于其初始化,闭包安全)。
    platformAccount: {
      ensureAccount: async (ctx, input) => {
        const { rows } = await platformAccountService.listAccounts(ctx, {
          platform: input.platform,
          limit: 100,
          offset: 0,
        });
        const existing = rows.find((r) => r.accountHandle === input.handle);
        if (existing) return { id: existing.id };
        try {
          const created = await platformAccountService.createAccount(ctx, {
            platform: input.platform,
            accountHandle: input.handle,
          });
          return { id: created.id };
        } catch (err) {
          // 并发/重试撞 UNIQUE(user,platform,handle)→ 重查取既有(幂等)。
          const again = await platformAccountService.listAccounts(ctx, {
            platform: input.platform,
            limit: 100,
            offset: 0,
          });
          const hit = again.rows.find((r) => r.accountHandle === input.handle);
          if (hit) return { id: hit.id };
          throw err;
        }
      },
      // [T-136 §D] 采集到真实昵称后,把当前号的占位 handle(「我的抖音」/「待完善」)更新为
      //   真实昵称。策略:列出该 user 的 douyin 账号,若已有同 handle=真实昵称 → no-op(幂等);
      //   否则找占位账号(handle=「我的抖音」)更新其 handle。UNIQUE(user,platform,handle) 撞
      //   (真实昵称账号已存在)→ 归并语义超出本切片(主 agent 账号合并),此处遇冲突吞错记日志。
      updateAccountHandle: async (ctx, input) => {
        const real = input.handle.trim();
        if (!real) return;
        const { rows } = await platformAccountService.listAccounts(ctx, {
          platform: input.platform,
          limit: 100,
          offset: 0,
        });
        // 已有真实昵称账号 → 幂等 no-op(重复采集不重复更新)。
        if (rows.some((r) => r.accountHandle === real)) return;
        // 找占位账号更新(loginDouyin/ensureAccount 建的「我的抖音」)。
        const placeholder = rows.find(
          (r) => r.accountHandle === "我的抖音" || r.accountHandle === "待完善",
        );
        if (!placeholder) return; // 无占位可更新 → 交由后续 ensureAccount 建真实号
        try {
          await platformAccountService.updateAccount(ctx, placeholder.id, {
            accountHandle: real,
          });
        } catch (err) {
          // 撞 UNIQUE(真实昵称账号并发已建)/ 归并冲突 → 吞错(账号合并是主 agent 的活)。
          console.error(
            "[persistence] updateAccountHandle: 更新占位账号 handle 失败(可能已存在真实号):",
            err,
          );
        }
      },
    },
  });
  const ingestion = createIngestionTransport(() => ingestionService);

  // Reviews (module 13): the service builds a per-ctx user-scoped repo over the
  // shared db (the repo bakes userId in; the service mints one per request). It
  // reaches peer modules ONLY through injected narrow ports (no cross-module repo
  // import, SPEC §22), satisfied here by the peers' public services / the shared
  // projects repo (the composition root, not the module, owns these adapters):
  //   - projects.verifyProjectOwned → projectsService.listOutputIdsByProject (the
  //     project-ownership gate throws OwnershipError for a cross-user/unknown id),
  //   - projects.verifyOutputOwned → projectsRepo.getOutput (output ownership gate),
  //   - projects.recordActivity → projectsService.recordActivity-equivalent via the
  //     projects repo appendActivity (best-effort; swallow on failure, SPEC §11),
  //   - publishing.listProjectPublications → projectsService.listOutputIdsByProject
  //     then publishingService.listPublications per output (the published window for
  //     period derivation — min/max publishedAt),
  //   - analytics.getProjectSnapshots → analyticsService.getProjectAnalytics reduced
  //     to the small evidence record the AI review node (G15) + FE render share.
  // The transport returns this ONE shared service. Clock/ids share the deterministic
  // `deps` (createSeq keeps review/insight/reviewpub ids collision-free).
  const reviewsService = createReviewsService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    projects: {
      verifyProjectOwned: async (ctx, projectId) => {
        // listOutputIdsByProject gates the project's ownership (cross-user /
        // unknown → OwnershipError → 404) before any review row is written.
        await projectsService.listOutputIdsByProject(ctx, projectId);
      },
      verifyOutputOwned: async (ctx, contentOutputId) => {
        // getOutput joins output→project and gates ownership (→ OwnershipError).
        await projectsRepo.getOutput(ctx, contentOutputId);
      },
      recordActivity: async (ctx, input) => {
        // Best-effort post-commit activity (SPEC §11) — a failure here must not
        // roll back the review fact, so swallow. appendActivity is user-scoped via
        // the parent project's ownership gate.
        try {
          await projectsRepo.appendActivity(ctx, {
            id: deps.nextId("activity"),
            projectId: input.projectId,
            eventType: input.eventType,
            entityType: input.entityType,
            entityId: input.entityId,
            eventData: {},
            occurredAt: deps.now(),
          });
        } catch {
          // intentionally swallowed — activity is non-critical telemetry.
        }
      },
    },
    publishing: {
      listProjectPublications: async (ctx, projectId) => {
        // Resolve project→ContentOutput ids via Projects (project-ownership gate
        // lives there), then list Publishing's OWN publications per output. No
        // cross-module repo import; an unwired/empty project → [].
        const outputIds = await projectsService.listOutputIdsByProject(
          ctx,
          projectId,
        );
        const windows: {
          contentOutputId: string;
          publishedAt: string | null;
        }[] = [];
        for (const outputId of outputIds) {
          const pubs = await publishingService.listPublications(ctx, outputId, {
            limit: 200,
            offset: 0,
          });
          for (const pub of pubs) {
            windows.push({
              contentOutputId: pub.contentOutputId,
              publishedAt: pub.publishedAt ?? null,
            });
          }
        }
        return windows;
      },
    },
    analytics: {
      getProjectSnapshots: async (ctx, projectId, window) => {
        // Reduce the project's Analytics snapshots to the small evidence record the
        // AI review node + FE render share (determinate; never user-supplied). The
        // project→publication resolution + user-scoping live inside Analytics.
        const { rows, total } = await analyticsService.getProjectAnalytics(
          ctx,
          projectId,
          1,
          50,
        );
        if (total === 0) return {};
        return {
          source: "analytics",
          window,
          snapshotCount: total,
          latestCapturedAt: rows[0]?.capturedAt ?? null,
        };
      },
    },
  });
  const reviews = createReviewsTransport(() => reviewsService);

  // ── gate readers 后置绑定(§15/§16 内容门禁的真实数据源)──────────────────
  // 此时 artifacts / production / publishing / reviews 服务都已构造好。把 projectsService
  // 的 stageGateReadersRef 填上,让阶段流转 gate 经各模块的公共 service 读真实交付物
  // (零跨模块 repo import)。每个 reader 用的数据源:
  //   - research/planning/script → artifactsService.listProjectArtifacts(按 artifactType)
  //   - production               → 遍历 project 的 outputs,任一 production.status==='ready'
  //   - publishing               → publishingService.listPublicationIdsByProject 非空
  //   - review                   → reviewsService.listCompletedReviewInsights 非空
  // 诚实标注的近似:
  //   - production reader 用 productionService.getProduction(get-or-create),对未进
  //     制作的 output 会幂等地建一个 drafting production 行(与制作页加载行为一致;
  //     drafting≠ready 不影响 gate 判定)。
  //   - review gate 用「完成复盘的洞察非空」近似「存在 ReviewReport」:reviews 模块
  //     的公共 service 只暴露 listCompletedReviewInsights(不暴露 hasCompletedReview),
  //     不为一个 gate 反向扩散改 reviews 模块。一个有完成复盘但零洞察的极端情形会被
  //     判为「缺失」——这与「复盘交付物 = 报告+洞察」的语义一致,不算编造。
  stageGateReadersRef.current = {
    listProjectArtifactTypes: async (ctx, projectId) => {
      const rows = await artifactsService.listProjectArtifacts(ctx, projectId);
      return rows.map((r) => r.artifactType);
    },
    hasReadyProduction: async (ctx, projectId) => {
      const outputIds = await projectsService.listOutputIdsByProject(
        ctx,
        projectId,
      );
      for (const outputId of outputIds) {
        const production = await productionService.getProduction(ctx, outputId);
        if (production.status === "ready") return true;
      }
      return false;
    },
    hasPublication: async (ctx, projectId) => {
      const ids = await publishingService.listPublicationIdsByProject(
        ctx,
        projectId,
      );
      return ids.length > 0;
    },
    hasCompletedReview: async (ctx, projectId) => {
      const insights = await reviewsService.listCompletedReviewInsights(
        ctx,
        projectId,
      );
      return insights.length > 0;
    },
  };

  // Learnings (module 14): the service builds a per-ctx user-scoped repo over the
  // shared db (the repo bakes userId in; the service mints one per request). It
  // reaches Projects ONLY through the injected LearningsProjectsPort (no cross-module
  // repo import, SPEC §22), satisfied here by the Projects public service / shared
  // repo (the composition root, not the module, owns these adapters):
  //   - projects.assertOwnsProject → projectsService.listOutputIdsByProject (the
  //     project-ownership gate throws OwnershipError for a cross-user/unknown id
  //     before any application row is written),
  //   - projects.recordActivity → projectsRepo.appendActivity (best-effort; swallow
  //     on failure, SPEC §11 — an activity-append must not roll back the apply fact).
  // The transport returns this ONE shared service. Clock/ids share the deterministic
  // `deps` (createSeq keeps learning/learning-app ids collision-free).
  const learningsService = createLearningsService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    projects: {
      assertOwnsProject: async (ctx, projectId) => {
        // listOutputIdsByProject gates the project's ownership (cross-user /
        // unknown → OwnershipError → 404) before any application row is written.
        await projectsService.listOutputIdsByProject(ctx, projectId);
      },
      recordActivity: async (ctx, input) => {
        // Best-effort post-commit activity (SPEC §11) — a failure here must not roll
        // back the application fact, so swallow. appendActivity is user-scoped via
        // the parent project's ownership gate.
        try {
          await projectsRepo.appendActivity(ctx, {
            id: deps.nextId("activity"),
            projectId: input.projectId,
            eventType: input.eventType,
            entityType: "learning",
            entityId: input.refId,
            eventData: {},
            occurredAt: deps.now(),
          });
        } catch {
          // intentionally swallowed — activity is non-critical telemetry.
        }
      },
    },
    // 复盘飞轮回流 轨B (Learning→校准): the cross-module write seam. A 复盘 Learning is promoted
    // into a real CalibrationRuleSuggestion through the Calibration PUBLIC service (no
    // cross-module repo import, SPEC §22). Lazy thunks — `calibrationService` is constructed
    // BELOW; these run at request time, never at construction (TDZ-safe, same as the AI
    // module's positioning/candidate/calibration confirm thunks). The current rubric resolves
    // to the shared canonical rubric (`rubric-canonical`) when the user can read it; null
    // (→ honest ConflictError) when no rubric exists.
    calibration: {
      resolveCurrentRubricId: async (ctx) => {
        try {
          const rubric = await calibrationService.getRubric(
            ctx,
            CANONICAL_RUBRIC_ID,
          );
          return rubric.id;
        } catch {
          return null;
        }
      },
      createSuggestion: (ctx, input) =>
        calibrationService.createRuleSuggestion(ctx, input),
    },
  });
  const learnings = createLearningsTransport(() => learningsService);

  // AI (module 15): the service builds a per-ctx user-scoped repo over the shared db
  // (the repo bakes userId in; the service mints one per request). The transport returns
  // this ONE shared service. The candidate→confirm boundary (SPEC §18) reaches Artifacts
  // ONLY through the injected AiArtifactsPort — satisfied here by the Artifacts public
  // service's createVersion (createdByType:"ai" → a NEW immutable ArtifactVersion; the AI
  // never writes a current version directly). No cross-module repo import (SPEC §22). The
  // Agent SDK lives only in @creatoros/ai-worker; this composition never imports it
  // (determinism boundary). Clock/ids share the deterministic `deps` (createSeq keeps
  // ai-conv/ai-task/ai-msg/ai-ref/ai-result ids collision-free across requests).
  const aiService = createAiService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    artifacts: {
      createVersion: (ctx, artifactId, input) =>
        artifactsService.createVersion(ctx, artifactId, input),
    },
    // 机制③ candidate-confirm bus — confirmTask materializes a `material_list` candidate
    // (research_gather node) into KnowledgeItems through the Knowledge public service.
    knowledge: {
      createKnowledge: (ctx, input) =>
        knowledgeService.createKnowledge(ctx, input),
    },
    // 机制④ 选题会 — confirmTask materializes a candidate_list into 选题池 Candidates via
    // the candidate module's C-3 seam. enrichCard formalizes a topic_card candidate
    // (topic.enrich node, 选题中心大改) onto an existing candidate. Lazy: candidateService
    // is constructed below, and these thunks only run at confirm time (request), never at
    // construction.
    candidate: {
      createFromAIResult: (ctx, result) =>
        candidateService.createFromAIResult(ctx, result),
      enrichCard: (ctx, candidateId, card) =>
        candidateService.enrichCard(ctx, candidateId, card),
    },
    // 机制④⑤ 复盘 — confirmTask materializes a learning_list into Learnings (which then
    // feed back into later nodes' context). learningsService is constructed above.
    learnings: {
      createLearning: (ctx, body) =>
        learningsService.createLearning(ctx, body),
    },
    // 机制③ 一稿多平台 — confirmTask materializes a publication_drafts candidate into real
    // Publications (+ an initial revision carrying the adapted title/body) via the
    // Publishing public service. The agent's per-platform label is normalized to the
    // Publishing platform enum (wechat → wechatVideo); accountReference is empty (the user
    // binds an account at 发布 time). publishingService is constructed above.
    publishing: {
      createPublicationFromDraft: async (ctx, outputId, draft) => {
        const PLATFORM_ALIAS: Record<string, string> = {
          wechat: "wechatVideo",
          weixin: "wechatVideo",
        };
        const platform = PLATFORM_ALIAS[draft.platform] ?? draft.platform;
        const pub = await publishingService.createPublication(ctx, outputId, {
          platform,
          accountReference: "",
        });
        await publishingService.createRevision(ctx, pub.id, {
          title: draft.title,
          description: draft.body,
          platformTags: draft.tags ?? [],
        });
        return pub;
      },
    },
    // Plan A5 用料链 — when a material_list candidate is 采纳ed, each new KnowledgeItem is
    // also tied to the task's project via a material-link (料库⇄创作 live edge). Lazy:
    // materialLinksService is constructed below; this thunk only runs at confirm time.
    materialLinks: {
      link: (ctx, input) => materialLinksService.create(ctx, input),
    },
    // Plan Phase A 定位演进回流 (OQ2) — when a positioning_profile candidate
    // (positioning.generate node) is 采纳ed, the AI confirm branch formalizes it through
    // the Positioning public service: upsertProfile lands the 5-facet profile, then
    // createStatementVersion appends a NEW statement version tagged createdByType:"ai" +
    // aiTaskId. Lazy: positioningService is constructed below; this thunk only runs at
    // confirm time (request), never at construction. The AI module never writes
    // creator_profiles / positioning_statements directly (SPEC §22).
    positioning: {
      upsertProfile: (ctx, input) =>
        positioningService.upsertProfile(ctx, input),
      createStatementVersion: (ctx, input) =>
        positioningService.createStatementVersion(ctx, input),
    },
    // 校准中心大改 Slice 1 — when a `calibration_diagnosis` candidate (calibration.diagnose
    // node) is 采纳ed, the AI confirm branch mints ONE draft Prediction through the
    // Calibration public service (AI never writes the predictions row directly, SPEC §22).
    // Lazy: calibrationService is constructed below; this thunk only runs at confirm time.
    calibration: {
      createDraftPrediction: (ctx, input) =>
        calibrationService.createDraftPrediction(ctx, input),
    },
  });
  const aiBase = createAiTransport(() => aiService);

  // T-086 审核门 service + transport(reviewRules.* + scriptReviews.*)。scriptReviews.trigger
  // 经注入的 AI 端口起 script.review ai_task。**关键**:审核门 op 不经 ai transport 的
  // ai.tasks.create 拦截(它直调 aiService.createTask),故 createTask 起任务后必须在此显式
  // 接入后台 dispatch(dispatchScriptReview,下方 resolveModelSpec 后赋值),否则任务只 queued
  // 不跑 L1 lint + L2 语义审。best-effort:dispatch 触发失败不回滚已建任务(诚实:任务留 queued
  // 可重试),但正常路径 dispatchScriptReview 恒已赋值(请求晚于 build)。
  const reviewGateService = createReviewGateService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    ai: {
      createTask: async (ctx, body) => {
        const task = await aiService.createTask(ctx, body);
        if (task && (task as { taskType?: string }).taskType === "script.review") {
          const t = task as {
            id: string | number;
            projectId?: string | null;
            inputData?: Record<string, unknown> | null;
          };
          dispatchScriptReview?.(ctx, {
            id: String(t.id),
            projectId: typeof t.projectId === "string" ? t.projectId : null,
            inputData: (t.inputData ?? {}) as Record<string, unknown>,
          });
        }
        return task;
      },
    },
  });
  const reviewGate = createReviewGateTransport(() => reviewGateService);

  // 调度采集 dispatch 触发点(T-007 D3):forward-declared,实体在下方(candidateService/
  // schedulingService 构造后)赋值。dispatch 分支(ai transport 内)与调度器 triggerScheduledJob
  // 共用它触发 `void runScheduledCollection(...)` —— 触发点单一。运行时才调(闭包延迟执行),
  // 赋值前的 dispatch(不会发生:transport 请求晚于 build)容错为 no-op。
  let dispatchScheduledCollection:
    | ((
        ctx: RequestContext,
        task: { id: string; taskType: string; inputData: Record<string, unknown> },
      ) => void)
    | undefined;
  // T-086 文案审核 dispatch 触发点:forward-declared,实体在下方(resolveModelSpec/
  // settingsService 构造后)赋值。reviewGateService.createTask 起 script.review ai_task 后
  // 用它在后台跑 runScriptReview —— 审核门 op 不走 ai transport 的 ai.tasks.create 拦截(它
  // 经注入 AI 端口直起任务),故触发点必须在此显式接入,否则任务只会 queued 不执行。
  let dispatchScriptReview:
    | ((
        ctx: RequestContext,
        task: {
          id: string;
          projectId: string | null;
          inputData: Record<string, unknown>;
        },
      ) => void)
    | undefined;

  // Positioning (module 17, Wave 5): the service builds a per-ctx user-scoped repo
  // over the shared db (the repo bakes userId in; the service mints one per request).
  // The transport returns this ONE shared service. The PositioningGate's project
  // subject reaches Projects ONLY through the injected PositioningProjectsPort (no
  // cross-module repo import, SPEC §22), satisfied here by the Projects public
  // repo's ownership-gated get (a cross-user / unknown projectId throws
  // OwnershipError → 404 BEFORE the gate scores). The AI 定位演进回流 formalizes
  // through positioningService.upsertProfile + createStatementVersion (createdByType:'ai')
  // — WIRED (Plan Phase A): the AI module's `positioning_profile` confirm branch calls
  // these via the AiPositioningPort below, fed by the positioning.generate runner. (OQ2
  // closed.) positioning owns no candidate state machine (C-3). Clock/ids share the
  // deterministic `deps`
  // (createSeq keeps profile/posstmt ids collision-free across requests).
  const positioningService = createPositioningService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    projects: {
      getProjectSubject: async (ctx, projectId) => {
        // projectsRepo.get gates the project's ownership (cross-user / unknown →
        // OwnershipError → 404) and returns the title/brief the scorer reads.
        const row = await projectsRepo.get(ctx, projectId);
        return { title: row.title, brief: row.brief };
      },
    },
  });
  const positioning = createPositioningTransport(() => positioningService);

  // [T-081②] 最近作品分页读(user-scoped)—— repo 全量拉(用户级列表,量级百条内)按
  // updatedAt(缺则 createdAt)desc 排序后切片,带 total。**单一真值**:context.projects 只读
  // 工具(contextReaders.listProjects)与 positioning.generate 后台 task 的 works 读端口共用,
  // 两处不各自造排序口径。注:projects 上无真实 publishedAt(在 publication 上)→ 诚实留 null。
  const listRecentProjects = async (
    c: RequestContext,
    opts: { limit: number; offset: number },
  ) => {
    const rows = await projectsRepo.list(c);
    const sorted = [...rows].sort((a, b) =>
      (b.updatedAt ?? b.createdAt ?? "").localeCompare(
        a.updatedAt ?? a.createdAt ?? "",
      ),
    );
    return {
      total: sorted.length,
      rows: sorted.slice(opts.offset, opts.offset + opts.limit).map((p) => ({
        id: p.id,
        title: p.title,
        stage: p.currentStage,
        status: p.status,
        publishedAt: null,
      })),
    };
  };

  // 复盘对象 reader 工厂 (T-039a) —— 读「本次复盘的这一条作品」的真材料(标题/文案/数据/评论),
  // 供 review.analyze 路径(后端 task runner + ChatBox 对话复盘)注入 review.insights prompt,让复盘
  // 扣住真实内容归因而不是账号级泛论。全部 best-effort、诚实空兜底(读不到 → 空,绝不塞假),且**复用
  // 数据底座既有读法**:标题走 projectsRepo.get(带 ownership 门),文案走 output_script transcript
  // artifact(与 reconstruct-runner 的 getTranscript 同法),数据走 analytics 最新 snapshot rawMetrics
  // (播放优先 views 回退 plays,与 dashboard 同口径),评论走 candidateService.listSignals 里 source
  // 含 comment 的信号。绑到 creative-context 的 ReviewSubjectReader 端口。
  const makeReviewSubjectReader = (): ReviewSubjectReader => ({
    // 本作品真标题 —— projectsRepo.get 顺带做 ownership 门(跨用户/未知 → OwnershipError)。
    getTitle: async (c, projectId) => {
      try {
        const row = await projectsRepo.get(c, projectId);
        return row.title ?? "";
      } catch {
        return "";
      }
    },
    // 本作品真文案 —— output_script transcript artifact 当前版本(contentData.transcript 优先,
    // 回退 contentText)。与 reconstruct task 的 getTranscript 同一读法(公开 service + per-ctx repo)。
    getScript: async (c, projectId) => {
      try {
        const rows = await artifactsService.listProjectArtifacts(c, projectId);
        const repo = createArtifactRepository(db, {
          ...deps,
          userId: c.userId,
          accountId: c.accountId ?? null, // [T-136 切片 b] 透传按号维度
        });
        for (const r of rows) {
          if (r.artifactType !== "output_script") continue;
          if (!r.currentVersionId) continue;
          const version = await repo.getVersion(r.currentVersionId);
          const data = version.contentData as
            | Record<string, unknown>
            | null
            | undefined;
          const t =
            data && typeof data.transcript === "string"
              ? data.transcript
              : version.contentText;
          if (t && t.trim()) return t;
        }
        return "";
      } catch {
        return "";
      }
    },
    // 本作品真实数据摘要 —— 解析项目 outputs → publications → 最新 snapshot rawMetrics,合并成
    // 人类可读串(播放优先 views 回退 plays,与 dashboard/getMetricsSummary 同口径)。数据是真实值。
    getMetricsSummary: async (c, projectId) => {
      try {
        const outputIds = await projectsService.listOutputIdsByProject(
          c,
          projectId,
        );
        const merged = new Map<string, number>();
        for (const outputId of outputIds) {
          let pubs: Array<{ id: string }> = [];
          try {
            pubs = await publishingService.listPublications(c, outputId, {
              limit: 20,
              offset: 0,
            });
          } catch {
            pubs = [];
          }
          for (const pub of pubs) {
            try {
              const page = await analyticsService.getPublicationAnalytics(
                c,
                pub.id,
                1,
                10,
              );
              const latest = page.rows
                .slice()
                .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
              const raw = (latest?.rawMetrics ?? {}) as Record<string, unknown>;
              for (const [k, v] of Object.entries(raw)) {
                if (typeof v === "number" && Number.isFinite(v)) {
                  merged.set(k, v);
                }
              }
            } catch {
              /* single publication read failing → skip, never crash */
            }
          }
        }
        if (merged.size === 0) return "";
        // 播放量归一(views/plays 同义合并,只呈现一次;views 真采集优先)。
        if (merged.has("views") && merged.has("plays")) merged.delete("plays");
        const LABELS: Record<string, string> = {
          views: "播放",
          plays: "播放",
          likes: "点赞",
          digg: "点赞",
          comments: "评论",
          shares: "分享",
          favorites: "收藏",
          finish_rate: "完播率",
        };
        return Array.from(merged.entries())
          .map(([k, v]) => `${LABELS[k] ?? k}：${v}`)
          .join(" · ");
      } catch {
        return "";
      }
    },
    // 本作品观众评论 —— audience_signals 里 source 含 "comment"(如 douyin_comment)的信号 rawText。
    // 多拉一些再按 comment 过滤 + 截前 limit 条(listSignals 不带 source 过滤,内存筛;诚实空兜底)。
    getComments: async (c, projectId, opts) => {
      try {
        void projectId; // 现阶段受众信号按账号维度存(无 per-project 外键)→ 取账号级评论作复盘参考。
        const res = await candidateService.listSignals(c, {
          limit: Math.max(opts.limit * 3, 60),
          offset: 0,
        });
        return res.rows
          .filter((s) => (s.source ?? "").toLowerCase().includes("comment"))
          .map((s) => s.rawText)
          .filter((t): t is string => typeof t === "string" && t.trim() !== "")
          .slice(0, opts.limit);
      } catch {
        return [];
      }
    },
  });

  // [T-146 切片 c/d] 项目素材 reader —— 读**当前项目**挂载的用户上传 document 素材(带 per-project
  // priority + 文档抽取投影),供写文案(script.draft)硬约束注入 + 搜索(gatherMaterials)深度结合。
  // 读法:materialLinksService.list(projectId) → 取 entityType='asset' 的边(带 priority)→ 逐个
  // assetsService.getAsset + listFilesByIds 取当前文件(materialSummary 在 mediaMetadata)→ 组装
  // ProjectMaterial。只保留 document 类且解析成功/有内容的(失败/非文档不进,不冒充可读)。全程 best-
  // effort:任一素材读失败只跳过该条(不牵连其它、不阻断节点)。与既有 assetsReader/复盘 reader 同
  // 「per-ctx 公开 service 读法」,不造影子 repo。
  const makeProjectMaterialsReader = (): ProjectMaterialsReader => ({
    listProjectMaterials: async (c, projectId) => {
      // material_links 是「料库⇄创作」一等公民边;list(projectId) 已 user-scoped(repo 用 ctx.userId)。
      const { rows } = await materialLinksService.list(c, {
        projectId,
        page: 1,
        pageSize: 100,
      });
      const assetLinks = rows.filter((r) => r.entityType === "asset");
      const materials: ProjectMaterial[] = [];
      for (const link of assetLinks) {
        try {
          const asset = await assetsService.getAsset(c, link.entityId); // OwnershipError → catch 跳过
          // 只读 document 类(图/视/音不是「资料」,不进硬约束);非文档跳过。
          if (asset.assetType !== "document") continue;
          // 文档抽取的三件套(extractedText/extractStatus/materialSummary)都落在**当前文件**行
          // (切片 a:extracted_text/extract_status 是 asset_files 列,materialSummary 在其 mediaMetadata),
          // 与契约 assetResource 的 file 派生投影同源。故一并从 current file 读(与 toAssetResource 一致)。
          let materialSummary: ProjectMaterial["materialSummary"] = null;
          let extractStatus: string | null = null;
          let extractedText: string | null = null;
          if (asset.currentFileId) {
            const files = await assetsService.listFilesByIds(c, [
              asset.currentFileId,
            ]);
            const file = files[0] ?? null;
            extractStatus = file?.extractStatus ?? null;
            extractedText = file?.extractedText ?? null;
            const meta = (file?.mediaMetadata ?? null) as Record<
              string,
              unknown
            > | null;
            const summary = meta?.materialSummary;
            if (summary && typeof summary === "object" && !Array.isArray(summary)) {
              materialSummary = summary as ProjectMaterial["materialSummary"];
            }
          }
          materials.push({
            name: asset.name,
            priority: link.priority === "high" ? "high" : "normal",
            extractStatus,
            materialSummary,
            extractedText,
          });
        } catch {
          // 单份素材读失败(越权/已删)→ 跳过该条,不牵连其它素材、不阻断写文案/搜索。
          continue;
        }
      }
      return materials;
    },
  });

  // 机制③④ — the gather-trigger seam. The AI module/service stays deterministic (never
  // imports the Agent SDK); the non-determinism lives HERE in the composition layer. We
  // wrap the AI transport so that a freshly-queued `research.gather_material` task fires
  // the real-agent runner in the BACKGROUND (Option A: in-process, non-blocking). The
  // runner assembles CreativeContext (positioning + topic), runs the Vercel AI SDK research
  // node (@creatoros/ai-worker + 外置 research.gather 模板 + anthropic 内置 web search), and
  // records a `material_list` candidate via aiService.recordCandidate → awaiting_confirmation.
  const ai: Transport = {
    async request(endpoint, input, ctx) {
      const res = await aiBase.request(endpoint, input, ctx);
      if (endpoint.id === "ai.tasks.create" && ctx) {
        const task = (res as { data?: Record<string, unknown> }).data;
        const positioningReader = {
          getPositioningCenter: (c: RequestContext) =>
            positioningService.getPositioningCenter(c),
        };
        // 飞轮回流 — top validated Learnings feed the agent's context (topic/script nodes).
        const learningsReader = {
          getSuggestions: (c: RequestContext, opts: { limit?: number }) =>
            learningsService.getSuggestions(c, opts),
        };
        // 素材库 reader (Plan D2) — the creator's asset library (id + name + type) feeds the
        // material.match node's context so the agent matches REAL assets. Maps the Asset DTO
        // (name, assetType) onto the runner's {id,name,type} shape.
        const assetsReader = {
          list: async (c: RequestContext) =>
            (await assetsService.listAssets(c, { limit: 200, cursor: null })).map(
              (a) => ({ id: a.id, name: a.name, type: a.assetType }),
            ),
        };
        // 抖音账号 reader (Plan Phase A) — the creator's connected platform accounts
        // (platform + handle + follower baseline) feed the positioning.generate node's
        // context as material for who they already are on-platform. Maps the
        // PlatformAccount DTO onto the runner's {platform, accountHandle, followerBaseline}
        // shape. platformAccountService is constructed below; this thunk only runs inside
        // the (async) request handler, never at construction.
        const accountsReader = {
          list: async (c: RequestContext) =>
            (
              await platformAccountService.listAccounts(c, {
                limit: 100,
                offset: 0,
              })
            ).rows.map((a) => ({
              platform: a.platform,
              accountHandle: a.accountHandle,
              followerBaseline: a.followerBaseline,
            })),
        };
        // 受众信号 reader (topic.generate comments basis, 选题中心大改) — the creator's
        // audience signals feed the agent's context so it can出题 from REAL demand. Maps the
        // AudienceSignal DTO onto the runner's {source, rawText, demandTag} shape.
        const signalsReader = {
          list: async (c: RequestContext, opts: { limit?: number }) =>
            (
              await candidateService.listSignals(c, {
                limit: opts.limit ?? 30,
                offset: 0,
              })
            ).rows.map((s) => ({
              source: s.source,
              rawText: s.rawText,
              demandTag: s.demandTag,
            })),
        };
        // 知识库 reader (topic.generate knowledge basis + topic.enrich 素材依据) — the
        // creator's KnowledgeItems feed the agent's context so选题 has 素材依据.
        // [T-079c] 投影补战绩/出处字段(usedCount/usedInPublished/sourceNote,
        // T-079a listKnowledge 已一次算齐)→ knowledgeBrief 按四原子分段 + 战绩排序。
        const knowledgeReader = {
          list: async (c: RequestContext, opts: { limit?: number }) =>
            (await knowledgeService.listKnowledge(c))
              .slice(0, opts.limit ?? 40)
              .map((k) => ({
                title: k.title,
                knowledgeType: k.knowledgeType,
                usedCount: k.usedCount,
                usedInPublished: k.usedInPublished,
                sourceNote: k.sourceNote ?? null,
              })),
        };
        // 论点树 reader (策划 downstream nodes) — read the project's `thesis_tree` artifact's
        // current version's `contentData.nodes` back as the upstream 编导判断 that
        // planning.contract / planning.outline build on. Reaches Artifacts ONLY through the
        // public service (listProjectArtifacts + listVersions); no cross-module repo import.
        const readArtifactContentData = async (
          c: RequestContext,
          projectId: string,
          artifactType: string,
        ): Promise<Record<string, unknown> | null> => {
          const artifacts = await artifactsService.listProjectArtifacts(
            c,
            projectId,
          );
          const target = artifacts.find((a) => a.artifactType === artifactType);
          if (!target) return null;
          const versions = await artifactsService.listVersions(c, target.id);
          if (versions.length === 0) return null;
          const current = versions
            .slice()
            .sort((a, b) => b.versionNumber - a.versionNumber)[0];
          const data = current?.contentData;
          return data && typeof data === "object" && !Array.isArray(data)
            ? (data as Record<string, unknown>)
            : null;
        };
        const thesisReader = {
          getThesisNodes: async (c: RequestContext, projectId: string) => {
            const data = await readArtifactContentData(
              c,
              projectId,
              "thesis_tree",
            );
            const rawNodes = Array.isArray(data?.nodes) ? data!.nodes : [];
            return rawNodes
              .map((raw) => {
                const o = (raw ?? {}) as Record<string, unknown>;
                return {
                  column: typeof o.column === "string" ? o.column : "",
                  title: typeof o.title === "string" ? o.title : "",
                  summary: typeof o.summary === "string" ? o.summary : "",
                };
              })
              .filter((n) => n.column && (n.title || n.summary));
          },
        };
        // 内容合同 reader (planning.outline) — read the project's `content_contract`
        // artifact's current version's `contentData.cards` back as the constraint the
        // structure must honor.
        const contractReader = {
          getContractCards: async (c: RequestContext, projectId: string) => {
            const data = await readArtifactContentData(
              c,
              projectId,
              "content_contract",
            );
            const rawCards = Array.isArray(data?.cards) ? data!.cards : [];
            return rawCards
              .map((raw) => {
                const o = (raw ?? {}) as Record<string, unknown>;
                return {
                  title: typeof o.title === "string" ? o.title : "",
                  body: typeof o.body === "string" ? o.body : "",
                };
              })
              .filter((c2) => c2.title || c2.body);
          },
        };
        // 结构方案 reader (SEAM-01, script.draft) — read the project's `content_outline`
        // artifact's current version `contentData` ({structureType, opening, sections,
        // ending, cta}) back as the blueprint the script.draft node fleshes out. Same
        // public-service read path as thesis/contract (no cross-module repo import).
        const outlineReader = {
          getOutline: async (c: RequestContext, projectId: string) => {
            const data = await readArtifactContentData(
              c,
              projectId,
              "content_outline",
            );
            if (!data) return null;
            const rawSections = Array.isArray(data.sections)
              ? data.sections
              : [];
            const sections = rawSections
              .map((raw) => {
                const o = (raw ?? {}) as Record<string, unknown>;
                return {
                  label: typeof o.label === "string" ? o.label : "",
                  intent: typeof o.intent === "string" ? o.intent : "",
                };
              })
              .filter((s) => s.label || s.intent);
            const structureType =
              typeof data.structureType === "string" ? data.structureType : "";
            const opening = typeof data.opening === "string" ? data.opening : "";
            const ending = typeof data.ending === "string" ? data.ending : "";
            const cta = typeof data.cta === "string" ? data.cta : "";
            // No adopted outline content at all → null (script.draft degrades to no blueprint).
            if (
              sections.length === 0 &&
              !structureType &&
              !opening &&
              !ending &&
              !cta
            ) {
              return null;
            }
            return { structureType, opening, sections, ending, cta };
          },
        };
        // F2 消费侧隔离 reader (T-030-D4, SPEC §7 边界②) — reports the origin of the
        // project's current artifact of a given type so assembleCreativeContext can mark a
        // reconstructed thesis/contract/outline brief "未经确认" before it rides downstream
        // as a 已确认前提. Reuses the SAME public-service read (listProjectArtifacts →
        // ArtifactRow.origin) the content readers use — no extra content fetch, no repo import.
        const artifactOriginReader = {
          getArtifactOrigin: async (
            c: RequestContext,
            projectId: string,
            artifactType: string,
          ): Promise<"user" | "reconstructed" | null> => {
            const artifacts = await artifactsService.listProjectArtifacts(
              c,
              projectId,
            );
            const target = artifacts.find(
              (a) => a.artifactType === artifactType,
            );
            const origin = target?.origin ?? null;
            return origin === "reconstructed" || origin === "user"
              ? origin
              : null;
          },
        };
        // Fire-and-forget: the HTTP response returns immediately; the agent (30–60s
        // subprocess) drains in the background against the shared pglite. The UI polls
        // getTask/listResults for the candidate. Each node has a runner; one trigger map.
        if (
          task &&
          task.taskType === "research.gather_material" &&
          task.status === "queued"
        ) {
          void runGatherMaterial(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              // [T-146d] 搜索深度结合用户素材:本项目高优先素材要点作 facet 注入 research 综合,让
              // 「贴着 PR/第一手资料产素材」而非泛搜。creative-context 按 material_link.priority 分流。
              projectMaterials: makeProjectMaterialsReader(),
              // Vercel AI SDK 路径:素材搜集节点跑在 ai-worker + 外置模板 + generateObject
              // 绑四类 outputSchema(钩子/案例/数据点/金句),schema 强约束根治不可解析卡死。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "topic.generate" &&
          task.status === "queued"
        ) {
          // Phase 3 A 路径:跑在新 Agent Runtime 上(按 capability 配的 model + 步骤日志),
          // 替掉旧的 runClaudeAgent 订阅路径。没配 model key → 适配器 cancelTask(不假成功)。
          void runTopicGenerateV2(
            ctx,
            {
              id: String(task.id),
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              signals: signalsReader,
              knowledge: knowledgeReader,
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "topic.enrich" &&
          task.status === "queued"
        ) {
          // 选题补全 node (topic.enrich, 选题中心大改) — fills the 选题卡 (10 详情字段 + 3
          // 指标) for ONE existing 选题候选 (inputData.candidateId), records a `topic_card`
          // candidate; 采纳 upserts the card onto that candidate via the candidate module's
          // enrichCard seam (wired on the AiCandidatePort above). The candidate reader is
          // bound to candidateService.getCandidate (ownership-gated, no cross-module repo
          // import).
          void runTopicEnrich(
            ctx,
            {
              id: String(task.id),
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              signals: signalsReader,
              knowledge: knowledgeReader,
              candidate: {
                get: async (c: RequestContext, candidateId: string) => {
                  const cand = await candidateService.getCandidate(
                    c,
                    candidateId,
                  );
                  return { title: cand.title, angle: cand.angle };
                },
              },
              // Vercel AI SDK 路径:选题补全跑在 ai-worker 结构化节点(外置 topic.enrich 模板
              // + generateObject 绑 outputSchema,落空→文本兜底),跨模型健壮(MiniMax 也稳出)。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "calibration.diagnose" &&
          task.status === "queued"
        ) {
          // AI 编导诊断 node (calibration.diagnose, 校准中心大改 Slice 1) — scores ONE content
          // subject (content_output / publication) against the creator's current 变现加权
          // rubric + records a `calibration_diagnosis` candidate; 采纳 mints a draft Prediction
          // via the calibration_diagnosis confirm branch (wired on the AiCalibrationPort
          // above). The subject reader is bound to the projects/publishing services
          // (ownership-gated, no cross-module repo import); the rubric reader resolves the
          // creator's default rubric's current version.
          void runCalibrationDiagnose(
            ctx,
            {
              id: String(task.id),
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              // Vercel AI SDK 路径(弃 LlmCompleter):AI 编导诊断跑在 ai-worker + 外置模板。
              resolveModelSpec,
              subject: {
                get: async (
                  c: RequestContext,
                  subjectType: string,
                  subjectId: string,
                ) => {
                  if (subjectType === "publication") {
                    // publication → its title + current revision body (the 文稿 the agent
                    // scores). A publication with no revision keeps "" (尽力诊断).
                    const pub = await publishingService.getPublication(
                      c,
                      subjectId,
                    );
                    const revisions = await publishingService.listRevisions(
                      c,
                      subjectId,
                      { limit: 1, offset: 0 },
                    );
                    const rev = revisions[0];
                    return {
                      title: rev?.title || `${pub.platform} 发布`,
                      scriptText: rev?.description ?? "",
                    };
                  }
                  // content_output → its title (the storyboard/文稿 plumbing lands later; the
                  // agent grounds on title + positioning + rubric for Slice 1).
                  const output = await projectsRepo.getOutput(c, subjectId);
                  return { title: output.title, scriptText: "" };
                },
              },
              rubric: {
                current: async (c: RequestContext) => {
                  // The creator's default 变现加权 rubric (canonical seed id) — its current
                  // version's dimensions are exactly what the agent scores. inputData may
                  // override the rubricVersionId; otherwise resolve the default rubric's
                  // current version.
                  const v = await calibrationService.getCurrentRubricVersion(
                    c,
                    "rubric-canonical",
                  );
                  return {
                    rubricVersionId: v.id,
                    dimensions: v.dimensions.map((d) => ({
                      key: d.key,
                      label: d.label,
                      description: d.description,
                    })),
                  };
                },
              },
            },
          );
        } else if (
          task &&
          task.taskType === "calibration.score" &&
          task.status === "queued"
        ) {
          // B2 编导自动评分 node (calibration.score, 数据底座 SPEC §5 / §2 回看·校准) — reads ONE
          // **locked prediction**'s dimensions + that work's **REAL metrics** (from analytics,
          // resolved via publishing — no cross-module repo import, SPEC §22) and records a
          // NON-formalizing `calibration_score` candidate (resultData.dimensions = 维度真实分候选).
          // The frontend reads that candidate to **prefill** the 录入真实表现 form; the human
          // edits/confirms and the EXISTING createResult path (采纳门) lands the calibration_result.
          // The runner NEVER writes calibration_result directly (铁律②). 每轮 schema 约束:
          // generateObject 绑 Zod(calibrationScoreSchema),校验失败 Vercel SDK 自动重试。
          void runCalibrationScore(
            ctx,
            {
              id: String(task.id),
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              // Vercel AI SDK 路径(弃 LlmCompleter):编导自动评分跑在 ai-worker + 外置模板。
              resolveModelSpec,
              prediction: {
                get: async (c: RequestContext, predictionId: string) => {
                  // The locked prediction's 维度评分约定 (predictedConversion.dimensions =
                  // [{key,score,...}]) + subject. Ownership-gated via the calibration public
                  // service (cross-user / unknown → 404). The rubric version resolves each
                  // dimension's 中文 label (取不到回退 key).
                  const pred = await calibrationService.getPrediction(
                    c,
                    predictionId,
                  );
                  const conv = (pred.predictedConversion ?? {}) as {
                    dimensions?: Array<{ key?: unknown; score?: unknown }>;
                  };
                  const rawDims = Array.isArray(conv.dimensions)
                    ? conv.dimensions
                    : [];
                  // Resolve dimension labels from the prediction's rubric version (best-effort).
                  const labelByKey = new Map<string, string>();
                  try {
                    const version =
                      await calibrationService.getCurrentRubricVersion(
                        c,
                        "rubric-canonical",
                      );
                    for (const d of version.dimensions) {
                      labelByKey.set(d.key, d.label);
                    }
                  } catch {
                    /* label is decoration — fall back to key */
                  }
                  const dimensions = rawDims
                    .map((d) => {
                      const key = typeof d.key === "string" ? d.key : "";
                      const predicted =
                        typeof d.score === "number" && Number.isFinite(d.score)
                          ? d.score
                          : null;
                      return {
                        key,
                        label: labelByKey.get(key) ?? key,
                        predicted,
                      };
                    })
                    .filter((d) => d.key !== "");
                  // The subject's 标题 (the work being scored). For a publication, the latest
                  // revision title; for a content_output, its title. Best-effort — 取不到给空串。
                  let title = "";
                  try {
                    if (pred.subjectType === "publication") {
                      const revisions = await publishingService.listRevisions(
                        c,
                        pred.subjectId,
                        { limit: 1, offset: 0 },
                      );
                      title = revisions[0]?.title ?? "";
                    } else {
                      const output = await projectsRepo.getOutput(
                        c,
                        pred.subjectId,
                      );
                      title = output.title;
                    }
                  } catch {
                    /* title is decoration — 尽力评分 */
                  }
                  return {
                    subjectType: pred.subjectType,
                    subjectId: pred.subjectId,
                    title,
                    dimensions,
                  };
                },
              },
              metrics: {
                forSubject: async (
                  c: RequestContext,
                  subjectType: string,
                  subjectId: string,
                ) => {
                  // Real metrics live in analytics' metric_snapshots (rawMetrics jsonb with the
                  // platform payload: views/likes/comments/shares/favorites/finish_rate/...).
                  // For a publication, subjectId IS the publicationId; for a content_output,
                  // resolve its publication(s) via publishing first. Read the LATEST snapshot
                  // per publication (captured-at desc), merge numeric rawMetrics. No snapshot →
                  // [](honest: the runner then scores from title+定位 and says so).
                  const numericMetrics = (
                    raw: Record<string, unknown>,
                  ): Array<{ key: string; value: number }> =>
                    Object.entries(raw)
                      .filter(
                        ([, v]) =>
                          typeof v === "number" && Number.isFinite(v),
                      )
                      .map(([key, v]) => ({ key, value: v as number }));
                  const latestFor = async (
                    publicationId: string,
                  ): Promise<Array<{ key: string; value: number }>> => {
                    try {
                      const page =
                        await analyticsService.getPublicationAnalytics(
                          c,
                          publicationId,
                          1,
                          10,
                        );
                      const latest = page.rows
                        .slice()
                        .sort((a, b) =>
                          b.capturedAt.localeCompare(a.capturedAt),
                        )[0];
                      const raw = (latest?.rawMetrics ?? {}) as Record<
                        string,
                        unknown
                      >;
                      return numericMetrics(raw);
                    } catch {
                      return []; // a single publication's read failing → no metrics, never crash
                    }
                  };
                  let publicationIds: string[] = [];
                  if (subjectType === "publication") {
                    publicationIds = [subjectId];
                  } else {
                    try {
                      const pubs = await publishingService.listPublications(
                        c,
                        subjectId,
                        { limit: 20, offset: 0 },
                      );
                      publicationIds = pubs.map((p) => p.id);
                    } catch {
                      publicationIds = [];
                    }
                  }
                  // Merge metrics across the subject's publications (last写入 wins per key —
                  // a single-publication subject is the common case).
                  const merged = new Map<string, number>();
                  for (const pid of publicationIds) {
                    for (const m of await latestFor(pid)) {
                      merged.set(m.key, m.value);
                    }
                  }
                  return Array.from(merged.entries()).map(([key, value]) => ({
                    key,
                    value,
                  }));
                },
              },
            },
          );
        } else if (
          task &&
          task.taskType === "script.draft" &&
          task.status === "queued"
        ) {
          // 分镜脚本 node — drafts a storyboard from the full creative context, records an
          // `artifact_version` candidate; 采纳 appends a new ArtifactVersion (reuses the
          // existing artifact_version confirm path).
          void runScriptDraft(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              // SEAM-01:策划→脚本上下文 —— 把本项目策划产物(论点树/内容合同/结构方案)经
              // reader 端口注入写文案上下文,和 positioning+learnings 并列。脚本据此铺策划的
              // 结构与论点,不再自己重造蓝图。各 reader 读对应 artifact 当前版本(无则降级空)。
              thesis: thesisReader,
              contract: contractReader,
              outline: outlineReader,
              // F2 (T-030-D4):策划产物若是 AI 历史反推(origin='reconstructed'),把注入 script.draft
              // 的论点树/合同/结构方案 brief 显式标「未经确认」,脚本不静默当已确认蓝图。
              artifactOrigin: artifactOriginReader,
              // [T-146c] 用户上传素材主权:本项目高优先(用户第一手)素材进「必须遵守」硬约束段,
              // normal(AI 找的)进参考段。creative-context 按 material_link.priority 分流。
              projectMaterials: makeProjectMaterialsReader(),
              // 立项画幅(横/竖屏)→ script.draft 据此调钩子与时长(SKL-01/02 下游赋能)。
              brief: {
                getBriefDetail: async (c, projectId) => {
                  try {
                    const row = await projectsRepo.get(c, projectId);
                    const o = (
                      row.briefDetail as
                        | { orientation?: "landscape" | "portrait" }
                        | undefined
                    )?.orientation;
                    return o ? { orientation: o } : null;
                  } catch {
                    return null; // best-effort;读不到画幅绝不阻塞写文案
                  }
                },
              },
              // Vercel AI SDK 路径(弃 LlmCompleter):写文案节点跑在 ai-worker + 外置模板。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "planning.thesis" &&
          task.status === "queued"
        ) {
          // 论点树 node (策划 stage) — drafts a thesis tree (核心论点 + 支撑/证据/反驳
          // 分支) from the creative context, records an `artifact_version` candidate;
          // 采纳 appends a new ArtifactVersion onto the project's `thesis_tree` artifact
          // (reuses the existing artifact_version confirm path). The 策划 workspace reads
          // that version's contentData.nodes back into the 论点树 surface.
          void runPlanningThesis(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              // Vercel AI SDK 路径(弃 LlmCompleter):论点树节点跑在 ai-worker + 外置模板。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "planning.contract" &&
          task.status === "queued"
        ) {
          // 内容合同 node (策划 stage) — drafts the audience contract (受众定位/价值主张/
          // 核心节奏/行动召唤) from 定位 + 选题 + 已采纳论点树, records an `artifact_version`
          // candidate; 采纳 appends a new ArtifactVersion onto the project's
          // `content_contract` artifact (reuses the existing artifact_version confirm path).
          // The 策划 workspace reads that version's contentData.cards back into the 内容合同
          // surface.
          void runPlanningContract(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              thesis: thesisReader,
              // F2:反推论点树注入内容合同上下文时标「未经确认」。
              artifactOrigin: artifactOriginReader,
              // Vercel AI SDK 路径(弃 LlmCompleter):内容合同节点跑在 ai-worker + 外置模板。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "planning.outline" &&
          task.status === "queued"
        ) {
          // 结构方案 node (策划 stage, 脚本阶段入口票) — drafts ONE structure plan
          // (结构类型/开头策略/段落安排/结尾/CTA) from 内容合同 + 论点树, records an
          // `artifact_version` candidate; 采纳 appends a new ArtifactVersion onto the
          // project's `content_outline` artifact (reuses the existing artifact_version
          // confirm path).
          void runPlanningOutline(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              thesis: thesisReader,
              contract: contractReader,
              // F2:反推论点树/合同注入结构方案上下文时标「未经确认」。
              artifactOrigin: artifactOriginReader,
              // Vercel AI SDK 路径(弃 LlmCompleter):结构方案节点跑在 ai-worker + 外置模板。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "review.analyze" &&
          task.status === "queued"
        ) {
          void runReviewAnalyze(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              // T-039a:复盘对象 reader —— 让后端复盘 task 也吃到「这一条作品」的真文案/标题/数据/评论
              // (原来只有 positioning + learnings + topic.title → subject 空即账号级泛论)。
              reviewSubject: makeReviewSubjectReader(),
              // Vercel AI SDK 路径(弃 LlmCompleter):复盘节点跑在 ai-worker + 外置模板。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "script.review" &&
          task.status === "queued"
        ) {
          // T-086 文案审核门 —— 单一 dispatch 触发点(下方 resolveModelSpec 后赋值),
          // 与审核门 op 直起任务路径共用同一 runScriptReview 装配(读脚本当前版本 → L1 lint +
          // L2 语义审 → 落 script_review_reports)。此分支覆盖经 ai.tasks.create 起的审核任务。
          dispatchScriptReview?.(ctx, {
            id: String(task.id),
            projectId:
              typeof task.projectId === "string" ? task.projectId : null,
            inputData: (task.inputData ?? {}) as Record<string, unknown>,
          });
        } else if (
          task &&
          task.taskType === "publish.platform_adapt" &&
          task.status === "queued"
        ) {
          // 一稿多平台 node — adapts one finished script into a per-platform draft
          // (抖音/B站/小红书/公众号), records a `publication_drafts` candidate; 采纳
          // materializes each draft into a real Publication (+ revision) via the
          // publishing port wired above.
          void runPlatformAdapt(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              // Vercel AI SDK 路径(弃 LlmCompleter):一稿多平台节点跑在 ai-worker + 外置模板。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "material.match" &&
          task.status === "queued"
        ) {
          // 素材匹配 node (制作 stage, Plan D2) — scans the creator's asset library and
          // proposes which real assets fit this content (role + reason), records a
          // `material_link_list` candidate; 采纳 ties each match to the project as a
          // material-link (entityType:"asset", stage:"production") via the materialLinks
          // port wired above (素材库⇄制作 live edge).
          void runMaterialMatch(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              assets: assetsReader,
              // Vercel AI SDK 路径:素材匹配跑在 ai-worker 结构化节点(外置 material.match 模板
              // + generateObject 绑 outputSchema,落空→文本兜底),跨模型健壮(MiniMax 也稳出)。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "positioning.generate" &&
          task.status === "queued"
        ) {
          // 定位生成 node (positioning.generate, Plan Phase A — the audit's level-1 gap:
          // 定位中心 could only *use* positioning, never *generate* one). Reads the
          // creator's CURRENT positioning + 抖音账号画像, runs the configurable LLM
          // (item A) to draft a structured 定位提案, records a `positioning_profile`
          // candidate; 采纳 formalizes it into a CreatorProfile (upsertProfile) + a NEW
          // statement version (createdByType:"ai", aiTaskId) via the positioning port —
          // the OQ2 演进回流 source.
          void runPositioningGenerate(
            ctx,
            {
              id: String(task.id),
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              accounts: accountsReader,
              // [T-081②] 真实作品读端口 —— 与 ChatBox 的 context.projects 同一份读法
              // (listRecentProjects),注入定位模板 {{works}} facet,让定位中心一键生成
              // 与对话定位生成两条路径都扎根真实作品画像。
              works: { listProjects: listRecentProjects },
              // Vercel AI SDK 路径:定位生成跑在 ai-worker 结构化节点(外置 positioning.generate
              // 模板 + generateObject 绑 outputSchema,落空→文本兜底),跨模型健壮(MiniMax 也稳出)。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "asset.generate" &&
          task.status === "queued"
        ) {
          // 生成素材 node (asset.generate, L5 录制, SPEC 2026-07-01 §3 / M2) — AI 生图/生视频
          // (用户可配 provider,铁律:绝不写死 MiniMax)→ 落对象存储(P3 直写 putObject)→ 建
          // asset(候选态)→ records a `generated_asset` candidate; 采纳 ties the generated asset
          // into the 用料链 for the project (entityType:"asset", stage:"production") via the
          // materialLinks port wired above. video 的异步轮询(submit→poll→retrieve + 超时)封在
          // M1 minimax 适配器内;超时/失败 → runner catch → cancelTask(UI 失败态,绝不卡 running)。
          // 未配 image.generate/video.generate model → MultimodalConfigError → cancelTask(诚实禁用)。
          void runAssetGenerate(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              // 多模态解析(按 image.generate/video.generate capability 解析用户配的 provider/
              // model/key),与文本层 resolveModelSpec 并列。
              resolveMultimodalSpec,
              // provider 适配器注册表(真 MiniMax;加 provider = 注册一个适配器,不改 runner)。
              registry: multimodalRegistry,
              // 建 asset 的窄端口 —— 落字节到对象存储 + 建 asset 行(候选态,未绑项目)。绑到
              // AssetsService 的服务端直写方法(SOLE object-storage caller,SPEC §15)。
              assets: {
                createGeneratedAsset: async (c, input) => {
                  const row = await assetsService.createGeneratedAsset(c, input);
                  return {
                    id: row.id,
                    name: row.name,
                    assetType: row.assetType,
                  };
                },
              },
            },
          );
        } else if (
          task &&
          task.taskType === "asset.classify" &&
          task.status === "queued"
        ) {
          // [T-055h SPEC §6.2 第二层] 素材 AI 归类 —— 倾倒场上传完成后 fire-and-forget:
          // VLM(用户可配 asset.classify capability)看图打标签+一句话描述;未配置诚实跳过
          // (只跑确定性第一层),绝不阻塞上传主链。
          void runAssetClassify(
            ctx,
            {
              id: String(task.id),
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: {
                markRunning: (c, id) => aiService.markRunning(c, id),
                recordStep: (c, id, stepInput) =>
                  aiService.recordStep(c, id, stepInput),
                markSucceeded: (c, id) => aiService.markSucceeded(c, id),
                markFailed: (c, id, err) => aiService.markFailed(c, id, err),
              },
              resolveVisionSpec: (c) =>
                resolveMultimodalSpecFn(c, "asset.classify", {
                  getModelConfig: (cc: RequestContext, cap: string) =>
                    settingsService.getModelConfig(cc, cap),
                  env: process.env,
                }),
              assets: {
                getAssetBytes: (c, id) => assetsService.getAssetBytes(c, id),
                mergeAiAnnotation: (c, id, patch) =>
                  assetsService.mergeAiAnnotation(c, id, patch),
              },
              // taxonomy 落标签:同名 tag 幂等(list 命中复用,缺则 create),再 assign。
              assignTags: async (c, assetId, tags) => {
                const taxonomySvc = createTaxonomyService(taxonomyRepo);
                const listed = await taxonomySvc.listTags(c, { limit: 200 });
                const byName = new Map(
                  listed.map((t: { name: string; id: string }) => [t.name, t.id]),
                );
                const tagIds: string[] = [];
                for (const name of tags) {
                  const hit = byName.get(name);
                  if (hit) {
                    tagIds.push(hit);
                    continue;
                  }
                  const created = await taxonomySvc.createTag(c, {
                    name,
                    kind: "asset-usage",
                  });
                  tagIds.push(created.id);
                }
                await taxonomySvc.assignTags(c, {
                  entityType: "asset",
                  entityId: assetId,
                  tagIds,
                });
              },
              describeImage: async (spec, input) => {
                const { describeImageOpenAICompatible } = await import(
                  "@creatoros/ai-worker"
                );
                return describeImageOpenAICompatible(spec, input);
              },
            },
          );
        } else if (
          task &&
          task.taskType === "material.extract" &&
          task.status === "queued"
        ) {
          // [T-146 切片 a SPEC §1] 用户上传文档抽取 —— 上传 document 完成后 fire-and-forget:
          // ① 确定性抽全文(pdf-parse/mammoth/UTF-8,无 AI)② AI 摘要要点卡(复用现有文本模型
          // script.draft capability + runStructuredNode,不新增 capability)。三类诚实降级(抽取
          // 失败/未配摘要模型/超长截断),绝不阻塞上传主链。
          void runMaterialExtract(
            ctx,
            {
              id: String(task.id),
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: {
                markRunning: (c, id) => aiService.markRunning(c, id),
                recordStep: (c, id, stepInput) =>
                  aiService.recordStep(c, id, stepInput),
                markSucceeded: (c, id) => aiService.markSucceeded(c, id),
                markFailed: (c, id, err) => aiService.markFailed(c, id, err),
              },
              assets: {
                getAssetBytes: (c, id) => assetsService.getAssetBytes(c, id),
                updateExtraction: (c, id, patch) =>
                  assetsService.updateFileExtraction(c, id, patch),
                mergeSummary: (c, id, summary) =>
                  assetsService.mergeAiAnnotation(c, id, {
                    materialSummary: summary,
                  }),
              },
              // 阶段①确定性抽全文:按 family 分派纯文本抽取器(只取文本层,不执行 PDF JS / Word 宏)。
              extractText: async (family, bytes) => {
                if (family === "plaintext") {
                  return new TextDecoder("utf-8").decode(bytes);
                }
                if (family === "docx") {
                  const mammoth = (await import("mammoth")).default;
                  const { value } = await mammoth.extractRawText({
                    buffer: Buffer.from(bytes),
                  });
                  return value;
                }
                // pdf:pdf-parse v2 —— new PDFParse({ data }).getText().text(纯文本层)。
                const { PDFParse } = await import("pdf-parse");
                const parser = new PDFParse({ data: bytes });
                const result = await parser.getText();
                return result.text;
              },
              // 阶段② AI 摘要:复用现有文本模型(script.draft capability)+ runStructuredNode 绑
              // materialSummary JSON schema(逃生口,不污染 registry / 不新增 capability)。未配模型
              // → LlmCredentialError → 转 MaterialSummaryModelNotConfiguredError(runner 诚实降级)。
              summarize: async (fullText) => {
                let spec: Awaited<ReturnType<typeof resolveModelSpec>>;
                try {
                  spec = await resolveModelSpec(ctx, "script.draft");
                } catch (err) {
                  if (err instanceof LlmCredentialError) {
                    throw new MaterialSummaryModelNotConfiguredError(
                      err.message,
                    );
                  }
                  throw err;
                }
                const { modelFor, runStructuredNode } = await import(
                  "@creatoros/ai-worker"
                );
                const { jsonSchema } = await import("ai");
                const { object } = await runStructuredNode<{
                  keyPoints?: unknown;
                  facts?: unknown;
                  sellingPoints?: unknown;
                }>({
                  model: modelFor(spec),
                  // 内联 skill 模板(不注册 registry):抽全文摘要成结构化要点卡。
                  template: MATERIAL_SUMMARY_TEMPLATE,
                  facets: { fullText },
                  // 逃生口:显式传 JSON schema(frontend 不引 zod,经 ai 的 jsonSchema 包装),覆盖 registry。
                  outputSchema: jsonSchema(
                    MATERIAL_SUMMARY_SCHEMA as Parameters<typeof jsonSchema>[0],
                  ),
                });
                const asStrings = (v: unknown): string[] =>
                  Array.isArray(v)
                    ? v.filter(
                        (x): x is string =>
                          typeof x === "string" && x.trim().length > 0,
                      )
                    : [];
                return {
                  keyPoints: asStrings(object.keyPoints),
                  facts: asStrings(object.facts),
                  sellingPoints: asStrings(object.sellingPoints),
                };
              },
            },
          );
        } else if (
          task &&
          task.taskType === "transcribe.douyin" &&
          task.status === "queued"
        ) {
          // 抖音逐字稿采集 node(transcribe.douyin, T-030-D2, SPEC §5.2/§5.3)—— 取音频(iesdouyin
          // 无水印直链 + ffmpeg 抽 mp3)→ 云端 ASR(用户可配 provider,铁律:绝不写死)→ 按 aweme_id
          // 绑 imported 作品的 script transcript artifact(幂等,已有则跳过 fetch/ASR 省流)。F7 失败
          // 分类:ASR 未配(TranscribeConfigError)→ 整任务停 markFailed + 引导;取音频失败 → 标该
          // aweme 失败其余继续。端口全注入真依赖(下方装配),runner 本身可确定性单测(见 test)。
          void runTranscribe(
            ctx,
            {
              id: String(task.id),
              taskType: task.taskType,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: {
                markRunning: (c, id) => aiService.markRunning(c, id),
                recordStep: (c, id, stepInput) =>
                  aiService.recordStep(c, id, stepInput),
                markSucceeded: (c, id) => aiService.markSucceeded(c, id),
                markFailed: (c, id, err) => aiService.markFailed(c, id, err),
              },
              // 取音频(iesdouyin 无水印直链)—— host 绑真 fetchDouyinVideoUrl(默认真 fetch)。
              // [gate-F7 插装点①] iesdouyin channel 限流(注真单例;逐字稿全量撞 IP 风控的主战场)。
              fetchVideoUrl: (_c, awemeId) =>
                fetchDouyinVideoUrl(awemeId, {
                  fetch: (...args) => fetch(...args),
                  gateway: douyinGateway,
                }),
              // 抽音频 bytes(ffmpeg)—— host 绑真 streamAudioFromVideo(默认 child_process.spawn)。
              streamAudio: (_c, playUrl) => streamAudioFromVideo(playUrl),
              // 解析用户配的 ASR model(transcribe.audio;未配抛 TranscribeConfigError → 整任务停)。
              resolveTranscribeSpec: (c) =>
                resolveTranscribeSpecFn(c, {
                  getModelConfig: (cc, cap) =>
                    settingsService.getModelConfig(cc, cap),
                  env: process.env,
                }),
              // 云端 ASR 转写(ai-worker 工厂,按 spec.provider 取 ASR 适配器)。
              transcribeAudio: (spec, opts, registry) =>
                transcribeAudioFn(spec, opts, registry),
              // ASR provider 适配器注册表 —— OpenAI 兼容 adapter 一件覆盖 SiliconFlow/OpenAI/Groq
              // (同形状转写端点);按用户所配 provider 名归一到同一适配器,加 provider 只需在此注册。
              registry: asrRegistry,
              // 幂等**只读**探测:该 aweme 是否已有 output_script transcript artifact(content_data.awemeId
              // 命中)。只读组合 findImportedByRef + listProjectArtifacts + getVersion,不写(不像 ensure
              // 那样「不存在则建」),故可安全当省流探针(已有 → 跳过 fetch/ASR)。
              hasTranscriptArtifact: async (c, awemeId) => {
                const p = await projectsRepo.findImportedByRef(c, {
                  platform: "douyin",
                  externalId: awemeId,
                });
                if (!p) return false;
                const rows = await artifactsService.listProjectArtifacts(
                  c,
                  p.id,
                );
                const repo = createArtifactRepository(db, {
                  ...deps,
                  userId: c.userId,
                  accountId: c.accountId ?? null, // [T-136 切片 b] 透传按号维度
                });
                for (const r of rows) {
                  if (r.artifactType !== "output_script") continue;
                  if (!r.currentVersionId) continue;
                  const version = await repo.getVersion(r.currentVersionId);
                  const data = version.contentData as
                    | Record<string, unknown>
                    | null
                    | undefined;
                  if (data && data.awemeId === awemeId) return true;
                }
                return false;
              },
              // 幂等绑作品:ensureTranscriptArtifact + 其 5 端口(projectsRepo/artifactsService 现成实例)。
              ensureTranscriptArtifact: (c, ensureInput) =>
                ensureTranscriptArtifact(c, ensureInput, {
                  findImportedProjectByAwemeId: async (cc, awemeId) => {
                    const p = await projectsRepo.findImportedByRef(cc, {
                      platform: "douyin",
                      externalId: awemeId,
                    });
                    return p?.id ?? null;
                  },
                  listProjectArtifacts: async (cc, projectId) => {
                    const rows = await artifactsService.listProjectArtifacts(
                      cc,
                      projectId,
                    );
                    return rows.map((r) => ({
                      id: r.id,
                      artifactType: r.artifactType,
                      currentVersionId: r.currentVersionId,
                    }));
                  },
                  getVersionContentData: async (cc, versionId) => {
                    // service 无 by-versionId 读 → per-ctx 现取 artifacts repo 的 getVersion。
                    const repo = createArtifactRepository(db, {
                      ...deps,
                      userId: cc.userId,
                      accountId: cc.accountId ?? null, // [T-136 切片 b] 透传按号维度
                    });
                    const version = await repo.getVersion(versionId);
                    const data = version.contentData;
                    return data &&
                      typeof data === "object" &&
                      !Array.isArray(data)
                      ? (data as Record<string, unknown>)
                      : null;
                  },
                  createScriptArtifact: (cc, artifactInput) =>
                    artifactsService.createArtifact(cc, artifactInput),
                  createArtifactVersion: (cc, artifactId, versionInput) =>
                    artifactsService.createVersion(cc, artifactId, versionInput),
                }),
            },
          );
        } else if (
          task &&
          task.taskType === "reconstruct.project" &&
          task.status === "queued"
        ) {
          // 作品初始化 auto-fill 重建 node(reconstruct.project, T-030-D4, SPEC §4.5/§6/§7)——
          // 仅 source='imported' 的已发布作品:逐字稿(D3)+ 真实指标 + 定位 → runStructuredNode
          // 产 { research, planning } → 物化 research(trend_analysis)+ planning(thesis_tree),
          // **均 origin='reconstructed'**(F1)。§5 守卫:runner 断言仅 imported,manual/topic 不触发。
          // 确定性终态 runner(不产候选、不过采纳门,§6.1 明确不走 candidate 确认路径)。端口全注入。
          void runReconstruct(
            ctx,
            {
              id: String(task.id),
              taskType: task.taskType,
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: {
                markRunning: (c, id) => aiService.markRunning(c, id),
                recordStep: (c, id, stepInput) =>
                  aiService.recordStep(c, id, stepInput),
                markSucceeded: (c, id) => aiService.markSucceeded(c, id),
                markFailed: (c, id, err) => aiService.markFailed(c, id, err),
              },
              positioning: positioningReader,
              learnings: learningsReader,
              resolveModelSpec,
              // §5 守卫(边界①):读该项目 source,断言仅 imported(非 imported → runner markFailed 不写)。
              getProjectSource: async (c, projectId) => {
                try {
                  const row = await projectsRepo.get(c, projectId);
                  return row.source ?? null;
                } catch {
                  return null; // 读不到 → runner 视为非 imported → 失败,不误触发
                }
              },
              // 读该作品逐字稿(D3 绑的 output_script transcript artifact 当前版本 contentText/
              // contentData.transcript)。走公开 service(listProjectArtifacts)+ per-ctx repo getVersion。
              getTranscript: async (c, projectId) => {
                const rows = await artifactsService.listProjectArtifacts(
                  c,
                  projectId,
                );
                const repo = createArtifactRepository(db, {
                  ...deps,
                  userId: c.userId,
                  accountId: c.accountId ?? null, // [T-136 切片 b] 透传按号维度
                });
                for (const r of rows) {
                  if (r.artifactType !== "output_script") continue;
                  if (!r.currentVersionId) continue;
                  const version = await repo.getVersion(r.currentVersionId);
                  const data = version.contentData as
                    | Record<string, unknown>
                    | null
                    | undefined;
                  const t =
                    data && typeof data.transcript === "string"
                      ? data.transcript
                      : version.contentText;
                  if (t && t.trim()) return t;
                }
                return null;
              },
              // 读该作品真实指标摘要(digg/comment/play 等)——解析项目 publications → 最新 snapshot
              // 的 rawMetrics(views/likes/comments/...)→ 人类可读串喂给模型(数据是真实值,模型不改)。
              getMetricsSummary: async (c, projectId) => {
                try {
                  const outputIds =
                    await projectsService.listOutputIdsByProject(c, projectId);
                  const merged = new Map<string, number>();
                  for (const outputId of outputIds) {
                    let pubs: Array<{ id: string }> = [];
                    try {
                      pubs = await publishingService.listPublications(
                        c,
                        outputId,
                        { limit: 20, offset: 0 },
                      );
                    } catch {
                      pubs = [];
                    }
                    for (const pub of pubs) {
                      try {
                        const page =
                          await analyticsService.getPublicationAnalytics(
                            c,
                            pub.id,
                            1,
                            10,
                          );
                        const latest = page.rows
                          .slice()
                          .sort((a, b) =>
                            b.capturedAt.localeCompare(a.capturedAt),
                          )[0];
                        const raw = (latest?.rawMetrics ?? {}) as Record<
                          string,
                          unknown
                        >;
                        for (const [k, v] of Object.entries(raw)) {
                          if (typeof v === "number" && Number.isFinite(v)) {
                            merged.set(k, v);
                          }
                        }
                      } catch {
                        /* single publication read failing → skip, never crash */
                      }
                    }
                  }
                  if (merged.size === 0) return "";
                  const LABELS: Record<string, string> = {
                    views: "播放",
                    plays: "播放",
                    likes: "点赞",
                    digg: "点赞",
                    comments: "评论",
                    shares: "分享",
                    favorites: "收藏",
                    finish_rate: "完播率",
                  };
                  return Array.from(merged.entries())
                    .map(([k, v]) => `${LABELS[k] ?? k}：${v}`)
                    .join(" · ");
                } catch {
                  return "";
                }
              },
              // 物化重建产物 —— createArtifact(origin='reconstructed')+ createVersion 写内容
              // (createdByType='ai' + 显式 origin='reconstructed';F1 强制,消费侧靠 origin 隔离)。
              artifacts: {
                materializeReconstructed: async (c, matInput) => {
                  const artifact = await artifactsService.createArtifact(c, {
                    projectId: matInput.projectId,
                    title: matInput.title,
                    artifactType: matInput.artifactType,
                    stage: matInput.stage,
                    origin: "reconstructed",
                  });
                  await artifactsService.createVersion(c, artifact.id, {
                    contentText: matInput.contentText,
                    contentData: matInput.contentData,
                    changeSummary: "AI 历史反推重建",
                    createdByType: "ai",
                    origin: "reconstructed",
                  });
                  return { id: artifact.id };
                },
              },
            },
          );
        } else if (
          task &&
          typeof task.taskType === "string" &&
          task.taskType.startsWith("scheduled.") &&
          task.status === "queued"
        ) {
          // 调度采集 node (scheduled.self.metrics | scheduled.comments, T-007 D3, SPEC
          // 2026-06-30 §3/§5) — 确定性、不调 LLM 的又一个 live dispatch runner。区别于上面
          // 15 个 LLM runner:不产候选、不过采纳门,直接调注入的 collector 抓真数据(fetchDouyin
          // Metrics/Comments,数值程序化抽取)→ ingestion 落库 → 合成 step 写 ai_task_steps →
          // task succeeded → 回填 job_run。未登录 → job_run needs_reconnect(§6);任一异常 →
          // task failed + job_run failed(finally 兜底,绝不悬挂 running)。**不碰死链
          // drainQueue/runTask(见 SPEC 顶部🔧)。** 触发经 dispatchScheduledCollection(与调度器
          // triggerScheduledJob 共用的单一触发点,下方装配)。
          dispatchScheduledCollection?.(ctx, {
            id: String(task.id),
            taskType: task.taskType,
            inputData: (task.inputData ?? {}) as Record<string, unknown>,
          });
        }
      }
      // 全局 AI 助手 (copilot.assist) — a USER message create fires the positioning-aware
      // assistant runner in the BACKGROUND (fire-and-forget, mirrors the task triggers).
      // The runner reads the conversation, assembles the positioning brief (+ 飞轮
      // learnings), runs real Claude, and appends the assistant reply via the service; the
      // UI polls listMessages for it. The AI module/service stays deterministic.
      if (endpoint.id === "ai.conversations.messages.create" && ctx) {
        const { params, body } = (input ?? {}) as {
          params?: { conversationId?: string };
          body?: { projectId?: string };
        };
        const conversationId =
          typeof params?.conversationId === "string"
            ? params.conversationId
            : "";
        if (conversationId) {
          const positioningReader = {
            getPositioningCenter: (c: RequestContext) =>
              positioningService.getPositioningCenter(c),
          };
          const learningsReader = {
            getSuggestions: (c: RequestContext, opts: { limit?: number }) =>
              learningsService.getSuggestions(c, opts),
          };
          void runCopilotAssist(
            ctx,
            {
              conversationId,
              projectId:
                typeof body?.projectId === "string" ? body.projectId : null,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              llm: llmCompleter,
            },
          );
        }
      }
      return res;
    },
  };

  // [T-052 裁决③] Monetization service/transport 装配段已随变现中心物理删除(宪法 §8)。

  // Candidate (module 19, Wave 5): the service builds a per-ctx user-scoped repo over
  // the shared db (the repo bakes userId in; the service mints one per request). The
  // transport returns this ONE shared service. Peers are reached ONLY through injected
  // narrow ports (no cross-module repo import, SPEC §22), satisfied here by the peers'
  // public services / the shared projects repo:
  //   - projects.createProject → projectsService.createProject (promote → Project,
  //     Research-stage seed; ProjectsService stamps ctx.userId). The promotion returns
  //     the new project id so the FE can navigate to /projects/:id.
  //   - positioning.evaluateFit → positioningService.evaluateGate (subjectType
  //     "candidate", inline payload) → its deterministic 0–100 fit. SOFT dep: when the
  //     user has no positioning statement the gate throws GateSubjectError — swallow to
  //     null so the Candidate renders ungated (the page is not blocked by module 17).
  //   - ingestion.assertRunExists → ingestionService.getRun (RISK-005 — the run must
  //     be a REAL IngestionRun; cross-user / unknown → OwnershipError).
  // Clock/ids share the deterministic `deps` (createSeq keeps cand/sig/promo ids
  // collision-free across requests).
  const candidateService = createCandidateService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    projects: {
      // promote → Project:转发 briefDetail 草稿,新项目落 brief 阶段(立项工作台)。
      createProject: async (ctx, cmd) => {
        const row = await projectsService.createProject(ctx, cmd);
        return { id: row.id };
      },
    },
    positioning: {
      evaluateFit: async (ctx, subject) => {
        try {
          const result = await positioningService.evaluateGate(ctx, {
            subjectType: "candidate",
            subjectId: "candidate-inline",
            candidate: {
              title: subject.title,
              angle: subject.angle,
              contentRole: subject.contentRole ?? undefined,
              productAnchorId: subject.productAnchorId ?? undefined,
            },
          });
          return result.positioningFit;
        } catch {
          // SOFT dep — no positioning statement yet (GateSubjectError) ⇒ ungated.
          // Return null so the Candidate renders without a fit; module 17 is not a
          // hard blocker (a one-shot backfill recomputes fit when positioning lands).
          return null;
        }
      },
    },
    ingestion: {
      assertRunExists: async (ctx, runId) => {
        await ingestionService.getRun(ctx, runId);
      },
    },
    // 选题中心总览 cross-module aggregates (topics.overview 出题依据 + 来源). Each binds to a
    // peer's PUBLIC service (no cross-module repo import). SOFT — the service catches any
    // rejection and degrades to 0/"" so the overview never blocks on a peer.
    overview: {
      // 定位领域一句 — the creator's positioning field (or one-liner) for the 出题依据 label.
      positioningLabel: async (ctx) => {
        const center = await positioningService.getPositioningCenter(ctx);
        return (
          center.profile?.field ||
          center.currentStatement?.oneLiner ||
          ""
        );
      },
      // 知识库条数 — count of the creator's KnowledgeItems (listKnowledge returns the rows).
      knowledgeCount: async (ctx) =>
        (await knowledgeService.listKnowledge(ctx)).length,
      // 历史爆款 (高表现作品数) — there is NO honest per-publication 高表现 read on the
      // Analytics public surface yet (getDashboardRollup is an account-wide rollup, not a
      // per-work threshold count). Rather than fabricate one, report 0 until Analytics
      // exposes a real 高表现 count (零造假 — no 对应数据源, count=0).
      highPerformerCount: async () => 0,
      // 复盘回流经验条数 — count of the creator's Learnings (复盘沉淀, drives 已发布回流 +
      // 项目复盘 source). listLearnings returns the page total.
      learningsCount: async (ctx) => {
        const { total } = await learningsService.listLearnings(ctx, {
          limit: 1,
          offset: 0,
        });
        return total;
      },
    },
  });
  const candidate = createCandidateTransport(() => candidateService);

  // Calibration (module 20, Wave 5–7): the service builds a per-ctx user-scoped repo
  // over the shared db (the repo bakes userId in; the service mints one per request).
  // The transport returns this ONE shared service. Peers are reached ONLY through
  // injected narrow ports (no cross-module repo import, SPEC §22):
  //   - ingestion.assertRunExists → ingestionService.getRun (§C-4/RISK-005 — the
  //     CalibrationResult.actualMetrics must trace to a REAL, owned IngestionRun;
  //     cross-user / unknown → OwnershipError → 404; no new external write path).
  //   - learnings.adjustConfidence → BEST-EFFORT no-op this wave: the Learnings public
  //     surface exposes no confidence-adjust write yet (plan OQ3 — a new public method is
  //     the lighter path, deferred). The seam is wired so the §6.3 feedback lands in ONE
  //     place the moment Learnings exposes it; swallow until then (the CalibrationResult
  //     remains the source of truth, so this is non-destructive — SPEC §11).
  // Clock/ids share the deterministic `deps` (createSeq keeps rubric/rubricver/pred/
  // calibres ids collision-free across requests).
  const calibrationService = createCalibrationService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    ingestion: {
      assertRunExists: async (ctx, runId) => {
        // getRun is the ownership-gated IngestionRun read (cross-user / unknown →
        // OwnershipError). RISK-005: reject 悬空 ingestionRunId before any
        // CalibrationResult references it.
        await ingestionService.getRun(ctx, runId);
      },
      // 手动回流:无采集 run 时,建一次 source='manual' 的真 run(§C-4 溯源不破)。
      ensureManualRun: async (ctx, idempotencyKey) =>
        ingestionService.ensureManualRun(ctx, idempotencyKey),
    },
    learnings: {
      // §6.3 confidence feedback bridge — no public adjust-write on the Learnings
      // surface this wave (OQ3); best-effort no-op seam wired for when it lands.
      adjustConfidence: async () => {},
    },
    // 校准中心总览 cross-module aggregates (calibration.overview 待校准内容 + 经验沉淀). Each
    // binds to a peer's PUBLIC service (no cross-module repo import, SPEC §22). SOFT — the
    // service catches any rejection and degrades to [] so the overview never blocks.
    overview: {
      // 待校准内容 — the user's content_outputs (per project) + publications (with title).
      // content_outputs carry no platform (未发布), so platform="" there; publications carry
      // their real platform. The service subtracts subjects that already have a locked
      // prediction. Best-effort: a peer read failure degrades the whole list to [].
      listSubjects: async (ctx) => {
        const subjects: Array<{
          subjectType: "content_output" | "publication";
          subjectId: string;
          title: string;
          platform: string;
        }> = [];
        // 数据底座(SPEC §1.4)portfolio 级让位:有 imported 真项目 → 待校准内容只列真实
        //   导入项目(及其作品/发布),演示 fixture 项目让位;无 imported → 全量(过渡期)。
        const hasImported = await projectsService.hasImportedProjects(ctx);
        const allProjects = await projectsRepo.list(ctx);
        const projectRows = hasImported
          ? allProjects.filter((p) => p.source === "imported")
          : allProjects;
        const allowedPubIds = hasImported
          ? new Set(await resolveImportedPublicationIds(ctx))
          : null;
        // content_outputs — iterate the (已让位的)项目集, then each project's outputs.
        for (const proj of projectRows) {
          const outputs = await projectsRepo.listOutputs(ctx, proj.id);
          for (const o of outputs) {
            subjects.push({
              subjectType: "content_output",
              subjectId: o.id,
              title: o.title,
              platform: "",
            });
          }
        }
        // publications — the user's recent publications with their resolved display title.
        //   有 imported 时只收真实导入作品对应的发布(allowedPubIds 过滤)。
        const pubs = await publishingService.getRecentPublicationsWithTitle(ctx, {
          limit: 100,
          offset: 0,
        });
        for (const p of pubs) {
          if (allowedPubIds && !allowedPubIds.has(p.id)) continue;
          // imported publication 无 revision → 标题回退到作品(content_output)真实标题。
          let title = p.title;
          if (!title) {
            try {
              const out = await projectsRepo.getOutput(ctx, p.contentOutputId);
              title = out.title;
            } catch {
              // 防御:保持空,落到下方平台兜底。
            }
          }
          subjects.push({
            subjectType: "publication",
            subjectId: p.id,
            title: title || `${p.platform} 发布`,
            platform: p.platform,
          });
        }
        return subjects;
      },
      // 经验沉淀 — the user's Learnings (复盘回流经验), newest first, capped.
      listLearnings: async (ctx, limit) => {
        const { rows } = await learningsService.listLearnings(ctx, {
          limit,
          offset: 0,
        });
        return rows.map((l) => ({
          id: l.id,
          title: l.title,
          insight: l.insight ?? "",
        }));
      },
    },
  });
  const calibration = createCalibrationTransport(() => calibrationService);

  // PlatformAccount (module 21, Wave 5–7): the service builds a per-ctx user-scoped repo
  // over the shared db (the service mints one per request; the repo bakes userId in).
  // The transport returns this ONE shared service. No external port + no peer fan-out —
  // accounts are pure local records (the secretReference is an opaque reference resolved
  // elsewhere; §7.1 + Settings precedent, never a raw token). The PUBLIC
  // assertOwnedAccount(ctx, accountId, platform) guard is the cross-module binding seam
  // Publishing/Projects call before stamping accountId (through index.ts, no cross-module
  // repo import). Clock/ids share the deterministic `deps` (createSeq keeps acct ids
  // collision-free across requests).
  const platformAccountService = createPlatformAccountService({
    db,
    now: deps.now,
    nextId: deps.nextId,
  });
  const platformAccount = createPlatformAccountTransport(
    () => platformAccountService,
  );

  // Scheduling (module 23, T-007 / data-source-pipeline §4): the service builds a
  // per-ctx user-scoped repo over the shared db (repo bakes userId in). No external
  // port + no peer fan-out — scheduled_job/job_run are pure local owned-root records
  // (the scheduler D3 / 「立即运行」 D5 drive createRun/updateRun; the wire only reads
  // runs). Clock/ids share the deterministic `deps`. D6 UI reads/manages jobs through
  // this transport over the SAME pglite store.
  const schedulingService = createSchedulingService({
    db,
    now: deps.now,
    nextId: deps.nextId,
  });
  const scheduling = createSchedulingTransport(() => schedulingService);

  // ── 调度采集接线 (T-007 D3, SPEC 2026-06-30 §3/§5/§6) ─────────────────────────────
  // collectors:每个 sourceKind 一个确定性采集器(抓真数据 → ingestion 落库 → 返回新鲜度
  // 统计)。runner 靠注入调它,不 import fetchDouyin*(保持可测)。
  //
  // [T-136 §D 切片 c] 抖音 authDir **按号分目录**:采集器内用 douyinAuthDirFor(ctx.accountId)
  //   逐调解析(每号独立登录态,与 douyinFetch 端口同源、同 base)。评论 / 明细采集直连
  //   fetchDouyinComments*/Export,故在此按当前号拼路径(不像 refresh 走端口透传)。

  // [T-078] 每轮封面回填上限(env 可调,验证/降载用;非法值回默认)。
  const resolveCoverBackfillLimit = (): number => {
    const raw = Number(process.env.CREATOROS_COVER_BACKFILL_LIMIT);
    return Number.isFinite(raw) && raw > 0
      ? Math.floor(raw)
      : DEFAULT_COVER_BACKFILL_LIMIT;
  };

  const scheduledCollectors: Record<string, ScheduledCollector> = {
    // 自己主页作品+指标:直接复用 ingestionService.refreshDouyin(内部:校验源 → fetchDouyin
    // Metrics(launchPersistentContext 复用扫码登录态)→ ensureImportedProject×N →
    // ingestMetrics → completeRun)。未登录 → refreshDouyin 抛 DouyinNotLoggedInError(runner
    // catch → needs_reconnect)。itemsNew=本次真写入快照数(recordsWritten);metric_snapshots
    // 是 append-only 时间序列(同 capturedAt 幂等),无"更新"语义。
    // [T-078] 指标落库后追加封面回填(best-effort):对尚无 coverAssetId 的已发布抖音
    // publication,iesdouyin 分享页(经限流网关)抽 coverUrl → 下载(带 Referer)→
    // createGeneratedAsset 直落字节 → setCover 写 revision.coverAssetId。幂等(已有
    // 封面不进候选集)、单作品降级(runner 内 catch 继续)、整批失败不影响指标主流程
    // (此处再 catch 一层)。itemsUpdated = 本轮真回填的封面数(publication 确被更新,诚实)。
    "self.metrics": async (ctx, target, report) => {
      // [T-152] 阶段①:登录校验 + 确保采集源(refreshDouyin 内部先校验登录态再抓)。
      report({ stage: "login", processed: 0, total: null, message: "校验抖音登录态" });
      const externalSourceId =
        typeof target.externalSourceId === "string" && target.externalSourceId
          ? target.externalSourceId
          : // [T-144] 空 target(job 未绑源)→ ensure 本 user 的真实抖音采集源(无源建、有源
            // 复用),绝不再指已退役的 "src-douyin-canonical"(新库查无 → 抛「外部来源不存在」
            // → runner 报 failed → 采 0 条的根因)。ensure 后 refreshDouyin 能校验通过。
            await ingestionService.ensureDouyinSource(ctx);
      // [T-152] 阶段②:抓主页作品列表 + 落库(refreshDouyin 内部翻页/逐字稿是慢阶段,但在
      //   douyinFetch 端口后不可逐页上报 —— 见诚实存疑⑥。此处只标进入抓取阶段,完成后报条数)。
      report({ stage: "fetch", processed: 0, total: null, message: "抓取主页作品与指标" });
      const run = await ingestionService.refreshDouyin(ctx, {
        externalSourceId,
      });
      // 抓取落库完成:上报本轮真写入的快照数(累计条数)。
      report({
        stage: "fetch",
        processed: run.recordsWritten,
        total: null,
        message: `已落库 ${run.recordsWritten} 条作品指标`,
      });
      // [T-078] 封面回填(拉指标跑一轮即回填存量,无需独立入口)。
      let coversFilled = 0;
      // [T-151 缺口 B] publicationId → contentOutputId 映射(由候选集查询装配)——
      //   bindCoverToProject 据此解析作品所属项目(getOutput().projectId),把封面 asset 绑进
      //   该项目用料链。放在闭包里,listMissingCover 里填充,bindCoverToProject 里消费。
      const outputIdByPublication = new Map<string, string>();
      try {
        const backfill = await backfillDouyinCovers(
          {
            listMissingCover: async (limit) =>
              (
                await publishingService.listPublicationsMissingCover(ctx, {
                  platform: "douyin",
                  limit,
                })
              )
                .filter((p) => typeof p.externalId === "string" && p.externalId)
                .map((p) => {
                  // [缺口 B] 记下每条候选作品的 contentOutputId,供封面绑项目解析 projectId。
                  if (typeof p.contentOutputId === "string" && p.contentOutputId) {
                    outputIdByPublication.set(p.id, p.contentOutputId);
                  }
                  return {
                    publicationId: p.id,
                    externalId: p.externalId as string,
                  };
                }),
            // [gate-F7] iesdouyin channel 限流:注真网关单例(与逐字稿取直链同一 channel)。
            fetchVideoUrl: (awemeId) =>
              fetchDouyinVideoUrl(awemeId, {
                fetch: (...args) => fetch(...args),
                gateway: douyinGateway,
              }),
            downloadImage: (url) => downloadDouyinImage(url),
            createImageAsset: (input) =>
              assetsService.createGeneratedAsset(ctx, {
                assetType: "image",
                name: input.name,
                bytes: input.bytes,
                mimeType: input.mimeType,
              }),
            setCover: async (publicationId, coverAssetId) => {
              await publishingService.setCover(ctx, publicationId, coverAssetId);
            },
            // [T-151 缺口 B] 封面绑作品所属项目:publicationId → contentOutputId(上面装配的
            //   map)→ getOutput().projectId → materialLinksService.create(entityType='asset')。
            //   让素材中心「按项目」看到该作品封面(此前封面只进全局池,项目视图空)。绑定幂等
            //   由 materialLinks 服务侧兜底(重复采集同一封面 → 同一 (project, asset) 边);
            //   解析不到 output/project 或建边失败 → runner 侧独立 try/catch 吞掉(封面已落是真的)。
            bindCoverToProject: async (publicationId, coverAssetId) => {
              const outputId = outputIdByPublication.get(publicationId);
              if (!outputId) return; // 无 output 锚 → 无法解析项目,诚实跳过(不硬造)
              const output = await projectsRepo.getOutput(ctx, outputId);
              const projectId = output.projectId;
              if (!projectId) return;
              await materialLinksService.create(ctx, {
                projectId,
                contentOutputId: outputId,
                entityType: "asset",
                entityId: coverAssetId,
                role: "cover",
                stage: "publishing",
                addedByType: "ingestion",
              });
            },
          },
          {
            limit: resolveCoverBackfillLimit(),
            // [T-152] 封面回填阶段逐条上报进度(M/N;runner 节流到每 ~1.5s 写一次库)。
            onProgress: (doneN, totalN) =>
              report({
                stage: "cover_backfill",
                processed: doneN,
                total: totalN,
                message: `回填封面 ${doneN}/${totalN}`,
              }),
          },
        );
        coversFilled = backfill.filled;
        if (backfill.attempted > 0) {
          console.log(
            `[douyin-cover-backfill] 候选 ${backfill.attempted},回填 ${backfill.filled},跳过 ${backfill.skipped},失败 ${backfill.failed}`,
          );
        }
      } catch (err) {
        // 封面是锦上添花:回填整批失败绝不拖垮指标采集(run 仍 succeeded)。
        console.error("[douyin-cover-backfill] 封面回填整批失败(指标不受影响):", err);
      }
      // [T-151 / T-037 缺口 A] 逐字稿 + 重建触发:指标落库后,给 imported 作品排 transcribe.douyin
      //   (按 awemeId 取音频+ASR → 逐字稿 D3)+ reconstruct.project(按 projectId → 逐字稿+指标+定位
      //   反推 research/planning)。**fire-and-forget**:两者都慢(ASR/LLM),绝不同步阻塞导入 —— helper
      //   只排队即返回(经 ai transport ai.tasks.create 立即返回 queued),真正的 runner 由 dispatch 链
      //   后台跑。多闸幂等:transcribe runner 逐 aweme 跳已转写 + reconstruct 已有 artifact 跳过 +
      //   createTask 去重 IN-FLIGHT。整批失败绝不拖垮指标采集(best-effort)。
      //   注:reconstruct 依赖逐字稿存在(缺则 runner markFailed)——首轮逐字稿刚排未就绪,reconstruct
      //   会失败;本 helper 每轮采集都调(幂等),后续轮次逐字稿就绪后 reconstruct 即成功(诚实收敛)。
      try {
        const enqueued = await enqueueReconstructForImported(
          {
            listImportedWorks: (c) => projectsService.listImportedWorks(c),
            // 逐字稿:一批 awemeId 经 ai transport 排一个 transcribe.douyin(dispatch 链拦
            //   ai.tasks.create → runTranscribe;直调 service 会死链。runner 内逐 aweme 幂等跳已转写)。
            enqueueTranscribe: async (c, awemeIds) => {
              await ai.request(
                ENDPOINTS.createAITask,
                {
                  params: undefined,
                  query: undefined,
                  body: {
                    taskType: "transcribe.douyin",
                    inputData: { awemeIds },
                  },
                },
                c,
              );
            },
            // 闸:该项目是否已有 origin='reconstructed' 的 artifact(重建过了不重跑)。复用
            //   listProjectArtifacts 公开读(与 artifactOriginReader 同法),不加内容拉取。
            hasReconstructedArtifact: async (c, projectId) => {
              const rows = await artifactsService.listProjectArtifacts(
                c,
                projectId,
              );
              return rows.some((r) => r.origin === "reconstructed");
            },
            // **必须经 ai transport 的 ai.tasks.create 起任务**(不直调 aiService.createTask)——
            //   reconstruct.project 的 dispatch 分支(void runReconstruct)只在 ai transport request
            //   拦 endpoint.id==="ai.tasks.create" 时触发(见本文件 `const ai: Transport`)。直调
            //   service 会让任务停在 queued 死链(与 asset.generate 的 dispatchGenerateAsset 同款接线,
            //   memory: ai-task-execution-live-dispatch)。inputData.projectId 让 service 落 projectId
            //   并派生幂等键去重 IN-FLIGHT 重复(同项目 queued/running 命中既有,不建第二行、无副作用)。
            enqueueReconstruct: async (c, projectId) => {
              await ai.request(
                ENDPOINTS.createAITask,
                {
                  params: undefined,
                  query: undefined,
                  body: {
                    taskType: "reconstruct.project",
                    inputData: { projectId },
                  },
                },
                c,
              );
            },
          },
          ctx,
        );
        if (enqueued.considered > 0) {
          console.log(
            `[reconstruct-enqueue] imported ${enqueued.considered},逐字稿批 ${enqueued.transcribeEnqueued ? enqueued.transcribeAwemeCount : 0} 条,重建排队 ${enqueued.reconstructEnqueued},跳过 ${enqueued.reconstructSkipped},失败 ${enqueued.failed}`,
          );
        }
      } catch (err) {
        // 逐字稿/重建触发是锦上添花:排队整批失败绝不拖垮指标采集(run 仍 succeeded)。
        console.error(
          "[reconstruct-enqueue] 逐字稿/重建任务排队整批失败(指标不受影响):",
          err,
        );
      }
      return { itemsNew: run.recordsWritten, itemsUpdated: coversFilled };
    },
    // 评论:fetchDouyinComments(target)→ ingestComments(D2 的纯 ports 落库:建 run → 逐条经
    // ux_ingestion_records_run_key 去重 → candidateService.ingestAudienceSignal(source=
    // "comment",带 ingestionRunId,C-4)→ completeRun)。itemsNew=written(新写信号数);
    // 评论只新写不更新 → itemsUpdated 恒 0。
    comments: async (ctx, target, report) => {
      // [T-152] 阶段①:登录校验 + 确保采集源(抓评论前 fetchDouyinComments* 内先校验登录态)。
      report({ stage: "login", processed: 0, total: null, message: "校验抖音登录态" });
      const externalSourceId =
        typeof target.externalSourceId === "string" && target.externalSourceId
          ? target.externalSourceId
          : // [T-144] 空 target(job 未绑源)→ ensure 本 user 的真实抖音采集源(无源建、有源
            // 复用),绝不再指已退役的 "src-douyin-canonical"(新库查无 → 抛「外部来源不存在」
            // → runner 报 failed → 采 0 条的根因)。ensure 后 refreshDouyin 能校验通过。
            await ingestionService.ensureDouyinSource(ctx);
      const maxPages =
        typeof target.maxPages === "number" ? target.maxPages : undefined;
      // CommentIngestPorts 真实装配(所有作品共用一套 ports):ingestion repo(去重 ledger)+
      // candidate service(信号写,C-4 骑 ingestion run)+ ingestion service(run 生命周期)。
      const ingestionRepo = createIngestionRepository(db, {
        now: deps.now,
        nextId: deps.nextId,
        userId: ctx.userId,
        // [T-136 §D 切片 c] 评论采集 run/去重 ledger 按当前号(去重锚仍是 run+recordKey,
        //   run 已 stamp 号;这里带号让 repo 门与 service 侧一致)。
        accountId: ctx.accountId ?? null,
      });
      const commentPorts: CommentIngestPorts = {
        createRun: async (input) => {
          const run = await ingestionService.createRun(ctx, {
            externalSourceId: input.externalSourceId,
            runType: input.runType,
            idempotencyKey: input.idempotencyKey,
          });
          return { id: run.id };
        },
        recordExists: (runId, recordKey) =>
          ingestionRepo.recordExists(runId, recordKey),
        markRecordWritten: (runId, recordKey) =>
          ingestionRepo.markRecordResult(runId, recordKey, "written"),
        ingestSignal: async (input) => {
          // C-4:AudienceSignal 写必带 ctx.ingestionRunId(source="ingestion")。
          // [T-136 §D 切片 c] 关键:透传当前号 —— candidateService.ingestAudienceSignal 的
          //   repo 门据 ctx.accountId stamp audience_signals.account_id。漏传 = 评论信号无号
          //   归属(切号看不到该号受众信号 / 串味)。这是手搓 ctx,不经 downstreamCtx,必须显式带。
          const signalCtx: RequestContext = {
            userId: ctx.userId,
            requestId: ctx.requestId,
            source: "ingestion",
            accountId: ctx.accountId ?? null,
            ingestionRunId: input.ingestionRunId,
          };
          const res = await candidateService.ingestAudienceSignal(signalCtx, {
            source: input.source,
            rawText: input.rawText,
            demandTag: input.demandTag,
            // 评论按作品可读 (T-030 D6) — 回填作品绑定(ingestComments 已按评论自身 aweme_id 解析)。
            publicationId: input.publicationId,
            // 评论点赞数 (T-042 热榜排序依据) — 采集抓的 digg_count。
            likeCount: input.likeCount,
            // 评论粒度幂等锚 (T-065) — `douyin:comment:<cid>`;跨 run 唯一,重采不重复入库。
            externalId: input.externalId,
          });
          // inserted=false → 命中跨 run 幂等锚(库里已有该评论),ingestComments 计 skipped。
          return { inserted: res.inserted };
        },
        // 按 aweme_id 查对应作品的 publication_id(T-030 D6 回填,F3):命中 published +
        // external_id=aweme_id 的 publication → id,否则 null(评论仍落库,只是不绑作品)。
        resolvePublicationId: async (aweme: string) => {
          const pub = await publishingService.resolvePublication(ctx, {
            platform: "douyin",
            externalId: aweme,
          });
          return pub?.id ?? null;
        },
        completeRun: async (runId: string) => {
          await ingestionService.completeRun(ctx, { runId });
        },
      };
      // 单作品评论落库(纯 ingest 部分,抓取已由调用方完成;每作品前 100 条由抓取层 maxPages 控)。
      // commentPorts 复用(整批共用一套),ingest 逻辑不变。
      const ingestRecordsForWork = async (
        awemeId: string,
        records: CommentRecord[],
      ): Promise<number> => {
        const capturedAt = deps.now();
        const result = await ingestComments(awemeId, records, {
          externalSourceId,
          capturedAt,
          ports: commentPorts,
        });
        return result.written;
      };
      // ① 指定 target.awemeId → 只抓该作品;② 未指定 → 抓「我所有作品」评论:遍历用户所有
      //    douyin publications(external_id=aweme_id),**复用单 browser context 跨作品**
      //    (fetchDouyinCommentsForWorks:openContext 开一次 → 循环内逐作品抓 → close 一次),
      //    取代旧「N 作品 × 各开一个 headless 浏览器」路径。
      const single =
        typeof target.awemeId === "string" && target.awemeId
          ? target.awemeId
          : "";
      if (single) {
        // 单作品仍走单作品抓取路径(fetchDouyinComments 内部 openContext 一次)。
        // [gate-F7 插装点③] creator-center 评论翻页限流(注真单例)。
        // [T-152] 单作品:标进入抓取阶段(1/1)。
        report({
          stage: "comments",
          processed: 0,
          total: 1,
          message: "抓取该作品评论",
        });
        const records = await fetchDouyinComments(
          {
            awemeId: single,
            authDir: douyinAuthDirFor(ctx.accountId), // [T-136] 按当前号登录态
            maxPages,
          },
          { gateway: douyinGateway },
        );
        const written = await ingestRecordsForWork(single, records);
        report({
          stage: "comments",
          processed: 1,
          total: 1,
          message: `已落库 ${written} 条评论`,
        });
        return { itemsNew: written, itemsUpdated: 0 };
      }
      const pubs = await publishingService.getRecentPublicationsWithTitle(ctx, {
        limit: 500,
      });
      const awemeIds = pubs
        .filter((p) => p.platform === "douyin" && p.externalId)
        .map((p) => p.externalId as string);
      // 复用单 context 一次性抓完所有作品评论(未登录 → 一次性抛 DouyinNotLoggedInError,
      // runner catch → needs_reconnect),再逐作品 ingestComments 落库(落库逻辑不变)。
      // [gate-F7 插装点③④] creator-center:每作品 acquire 一次 + 作品内翻页每页 acquire(注真单例)。
      // [T-152] 标进入抓取阶段(总作品数已知 → total=awemeIds.length)。
      report({
        stage: "comments",
        processed: 0,
        total: awemeIds.length,
        message: `抓取 ${awemeIds.length} 个作品的评论`,
      });
      const perWork = await fetchDouyinCommentsForWorks(
        awemeIds,
        {
          authDir: douyinAuthDirFor(ctx.accountId), // [T-136] 按当前号登录态
          maxPages,
        },
        { gateway: douyinGateway },
      );
      let total = 0;
      let doneWorks = 0;
      for (const { awemeId, records } of perWork) {
        total += await ingestRecordsForWork(awemeId, records);
        // [T-152] 逐作品上报进度(M/N;runner 节流写库)。processed=已落库作品数,累计评论数入 message。
        doneWorks += 1;
        report({
          stage: "comments",
          processed: doneWorks,
          total: perWork.length,
          message: `已处理 ${doneWorks}/${perWork.length} 个作品 · 累计 ${total} 条评论`,
        });
      }
      return { itemsNew: total, itemsUpdated: 0 };
    },
    // 作品明细导出(T-030-D8a,SPEC §9b):fetchDouyinWorkListExport(headless 复用 .auth/ →
    // 导航数据中心作品分析 → 点「刷新数据」+「导出数据」→ 截 xlsx 校验 PK 头)→ parseDouyin
    // WorkListXlsx(16 字段容错解析)→ 按 title/pub_date 匹配 publication(无 aweme_id 维度,
    // 匹配不上跳过)→ toDetailMetricRecords → ingestMetrics(resolvePublication→appendSnapshot,
    // rawMetrics 带完播/封面CTR/5s完播/2s跳出/主页访问 → 复盘核心指标从 0/fixture 变真)。
    // 未登录 → DouyinNotLoggedInError(runner catch → needs_reconnect,§6);导出非 xlsx →
    // DouyinExportError(普通失败)。itemsNew=真写入快照数;明细快照 append-only → itemsUpdated 0。
    "self.detail": async (ctx, target, report) => {
      // [T-152] 阶段①:登录校验 + 确保采集源(导出前 fetchDouyinWorkListExport 内先校验登录态)。
      report({ stage: "login", processed: 0, total: null, message: "校验抖音登录态" });
      const externalSourceId =
        typeof target.externalSourceId === "string" && target.externalSourceId
          ? target.externalSourceId
          : // [T-144] 空 target(job 未绑源)→ ensure 本 user 的真实抖音采集源(无源建、有源
            // 复用),绝不再指已退役的 "src-douyin-canonical"(新库查无 → 抛「外部来源不存在」
            // → runner 报 failed → 采 0 条的根因)。ensure 后 refreshDouyin 能校验通过。
            await ingestionService.ensureDouyinSource(ctx);
      const capturedAt = deps.now();
      // 1) 抓导出 xlsx bytes(headless 复用扫码登录态;未登录/非 xlsx 抛,run 不建 → 快速失败)。
      // [gate-F7 插装点⑤] creator-center 导出限流(注真单例)。
      // [T-152] 阶段②:导出明细 xlsx(点「刷新数据」+「导出数据」,慢阶段)。
      report({ stage: "export", processed: 0, total: null, message: "导出作品明细数据" });
      const bytes = await fetchDouyinWorkListExport(
        { authDir: douyinAuthDirFor(ctx.accountId) }, // [T-136] 按当前号登录态
        { gateway: douyinGateway },
      );
      // 2) 解析 16 字段明细(纯,exceljs 读内存 buffer)。
      // [T-152] 阶段③:解析明细(N 条)。
      report({ stage: "parse", processed: 0, total: null, message: "解析明细数据" });
      const details = await parseDouyinWorkListXlsx(bytes);
      report({
        stage: "parse",
        processed: details.length,
        total: null,
        message: `解析出 ${details.length} 条明细`,
      });
      // 3) 装配作品目录(title + externalId=aweme_id + publishedAt),按 title/pub_date 匹配。
      //    T-034 断裂修复:导入作品(external_id=aweme_id)故意无 revision(见 publishing.repository
      //    createImportedPublication),故 getRecentPublicationsWithTitle 回来的 title 为空 —— 与
      //    L3004 dossier 装配同款回退:revision title 空时取 content_output 真实标题(导入时落在
      //    projects/content_output 上)。不回退 → 72 条采集作品 catalog title 恒空 → xlsx 明细
      //    永远匹配不上 → items_new 恒 0(断裂根因)。
      const pubs = await publishingService.getRecentPublicationsWithTitle(ctx, {
        limit: 500,
      });
      const catalog: PublicationCatalogEntry[] = [];
      for (const p of pubs) {
        let title = p.title;
        if (!title) {
          try {
            const out = await projectsRepo.getOutput(ctx, p.contentOutputId);
            title = out.title;
          } catch {
            // 防御:取不到作品标题就保持空(该条明细自然匹配不上,诚实跳过)。
          }
        }
        catalog.push({
          id: p.id,
          platform: p.platform,
          title,
          publishedAt: p.publishedAt,
          // [T-036] 同名同刻双轨(fixture 无 externalId / imported 有)消歧优先 imported ——
          // 落库锚就是 externalId,匹到 fixture 轨整条明细会被 toDetailMetricRecords 丢弃。
          externalId: p.externalId ?? null,
        });
      }
      const externalIdById = new Map<string, string>();
      for (const p of pubs) {
        if (p.externalId) externalIdById.set(p.id, p.externalId);
      }
      const matches = matchDetailsToPublications(details, catalog);
      // 3b) [T-073] 平台侧可见性同步:明细「审核状态」列(如「仅自己可见」/「已通过」)
      //     → publication.hidden_at + 导入项目 platform_ref.hidden。判定不了(审核中/
      //     未通过/空)诚实跳过,不动既有标记;找不到承载行也跳过(不硬造)。放在指标
      //     落库之前、且不受 records.length===0 早退影响(隐藏作品也可能产不出 record)。
      // [T-151 缺口 C 诊断] 可见性同步逐档计数 —— 存量真机 hidden_at 全 NULL 的根因需真机 xlsx
      //   才能定位(是 title 匹配不上?还是「审核状态」列没解析到值?还是状态字面量不含隐藏口径?)。
      //   加这组计数 + 采样,让下次真扫**自证根因**(不改数据、不硬猜),诚实分层。
      const visDiag = {
        total: matches.length,
        unmatched: 0, // publicationId=null(title 匹配不上 → T-034 断裂域)
        unknownStatus: 0, // 匹上了但审核状态判不出(列没解析 / 字面量不含隐藏口径)
        noExtId: 0, // 匹上了但无 externalId 锚(fixture 轨)
        hiddenSynced: 0, // 真标了 hidden
        visibleSynced: 0, // 真标了 visible
      };
      const statusSamples = new Set<string>();
      for (const m of matches) {
        if (!m.publicationId) {
          visDiag.unmatched += 1;
          // 采样未匹配明细的「审核状态」原值(去重,最多留几个),便于真机比对列/字面量。
          if (statusSamples.size < 8) statusSamples.add(m.detail.status ?? "");
          continue;
        }
        const vis = visibilityFromDetailStatus(m.detail.status);
        if (vis === "unknown") {
          visDiag.unknownStatus += 1;
          if (statusSamples.size < 8) statusSamples.add(m.detail.status ?? "");
          continue;
        }
        const extId = externalIdById.get(m.publicationId);
        if (!extId) {
          visDiag.noExtId += 1;
          continue; // 无 externalId 锚(fixture 轨)→ 跳过
        }
        const hidden = vis === "hidden";
        try {
          await publishingService.setVisibilityByExternalKey(ctx, {
            platform: "douyin",
            externalId: extId,
            hidden,
          });
          await projectsService.setImportedProjectHidden(ctx, {
            platform: "douyin",
            externalId: extId,
            hidden,
          });
          if (hidden) visDiag.hiddenSynced += 1;
          else visDiag.visibleSynced += 1;
        } catch {
          // 可见性同步失败不拖垮整批指标落库(best-effort;下轮采集会再同步)。
        }
      }
      // [缺口 C 诊断] 打印逐档结果 + 未判定明细的审核状态采样。真机看这行即知根因:
      //   unmatched 高 → title 匹配断裂;unknownStatus 高 + 采样非空 → 列/字面量口径需扩;
      //   hidden/visibleSynced 有值 → 同步链本身通(问题只在存量那一次)。
      console.log(
        `[douyin-detail-visibility] 明细 ${visDiag.total}:未匹配 ${visDiag.unmatched},状态判不出 ${visDiag.unknownStatus},无锚 ${visDiag.noExtId},标隐藏 ${visDiag.hiddenSynced},标可见 ${visDiag.visibleSynced}` +
          (statusSamples.size > 0
            ? ` · 未判定审核状态采样: ${Array.from(statusSamples)
                .map((s) => JSON.stringify(s))
                .join(", ")}`
            : ""),
      );
      // 4) 匹配上的明细 → MetricRecord[](未匹配 / 无 externalId 锚 → 跳过,诚实)。
      const records = toDetailMetricRecords(
        matches,
        (pubId) => externalIdById.get(pubId) ?? null,
        capturedAt,
      );
      if (records.length === 0) {
        // 一条都没匹配上(作品未导入 / title 对不上)—— 不建空 run,诚实返 0(F3 边界)。
        return { itemsNew: 0, itemsUpdated: 0 };
      }
      // [T-152] 阶段④:匹配落库(records.length 条匹配上的明细 → ingestMetrics)。
      report({
        stage: "ingest",
        processed: 0,
        total: records.length,
        message: `匹配落库 ${records.length} 条明细`,
      });
      const run = await ingestionService.createRun(ctx, {
        externalSourceId,
        runType: "douyin_detail",
        idempotencyKey: `${externalSourceId}:detail:${capturedAt}`,
      });
      const result = await ingestionService.ingestMetrics(ctx, {
        runId: run.id,
        records: records as unknown as Array<Record<string, unknown>>,
      });
      await ingestionService.completeRun(ctx, { runId: run.id });
      report({
        stage: "ingest",
        processed: result.recordsWritten,
        total: records.length,
        message: `已落库 ${result.recordsWritten} 条明细`,
      });
      return { itemsNew: result.recordsWritten, itemsUpdated: 0 };
    },
  };

  // dispatchScheduledCollection 实体:装 runner deps 后经 [gate-F5] 采集串行闸挂到链尾
  // (fire-and-forget,concurrency=1)。forward-declared 于 ai transport 之上;dispatch 分支 +
  // 调度器共用。**串行闸让同时只跑一个采集 job**(防两个 Chromium 各打一 channel 并存),与
  // gateway 的请求级节奏正交(SPEC §4.4 [gate-F5])。runScheduledCollection 内部已 try/catch/
  // finally 落 job_run 终态,链尾再 catch 兜底,一次失败不堵死后续采集。
  dispatchScheduledCollection = (ctx, task) => {
    enqueueCollectionRun(() =>
      runScheduledCollection(ctx, task, {
        ai: {
          markRunning: (c, id) => aiService.markRunning(c, id),
          recordStep: (c, id, input) => aiService.recordStep(c, id, input),
          markSucceeded: (c, id) => aiService.markSucceeded(c, id),
          markFailed: (c, id, err) => aiService.markFailed(c, id, err),
        },
        runs: {
          updateRun: (c, runId, patch) =>
            schedulingService.updateRun(c, runId, patch),
        },
        collectors: scheduledCollectors,
        // runner 不 import douyin-cdp:未登录判别经注入(→ needs_reconnect,§6)。
        isNotLoggedInError: (err) => err instanceof DouyinNotLoggedInError,
        now: deps.now,
      }),
    );
  };

  // 调度器系统 ctx:自发触发(无 HTTP 请求),用 canonical user 身份(本机单用户起步)。
  // source="ingestion":调度器本质是数据采集 pipeline 触发(与 L2816 采集 ctx 一致;
  // RequestContext.source 枚举无 "system",ingestion 是诚实 provenance)。
  const schedulerCtx: RequestContext = {
    userId: canonicalDataset.user.id,
    requestId: "scheduler",
    source: "ingestion",
  };

  // triggerScheduledJob 的共用 deps(TriggerDeps):cron 到点(startScheduler)与「立即运行」
  // (D5,scheduledJobs.runNow)共用同一份端口 —— 触发点单一(SPEC §5),幂等双闸只此一处。
  // ai.createTask/runs.*/dispatch 绑工厂内可见的 aiService/schedulingService/
  // dispatchScheduledCollection。
  const triggerDeps: TriggerDeps = {
    ai: {
      createTask: async (c, body) => {
        const t = await aiService.createTask(c, body);
        return { id: t.id, status: t.status };
      },
    },
    runs: {
      createRun: (c, input) => schedulingService.createRun(c, input),
      listRunsByJob: async (c, jobId, query) => {
        const { rows, total } = await schedulingService.listRunsByJob(
          c,
          jobId,
          query,
        );
        return {
          rows: rows.map((r) => ({
            id: r.id,
            status: r.status,
            startedAt: r.startedAt,
            aiTaskId: r.aiTaskId ?? null,
          })),
          total,
        };
      },
      updateRun: (c, runId, patch) =>
        schedulingService.updateRun(c, runId, patch),
    },
    dispatch: (ctx, task) => dispatchScheduledCollection?.(ctx, task),
    now: deps.now,
  };

  // 「立即运行」(D5):wrap scheduling transport,拦 scheduledJobs.runNow(composition-only
  // op —— module transport 不认它,因触发后台动作要 dispatchScheduledCollection,在此 composition
  // 层才可见)。命中 → 用**请求 ctx**(真实 userId,手动触发归当前用户)查 job → triggerScheduledJob
  // (幂等双闸 + fire-and-forget)→ 返回 { jobRunId, aiTaskId, deduped }。其余 op 透传 module
  // transport(scheduling)。
  const schedulingWithRunNow: Transport = {
    async request(endpoint, input, ctx) {
      if (endpoint.id === "scheduledJobs.runNow") {
        if (!ctx) throw new Error("AuthenticationError: runNow requires ctx");
        const { params } = (input ?? {}) as { params?: { jobId?: string } };
        const jobId = params?.jobId ?? "";
        const result = await runJobNow(ctx, jobId, {
          ...triggerDeps,
          job: {
            getJob: async (c, id) => {
              const j = await schedulingService.getJob(c, id);
              return { id: j.id, sourceKind: j.sourceKind, target: j.target };
            },
          },
        });
        return {
          data: {
            jobRunId: result.jobRunId,
            aiTaskId: result.aiTaskId,
            deduped: result.deduped,
          },
          meta: { requestId: ctx.requestId },
        };
      }
      return scheduling.request(endpoint, input, ctx);
    },
  };

  // 启动扫超时(gate finding 3):进程(重)启动时,扫上一进程留下仍 running 且 started_at
  // 超时(>30min)的 job_run → 标 failed,兜"进程崩在 running"的残留。best-effort:失败不
  // 阻断 build。
  void sweepStaleRuns({
    runs: {
      // sweep 只用 updateRun;createRun/listRunsByJob 此路径不触达,给 no-op 满足端口形状。
      createRun: async () => ({ id: "" }),
      listRunsByJob: async () => ({ rows: [], total: 0 }),
      updateRun: (c, runId, patch) => schedulingService.updateRun(c, runId, patch),
    },
    listRunningRuns: async (c) => {
      const rows = await schedulingService.listRunningRuns(c);
      return rows.map((r) => ({ id: r.id, startedAt: r.startedAt }));
    },
    ctx: schedulerCtx,
    now: deps.now,
  }).catch((e) => console.error("[scheduler] 启动扫超时失败:", e));

  // node-cron 进程内调度:每分钟轮询 enabled 且"最近一次 run 非 needs_reconnect"的 job(§6:
  // 登录态过期停跑),cron 到点 → triggerScheduledJob。测试/build 环境不启动(startScheduler
  // 内环境守卫 + 单例守卫)。listRunnableJobs 经 listJobs + 每 job 查最近 run 过滤。
  void startScheduler({
    ...triggerDeps, // ai/runs/dispatch/now —— 与「立即运行」(D5)共用同一份触发端口
    ctx: schedulerCtx,
    listRunnableJobs: async (c) => {
      // enabled job 全取,再逐个用最近一次 run 过滤掉"最近 needs_reconnect"的(§6 停跑)。
      const { rows } = await schedulingService.listJobs(c, {
        enabled: true,
        limit: 200,
        offset: 0,
      });
      const runnable: SchedulableCronJob[] = [];
      for (const job of rows) {
        const recent = await schedulingService.listRunsByJob(c, job.id, {
          limit: 1,
          offset: 0,
        });
        const last = recent.rows[0];
        if (last && last.status === "needs_reconnect") continue; // 登录态过期,停跑等重连
        runnable.push({
          id: job.id,
          sourceKind: job.sourceKind,
          target: (job.target ?? {}) as Record<string, unknown>,
          schedule: job.schedule,
          enabled: job.enabled,
        });
      }
      return runnable;
    },
  }).catch((e) => console.error("[scheduler] 启动失败:", e));

  // ContentCalendar (module 22, Wave 5–7): the service builds a per-ctx user-scoped
  // repo over the shared db; peer modules are reached ONLY through narrow injected
  // ports bound here to the REAL public services (no cross-module repo import,
  // foundation §1). platformAccounts.getAccount is the account ownership gate;
  // publishing.isOutputPublished reads already-ingested publishing reality for the
  // reconcile pass (C-4 — derived from PublicationService.listPublications status, no
  // new write path); candidates.exists is the C-3 FK validation (wraps getCandidate,
  // which throws OwnershipError when absent — we never create a Candidate here);
  // notifications.notify is the 断更 seam (best-effort no-op until a public
  // create-notification op lands — mirrors the learnings.adjustConfidence seam below).
  const contentCalendarService: ContentCalendarService =
    createContentCalendarService({
      db,
      now: deps.now,
      nextId: deps.nextId,
      clock: { now: deps.now },
      platformAccounts: {
        getAccount: (ctx, accountId) =>
          platformAccountService.getAccount(ctx, accountId),
      },
      publishing: {
        isOutputPublished: async (ctx, contentOutputId) => {
          const pubs = await publishingService.listPublications(
            ctx,
            contentOutputId,
            { limit: 100, offset: 0 },
          );
          return pubs.some((p) => p.status === "published");
        },
      },
      candidates: {
        exists: async (ctx, candidateId) => {
          try {
            await candidateService.getCandidate(ctx, candidateId);
            return true;
          } catch {
            return false;
          }
        },
      },
      notifications: {
        // No public create-notification op this wave (OQ5): the 断更 reminder is a
        // Notifications/Todo concern wired via getLaggingAccounts on the Wave-4
        // Dashboard. Best-effort no-op seam keeps reconcile total + deterministic.
        notify: async () => {},
      },
    });
  const contentCalendar = createContentCalendarTransport(
    () => contentCalendarService,
  );

  // MaterialLinks (用料链 / Bill-of-Materials, Plan A4): the service builds a per-ctx
  // user-scoped repo over the shared db (the service mints one per request; the repo
  // bakes userId in). The transport returns this ONE shared service. No external port +
  // no peer fan-out — links are pure local records (entityId/contentOutputId are soft
  // references validated at the caller's seam, never a DB FK across module schemas).
  // delete is ownership-gated (cross-user → OwnershipError → 404). Clock/ids share the
  // deterministic `deps` (createSeq keeps matlink ids collision-free across requests).
  const materialLinksService = createMaterialLinksService({
    db,
    now: deps.now,
    nextId: deps.nextId,
  });
  const materialLinks = createMaterialLinksTransport(
    () => materialLinksService,
  );

  // Query services (module Q, Wave 4 — SPEC §19). Composition module: NO repo, NO
  // SQL. Each composer is built with facade interfaces; here the composition root
  // binds those facades to the REAL public services (consumed only via their
  // index.ts entries above — projectsService / publishingService / analyticsService
  // / learningsService / notificationsRepo→service / knowledgeService / assetsService
  // / searchService). The request's `ctx` is threaded UNCHANGED into every facade
  // call, so each downstream service enforces its own eq(userId, ctx.userId) scope.
  //
  // Open question #1: several SPEC §19 read methods are NOT yet on the frozen
  // upstream index.ts (Projects has no getDashboardSummary / project-overview read;
  // Analytics has no dashboard/publishing metric rollup). Rather than read a peer
  // repository (forbidden, SPEC §19/§22), the gap sections compose to DTO-valid
  // EMPTY/zero projections — the page renders a real (possibly empty) composition,
  // never a 500, and slots real data the moment those upstream reads land. The
  // ownership-404 path is REAL: getProjectOverview gates via
  // projectsService.listOutputIdsByProject (throws OwnershipError for a cross-user /
  // unknown project id).
  const notificationsServiceForQuery = createNotificationsService(
    notificationsRepo,
    deps,
  );
  const EMPTY_STAGE = "research" as const;

  const dashboardQuery = createDashboardQueryService({
    projects: {
      // GAP-DASH-1 做真:继续创作 = 用户最近活跃的非归档项目;待办 = 该项目下真实
      // 未完成 task。数据来自 projectsService.getDashboardSummary(本模块 repo 组合,
      // 不跨模块);facade 只补 heading + 收窄类型。
      getDashboardSummary: async (ctx) => {
        const s = await projectsService.getDashboardSummary(ctx);
        const clampPriority = (p: number): 1 | 2 | 3 | 4 | 5 =>
          Math.min(5, Math.max(1, Math.round(p))) as 1 | 2 | 3 | 4 | 5;
        return {
          continueCreating: s.continueCreating
            ? {
                heading: "继续创作",
                projectId: s.continueCreating.projectId,
                projectTitle: s.continueCreating.projectTitle,
                stage: s.continueCreating.stage as ProjectStageName,
                progressPct: s.continueCreating.progressPct,
                updatedAt: s.continueCreating.updatedAt,
              }
            : null,
          todos: s.todos.map((t) => ({
            id: t.id,
            title: t.title,
            projectId: t.projectId,
            projectTitle: t.projectTitle,
            stage: t.stage as ProjectStageName,
            dueAt: t.dueAt,
            priority: clampPriority(t.priority),
            status: t.status as TaskStatus,
          })),
        };
      },
    },
    publishing: {
      getRecentPublications: async (ctx) => {
        // GAP-DASH-3 做真:真标题(来自 revision,publishing 模块内解析)+ 真播放/
        // 互动(facade 层 join analytics 最新快照 rawMetrics,跨模块组合只在此层)。
        // 数据底座(SPEC §1.4):有 imported 真项目 → 只取真实导入作品的发布(演示 fixture
        //   发布让位,治 dy-pub-00 假标题/0 播放);无 imported → 全量(过渡期演示态)。
        //   先多取一些再按 imported 集过滤,保证过滤后仍能凑满前 5 条真发布。
        const hasImported = await projectsService.hasImportedProjects(ctx);
        const importedPubIds = hasImported
          ? new Set(await resolveImportedPublicationIds(ctx))
          : null;
        const fetched = await publishingService.getRecentPublicationsWithTitle(
          ctx,
          { limit: importedPubIds ? 100 : 5 },
        );
        const rows = (
          importedPubIds
            ? fetched.filter((r) => importedPubIds.has(r.id))
            : fetched
        ).slice(0, 5);
        const numOf = (raw: Record<string, unknown>, key: string): number => {
          const v = raw[key];
          return typeof v === "number" && Number.isFinite(v) ? v : 0;
        };
        return Promise.all(
          rows.map(async (r) => {
            let views = 0;
            let engagement = 0;
            try {
              const page = await analyticsService.getPublicationAnalytics(
                ctx,
                r.id,
                1,
                10,
              );
              const latest = page.rows
                .slice()
                .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
              const raw = (latest?.rawMetrics ?? {}) as Record<string, unknown>;
              // 数据底座(SPEC §1.4):播放量键名归一 —— 真采集(douyin ingestion)写
              //   `views`,演示 fixture 写 `plays`;优先真 `views`,缺失回退 `plays`(二者
              //   不并存)。否则真实导入作品的播放恒为 0(原只读 `plays`)。
              views = numOf(raw, "views") || numOf(raw, "plays");
              engagement =
                numOf(raw, "likes") +
                numOf(raw, "comments") +
                numOf(raw, "shares");
            } catch {
              // A single publication's analytics read failing degrades to 0 —
              // never crashes the whole dashboard composition.
            }
            // 数据底座(SPEC §1.4):imported publication 不带 revision(标题挂在
            //   content_output / project),故 revision 解析的 r.title 为空 → 回退到
            //   作品(content_output)的真实标题(治"未命名发布",出真实导入标题)。
            let title = r.title;
            if (!title) {
              try {
                const out = await projectsRepo.getOutput(ctx, r.contentOutputId);
                title = out.title;
              } catch {
                // 输出读失败(防御)→ 保持空,落到下方"未命名发布"兜底。
              }
            }
            return {
              id: r.id,
              title: title || "未命名发布",
              platform: r.platform as "youtube",
              status: r.status as "published",
              views,
              engagement,
              publishedAt: r.publishedAt ?? r.createdAt,
            };
          }),
        );
      },
    },
    analytics: {
      // GAP-DASH-2 做真:5 张指标卡(总播放/总点赞/新增粉丝/平均完播/总分享)+ 本周
      // 播放趋势,全来自 analyticsService.getDashboardRollup(本模块 user-scoped 聚合,
      // 每 publication 取最新快照)。无快照 → 空集(composer 判 empty),不造假。
      getDashboardMetrics: async (ctx) => {
        // 数据底座(SPEC §1.4):有 imported 真项目 → 指标卡/趋势只汇总真实导入作品的
        //   快照(演示 fixture 让位);无 imported → 全量 user-scoped(过渡期演示态)。
        const hasImported = await projectsService.hasImportedProjects(ctx);
        const r = hasImported
          ? await analyticsService.getDashboardRollup(ctx, {
              publicationIds: await resolveImportedPublicationIds(ctx),
            })
          : await analyticsService.getDashboardRollup(ctx);
        if (r.snapshotCount === 0) return { metrics: [], trend: [] };
        const fmt = (v: number) =>
          v >= 10000
            ? `${(v / 10000).toFixed(1)} 万`
            : v.toLocaleString("zh-CN");
        const card = (
          id: string,
          label: string,
          value: string,
        ): MetricCard => ({
          id,
          label,
          value,
          delta: "",
          trend: "flat",
          tone: "positive",
        });
        // [T-071] 总粉丝(用户裁决:算不了增量就算总数)—— platform_accounts 基线求和,
        // 读失败诚实「—」。
        let followerTotal: string = "—";
        try {
          const { rows: accounts } = await platformAccountService.listAccounts(
            ctx,
            { limit: 100, offset: 0 },
          );
          // [T-074 用户裁决] 总粉丝只统计抖音(B站 8400 系 seed 幻觉数据已清,
          // 用户:「不要统计B站」);未来接别的平台前不并入总数。
          const sum = accounts
            .filter((a) => a.status === "active" && a.platform === "douyin")
            .reduce((acc, a) => acc + (a.followerBaseline ?? 0), 0);
          if (sum > 0) followerTotal = fmt(sum);
        } catch {
          /* 显「—」 */
        }
        const metrics: MetricCard[] = [
          card("d-views", "总播放量", fmt(r.plays)),
          card("d-likes", "总点赞", fmt(r.likes)),
          card("d-followers", "总粉丝", followerTotal),
          // [T-071] 完播率只在有明细快照(finish_rate 字段,拉明细采集产)时显真均值;
          // 没有 → 「—」,绝不显假 0.0%。
          {
            ...card(
              "d-finish",
              "平均完播率",
              r.finishCount > 0 ? `${r.finishAvg.toFixed(1)}%` : "—",
            ),
            tone: "info",
          },
          card("d-shares", "总分享", fmt(r.shares)),
        ];
        // [T-071] 本周趋势改真逐日:快照按日聚合差分(替换旧「总量按固定形状分摊」的
        // 假曲线)。有效点 < 2 天 → 空 trend(composer 显引导),不编形状。
        const daily = hasImported
          ? await analyticsService.getDailyPlayTrend(ctx, {
              publicationIds: await resolveImportedPublicationIds(ctx),
              days: 7,
            })
          : await analyticsService.getDailyPlayTrend(ctx, { days: 7 });
        const trend =
          daily.length >= 2
            ? daily.map((d) => ({
                label: d.day.slice(5).replace("-", "/"),
                value: d.plays,
              }))
            : [];
        return { metrics, trend };
      },
    },
    learnings: {
      getSuggestions: async (ctx) => {
        const rows = await learningsService.getSuggestions(ctx, { limit: 3 });
        return rows.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.recommendation ?? r.insight ?? "",
          category: r.learningType ?? "建议",
        }));
      },
    },
    notifications: {
      getUnreadCount: (ctx) => notificationsServiceForQuery.getUnreadCount(ctx),
    },
    knowledge: {
      // GAP-DASH-4 做真:热门选题 = 用户选题池(candidate)按预测分排序的前几条。
      // [T-049 B8] heat 直接用 predictedScore —— rubric 全链就是 0–100 分,旧代码误当
      // 0–1 再 ×100 → UI 显「热度 8800」;无分候选诚实置 0(不再编 50-i*5 假数)。
      // 读失败降级为空集,不崩面板。
      getTrendingTopics: async (ctx) => {
        try {
          const { rows } = await candidateService.listCandidates(ctx, {
            sort: "predictedScore",
            limit: 5,
            offset: 0,
          });
          return rows.map((c) => ({
            id: c.id,
            title: c.title,
            heat:
              typeof c.predictedScore === "number" && c.predictedScore > 0
                ? Math.round(c.predictedScore)
                : 0,
            trend: "up" as const,
          }));
        } catch {
          return [];
        }
      },
    },
  });

  const overviewQuery = createProjectOverviewQueryService({
    projects: {
      getProjectOverview: async (ctx, projectId) => {
        // listOutputIdsByProject GATES ownership: a cross-user / unknown project
        // throws OwnershipError (→404) BEFORE any overview section is composed.
        await projectsService.listOutputIdsByProject(ctx, projectId);
        return {
          projectId,
          projectTitle: "",
          stage: EMPTY_STAGE,
          progressPct: 0,
          stages: [],
          outputs: [],
          activities: [],
          projectInfo: [],
          milestones: [],
        };
      },
    },
    assets: {
      getProjectAssetStats: async (_ctx, _projectId) => ({
        assetStats: [],
        recentFiles: [],
      }),
    },
    publishing: {
      getProjectPublishing: async (_ctx, _projectId) => [],
    },
  });

  const searchQuery = createGlobalSearchQueryService({
    search: {
      search: (ctx, query, opts) => searchService.search(ctx, query, opts),
      // [T-051 2d] tab 计数走全量分面(不受 per-type top-N 截断)。
      facets: (ctx, query) => searchService.facets(ctx, query),
      recordSearch: (ctx, input) => searchService.recordSearch(ctx, input),
      listHistory: (ctx, limit) => searchService.listHistory(ctx, limit),
    },
  });

  const publishingCenter = createPublishingCenterQueryService({
    publishing: {
      listPublicationsForUser: async (ctx) => {
        const rows = await publishingService.getRecentPublications(ctx, {
          limit: 200,
        });
        return rows.map((r) => ({
          id: r.id,
          title: r.id,
          projectId: r.contentOutputId,
          projectTitle: "",
          platform: r.platform as "youtube",
          publishedAt: r.publishedAt ?? r.createdAt,
          status: r.status as "published",
          views: 0,
          engagement: 0,
        }));
      },
    },
    analytics: {
      getPublishingMetrics: async (_ctx) => ({
        metrics: [],
        platformComparison: [],
        trend: [],
        topContent: [],
      }),
    },
  });

  const queryServices = createQueryServicesTransport({
    dashboard: dashboardQuery,
    overview: overviewQuery,
    search: searchQuery,
  });

  // [T-135] canonical external sources 种子已退役(用户裁决 2026-07-05:新库/新用户开箱空)。
  // 外部源全部来自用户运行时真实创建/绑定(抖音扫码走 CDP 连已登录 Chrome,不预置任何来源行)。

  // Seed the Projects exemplar dataset (owned by the canonical user) AND the
  // canonical identity row, so real login resolves to `user-zyongzhu` and every
  // fixture-backed page + the Projects seed keep resolving under a real ctx
  // (foundation §2). seedCanonicalUser is idempotent (onConflictDoNothing), so a
  // re-built singleton never double-seeds. IDENTITY_DDL was applied in createDb().
  const identityRepo = createIdentityRepository(db, deps);
  // [T-050] canonical demo 项目图种子已退役(用户裁决 2026-07-02:4 个演示项目彻底
  // 删除,不再重种)。项目/产出/任务全部来自真实导入(T-030 管线)与用户运行时创建。
  await seedCanonicalUser(identityRepo, deps);

  // [T-050] canonical 通知种子已退役(demo 文案指向已删除的演示项目);通知全部
  // 来自运行时真实事件。

  // [T-135] canonical knowledge graph 种子已退役(金句 items+revisions+relations 都是
  // Zyong Zhu 假内容)。知识库开箱空;真实知识由用户导入/蒸馏/对话沉淀写入。
  // (下方仍保留用户抖音真实作品的金句知识种子 douyinKnowledge*,那是真内容不是 canonical。)

  // [T-135] canonical assets graph 种子已退役(素材 assets+files 都是 Zyong Zhu 假素材)。
  // /assets 画廊开箱空;真实素材由用户上传/录制/生成写入。

  // [T-050] canonical artifacts 种子已退役(挂在已删除的 demo 项目上)。
  // 真实项目的 artifact 由 AI 节点首次起草时创建(见 AdoptCandidateCard.prepareInput)。
  // [T-050 ⑦] 搜索索引投影**真实数据**:旧实现投影 canonical mock 数据集 → 用户自己
  // 的真实作品一条都搜不到(审计 B19)。现在启动时从 DB 读真 projects/knowledge/assets/
  // publications(+revision 真标题)拼成同形状喂 buildCanonicalSearchDocuments。
  // [全局搜索修复④] 启动全量重建改用 searchService.rebuildUserIndex(deleteAll +
  //   re-upsert),取代旧的 seedDocuments(insert-only + onConflictDoNothing)。旧路径三宗罪:
  //   ① 只 insert 不刷新 —— 存量项目改了标题,search_document 仍是旧标题;② onConflictDoNothing
  //   固定 seed id,重启后新建的项目/删除的实体既不进也不清(孤儿留存);③ 存量项目(如既有
  //   2 个)若 seed id 已占位就永不回填。rebuildUserIndex 先 deleteAllDocuments(user-scoped)
  //   再从 DB 真值逐条 re-upsert —— 幂等、刷新标题、清孤儿,把存量一并索引。启动时跑一次即可
  //   (运行时 create/patch/delete 由上面的 fan-out wrapper 增量维护)。
  {
    const startupRebuildCtx: RequestContext = {
      userId: canonicalDataset.user.id,
      requestId: "startup-search-rebuild",
      source: "ingestion",
    };
    const [dbProjects, dbKnowledge, dbKRevisions, dbAssets, dbPubs, dbPubRevs] =
      await Promise.all([
        db.select().from(projectsTable),
        db.select().from(knowledgeItemsTable),
        db.select().from(knowledgeRevisionsTable),
        db.select().from(assetsTable),
        db.select().from(publicationsTable),
        db.select().from(publicationRevisionsTable),
      ]);
    // buildCanonicalSearchDocuments 投影出的 SearchDocumentRow[](publication 已归一为
    //   entity_type='video',payload 与读侧对齐)→ 转成 rebuildUserIndex 期望的 RebuildDoc[]
    //   (只取 entityType/entityId/title/body/searchText/embedding;id/userId/indexedAt 由
    //   service 重新分配,保证与运行时 upsert 同源)。
    const rebuildDocs = buildCanonicalSearchDocuments(
      {
        user: { id: canonicalDataset.user.id },
        projects: dbProjects.map((p) => ({
          id: p.id,
          title: p.title,
          brief: p.brief ?? "",
          currentStage: p.currentStage,
          progressPct: p.progressPct ?? 0,
        })),
        knowledgeItems: dbKnowledge.map((k) => ({
          id: k.id,
          title: k.title,
          currentRevisionId: k.currentRevisionId ?? "",
        })),
        knowledgeRevisions: dbKRevisions.map((r) => ({
          id: r.id,
          knowledgeItemId: r.knowledgeItemId,
          content: r.content ?? "",
        })),
        assets: dbAssets.map((a) => ({
          id: a.id,
          name: a.name,
          assetType: a.assetType,
        })),
        publications: dbPubs.map((pub) => ({
          id: pub.id,
          platform: pub.platform,
          currentRevisionId: pub.currentRevisionId ?? null,
        })),
        publicationRevisions: dbPubRevs.map((r) => ({
          id: r.id,
          title: r.title ?? "",
        })),
      },
      FIXED_NOW_ISO,
    ).map((row) => ({
      entityType: row.entityType,
      entityId: row.entityId,
      title: row.title,
      body: row.body,
      searchText: row.searchText,
      embedding: (row.embedding as number[]) ?? [],
    }));
    await searchService.rebuildUserIndex(startupRebuildCtx, rebuildDocs);
  }

  // [T-050] canonical analytics 种子已退役(快照/留存/观众全挂在已删除的 demo 发布上)。
  // 真实指标由采集管线写入(self.metrics/self.detail,T-030/T-036)。

  // The identity service shares the SAME db (and the same seeded canonical user)
  // as the persistence transport, so a ctx resolved from the session cookie owns
  // the rows the transport serves under it.
  const identity = createIdentityService(identityRepo, deps);

  // Settings (module 03): one repository over the shared db; the service's
  // account read (`settings.get`) delegates to the Identity service's
  // getCurrentUser (injected as the accountReader — NO cross-module repo import,
  // foundation §1). The preference/model/agent mutations are user-scoped via the
  // per-ctx repo. resolveModelForCapability (public on the service) is what the AI
  // worker reads. Clock/ids share the deterministic `deps`.
  const settingsRepo = createSettingsRepository(db, deps);
  const settingsService = createSettingsService(
    () => settingsRepo,
    (ctx) => identity.getCurrentUser(ctx),
    // Account profile WRITE (`PATCH /me`) — delegated to Identity's
    // updateProfile, the same boundary as the read above. Settings owns no
    // `users` repo (foundation §1: no cross-module repository import).
    (ctx, patch) => identity.updateProfile(ctx, patch),
  );
  const settings = createSettingsTransport(() => settingsService);

  // 纯-prompt 节点的可配置 LLM completer:resolveLlmConfig 读 settings 拥有的
  // model_configurations 行(注入 getModelConfig,settings 不反向依赖 ai 层)+ process.env。
  // 在此(settingsService 已定义后)构造;6 个 `void runXxx(...)` dispatch 调用位于
  // `ai` transport 的 request 回调里——该回调在请求期才执行(工厂体初始化早已完成),
  // 故按闭包引用捕获此 `const llmCompleter` 无 TDZ 问题。
  const llmCompleter = createLlmCompleter((ctx, capability) =>
    resolveLlmConfig(ctx, capability, {
      getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
      env: process.env,
    }),
  );

  // resolveModelSpec — 新 Agent Runtime(modelFor)按 capability 解析用户配的 model;复用
  // llmCompleter 同一套 resolve(getModelConfig + env),投影成 ModelSpec。没配 key → 抛
  // LlmCredentialError(适配器接住 → cancelTask,不假成功)。
  const resolveModelSpec = async (ctx: RequestContext, capability: string) => {
    const cfg = await resolveLlmConfig(ctx, capability, {
      getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
      env: process.env,
    });
    return {
      apiFormat: cfg.apiFormat,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      token: cfg.token,
    };
  };

  // T-086 文案审核 dispatch 实体(forward-declared 于 build 顶部):此处所有依赖已就绪
  // (aiService/positioningService/settingsService/artifactsService/reviewGateService/
  // resolveModelSpec)。两条起任务路径共用它:① 审核门 op(reviewGateService.createTask 直起
  // → 该 port 调用本函数)② ai.tasks.create 拦截分支(下方 ai transport)。后台跑
  // runScriptReview → L1 违禁词 lint(active 词表)+ L2 语义审(script.review capability,
  // 预设豆包,未配回退默认并标注非专用)→ 落 script_review_reports(绑 artifactVersion)。
  dispatchScriptReview = (ctx, task) => {
    void runScriptReview(ctx, task, {
      ai: aiService,
      positioning: {
        getPositioningCenter: (c: RequestContext) =>
          positioningService.getPositioningCenter(c),
      },
      resolveModelSpec,
      // 专用审核模型探测:script.review 有独立配置行 → true(诚实标注非专用模型)。
      hasDedicatedReviewModel: async (c) =>
        Boolean(await settingsService.getModelConfig(c, "script.review")),
      // 脚本源:项目「脚本」stage 当前版本(优先 output_script,回退 master_script)的
      // 文本 + 版本号(与 script-editor-data 同口径)。
      scriptSource: {
        getLatestScript: async (c, projectId) => {
          const artifacts = await artifactsService.listProjectArtifacts(
            c,
            projectId,
          );
          const scriptArtifacts = artifacts.filter((a) => a.stage === "script");
          const target =
            scriptArtifacts.find((a) => a.artifactType === "output_script") ??
            scriptArtifacts.find((a) => a.artifactType === "master_script");
          if (!target) return null;
          const versions = await artifactsService.listVersions(c, target.id);
          if (versions.length === 0) return null;
          const current = versions
            .slice()
            .sort((a, b) => b.versionNumber - a.versionNumber)[0]!;
          // 文本抽取:contentData.transcript / sections(拼段)/ body 兜底。
          const data = (current.contentData ?? {}) as Record<string, unknown>;
          let text = "";
          if (typeof data.transcript === "string") {
            text = data.transcript;
          } else if (Array.isArray(data.sections)) {
            text = (data.sections as unknown[])
              .map((s) => {
                const so = (s ?? {}) as Record<string, unknown>;
                return [so.label, so.text, so.narration, so.body]
                  .filter(
                    (x): x is string =>
                      typeof x === "string" && x.length > 0,
                  )
                  .join(" ");
              })
              .join("\n");
          } else if (typeof data.body === "string") {
            text = data.body;
          }
          return {
            artifactId: target.id,
            version: current.versionNumber,
            text,
          };
        },
      },
      lintRules: {
        listActiveLintRules: (c) => reviewGateService.listActiveLintRules(c),
      },
      reportSink: {
        saveReport: (c, input) => reviewGateService.saveReport(c, input),
      },
    });
  };

  // ── [T-093] 知识库 AI 搜索:可配 embedding 管线 ─────────────────────────────
  // capability "knowledge.search.embed" **只认专配行,不回退 default 聊天模型**
  // (把 chat LLM 当 embedding 用是错的;未配 = 诚实降级纯关键词,前端渲提示条)。
  const resolveEnvSecretRef = (secretRef: string | undefined): string => {
    if (!secretRef) return "";
    const m = /^env:(.+)$/.exec(secretRef.trim());
    if (!m) return "";
    return (process.env[m[1]!] ?? "").trim();
  };
  const resolveEmbedSpec = async (
    ctx: RequestContext,
  ): Promise<{
    apiFormat: "anthropic" | "openai_chat";
    baseUrl: string | null;
    model: string;
    token: string;
  } | null> => {
    const row = await settingsService.getModelConfig(
      ctx,
      "knowledge.search.embed",
    );
    if (!row) return null;
    const token =
      row.secretValue?.trim() || resolveEnvSecretRef(row.secretReference);
    if (!token) return null;
    return {
      apiFormat: row.apiFormat,
      baseUrl: row.baseUrl ?? null,
      model: row.modelName,
      token,
    };
  };

  // 批量算 embedding(Vercel AI SDK embedMany;provider 经 ai-worker embeddingModelFor
  // 解析,anthropic 协议诚实抛错)。
  const embedTexts = async (
    spec: NonNullable<Awaited<ReturnType<typeof resolveEmbedSpec>>>,
    texts: string[],
  ): Promise<number[][]> => {
    const { embeddingModelFor } = await import("@creatoros/ai-worker");
    const { embedMany } = await import("ai");
    const { embeddings } = await embedMany({
      model: embeddingModelFor(spec),
      values: texts,
    });
    return embeddings;
  };

  // 单条知识 → search_document 重建(标题+正文摘要;embedding 可配则同步算)。
  // best-effort:任何失败只丢索引增益,业务真值不回滚。
  const indexKnowledgeDocumentBestEffort = async (
    ctx: RequestContext,
    knowledgeId: string,
  ): Promise<void> => {
    try {
      const item = await knowledgeService.getKnowledge(ctx, knowledgeId);
      const revisions = await knowledgeService.listRevisions(ctx, knowledgeId);
      const head =
        revisions.find((r) => r.id === item.currentRevisionId) ?? revisions[0];
      const content = head?.content ?? "";
      let embedding: number[] | undefined;
      try {
        const spec = await resolveEmbedSpec(ctx);
        if (spec) {
          const [vec] = await embedTexts(spec, [
            `${item.title}\n${content}`.trim(),
          ]);
          embedding = vec;
        }
      } catch (err) {
        // embedding 失败 → 只落关键词索引(诚实降级,不假装有向量)。
        console.warn("[knowledge-index] embedding 计算失败:", err);
      }
      await searchService.upsertDocument(ctx, {
        entityType: "knowledge",
        entityId: item.id,
        title: item.title,
        body: JSON.stringify({ excerpt: content.slice(0, 120), tags: [] }),
        searchText: `${item.title}\n${content}`.toLowerCase().trim(),
        ...(embedding ? { embedding } : {}),
      });
    } catch (err) {
      console.warn("[knowledge-index] 索引失败(业务真值不受影响):", err);
    }
  };

  // 知识库 hybrid 搜索运行时(/api/knowledge/search 消费):
  //   1. 存量回填:embedding 为空的 knowledge 文档批量补算(幂等,一次 embedMany);
  //   2. 查询向量:query 单条 embed;
  //   3. searchService.hybridSearch(exact 优先 + 余弦补位,阈值截断);
  //   4. search_history 落真实记录(失败不抛,SPEC §16)。
  // 未配 capability → 纯关键词 + semanticEnabled:false(诚实降级,不静默装 AI)。
  const knowledgeSearchRuntime = {
    hybridSearch: async (
      ctx: RequestContext,
      query: string,
    ): Promise<{
      semanticEnabled: boolean;
      semanticError: string | null;
      hits: HybridSearchHit[];
    }> => {
      let semanticEnabled = false;
      let semanticError: string | null = null;
      let queryEmbedding: number[] | null = null;
      const spec = await resolveEmbedSpec(ctx);
      if (spec) {
        try {
          // 存量回填(embedding 空的 knowledge 文档;<5000 条量级,一次批量)。
          const docs = await searchService.listDocumentsByEntityType(
            ctx,
            "knowledge",
          );
          const missing = docs.filter((d) => (d.embedding ?? []).length === 0);
          if (missing.length > 0) {
            const vectors = await embedTexts(
              spec,
              missing.map((d) => d.searchText),
            );
            for (let i = 0; i < missing.length; i++) {
              const doc = missing[i]!;
              await searchService.upsertDocument(ctx, {
                entityType: doc.entityType,
                entityId: doc.entityId,
                title: doc.title,
                body: doc.body,
                searchText: doc.searchText,
                embedding: vectors[i],
              });
            }
          }
          const [qVec] = await embedTexts(spec, [query]);
          queryEmbedding = qVec ?? null;
          semanticEnabled = queryEmbedding !== null;
        } catch (err) {
          // 配置了但跑不通(key 失效/anthropic 协议/网络)→ 诚实降级 + 带原因。
          semanticError = err instanceof Error ? err.message : String(err);
          queryEmbedding = null;
          semanticEnabled = false;
        }
      }
      const hits = await searchService.hybridSearch(ctx, query, {
        entityType: "knowledge",
        limit: 20,
        queryEmbedding,
      });
      await searchService.recordSearch(ctx, {
        query,
        filters: { entityType: "knowledge", semantic: semanticEnabled },
        resultCount: hits.length,
      });
      return { semanticEnabled, semanticError, hits };
    },
  };

  // resolveMultimodalSpec — L5 asset.generate 的多模态解析(SPEC 2026-07-01 §2.2 / M2),与文本
  // 层 resolveModelSpec 并列:复用同一套 getModelConfig(settings 拥有 model_configurations)+
  // env,投影成 MultimodalSpec(provider/model/baseUrl/token/kind)。image.generate/video.generate
  // 未配 → 抛 MultimodalConfigError(runner 接住 → cancelTask + 录制页「未配置生图/生视频模型」)。
  const resolveMultimodalSpec = (
    ctx: RequestContext,
    capability: "image.generate" | "video.generate",
  ) =>
    resolveMultimodalSpecFn(ctx, capability, {
      getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
      env: process.env,
    });
  // 多模态 provider 适配器注册表(keyed by provider)。真链路注册 MiniMax(M1 适配器,含 video
  // 异步轮询状态机 submit→poll→retrieve + 超时);加 provider = 在此注册一个适配器,不改 runner
  // 与业务代码([gate-F1])。真出图/视频要真 image.generate/video.generate key(本环境无 →
  // 未配抛错、诚实禁用);单测装配用 M1 的 fake provider 注入,不碰这个真 registry。
  const multimodalRegistry: MultimodalProviderRegistry = {
    minimax: createMinimaxAdapter(),
  };
  // ASR provider 注册表(T-030-D2 逐字稿转写)—— 一个 OpenAI 兼容 adapter 覆盖 SiliconFlow/
  // OpenAI/Groq(转写端点同形状,SPEC D-d)。按用户可能所配的 provider 名各挂同一适配器实例
  // (归一);加 provider = 在此注册。真跑要真 transcribe.audio key(未配 → resolveTranscribeSpec
  // 抛 TranscribeConfigError,整任务停 + 引导);单测装配注 fake,不碰这个真 registry。
  const openaiAsrAdapter = createOpenaiAsrAdapter();
  const asrRegistry: MultimodalProviderRegistry = {
    siliconflow: openaiAsrAdapter,
    openai: openaiAsrAdapter,
    groq: openaiAsrAdapter,
  };

  // ── [T-084a] 联网检索解析 + registry(SPEC 2026-07-03 §1.1)─────────────────────
  // resolveSearchSpec:与多模态层同一套 getModelConfig(settings 拥有 model_configurations)+ env,
  // 投影成 SearchSpec(provider/baseUrl/model/token)。web.search 未配 → 抛 SearchConfigError
  // (gatherMaterials 接住 → grounding=model_memory 降级,不 crash)。search provider 用户可配。
  const resolveSearchSpec = (ctx: RequestContext) =>
    resolveSearchSpecFn(ctx, {
      getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
      env: process.env,
    });
  // 搜索 provider 注册表(keyed by provider)。三家首发适配器(纯自建 REST,不碰 Agent SDK);
  // 加 provider = 在此注册一个适配器,不改 runner 与业务代码。真检索要真 web.search key(未配 →
  // resolveSearchSpec 抛错、诚实降级);单测装配注 fake fetch,不碰这个真 registry。
  const searchRegistry: SearchProviderRegistry = {
    bocha: createBochaAdapter(),
    tavily: createTavilyAdapter(),
    serpapi: createSerpapiAdapter(),
    // [T-126a] RSS/Atom 免 key 检索 —— provider "rss",baseUrl 填 feed URL(s),无需搜索 API key。
    rss: createRssAdapter(),
    // [T-126b] 浏览器采集 —— provider "browser",真开无头 Chromium 搜(默认 Bing,baseUrl 可换)+ 自截图存证,免 key。
    browser: createBrowserScrapeAdapter(),
  };
  // ChatBox gatherMaterials 前置检索端口:解析 spec + 按 provider 分派 REST。未配抛 SearchConfigError、
  // 检索失败抛 SearchExecutionError(chat-runner catch 成 model_memory 降级)。
  const searchWebPort = async (
    ctx: RequestContext,
    query: string,
    opts?: { count?: number },
  ) => {
    const spec = await resolveSearchSpec(ctx);
    return searchWebFn(spec, query, searchRegistry, opts);
  };
  // honestyBlock 第 6 条 + 工具动态描述用:探测 web.search 是否已配(只查配置、不打网络)。
  const probeSearchConfigured = async (ctx: RequestContext): Promise<boolean> => {
    try {
      await resolveSearchSpec(ctx);
      return true;
    } catch {
      return false;
    }
  };

  // [T-135] canonical Settings 种子已退役(userPreferences + modelConfigurations +
  // agentConfigurations 都是 Zyong Zhu 的预设,含默认 Anthropic model + env key)。
  // 偏好走 service 默认值;AI 能力骨架仍由下方 buildAiModelConfigs/buildAiAgentConfigs
  // seed(去 provider 预设的空占位行),用户 onboarding 自行配置。

  // Seed the AI per-capability catalog (Step 3 seed; design-spec §3): one
  // ModelConfiguration per capability (script.rewrite → fable-5/high, copilot.assist →
  // opus-4-8/medium default, …) and one AgentConfiguration per node (capabilities.skills
  // selects the enabled Skill), all owned by the canonical user. secretReference is
  // "env:ANTHROPIC_API_KEY" (resolved at runtime, never hardcoded). The AI capabilities
  // (`*.*` dotted) are disjoint from the Settings canonical capabilities (`script` /
  // `research`), so the (user_id, capability) unique index never collides. seed* are
  // onConflictDoNothing → a re-built singleton never double-seeds.
  const aiSeedRepo = createAiRepository(db, {
    ...deps,
    userId: canonicalDataset.user.id,
    accountId: null, // [T-136] seed = 系统默认,不绑号
  });
  await aiSeedRepo.seedModelConfigs(
    buildAiModelConfigs(canonicalDataset.user.id, FIXED_NOW_ISO),
  );
  await aiSeedRepo.seedAgentConfigs(
    buildAiAgentConfigs(canonicalDataset.user.id, FIXED_NOW_ISO),
  );

  // T-086 审核规则种子(SPEC §1)—— 从用户知识库移植的抖音违禁词表(Tier1 官方硬规则确定性
  // 投影 + Tier2 经验限流 + doud+ 投放特有词),幂等 id(rrule-seed-<user>-<slug>)+
  // onConflictDoNothing → 重建单例不双写。规则种子本体在 backend review 模块(review-rules.seed.ts)。
  const reviewGateSeedRepo = createReviewGateRepository(db, {
    ...deps,
    userId: canonicalDataset.user.id,
  });
  await reviewGateSeedRepo.seedRules(
    buildReviewRuleSeedRows(canonicalDataset.user.id, FIXED_NOW_ISO),
  );

  // [T-135] canonical positioning 种子已退役(CreatorProfile + statements = Zyong Zhu 人设,
  // 「把前沿 AI 论文工程化的硬核创作者」全是假身份定位)。/positioning 定位中心开箱空;
  // 真实定位由用户在定位中心填写/一键岛 AI 生成后落库(配合 T-131 引导页、T-136 per-account 人设)。

  // [T-052 裁决③] canonical monetization products 种子(module 18)已随变现中心物理删除。

  // [T-135] canonical candidates(选题候选池)种子已退役(cand-canonical-1/2/3 = Zyong Zhu
  // 口吻的假选题「用 RAG 把内部文档变成问答助手」等)。/topics 选题候选池开箱空;真实候选由
  // 用户从热点/需求/想法生成(ChatBox 选题、AI 选题一键岛)后落库。

  // Seed the canonical 变现加权 rubric (module 20): one Rubric + its immutable v1
  // RubricVersion (五维: hook 强度 / 利他性 / 人群匹配 / CTA 清晰度 / 为产品铺路程度,
  // weights sum to 1.0), owned by the canonical user, so the calibration FE surface +
  // the Candidate 变现加权 ranking resolve a real current RubricVersion under the seeded
  // login (foundation §2). Deterministic ids/clock (FIXED_NOW_ISO). seed* are
  // onConflictDoNothing → a re-built singleton never double-seeds. The version is seeded
  // first so currentVersionId resolves.
  const calibrationSeedRepo = createCalibrationRepository(db, {
    ...deps,
    userId: canonicalDataset.user.id,
    accountId: null, // [T-136] seed = 系统默认,不绑号
  });
  const canonicalRubricVersion: CalibrationRubricVersionRow = {
    id: "rubricver-canonical-1",
    userId: canonicalDataset.user.id,
    accountId: null, // [T-136] 默认 rubric = 系统级默认,不绑号(nullable 兜底,§6 MAJOR-3)
    rubricId: "rubric-canonical",
    versionNumber: 1,
    dimensions: [
      {
        key: "hook",
        label: "钩子强度",
        weight: 0.2,
        description:
          "前3秒能否逼观众看下去 30 秒。0=通用开场「大家好今天聊聊」；3=反直觉断言/具体承诺；5=无法停止处理的具体场景或断言",
      },
      {
        key: "emotion",
        label: "情感共鸣",
        weight: 0.2,
        description:
          "前30秒能否触发具体、可命名的情感。0=纯信息无钩子；3=一般共鸣「我也有过」；5=锐利到观众不愿承认的自我识别「这就是我」",
      },
      {
        key: "product_path",
        label: "为产品铺路",
        weight: 0.2,
        description:
          "内容能否支撑信任/转化、为产品铺路（不只追播放）。0=纯流量噱头；3=隐约关联产品价值；5=自然把观众引向信任与下一步转化",
      },
      {
        key: "social",
        label: "社会共振",
        weight: 0.15,
        description:
          "是否触及当下有争议/结构性的社会模式。0=纯个人；3=公认社会现象无新视角；5=命名一个观众认识但没有语言形容的结构性模式",
      },
      {
        key: "cta",
        label: "CTA 清晰度",
        weight: 0.15,
        description:
          "行动召唤是否清晰且不突兀。0=无 CTA；3=结尾生硬喊一句；5=CTA 与内容价值自然衔接、观众想点",
      },
      {
        key: "quotable",
        label: "金句密度",
        weight: 0.1,
        description:
          "有几句能被截图、离开视频独立传播。0=全叙述无金句；3=结尾一句；5=多句分布开场/中间/结尾、能在评论与转发里独立存活",
      },
    ],
    changeSummary:
      "v2 借鉴 cheat-on-content 的已校准 rubric：合并传播驱动（钩子/情感/社会/金句）与变现维度（为产品铺路/CTA），每维带 0/3/5 锚点",
    createdAt: FIXED_NOW_ISO,
  };
  const canonicalRubric: CalibrationRubricRow = {
    id: "rubric-canonical",
    userId: canonicalDataset.user.id,
    accountId: null, // [T-136] 默认 rubric = 系统级默认,不绑号(nullable 兜底,§6 MAJOR-3)
    name: "变现加权评分标准",
    currentVersionId: canonicalRubricVersion.id,
    createdAt: FIXED_NOW_ISO,
  };
  await calibrationSeedRepo.seedRubricVersions([canonicalRubricVersion]);
  await calibrationSeedRepo.seedRubrics([canonicalRubric]);

  // Seed canonical 盲预测 + 回流 (module 20, 校准中心大改 Slice 1) so the 校准中心 surface
  // resolves REAL data: 3 locked predictions carrying the 维度评分约定 jsonb
  // (predictedConversion.dimensions = 6 维 1–5 评分 + 理由 + 建议; predictedMetrics =
  // performance chips + 编导诊断), attached to 3 real published content_outputs; + 2
  // calibration_results so the KPI (completedReflows / avgDeviation / latestFinding) +
  // 发布后回流对照 + 经验沉淀 have live rows. Deterministic ids/clock (FIXED_NOW_ISO);
  // ingestionRunId is a synthetic seed reference (the seed repo writes the row directly,
  // bypassing the service's §C-4 IngestionRun guard — the guard only applies to the live
  // results.create op). predictedScore is the deterministic 变现加权 weighted-sum (here 0 —
  // the 1–5 维度评分 lives in the dimensions array, not at the conversion-map top level; the
  // 1–5 评分 is the primary 校准 signal, predictedScore a secondary aggregate). seed* is
  // onConflictDoNothing → idempotent across a re-built singleton.
  const calUser = canonicalDataset.user.id;
  const calRubricVer = canonicalRubricVersion.id;
  // 维度评分约定 — one prediction's predictedConversion jsonb (6 维 1–5 + 理由 + 建议).
  const predDimensions = (
    scores: Array<[string, number, string, string]>,
  ) => ({
    dimensions: scores.map(([key, score, reason, suggestion]) => ({
      key,
      score,
      reason,
      suggestion,
    })),
  });
  const predMetrics = (
    perf: [number | null, number | null, number | null, number | null],
    verdict: string,
    mainIssues: string[],
    priorityFixes: string[],
  ) => ({
    performance: {
      完播率: perf[0],
      收藏率: perf[1],
      评论率: perf[2],
      转化意向: perf[3],
    },
    diagnosis: { verdict, mainIssues, priorityFixes },
  });
  // [T-050] canonical 盲预测/回流结果种子已退役(主体 dy-out-* 已随 demo 数据删除;
  // 审计 B30:seed 预测把校准页撕成两个数据世界)。真实预测由用户在校准中心创建。

  // [T-135] canonical platform account 种子已退役(acct-canonical-douyin「@抖音创作者」
  // 是假账号)。账号管理开箱空;新用户自己扫码绑第一个抖音号(T-136 建默认账号)。

  // [T-135] canonical learnings(经验沉淀)种子已退役(canonicalDataset.learnings 是假方法论
  // 示例)。经验中心开箱空;真实经验由用户复盘沉淀写入。

  // [T-135] 复盘飞轮回流 轨B 的 canonical CalibrationRuleSuggestion 种子已退役(它引用被删的
  // 复盘 learning「learning-hook-15s」→ 无来源可回流)。校准中心「复盘回流建议」开箱空;
  // 真实建议由用户复盘结论回流生成。

  // [T-135 补漏 2026-07-05] douyin 金句知识种子(dy-know-*/dy-krev-*)已退役 —— 它是**用户本人**
  // 的真实抖音文案/金句/粉丝画像固化在代码(fixtures/douyin-real.ts),每次启动 seed 会灌进
  // **任何**库 → 部署给新用户时会把私人内容泄漏给每个人,且令「开箱空」不成立。知识改由用户
  // 真实采集(douyin-anchor-transcribe / 知识库录入)进库,不再 seed 固化内容。

  // T-004 ChatBox runtime — bundle the /api/chat route's needs: persist (aiService),
  // resolve model (resolveModelSpec), and the bound CreativeContext readers (定位/飞轮/
  // 受众信号/知识库 数据层注入). The readers reach peer modules ONLY through their public
  // services (positioning/learnings/candidate/knowledge), mirroring the topic.generate
  // trigger's bindings — no cross-module repo import (SPEC §22). The /api/chat route reads
  // these to assemble the system prompt; AI produces candidates (采纳 gate), never entities.
  const chatRuntime: ChatRuntime = {
    ai: aiService,
    resolveModelSpec,
    context: {
      positioning: {
        getPositioningCenter: (c: RequestContext) =>
          positioningService.getPositioningCenter(c),
      },
      learnings: {
        getSuggestions: (c: RequestContext, opts: { limit?: number }) =>
          learningsService.getSuggestions(c, opts),
      },
      signals: {
        list: async (c: RequestContext, opts: { limit?: number }) =>
          (
            await candidateService.listSignals(c, {
              limit: opts.limit ?? 30,
              offset: 0,
            })
          ).rows.map((s) => ({
            source: s.source,
            rawText: s.rawText,
            demandTag: s.demandTag,
          })),
      },
      knowledge: {
        // [T-079c] 与 dispatch 路径的 knowledgeReader 同投影:补战绩/出处字段
        // (usedCount/usedInPublished/sourceNote)→ knowledgeBrief 分段+战绩排序。
        list: async (c: RequestContext, opts: { limit?: number }) =>
          (await knowledgeService.listKnowledge(c))
            .slice(0, opts.limit ?? 40)
            .map((k) => ({
              title: k.title,
              knowledgeType: k.knowledgeType,
              usedCount: k.usedCount,
              usedInPublished: k.usedInPublished,
              sourceNote: k.sourceNote ?? null,
            })),
      },
      // T-039b:抖音账号画像 reader —— 定位对话(chatbox.positioning)据此把「这个人在平台上已经
      // 是谁」(平台/账号/粉丝量)注进 system,让定位提案立足真实账号身份。复用 platformAccountService
      // .listAccounts(user-scoped),映射到 runner 的 {platform, accountHandle, followerBaseline} 形状。
      // 与 positioning.generate 一键岛节点同一份读法,不造影子。空/未连账号 → 空数组(诚实降级)。
      accounts: {
        list: async (c: RequestContext) =>
          (
            await platformAccountService.listAccounts(c, {
              limit: 100,
              offset: 0,
            })
          ).rows.map((a) => ({
            platform: a.platform,
            accountHandle: a.accountHandle,
            followerBaseline: a.followerBaseline,
          })),
      },
      // T-039a:复盘对象 reader —— ChatBox 对话复盘(review.analyze)路径据此读「这一条作品」的真
      // 文案/标题/数据/评论(前提是前端带了 projectId → 复盘一键岛以 kind=project 打开时已带)。
      // 与后端复盘 task 共用同一份读法(makeReviewSubjectReader),不造影子。
      reviewSubject: makeReviewSubjectReader(),
      // [T-146c/d] 用户上传素材主权(稿面对话路径)—— 稿面右栏对话里整稿(draftScript)吃硬约束段、
      // 搜素材(gatherMaterials)贴资料搜。与写文案 task / research task 共用同一份读法,不造影子。
      projectMaterials: makeProjectMaterialsReader(),
    },
    // 只读 context 工具的真数据读端口 —— 全部 user-scoped(经各自 service/repo 用 ctx.userId 收窄),
    // 只读、不写实体。找不到现成的「带 query 搜」读方法时,在此对现成 list 端口做内存过滤(优先复用
    // 现成读端口,不新造 repo 方法)。诚实说明:knowledge/materials 的 query 是内存 contains 过滤
    // (list 本身不带全文检索);projects 无真实 publishedAt(那在 publication 上)→ 不塞、留空。
    contextReaders: {
      // context.projects —— 复用 projectsRepo.list(user-scoped: WHERE user_id = ctx.userId)。
      // [T-058②] 分页 + 总数;[T-081②] 排序/切片口径收口到 listRecentProjects(与
      // positioning.generate task 的 works 读端口同一份读法,不造影子)。
      listProjects: listRecentProjects,
      // [T-077b] brief.fill 的现状读 —— 复用 projectsRepo.get(user-scoped)取当前项目的
      // brief_detail jsonb 原样返回(契约 projectBriefDetail 形状)。读不到(项目不存在/越权)
      // → null(工具结果 current=null,前端卡现值显「未填」),绝不抛崩对话流。
      getProjectBrief: async (
        c: RequestContext,
        opts: { projectId: string },
      ) => {
        try {
          const row = await projectsRepo.get(c, opts.projectId);
          return (row.briefDetail ?? null) as {
            targetAudience?: string;
            contentGoal?: string;
            contentFormat?: string;
            orientation?: "landscape" | "portrait";
            targetPlatforms?: string[];
            durationEstimate?: string;
            coreMessage?: string;
            successCriteria?: string;
          } | null;
        } catch {
          return null;
        }
      },
      // [T-058③] 观众评论只读(audience_signals source='comment',最新在前,带 total)。
      listComments: async (
        c: RequestContext,
        opts: { limit: number; offset: number },
      ) => {
        const { rows, total } = await candidateService.listSignals(c, {
          source: "comment",
          limit: opts.limit,
          offset: opts.offset,
        });
        return {
          total,
          rows: rows.map((r) => ({
            text: r.rawText,
            likeCount: r.likeCount ?? null,
            source: r.source,
            createdAt: r.createdAt,
          })),
        };
      },
      // context.knowledge —— 复用 knowledgeService.listKnowledge(user-scoped: repo.list(ctx.userId))。
      // query 空 → 回最近若干条;非空 → **分词 OR 模糊匹配**(T-039a 放宽:原来是「整串 title.includes」
      // 精确子串,复盘拿主题/标题搜时命中率极低 → 用户反馈「匹配太死」)。用 knowledgeRelevanceScore 对
      // 标题+摘要计相关度(命中的 query 词数),命中(>0)才留,按相关度降序 + 原序稳定排。**诚实**:
      // 全不命中就空(不塞无关资料),不是全返回。snippet:item row 不含正文 → 用摘要/描述元数据兜一句,
      // 真拿不到给空串(不编内容)。
      searchKnowledge: async (
        c: RequestContext,
        opts: { query: string; limit: number },
      ) => {
        const rows = await knowledgeService.listKnowledge(c);
        const snippetOf = (k: (typeof rows)[number]): string => {
          const meta = (k.sourceMetadata ?? {}) as {
            summary?: unknown;
            description?: unknown;
          };
          return typeof meta.summary === "string"
            ? meta.summary
            : typeof meta.description === "string"
              ? meta.description
              : "";
        };
        const q = opts.query.trim();
        if (!q) {
          return rows.slice(0, opts.limit).map((k) => ({
            id: k.id,
            title: k.title,
            snippet: snippetOf(k),
          }));
        }
        // 标题 + 摘要一起当 haystack 做模糊匹配(放宽命中面,但仍以真实内容为准)。
        const scored = rows
          .map((k, idx) => ({
            k,
            idx,
            score: knowledgeRelevanceScore(`${k.title}\n${snippetOf(k)}`, q),
          }))
          .filter((r) => r.score > 0)
          // 相关度降序;同分保持原顺序(listKnowledge 的近→远)稳定。
          .sort((a, b) => b.score - a.score || a.idx - b.idx);
        return scored.slice(0, opts.limit).map(({ k }) => ({
          id: k.id,
          title: k.title,
          snippet: snippetOf(k),
        }));
      },
      // context.materials —— 复用 assetsService.listAssets(user-scoped: repo.listAssets(ctx.userId))。
      // ListAssetsQuery 只有 { limit, cursor }(无 query 文本)→ 取一批后做名称内存 contains 过滤。
      // 拉多一点(query 时最多 100)再截断,避免过滤后不足 limit;title=name,kind=assetType。
      searchMaterials: async (
        c: RequestContext,
        opts: { query: string; limit: number },
      ) => {
        const q = opts.query.trim().toLowerCase();
        const rows = await assetsService.listAssets(c, {
          limit: q ? 100 : opts.limit,
          cursor: null,
        });
        const filtered = q
          ? rows.filter((a) => a.name.toLowerCase().includes(q))
          : rows;
        return filtered.slice(0, opts.limit).map((a) => ({
          id: a.id,
          title: a.name,
          kind: a.assetType,
        }));
      },
      // [T-099b] context.project.detail —— 某项目全档。复用既有公开读源(不新造 repo 方法):
      //   · 项目行(标题/阶段/状态/brief)→ projectsRepo.get(user-scoped,顺带 ownership 门)
      //   · 产物索引(type/版本数/updatedAt/字数)→ artifactsService.listProjectArtifacts +
      //     listVersions + 当前版本 contentText 长度(transcript 回退,与 getScript 同口径)
      //   · 发布状态 → listOutputIdsByProject → publishingService.listPublications(取首个已发布)
      //   · 最新指标摘要 → makeReviewSubjectReader().getMetricsSummary(同口径,不新造)
      // 读不到(不存在/越权)→ null(projectsRepo.get 抛 → catch 成 null,诚实降级不崩)。
      getProjectDetail: async (c: RequestContext, opts: { projectId: string }) => {
        try {
          const project = await projectsRepo.get(c, opts.projectId);
          const brief = (project.briefDetail ?? {}) as Record<string, unknown>;
          const s = (v: unknown): string | undefined =>
            typeof v === "string" && v.trim() ? v.trim() : undefined;
          const platforms = Array.isArray(brief.targetPlatforms)
            ? brief.targetPlatforms.filter((p): p is string => typeof p === "string")
            : undefined;
          // 产物索引 —— 每类产物的版本数 + updatedAt + 当前版本字数(全文走 context.artifact.text)。
          const artifactRows = await artifactsService.listProjectArtifacts(
            c,
            opts.projectId,
          );
          const repo = createArtifactRepository(db, {
            ...deps,
            userId: c.userId,
            accountId: c.accountId ?? null, // [T-136 切片 b] 透传按号维度
          });
          const artifacts = await Promise.all(
            artifactRows.map(async (a) => {
              let versionCount = 0;
              let charCount = 0;
              try {
                const versions = await artifactsService.listVersions(c, a.id);
                versionCount = versions.length;
              } catch {
                versionCount = 0;
              }
              if (a.currentVersionId) {
                try {
                  const version = await repo.getVersion(a.currentVersionId);
                  const data = version.contentData as
                    | Record<string, unknown>
                    | null
                    | undefined;
                  const text =
                    version.contentText && version.contentText.trim()
                      ? version.contentText
                      : data && typeof data.transcript === "string"
                        ? data.transcript
                        : "";
                  charCount = text.length;
                } catch {
                  charCount = 0;
                }
              }
              return {
                artifactType: a.artifactType,
                versionCount,
                updatedAt: a.updatedAt ?? null,
                charCount,
              };
            }),
          );
          // 发布状态 —— 项目 outputs → publications;取首个已发布(publishedAt 非空)作代表。
          let publish = {
            published: false,
            platform: null as string | null,
            publishedAt: null as string | null,
          };
          try {
            const outputIds = await projectsService.listOutputIdsByProject(
              c,
              opts.projectId,
            );
            outer: for (const outputId of outputIds) {
              const pubs = await publishingService.listPublications(c, outputId, {
                limit: 20,
                offset: 0,
              });
              for (const pub of pubs) {
                if (pub.publishedAt) {
                  publish = {
                    published: true,
                    platform: pub.platform,
                    publishedAt: pub.publishedAt,
                  };
                  break outer;
                }
              }
            }
          } catch {
            /* 发布状态 best-effort,读失败按未发布(诚实,不编) */
          }
          // 最新指标摘要 —— 复用 ReviewSubjectReader 口径(views/plays 归一,人类可读串)。
          let metricsSummary = "";
          try {
            metricsSummary = await makeReviewSubjectReader().getMetricsSummary(
              c,
              opts.projectId,
            );
          } catch {
            metricsSummary = "";
          }
          return {
            id: project.id,
            title: project.title,
            stage: project.currentStage,
            status: project.status,
            publish,
            brief: {
              targetAudience: s(brief.targetAudience),
              contentGoal: s(brief.contentGoal),
              contentFormat: s(brief.contentFormat),
              targetPlatforms: platforms,
              durationEstimate: s(brief.durationEstimate),
              coreMessage: s(brief.coreMessage),
              successCriteria: s(brief.successCriteria),
            },
            artifacts,
            metricsSummary,
          };
        } catch {
          return null;
        }
      },
      // [T-099b] context.positioning.detail —— 定位母版全档 + 账号画像并入(不单开账号工具)。
      // 复用 positioningService.getPositioningCenter(profile 全 facets + downstreamRules + 陈述 +
      // history 版本数)+ platformAccountService.listAccounts(账号画像)。母版未建 → profile:null
      // (诚实空态)。best-effort:账号读失败 → 空数组(不阻断定位档案)。
      getPositioningDetail: async (c: RequestContext) => {
        const center = await positioningService.getPositioningCenter(c);
        const p = center.profile;
        const facets = (p?.facets ?? {}) as Record<string, string>;
        const rules = (p?.downstreamRules ?? {}) as Record<string, string>;
        let accounts: Array<{
          platform: string;
          accountHandle: string;
          followerBaseline: number;
        }> = [];
        try {
          const res = await platformAccountService.listAccounts(c, {
            limit: 100,
            offset: 0,
          });
          accounts = res.rows.map((a) => ({
            platform: a.platform,
            accountHandle: a.accountHandle,
            followerBaseline: a.followerBaseline,
          }));
        } catch {
          accounts = [];
        }
        return {
          profile: p
            ? {
                persona: p.persona,
                field: p.field,
                audience: p.audience,
                differentiation: p.differentiation,
                capabilities: p.capabilities,
                facets: {
                  contentScope: facets.contentScope || undefined,
                  avoid: facets.avoid || undefined,
                  corePain: facets.corePain || undefined,
                  coreValue: facets.coreValue || undefined,
                  tone: facets.tone || undefined,
                  statusNote: facets.statusNote || undefined,
                },
                downstreamRules: {
                  topicRule: rules.topicRule || undefined,
                  scriptRule: rules.scriptRule || undefined,
                  projectRule: rules.projectRule || undefined,
                  forbidRule: rules.forbidRule || undefined,
                  expressionRule: rules.expressionRule || undefined,
                },
              }
            : null,
          currentStatement: center.currentStatement
            ? {
                oneLiner: center.currentStatement.oneLiner,
                keywords: center.currentStatement.keywords,
              }
            : null,
          statementCount: Array.isArray(center.history)
            ? center.history.length
            : null,
          accounts,
        };
      },
      // [T-099b] context.knowledge.detail —— 单条知识全字段。复用 knowledgeService.getKnowledge
      //   (带 T-079c 战绩投影 usedCount/usedInPublished)+ listRevisions(取当前修订正文 note)+
      //   listRelations(语义关联边)。tags 从 sourceMetadata.tags 取(schema 无独立 tags 列)。
      //   读不到(不存在/越权)→ null(getKnowledge 抛 → catch 成 null,诚实降级)。
      getKnowledgeDetail: async (c: RequestContext, opts: { id: string }) => {
        try {
          const item = await knowledgeService.getKnowledge(c, opts.id);
          // 正文 note —— 当前修订 content(缺则取 revisionNumber 最大的最新修订)。
          let note = "";
          try {
            const revisions = await knowledgeService.listRevisions(c, opts.id);
            const current =
              revisions.find((r) => r.id === item.currentRevisionId) ??
              revisions
                .slice()
                .sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
            note = current?.content ?? "";
          } catch {
            note = "";
          }
          // 关联边 —— 语义关系(目标 id + 关系类型)。
          let relations: Array<{
            targetKnowledgeId: string;
            relationType: string;
          }> = [];
          try {
            const rels = await knowledgeService.listRelations(c, opts.id);
            relations = rels.map((r) => ({
              targetKnowledgeId: r.targetKnowledgeId,
              relationType: r.relationType,
            }));
          } catch {
            relations = [];
          }
          // tags —— sourceMetadata.tags(字符串数组;缺失/形状不符 → 空)。
          const meta = (item.sourceMetadata ?? {}) as { tags?: unknown };
          const tags = Array.isArray(meta.tags)
            ? meta.tags.filter((t): t is string => typeof t === "string")
            : [];
          return {
            id: item.id,
            title: item.title,
            knowledgeType: item.knowledgeType,
            note,
            sourceNote: item.sourceNote ?? null,
            sourceType: item.sourceType,
            sourceUrl: item.sourceUrl ?? null,
            tags,
            usedCount: item.usedCount,
            usedInPublished: item.usedInPublished,
            relations,
          };
        } catch {
          return null;
        }
      },
      // [T-099c] context.artifacts —— 某项目产物清单。复用既有公开读源(不新造 repo 方法):
      //   · 产物行 → artifactsService.listProjectArtifacts(user-scoped)
      //   · 每类产物版本数 → listVersions;当前版本字数 → getVersion 的 contentText/transcript 长度
      //     (与 getProjectDetail 的产物索引、getScript 同口径,不造影子)。
      // projectsRepo.get 顺带 ownership 门(越权/不存在 → 抛 → catch 成 null,诚实降级)。
      listProjectArtifacts: async (
        c: RequestContext,
        opts: { projectId: string },
      ) => {
        try {
          const project = await projectsRepo.get(c, opts.projectId);
          const artifactRows = await artifactsService.listProjectArtifacts(
            c,
            opts.projectId,
          );
          const repo = createArtifactRepository(db, {
            ...deps,
            userId: c.userId,
            accountId: c.accountId ?? null, // [T-136 切片 b] 透传按号维度
          });
          const items = await Promise.all(
            artifactRows.map(async (a) => {
              let currentVersion: number | null = null;
              let totalChars = 0;
              try {
                const versions = await artifactsService.listVersions(c, a.id);
                const current = versions
                  .slice()
                  .sort((x, y) => y.versionNumber - x.versionNumber)[0];
                currentVersion = current?.versionNumber ?? null;
              } catch {
                currentVersion = null;
              }
              if (a.currentVersionId) {
                try {
                  const version = await repo.getVersion(a.currentVersionId);
                  totalChars = extractArtifactText(
                    version.contentText,
                    version.contentData,
                  ).length;
                } catch {
                  totalChars = 0;
                }
              }
              return {
                artifactType: a.artifactType,
                currentVersion,
                updatedAt: a.updatedAt ?? null,
                totalChars,
              };
            }),
          );
          return {
            projectId: project.id,
            projectTitle: project.title,
            items,
          };
        } catch {
          return null;
        }
      },
      // [T-099c] context.artifact.text —— 某项目某类产物正文全文(事故二根治)。找该 artifactType 的
      // 当前版本,抽正文:output_script transcript 优先(与 getScript 同读法),回退 contentText,再回退
      // contentData.sections 拼段 / body(与 scriptSource.getLatestScript 同抽取口径)。找不到该类产物 /
      // 无当前版本 → null(诚实空态,工具侧渲「这个项目还没有 X 产物」)。ownership 门经 projectsRepo.get。
      getArtifactText: async (
        c: RequestContext,
        opts: { projectId: string; artifactType: string },
      ) => {
        try {
          await projectsRepo.get(c, opts.projectId); // ownership 门(越权/不存在 → 抛 → null)
          const artifactRows = await artifactsService.listProjectArtifacts(
            c,
            opts.projectId,
          );
          const target = artifactRows.find(
            (a) => a.artifactType === opts.artifactType,
          );
          if (!target || !target.currentVersionId) return null;
          const repo = createArtifactRepository(db, {
            ...deps,
            userId: c.userId,
            accountId: c.accountId ?? null, // [T-136 切片 b] 透传按号维度
          });
          const version = await repo.getVersion(target.currentVersionId);
          const fullText = extractArtifactText(
            version.contentText,
            version.contentData,
          );
          return { artifactType: target.artifactType, fullText };
        } catch {
          return null;
        }
      },
      // [T-099c] context.knowledge.text —— 某知识条目长文正文全文。取当前修订(缺则 revisionNumber 最大)
      // 的 content(transcript/reference/note 长文都落在 revision content,与 getKnowledgeDetail 的 note
      // 同读法)。读不到(不存在/越权)→ null(getKnowledge 抛 → catch 成 null,诚实降级)。
      getKnowledgeText: async (c: RequestContext, opts: { id: string }) => {
        try {
          const item = await knowledgeService.getKnowledge(c, opts.id);
          let fullText = "";
          try {
            const revisions = await knowledgeService.listRevisions(c, opts.id);
            const current =
              revisions.find((r) => r.id === item.currentRevisionId) ??
              revisions
                .slice()
                .sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
            fullText = current?.content ?? "";
          } catch {
            fullText = "";
          }
          return {
            id: item.id,
            title: item.title,
            knowledgeType: item.knowledgeType,
            fullText,
          };
        } catch {
          return null;
        }
      },
      // [T-099 切片四] context.publications —— 该用户发布记录清单。复用 publishing 公开读源
      // getRecentPublicationsWithTitle(user-scoped,已把 revision 标题解析进 row.title)。该读源
      // 无 total:多拉一页(limit+1)探 hasMore,total 用「offset+已见 + (还有更多 ? 1 : 0)」诚实近似
      // (不新造 count op;分页真相 hasMore 精确,total 为下界近似,前端脚注不谎称已看全)。
      listPublications: async (
        c: RequestContext,
        opts: { limit: number; offset: number },
      ) => {
        try {
          const probe = await publishingService.getRecentPublicationsWithTitle(c, {
            limit: opts.limit + 1,
            offset: opts.offset,
          });
          const hasMore = probe.length > opts.limit;
          const page = probe.slice(0, opts.limit);
          return {
            rows: page.map((p) => ({
              id: p.id,
              platform: p.platform,
              url: p.externalUrl ?? null,
              publishedAt: p.publishedAt ?? null,
              projectTitle: p.title ?? "",
              status: p.status,
            })),
            // total 下界:本页起点 + 本页条数 (+1 当还有更多)。工具 hasMore 精确,total 诚实近似。
            total: opts.offset + page.length + (hasMore ? 1 : 0),
          };
        } catch {
          return { rows: [], total: 0 };
        }
      },
      // [T-099 切片四] context.metrics —— 给 projectId → 单作品指标快照(播放/点赞/评论/分享,复用
      // dashboard 的 views??plays 归一 + 最新帧口径,与 getMetricsSummary 同读法);不给 → 账号级最近
      // N 作品指标行(getRecentPublicationsWithTitle 的作品 × 各自最新 snapshot)。留存点无公开读 seam
      // (不跨模块直连 repo,守 SPEC §22 / 零新 contract)→ 诚实回空数组(不编)。全 best-effort 空兜底。
      getMetrics: async (
        c: RequestContext,
        opts: { projectId?: string; limit: number },
      ) => {
        // 从一条 publication 的最新 snapshot rawMetrics 抽 4 项核心指标(views??plays 归一)。
        const metricsOfPublication = async (
          publicationId: string,
        ): Promise<{
          plays: number | null;
          likes: number | null;
          comments: number | null;
          shares: number | null;
        }> => {
          try {
            const page = await analyticsService.getPublicationAnalytics(
              c,
              publicationId,
              1,
              10,
            );
            const latest = page.rows
              .slice()
              .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
            const raw = (latest?.rawMetrics ?? {}) as Record<string, unknown>;
            const num = (k: string): number | null => {
              const v = raw[k];
              return typeof v === "number" && Number.isFinite(v) ? v : null;
            };
            return {
              plays: num("views") ?? num("plays"),
              likes: num("likes") ?? num("digg"),
              comments: num("comments"),
              shares: num("shares"),
            };
          } catch {
            return { plays: null, likes: null, comments: null, shares: null };
          }
        };
        // 单作品模式:该项目 outputs → publications,合并各 publication 最新 snapshot(取有值者)。
        if (opts.projectId) {
          try {
            const project = await projectsRepo.get(c, opts.projectId); // ownership 门
            const outputIds = await projectsService.listOutputIdsByProject(
              c,
              opts.projectId,
            );
            const merged = {
              plays: null as number | null,
              likes: null as number | null,
              comments: null as number | null,
              shares: null as number | null,
            };
            for (const outputId of outputIds) {
              let pubs: Array<{ id: string }> = [];
              try {
                pubs = await publishingService.listPublications(c, outputId, {
                  limit: 20,
                  offset: 0,
                });
              } catch {
                pubs = [];
              }
              for (const pub of pubs) {
                const m = await metricsOfPublication(pub.id);
                merged.plays = merged.plays ?? m.plays;
                merged.likes = merged.likes ?? m.likes;
                merged.comments = merged.comments ?? m.comments;
                merged.shares = merged.shares ?? m.shares;
              }
            }
            const hasAny =
              merged.plays !== null ||
              merged.likes !== null ||
              merged.comments !== null ||
              merged.shares !== null;
            return {
              subject: project.title,
              rows: hasAny ? [{ title: project.title, ...merged }] : [],
              // 留存点无公开读 seam → 诚实空(不跨模块直连 repo、不编)。
              retention: [],
            };
          } catch {
            return { subject: null, rows: [], retention: [] };
          }
        }
        // 账号级模式:最近 N 发布作品,每作品一行(标题 + 该 publication 最新 snapshot 指标)。
        try {
          const pubs = await publishingService.getRecentPublicationsWithTitle(c, {
            limit: opts.limit,
            offset: 0,
          });
          const rows = await Promise.all(
            pubs.map(async (p) => {
              const m = await metricsOfPublication(p.id);
              return {
                title: p.title || p.platform || "（无标题发布）",
                ...m,
              };
            }),
          );
          return { subject: null, rows, retention: [] };
        } catch {
          return { subject: null, rows: [], retention: [] };
        }
      },
      // [T-099 切片五] context.learnings —— 经验清单(含 validated/candidate 状态)。复用 learnings
      // 公开读源 listLearnings(user-scoped,带 reuseCount 战绩)。契约 list op 无 query/type/status
      // 过滤 → 多拉一批(上限 200)后内存过滤:query 命中标题/洞察(knowledgeRelevanceScore 分词 OR),
      // learningType/status 精确匹配。诚实:全不命中 → 空。total = 过滤后全量数(前端脚注真相)。
      listLearnings: async (
        c: RequestContext,
        opts: {
          query?: string;
          learningType?: string;
          status?: string;
          limit: number;
        },
      ) => {
        try {
          const { rows } = await learningsService.listLearnings(c, {
            limit: 200,
            offset: 0,
          });
          const q = (opts.query ?? "").trim();
          const filtered = rows.filter((r) => {
            if (opts.learningType && r.learningType !== opts.learningType)
              return false;
            if (opts.status && r.validationStatus !== opts.status) return false;
            if (q && knowledgeRelevanceScore(`${r.title}\n${r.insight}`, q) === 0)
              return false;
            return true;
          });
          return {
            total: filtered.length,
            rows: filtered.slice(0, opts.limit).map((r) => ({
              id: r.id,
              title: r.title,
              insight: r.insight,
              learningType: r.learningType,
              status: r.validationStatus,
              reuseCount: r.reuseCount,
            })),
          };
        } catch {
          return { rows: [], total: 0 };
        }
      },
      // [T-099 切片五] context.candidates —— 选题候选池清单。复用 candidate 公开读源 listCandidates
      // (user-scoped,带 total 分页)。title/status/predictedScore/source 直投影。
      listCandidates: async (
        c: RequestContext,
        opts: { limit: number; offset: number },
      ) => {
        try {
          const { rows, total } = await candidateService.listCandidates(c, {
            limit: opts.limit,
            offset: opts.offset,
          });
          return {
            total,
            rows: rows.map((r) => ({
              id: r.id,
              title: r.title,
              status: r.status,
              score: r.predictedScore,
              source: r.source,
            })),
          };
        } catch {
          return { rows: [], total: 0 };
        }
      },
      // [T-099 切片五] context.predictions —— 预测 vs 实绩对照 + 当前 rubric 摘要。复用 calibration
      // 公开读源:getOverview(reflowRows = prediction+result 逐维度对照 + KPI)+ getCurrentRubricVersion
      // (canonical rubric 摘要)。overview.reflowRows 只含已回流的预测;total 用 reflowRows 长度(诚实:
      // 未回流的预测无对照行,不编 actual)。rubric 读失败 / 母版未建 → rubric:null(诚实空态)。
      getPredictions: async (c: RequestContext, opts: { limit: number }) => {
        let rubric: {
          name: string;
          versionNumber: number;
          dimensionCount: number;
        } | null = null;
        try {
          const version = await calibrationService.getCurrentRubricVersion(
            c,
            "rubric-canonical",
          );
          rubric = {
            name: "校准评分标准",
            versionNumber: version.versionNumber,
            dimensionCount: version.dimensions.length,
          };
        } catch {
          rubric = null; // 母版未建 / 读不到 → 诚实空(不编版本号)
        }
        try {
          const overview = await calibrationService.getOverview(c);
          const reflow = overview.reflowRows.slice(0, opts.limit);
          // 各对照行的作品标题 —— 从 pendingSubjects 按 subjectId 反查(overview 已含,不新读)。
          const titleBySubject = new Map(
            overview.pendingSubjects.map((s) => [s.subjectId, s.title]),
          );
          const rows = reflow.map((r) => {
            const hasResult = r.dimensions.some((d) => d.actual !== null);
            return {
              predictionId: r.predictionId,
              subjectTitle: titleBySubject.get(r.subjectId) ?? "",
              hasResult,
              deviationBand: r.deviationBand,
              finding: r.reason,
              dimensions: r.dimensions.map((d) => ({
                key: d.key,
                label: d.label,
                predicted: d.predicted,
                actual: d.actual,
                deviation: d.deviation,
              })),
            };
          });
          return { rubric, rows, total: overview.reflowRows.length };
        } catch {
          return { rubric, rows: [], total: 0 };
        }
      },
    },
    // [T-084a] 联网检索端口 —— gatherMaterials 前置检索 + honestyBlock/工具动态描述探测。
    probeSearchConfigured,
    searchWeb: searchWebPort,
    // [T-084b] material.screenshot 端口 —— 真无头浏览器截公开页 → createGeneratedAsset 落库
    // (sourceUrl 存证进 mediaMetadata,复用 mergeAiAnnotation 不改 schema)→ 换签名预览 URL。
    // captureUrl 逐类抛错(打不开/HTTP/登录墙),原样上抛给工具 execute 转人话渲错误态。
    captureScreenshot: async (
      ctx: RequestContext,
      input: { url: string; fullPage?: boolean },
    ) => {
      const shot = await captureUrl(input.url, { fullPage: input.fullPage });
      const name = `截图·${(shot.title || shot.finalUrl).slice(0, 40)}`;
      const asset = await assetsService.createGeneratedAsset(ctx, {
        assetType: "image",
        name,
        bytes: shot.bytes,
        mimeType: shot.contentType,
      });
      // sourceUrl 存证:merge 进 asset 文件 mediaMetadata(与 asset-classify 的 aiDescription
      // 同一条 merge 路径,jsonb additive,不改 DB schema —— SPEC §2.2 来源存证)。best-effort:
      // 存证失败不回滚已落的截图字节(截图本身已是真产物)。
      await assetsService
        .mergeAiAnnotation(ctx, asset.id, { sourceUrl: input.url })
        .catch(() => {});
      let previewUrl: string | null = null;
      try {
        const dl = await assetsService.getDownloadUrl(ctx, asset.id);
        previewUrl = dl.url ?? null;
      } catch {
        previewUrl = null; // 换签名 URL 失败 → 卡渲占位,不阻断(asset 已落库)
      }
      return { assetId: asset.id, name: asset.name, previewUrl, sourceUrl: input.url };
    },
    // [T-084c] material.generate 端口 —— dispatch 既有 asset.generate task(经 ai transport
    // 的 ai.tasks.create,复用既有分派链 void runAssetGenerate;projectId 走 inputData,service
    // createTask 据它归属项目)。立即返回 taskId,不阻塞对话回合(视频异步分钟级)。
    dispatchGenerateAsset: async (
      ctx: RequestContext,
      input: { kind: "image" | "video"; prompt: string; projectId?: string | null },
    ) => {
      const res = await ai.request(
        // key = op 方法名 createAITask;其 .id === "ai.tasks.create"(ai transport 拦此 id 分派)。
        ENDPOINTS.createAITask,
        {
          params: undefined,
          query: undefined,
          body: {
            taskType: "asset.generate",
            inputData: {
              kind: input.kind,
              prompt: input.prompt,
              ...(input.projectId ? { projectId: input.projectId } : {}),
            },
          },
        },
        ctx,
      );
      const task = (res as { data?: { id?: unknown } }).data;
      const taskId = task && typeof task.id === "string" ? task.id : "";
      if (!taskId) {
        throw new Error("dispatchGenerateAsset: 起 asset.generate task 失败(无 taskId)");
      }
      return { taskId };
    },
    // [T-103b] review.script 端口 —— 起 script.review ai_task 复用稿面「审核」按钮的旧 trigger 链路
    // (reviewGateService.triggerReview:createTask 后由注入 AI 端口显式接 dispatchScriptReview 在后台
    // 跑 L1 违禁词 lint + L2 语义审 → saveReport)。立即返回 taskId,不阻塞对话回合(审核分钟内)。
    dispatchScriptReview: async (
      ctx: RequestContext,
      input: { projectId: string },
    ) => {
      const task = (await reviewGateService.triggerReview(
        ctx,
        input.projectId,
      )) as { id?: unknown } | null;
      const taskId = task && typeof task.id === "string" ? task.id : "";
      if (!taskId) {
        throw new Error("dispatchScriptReview: 起 script.review task 失败(无 taskId)");
      }
      return { taskId };
    },
  };

  // ── T-040a 提示词/skill 服务端可配(装配接线,SPEC 2026-07-02 §4.2)──────────────
  // db 句柄可用后调一次:读 skill_config_overrides 全表 → 归一空串→undefined → 调既有
  // overrideTemplatesFromConfig 套进常驻 REGISTRY([gate-F1] 内部首行先 registerAllTemplates
  // 保证 18 个 id 就位)。表空/未配 → 归一后逐字段 undefined → getTemplate 仍返内置(零风险回退)。
  // 覆盖 chat 三面 skill(chat-runner 走 getTemplate,本片即可配);结构化 runner 走 import 常量,
  // 待 T-040b 改 getTemplate 后才吃到覆盖(诚实标注,不越界)。fire-and-forget 内部逐条 try/catch,
  // 坏 id 只记日志跳过、不阻塞装配。
  // T-040c:把「重读表+重套覆盖」闭包在 db 可见处,启动装配调一次;prompts.put 后经 bundle
  // 再调一次做热更(compositeTransport 那层没有 db,故经 bundle 暴露)。
  const reapplySkillOverrides = () =>
    applySkillConfigOverridesFromDb({
      readPort: createPgliteSkillConfigOverrideReadPort(db),
    });
  await reapplySkillOverrides();

  return {
    reapplySkillOverrides,
    projects,
    taxonomy,
    notifications,
    search,
    settings,
    knowledge,
    assets,
    artifacts,
    production,
    publishing,
    analytics,
    ingestion,
    reviews,
    reviewGate,
    learnings,
    ai,
    positioning,
    candidate,
    calibration,
    platformAccount,
    scheduling: schedulingWithRunNow, // wrap:透传 CRUD + 拦 scheduledJobs.runNow(D5)
    contentCalendar,
    materialLinks,
    queryServices,
    publishingCenter,
    identity,
    platformAccountService,
    settingsService,
    chatRuntime,
    localFileRuntime,
    knowledgeSearchRuntime,
  };
}

function getBundle(): Promise<PersistenceBundle> {
  if (!globalForPersistence.__creatorosPersistence) {
    globalForPersistence.__creatorosPersistence = buildPersistence();
  }
  return globalForPersistence.__creatorosPersistence;
}

async function getProjects(): Promise<Transport> {
  return (await getBundle()).projects;
}

async function getTaxonomy(): Promise<Transport> {
  return (await getBundle()).taxonomy;
}

async function getNotifications(): Promise<Transport> {
  return (await getBundle()).notifications;
}

async function getSearch(): Promise<Transport> {
  return (await getBundle()).search;
}

async function getSettings(): Promise<Transport> {
  return (await getBundle()).settings;
}

async function getKnowledge(): Promise<Transport> {
  return (await getBundle()).knowledge;
}

async function getAssets(): Promise<Transport> {
  return (await getBundle()).assets;
}

async function getArtifacts(): Promise<Transport> {
  return (await getBundle()).artifacts;
}

async function getProduction(): Promise<Transport> {
  return (await getBundle()).production;
}

async function getPublishing(): Promise<Transport> {
  return (await getBundle()).publishing;
}

async function getAnalytics(): Promise<Transport> {
  return (await getBundle()).analytics;
}

async function getIngestion(): Promise<Transport> {
  return (await getBundle()).ingestion;
}

async function getReviews(): Promise<Transport> {
  return (await getBundle()).reviews;
}

async function getReviewGate(): Promise<Transport> {
  return (await getBundle()).reviewGate;
}

async function getLearnings(): Promise<Transport> {
  return (await getBundle()).learnings;
}

async function getAi(): Promise<Transport> {
  return (await getBundle()).ai;
}

async function getPositioning(): Promise<Transport> {
  return (await getBundle()).positioning;
}

async function getCandidate(): Promise<Transport> {
  return (await getBundle()).candidate;
}

async function getCalibration(): Promise<Transport> {
  return (await getBundle()).calibration;
}

async function getPlatformAccount(): Promise<Transport> {
  return (await getBundle()).platformAccount;
}

async function getScheduling(): Promise<Transport> {
  return (await getBundle()).scheduling;
}

async function getContentCalendar(): Promise<Transport> {
  return (await getBundle()).contentCalendar;
}

async function getMaterialLinks(): Promise<Transport> {
  return (await getBundle()).materialLinks;
}

async function getQueryServices(): Promise<Transport> {
  return (await getBundle()).queryServices;
}

/**
 * The Publishing Center composer (module Q). It has NO dispatch endpoint (SPEC §13
 * has no read path; contract/src/operations/pages.ts:7-10) — the Server Component
 * for `/publishing` calls this server-side to compose `publishingCenterPage` from
 * public services only (touching no repository). Bound to the same pglite store.
 */
export async function getPublishingCenterService(): Promise<PublishingCenterQueryService> {
  return (await getBundle()).publishingCenter;
}

/**
 * The shared identity service, bound to the same pglite store as the composite
 * transport. The dispatch route + the three auth routes (Task 9) resolve ctx /
 * mint sessions / read the current user through this — never the db client
 * directly (SPEC §22). Routes go through identity.service or compositeTransport.
 */
export async function getIdentityService(): Promise<IdentityService> {
  return (await getBundle()).identity;
}

/**
 * [T-136 切片 a] platform-account service,bound to the same pglite store。
 * `resolveRequestContext` 用它对 x-account-id header 做属主硬校验(gate BLOCKER-1):
 * getAccount(ctx, accountId) 在 ctx.userId 域内查号,不属主 / 不存在 → OwnershipError,
 * 调用侧据此把 accountId 降级为 null(防伪造 header 越权穿透 per-account repo 门)。
 * 与 getIdentityService 同款「无 dispatch endpoint 的 route 直调服务」逃生口。
 */
export async function getPlatformAccountService(): Promise<PlatformAccountService> {
  return (await getBundle()).platformAccountService;
}

/**
 * item B — resolve the request user's absolute media root. The blob route
 * (/api/v1/blob/[...key]) has no dispatch endpoint, so it resolves ctx from the
 * session cookie and calls this to learn WHERE on disk to read/write bytes — the
 * same root the local-fs adapter minted the upload URL against. Bound to the same
 * pglite store as the composite transport.
 */
export async function getStorageRootForRequest(
  ctx: RequestContext,
): Promise<string> {
  const { settingsService } = await getBundle();
  return settingsService.resolveStorageRoot(ctx);
}

/**
 * T-004 ChatBox — the /api/chat route's runtime (aiService + resolveModelSpec + bound
 * CreativeContext readers), bound to the same pglite store as the composite transport.
 * The route streams via the Vercel AI SDK (not the RPC envelope), so it resolves ctx from
 * the session cookie and assembles + persists a turn through this — never the db client
 * directly (SPEC §22). Mirrors getStorageRootForRequest's escape hatch for endpoint-less routes.
 */
export async function getChatRuntime(): Promise<ChatRuntime> {
  return (await getBundle()).chatRuntime;
}

/**
 * [T-055d] Finder / 本地文件 route 的运行时(assetId→storageKey / projectId→目录),
 * 与 getStorageRootForRequest 同款 escape hatch 模式。
 */
export async function getLocalFileRuntime(): Promise<
  PersistenceBundle["localFileRuntime"]
> {
  return (await getBundle()).localFileRuntime;
}

/**
 * [T-093] 知识库 AI 搜索运行时(/api/knowledge/search 消费),与 getChatRuntime 同款
 * escape hatch:embedding 走 model-config capability "knowledge.search.embed"(用户可配,
 * 只认专配行,不回退 default 聊天模型);未配 → 纯关键词诚实降级。
 */
export async function getKnowledgeSearchRuntime(): Promise<
  PersistenceBundle["knowledgeSearchRuntime"]
> {
  return (await getBundle()).knowledgeSearchRuntime;
}

// Composite server transport: persistence for project ops, mock for the rest.
// Used by BOTH the server pages (contract-client.server) and the /api/v1 route,
// so server reads and island writes share one pglite store — island mutations
// persist and a router.refresh() reflects them.
export const compositeTransport: Transport = {
  async request(endpoint: Endpoint, input, ctx) {
    // Non-persisted (mock) ops ignore ctx — the deterministic mock store is not
    // user-scoped, and the browser typed client / static pages carry no ctx.
    if (!PERSISTED_OPS.has(endpoint.id)) {
      return mockTransport.request(endpoint, input, ctx);
    }
    // Taxonomy ops (module 04) are served by the module's own transport over
    // the SAME pglite store. Routed before the projects persistence transport so
    // each module owns its op ids (foundation §1 module registry).
    if (TAXONOMY_OPS.has(endpoint.id)) {
      const taxonomy = await getTaxonomy();
      return taxonomy.request(endpoint, input, ctx);
    }
    // Notifications ops (module 01) are served by the module's own transport over
    // the SAME pglite store. Each module owns its op ids (foundation §1 registry).
    if (NOTIFICATION_OPS.has(endpoint.id)) {
      const notifications = await getNotifications();
      return notifications.request(endpoint, input, ctx);
    }
    // Search ops (module 02) — the composed `pages.search.get` read served by the
    // module's own transport over the SAME pglite store (foundation §1 registry).
    if (SEARCH_OPS.has(endpoint.id)) {
      const search = await getSearch();
      return search.request(endpoint, input, ctx);
    }
    // Settings ops (module 03) — account read + preference/model/agent mutations
    // served by the module's own transport over the SAME pglite store (foundation
    // §1 registry).
    if (SETTINGS_OPS.has(endpoint.id)) {
      const bundle = await getBundle();
      const result = await bundle.settings.request(endpoint, input, ctx);
      // T-040c 热更:提示词/skill 覆盖 put 成功后,**重读表 + 重套进常驻 REGISTRY**
      // (overrideTemplatesFromConfig 是「套一次进内存」,非每次 getTemplate 查库)——
      // 于是下一次 getTemplate/装配即读到新值,**不必重启**。fire-and-forget catch,
      // 失败只吞、不影响 put 本身的返回。
      if (endpoint.id === "settings.prompts.put") {
        await bundle.reapplySkillOverrides().catch(() => {});
      }
      return result;
    }
    // Knowledge ops (module 06) — list/create/get + revisions.create +
    // relations.create served by the module's own user-scoped transport over the
    // SAME pglite store (foundation §1 registry). No ctx ⇒ AuthenticationError.
    if (KNOWLEDGE_OPS.has(endpoint.id)) {
      const knowledge = await getKnowledge();
      return knowledge.request(endpoint, input, ctx);
    }
    // Assets ops (module 07) — list/get + two-phase upload + files.create +
    // trash/restore served by the module's own user-scoped transport over the
    // SAME pglite store (foundation §1 registry). No ctx ⇒ AuthenticationError.
    if (ASSET_OPS.has(endpoint.id)) {
      const assets = await getAssets();
      return assets.request(endpoint, input, ctx);
    }
    // Artifacts ops (module 08) — list/create/get + versions.create/list +
    // restore + relations.create served by the module's own user-scoped transport
    // over the SAME pglite store (foundation §1 registry). No ctx ⇒
    // AuthenticationError.
    if (ARTIFACT_OPS.has(endpoint.id)) {
      const artifacts = await getArtifacts();
      return artifacts.request(endpoint, input, ctx);
    }
    // Production ops (module 09) — get/put production + segments.create + exports
    // create/complete served by the module's own user-scoped transport over the
    // SAME pglite store (foundation §1 registry). completeExport's cross-module
    // fan-out runs inside the service via injected public peer services. No ctx ⇒
    // AuthenticationError.
    if (PRODUCTION_OPS.has(endpoint.id)) {
      const production = await getProduction();
      return production.request(endpoint, input, ctx);
    }
    // Publishing ops (module 10) — list/create/get publications + revisions.create
    // + transition served by the module's own user-scoped transport over the SAME
    // pglite store (foundation §1 registry). The transition publish/remove
    // side-effect runs inside the service via the MockPublisher seam; the
    // cross-module fan-out reaches peers via injected public services. No ctx ⇒
    // AuthenticationError.
    if (PUBLISHING_OPS.has(endpoint.id)) {
      const publishing = await getPublishing();
      return publishing.request(endpoint, input, ctx);
    }
    // Analytics ops (module 11) — analytics.publications.get / analytics.projects.get
    // served by the module's own user-scoped transport over the SAME pglite store
    // (foundation §1 registry). The project→publication ownership resolve runs
    // inside the service via the injected Publishing public seam. No ctx ⇒
    // AuthenticationError.
    if (ANALYTICS_OPS.has(endpoint.id)) {
      const analytics = await getAnalytics();
      return analytics.request(endpoint, input, ctx);
    }
    // Ingestion ops (module 12) — the 7 batch-push run ops served by the module's
    // own user-scoped transport over the SAME pglite store (foundation §1 registry).
    // The fan-out to peer modules runs inside the service via injected public Service
    // ports (no repo import). No ctx ⇒ AuthenticationError.
    if (INGESTION_OPS.has(endpoint.id)) {
      const ingestion = await getIngestion();
      return ingestion.request(endpoint, input, ctx);
    }
    // Reviews ops (module 13) — reviews.create/get + reviews.insights.create +
    // reviews.complete served by the module's own user-scoped transport over the
    // SAME pglite store (foundation §1 registry). Period/evidence derivation +
    // ownership gates run inside the service via injected public peer ports. No ctx
    // ⇒ AuthenticationError.
    if (REVIEWS_OPS.has(endpoint.id)) {
      const reviews = await getReviews();
      return reviews.request(endpoint, input, ctx);
    }
    // T-086 审核门 ops(reviewRules.* + scriptReviews.*)—— 规则库 CRUD + 稿面审核
    // 报告读/触发,走本模块 user-scoped transport(同一 pglite store)。scriptReviews.trigger
    // 起 script.review ai_task,dispatch 后台跑 L1+L2。No ctx ⇒ AuthenticationError。
    if (REVIEW_GATE_OPS.has(endpoint.id)) {
      const reviewGate = await getReviewGate();
      return reviewGate.request(endpoint, input, ctx);
    }
    // Learnings ops (module 14) — learnings.list/create + learnings.applications.create
    // + learnings.evaluate served by the module's own user-scoped transport over the
    // SAME pglite store (foundation §1 registry). The §12 validationStatus machine +
    // apply-target ownership/activity run inside the service via the injected Projects
    // port. No ctx ⇒ AuthenticationError.
    if (LEARNINGS_OPS.has(endpoint.id)) {
      const learnings = await getLearnings();
      return learnings.request(endpoint, input, ctx);
    }
    // AI ops (module 15) — conversations list/create + messages.create + tasks
    // create/confirm/cancel served by the module's own user-scoped transport over the
    // SAME pglite store (foundation §1 registry). The §12 AI Task state machine +
    // candidate→confirm formalize (through the injected Artifacts service) run inside the
    // service; the Agent SDK runs only in @creatoros/ai-worker. No ctx ⇒
    // AuthenticationError.
    if (AI_OPS.has(endpoint.id)) {
      const ai = await getAi();
      return ai.request(endpoint, input, ctx);
    }
    // Positioning ops (module 17, Wave 5) — profile get/upsert + statements
    // list/create/get + gate.evaluate + pages.positioning.get served by the module's
    // own user-scoped transport over the SAME pglite store (foundation §1 registry).
    // The append-only version chain + deterministic advisory gate run inside the
    // service; the gate's project subject reaches Projects via the injected port. No
    // ctx ⇒ AuthenticationError.
    if (POSITIONING_OPS.has(endpoint.id)) {
      const positioning = await getPositioning();
      return positioning.request(endpoint, input, ctx);
    }
    // [T-052 裁决③] Monetization ops 分发分支已随变现中心物理删除(宪法 §8)。
    // Candidate ops (module 19, Wave 5) — candidates.list/create/get/patch/promote +
    // audienceSignals.list/linkToCandidate served by the module's own user-scoped
    // transport over the SAME pglite store (foundation §1 registry). The lightweight
    // pool + promote → Project + demand_count aggregation run inside the service;
    // AI-sourced candidates arrive via createFromAIResult (C-3) and signal writes ride
    // Ingestion (C-4) — neither is a contract op here. No ctx ⇒ AuthenticationError.
    if (CANDIDATE_OPS.has(endpoint.id)) {
      const candidate = await getCandidate();
      return candidate.request(endpoint, input, ctx);
    }
    // Calibration ops (module 20, Wave 5–7) — rubrics.create/bumpVersion/get +
    // predictions.create/lock/get/list + results.create + overview (校准中心总览) served by
    // the module's own user-scoped transport over the SAME pglite store (registry). The
    // immutable lock + append-only RubricVersion + §C-4/RISK-005 run guard run inside
    // the service; the IngestionRun existence + §6.3 Learnings feedback reach peers via
    // injected ports. No ctx ⇒ AuthenticationError.
    if (CALIBRATION_OPS.has(endpoint.id)) {
      const calibration = await getCalibration();
      return calibration.request(endpoint, input, ctx);
    }
    // PlatformAccount ops (module 21, Wave 5–7) — accounts.list/create/get/update/
    // archive served by the module's own user-scoped transport over the SAME pglite
    // store (foundation §1 registry). 矩阵号 registry + the assertOwnedAccount binding
    // guard run inside the service; no peer fan-out (pure local records). No ctx ⇒
    // AuthenticationError.
    if (PLATFORM_ACCOUNT_OPS.has(endpoint.id)) {
      const platformAccount = await getPlatformAccount();
      return platformAccount.request(endpoint, input, ctx);
    }
    // Scheduling ops (module 23, T-007) — scheduledJobs.create/list/get/update/setEnabled
    // + jobRuns.listByJob/get served by the module's own user-scoped transport over the
    // SAME pglite store (foundation §1 registry). owned-root, job_run 经 requireJob
    // ownership gate;pure local records, no peer fan-out. No ctx ⇒ AuthenticationError.
    if (SCHEDULING_OPS.has(endpoint.id)) {
      const scheduling = await getScheduling();
      return scheduling.request(endpoint, input, ctx);
    }
    // ContentCalendar ops (module 22, Wave 5–7) — accounts.calendar.list/.entries.create
    // + calendar.entries.update/transition/delete + accounts.cadence.get/upsert/
    // attainment served by the module's own user-scoped transport over the SAME pglite
    // store (foundation §1 registry). The §7.2 state machine + 达成率/断更 reconcile run
    // inside the service; account ownership is gated via the injected
    // PlatformAccountService port (no cross-module repo import). No ctx ⇒
    // AuthenticationError.
    if (CONTENT_CALENDAR_OPS.has(endpoint.id)) {
      const contentCalendar = await getContentCalendar();
      return contentCalendar.request(endpoint, input, ctx);
    }
    // MaterialLinks ops (Plan A4) — materialLinks.list/create/delete served by the
    // module's own user-scoped transport over the SAME pglite store (foundation §1
    // registry). The 料库⇄创作 用料链 edge; delete is ownership-gated (cross-user →
    // OwnershipError → 404). No peer fan-out (pure local records). No ctx ⇒
    // AuthenticationError.
    if (MATERIAL_LINKS_OPS.has(endpoint.id)) {
      const materialLinks = await getMaterialLinks();
      return materialLinks.request(endpoint, input, ctx);
    }
    // Query-services ops (module Q, Wave 4) — the 3 page-composition reads
    // (pages.dashboard.get / pages.projectOverview.get / pages.search.get) served by
    // the module's own transport, composing public upstream services (SPEC §19). This
    // TAKES OVER pages.search.get from the Search interim composer (foundation §6) —
    // checked before SEARCH_OPS (now empty) so exactly one handler owns it. No ctx ⇒
    // AuthenticationError.
    if (QUERY_SERVICES_OPS.has(endpoint.id)) {
      const queryServices = await getQueryServices();
      return queryServices.request(endpoint, input, ctx);
    }
    // Projects ops (module 05) — all 15 "项目与流程" ops served by the module's
    // own user-scoped transport over the SAME pglite store (foundation §1
    // registry). No ctx ⇒ the transport throws AuthenticationError (→401).
    if (PROJECT_OPS.has(endpoint.id)) {
      const projects = await getProjects();
      try {
        return await projects.request(endpoint, input, ctx);
      } catch (err) {
        if (err instanceof UnsupportedOperationError) {
          return mockTransport.request(endpoint, input, ctx);
        }
        throw err;
      }
    }
    // Any other persisted op id with no owning module falls back to the mock.
    return mockTransport.request(endpoint, input, ctx);
  },
};

// Test hook: drop the pglite singleton so each test starts from a fresh seed.
export function __resetPersistenceForTests(): void {
  globalForPersistence.__creatorosPersistence = undefined;
}
