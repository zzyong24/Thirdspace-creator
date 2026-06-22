import { eq, and, asc } from "drizzle-orm";
import type { Db } from "../db";
import { candidates, audienceSignals, topicPromotions } from "../schema/candidate";

// 七步整合设计 §5 — 选题情报层 repository (Candidate + AudienceSignal +
// TopicPromotion). Mirrors project-repository / knowledge-repository exactly:
// injected clock + id generator + userId from RequestContext; NO Date.now /
// Math.random / fetch inside; user-scoped ownership; cross-user/missing rows hit
// the same "OwnershipError: ... not found" 404 surface the references use.

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type CandidateRow = typeof candidates.$inferSelect;
type SignalRow = typeof audienceSignals.$inferSelect;
type PromotionRow = typeof topicPromotions.$inferSelect;

type CandidateSource = "trend" | "benchmark" | "demand" | "idea";
type CandidateStatus = "pool" | "promoted" | "dropped";

// Candidate owns NO new state machine (hard constraint C-3). The only legal
// status moves are human-curation edges out of the `pool`: pool -> promoted
// (via the promote op) and pool -> dropped. promoted/dropped are terminal.
const ALLOWED_STATUS_MOVES: Record<CandidateStatus, CandidateStatus[]> = {
  pool: ["promoted", "dropped"],
  promoted: [],
  dropped: [],
};

export interface CandidateRepository {
  seedCandidates(rows: CandidateRow[]): Promise<void>;
  list(): Promise<CandidateRow[]>;
  get(candidateId: string): Promise<CandidateRow>;
  create(input: {
    title: string;
    angle?: string;
    source?: CandidateSource;
    contentRole?: string | null;
    productAnchorId?: string | null;
    positioningFit?: number | null;
    predictedScore?: number | null;
    aiTaskId?: string | null;
  }): Promise<CandidateRow>;
  patch(
    candidateId: string,
    patch: {
      title?: string;
      angle?: string;
      contentRole?: string | null;
      productAnchorId?: string | null;
      positioningFit?: number | null;
      predictedScore?: number | null;
    },
  ): Promise<CandidateRow>;
  drop(candidateId: string): Promise<CandidateRow>;
  // promote moves pool -> promoted and APPEND-records a TopicPromotion. The
  // unique index uq_topic_promotions_candidate backs the at-most-one invariant;
  // onConflictDoNothing makes a repeat promote idempotent (no dup record).
  promote(
    candidateId: string,
    input: { projectId: string },
  ): Promise<{ candidate: CandidateRow; promotion: PromotionRow }>;
  listPromotions(candidateId: string): Promise<PromotionRow[]>;
  // demand_count is a maintained denormalization: linking a signal bumps it and
  // recomputes from the audience_signals index (derived-field discipline — a
  // free patch NEVER sets it).
  linkSignal(
    candidateId: string,
    input: { signalId: string },
  ): Promise<CandidateRow>;
  // AudienceSignal reads/aggregates only — writes ride Ingestion (C-4). seed is
  // exposed so tests/fixtures can stage signals the way Ingestion would.
  seedSignals(rows: SignalRow[]): Promise<void>;
  // TODO(candidate): AudienceSignal ingest/aggregate read ops (e.g. list signals
  // by candidate, demand-tag rollups) are deferred — they belong to the
  // Ingestion-driven write path (C-4) and are out of scope for the core entity.
}

