import type {RequestContext} from "@creatoros/contract";
import {projects,contentOutputs} from "../../schema/projects";
import {publications} from "../../schema/publishing";
import {withWorkspaceParentWrite,type WorkspaceWriteParent} from "../../workspace-write";
import {workspaceKey,workspaceFilter,workspaceStamp,assertWritableWorkspace} from "@creatoros/backend";
import { and, asc, desc, eq, type Db } from "@creatoros/backend";
import {
  rubrics,
  rubricVersions,
  predictions,
  calibrationResults,
  calibrationRuleSuggestions,
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
export type RuleSuggestionRow =
  typeof calibrationRuleSuggestions.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
  // [T-332 S2 · ISO-02/03] 第二所有权维度,**必填 strict**:逐个 list/get/count 读门恒叠
  // eq(table.accountId),写路径盖章当前号。未选号在 service 入口 requireAccountId 即被拒
  // (SPEC §4.2 引导态),无「null → 退化全量」分支。
  accountId?: string | null;
  groupId?: string | null;
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

// 复盘飞轮回流 轨B — the CalibrationRuleSuggestion write/read inputs.
export interface ProposedDimension {
  key: string;
  label: string;
  weight: number;
  description: string;
}

export interface CreateRuleSuggestionInput {
  learningId: string;
  rubricId: string;
  proposedDimension: ProposedDimension;
  rationale: string;
}

export interface CalibrationRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedRubrics(rows: RubricRow[]): Promise<void>;
  seedRubricVersions(rows: RubricVersionRow[]): Promise<void>;
  // Canonical seed for 校准中心 (predictions + results carrying the 维度评分约定 jsonb), so the
  // overview KPI / 回流对照 / 中栏评分表 resolve real rows. onConflictDoNothing (idempotent).
  seedPredictions(rows: PredictionRow[]): Promise<void>;
  seedResults(rows: CalibrationResultRow[]): Promise<void>;
  // 复盘飞轮回流 轨B — canonical seed for the CalibrationRuleSuggestion (so the 校准中心 demo
  // shows a real pending reflow suggestion). onConflictDoNothing → idempotent.
  seedRuleSuggestions(rows: RuleSuggestionRow[]): Promise<void>;

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
  // GAP-CAL-1: user-scoped 盲预测 list (createdAt desc) + total count, for pagination.
  listPredictions(page: {
    limit: number;
    offset: number;
  }): Promise<{ rows: PredictionRow[]; total: number }>;

  createResult(input: CreateResultInput): Promise<CalibrationResultRow>;
  getResultByPrediction(
    predictionId: string,
  ): Promise<CalibrationResultRow | null>;

  // --- Overview reads (校准中心总览, Slice 1) — all user-scoped, derived at read time. ---
  // All predictions for the user (createdAt desc), no pagination — the overview derives
  // KPI counts + per-subject badges + reflow joins from the full set (the canonical
  // dataset is small; if it grows, page this).
  listAllPredictions(): Promise<PredictionRow[]>;
  // All calibration results for the user (createdAt desc) — drives completedReflows count,
  // avgDeviation, latestFinding, and the reflow对照 join (result ⋈ its prediction).
  listAllResults(): Promise<CalibrationResultRow[]>;

  // --- 复盘飞轮回流 轨B (Learning→校准) CalibrationRuleSuggestion ---
  // Idempotent on (learning_id, rubric_id, status='pending'): a re-reflow of the same
  // Learning onto the same Rubric returns the EXISTING pending suggestion (never a dup).
  createRuleSuggestion(
    input: CreateRuleSuggestionInput,
  ): Promise<RuleSuggestionRow>;
  // The ownership-gated single read (cross-user / unknown → OwnershipError → 404).
  getRuleSuggestion(suggestionId: string): Promise<RuleSuggestionRow>;
  // User-scoped pending-suggestion list (createdAt desc) + total, for pagination.
  listPendingRuleSuggestions(page: {
    limit: number;
    offset: number;
  }): Promise<{ rows: RuleSuggestionRow[]; total: number }>;
  // Mark a suggestion terminal (adopted|dismissed); stamps adoptedVersionId + adoptedAt.
  // SQL guard `status='pending'` backs the terminal invariant at the DB layer.
  markRuleSuggestionAdopted(
    suggestionId: string,
    input: { status: "adopted" | "dismissed"; adoptedVersionId: string | null },
  ): Promise<RuleSuggestionRow>;
}

