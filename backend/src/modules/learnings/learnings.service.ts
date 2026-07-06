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

// 复盘飞轮回流 轨B (Learning→校准). The narrow cross-module write seam: a 复盘 Learning is
// promoted into a real CalibrationRuleSuggestion through the Calibration PUBLIC service (no
// cross-module repository import, SPEC §22). The composition root binds this to
// calibrationService.createRuleSuggestion + a current-rubric resolver. `proposedDimension` is
// the 维度建议 derived from the Learning; `rubricId` is the target Rubric (resolved by the
// composition seam — the user's current rubric). Returns the opaque suggestion DTO the
// transport re-shapes onto the wire. A SOFT dep: absent / rejecting → the op surfaces an
// honest error (the FE never shows the button unless this is wired).
export interface CalibrationRuleSuggestionDto {
  id: string;
  userId: string;
  learningId: string;
  rubricId: string;
  status: "pending" | "adopted" | "dismissed";
  proposedDimension: {
    key: string;
    label: string;
    weight: number;
    description: string;
  };
  rationale: string;
  adoptedVersionId: string | null;
  createdAt: string;
  adoptedAt: string | null;
}

export interface LearningsCalibrationPort {
  // Resolve the user's current rubric id (the 采纳 target). Null when the user has no
  // rubric yet — the service then rejects the reflow with a ConflictError (nothing to bump).
  resolveCurrentRubricId(ctx: RequestContext): Promise<string | null>;
  // Create the CalibrationRuleSuggestion against the resolved rubric (ownership gated in the
  // calibration service). Returns the persisted suggestion DTO.
  createSuggestion(
    ctx: RequestContext,
    input: {
      learningId: string;
      rubricId: string;
      proposedDimension: {
        key: string;
        label: string;
        weight: number;
        description: string;
      };
      rationale: string;
    },
  ): Promise<CalibrationRuleSuggestionDto>;
}

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  projects: LearningsProjectsPort;
  // 复盘飞轮回流 轨B — OPTIONAL cross-module seam. Wired at composition; when absent the
  // suggestCalibrationRule op rejects with a ConflictError (the FE hides the button).
  calibration?: LearningsCalibrationPort;
}

// 复盘飞轮回流 轨B — the suggestCalibrationRule body. Every field is optional; the service
// fills sensible defaults from the source Learning (its title/type), so the FE can fire the
// reflow with NO body (the simplest 「回流到校准」 one-click) OR override the 维度建议.
export interface SuggestCalibrationRuleInput {
  rubricId?: string;
  dimensionKey?: string;
  dimensionLabel?: string;
  weight?: number;
  description?: string;
  rationale?: string;
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
    // [T-118a] 可选窄化过滤(projectId / validationStatus);省略 → 全量。归属门在 repo
    // 层始终最外层,过滤只是 AND 收窄。
    filter?: { projectId?: string; validationStatus?: string },
  ): Promise<{ rows: LearningResource[]; total: number }>;
  // Single-learning read (contract op learnings.get). Ownership-gated; the DTO
  // carries the real reuseCount (application count) like the list read.
  getLearning(
    ctx: RequestContext,
    learningId: string,
  ): Promise<LearningResource>;
  createLearning(
    ctx: RequestContext,
    // [T-118a gate-F3] additive projectId:复盘产经验采纳时带上来源作品(project-scoped 读的锚);
    // 手录/无上下文来源省略 → null(旧行为)。
    body: {
      title: string;
      insight?: string;
      learningType?: string;
      projectId?: string | null;
    },
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
  // [T-062a gate-F1] 裁决台 inline 编辑(contract op learnings.patch):不动状态机,
  // 只改文本/类型;评估仍走 evaluateLearning。
  patchLearning(
    ctx: RequestContext,
    learningId: string,
    body: { title?: string; insight?: string; learningType?: string },
  ): Promise<LearningResource>;
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
  // 复盘飞轮回流 轨B (Learning→校准, contract op learnings.calibrationSuggestions.create) —
  // promote a 复盘 Learning into an EXPLICIT, adoptable CalibrationRuleSuggestion. The Learning
  // is ownership-gated first; the 维度建议 is derived from its type (or overridden by the body);
  // the write reaches Calibration ONLY through the injected port (no cross-module repo import).
  suggestCalibrationRule(
    ctx: RequestContext,
    learningId: string,
    input: SuggestCalibrationRuleInput,
  ): Promise<CalibrationRuleSuggestionDto>;
}

// learningType → a sensible default 维度建议 (key/label/weight) for the reflow. A hook/structure
// Learning suggests bumping the corresponding rubric dimension; an unknown type falls back to a
// generic 利他性 (altruism) dimension (an accepted 变现加权 direction, so the renormalized rubric
// still passes validateDimensions). The weight is a modest 0.2 (the adopt path renormalizes).
const LEARNING_TYPE_TO_DIMENSION: Record<
  string,
  { key: string; label: string; description: string }
