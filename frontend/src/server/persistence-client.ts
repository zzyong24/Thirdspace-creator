import "server-only";
import { createDb, UnsupportedOperationError } from "@creatoros/backend";
import type { Endpoint, Transport } from "@creatoros/contract";
import { mockTransport } from "@/server/mock-backend/mock-transport";
import { FIXED_NOW_ISO } from "@/server/mock-backend/store";
import { canonicalDataset } from "@/fixtures/canonical";
import {
  createIdentityRepository,
  createIdentityService,
  seedCanonicalUser,
  type IdentityService,
} from "@/server/modules/identity";
import {
  createTaxonomyRepository,
  createTaxonomyService,
  createTaxonomyTransport,
  TAXONOMY_OP_IDS,
} from "@/server/modules/taxonomy";
import {
  createNotificationRepository,
  createNotificationsService,
  createNotificationsTransport,
  NOTIFICATION_OP_IDS,
  type NotificationRow,
} from "@/server/modules/notifications";
import {
  createSearchRepository,
  createSearchService,
  createSearchTransport,
  SEARCH_OP_IDS,
} from "@/server/modules/search";
import { buildCanonicalSearchDocuments } from "@/server/modules/search/search.seed";
import {
  createSettingsRepository,
  createSettingsService,
  createSettingsTransport,
  SETTINGS_OP_IDS,
  type ModelConfigurationRow,
  type UserPreferenceRow,
  type AgentConfigurationRow,
} from "@/server/modules/settings";
import {
  createProjectRepository,
  createProjectsService,
  createProjectsTransport,
  PROJECT_OP_IDS,
  type ProjectRow,
  type StageRow,
  type TargetPlatformRow,
  type ContentOutputRow,
  type OutputStageRow,
  type TaskRow,
  type ActivityRow,
} from "@/server/modules/projects";
import {
  createKnowledgeRepository,
  createKnowledgeService,
  createKnowledgeTransport,
  KNOWLEDGE_OP_IDS,
  type KnowledgeItemRow,
  type KnowledgeRevisionRow,
} from "@/server/modules/knowledge";
import {
  createAssetRepository,
  createAssetsService,
  createAssetsTransport,
  createMockObjectStorage,
  ASSET_OP_IDS,
  type AssetRow,
  type AssetFileRow,
} from "@/server/modules/assets";
import {
  createArtifactRepository,
  createArtifactsService,
  createArtifactsTransport,
  ARTIFACT_OP_IDS,
  type ArtifactRow,
  type ArtifactVersionRow,
  type ArtifactRelationRow,
} from "@/server/modules/artifacts";
import {
  createProductionService,
  createProductionTransport,
  PRODUCTION_OP_IDS,
} from "@/server/modules/production";
import {
  createPublishingService,
  createPublishingTransport,
  createMockPublisher,
  PUBLISHING_OP_IDS,
} from "@/server/modules/publishing";
import {
  createAnalyticsRepository,
  createAnalyticsService,
  createAnalyticsTransport,
  ANALYTICS_OP_IDS,
} from "@/server/modules/analytics";
import {
  createIngestionRepository,
  createIngestionService,
  createIngestionTransport,
  createMockIngestionSource,
  INGESTION_OP_IDS,
} from "@/server/modules/ingestion";
import {
  createReviewsService,
  createReviewsTransport,
  REVIEWS_OP_IDS,
} from "@/server/modules/reviews";
import {
  createLearningsService,
  createLearningsTransport,
  LEARNINGS_OP_IDS,
} from "@/server/modules/learnings";
import {
  createAiService,
  createAiTransport,
  createAiRepository,
  buildAiModelConfigs,
  buildAiAgentConfigs,
  AI_OP_IDS,
} from "@/server/modules/ai";
import {
  createDashboardQueryService,
  createProjectOverviewQueryService,
  createGlobalSearchQueryService,
  createPublishingCenterQueryService,
  createQueryServicesTransport,
  QUERY_SERVICES_OP_IDS,
  type PublishingCenterQueryService,
} from "@/server/modules/query-services";

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
]);

// The set of op ids owned by the taxonomy module's transport (module 04).
const TAXONOMY_OPS = new Set<string>(TAXONOMY_OP_IDS);

// The set of op ids owned by the notifications module's transport (module 01).
const NOTIFICATION_OPS = new Set<string>(NOTIFICATION_OP_IDS);

