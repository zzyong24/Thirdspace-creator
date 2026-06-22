/**
 * Unit tests for the REV-2 对比分析 + REV-1 收益分析 review tabs (lane L3).
 *
 *   REV-2 — `buildComparisonViewModel` is a pure function over the same
 *           `analytics.projects.get` snapshots. It groups by publicationId,
 *           derives per-publication 播放/完播/点赞率/分享率, highlights best/worst,
 *           and emits an honest empty state with fewer than 2 publications.
 *   REV-1 — `buildRevenueTab` is a pure shaper of the monetization funnel +
 *           linked products (empty → null). `buildReviewWorkspaceViewModel`
 *           assembles `revenue` from the injected contract client and degrades
 *           to undefined on any read failure (never crashes the real project).
 *
 * Determinism: no Date.now / Math.random / network — the contract client is a
 * hand-rolled stub.
 */

import { describe, expect, it } from "vitest";

import {
  buildComparisonViewModel,
  type MetricSnapshotDto,
} from "./analytics-review-view-model";
import {
  buildRevenueTab,
  buildReviewWorkspaceViewModel,
  type ReviewDataClient,
} from "./review-workspace-data";

function snapshot(
  publicationId: string,
  raw: Record<string, number>,
): MetricSnapshotDto {
  return {
    id: `snap-${publicationId}`,
    publicationId,
    capturedAt: "2026-01-01T00:00:00.000Z",
    source: "douyin",
    rawMetrics: raw,
  };
}

describe("REV-2 buildComparisonViewModel", () => {
  it("returns empty rows with fewer than 2 publications (honest empty state)", () => {
    expect(buildComparisonViewModel([]).rows).toEqual([]);
    expect(
      buildComparisonViewModel([snapshot("pub-1", { plays: 100 })]).rows,
    ).toEqual([]);
  });

  it("emits one row per publication with derived rates", () => {
    const { rows } = buildComparisonViewModel([
      snapshot("pub-1", { plays: 1000, likes: 100, shares: 50, finish_rate: 40 }),
      snapshot("pub-2", { plays: 200, likes: 10, shares: 2, finish_rate: 25 }),
    ]);
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.id === "pub-1")!;
    expect(a.plays).toBe(1000);
    expect(a.likeRate).toBe(10); // 100/1000 = 10%
    expect(a.shareRate).toBe(5); // 50/1000 = 5%
    expect(a.finishRate).toBe(40);
  });

  it("highlights best and worst by plays", () => {
    const { rows } = buildComparisonViewModel([
      snapshot("pub-1", { plays: 1000 }),
      snapshot("pub-2", { plays: 200 }),
      snapshot("pub-3", { plays: 500 }),
    ]);
    expect(rows.find((r) => r.id === "pub-1")!.highlight).toBe("best");
    expect(rows.find((r) => r.id === "pub-2")!.highlight).toBe("worst");
    expect(rows.find((r) => r.id === "pub-3")!.highlight).toBe("");
  });

  it("uses real titles/platform labels when supplied", () => {
    const { rows } = buildComparisonViewModel(
      [snapshot("pub-1", { plays: 1 }), snapshot("pub-2", { plays: 2 })],
      { "pub-1": { title: "爆款A", platform: "抖音" } },
    );
    const a = rows.find((r) => r.id === "pub-1")!;
    expect(a.title).toBe("爆款A");
    expect(a.platform).toBe("抖音");
    // Absent label → stable fallback, not a crash.
    expect(rows.find((r) => r.id === "pub-2")!.title).toContain("发布");
  });
});

