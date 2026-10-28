import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createDb,
  type Db,
  eq,
  sql,
  // T-102 级联删除锁测:跨模块子表(断言删后一并清理)。
  artifacts,
  artifactVersions,
  scriptSections,
  publications,
  publicationRevisions,
  reviews,
  reviewInsights,
  scriptReviewReports,
  materialLinks,
  aiConversations,
  aiMessages,
  aiTasks,
  aiTaskResults,
  audienceSignals,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createProjectRepository,
  type ProjectRepository,
  type ProjectRow,
  type TaskRow,
} from "./projects.repository";
import {
  createProjectsService,
  type ProjectsService,
  type StageGateReadersRef,
} from "./projects.service";
import {
  StageTransitionError,
  ProjectStateError,
  StageGateError,
  OwnershipError,
} from "./projects.errors";

const NOW = "2026-06-13T10:00:00+08:00";
const ctx: RequestContext = { userId: "user-1", requestId: "req-1", source: "user", accountId: "acct-1" };

function deterministicDeps() {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-s-${n}`;
    },
  };
}

let db: Db;
let repo: ProjectRepository;
let service: ProjectsService;

beforeEach(async () => {
  ({ db } = await createDb());
  repo = createProjectRepository(db);
  service = createProjectsService(repo, deterministicDeps());
});

describe("createProject UoW", () => {
  it("creates an active project at brief and seeds 7 stages + platforms + activity", async () => {
    const project = await service.createProject(ctx, {
      title: "深度解析",
      brief: "拆解",
      targetPlatforms: ["bilibili", "youtube"],
    });
    expect(project.status).toBe("active");
    // 立项 Brief 地基:新建项目从 brief 阶段起(不再是 research)。
    expect(project.currentStage).toBe("brief");
    expect(project.progressPct).toBe(0);

    const stages = await repo.listStages(ctx, project.id);
    expect(stages).toHaveLength(7);
    const brief = stages.find((s) => s.stage === "brief")!;
    expect(brief.status).toBe("in_progress");
    expect(brief.startedAt).toBe(NOW);
    const research = stages.find((s) => s.stage === "research")!;
    expect(research.status).toBe("pending");

    const platforms = await repo.listTargetPlatforms(ctx, project.id);
    expect(platforms.map((p) => p.platform).sort()).toEqual(["bilibili", "youtube"]);

    const activity = await repo.listActivity(ctx, project.id);
    expect(activity).toHaveLength(1);
    expect(activity[0]!.eventType).toBe("project_created");
  });

  it("seeds briefDetail from the create command (选题→Brief 草稿)", async () => {
    const project = await service.createProject(ctx, {
      title: "选题立项",
      briefDetail: {
        targetAudience: "职场人",
        contentFormat: "口播",
        targetPlatforms: ["douyin"],
        coreMessage: "一句话主张",
      },
    });
    const detail = (project as { briefDetail?: Record<string, unknown> })
      .briefDetail!;
    expect(detail.targetAudience).toBe("职场人");
    expect(detail.contentFormat).toBe("口播");
    expect(detail.targetPlatforms).toEqual(["douyin"]);
    expect(detail.coreMessage).toBe("一句话主张");
  });

  it("creates with no platforms when none passed", async () => {
    const project = await service.createProject(ctx, { title: "T" });
    expect(await repo.listTargetPlatforms(ctx, project.id)).toHaveLength(0);
  });

  it("source:imported 项目落复盘态 + 前置阶段 completed(SPEC §1.2/§1.3)", async () => {
    const project = await service.createProject(ctx, {
      title: "真实作品",
      source: "imported",
      platformRef: {
        platform: "douyin",
        externalId: "7400",
        publishedAt: "2026-06-20T08:00:00.000Z",
      },
    });
    expect(project.source).toBe("imported");
    expect(project.currentStage).toBe("review");
    const ref = (project as { platformRef?: Record<string, unknown> })
      .platformRef!;
    expect(ref.platform).toBe("douyin");
    expect(ref.externalId).toBe("7400");
    const stages = await repo.listStages(ctx, project.id);
    expect(stages.find((s) => s.stage === "review")!.status).toBe("in_progress");
    expect(stages.find((s) => s.stage === "brief")!.status).toBe("completed");
    expect(stages.find((s) => s.stage === "production")!.status).toBe(
      "completed",
    );
  });
});

describe("T-599 schedule project port", () => {
  it("returns an ownership-scoped project with output readiness facts", async () => {
    const project = await service.createProject(ctx, {
      title: "八月发布计划",
      source: "manual",
    });
    const output = await service.createOutput(ctx, project.id, {
      title: "主成片",
    });
    await repo.updateOutputRow(ctx, output.id, { status: "ready" });

    await expect(
      service.getScheduleProject(ctx, project.id),
    ).resolves.toMatchObject({
      id: project.id,
      title: "八月发布计划",
      status: "active",
      source: "manual",
      outputs: [{ id: output.id, status: "ready" }],
    });
  });

  it("does not expose a project from another account", async () => {
    const project = await service.createProject(ctx, { title: "账号 A" });
    const otherAccountCtx: RequestContext = {
      ...ctx,
      requestId: "req-other-account",
      accountId: "acct-2",
    };

    await expect(
      service.getScheduleProject(otherAccountCtx, project.id),
    ).rejects.toMatchObject({ name: "OwnershipError" });
  });
});

describe("deleteProject 级联物理删除 (T-102)", () => {
  it("cross-user/missing → OwnershipError(404,不泄露存在性)", async () => {
    const mine = await service.createProject(ctx, { title: "我的" });
    const otherCtx: RequestContext = {
      userId: "user-2",
      requestId: "req-2",
      source: "user",
      accountId: "acct-2",
    };
    // 别人删我的项目 → 404。
    await expect(
      service.deleteProject(otherCtx, mine.id),
    ).rejects.toMatchObject({ name: "OwnershipError" });
    // 删不存在的 → 404。
    await expect(
      service.deleteProject(ctx, "project-does-not-exist"),
    ).rejects.toMatchObject({ name: "OwnershipError" });
  });

  it("删项目 → 项目本身 + 全部关联行(脚本/发布/复盘/AI/素材/评论锚)一并清理", async () => {
    // 建项目(带 7 stages + platforms + activity)。
    const project = await service.createProject(ctx, {
      title: "待删项目",
      targetPlatforms: ["douyin"],
    });
    const projectId = project.id;
    // content_output(经 service,带 output_stages)。
    const output = await service.createOutput(ctx, projectId, {
      title: "成片",
    });
    const outputId = output.id;
    // task。
    await service.createTask(ctx, projectId, {
      title: "拍摄",
      stage: "production",
    });

    // ── 直接插入跨模块关联行(模拟真实使用后挂满数据) ────────────────────
    const NOW_ISO = "2026-06-20T08:00:00.000Z";
    // artifact + version + script_section。
    await db.insert(artifacts).values({
      id: "art-1",
      userId: ctx.userId,
      accountId: "acct-1",
      projectId,
      contentOutputId: outputId,
      currentVersionId: "artv-1",
      stage: "script",
      artifactType: "script",
      title: "脚本",
      status: "drafting",
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    });
    await db.insert(artifactVersions).values({
      id: "artv-1",
      artifactId: "art-1",
      versionNumber: 1,
      contentText: "正文",
      createdAt: NOW_ISO,
    });
    await db.insert(scriptSections).values({
      id: "ss-1",
      artifactVersionId: "artv-1",
      sectionType: "hook",
      title: "开场",
      content: "钩子",
      position: 0,
    });
    // publication + revision(挂 content_output)。
    await db.insert(publications).values({
      id: "pub-1",
      userId: ctx.userId,
      accountId: "acct-1",
      contentOutputId: outputId,
      platform: "douyin",
      accountReference: "acc-1",
      status: "published",
      currentRevisionId: "pubrev-1",
      externalId: "aweme-1",
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    });
    await db.insert(publicationRevisions).values({
      id: "pubrev-1",
      userId: ctx.userId,
      publicationId: "pub-1",
      revisionNumber: 1,
      title: "发布标题",
      createdAt: NOW_ISO,
    });
    // audience_signal 指向该 publication(应被解锚 publication_id=null,行留存)。
    await db.insert(audienceSignals).values({
      id: "sig-1",
      userId: ctx.userId,
      accountId: "acct-1",
      source: "comment",
      rawText: "好视频",
      publicationId: "pub-1",
      createdAt: NOW_ISO,
    });
    // review + insight(挂 project_id)。
    await db.insert(reviews).values({
      id: "rev-1",
      userId: ctx.userId,
      accountId: "acct-1",
      projectId,
      reviewType: "project",
      status: "completed",
      periodStart: NOW_ISO,
      periodEnd: NOW_ISO,
      createdAt: NOW_ISO,
    });
    await db.insert(reviewInsights).values({
      id: "ri-1",
      userId: ctx.userId,
      accountId: "acct-1",
      reviewId: "rev-1",
      insightType: "success",
      title: "洞察",
    });
    // script_review_report(挂 project_id)。
    await db.insert(scriptReviewReports).values({
      id: "srr-1",
      userId: ctx.userId,
      projectId,
      artifactId: "art-1",
      artifactVersion: 1,
      verdict: "pass",
      reviewedAt: NOW_ISO,
    });
    // material_link(挂 project_id)。
    await db.insert(materialLinks).values({
      id: "ml-1",
      userId: ctx.userId,
      projectId,
      entityType: "knowledge",
      entityId: "k-1",
      createdAt: NOW_ISO,
    });
    // ai_conversation + message,ai_task + result(挂 project_id)。
    await db.insert(aiConversations).values({
      id: "conv-1",
      userId: ctx.userId,
      accountId: "acct-1",
      projectId,
      scope: `project:${projectId}`,
      title: "会话",
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    });
    await db.insert(aiMessages).values({
      id: "msg-1",
      conversationId: "conv-1",
      role: "user",
      content: "hi",
      createdAt: NOW_ISO,
    });
    await db.insert(aiTasks).values({
      id: "task-1",
      userId: ctx.userId,
      accountId: "acct-1",
      projectId,
      taskType: "script.generate",
      status: "succeeded",
      idempotencyKey: "idem-1",
      requestedAt: NOW_ISO,
    });
    await db.insert(aiTaskResults).values({
      id: "tr-1",
      aiTaskId: "task-1",
      resultType: "artifact",
      artifactId: "art-1",
    });

    // ── 删除 ──────────────────────────────────────────────────────────────
    const deleted = await service.deleteProject(ctx, projectId);
    expect(deleted.id).toBe(projectId); // 返回删除前快照

    // 项目本身 → 404。
    await expect(repo.get(ctx, projectId)).rejects.toMatchObject({
      name: "OwnershipError",
    });

    // 直接子表清零(经 repo 的只读或直接 db 查)。
    expect(
      await db.select().from(reviews).where(eq(reviews.projectId, projectId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(reviewInsights)
        .where(eq(reviewInsights.reviewId, "rev-1")),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(scriptReviewReports)
        .where(eq(scriptReviewReports.projectId, projectId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(materialLinks)
        .where(eq(materialLinks.projectId, projectId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(artifacts)
        .where(eq(artifacts.projectId, projectId)),
    ).toHaveLength(0);
    // 孙表(artifact_version / script_section)清零。
    expect(
      await db
        .select()
        .from(artifactVersions)
        .where(eq(artifactVersions.artifactId, "art-1")),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(scriptSections)
        .where(eq(scriptSections.artifactVersionId, "artv-1")),
    ).toHaveLength(0);
    // 发布链(publication + revision)清零。
    expect(
      await db
        .select()
        .from(publications)
        .where(eq(publications.contentOutputId, outputId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(publicationRevisions)
        .where(eq(publicationRevisions.publicationId, "pub-1")),
    ).toHaveLength(0);
    // AI 会话/消息 + 任务/结果清零。
    expect(
      await db
        .select()
        .from(aiConversations)
        .where(eq(aiConversations.projectId, projectId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, "conv-1")),
    ).toHaveLength(0);
    expect(
      await db.select().from(aiTasks).where(eq(aiTasks.projectId, projectId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(aiTaskResults)
        .where(eq(aiTaskResults.aiTaskId, "task-1")),
    ).toHaveLength(0);

    // 评论信号(audience_signal)行留存,但 publication_id 已解锚为 null(独立 ingestion
    // 溯源不随项目物理删而丢,只断开对已删 publication 的悬挂引用)。
    const sig = await db
      .select()
      .from(audienceSignals)
      .where(eq(audienceSignals.id, "sig-1"));
    expect(sig).toHaveLength(1);
    expect(sig[0]!.publicationId).toBeNull();
  });

  it("已归档项目也能物理删除(archive 只读态不拦删除)", async () => {
    const project = await service.createProject(ctx, { title: "归档后删" });
    await service.archiveProject(ctx, project.id);
    const deleted = await service.deleteProject(ctx, project.id);
    expect(deleted.id).toBe(project.id);
    await expect(repo.get(ctx, project.id)).rejects.toMatchObject({
      name: "OwnershipError",
    });
  });
});

describe("ensureImportedProject (数据底座 / SPEC §1.3)", () => {
  it("建 source:imported 项目 + 1 个 content_output,带真实标题/平台引用", async () => {
    const res = await service.ensureImportedProject(ctx, {
      title: "AI 工作流四步法",
      // [T-089] 文案全文随导入落 brief(title 只留短标题,创作资产存证)。
      brief: "AI 工作流四步法\n第二行整篇文案……",
      platform: "douyin",
      externalId: "7400",
      publishedAt: "2026-06-20T08:00:00.000Z",
    });
    expect(res.created).toBe(true);
    const project = await repo.get(ctx, res.projectId);
    expect(project.source).toBe("imported");
    expect(project.title).toBe("AI 工作流四步法");
    expect(project.brief).toBe("AI 工作流四步法\n第二行整篇文案……");
    const outputs = await repo.listOutputs(ctx, res.projectId);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]!.id).toBe(res.outputId);
  });

  it("幂等于 (userId, platform, externalId):二次调用返回既有 id 且不重复建", async () => {
    const first = await service.ensureImportedProject(ctx, {
      title: "AI 工作流四步法",
      platform: "douyin",
      externalId: "7400",
    });
    const second = await service.ensureImportedProject(ctx, {
      title: "标题变了也不重复建",
      platform: "douyin",
      externalId: "7400",
    });
    expect(second.created).toBe(false);
    expect(second.projectId).toBe(first.projectId);
    expect(second.outputId).toBe(first.outputId);
    const imported = (await repo.list(ctx)).filter(
      (p) => p.source === "imported",
    );
    expect(imported).toHaveLength(1);
  });

  // SPEC §9/F4(T-030-D5):imported 已发布项目进度必须 = 100%(含 review 阶段)。
  //   回归防线:曾因 review 阶段 progressPct=0 → recomputeProgress 均值 ~86%(6×100/7)。
  it("imported 项目进度 = 100%(全 7 阶段含 review 置满,防回归到 86)", async () => {
    const res = await service.ensureImportedProject(ctx, {
      title: "已发布作品",
      platform: "douyin",
      externalId: "7401",
      publishedAt: "2026-06-20T08:00:00.000Z",
    });
    const project = await repo.get(ctx, res.projectId);
    expect(project.progressPct).toBe(100);
    // review 阶段 progressPct 也置满(状态仍 in_progress、currentStage 仍是 review)。
    const stages = await repo.listStages(ctx, res.projectId);
    const review = stages.find((s) => s.stage === "review")!;
    expect(review.progressPct).toBe(100);
    expect(review.status).toBe("in_progress");
    expect(project.currentStage).toBe("review");
    // 每个阶段的 progressPct 都应为 100(均值才可能 = 100)。
    for (const s of stages) expect(s.progressPct).toBe(100);
  });

  // [T-073] 平台侧可见性同步:抖音端「仅自己可见/已隐藏」→ platform_ref.hidden。
  it("setImportedProjectHidden:置/清 platform_ref.hidden 且不丢既有键;未导入返 null", async () => {
    const res = await service.ensureImportedProject(ctx, {
      title: "会被隐藏的作品",
      platform: "douyin",
      externalId: "7402",
      publishedAt: "2026-06-20T08:00:00.000Z",
    });
    // 置 hidden:merge jsonb,externalId/publishedAt 不丢。
    const hidden = await service.setImportedProjectHidden(ctx, {
      platform: "douyin",
      externalId: "7402",
      hidden: true,
    });
    const refAfter = (hidden as { platformRef?: Record<string, unknown> })
      .platformRef!;
    expect(refAfter.hidden).toBe(true);
    expect(refAfter.externalId).toBe("7402");
    expect(refAfter.publishedAt).toBe("2026-06-20T08:00:00.000Z");
    expect(hidden!.id).toBe(res.projectId);
    // 清 hidden(平台侧恢复可见)。
    const visible = await service.setImportedProjectHidden(ctx, {
      platform: "douyin",
      externalId: "7402",
      hidden: false,
    });
    expect(
      (visible as { platformRef?: Record<string, unknown> }).platformRef!.hidden,
    ).toBe(false);
    // 未导入(找不到 externalId)→ 诚实 null,不硬造。
    const missing = await service.setImportedProjectHidden(ctx, {
      platform: "douyin",
      externalId: "no-such",
      hidden: true,
    });
    expect(missing).toBeNull();
  });

  // [T-151 / T-037 缺口 A] 导入后触发逐字稿/重建需要 { projectId, platform, externalId } 两维。
  it("listImportedWorks:返回 imported 作品的 projectId + platform + externalId(无锚的过滤掉)", async () => {
    const a = await service.ensureImportedProject(ctx, {
      title: "作品甲",
      platform: "douyin",
      externalId: "aweme-A",
    });
    const b = await service.ensureImportedProject(ctx, {
      title: "作品乙",
      platform: "douyin",
      externalId: "aweme-B",
    });
    const works = await service.listImportedWorks(ctx);
    // 两条都带真实 aweme 锚。
    expect(works).toEqual(
      expect.arrayContaining([
        { projectId: a.projectId, platform: "douyin", externalId: "aweme-A" },
        { projectId: b.projectId, platform: "douyin", externalId: "aweme-B" },
      ]),
    );
    expect(works).toHaveLength(2);
    // 每条都有非空 externalId(无锚的诚实过滤,不返回)。
    for (const w of works) expect(w.externalId.length).toBeGreaterThan(0);
  });
});

describe("T-724 imported 项目身份收口", () => {
  it("两个 output 属主查询都只把真实不存在降级为 null，基础设施故障保持 fail-closed", async () => {
    vi.spyOn(repo, "getOutput").mockRejectedValue(
      new Error("database temporarily unavailable"),
    );

    await expect(
      service.getProjectIdByOutput(ctx, "output-unavailable"),
    ).rejects.toThrow("database temporarily unavailable");
    await expect(
      service.getOutputOwnerSummary(ctx, "output-unavailable"),
    ).rejects.toThrow("database temporarily unavailable");
  });

  it("同平台作品的全部非 canonical imported 投影一次事务归档，重复调用不重复 activity", async () => {
    const canonical = await service.createProject(ctx, {
      title: "原创项目",
      source: "manual",
    });
    const ref = {
      platform: "douyin",
      externalId: "aweme-t724-all",
      publishedAt: NOW,
    };
    const first = await service.createProject(ctx, {
      title: "自动导入 1",
      source: "imported",
      platformRef: ref,
    });
    const second = await service.createProject(ctx, {
      title: "自动导入 2",
      source: "imported",
      platformRef: ref,
    });
    const already = await service.createProject(ctx, {
      title: "已归档投影",
      source: "imported",
      platformRef: ref,
    });
    await service.archiveProject(ctx, already.id);

    const reconciled = await service.reconcileImportedProjections(ctx, {
      platform: "douyin",
      externalId: "aweme-t724-all",
      canonicalProjectId: canonical.id,
    });
    expect(reconciled.archivedProjectIds).toEqual([first.id, second.id]);
    expect(reconciled.alreadyArchivedProjectIds).toEqual([already.id]);
    expect((await repo.get(ctx, first.id)).status).toBe("archived");
    expect((await repo.get(ctx, second.id)).status).toBe("archived");
    expect((await repo.get(ctx, canonical.id)).status).toBe("active");
    expect(
      (await repo.listActivity(ctx, first.id)).filter(
        (row) => row.eventType === "project_superseded",
      ),
    ).toHaveLength(1);

    const repeated = await service.reconcileImportedProjections(ctx, {
      platform: "douyin",
      externalId: "aweme-t724-all",
      canonicalProjectId: canonical.id,
    });
    expect(repeated.archivedProjectIds).toEqual([]);
    expect(repeated.alreadyArchivedProjectIds).toEqual([
      first.id,
      second.id,
      already.id,
    ]);
    expect(
      (await repo.listActivity(ctx, first.id)).filter(
        (row) => row.eventType === "project_superseded",
      ),
    ).toHaveLength(1);
  });
});

describe("Stage machine (SPEC §12)", () => {
  // 立项 Brief 地基:新建项目首阶段是 brief。无 gate reader 的 service 下,brief gate
  // 仍是 project-local 校验 —— 要离开 brief 必须 brief_detail 核心必填齐。这个 helper
  // 把项目推过 brief(填齐 Brief + 完成 brief),让 research 成为活动阶段,复用旧断言。
  async function createPastBrief(): Promise<string> {
    const p = await service.createProject(ctx, {
      title: "T",
      briefDetail: {
        targetAudience: "受众",
        contentGoal: "目标",
        contentFormat: "口播",
        targetPlatforms: ["douyin"],
        coreMessage: "主张",
      },
    });
    await service.transitionProjectStage(ctx, p.id, "brief", {}); // brief → completed
    return p.id;
  }

  it("pending→in_progress→completed legal, recomputes progress + appends activity", async () => {
    const pid = await createPastBrief();
    // research is now the active stage (brief done). Start then complete it.
    await service.transitionProjectStage(ctx, pid, "research", {}); // pending→in_progress
    const afterComplete = await service.transitionProjectStage(ctx, pid, "research", {});
    expect(afterComplete.progressPct).toBeGreaterThan(0);
    const stages1 = await repo.listStages(ctx, pid);
    expect(stages1.find((s) => s.stage === "research")!.status).toBe("completed");

    // planning is pending → start it.
    const afterStart = await service.transitionProjectStage(ctx, pid, "planning", {});
    const stages2 = await repo.listStages(ctx, pid);
    expect(stages2.find((s) => s.stage === "planning")!.status).toBe("in_progress");
    expect(afterStart.currentStage).toBe("planning");
  });

  it("→skipped requires a reason; without one → StageTransitionError", async () => {
    const pid = await createPastBrief();
    // research is pending; a non-empty reason skips it.
    const skipped = await service.transitionProjectStage(ctx, pid, "research", {
      reason: "不需要研究",
    });
    expect(skipped).toBeDefined();
    const research = (await repo.listStages(ctx, pid)).find((s) => s.stage === "research")!;
    expect(research.status).toBe("skipped");
    expect(research.skipped).toBe(true);
  });

  it("illegal target (completed has no successor) → StageTransitionError", async () => {
    const pid = await createPastBrief();
    // brief is already completed → transitioning it again is illegal.
    await expect(
      service.transitionProjectStage(ctx, pid, "brief", {}),
    ).rejects.toBeInstanceOf(StageTransitionError);
  });

  it("skipped counts as completed for the progress average", async () => {
    const pid = await createPastBrief();
    // brief is completed (100). Skip research (counts 100).
    const after = await service.transitionProjectStage(ctx, pid, "research", {
      reason: "skip",
    });
    // 2 of 7 stages at 100 → 200/7 ≈ 29
    expect(after.progressPct).toBe(29);
  });
});

describe("Project machine — archive read-only", () => {
  it("archives from active and blocks subsequent patch/transition", async () => {
    const p = await service.createProject(ctx, { title: "T" });
    const archived = await service.archiveProject(ctx, p.id);
    expect(archived.status).toBe("archived");
    expect(archived.archivedAt).toBe(NOW);

    await expect(
      service.patchProject(ctx, p.id, { title: "改名" }),
    ).rejects.toBeInstanceOf(ProjectStateError);
    await expect(
      service.transitionProjectStage(ctx, p.id, "planning", {}),
    ).rejects.toBeInstanceOf(ProjectStateError);
    await expect(service.archiveProject(ctx, p.id)).rejects.toBeInstanceOf(
      ProjectStateError,
    );
  });

  it("patchProject updates title/brief/starred when not archived", async () => {
    const p = await service.createProject(ctx, { title: "T" });
    const patched = await service.patchProject(ctx, p.id, {
      title: "新名",
      starred: true,
    });
    expect(patched.title).toBe("新名");
    expect(patched.starred).toBe(true);
  });
});

describe("ContentOutput machine", () => {
  it("createOutput seeds status drafting + 4 output stages (first in_progress) + carries contentRole", async () => {
    const p = await service.createProject(ctx, { title: "T" });
    const output = await service.createOutput(ctx, p.id, {
      title: "主视频",
      contentRole: "conversion",
    });
    expect(output.status).toBe("drafting");
    expect(output.contentRole).toBe("conversion");

    const script = await repo.getOutputStage(ctx, output.id, "script");
    expect(script.status).toBe("in_progress");
    const review = await repo.getOutputStage(ctx, output.id, "review");
    expect(review.status).toBe("pending");
  });

  it("transitionOutputStage advances a stage; all completed → status published", async () => {
    const p = await service.createProject(ctx, { title: "T" });
    const output = await service.createOutput(ctx, p.id, { title: "O" });
    // script in_progress → completed
    await service.transitionOutputStage(ctx, output.id, "script", {});
    // start + complete the remaining three
    for (const stage of ["production", "publishing", "review"] as const) {
      await service.transitionOutputStage(ctx, output.id, stage, {}); // pending→in_progress
      await service.transitionOutputStage(ctx, output.id, stage, {}); // in_progress→completed
    }
    const final = await repo.getOutput(ctx, output.id);
    expect(final.status).toBe("published");
  });

  it("patchOutput sets title + primaryAssetId (cross-module guard deferred)", async () => {
    const p = await service.createProject(ctx, { title: "T" });
    const output = await service.createOutput(ctx, p.id, { title: "O" });
    const patched = await service.patchOutput(ctx, output.id, {
      title: "改",
      primaryAssetId: "asset-1",
    });
    expect(patched.title).toBe("改");
    expect(patched.primaryAssetId).toBe("asset-1");
  });
});

describe("Task machine", () => {
  it("createTask → todo, priority 3", async () => {
    const p = await service.createProject(ctx, { title: "T" });
    const task = await service.createTask(ctx, p.id, { title: "写大纲", stage: "script" });
    expect(task.status).toBe("todo");
    expect(task.priority).toBe(3);
  });

  it("patchTask →done stamps completed_at; reopening clears it", async () => {
    const p = await service.createProject(ctx, { title: "T" });
    const task = await service.createTask(ctx, p.id, { title: "T", stage: "research" });
    const done = await service.patchTask(ctx, task.id, { status: "done" });
    expect(done.status).toBe("done");
    expect(done.completedAt).toBe(NOW);
    const reopened = await service.patchTask(ctx, task.id, { status: "in_progress" });
    expect(reopened.completedAt).toBeNull();
  });
});

describe("getDashboardSummary (GAP-DASH-1)", () => {
  function projectRow(over: Partial<ProjectRow> & Pick<ProjectRow, "id" | "updatedAt">): ProjectRow {
    return {
      userId: ctx.userId,
      accountId: over.accountId ?? "acct-1",
      title: over.title ?? over.id,
      brief: "",
      briefDetail: {},
      contentCategory: "",
      source: "manual",
      platformRef: {},
      creationMode: "guided",
      status: "active",
      currentStage: "planning",
      progressPct: 0,
      starred: false,
      startedAt: over.updatedAt,
      targetCompletedAt: null,
      completedAt: null,
      archivedAt: null,
      createdAt: over.updatedAt,
      ...over,
    };
  }
  function taskRow(over: Partial<TaskRow> & Pick<TaskRow, "id" | "projectId">): TaskRow {
    return {
      contentOutputId: null,
      stage: "script",
      title: over.title ?? over.id,
      description: "",
      status: "todo",
      priority: 3,
      dueAt: null,
      completedAt: null,
      ...over,
    };
  }

  it("returns empty/null on no data (does not throw)", async () => {
    const summary = await service.getDashboardSummary(ctx);
    expect(summary.continueCreating).toBeNull();
    expect(summary.todos).toEqual([]);
  });

  it("continueCreating = newest non-archived; archived excluded", async () => {
    await repo.seedProjects([
      projectRow({ id: "p-old", title: "旧", updatedAt: "2026-06-01T00:00:00+08:00" }),
      projectRow({ id: "p-new", title: "新", currentStage: "script", progressPct: 42, updatedAt: "2026-06-20T00:00:00+08:00" }),
      // a more-recent project that is archived → must be ignored.
      projectRow({ id: "p-arc", title: "归档", status: "archived", updatedAt: "2026-06-21T00:00:00+08:00" }),
    ]);
    const summary = await service.getDashboardSummary(ctx);
    expect(summary.continueCreating).toEqual({
      projectId: "p-new",
      projectTitle: "新",
      stage: "script",
      progressPct: 42,
      updatedAt: "2026-06-20T00:00:00+08:00",
    });
  });

  it("continueCreating excludes imported history projects", async () => {
    await repo.seedProjects([
      projectRow({
        id: "p-manual",
        title: "手动创作项目",
        updatedAt: "2026-06-20T00:00:00+08:00",
      }),
      projectRow({
        id: "p-imported",
        title: "抖音历史作品",
        source: "imported",
        currentStage: "review",
        progressPct: 100,
        updatedAt: "2026-06-21T00:00:00+08:00",
      }),
    ]);

    const summary = await service.getDashboardSummary(ctx);

    expect(summary.continueCreating?.projectId).toBe("p-manual");
    expect(summary.continueCreating?.projectTitle).toBe("手动创作项目");
  });

  it("todos: done filtered out, sorted priority desc then dueAt asc, capped at 5, carries projectTitle", async () => {
    await repo.seedProjects([
      projectRow({ id: "p1", title: "我的项目", updatedAt: "2026-06-20T00:00:00+08:00" }),
    ]);
    await repo.seedTasks([
      taskRow({ id: "t-done", projectId: "p1", status: "done", priority: 9 }), // filtered
      taskRow({ id: "t-lowpri", projectId: "p1", priority: 1, dueAt: "2026-06-25" }),
      taskRow({ id: "t-hi-late", projectId: "p1", priority: 5, dueAt: "2026-06-30" }),
      taskRow({ id: "t-hi-early", projectId: "p1", priority: 5, dueAt: "2026-06-24" }),
      taskRow({ id: "t-blocked", projectId: "p1", status: "blocked", priority: 3 }),
    ]);
    const summary = await service.getDashboardSummary(ctx);
    const ids = summary.todos.map((t) => t.id);
    expect(ids).toEqual(["t-hi-early", "t-hi-late", "t-blocked", "t-lowpri"]);
    expect(ids).not.toContain("t-done");
    expect(summary.todos.every((t) => t.projectTitle === "我的项目")).toBe(true);
    expect(summary.todos.length).toBeLessThanOrEqual(5);
  });
});

// §15/§16 内容门禁(阶段流转 gate)。用一个可控的 StageGateReadersRef 注入「假交付物
// 数据源」(测试不需要真起 artifacts/production 等模块,只验证 gate 接线/拦截/放行/
// needs_review 落点/诚实跳过 这套 projects 模块内部的逻辑)。
describe("Stage gate (§15/§16 content gate)", () => {
  // 一个可变 holder + 一个「project 已有的交付物类型集合」状态,模拟 artifacts 等
  // 数据源。默认所有 reader 都接好(非「无数据源」),由 artifactTypes 决定有无。
  function makeGatedService() {
    const artifactTypes = new Set<string>();
    let readyProduction = false;
    let hasPublication = false;
    let hasReview = false;
    const ref: StageGateReadersRef = {
      current: {
        listProjectArtifactTypes: async () => [...artifactTypes],
        hasReadyProduction: async () => readyProduction,
        hasPublication: async () => hasPublication,
        hasCompletedReview: async () => hasReview,
      },
    };
    const gated = createProjectsService(repo, deterministicDeps(), ref);
    // 立项 Brief 地基:新建项目首阶段是 brief。研究/策划等阶段的 gate 测试需要先把项目
    // 推过 brief(填齐 Brief + 完成 brief),让 research 成为 in_progress 活动阶段。
    async function createPastBrief(): Promise<string> {
      const p = await gated.createProject(ctx, {
        title: "T",
        briefDetail: {
          targetAudience: "受众",
          contentGoal: "目标",
          contentFormat: "口播",
          targetPlatforms: ["douyin"],
          coreMessage: "主张",
        },
      });
      await gated.transitionProjectStage(ctx, p.id, "brief", {}); // brief → completed
      // research 现为 pending → 启动它,回到旧测试「research in_progress」前置。
      await gated.transitionProjectStage(ctx, p.id, "research", {}); // pending→in_progress
      return p.id;
    }
    return {
      gated,
      ref,
      createPastBrief,
      addArtifact: (t: string) => artifactTypes.add(t),
      setReadyProduction: (v: boolean) => (readyProduction = v),
      setPublication: (v: boolean) => (hasPublication = v),
      setReview: (v: boolean) => (hasReview = v),
    };
  }

  it("research → completed 被拦:缺研究 artifact → 落 needs_review + 抛 StageGateError(带 missing)", async () => {
    const { gated, createPastBrief } = makeGatedService();
    const pid = await createPastBrief(); // 过 brief,research 现为 in_progress
    // research 此时无任何研究类 artifact → gate 不过。
    await expect(
      gated.transitionProjectStage(ctx, pid, "research", {}),
    ).rejects.toBeInstanceOf(StageGateError);

    // 该阶段被持久化为 needs_review(卡点),而非 completed。
    const research = (await repo.listStages(ctx, pid)).find(
      (s) => s.stage === "research",
    )!;
    expect(research.status).toBe("needs_review");

    // 写了一条 gate_blocked 活动,携带 missing 列表。
    const acts = await repo.listActivity(ctx, pid);
    const blocked = acts.find((a) => a.eventType === "stage_gate_blocked");
    expect(blocked).toBeDefined();
    expect(
      (blocked!.eventData as { missing: string[] }).missing.length,
    ).toBeGreaterThan(0);
  });

  // ---- T-030-D5(SPEC §9/F4):imported 免 gate 自由跳阶段;manual 仍受 gate ----

  it("imported 项目 transitionProjectStage→completed 免 gate:交付物缺失也放行、不落 needs_review", async () => {
    const { gated } = makeGatedService();
    // imported 项目:review 阶段天然 in_progress,且无 completed review 交付物
    //   (hasCompletedReview 默认 false)。manual 项目此场景会被 gate 拒,imported 应放行。
    const p = await gated.createProject(ctx, {
      title: "已发布作品",
      source: "imported",
      platformRef: { platform: "douyin", externalId: "7402" },
    });
    // review(in_progress)→ completed:不抛 StageGateError。
    const after = await gated.transitionProjectStage(ctx, p.id, "review", {});
    // 阶段真的落到 completed(未被拦成 needs_review)。
    const review = (await repo.listStages(ctx, p.id)).find(
      (s) => s.stage === "review",
    )!;
    expect(review.status).toBe("completed");
    // 没有写 gate_blocked 活动(免 gate 全程未触发拦截)。
    const acts = await repo.listActivity(ctx, p.id);
    expect(acts.find((a) => a.eventType === "stage_gate_blocked")).toBeUndefined();
    // 进度缓存正常重算(全阶段 completed/满 → 100)。
    expect(after.progressPct).toBe(100);
  });

  it("manual/新建项目仍受 gate:同为交付物缺失 → transition→completed 被 StageGateError 拒(证明只对 imported 放行)", async () => {
    const { gated, createPastBrief } = makeGatedService();
    // manual 项目推到 research(in_progress),无任何研究 artifact → gate 必须拦。
    const pid = await createPastBrief();
    await expect(
      gated.transitionProjectStage(ctx, pid, "research", {}),
    ).rejects.toBeInstanceOf(StageGateError);
    // 被持久化为 needs_review(与 imported 放行形成对照)。
    const research = (await repo.listStages(ctx, pid)).find(
      (s) => s.stage === "research",
    )!;
    expect(research.status).toBe("needs_review");
  });

  it("StageGateError 携带 stage + 中文 missing 列表(供前端 stepper 透传)", async () => {
    const { gated, createPastBrief } = makeGatedService();
    const pid = await createPastBrief();
    try {
      await gated.transitionProjectStage(ctx, pid, "research", {});
      throw new Error("应当抛 StageGateError");
    } catch (e) {
      expect(e).toBeInstanceOf(StageGateError);
      const ge = e as StageGateError;
      expect(ge.details.stage).toBe("research");
      expect(ge.details.missing.length).toBeGreaterThan(0);
      expect(ge.code).toBe("ConflictError");
    }
  });

  it("补齐研究 artifact 后,从 needs_review → completed 放行", async () => {
    const { gated, addArtifact, createPastBrief } = makeGatedService();
    const pid = await createPastBrief();
    // 第一次被拦 → needs_review。
    await expect(
      gated.transitionProjectStage(ctx, pid, "research", {}),
    ).rejects.toBeInstanceOf(StageGateError);
    // 补上一个研究类 artifact。
    addArtifact("research_note");
    // 再次 transition(needs_review → completed)→ 放行。
    const after = await gated.transitionProjectStage(ctx, pid, "research", {});
    const research = (await repo.listStages(ctx, pid)).find(
      (s) => s.stage === "research",
    )!;
    expect(research.status).toBe("completed");
    expect(after.progressPct).toBeGreaterThan(0);
  });

  it("交付物齐备时 in_progress → completed 直接放行(不经 needs_review)", async () => {
    const { gated, addArtifact, createPastBrief } = makeGatedService();
    const pid = await createPastBrief();
    addArtifact("market_analysis"); // research 交付物先就位
    const after = await gated.transitionProjectStage(ctx, pid, "research", {});
    expect(after).toBeDefined();
    const research = (await repo.listStages(ctx, pid)).find(
      (s) => s.stage === "research",
    )!;
    expect(research.status).toBe("completed");
  });

  it("→skipped(带理由)绕过 gate:即便缺交付物也能跳过", async () => {
    const { gated, createPastBrief } = makeGatedService();
    const pid = await createPastBrief();
    // research in_progress,缺交付物,但带理由 → 跳过(不跑 gate)。
    const skipped = await gated.transitionProjectStage(ctx, pid, "research", {
      reason: "本期不做研究",
    });
    expect(skipped).toBeDefined();
    const research = (await repo.listStages(ctx, pid)).find(
      (s) => s.stage === "research",
    )!;
    expect(research.status).toBe("skipped");
  });

  it("validateStageGate 预检:缺 → ok=false + missing;齐 → ok=true", async () => {
    const { gated, addArtifact } = makeGatedService();
    const p = await gated.createProject(ctx, { title: "T" });
    const before = await gated.validateStageGate(ctx, p.id, "planning");
    expect(before.ok).toBe(false);
    expect(before.missing.length).toBeGreaterThan(0);
    addArtifact("content_contract");
    const afterCheck = await gated.validateStageGate(ctx, p.id, "planning");
    expect(afterCheck.ok).toBe(true);
    expect(afterCheck.missing).toEqual([]);
  });

  it("各阶段接对应数据源:production/publishing/review", async () => {
    const {
      gated,
      setReadyProduction,
      setPublication,
      setReview,
    } = makeGatedService();
    const p = await gated.createProject(ctx, { title: "T" });
    // production:无 ready production → 拦;有 → 过。
    expect((await gated.validateStageGate(ctx, p.id, "production")).ok).toBe(false);
    setReadyProduction(true);
    expect((await gated.validateStageGate(ctx, p.id, "production")).ok).toBe(true);
    // publishing。
    expect((await gated.validateStageGate(ctx, p.id, "publishing")).ok).toBe(false);
    setPublication(true);
    expect((await gated.validateStageGate(ctx, p.id, "publishing")).ok).toBe(true);
    // review。
    expect((await gated.validateStageGate(ctx, p.id, "review")).ok).toBe(false);
    setReview(true);
    expect((await gated.validateStageGate(ctx, p.id, "review")).ok).toBe(true);
  });

  it("无数据源(holder 未绑定)→ research gate 诚实跳过 → 恒过(保持旧行为)", async () => {
    // service 用默认 holder(current=null),无任何 reader。先把项目推过 brief
    // (brief gate 是 project-local,填齐才能完成),让 research 成为 in_progress。
    const p = await service.createProject(ctx, {
      title: "T",
      briefDetail: {
        targetAudience: "受众",
        contentGoal: "目标",
        contentFormat: "口播",
        targetPlatforms: ["douyin"],
        coreMessage: "主张",
      },
    });
    await service.transitionProjectStage(ctx, p.id, "brief", {}); // brief → completed
    const result = await service.validateStageGate(ctx, p.id, "research");
    expect(result.ok).toBe(true); // research 无数据源 → 不拦
    expect(result.skipped.length).toBeGreaterThan(0); // 但诚实记为 skipped
    expect(result.missing).toEqual([]);
    // research transition 也照旧放行(无 reader → 跳过 → in_progress → completed)。
    await service.transitionProjectStage(ctx, p.id, "research", {}); // pending→in_progress
    const after = await service.transitionProjectStage(ctx, p.id, "research", {});
    const research = (await repo.listStages(ctx, p.id)).find(
      (s) => s.stage === "research",
    )!;
    expect(research.status).toBe("completed");
    expect(after).toBeDefined();
  });
});

// brief 阶段 gate(立项 Brief 地基 / PRD §7):数据源是 PROJECT 自身(title +
// brief_detail jsonb),不是 peer reader —— 永远可校验,缺核心必填就拦,绝不诚实跳过。
describe("Brief stage gate (立项 Brief 地基)", () => {
  const FULL_BRIEF = {
    targetAudience: "想转型做内容的职场人",
    contentGoal: "建立专业信任",
    contentFormat: "口播",
    targetPlatforms: ["douyin"],
    coreMessage: "一句话讲清楚定位",
  };

  it("新建项目落 brief 阶段,brief 在第一位 in_progress", async () => {
    const p = await service.createProject(ctx, { title: "T" });
    expect(p.currentStage).toBe("brief");
    const stages = await repo.listStages(ctx, p.id);
    expect(stages.find((s) => s.stage === "brief")!.status).toBe("in_progress");
  });

  it("空 Brief:validateStageGate(brief) ok=false + 返回所有缺失项(项目名除外)", async () => {
    // 默认 service(无 reader)也能跑 brief gate —— brief 不依赖 reader。
    const p = await service.createProject(ctx, { title: "有名字的项目" });
    const result = await service.validateStageGate(ctx, p.id, "brief");
    expect(result.ok).toBe(false);
    // 项目名已填(title 非空)→ 不在 missing;其余 4 项核心必填缺。
    expect(result.missing).not.toContain("项目名称");
    expect(result.missing).toEqual(
      expect.arrayContaining([
        "目标受众",
        "内容目标",
        "内容形式",
        "核心信息",
      ]),
    );
    // SPEC §1.2 SKL-08:目标平台已降级为可选 —— 绝不出现在 brief gate 缺失项里。
    expect(result.missing).not.toContain("目标平台(至少 1 个)");
    // brief gate 永远可校验,绝不诚实跳过。
    expect(result.skipped).toEqual([]);
  });

  it("SKL-08 立项不强制平台:Brief 无目标平台也能完成 brief gate", async () => {
    // 核心四项齐、targetPlatforms 留空 —— gate 应放行(平台退回发布层,立项不强制)。
    const p = await service.createProject(ctx, {
      title: "无平台立项",
      briefDetail: {
        targetAudience: "想转型做内容的职场人",
        contentGoal: "建立专业信任",
        contentFormat: "口播",
        coreMessage: "一句话讲清楚定位",
        targetPlatforms: [],
      },
    });
    const check = await service.validateStageGate(ctx, p.id, "brief");
    expect(check.ok).toBe(true);
    expect(check.missing).toEqual([]);
    // transition 放行 → 推进到 research。
    const after = await service.transitionProjectStage(ctx, p.id, "brief", {});
    expect(after.currentStage).toBe("research");
  });

  it("transition brief→completed 被拦:缺必填 → 落 needs_review + StageGateError", async () => {
    const p = await service.createProject(ctx, { title: "T" });
    await expect(
      service.transitionProjectStage(ctx, p.id, "brief", {}),
    ).rejects.toBeInstanceOf(StageGateError);
    const brief = (await repo.listStages(ctx, p.id)).find(
      (s) => s.stage === "brief",
    )!;
    expect(brief.status).toBe("needs_review");
    const blocked = (await repo.listActivity(ctx, p.id)).find(
      (a) => a.eventType === "stage_gate_blocked",
    );
    expect(blocked).toBeDefined();
    expect((blocked!.eventData as { stage: string }).stage).toBe("brief");
  });

  it("核心必填齐:validateStageGate(brief) ok=true 且 transition 放行进 research", async () => {
    const p = await service.createProject(ctx, {
      title: "完整立项",
      briefDetail: FULL_BRIEF,
    });
    const check = await service.validateStageGate(ctx, p.id, "brief");
    expect(check.ok).toBe(true);
    expect(check.missing).toEqual([]);
    // brief → completed 放行;currentStage 推进到 research。
    const after = await service.transitionProjectStage(ctx, p.id, "brief", {});
    const brief = (await repo.listStages(ctx, p.id)).find(
      (s) => s.stage === "brief",
    )!;
    expect(brief.status).toBe("completed");
    expect(after.currentStage).toBe("research");
  });

  it("缺项目名(title 空)被列入 missing", async () => {
    // 用 seed 直接造一个 title 为空、brief_detail 已填的项目(绕过 createProject 的
    // title 必填),验证 brief gate 把「项目名称」列入 missing。
    await repo.seedProjects([
      {
        id: "p-noname",
        userId: ctx.userId,
        accountId: "acct-1", // [T-332 S2] NOT NULL
        title: "",
        brief: "",
        briefDetail: FULL_BRIEF,
        contentCategory: "",
        creationMode: "guided",
        status: "active",
        currentStage: "brief",
        progressPct: 0,
        starred: false,
        startedAt: NOW,
        targetCompletedAt: null,
        completedAt: null,
        archivedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      } as ProjectRow,
    ]);
    const result = await service.validateStageGate(ctx, "p-noname", "brief");
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("项目名称");
  });

  it("补齐缺失项后,从 needs_review → completed 放行(复用第①步机制)", async () => {
    const p = await service.createProject(ctx, { title: "T" });
    // 第一次被拦 → needs_review。
    await expect(
      service.transitionProjectStage(ctx, p.id, "brief", {}),
    ).rejects.toBeInstanceOf(StageGateError);
    // 立项工作台保存补齐 Brief(patchProject 真落库)。
    await service.patchProject(ctx, p.id, { briefDetail: FULL_BRIEF });
    // 再次 transition(needs_review → completed)→ 放行。
    const after = await service.transitionProjectStage(ctx, p.id, "brief", {});
    const brief = (await repo.listStages(ctx, p.id)).find(
      (s) => s.stage === "brief",
    )!;
    expect(brief.status).toBe("completed");
    expect(after.currentStage).toBe("research");
  });

  it("patchProject 落库 briefDetail(立项工作台保存真落库)", async () => {
    const p = await service.createProject(ctx, { title: "T" });
    const patched = await service.patchProject(ctx, p.id, {
      briefDetail: FULL_BRIEF,
    });
    const detail = (patched as { briefDetail?: Record<string, unknown> })
      .briefDetail!;
    expect(detail.targetAudience).toBe("想转型做内容的职场人");
    expect(detail.targetPlatforms).toEqual(["douyin"]);
    // 再读一次确认持久化。
    const reread = await repo.get(ctx, p.id);
    const rereadDetail = (reread as { briefDetail?: Record<string, unknown> })
      .briefDetail!;
    expect(rereadDetail.coreMessage).toBe("一句话讲清楚定位");
  });

  it("SKL-09 数据源收敛:patchProject 把目标平台写到 project_target_platforms 关系表(单一写真值)", async () => {
    // 旧 bug:patch 只写 jsonb、关系表只在 create 播种 → 两源漂移。现在 patch 应整体替换
    //   关系表,且 jsonb 镜像与关系表同序一致。
    const p = await service.createProject(ctx, { title: "T" });
    // 初次保存:bilibili + youtube。
    await service.patchProject(ctx, p.id, {
      briefDetail: {
        ...FULL_BRIEF,
        targetPlatforms: ["bilibili", "youtube"],
      },
    });
    const rows1 = await repo.listTargetPlatforms(ctx, p.id);
    expect(rows1.map((r) => r.platform).sort()).toEqual(["bilibili", "youtube"]);
    const d1 = (await repo.get(ctx, p.id)) as {
      briefDetail?: { targetPlatforms?: string[] };
    };
    // jsonb 镜像与关系表一致(同一来源)。
    expect(d1.briefDetail?.targetPlatforms).toEqual(["bilibili", "youtube"]);

    // 再次保存改成 douyin 一个:关系表整体替换(去掉 bilibili/youtube,只剩 douyin)。
    await service.patchProject(ctx, p.id, {
      briefDetail: { ...FULL_BRIEF, targetPlatforms: ["douyin"] },
    });
    const rows2 = await repo.listTargetPlatforms(ctx, p.id);
    expect(rows2.map((r) => r.platform)).toEqual(["douyin"]);
  });

  it("SKL-09 数据源收敛:选题/Brief 立项(只带 briefDetail)也播种关系表", async () => {
    // candidate.service 立项走 createProject({ briefDetail })(不带 cmd.targetPlatforms),
    //   关系表必须从 Brief 草稿的 targetPlatforms 播种,而非恒空。
    const p = await service.createProject(ctx, {
      title: "选题立项",
      briefDetail: { ...FULL_BRIEF, targetPlatforms: ["xiaohongshu", "douyin"] },
    });
    const rows = await repo.listTargetPlatforms(ctx, p.id);
    expect(rows.map((r) => r.platform).sort()).toEqual(["douyin", "xiaohongshu"]);
  });
});

describe("projects.service — T-595 平台隐藏对账", () => {
  it("自动导入项目整体清除时连同平台评论删除", async () => {
    const project = await service.createProject(ctx, {
      title: "待隐藏导入作品",
      source: "imported",
      platformRef: {
        platform: "douyin",
        externalId: "aweme-hidden-imported",
      },
    });
    const output = await service.createOutput(ctx, project.id, {
      title: "导入作品",
    });
    await db.insert(publications).values({
      id: "pub-hidden-imported",
      userId: ctx.userId,
      accountId: "acct-1",
      contentOutputId: output.id,
      platform: "douyin",
      accountReference: "acc-1",
      status: "published",
      externalId: "aweme-hidden-imported",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(audienceSignals).values({
      id: "sig-hidden-imported",
      userId: ctx.userId,
      accountId: "acct-1",
      source: "comment",
      rawText: "平台评论",
      publicationId: "pub-hidden-imported",
      createdAt: NOW,
    });

    await expect(
      service.reconcilePlatformWork(ctx, {
        platform: "douyin",
        externalId: "aweme-hidden-imported",
        visibility: "hidden",
      }),
    ).resolves.toEqual({ kind: "project", id: project.id });

    await expect(repo.get(ctx, project.id)).rejects.toBeInstanceOf(OwnershipError);
    expect(await db.select().from(publications)).toHaveLength(0);
    expect(await db.select().from(audienceSignals)).toHaveLength(0);
  });
});

// [T-332 S2] service 入口账号断言 + 双账号隔离(SPEC §4.2 未选号=引导态禁读写)。
describe("projects.service — per-account strict (T-332 S2)", () => {
  it("未选号(ctx.accountId 缺失)写/读 → AccountRequiredError", async () => {
    const noAcct: RequestContext = {
      userId: "user-1",
      requestId: "req-na",
      source: "user",
      accountId: null,
    };
    await expect(
      service.createProject(noAcct, { title: "无号项目" }),
    ).rejects.toMatchObject({ name: "AccountRequiredError" });
    await expect(service.getDashboardSummary(noAcct)).rejects.toMatchObject({
      name: "AccountRequiredError",
    });
    await expect(service.hasImportedProjects(noAcct)).rejects.toMatchObject({
      name: "AccountRequiredError",
    });
  });

  it("双账号项目隔离 + by-id 跨号 404(同 user 两个号)", async () => {
    const ctx2: RequestContext = {
      userId: "user-1",
      requestId: "req-a2",
      source: "user",
      accountId: "acct-2",
    };
    const p1 = await service.createProject(ctx, { title: "号1项目" });
    const p2 = await service.createProject(ctx2, { title: "号2项目" });
    expect(p1.accountId).toBe("acct-1");
    expect(p2.accountId).toBe("acct-2");
    // by-id 跨号 → OwnershipError 404(号一致性门,§4.5)。
    await expect(service.patchProject(ctx, p2.id, { title: "hijack" })).rejects.toMatchObject({
      name: "OwnershipError",
    });
    await expect(service.validateStageGate(ctx2, p1.id, "brief")).rejects.toMatchObject({
      name: "OwnershipError",
    });
    // 本号内正常。
    await expect(service.patchProject(ctx2, p2.id, { title: "改" })).resolves.toMatchObject({
      title: "改",
    });
  });
});


describe("T1433 发布同步的真实版本变化", () => {
  it("首次发布更新、重复发布保持原行，真实阶段变化仍更新时间", async () => {
    const clock = { value: "2026-10-28T01:00:00.000Z" };
    const timed = createProjectsService(repo, { ...deterministicDeps(), now: () => clock.value });
    const created = await timed.createProject(ctx, { title: "发布同步" });
    clock.value = "2026-10-28T01:01:00.000Z";
    const first = await timed.markPublished(ctx, created.id);
    expect(first).toMatchObject({ currentStage: "review", progressPct: 100, updatedAt: clock.value });
    const firstStages = await repo.listStages(ctx, created.id);
    clock.value = "2026-10-28T01:02:00.000Z";
    expect(await timed.markPublished(ctx, created.id)).toEqual(first);
    expect(await repo.listStages(ctx, created.id)).toEqual(firstStages);
    const script = firstStages.find(row => row.stage === "script")!;
    await repo.updateStage(ctx, script.id, { status: "in_progress", progressPct: 50, updatedAt: clock.value });
    clock.value = "2026-10-28T01:03:00.000Z";
    expect(await timed.markPublished(ctx, created.id)).toMatchObject({ updatedAt: clock.value });
    expect(await repo.getStage(ctx, created.id, "script")).toMatchObject({ status: "completed", progressPct: 100, updatedAt: clock.value });
  });

  it("同值发布资料合并不漂移版本，真实文案变化仍保存", async () => {
    const clock = { value: "2026-10-28T02:00:00.000Z" };
    const timed = createProjectsService(repo, { ...deterministicDeps(), now: () => clock.value });
    const created = await timed.createProject(ctx, { title: "发布资料", brief: "原简介" });
    const input = { title: "发布资料", brief: "原简介", platform: "douyin", externalId: "t1433-published" };
    const first = await timed.mergePublishedWork(ctx, created.id, input);
    clock.value = "2026-10-28T02:01:00.000Z";
    expect(await timed.mergePublishedWork(ctx, created.id, input)).toEqual(first);
    clock.value = "2026-10-28T02:02:00.000Z";
    expect(await timed.mergePublishedWork(ctx, created.id, { ...input, brief: "实际更新简介" })).toMatchObject({ brief: "实际更新简介", updatedAt: clock.value, source: "manual" });
  });

  it("项目写入失败时阶段变化同事务回滚", async () => {
    const created = await service.createProject(ctx, { title: "发布事务" });
    const beforeStages = await repo.listStages(ctx, created.id);
    await db.execute(sql`CREATE FUNCTION fail_t1433_project_update() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced t1433 project update rollback'; END; $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER fail_t1433_project_update BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION fail_t1433_project_update()`);
    await expect(service.markPublished(ctx, created.id)).rejects.toThrow("forced t1433 project update rollback");
    expect(await repo.get(ctx, created.id)).toEqual(created);
    expect(await repo.listStages(ctx, created.id)).toEqual(beforeStages);
  });

  it("并发重复发布保持版本，归档和其它账号不能被同步改动", async () => {
    const clock = { value: "2026-10-28T03:00:00.000Z" };
    const timed = createProjectsService(repo, { ...deterministicDeps(), now: () => clock.value });
    const created = await timed.createProject(ctx, { title: "并发同步" });
    const first = await timed.markPublished(ctx, created.id);
    clock.value = "2026-10-28T03:01:00.000Z";
    expect(await Promise.all([timed.markPublished(ctx, created.id), timed.markPublished(ctx, created.id)])).toEqual([first, first]);
    await expect(timed.markPublished({ ...ctx, accountId: "other-account" }, created.id)).rejects.toThrow();
    await expect(timed.markPublished({ ...ctx, userId: "other-user" }, created.id)).rejects.toThrow();
    const archived = await timed.archiveProject(ctx, created.id);
    clock.value = "2026-10-28T03:02:00.000Z";
    expect(await timed.markPublished(ctx, created.id)).toEqual(archived);
    expect(await repo.get(ctx, created.id)).toEqual(archived);
  });
});
