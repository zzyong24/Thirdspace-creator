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
]);

// The set of op ids owned by the taxonomy module's transport (module 04).
const TAXONOMY_OPS = new Set<string>(TAXONOMY_OP_IDS);

// The set of op ids owned by the notifications module's transport (module 01).
const NOTIFICATION_OPS = new Set<string>(NOTIFICATION_OP_IDS);

// The set of op ids owned by the search module's transport (module 02).
const SEARCH_OPS = new Set<string>(SEARCH_OP_IDS);

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
  const projects = createProjectsTransport(() => ({
    service: createProjectsService(projectsRepo, deps),
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

  return {
    projects,
    taxonomy,
    notifications,
    search,
    settings,
    knowledge,
    assets,
    artifacts,
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
