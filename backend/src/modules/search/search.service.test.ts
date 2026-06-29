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
