/**
 * [T-254a/b 对接] 组装器单测:四决策产物 → contract videoRenderProps。
 *   - 归场/排序/越界丢弃(temp 期既有行为,按契约新形状断言);
 *   - 字段映射真值:meta/talkingHead/captions/scenes(id/label/sub)/顶层 broll;
 *   - 六 kind 卡确定性派生:stat 数值提取、list 切分、compare 切半/降级、image 降级;
 *   - `.parse()` 硬校验:缺 talkingHead file、场景重叠等不合即抛(不静默)。
 * 确定性:纯 fixture,无网络/随机/时钟。
 */

import { describe, expect, it } from "vitest";

import type { VideoDecisions } from "@creatoros/backend/modules/ai-runtime";
import { assembleVideoRenderProps } from "./assemble-video-render-props";

const DECISIONS: VideoDecisions = {
  scenes: [
    { title: "开场钩子", startSec: 0, endSec: 3.5, summary: "抛出 47% 数字" },
    { title: "角色技巧", startSec: 3.5, endSec: 12, summary: "给模型一个角色" },
  ],
  cards: [
    { sceneIdx: 0, kind: "stat", content: "效率提升 47%", at: 0 },
    { sceneIdx: 1, kind: "quote", content: "给模型一个角色", at: 3.5 },
  ],
  broll: [
    {
      sceneIdx: 1,
      assetId: "asset-1",
      at: 3.5,
      durationSec: 3,
      presentation: "full_frame",
      visualRole: "screen_recording",
    },
  ],
  subtitles: [
    { index: 1, startSec: 0, endSec: 3.5, zh: "大家好,效率提升 47%", en: "Hi, +47%" },
    { index: 2, startSec: 3.5, endSec: 12, zh: "给模型一个角色", en: "" },
  ],
  srtLines: [
    { index: 1, startSec: 0, endSec: 3.5, text: "大家好,效率提升 47%" },
    { index: 2, startSec: 3.5, endSec: 12, text: "给模型一个角色" },
  ],
};

const OPTS = {
  title: "提示词三技巧",
  talkingHeadAssetId: "asset-video-raw",
  inventory: [
    {
      assetId: "asset-1",
      label: "提示词录屏",
      kind: "video",
      description: "",
      width: 1170,
      height: 2532,
      durationMs: 8_400,
    },
  ],
};

