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

  it("[T-859] 竖屏主素材可声明左下角人物，但 overlay 不得驱动人物状态", () => {
    expect(
      videoRenderProps.safeParse({
        ...base,
        broll: [
          {
            at: 1,
            file: "evidence.png",
            label: "证据截图",
            presentation: "large_stage",
            visualRole: "still_image",
            speakerMode: "pip_bottom_left",
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      videoRenderProps.safeParse({
        ...base,
        broll: [
          {
            at: 1,
            file: "decoration.png",
            label: "辅助装饰",
            presentation: "overlay",
            visualRole: "still_image",
            speakerMode: "pip_bottom_left",
          },
        ],
      }).success,
    ).toBe(false);
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

  it("[T-858] 合法运动方向与 Unicode 字幕重点词可往返保留", () => {
    const parsed = videoRenderProps.parse({
      ...base,
      captions: [
        {
          start: 0,
          end: 2.5,
          cn: "AI 让剪辑更清楚",
          en: "AI makes the edit clearer",
          emphasis: [
            {
              text: "更清楚",
              startChar: 6,
              endChar: 9,
              startSec: 0.8,
              endSec: 2.2,
            },
          ],
        },
      ],
      direction: {
        motionThesis: "人物与证据轮流独占画布，主视觉结束后直接切回人物。",
        beatGraph: [
          {
            id: "opening_hold",
            sceneIdx: 0,
            startSec: 0,
            endSec: 2,
            subject: { kind: "talking_head", ref: "talking_head" },
            startState: "base",
            endState: "base",
            motionVerb: "hold",
            stageMode: "base",
            transitionIn: "cut",
            transitionOut: "cut",
            returnGeometry: "not_applicable",
          },
          {
            id: "evidence_card",
            sceneIdx: 0,
            startSec: 2,
            endSec: 4,
            subject: { kind: "card", ref: "card:0:0" },
            startState: "off_canvas",
            endState: "takeover",
            motionVerb: "enter",
            stageMode: "takeover",
            transitionIn: "slide",
            transitionOut: "fade",
            returnGeometry: "same_base",
          },
          {
            id: "evidence_broll",
            sceneIdx: 1,
            startSec: 12,
            endSec: 15,
            subject: { kind: "broll", ref: "broll:b1.mp4" },
            startState: "off_canvas",
            endState: "takeover",
            motionVerb: "enter",
            stageMode: "takeover",
            transitionIn: "cut",
            transitionOut: "fade",
            returnGeometry: "same_base",
          },
        ],
      },
    });
    expect(parsed.direction?.beatGraph).toHaveLength(3);
    expect(parsed.captions[0]?.emphasis?.[0]?.text).toBe("更清楚");
  });

  it("[T-858 RED] 有 direction 时每张卡片和每段素材都必须恰好成为一次主视觉", () => {
    const parsed = videoRenderProps.safeParse({
      ...base,
      direction: {
        motionThesis: "不能让未编排的旧视觉偷偷叠回画面。",
        beatGraph: [
          {
            id: "card_only",
            sceneIdx: 0,
            startSec: 2,
            endSec: 4,
            subject: { kind: "card", ref: "card:0:0" },
            startState: "off_canvas",
            endState: "takeover",
            motionVerb: "reveal",
            stageMode: "takeover",
            transitionIn: "cut",
            transitionOut: "cut",
            returnGeometry: "same_base",
          },
        ],
      },
    });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("broll:b1.mp4");
    expect(JSON.stringify(parsed.error?.issues)).toContain("恰好一次");
  });

  it("[T-858 RED] 明确的辅助 overlay 不进入主视觉 beatGraph，也不能伪装成 takeover", () => {
    const overlayBase = {
      ...base,
      broll: [
        {
          at: 1,
          file: "badge.png",
          label: "辅助标记",
          presentation: "overlay" as const,
          visualRole: "still_image" as const,
        },
      ],
    };
    const cardOnly = {
      motionThesis: "人物基底可带明确辅助标记，主视觉仍唯一。",
      beatGraph: [
        {
          id: "card_main",
          sceneIdx: 0,
          startSec: 2,
          endSec: 4,
          subject: { kind: "card" as const, ref: "card:0:0" },
          startState: "off_canvas" as const,
          endState: "takeover" as const,
          motionVerb: "reveal" as const,
          stageMode: "takeover" as const,
          transitionIn: "cut" as const,
          transitionOut: "cut" as const,
          returnGeometry: "same_base" as const,
        },
      ],
    };
    expect(videoRenderProps.safeParse({ ...overlayBase, direction: cardOnly }).success).toBe(true);
    const illegal = videoRenderProps.safeParse({
      ...overlayBase,
      direction: {
        ...cardOnly,
        beatGraph: [
          ...cardOnly.beatGraph,
          {
            ...cardOnly.beatGraph[0],
            id: "overlay_takeover",
            startSec: 4,
            endSec: 5,
            subject: { kind: "broll", ref: "broll:badge.png" },
          },
        ],
      },
    });
    expect(illegal.success).toBe(false);
    expect(JSON.stringify(illegal.error?.issues)).toContain("broll:badge.png");
  });

  it("[T-858] 运动方向中两个主视觉拍重叠会被拒绝", () => {
    const parsed = videoRenderProps.safeParse({
      ...base,
      direction: {
        motionThesis: "唯一主视觉逐拍交接。",
        beatGraph: [
          {
            id: "first",
            sceneIdx: 0,
            startSec: 0,
            endSec: 3,
            subject: { kind: "talking_head", ref: "talking_head" },
            startState: "base",
            endState: "base",
            motionVerb: "hold",
            stageMode: "base",
            transitionIn: "cut",
            transitionOut: "cut",
            returnGeometry: "not_applicable",
          },
          {
            id: "overlap",
            sceneIdx: 0,
            startSec: 2.5,
            endSec: 4,
            subject: { kind: "card", ref: "card:0:0" },
            startState: "off_canvas",
            endState: "takeover",
            motionVerb: "enter",
            stageMode: "takeover",
            transitionIn: "slide",
            transitionOut: "fade",
            returnGeometry: "same_base",
          },
        ],
      },
    });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("不得重叠");
  });

  it("[T-858] 新导演合同拒绝把人物缩成 PiP 或把主视觉当安全叠层", () => {
    const legacyAutoPip = {
      ...base,
      direction: {
        motionThesis: "素材出现时把人物缩小。",
        beatGraph: [
          {
            id: "legacy_auto_pip",
            sceneIdx: 0,
            startSec: 0,
            endSec: 3,
            subject: { kind: "card", ref: "card:0:0" },
            startState: "off_canvas",
            endState: "pip",
            motionVerb: "shrink",
            stageMode: "safe_overlay",
            transitionIn: "scale",
            transitionOut: "scale",
            returnGeometry: "same_base",
          },
        ],
      },
    };
    expect(videoRenderProps.safeParse(legacyAutoPip).success).toBe(false);
  });

  it("[T-858] 字幕重点词的文字范围或时间越界会被拒绝", () => {
    for (const emphasis of [
      { text: "不对应", startChar: 0, endChar: 2, startSec: 0.4, endSec: 1.2 },
      { text: "第一", startChar: 0, endChar: 2, startSec: 2.4, endSec: 2.8 },
    ]) {
      expect(
        videoRenderProps.safeParse({
          ...base,
          captions: [{ ...base.captions[0], emphasis: [emphasis] }],
        }).success,
      ).toBe(false);
    }
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
