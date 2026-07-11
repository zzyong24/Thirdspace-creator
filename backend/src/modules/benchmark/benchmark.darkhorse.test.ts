import { describe, it, expect } from "vitest";
import {
  detectDarkhorse,
  DEFAULT_DARKHORSE_OPTIONS,
  type DarkhorseInputVideo,
} from "./benchmark.darkhorse";

// [T-235b] 低粉黑马三档判定纯函数单测(darkhorse.py:60-105 方法论移植)。

const NOW = 1_800_000_000; // 固定 unix 秒(纯函数,now 注入)
const h = (hoursAgo: number) => NOW - Math.round(hoursAgo * 3600);

function video(partial: Partial<DarkhorseInputVideo> & { awemeId: string }): DarkhorseInputVideo {
  return {
    diggCount: 0,
    authorFollowerCount: 0,
    createTime: h(1),
    ...partial,
  };
}

describe("detectDarkhorse 三档判定", () => {
  it("strong:digg≥1000 且 fans≤10w → 命中;fans>10w 但赞粉比≥1 也命中", () => {
    const lowFans = video({ awemeId: "a", diggCount: 1200, authorFollowerCount: 50_000 });
    const bigFansHighRatio = video({ awemeId: "b", diggCount: 300_000, authorFollowerCount: 200_000 });
    const bigFansLowRatio = video({ awemeId: "c", diggCount: 1200, authorFollowerCount: 200_000 });
    const out = detectDarkhorse([lowFans, bigFansHighRatio, bigFansLowRatio], NOW);
    expect(out.map((v) => v.awemeId).sort()).toEqual(["a", "b"]);
    expect(out.find((v) => v.awemeId === "a")!.tier).toBe("strong");
    expect(out.find((v) => v.awemeId === "b")!.tier).toBe("strong");
  });

  it("niche:digg≥200 且 赞粉比≥0.5(小词小号起爆)", () => {
    const hit = video({ awemeId: "n1", diggCount: 250, authorFollowerCount: 400 });
    const missRatio = video({ awemeId: "n2", diggCount: 250, authorFollowerCount: 10_000 });
    const missDigg = video({ awemeId: "n3", diggCount: 150, authorFollowerCount: 100 });
    const out = detectDarkhorse([hit, missRatio, missDigg], NOW);
    expect(out.map((v) => v.awemeId)).toEqual(["n1"]);
    expect(out[0]!.tier).toBe("niche");
  });

  it("mid:digg≥500 且 fans≤3w", () => {
    const hit = video({ awemeId: "m1", diggCount: 600, authorFollowerCount: 25_000 });
    const missFans = video({ awemeId: "m2", diggCount: 600, authorFollowerCount: 50_000 });
    const out = detectDarkhorse([hit, missFans], NOW);
    expect(out.map((v) => v.awemeId)).toEqual(["m1"]);
    expect(out[0]!.tier).toBe("mid");
  });

  it("命中多档取信号最强的档(strong 优先于 niche/mid)", () => {
    // digg=1500 fans=1000:strong(fans≤10w)也满足 niche(ratio 1.5≥0.5)→ 归 strong。
    const v = video({ awemeId: "s", diggCount: 1500, authorFollowerCount: 1000 });
    const out = detectDarkhorse([v], NOW);
    expect(out[0]!.tier).toBe("strong");
  });

  it("48h 窗口:超窗/未来/createTime 缺失(0)一律排除", () => {
    const fresh = video({ awemeId: "in", diggCount: 2000, authorFollowerCount: 100, createTime: h(47) });
    const stale = video({ awemeId: "out", diggCount: 2000, authorFollowerCount: 100, createTime: h(49) });
    const unknown = video({ awemeId: "zero", diggCount: 2000, authorFollowerCount: 100, createTime: 0 });
    const future = video({ awemeId: "future", diggCount: 2000, authorFollowerCount: 100, createTime: NOW + 3600 });
    const out = detectDarkhorse([fresh, stale, unknown, future], NOW);
    expect(out.map((v) => v.awemeId)).toEqual(["in"]);
    expect(out[0]!.ageHours).toBeCloseTo(47, 0);
  });

  it("赞粉比优先排序(同比按赞降序)+ 每关键词 top N 截断", () => {
    const vids = [
      video({ awemeId: "r2", diggCount: 1000, authorFollowerCount: 500 }), // ratio 2
      video({ awemeId: "r10", diggCount: 5000, authorFollowerCount: 500 }), // ratio 10
      video({ awemeId: "r2b", diggCount: 2000, authorFollowerCount: 1000 }), // ratio 2,digg 更高
      video({ awemeId: "r5", diggCount: 2500, authorFollowerCount: 500 }), // ratio 5
    ];
    const top2 = detectDarkhorse(vids, NOW, { perKeywordLimit: 2 });
    expect(top2.map((v) => v.awemeId)).toEqual(["r10", "r5"]);
    const all = detectDarkhorse(vids, NOW);
    // 同 ratio(2)时 digg 高的(r2b 2000)排前。
    expect(all.map((v) => v.awemeId)).toEqual(["r10", "r5", "r2b", "r2"]);
  });

  it("fans=0 分母兜 1(赞粉比=digg 本身),不除零", () => {
    const v = video({ awemeId: "z", diggCount: 1200, authorFollowerCount: 0 });
    const out = detectDarkhorse([v], NOW);
    expect(out[0]!.likeFollowerRatio).toBe(1200);
  });

  it("阈值配置化:收紧 strongMinDigg 后原命中项落选;空输入 → []", () => {
    const v = video({ awemeId: "cfg", diggCount: 1200, authorFollowerCount: 50_000 });
    expect(detectDarkhorse([v], NOW, { strongMinDigg: 2000 })).toEqual([]);
    expect(detectDarkhorse([], NOW)).toEqual([]);
    expect(DEFAULT_DARKHORSE_OPTIONS.windowHours).toBe(48);
  });
});
