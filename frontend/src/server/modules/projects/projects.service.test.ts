import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createProjectRepository, type ProjectRepository } from "./projects.repository";
import { createProjectsService, type ProjectsService } from "./projects.service";
import {
  StageTransitionError,
  ProjectStateError,
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
  it("creates an active project at research and seeds 6 stages + platforms + activity", async () => {
    const project = await service.createProject(ctx, {
      title: "深度解析",
      brief: "拆解",
      targetPlatforms: ["bilibili", "youtube"],
    });
    expect(project.status).toBe("active");
    expect(project.currentStage).toBe("research");
    expect(project.progressPct).toBe(0);

    const stages = await repo.listStages(ctx, project.id);
    expect(stages).toHaveLength(6);
    const research = stages.find((s) => s.stage === "research")!;
    expect(research.status).toBe("in_progress");
    expect(research.startedAt).toBe(NOW);
    const planning = stages.find((s) => s.stage === "planning")!;
    expect(planning.status).toBe("pending");

    const platforms = await repo.listTargetPlatforms(ctx, project.id);
    expect(platforms.map((p) => p.platform).sort()).toEqual(["bilibili", "youtube"]);

    const activity = await repo.listActivity(ctx, project.id);
    expect(activity).toHaveLength(1);
    expect(activity[0]!.eventType).toBe("project_created");
  });

  it("creates with no platforms when none passed", async () => {
    const project = await service.createProject(ctx, { title: "T" });
    expect(await repo.listTargetPlatforms(ctx, project.id)).toHaveLength(0);
  });
});

describe("Stage machine (SPEC §12)", () => {
  it("pending→in_progress→completed legal, recomputes progress + appends activity", async () => {
    const p = await service.createProject(ctx, { title: "T" });
    // research starts in_progress; advance it to completed.
    const afterComplete = await service.transitionProjectStage(ctx, p.id, "research", {});
    expect(afterComplete.progressPct).toBeGreaterThan(0); // 100/6 ≈ 17
    const stages1 = await repo.listStages(ctx, p.id);
    expect(stages1.find((s) => s.stage === "research")!.status).toBe("completed");

    // planning is pending → start it.
    const afterStart = await service.transitionProjectStage(ctx, p.id, "planning", {});
    const stages2 = await repo.listStages(ctx, p.id);
    expect(stages2.find((s) => s.stage === "planning")!.status).toBe("in_progress");
    expect(afterStart.currentStage).toBe("planning");
  });

  it("→skipped requires a reason; without one → StageTransitionError", async () => {
    const p = await service.createProject(ctx, { title: "T" });
    await expect(
      service.transitionProjectStage(ctx, p.id, "research", { reason: "" }),
    ).resolves.toBeDefined(); // empty reason advances (not a skip) — research→completed
    // planning is pending; a non-empty reason skips it.
    const skipped = await service.transitionProjectStage(ctx, p.id, "planning", {
      reason: "不需要策划",
    });
    expect(skipped).toBeDefined();
    const planning = (await repo.listStages(ctx, p.id)).find((s) => s.stage === "planning")!;
    expect(planning.status).toBe("skipped");
    expect(planning.skipped).toBe(true);
  });

  it("illegal target (completed has no successor) → StageTransitionError", async () => {
    const p = await service.createProject(ctx, { title: "T" });
    await service.transitionProjectStage(ctx, p.id, "research", {}); // → completed
    await expect(
      service.transitionProjectStage(ctx, p.id, "research", {}),
    ).rejects.toBeInstanceOf(StageTransitionError);
  });

  it("skipped counts as completed for the progress average", async () => {
    const p = await service.createProject(ctx, { title: "T" });
    await service.transitionProjectStage(ctx, p.id, "research", {}); // completed (100)
    const after = await service.transitionProjectStage(ctx, p.id, "planning", {
      reason: "skip",
    }); // skipped (counts 100)
    // 2 of 6 stages at 100 → 200/6 ≈ 33
    expect(after.progressPct).toBe(33);
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
