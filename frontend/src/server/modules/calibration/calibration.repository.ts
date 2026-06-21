import { and, asc, eq, type Db } from "@creatoros/backend";
import {
  rubrics,
  rubricVersions,
  predictions,
  calibrationResults,
} from "./calibration.db-schema";
import { OwnershipError } from "./calibration.errors";

// Calibration repository (foundation §5.2) — user-scoped queries ONLY. `userId` is
// baked into deps (mirrors the monetization/learnings repos): EVERY query filters
// `eq(table.userId, deps.userId)` and EVERY insert stamps `userId: deps.userId`. The
// private row getters throw OwnershipError when the scoped select returns empty —
// never revealing cross-user existence (foundation §2: 404 not 403). The repository
// executes only service-approved writes — the Prediction state machine + immutability
// guards live in the service (SPEC §12); the lock SQL `status='draft'` guard backs the
// invariant at the DB layer too.

export type RubricRow = typeof rubrics.$inferSelect;
export type RubricVersionRow = typeof rubricVersions.$inferSelect;
export type PredictionRow = typeof predictions.$inferSelect;
export type CalibrationResultRow = typeof calibrationResults.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
}

export interface RubricDimension {
  key: string;
  label: string;
  weight: number;
}

export interface InsertRubricVersionInput {
  rubricId: string;
  versionNumber: number;
  dimensions: RubricDimension[];
  changeSummary: string;
}

export interface CreatePredictionInput {
  subjectType: string;
  subjectId: string;
  rubricVersionId: string;
  predictedMetrics: Record<string, unknown>;
  predictedConversion: Record<string, unknown>;
  predictedScore: string; // decimal-as-text
  confidence: string;
}

export interface CreateResultInput {
  predictionId: string;
  ingestionRunId: string;
  actualMetrics: Record<string, unknown>;
  deviation: Record<string, unknown>;
}

export interface CalibrationRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedRubrics(rows: RubricRow[]): Promise<void>;
  seedRubricVersions(rows: RubricVersionRow[]): Promise<void>;

  createRubric(input: { name: string }): Promise<RubricRow>;
  insertRubricVersion(input: InsertRubricVersionInput): Promise<RubricVersionRow>;
  setRubricCurrentVersion(
    rubricId: string,
    versionId: string,
  ): Promise<RubricRow>;
  getRubric(rubricId: string): Promise<RubricRow>;
  getRubricVersion(versionId: string): Promise<RubricVersionRow>;
  listRubricVersions(rubricId: string): Promise<RubricVersionRow[]>;
  countRubricVersions(rubricId: string): Promise<number>;

  createPrediction(input: CreatePredictionInput): Promise<PredictionRow>;
  lockPrediction(predictionId: string): Promise<PredictionRow>;
  getPrediction(predictionId: string): Promise<PredictionRow>;

  createResult(input: CreateResultInput): Promise<CalibrationResultRow>;
  getResultByPrediction(
    predictionId: string,
  ): Promise<CalibrationResultRow | null>;
}

