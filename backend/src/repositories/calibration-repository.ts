import { eq, and, asc, desc } from "drizzle-orm";
import type { Db } from "../db";
import {
  rubrics,
  rubricVersions,
  predictions,
  calibrationResults,
} from "../schema/calibration";

// Injected dependencies — mirrors project/knowledge-repository's RepoDeps so the
// repo stays deterministic (no Date.now / Math.random / fetch inside) and
// user-scoped (userId threaded from RequestContext, stamped on every owned row).
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type RubricDimension = { key: string; label: string; weight: number };

type RubricRow = typeof rubrics.$inferSelect;
type RubricVersionRow = typeof rubricVersions.$inferSelect;
type PredictionRow = typeof predictions.$inferSelect;
type CalibrationResultRow = typeof calibrationResults.$inferSelect;

type PredictionStatus = "draft" | "locked";
type CalibrationConfidence = "high" | "med" | "low";
type CalibrationSubjectType = "content_output" | "publication";

// `predictedScore` is stored as a decimal-as-text column (schema note) — Number()-
// parse on read so the DTO stays numeric (predictionResource.predictedScore is
// z.number()). Mirrors knowledge-repository's strength coercion.
type PredictionDto = Omit<PredictionRow, "predictedScore"> & {
  predictedScore: number;
};

const toPredictionDto = (row: PredictionRow): PredictionDto => ({
  ...row,
  predictedScore: Number(row.predictedScore),
});

// Rubric joined with its current immutable version (rubricResource shape).
type RubricWithVersion = RubricRow & { currentVersion: RubricVersionRow };

export interface CalibrationRepository {
  // ── Rubric (immutable version chain — ArtifactVersion 范式) ──
  seedRubrics(rows: RubricRow[]): Promise<void>;
  listRubrics(): Promise<RubricWithVersion[]>;
  getRubric(rubricId: string): Promise<RubricWithVersion>;
  createRubric(input: {
    name: string;
    dimensions?: RubricDimension[];
    changeSummary?: string;
  }): Promise<RubricWithVersion>;
  // Editing a rubric APPENDS a new immutable version + repoints currentVersionId.
  bumpRubricVersion(
    rubricId: string,
    input: { dimensions: RubricDimension[]; changeSummary?: string },
  ): Promise<RubricVersionRow>;
  listRubricVersions(rubricId: string): Promise<RubricVersionRow[]>;

  // ── Prediction (locked-at-creation immutable; draft→locked terminal FSM) ──
  listPredictions(): Promise<PredictionDto[]>;
  getPrediction(predictionId: string): Promise<PredictionDto>;
  createPrediction(input: {
    subjectType: CalibrationSubjectType;
    subjectId: string;
    rubricVersionId: string;
    predictedMetrics?: Record<string, unknown>;
    predictedConversion?: Record<string, unknown>;
    predictedScore?: number;
    confidence: CalibrationConfidence;
  }): Promise<PredictionDto>;
  // draft→locked is the only legal transition (盲预测不可改 once locked).
  lockPrediction(predictionId: string): Promise<PredictionDto>;

  // ── CalibrationResult (one row per prediction; idempotent recycle) ──
  getResultByPrediction(
    predictionId: string,
  ): Promise<CalibrationResultRow | undefined>;
  recordResult(
    predictionId: string,
    input: {
      ingestionRunId: string;
      actualMetrics?: Record<string, unknown>;
      deviation?: Record<string, unknown>;
    },
  ): Promise<CalibrationResultRow>;

  // TODO: deferred ops not yet surfaced by the core flow — listPredictions
  // filtered by subject, reverse lookup of results by ingestionRunId (RISK-005),
  // and CalibrationResult deviation recompute when actualMetrics are re-ingested.
}

