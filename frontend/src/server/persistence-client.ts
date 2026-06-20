import "server-only";
import {
  createDb,
  createProjectRepository,
  createPersistenceTransport,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type { Endpoint, Transport } from "@creatoros/contract";
import { mockTransport } from "@/server/mock-backend/mock-transport";
import { FIXED_NOW_ISO } from "@/server/mock-backend/store";
import { canonicalDataset } from "@/fixtures/canonical";

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

let cached: Promise<Transport> | null = null;

async function buildPersistence(): Promise<Transport> {
  const { db } = await createDb(); // session-scoped pglite (real SQL; resets on restart)
  let createSeq = 0;
  const repo = createProjectRepository(db, {
    // Deterministic clock/ids keep the seeded dataset reproducible (visual/test
    // parity); new creates get collision-free ids distinct from the slug seeds.
    now: () => FIXED_NOW_ISO,
    nextId: (prefix) => (prefix === "project" ? `project-p-${++createSeq}` : `activity-p-${++createSeq}`),
    userId: canonicalDataset.user.id,
  });
  await repo.seedProjects(canonicalDataset.projects.map(toRow));
  return createPersistenceTransport(repo);
}

function getPersistence(): Promise<Transport> {
  if (!cached) cached = buildPersistence();
  return cached;
}

// Composite server transport: persistence for project ops, mock for the rest.
// Used by BOTH the server pages (contract-client.server) and the /api/v1 route,
// so server reads and island writes share one pglite store — island mutations
// persist and a router.refresh() reflects them.
export const compositeTransport: Transport = {
  async request(endpoint: Endpoint, input) {
    if (!PERSISTED_OPS.has(endpoint.id)) {
      return mockTransport.request(endpoint, input);
    }
    const persistence = await getPersistence();
    try {
      return await persistence.request(endpoint, input);
    } catch (err) {
      if (err instanceof UnsupportedOperationError) {
        return mockTransport.request(endpoint, input);
      }
      throw err;
    }
  },
};

// Test hook: drop the pglite singleton so each test starts from a fresh seed.
export function __resetPersistenceForTests(): void {
  cached = null;
}
