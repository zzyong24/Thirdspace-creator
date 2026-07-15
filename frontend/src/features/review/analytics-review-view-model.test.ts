/**
 * [T-329] 复盘 view-model 单测 —— 指标全量展示(12 卡)+ 诚实「暂无 · 待采集」语义
 * + 真 topPublished(含体裁 genre)+ 平均播放时长格式化。
 *
 * 纯函数测试:buildAnalyticsReviewViewModelFromOp 喂 analytics.projects.get 形状的
 * 快照(rawMetrics 即抖音明细 detailToRawMetrics 的键位),断言 12 张卡的取值口径:
 *   - 计数(播放/点赞/评论/分享/收藏/新增粉丝)按最新帧求和;
 *   - 比率(完播/5s完播/封面CTR/2s跳出)只对携带该键的帧求均;无携带帧 → 「暂无」
 *     + note「待采集」(绝不编 0.0%,宪法 §8);
 *   - 主页访问量 / 平均播放时长同键存在性语义;
 *   - 「(待采集)」不再作 label 后缀(label 保持短,note 承载)。
 */

import { describe, expect, it } from "vitest";

import {
  buildAnalyticsReviewViewModelFromOp,
  formatDurationSec,
  type MetricSnapshotDto,
} from "./analytics-review-view-model";

const REAL_PROJECT = "project-real-xyz"; // 非 canonical fixture → 走真快照口径

/** 一帧「明细采集」快照(douyin-work-detail detailToRawMetrics 键位,含 genre)。 */
function detailSnap(over: {
  id: string;
  publicationId: string;
  capturedAt: string;
  rawMetrics: Record<string, unknown>;
}): MetricSnapshotDto {
  return { source: "platform_api", ...over };
}

const FULL_DETAIL_FRAME: Record<string, unknown> = {
  plays: 10000,
  ctr: 30,
  finish_rate: 12.5,
  finish_5s_rate: 40,
  bounce_2s_rate: 15,
  avg_duration_sec: 42.6,
  likes: 200,
  comments: 50,
  shares: 25,
  favorites: 80,
  follower_gain: 10,
  profile_visits: 120,
  genre: "1-3min视频",
};

describe("[T-329] 12 张指标卡(全量消费明细键)", () => {
  it("明细帧齐全 → 12 卡,顺序与真值齐,无「待采集」note", () => {
    const vm = buildAnalyticsReviewViewModelFromOp(REAL_PROJECT, [
      detailSnap({
        id: "s1",
        publicationId: "pub-a",
        capturedAt: "2026-07-10T10:00:00.000Z",
        rawMetrics: FULL_DETAIL_FRAME,
      }),
    ]);
    expect(vm.metrics.map((m) => m.id)).toEqual([
      "m-views",
      "m-likes",
      "m-comments",
      "m-shares",
      "m-favorites",
      "m-followers",
      "m-profile-visits",
      "m-completion",
      "m-finish-5s",
      "m-ctr",
      "m-bounce-2s",
      "m-avg-duration",
    ]);
    expect(vm.metrics).toHaveLength(12);
    const byId = new Map(vm.metrics.map((m) => [m.id, m]));
    expect(byId.get("m-views")!.value).toBe("1.0 万");
    expect(byId.get("m-likes")!.value).toBe("200");
    expect(byId.get("m-comments")!.value).toBe("50");
    expect(byId.get("m-shares")!.value).toBe("25");
    expect(byId.get("m-favorites")!.value).toBe("80");
    expect(byId.get("m-followers")!.value).toBe("10");
    expect(byId.get("m-profile-visits")!.value).toBe("120");
    expect(byId.get("m-completion")!.value).toBe("12.5%");
    expect(byId.get("m-finish-5s")!.value).toBe("40.0%");
    expect(byId.get("m-ctr")!.value).toBe("30.0%");
    expect(byId.get("m-bounce-2s")!.value).toBe("15.0%");
    expect(byId.get("m-avg-duration")!.value).toBe("42.6s");
    // 有真值 → 不带「待采集」note;label 干净短标签(无「(待采集)」后缀)。
    for (const m of vm.metrics) {
      expect(m.note).toBeUndefined();
      expect(m.label).not.toContain("待采集");
      // 单快照无环比来源 → 不编 delta。
      expect(m.delta).toBe("");
    }
  });

  it("views-only 帧(无明细键)→ 比率/时长/主页访问「暂无」+ note 待采集,不编 0", () => {
    const vm = buildAnalyticsReviewViewModelFromOp(REAL_PROJECT, [
      detailSnap({
        id: "s1",
        publicationId: "pub-a",
        capturedAt: "2026-07-10T10:00:00.000Z",
        rawMetrics: { views: 5000, likes: 10, comments: 2 },
      }),
    ]);
    const byId = new Map(vm.metrics.map((m) => [m.id, m]));
    for (const id of [
      "m-completion",
      "m-finish-5s",
      "m-ctr",
      "m-bounce-2s",
      "m-avg-duration",
      "m-profile-visits",
    ]) {
      const m = byId.get(id)!;
      expect(m.value).toBe("暂无");
      expect(m.note).toBe("待采集");
      // 「(待采集)」不再撑长 label。
      expect(m.label).not.toContain("(");
    }
    // 计数照常求和(views 键归一到播放)。
    expect(byId.get("m-views")!.value).toBe("5,000");
  });

  it("平均播放时长 ≥60s → mm:ss;多发布对携带帧求均", () => {
    const vm = buildAnalyticsReviewViewModelFromOp(REAL_PROJECT, [
      detailSnap({
        id: "s1",
        publicationId: "pub-a",
        capturedAt: "2026-07-10T10:00:00.000Z",
        rawMetrics: { plays: 100, avg_duration_sec: 70 },
      }),
      detailSnap({
        id: "s2",
        publicationId: "pub-b",
        capturedAt: "2026-07-10T10:00:00.000Z",
        rawMetrics: { plays: 100, avg_duration_sec: 60 },
      }),
      // views-only 帧不稀释均值(无 avg_duration_sec 键,不参与求均)。
      detailSnap({
        id: "s3",
        publicationId: "pub-c",
        capturedAt: "2026-07-10T10:00:00.000Z",
        rawMetrics: { views: 100 },
      }),
    ]);
    const m = vm.metrics.find((x) => x.id === "m-avg-duration")!;
    expect(m.value).toBe("1:05"); // (70+60)/2 = 65s → 1:05
  });
});