export function createCalibrationRepository(
  db: Db,
  deps: RepoDeps,
): CalibrationRepository {
  // Owner-scoped reads: a row owned by another user is invisible → same
  // "not found" surface project/knowledge-repository use for cross-user / missing.
  async function getRubricRow(rubricId: string): Promise<RubricRow> {
    const rows = await db
      .select()
      .from(rubrics)
      .where(and(eq(rubrics.id, rubricId), eq(rubrics.userId, deps.userId)));
    const row = rows[0];
    if (!row) throw new Error(`OwnershipError: rubric not found: ${rubricId}`);
    return row;
  }

  async function getRubricVersionRow(
    versionId: string,
  ): Promise<RubricVersionRow> {
    const rows = await db
      .select()
      .from(rubricVersions)
      .where(eq(rubricVersions.id, versionId));
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: rubric version not found: ${versionId}`);
    }
    return row;
  }

  async function withCurrentVersion(
    rubric: RubricRow,
  ): Promise<RubricWithVersion> {
    if (!rubric.currentVersionId) {
      throw new Error(
        `OwnershipError: rubric has no current version: ${rubric.id}`,
      );
    }
    const currentVersion = await getRubricVersionRow(rubric.currentVersionId);
    return { ...rubric, currentVersion };
  }

  async function getPredictionRow(predictionId: string): Promise<PredictionRow> {
    const rows = await db
      .select()
      .from(predictions)
      .where(
        and(
          eq(predictions.id, predictionId),
          eq(predictions.userId, deps.userId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: prediction not found: ${predictionId}`);
    }
    return row;
  }

  return {
    async seedRubrics(rows) {
      if (rows.length === 0) return;
      await db.insert(rubrics).values(rows).onConflictDoNothing();
    },

    async listRubrics() {
      const rows = await db
        .select()
        .from(rubrics)
        .where(eq(rubrics.userId, deps.userId))
        .orderBy(asc(rubrics.createdAt));
      return Promise.all(rows.map((r) => withCurrentVersion(r)));
    },

    async getRubric(rubricId) {
      return withCurrentVersion(await getRubricRow(rubricId));
    },

    // create mints the rubric AND its first immutable version (#1), then repoints
    // currentVersionId at that version (circular-FK first-insert: §7.5 工程债).
    async createRubric({ name, dimensions, changeSummary }) {
      const ts = deps.now();
      const rubricId = deps.nextId("rubric");
      const versionId = deps.nextId("rubric-version");

      const insertedRubric = await db
        .insert(rubrics)
        .values({
          id: rubricId,
          userId: deps.userId,
          name,
          currentVersionId: null, // patched after the v1 version exists
          createdAt: ts,
        })
        .returning();

      await db.insert(rubricVersions).values({
        id: versionId,
        userId: deps.userId,
        rubricId,
        versionNumber: 1,
        dimensions: dimensions ?? [],
        changeSummary: changeSummary ?? "",
        createdAt: ts,
      });

      const updated = await db
        .update(rubrics)
        .set({ currentVersionId: versionId })
        .where(eq(rubrics.id, rubricId))
        .returning();

      return withCurrentVersion(updated[0] ?? insertedRubric[0]!);
    },

    // An edit APPENDS a new version with a monotonically increasing number and
    // repoints currentVersionId. It NEVER updates an existing version row.
    async bumpRubricVersion(rubricId, { dimensions, changeSummary }) {
      await getRubricRow(rubricId); // ownership + existence gate
      const ts = deps.now();

      const latest = await db
        .select()
        .from(rubricVersions)
        .where(eq(rubricVersions.rubricId, rubricId))
        .orderBy(desc(rubricVersions.versionNumber))
        .limit(1);
      const nextNumber = (latest[0]?.versionNumber ?? 0) + 1;

      const versionId = deps.nextId("rubric-version");
      const inserted = await db
        .insert(rubricVersions)
        .values({
          id: versionId,
          userId: deps.userId,
          rubricId,
          versionNumber: nextNumber,
          dimensions,
          changeSummary: changeSummary ?? "",
          createdAt: ts,
        })
        .returning();

      // Repoint the rubric at the freshly appended version; old rows untouched.
      await db
        .update(rubrics)
        .set({ currentVersionId: versionId })
        .where(eq(rubrics.id, rubricId));

      return inserted[0]!;
    },

    async listRubricVersions(rubricId) {
      await getRubricRow(rubricId); // ownership + existence gate
      return db
        .select()
        .from(rubricVersions)
        .where(eq(rubricVersions.rubricId, rubricId))
        .orderBy(asc(rubricVersions.versionNumber));
    },

    async listPredictions() {
      const rows = await db
        .select()
        .from(predictions)
        .where(eq(predictions.userId, deps.userId))
        .orderBy(asc(predictions.createdAt));
      return rows.map(toPredictionDto);
    },

    async getPrediction(predictionId) {
      return toPredictionDto(await getPredictionRow(predictionId));
    },

    async createPrediction({
      subjectType,
      subjectId,
      rubricVersionId,
      predictedMetrics,
      predictedConversion,
      predictedScore,
      confidence,
    }) {
      const ts = deps.now();
      const inserted = await db
        .insert(predictions)
        .values({
          id: deps.nextId("prediction"),
          userId: deps.userId,
          subjectType,
          subjectId,
          rubricVersionId,
          predictedMetrics: predictedMetrics ?? {},
          predictedConversion: predictedConversion ?? {},
          predictedScore: String(predictedScore ?? 0), // decimal-as-text
          confidence,
          status: "draft",
          lockedAt: null,
          createdAt: ts,
        })
        .returning();
      return toPredictionDto(inserted[0]!);
    },

    // draft→locked is the only legal transition; a locked prediction is immutable
    // (盲预测不可改). Guard the FSM with a status='draft' predicate on the UPDATE so
    // the invariant holds at the DB layer too (re-lock returns 0 rows → conflict).
    async lockPrediction(predictionId) {
      const current = await getPredictionRow(predictionId); // ownership + existence
      if ((current.status as PredictionStatus) !== "draft") {
        throw new Error(
          `ConflictError: prediction is not draft (status=${current.status}): ${predictionId}`,
        );
      }
      const ts = deps.now();
      const updated = await db
        .update(predictions)
        .set({ status: "locked", lockedAt: ts })
        .where(
          and(eq(predictions.id, predictionId), eq(predictions.status, "draft")),
        )
        .returning();
      return toPredictionDto(updated[0]!);
    },

    async getResultByPrediction(predictionId) {
      await getPredictionRow(predictionId); // ownership + existence gate
      const rows = await db
        .select()
        .from(calibrationResults)
        .where(eq(calibrationResults.predictionId, predictionId));
      return rows[0];
    },

    // One result per prediction (UNIQUE prediction_id). Idempotent recycle: a
    // re-submit is a no-op insert (onConflictDoNothing) and returns the existing
    // row — never double-feeds the rubric/Learning loop.
    async recordResult(predictionId, { ingestionRunId, actualMetrics, deviation }) {
      await getPredictionRow(predictionId); // ownership + existence gate

      await db
        .insert(calibrationResults)
        .values({
          id: deps.nextId("calibration-result"),
          userId: deps.userId,
          predictionId,
          ingestionRunId,
          actualMetrics: actualMetrics ?? {},
          deviation: deviation ?? {},
          createdAt: deps.now(),
        })
        .onConflictDoNothing();

      const rows = await db
        .select()
        .from(calibrationResults)
        .where(eq(calibrationResults.predictionId, predictionId));
      return rows[0]!;
    },
  };
}
