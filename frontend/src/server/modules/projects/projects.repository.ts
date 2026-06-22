import { and, eq, asc, type Db } from "@creatoros/backend";
import {
  projects,
  projectActivities,
  projectStages,
  projectTargetPlatforms,
  contentOutputs,
  outputStages,
  tasks,
} from "./projects.db-schema";
import type { RequestContext } from "@creatoros/contract";
import { OwnershipError } from "./projects.errors";

// Projects repository (foundation §5.2) — user-scoped queries ONLY. Every method
// takes `ctx: RequestContext` first. Every ROOT query filters
// `eq(projects.userId, ctx.userId)`; child reads first resolve + ownership-check
// the parent project, then filter by the parent FK. Inserts stamp `ctx.userId` on
// root rows. Cross-user / missing → OwnershipError (→ 404, SPEC §11/§20: no
// existence leak). The repository executes only service-approved writes — it owns
// no state machine (SPEC §12 last line).

export type ProjectRow = typeof projects.$inferSelect;
export type ActivityRow = typeof projectActivities.$inferSelect;
export type StageRow = typeof projectStages.$inferSelect;
export type TargetPlatformRow = typeof projectTargetPlatforms.$inferSelect;
export type ContentOutputRow = typeof contentOutputs.$inferSelect;
export type OutputStageRow = typeof outputStages.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;

export interface ProjectRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedProjects(rows: ProjectRow[]): Promise<void>;
  seedStages(rows: StageRow[]): Promise<void>;
  seedPlatforms(rows: TargetPlatformRow[]): Promise<void>;
  seedOutputs(rows: ContentOutputRow[]): Promise<void>;
  seedOutputStages(rows: OutputStageRow[]): Promise<void>;
  seedTasks(rows: TaskRow[]): Promise<void>;
  seedActivities(rows: ActivityRow[]): Promise<void>;

  // Project root (user-scoped).
  list(ctx: RequestContext): Promise<ProjectRow[]>;
  get(ctx: RequestContext, projectId: string): Promise<ProjectRow>;
  insertProject(ctx: RequestContext, row: ProjectRow): Promise<ProjectRow>;
  updateProjectRow(
    ctx: RequestContext,
    projectId: string,
    set: Partial<ProjectRow>,
  ): Promise<ProjectRow>;

  // Activity (ownership via parent project).
  listActivity(ctx: RequestContext, projectId: string): Promise<ActivityRow[]>;
  appendActivity(ctx: RequestContext, row: ActivityRow): Promise<ActivityRow>;

  // Stages (ownership via parent project).
  insertStages(ctx: RequestContext, rows: StageRow[]): Promise<void>;
  listStages(ctx: RequestContext, projectId: string): Promise<StageRow[]>;
  getStage(
    ctx: RequestContext,
    projectId: string,
    stage: string,
  ): Promise<StageRow>;
  updateStage(
    ctx: RequestContext,
    stageId: string,
    set: Partial<StageRow>,
  ): Promise<StageRow>;

  // Target platforms (ownership via parent project).
  insertTargetPlatforms(
    ctx: RequestContext,
    rows: TargetPlatformRow[],
  ): Promise<void>;
  listTargetPlatforms(
    ctx: RequestContext,
    projectId: string,
  ): Promise<TargetPlatformRow[]>;

  // Outputs (ownership via parent project; getOutput joins output→project).
  insertOutput(
    ctx: RequestContext,
    row: ContentOutputRow,
  ): Promise<ContentOutputRow>;
  listOutputs(
    ctx: RequestContext,
    projectId: string,
  ): Promise<ContentOutputRow[]>;
  getOutput(ctx: RequestContext, outputId: string): Promise<ContentOutputRow>;
  updateOutputRow(
    ctx: RequestContext,
    outputId: string,
    set: Partial<ContentOutputRow>,
  ): Promise<ContentOutputRow>;
  insertOutputStages(
    ctx: RequestContext,
    rows: OutputStageRow[],
  ): Promise<void>;
  getOutputStage(
    ctx: RequestContext,
    outputId: string,
    stage: string,
  ): Promise<OutputStageRow>;
  updateOutputStage(
    ctx: RequestContext,
    stageId: string,
    set: Partial<OutputStageRow>,
  ): Promise<OutputStageRow>;

  // Tasks (ownership via parent project; getTask joins task→project).
  insertTask(ctx: RequestContext, row: TaskRow): Promise<TaskRow>;
  listTasks(ctx: RequestContext, projectId: string): Promise<TaskRow[]>;
  getTask(ctx: RequestContext, taskId: string): Promise<TaskRow>;
  updateTaskRow(
    ctx: RequestContext,
    taskId: string,
    set: Partial<TaskRow>,
  ): Promise<TaskRow>;
}