> = {
  hook: {
    key: "hook",
    label: "钩子强度",
    description: "前3秒能否逼观众看下去（复盘回流：强化开场钩子的评分权重）",
  },
  structure: {
    key: "structure",
    label: "结构清晰度",
    description: "叙事结构是否让观众一路看完（复盘回流：把结构纳入评分维度）",
  },
  strategy: {
    key: "product_path",
    label: "为产品铺路",
    description: "内容能否为信任/转化铺路（复盘回流：强化变现导向）",
  },
  process: {
    key: "cta",
    label: "CTA 清晰度",
    description: "行动召唤是否清晰不突兀（复盘回流：把 CTA 纳入评分）",
  },
  editing: {
    key: "quotable",
    label: "金句密度",
    description: "有几句能被截图独立传播（复盘回流：强化金句维度）",
  },
  failure: {
    key: "altruism",
    label: "利他性",
    description: "内容是否真给观众价值（复盘回流：把利他性纳入评分）",
  },
  conversion_pattern: {
    key: "product_path",
    label: "为产品铺路",
    description: "内容能否为转化铺路（复盘回流：强化变现导向）",
  },
  offer_insight: {
    key: "cta",
    label: "CTA 清晰度",
    description: "行动召唤是否清晰（复盘回流：把 CTA 纳入评分）",
  },
};

const DEFAULT_REFLOW_DIMENSION = {
  key: "altruism",
  label: "利他性",
  description: "内容是否真给观众价值（复盘回流：把利他性纳入评分维度）",
};

// Allowed validationStatus transitions (SPEC §12 + contract enum). candidate is the
// source state; discarded is terminal. Same-state and any unlisted transition →
// ConflictError.
const ALLOWED_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  candidate: new Set(["validated", "discarded"]),
  validated: new Set(["discarded"]),
  discarded: new Set(),
};

export function createLearningsService(deps: ServiceDeps): LearningsService {
  const { db, now, nextId, projects, calibration } = deps;

  function repoFor(ctx: RequestContext): LearningsRepository {
    // [T-136 切片 b] 号维度透传:ctx.accountId 属主已由 resolveRequestContext 校验可信;
    // 缺省(未选号/存量)→ null → repo 读门退化不过滤。
    const repoDeps: RepoDeps = {
      now,
      nextId,
      userId: ctx.userId,
      accountId: ctx.accountId ?? null,
    };
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
    async listLearnings(ctx, page, filter) {
      const repo = repoFor(ctx);
      // [T-118a] 归属门(repoFor 已把 userId 烘进 repo)最外层;filter 只做 AND 窄化透传。
      const { rows, total } = await repo.listLearnings(page, filter);
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
      // [T-049 B17] learningType 透传(富录入表单用户可选);缺省 strategy 向后兼容。
      // [T-118a gate-F3] projectId 透传(复盘 learning_list 采纳时带上 task.projectId);
      // 手录/无来源作品时为 null。
      const row = await repoFor(ctx).createLearning({
        title: body.title,
        insight: body.insight ?? "",
        learningType: body.learningType ?? "strategy",
        recommendation: "",
        reviewId: null,
        projectId: body.projectId ?? null,
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

    async patchLearning(ctx, learningId, body) {
      const repo = repoFor(ctx);
      const row = await repo.patchLearning(learningId, body); // ownership gate inside
      let reuseCount = 0;
      try {
        reuseCount = await repo.countApplications(learningId);
      } catch {
        reuseCount = 0;
      }
      return toLearningDto(row, reuseCount);
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

    async suggestCalibrationRule(ctx, learningId, input) {
      // 1. Ownership gate: the Learning must be owned (cross-user / unknown →
      //    OwnershipError → 404) BEFORE any cross-module write.
      const learning = await repoFor(ctx).getLearningRowById(learningId);
      // 2. The reflow needs a wired Calibration seam + a target Rubric. No seam OR no
      //    rubric ⇒ nothing to bump ⇒ ConflictError (the FE only shows 回流到校准 when a
      //    rubric exists, so this is the honest defensive path, never a fake success).
      if (!calibration) {
        throw new ConflictError(
          "calibration reflow is not available (no calibration seam wired)",
        );
      }
      const rubricId =
        input.rubricId ?? (await calibration.resolveCurrentRubricId(ctx));
      if (!rubricId) {
        throw new ConflictError(
          "no rubric to reflow into — create a 评分标准 (Rubric) first",
        );
      }
      // 3. Derive the 维度建议 from the Learning's type (overridable by the body). The
      //    weight defaults to 0.2 (the adopt path renormalizes the whole set to sum 1.0).
      const base =
        LEARNING_TYPE_TO_DIMENSION[learning.learningType] ??
        DEFAULT_REFLOW_DIMENSION;
      const proposedDimension = {
        key: input.dimensionKey ?? base.key,
        label: input.dimensionLabel ?? base.label,
        weight:
          typeof input.weight === "number" && input.weight > 0
            ? input.weight
            : 0.2,
        description: input.description ?? base.description,
      };
      // The rationale ties the suggestion back to the 复盘 conclusion (the Learning's
      // title/insight) so the 校准中心 shows WHY this rule was proposed.
      const rationale =
        input.rationale ??
        (learning.title
          ? `复盘结论「${learning.title}」回流为评分维度`
          : "复盘结论回流为评分维度");
      // 4. The real cross-module write (ownership re-gated inside calibration on the rubric).
      return calibration.createSuggestion(ctx, {
        learningId,
        rubricId,
        proposedDimension,
        rationale,
      });
    },
  };
}