describe("[T-329] formatDurationSec", () => {
  it("格式化边界:<60 → Xs;≥60 → m:ss;进位不显 1:60", () => {
    expect(formatDurationSec(42.6)).toBe("42.6s");
    expect(formatDurationSec(12)).toBe("12s");
    expect(formatDurationSec(65)).toBe("1:05");
    expect(formatDurationSec(59.6)).toBe("59.6s"); // <60 → 秒显示(不虚进 1:00)
    expect(formatDurationSec(119.6)).toBe("2:00"); // 秒位 round 到 60 → 进位不显 1:60
    expect(formatDurationSec(125)).toBe("2:05");
  });
});

describe("[T-329] 真项目 topPublished(热门作品发布列表,含体裁)", () => {
  it("从真快照构建:播放降序 top4、labels 真标题、genre 取最新携带帧;无 genre 不摆", () => {
    const vm = buildAnalyticsReviewViewModelFromOp(
      REAL_PROJECT,
      [
        // pub-a:老明细帧带 genre,最新帧是 views-only(genre 应取老帧的)。
        detailSnap({
          id: "a1",
          publicationId: "pub-a",
          capturedAt: "2026-07-01T10:00:00.000Z",
          rawMetrics: { plays: 8000, genre: "1-3min视频" },
        }),
        detailSnap({
          id: "a2",
          publicationId: "pub-a",
          capturedAt: "2026-07-10T10:00:00.000Z",
          rawMetrics: { views: 9000 },
        }),
        // pub-b:从未带 genre → 行内不摆体裁。
        detailSnap({
          id: "b1",
          publicationId: "pub-b",
          capturedAt: "2026-07-10T10:00:00.000Z",
          rawMetrics: { views: 20000 },
        }),
      ],
      {
        "pub-a": { title: "真标题 A", platform: "douyin" },
        // pub-b 无 label → 稳定占位。
      },
    );
    expect(vm.topPublished).toHaveLength(2);
    // 播放降序:pub-b(20000)第一(primary),pub-a(9000)第二(compact)。
    expect(vm.topPublished[0]).toMatchObject({
      id: "tp-pub-b",
      title: "作品 pub-b",
      tone: "primary",
      genre: null,
      views: "2.0 万 播放",
    });
    expect(vm.topPublished[1]).toMatchObject({
      id: "tp-pub-a",
      title: "真标题 A",
      platform: "抖音",
      tone: "compact",
      genre: "1-3min视频",
    });
  });

  it("canonical demo 项目保留 fixture 基座(不被快照重建覆盖)", () => {
    const vm = buildAnalyticsReviewViewModelFromOp("project-podcast-launch", [
      detailSnap({
        id: "s1",
        publicationId: "pub-x",
        capturedAt: "2026-07-10T10:00:00.000Z",
        rawMetrics: { views: 100 },
      }),
    ]);
    // fixture 基座的 topPublished 用真作品标题(contentOutputs),id 前缀 tp-out。
    expect(vm.topPublished.length).toBeGreaterThan(0);
    expect(vm.topPublished.every((t) => !t.id.startsWith("tp-pub-"))).toBe(true);
  });
});
