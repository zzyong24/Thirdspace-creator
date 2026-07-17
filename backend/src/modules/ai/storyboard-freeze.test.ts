import { describe, it, expect } from "vitest";
import {
  freezeStoryboardSections,
  hasStoryboardVisual,
} from "./storyboard-freeze";

// [T-387b] 分镜凝固 pass(采纳定稿时刻的确定性凝固)—— 测锚:
//   ① 凝固剔无效 ref(不存在的 assetId 剔除挪 missing,诚实);
//   ② missing 汇总(全稿去重);
//   ③ 无 visual 的 contentData 整体跳过(hasStoryboardVisual=false,零回归);
//   ④ 无 visual 的段原样透传(planning.outline 等其它 sections 形状零影响)。

describe("hasStoryboardVisual", () => {
  it("无 sections / sections 无 visual → false(凝固 pass 整体跳过)", () => {
    expect(hasStoryboardVisual(undefined)).toBe(false);
    expect(hasStoryboardVisual({ nodes: [] })).toBe(false);
    expect(
      hasStoryboardVisual({ sections: [{ heading: "h", body: "b" }] }),
    ).toBe(false);
    // planning.outline 形状(label/intent sections)也不触发。
    expect(
      hasStoryboardVisual({ sections: [{ label: "钩子", intent: "拉住" }] }),
    ).toBe(false);
  });

  it("任一段带非空 visual → true", () => {
    expect(
      hasStoryboardVisual({
        sections: [
          { heading: "h", body: "b" },
          { heading: "h2", body: "b2", visual: { description: "产品特写" } },
        ],
      }),
    ).toBe(true);
  });

  it("visual 三段全空(空壳)→ false(视同无 visual)", () => {
    expect(
      hasStoryboardVisual({
        sections: [
          { visual: { description: "", assetRefs: [], missing: [] } },
        ],
      }),
    ).toBe(false);
  });
});

describe("freezeStoryboardSections", () => {
  const existing = new Set(["asset-1", "asset-2"]);

  it("凝固剔无效 ref:不存在的 assetId 剔除并挪进该段 missing(诚实)", () => {
    const { contentData, missingSummary, removedRefs } =
      freezeStoryboardSections(
        {
          sections: [
            {
              heading: "1. 开场",
              body: "口播：hook",
              visual: {
                description: "产品特写",
                assetRefs: ["asset-1", "asset-fake"],
                missing: [],
              },
            },
          ],
        },
        existing,
      );
    const sec = (contentData.sections as Array<Record<string, unknown>>)[0]!;
    const visual = sec.visual as {
      description: string;
      assetRefs: string[];
      missing: string[];
    };
    expect(visual.assetRefs).toEqual(["asset-1"]); // 真实的保留
    expect(visual.missing).toEqual(["素材引用失效：asset-fake"]); // 虚构的挪 missing
    expect(removedRefs).toEqual(["asset-fake"]);
    expect(missingSummary).toEqual(["素材引用失效：asset-fake"]);
  });

  it("missing 汇总:各段 missing + 剔除项合并去重", () => {
    const { missingSummary } = freezeStoryboardSections(
      {
        sections: [
          {
            visual: {
              description: "a",
              assetRefs: [],
              missing: ["产品操作录屏"],
            },
          },
          {
            visual: {
              description: "b",
              assetRefs: [],
              missing: ["产品操作录屏", "对比图表"],
            },
          },
        ],
      },
      existing,
    );
    expect(missingSummary).toEqual(["产品操作录屏", "对比图表"]); // 去重
  });

  it("无 visual 的段原样透传(不重塑形状,其它字段保留)", () => {
    const plain = { heading: "h", body: "b", emphasis: true };
    const { contentData } = freezeStoryboardSections(
      {
        sections: [
          plain,
          { heading: "h2", visual: { description: "d", assetRefs: ["asset-2"], missing: [] } },
        ],
        hook: "钩子",
      },
      existing,
    );
    const sections = contentData.sections as unknown[];
    expect(sections[0]).toBe(plain); // 引用原样(无 visual 不动)
    expect(contentData.hook).toBe("钩子"); // 顶层其它字段保留
  });

  it("全部 ref 真实存在 → 原样凝固,无剔除", () => {
    const { contentData, missingSummary, removedRefs } =
      freezeStoryboardSections(
        {
          sections: [
            {
              visual: {
                description: "d",
                assetRefs: ["asset-1", "asset-2"],
                missing: [],
              },
            },
          ],
        },
        existing,
      );
    const visual = (contentData.sections as Array<Record<string, unknown>>)[0]!
      .visual as { assetRefs: string[]; missing: string[] };
    expect(visual.assetRefs).toEqual(["asset-1", "asset-2"]);
    expect(visual.missing).toEqual([]);
    expect(removedRefs).toEqual([]);
    expect(missingSummary).toEqual([]);
  });
});