export function createCalibrationRepository(
  db: Db,
  deps: RepoDeps,
): CalibrationRepository {
  async function getRubricRow(rubricId: string): Promise<RubricRow> {
    const rows = await db
      .select()
      .from(rubrics)
      .where(and(eq(rubrics.userId, deps.userId), eq(rubrics.id, rubricId)));
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(`OwnershipError: rubric not found: ${rubricId}`);
    }
    return row;
  }

  async function getRubricVersionRow(
    versionId: string,
  ): Promise<RubricVersionRow> {
    const rows = await db
      .select()
      .from(rubricVersions)
      .where(
        and(
          eq(rubricVersions.userId, deps.userId),
          eq(rubricVersions.id, versionId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(
        `OwnershipError: rubric version not found: ${versionId}`,
      );
    }
    return row;
  }

  async function getPredictionRow(predictionId: string): Promise<PredictionRow> {
    const rows = await db
      .select()
      .from(predictions)
      .where(
        and(
          eq(predictions.userId, deps.userId),
          eq(predictions.id, predictionId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(
        `OwnershipError: prediction not found: ${predictionId}`,
      );
    }
    return row;
  }

  return {
    async seedRubrics(rows) {
      if (rows.length === 0) return;
      await db.insert(rubrics).values(rows).onConflictDoNothing();
    },

    async seedRubricVersions(rows) {
      if (rows.length === 0) return;
      await db.insert(rubricVersions).values(rows).onConflictDoNothing();
    },

    async createRubric({ name }) {
      const inserted = await db
        .insert(rubrics)
        .values({
          id: deps.nextId("rubric"),
          userId: deps.userId,
          name,
          currentVersionId: null,
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async insertRubricVersion(input) {
      // Never an update — each call is a NEW immutable row (data-model 约束 6).
      const inserted = await db
        .insert(rubricVersions)
        .values({
          id: deps.nextId("rubricver"),
          userId: deps.userId,
          rubricId: input.rubricId,
          versionNumber: input.versionNumber,
          dimensions: input.dimensions,
          changeSummary: input.changeSummary,
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async setRubricCurrentVersion(rubricId, versionId) {
      await getRubricRow(rubricId); // scoped ownership gate
      // The ONLY rubric mutation — re-points the pointer; version rows stay immutable.
      const updated = await db
        .update(rubrics)
        .set({ currentVersionId: versionId })
        .where(and(eq(rubrics.userId, deps.userId), eq(rubrics.id, rubricId)))
        .returning();
      return updated[0]!;
    },

    async getRubric(rubricId) {
      return getRubricRow(rubricId);
    },

    async getRubricVersion(versionId) {
      return getRubricVersionRow(versionId);
    },

    async listRubricVersions(rubricId) {
      return db
        .select()
        .from(rubricVersions)
        .where(
          and(
            eq(rubricVersions.userId, deps.userId),
            eq(rubricVersions.rubricId, rubricId),
          ),
        )
        .orderBy(asc(rubricVersions.versionNumber));
    },

    async countRubricVersions(rubricId) {
      const rows = await db
        .select({ id: rubricVersions.id })
        .from(rubricVersions)
        .where(
          and(
            eq(rubricVersions.userId, deps.userId),
            eq(rubricVersions.rubricId, rubricId),
          ),
        );
      return rows.length;
    },

    async createPrediction(input) {
      const inserted = await db
        .insert(predictions)
        .values({
          id: deps.nextId("pred"),
          userId: deps.userId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          rubricVersionId: input.rubricVersionId,
          predictedMetrics: input.predictedMetrics,
          predictedConversion: input.predictedConversion,
          predictedScore: input.predictedScore,
          confidence: input.confidence,
          status: "draft",
          lockedAt: null,
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async lockPrediction(predictionId) {
      await getPredictionRow(predictionId); // scoped ownership gate
      // The SQL `status='draft'` guard backs the immutability invariant at the DB layer
      // (a re-lock of an already-locked prediction matches 0 rows). The service enforces
      // the state machine + idempotency on top.
      const updated = await db
        .update(predictions)
        .set({ status: "locked", lockedAt: deps.now() })
        .where(
          and(
            eq(predictions.userId, deps.userId),
            eq(predictions.id, predictionId),
            eq(predictions.status, "draft"),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async getPrediction(predictionId) {
      return getPredictionRow(predictionId);
    },

    async createResult(input) {
      // Idempotent on UNIQUE prediction_id: a re-submit inserts nothing and the
      // read-back returns the existing row (never double-feeds the rubric/Learning).
      await db
        .insert(calibrationResults)
        .values({
          id: deps.nextId("calibres"),
          userId: deps.userId,
          predictionId: input.predictionId,
          ingestionRunId: input.ingestionRunId,
          actualMetrics: input.actualMetrics,
          deviation: input.deviation,
          createdAt: deps.now(),
        })
        .onConflictDoNothing();
      const existing = await db
        .select()
        .from(calibrationResults)
        .where(
          and(
            eq(calibrationResults.userId, deps.userId),
            eq(calibrationResults.predictionId, input.predictionId),
          ),
        );
      return existing[0]!;
    },

    async getResultByPrediction(predictionId) {
      const rows = await db
        .select()
        .from(calibrationResults)
        .where(
          and(
            eq(calibrationResults.userId, deps.userId),
            eq(calibrationResults.predictionId, predictionId),
          ),
        );
      return rows[0] ?? null;
    },
  };
}
