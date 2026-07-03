/**
 * GAP-PUBC-1 — analytics rail 接真 + 诚实空态.
 *
 * `buildPublishingCenterViewModelReal` aggregates the analytics rail (指标 /
 * 平台对比 / 趋势 / 热门内容) from every user publication's latest analytics
 * snapshot (`analytics.publications.get` → rawMetrics) instead of the fixture,
 * and returns an HONEST empty VM (no fixture masking) when there are zero real
 * publications.
 *
 * These tests inject a fake contract client (the helper's `client` arg) so the
 * REAL read path runs without the in-process backend. Determinism: every read
 * returns a fixed shape — no Date.now / Math.random / network.
 */

import { describe, expect, it } from "vitest";

import { buildPublishingCenterViewModel } from "@/fixtures/selectors";
import { buildPublishingCenterViewModelReal } from "./publishing-center-data";
import type { PublishingCenterDataClient } from "./publishing-center-data";

// ---------------------------------------------------------------------------
// Fake contract client builder
// ---------------------------------------------------------------------------

interface FakePub {
  readonly id: string;
  readonly outputId: string;
  readonly platform: string;
  readonly status: string;
  readonly title: string;
  /** [T-082] 真封面 asset id — revisions read returns it when present. */
  readonly coverAssetId?: string | null;
  /** When present, getPublicationAnalytics returns one snapshot from it. */
  readonly snapshot?: {
    readonly capturedAt: string;
    readonly plays: number;
    /** [T-082] 真采集键名(douyin-cdp ingestion 写 `views` 不写 `plays`)。 */
    readonly viewsKey?: boolean;
    readonly likes?: number;
    readonly comments?: number;
    readonly shares?: number;
    readonly favorites?: number;
  };
}

interface FakeProject {
  readonly id: string;
  readonly title: string;
  readonly pubs: ReadonlyArray<FakePub>;
}

/**
 * Build a fake `PublishingCenterDataClient`. Wires projects → outputs (one
 * output per pub, id `out-<pubId>`) → publications → revisions/analytics.
 * `analyticsThrows` makes every analytics read reject (degradation test).
 */
function makeClient(
  projects: ReadonlyArray<FakeProject>,
  opts: { analyticsThrows?: boolean } = {},
): PublishingCenterDataClient {
  const pubsByOutput = new Map<string, FakePub[]>();
  const pubById = new Map<string, FakePub>();
  for (const p of projects) {
    for (const pub of p.pubs) {
      pubById.set(pub.id, pub);
      const list = pubsByOutput.get(pub.outputId) ?? [];
      list.push(pub);
      pubsByOutput.set(pub.outputId, list);
    }
  }

  return {
    listProjects: () =>
      Promise.resolve(projects.map((p) => ({ id: p.id, title: p.title }))),
    listOutputs: ({ params }) => {
      const project = projects.find((p) => p.id === params.projectId);
      const outputs = (project?.pubs ?? []).map((pub) => ({
        id: pub.outputId,
        projectId: params.projectId,
        title: `${pub.title} 产出`,
        contentType: "video",
      }));
      return Promise.resolve(outputs);
    },
    listPublications: ({ params }) => {
      const pubs = pubsByOutput.get(params.outputId) ?? [];
      return Promise.resolve(
        pubs.map((pub) => ({
          id: pub.id,
          contentOutputId: pub.outputId,
          platform: pub.platform,
          status: pub.status,
          currentRevisionId: `rev-${pub.id}`,
          scheduledAt: null,
          publishedAt: "2026-06-20T00:00:00.000Z",
          removedAt: null,
          createdAt: "2026-06-20T00:00:00.000Z",
        })),
      );
    },
    listPublicationRevisions: ({ params }) => {
      const pub = pubById.get(params.publicationId);
      return Promise.resolve([
        {
          id: `rev-${params.publicationId}`,
          title: pub?.title ?? "",
          revisionNumber: 1,
          coverAssetId: pub?.coverAssetId ?? null,
        },
      ]);
    },
    getPublicationAnalytics: ({ params }) => {
      if (opts.analyticsThrows) return Promise.reject(new Error("analytics down"));
      const pub = pubById.get(params.publicationId);
      if (!pub?.snapshot) return Promise.resolve([]);
      const s = pub.snapshot;
      return Promise.resolve([
        {
          id: `snap-${params.publicationId}`,
          publicationId: params.publicationId,
          capturedAt: s.capturedAt,
          rawMetrics: {
            // [T-082] viewsKey=true 模拟真采集 payload(键名 `views`,无 `plays`)。
            ...(s.viewsKey ? { views: s.plays } : { plays: s.plays }),
            likes: s.likes ?? 0,
            comments: s.comments ?? 0,
            shares: s.shares ?? 0,
            favorites: s.favorites ?? 0,
          },
        },
      ]);
    },
  };
}

