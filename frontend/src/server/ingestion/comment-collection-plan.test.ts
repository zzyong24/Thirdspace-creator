import { describe, it, expect } from "vitest";
import {
  orderCommentCollection,
  buildCommentCoverageMessage,
} from "./comment-collection-plan";

// [T-232] 评论批量采集预算规划纯逻辑单测:爆款优先 + 未采优先(断点续采)+ 诚实 message。

describe("orderCommentCollection(T-232 爆款优先 + 未采优先)", () => {
  it("爆款优先:同为未采,评论数降序(330 评的先采,0 评的最后)", () => {
    const order = orderCommentCollection([
      { awemeId: "a-0", commentCount: 0, collected: false },
      { awemeId: "a-330", commentCount: 330, collected: false },
      { awemeId: "a-12", commentCount: 12, collected: false },
    ]);
    expect(order).toEqual(["a-330", "a-12", "a-0"]);
  });

  it("断点续采:未采作品整体优先于已采作品(哪怕已采的是更大爆款)", () => {
    const order = orderCommentCollection([
      { awemeId: "collected-big", commentCount: 500, collected: true },
      { awemeId: "fresh-small", commentCount: 3, collected: false },
      { awemeId: "fresh-big", commentCount: 40, collected: false },
      { awemeId: "collected-small", commentCount: 8, collected: true },
    ]);
    // 未采组(评论数降序)在前,已采组(评论数降序)在后。
    expect(order).toEqual([
      "fresh-big",
      "fresh-small",
      "collected-big",
      "collected-small",
    ]);
  });

  it("同数同组保持入参相对顺序(稳定排序,幂等可测)", () => {
    const order = orderCommentCollection([
      { awemeId: "x", commentCount: 5, collected: false },
      { awemeId: "y", commentCount: 5, collected: false },
      { awemeId: "z", commentCount: 5, collected: false },
    ]);
    expect(order).toEqual(["x", "y", "z"]);
  });

  it("空输入 → 空输出", () => {
    expect(orderCommentCollection([])).toEqual([]);
  });
});

describe("buildCommentCoverageMessage(T-232 run 诚实:全量 vs 截断)", () => {
  it("全量完成 → 「全量完成:已采 N/N」", () => {
    expect(
      buildCommentCoverageMessage({
        collectedWorks: 49,
        totalWorks: 49,
        truncated: false,
        cooldownRemainMs: 0,
      }),
    ).toBe("全量完成:已采 49/49 个作品");
  });

  it("额度截断 → 注明「已采 X/N + 冷却剩余 + 下轮续」(不掩盖截断)", () => {
    const msg = buildCommentCoverageMessage({
      collectedWorks: 1,
      totalWorks: 49,
      truncated: true,
      cooldownRemainMs: 960_000,
    });
    expect(msg).toContain("额度截断");
    expect(msg).toContain("已采 1/49 个作品");
    expect(msg).toContain("960s");
    expect(msg).toContain("下轮优先续采");
  });
});
