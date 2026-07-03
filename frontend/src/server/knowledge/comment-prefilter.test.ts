import { describe, it, expect } from "vitest";
import {
  isNoiseComment,
  prefilterComments,
  collectBackflowedAnchors,
  PREFILTER_TOP_N,
  type PrefilterSignal,
} from "./comment-prefilter";

// T-092 三级去噪门 ①硬规则预筛(纯函数)单测:短/纯表情标点/水词排除、
// 已回流(双锚)排除、likeCount desc + 新近排序、top N 截断。

function sig(
  id: string,
  rawText: string,
  likeCount: number | null = 0,
  externalId: string | null = `douyin:comment:${id}`,
  createdAt = "2026-07-01T00:00:00.000Z",
): PrefilterSignal {
  return { id, rawText, likeCount, externalId, createdAt };
}

describe("isNoiseComment(硬规则)", () => {
  it("<4 字(归一后)排除", () => {
    expect(isNoiseComment("好")).toBe(true);
    expect(isNoiseComment("??!")).toBe(true);
    expect(isNoiseComment("666")).toBe(true);
  });

  it("纯 emoji/标点排除", () => {
    expect(isNoiseComment("👍👍👍🔥🔥")).toBe(true);
    expect(isNoiseComment("!!!???……")).toBe(true);
  });

  it("水词表命中排除(含带标点/重复形态)", () => {
    expect(isNoiseComment("学到了")).toBe(true);
    expect(isNoiseComment("学到了!!")).toBe(true);
    expect(isNoiseComment("学到了学到了")).toBe(true);
    expect(isNoiseComment("沙发~")).toBe(true);
    expect(isNoiseComment("涨知识了")).toBe(true);
  });

  it("真实疑问/需求保留", () => {
    expect(isNoiseComment("本地模型怎么装?")).toBe(false);
    expect(isNoiseComment("求一期本地部署的教程")).toBe(false);
    expect(isNoiseComment("学到了,但是显存不够怎么办?")).toBe(false);
  });
});

describe("prefilterComments(集合级)", () => {
  it("已回流(externalId 锚)与已回流(signalId 兜底锚)排除并计数", () => {
    const signals = [
      sig("s1", "本地模型怎么装?"),
      sig("s2", "求本地部署教程"),
      sig("s3", "显存不够能跑吗", 5, null), // 无 externalId 的存量评论
    ];
    const out = prefilterComments(
      signals,
      new Set(["douyin:comment:s1"]),
      new Set(["s3"]),
    );
    expect(out.kept.map((s) => s.id)).toEqual(["s2"]);
    expect(out.droppedBackflowed).toBe(2);
    expect(out.droppedNoise).toBe(0);
  });

  it("水评被排除计入 droppedNoise;通过项按 likeCount desc + createdAt desc 排", () => {
    const signals = [
      sig("s1", "学到了", 999),
      sig("s2", "本地模型怎么装?", 10, null, "2026-07-01T00:00:00.000Z"),
      sig("s3", "求本地部署教程", 50),
      sig("s4", "显存不够能跑吗", 10, null, "2026-07-02T00:00:00.000Z"),
      sig("s5", "有没有教程链接呀", null),
    ];
    const out = prefilterComments(signals, new Set());
    expect(out.droppedNoise).toBe(1);
    expect(out.kept.map((s) => s.id)).toEqual(["s3", "s4", "s2", "s5"]);
  });

  it("top N 截断", () => {
    const signals = Array.from({ length: PREFILTER_TOP_N + 20 }, (_, i) =>
      sig(`s${i}`, `第 ${i} 条真实问题该怎么解决?`, i),
    );
    const out = prefilterComments(signals, new Set());
    expect(out.kept).toHaveLength(PREFILTER_TOP_N);
    // likeCount 最高的在前。
    expect(out.kept[0]!.id).toBe(`s${PREFILTER_TOP_N + 19}`);
  });
});

describe("collectBackflowedAnchors(knowledge 反查)", () => {
  it("只认 active + origin='comment_backflow' 行;聚合双锚", () => {
    const anchors = collectBackflowedAnchors([
      {
        status: "active",
        sourceMetadata: {
          origin: "comment_backflow",
          signalIds: ["s1", "s2"],
          signalExternalIds: ["douyin:comment:c1"],
        },
      },
      {
        // archived 的 qa 视为删除,允许重新回流。
        status: "archived",
        sourceMetadata: {
          origin: "comment_backflow",
          signalExternalIds: ["douyin:comment:c2"],
        },
      },
      { status: "active", sourceMetadata: { origin: "elsewhere" } },
      { status: "active", sourceMetadata: {} },
    ]);
    expect(anchors.externalIds).toEqual(new Set(["douyin:comment:c1"]));
    expect(anchors.signalIds).toEqual(new Set(["s1", "s2"]));
  });
});
