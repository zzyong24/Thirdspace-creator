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
    accountId: over.accountId ?? null,
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

// [T-136 切片 b] 同一 user 下的按号(account_id)隔离门。projects 是 owned-root(有自身
// account_id 列)。三态:accountId 设时只见该号行 / accountId null(全局视图)时见该 user
// 全部 / create stamp 正确。
describe("ProjectRepository — per-account isolation (T-136 slice b)", () => {
  const ctxA1: RequestContext = {
    userId: "user-a",
    requestId: "r-a1",
    source: "user",
    accountId: "acct-1",
  };
  const ctxA2: RequestContext = {
    userId: "user-a",
    requestId: "r-a2",
    source: "user",
    accountId: "acct-2",
  };
  const ctxAglobal: RequestContext = {
    userId: "user-a",
    requestId: "r-ag",
    source: "user",
    accountId: null,
  };

  beforeEach(async () => {
    // 同 user-a、两个号各一 project + 一条 accountId=null 的存量行。
    await repo.insertProject(
      ctxA1,
      projectRow({ id: "P1", userId: "user-a", accountId: "acct-1", title: "号1项目" }),
    );
    await repo.insertProject(
      ctxA2,
      projectRow({ id: "P2", userId: "user-a", accountId: "acct-2", title: "号2项目" }),
    );
    await repo.insertProject(
      ctxAglobal,
      projectRow({ id: "P0", userId: "user-a", accountId: null, title: "存量项目" }),
    );
  });

  it("accountId 设时 list 只返该号行", async () => {
    const rows1 = await repo.list(ctxA1);
    expect(rows1.map((p) => p.id)).toEqual(["P1"]);
    const rows2 = await repo.list(ctxA2);
    expect(rows2.map((p) => p.id)).toEqual(["P2"]);
  });

  it("accountId null(全局视图)时 list 返该 user 全部行(退化不过滤)", async () => {
    const rows = await repo.list(ctxAglobal);
    expect(rows.map((p) => p.id).sort()).toEqual(["P0", "P1", "P2"]);
  });

  it("accountId 设时 get 拿不到别号的行 → OwnershipError(不泄露存在性)", async () => {
    await expect(repo.get(ctxA1, "P2")).rejects.toBeInstanceOf(OwnershipError);
    // 本号内可正常拿到。
    expect((await repo.get(ctxA1, "P1")).id).toBe("P1");
    // 全局视图能拿到任一号的行。
    expect((await repo.get(ctxAglobal, "P2")).id).toBe("P2");
  });

  it("create stamp:insertProject 落库带上 ctx 传入的 accountId", async () => {
    const p1 = await repo.get(ctxA1, "P1");
    expect(p1.accountId).toBe("acct-1");
    const p0 = await repo.get(ctxAglobal, "P0");
    expect(p0.accountId).toBeNull();
  });

  it("accountId 设时 updateProjectRow 改不到别号的行 → OwnershipError", async () => {
    await expect(
      repo.updateProjectRow(ctxA1, "P2", { title: "hijack" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("子表反查(getOutput/getTask)父门透传账号维度:别号项目下的 output/task 拿不到", async () => {
    // 在号2项目 P2 下建 output + task。
    await repo.insertOutput(ctxA2, {
      id: "o_P2",
      projectId: "P2",
      title: "号2 output",
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
    await repo.insertTask(ctxA2, {
      id: "t_P2",
      projectId: "P2",
      contentOutputId: null,
      stage: "research",
      title: "号2 task",
      description: "",
      status: "todo",
      priority: 3,
      dueAt: null,
      completedAt: null,
    });
    // 号1 ctx 反查号2 的 output/task → OwnershipError(父 project 账号门挡住)。
    await expect(repo.getOutput(ctxA1, "o_P2")).rejects.toBeInstanceOf(OwnershipError);
    await expect(repo.getTask(ctxA1, "t_P2")).rejects.toBeInstanceOf(OwnershipError);
    // 号2 ctx 自己能拿到;全局视图也能拿到。
    expect((await repo.getOutput(ctxA2, "o_P2")).id).toBe("o_P2");
    expect((await repo.getTask(ctxAglobal, "t_P2")).id).toBe("t_P2");
  });
});
