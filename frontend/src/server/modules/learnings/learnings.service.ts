import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createLearningsRepository,
  type LearningsRepository,
  type RepoDeps,
} from "./learnings.repository";
import {
  toLearningDto,
  toLearningApplicationDto,
  type LearningResource,
  type LearningApplicationResource,
} from "./learnings.schema";
import { ConflictError } from "./learnings.errors";

// Learnings service (foundation §5.3) — every public method takes
// `(ctx: RequestContext, …)` and builds a repository bound to `ctx.userId`
// (createLearningsRepository(db, { now, nextId, userId: ctx.userId })) so scoping is
// structural. The Projects peer is reached ONLY through an injected narrow PORT
// (mirrors reviews' ReviewsProjectsPort) — no cross-module repository import (SPEC
// §22). The port is satisfied at composition time by the Projects public service.

// The Projects seam: the apply-target ownership gate + the post-commit activity
// append. assertOwnsProject throws OwnershipError (→ 404) for a cross-user / unknown
// projectId BEFORE any application row is written. recordActivity is best-effort
// (SPEC §11: an activity-append failure must not roll back the application fact) —
// the composition adapter swallows its own errors.
export interface LearningsProjectsPort {
  assertOwnsProject(ctx: RequestContext, projectId: string): Promise<void>;
  recordActivity(
    ctx: RequestContext,
    input: { projectId: string; eventType: string; refId: string },
  ): Promise<void>;
}

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  projects: LearningsProjectsPort;
}

export interface PromoteReviewInsightInput {
  reviewId: string;
  insightTitle: string;
  insightBody: string;
  learningType: string;
  recommendation: string;
}

export interface LearningsService {
  listLearnings(
    ctx: RequestContext,
    page: { limit: number; offset: number },
  ): Promise<{ rows: LearningResource[]; total: number }>;
  // Single-learning read (contract op learnings.get). Ownership-gated; the DTO
  // carries the real reuseCount (application count) like the list read.
  getLearning(
    ctx: RequestContext,
    learningId: string,
  ): Promise<LearningResource>;
  createLearning(
    ctx: RequestContext,
    body: { title: string; insight?: string },
  ): Promise<LearningResource>;
  // The Reviews→Learnings bridge (roadmap §4 G13/G14). Called by ReviewsService via
  // this module's index.ts public interface only (no Reviews repo import here, no
  // Learnings repo import there).
  promoteReviewInsight(
    ctx: RequestContext,
    input: PromoteReviewInsightInput,
  ): Promise<LearningResource>;
  applyLearning(
    ctx: RequestContext,
    learningId: string,
    body: { projectId: string; applicationNote?: string },
  ): Promise<LearningApplicationResource>;
  evaluateLearning(
    ctx: RequestContext,
    learningId: string,
    body: { validationStatus?: "candidate" | "validated" | "discarded" },
  ): Promise<LearningResource>;
  // Wave-4 DashboardQueryService consumer (foundation §7 / SPEC §19): validated
  // learnings, confidenceScore desc, capped at `limit` (default 3). No contract op.
  getSuggestions(
    ctx: RequestContext,
    opts: { limit?: number },
  ): Promise<LearningResource[]>;
}

// Allowed validationStatus transitions (SPEC §12 + contract enum). candidate is the
// source state; discarded is terminal. Same-state and any unlisted transition →
// ConflictError.
const ALLOWED_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  candidate: new Set(["validated", "discarded"]),
  validated: new Set(["discarded"]),
  discarded: new Set(),
};

