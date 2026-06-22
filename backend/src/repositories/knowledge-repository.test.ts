import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createKnowledgeRepository,
  type KnowledgeRepository,
} from "./knowledge-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";

function deterministicDeps(userId = "user-1") {
  const counters = new Map<string, number>();
  return {
    now: () => FIXED_NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-db-${n}`;
    },
    userId,
  };
}

let db: Db;
let repo: KnowledgeRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createKnowledgeRepository(db, deterministicDeps());
});

describe("KnowledgeRepository (pglite-backed real persistence)", () => {
  it("creates an item with revision #1 and reads it back from SQL", async () => {
    const created = await repo.create({ title: "笔记", content: "first" });
    expect(created.id).toBe("knowledge-db-1");
    expect(created.userId).toBe("user-1");
    expect(created.knowledgeType).toBe("note");
    expect(created.status).toBe("active");
    // currentRevisionId points at the freshly-minted revision #1.
    expect(created.currentRevisionId).toBe("revision-db-1");

    const list = await repo.list();
    expect(list.map((k) => k.id)).toContain("knowledge-db-1");

    const fetched = await repo.get("knowledge-db-1");
    expect(fetched.title).toBe("笔记");

    const revisions = await repo.listRevisions("knowledge-db-1");
    expect(revisions).toHaveLength(1);
    expect(revisions[0]!.revisionNumber).toBe(1);
    expect(revisions[0]!.content).toBe("first");
  });

  it("honors knowledgeType on create", async () => {
    const created = await repo.create({
      title: "灵感",
      knowledgeType: "inspiration",
    });
    expect(created.knowledgeType).toBe("inspiration");
  });

  it("throws for a missing item", async () => {
    await expect(repo.get("nope")).rejects.toThrow(/not found/);
  });

  it("appends a revision, preserves old rows, and moves currentRevisionId", async () => {
    const item = await repo.create({ title: "草稿", content: "v1" });
    const firstRevisionId = item.currentRevisionId;

    const appended = await repo.createRevision(item.id, { content: "v2" });
    expect(appended.revisionNumber).toBe(2);
    expect(appended.content).toBe("v2");
    expect(appended.id).not.toBe(firstRevisionId);

    // Old revision #1 is preserved unchanged (append-only invariant).
    const revisions = await repo.listRevisions(item.id);
    expect(revisions.map((r) => r.revisionNumber)).toEqual([1, 2]);
    expect(revisions[0]!.id).toBe(firstRevisionId);
    expect(revisions[0]!.content).toBe("v1");

    // currentRevisionId now points at the appended revision (persisted).
    const refetched = await repo.get(item.id);
    expect(refetched.currentRevisionId).toBe(appended.id);
    expect(refetched.currentRevisionId).not.toBe(firstRevisionId);
  });

  it("keeps revisionNumber monotonic across multiple edits", async () => {
    const item = await repo.create({ title: "T", content: "v1" });
    await repo.createRevision(item.id, { content: "v2" });
    const third = await repo.createRevision(item.id, { content: "v3" });
    expect(third.revisionNumber).toBe(3);
    const revisions = await repo.listRevisions(item.id);
    expect(revisions.map((r) => r.revisionNumber)).toEqual([1, 2, 3]);
  });

  it("creates a relation with numeric strength", async () => {
    const a = await repo.create({ title: "A" });
    const b = await repo.create({ title: "B" });
    const relation = await repo.createRelation(a.id, {
      targetKnowledgeId: b.id,
      relationType: "references",
    });
    expect(relation.sourceKnowledgeId).toBe(a.id);
    expect(relation.targetKnowledgeId).toBe(b.id);
    expect(relation.relationType).toBe("references");
    expect(relation.strength).toBe(1);
    expect(typeof relation.strength).toBe("number");
    expect(relation.createdByType).toBe("user");
  });

  it("denies cross-user access (ownership boundary)", async () => {
    const mine = await repo.create({ title: "私有笔记" });

    // A repo bound to a different user must not see or mutate my item.
    const otherRepo = createKnowledgeRepository(db, deterministicDeps("user-2"));
    await expect(otherRepo.get(mine.id)).rejects.toThrow(/not found/);
    await expect(
      otherRepo.createRevision(mine.id, { content: "intrusion" }),
    ).rejects.toThrow(/not found/);

    // user-2's list does not include user-1's item.
    const otherList = await otherRepo.list();
    expect(otherList.map((k) => k.id)).not.toContain(mine.id);
  });
});