export function createCalibrationRepository(
  db: Db,
  deps: RepoDeps,
): CalibrationRepository {
  const scope = workspaceKey(deps);
  const stamp = workspaceStamp(scope);
  const ctx:RequestContext={userId:deps.userId,...stamp,requestId:"calibration-parent-write",source:"user"};
  const writable = () => assertWritableWorkspace(db, {userId:deps.userId,...stamp,requestId:"shared-domain-write",source:"user"});
  async function getRubricRow(rubricId: string): Promise<RubricRow> {
    const rows = await db
      .select()
      .from(rubrics)
      .where(
        and(
          eq(rubrics.userId, deps.userId),
          // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
          workspaceFilter(rubrics, scope),
          eq(rubrics.id, rubricId),
        ),
      );
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
          // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
          workspaceFilter(rubricVersions, scope),
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
          // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
          workspaceFilter(predictions, scope),
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

    async seedPredictions(rows) {
      if (rows.length === 0) return;
      await db.insert(predictions).values(rows).onConflictDoNothing();
    },

    async seedResults(rows) {
      if (rows.length === 0) return;
      await db.insert(calibrationResults).values(rows).onConflictDoNothing();
    },

    async seedRuleSuggestions(rows) {
      if (rows.length === 0) return;
      await db
        .insert(calibrationRuleSuggestions)
        .values(rows)
        .onConflictDoNothing();
    },

    async createRubric({ name }) {
      await writable();
      const inserted = await db
        .insert(rubrics)
        .values({
          id: deps.nextId("rubric"),
          userId: deps.userId,
          // [T-332 S2 · ISO-03] 号维度盖章(必填,无 null 兜底)。
          ...stamp,
          name,
          currentVersionId: null,
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async insertRubricVersion(input) {
      await writable();
      const parent=await getRubricRow(input.rubricId);
      if(scope.kind==="group")await assertWritableWorkspace(db,ctx);
      // Never an update — each call is a NEW immutable row (data-model 约束 6).
      const inserted = await db
        .insert(rubricVersions)
        .values({
          id: deps.nextId("rubricver"),
          userId: deps.userId,
          // [T-332 S2 · ISO-03] 号维度盖章(与父 rubric 同号;必填)。
          ...stamp, groupId: parent.groupId ?? stamp.groupId,
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
      await writable();
      const version=await getRubricVersionRow(versionId);
      if(version.rubricId!==rubricId)throw new OwnershipError("Rubric version not found");
      await getRubricRow(rubricId); // scoped ownership gate
      // The ONLY rubric mutation — re-points the pointer; version rows stay immutable.
      const updated = await db
        .update(rubrics)
        .set({ currentVersionId: versionId })
        .where(and(eq(rubrics.userId, deps.userId), workspaceFilter(rubrics, scope), eq(rubrics.id, rubricId)))
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
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(rubricVersions, scope),
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
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(rubricVersions, scope),
            eq(rubricVersions.rubricId, rubricId),
          ),
        );
      return rows.length;
    },

    async createPrediction(input) {
      const subjectParent:WorkspaceWriteParent={table:projects,id:projects.id,userId:projects.userId,groupId:projects.groupId,accountId:projects.accountId,via:[{table:contentOutputs,id:contentOutputs.id,parentId:contentOutputs.projectId}]};
      if(input.subjectType==="publication")subjectParent.via!.push({table:publications,id:publications.id,parentId:publications.contentOutputId,userId:publications.userId,scope:{groupId:publications.groupId,accountId:publications.accountId}});
      else if(input.subjectType!=="content_output")throw new OwnershipError("校准对象不存在");
      return withWorkspaceParentWrite(db,ctx,subjectParent,[input.subjectId],async tx=>
        withWorkspaceParentWrite(tx as unknown as Db,ctx,{table:rubrics,id:rubrics.id,userId:rubrics.userId,groupId:rubrics.groupId,accountId:rubrics.accountId,via:[{table:rubricVersions,id:rubricVersions.id,parentId:rubricVersions.rubricId,userId:rubricVersions.userId,scope:{groupId:rubricVersions.groupId,accountId:rubricVersions.accountId}}]},[input.rubricVersionId],async writeTx=>{
      const parent=await createCalibrationRepository(writeTx as unknown as Db,deps).getRubricVersion(input.rubricVersionId);
      const inserted = await writeTx
        .insert(predictions)
        .values({
          id: deps.nextId("pred"),
          userId: deps.userId,
          // [T-332 S2 · ISO-03] 号维度盖章(必填,无 null 兜底)。
          ...stamp, groupId: parent.groupId ?? stamp.groupId,
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
      }));
    },

    async lockPrediction(predictionId) {
      await writable();
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
            workspaceFilter(predictions, scope),
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

    async listPredictions({ limit, offset }) {
      // [T-332 S2 · ISO-02] 号维度 strict 恒叠(无「无号全量」退化)。
      const where = and(
        eq(predictions.userId, deps.userId),
        workspaceFilter(predictions, scope),
      );
      const rows = await db
        .select()
        .from(predictions)
        .where(where)
        .orderBy(desc(predictions.createdAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: predictions.id })
        .from(predictions)
        .where(where);
      return { rows, total: all.length };
    },

    async createResult(input) {
      await writable();
      const parent=await getPredictionRow(input.predictionId);
      if(scope.kind==="group")await assertWritableWorkspace(db,ctx);
      // Idempotent on UNIQUE prediction_id: a re-submit inserts nothing and the
      // read-back returns the existing row (never double-feeds the rubric/Learning).
      await db
        .insert(calibrationResults)
        .values({
          id: deps.nextId("calibres"),
          userId: deps.userId,
          // [T-332 S2 · ISO-03] 号维度盖章(与父 prediction 同号;必填)。
          ...stamp, groupId: parent.groupId ?? stamp.groupId,
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
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(calibrationResults, scope),
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
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(calibrationResults, scope),
            eq(calibrationResults.predictionId, predictionId),
          ),
        );
      return rows[0] ?? null;
    },

    async listAllPredictions() {
      return db
        .select()
        .from(predictions)
        .where(
          and(
            eq(predictions.userId, deps.userId),
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(predictions, scope),
          ),
        )
        .orderBy(desc(predictions.createdAt));
    },

    async listAllResults() {
      return db
        .select()
        .from(calibrationResults)
        .where(
          and(
            eq(calibrationResults.userId, deps.userId),
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(calibrationResults, scope),
          ),
        )
        .orderBy(desc(calibrationResults.createdAt));
    },

    async createRuleSuggestion(input) {
      await writable();
      // Idempotent reflow: if a PENDING suggestion already exists for this
      // (learning, rubric), return it instead of inserting a duplicate — re-clicking
      // 回流到校准 never spawns a second pending row.
      const existing = await db
        .select()
        .from(calibrationRuleSuggestions)
        .where(
          and(
            eq(calibrationRuleSuggestions.userId, deps.userId),
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(calibrationRuleSuggestions, scope),
            eq(calibrationRuleSuggestions.learningId, input.learningId),
            eq(calibrationRuleSuggestions.rubricId, input.rubricId),
            eq(calibrationRuleSuggestions.status, "pending"),
          ),
        );
      if (existing[0]) return existing[0];
      const inserted = await db
        .insert(calibrationRuleSuggestions)
        .values({
          id: deps.nextId("calibsug"),
          userId: deps.userId,
          // [T-332 S2 · ISO-03] 号维度盖章(必填,无 null 兜底)。
          ...stamp,
          learningId: input.learningId,
          rubricId: input.rubricId,
          status: "pending",
          proposedDimension: input.proposedDimension,
          rationale: input.rationale,
          adoptedVersionId: null,
          createdAt: deps.now(),
          adoptedAt: null,
        })
        .returning();
      return inserted[0]!;
    },

    async getRuleSuggestion(suggestionId) {
      const rows = await db
        .select()
        .from(calibrationRuleSuggestions)
        .where(
          and(
            eq(calibrationRuleSuggestions.userId, deps.userId),
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(calibrationRuleSuggestions, scope),
            eq(calibrationRuleSuggestions.id, suggestionId),
          ),
        );
      const row = rows[0];
      if (!row) {
        throw new OwnershipError(
          `OwnershipError: calibration rule suggestion not found: ${suggestionId}`,
        );
      }
      return row;
    },

    async listPendingRuleSuggestions({ limit, offset }) {
      // [T-332 S2 · ISO-02] 号维度 strict 恒叠(无「无号全量」退化)。
      const where = and(
        eq(calibrationRuleSuggestions.userId, deps.userId),
        workspaceFilter(calibrationRuleSuggestions, scope),
        eq(calibrationRuleSuggestions.status, "pending"),
      );
      const rows = await db
        .select()
        .from(calibrationRuleSuggestions)
        .where(where)
        .orderBy(desc(calibrationRuleSuggestions.createdAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: calibrationRuleSuggestions.id })
        .from(calibrationRuleSuggestions)
        .where(where);
      return { rows, total: all.length };
    },

    async markRuleSuggestionAdopted(suggestionId, input) {
      await writable();
      // SQL `status='pending'` guard backs the terminal invariant (a re-adopt of an
      // already-terminal suggestion matches 0 rows). The service enforces the state
      // machine + ownership on top.
      const updated = await db
        .update(calibrationRuleSuggestions)
        .set({
          status: input.status,
          adoptedVersionId: input.adoptedVersionId,
          adoptedAt: deps.now(),
        })
        .where(
          and(
            eq(calibrationRuleSuggestions.userId, deps.userId),
            workspaceFilter(calibrationRuleSuggestions, scope),
            eq(calibrationRuleSuggestions.id, suggestionId),
            eq(calibrationRuleSuggestions.status, "pending"),
          ),
        )
        .returning();
      return updated[0]!;
    },
  };
}
