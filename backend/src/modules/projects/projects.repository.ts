import { and, eq, asc, inArray, sql, type Db } from "@creatoros/backend";
import {
  projects,
  projectActivities,
  projectStages,
  projectTargetPlatforms,
  contentOutputs,
  outputStages,
  tasks,
} from "./projects.db-schema";
// T-102 物理删除级联:跨模块子表(用户裁决 2026-07-03)。项目物理删除必须把挂在
// 该项目上的所有关联行一并清理,否则留孤儿(发布记录/脚本/复盘/评论锚等)。这些表的
// canonical 定义都在共享基座 @creatoros/backend(与 db.ts 的 schema 联合同源),这里只
// 为「按 project 收敛删除」引用它们的列 —— 不改这些模块的服务/契约(T-102 禁区)。
import {
  artifacts,
  artifactVersions,
  artifactRelations,
  scriptSections,
  timelineSegments,
  publications,
  publicationRevisions,
  reviews,
  reviewInsights,
  reviewPublications,
  scriptReviewReports,
  learningApplications,
  materialLinks,
  aiConversations,
  aiMessages,
  aiTasks,
  aiTaskReferences,
  aiTaskResults,
  aiTaskSteps,
  audienceSignals,
  topicPromotions,
} from "@creatoros/backend";
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

  // Project root (user-scoped). [T-033] includeHidden: ?hidden=1 → 全显(私密作品也展示,
  // 行上带 platformRef.hidden=true 徽标);默认 → 过滤 platformRef.hidden=true(单条件过滤
  // 已足够,无需再加 status —— 项目 status='imported' 是物理标识,与抖音审核态正交)。
  list(
    ctx: RequestContext,
    opts?: { includeHidden?: boolean },
  ): Promise<ProjectRow[]>;
  // 数据底座(SPEC §1.4):user-scoped 且 source='imported' 的项目(真实采集导入)。
  //   "优先读真"判据 hasImportedProjects + 三向 portfolio 让位的物理读源。
  listImported(ctx: RequestContext): Promise<ProjectRow[]>;
  get(ctx: RequestContext, projectId: string): Promise<ProjectRow>;
  insertProject(ctx: RequestContext, row: ProjectRow): Promise<ProjectRow>;
  // 数据底座(SPEC §1.3):按平台引用查既有 imported 项目(幂等键
  // (userId, platform, externalId))。命中返回该 project row,否则 null。匹配
  // source='imported' 且 platform_ref->>platform / ->>externalId 相等(user-scoped)。
  findImportedByRef(
    ctx: RequestContext,
    ref: { platform: string; externalId: string },
  ): Promise<ProjectRow | null>;
  updateProjectRow(
    ctx: RequestContext,
    projectId: string,
    set: Partial<ProjectRow>,
  ): Promise<ProjectRow>;

  // T-102 物理删除:级联清除该项目全部关联行 + 项目本身,一个事务包裹(全成或全不成)。
  // ownership 由调用方(service)在删前 get() 校验;这里再按 project_id / 派生子键收敛
  // 删除,顺序自底向上(先删孙表再删子表),避免留孤儿。返回删除前的 project 快照,
  // 供 service 落 DTO / 前端确认后展示。
  deleteProjectCascade(
    ctx: RequestContext,
    projectId: string,
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
  // SPEC §1.2 SKL-09 数据源收敛:project_target_platforms 是目标平台的唯一写真值。
  // 立项工作台保存(briefDetail.targetPlatforms 投影回来)→ 整体替换该项目的平台行
  // (先删后插),消除「关系表只在 create 播种、之后两源漂移」。ownership 经父项目校验。
  replaceTargetPlatforms(
    ctx: RequestContext,
    projectId: string,
    rows: TargetPlatformRow[],
  ): Promise<void>;

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
  // [T-136 切片 b] 按号隔离条件门:当 ctx.accountId 有值时叠加 `eq(projects.accountId, …)`,
  // 为 null/undefined(未选号 / 全局视图 / 存量兜底,§E 退化)时返回 undefined —— drizzle
  // `and()` 忽略 undefined,门退化为「只按 userId 过滤,返回该 user 全部行」。projects 是
  // 唯一 owned-root(有自身 account_id 列)的表;子表(activities/stages/platforms/outputs/
  // output_stages/tasks 无 account_id 列)经父 project 门透传,不强加(SPEC §9)。
  function accountGate(ctx: RequestContext) {
    return ctx.accountId ? eq(projects.accountId, ctx.accountId) : undefined;
  }

  // Resolve + ownership-check a project; cross-user/missing is indistinguishable
  // (foundation §2: 404, never reveal existence) → OwnershipError.
  async function get(ctx: RequestContext, projectId: string): Promise<ProjectRow> {
    const rows = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.userId, ctx.userId),
          accountGate(ctx),
        ),
      );
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
        and(
          eq(contentOutputs.id, outputId),
          eq(projects.userId, ctx.userId),
          // [T-136 切片 b] 父门透传账号维度:反查 output 时也要按父 project 的号隔离
          // (否则有号 ctx 能读到别号项目下的 output → 串味)。
          accountGate(ctx),
        ),
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
      .where(
        and(
          eq(tasks.id, taskId),
          eq(projects.userId, ctx.userId),
          accountGate(ctx), // [T-136 切片 b] 父门透传账号维度
        ),
      );
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

    async list(ctx, opts) {
      // [T-033] 默认过滤 platformRef.hidden=true 的项目(平台侧私密/已隐藏),
      // includeHidden=true 时全显。
      const hiddenFilter = opts?.includeHidden
        ? sql`1 = 1`
        : sql`coalesce((${projects.platformRef}->>'hidden')::boolean, false) = false`;
      return db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.userId, ctx.userId),
            accountGate(ctx),
            hiddenFilter,
          ),
        )
        .orderBy(asc(projects.createdAt));
    },

    async listImported(ctx) {
      // 数据底座(SPEC §1.4)优先读真判据的物理源:user-scoped 且 source='imported'
      // 的历史项目(T-001 refresh 落库的真实采集作品)。演示 fixture 行 source='manual',
      // 故此查询恰好把"真实导入"与"演示态"分开。空 → 用户尚未拉过真账号(过渡期回退
      // fixture 演示);非空 → 三向读侧让 fixture 让位、只读这批真项目。
      return db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.userId, ctx.userId),
            eq(projects.source, "imported"),
            accountGate(ctx),
          ),
        )
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

    async findImportedByRef(ctx, ref) {
      // 数据底座(SPEC §1.3)幂等键 (userId, platform, externalId)。user-scoped +
      // source='imported' + platform_ref 的 platform/externalId 字段相等(jsonb ->>)。
      const rows = await db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.userId, ctx.userId),
            eq(projects.source, "imported"),
            accountGate(ctx),
            sql`${projects.platformRef} ->> 'platform' = ${ref.platform}`,
            sql`${projects.platformRef} ->> 'externalId' = ${ref.externalId}`,
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async updateProjectRow(ctx, projectId, set) {
      await get(ctx, projectId); // re-assert ownership (含账号门) before the write
      const updated = await db
        .update(projects)
        .set(set)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.userId, ctx.userId),
            accountGate(ctx),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async deleteProjectCascade(ctx, projectId) {
      // 删前再断言所有权(cross-user/missing → 404,不泄露存在性)。
      const target = await get(ctx, projectId);
      // 一个事务包裹整条级联:全成或全不成(pglite/node-postgres 同一 Drizzle API)。
      await db.transaction(async (tx) => {
        // ── 先解析派生子键(删除孙表要用到) ──────────────────────────────
        // 该项目下的 content_output ids。
        const outputRows = await tx
          .select({ id: contentOutputs.id })
          .from(contentOutputs)
          .where(eq(contentOutputs.projectId, projectId));
        const outputIds = outputRows.map((r) => r.id);
        // 这些 output 的 publication ids。
        const pubRows =
          outputIds.length > 0
            ? await tx
                .select({ id: publications.id })
                .from(publications)
                .where(inArray(publications.contentOutputId, outputIds))
            : [];
        const publicationIds = pubRows.map((r) => r.id);
        // 该项目的 artifact ids + 其 version ids(脚本结构挂在 version 上)。
        const artifactRows = await tx
          .select({ id: artifacts.id })
          .from(artifacts)
          .where(eq(artifacts.projectId, projectId));
        const artifactIds = artifactRows.map((r) => r.id);
        const versionRows =
          artifactIds.length > 0
            ? await tx
                .select({ id: artifactVersions.id })
                .from(artifactVersions)
                .where(inArray(artifactVersions.artifactId, artifactIds))
            : [];
        const versionIds = versionRows.map((r) => r.id);
        // 该项目的 ai_conversation / ai_task ids(子表经它们收敛)。
        const convoRows = await tx
          .select({ id: aiConversations.id })
          .from(aiConversations)
          .where(eq(aiConversations.projectId, projectId));
        const conversationIds = convoRows.map((r) => r.id);
        const aiTaskRows = await tx
          .select({ id: aiTasks.id })
          .from(aiTasks)
          .where(eq(aiTasks.projectId, projectId));
        const aiTaskIds = aiTaskRows.map((r) => r.id);
        // 该项目的 review ids(review_insights / review_publications 经它收敛)。
        const reviewRows = await tx
          .select({ id: reviews.id })
          .from(reviews)
          .where(eq(reviews.projectId, projectId));
        const reviewIds = reviewRows.map((r) => r.id);

        // ── 自底向上删除(先孙后子再父) ───────────────────────────────────
        // artifact 结构表(script_sections / timeline_segments 挂 artifact_version)。
        if (versionIds.length > 0) {
          await tx
            .delete(scriptSections)
            .where(inArray(scriptSections.artifactVersionId, versionIds));
          await tx
            .delete(timelineSegments)
            .where(inArray(timelineSegments.artifactVersionId, versionIds));
        }
        if (artifactIds.length > 0) {
          await tx
            .delete(artifactVersions)
            .where(inArray(artifactVersions.artifactId, artifactIds));
          // artifact_relations 双向:source 或 target 命中都删(悬挂关系不留)。
          await tx
            .delete(artifactRelations)
            .where(inArray(artifactRelations.sourceArtifactId, artifactIds));
          await tx
            .delete(artifactRelations)
            .where(inArray(artifactRelations.targetArtifactId, artifactIds));
        }
        await tx.delete(artifacts).where(eq(artifacts.projectId, projectId));

        // 发布链:revisions + review_publications(join)先删,audience_signals 的
        // publication_id 锚置空(评论/信号带独立 ingestion 溯源,不随项目物理删除而丢,
        // 但其指向的 publication 已不存在 → 解锚,避免悬挂引用)。
        if (publicationIds.length > 0) {
          await tx
            .delete(publicationRevisions)
            .where(inArray(publicationRevisions.publicationId, publicationIds));
          await tx
            .delete(reviewPublications)
            .where(inArray(reviewPublications.publicationId, publicationIds));
          await tx
            .update(audienceSignals)
            .set({ publicationId: null })
            .where(inArray(audienceSignals.publicationId, publicationIds));
          await tx
            .delete(publications)
            .where(inArray(publications.id, publicationIds));
        }
        // output 阶段行 + outputs 本身。
        if (outputIds.length > 0) {
          await tx
            .delete(outputStages)
            .where(inArray(outputStages.contentOutputId, outputIds));
        }
        await tx
          .delete(contentOutputs)
          .where(eq(contentOutputs.projectId, projectId));

        // review 子表(insights / publications-join)+ reviews 本身。
        if (reviewIds.length > 0) {
          await tx
            .delete(reviewInsights)
            .where(inArray(reviewInsights.reviewId, reviewIds));
          await tx
            .delete(reviewPublications)
            .where(inArray(reviewPublications.reviewId, reviewIds));
        }
        await tx.delete(reviews).where(eq(reviews.projectId, projectId));
        // 稿面审核门报告(script_review_reports 挂 project_id)。
        await tx
          .delete(scriptReviewReports)
          .where(eq(scriptReviewReports.projectId, projectId));

        // AI 会话/消息 + AI 任务/引用/结果/步骤。
        if (conversationIds.length > 0) {
          await tx
            .delete(aiMessages)
            .where(inArray(aiMessages.conversationId, conversationIds));
        }
        await tx
          .delete(aiConversations)
          .where(eq(aiConversations.projectId, projectId));
        if (aiTaskIds.length > 0) {
          await tx
            .delete(aiTaskReferences)
            .where(inArray(aiTaskReferences.aiTaskId, aiTaskIds));
          await tx
            .delete(aiTaskResults)
            .where(inArray(aiTaskResults.aiTaskId, aiTaskIds));
          await tx
            .delete(aiTaskSteps)
            .where(inArray(aiTaskSteps.aiTaskId, aiTaskIds));
        }
        await tx.delete(aiTasks).where(eq(aiTasks.projectId, projectId));

        // 素材关联 + 复用应用 + 选题晋升链(candidate 本身不删 —— 只解绑晋升)。
        await tx
          .delete(materialLinks)
          .where(eq(materialLinks.projectId, projectId));
        await tx
          .delete(learningApplications)
          .where(eq(learningApplications.projectId, projectId));
        await tx
          .delete(topicPromotions)
          .where(eq(topicPromotions.projectId, projectId));

        // project 直接子表(平台/阶段/任务/活动)。
        await tx
          .delete(projectTargetPlatforms)
          .where(eq(projectTargetPlatforms.projectId, projectId));
        await tx
          .delete(projectStages)
          .where(eq(projectStages.projectId, projectId));
        await tx.delete(tasks).where(eq(tasks.projectId, projectId));
        await tx
          .delete(projectActivities)
          .where(eq(projectActivities.projectId, projectId));

        // 最后删项目根行(user-scoped + 账号门再兜一层;删前 get() 已含账号门守过)。
        await tx
          .delete(projects)
          .where(
            and(
              eq(projects.id, projectId),
              eq(projects.userId, ctx.userId),
              accountGate(ctx), // [T-136 切片 b]
            ),
          );
      });
      return target;
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
          and(
            eq(projectStages.id, stageId),
            eq(projects.userId, ctx.userId),
            accountGate(ctx), // [T-136 切片 b] 父门透传账号维度
          ),
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

    async replaceTargetPlatforms(ctx, projectId, rows) {
      // SPEC §1.2 SKL-09:关系表是唯一写真值。整体替换 = 先删该项目全部平台行,再插新集。
      // pglite 同进程同步,删→插背靠背跑;(project, platform) 唯一索引兜底防重。
      await get(ctx, projectId); // ownership of the parent project
      await db
        .delete(projectTargetPlatforms)
        .where(eq(projectTargetPlatforms.projectId, projectId));
      if (rows.length > 0) {
        await db
          .insert(projectTargetPlatforms)
          .values(rows)
          .onConflictDoNothing();
      }
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
          and(
            eq(outputStages.id, stageId),
            eq(projects.userId, ctx.userId),
            accountGate(ctx), // [T-136 切片 b] 父门透传账号维度
          ),
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
