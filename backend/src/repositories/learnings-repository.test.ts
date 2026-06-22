import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createLearningsRepository,
  type LearningsRepository,
} from "./learnings-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";

// Deterministic deps; ids are namespaced per userId so two users' repos sharing
// one db never collide on the TEXT primary keys.
function deterministicDeps(userId = "user-1") {
  const counters = new Map<string, number>();
  return {
    now: () => FIXED_NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${userId}-${n}`;
    },
    userId,
  };
}

let db: Db;
let repo: LearningsRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createLearningsRepository(db, deterministicDeps());
});

describe("LearningsRepository (pglite-backed real persistence)", () => {
  it("creates a learning and reads it back from SQL (create -> get -> list)", async () => {
    const created = await repo.create({ title: "钩子前置更涨粉", insight: "前3秒提问" });
    expect(created.id).toBe("learning-user-1-1");
    expect(created.validationStatus).toBe("candidate");
    expect(created.learningType).toBe("strategy");
    expect(created.insight).toBe("前3秒提问");

    const fetched = await repo.get("learning-user-1-1");
    expect(fetched.title).toBe("钩子前置更涨粉");

    const list = await repo.list();
    expect(list.map((l) => l.id)).toContain("learning-user-1-1");
  });

  it("throws for a missing learning", async () => {
    await expect(repo.get("nope")).rejects.toThrow(/not found/);
  });

  it("evaluates along an adjacent FSM edge and persists (candidate -> validated)", async () => {
    const l = await repo.create({ title: "T" }); // candidate
    const validated = await repo.evaluate(l.id, { validationStatus: "validated" });
    expect(validated.validationStatus).toBe("validated");
    // persisted: a fresh read reflects it
    expect((await repo.get(l.id)).validationStatus).toBe("validated");

    // validated -> discarded is allowed
    const discarded = await repo.evaluate(l.id, { validationStatus: "discarded" });
    expect(discarded.validationStatus).toBe("discarded");
  });

  it("rejects an illegal (non-adjacent) FSM transition", async () => {
    const l = await repo.create({ title: "T" }); // candidate
    await repo.evaluate(l.id, { validationStatus: "discarded" }); // terminal
    // discarded -> validated is illegal
    await expect(
      repo.evaluate(l.id, { validationStatus: "validated" }),
    ).rejects.toThrow(/illegal validation transition/);
  });

  it("creates and lists applications scoped to the parent learning", async () => {
    const l = await repo.create({ title: "T" });
    const app = await repo.createApplication(l.id, {
      projectId: "project-1",
      applicationNote: "复用到下个视频",
    });
    expect(app.learningId).toBe(l.id);
    expect(app.projectId).toBe("project-1");
    expect(app.applicationNote).toBe("复用到下个视频");

    const apps = await repo.listApplications(l.id);
    expect(apps).toHaveLength(1);
    expect(apps[0]!.id).toBe(app.id);
  });

  it("seeds learnings idempotently", async () => {
    const seedRow = {
      id: "seed-1",
      userId: "user-1",
      reviewId: null,
      learningType: "strategy",
      title: "种子经验",
      insight: "",
      recommendation: "",
      validationStatus: "candidate",
      confidenceScore: 0,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    };
    await repo.seedLearnings([seedRow]);
    await repo.seedLearnings([seedRow]); // again — conflict ignored
    const list = await repo.list();
    expect(list.filter((l) => l.id === "seed-1")).toHaveLength(1);
  });

  it("does not leak another user's learning (ownership 404 surface)", async () => {
    const mine = await repo.create({ title: "我的经验" });

    // A second user sharing the same db cannot see or touch user-1's row.
    const otherRepo = createLearningsRepository(db, deterministicDeps("user-2"));
    await expect(otherRepo.get(mine.id)).rejects.toThrow(/not found/);
    await expect(
      otherRepo.evaluate(mine.id, { validationStatus: "validated" }),
    ).rejects.toThrow(/not found/);
    expect((await otherRepo.list()).map((l) => l.id)).not.toContain(mine.id);

    // The owner still sees it.
    expect((await repo.get(mine.id)).title).toBe("我的经验");
  });
});
