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

  it("按档位、赞粉比、点赞、发布时间和 item id 稳定排序，并截断 top N", () => {
    const vids = [
      video({ awemeId: "r2", diggCount: 1000, authorFollowerCount: 500, createTime: h(2) }), // strong
      video({ awemeId: "r10", diggCount: 5000, authorFollowerCount: 500 }), // ratio 10
      video({ awemeId: "r2b", diggCount: 2000, authorFollowerCount: 1000 }), // ratio 2,digg 更高
      video({ awemeId: "r5", diggCount: 2500, authorFollowerCount: 500 }), // ratio 5
      video({ awemeId: "niche", diggCount: 250, authorFollowerCount: 400 }), // niche 必须排在全部 strong 后
    ];
    const top2 = detectDarkhorse(vids, NOW, { perKeywordLimit: 2 });
    expect(top2.map((v) => v.awemeId)).toEqual(["r10", "r5"]);
    const all = detectDarkhorse(vids, NOW);
    expect(all.map((v) => v.awemeId)).toEqual([
      "r10",
      "r5",
      "r2b",
      "r2",
      "niche",
    ]);
  });

  it("fans=0 是已知零粉，赞粉比为 null，只能走绝对阈值分支", () => {
    const v = video({ awemeId: "z", diggCount: 1200, authorFollowerCount: 0 });
    const out = detectDarkhorse([v], NOW);
    expect(out[0]).toMatchObject({
      awemeId: "z",
      tier: "strong",
      likeFollowerRatio: null,
    });
    expect(
      detectDarkhorse(
        [video({ awemeId: "ratio-only", diggCount: 250, authorFollowerCount: 0 })],
        NOW,
      ),
    ).toEqual([]);
  });

  it("粉丝数或发布时间缺失时排除，不能把未知值伪造成 0", () => {
    expect(
      detectDarkhorse(
        [
          video({
            awemeId: "unknown-fans",
            diggCount: 5000,
            authorFollowerCount: null,
          }),
          video({
            awemeId: "unknown-time",
            diggCount: 5000,
            authorFollowerCount: 100,
            createTime: null,
          }),
        ],
        NOW,
      ),
    ).toEqual([]);
  });

  it("完全同档同指标时按发布时间降序，再按 item id 升序", () => {
    const out = detectDarkhorse(
      [
        video({ awemeId: "b", diggCount: 1200, authorFollowerCount: 600, createTime: h(2) }),
        video({ awemeId: "a", diggCount: 1200, authorFollowerCount: 600, createTime: h(2) }),
        video({ awemeId: "older", diggCount: 1200, authorFollowerCount: 600, createTime: h(3) }),
      ],
      NOW,
    );
    expect(out.map((row) => row.awemeId)).toEqual(["a", "b", "older"]);
  });

  it("阈值配置化:收紧 strongMinDigg 后原命中项落选;空输入 → []", () => {
    const v = video({ awemeId: "cfg", diggCount: 1200, authorFollowerCount: 50_000 });
    expect(detectDarkhorse([v], NOW, { strongMinDigg: 2000 })).toEqual([]);
    expect(detectDarkhorse([], NOW)).toEqual([]);
    expect(DEFAULT_DARKHORSE_OPTIONS.windowHours).toBe(48);
  });
});
