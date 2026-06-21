import "server-only";
import {
  createDb,
  createProjectRepository,
  createPersistenceTransport,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import { mockTransport } from "@/server/mock-backend/mock-transport";
import { FIXED_NOW_ISO } from "@/server/mock-backend/store";
import { canonicalDataset } from "@/fixtures/canonical";
import {
  createIdentityRepository,
  seedCanonicalUser,
} from "@/server/modules/identity";

// Project-entity operations now served by REAL SQL persistence (@creatoros/backend
// over pglite). Everything else falls back to the in-memory mock. Listed
// explicitly so non-persisted ops (e.g. the static Dashboard page DTO) never
// trigger a pglite init — keeps pglite out of the static build.
const PERSISTED_OPS = new Set<string>([
  "projects.list",
  "projects.get",
  "projects.create",
  "projects.patch",
  "projects.archive",
  "projects.stage.transition",
  "projects.activity.list",
]);

type CanonicalProject = (typeof canonicalDataset.projects)[number];

function toRow(p: CanonicalProject) {
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

// Pin the singleton on globalThis, NOT a module-level `let`: Next/Turbopack give
// the route handler and server components separate module instances, so a
// module-level singleton would be a SEPARATE in-memory pglite per entry — island
// writes (via the route) would never be visible to page reads. globalThis is
// per-process, shared across all module graphs, so both see one store.
const globalForPersistence = globalThis as unknown as {
  __creatorosPersistence?: Promise<Transport>;
};

async function buildPersistence(): Promise<Transport> {
  const { db } = await createDb(); // session-scoped pglite (real SQL; resets on restart)

  // Deterministic clock/ids keep the seeded dataset reproducible (visual/test
  // parity); new creates get collision-free ids distinct from the slug seeds.
  // `createSeq` lives at build scope (NOT per-request) so ids stay stable across
  // the many per-ctx repos the factory mints below.
  let createSeq = 0;
  const deps = {
    now: () => FIXED_NOW_ISO,
    nextId: (prefix: string) =>
      prefix === "project" ? `project-p-${++createSeq}` : `activity-p-${++createSeq}`,
  };

  // Task 8: the persistence transport mints a per-request repository bound to
  // `ctx.userId` (creates stamp it; Wave-2 Projects tightens list/get filters).
  // One shared db (the globalThis pglite singleton) underlies every per-ctx repo.
  const repoFactory = (ctx: RequestContext) =>
    createProjectRepository(db, { ...deps, userId: ctx.userId });

  // Seed the Projects exemplar dataset (owned by the canonical user) AND the
  // canonical identity row, so real login resolves to `user-zyongzhu` and every
  // fixture-backed page + the Projects seed keep resolving under a real ctx
  // (foundation §2). seedCanonicalUser is idempotent (onConflictDoNothing), so a
  // re-built singleton never double-seeds. IDENTITY_DDL was applied in createDb().
  await createProjectRepository(db, {
    ...deps,
    userId: canonicalDataset.user.id,
  }).seedProjects(canonicalDataset.projects.map(toRow));
  await seedCanonicalUser(createIdentityRepository(db, deps), deps);

  return createPersistenceTransport(repoFactory);
}

function getPersistence(): Promise<Transport> {
  if (!globalForPersistence.__creatorosPersistence) {
    globalForPersistence.__creatorosPersistence = buildPersistence();
  }
  return globalForPersistence.__creatorosPersistence;
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
    // Persisted ops require ctx: the persistence transport throws
    // AuthenticationError when ctx is missing (unauthenticated dispatch → 401).
    const persistence = await getPersistence();
    try {
      return await persistence.request(endpoint, input, ctx);
    } catch (err) {
      if (err instanceof UnsupportedOperationError) {
        return mockTransport.request(endpoint, input, ctx);
      }
      throw err;
    }
  },
};

// Test hook: drop the pglite singleton so each test starts from a fresh seed.
export function __resetPersistenceForTests(): void {
  globalForPersistence.__creatorosPersistence = undefined;
}
