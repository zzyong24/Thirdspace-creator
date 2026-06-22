import { eq, and, asc } from "drizzle-orm";
import type { Db } from "../db";
import { learnings, learningApplications } from "../schema/learnings";

// Injected dependencies — mirrors project-repository's RepoDeps so the repo stays
// deterministic (no Date.now / Math.random / fetch inside) and user-scoped.
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type LearningType =
  | "strategy"
  | "hook"
  | "structure"
  | "failure"
  | "process"
  | "conversion_pattern"
  | "offer_insight";
type ValidationStatus = "candidate" | "validated" | "discarded";

type LearningRow = typeof learnings.$inferSelect;
type ApplicationRow = typeof learningApplications.$inferSelect;

// FSM (schema §"State machine" / contract validationStatus enum):
//   candidate → validated | discarded ; validated → discarded ; discarded terminal.
// Adjacent-only: each transition must be one of these explicit edges.
const ALLOWED_TRANSITIONS: Record<ValidationStatus, ValidationStatus[]> = {
  candidate: ["validated", "discarded"],
  validated: ["discarded"],
  discarded: [],
};

export interface LearningsRepository {
  seedLearnings(rows: LearningRow[]): Promise<void>;
  list(): Promise<LearningRow[]>;
  get(learningId: string): Promise<LearningRow>;
  create(input: {
    title: string;
    insight?: string;
    learningType?: LearningType;
    reviewId?: string | null;
  }): Promise<LearningRow>;
  // evaluate = FSM transition of validationStatus (contract learnings.evaluate).
  evaluate(
    learningId: string,
    input: { validationStatus?: ValidationStatus },
  ): Promise<LearningRow>;
  createApplication(
    learningId: string,
    input: {
      projectId: string;
      applicationNote?: string;
      contentOutputId?: string | null;
    },
  ): Promise<ApplicationRow>;
  listApplications(learningId: string): Promise<ApplicationRow[]>;
  // TODO: getSuggestions / outcome-evaluation of applications are deferred — the
  // contract op set above covers the core entity (list/get/create/evaluate +
  // application create/list).
}

export function createLearningsRepository(
  db: Db,
  deps: RepoDeps,
): LearningsRepository {
  // Owner-scoped read: a row owned by another user is invisible → same
  // "not found" surface project-repository uses for cross-user / missing rows.
  async function get(learningId: string): Promise<LearningRow> {
    const rows = await db
      .select()
      .from(learnings)
      .where(
        and(eq(learnings.id, learningId), eq(learnings.userId, deps.userId)),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: learning not found: ${learningId}`);
    }
    return row;
  }

  return {
    async seedLearnings(rows) {
      if (rows.length === 0) return;
      await db.insert(learnings).values(rows).onConflictDoNothing();
    },

    async list() {
      return db
        .select()
        .from(learnings)
        .where(eq(learnings.userId, deps.userId))
        .orderBy(asc(learnings.createdAt));
    },

    get,

    async create({ title, insight, learningType, reviewId }) {
      const ts = deps.now();
      const inserted = await db
        .insert(learnings)
        .values({
          id: deps.nextId("learning"),
          userId: deps.userId,
          reviewId: reviewId ?? null,
          learningType: learningType ?? "strategy",
          title,
          insight: insight ?? "",
          recommendation: "",
          validationStatus: "candidate",
          confidenceScore: 0,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning();
      return inserted[0]!;
    },

    async evaluate(learningId, { validationStatus }) {
      const learning = await get(learningId); // ownership + existence gate
      // No-op evaluate (no target status) just touches updatedAt.
      if (validationStatus === undefined) {
        const ts = deps.now();
        const updated = await db
          .update(learnings)
          .set({ updatedAt: ts })
          .where(eq(learnings.id, learningId))
          .returning();
        return updated[0]!;
      }

      const from = learning.validationStatus as ValidationStatus;
      const to = validationStatus;
      if (from !== to && !ALLOWED_TRANSITIONS[from].includes(to)) {
        throw new Error(
          `ConflictError: illegal validation transition ${from} -> ${to}`,
        );
      }

      const ts = deps.now();
      const updated = await db
        .update(learnings)
        .set({ validationStatus: to, updatedAt: ts })
        .where(eq(learnings.id, learningId))
        .returning();
      return updated[0]!;
    },

    async createApplication(
      learningId,
      { projectId, applicationNote, contentOutputId },
    ) {
      await get(learningId); // caller must own the parent learning
      const ts = deps.now();
      const inserted = await db
        .insert(learningApplications)
        .values({
          id: deps.nextId("learning-application"),
          userId: deps.userId,
          learningId,
          projectId,
          contentOutputId: contentOutputId ?? null,
          applicationNote: applicationNote ?? "",
          outcome: {},
          appliedAt: ts,
          evaluatedAt: null,
        })
        .returning();
      return inserted[0]!;
    },

    async listApplications(learningId) {
      await get(learningId); // ownership + existence gate
      return db
        .select()
        .from(learningApplications)
        .where(
          and(
            eq(learningApplications.learningId, learningId),
            eq(learningApplications.userId, deps.userId),
          ),
        )
        .orderBy(asc(learningApplications.appliedAt));
    },
  };
}
