import { and, eq, type Db } from "@creatoros/backend";
import {
  externalSources,
  ingestionRuns,
  ingestionErrors,
  ingestionRecords,
} from "./ingestion.db-schema";
import { OwnershipError } from "./ingestion.errors";

// Ingestion repository (foundation §5.2) — user-scoped queries ONLY. The
// denormalized `user_id` lives on EVERY row (the ownership boundary; SPEC §10/§20).
// `userId` is baked into RepoDeps (mirrors publishing/knowledge): the service mints
// one repo per request from ctx.userId, so every read filters
// `eq(table.userId, deps.userId)` and every insert stamps it. A cross-user /
// unknown run getRun → OwnershipError (→404, no existence leak).
//
// The two SPEC §17 idempotency invariants are enforced at the DB layer by the
// UNIQUE indexes (ux_ingestion_runs_source_idem, ux_ingestion_records_run_key) and
// surfaced here by `findRunByIdempotency` (returns the ORIGINAL run) and
// `recordExists` / `markRecordResult` (onConflictDoNothing skips a re-pushed
// record). Run status transitions are applied here ONLY at the service's request
// (SPEC §12 closing rule — the repo holds no lifecycle logic).

export type ExternalSourceRow = typeof externalSources.$inferSelect;
export type IngestionRunRow = typeof ingestionRuns.$inferSelect;
export type IngestionErrorRow = typeof ingestionErrors.$inferSelect;
export type IngestionRecordRow = typeof ingestionRecords.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary (ctx.userId)
}

export type RecordResult = "written" | "rejected";

export interface CreateRunInput {
  externalSourceId: string;
  runType: string;
  idempotencyKey: string;
}

export interface AppendErrorInput {
  ingestionRunId: string;
  recordKey: string;
  errorCode: string;
  errorMessage: string;
  rejectedPayload: Record<string, unknown>;
}

export interface IngestionRepository {
  seedExternalSources(rows: ExternalSourceRow[]): Promise<void>;
  getExternalSource(id: string): Promise<ExternalSourceRow | undefined>;
  findRunByIdempotency(
    externalSourceId: string,
    idempotencyKey: string,
  ): Promise<IngestionRunRow | undefined>;
  createRun(input: CreateRunInput): Promise<IngestionRunRow>;
  getRun(runId: string): Promise<IngestionRunRow>;
  markRunRunning(runId: string): Promise<IngestionRunRow>;
  recordExists(runId: string, recordKey: string): Promise<boolean>;
  markRecordResult(
    runId: string,
    recordKey: string,
    result: RecordResult,
  ): Promise<void>;
  appendError(input: AppendErrorInput): Promise<IngestionErrorRow>;
  listErrors(runId: string): Promise<IngestionErrorRow[]>;
  completeRun(
    runId: string,
    input: { status: string; completedAt: string },
  ): Promise<IngestionRunRow>;
}

