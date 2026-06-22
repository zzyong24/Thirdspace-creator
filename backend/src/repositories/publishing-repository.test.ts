import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createPublishingRepository,
  type PublishingRepository,
} from "./publishing-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";

// Deterministic deps, namespaced per userId so two repos sharing one db do not
// collide on PKs (the id generator is per-instance here).
function deterministicDeps(userId: string) {
  const counters = new Map<string, number>();
  return {
    now: () => FIXED_NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${userId}-${prefix}-${n}`;
    },
    userId,
  };
}

const OUTPUT = "output-1";

let db: Db;
let repo: PublishingRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createPublishingRepository(db, deterministicDeps("user-1"));
});

describe("PublishingRepository (pglite-backed real persistence)", () => {
  it("creates a publication (with revision #1) and reads it back from SQL", async () => {
    const created = await repo.create({
      contentOutputId: OUTPUT,
      platform: "youtube",
      accountReference: "acct-1",
    });
    expect(created.id).toBe("user-1-publication-1");
    expect(created.status).toBe("draft");
    expect(created.platform).toBe("youtube");
    expect(created.currentRevisionId).toBe("user-1-revision-1");
    expect(created.externalId).toBeNull();

    const list = await repo.list(OUTPUT);
    expect(list.map((p) => p.id)).toContain("user-1-publication-1");

    const fetched = await repo.get("user-1-publication-1");
    expect(fetched.accountReference).toBe("acct-1");

    // first revision durably persisted
    const revisions = await repo.listRevisions(created.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]!.revisionNumber).toBe(1);
  });

  it("throws for a missing publication", async () => {
    await expect(repo.get("nope")).rejects.toThrow(/not found/);
  });

  it("appends immutable revisions with monotonic numbers and repoints current", async () => {
    const pub = await repo.create({
      contentOutputId: OUTPUT,
      platform: "bilibili",
      accountReference: "acct-1",
    });

    const r2 = await repo.createRevision(pub.id, {
      title: "标题 v2",
      description: "desc",
    });
    expect(r2.revisionNumber).toBe(2);
    expect(r2.title).toBe("标题 v2");

    const r3 = await repo.createRevision(pub.id, { title: "标题 v3" });
    expect(r3.revisionNumber).toBe(3);

    // append-only: all three revisions still present, old rows untouched
    const revisions = await repo.listRevisions(pub.id);
    expect(revisions.map((r) => r.revisionNumber)).toEqual([1, 2, 3]);

    // current repointed at the latest revision (persisted)
    expect((await repo.get(pub.id)).currentRevisionId).toBe(r3.id);
  });

  it("transitions adjacent statuses and stamps side-effect timestamps", async () => {
    const pub = await repo.create({
      contentOutputId: OUTPUT,
      platform: "douyin",
      accountReference: "acct-1",
    }); // draft

    const scheduled = await repo.transition(pub.id, "scheduled");
    expect(scheduled.status).toBe("scheduled");
    expect(scheduled.scheduledAt).toBe(FIXED_NOW);

    const published = await repo.transition(pub.id, "published");
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBe(FIXED_NOW);

    const removed = await repo.transition(pub.id, "removed");
    expect(removed.status).toBe("removed");
    expect(removed.removedAt).toBe(FIXED_NOW);
  });

  it("rejects an illegal (non-adjacent) status transition", async () => {
    const pub = await repo.create({
      contentOutputId: OUTPUT,
      platform: "x",
      accountReference: "acct-1",
    }); // draft
    await expect(repo.transition(pub.id, "removed")).rejects.toThrow(
      /illegal status transition/,
    );
  });

  it("isolates ownership: another user cannot get, list, or transition a row", async () => {
    const mine = await repo.create({
      contentOutputId: OUTPUT,
      platform: "youtube",
      accountReference: "acct-1",
    });

    const otherRepo = createPublishingRepository(db, deterministicDeps("user-2"));

    // cross-user get/transition → same not-found ownership surface
    await expect(otherRepo.get(mine.id)).rejects.toThrow(/not found/);
    await expect(otherRepo.transition(mine.id, "scheduled")).rejects.toThrow(
      /not found/,
    );

    // cross-user list does not leak the row
    const otherList = await otherRepo.list(OUTPUT);
    expect(otherList.map((p) => p.id)).not.toContain(mine.id);
  });

  it("seeds publications idempotently", async () => {
    const seedRow = {
      id: "seed-pub-1",
      userId: "user-1",
      contentOutputId: OUTPUT,
      platform: "youtube",
      accountReference: "acct-seed",
      status: "draft",
      currentRevisionId: null,
      externalId: null,
      externalUrl: null,
      scheduledAt: null,
      publishedAt: null,
      removedAt: null,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    };
    await repo.seedPublications([seedRow]);
    await repo.seedPublications([seedRow]); // again — conflict ignored
    const list = await repo.list(OUTPUT);
    expect(list.filter((p) => p.id === "seed-pub-1")).toHaveLength(1);
  });
});
