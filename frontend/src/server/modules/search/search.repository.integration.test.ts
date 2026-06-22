import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createSearchRepository,
  type SearchRepository,
} from "./search.repository";

// Task 2 — pglite-backed repository integration tests (mirrors
// project-repository.test.ts). Every assertion proves user-scoping (foundation §2,
// SPEC §10/§20): the repo is constructed per-user via RepoDeps.userId and NEVER
// returns / mutates another user's rows.
//
//   1. upsert inserts then UPDATES on (user_id, entity_type, entity_id) conflict
//      (no duplicate row).
//   2. search('hook') for user A returns only A's docs; user B's identical-text
//      doc is NEVER returned (ownership).
//   3. remove(entityType, entityId) is ctx-scoped — user B cannot delete A's doc.
//   4. appendHistory + listHistory return only the caller's rows, newest first.
//   5. deleteAllDocuments clears only the caller's documents.

const NOW = "2026-06-21T00:00:00.000Z";

function makeRepo(db: Db, userId: string): SearchRepository {
  let seq = 0;
  return createSearchRepository(db, {
    now: () => NOW,
    nextId: (prefix) => `${prefix}-${userId}-${++seq}`,
    userId,
  });
}

describe("search.repository (pglite, user-scoped)", () => {
  let db: Db;
  let repoA: SearchRepository;
  let repoB: SearchRepository;

  beforeEach(async () => {
    ({ db } = await createDb());
    repoA = makeRepo(db, "user-a");
    repoB = makeRepo(db, "user-b");
  });

  it("1. upsert inserts then updates on (user_id, entity_type, entity_id) conflict", async () => {
    const first = await repoA.upsertDocument({
      entityType: "knowledge",
      entityId: "k-1",
      title: "Hook 公式",
      body: "原始正文",
      searchText: "hook 公式\n原始正文",
    });
    expect(first.title).toBe("Hook 公式");

    const second = await repoA.upsertDocument({
      entityType: "knowledge",
      entityId: "k-1",
      title: "Hook 公式 v2",
      body: "更新正文",
      searchText: "hook 公式 v2\n更新正文",
    });
    // Same logical doc → updated in place, not duplicated.
    expect(second.id).toBe(first.id);
    const all = await repoA.search("hook");
    expect(all).toHaveLength(1);
    expect(all[0]!.title).toBe("Hook 公式 v2");
  });

  it("2. search is user-scoped — B's identical-text doc never returned to A", async () => {
    await repoA.upsertDocument({
      entityType: "knowledge",
      entityId: "k-a",
      title: "A 的 Hook",
      body: "",
      searchText: "a 的 hook",
    });
    await repoB.upsertDocument({
      entityType: "knowledge",
      entityId: "k-b",
      title: "B 的 Hook",
      body: "",
      searchText: "b 的 hook",
    });
    const aResults = await repoA.search("hook");
    expect(aResults.map((r) => r.entityId)).toEqual(["k-a"]);
    expect(aResults.some((r) => r.userId !== "user-a")).toBe(false);

    // Empty / whitespace query → [] (no full-table dump).
    expect(await repoA.search("")).toEqual([]);
    expect(await repoA.search("   ")).toEqual([]);

    // entityType filter narrows results.
    await repoA.upsertDocument({
      entityType: "project",
      entityId: "p-a",
      title: "Hook 项目",
      body: "",
      searchText: "hook 项目",
    });
    const onlyProjects = await repoA.search("hook", { entityType: "project" });
    expect(onlyProjects.map((r) => r.entityId)).toEqual(["p-a"]);
  });

  it("3. remove is ctx-scoped — B cannot delete A's doc", async () => {
    await repoA.upsertDocument({
      entityType: "asset",
      entityId: "asset-1",
      title: "A 的素材",
      body: "",
      searchText: "a 的素材",
    });
    // B attempts to remove A's (entityType, entityId): no-op, A's doc survives.
    await repoB.removeDocument("asset", "asset-1");
    expect(await repoA.search("素材")).toHaveLength(1);
    // A removes its own doc: gone.
    await repoA.removeDocument("asset", "asset-1");
    expect(await repoA.search("素材")).toHaveLength(0);
  });

  it("4. appendHistory + listHistory return only the caller's rows, newest first", async () => {
    await repoA.appendHistory({ query: "older", filters: {}, resultCount: 1 });
    // Force a later searchedAt for ordering determinism.
    let seq = 0;
    const repoALater = createSearchRepository(db, {
      now: () => "2026-06-22T00:00:00.000Z",
      nextId: (p) => `${p}-a-later-${++seq}`,
      userId: "user-a",
    });
    await repoALater.appendHistory({ query: "newer", filters: { type: "project" }, resultCount: 2 });
    await repoB.appendHistory({ query: "b-only", filters: {}, resultCount: 0 });

    const aHist = await repoA.listHistory(10);
    expect(aHist.map((h) => h.query)).toEqual(["newer", "older"]); // newest first
    expect(aHist.some((h) => h.userId !== "user-a")).toBe(false);

    const bHist = await repoB.listHistory(10);
    expect(bHist.map((h) => h.query)).toEqual(["b-only"]);
  });

  it("5. deleteAllDocuments clears only the caller's documents (rebuild support)", async () => {
    await repoA.upsertDocument({ entityType: "project", entityId: "p1", title: "Hook A1", body: "", searchText: "hook a1" });
    await repoA.upsertDocument({ entityType: "project", entityId: "p2", title: "Hook A2", body: "", searchText: "hook a2" });
    await repoB.upsertDocument({ entityType: "project", entityId: "pb", title: "Hook B", body: "", searchText: "hook b" });

    await repoA.deleteAllDocuments();
    expect(await repoA.search("hook")).toHaveLength(0);
    // B's docs untouched.
    expect(await repoB.search("hook")).toHaveLength(1);
  });

  it("seedDocuments / seedHistory are idempotent (onConflictDoNothing)", async () => {
    const docRow = {
      id: "seed-doc-1",
      userId: "user-a",
      entityType: "project",
      entityId: "p-seed",
      title: "Seed Hook",
      body: "",
      searchText: "seed hook",
      embedding: [] as number[],
      indexedAt: NOW,
    };
    await repoA.seedDocuments([docRow]);
    await repoA.seedDocuments([docRow]); // re-seed is a no-op
    expect(await repoA.search("seed")).toHaveLength(1);

    const histRow = {
      id: "seed-hist-1",
      userId: "user-a",
      query: "seeded",
      filters: {} as Record<string, unknown>,
      resultCount: 0,
      searchedAt: NOW,
    };
    await repoA.seedHistory([histRow]);
    await repoA.seedHistory([histRow]);
    expect(await repoA.listHistory(10)).toHaveLength(1);
  });
});
