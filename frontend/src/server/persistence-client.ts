import "server-only";
import {
  createDb,
  createRuntimeDb,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type { Endpoint, Transport, RequestContext } from "@creatoros/contract";
import { mockTransport } from "@/server/mock-backend/mock-transport";
import { FIXED_NOW_ISO } from "@/server/mock-backend/store";
import { canonicalDataset } from "@/fixtures/canonical";
import {
  douyinProjects,
  douyinProjectStages,
  douyinContentOutputs,
  douyinOutputStages,
  douyinPublications,
  douyinPublicationRevisions,
  douyinMetricSnapshots,
  douyinMetricValues,
  douyinAudienceSnapshots,
  douyinArtifacts,
  douyinArtifactVersions,
  douyinKnowledgeItems,
  douyinKnowledgeRevisions,
  DOUYIN_FAN_TOTAL,
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
  type NotificationRow,
} from "@creatoros/backend/modules/notifications";
import {
  createSearchRepository,
  createSearchService,
  createSearchTransport,
  SEARCH_OP_IDS,
} from "@creatoros/backend/modules/search";
import { buildCanonicalSearchDocuments } from "@creatoros/backend/modules/search";
import {
  createSettingsRepository,
  createSettingsService,
  createSettingsTransport,
  SETTINGS_OP_IDS,
  type SettingsService,
  type ModelConfigurationRow,
  type UserPreferenceRow,
  type AgentConfigurationRow,
} from "@creatoros/backend/modules/settings";
import {
  createProjectRepository,
  createProjectsService,
  createProjectsTransport,
  PROJECT_OP_IDS,
  type StageGateReadersRef,
  type ProjectRow,
  type StageRow,
  type TargetPlatformRow,
  type ContentOutputRow,
  type OutputStageRow,
  type TaskRow,
  type ActivityRow,
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
  type AssetRow,
  type AssetFileRow,
} from "@creatoros/backend/modules/assets";
import {
  createArtifactRepository,
  createArtifactsService,
  createArtifactsTransport,
  ARTIFACT_OP_IDS,
  type ArtifactRow,
  type ArtifactVersionRow,
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
  createPublishingRepository,
  createMockPublisher,
  PUBLISHING_OP_IDS,
  type PublicationRow,
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
import {
  createLearningsService,
  createLearningsTransport,
  createLearningsRepository,
  LEARNINGS_OP_IDS,
  type LearningRow,
} from "@creatoros/backend/modules/learnings";
import {
  createAiService,
  createAiTransport,
  createAiRepository,
  buildAiModelConfigs,
  buildAiAgentConfigs,
  AI_OP_IDS,
} from "@creatoros/backend/modules/ai";
import { runGatherMaterial } from "@/server/ai/research-runner";
import { runTopicGenerateV2 } from "@/server/ai/topic-task-adapter";
import * as nodePath from "node:path";
import { fetchDouyinMetrics, loginDouyin } from "@/server/ingestion/douyin-cdp";
import { runTopicEnrich } from "@/server/ai/topic-enrich-runner";
import { runCalibrationDiagnose } from "@/server/ai/calibration-diagnose-runner";
import { runScriptDraft } from "@/server/ai/script-runner";
import { runPlanningThesis } from "@/server/ai/planning-runner";
import { runPlanningContract } from "@/server/ai/planning-contract-runner";
import { runPlanningOutline } from "@/server/ai/planning-outline-runner";
import { runReviewAnalyze } from "@/server/ai/review-runner";
import { runPlatformAdapt } from "@/server/ai/platform-adapt-runner";
import { runMaterialMatch } from "@/server/ai/material-match-runner";
import { runPositioningGenerate } from "@/server/ai/positioning-runner";
import { runCopilotAssist } from "@/server/ai/copilot-runner";
import { createLlmCompleter } from "@/server/ai/llm/provider";
import { resolveLlmConfig } from "@/server/ai/llm/resolve";
import {
  createPositioningService,
  createPositioningTransport,
  createPositioningRepository,
  POSITIONING_OP_IDS,
  type CreatorProfileRow,
  type PositioningStatementRow,
} from "@creatoros/backend/modules/positioning";
import {
  createMonetizationService,
  createMonetizationTransport,
  createMonetizationRepository,
  MONETIZATION_OP_IDS,
  type ProductRow as MonetizationProductRow,
} from "@creatoros/backend/modules/monetization";
import {
  createCandidateService,
  createCandidateTransport,
  createCandidateRepository,
  CANDIDATE_OP_IDS,
  type CandidateRow,
} from "@creatoros/backend/modules/candidate";
import {
  createCalibrationService,
  createCalibrationTransport,
  createCalibrationRepository,
  CALIBRATION_OP_IDS,
  type RubricRow as CalibrationRubricRow,
  type RubricVersionRow as CalibrationRubricVersionRow,
  type PredictionRow as CalibrationPredictionRow,
  type CalibrationResultRow,
  type RuleSuggestionRow as CalibrationRuleSuggestionRow,
} from "@creatoros/backend/modules/calibration";
import {
  createPlatformAccountService,
  createPlatformAccountTransport,
  createPlatformAccountRepository,
  PLATFORM_ACCOUNT_OP_IDS,
  type PlatformAccountRow,
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
  createDashboardQueryService,
  createProjectOverviewQueryService,
  createGlobalSearchQueryService,
  createPublishingCenterQueryService,
  createQueryServicesTransport,
  QUERY_SERVICES_OP_IDS,
  type PublishingCenterQueryService,
} from "@creatoros/backend/modules/query-services";

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
  // Monetization (module 18, Wave 5+) — 七步⑦ 变现/漏斗中心. products.* /
  // products.offers.* / outputs.products.* / leads.* / leads.conversions.* /
  // monetization.funnel.*, all user-scoped. Price decoupled from Product (offer
  // append-only); funnel ALWAYS surfaces an honest unattributed bucket (§4.5, never
  // force-allocated). The conversion → §4.6 MetricValue fan-out + notify + index reach
  // peers via injected ports (no cross-module repo import).
  ...MONETIZATION_OP_IDS,
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

// The set of op ids owned by the learnings module's transport (module 14).
const LEARNINGS_OPS = new Set<string>(LEARNINGS_OP_IDS);

// The set of op ids owned by the ai module's transport (module 15).
const AI_OPS = new Set<string>(AI_OP_IDS);

// The set of op ids owned by the positioning module's transport (module 17).
const POSITIONING_OPS = new Set<string>(POSITIONING_OP_IDS);

// The set of op ids owned by the monetization module's transport (module 18).
const MONETIZATION_OPS = new Set<string>(MONETIZATION_OP_IDS);

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

// The shared canonical 变现加权 Rubric id seeded below (the calibration page + the 复盘飞轮回流
// 轨B Learning→校准 reflow both target it). Kept as one const so the seed + the reflow seam
// agree on the same key.
const CANONICAL_RUBRIC_ID = "rubric-canonical";

type CanonicalProject = (typeof canonicalDataset.projects)[number];

function toRow(p: CanonicalProject): ProjectRow {
  return {
    id: p.id,
    userId: p.userId,
    title: p.title,
    brief: p.brief ?? "",
    briefDetail: p.briefDetail ?? {},
    contentCategory: p.contentCategory ?? "",
    // 数据底座(SPEC §1.2):canonical fixture 项目均为手动(无 source/platformRef 字段)
    //   → 默认 manual + 空 platform_ref(行为不变)。
    source: (p as { source?: string }).source ?? "manual",
    platformRef: (p as { platformRef?: Record<string, unknown> }).platformRef ?? {},
    creationMode: p.creationMode,
    status: p.status,
    currentStage: p.currentStage,
    progressPct: p.progressPct,
    starred: p.starred,
    startedAt: p.startedAt,
    targetCompletedAt: p.targetCompletedAt ?? null,
    completedAt: p.completedAt ?? null,
    archivedAt: p.archivedAt ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// Mappers for the Wave-2 Projects child entities (stages/platforms/outputs/
// output-stages/tasks/activities). The canonical fixture shapes match the DB
// rows; `contentRole` is absent on the fixture outputs → default null.
type CanonicalStage = (typeof canonicalDataset.projectStages)[number];
type CanonicalPlatform = (typeof canonicalDataset.projectTargetPlatforms)[number];
type CanonicalOutput = (typeof canonicalDataset.contentOutputs)[number];
type CanonicalOutputStage = (typeof canonicalDataset.outputStages)[number];
type CanonicalTask = (typeof canonicalDataset.tasks)[number];
type CanonicalActivity = (typeof canonicalDataset.projectActivities)[number];

function toStageRow(s: CanonicalStage): StageRow {
  return {
    id: s.id,
    projectId: s.projectId,
    stage: s.stage,
    status: s.status,
    progressPct: s.progressPct,
    skipped: s.skipped,
    startedAt: s.startedAt ?? null,
    completedAt: s.completedAt ?? null,
    updatedAt: s.updatedAt,
  };
}

function toPlatformRow(p: CanonicalPlatform): TargetPlatformRow {
  return {
    id: p.id,
    projectId: p.projectId,
    platform: p.platform,
    priority: p.priority,
    planningNote: p.planningNote ?? "",
    createdAt: p.createdAt,
  };
}

function toOutputRow(o: CanonicalOutput): ContentOutputRow {
  return {
    id: o.id,
    projectId: o.projectId,
    title: o.title,
    contentType: o.contentType,
    format: o.format ?? "",
    aspectRatio: o.aspectRatio ?? "",
    targetDurationSeconds: o.targetDurationSeconds ?? 0,
    status: o.status,
    contentRole: (o as { contentRole?: string | null }).contentRole ?? null,
    primaryAssetId: o.primaryAssetId ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function toOutputStageRow(s: CanonicalOutputStage): OutputStageRow {
  return {
    id: s.id,
    contentOutputId: s.contentOutputId,
    stage: s.stage,
    status: s.status,
    progressPct: s.progressPct,
    skipped: s.skipped,
    startedAt: s.startedAt ?? null,
    completedAt: s.completedAt ?? null,
    updatedAt: s.updatedAt,
  };
}

function toTaskRow(t: CanonicalTask): TaskRow {
  return {
    id: t.id,
    projectId: t.projectId,
    contentOutputId: t.contentOutputId ?? null,
    stage: t.stage,
    title: t.title,
    description: t.description ?? "",
    status: t.status,
    priority: t.priority,
    dueAt: t.dueAt ?? null,
    completedAt: t.completedAt ?? null,
  };
}

function toActivityRow(a: CanonicalActivity): ActivityRow {
  return {
    id: a.id,
    projectId: a.projectId,
    eventType: a.eventType,
    entityType: a.entityType,
    entityId: a.entityId,
    eventData: a.eventData as Record<string, unknown>,
    occurredAt: a.occurredAt,
  };
}

type CanonicalNotification = (typeof canonicalDataset.notifications)[number];

function toNotificationRow(n: CanonicalNotification): NotificationRow {
  return {
    id: n.id,
    userId: n.userId,
    notificationType: n.notificationType,
    title: n.title,
    body: n.body,
    entityType: n.entityType,
    entityId: n.entityId,
    readAt: n.readAt ?? null,
    createdAt: n.createdAt,
  };
}

// Knowledge (module 06) canonical mappers. The fixture item/revision shapes match
// the DB rows (ISO text timestamps, jsonb metadata); the relation fixture carries
// a NUMERIC `strength` which the DB stores as a decimal string (the repo
// Number()-parses on read), so stringify here.
type CanonicalKnowledge = (typeof canonicalDataset.knowledgeItems)[number];
type CanonicalRevision = (typeof canonicalDataset.knowledgeRevisions)[number];
type CanonicalRelation = (typeof canonicalDataset.knowledgeRelations)[number];

function toKnowledgeRow(k: CanonicalKnowledge): KnowledgeItemRow {
  return {
    id: k.id,
    userId: k.userId,
    currentRevisionId: k.currentRevisionId,
    knowledgeType: k.knowledgeType,
    title: k.title,
    sourceType: k.sourceType,
    sourceUrl: k.sourceUrl ?? null,
    sourceMetadata: k.sourceMetadata as Record<string, unknown>,
    status: k.status,
    archivedAt: k.archivedAt ?? null,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  };
}

function toRevisionRow(r: CanonicalRevision): KnowledgeRevisionRow {
  return {
    id: r.id,
    knowledgeItemId: r.knowledgeItemId,
    revisionNumber: r.revisionNumber,
    content: r.content,
    structuredData: r.structuredData as Record<string, unknown>,
    createdAt: r.createdAt,
  };
}

function toRelationRow(r: CanonicalRelation): {
  id: string;
  sourceKnowledgeId: string;
  targetKnowledgeId: string;
  relationType: string;
  strength: string;
  createdByType: string;
} {
  return {
    id: r.id,
    sourceKnowledgeId: r.sourceKnowledgeId,
    targetKnowledgeId: r.targetKnowledgeId,
    relationType: r.relationType,
    strength: String(r.strength),
    createdByType: r.createdByType,
  };
}

// Assets (module 07) canonical mappers. The fixture asset/file shapes match the
// DB rows (ISO text timestamps, jsonb mediaMetadata); `description` defaults to
// "" and `deletedAt`/nullable dimensions pass through.
type CanonicalAsset = (typeof canonicalDataset.assets)[number];
type CanonicalAssetFile = (typeof canonicalDataset.assetFiles)[number];

function toAssetRow(a: CanonicalAsset): AssetRow {
  return {
    id: a.id,
    userId: a.userId,
    currentFileId: a.currentFileId ?? null,
    assetType: a.assetType,
    name: a.name,
    description: a.description ?? "",
    status: a.status,
    deletedAt: a.deletedAt ?? null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function toAssetFileRow(f: CanonicalAssetFile): AssetFileRow {
  return {
    id: f.id,
    assetId: f.assetId,
    versionNumber: f.versionNumber,
    storageKey: f.storageKey,
    mimeType: f.mimeType,
    fileSize: f.fileSize,
    checksum: f.checksum,
    width: f.width ?? null,
    height: f.height ?? null,
    durationMs: f.durationMs ?? null,
    mediaMetadata: f.mediaMetadata as Record<string, unknown>,
    createdAt: f.createdAt,
  };
}

// Artifacts (module 08) canonical mappers. The fixture artifact rows carry no
// `userId` (they hang off projects owned by the canonical user), so the owner is
// injected at seed time. Version rows match the DB shape (immutable, no updatedAt);
// relations match directly.
type CanonicalArtifact = (typeof canonicalDataset.artifacts)[number];
type CanonicalArtifactVersion = (typeof canonicalDataset.artifactVersions)[number];
type CanonicalArtifactRelation = (typeof canonicalDataset.artifactRelations)[number];

function toArtifactRow(a: CanonicalArtifact, userId: string): ArtifactRow {
  return {
    id: a.id,
    userId,
    projectId: a.projectId,
    contentOutputId: a.contentOutputId ?? null,
    currentVersionId: a.currentVersionId ?? null,
    stage: a.stage,
    artifactType: a.artifactType,
    title: a.title,
    status: a.status,
    archivedAt: a.archivedAt ?? null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function toArtifactVersionRow(
  v: CanonicalArtifactVersion,
): ArtifactVersionRow {
  return {
    id: v.id,
    artifactId: v.artifactId,
    versionNumber: v.versionNumber,
    contentText: v.contentText,
    contentData: v.contentData as Record<string, unknown>,
    changeSummary: v.changeSummary,
    createdByType: v.createdByType,
    aiTaskId: v.aiTaskId ?? null,
    createdAt: v.createdAt,
  };
}

function toArtifactRelationRow(
  r: CanonicalArtifactRelation,
): ArtifactRelationRow {
  return {
    id: r.id,
    sourceArtifactId: r.sourceArtifactId,
    targetArtifactId: r.targetArtifactId,
    relationType: r.relationType,
    createdAt: r.createdAt,
  };
}

type CanonicalPreference = (typeof canonicalDataset.userPreferences)[number];
type CanonicalModel = (typeof canonicalDataset.modelConfigurations)[number];
type CanonicalAgent = (typeof canonicalDataset.agentConfigurations)[number];

// USER_PREFERENCE is keyed by user_id (no own id column in the row); the canonical
// fixture carries a DTO `id` which the schema does not persist — drop it here.
function toPreferenceRow(p: CanonicalPreference): UserPreferenceRow {
  return {
    userId: p.userId,
    defaultHome: p.defaultHome,
    defaultCreationMode: p.defaultCreationMode,
    defaultVisibility: p.defaultVisibility,
    autosaveEnabled: p.autosaveEnabled,
    fileNamingRule: p.fileNamingRule,
    analyticsEnabled: p.analyticsEnabled,
  };
}

function toModelRow(m: CanonicalModel): ModelConfigurationRow {
  return {
    id: m.id,
    userId: m.userId,
    capability: m.capability,
    provider: m.provider,
    modelName: m.modelName,
    secretReference: m.secretReference,
    // The canonical fixture stores no inline key — it resolves via the env-ref
    // secretReference; secretValue (the cc-switch local-db key column) stays null.
    secretValue: null,
    // The canonical fixture predates the cc-switch baseUrl/apiFormat columns; default to
    // the official Anthropic endpoint so the seeded rows match the extended row type.
    baseUrl: null,
    apiFormat: "anthropic",
    settings: m.settings,
    isDefault: m.isDefault,
  };
}

function toAgentRow(a: CanonicalAgent): AgentConfigurationRow {
  return {
    id: a.id,
    userId: a.userId,
    name: a.name,
    agentType: a.agentType,
    status: a.status,
    capabilities: a.capabilities,
    settings: a.settings,
    secretReference: a.secretReference,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

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
  learnings: Transport;
  ai: Transport;
  positioning: Transport;
  monetization: Transport;
  candidate: Transport;
  calibration: Transport;
  platformAccount: Transport;
  contentCalendar: Transport;
  materialLinks: Transport;
  // Query services (module Q, Wave 4): the composite transport for the 3 page
  // reads, plus the Publishing Center composer (no endpoint — the FE calls it
  // server-side via getPublishingCenterService()).
  queryServices: Transport;
  publishingCenter: PublishingCenterQueryService;
  identity: IdentityService;
  // item B — exposed so the blob route (no dispatch endpoint) can resolve the
  // request user's media root, the same root uploads were minted against.
  settingsService: SettingsService;
}

const globalForPersistence = globalThis as unknown as {
  __creatorosPersistence?: Promise<PersistenceBundle>;
};

async function buildPersistence(): Promise<PersistenceBundle> {
  // Hybrid driver (P1): runtime with DATABASE_URL → real Postgres (persists across
  // restarts, applies versioned migrations via node-postgres migrator); without it
  // (vitest / no-DB env) → in-memory pglite. Both apply the SAME drizzle/0000_init
  // migration, so test and runtime schemas are identical.
  const { db } = process.env.DATABASE_URL
    ? await createRuntimeDb()
    : await createDb();

  // Deterministic clock/ids keep the seeded dataset reproducible (visual/test
  // parity); new creates get collision-free ids distinct from the slug seeds.
  // `createSeq` lives at build scope (NOT per-request) so ids stay stable across
  // the many per-ctx repos the factory mints below.
  // Real persistent DB (P1): the deterministic counter RESETS each process but rows
  // PERSIST, so generated ids + timestamps must be PROCESS-UNIQUE — otherwise runtime
  // creates (register user / login session / new project / activity…) collide on PK
  // across restarts (the `duplicate key … _pkey` bug). Seeds use explicit slug ids +
  // fixture timestamps, so seed idempotency is unaffected. Tests / pglite (no
  // DATABASE_URL) keep the fully-deterministic `p` base + FIXED_NOW for reproducibility.
  const persistent = Boolean(process.env.DATABASE_URL);
  const idBase = persistent ? globalThis.crypto.randomUUID().slice(0, 8) : "p";
  let createSeq = 0;
  const deps = {
    now: persistent ? () => new Date().toISOString() : () => FIXED_NOW_ISO,
    nextId: (prefix: string) => `${prefix}-${idBase}-${++createSeq}`,
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
  const projects = createProjectsTransport(() => ({
    service: projectsService,
    repo: projectsRepo,
  }));

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
    (ctx) => createSearchRepository(db, { ...deps, userId: ctx.userId }),
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
  const knowledge = createKnowledgeTransport(() => knowledgeService);

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

  const assetsService = createAssetsService(assetsRepo, objectStorageForCtx, deps);
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
    searchIndex: (ctx, input) =>
      searchService.upsertDocument(ctx, input),
    assertCoverOwned: (ctx, id) => assetsService.getAsset(ctx, id),
    // Project→ContentOutput-ids resolver — drives Analytics' project metric read
    // (publishing.listPublicationIdsByProject → analytics.projects.get) without an
    // Analytics cross-module join. The project-ownership gate lives in Projects.
    listOutputIdsByProject: (ctx, projectId) =>
      projectsService.listOutputIdsByProject(ctx, projectId),
  });
  const publishing = createPublishingTransport(() => publishingService);

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
    // authDir 走 env 配置,默认落项目内 .auth/douyin(cookie 只在本机,不入 Git)。测试经各自
    // 的 createIngestionService 注入 fake,不连真浏览器。
    douyinFetch: {
      fetch: (opts) =>
        fetchDouyinMetrics({
          capturedAt: opts.capturedAt,
          authDir:
            process.env.CREATOROS_DOUYIN_AUTH_DIR ??
            nodePath.join(process.cwd(), ".auth", "douyin"),
        }),
      login: () =>
        loginDouyin({
          authDir:
            process.env.CREATOROS_DOUYIN_AUTH_DIR ??
            nodePath.join(process.cwd(), ".auth", "douyin"),
        }),
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
        // creator's KnowledgeItems feed the agent's context so选题 has 素材依据. Maps the
        // KnowledgeItem row onto the runner's {title, knowledgeType} shape.
        const knowledgeReader = {
          list: async (c: RequestContext, opts: { limit?: number }) =>
            (await knowledgeService.listKnowledge(c))
              .slice(0, opts.limit ?? 40)
              .map((k) => ({ title: k.title, knowledgeType: k.knowledgeType })),
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
              // Vercel AI SDK 路径(弃 Claude Agent SDK):素材搜集节点跑在 ai-worker +
              // 外置模板 + anthropic 内置 web search。
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
              llm: llmCompleter,
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
              // Vercel AI SDK 路径(弃 LlmCompleter):复盘节点跑在 ai-worker + 外置模板。
              resolveModelSpec,
            },
          );
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
              llm: llmCompleter,
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
              llm: llmCompleter,
            },
          );
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

  // Monetization (module 18, Wave 5+): the service builds a per-ctx user-scoped repo
  // over the shared db (the repo bakes userId in; the service mints one per request).
  // The transport returns this ONE shared service. It reaches peer modules ONLY through
  // injected narrow ports (no cross-module repo import, SPEC §22), satisfied here by
  // the peers' public services / the shared projects repo (the composition root, not
  // the module, owns these adapters):
  //   - projects.assertOutputOwned → projectsRepo.getOutput (output-ownership gate;
  //     a cross-user / unknown outputId throws OwnershipError → 404 before any link /
  //     lead row references it),
  //   - ingestion.assertRunExists → ingestionService.getRun (RISK-005 — the run must
  //     be a REAL IngestionRun; cross-user / unknown → OwnershipError),
  //   - analytics.recordConversionMetric → BEST-EFFORT no-op this wave: Analytics has
  //     not yet shipped the §4.6 conversion metric_key write (OQ3). The seam exists so
  //     the fan-out lands in ONE place the moment Analytics exposes it; swallow until
  //     then (the ConversionEvent is the source of truth either way),
  //   - search.indexProduct → searchService.upsertDocument (best-effort post-commit),
  //   - notifications.notifyConversion → BEST-EFFORT no-op this wave: Notifications
  //     exposes no public notify-write yet; the seam is wired for when it lands.
  // Clock/ids share the deterministic `deps` (createSeq keeps product/offer/lead/
  // conversion/cop ids collision-free across requests).
  const monetizationService = createMonetizationService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    projects: {
      assertOutputOwned: async (ctx, outputId) => {
        // getOutput joins output→project and gates ownership (→ OwnershipError → 404).
        await projectsRepo.getOutput(ctx, outputId);
      },
    },
    ingestion: {
      assertRunExists: async (ctx, runId) => {
        // getRun is the ownership-gated IngestionRun read (cross-user / unknown →
        // OwnershipError). RISK-005: reject 悬空 ingestionRunId before any survey
        // Lead/ConversionEvent references it.
        await ingestionService.getRun(ctx, runId);
      },
    },
    analytics: {
      // §4.6 conversion metric_key write not yet on the Analytics public surface
      // (OQ3) — swallow until it lands; the ConversionEvent remains the source of
      // truth, so this is non-destructive (best-effort fan-out, SPEC §11).
      recordConversionMetric: async () => {},
    },
    search: {
      indexProduct: async (ctx, product) => {
        // Best-effort post-commit index (SPEC §11) — a failure must not roll back the
        // product write, so swallow.
        try {
          await searchService.upsertDocument(ctx, {
            entityType: "product",
            entityId: product.id,
            title: product.name,
            body: `${product.kind} ${product.targetPersona ?? ""}`.trim(),
          });
        } catch {
          // intentionally swallowed — search index is best-effort.
        }
      },
    },
    notifications: {
      // No public notify-write on the Notifications surface this wave — best-effort
      // no-op seam (wired when Notifications exposes notify).
      notifyConversion: async () => {},
    },
  });
  const monetization = createMonetizationTransport(() => monetizationService);

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
        // content_outputs — iterate the user's projects, then each project's outputs.
        const projectRows = await projectsRepo.list(ctx);
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
        const pubs = await publishingService.getRecentPublicationsWithTitle(ctx, {
          limit: 100,
          offset: 0,
        });
        for (const p of pubs) {
          subjects.push({
            subjectType: "publication",
            subjectId: p.id,
            title: p.title || `${p.platform} 发布`,
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
        const rows = await publishingService.getRecentPublicationsWithTitle(ctx, {
          limit: 5,
        });
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
              views = numOf(raw, "plays");
              engagement =
                numOf(raw, "likes") +
                numOf(raw, "comments") +
                numOf(raw, "shares");
            } catch {
              // A single publication's analytics read failing degrades to 0 —
              // never crashes the whole dashboard composition.
            }
            return {
              id: r.id,
              title: r.title || "未命名发布",
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
        const r = await analyticsService.getDashboardRollup(ctx);
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
        const metrics: MetricCard[] = [
          card("d-views", "总播放量", fmt(r.plays)),
          card("d-likes", "总点赞", fmt(r.likes)),
          card("d-followers", "新增粉丝", fmt(r.followerGain)),
          { ...card("d-finish", "平均完播率", `${r.finishAvg.toFixed(1)}%`), tone: "info" },
          card("d-shares", "总分享", fmt(r.shares)),
        ];
        // 本周趋势:真实累计播放按固定周形状分摊(series 总和 == 真实播放),与复盘
        // 趋势同法、诚实标注为形状分摊而非逐日真值。
        const WEIGHTS = [0.097, 0.116, 0.104, 0.144, 0.164, 0.156, 0.219];
        const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
        const trend = days.map((label, i) => ({
          label,
          value: Math.round(r.plays * WEIGHTS[i]),
        }));
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
      // 选题策划阶段的候选即"在追的热门方向";heat 用 predictedScore(0–1→0–100),
      // 无分用排名兜底。读失败降级为空集,不崩面板。
      getTrendingTopics: async (ctx) => {
        try {
          const { rows } = await candidateService.listCandidates(ctx, {
            sort: "predictedScore",
            limit: 5,
            offset: 0,
          });
          return rows.map((c, i) => ({
            id: c.id,
            title: c.title,
            heat:
              typeof c.predictedScore === "number" && c.predictedScore > 0
                ? Math.round(c.predictedScore * 100)
                : 50 - i * 5,
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

  // Seed one canonical mock external source owned by the canonical user so a dev
  // import resolves under the seeded login (foundation §2/§4). seedExternalSources
  // is onConflictDoNothing → a re-built singleton never double-seeds.
  await createIngestionRepository(db, {
    ...deps,
    userId: canonicalDataset.user.id,
  }).seedExternalSources([
    {
      id: "src-mock-canonical",
      userId: canonicalDataset.user.id,
      sourceType: "mock",
      name: "Mock Ingestion Source",
      sourceIdentifier: "mock://canonical",
      secretReference: "",
      configuration: {},
      createdAt: FIXED_NOW_ISO,
    },
    {
      // 线 B:抖音真抓来源。refreshDouyin 据此校验来源类型=douyin;真抓走 CDP 连
      // 用户已登录 Chrome,此处不存任何 cookie/凭据。
      id: "src-douyin-canonical",
      userId: canonicalDataset.user.id,
      sourceType: "douyin",
      name: "抖音创作者中心",
      sourceIdentifier: "douyin://creator",
      secretReference: "",
      configuration: {},
      createdAt: FIXED_NOW_ISO,
    },
  ]);

  // Seed the Projects exemplar dataset (owned by the canonical user) AND the
  // canonical identity row, so real login resolves to `user-zyongzhu` and every
  // fixture-backed page + the Projects seed keep resolving under a real ctx
  // (foundation §2). seedCanonicalUser is idempotent (onConflictDoNothing), so a
  // re-built singleton never double-seeds. IDENTITY_DDL was applied in createDb().
  const identityRepo = createIdentityRepository(db, deps);
  // Seed the full Projects graph (projects + stages + platforms + outputs +
  // output-stages + tasks + activities), all owned by the canonical user. seed*
  // are onConflictDoNothing → a re-built singleton never double-seeds.
  await projectsRepo.seedProjects(canonicalDataset.projects.map(toRow));
  await projectsRepo.seedStages(canonicalDataset.projectStages.map(toStageRow));
  await projectsRepo.seedPlatforms(
    canonicalDataset.projectTargetPlatforms.map(toPlatformRow),
  );
  await projectsRepo.seedOutputs(
    canonicalDataset.contentOutputs.map(toOutputRow),
  );
  await projectsRepo.seedOutputStages(
    canonicalDataset.outputStages.map(toOutputStageRow),
  );
  await projectsRepo.seedTasks(canonicalDataset.tasks.map(toTaskRow));
  await projectsRepo.seedActivities(
    canonicalDataset.projectActivities.map(toActivityRow),
  );
  await seedCanonicalUser(identityRepo, deps);

  // Seed the canonical notifications ledger (notif-1 unread, notif-2 read), owned
  // by the seeded login so the Shell bell resolves under a real ctx (foundation
  // §2). seed() is onConflictDoNothing → a re-built singleton never double-seeds.
  await notificationsRepo.seed(
    canonicalDataset.notifications.map(toNotificationRow),
  );

  // Seed the canonical knowledge graph (items + revisions + relations), all owned
  // by the canonical user, so the /knowledge page + Research workspace resolve the
  // real rows under the seeded login (foundation §2). seed* are onConflictDoNothing
  // → a re-built singleton never double-seeds.
  await knowledgeRepo.seedKnowledge(
    canonicalDataset.knowledgeItems.map(toKnowledgeRow),
  );
  await knowledgeRepo.seedRevisions(
    canonicalDataset.knowledgeRevisions.map(toRevisionRow),
  );
  await knowledgeRepo.seedRelations(
    canonicalDataset.knowledgeRelations.map(toRelationRow),
  );

  // Seed the canonical assets graph (assets + their files), all owned by the
  // canonical user, so the /assets gallery resolves the real rows under the
  // seeded login (foundation §2). seed* are onConflictDoNothing → a re-built
  // singleton never double-seeds. Files are seeded first so currentFileId
  // references resolve.
  await assetsRepo.seedAssetFiles(
    canonicalDataset.assetFiles.map(toAssetFileRow),
  );
  await assetsRepo.seedAssets(canonicalDataset.assets.map(toAssetRow));

  // Seed the canonical artifacts graph (artifacts + their versions + relations),
  // all owned by the canonical user, so the Script/Planning workspaces resolve the
  // real rows under the seeded login (foundation §2). The fixture artifact rows
  // carry no userId — inject the canonical owner here. Versions are seeded before
  // artifacts so currentVersionId references resolve. seed* are onConflictDoNothing
  // → a re-built singleton never double-seeds. A user-scoped seed repo is minted
  // for the canonical owner.
  const artifactsSeedRepo = createArtifactRepository(db, {
    ...deps,
    userId: canonicalDataset.user.id,
  });
  await artifactsSeedRepo.seedVersions(
    canonicalDataset.artifactVersions.map(toArtifactVersionRow),
  );
  await artifactsSeedRepo.seedArtifacts(
    canonicalDataset.artifacts.map((a) =>
      toArtifactRow(a, canonicalDataset.user.id),
    ),
  );
  await artifactsSeedRepo.seedRelations(
    canonicalDataset.artifactRelations.map(toArtifactRelationRow),
  );

  // Seed the canonical user's search index (module 02, Wave-1 seed approach —
  // plan open-question #4): derive SearchDocuments from the owned projects /
  // knowledge / assets / publications so `/search` returns results before the
  // Wave-2 producer wiring lands. seedDocuments is onConflictDoNothing → a
  // re-built singleton never double-seeds. Owned by the canonical user.
  await createSearchRepository(db, {
    ...deps,
    userId: canonicalDataset.user.id,
  }).seedDocuments(buildCanonicalSearchDocuments(canonicalDataset, FIXED_NOW_ISO));

  // Seed the canonical analytics graph (metric snapshots + values + retention +
  // audience), all owned by the canonical user, so the Analytics & Review page
  // resolves real metric rows under the seeded login (foundation §2). The fixture
  // rows carry no userId — inject the canonical owner here. seed* are
  // onConflictDoNothing → a re-built singleton never double-seeds. Publications
  // (parents of the snapshots) are NOT seeded into the DB this wave (Publishing's
  // canonical seed is empty), so analytics.projects.get resolves an empty
  // publication-id set for live projects; the seeded snapshots are reachable via
  // analytics.publications.get for the fixture publication ids.
  const canonicalOwner = canonicalDataset.user.id;
  await analyticsRepo.seedSnapshots(
    canonicalDataset.metricSnapshots.map((s) => ({
      id: s.id,
      userId: canonicalOwner,
      publicationId: s.publicationId,
      ingestionRunId: s.ingestionRunId ?? null,
      capturedAt: s.capturedAt,
      source: s.source,
      rawMetrics: s.rawMetrics as Record<string, unknown>,
      createdAt: s.createdAt,
    })),
  );
  await analyticsRepo.seedValues(
    canonicalDataset.metricValues.map((v) => ({
      id: v.id,
      userId: canonicalOwner,
      metricSnapshotId: v.metricSnapshotId,
      metricKey: v.metricKey,
      numericValue: v.numericValue,
      unit: v.unit,
      dimensions: v.dimensions as Record<string, string>,
    })),
  );
  await analyticsRepo.seedRetentionPoints(
    canonicalDataset.retentionPoints.map((r) => ({
      id: r.id,
      userId: canonicalOwner,
      publicationId: r.publicationId,
      capturedAt: r.capturedAt,
      positionMs: r.positionMs,
      retentionRate: r.retentionRate,
      viewerCount: r.viewerCount,
    })),
  );
  await analyticsRepo.seedAudienceSnapshots(
    canonicalDataset.audienceSnapshots.map((a) => ({
      id: a.id,
      userId: canonicalOwner,
      publicationId: a.publicationId,
      capturedAt: a.capturedAt,
      dimensionType: a.dimensionType,
      dimensionValue: a.dimensionValue,
      percentage: a.percentage,
      audienceCount: a.audienceCount,
    })),
  );

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

  // Seed the canonical user's Settings rows (plan Step 6 seed parity) so the
  // /settings page resolves the real preference/model/agent rows under the seeded
  // login. seed* is onConflictDoNothing → a re-built singleton never double-seeds.
  // PK conflict targets: user_preferences(user_id), model_configurations(id),
  // agent_configurations(id) — the canonical ids are stable/deterministic.
  await settingsRepo.seedPreferences(
    canonicalDataset.userPreferences.map(toPreferenceRow),
  );
  await settingsRepo.seedModels(
    canonicalDataset.modelConfigurations.map(toModelRow),
  );
  await settingsRepo.seedAgents(
    canonicalDataset.agentConfigurations.map(toAgentRow),
  );

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
  });
  await aiSeedRepo.seedModelConfigs(
    buildAiModelConfigs(canonicalDataset.user.id, FIXED_NOW_ISO),
  );
  await aiSeedRepo.seedAgentConfigs(
    buildAiAgentConfigs(canonicalDataset.user.id, FIXED_NOW_ISO),
  );

  // Seed the canonical positioning (module 17): one CreatorProfile + two immutable
  // statement versions (v1→v2 append-only chain), owned by the canonical user, so
  // the /positioning 定位中心 page resolves real rows under the seeded login
  // (foundation §2). Deterministic ids/clock (FIXED_NOW_ISO). seed* are
  // onConflictDoNothing → a re-built singleton never double-seeds. A user-scoped
  // seed repo is minted for the canonical owner.
  const positioningSeedRepo = createPositioningRepository(db, {
    ...deps,
    userId: canonicalDataset.user.id,
  });
  const canonicalProfile: CreatorProfileRow = {
    id: "profile-canonical",
    userId: canonicalDataset.user.id,
    persona: "把前沿 AI 论文工程化的硬核创作者",
    field: "AI 工程 / 应用落地",
    audience: "想把 AI 用起来的一线开发者",
    differentiation: "每条内容都给出可运行的代码与踩坑记录",
    capabilities: ["论文拆解", "代码演示", "工程化复盘"],
    // 定位中心重建 — the richer facets (英雄区 9 格) + 5 downstream rules (右栏规则卡),
    // real on-brand values for the canonical creator (NOT placeholders).
    facets: {
      contentScope: "前沿 AI 论文精读、把模型/算法落成可跑的工程代码、Agent 与 RAG 实战",
      avoid: "纯理论推导、不写无法复现的演示、不追与开发者无关的泛 AI 热点",
      corePain: "看得懂论文却落不了地：环境、依赖、踩坑让 idea 卡在 demo",
      coreValue: "把论文里的 idea 变成一线开发者今天就能 clone 跑通的工程代码",
      tone: "硬核、克制、工程师口吻——少形容词,多结论与代码",
      statusNote: "稳定更新中,正从单条论文精读扩展到成体系的工程化专栏",
    },
    downstreamRules: {
      topicRule: "只做能产出可运行代码或踩坑结论的选题;纯概念科普不立项",
      scriptRule: "开头 15 秒抛出可复现的结果钩子;正文按「问题→论文方案→工程落地→踩坑」展开",
      projectRule: "每个项目必须绑定一个可演示的代码产物;无 demo 不进入制作",
      forbidRule: "不夸大效果、不贴无法运行的截图、不引用未读过的论文",
      expressionRule: "统一工程师口吻:第一人称、给结论、给代码,不用营销腔与情绪词",
    },
    createdAt: FIXED_NOW_ISO,
    updatedAt: FIXED_NOW_ISO,
  };
  const canonicalStatements: PositioningStatementRow[] = [
    {
      id: "posstmt-canonical-1",
      userId: canonicalDataset.user.id,
      profileId: canonicalProfile.id,
      oneLiner: "我帮一线开发者把最新 AI 论文变成可运行的工程代码",
      keywords: ["论文", "代码", "工程化"],
      productAnchorIds: [],
      versionNumber: 1,
      createdByType: "human",
      aiTaskId: null,
      createdAt: FIXED_NOW_ISO,
    },
    {
      id: "posstmt-canonical-2",
      userId: canonicalDataset.user.id,
      profileId: canonicalProfile.id,
      oneLiner: "我帮一线开发者把最新 AI 论文变成生产级、可复用的工程代码",
      keywords: ["论文", "生产级", "工程化"],
      productAnchorIds: [],
      versionNumber: 2,
      createdByType: "human",
      aiTaskId: null,
      createdAt: FIXED_NOW_ISO,
    },
  ];
  await positioningSeedRepo.seedProfiles([canonicalProfile]);
  await positioningSeedRepo.seedStatements(canonicalStatements);

  // Seed the canonical monetization products (module 18): two 柔性产品 owned by the
  // canonical user so the /monetization 变现中心 page resolves real product rows under
  // the seeded login (foundation §2). The funnel + leads start empty (honest漏损 — the
  // unattributed bucket is 0/0 until登记/ingest). seedProducts is onConflictDoNothing
  // → a re-built singleton never double-seeds. A user-scoped seed repo is minted.
  const monetizationSeedRepo = createMonetizationRepository(db, {
    ...deps,
    userId: canonicalDataset.user.id,
  });
  const canonicalProducts: MonetizationProductRow[] = [
    {
      id: "product-canonical-1",
      userId: canonicalDataset.user.id,
      name: "AI 工程训练营",
      kind: "训练营",
      tier: "核心",
      deliveryWeight: "重",
      targetPersona: "想系统落地 AI 的一线开发者",
      status: "active",
      createdAt: FIXED_NOW_ISO,
      updatedAt: FIXED_NOW_ISO,
    },
    {
      id: "product-canonical-2",
      userId: canonicalDataset.user.id,
      name: "论文精读陪跑（1v1）",
      kind: "咨询",
      tier: "高端",
      deliveryWeight: "重",
      targetPersona: "需要深度指导的研究者",
      status: "active",
      createdAt: FIXED_NOW_ISO,
      updatedAt: FIXED_NOW_ISO,
    },
  ];
  await monetizationSeedRepo.seedProducts(canonicalProducts);

  // Seed the canonical candidates (module 19): three 选题候选 owned by the canonical
  // user so the /topics 选题候选池 page resolves real rows under the seeded login
  // (foundation §2) — one idea, one trend (AI-sourced provenance), one demand, with
  // varied predicted/positioning/demand scores so the monetization-weighted sort is
  // observable. Deterministic ids/clock (FIXED_NOW_ISO). seedCandidates is
  // onConflictDoNothing → a re-built singleton never double-seeds.
  const candidateSeedRepo = createCandidateRepository(db, {
    ...deps,
    userId: canonicalDataset.user.id,
  });
  const canonicalCandidates: CandidateRow[] = [
    {
      id: "cand-canonical-1",
      userId: canonicalDataset.user.id,
      title: "用 RAG 把内部文档变成问答助手",
      angle: "从一篇论文到一条可跑的最小实现",
      source: "trend",
      contentRole: "traffic",
      productAnchorId: null,
      positioningFit: 82,
      predictedScore: 74,
      demandCount: 0,
      status: "pool",
      aiTaskId: null,
      // 已补全的选题卡(待补充/待决策)— AI 工程化创作者口吻,非占位。
      card: {
        oneLiner: "不调 API、不写框架,30 行代码把你公司的文档变成能问答的助手",
        targetAudience: "想落地 AI 但被「框架太重」劝退的中小团队技术负责人",
        audiencePain:
          "看了一堆 LangChain 教程,真要接自己文档时全是版本报错,搭一周搭不出能用的",
        coreConflict: "大家以为 RAG 很高大上,其实核心就是「切片+向量检索+塞进 prompt」三步",
        hook: "你司那份没人看的 200 页 SOP,今天我让它自己开口回答问题",
        contentStructure: [
          "开场:演示——对着内部文档直接提问,秒回带出处的答案",
          "拆解:RAG 三步走(切片 / 嵌入检索 / 拼进 prompt),每步一句话讲透",
          "实操:30 行最小实现,边写边解释为什么不需要框架",
          "收尾:这套能扩到客服/法务/培训,留个「评论区报你的场景」钩子",
        ],
        format: "口播 + 屏幕录制代码演示,8-10 分钟",
        materialBasis: "自己之前给客户做的内部知识库项目截图 + 一份可脱敏的 SOP 样例",
        riskNote: "演示要避开真实公司数据;代码别用付费 API,否则观众复现门槛高",
        proposal: "做——蹭 RAG 热度但落到「最小实现」,既引流又给训练营铺信任,优先级高",
        audiencePainScore: 78,
        materialScore: 70,
        productionDifficulty: "mid",
      },
      createdAt: FIXED_NOW_ISO,
      updatedAt: FIXED_NOW_ISO,
    },
    {
      id: "cand-canonical-2",
      userId: canonicalDataset.user.id,
      title: "为什么你的 Agent 总是跑偏",
      angle: "三个最常见的上下文工程错误",
      source: "demand",
      contentRole: "trust",
      productAnchorId: null,
      positioningFit: 68,
      predictedScore: 61,
      demandCount: 0,
      status: "pool",
      aiTaskId: null,
      // 已补全的选题卡——来自评论区反复出现的真实需求(source=demand)。
      card: {
        oneLiner: "Agent 不是不够聪明,是你把上下文喂错了——三个错误今天讲清楚",
        targetAudience: "自己搭过 Agent、但效果时好时坏、说不清问题在哪的开发者",
        audiencePain:
          "同样的 prompt,昨天好好的今天就胡说;以为是模型问题,其实是上下文管理",
        coreConflict: "大家拼命换更强的模型,真正的杠杆却在「给模型看什么、不看什么」",
        hook: "你的 Agent 跑偏,90% 不是模型笨,是这三个上下文错误你天天在犯",
        contentStructure: [
          "错误一:把全部历史塞进去——噪声淹没指令",
          "错误二:工具返回值不裁剪——一次检索撑爆窗口",
          "错误三:没有显式的当前目标——模型自己脑补任务",
          "每个错误配「错误写法 vs 修正写法」对照,最后给一张自查清单",
        ],
        format: "口播为主 + 关键处贴代码对照图,6-8 分钟",
        materialBasis: "评论区和私信里攒的真实提问截图 + 自己踩坑的 prompt 前后对比",
        riskNote: "三个错误要给得具体可复现,泛泛而谈会被评论区质疑「正确的废话」",
        proposal: "做——直接回应受众真实提问,信任向内容,顺带为训练营「上下文工程」模块预热",
        audiencePainScore: 85,
        materialScore: 64,
        productionDifficulty: "low",
      },
      createdAt: FIXED_NOW_ISO,
      updatedAt: FIXED_NOW_ISO,
    },
    {
      id: "cand-canonical-3",
      userId: canonicalDataset.user.id,
      title: "我的 AI 工程化训练营到底教什么",
      angle: "一条转化向内容，锚定咨询产品",
      source: "idea",
      contentRole: "conversion",
      productAnchorId: null,
      // 待评估 — 空选题卡(无 oneLiner),让漏斗里「待评估」与前两条「待补充」都有真数据。
      card: {},
      positioningFit: 90,
      predictedScore: 88,
      demandCount: 0,
      status: "pool",
      aiTaskId: null,
      createdAt: FIXED_NOW_ISO,
      updatedAt: FIXED_NOW_ISO,
    },
  ];
  await candidateSeedRepo.seedCandidates(canonicalCandidates);

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
  });
  const canonicalRubricVersion: CalibrationRubricVersionRow = {
    id: "rubricver-canonical-1",
    userId: canonicalDataset.user.id,
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
  const canonicalPredictions: CalibrationPredictionRow[] = [
    {
      id: "pred-canonical-1",
      userId: calUser,
      subjectType: "content_output",
      subjectId: "dy-out-00", // 「AI 产出差不是工具的锅」
      rubricVersionId: calRubricVer,
      predictedConversion: predDimensions([
        ["hook", 4, "反直觉断言「不是工具的锅」前3秒能抓人", "把锅甩给谁说得更具体"],
        ["emotion", 4, "戳中「我也产出差」的自我识别", "加一句更扎心的共鸣"],
        ["product_path", 3, "隐约指向方法论但没落到产品", "结尾接一个可下一步的钩子"],
        ["social", 3, "AI 焦虑是公共话题但角度不新", "命名一个没人说破的结构性原因"],
        ["cta", 2, "几乎没有明确 CTA", "结尾加一句自然的行动召唤"],
        ["quotable", 4, "「不是工具的锅」本身就是金句", "中段再埋一句可截图的"],
      ]),
      predictedMetrics: predMetrics(
        [68, 22, 8, 30],
        "传播力强但转化弱：钩子和金句到位，缺 CTA 与产品落点",
        ["几乎无 CTA", "产品铺路不足"],
        ["结尾补一句行动召唤", "中段埋一个产品价值锚"],
      ),
      predictedScore: "0",
      confidence: "high",
      status: "locked",
      lockedAt: FIXED_NOW_ISO,
      createdAt: FIXED_NOW_ISO,
    },
    {
      id: "pred-canonical-2",
      userId: calUser,
      subjectType: "content_output",
      subjectId: "dy-out-01", // 「装了5个AI工具还是不会用？四步跑通你的第一条工作流」
      rubricVersionId: calRubricVer,
      predictedConversion: predDimensions([
        ["hook", 5, "「装了5个还是不会用」精准戳痛点", "保持"],
        ["emotion", 3, "共鸣一般，偏功能", "加一个具体翻车场景"],
        ["product_path", 4, "四步工作流天然为产品/课程铺路", "把第四步和产品更紧绑定"],
        ["social", 2, "纯个人效率话题", "可不强求社会共振"],
        ["cta", 4, "四步结构自带行动指引", "结尾再明确一句"],
        ["quotable", 3, "「四步跑通第一条工作流」可记", "提炼一句更狠的"],
      ]),
      predictedMetrics: predMetrics(
        [72, 35, 10, 48],
        "转化型选题：痛点+方法论+产品路径齐全，预期收藏高",
        ["社会共振弱（可接受）"],
        ["第四步与产品强绑定"],
      ),
      predictedScore: "0",
      confidence: "med",
      status: "locked",
      lockedAt: FIXED_NOW_ISO,
      createdAt: FIXED_NOW_ISO,
    },
    {
      id: "pred-canonical-3",
      userId: calUser,
      subjectType: "content_output",
      subjectId: "dy-out-03", // 「开源我的 Agent-native 知识操作系统」
      rubricVersionId: calRubricVer,
      predictedConversion: predDimensions([
        ["hook", 3, "「开源我的…」对泛人群钩子一般", "前3秒加一个反差或数字"],
        ["emotion", 2, "偏展示，情感弱", "加入做这件事的个人动机"],
        ["product_path", 5, "开源项目本身就是最强信任锚", "保持"],
        ["social", 4, "Agent-native 是当下结构性议题", "点明它改变了什么"],
        ["cta", 3, "可引导去看仓库但不够明确", "结尾直给一句「去主页拿」"],
        ["quotable", 2, "缺独立可传播的金句", "提炼一句关于知识操作系统的断言"],
      ]),
      predictedMetrics: predMetrics(
        [55, 18, 6, 25],
        "信任型内容：产品铺路极强但钩子/情感偏弱，泛流量有限",
        ["钩子弱", "缺金句", "情感共鸣不足"],
        ["前3秒加反差", "提炼一句金句", "补个人动机"],
      ),
      predictedScore: "0",
      confidence: "med",
      status: "locked",
      lockedAt: FIXED_NOW_ISO,
      createdAt: FIXED_NOW_ISO,
    },
  ];
  // 2 calibration_results — 真实维度子分 (actualMetrics keyed by dimension key) + 服务端口径
  // 的 deviation (actual - predicted)。pred-canonical-1 偏差小（预测准），pred-canonical-3
  // 偏差大（钩子实际更差），让 KPI 档位 + 回流对照 + latestFinding 有真信号。
  const canonicalResults: CalibrationResultRow[] = [
    {
      id: "calibres-canonical-1",
      userId: calUser,
      predictionId: "pred-canonical-1",
      ingestionRunId: "seed-run-calibration-1",
      actualMetrics: { hook: 4, emotion: 4, product_path: 3, social: 2, cta: 2, quotable: 5 },
      deviation: { hook: 0, emotion: 0, product_path: 0, social: -1, cta: 0, quotable: 1 },
      createdAt: FIXED_NOW_ISO,
    },
    {
      id: "calibres-canonical-3",
      userId: calUser,
      predictionId: "pred-canonical-3",
      ingestionRunId: "seed-run-calibration-3",
      actualMetrics: { hook: 1, emotion: 2, product_path: 5, social: 4, cta: 2, quotable: 2 },
      deviation: { hook: -2, emotion: 0, product_path: 0, social: 0, cta: -1, quotable: 0 },
      createdAt: FIXED_NOW_ISO,
    },
  ];
  await calibrationSeedRepo.seedPredictions(canonicalPredictions);
  await calibrationSeedRepo.seedResults(canonicalResults);

  // Seed two canonical platform accounts (module 21): a douyin + a bilibili 矩阵号 owned
  // by the canonical user so the 账号管理 surface resolves real rows under the seeded
  // login (foundation §2). secretReference is an opaque env reference (§7.1 — never a raw
  // token). Deterministic ids/clock (FIXED_NOW_ISO). seedAccounts is onConflictDoNothing
  // → a re-built singleton never double-seeds. A user-scoped seed repo is minted.
  const platformAccountSeedRepo = createPlatformAccountRepository(db, {
    ...deps,
    userId: canonicalDataset.user.id,
  });
  const canonicalAccounts: PlatformAccountRow[] = [
    {
      id: "acct-canonical-douyin",
      userId: canonicalDataset.user.id,
      platform: "douyin",
      accountHandle: "@抖音创作者",
      secretReference: "env:DOUYIN_TOKEN_REF",
      // Real follower total from ~/.hermes/douyin_stats.db (2026-06-21 snapshot).
      followerBaseline: DOUYIN_FAN_TOTAL,
      status: "active",
      createdAt: FIXED_NOW_ISO,
      updatedAt: FIXED_NOW_ISO,
    },
    {
      id: "acct-canonical-bilibili",
      userId: canonicalDataset.user.id,
      platform: "bilibili",
      accountHandle: "@AI工程实录",
      secretReference: null,
      followerBaseline: 8400,
      status: "active",
      createdAt: FIXED_NOW_ISO,
      updatedAt: FIXED_NOW_ISO,
    },
  ];
  await platformAccountSeedRepo.seedAccounts(canonicalAccounts);

  // Publishing (module 10) + Learnings (module 14) — seed the canonical rows into the
  // persisted store so the 发布中心 / 经验沉淀 surfaces' action ops (publications.transition
  // 「批量下架」, learnings.applications.create「应用经验」) resolve real, owned rows. Without
  // this the pages render fixtures whose ids have no persisted row → the write op throws
  // OwnershipError (404) on click. Ids match the fixtures (canonicalDataset), so a
  // displayed row's id always finds its persisted twin. seed* is onConflictDoNothing
  // (idempotent across a re-built singleton). User-scoped seed repos are minted.
  const publishingSeedRepo = createPublishingRepository(db, {
    ...deps,
    userId: canonicalDataset.user.id,
  });
  const canonicalPublications: PublicationRow[] = canonicalDataset.publications.map(
    (pub) => ({ ...pub, userId: canonicalDataset.user.id }),
  );
  await publishingSeedRepo.seedPublications(canonicalPublications);

  const learningsSeedRepo = createLearningsRepository(db, {
    ...deps,
    userId: canonicalDataset.user.id,
  });
  await learningsSeedRepo.seedLearnings(
    canonicalDataset.learnings as unknown as LearningRow[],
  );

  // 复盘飞轮回流 轨B (Learning→校准) — seed ONE canonical pending CalibrationRuleSuggestion so
  // the 校准中心「复盘回流建议」surface shows a real adoptable row out of the box (it ties the
  // seeded 复盘 `learning-hook-15s` to the canonical rubric). onConflictDoNothing → idempotent.
  const canonicalRuleSuggestion: CalibrationRuleSuggestionRow = {
    id: "calibsug-canonical-1",
    userId: canonicalDataset.user.id,
    learningId: "learning-hook-15s",
    rubricId: "rubric-canonical",
    status: "pending",
    proposedDimension: {
      key: "hook",
      label: "钩子强度",
      weight: 0.25,
      description: "前15秒抛冲突显著提升保留率（复盘回流：上调钩子评分权重）",
    },
    rationale: "复盘结论「前15秒抛冲突」回流为评分维度，建议上调钩子权重",
    adoptedVersionId: null,
    createdAt: FIXED_NOW_ISO,
    adoptedAt: null,
  };
  await calibrationSeedRepo.seedRuleSuggestions([canonicalRuleSuggestion]);

  // ── Real Douyin catalog + metrics (用户抖音作品初始化) ─────────────────────
  // Append the user's REAL Douyin works (58 published videos) + their REAL
  // creator-center metrics on top of the canonical demo dataset. Source of truth:
  // ~/.hermes/douyin_stats.db + vault 04-项目/内容创作/创作, frozen into
  // src/fixtures/douyin-real.ts (regenerate via /tmp/douyin-real/gen.mjs). Every
  // seed* is onConflictDoNothing, so this is idempotent across a re-built
  // singleton and never collides with the canonical (project-*/pub-*) ids — the
  // Douyin rows are namespaced `dy-*`. All rows are owned by the canonical login.
  const DY_OWNER = canonicalDataset.user.id;
  await projectsRepo.seedProjects(
    douyinProjects.map((p) =>
      toRow({ ...p, userId: DY_OWNER } as unknown as CanonicalProject),
    ),
  );
  await projectsRepo.seedStages(
    douyinProjectStages.map((s) => toStageRow(s as unknown as CanonicalStage)),
  );
  await projectsRepo.seedOutputs(
    douyinContentOutputs.map((o) => toOutputRow(o as unknown as CanonicalOutput)),
  );
  await projectsRepo.seedOutputStages(
    douyinOutputStages.map((s) =>
      toOutputStageRow(s as unknown as CanonicalOutputStage),
    ),
  );
  await knowledgeRepo.seedKnowledge(
    douyinKnowledgeItems.map((k) =>
      toKnowledgeRow({ ...k, userId: DY_OWNER } as unknown as CanonicalKnowledge),
    ),
  );
  await knowledgeRepo.seedRevisions(
    douyinKnowledgeRevisions.map((r) =>
      toRevisionRow(r as unknown as CanonicalRevision),
    ),
  );
  await artifactsSeedRepo.seedVersions(
    douyinArtifactVersions.map((v) =>
      toArtifactVersionRow(v as unknown as CanonicalArtifactVersion),
    ),
  );
  await artifactsSeedRepo.seedArtifacts(
    douyinArtifacts.map((a) =>
      toArtifactRow(a as unknown as CanonicalArtifact, DY_OWNER),
    ),
  );
  await analyticsRepo.seedSnapshots(
    douyinMetricSnapshots.map((s) => ({
      id: s.id,
      userId: DY_OWNER,
      publicationId: s.publicationId,
      ingestionRunId: s.ingestionRunId ?? null,
      capturedAt: s.capturedAt,
      source: s.source,
      rawMetrics: s.rawMetrics as Record<string, unknown>,
      createdAt: s.createdAt,
    })),
  );
  await analyticsRepo.seedValues(
    douyinMetricValues.map((v) => ({
      id: v.id,
      userId: DY_OWNER,
      metricSnapshotId: v.metricSnapshotId,
      metricKey: v.metricKey,
      numericValue: v.numericValue,
      unit: v.unit,
      dimensions: v.dimensions as Record<string, string>,
    })),
  );
  await analyticsRepo.seedAudienceSnapshots(
    douyinAudienceSnapshots.map((a) => ({
      id: a.id,
      userId: DY_OWNER,
      publicationId: a.publicationId,
      capturedAt: a.capturedAt,
      dimensionType: a.dimensionType,
      dimensionValue: a.dimensionValue,
      percentage: a.percentage,
      audienceCount: a.audienceCount,
    })),
  );
  await publishingSeedRepo.seedPublications(
    douyinPublications.map(
      (pub) => ({ ...pub, userId: DY_OWNER }) as unknown as PublicationRow,
    ),
  );
  // Seed the dy publication revisions so the REAL video title (it lives on the
  // revision, not the publication row) resolves on the Dashboard「最近发布」+
  // 发布中心 title column. userId injected (the fixture rows carry none).
  await publishingSeedRepo.seedRevisions(
    douyinPublicationRevisions.map(
      (rev) =>
        ({ ...rev, userId: DY_OWNER }) as unknown as Parameters<
          typeof publishingSeedRepo.seedRevisions
        >[0][number],
    ),
  );

  return {
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
    learnings,
    ai,
    positioning,
    monetization,
    candidate,
    calibration,
    platformAccount,
    contentCalendar,
    materialLinks,
    queryServices,
    publishingCenter,
    identity,
    settingsService,
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

async function getLearnings(): Promise<Transport> {
  return (await getBundle()).learnings;
}

async function getAi(): Promise<Transport> {
  return (await getBundle()).ai;
}

async function getPositioning(): Promise<Transport> {
  return (await getBundle()).positioning;
}

async function getMonetization(): Promise<Transport> {
  return (await getBundle()).monetization;
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
      const settings = await getSettings();
      return settings.request(endpoint, input, ctx);
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
    // Monetization ops (module 18, Wave 5+) — products.* / products.offers.* /
    // outputs.products.* / leads.* / leads.conversions.* / monetization.funnel.*
    // served by the module's own user-scoped transport over the SAME pglite store
    // (foundation §1 registry). Price decoupling + honest funnel run inside the
    // service; peer fan-out (Projects/Ingestion/Analytics/Search/Notifications)
    // reaches modules via injected ports. No ctx ⇒ AuthenticationError.
    if (MONETIZATION_OPS.has(endpoint.id)) {
      const monetization = await getMonetization();
      return monetization.request(endpoint, input, ctx);
    }
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
