import { eq, and, asc } from "drizzle-orm";
import type { Db } from "../db";
import {
  metricSnapshots,
  metricValues,
  retentionPoints,
  audienceSnapshots,
} from "../schema/analytics";

// Injected dependencies — mirrors project-/knowledge-repository's RepoDeps so the
// repo stays deterministic (no Date.now / Math.random / fetch inside) and
// user-scoped. userId is threaded from RequestContext and stamped on every append.
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type SnapshotRow = typeof metricSnapshots.$inferSelect;
type ValueRow = typeof metricValues.$inferSelect;
type RetentionRow = typeof retentionPoints.$inferSelect;
type AudienceRow = typeof audienceSnapshots.$inferSelect;

type DimensionType =
  | "age"
  | "gender"
  | "region"
  | "source"
  | "device"
  | "intent"
  | "paying";

export interface AnalyticsRepository {
  seedSnapshots(rows: SnapshotRow[]): Promise<void>;

  // MetricSnapshot — APPEND-ONLY facts. The sole invariant is IDEMPOTENCY:
  // (publication_id, source, captured_at) is UNIQUE, so a re-submitted snapshot
  // with the same key (or identical captured_at) is a no-op insert.
  listSnapshots(publicationId: string): Promise<SnapshotRow[]>;
  getSnapshot(snapshotId: string): Promise<SnapshotRow>;
  appendSnapshot(input: {
    publicationId: string;
    capturedAt: string;
    source: string;
    ingestionRunId?: string | null;
    rawMetrics?: Record<string, unknown>;
  }): Promise<SnapshotRow>;

  // MetricValue — append-only facts attached to a snapshot (the caller must own
  // the snapshot).
  appendValue(
    snapshotId: string,
    input: {
      metricKey: string;
      numericValue: number;
      unit?: string;
      dimensions?: Record<string, string>;
    },
  ): Promise<ValueRow>;
  listValues(snapshotId: string): Promise<ValueRow[]>;

  // RetentionPoint — append-only retention-curve facts for a publication.
  appendRetentionPoint(input: {
    publicationId: string;
    capturedAt: string;
    positionMs: number;
    retentionRate: number;
    viewerCount: number;
  }): Promise<RetentionRow>;
  listRetentionPoints(publicationId: string): Promise<RetentionRow[]>;

  // AudienceSnapshot — append-only audience-dimension facts for a publication.
  appendAudienceSnapshot(input: {
    publicationId: string;
    capturedAt: string;
    dimensionType: DimensionType;
    dimensionValue: string;
    percentage: number;
    audienceCount: number;
  }): Promise<AudienceRow>;
  listAudienceSnapshots(publicationId: string): Promise<AudienceRow[]>;
}

export function createAnalyticsRepository(
  db: Db,
  deps: RepoDeps,
): AnalyticsRepository {
  // Owner-scoped read: a snapshot owned by another user is invisible → same
  // "not found" surface project-/knowledge-repository use for cross-user /
  // missing rows.
  async function getSnapshot(snapshotId: string): Promise<SnapshotRow> {
    const rows = await db
      .select()
      .from(metricSnapshots)
      .where(
        and(
          eq(metricSnapshots.id, snapshotId),
          eq(metricSnapshots.userId, deps.userId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: snapshot not found: ${snapshotId}`);
    }
    return row;
  }

  return {
    async seedSnapshots(rows) {
      if (rows.length === 0) return;
      await db.insert(metricSnapshots).values(rows).onConflictDoNothing();
    },

    async listSnapshots(publicationId) {
      return db
        .select()
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.userId, deps.userId),
            eq(metricSnapshots.publicationId, publicationId),
          ),
        )
        .orderBy(asc(metricSnapshots.capturedAt));
    },

    getSnapshot,

    // IDEMPOTENT append: onConflictDoNothing against the UNIQUE
    // (publication_id, source, captured_at) index. If the key already exists the
    // insert is a no-op and we return the pre-existing row instead of throwing.
    async appendSnapshot({
      publicationId,
      capturedAt,
      source,
      ingestionRunId,
      rawMetrics,
    }) {
      const ts = deps.now();
      const inserted = await db
        .insert(metricSnapshots)
        .values({
          id: deps.nextId("snapshot"),
          userId: deps.userId,
          publicationId,
          ingestionRunId: ingestionRunId ?? null,
          capturedAt,
          source,
          rawMetrics: rawMetrics ?? {},
          createdAt: ts,
        })
        .onConflictDoNothing()
        .returning();
      const row = inserted[0];
      if (row) return row;
      // Conflict on the idempotency key — return the existing snapshot.
      const existing = await db
        .select()
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.userId, deps.userId),
            eq(metricSnapshots.publicationId, publicationId),
            eq(metricSnapshots.source, source),
            eq(metricSnapshots.capturedAt, capturedAt),
          ),
        );
      return existing[0]!;
    },

    async appendValue(snapshotId, { metricKey, numericValue, unit, dimensions }) {
      await getSnapshot(snapshotId); // ownership + existence gate
      const inserted = await db
        .insert(metricValues)
        .values({
          id: deps.nextId("metric-value"),
          userId: deps.userId,
          metricSnapshotId: snapshotId,
          metricKey,
          numericValue,
          unit: unit ?? "",
          dimensions: dimensions ?? {},
        })
        .returning();
      return inserted[0]!;
    },

    async listValues(snapshotId) {
      await getSnapshot(snapshotId); // ownership + existence gate
      return db
        .select()
        .from(metricValues)
        .where(
          and(
            eq(metricValues.userId, deps.userId),
            eq(metricValues.metricSnapshotId, snapshotId),
          ),
        )
        .orderBy(asc(metricValues.metricKey));
    },

    async appendRetentionPoint({
      publicationId,
      capturedAt,
      positionMs,
      retentionRate,
      viewerCount,
    }) {
      const inserted = await db
        .insert(retentionPoints)
        .values({
          id: deps.nextId("retention-point"),
          userId: deps.userId,
          publicationId,
          capturedAt,
          positionMs,
          retentionRate,
          viewerCount,
        })
        .returning();
      return inserted[0]!;
    },

    async listRetentionPoints(publicationId) {
      return db
        .select()
        .from(retentionPoints)
        .where(
          and(
            eq(retentionPoints.userId, deps.userId),
            eq(retentionPoints.publicationId, publicationId),
          ),
        )
        .orderBy(asc(retentionPoints.positionMs));
    },

    async appendAudienceSnapshot({
      publicationId,
      capturedAt,
      dimensionType,
      dimensionValue,
      percentage,
      audienceCount,
    }) {
      const inserted = await db
        .insert(audienceSnapshots)
        .values({
          id: deps.nextId("audience-snapshot"),
          userId: deps.userId,
          publicationId,
          capturedAt,
          dimensionType,
          dimensionValue,
          percentage,
          audienceCount,
        })
        .returning();
      return inserted[0]!;
    },

    async listAudienceSnapshots(publicationId) {
      return db
        .select()
        .from(audienceSnapshots)
        .where(
          and(
            eq(audienceSnapshots.userId, deps.userId),
            eq(audienceSnapshots.publicationId, publicationId),
          ),
        )
        .orderBy(asc(audienceSnapshots.dimensionType));
    },
  };
}
