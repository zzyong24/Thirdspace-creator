import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createSearchRepository,
  type SearchRepository,
  type SearchDocumentRow,
} from "./search.repository";
import { rebuildSearchIndexSystem } from "./search.seed";

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
//
// [T-332 S2] RepoDeps.accountId 已收成必填 string(strict 门,ISO-02):
// 「accountId null → 全局视图」的退化用例随 SPEC §4.2 裁决删除。

const NOW = "2026-06-21T00:00:00.000Z";

function makeRepo(
  db: Db,
  userId: string,
  accountId = "acct-a",
): SearchRepository {
  let seq = 0;
  return createSearchRepository(db, {
    now: () => NOW,
    nextId: (prefix) => `${prefix}-${userId}-${accountId}-${++seq}`,
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
    repoB = makeRepo(db, "user-b", "acct-b");
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
      accountId: "acct-a",
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
      accountId: "acct-a",
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

// [T-332 S2 · ISO-02/08] 同一 user 下按号(account_id)strict 隔离门。search_documents
// 是 owned-root(按号隔离,门恒开无退化);search_history 是 user 级日志(不按号隔离)。
describe("search.repository — per-account strict isolation (T-332 S2)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("双号各建同名文档:search/listByEntityType/facetMatches 全零交叉 + upsert stamp 正确", async () => {
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
    // 号1 只搜到号1的;号2 只搜到号2的(ISO-08 双号零泄漏)。
    expect((await repo1.search("hook")).map((r) => r.entityId)).toEqual(["p1"]);
    expect((await repo2.search("hook")).map((r) => r.entityId)).toEqual(["p2"]);
    // listByEntityType / facetMatches 同样按号收窄。
    expect((await repo1.listByEntityType("project")).map((r) => r.entityId)).toEqual(["p1"]);
    expect((await repo1.facetMatches("hook")).map((r) => r.entityId)).toEqual(["p1"]);
  });

  it("deleteAllDocuments 只删当前号的文档(按号重建),removeDocument 跨号 no-op", async () => {
    const repo1 = makeRepo(db, "user-a", "acct-1");
    const repo2 = makeRepo(db, "user-a", "acct-2");
    await repo1.upsertDocument({ entityType: "project", entityId: "p1", title: "Hook1", body: "", searchText: "hook1" });
    await repo2.upsertDocument({ entityType: "asset", entityId: "a2", title: "Hook2", body: "", searchText: "hook2" });
    // 跨号删除是 no-op(号1 的 repo 删不到号2 的 (asset, a2))。
    await repo1.removeDocument("asset", "a2");
    expect(await repo2.search("hook")).toHaveLength(1);
    await repo1.deleteAllDocuments();
    expect(await repo1.search("hook")).toHaveLength(0);
    // 号2 的文档未受影响。
    expect(await repo2.search("hook")).toHaveLength(1);
  });

  it("rebuildSearchIndexSystem:user 级整删后按行自带号重播(多号各归各号)", async () => {
    const repo1 = makeRepo(db, "user-a", "acct-1");
    await repo1.upsertDocument({ entityType: "project", entityId: "stale", title: "Stale Hook", body: "", searchText: "stale hook" });
    const rows: SearchDocumentRow[] = [
      {
        id: "sysdoc-1",
        userId: "user-a",
        accountId: "acct-1",
        entityType: "project",
        entityId: "p1",
        title: "Hook 甲",
        body: "",
        searchText: "hook 甲",
        embedding: [],
        indexedAt: NOW,
      },
      {
        id: "sysdoc-2",
        userId: "user-a",
        accountId: "acct-2",
        entityType: "project",
        entityId: "p2",
        title: "Hook 乙",
        body: "",
        searchText: "hook 乙",
        embedding: [],
        indexedAt: NOW,
      },
    ];
    await rebuildSearchIndexSystem(db, "user-a", rows);
    // stale 行被整删;重播后各号只见自己的投影行。
    expect((await makeRepo(db, "user-a", "acct-1").search("hook")).map((r) => r.entityId)).toEqual(["p1"]);
    expect((await makeRepo(db, "user-a", "acct-2").search("hook")).map((r) => r.entityId)).toEqual(["p2"]);
    // 幂等:重跑结果一致。
    await rebuildSearchIndexSystem(db, "user-a", rows);
    expect((await makeRepo(db, "user-a", "acct-1").search("hook")).map((r) => r.entityId)).toEqual(["p1"]);
  });
});
