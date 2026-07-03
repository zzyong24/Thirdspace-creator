import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createSearchRepository,
  type SearchRepository,
} from "./search.repository";
import { createSearchService, type SearchService } from "./search.service";

// Task 3 — SearchService (RequestContext + SPEC §16 derived-index guards). The
// service exposes the SPEC §16 internal API verbatim (upsertDocument /
// removeDocument / search / recordSearch / rebuildUserIndex) and:
//   1. takes RequestContext first and scopes the repo to ctx.userId;
//   2. derives searchText deterministically when omitted;
//   3. search() returns searchDocumentResource-shaped rows;
//   4. recordSearch SWALLOWS repo errors into { ok:false, retryable:true } — never
//      throws (index/history failure never rolls back business truth, SPEC §16/§11);
//   5. rebuildUserIndex deletes-then-upserts all docs under ctx.userId;
//   6. removeDocument is a no-op (not an error) when the doc is absent.

const NOW = "2026-06-21T00:00:00.000Z";

const ctxA: RequestContext = { userId: "user-a", requestId: "req-a", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "req-b", source: "user" };

// Build a real-pglite-backed service: per-ctx repo over the shared db.
function realService(db: Db): SearchService {
  let seq = 0;
  return createSearchService(
    (ctx) =>
      createSearchRepository(db, {
        now: () => NOW,
        nextId: (p) => `${p}-${++seq}`,
        userId: ctx.userId,
      }),
    { now: () => NOW },
  );
}

