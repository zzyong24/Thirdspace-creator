import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import { createProjectRepository, type ProjectRepository } from "./project-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";

function deterministicDeps() {
  const counters = new Map<string, number>();
  return {
    now: () => FIXED_NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-db-${n}`;
    },
    userId: "user-1",
  };
}

let db: Db;
let repo: ProjectRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createProjectRepository(db, deterministicDeps());
});

describe("ProjectRepository (pglite-backed real persistence)", () => {
  it("creates a project and reads it back from SQL", async () => {
    const created = await repo.create({ title: "新选题", brief: "" });
    expect(created.id).toBe("project-db-1");
    expect(created.status).toBe("active");
    expect(created.currentStage).toBe("research");

    const list = await repo.list();
    expect(list.map((p) => p.id)).toContain("project-db-1");

    const fetched = await repo.get("project-db-1");
    expect(fetched.title).toBe("新选题");
  });

  it("throws for a missing project", async () => {
    await expect(repo.get("nope")).rejects.toThrow(/not found/);
  });

  it("transitions an adjacent stage and logs activity durably", async () => {
    const p = await repo.create({ title: "T", brief: "" }); // research
    const moved = await repo.transition(p.id, "planning");
    expect(moved.currentStage).toBe("planning");

    const activity = await repo.listActivity(p.id);
    expect(activity).toHaveLength(1);
    expect(activity[0]!.eventType).toBe("stage_transition");
    expect(activity[0]!.eventData).toEqual({ fromStage: "research", toStage: "planning" });
  });

  it("rejects an illegal (non-adjacent) transition", async () => {
    const p = await repo.create({ title: "T", brief: "" }); // research
    await expect(repo.transition(p.id, "review")).rejects.toThrow(/illegal stage transition/);
  });

  it("archives and patches with persisted updates", async () => {
    const p = await repo.create({ title: "T", brief: "" });
    const archived = await repo.archive(p.id);
    expect(archived.status).toBe("archived");
    expect(archived.archivedAt).toBe(FIXED_NOW);

    const patched = await repo.patch(p.id, { title: "改名", starred: true });
    expect(patched.title).toBe("改名");
    expect(patched.starred).toBe(true);
    // persisted: a fresh read reflects it
    expect((await repo.get(p.id)).title).toBe("改名");
  });

  it("seeds projects idempotently", async () => {
    const seedRow = {
      id: "seed-1",
      userId: "user-1",
      title: "种子项目",
      brief: "",
      briefDetail: {},
      contentCategory: "",
      source: "manual",
      platformRef: {},
      creationMode: "guided",
      status: "active",
      currentStage: "script",
      progressPct: 40,
      starred: false,
      startedAt: FIXED_NOW,
      targetCompletedAt: null,
      completedAt: null,
      archivedAt: null,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    };
    await repo.seedProjects([seedRow]);
    await repo.seedProjects([seedRow]); // again — conflict ignored
    const list = await repo.list();
    expect(list.filter((p) => p.id === "seed-1")).toHaveLength(1);
  });
});
