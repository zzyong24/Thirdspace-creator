/**
 * Unit tests for the REV-2 对比分析 review tab (lane L3).
 *
 *   REV-2 — `buildComparisonViewModel` is a pure function over the same
 *           `analytics.projects.get` snapshots. It groups by publicationId,
 *           derives per-publication 播放/完播/点赞率/分享率, highlights best/worst,
 *           and emits an honest empty state with fewer than 2 publications.
 *
 * [T-052 裁决③] REV-1 收益分析(buildRevenueTab + revenue 装配)用例随变现中心
 * 物理删除(宪法 §8「变现中心移除」)。
 *
 * Determinism: no Date.now / Math.random / network.
 */

import { describe, expect, it } from "vitest";

import {
  buildComparisonViewModel,
  type MetricSnapshotDto,
} from "./analytics-review-view-model";

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