describe("SearchService", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("1. scopes reads/writes to ctx.userId", async () => {
    const svc = realService(db);
    await svc.upsertDocument(ctxA, {
      entityType: "knowledge",
      entityId: "k-1",
      title: "Hook 公式",
      body: "正文",
    });
    // A sees its doc; B sees nothing for the same query.
    expect(await svc.search(ctxA, "hook")).toHaveLength(1);
    expect(await svc.search(ctxB, "hook")).toHaveLength(0);
  });

  it("2. derives searchText deterministically when omitted (`${title}\\n${body}`.toLowerCase().trim())", async () => {
    const svc = realService(db);
    await svc.upsertDocument(ctxA, {
      entityType: "project",
      entityId: "p-1",
      title: "AI Native Browser",
      body: "代理论点  ",
    });
    // The plan's exact derivation: `${title}\n${body}`.toLowerCase().trim() — the
    // single trailing trim removes the body's trailing whitespace; the inner \n is
    // preserved. Searching by a lowercased token only present via the derived text.
    const hits = await svc.search(ctxA, "native browser");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.searchText).toBe("ai native browser\n代理论点");
  });

  it("3. search returns searchDocumentResource-shaped rows", async () => {
    const svc = realService(db);
    await svc.upsertDocument(ctxA, {
      entityType: "asset",
      entityId: "a-1",
      title: "封面",
      body: "",
    });
    const [row] = await svc.search(ctxA, "封面");
    expect(row).toMatchObject({
      userId: "user-a",
      entityType: "asset",
      entityId: "a-1",
      title: "封面",
      indexedAt: NOW,
    });
    expect(Array.isArray(row!.embedding)).toBe(true);
    expect(typeof row!.id).toBe("string");
  });

  it("4. recordSearch swallows repo errors into a retryable outcome (never throws)", async () => {
    // Inject a repo whose appendHistory throws → recordSearch must resolve,
    // returning { ok:false, retryable:true, error } and NOT throw.
    const throwingRepo: SearchRepository = {
      upsertDocument: async () => { throw new Error("nope"); },
      removeDocument: async () => {},
      search: async () => [],
      facetMatches: async () => [],
      listByEntityType: async () => [],
      appendHistory: async () => { throw new Error("history write failed"); },
      listHistory: async () => [],
      deleteAllDocuments: async () => {},
      seedDocuments: async () => {},
      seedHistory: async () => {},
    };
    const svc = createSearchService(() => throwingRepo, { now: () => NOW });
    const outcome = await svc.recordSearch(ctxA, {
      query: "hook",
      filters: {},
      resultCount: 0,
    });
    expect(outcome).toEqual({
      ok: false,
      retryable: true,
      error: "history write failed",
    });
  });

  it("4b. recordSearch returns { ok:true } and appends history on success", async () => {
    const svc = realService(db);
    const outcome = await svc.recordSearch(ctxA, {
      query: "hook",
      filters: { type: "project" },
      resultCount: 2,
    });
    expect(outcome).toEqual({ ok: true });
    const hist = await svc.listHistory(ctxA, 10);
    expect(hist.map((h) => h.query)).toEqual(["hook"]);
  });

  it("5. rebuildUserIndex deletes-then-upserts all docs under ctx.userId", async () => {
    const svc = realService(db);
    // Pre-existing stale doc that must be cleared by the rebuild.
    await svc.upsertDocument(ctxA, { entityType: "project", entityId: "stale", title: "Stale", body: "" });
    const result = await svc.rebuildUserIndex(ctxA, [
      { entityType: "project", entityId: "p1", title: "Hook One", body: "" },
      { entityType: "knowledge", entityId: "k1", title: "Hook Two", body: "" },
    ]);
    expect(result).toEqual({ count: 2 });
    // Stale doc gone, exactly the 2 rebuilt docs remain.
    expect(await svc.search(ctxA, "stale")).toHaveLength(0);
    expect(await svc.search(ctxA, "hook")).toHaveLength(2);
  });

  it("6. removeDocument is a no-op (not an error) when the doc is absent", async () => {
    const svc = realService(db);
    await expect(
      svc.removeDocument(ctxA, "project", "does-not-exist"),
    ).resolves.toBeUndefined();
  });

  it("7. facets aggregates entityType + tag buckets, user-scoped, ordered by count then value", async () => {
    const svc = realService(db);
    // Two knowledge docs + one project doc all matching "ai"; tags live in the
    // body JSON payload (the same convention the page composer reads).
    await svc.upsertDocument(ctxA, {
      entityType: "knowledge",
      entityId: "k-1",
      title: "AI Hook 公式",
      body: JSON.stringify({ tags: ["AI", "教程"] }),
    });
    await svc.upsertDocument(ctxA, {
      entityType: "knowledge",
      entityId: "k-2",
      title: "AI 提示词",
      body: JSON.stringify({ tags: ["AI"] }),
    });
    await svc.upsertDocument(ctxA, {
      entityType: "project",
      entityId: "p-1",
      title: "AI Native Browser",
      body: JSON.stringify({ snippet: "ai project" }),
    });
    // ctxB has a matching doc that must NOT leak into ctxA's facets.
    await svc.upsertDocument(ctxB, {
      entityType: "video",
      entityId: "v-b",
      title: "AI 视频",
      body: JSON.stringify({ tags: ["AI"] }),
    });

    const facets = await svc.facets(ctxA, "ai");
    expect(facets.query).toBe("ai");
    // entityType: knowledge(2) before project(1) — descending count.
    expect(facets.entityType).toEqual([
      { value: "knowledge", count: 2 },
      { value: "project", count: 1 },
    ]);
    // tag: AI(2) before 教程(1).
    expect(facets.tag).toEqual([
      { value: "AI", count: 2 },
      { value: "教程", count: 1 },
    ]);
  });

  it("7b. facets returns empty buckets for an empty / whitespace query", async () => {
    const svc = realService(db);
    await svc.upsertDocument(ctxA, {
      entityType: "knowledge",
      entityId: "k-1",
      title: "AI Hook",
      body: JSON.stringify({ tags: ["AI"] }),
    });
    expect(await svc.facets(ctxA, "")).toEqual({ query: "", entityType: [], tag: [] });
    expect(await svc.facets(ctxA, "   ")).toEqual({ query: "", entityType: [], tag: [] });
  });

  it("7c. facets tolerates plain-text bodies (no tags) — only entityType buckets", async () => {
    const svc = realService(db);
    await svc.upsertDocument(ctxA, {
      entityType: "asset",
      entityId: "a-1",
      title: "AI 封面",
      body: "纯文本正文，无 JSON",
    });
    const facets = await svc.facets(ctxA, "ai");
    expect(facets.entityType).toEqual([{ value: "asset", count: 1 }]);
    expect(facets.tag).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// [T-093] hybrid 检索:exact 优先 + 语义余弦补位 + 诚实降级/空态
// ---------------------------------------------------------------------------

import { cosineSimilarity, SEMANTIC_MIN_SCORE } from "./search.service";

describe("SearchService — T-093 hybridSearch", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("cosineSimilarity: identical=1, orthogonal=0, mismatched/zero → null", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBeNull();
    expect(cosineSimilarity([], [])).toBeNull();
    expect(cosineSimilarity([0, 0], [1, 0])).toBeNull();
  });

  it("exact (ILIKE) hits rank before semantic hits; semantic sorted by cosine desc", async () => {
    const svc = realService(db);
    // 精确命中(标题含查询词)。
    await svc.upsertDocument(ctxA, {
      entityType: "knowledge",
      entityId: "k-exact",
      title: "本地记忆趋势",
      body: "",
      embedding: [1, 0, 0],
    });
    // 语义命中(标题无查询词,但向量接近查询向量)。
    await svc.upsertDocument(ctxA, {
      entityType: "knowledge",
      entityId: "k-sem-hi",
      title: "local memory trend",
      body: "",
      embedding: [0.9, 0.1, 0],
    });
    await svc.upsertDocument(ctxA, {
      entityType: "knowledge",
      entityId: "k-sem-lo",
      title: "another semantic doc",
      body: "",
      embedding: [0.6, 0.8, 0],
    });
    const hits = await svc.hybridSearch(ctxA, "本地记忆", {
      entityType: "knowledge",
      queryEmbedding: [1, 0, 0],
    });
    expect(hits.map((h) => h.document.entityId)).toEqual([
      "k-exact",
      "k-sem-hi",
      "k-sem-lo",
    ]);
    expect(hits[0]!.matchType).toBe("exact");
    expect(hits[1]!.matchType).toBe("semantic");
    expect(hits[1]!.score).toBeGreaterThan(hits[2]!.score!);
  });

  it("semantic candidates below the threshold are cut (不足额不硬凑)", async () => {
    const svc = realService(db);
    await svc.upsertDocument(ctxA, {
      entityType: "knowledge",
      entityId: "k-far",
      title: "irrelevant doc",
      body: "",
      // 与查询向量近正交 → 余弦 ~0 < SEMANTIC_MIN_SCORE。
      embedding: [0, 1, 0],
    });
    const hits = await svc.hybridSearch(ctxA, "毫无交集的查询", {
      entityType: "knowledge",
      queryEmbedding: [1, 0, 0],
    });
    expect(hits).toEqual([]);
    expect(SEMANTIC_MIN_SCORE).toBeGreaterThan(0);
  });

  it("no queryEmbedding (未配置模型) → keyword-only honest degradation", async () => {
    const svc = realService(db);
    await svc.upsertDocument(ctxA, {
      entityType: "knowledge",
      entityId: "k-1",
      title: "Hook 公式",
      body: "",
      embedding: [1, 0],
    });
    const hits = await svc.hybridSearch(ctxA, "hook", {
      entityType: "knowledge",
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.matchType).toBe("exact");
    // 语义面完全关闭:无 embedding 查询不产生 semantic 命中。
    const miss = await svc.hybridSearch(ctxA, "公式以外的词", {
      entityType: "knowledge",
    });
    expect(miss).toEqual([]);
  });

  it("docs without embeddings are skipped by the semantic path (no fabricated hits)", async () => {
    const svc = realService(db);
    await svc.upsertDocument(ctxA, {
      entityType: "knowledge",
      entityId: "k-no-emb",
      title: "no embedding doc",
      body: "",
    });
    const hits = await svc.hybridSearch(ctxA, "别的词", {
      entityType: "knowledge",
      queryEmbedding: [1, 0],
    });
    expect(hits).toEqual([]);
  });

  it("empty/whitespace query → [] and results stay user-scoped", async () => {
    const svc = realService(db);
    await svc.upsertDocument(ctxA, {
      entityType: "knowledge",
      entityId: "k-a",
      title: "mine",
      body: "",
      embedding: [1, 0],
    });
    expect(await svc.hybridSearch(ctxA, "   ", { entityType: "knowledge" })).toEqual([]);
    const other = await svc.hybridSearch(ctxB, "mine", {
      entityType: "knowledge",
      queryEmbedding: [1, 0],
    });
    expect(other).toEqual([]);
  });

  it("listDocumentsByEntityType returns the user's docs of that type only", async () => {
    const svc = realService(db);
    await svc.upsertDocument(ctxA, {
      entityType: "knowledge",
      entityId: "k-a",
      title: "a",
      body: "",
    });
    await svc.upsertDocument(ctxA, {
      entityType: "project",
      entityId: "p-a",
      title: "p",
      body: "",
    });
    const docs = await svc.listDocumentsByEntityType(ctxA, "knowledge");
    expect(docs).toHaveLength(1);
    expect(docs[0]!.entityId).toBe("k-a");
    expect(await svc.listDocumentsByEntityType(ctxB, "knowledge")).toEqual([]);
  });
});