// The set of op ids the Search module's transport handles at DISPATCH time
// (module 02). Wave-4 takeover (foundation §6): the query-services module now owns
// `pages.search.get`, so the Search transport is NO LONGER routed for it — this set
// is empty. The Search SERVICE is still consumed by the GlobalSearchQueryService
// facade (search/recordSearch/listHistory). SEARCH_OP_IDS still feeds PERSISTED_OPS
// (the op is persisted; it is just routed to query-services below).
const SEARCH_OPS = new Set<string>();

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

type CanonicalProject = (typeof canonicalDataset.projects)[number];

function toRow(p: CanonicalProject): ProjectRow {
  return {
    id: p.id,
    userId: p.userId,
    title: p.title,
    brief: p.brief ?? "",
    contentCategory: p.contentCategory ?? "",
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
  // Query services (module Q, Wave 4): the composite transport for the 3 page
  // reads, plus the Publishing Center composer (no endpoint — the FE calls it
  // server-side via getPublishingCenterService()).
  queryServices: Transport;
  publishingCenter: PublishingCenterQueryService;
  identity: IdentityService;
}

const globalForPersistence = globalThis as unknown as {
  __creatorosPersistence?: Promise<PersistenceBundle>;
};

async function buildPersistence(): Promise<PersistenceBundle> {
  const { db } = await createDb(); // session-scoped pglite (real SQL; resets on restart)

  // Deterministic clock/ids keep the seeded dataset reproducible (visual/test
  // parity); new creates get collision-free ids distinct from the slug seeds.
  // `createSeq` lives at build scope (NOT per-request) so ids stay stable across
  // the many per-ctx repos the factory mints below.
  let createSeq = 0;
  const deps = {
    now: () => FIXED_NOW_ISO,
    // Prefix-generic id minting so every module (projects/activities/tags/
    // entity_tags) gets a stable, collision-free `<prefix>-p-<n>` id. Projects
    // historically used `project-p-`/`activity-p-`; the same scheme now serves
    // the taxonomy `tag`/`entitytag` prefixes.
    nextId: (prefix: string) => `${prefix}-p-${++createSeq}`,
  };

  // Projects (module 05): one user-scoped repository over the shared db (every
  // query filters eq(userId, ctx.userId) / ownership-checks via the parent). The
  // transport mints a per-ctx service so the §12 state machines run under the
  // caller; the repo is shared (it takes ctx per-call, not at construction).
  const projectsRepo = createProjectRepository(db);
  // A stable service handle (deterministic deps) reused both by the per-ctx
  // transport factory AND by the Production module's completeExport fan-out
  // (setPrimaryOutputAsset → patchOutput, which also appends the activity). The
  // service is stateless per call (it takes ctx per method), so one instance is
  // safe across requests.
  const projectsService = createProjectsService(projectsRepo, deps);
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
  const objectStorage = createMockObjectStorage({
    nextKey: () => `uploads/${deps.nextId("objkey")}`,
  });
  const assetsService = createAssetsService(assetsRepo, objectStorage, deps);
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
  });
  const ai = createAiTransport(() => aiService);

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
      // No getDashboardSummary on the frozen Projects index (open question #1):
      // compose a DTO-valid empty summary. ctx threaded for the inherited-scope
      // invariant + future slot-in.
      getDashboardSummary: async (_ctx) => ({
        continueCreating: null,
        todos: [],
      }),
    },
    publishing: {
      getRecentPublications: async (ctx) => {
        const rows = await publishingService.getRecentPublications(ctx, {
          limit: 5,
        });
        // PublicationRow carries no title/views/engagement (title lives on a
        // revision; metrics on Analytics). Map the columns we own; default the
        // rest. The canonical Publishing seed is empty → [] in practice.
        return rows.map((r) => ({
          id: r.id,
          title: r.id,
          platform: r.platform as "youtube",
          status: r.status as "published",
          views: 0,
          engagement: 0,
          publishedAt: r.publishedAt ?? r.createdAt,
        }));
      },
    },
    analytics: {
      // No dashboard metric rollup on the frozen Analytics index — empty.
      getDashboardMetrics: async (_ctx) => ({ metrics: [], trend: [] }),
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
      // No trending-topic read on the frozen Knowledge index — empty.
      getTrendingTopics: async (_ctx) => [],
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
  );
  const settings = createSettingsTransport(() => settingsService);

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
    queryServices,
    publishingCenter,
    identity,
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