describe("GAP-PUBC-1 rail 接真 + 诚实空态", () => {
  it("aggregates the rail from real snapshots — values differ from the fixture", async () => {
    const client = makeClient([
      {
        id: "project-real-a",
        title: "真实项目 A",
        pubs: [
          {
            id: "pub-a1",
            outputId: "out-a1",
            platform: "bilibili",
            status: "published",
            title: "作品甲",
            snapshot: {
              capturedAt: "2026-06-21T00:00:00.000Z",
              plays: 30000,
              likes: 1200,
              comments: 300,
              shares: 200,
              favorites: 100,
            },
          },
          {
            id: "pub-a2",
            outputId: "out-a2",
            platform: "youtube",
            status: "published",
            title: "作品乙",
            snapshot: {
              capturedAt: "2026-06-22T00:00:00.000Z",
              plays: 10000,
              likes: 100,
              comments: 50,
              shares: 10,
              favorites: 5,
            },
          },
        ],
      },
    ]);

    const vm = await buildPublishingCenterViewModelReal(client);
    const fixtureVm = buildPublishingCenterViewModel();

    // Real rows present (not the honest-empty branch).
    expect(vm.publications.length).toBe(2);

    // 指标: 总播放 = 30000 + 10000 = 40000 → "4.0万" (万 grouping, 1 decimal).
    const totalPlays = vm.metrics.find((m) => m.id === "pubc-total-plays");
    expect(totalPlays?.value).toBe("4.0万");
    // 总互动 = (1200+300+200+100) + (100+50+10+5) = 1800 + 165 = 1965.
    const totalInteractions = vm.metrics.find((m) => m.id === "pubc-total-interactions");
    expect(totalInteractions?.value).toBe("1,965");
    // delta is empty (no historical baseline — no fabricated trend).
    expect(vm.metrics.every((m) => m.delta === "")).toBe(true);
    // 已发布 = 2 published rows.
    expect(vm.metrics.find((m) => m.id === "pubc-published-count")?.value).toBe("2");

    // 平台对比: bilibili (30000) before youtube (10000), descending.
    expect(vm.platformComparison.map((p) => p.platform)).toEqual(["bilibili", "youtube"]);
    expect(vm.platformComparison[0]?.share).toBe(30000);

    // 趋势: two distinct snapshot dates, ascending.
    expect(vm.trend.map((t) => t.label)).toEqual(["2026-06-21", "2026-06-22"]);
    expect(vm.trend[0]?.value).toBe(30000);

    // 热门内容: top by plays — 作品甲 (30000) first.
    expect(vm.topContent[0]?.title).toBe("作品甲");

    // The rail is NOT the fixture baseline (snapshot-derived ≠ fixture metric ids).
    expect(vm.metrics).not.toEqual(fixtureVm.metrics);
    expect(vm.trend).not.toEqual(fixtureVm.trend);
  });

  it("zero real publications → honest empty VM (no fixture rail masking)", async () => {
    // Only demo projects (filtered out) + a real project with no pubs.
    const client = makeClient([
      { id: "project-empty", title: "空项目", pubs: [] },
    ]);

    const vm = await buildPublishingCenterViewModelReal(client);
    const fixtureVm = buildPublishingCenterViewModel();

    // Honest empty: no rows, all four rail blocks empty/`—`.
    expect(vm.publications).toEqual([]);
    expect(vm.platformComparison).toEqual([]);
    expect(vm.trend).toEqual([]);
    expect(vm.topContent).toEqual([]);
    // Metric cards present but show "—" (no data) rather than fixture numbers.
    expect(vm.metrics.find((m) => m.id === "pubc-total-plays")?.value).toBe("—");
    expect(vm.metrics.find((m) => m.id === "pubc-published-count")?.value).toBe("0");

    // It is NOT the fixture VM (the masking we removed).
    expect(vm.metrics).not.toEqual(fixtureVm.metrics);
    expect(vm.topContent).not.toEqual(fixtureVm.topContent);
  });

  it("snapshot read throws for every pub → rail degrades to empty, rows still render", async () => {
    const client = makeClient(
      [
        {
          id: "project-real-b",
          title: "真实项目 B",
          pubs: [
            {
              id: "pub-b1",
              outputId: "out-b1",
              platform: "douyin",
              status: "published",
              title: "作品丙",
              snapshot: {
                capturedAt: "2026-06-21T00:00:00.000Z",
                plays: 5000,
                likes: 100,
              },
            },
          ],
        },
      ],
      { analyticsThrows: true },
    );

    const vm = await buildPublishingCenterViewModelReal(client);

    // Table row still renders (the analytics failure is per-pub, not wholesale).
    expect(vm.publications.length).toBe(1);
    expect(vm.publications[0]?.views).toBe("暂无数据");

    // Rail aggregation degrades to empty blocks (no snapshots survived).
    expect(vm.platformComparison).toEqual([]);
    expect(vm.trend).toEqual([]);
    expect(vm.topContent).toEqual([]);
    expect(vm.metrics.find((m) => m.id === "pubc-total-plays")?.value).toBe("—");
    // 已发布 count is still real (derived from row status, not snapshots).
    expect(vm.metrics.find((m) => m.id === "pubc-published-count")?.value).toBe("1");
  });

  it("[T-082] 真采集 `views` 键名读得出播放数(不再全 0)+ 封面透传到热门内容", async () => {
    // 真实 ingestion(douyin-cdp)写 rawMetrics.views(不写 plays)。修复前
    // resolveLatestSnapshot 只读 `plays` → 页面播放数全 0;修复后与 backend
    // analytics.repository playsOf 同口径(views 优先,回退 plays)。
    const client = makeClient([
      {
        id: "project-real-d",
        title: "真实项目 D",
        pubs: [
          {
            id: "pub-d1",
            outputId: "out-d1",
            platform: "douyin",
            status: "published",
            title: "真采集作品",
            coverAssetId: "asset-cover-d1",
            snapshot: {
              capturedAt: "2026-07-03T00:00:00.000Z",
              plays: 6610,
              viewsKey: true,
              likes: 155,
              comments: 6,
              shares: 17,
              favorites: 119,
            },
          },
          {
            id: "pub-d2",
            outputId: "out-d2",
            platform: "douyin",
            status: "published",
            title: "无封面作品",
            snapshot: {
              capturedAt: "2026-07-03T00:00:00.000Z",
              plays: 560,
              viewsKey: true,
              likes: 18,
            },
          },
        ],
      },
    ]);

    const vm = await buildPublishingCenterViewModelReal(client);

    // 播放数从 `views` 键读出(6610 + 560 = 7170),不是 0/"—"。
    expect(vm.metrics.find((m) => m.id === "pubc-total-plays")?.value).toBe("7,170");
    // 表现 cell 同样吃到真值。
    const row = vm.publications.find((r) => r.id === "pub-d1");
    expect(row?.views).toBe("6,610 播放");

    // 热门内容按播放降序,且封面 coverAssetId 透传(无封面 → null 走占位)。
    expect(vm.topContent[0]?.id).toBe("pub-d1");
    expect(vm.topContent[0]?.coverAssetId).toBe("asset-cover-d1");
    expect(vm.topContent[1]?.id).toBe("pub-d2");
    expect(vm.topContent[1]?.coverAssetId).toBeNull();
  });

  it("every listed project's publications enter the aggregation (demo 过滤集退役)", async () => {
    // [T-050] demo 项目已从 DB 物理删除,读侧不再维护 id 黑名单 —— projects.list
    // 返回什么就聚合什么(全是真项目)。
    const client = makeClient([
      {
        id: "project-real-b",
        title: "真实项目 B",
        pubs: [
          {
            id: "pub-b1",
            outputId: "out-b1",
            platform: "bilibili",
            status: "published",
            title: "B 作品",
            snapshot: { capturedAt: "2026-06-21T00:00:00.000Z", plays: 2000, likes: 100 },
          },
        ],
      },
      {
        id: "project-real-c",
        title: "真实项目 C",
        pubs: [
          {
            id: "pub-c1",
            outputId: "out-c1",
            platform: "youtube",
            status: "published",
            title: "真作品",
            snapshot: { capturedAt: "2026-06-21T00:00:00.000Z", plays: 1000, likes: 50 },
          },
        ],
      },
    ]);

    const vm = await buildPublishingCenterViewModelReal(client);

    // Both projects' pubs contribute (no id-based filtering).
    expect(vm.publications.length).toBe(2);
    expect(vm.platformComparison.map((p) => p.platform).sort()).toEqual([
      "bilibili",
      "youtube",
    ]);
    expect(vm.metrics.find((m) => m.id === "pubc-total-plays")?.value).toBe("3,000");
  });
});
