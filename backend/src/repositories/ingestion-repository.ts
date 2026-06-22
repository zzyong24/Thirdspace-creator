import { eq, and, asc } from "drizzle-orm";
import type { Db } from "../db";
import {
  externalSources,
  ingestionRuns,
  ingestionErrors,
  ingestionRecords,
} from "../schema/ingestion";

// Injected dependencies — mirrors project-/knowledge-repository's RepoDeps so the
// repo stays deterministic (no Date.now / Math.random / fetch inside) and
// user-scoped (userId threaded from RequestContext, stamped on every owned row).
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type ExternalSourceRow = typeof externalSources.$inferSelect;
type IngestionRunRow = typeof ingestionRuns.$inferSelect;
type IngestionErrorRow = typeof ingestionErrors.$inferSelect;
type IngestionRecordRow = typeof ingestionRecords.$inferSelect;

// Terminal run statuses — a completed/failed run cannot transition further.
const RUN_STATUS_ORDER = ["pending", "running", "succeeded", "failed"] as const;
type RunStatus = (typeof RUN_STATUS_ORDER)[number];

export interface IngestionRepository {
  // ── ExternalSource ─────────────────────────────────────────────────────────
  seedSources(rows: ExternalSourceRow[]): Promise<void>;
  listSources(): Promise<ExternalSourceRow[]>;
  getSource(sourceId: string): Promise<ExternalSourceRow>;
  createSource(input: {
    sourceType: string;
    name: string;
    sourceIdentifier?: string;
    secretReference?: string;
    configuration?: Record<string, unknown>;
  }): Promise<ExternalSourceRow>;

  // ── IngestionRun ───────────────────────────────────────────────────────────
  listRuns(sourceId: string): Promise<IngestionRunRow[]>;
  getRun(runId: string): Promise<IngestionRunRow>;
  // Idempotent on (externalSourceId, idempotencyKey): a duplicate returns the
  // ORIGINAL run, never a second row (SPEC §17.1).
  createRun(input: {
    externalSourceId: string;
    runType: string;
    idempotencyKey: string;
  }): Promise<IngestionRunRow>;
  // Adjacent-only FSM transition on run.status (pending→running→succeeded/failed).
  transitionRun(runId: string, status: RunStatus): Promise<IngestionRunRow>;

  // ── Records (internal ledger) + Errors ──────────────────────────────────────
  // Idempotent per-record push on (ingestionRunId, recordKey): a re-push is a
  // no-op that does NOT re-bump the run counters (SPEC §17.2). Returns whether
  // the record was newly written.
  pushRecord(
    runId: string,
    input: { recordKey: string; result: "written" | "rejected" },
  ): Promise<{ inserted: boolean; record: IngestionRecordRow }>;
  recordError(
    runId: string,
    input: {
      recordKey: string;
      errorCode: string;
      errorMessage?: string;
      rejectedPayload?: Record<string, unknown>;
    },
  ): Promise<IngestionErrorRow>;
  listErrors(runId: string): Promise<IngestionErrorRow[]>;

  // TODO(deferred): per-record streaming push of raw payloads + the higher-level
  // "ingest batch" orchestration (parse → write to target module → tally) live in
  // the service layer; this repo only persists the canonical entities + ledger.
}