export function createCandidateRepository(
  db: Db,
  deps: RepoDeps,
): CandidateRepository {
  // Owner-scoped read: a row owned by another user is invisible → same
  // "not found" surface the reference repos use for cross-user / missing rows.
  async function get(candidateId: string): Promise<CandidateRow> {
    const rows = await db
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.id, candidateId),
          eq(candidates.userId, deps.userId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: candidate not found: ${candidateId}`);
    }
    return row;
  }

  // Recompute demand_count from the live signal index (source of truth) and
  // persist it; returns the refreshed candidate row.
  async function recomputeDemandCount(
    candidateId: string,
    ts: string,
  ): Promise<CandidateRow> {
    const linked = await db
      .select()
      .from(audienceSignals)
      .where(
        and(
          eq(audienceSignals.linkedCandidateId, candidateId),
          eq(audienceSignals.userId, deps.userId),
        ),
      );
    const updated = await db
      .update(candidates)
      .set({ demandCount: linked.length, updatedAt: ts })
      .where(eq(candidates.id, candidateId))
      .returning();
    return updated[0]!;
  }

  return {
    async seedCandidates(rows) {
      if (rows.length === 0) return;
      await db.insert(candidates).values(rows).onConflictDoNothing();
    },

    async seedSignals(rows) {
      if (rows.length === 0) return;
      await db.insert(audienceSignals).values(rows).onConflictDoNothing();
    },

    async list() {
      return db
        .select()
        .from(candidates)
        .where(eq(candidates.userId, deps.userId))
        .orderBy(asc(candidates.createdAt));
    },

    get,

    async create(input) {
      const ts = deps.now();
      const inserted = await db
        .insert(candidates)
        .values({
          id: deps.nextId("candidate"),
          userId: deps.userId,
          title: input.title,
          angle: input.angle ?? "",
          source: input.source ?? "idea",
          contentRole: input.contentRole ?? null,
          productAnchorId: input.productAnchorId ?? null,
          positioningFit: input.positioningFit ?? null,
          predictedScore: input.predictedScore ?? null,
          demandCount: 0, // derived — starts at 0, only linkSignal mutates it
          status: "pool",
          aiTaskId: input.aiTaskId ?? null,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning();
      return inserted[0]!;
    },

    // Free patch of curation fields. Deliberately CANNOT set demandCount or
    // status (derived / FSM-guarded) — those have dedicated ops.
    async patch(candidateId, patch) {
      await get(candidateId); // ownership + existence gate
      const set: Partial<CandidateRow> = { updatedAt: deps.now() };
      if (patch.title !== undefined) set.title = patch.title;
      if (patch.angle !== undefined) set.angle = patch.angle;
      if (patch.contentRole !== undefined) set.contentRole = patch.contentRole;
      if (patch.productAnchorId !== undefined)
        set.productAnchorId = patch.productAnchorId;
      if (patch.positioningFit !== undefined)
        set.positioningFit = patch.positioningFit;
      if (patch.predictedScore !== undefined)
        set.predictedScore = patch.predictedScore;
      const updated = await db
        .update(candidates)
        .set(set)
        .where(eq(candidates.id, candidateId))
        .returning();
      return updated[0]!;
    },

    async drop(candidateId) {
      const current = await get(candidateId);
      if (!ALLOWED_STATUS_MOVES[current.status as CandidateStatus].includes("dropped")) {
        throw new Error(
          `ConflictError: illegal candidate status transition ${current.status} -> dropped`,
        );
      }
      const ts = deps.now();
      const updated = await db
        .update(candidates)
        .set({ status: "dropped", updatedAt: ts })
        .where(eq(candidates.id, candidateId))
        .returning();
      return updated[0]!;
    },

    async promote(candidateId, { projectId }) {
      const current = await get(candidateId);
      if (!ALLOWED_STATUS_MOVES[current.status as CandidateStatus].includes("promoted")) {
        throw new Error(
          `ConflictError: illegal candidate status transition ${current.status} -> promoted`,
        );
      }
      const ts = deps.now();

      // Idempotent UNIQUE insert: uq_topic_promotions_candidate guarantees at
      // most one promotion per candidate; a repeat promote is a no-op insert.
      await db
        .insert(topicPromotions)
        .values({
          id: deps.nextId("promotion"),
          userId: deps.userId,
          candidateId,
          projectId,
          promotedAt: ts,
        })
        .onConflictDoNothing();

      const updated = await db
        .update(candidates)
        .set({ status: "promoted", updatedAt: ts })
        .where(eq(candidates.id, candidateId))
        .returning();

      const promotionRows = await db
        .select()
        .from(topicPromotions)
        .where(eq(topicPromotions.candidateId, candidateId));

      return { candidate: updated[0]!, promotion: promotionRows[0]! };
    },

    async listPromotions(candidateId) {
      await get(candidateId); // ownership + existence gate
      return db
        .select()
        .from(topicPromotions)
        .where(
          and(
            eq(topicPromotions.candidateId, candidateId),
            eq(topicPromotions.userId, deps.userId),
          ),
        )
        .orderBy(asc(topicPromotions.promotedAt));
    },

    async linkSignal(candidateId, { signalId }) {
      await get(candidateId); // ownership + existence gate on the candidate
      const ts = deps.now();

      // Point the signal at this candidate (owner-scoped), then recompute the
      // derived demand_count from the index.
      await db
        .update(audienceSignals)
        .set({ linkedCandidateId: candidateId })
        .where(
          and(
            eq(audienceSignals.id, signalId),
            eq(audienceSignals.userId, deps.userId),
          ),
        );

      return recomputeDemandCount(candidateId, ts);
    },
  };
}