export function createProjectRepository(db: Db): ProjectRepository {
  // Resolve + ownership-check a project; cross-user/missing is indistinguishable
  // (foundation §2: 404, never reveal existence) → OwnershipError.
  async function get(ctx: RequestContext, projectId: string): Promise<ProjectRow> {
    const rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, ctx.userId)));
    const row = rows[0];
    if (!row) throw new OwnershipError(`Project not found: ${projectId}`);
    return row;
  }

  // Resolve an output, ownership-checked by joining output→project on userId.
  async function getOutput(
    ctx: RequestContext,
    outputId: string,
  ): Promise<ContentOutputRow> {
    const rows = await db
      .select({ output: contentOutputs })
      .from(contentOutputs)
      .innerJoin(projects, eq(contentOutputs.projectId, projects.id))
      .where(
        and(eq(contentOutputs.id, outputId), eq(projects.userId, ctx.userId)),
      );
    const row = rows[0]?.output;
    if (!row) throw new OwnershipError(`Output not found: ${outputId}`);
    return row;
  }

  async function getTask(
    ctx: RequestContext,
    taskId: string,
  ): Promise<TaskRow> {
    const rows = await db
      .select({ task: tasks })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(eq(tasks.id, taskId), eq(projects.userId, ctx.userId)));
    const row = rows[0]?.task;
    if (!row) throw new OwnershipError(`Task not found: ${taskId}`);
    return row;
  }

  return {
    async seedProjects(rows) {
      if (rows.length === 0) return;
      await db.insert(projects).values(rows).onConflictDoNothing();
    },
    async seedStages(rows) {
      if (rows.length === 0) return;
      await db.insert(projectStages).values(rows).onConflictDoNothing();
    },
    async seedPlatforms(rows) {
      if (rows.length === 0) return;
      await db.insert(projectTargetPlatforms).values(rows).onConflictDoNothing();
    },
    async seedOutputs(rows) {
      if (rows.length === 0) return;
      await db.insert(contentOutputs).values(rows).onConflictDoNothing();
    },
    async seedOutputStages(rows) {
      if (rows.length === 0) return;
      await db.insert(outputStages).values(rows).onConflictDoNothing();
    },
    async seedTasks(rows) {
      if (rows.length === 0) return;
      await db.insert(tasks).values(rows).onConflictDoNothing();
    },
    async seedActivities(rows) {
      if (rows.length === 0) return;
      await db.insert(projectActivities).values(rows).onConflictDoNothing();
    },

    async list(ctx) {
      return db
        .select()
        .from(projects)
        .where(eq(projects.userId, ctx.userId))
        .orderBy(asc(projects.createdAt));
    },

    get,

    async insertProject(ctx, row) {
      // Stamp ownership on the root row regardless of what the caller passed.
      const inserted = await db
        .insert(projects)
        .values({ ...row, userId: ctx.userId })
        .returning();
      return inserted[0]!;
    },

    async updateProjectRow(ctx, projectId, set) {
      await get(ctx, projectId); // re-assert ownership before the write
      const updated = await db
        .update(projects)
        .set(set)
        .where(and(eq(projects.id, projectId), eq(projects.userId, ctx.userId)))
        .returning();
      return updated[0]!;
    },

    async listActivity(ctx, projectId) {
      await get(ctx, projectId); // ownership
      return db
        .select()
        .from(projectActivities)
        .where(eq(projectActivities.projectId, projectId))
        .orderBy(asc(projectActivities.occurredAt));
    },

    async appendActivity(ctx, row) {
      await get(ctx, row.projectId); // ownership of the parent project
      const inserted = await db
        .insert(projectActivities)
        .values(row)
        .returning();
      return inserted[0]!;
    },

    async insertStages(ctx, rows) {
      if (rows.length === 0) return;
      await get(ctx, rows[0]!.projectId); // ownership of the parent project
      await db.insert(projectStages).values(rows);
    },

    async listStages(ctx, projectId) {
      await get(ctx, projectId);
      return db
        .select()
        .from(projectStages)
        .where(eq(projectStages.projectId, projectId));
    },

    async getStage(ctx, projectId, stage) {
      await get(ctx, projectId);
      const rows = await db
        .select()
        .from(projectStages)
        .where(
          and(
            eq(projectStages.projectId, projectId),
            eq(projectStages.stage, stage),
          ),
        );
      const row = rows[0];
      if (!row) throw new OwnershipError(`Stage not found: ${stage}`);
      return row;
    },

    async updateStage(ctx, stageId, set) {
      // Ownership via parent project (join stage→project).
      const owned = await db
        .select({ stage: projectStages })
        .from(projectStages)
        .innerJoin(projects, eq(projectStages.projectId, projects.id))
        .where(
          and(eq(projectStages.id, stageId), eq(projects.userId, ctx.userId)),
        );
      if (!owned[0]) throw new OwnershipError(`Stage not found: ${stageId}`);
      const updated = await db
        .update(projectStages)
        .set(set)
        .where(eq(projectStages.id, stageId))
        .returning();
      return updated[0]!;
    },

    async insertTargetPlatforms(ctx, rows) {
      if (rows.length === 0) return;
      await get(ctx, rows[0]!.projectId);
      await db.insert(projectTargetPlatforms).values(rows).onConflictDoNothing();
    },

    async listTargetPlatforms(ctx, projectId) {
      await get(ctx, projectId);
      return db
        .select()
        .from(projectTargetPlatforms)
        .where(eq(projectTargetPlatforms.projectId, projectId));
    },

    async insertOutput(ctx, row) {
      await get(ctx, row.projectId); // ownership of the parent project
      const inserted = await db.insert(contentOutputs).values(row).returning();
      return inserted[0]!;
    },

    async listOutputs(ctx, projectId) {
      await get(ctx, projectId);
      return db
        .select()
        .from(contentOutputs)
        .where(eq(contentOutputs.projectId, projectId))
        .orderBy(asc(contentOutputs.createdAt));
    },

    getOutput,

    async updateOutputRow(ctx, outputId, set) {
      await getOutput(ctx, outputId); // ownership
      const updated = await db
        .update(contentOutputs)
        .set(set)
        .where(eq(contentOutputs.id, outputId))
        .returning();
      return updated[0]!;
    },

    async insertOutputStages(ctx, rows) {
      if (rows.length === 0) return;
      await getOutput(ctx, rows[0]!.contentOutputId); // ownership via output→project
      await db.insert(outputStages).values(rows);
    },

    async getOutputStage(ctx, outputId, stage) {
      await getOutput(ctx, outputId);
      const rows = await db
        .select()
        .from(outputStages)
        .where(
          and(
            eq(outputStages.contentOutputId, outputId),
            eq(outputStages.stage, stage),
          ),
        );
      const row = rows[0];
      if (!row) throw new OwnershipError(`Output stage not found: ${stage}`);
      return row;
    },

    async updateOutputStage(ctx, stageId, set) {
      const owned = await db
        .select({ stage: outputStages })
        .from(outputStages)
        .innerJoin(
          contentOutputs,
          eq(outputStages.contentOutputId, contentOutputs.id),
        )
        .innerJoin(projects, eq(contentOutputs.projectId, projects.id))
        .where(
          and(eq(outputStages.id, stageId), eq(projects.userId, ctx.userId)),
        );
      if (!owned[0]) throw new OwnershipError(`Output stage not found: ${stageId}`);
      const updated = await db
        .update(outputStages)
        .set(set)
        .where(eq(outputStages.id, stageId))
        .returning();
      return updated[0]!;
    },

    async insertTask(ctx, row) {
      await get(ctx, row.projectId); // ownership of the parent project
      const inserted = await db.insert(tasks).values(row).returning();
      return inserted[0]!;
    },

    async listTasks(ctx, projectId) {
      await get(ctx, projectId);
      return db
        .select()
        .from(tasks)
        .where(eq(tasks.projectId, projectId))
        .orderBy(asc(tasks.id));
    },

    getTask,

    async updateTaskRow(ctx, taskId, set) {
      await getTask(ctx, taskId); // ownership
      const updated = await db
        .update(tasks)
        .set(set)
        .where(eq(tasks.id, taskId))
        .returning();
      return updated[0]!;
    },
  };
}
