// [T-254a] video.render props 契约校验单测(schema 即产品规则:场景有序不重叠、
// 卡片插点落场景区间、B-roll/字幕不越片长)。
import { describe, expect, it } from "vitest";
import { videoRenderParams, videoRenderProps } from "../src/resources/video-render";

const base = {
  meta: { title: "测试片" },
  talkingHead: { file: "th.mp4", durationSec: 60 },
  captions: [
    { start: 0, end: 2.5, cn: "第一句", en: "First line" },
    { start: 2.5, end: 5, cn: "第二句" },
  ],
  scenes: [
    {
      id: "s1",
      label: "HOOK",
      title: "开场",
      startSec: 0,
      endSec: 10,
      role: "hook" as const,
      cards: [{ kind: "stat" as const, at: 2, value: "3", unit: "小时", label: "从想法到能用" }],
    },
    {
      id: "s2",
      label: "BODY",
      title: "正文",
      startSec: 10,
      endSec: 60,
      cards: [],
    },
  ],
  broll: [{ at: 12, file: "b1.mp4", label: "真实录屏" }],
};

describe("videoRenderProps", () => {
  it("合法 props 通过并补默认值(delivery 1920x1080/30fps,role=body)", () => {
    const parsed = videoRenderProps.parse(base);
    expect(parsed.delivery).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(parsed.scenes[1]!.role).toBe("body");
    expect(parsed.meta.brandLabel).toBe("");
    expect(parsed.talkingHead.hasAudio).toBe(true);
  });

  it("全屏录屏允许开场隐藏人物，也允许后续使用左下画中画", () => {
    for (const speakerMode of ["hidden", "pip_bottom_left"] as const) {
      const parsed = videoRenderProps.parse({
        ...base,
        broll: [
          {
            at: 0,
            file: "screen.mp4",
            label: "真实操作录屏",
            durationSec: 3,
            presentation: "full_frame",
            visualRole: "screen_recording",
            speakerMode,
          },
        ],
      });
      expect(parsed.broll[0]?.speakerMode).toBe(speakerMode);
    }
  });

  it("[T-295] motion 可选:缺省不带该字段;显式六值皆可校验、往返保留", () => {
    // 缺省:不产 motion(弱模型兜底靠 template 派生)。
    const noMotion = videoRenderProps.parse(base);
    expect(noMotion.scenes[0]!.cards[0]!.motion).toBeUndefined();
    // 显式:六个枚举值都合法且往返保留。
    for (const m of ["bar", "counter", "metaphor", "strike", "reveal", "plain"] as const) {
      const parsed = videoRenderProps.parse({
        ...base,
        scenes: [
          {
            ...base.scenes[0],
            cards: [{ kind: "quote" as const, at: 2, text: "x", motion: m }],
          },
          base.scenes[1],
        ],
      });
      expect(parsed.scenes[0]!.cards[0]!.motion).toBe(m);
    }
    // 非法枚举值即废。
    expect(() =>
      videoRenderProps.parse({
        ...base,
        scenes: [
          {
            ...base.scenes[0],
            cards: [{ kind: "quote" as const, at: 2, text: "x", motion: "spin" }],
          },
          base.scenes[1],
        ],
      }),
    ).toThrow();
  });

  it("六 kind 卡片全部可校验", () => {
    const cards = [
      { kind: "stat", at: 1, value: "0", label: "行代码", strike: true },
      { kind: "quote", at: 2, text: "最值钱的是想法本身" },
      { kind: "list", at: 3, items: [{ text: "能打开" }, { text: "能点击" }] },
      {
        kind: "compare",
        at: 4,
        left: { title: "原来", items: ["几天起步"] },
        right: { title: "现在", items: ["两三小时"] },
      },
      { kind: "code", at: 5, code: "pnpm install", label: "一条命令" },
      { kind: "image", at: 6, file: "shot.png", label: "发现页" },
    ];
    const parsed = videoRenderProps.parse({
      ...base,
      scenes: [{ ...base.scenes[0], endSec: 10, cards }, base.scenes[1]],
    });
    expect(parsed.scenes[0]!.cards).toHaveLength(6);
  });

  it("场景重叠被拒", () => {
    const bad = {
      ...base,
      scenes: [base.scenes[0], { ...base.scenes[1], startSec: 8 }],
    };
    const r = videoRenderProps.safeParse(bad);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("重叠");
  });

  it("场景越片长被拒", () => {
    const bad = {
      ...base,
      scenes: [base.scenes[0], { ...base.scenes[1], endSec: 61 }],
    };
    expect(videoRenderProps.safeParse(bad).success).toBe(false);
  });

  it("卡片 at 落在场景区间外被拒", () => {
    const bad = {
      ...base,
      scenes: [
        {
          ...base.scenes[0],
          cards: [{ kind: "stat", at: 11, value: "3", label: "x" }],
        },
        base.scenes[1],
      ],
    };
    const r = videoRenderProps.safeParse(bad);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("不在场景");
  });

  it("B-roll 越片长 / 字幕 end<=start 被拒", () => {
    expect(
      videoRenderProps.safeParse({ ...base, broll: [{ at: 60, file: "b.mp4", label: "x" }] })
        .success,
    ).toBe(false);
    expect(
      videoRenderProps.safeParse({
        ...base,
        captions: [{ start: 3, end: 3, cn: "坏行" }],
      }).success,
    ).toBe(false);
  });

  it("special 只接受预设枚举 3(pipeline/comparison/steps)", () => {
    const ok = videoRenderProps.safeParse({
      ...base,
      scenes: [
        {
          ...base.scenes[0],
          special: { kind: "steps", items: [{ label: "一" }, { label: "二" }] },
        },
        base.scenes[1],
      ],
    });
    expect(ok.success).toBe(true);
    const bad = videoRenderProps.safeParse({
      ...base,
      scenes: [
        { ...base.scenes[0], special: { kind: "wall", bricks: ["设计"] } },
        base.scenes[1],
      ],
    });
    expect(bad.success).toBe(false);
  });

  it("videoRenderParams 包一层 { props }(executor paramsSchema 形状)", () => {
    expect(videoRenderParams.safeParse({ props: base }).success).toBe(true);
    expect(videoRenderParams.safeParse({}).success).toBe(false);
  });
});
