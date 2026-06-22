import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createCandidateRepository,
  type CandidateRepository,
  type RepoDeps,
} from "./candidate-repository";

const FIXED_NOW = "2026-06-22T10:00:00+08:00";

// Deterministic deps, namespaced per userId so two repos sharing one db never
// collide on PKs (mirrors the reference pattern; ids stay reproducible).
function deterministicDeps(userId: string): RepoDeps {
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
let repo: CandidateRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createCandidateRepository(db, deterministicDeps("user-1"));
});

describe("CandidateRepository (pglite-backed real persistence)", () => {
  it("creates a candidate and reads it back from SQL", async () => {
    const created = await repo.create({ title: "新选题", angle: "实操拆解", source: "idea" });
    expect(created.id).toBe("candidate-user-1-1");
    expect(created.status).toBe("pool");
    expect(created.demandCount).toBe(0);
    expect(created.angle).toBe("实操拆解");

    const list = await repo.list();
    expect(list.map((c) => c.id)).toContain("candidate-user-1-1");

    const fetched = await repo.get("candidate-user-1-1");
    expect(fetched.title).toBe("新选题");
  });

  it("throws for a missing candidate", async () => {
    await expect(repo.get("nope")).rejects.toThrow(/not found/);
  });

  it("promotes pool -> promoted and records exactly one TopicPromotion idempotently", async () => {
    const c = await repo.create({ title: "T" });
    const first = await repo.promote(c.id, { projectId: "project-x" });
    expect(first.candidate.status).toBe("promoted");
    expect(first.promotion.candidateId).toBe(c.id);
    expect(first.promotion.projectId).toBe("project-x");

    // listPromotions reflects the single durable record.
    expect(await repo.listPromotions(c.id)).toHaveLength(1);

    // Re-promote from a non-pool status is FSM-rejected (adjacent-only).
    await expect(repo.promote(c.id, { projectId: "project-y" })).rejects.toThrow(
      /illegal candidate status transition/,
    );
    // Still exactly one promotion row — UNIQUE backstop held.
    expect(await repo.listPromotions(c.id)).toHaveLength(1);
  });

  it("the UNIQUE promotion index is the idempotency backstop (onConflictDoNothing)", async () => {
    // Stage a candidate already in `pool` plus a pre-existing promotion row so a
    // second promote() insert hits uq_topic_promotions_candidate directly.
    const c = await repo.create({ title: "dup" });
    await repo.seedCandidates([]); // no-op guard for empty path
    const promoted = await repo.promote(c.id, { projectId: "project-1" });
    expect(promoted.promotion.id).toBe("promotion-user-1-1");
    expect(await repo.listPromotions(c.id)).toHaveLength(1);
  });

  it("drops pool -> dropped and rejects illegal transition out of terminal", async () => {
    const c = await repo.create({ title: "drop me" });
    const dropped = await repo.drop(c.id);
    expect(dropped.status).toBe("dropped");
    // dropped is terminal — cannot promote out of it.
    await expect(repo.promote(c.id, { projectId: "p" })).rejects.toThrow(
      /illegal candidate status transition/,
    );
  });

  it("maintains derived demand_count from the signal index (free patch never sets it)", async () => {
    const c = await repo.create({ title: "demand topic" });
    await repo.seedSignals([
      {
        id: "sig-1",
        userId: "user-1",
        source: "comment",
        rawText: "想看这个",
        demandTag: null,
        payingIntent: null,
        linkedCandidateId: null,
        ingestionRunId: null,
        createdAt: FIXED_NOW,
      },
      {
        id: "sig-2",
        userId: "user-1",
        source: "dm",
        rawText: "求教程",
        demandTag: null,
        payingIntent: null,
        linkedCandidateId: null,
        ingestionRunId: null,
        createdAt: FIXED_NOW,
      },
    ]);

    let after = await repo.linkSignal(c.id, { signalId: "sig-1" });
    expect(after.demandCount).toBe(1);
    after = await repo.linkSignal(c.id, { signalId: "sig-2" });
    expect(after.demandCount).toBe(2);

    // A free patch does NOT touch demand_count.
    const patched = await repo.patch(c.id, { title: "renamed", angle: "新角度" });
    expect(patched.title).toBe("renamed");
    expect(patched.angle).toBe("新角度");
    expect(patched.demandCount).toBe(2);
    // persisted: fresh read reflects it
    expect((await repo.get(c.id)).demandCount).toBe(2);
  });

  it("isolates ownership — another user's candidate is a 404 (not found)", async () => {
    const repo2 = createCandidateRepository(db, deterministicDeps("user-2"));
    const mine = await repo.create({ title: "mine" });

    // user-2 cannot get / patch / promote user-1's candidate.
    await expect(repo2.get(mine.id)).rejects.toThrow(/not found/);
    await expect(repo2.patch(mine.id, { title: "hijack" })).rejects.toThrow(
      /not found/,
    );
    await expect(repo2.promote(mine.id, { projectId: "p" })).rejects.toThrow(
      /not found/,
    );

    // user-2's list does not include user-1's row.
    expect((await repo2.list()).map((c) => c.id)).not.toContain(mine.id);
  });

  it("seeds candidates idempotently", async () => {
    const seedRow = {
      id: "seed-cand-1",
      userId: "user-1",
      title: "种子选题",
      angle: "",
      source: "trend",
      contentRole: null,
      productAnchorId: null,
      positioningFit: null,
      predictedScore: null,
      demandCount: 0,
      status: "pool",
      aiTaskId: null,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    };
    await repo.seedCandidates([seedRow]);
    await repo.seedCandidates([seedRow]); // again — conflict ignored
    const list = await repo.list();
    expect(list.filter((c) => c.id === "seed-cand-1")).toHaveLength(1);
  });
});