describe("assembleVideoRenderProps(contract videoRenderProps 单一真值)", () => {
  it("界面视频即使 AI 误给 large_stage 也提升为 full_frame，静态图仍保留安全舞台", () => {
    const props = assembleVideoRenderProps(
      {
        ...DECISIONS,
        broll: [
          {
            sceneIdx: 1,
            assetId: "screen-recording",
            at: 4,
            durationSec: 4,
            presentation: "large_stage",
            visualRole: "screen_recording",
          },
          {
            sceneIdx: 1,
            assetId: "portrait-image",
            at: 8,
            durationSec: 3,
            presentation: "large_stage",
            visualRole: "still_image",
          },
        ],
      },
      {
        ...OPTS,
        inventory: [
          {
            assetId: "screen-recording",
            label: "项目操作录屏",
            kind: "video",
            description: "展示连续操作",
            width: 1920,
            height: 1080,
            durationMs: 12_000,
          },
          {
            assetId: "portrait-image",
            label: "竖版配图",
            kind: "image",
            description: "静态补充画面",
            width: 1080,
            height: 1920,
          },
        ],
      },
    );

    expect(props.broll[0]!.presentation).toBe("full_frame");
    expect(props.broll[0]!.speakerMode).toBe("pip_bottom_left");
    expect(props.broll[0]!.visualRole).toBe("screen_recording");
    expect(props.broll[1]!.presentation).toBe("large_stage");
    expect(props.broll[1]!.speakerMode).toBeUndefined();
    expect(props.broll[1]!.visualRole).toBe("still_image");
  });

  it("cards 按 sceneIdx 归场并按 at 排序;越界项丢弃;时长取 max(场景,字幕)", () => {
    const props = assembleVideoRenderProps(
      {
        ...DECISIONS,
        cards: [
          ...DECISIONS.cards,
          { sceneIdx: 9, kind: "list", content: "越界卡", at: 0 },
        ],
      },
      OPTS,
    );
    expect(props.scenes).toHaveLength(2);
    expect(props.scenes[0]!.cards).toHaveLength(1);
    expect(props.scenes[0]!.cards[0]).toMatchObject({
      kind: "stat",
      value: "47%",
      label: "效率提升 47%",
      at: 0,
    });
    expect(props.scenes[1]!.cards[0]).toMatchObject({
      kind: "quote",
      text: "给模型一个角色",
    });
    expect(props.talkingHead.durationSec).toBe(12);
  });

  it("字段映射真值:meta/talkingHead.file/captions(zh→cn,空 en 省略)/scene id·label·sub/顶层 broll", () => {
    const props = assembleVideoRenderProps(DECISIONS, OPTS);
    expect(props.meta).toEqual({ title: "提示词三技巧", brandLabel: "" });
    expect(props.talkingHead).toEqual({
      file: "asset-video-raw",
      durationSec: 12,
      hasAudio: true,
    });
    expect(props.captions[0]).toEqual({
      start: 0,
      end: 3.5,
      cn: "大家好,效率提升 47%",
      en: "Hi, +47%",
    });
    expect(props.captions[1]!.en).toBeUndefined(); // 空串省略
    expect(props.scenes[0]).toMatchObject({
      id: "scene-1",
      label: "SCENE 1",
      title: "大家好,效率提升 47%",
      sub: "抛出 47% 数字",
      role: "body",
    });
    // B-roll 拍平到顶层:file=assetId(mountAs 约定),label=清单展示名。
    expect(props.broll).toEqual([
      {
        at: 3.5,
        file: "asset-1",
        durationSec: 3,
        label: "提示词录屏",
        presentation: "full_frame",
        visualRole: "screen_recording",
        speakerMode: "pip_bottom_left",
        motion: "static",
        sourceWidth: 1170,
        sourceHeight: 2532,
        big: false,
      },
    ]);
    expect(props.delivery).toEqual({ width: 1920, height: 1080, fps: 30 });
  });

  it("内部结构标签不上屏，场景标题从真实口播提炼，长卡片收敛为视觉摘要", () => {
    const props = assembleVideoRenderProps(
      {
        ...DECISIONS,
        scenes: [
          {
            title: "新闻钩子",
            startSec: 0,
            endSec: 12,
            summary: "有人说中文 AI 训练师时薪能到三百元，这个说法需要回到岗位要求里看。",
          },
        ],
        cards: [
          {
            sceneIdx: 0,
            kind: "quote",
            content:
              "大家好,效率提升 47%，这是一段很长很长的卡片文案，不应该整段压在视频画面里和字幕互相打架。",
            at: 0,
          },
          {
            sceneIdx: 0,
            kind: "quote",
            content:
              "大家好,效率提升 47%，这是一段很长很长的卡片文案，不应该整段压在视频画面里和字幕互相打架。",
            at: 1,
          },
        ],
        subtitles: [
          {
            index: 1,
            startSec: 0,
            endSec: 12,
            zh: "有个博主说中文 AI 训练师时薪三百元",
            en: "",
          },
        ],
        srtLines: [
          {
            index: 1,
            startSec: 0,
            endSec: 12,
            text: "有个博主说中文 AI 训练师时薪三百元",
          },
        ],
      },
      OPTS,
    );
    expect(props.scenes[0]!.title).toBe("有个博主说中文 AI 训练师…");
    expect(props.scenes[0]!.title).not.toContain("新闻钩子");
    expect(props.scenes[0]!.sub!.length).toBeLessThanOrEqual(37);
    expect(props.scenes[0]!.cards[0]).toMatchObject({ kind: "quote" });
    expect(props.scenes[0]!.cards).toHaveLength(1);
    expect((props.scenes[0]!.cards[0] as { text: string }).text.length).toBeLessThanOrEqual(45);
  });

  it("六 kind 派生:list 按顿号切分;compare 切两半;compare 切不出/ image 无文件 → 降级 quote", () => {
    const props = assembleVideoRenderProps(
      {
        ...DECISIONS,
        cards: [
          { sceneIdx: 0, kind: "list", content: "角色、示例、约束", at: 0 },
          { sceneIdx: 0, kind: "compare", content: "泛泛提问 vs 给角色", at: 0 },
          { sceneIdx: 1, kind: "compare", content: "只有一半", at: 3.5 },
          { sceneIdx: 1, kind: "image", content: "角色示意图", at: 3.5 },
          { sceneIdx: 1, kind: "code", content: "prompt --role expert", at: 3.5 },
        ],
      },
      OPTS,
    );
    expect(props.scenes[0]!.cards[0]).toMatchObject({
      kind: "list",
      items: [
        { text: "角色" },
        { text: "示例" },
        { text: "约束" },
      ],
    });
    expect(props.scenes[0]!.cards[1]).toMatchObject({
      kind: "compare",
      left: { title: "泛泛提问", items: ["泛泛提问"] },
      right: { title: "给角色", items: ["给角色"] },
    });
    expect(props.scenes[1]!.cards.map((c) => c.kind)).toEqual([
      "quote", // compare 降级
      "quote", // image 降级
      "code",
    ]);
    expect(props.scenes[1]!.cards[2]).toMatchObject({
      code: "prompt --role expert",
    });
  });

  it("`.parse()` 硬校验不合即抛:缺 talkingHead assetId(file min 1)/场景重叠", () => {
    expect(() =>
      assembleVideoRenderProps(DECISIONS, { ...OPTS, talkingHeadAssetId: null }),
    ).toThrow();
    expect(() =>
      assembleVideoRenderProps(
        {
          ...DECISIONS,
          scenes: [
            { title: "A", startSec: 0, endSec: 5, summary: "" },
            { title: "B", startSec: 4, endSec: 12, summary: "" }, // 与 A 重叠
          ],
        },
        OPTS,
      ),
    ).toThrow(/重叠/);
  });

  it("时长可由 T-254c 探针覆盖;缺 title 用占位名", () => {
    const props = assembleVideoRenderProps(DECISIONS, {
      ...OPTS,
      title: undefined,
      talkingHeadDurationSec: 15,
    });
    expect(props.talkingHead.durationSec).toBe(15);
    expect(props.meta.title).toBe("未命名成片");
  });
});
