import type { RequestContext } from "@creatoros/contract";
import type {
  AnalyticsRepository,
  AppendSnapshotInput,
  MetricSnapshotRow,
  Page,
} from "./analytics.repository";

// Analytics service (foundation §5.3) — RequestContext-taking methods that thread
// `ctx.userId` into the user-scoped repository. Analytics owns NO state machine
// (SPEC §12) — the entities are append-only metric facts; the only invariant is
// idempotency, which lives in the repository's ON CONFLICT append.
//
// Cross-module resolution (project→publication ownership) reaches Publishing ONLY
// through the injected `AnalyticsPublishingPort` — a narrow public-service seam
// (SPEC §22, no cross-module repository import). The port is satisfied at
// composition time by Publishing's public service (resolvePublication = ownership
// gate via getPublication; listPublicationIdsByProject = the project→publication
// resolver). Keeping it as an injected port (not a direct PublishingService import)
// keeps the service unit-testable with a fake and avoids a hard module edge.

// The Publishing seam Analytics depends on. resolvePublication confirms the
// publication is owned by ctx.userId (throws OwnershipError → 404 if not, no
// existence leak); listPublicationIdsByProject returns the user-owned publication
// ids for a project (empty list when none — a valid empty page, not an error).
export interface AnalyticsPublishingPort {
  resolvePublication(ctx: RequestContext, publicationId: string): Promise<unknown>;
  listPublicationIdsByProject(
    ctx: RequestContext,
    projectId: string,
  ): Promise<string[]>;
}

export interface ServiceDeps {
  repo: AnalyticsRepository;
  publishing: AnalyticsPublishingPort;
}

export interface AnalyticsService {
  // SPEC §11 "指标导入" seam — the method IngestionService.ingestMetrics calls
  // inside the shared UoW (module 12). Analytics owns the idempotent append +
  // storage; Ingestion owns the run/idempotency-key envelope. Append-only, no
  // state transition.
  appendSnapshot(
    ctx: RequestContext,
    input: AppendSnapshotInput,
  ): Promise<{ snapshot: MetricSnapshotRow; created: boolean }>;
  getPublicationAnalytics(
    ctx: RequestContext,
    publicationId: string,
    page: number,
    pageSize: number,
  ): Promise<Page<MetricSnapshotRow>>;
  getProjectAnalytics(
    ctx: RequestContext,
    projectId: string,
    page: number,
    pageSize: number,
  ): Promise<Page<MetricSnapshotRow>>;
}

export function createAnalyticsService(deps: ServiceDeps): AnalyticsService {
  const { repo, publishing } = deps;
  return {
    async appendSnapshot(ctx, input) {
      // Append-only: delegate the idempotent insert. The denormalized user_id is
      // stamped from ctx.userId inside the repo.
      return repo.appendSnapshot(ctx.userId, input);
    },

    async getPublicationAnalytics(ctx, publicationId, page, pageSize) {
      // Ownership gate via the Publishing public seam: a cross-user / unknown
      // publication throws OwnershipError (→404, no existence leak) BEFORE any
      // metric row is read.
      await publishing.resolvePublication(ctx, publicationId);
      return repo.listSnapshotsByPublication(
        ctx.userId,
        publicationId,
        page,
        pageSize,
      );
    },

    async getProjectAnalytics(ctx, projectId, page, pageSize) {
      // Resolve the project's owned publication ids via Publishing (user-scoped;
      // the project-ownership gate lives in Publishing/Projects, not an Analytics
      // join). Empty id list → empty page (valid, not an error).
      const ids = await publishing.listPublicationIdsByProject(ctx, projectId);
      if (ids.length === 0) return { rows: [], total: 0 };
      return repo.listSnapshotsByProject(ctx.userId, ids, page, pageSize);
    },
  };
}
