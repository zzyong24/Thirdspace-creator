import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import { createSearchRepository, type SearchRepository } from "./search-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";

// Deterministic deps mirroring project-repository.test.ts. ids are namespaced per
// userId so two users' repos can coexist in one db without PK collisions.
function deterministicDeps(userId = "user-1", now: () => string = () => FIXED_NOW) {
  const counters = new Map<string, number>();
  return {
    now,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${userId}-${n}`;
    },
    userId,
  };
}

let db: Db;
let repo: SearchRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createSearchRepository(db, deterministicDeps());
});

describe("SearchRepository (pglite-backed real persistence)", () => {
  it("indexes a document and reads it back from SQL", async () => {
    const created = await repo.indexDocument({
      entityType: "project",
      entityId: "project-1",
      title: "选题研究",
      body: "短视频脚本",
    });
    expect(created.id).toBe("searchdoc-user-1-1");
    expect(created.entityType).toBe("project");
    expect(created.searchText).toBe("选题研究\n短视频脚本");
    expect(created.indexedAt).toBe(FIXED_NOW);

    const list = await repo.listDocuments();
    expect(list.map((d) => d.id)).toContain("searchdoc-user-1-1");

    const fetched = await repo.getDocument("searchdoc-user-1-1");
    expect(fetched.title).toBe("选题研究");
  });

  it("throws for a missing document", async () => {
    await expect(repo.getDocument("nope")).rejects.toThrow(/not found/);
  });

  // Key invariant: idempotent upsert keyed on (user_id, entity_type, entity_id).
  // Re-indexing the same entity refreshes the SAME row (no duplicate, stable id).
  it("upserts idempotently on (entityType, entityId) — re-index refreshes, never duplicates", async () => {
    const first = await repo.indexDocument({
      entityType: "knowledge",
      entityId: "k-1",
      title: "旧标题",
      body: "old",
    });
    const again = await repo.indexDocument({
      entityType: "knowledge",
      entityId: "k-1",
      title: "新标题",
      body: "new",
    });

    // Same physical row (PK preserved), refreshed content.
    expect(again.id).toBe(first.id);
    expect(again.title).toBe("新标题");
    expect(again.searchText).toBe("新标题\nnew");

    const list = await repo.listDocuments();
    expect(list.filter((d) => d.entityId === "k-1")).toHaveLength(1);
    expect(list[0]!.title).toBe("新标题");
  });

  it("searches via ILIKE over the denormalized search_text column", async () => {
    await repo.indexDocument({
      entityType: "project",
      entityId: "p-1",
      title: "Vlog 拍摄计划",
      body: "城市夜景",
    });
    await repo.indexDocument({
      entityType: "knowledge",
      entityId: "k-1",
      title: "灯光笔记",
      body: "三点布光",
    });

    const hits = await repo.search("夜景");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.entityId).toBe("p-1");

    // Case-insensitive match against lowercased search_text.
    const caseHits = await repo.search("VLOG");
    expect(caseHits.map((d) => d.entityId)).toContain("p-1");

    const none = await repo.search("不存在的词");
    expect(none).toHaveLength(0);
  });

  it("records search history append-only, newest-first", async () => {
    let clock = "2026-06-13T10:00:00+08:00";
    const histRepo = createSearchRepository(
      db,
      deterministicDeps("user-1", () => clock),
    );

    clock = "2026-06-13T10:00:00+08:00";
    await histRepo.recordHistory({ query: "first", resultCount: 3 });
    clock = "2026-06-13T11:00:00+08:00";
    await histRepo.recordHistory({ query: "second", filters: { type: "project" }, resultCount: 0 });

    const history = await histRepo.listHistory();
    expect(history).toHaveLength(2);
    expect(history[0]!.query).toBe("second"); // newest first
    expect(history[0]!.filters).toEqual({ type: "project" });
    expect(history[1]!.query).toBe("first");
    expect(history[1]!.resultCount).toBe(3);
  });

  it("removes a derived document durably", async () => {
    const doc = await repo.indexDocument({
      entityType: "asset",
      entityId: "a-1",
      title: "封面图",
    });
    await repo.removeDocument(doc.id);
    expect(await repo.listDocuments()).toHaveLength(0);
    await expect(repo.getDocument(doc.id)).rejects.toThrow(/not found/);
  });

  it("seeds documents idempotently", async () => {
    const seedRow = {
      id: "seed-doc-1",
      userId: "user-1",
      entityType: "video",
      entityId: "v-1",
      title: "成片",
      body: "",
      searchText: "成片\n",
      embedding: [],
      indexedAt: FIXED_NOW,
    };
    await repo.seedDocuments([seedRow]);
    await repo.seedDocuments([seedRow]); // again — conflict ignored
    const list = await repo.listDocuments();
    expect(list.filter((d) => d.id === "seed-doc-1")).toHaveLength(1);
  });

  // Ownership negative case: a document owned by another user is invisible —
  // same "not found" 404 surface the reference repos use for cross-user access.
  it("isolates documents per user (cross-user access is not found)", async () => {
    const userA = createSearchRepository(db, deterministicDeps("user-A"));
    const userB = createSearchRepository(db, deterministicDeps("user-B"));

    const owned = await userA.indexDocument({
      entityType: "project",
      entityId: "shared",
      title: "A 的文档",
    });

    // user-B cannot see it via list...
    expect(await userB.listDocuments()).toHaveLength(0);
    // ...nor get it (cross-user → not found)...
    await expect(userB.getDocument(owned.id)).rejects.toThrow(/not found/);
    // ...nor remove it.
    await expect(userB.removeDocument(owned.id)).rejects.toThrow(/not found/);

    // Owner still sees it.
    expect((await userA.getDocument(owned.id)).title).toBe("A 的文档");
  });
});
