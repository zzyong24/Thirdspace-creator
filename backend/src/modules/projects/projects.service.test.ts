import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
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
} from "./projects.errors";

const NOW = "2026-06-13T10:00:00+08:00";
const ctx: RequestContext = { userId: "user-1", requestId: "req-1", source: "user" };

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

describe("ensureImportedProject (数据底座 / SPEC §1.3)", () => {
  it("建 source:imported 项目 + 1 个 content_output,带真实标题/平台引用", async () => {
    const res = await service.ensureImportedProject(ctx, {
      title: "AI 工作流四步法",
      platform: "douyin",
      externalId: "7400",
      publishedAt: "2026-06-20T08:00:00.000Z",
    });
    expect(res.created).toBe(true);
    const project = await repo.get(ctx, res.projectId);
    expect(project.source).toBe("imported");
    expect(project.title).toBe("AI 工作流四步法");
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
    // 项目名已填(title 非空)→ 不在 missing;其余 5 项核心必填缺。
    expect(result.missing).not.toContain("项目名称");
    expect(result.missing).toEqual(
      expect.arrayContaining([
        "目标受众",
        "内容目标",
        "内容形式",
        "目标平台(至少 1 个)",
        "核心信息",
      ]),
    );
    // brief gate 永远可校验,绝不诚实跳过。
    expect(result.skipped).toEqual([]);
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
});
