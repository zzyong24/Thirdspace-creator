import { describe, it, expect } from "vitest";
import {
  parseWorkList,
  parseDetail,
  toMetricRecords,
  type DouyinDetail,
} from "./douyin-cdp";

// 真实 work_list XHR 形状的 fixture(对齐 cheat-on-content 抓到的字段)。
const WORK_LIST = {
  aweme_list: [
    {
      aweme_id: "7400000000000000001",
      desc: "为什么你的 Agent 总跑偏",
      create_time: 1717000000,
      video: { duration: 185000 },
      statistics: {
        play_count: 128000,
        digg_count: 5400,
        comment_count: 320,
        share_count: 210,
        collect_count: 1800,
      },
    },
    {
      // 字段缺失 / 字符串数字 → 兜底取 0 / 解析。
      item_id: "7400000000000000002",
      title: "RAG 最小实现",
      statistics: { play_count: "86,000", digg_count: 3100 },
    },
    { desc: "无 id 的脏数据应被丢弃" },
  ],
  has_more: false,
};

describe("douyin-cdp 纯函数", () => {
  it("parseWorkList 抽取作品 + 字段兜底 + 丢弃无 id", () => {
    const works = parseWorkList(WORK_LIST);
    expect(works).toHaveLength(2); // 第三条无 id 被丢
    const [a, b] = works;
    expect(a.awemeId).toBe("7400000000000000001");
    expect(a.stats.views).toBe(128000);
    expect(a.stats.favorites).toBe(1800);
    expect(a.durationSec).toBe(185); // 185000ms → 185s
    // 第二条:item_id 兜底 + 字符串 "86,000" → 86000 + 缺失字段 → 0
    expect(b.awemeId).toBe("7400000000000000002");
    expect(b.stats.views).toBe(86000);
    expect(b.stats.comments).toBe(0);
  });

  it("parseWorkList 对空/脏 JSON 容错(返回 [])", () => {
    expect(parseWorkList(null)).toEqual([]);
    expect(parseWorkList({})).toEqual([]);
    expect(parseWorkList({ aweme_list: "not-an-array" })).toEqual([]);
  });

  it("parseDetail 抽完播/转粉 + 缺字段记 null", () => {
    const d1 = parseDetail(
      { data: { finish_rate: 0.42, fans_increment: 120 } },
      "7400000000000000001",
    );
    expect(d1.finishRate).toBe(0.42);
    expect(d1.followerGain).toBe(120);
    const d2 = parseDetail({}, "x");
    expect(d2.finishRate).toBeNull();
    expect(d2.followerGain).toBeNull();
  });

  it("toMetricRecords 映射成 MetricRecord(键名对齐 seed,detail 可选合并)", () => {
    const works = parseWorkList(WORK_LIST);
    const details = new Map<string, DouyinDetail>([
      [
        "7400000000000000001",
        { awemeId: "7400000000000000001", finishRate: 0.42, followerGain: 120 },
      ],
    ]);
    const records = toMetricRecords(works, details, "2026-06-29T00:00:00.000Z");
    expect(records).toHaveLength(2);
    const r0 = records[0];
    expect(r0.platform).toBe("douyin");
    expect(r0.externalId).toBe("7400000000000000001");
    expect(r0.capturedAt).toBe("2026-06-29T00:00:00.000Z");
    expect(r0.metrics).toMatchObject({
      views: 128000,
      likes: 5400,
      comments: 320,
      shares: 210,
      favorites: 1800,
      finish_rate: 0.42,
      follower_gain: 120,
    });
    // 第二条无 detail → 不含 finish_rate/follower_gain 键。
    expect(records[1].metrics.finish_rate).toBeUndefined();
    expect(records[1].metrics.views).toBe(86000);
  });
});
