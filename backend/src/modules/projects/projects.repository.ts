import { and, eq, or, asc, inArray, sql, type Db } from "@creatoros/backend";
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
  // [T-326 DATA-H05] 删除事务补全:production / analytics / topic attribution /
  // learning / 日历槽 / 校准预测 / 标签 / 搜索索引 —— 全是无 FK 软引用,删项目不清会留孤儿
  // (dashboard 仍聚合已删项目)。同 T-102 裁决:共享 schema 级联删,不动各模块 service/repo。
  productions,
  productionSegments,
  segmentAssets,
  exportRecords,
  metricSnapshots,
  metricValues,
  retentionPoints,
  audienceSnapshots,
  topicAttributions,
  learnings,
  contentCalendarEntries,
  predictions,
  calibrationResults,
  tags,
  entityTags,
  searchDocuments,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { OwnershipError, requireAccountId } from "./projects.errors";

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

  // Project root (user-scoped)。T-595 后可见性已在采集边界归一：
  // 确认隐藏的导入作品会被清理，因此下游列表不再重复解释 platformRef.hidden。
  list(ctx: RequestContext): Promise<ProjectRow[]>;
  // 数据底座(SPEC §1.4):user-scoped 且 source='imported' 的项目(真实采集导入)。
  //   "优先读真"判据 hasImportedProjects + 三向 portfolio 让位的物理读源。
  listImported(ctx: RequestContext): Promise<ProjectRow[]>;
  // [T-332 S2] claimOrphanImportedProjects 已退役(SPEC §4.4):清库世界没有孤儿,
  // 新数据出生即带号(绑定即建号绑定 job),不存在「先落 NULL 再认领」的窗口。
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
    opts?: { deletePlatformSignals?: boolean },
  ): Promise<ProjectRow>;
  deletePlatformPublicationCascade(
    ctx: RequestContext,
    ref: { platform: string; externalId: string },
  ): Promise<{ publicationId: string } | null>;
  normalizeVisiblePlatformWork(
    ctx: RequestContext,
    ref: { platform: string; externalId: string; updatedAt: string },
  ): Promise<{ publicationId: string; projectId: string } | null>;

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
  /**
   * 账号窄读的批量 project → output 引用。用于组合层把一页项目和发布事实关联，
   * 避免逐项目查询造成 N+1；只返回当前 `(userId, accountId)` 可见的项目。
   */
  listOutputRefsByProjects(
    ctx: RequestContext,
    projectIds: ReadonlyArray<string>,
  ): Promise<
    Array<{
      projectId: string;
      outputId: string;
      title: string;
      contentType: string;
      status: string;
    }>
  >;
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
  // [T-332 S2] 按号隔离 strict 门(SPEC §4.1/§4.2):一律 `eq(projects.accountId,
  // ctx.accountId)`;未选号(null/undefined)→ 直接抛 AccountRequiredError(引导态,
  // 禁读写)—— 不再有「无号退化为该 user 全量」的 lenient 分支(拍板 ② 已废除存量兜底)。
  // projects 是唯一 owned-root(有自身 account_id 列)的表;子表(activities/stages/
  // platforms/outputs/output_stages/tasks 无 account_id 列)经父 project 门透传(SPEC §9)。
  function accountGate(ctx: RequestContext) {
    return eq(
      projects.accountId,
      requireAccountId(ctx.accountId, "projects.accountGate"),
    );
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

    async list(ctx) {
      return db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.userId, ctx.userId),
            accountGate(ctx),
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
      // [T-332 S2] accountId 同样只信 ctx(SPEC §4.6:repo 不接受调用方显式传号,防绕过);
      // 未选号 → AccountRequiredError(写路径禁 stamp null,ISO-03)。
      const inserted = await db
        .insert(projects)
        .values({
          ...row,
          userId: ctx.userId,
          accountId: requireAccountId(ctx.accountId, "projects.insertProject"),
        })
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

    async deleteProjectCascade(ctx, projectId, opts) {
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
        // [T-326 DATA-H05] 收敛键补 output 维度:output-scoped 的 AI 任务可能只带
        // content_output_id 不带 project_id(两列都 nullable),只按 projectId 收会漏。
        const aiTaskRows = await tx
          .select({ id: aiTasks.id })
          .from(aiTasks)
          .where(
            outputIds.length > 0
              ? or(
                  eq(aiTasks.projectId, projectId),
                  inArray(aiTasks.contentOutputId, outputIds),
                )
              : eq(aiTasks.projectId, projectId),
          );
        const aiTaskIds = aiTaskRows.map((r) => r.id);
        // 该项目的 review ids(review_insights / review_publications 经它收敛)。
        const reviewRows = await tx
          .select({ id: reviews.id })
          .from(reviews)
          .where(eq(reviews.projectId, projectId));
        const reviewIds = reviewRows.map((r) => r.id);
        // ── [T-326 DATA-H05] 制作/指标/校准/经验的派生子键 ─────────────────
        // production 链:productions 经 content_output_id 收敛(0..1 per output),
        // segments 经 production_id,segment_assets 经 segment_id。
        const productionRows =
          outputIds.length > 0
            ? await tx
                .select({ id: productions.id })
                .from(productions)
                .where(inArray(productions.contentOutputId, outputIds))
            : [];
        const productionIds = productionRows.map((r) => r.id);
        const segmentRows =
          productionIds.length > 0
            ? await tx
                .select({ id: productionSegments.id })
                .from(productionSegments)
                .where(inArray(productionSegments.productionId, productionIds))
            : [];
        const segmentIds = segmentRows.map((r) => r.id);
        // analytics 事实表:metric_snapshots 经 publication_id 收敛,
        // metric_values 经 metric_snapshot_id。
        const snapshotRows =
          publicationIds.length > 0
            ? await tx
                .select({ id: metricSnapshots.id })
                .from(metricSnapshots)
                .where(inArray(metricSnapshots.publicationId, publicationIds))
            : [];
        const snapshotIds = snapshotRows.map((r) => r.id);
        // 校准链:predictions 的 subject 是本项目的 output/publication,
        // calibration_results 经 prediction_id 收敛。subject_id NOT NULL 无法解锚 → 删。
        const predictionSubjectConds = [
          ...(outputIds.length > 0
            ? [
                and(
                  eq(predictions.subjectType, "content_output"),
                  inArray(predictions.subjectId, outputIds),
                ),
              ]
            : []),
          ...(publicationIds.length > 0
            ? [
                and(
                  eq(predictions.subjectType, "publication"),
                  inArray(predictions.subjectId, publicationIds),
                ),
              ]
            : []),
        ];
        const predictionRows =
          predictionSubjectConds.length > 0
            ? await tx
                .select({ id: predictions.id })
                .from(predictions)
                .where(or(...predictionSubjectConds))
            : [];
        const predictionIds = predictionRows.map((r) => r.id);
        // 本项目产的经验(learnings.project_id 锚,T-118a):随项目删;它们被其他项目
        // 引用的应用行(learning_applications.learning_id)也要清,否则悬挂。
        const learningRows = await tx
          .select({ id: learnings.id })
          .from(learnings)
          .where(eq(learnings.projectId, projectId));
        const learningIds = learningRows.map((r) => r.id);

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

        // 发布链：普通用户删项目时保留有独立 ingestion 溯源的 audience_signals 并解锚；
        // T-595 源侧确认隐藏的自动导入项目则删除平台评论/信号本身，避免隐藏作品继续
        // 进入受众洞察。两种行为都在当前项目级联事务内完成。
        if (publicationIds.length > 0) {
          await tx
            .delete(publicationRevisions)
            .where(inArray(publicationRevisions.publicationId, publicationIds));
          await tx
            .delete(reviewPublications)
            .where(inArray(reviewPublications.publicationId, publicationIds));
          if (opts?.deletePlatformSignals) {
            await tx
              .delete(audienceSignals)
              .where(inArray(audienceSignals.publicationId, publicationIds));
          } else {
            await tx
              .update(audienceSignals)
              .set({ publicationId: null })
              .where(inArray(audienceSignals.publicationId, publicationIds));
          }
          await tx
            .delete(publications)
            .where(inArray(publications.id, publicationIds));
        }
        // [T-326 DATA-H05] analytics 事实表(metric_snapshots/metric_values/
        // retention_points/audience_snapshots 都按 publication_id 软引用,publication
        // 删了指标就是孤儿 —— dashboard 会继续聚合已删项目)。先孙(values)后子(snapshots)。
        if (snapshotIds.length > 0) {
          await tx
            .delete(metricValues)
            .where(inArray(metricValues.metricSnapshotId, snapshotIds));
        }
        if (publicationIds.length > 0) {
          await tx
            .delete(metricSnapshots)
            .where(inArray(metricSnapshots.publicationId, publicationIds));
          await tx
            .delete(retentionPoints)
            .where(inArray(retentionPoints.publicationId, publicationIds));
          await tx
            .delete(audienceSnapshots)
            .where(inArray(audienceSnapshots.publicationId, publicationIds));
        }
        // [T-326 DATA-H05] 选题归因(topic_attributions):双锚收敛 —— publication_id
        // (幂等锚,NOT NULL)命中本项目发布,或 project_id(溯源锚,nullable)直指本项目。
        await tx
          .delete(topicAttributions)
          .where(
            publicationIds.length > 0
              ? or(
                  eq(topicAttributions.projectId, projectId),
                  inArray(topicAttributions.publicationId, publicationIds),
                )
              : eq(topicAttributions.projectId, projectId),
          );
        // [T-326 DATA-H05] 校准链:subject(output/publication)已删 → 预测失去对象,
        // calibration_results 经 prediction_id 收敛先删。
        if (predictionIds.length > 0) {
          await tx
            .delete(calibrationResults)
            .where(inArray(calibrationResults.predictionId, predictionIds));
          await tx
            .delete(predictions)
            .where(inArray(predictions.id, predictionIds));
        }
        // [T-326 DATA-H05] production 链(productions 0..1 per output → segments →
        // segment_assets;export_records 挂 production)。自底向上。
        if (segmentIds.length > 0) {
          await tx
            .delete(segmentAssets)
            .where(inArray(segmentAssets.productionSegmentId, segmentIds));
        }
        if (productionIds.length > 0) {
          await tx
            .delete(productionSegments)
            .where(inArray(productionSegments.productionId, productionIds));
          await tx
            .delete(exportRecords)
            .where(inArray(exportRecords.productionId, productionIds));
          await tx
            .delete(productions)
            .where(inArray(productions.id, productionIds));
        }
        // [T-326 DATA-H05] 内容日历槽:content_output_id 指向被删 output 的排期行
        // 失去对象 → 删(candidate 锚的排期行不动)。
        if (outputIds.length > 0) {
          await tx
            .delete(contentCalendarEntries)
            .where(inArray(contentCalendarEntries.contentOutputId, outputIds));
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

        // [T-326 DATA-H05] 本项目产的经验(learnings.project_id 锚)随项目删;
        // 其他项目引用这些经验的应用行(learning_applications.learning_id)一并清,
        // 否则「复用了已删经验」的应用行悬挂。
        if (learningIds.length > 0) {
          await tx
            .delete(learningApplications)
            .where(inArray(learningApplications.learningId, learningIds));
          await tx.delete(learnings).where(inArray(learnings.id, learningIds));
        }
        // 非本项目(project_id 异项目/NULL,如手录经验后来挂上本项目 review)但 review 锚
        // 指向被删 review 的经验:知识本身可跨项目复用(SPEC §22),不删 —— 解锚 review_id,
        // 学 audience_signals 的解锚先例,避免悬挂引用。
        if (reviewIds.length > 0) {
          await tx
            .update(learnings)
            .set({ reviewId: null })
            .where(inArray(learnings.reviewId, reviewIds));
        }

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
          // [T-326 DATA-H05] 按收敛出的 ids 删(含 output-scoped、project_id 为 NULL 的任务)。
          await tx.delete(aiTasks).where(inArray(aiTasks.id, aiTaskIds));
        }

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

        // [T-326 DATA-H05] 泛实体软引用清理:标签指派(entity_tags)与搜索索引
        // (search_documents)都按 (entity_type, entity_id) 泛引用被删实体。实体 id 全局
        // 唯一(带前缀铸造)+ user 域限定,按 entity_id 收敛安全。搜索索引虽是派生可重建,
        // 但不删会留幽灵命中(搜到已删项目)。knowledge/asset 不随项目删,其标签/索引不动。
        const deletedEntityIds = [
          projectId,
          ...outputIds,
          ...artifactIds,
          ...publicationIds,
          ...reviewIds,
          ...learningIds,
        ];
        // tags.usage_count 是服务层维护的去范式计数:先按 tag 聚合回补,再删指派行,
        // 避免删完计数漂移(GREATEST 兜底不下穿 0)。
        const tagCountRows = await tx
          .select({
            tagId: entityTags.tagId,
            n: sql<number>`count(*)::int`,
          })
          .from(entityTags)
          .where(
            and(
              eq(entityTags.userId, ctx.userId),
              inArray(entityTags.entityId, deletedEntityIds),
            ),
          )
          .groupBy(entityTags.tagId);
        for (const { tagId, n } of tagCountRows) {
          await tx
            .update(tags)
            .set({ usageCount: sql`GREATEST(${tags.usageCount} - ${n}, 0)` })
            .where(and(eq(tags.id, tagId), eq(tags.userId, ctx.userId)));
        }
        await tx
          .delete(entityTags)
          .where(
            and(
              eq(entityTags.userId, ctx.userId),
              inArray(entityTags.entityId, deletedEntityIds),
            ),
          );
        await tx
          .delete(searchDocuments)
          .where(
            and(
              eq(searchDocuments.userId, ctx.userId),
              inArray(searchDocuments.entityId, deletedEntityIds),
            ),
          );

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

    async deletePlatformPublicationCascade(ctx, ref) {
      const accountId = requireAccountId(
        ctx.accountId,
        "projects.deletePlatformPublicationCascade",
      );
      const found = await db
        .select({
          id: publications.id,
          contentOutputId: publications.contentOutputId,
        })
        .from(publications)
        .where(
          and(
            eq(publications.userId, ctx.userId),
            eq(publications.accountId, accountId),
            eq(publications.platform, ref.platform),
            eq(publications.externalId, ref.externalId),
          ),
        );
      const target = found[0];
      if (!target) return null;
      // output→project ownership gate；手工项目根及其创作资产不会被删除。
      await getOutput(ctx, target.contentOutputId);

      await db.transaction(async (tx) => {
        const snapshotRows = await tx
          .select({ id: metricSnapshots.id })
          .from(metricSnapshots)
          .where(eq(metricSnapshots.publicationId, target.id));
        const snapshotIds = snapshotRows.map((row) => row.id);
        const predictionRows = await tx
          .select({ id: predictions.id })
          .from(predictions)
          .where(
            and(
              eq(predictions.subjectType, "publication"),
              eq(predictions.subjectId, target.id),
            ),
          );
        const predictionIds = predictionRows.map((row) => row.id);

        if (snapshotIds.length > 0) {
          await tx
            .delete(metricValues)
            .where(inArray(metricValues.metricSnapshotId, snapshotIds));
        }
        await tx
          .delete(metricSnapshots)
          .where(eq(metricSnapshots.publicationId, target.id));
        await tx
          .delete(retentionPoints)
          .where(eq(retentionPoints.publicationId, target.id));
        await tx
          .delete(audienceSnapshots)
          .where(eq(audienceSnapshots.publicationId, target.id));
        await tx
          .delete(topicAttributions)
          .where(eq(topicAttributions.publicationId, target.id));
        if (predictionIds.length > 0) {
          await tx
            .delete(calibrationResults)
            .where(inArray(calibrationResults.predictionId, predictionIds));
          await tx.delete(predictions).where(inArray(predictions.id, predictionIds));
        }
        await tx
          .delete(audienceSignals)
          .where(eq(audienceSignals.publicationId, target.id));
        await tx
          .delete(reviewPublications)
          .where(eq(reviewPublications.publicationId, target.id));
        await tx
          .delete(publicationRevisions)
          .where(eq(publicationRevisions.publicationId, target.id));

        const tagCountRows = await tx
          .select({
            tagId: entityTags.tagId,
            n: sql<number>`count(*)::int`,
          })
          .from(entityTags)
          .where(
            and(
              eq(entityTags.userId, ctx.userId),
              eq(entityTags.entityId, target.id),
            ),
          )
          .groupBy(entityTags.tagId);
        for (const { tagId, n } of tagCountRows) {
          await tx
            .update(tags)
            .set({ usageCount: sql`GREATEST(${tags.usageCount} - ${n}, 0)` })
            .where(and(eq(tags.id, tagId), eq(tags.userId, ctx.userId)));
        }
        await tx
          .delete(entityTags)
          .where(
            and(
              eq(entityTags.userId, ctx.userId),
              eq(entityTags.entityId, target.id),
            ),
          );
        await tx
          .delete(searchDocuments)
          .where(
            and(
              eq(searchDocuments.userId, ctx.userId),
              eq(searchDocuments.accountId, accountId),
              eq(searchDocuments.entityId, target.id),
            ),
          );
        await tx
          .delete(publications)
          .where(
            and(
              eq(publications.id, target.id),
              eq(publications.userId, ctx.userId),
              eq(publications.accountId, accountId),
            ),
          );
      });
      return { publicationId: target.id };
    },

    async normalizeVisiblePlatformWork(ctx, ref) {
      const accountId = requireAccountId(
        ctx.accountId,
        "projects.normalizeVisiblePlatformWork",
      );
      const found = await db
        .select({
          publicationId: publications.id,
          contentOutputId: publications.contentOutputId,
        })
        .from(publications)
        .where(
          and(
            eq(publications.userId, ctx.userId),
            eq(publications.accountId, accountId),
            eq(publications.platform, ref.platform),
            eq(publications.externalId, ref.externalId),
          ),
        );
      const target = found[0];
      if (!target) return null;
      const output = await getOutput(ctx, target.contentOutputId);
      const project = await get(ctx, output.projectId);
      const platformRef = (project.platformRef ?? {}) as Record<string, unknown>;

      await db.transaction(async (tx) => {
        await tx
          .update(publications)
          .set({
            hiddenAt: null,
            platformStatus: "已通过",
            updatedAt: ref.updatedAt,
          })
          .where(
            and(
              eq(publications.id, target.publicationId),
              eq(publications.userId, ctx.userId),
              eq(publications.accountId, accountId),
            ),
          );
        if (
          platformRef.platform === ref.platform &&
          platformRef.externalId === ref.externalId
        ) {
          await tx
            .update(projects)
            .set({
              platformRef: { ...platformRef, hidden: false },
              updatedAt: ref.updatedAt,
            })
            .where(
              and(
                eq(projects.id, project.id),
                eq(projects.userId, ctx.userId),
                accountGate(ctx),
              ),
            );
        }
      });
      return { publicationId: target.publicationId, projectId: project.id };
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

    async listOutputRefsByProjects(ctx, projectIds) {
      if (projectIds.length === 0) return [];
      return db
        .select({
          projectId: contentOutputs.projectId,
          outputId: contentOutputs.id,
          title: contentOutputs.title,
          contentType: contentOutputs.contentType,
          status: contentOutputs.status,
        })
        .from(contentOutputs)
        .innerJoin(projects, eq(contentOutputs.projectId, projects.id))
        .where(
          and(
            inArray(projects.id, [...projectIds]),
            eq(projects.userId, ctx.userId),
            accountGate(ctx),
          ),
        );
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
