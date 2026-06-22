import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createPositioningRepository,
  type PositioningRepository,
  type RepoDeps,
} from "./positioning-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";

function deterministicDeps(userId = "user-1"): RepoDeps {
  const counters = new Map<string, number>();
  return {
    now: () => FIXED_NOW,
    // namespace ids per userId so cross-user rows never collide on PK.
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${userId}-${n}`;
    },
    userId,
  };
}

let db: Db;
let repo: PositioningRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createPositioningRepository(db, deterministicDeps());
});

describe("PositioningRepository (pglite-backed real persistence)", () => {
  it("upserts a profile and reads it back from SQL", async () => {
    const created = await repo.upsertProfile({
      persona: "硬核技术博主",
      field: "AI 工程",
      capabilities: ["写代码", "讲清楚"],
    });
    expect(created.id).toBe("creator-profile-user-1-1");
    expect(created.persona).toBe("硬核技术博主");
    expect(created.capabilities).toEqual(["写代码", "讲清楚"]);

    const fetched = await repo.getProfile();
    expect(fetched.field).toBe("AI 工程");
  });

  it("upsert is idempotent on UNIQUE user_id (updates, no duplicate)", async () => {
    const first = await repo.upsertProfile({ persona: "v1" });
    const second = await repo.upsertProfile({ persona: "v2", field: "新赛道" });
    // same row id — the UNIQUE(user_id) profile was updated, not duplicated.
    expect(second.id).toBe(first.id);
    expect(second.persona).toBe("v2");
    expect(second.field).toBe("新赛道");
    const fetched = await repo.getProfile();
    expect(fetched.persona).toBe("v2");
  });

  it("throws for a missing profile", async () => {
    await expect(repo.getProfile()).rejects.toThrow(/not found/);
  });

  it("createStatement appends an immutable version chain (create->get->list)", async () => {
    await repo.upsertProfile({ persona: "p" });

    const v1 = await repo.createStatement({
      oneLiner: "我帮 X 解决 Y",
      keywords: ["a", "b", "c"],
    });
    expect(v1.versionNumber).toBe(1);
    expect(v1.createdByType).toBe("human");

    const v2 = await repo.createStatement({
      oneLiner: "更好的版本",
      keywords: ["d", "e", "f"],
      productAnchorIds: ["product-1"],
    });
    expect(v2.versionNumber).toBe(2);
    expect(v2.id).not.toBe(v1.id);

    // get reads back a specific version durably
    const got = await repo.getStatement(v1.id);
    expect(got.oneLiner).toBe("我帮 X 解决 Y");
    // the v1 row is untouched after v2 was appended (immutability invariant)
    expect(got.versionNumber).toBe(1);

    // list returns the full chain, newest version first
    const list = await repo.listStatements();
    expect(list.map((s) => s.versionNumber)).toEqual([2, 1]);
  });

  it("seeds statements idempotently via onConflictDoNothing (append-only PK/version)", async () => {
    const profile = await repo.upsertProfile({ persona: "p" });
    const seedRow = {
      id: "seed-stmt-1",
      userId: "user-1",
      profileId: profile.id,
      oneLiner: "种子陈述",
      keywords: ["a", "b", "c"],
      productAnchorIds: [],
      versionNumber: 1,
      createdByType: "human",
      aiTaskId: null,
      createdAt: FIXED_NOW,
    };
    await repo.seedStatements([seedRow]);
    await repo.seedStatements([seedRow]); // again — UNIQUE conflict ignored
    const list = await repo.listStatements();
    expect(list.filter((s) => s.id === "seed-stmt-1")).toHaveLength(1);
  });

  it("does not leak another user's profile or statements (ownership 404 surface)", async () => {
    // user-1 owns a profile + a statement.
    await repo.upsertProfile({ persona: "owner" });
    const mine = await repo.createStatement({
      oneLiner: "mine",
      keywords: ["a", "b", "c"],
    });

    // user-2 shares the same db but a different RequestContext userId.
    const otherRepo = createPositioningRepository(db, deterministicDeps("user-2"));
    // cross-user profile read → same not-found surface (no leak).
    await expect(otherRepo.getProfile()).rejects.toThrow(/not found/);
    // cross-user statement read → not found, not the actual row.
    await expect(otherRepo.getStatement(mine.id)).rejects.toThrow(/not found/);
    // list is scoped to the caller — empty for user-2.
    expect(await otherRepo.listStatements()).toHaveLength(0);
  });
});
