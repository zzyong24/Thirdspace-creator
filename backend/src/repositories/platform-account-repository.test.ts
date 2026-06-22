import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createPlatformAccountRepository,
  type PlatformAccountRepository,
} from "./platform-account-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";

// Deterministic deps; ids are namespaced per userId so two users' repos minting
// against the same fresh db never collide on the PK.
function deterministicDeps(userId: string) {
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
let repo: PlatformAccountRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createPlatformAccountRepository(db, deterministicDeps("user-1"));
});

describe("PlatformAccountRepository (pglite-backed real persistence)", () => {
  it("creates an account and reads it back from SQL", async () => {
    const created = await repo.create({
      platform: "douyin",
      accountHandle: "@creator",
      followerBaseline: 1200,
    });
    expect(created.id).toBe("account-user-1-1");
    expect(created.status).toBe("active");
    expect(created.platform).toBe("douyin");
    expect(created.followerBaseline).toBe(1200);
    expect(created.secretReference).toBeNull();

    const list = await repo.list();
    expect(list.map((a) => a.id)).toContain("account-user-1-1");

    const fetched = await repo.get("account-user-1-1");
    expect(fetched.accountHandle).toBe("@creator");
  });

  it("throws for a missing account", async () => {
    await expect(repo.get("nope")).rejects.toThrow(/not found/);
  });

  it("registers a matrix account idempotently on the UNIQUE handle", async () => {
    const first = await repo.create({
      platform: "douyin",
      accountHandle: "@dup",
    });
    // Same user/platform/handle → idempotent: returns the existing row, no dupe.
    const second = await repo.create({
      platform: "douyin",
      accountHandle: "@dup",
    });
    expect(second.id).toBe(first.id);

    const list = await repo.list();
    expect(list.filter((a) => a.accountHandle === "@dup")).toHaveLength(1);
  });

  it("filters the list by platform (owner-scoped)", async () => {
    await repo.create({ platform: "douyin", accountHandle: "@a" });
    await repo.create({ platform: "xiaohongshu", accountHandle: "@b" });
    const dy = await repo.list({ platform: "douyin" });
    expect(dy.map((a) => a.platform)).toEqual(["douyin"]);
  });

  it("patches and archives with persisted updates", async () => {
    const a = await repo.create({ platform: "douyin", accountHandle: "@x" });

    const patched = await repo.patch(a.id, {
      accountHandle: "@renamed",
      followerBaseline: 999,
      secretReference: "ref-abc",
    });
    expect(patched.accountHandle).toBe("@renamed");
    expect(patched.followerBaseline).toBe(999);
    expect(patched.secretReference).toBe("ref-abc");
    // persisted: a fresh read reflects it
    expect((await repo.get(a.id)).accountHandle).toBe("@renamed");

    const archived = await repo.archive(a.id);
    expect(archived.status).toBe("archived");
  });

  it("hides another user's account (cross-user ownership 404 surface)", async () => {
    const mine = await repo.create({ platform: "douyin", accountHandle: "@mine" });

    const otherRepo = createPlatformAccountRepository(
      db,
      deterministicDeps("user-2"),
    );
    // user-2 cannot see or fetch user-1's row.
    await expect(otherRepo.get(mine.id)).rejects.toThrow(/not found/);
    expect(await otherRepo.list()).toHaveLength(0);

    // Same handle under a different user is allowed (scoped uniqueness).
    const theirs = await otherRepo.create({
      platform: "douyin",
      accountHandle: "@mine",
    });
    expect(theirs.id).not.toBe(mine.id);
    expect(theirs.userId).toBe("user-2");
  });

  it("seeds accounts idempotently", async () => {
    const seedRow = {
      id: "seed-account-1",
      userId: "user-1",
      platform: "douyin" as const,
      accountHandle: "@seed",
      secretReference: null,
      followerBaseline: 0,
      status: "active" as const,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    };
    await repo.seedAccounts([seedRow]);
    await repo.seedAccounts([seedRow]); // again — conflict ignored
    const list = await repo.list();
    expect(list.filter((a) => a.id === "seed-account-1")).toHaveLength(1);
  });
});