describe("REV-1 buildRevenueTab", () => {
  const funnel = {
    stages: [
      { stage: "profile_visit", count: 1000 },
      { stage: "lead", count: 40 },
      { stage: "purchase", count: 5 },
    ],
    revenueAttributed: 2999,
    unattributed: { leadCount: 3, conversionCount: 1, revenue: 199 },
    unattributedRatio: 0.2,
  };

  it("returns null when there is no funnel activity and no products", () => {
    const empty = {
      stages: [{ stage: "profile_visit", count: 0 }],
      revenueAttributed: 0,
      unattributed: { leadCount: 0, conversionCount: 0, revenue: 0 },
      unattributedRatio: 0,
    };
    expect(buildRevenueTab(empty, [])).toBeNull();
    expect(buildRevenueTab(null, [])).toBeNull();
  });

  it("maps funnel stages to labels and appends the 金额 tail", () => {
    const tab = buildRevenueTab(funnel, [])!;
    expect(tab).not.toBeNull();
    const labels = tab.funnel.map((s) => s.label);
    expect(labels).toEqual(["主页访问", "线索", "成交", "金额"]);
    expect(tab.funnel.at(-1)!.value).toBe(2999);
    expect(tab.revenueAttributed).toBe(2999);
    expect(tab.unattributedRatio).toBe(0.2);
  });

  it("keeps products even when funnel is empty", () => {
    const products = [
      { id: "prod-1", name: "训练营", tier: "premium", contentRole: "导流" },
    ];
    const empty = {
      stages: [],
      revenueAttributed: 0,
      unattributed: { leadCount: 0, conversionCount: 0, revenue: 0 },
      unattributedRatio: 0,
    };
    const tab = buildRevenueTab(empty, products)!;
    expect(tab.products).toEqual(products);
  });
});

// A minimal stub client. Each method returns the configured payload (or throws
// when configured to), letting us assert the degradation contract.
function stubClient(overrides: Partial<ReviewDataClient>): ReviewDataClient {
  const reject = () => Promise.reject(new Error("stub: not configured"));
  return {
    getProjectAnalytics: reject,
    listLearnings: () => Promise.resolve([]),
    getFunnel: reject,
    listOutputs: () => Promise.resolve([]),
    listOutputProducts: () => Promise.resolve([]),
    getProduct: reject,
    ...overrides,
  } as ReviewDataClient;
}

describe("REV-1 buildReviewWorkspaceViewModel revenue assembly", () => {
  it("assembles revenue from funnel + output products", async () => {
    const client = stubClient({
      getProjectAnalytics: () => Promise.resolve([]),
      getFunnel: () =>
        Promise.resolve({
          stages: [
            { stage: "exposure", count: 800 },
            { stage: "purchase", count: 4 },
          ],
          revenueAttributed: 1200,
          unattributed: { leadCount: 0, conversionCount: 0, revenue: 0 },
          unattributedRatio: 0.1,
        }),
      listOutputs: () => Promise.resolve([{ id: "out-1", title: "正片" }]),
      listOutputProducts: () =>
        Promise.resolve([
          { id: "link-1", productId: "prod-1", contentRole: "导流" },
        ]),
      getProduct: () =>
        Promise.resolve({ id: "prod-1", name: "课程", tier: "vip" }),
    });
    const vm = await buildReviewWorkspaceViewModel("project-x", client);
    expect(vm.revenue).toBeDefined();
    expect(vm.revenue!.revenueAttributed).toBe(1200);
    expect(vm.revenue!.products).toEqual([
      { id: "prod-1", name: "课程", tier: "vip", contentRole: "导流" },
    ]);
  });

  it("omits revenue (empty state) when funnel + products are both empty", async () => {
    const client = stubClient({
      getProjectAnalytics: () => Promise.resolve([]),
      getFunnel: () =>
        Promise.resolve({
          stages: [{ stage: "exposure", count: 0 }],
          revenueAttributed: 0,
          unattributed: { leadCount: 0, conversionCount: 0, revenue: 0 },
          unattributedRatio: 0,
        }),
      listOutputs: () => Promise.resolve([]),
    });
    const vm = await buildReviewWorkspaceViewModel("project-x", client);
    expect(vm.revenue).toBeUndefined();
  });

  it("never crashes when every monetization read throws", async () => {
    const client = stubClient({
      getProjectAnalytics: () => Promise.resolve([]),
      getFunnel: () => Promise.reject(new Error("boom")),
      listOutputs: () => Promise.reject(new Error("boom")),
    });
    const vm = await buildReviewWorkspaceViewModel("project-x", client);
    expect(vm.revenue).toBeUndefined();
    expect(vm.kind).toBe("analytics-review");
  });
});
