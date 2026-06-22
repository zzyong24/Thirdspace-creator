import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db, UnsupportedOperationError } from "@creatoros/backend";
import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  createSearchRepository,
  type SearchRepository,
} from "./search.repository";
import { createSearchService } from "./search.service";
import { createSearchTransport } from "./search.transport";
import { globalSearchPage } from "./search.schema";

// Task 4 — the composed page read `pages.search.get` is the ONLY HTTP op on the
// Search surface. The transport's output must validate against globalSearchPage
// for both the `default` (q present) and `empty` (no q) scenarios, the 4 locked
// result tabs, the user's history rows, and per-group result cards. Multi-tenant:
// user B's documents never appear in A's groups (foundation §9 smoke).

const NOW = "2026-06-21T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "req-a", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "req-b", source: "user" };

const ep = (id: string) => ({ id, isList: false }) as unknown as Endpoint;

function repoFor(db: Db, userId: string): SearchRepository {
  let seq = 0;
  return createSearchRepository(db, {
    now: () => NOW,
    nextId: (p) => `${p}-${userId}-${++seq}`,
    userId,
  });
}

describe("search.transport (pages.search.get contract conformance)", () => {
  let db: Db;
  let transport: Transport;

  beforeEach(async () => {
    ({ db } = await createDb());
    const service = createSearchService(
      (ctx) => repoFor(db, ctx.userId),
      { now: () => NOW },
    );
    transport = createSearchTransport(() => service);

    // Seed A's index across all 4 entity kinds, each carrying its denormalized
    // card payload as JSON in `body`. The query token "钩子" appears in each title.
    const repoA = repoFor(db, "user-a");
    await repoA.upsertDocument({
      entityType: "project",
      entityId: "p-1",
      title: "钩子 项目",
      body: JSON.stringify({ stage: "script", progressPct: 42, snippet: "钩子相关项目" }),
      searchText: "钩子 项目",
    });
    await repoA.upsertDocument({
      entityType: "knowledge",
      entityId: "k-1",
      title: "钩子 公式",
      body: JSON.stringify({ excerpt: "三秒钩子公式", tags: ["AI", "教程"] }),
      searchText: "钩子 公式",
    });
    await repoA.upsertDocument({
      entityType: "asset",
      entityId: "a-1",
      title: "钩子 封面",
      body: JSON.stringify({ assetType: "image" }),
      searchText: "钩子 封面",
    });
    await repoA.upsertDocument({
      entityType: "video",
      entityId: "v-1",
      title: "钩子 视频",
      body: JSON.stringify({ platform: "bilibili", durationLabel: "12:03" }),
      searchText: "钩子 视频",
    });

    // B owns an identical-text doc that must NOT leak into A's groups.
    await repoFor(db, "user-b").upsertDocument({
      entityType: "project",
      entityId: "pb",
      title: "钩子 B 的项目",
      body: JSON.stringify({ stage: "research", progressPct: 5, snippet: "B" }),
      searchText: "钩子 b 的项目",
    });
  });

  it("default scenario (q present) validates against globalSearchPage", async () => {
    const raw = await transport.request(
      ep("pages.search.get"),
      { query: { q: "钩子", type: undefined } } as never,
      ctxA,
    );
    const page = (raw as { data: unknown }).data;
    expect(() => globalSearchPage.parse(page)).not.toThrow();
    const parsed = globalSearchPage.parse(page);
    expect(parsed.query).toBe("钩子");
    expect(parsed.kind).toBe("search");
    expect(parsed.scenario).toBe("default");
    // 4 locked result tabs in the approved order.
    expect(parsed.resultTabs.map((t) => t.label)).toEqual(["项目", "知识", "素材", "视频"]);
    // Each group has exactly A's one matching doc; B's project never appears.
    expect(parsed.projects.map((p) => p.id)).toEqual(["p-1"]);
    expect(parsed.projects[0]!.stage).toBe("script");
    expect(parsed.projects[0]!.progressPct).toBe(42);
    expect(parsed.knowledge.map((k) => k.id)).toEqual(["k-1"]);
    expect(parsed.knowledge[0]!.tags).toEqual(["AI", "教程"]);
    expect(parsed.assets.map((a) => a.id)).toEqual(["a-1"]);
    expect(parsed.assets[0]!.assetType).toBe("image");
    expect(parsed.videos.map((v) => v.id)).toEqual(["v-1"]);
    expect(parsed.videos[0]!.platform).toBe("bilibili");
    // Per-group counts on the tabs.
    const counts = Object.fromEntries(parsed.resultTabs.map((t) => [t.label, t.count]));
    expect(counts).toEqual({ "项目": 1, "知识": 1, "素材": 1, "视频": 1 });
  });

  it("records history as a post-read side-effect and reflects it back", async () => {
    await transport.request(
      ep("pages.search.get"),
      { query: { q: "钩子" } } as never,
      ctxA,
    );
    // The second read sees the first read's recorded history row.
    const raw = await transport.request(
      ep("pages.search.get"),
      { query: { q: "钩子" } } as never,
      ctxA,
    );
    const parsed = globalSearchPage.parse((raw as { data: unknown }).data);
    expect(parsed.history.length).toBeGreaterThanOrEqual(1);
    expect(parsed.history[0]!.query).toBe("钩子");
  });

  it("empty scenario (no q) validates and returns empty groups", async () => {
    const raw = await transport.request(
      ep("pages.search.get"),
      { query: { q: "" } } as never,
      ctxA,
    );
    const parsed = globalSearchPage.parse((raw as { data: unknown }).data);
    expect(parsed.scenario).toBe("empty");
    expect(parsed.query).toBe("");
    expect(parsed.projects).toEqual([]);
    expect(parsed.knowledge).toEqual([]);
    expect(parsed.assets).toEqual([]);
    expect(parsed.videos).toEqual([]);
  });

  it("multi-tenant — B's search never returns A's documents", async () => {
    const raw = await transport.request(
      ep("pages.search.get"),
      { query: { q: "钩子" } } as never,
      ctxB,
    );
    const parsed = globalSearchPage.parse((raw as { data: unknown }).data);
    expect(parsed.projects.map((p) => p.id)).toEqual(["pb"]);
    expect(parsed.knowledge).toEqual([]);
    expect(parsed.assets).toEqual([]);
    expect(parsed.videos).toEqual([]);
  });

  it("unknown op id → UnsupportedOperationError", async () => {
    await expect(
      transport.request(ep("search.nope"), {} as never, ctxA),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });
});
