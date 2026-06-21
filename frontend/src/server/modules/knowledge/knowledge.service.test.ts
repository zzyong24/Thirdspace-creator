import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createKnowledgeRepository } from "./knowledge.repository";
import {
  createKnowledgeService,
  type KnowledgeService,
} from "./knowledge.service";
import { OwnershipError, ConflictError } from "./knowledge.errors";

// C1 — service invariants (foundation §5.3, §12). The service takes a
// RequestContext and threads ctx.userId into the user-scoped repo. It enforces:
// items born `active` + currentRevisionId set + sourceType 'manual'; revisions
// append-only with strictly increasing numbers + currentRevisionId follows the
// latest; relations reject self + require both ends owned.

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

const ctxA: RequestContext = { userId: "user-a", requestId: "req-a", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "req-b", source: "user" };

let db: Db;
let service: KnowledgeService;

beforeEach(async () => {
  ({ db } = await createDb());
  const repo = createKnowledgeRepository(db, deterministicDeps());
  service = createKnowledgeService(repo);
});

describe("knowledge.service — invariants", () => {
  it("createKnowledge returns status:'active', currentRevisionId set, sourceType:'manual'", async () => {
    const item = await service.createKnowledge(ctxA, {
      title: "笔记",
      content: "v1",
    });
    expect(item.status).toBe("active");
    expect(item.sourceType).toBe("manual");
    expect(item.currentRevisionId).toBeTruthy();
    expect(item.knowledgeType).toBe("note");
  });

  it("createRevision twice → numbers 1,2 and currentRevisionId follows the latest", async () => {
    const item = await service.createKnowledge(ctxA, { title: "笔记", content: "v1" });
    const rev2 = await service.createRevision(ctxA, item.id, { content: "v2" });
    expect(rev2.revisionNumber).toBe(2);
    const after = await service.getKnowledge(ctxA, item.id);
    expect(after.currentRevisionId).toBe(rev2.id);
  });

  it("createRevision asserts a strictly increasing revisionNumber", async () => {
    const item = await service.createKnowledge(ctxA, { title: "笔记", content: "v1" });
    const r2 = await service.createRevision(ctxA, item.id, { content: "v2" });
    const r3 = await service.createRevision(ctxA, item.id, { content: "v3" });
    expect(r3.revisionNumber).toBeGreaterThan(r2.revisionNumber);
  });

  it("createRelation with target === source throws ConflictError", async () => {
    const item = await service.createKnowledge(ctxA, { title: "笔记" });
    await expect(
      service.createRelation(ctxA, item.id, {
        targetKnowledgeId: item.id,
        relationType: "references",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("getKnowledge for a non-owned id throws OwnershipError", async () => {
    const item = await service.createKnowledge(ctxA, { title: "A 的" });
    await expect(service.getKnowledge(ctxB, item.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("createRelation to a non-owned id throws OwnershipError", async () => {
    const a = await service.createKnowledge(ctxA, { title: "A" });
    const b = await service.createKnowledge(ctxB, { title: "B" });
    await expect(
      service.createRelation(ctxA, a.id, {
        targetKnowledgeId: b.id,
        relationType: "references",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("listKnowledge is user-scoped", async () => {
    await service.createKnowledge(ctxA, { title: "A 的" });
    await service.createKnowledge(ctxB, { title: "B 的" });
    const aList = await service.listKnowledge(ctxA);
    expect(aList).toHaveLength(1);
    expect(aList[0]!.userId).toBe("user-a");
  });
});
