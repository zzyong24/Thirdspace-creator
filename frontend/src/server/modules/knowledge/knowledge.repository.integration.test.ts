import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createKnowledgeRepository,
  type KnowledgeRepository,
} from "./knowledge.repository";
import { OwnershipError, ConflictError } from "./knowledge.errors";

// B1 — user-scoped repository integration test (pglite-backed). Ownership is the
// sole boundary (foundation §2): user A cannot list/get/revise/relate user B's
// knowledge; a cross-user id is indistinguishable from a missing one
// (OwnershipError → 404). Plus the §12 invariants: create stamps revision #1 +
// currentRevisionId; a second revision yields #2 and repoints currentRevisionId
// while #1 is unchanged (append-only).

const A = "user-a";
const B = "user-b";
const NOW = "2026-06-21T00:00:00.000Z";

function deterministicDeps() {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${n}`;
    },
  };
}

let db: Db;
let repo: KnowledgeRepository;

beforeEach(async () => {
  ({ db } = await createDb());
  repo = createKnowledgeRepository(db, deterministicDeps());
});

describe("knowledge.repository — ownership enforced (multi-tenant)", () => {
  it("list is user-scoped: A sees only A's items", async () => {
    await repo.create(A, { title: "A 的笔记" });
    await repo.create(B, { title: "B 的笔记" });
    const aRows = await repo.list(A);
    expect(aRows).toHaveLength(1);
    expect(aRows[0]!.title).toBe("A 的笔记");
    expect(aRows[0]!.userId).toBe(A);
  });

  it("get(B, aItemId) throws OwnershipError (no existence leak)", async () => {
    const a = await repo.create(A, { title: "A 的笔记" });
    await expect(repo.get(B, a.id)).rejects.toBeInstanceOf(OwnershipError);
    // A can still get its own.
    const got = await repo.get(A, a.id);
    expect(got.id).toBe(a.id);
  });

  it("createRevision(B, aItemId) throws — cannot revise A's item", async () => {
    const a = await repo.create(A, { title: "A 的笔记" });
    await expect(
      repo.createRevision(B, a.id, { content: "篡改" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("createRelation cannot link to B's item (both ends must be owned)", async () => {
    const a1 = await repo.create(A, { title: "A1" });
    const b1 = await repo.create(B, { title: "B1" });
    await expect(
      repo.createRelation(A, a1.id, {
        targetKnowledgeId: b1.id,
        relationType: "references",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("createRelation rejects a self-link with ConflictError", async () => {
    const a1 = await repo.create(A, { title: "A1" });
    await expect(
      repo.createRelation(A, a1.id, {
        targetKnowledgeId: a1.id,
        relationType: "references",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("create produces revision #1 and sets currentRevisionId", async () => {
    const a = await repo.create(A, { title: "A", content: "v1" });
    expect(a.status).toBe("active");
    expect(a.sourceType).toBe("manual");
    const rev = await repo.getRevision(A, a.currentRevisionId);
    expect(rev.revisionNumber).toBe(1);
    expect(rev.content).toBe("v1");
  });

  it("a second revision yields #2, repoints currentRevisionId, leaves #1 unchanged (append-only)", async () => {
    const a = await repo.create(A, { title: "A", content: "v1" });
    const firstRevId = a.currentRevisionId;
    const firstRevBefore = await repo.getRevision(A, firstRevId);

    const rev2 = await repo.createRevision(A, a.id, { content: "v2" });
    expect(rev2.revisionNumber).toBe(2);
    expect(rev2.content).toBe("v2");

    const itemAfter = await repo.get(A, a.id);
    expect(itemAfter.currentRevisionId).toBe(rev2.id);
    expect(itemAfter.currentRevisionId).not.toBe(firstRevId);

    // Revision #1 row is byte-identical (append-only — never UPDATEd/DELETEd).
    const firstRevAfter = await repo.getRevision(A, firstRevId);
    expect(firstRevAfter).toEqual(firstRevBefore);
  });

  it("createRelation between two owned items returns a numeric strength", async () => {
    const a1 = await repo.create(A, { title: "A1" });
    const a2 = await repo.create(A, { title: "A2" });
    const rel = await repo.createRelation(A, a1.id, {
      targetKnowledgeId: a2.id,
      relationType: "references",
    });
    expect(rel.sourceKnowledgeId).toBe(a1.id);
    expect(rel.targetKnowledgeId).toBe(a2.id);
    expect(rel.relationType).toBe("references");
    expect(typeof rel.strength).toBe("number");
    expect(rel.strength).toBe(1);
    expect(rel.createdByType).toBe("user");
  });
});