export function createIngestionRepository(
  db: Db,
  deps: RepoDeps,
): IngestionRepository {
  // Owner-scoped read: a row owned by another user is invisible → the same
  // "not found" surface project-/knowledge-repository use for cross-user/missing.
  async function getSource(sourceId: string): Promise<ExternalSourceRow> {
    const rows = await db
      .select()
      .from(externalSources)
      .where(
        and(
          eq(externalSources.id, sourceId),
          eq(externalSources.userId, deps.userId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: external source not found: ${sourceId}`);
    }
    return row;
  }

  async function getRun(runId: string): Promise<IngestionRunRow> {
    const rows = await db
      .select()
      .from(ingestionRuns)
      .where(
        and(eq(ingestionRuns.id, runId), eq(ingestionRuns.userId, deps.userId)),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: ingestion run not found: ${runId}`);
    }
    return row;
  }

  return {
    async seedSources(rows) {
      if (rows.length === 0) return;
      await db.insert(externalSources).values(rows).onConflictDoNothing();
    },

    async listSources() {
      return db
        .select()
        .from(externalSources)
        .where(eq(externalSources.userId, deps.userId))
        .orderBy(asc(externalSources.createdAt));
    },

    getSource,

    async createSource({
      sourceType,
      name,
      sourceIdentifier,
      secretReference,
      configuration,
    }) {
      const inserted = await db
        .insert(externalSources)
        .values({
          id: deps.nextId("extsource"),
          userId: deps.userId,
          sourceType,
          name,
          sourceIdentifier: sourceIdentifier ?? "",
          secretReference: secretReference ?? "",
          configuration: configuration ?? {},
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async listRuns(sourceId) {
      await getSource(sourceId); // ownership + existence gate on the parent source
      return db
        .select()
        .from(ingestionRuns)
        .where(
          and(
            eq(ingestionRuns.externalSourceId, sourceId),
            eq(ingestionRuns.userId, deps.userId),
          ),
        )
        .orderBy(asc(ingestionRuns.startedAt));
    },

    getRun,

    // Idempotent: onConflictDoNothing on the UNIQUE (external_source_id,
    // idempotency_key) index. On conflict .returning() yields nothing, so we
    // read back the ORIGINAL run for that key — never a duplicate row.
    async createRun({ externalSourceId, runType, idempotencyKey }) {
      await getSource(externalSourceId); // caller must own the parent source
      const ts = deps.now();
      const inserted = await db
        .insert(ingestionRuns)
        .values({
          id: deps.nextId("ingrun"),
          userId: deps.userId,
          externalSourceId,
          runType,
          idempotencyKey,
          status: "pending",
          recordsReceived: 0,
          recordsWritten: 0,
          recordsRejected: 0,
          startedAt: ts,
          completedAt: null,
        })
        .onConflictDoNothing({
          target: [
            ingestionRuns.externalSourceId,
            ingestionRuns.idempotencyKey,
          ],
        })
        .returning();
      if (inserted[0]) return inserted[0];

      // Conflict → the run already exists; return the original, owner-scoped.
      const existing = await db
        .select()
        .from(ingestionRuns)
        .where(
          and(
            eq(ingestionRuns.externalSourceId, externalSourceId),
            eq(ingestionRuns.idempotencyKey, idempotencyKey),
            eq(ingestionRuns.userId, deps.userId),
          ),
        );
      return existing[0]!;
    },

    // Adjacent-only FSM: pending→running→succeeded/failed. Any non-adjacent or
    // terminal-departing move is rejected (mirrors project.transition's guard).
    async transitionRun(runId, status) {
      const run = await getRun(runId);
      const fromIdx = RUN_STATUS_ORDER.indexOf(run.status as RunStatus);
      const toIdx = RUN_STATUS_ORDER.indexOf(status);
      const legal =
        // pending → running
        (run.status === "pending" && status === "running") ||
        // running → succeeded | failed
        (run.status === "running" &&
          (status === "succeeded" || status === "failed"));
      if (fromIdx === -1 || toIdx === -1 || !legal) {
        throw new Error(
          `ConflictError: illegal run transition ${run.status} -> ${status}`,
        );
      }
      const ts = deps.now();
      const isTerminal = status === "succeeded" || status === "failed";
      const updated = await db
        .update(ingestionRuns)
        .set({ status, completedAt: isTerminal ? ts : run.completedAt })
        .where(eq(ingestionRuns.id, runId))
        .returning();
      return updated[0]!;
    },

    // Idempotent ledger insert on UNIQUE (ingestion_run_id, record_key). A first
    // push inserts AND bumps the run's received + written/rejected counters; a
    // re-push hits the conflict, inserts nothing, and leaves counters untouched.
    async pushRecord(runId, { recordKey, result }) {
      const run = await getRun(runId); // ownership + existence gate
      const inserted = await db
        .insert(ingestionRecords)
        .values({
          id: deps.nextId("ingrec"),
          userId: deps.userId,
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

      if (!inserted[0]) {
        // Duplicate record_key for this run → no-op, counters unchanged.
        const existing = await db
          .select()
          .from(ingestionRecords)
          .where(
            and(
              eq(ingestionRecords.ingestionRunId, runId),
              eq(ingestionRecords.recordKey, recordKey),
            ),
          );
        return { inserted: false, record: existing[0]! };
      }

      await db
        .update(ingestionRuns)
        .set({
          recordsReceived: run.recordsReceived + 1,
          recordsWritten:
            result === "written"
              ? run.recordsWritten + 1
              : run.recordsWritten,
          recordsRejected:
            result === "rejected"
              ? run.recordsRejected + 1
              : run.recordsRejected,
        })
        .where(eq(ingestionRuns.id, runId));

      return { inserted: true, record: inserted[0] };
    },

    async recordError(runId, { recordKey, errorCode, errorMessage, rejectedPayload }) {
      await getRun(runId); // caller must own the parent run
      const inserted = await db
        .insert(ingestionErrors)
        .values({
          id: deps.nextId("ingerr"),
          userId: deps.userId,
          ingestionRunId: runId,
          recordKey,
          errorCode,
          errorMessage: errorMessage ?? "",
          rejectedPayload: rejectedPayload ?? {},
        })
        .returning();
      return inserted[0]!;
    },

    async listErrors(runId) {
      await getRun(runId); // ownership + existence gate
      return db
        .select()
        .from(ingestionErrors)
        .where(
          and(
            eq(ingestionErrors.ingestionRunId, runId),
            eq(ingestionErrors.userId, deps.userId),
          ),
        );
    },
  };
}
