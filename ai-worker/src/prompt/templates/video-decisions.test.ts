import { describe, expect, it } from "vitest";
import {
  VIDEO_CARDS_TEMPLATE,
  VIDEO_DIRECTOR_TEMPLATE,
  normalizeVideoBrollOutput,
  videoBrollSchema,
  videoDirectorReviewSchema,
} from "./video-decisions";

const slot = (purpose: string, index: number) => ({
  sceneIdx: index,
  at: index,
  purpose,
  spokenAnchor: `口播原话 ${index}`,
  visualBrief: `具体画面 ${index}`,
  searchQuery: `搜索词 ${index}`,
});

describe("normalizeVideoBrollOutput", () => {
  it("14 个常见中英文 purpose 漂移全部归一化，不能让整批 B-roll 失败", () => {
    const purposes = [
      "事实证据",
      "fact evidence",
      "Fact-Evidence",
      "factual_evidence",
      "proof",
      "类比联想",
      "analogy_visual",
      "过程演示",
      "流程",
      "process_demo",
      "前后对比",
      "contrast_before_after",
      "情绪氛围",
      "信息卡片",
    ];

    const normalized = normalizeVideoBrollOutput({
      slots: purposes.map(slot),
      broll: [],
    });
    const parsed = videoBrollSchema.parse(normalized);

    expect(parsed.slots).toHaveLength(14);
    expect(parsed.slots.map((item) => item.purpose)).toEqual([
      "fact_evidence",
      "fact_evidence",
      "fact_evidence",
      "fact_evidence",
      "fact_evidence",
      "analogy",
      "analogy",
      "process",
      "process",
      "process",
      "contrast",
      "contrast",
      "mood",
      "info_card",
    ]);
  });

  it("正式枚举原样保留；无法识别的创作用途保守落到 info_card，槽位不丢失", () => {
    const official = [
      "fact_evidence",
      "analogy",
      "process",
      "contrast",
      "mood",
      "info_card",
    ];
    const normalized = normalizeVideoBrollOutput({
      slots: [
        ...official.map(slot),
        {
          ...slot("audience_empathy_moment", official.length),
          visualBrief: "一句无法可靠推断具体类型的新画面描述",
        },
      ],
      broll: [],
    });
    const parsed = videoBrollSchema.parse(normalized);

    expect(parsed.slots.slice(0, official.length).map((item) => item.purpose)).toEqual(
      official,
    );
    expect(parsed.slots.at(-1)?.purpose).toBe("info_card");
    expect(parsed.slots.at(-1)?.visualBrief).toBe(
      "一句无法可靠推断具体类型的新画面描述",
    );
  });

  it("弱模型违约返回旧 broll 选料时，在严格 schema 前清空，不越过 material.match", () => {
    const normalized = normalizeVideoBrollOutput({
      slots: [slot("process", 0)],
      broll: [
        {
          sceneIdx: 0,
          assetId: "asset-manual-1",
          at: 0,
          durationSec: 4,
        },
      ],
    });
    const parsed = videoBrollSchema.parse(normalized);

    expect(parsed.slots).toHaveLength(1);
    expect(parsed.broll).toEqual([]);
  });
});

describe("VIDEO_CARDS_TEMPLATE 视觉覆盖底线", () => {
  it("长场景按时长安排连续信息节拍，不允许用一张角落标签冒充视觉覆盖", () => {
    expect(VIDEO_CARDS_TEMPLATE.template).toContain(
      "超过 8 秒且没有已指定素材",
    );
    expect(VIDEO_CARDS_TEMPLATE.template).toContain(
      "8–14 秒且没有真实素材的场景安排 2 个不同信息节拍",
    );
    expect(VIDEO_CARDS_TEMPLATE.template).toContain(
      "14–24 秒安排 3 个",
    );
    expect(VIDEO_CARDS_TEMPLATE.template).toContain(
      "一张孤零零的小标签",
    );
    expect(VIDEO_CARDS_TEMPLATE.template).toContain(
      "已经有一张卡”不等于整场已覆盖",
    );
  });
});

describe("VIDEO_DIRECTOR_TEMPLATE 总导演审片", () => {
  it("必须同时审整体叙事、用户素材、人物安全区和编辑内部标签", () => {
    expect(VIDEO_DIRECTOR_TEMPLATE.system).toContain("总导演");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("用户上传素材");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("角落小人物");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("SCENE / 分镜一");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("视为已绑定");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("不得要求用户重选");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("2–4 个随口播推进的语义节拍");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("同一真实素材全片只能出现一次");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("项目封面和既有成片不是 B-roll");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("同一时刻只能有一个非 overlay 主视觉");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("issues 必须为空");
  });

  it("结构化结论只接受 ready/revise 与固定问题类型", () => {
    expect(
      videoDirectorReviewSchema.parse({
        verdict: "revise",
        summary: "长段画面没有承接。",
        issues: [
          {
            sceneIdx: 1,
            severity: "blocking",
            code: "visual_gap",
            message: "补齐信息卡或真实素材后再渲染。",
          },
        ],
      }).verdict,
    ).toBe("revise");
    expect(() =>
      videoDirectorReviewSchema.parse({
        verdict: "revise",
        issues: [
          {
            sceneIdx: 0,
            severity: "blocking",
            code: "random_style",
            message: "invalid",
          },
        ],
      }),
    ).toThrow();
  });
});
