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

function makeRepo(
  db: Db,
  userId: string,
  accountId: string | null = null,
): SearchRepository {
  let seq = 0;
  return createSearchRepository(db, {
    now: () => NOW,
    nextId: (prefix) => `${prefix}-${userId}-${accountId ?? "g"}-${++seq}`,
    userId,
    accountId,
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
      accountId: null,
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
      accountId: null,
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

// [T-136 切片 b · SPEC §B MAJOR-4] 同一 user 下按号(account_id)隔离门。search_documents
// 是 owned-root(按号隔离);search_history 是 user 级日志(不按号隔离)。三态:设号只见该号 /
// null 见全部 / upsert stamp 正确。
describe("search.repository — per-account isolation (T-136 slice b)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("accountId 设时 search/listByEntityType 只见该号的文档 + upsert stamp 正确", async () => {
    const repo1 = makeRepo(db, "user-a", "acct-1");
    const repo2 = makeRepo(db, "user-a", "acct-2");
    const d1 = await repo1.upsertDocument({
      entityType: "project",
      entityId: "p1",
      title: "号1项目 Hook",
      body: "",
      searchText: "号1项目 hook",
    });
    await repo2.upsertDocument({
      entityType: "project",
      entityId: "p2",
      title: "号2项目 Hook",
      body: "",
      searchText: "号2项目 hook",
    });
    expect(d1.accountId).toBe("acct-1");
    // 号1 只搜到号1的。
    const s1 = await repo1.search("hook");
    expect(s1.map((r) => r.entityId)).toEqual(["p1"]);
    const s2 = await repo2.search("hook");
    expect(s2.map((r) => r.entityId)).toEqual(["p2"]);
    // listByEntityType 同样按号收窄。
    expect((await repo1.listByEntityType("project")).map((r) => r.entityId)).toEqual(["p1"]);
  });

  it("accountId null(全局视图)时 search 见该 user 全部号的文档", async () => {
    const repo1 = makeRepo(db, "user-a", "acct-1");
    const repo2 = makeRepo(db, "user-a", "acct-2");
    const repoGlobal = makeRepo(db, "user-a", null);
    await repo1.upsertDocument({ entityType: "project", entityId: "p1", title: "Hook1", body: "", searchText: "hook1" });
    await repo2.upsertDocument({ entityType: "project", entityId: "p2", title: "Hook2", body: "", searchText: "hook2" });
    const all = await repoGlobal.search("hook");
    expect(all.map((r) => r.entityId).sort()).toEqual(["p1", "p2"]);
  });

  it("accountId 设时 deleteAllDocuments 只删该号的文档(按号重建)", async () => {
    const repo1 = makeRepo(db, "user-a", "acct-1");
    const repo2 = makeRepo(db, "user-a", "acct-2");
    await repo1.upsertDocument({ entityType: "project", entityId: "p1", title: "Hook1", body: "", searchText: "hook1" });
    await repo2.upsertDocument({ entityType: "project", entityId: "p2", title: "Hook2", body: "", searchText: "hook2" });
    await repo1.deleteAllDocuments();
    expect(await repo1.search("hook")).toHaveLength(0);
    // 号2 的文档未受影响。
    expect(await repo2.search("hook")).toHaveLength(1);
    // 全局视图仍见号2的。
    const repoGlobal = makeRepo(db, "user-a", null);
    expect((await repoGlobal.search("hook")).map((r) => r.entityId)).toEqual(["p2"]);
  });

  it("facetMatches 按号收窄", async () => {
    const repo1 = makeRepo(db, "user-a", "acct-1");
    const repo2 = makeRepo(db, "user-a", "acct-2");
    await repo1.upsertDocument({ entityType: "project", entityId: "p1", title: "Hook1", body: "", searchText: "hook1" });
    await repo2.upsertDocument({ entityType: "asset", entityId: "a2", title: "Hook2", body: "", searchText: "hook2" });
    const f1 = await repo1.facetMatches("hook");
    expect(f1.map((r) => r.entityId)).toEqual(["p1"]);
  });
});
