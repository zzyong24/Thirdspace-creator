import { and, asc, desc, eq, inArray, sql, type Db } from "@creatoros/backend";
import {
  metricSnapshots,
  metricValues,
  retentionPoints,
  audienceSnapshots,
} from "./analytics.db-schema";

// Analytics repository (foundation §5.2) — user-scoped queries ONLY. The
// denormalized `user_id` lives on EVERY metric row; every read filters
// `eq(table.userId, userId)` and every write stamps `userId`. Unlike the
// publishing/knowledge repos, `userId` is NOT baked into deps — it is passed PER
// CALL (the plan's RepoDeps shape minus the per-repo userId), because the metric
// store is append-only and shared across the service's read/write seams.
//
// Append is IDEMPOTENT (SPEC §22): `INSERT … ON CONFLICT (publication_id, source,
// captured_at) DO NOTHING RETURNING *`; when nothing comes back the snapshot
// already exists, so we SELECT it user-scoped and return `{ created:false }`.
// Child `metric_values` rows are inserted ONLY when the snapshot was created, so a
// re-submission never duplicates value rows. Analytics owns no state machine —
// there is no update/delete path (append-only fact store).

export type MetricSnapshotRow = typeof metricSnapshots.$inferSelect;
export type MetricValueRow = typeof metricValues.$inferSelect;
export type RetentionPointRow = typeof retentionPoints.$inferSelect;
export type AudienceSnapshotRow = typeof audienceSnapshots.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
}

export interface AppendValueInput {
  metricKey: string;
  numericValue: number;
  unit?: string;
  dimensions?: Record<string, string>;
}

export interface AppendSnapshotInput {
  publicationId: string;
  ingestionRunId?: string | null;
  capturedAt: string;
  source: string;
  rawMetrics?: Record<string, unknown>;
  values?: ReadonlyArray<AppendValueInput>;
}

export interface Page<T> {
  rows: T[];
  total: number;
}

export interface AnalyticsRepository {
  seedSnapshots(rows: MetricSnapshotRow[]): Promise<void>;
  seedValues(rows: MetricValueRow[]): Promise<void>;
  seedRetentionPoints(rows: RetentionPointRow[]): Promise<void>;
  seedAudienceSnapshots(rows: AudienceSnapshotRow[]): Promise<void>;
  appendSnapshot(
    userId: string,
    input: AppendSnapshotInput,
  ): Promise<{ snapshot: MetricSnapshotRow; created: boolean }>;
  listSnapshotsByPublication(
    userId: string,
    publicationId: string,
    page: number,
    pageSize: number,
  ): Promise<Page<MetricSnapshotRow>>;
  listSnapshotsByProject(
    userId: string,
    publicationIds: ReadonlyArray<string>,
    page: number,
    pageSize: number,
  ): Promise<Page<MetricSnapshotRow>>;
  listValuesBySnapshot(
    userId: string,
    metricSnapshotId: string,
  ): Promise<MetricValueRow[]>;
}

export function createAnalyticsRepository(
  db: Db,
  deps: RepoDeps,
): AnalyticsRepository {
  return {
    async seedSnapshots(rows) {
      if (rows.length === 0) return;
      await db.insert(metricSnapshots).values(rows).onConflictDoNothing();
    },
    async seedValues(rows) {
      if (rows.length === 0) return;
      await db.insert(metricValues).values(rows).onConflictDoNothing();
    },
    async seedRetentionPoints(rows) {
      if (rows.length === 0) return;
      await db.insert(retentionPoints).values(rows).onConflictDoNothing();
    },
    async seedAudienceSnapshots(rows) {
      if (rows.length === 0) return;
      await db.insert(audienceSnapshots).values(rows).onConflictDoNothing();
    },

    async appendSnapshot(userId, input) {
      const id = deps.nextId("ms");
      // Idempotent insert on the UNIQUE (publication_id, source, captured_at)
      // anchor. ON CONFLICT DO NOTHING + RETURNING gives us the inserted row, or
      // nothing if the snapshot already exists.
      const inserted = await db
        .insert(metricSnapshots)
        .values({
          id,
          userId,
          publicationId: input.publicationId,
          ingestionRunId: input.ingestionRunId ?? null,
          capturedAt: input.capturedAt,
          source: input.source,
          rawMetrics: input.rawMetrics ?? {},
          createdAt: deps.now(),
        })
        .onConflictDoNothing({
          target: [
            metricSnapshots.publicationId,
            metricSnapshots.source,
            metricSnapshots.capturedAt,
          ],
        })
        .returning();

      const created = inserted.length > 0;
      if (created) {
        const snapshot = inserted[0]!;
        // Insert child value rows ONLY on first create (no duplicate value rows).
        const values = input.values ?? [];
        if (values.length > 0) {
          await db.insert(metricValues).values(
            values.map((v) => ({
              id: deps.nextId("mv"),
              userId,
              metricSnapshotId: snapshot.id,
              metricKey: v.metricKey,
              numericValue: v.numericValue,
              unit: v.unit ?? "",
              dimensions: v.dimensions ?? {},
            })),
          );
        }
        return { snapshot, created: true };
      }

      // Conflict — the snapshot already exists. SELECT it user-scoped.
      const existing = await db
        .select()
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.userId, userId),
            eq(metricSnapshots.publicationId, input.publicationId),
            eq(metricSnapshots.source, input.source),
            eq(metricSnapshots.capturedAt, input.capturedAt),
          ),
        );
      return { snapshot: existing[0]!, created: false };
    },

    async listSnapshotsByPublication(userId, publicationId, page, pageSize) {
      const where = and(
        eq(metricSnapshots.userId, userId),
        eq(metricSnapshots.publicationId, publicationId),
      );
      const rows = await db
        .select()
        .from(metricSnapshots)
        .where(where)
        .orderBy(desc(metricSnapshots.capturedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const totalRows = await db
        .select({ value: sql<number>`count(*)` })
        .from(metricSnapshots)
        .where(where);
      return { rows, total: Number(totalRows[0]?.value ?? 0) };
    },

    async listSnapshotsByProject(userId, publicationIds, page, pageSize) {
      if (publicationIds.length === 0) return { rows: [], total: 0 };
      const where = and(
        eq(metricSnapshots.userId, userId),
        inArray(metricSnapshots.publicationId, [...publicationIds]),
      );
      const rows = await db
        .select()
        .from(metricSnapshots)
        .where(where)
        .orderBy(desc(metricSnapshots.capturedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const totalRows = await db
        .select({ value: sql<number>`count(*)` })
        .from(metricSnapshots)
        .where(where);
      return { rows, total: Number(totalRows[0]?.value ?? 0) };
    },

    async listValuesBySnapshot(userId, metricSnapshotId) {
      return db
        .select()
        .from(metricValues)
        .where(
          and(
            eq(metricValues.userId, userId),
            eq(metricValues.metricSnapshotId, metricSnapshotId),
          ),
        )
        .orderBy(asc(metricValues.metricKey));
    },
  };
}