export function createLearningsService(deps: ServiceDeps): LearningsService {
  const { db, now, nextId, projects } = deps;

  function repoFor(ctx: RequestContext): LearningsRepository {
    const repoDeps: RepoDeps = { now, nextId, userId: ctx.userId };
    return createLearningsRepository(db, repoDeps);
  }

  // Deterministic, reuse-driven confidence (plan Step 3, open-question #3):
  //   confidenceScore = min(100, applicationCount * 20 + (validated ? 40 : 0))
  // Pure/int; NO Math.random, NO Date.now (the only clock is the injected `now`).
  function computeConfidence(
    applicationCount: number,
    nextStatus: string,
  ): number {
    return Math.min(
      100,
      applicationCount * 20 + (nextStatus === "validated" ? 40 : 0),
    );
  }

  return {
    async listLearnings(ctx, page) {
      const repo = repoFor(ctx);
      const { rows, total } = await repo.listLearnings(page);
      // Reuse signal: one grouped read of learningApplications for the page's ids
      // (degrades to 0 per learning if the aggregate fails or has no rows).
      let counts: Map<string, number>;
      try {
        counts = await repo.countApplicationsByLearning(rows.map((r) => r.id));
      } catch {
        counts = new Map<string, number>();
      }
      return {
        rows: rows.map((r) => toLearningDto(r, counts.get(r.id) ?? 0)),
        total,
      };
    },

    async getLearning(ctx, learningId) {
      const repo = repoFor(ctx);
      const row = await repo.getLearningRowById(learningId); // ownership gate
      let reuseCount = 0;
      try {
        reuseCount = await repo.countApplications(learningId);
      } catch {
        reuseCount = 0;
      }
      return toLearningDto(row, reuseCount);
    },

    async createLearning(ctx, body) {
      // The contract body has only title + insight. Fill the non-input DTO fields
      // deterministically (richer typing comes from the Reviews bridge / later edit).
      const row = await repoFor(ctx).createLearning({
        title: body.title,
        insight: body.insight ?? "",
        learningType: "strategy",
        recommendation: "",
        reviewId: null,
        confidenceScore: 0,
      });
      return toLearningDto(row);
    },

    async promoteReviewInsight(ctx, input) {
      const row = await repoFor(ctx).createLearning({
        title: input.insightTitle,
        insight: input.insightBody,
        learningType: input.learningType,
        recommendation: input.recommendation,
        reviewId: input.reviewId,
        confidenceScore: 0,
      });
      return toLearningDto(row);
    },

    async applyLearning(ctx, learningId, body) {
      const repo = repoFor(ctx);
      // 1. Parent-learning ownership gate (cross-user / unknown → OwnershipError →
      //    404) BEFORE the project gate / any write.
      await repo.getLearningRowById(learningId);
      // 2. Apply-target project ownership (Projects public service; no repo import).
      //    Cross-user project → OwnershipError propagates; no application row written.
      await projects.assertOwnsProject(ctx, body.projectId);
      // 3. Persist the application (parent ownership re-checked inside the repo).
      const row = await repo.createApplication(learningId, {
        projectId: body.projectId,
        applicationNote: body.applicationNote ?? "",
      });
      // 4. Post-commit activity (best-effort; failure must not roll back the fact).
      await projects.recordActivity(ctx, {
        projectId: body.projectId,
        eventType: "learning_applied",
        refId: learningId,
      });
      return toLearningApplicationDto(row);
    },

    async evaluateLearning(ctx, learningId, body) {
      const repo = repoFor(ctx);
      const current = await repo.getLearningRowById(learningId); // ownership gate
      const nextStatus = body.validationStatus ?? current.validationStatus;

      // Status guard: only enforced when an explicit (and different) target is given.
      // Omitted validationStatus = a no-op re-evaluation (recompute confidence only).
      if (
        body.validationStatus &&
        body.validationStatus !== current.validationStatus
      ) {
        const allowed = ALLOWED_TRANSITIONS[current.validationStatus] ?? new Set();
        if (!allowed.has(body.validationStatus)) {
          throw new ConflictError(
            `illegal learning transition: ${current.validationStatus} → ${body.validationStatus}`,
          );
        }
      } else if (
        body.validationStatus &&
        body.validationStatus === current.validationStatus
      ) {
        // Same-state re-evaluation is a no-op transition → ConflictError.
        throw new ConflictError(
          `learning is already ${current.validationStatus}`,
        );
      }

      // Recompute confidenceScore (validated-by-reuse).
      const applicationCount = await repo.countApplications(learningId);
      const confidenceScore = computeConfidence(applicationCount, nextStatus);
      const row = await repo.updateLearningStatus(learningId, {
        validationStatus: nextStatus,
        confidenceScore,
      });
      return toLearningDto(row);
    },

    async getSuggestions(ctx, opts) {
      const limit = opts.limit ?? 3;
      // Scoped read of the user's learnings; filter to validated, sort by
      // confidenceScore desc, cap at limit. A bounded page is enough for the feed.
      const { rows } = await repoFor(ctx).listLearnings({
        limit: 200,
        offset: 0,
      });
      return rows
        .filter((r) => r.validationStatus === "validated")
        .sort((a, b) => b.confidenceScore - a.confidenceScore)
        .slice(0, limit)
        .map(toLearningDto);
    },
  };
}
