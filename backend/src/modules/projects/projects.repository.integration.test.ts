import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createProjectRepository,
  type ProjectRepository,
  type ProjectRow,
  type StageRow,
  type ContentOutputRow,
  type OutputStageRow,
  type TaskRow,
  type ActivityRow,
  type TargetPlatformRow,
} from "./projects.repository";
import { OwnershipError } from "./projects.errors";

const NOW = "2026-06-13T10:00:00+08:00";

const ctxA: RequestContext = { userId: "user-a", requestId: "req-a", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "req-b", source: "user" };

function projectRow(over: Partial<ProjectRow> & { id: string; userId: string }): ProjectRow {
  return {
    id: over.id,
    userId: over.userId,
    title: over.title ?? "项目",
    brief: over.brief ?? "",
    briefDetail: over.briefDetail ?? {},
    contentCategory: over.contentCategory ?? "",
    source: over.source ?? "manual",
    platformRef: over.platformRef ?? {},
    creationMode: over.creationMode ?? "guided",
    status: over.status ?? "active",
    currentStage: over.currentStage ?? "research",
    progressPct: over.progressPct ?? 0,
    starred: over.starred ?? false,
    startedAt: over.startedAt ?? NOW,
    targetCompletedAt: over.targetCompletedAt ?? null,
    completedAt: over.completedAt ?? null,
    archivedAt: over.archivedAt ?? null,
    createdAt: over.createdAt ?? NOW,
    updatedAt: over.updatedAt ?? NOW,
  };
}

let db: Db;
let repo: ProjectRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createProjectRepository(db);
});

describe("ProjectRepository — round-trip (Task 1)", () => {
  it("inserts and selects back one row per owned entity", async () => {
    await repo.insertProject(ctxA, projectRow({ id: "P_A", userId: "user-a", title: "深度解析" }));

    const stage: StageRow = {
      id: "s1",
      projectId: "P_A",
      stage: "research",
      status: "in_progress",
      progressPct: 0,
      skipped: false,
      startedAt: NOW,
      completedAt: null,
      updatedAt: NOW,
    };
    await repo.insertStages(ctxA, [stage]);

    const platform: TargetPlatformRow = {
      id: "tp1",
      projectId: "P_A",
      platform: "bilibili",
      priority: 1,
      planningNote: "",
      createdAt: NOW,
    };
    await repo.insertTargetPlatforms(ctxA, [platform]);

    const output: ContentOutputRow = {
      id: "o1",
      projectId: "P_A",
      title: "主视频",
      contentType: "video",
      format: "",
      aspectRatio: "",
      targetDurationSeconds: 0,
      status: "drafting",
      contentRole: "traffic",
      primaryAssetId: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await repo.insertOutput(ctxA, output);

    const ostage: OutputStageRow = {
      id: "os1",
      contentOutputId: "o1",
      stage: "script",
      status: "in_progress",
      progressPct: 0,
      skipped: false,
      startedAt: NOW,
      completedAt: null,
      updatedAt: NOW,
    };
    await repo.insertOutputStages(ctxA, [ostage]);

    const task: TaskRow = {
      id: "t1",
      projectId: "P_A",
      contentOutputId: "o1",
      stage: "script",
      title: "写大纲",
      description: "",
      status: "todo",
      priority: 3,
      dueAt: null,
      completedAt: null,
    };
    await repo.insertTask(ctxA, task);

    const activity: ActivityRow = {
      id: "a1",
      projectId: "P_A",
      eventType: "project_created",
      entityType: "project",
      entityId: "P_A",
      eventData: { title: "深度解析" },
      occurredAt: NOW,
    };
    await repo.appendActivity(ctxA, activity);

    expect((await repo.get(ctxA, "P_A")).title).toBe("深度解析");
    expect(await repo.listStages(ctxA, "P_A")).toHaveLength(1);
    expect(await repo.listTargetPlatforms(ctxA, "P_A")).toHaveLength(1);
    expect((await repo.getOutput(ctxA, "o1")).title).toBe("主视频");
    expect((await repo.getOutputStage(ctxA, "o1", "script")).status).toBe("in_progress");
    expect((await repo.getTask(ctxA, "t1")).title).toBe("写大纲");
    expect(await repo.listActivity(ctxA, "P_A")).toHaveLength(1);
  });
});

describe("ProjectRepository — multi-tenant ownership (Task 2)", () => {
  beforeEach(async () => {
    await repo.insertProject(ctxA, projectRow({ id: "P_A", userId: "user-a" }));
    await repo.insertProject(ctxB, projectRow({ id: "P_B", userId: "user-b" }));
    // A child output + task under P_A, owned (transitively) by user A.
    await repo.insertOutput(ctxA, {
      id: "o_A",
      projectId: "P_A",
      title: "A output",
      contentType: "video",
      format: "",
      aspectRatio: "",
      targetDurationSeconds: 0,
      status: "drafting",
      contentRole: null,
      primaryAssetId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await repo.insertTask(ctxA, {
      id: "t_A",
      projectId: "P_A",
      contentOutputId: null,
      stage: "research",
      title: "A task",
      description: "",
      status: "todo",
      priority: 3,
      dueAt: null,
      completedAt: null,
    });
  });

  it("list returns only the caller's projects", async () => {
    const a = await repo.list(ctxA);
    expect(a.map((p) => p.id)).toEqual(["P_A"]);
    const b = await repo.list(ctxB);
    expect(b.map((p) => p.id)).toEqual(["P_B"]);
  });

  it("cross-user get → OwnershipError (no existence leak)", async () => {
    await expect(repo.get(ctxB, "P_A")).rejects.toBeInstanceOf(OwnershipError);
  });

  it("cross-user listTasks → OwnershipError (parent owned by A)", async () => {
    await expect(repo.listTasks(ctxB, "P_A")).rejects.toBeInstanceOf(OwnershipError);
  });

  it("cross-user listActivity → OwnershipError", async () => {
    await expect(repo.listActivity(ctxB, "P_A")).rejects.toBeInstanceOf(OwnershipError);
  });

  it("cross-user getOutput → OwnershipError (join filters on userId)", async () => {
    await expect(repo.getOutput(ctxB, "o_A")).rejects.toBeInstanceOf(OwnershipError);
  });

  it("cross-user getTask → OwnershipError (join filters on userId)", async () => {
    await expect(repo.getTask(ctxB, "t_A")).rejects.toBeInstanceOf(OwnershipError);
  });

  it("cross-user updateProjectRow → OwnershipError (re-asserts before write)", async () => {
    await expect(
      repo.updateProjectRow(ctxB, "P_A", { title: "hijack" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});