export function createIngestionRepository(
  db: Db,
  deps: RepoDeps,
): IngestionRepository {
  const { userId } = deps;

  // Scoped fetch that raises OwnershipError on missing / cross-user (→404).
  async function requireRun(runId: string): Promise<IngestionRunRow> {
    const rows = await db
      .select()
      .from(ingestionRuns)
      .where(and(eq(ingestionRuns.userId, userId), eq(ingestionRuns.id, runId)));
    const run = rows[0];
    if (!run) throw new OwnershipError();
    return run;
  }

  return {
    async seedExternalSources(rows) {
      if (rows.length === 0) return;
      await db.insert(externalSources).values(rows).onConflictDoNothing();
    },

    async getExternalSource(id) {
      const rows = await db
        .select()
        .from(externalSources)
        .where(
          and(
            eq(externalSources.userId, userId),
            eq(externalSources.id, id),
          ),
        );
      return rows[0];
    },

    async findRunByIdempotency(externalSourceId, idempotencyKey) {
      const rows = await db
        .select()
        .from(ingestionRuns)
        .where(
          and(
            eq(ingestionRuns.userId, userId),
            eq(ingestionRuns.externalSourceId, externalSourceId),
            eq(ingestionRuns.idempotencyKey, idempotencyKey),
          ),
        );
      return rows[0];
    },

    async createRun(input) {
      const id = deps.nextId("irun");
      const inserted = await db
        .insert(ingestionRuns)
        .values({
          id,
          userId,
          externalSourceId: input.externalSourceId,
          runType: input.runType,
          idempotencyKey: input.idempotencyKey,
          status: "pending",
          recordsReceived: 0,
          recordsWritten: 0,
          recordsRejected: 0,
          startedAt: null,
          completedAt: null,
        })
        .returning();
      return inserted[0]!;
    },

    async getRun(runId) {
      return requireRun(runId);
    },

    async markRunRunning(runId) {
      const run = await requireRun(runId);
      if (run.status !== "pending") return run; // already running/terminal — no-op
      const updated = await db
        .update(ingestionRuns)
        .set({ status: "running", startedAt: run.startedAt ?? deps.now() })
        .where(
          and(eq(ingestionRuns.userId, userId), eq(ingestionRuns.id, runId)),
        )
        .returning();
      return updated[0]!;
    },

    async recordExists(runId, recordKey) {
      const rows = await db
        .select({ id: ingestionRecords.id })
        .from(ingestionRecords)
        .where(
          and(
            eq(ingestionRecords.userId, userId),
            eq(ingestionRecords.ingestionRunId, runId),
            eq(ingestionRecords.recordKey, recordKey),
          ),
        );
      return rows.length > 0;
    },

    async markRecordResult(runId, recordKey, result) {
      // Insert the ledger row idempotently (UNIQUE run_id+record_key). When the
      // row already exists the insert is a no-op and the run counters are NOT
      // bumped (a re-pushed record never double-counts, SPEC §17.2/.3).
      const inserted = await db
        .insert(ingestionRecords)
        .values({
          id: deps.nextId("irec"),
          userId,
          ingestionRunId: runId,
          recordKey,
          result,
          createdAt: deps.now(),
        })
        .onConflictDoNothing({
          target: [
            ingestionRecords.ingestionRunId,
            ingestionRecords.recordKey,
          ],
        })
        .returning();
      if (inserted.length === 0) return; // duplicate — counters untouched

      const run = await requireRun(runId);
      await db
        .update(ingestionRuns)
        .set({
          recordsReceived: run.recordsReceived + 1,
          recordsWritten:
            run.recordsWritten + (result === "written" ? 1 : 0),
          recordsRejected:
            run.recordsRejected + (result === "rejected" ? 1 : 0),
        })
        .where(
          and(eq(ingestionRuns.userId, userId), eq(ingestionRuns.id, runId)),
        );
    },

    async appendError(input) {
      const inserted = await db
        .insert(ingestionErrors)
        .values({
          id: deps.nextId("ierr"),
          userId,
          ingestionRunId: input.ingestionRunId,
          recordKey: input.recordKey,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          rejectedPayload: input.rejectedPayload,
        })
        .returning();
      return inserted[0]!;
    },

    async listErrors(runId) {
      // Ownership gate: a cross-user / unknown run surfaces as 404 BEFORE any
      // error row is read (no existence leak).
      await requireRun(runId);
      return db
        .select()
        .from(ingestionErrors)
        .where(
          and(
            eq(ingestionErrors.userId, userId),
            eq(ingestionErrors.ingestionRunId, runId),
          ),
        );
    },

    async completeRun(runId, input) {
      await requireRun(runId); // ownership gate
      const updated = await db
        .update(ingestionRuns)
        .set({ status: input.status, completedAt: input.completedAt })
        .where(
          and(eq(ingestionRuns.userId, userId), eq(ingestionRuns.id, runId)),
        )
        .returning();
      return updated[0]!;
    },
  };
}
