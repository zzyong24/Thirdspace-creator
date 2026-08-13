import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { parseSrt } from "./srt";
import {
  decideScenes,
  decideCards,
  decideBroll,
  decideSubtitles,
  auditVideoDecisions,
  autoRepairVideoDecisions,
  normalizeBrollTimeline,
  closeDirectorReview,
  runVideoDecisions,
  buildScenesDecisionSchema,
  buildCardsDecisionSchema,
  buildBrollDecisionSchema,
  buildSubtitlesDecisionSchema,
  isCardContentTraceable,
  VIDEO_DECISIONS_RESULT_TYPE,
  VIDEO_DECISION_STEPS,
  SNAP_TOLERANCE_SEC,
  storyboardFacet,
  storyboardFromContentData,
  dedupeBrollRefs,
  collectProjectBrollInventory,
  libraryFacet,
  visualSlotsFacet,
  manualAssignmentsFacet,
  enforceStoryboardBroll,
  enforceManualMaterialAssignments,
  decideMaterialBroll,
  buildVideoMaterialMatchSchema,
  type StructuredCall,
  type StructuredCallInput,
  type VideoScene,
  type BrollAssetRef,
  type VideoDecisionsDeps,
  type ManualMaterialAssignment,
} from "./video-decisions-runner";

// [T-254b/T-712] 四决策 + 总导演审片 runner 单测 —— 全 fake 模型注入(callStructured 逃生口,不碰真 AI):
//   动态 refine(边界落 SRT start / assetId 清单内 / 字幕行数不变)、后处理吸附、
//   可溯剔除(编造数值即废)、B-roll 清单外剔除/空清单跳过、字幕重写守门、
//   编排成败(候选落 video_decisions / 任一步失败诚实报哪步 + cancelTask)。

const ctx: RequestContext = {
  userId: "user-1",
  requestId: "req-1",
  source: "user",
  accountId: "acc-1",
};

const SRT = `1
00:00:00,000 --> 00:00:03,500
大家好,今天讲三个提示词技巧,效率提升 47%

2
00:00:03,500 --> 00:00:08,000
第一个技巧是给模型一个角色

3
00:00:08,000 --> 00:00:12,000
第二个技巧是提供示例

4
00:00:12,000 --> 00:00:15,000
记得点赞关注
`;
const srtLines = parseSrt(SRT);
const SCRIPT =
  "大家好,今天讲三个提示词技巧,效率提升 47%。第一个技巧是给模型一个角色。第二个技巧是提供示例。记得点赞关注。";

// fake StructuredCall:按 skillId 回放固定产物(绕过真模型;动态 schema 的 refine 另测)。
function fakeCall(outputs: Record<string, unknown>): StructuredCall {
  return async <T>({ skillId }: { skillId: string }) => {
    const o = outputs[skillId];
    if (o instanceof Error) throw o;
    if (o === undefined) throw new Error(`fakeCall 没有 ${skillId} 的桩`);
    return o as T;
  };
}

const SCENES_OK = {
  scenes: [
    { title: "开场", startSec: 0, endSec: 3.5, summary: "钩子" },
    { title: "角色技巧", startSec: 3.5, endSec: 12, summary: "给模型角色" },
    { title: "结尾", startSec: 12, endSec: 15, summary: "CTA" },
  ],
};

describe("动态 refine schema(zod,绑定本次输入)", () => {
  it("① 分场:边界不落 SRT start(超容差)→ 校验失败;落上 → 通过", () => {
    const schema = buildScenesDecisionSchema([0, 3.5, 8, 12]);
    expect(schema.safeParse(SCENES_OK).success).toBe(true);
    const off = {
      scenes: [{ title: "x", startSec: 6.2, endSec: 15, summary: "" }], // 离 3.5/8 都 > 2.2? 6.2→8 差 1.8 在容差内
    };
    expect(schema.safeParse(off).success).toBe(true);
    const wayOff = {
      scenes: [{ title: "x", startSec: 5.75 + SNAP_TOLERANCE_SEC * 10, endSec: 15, summary: "" }],
    };
    expect(schema.safeParse(wayOff).success).toBe(false);
    expect(schema.safeParse({ scenes: [] }).success).toBe(false); // 空分场即废
  });

  it("② 信息卡:sceneIdx 越界 / at 不落 SRT start → 校验失败", () => {
    const schema = buildCardsDecisionSchema(3, [0, 3.5, 8, 12]);
    const ok = { cards: [{ sceneIdx: 0, kind: "stat", content: "47%", at: 0 }] };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(
      schema.safeParse({ cards: [{ sceneIdx: 9, kind: "stat", content: "x", at: 0 }] })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({ cards: [{ sceneIdx: 0, kind: "stat", content: "x", at: 99 }] })
        .success,
    ).toBe(false);
    // kind 六枚举外即废(静态 enum)
    expect(
      schema.safeParse({ cards: [{ sceneIdx: 0, kind: "banner", content: "x", at: 0 }] })
        .success,
    ).toBe(false);
  });

  it("② Scene Graph 坏动作在模型输出 schema 阶段失败，不能等后处理静默降级", () => {
    const schema = buildCardsDecisionSchema(1, [0]);
    const visualPlan = {
      relation: "cause_effect",
      parts: [
        { text: "原因", role: "cause" },
        { text: "结果", role: "result" },
      ],
      scene: {
        cognitiveGoal: "看见原因导向结果",
        layout: "flow",
        aspectStrategy: "reflow",
        entities: [
          { id: "cause", kind: "node", glyph: "feature", semantic: "原因" },
          { id: "result", kind: "target", glyph: "target", semantic: "结果" },
        ],
        beats: [
          {
            action: "trace",
            target: "cause",
            start: 0,
            duration: 0.5,
            from: { opacity: 1, progress: 0 },
            to: { opacity: 1, progress: 1 },
          },
        ],
      },
    };
    expect(
      schema.safeParse({
        cards: [{ sceneIdx: 0, kind: "quote", content: "原因", at: 0, visualPlan }],
      }).success,
    ).toBe(false);
  });

  it("③ B-roll:assetId 清单外 → 校验失败(禁编造)", () => {
    const schema = buildBrollDecisionSchema(["asset-1", "asset-2"], 3);
    expect(
      schema.safeParse({ broll: [{ sceneIdx: 1, assetId: "asset-2", at: 4, durationSec: 3 }] })
        .success,
    ).toBe(true);
    expect(
      schema.safeParse({ broll: [{ sceneIdx: 1, assetId: "asset-fake", at: 4, durationSec: 3 }] })
        .success,
    ).toBe(false);
  });

  it("④ 字幕:行数/序号集不一致 → 校验失败(禁增删并行)", () => {
    const schema = buildSubtitlesDecisionSchema(srtLines);
    const ok = {
      lines: srtLines.map((l) => ({ index: l.index, zh: l.text, en: "en" })),
    };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ lines: ok.lines.slice(1) }).success).toBe(false); // 少一行
    expect(
      schema.safeParse({
        lines: [...ok.lines.slice(0, 3), { index: 99, zh: "x", en: "y" }],
      }).success,
    ).toBe(false); // 序号漂移
  });
});

describe("[T-792] 内容辅助型画面需求向下游传递", () => {
  it("真实素材匹配能看到认知增量和选图理由，但不接收仅供文生图的 prompt", () => {
    const facet = visualSlotsFacet([
      {
        sceneIdx: 0,
        at: 1.2,
        purpose: "contrast",
        spokenAnchor: "保存记录不等于理解",
        visualClaim: "档案已满，理解连接仍断开",
        reason: "断桥比口头解释更容易看见两者的缺口",
        visualBrief: "聊天档案柜与人物之间的桥断开",
        generationPrompt: "竖屏概念插画，不要文字",
        searchQuery: "",
      },
    ]);

    expect(facet).toContain("认知:档案已满，理解连接仍断开");
    expect(facet).toContain("理由:断桥比口头解释更容易看见两者的缺口");
    expect(facet).toContain("画面:聊天档案柜与人物之间的桥断开");
    expect(facet).not.toContain("竖屏概念插画");
  });
});

describe("isCardContentTraceable(T-224 同源可溯校验)", () => {
  it("数字不在原文 → 不可溯(一个编造数值即废)", () => {
    expect(isCardContentTraceable("效率提升 47%", SCRIPT)).toBe(true);
    expect(isCardContentTraceable("效率提升 63%", SCRIPT)).toBe(false);
  });
  it("关键词(CJK 4-gram / 拉丁 token)须在原文出现", () => {
    expect(isCardContentTraceable("给模型一个角色", SCRIPT)).toBe(true);
    expect(isCardContentTraceable("量子计算加速推理", SCRIPT)).toBe(false);
  });
  it("无任何可核锚点(无数字无关键词)→ 剔除(诚实门)", () => {
    expect(isCardContentTraceable("!!", SCRIPT)).toBe(false);
  });
});

describe("auditVideoDecisions(总导演确定性安全检查)", () => {
  it("超过 8 秒且既无卡片也无素材时阻断，避免黑底加角落小人物", () => {
    const issues = auditVideoDecisions({
      scenes: [{ title: "长口播", startSec: 0, endSec: 12, summary: "完整论点" }],
      cards: [],
      broll: [],
      subtitles: srtLines.slice(0, 3).map((line) => ({
        index: line.index,
        startSec: line.startSec,
        endSec: line.endSec,
        zh: line.text,
        en: "",
      })),
      srtLines: srtLines.slice(0, 3),
      inventory: INVENTORY,
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "blocking",
          code: "visual_gap",
          sceneIdx: 0,
        }),
      ]),
    );
  });

  it("时间线完整且长场景有真实素材时通过确定性检查", () => {
    const issues = auditVideoDecisions({
      scenes: [
        { title: "开场", startSec: 0, endSec: 3.5, summary: "开场" },
        { title: "正文", startSec: 3.5, endSec: 15, summary: "正文" },
      ],
      cards: [],
      broll: [
        { sceneIdx: 1, assetId: "asset-1", at: 3.5, durationSec: 11.5 },
      ],
      subtitles: srtLines.map((line) => ({
        index: line.index,
        startSec: line.startSec,
        endSec: line.endSec,
        zh: line.text,
        en: "",
      })),
      srtLines,
      inventory: INVENTORY,
    });
    expect(issues).toEqual([]);
  });

  it("18 秒场景只有开头一张小卡仍然阻断，卡片数量不等于时间线覆盖", () => {
    const longSrt = parseSrt(`1
00:00:00,000 --> 00:00:06,000
第一段先讲清楚问题

2
00:00:06,000 --> 00:00:12,000
第二段补充解决方法

3
00:00:12,000 --> 00:00:18,000
第三段给出最终结论
`);
    const issues = auditVideoDecisions({
      scenes: [{ title: "完整论点", startSec: 0, endSec: 18, summary: "三段论证" }],
      cards: [{ sceneIdx: 0, kind: "quote", content: "第一段先讲清楚问题", at: 0 }],
      broll: [],
      subtitles: longSrt.map((line) => ({
        index: line.index,
        startSec: line.startSec,
        endSec: line.endSec,
        zh: line.text,
        en: "",
      })),
      srtLines: longSrt,
      inventory: INVENTORY,
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "visual_gap", sceneIdx: 0 }),
      ]),
    );
    expect(issues.find((issue) => issue.code === "visual_gap")?.message).toContain(
      "连续视觉空档",
    );
  });

  it("同一素材跨场景复用或同秒叠放多个主视觉都会阻断", () => {
    const issues = auditVideoDecisions({
      scenes: [
        { title: "开场", startSec: 0, endSec: 3.5, summary: "开场" },
        { title: "正文", startSec: 3.5, endSec: 15, summary: "正文" },
      ],
      cards: [],
      broll: [
        { sceneIdx: 0, assetId: "asset-1", at: 0, durationSec: 3.5 },
        { sceneIdx: 1, assetId: "asset-1", at: 3.5, durationSec: 4 },
        { sceneIdx: 1, assetId: "asset-2", at: 3.5, durationSec: 4 },
      ],
      subtitles: srtLines.map((line) => ({
        index: line.index,
        startSec: line.startSec,
        endSec: line.endSec,
        zh: line.text,
        en: "",
      })),
      srtLines,
      inventory: INVENTORY,
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "material_conflict", severity: "blocking" }),
        expect.objectContaining({ code: "timing_conflict", severity: "blocking" }),
      ]),
    );
  });
});

describe("normalizeBrollTimeline(素材唯一 + 主视觉不重叠)", () => {
  it("保留首次素材使用、移除同秒候选，并在下一主视觉进场时截断上一项", () => {
    const scenes: VideoScene[] = [
      { title: "正文", startSec: 0, endSec: 12, summary: "正文" },
    ];
    const result = normalizeBrollTimeline({
      scenes,
      broll: [
        { sceneIdx: 0, assetId: "asset-1", at: 0, durationSec: 8 },
        { sceneIdx: 0, assetId: "asset-2", at: 0, durationSec: 4 },
        { sceneIdx: 0, assetId: "asset-3", at: 4, durationSec: 4 },
        { sceneIdx: 0, assetId: "asset-1", at: 8, durationSec: 4 },
      ],
    });

    expect(result.broll).toEqual([
      expect.objectContaining({ assetId: "asset-1", at: 0, durationSec: 4 }),
      expect.objectContaining({ assetId: "asset-3", at: 4, durationSec: 4 }),
    ]);
    expect(result.repairs.join("；")).toMatch(/重复素材/);
    expect(result.repairs.join("；")).toMatch(/互斥主视觉/);
    expect(result.repairs.join("；")).toMatch(/重叠时间/);
  });

  it("overlay 穿插在两个主视觉之间时仍能修复主视觉重叠", () => {
    const result = normalizeBrollTimeline({
      scenes: [{ title: "正文", startSec: 0, endSec: 12, summary: "正文" }],
      broll: [
        { sceneIdx: 0, assetId: "asset-1", at: 0, durationSec: 8 },
        {
          sceneIdx: 0,
          assetId: "asset-overlay",
          at: 2,
          durationSec: 2,
          presentation: "overlay",
        },
        { sceneIdx: 0, assetId: "asset-2", at: 4, durationSec: 4 },
      ],
    });

    expect(result.broll).toEqual([
      expect.objectContaining({ assetId: "asset-1", durationSec: 4 }),
      expect.objectContaining({ assetId: "asset-overlay", presentation: "overlay" }),
      expect.objectContaining({ assetId: "asset-2", at: 4 }),
    ]);
  });
});

describe("autoRepairVideoDecisions(总导演内部修片)", () => {
  it("保留已绑定素材，并用口播原文信息卡自动补齐长场景空档", () => {
    const repaired = autoRepairVideoDecisions({
      scenes: [{ title: "完整论点", startSec: 0, endSec: 15, summary: "完整论点" }],
      cards: [],
      broll: [
        { sceneIdx: 0, assetId: "asset-1", at: 0, durationSec: 3 },
      ],
      subtitles: srtLines.map((line) => ({
        index: line.index,
        startSec: line.startSec,
        endSec: line.endSec,
        zh: line.text,
        en: "",
      })),
      srtLines,
      inventory: INVENTORY,
      issues: [
        {
          sceneIdx: 0,
          severity: "blocking",
          code: "narrative_gap",
          message: "尾段需要视觉接力",
        },
      ],
    });

    expect(repaired.broll).toEqual([
      expect.objectContaining({ assetId: "asset-1", sceneIdx: 0 }),
    ]);
    expect(repaired.cards.length).toBeGreaterThan(0);
    expect(
      repaired.cards.every((card) =>
        card.content
          .split("、")
          .map((part) => part.replace(/…$/, ""))
          .filter(Boolean)
          .every((part) => SCRIPT.includes(part)),
      ),
    ).toBe(true);
    expect(
      auditVideoDecisions({
        scenes: [{ title: "完整论点", startSec: 0, endSec: 15, summary: "完整论点" }],
        cards: repaired.cards,
        broll: repaired.broll,
        subtitles: repaired.subtitles,
        srtLines,
        inventory: INVENTORY,
      }),
    ).toEqual([]);
  });

  it("总导演判定承接不足时也不把已确认的全屏录屏统一截成 4 秒", () => {
    const repaired = autoRepairVideoDecisions({
      scenes: [{ title: "操作演示", startSec: 0, endSec: 12, summary: "看清完整步骤" }],
      cards: [],
      broll: [
        {
          sceneIdx: 0,
          assetId: "screen-long",
          at: 0,
          durationSec: 10,
          visualRole: "screen_recording",
          presentation: "full_frame",
        },
      ],
      subtitles: srtLines.map((line) => ({
        index: line.index,
        startSec: line.startSec,
        endSec: line.endSec,
        zh: line.text,
        en: "",
      })),
      srtLines,
      inventory: [
        {
          assetId: "screen-long",
          label: "操作过程",
          description: "连续操作录屏",
          kind: "video",
          durationMs: 12_000,
        },
      ],
      issues: [
        {
          sceneIdx: 0,
          severity: "blocking",
          code: "narrative_gap",
          message: "尾段仍需信息卡接力",
        },
      ],
      orientation: "portrait",
    });

    expect(repaired.broll).toEqual([
      expect.objectContaining({
        assetId: "screen-long",
        durationSec: 12,
        visualRole: "screen_recording",
        presentation: "full_frame",
      }),
    ]);
    expect(repaired.repairs.join("；")).toMatch(/竖屏录屏已延长为本段连续主视觉/);
    expect(repaired.repairs.join("；")).toMatch(/录屏主视觉已保留可读时长/);
  });

  it("20 秒空镜会自动生成多个不同时间点的信息节拍，修后不再留下长空档", () => {
    const longSrt = parseSrt(`1
00:00:00,000 --> 00:00:04,000
先把最重要的问题说清楚

2
00:00:04,000 --> 00:00:08,000
接着列出第一步和第二步

3
00:00:08,000 --> 00:00:12,000
效率从两小时压到十分钟

4
00:00:12,000 --> 00:00:16,000
然后展示前后 3 个关键差别

5
00:00:16,000 --> 00:00:20,000
最后给出可以执行的结论
`);
    const repaired = autoRepairVideoDecisions({
      scenes: [{ title: "完整方法", startSec: 0, endSec: 20, summary: "方法与结果" }],
      cards: [],
      broll: [],
      subtitles: longSrt.map((line) => ({
        index: line.index,
        startSec: line.startSec,
        endSec: line.endSec,
        zh: line.text,
        en: "",
      })),
      srtLines: longSrt,
      inventory: INVENTORY,
      issues: [
        {
          sceneIdx: 0,
          severity: "blocking",
          code: "visual_gap",
          message: "整场缺少连续视觉承接",
        },
      ],
    });

    expect(repaired.cards.length).toBeGreaterThanOrEqual(3);
    expect(new Set(repaired.cards.map((card) => card.at)).size).toBe(
      repaired.cards.length,
    );
    expect(
      auditVideoDecisions({
        scenes: [{ title: "完整方法", startSec: 0, endSec: 20, summary: "方法与结果" }],
        cards: repaired.cards,
        broll: [],
        subtitles: repaired.subtitles,
        srtLines: longSrt,
        inventory: INVENTORY,
      }),
    ).toEqual([]);
  });

  it.each([
    { durationSec: 10, expectedBeats: 2 },
    { durationSec: 18, expectedBeats: 3 },
    { durationSec: 28, expectedBeats: 4 },
  ])(
    "$durationSec 秒无真实素材场景至少形成 $expectedBeats 个连续信息节拍",
    ({ durationSec, expectedBeats }) => {
      const generatedSrt = Array.from(
        { length: Math.ceil(durationSec / 2) },
        (_, index) => {
          const start = index * 2;
          const end = Math.min(durationSec, start + 2);
          const time = (value: number) =>
            `00:00:${String(value).padStart(2, "0")},000`;
          return `${index + 1}\n${time(start)} --> ${time(end)}\n第 ${
            index + 1
          } 个当前口播信息点`;
        },
      ).join("\n\n");
      const durationSrt = parseSrt(generatedSrt);
      const scene: VideoScene = {
        title: "连续信息表达",
        startSec: 0,
        endSec: durationSec,
        summary: "按当前口播形成连续信息节拍",
      };
      const repaired = autoRepairVideoDecisions({
        scenes: [scene],
        cards: [],
        broll: [],
        subtitles: durationSrt.map((line) => ({
          index: line.index,
          startSec: line.startSec,
          endSec: line.endSec,
          zh: line.text,
          en: "",
        })),
        srtLines: durationSrt,
        inventory: INVENTORY,
      });

      expect(repaired.cards.length).toBeGreaterThanOrEqual(expectedBeats);
      expect(new Set(repaired.cards.map((card) => card.at)).size).toBe(
        repaired.cards.length,
      );
      expect(
        auditVideoDecisions({
          scenes: [scene],
          cards: repaired.cards,
          broll: repaired.broll,
          subtitles: repaired.subtitles,
          srtLines: durationSrt,
          inventory: INVENTORY,
        }),
      ).toEqual([]);
    },
  );

  it("同一真实素材误绑多个场景时只保留首次使用，后续场景由信息卡补位", () => {
    const scenes: VideoScene[] = [
      { title: "第一步", startSec: 0, endSec: 8, summary: "先选题" },
      { title: "第二步", startSec: 8, endSec: 15, summary: "再写稿" },
    ];
    const repaired = autoRepairVideoDecisions({
      scenes,
      cards: [],
      broll: [
        { sceneIdx: 0, assetId: "asset-1", at: 0, durationSec: 4 },
        { sceneIdx: 1, assetId: "asset-1", at: 8, durationSec: 4 },
      ],
      subtitles: srtLines.map((line) => ({
        index: line.index,
        startSec: line.startSec,
        endSec: line.endSec,
        zh: line.text,
        en: "",
      })),
      srtLines,
      inventory: INVENTORY,
      issues: [
        {
          sceneIdx: 1,
          severity: "blocking",
          code: "narrative_gap",
          message: "系统在当前方案内自动补位",
        },
      ],
    });

    expect(repaired.broll).toEqual([
      expect.objectContaining({ assetId: "asset-1", sceneIdx: 0 }),
    ]);
    expect(repaired.repairs.join("；")).toMatch(/重复素材/);
    expect(repaired.cards.some((card) => card.sceneIdx === 1)).toBe(true);
  });
});

describe("closeDirectorReview(修完再通过)", () => {
  it("两轮复审仍重复提出主观修正时结束循环，保留当前分镜并交付已闭合方案", async () => {
    const call = vi.fn(async <T>() => ({
      verdict: "revise",
      summary: "仍有未落实修正。",
      issues: [
        {
          sceneIdx: 0,
          severity: "blocking",
          code: "narrative_gap",
          message: "当前画面仍未承接口播。",
        },
      ],
    }) as T) as unknown as StructuredCall;

    const result = await closeDirectorReview(
        {
          scenes: [
            { title: "完整论点", startSec: 0, endSec: 15, summary: "完整论点" },
          ],
          cards: [],
          visualSlots: [],
          broll: [
            { sceneIdx: 0, assetId: "asset-1", at: 0, durationSec: 3 },
          ],
          subtitles: srtLines.map((line) => ({
            index: line.index,
            startSec: line.startSec,
            endSec: line.endSec,
            zh: line.text,
            en: "",
          })),
          srtLines,
          script: SCRIPT,
          inventory: INVENTORY,
        },
        call,
      );

    expect(call).toHaveBeenCalledTimes(3);
    expect(result.directorReview).toEqual(
      expect.objectContaining({
        status: "ready",
        source: "auto_repaired",
        issues: [],
      }),
    );
    expect(result.broll).toEqual([
      expect.objectContaining({ assetId: "asset-1", sceneIdx: 0 }),
    ]);
    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.repairs.join("；")).toMatch(/终止重复审片建议循环/);
  });
});

describe("decideScenes(吸附与推导)", () => {
  it("边界吸附最近 SRT 行 start;endSec 一律推导;首场对齐首行", async () => {
    const call = fakeCall({
      "video.scenes": {
        scenes: [
          { title: "开场", startSec: 0.4, endSec: 2, summary: "钩子" }, // 0.4 → 0
          { title: "正文", startSec: 4.2, endSec: 9, summary: "技巧" }, // 4.2 → 3.5
          { title: "结尾", startSec: 11.3, endSec: 14, summary: "CTA" }, // 11.3 → 12
        ],
      },
    });
    const scenes = await decideScenes({ srtLines, script: SCRIPT }, call);
    expect(scenes.map((s) => s.startSec)).toEqual([0, 3.5, 12]);
    expect(scenes.map((s) => s.endSec)).toEqual([3.5, 12, 15]); // 推导,不信模型
    expect(scenes[0]!.title).toBe("大家好,今天讲三个提示词技巧…");
    expect(scenes.map((s) => s.title)).not.toContain("开场");
  });

  it("吸附后撞到同一 start 的场景去重", async () => {
    const call = fakeCall({
      "video.scenes": {
        scenes: [
          { title: "a", startSec: 0, endSec: 3, summary: "" },
          { title: "b", startSec: 3.4, endSec: 8, summary: "" }, // → 3.5
          { title: "c", startSec: 3.6, endSec: 12, summary: "" }, // → 3.5 重复,去掉
        ],
      },
    });
    const scenes = await decideScenes({ srtLines, script: SCRIPT }, call);
    expect(scenes).toHaveLength(2);
  });
});

const SCENES: VideoScene[] = [
  { title: "开场", startSec: 0, endSec: 3.5, summary: "钩子" },
  { title: "正文", startSec: 3.5, endSec: 12, summary: "技巧" },
  { title: "结尾", startSec: 12, endSec: 15, summary: "CTA" },
];

describe("decideCards(吸附 + 可溯剔除)", () => {
  it("分场与信息卡属于长结构任务，显式使用有上界的 120 秒节点时限", async () => {
    const seen: Array<{ skillId: string; timeoutMs?: number }> = [];
    const call = vi.fn(async <T>(input: StructuredCallInput<T>) => {
      seen.push({ skillId: input.skillId, timeoutMs: input.timeoutMs });
      if (input.skillId === "video.scenes") {
        return {
          scenes: [{ title: "全文", startSec: 0, endSec: 15, summary: "要点" }],
        } as T;
      }
      return { cards: [] } as T;
    }) as unknown as StructuredCall;

    const scenes = await decideScenes({ srtLines, script: SCRIPT }, call);
    await decideCards({ scenes, srtLines, script: SCRIPT }, call);

    expect(seen).toEqual([
      { skillId: "video.scenes", timeoutMs: 120_000 },
      { skillId: "video.cards", timeoutMs: 120_000 },
    ]);
  });

  it("编造数值的卡被剔除;合法卡 at 吸附到场景内 SRT 行 start", async () => {
    const call = fakeCall({
      "video.cards": {
        cards: [
          { sceneIdx: 0, kind: "stat", content: "效率提升 47%", at: 0.8 }, // → 0
          { sceneIdx: 0, kind: "stat", content: "效率提升 63%", at: 0 }, // 编造 → 剔除
          { sceneIdx: 1, kind: "quote", content: "给模型一个角色", at: 4.7 }, // → 3.5
        ],
      },
    });
    const cards = await decideCards({ scenes: SCENES, srtLines, script: SCRIPT }, call);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ kind: "stat", at: 0 });
    expect(cards[1]).toMatchObject({ kind: "quote", at: 3.5 });
  });

  it("at 吸附不越场:卡属场景 2(12-15s),模型给 11.9 → 吸到场内 12 而非邻场 8", async () => {
    const call = fakeCall({
      "video.cards": {
        cards: [{ sceneIdx: 2, kind: "list", content: "点赞关注", at: 11.9 }],
      },
    });
    const cards = await decideCards({ scenes: SCENES, srtLines, script: SCRIPT }, call);
    expect(cards[0]!.at).toBe(12);
  });

  it("visualPlan 的 role 结构和每个部件都合法可溯才透传；坏计划只降级计划，不误删合法旧卡", async () => {
    const call = fakeCall({
      "video.cards": {
        cards: [
          {
            sceneIdx: 1,
            kind: "list",
            content: "给模型一个角色",
            at: 3.5,
            visualPlan: {
              relation: "sequence",
              parts: [
                { text: "给模型", role: "step" },
                { text: "一个角色", role: "step" },
              ],
            },
          },
          {
            sceneIdx: 0,
            kind: "stat",
            content: "效率提升 47%",
            at: 0,
            visualPlan: {
              relation: "magnitude",
              parts: [{ text: "效率提升 99%", role: "measure" }],
            },
          },
          {
            sceneIdx: 1,
            kind: "list",
            content: "给模型一个角色",
            at: 3.5,
            visualPlan: {
              relation: "sequence",
              parts: [{ text: "给模型一个角色", role: "claim" }],
            },
          },
        ],
      },
    });

    const cards = await decideCards({ scenes: SCENES, srtLines, script: SCRIPT }, call);
    expect(cards[0]?.visualPlan).toMatchObject({ relation: "sequence" });
    expect(cards[1]).toMatchObject({ kind: "stat", content: "效率提升 47%" });
    expect(cards[1]?.visualPlan).toBeUndefined();
    expect(cards[2]).toMatchObject({ content: "给模型一个角色" });
    expect(cards[2]?.visualPlan).toBeUndefined();
  });

  it("[T-802 RED] part 必须是完整原文子串，真实短片段后追加新主张仍丢计划", async () => {
    const call = fakeCall({
      "video.cards": {
        cards: [
          {
            sceneIdx: 1,
            kind: "quote",
            content: "给模型一个角色",
            at: 3.5,
            visualPlan: {
              relation: "statement",
              parts: [{ text: "给模型一个角色就一定能爆款", role: "claim" }],
            },
          },
        ],
      },
    });

    const cards = await decideCards({ scenes: SCENES, srtLines, script: SCRIPT }, call);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ content: "给模型一个角色" });
    expect(cards[0]?.visualPlan).toBeUndefined();
  });

  it("Scene Graph 引用、唯一角色和动作属性不合时整段计划降级，合法计划完整透传", async () => {
    const baseScene = {
      cognitiveGoal: "看见提示词进入模型",
      layout: "flow" as const,
      aspectStrategy: "reflow" as const,
      entities: [
        { id: "prompt", kind: "document" as const, glyph: "document" as const, semantic: "提示词", textRole: "step" as const },
        { id: "model", kind: "device" as const, glyph: "feature" as const, semantic: "模型" },
      ],
      beats: [
        { action: "move" as const, target: "prompt", start: 0, duration: 0.5, from: { x: -0.6 }, to: { x: 0.3 } },
      ],
    };
    const call = fakeCall({
      "video.cards": {
        cards: [
          {
            sceneIdx: 1,
            kind: "list",
            content: "给模型一个角色",
            at: 3.5,
            visualPlan: {
              relation: "sequence",
              parts: [
                { text: "给模型", role: "step" },
                { text: "一个角色", role: "step" },
              ],
              scene: baseScene,
            },
          },
          {
            sceneIdx: 1,
            kind: "list",
            content: "给模型一个角色",
            at: 3.5,
            visualPlan: {
              relation: "sequence",
              parts: [
                { text: "给模型", role: "step" },
                { text: "一个角色", role: "step" },
              ],
              scene: {
                ...baseScene,
                entities: baseScene.entities.map((entity) => ({ ...entity, textRole: undefined })),
                beats: [{ ...baseScene.beats[0], target: "missing" }],
              },
            },
          },
        ],
      },
    });
    const cards = await decideCards({ scenes: SCENES, srtLines, script: SCRIPT }, call);
    // 第一稿 textRole 指向重复的 step，按协议不能唯一绑定，也应降级。
    expect(cards[0]?.visualPlan).toBeUndefined();
    expect(cards[1]?.visualPlan).toBeUndefined();
  });
});

const INVENTORY: BrollAssetRef[] = [
  { assetId: "asset-1", label: "提示词界面录屏", kind: "video", description: "ChatGPT 输入框特写" },
  { assetId: "asset-2", label: "角色扮演示意图", kind: "image", description: "" },
];

describe("decideBroll(清单硬门)", () => {
  it("标准版项目没有素材时仍把诚实空清单喂给 B-roll Skill，并生成画面需求", async () => {
    const call = vi.fn(async <T>(input: StructuredCallInput<T>) => {
      expect(input.skillId).toBe("video.broll");
      expect(input.facets.library).toContain("当前项目没有可用素材");
      return {
        slots: [
          {
            sceneIdx: 0,
            at: 0,
            purpose: "process",
            spokenAnchor: "三个提示词技巧",
            visualBrief: "展示真实操作过程",
            searchQuery: "提示词操作界面",
          },
        ],
        broll: [],
      } as T;
    }) as unknown as StructuredCall;

    const result = await decideBroll(
      {
        scenes: SCENES,
        srtLines,
        script: SCRIPT,
        inventory: [],
      },
      call,
    );

    expect(result.slots).toHaveLength(1);
    expect(result.broll).toEqual([]);
  });

  it("video.broll 即使违约返回真实素材，也只保留画面需求，素材选择统一交给 material.match", async () => {
    const result = await decideBroll(
      {
        scenes: SCENES,
        srtLines,
        script: SCRIPT,
        inventory: INVENTORY,
      },
      fakeCall({
        "video.broll": {
          slots: [
            {
              sceneIdx: 0,
              at: 0,
              purpose: "process",
              spokenAnchor: "三个提示词技巧",
              visualBrief: "展示真实操作过程",
              searchQuery: "",
            },
          ],
          broll: [
            {
              sceneIdx: 0,
              assetId: "asset-1",
              at: 0,
              durationSec: 4,
            },
          ],
        },
      }),
    );

    expect(result.slots).toHaveLength(1);
    expect(result.broll).toEqual([]);
  });

  it("T-712 由 material.match AI Skill 给出素材与场景映射，代码只校验和吸附时间", async () => {
    const call = vi.fn(async <T>(input: StructuredCallInput<T>) => {
      expect(input.skillId).toBe("material.match");
      expect(input.facets.library).toContain("用户手动上传");
      expect(input.facets.visualSlots).toContain("项目选题页面录屏");
      return {
        matches: [
          {
            assetId: "topic-video",
            role: "clip",
            reason: "AI 判断它与选题操作过程对应",
            sceneIdx: 0,
            at: 0.7,
            durationSec: 5,
            presentation: "full_frame",
            visualRole: "screen_recording",
          },
        ],
      } as T;
    }) as unknown as StructuredCall;
    const result = await decideMaterialBroll(
      {
        scenes: SCENES,
        srtLines,
        script: SCRIPT,
        inventory: [
          {
            assetId: "topic-video",
            label: "用户自定义文件.mov",
            kind: "video",
            description: "真实操作录屏",
            source: "manual",
          },
        ],
        visualSlots: [
          {
            sceneIdx: 0,
            at: 0,
            purpose: "process",
            spokenAnchor: "三个提示词技巧",
            visualBrief: "项目选题页面录屏",
            searchQuery: "",
          },
        ],
      },
      call,
    );
    expect(result).toEqual([
      {
        sceneIdx: 0,
        assetId: "topic-video",
        at: 0,
        durationSec: 3.5,
        presentation: "full_frame",
        visualRole: "screen_recording",
        motion: "static",
      },
    ]);
  });

  it("material.match 编造 id、封面或越界场景会被动态 schema 拒绝", () => {
    const schema = buildVideoMaterialMatchSchema(["real"], 2);
    expect(
      schema.safeParse({
        matches: [{ assetId: "real", role: "clip", reason: "", sceneIdx: 1, visualRole: "still_image" }],
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        matches: [{ assetId: "fake", role: "clip", reason: "", sceneIdx: 1, visualRole: "still_image" }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        matches: [{ assetId: "real", role: "cover", reason: "", sceneIdx: 0, visualRole: "cover" }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        matches: [
          {
            assetId: "real",
            role: "clip",
            reason: "静态配图不得全屏",
            sceneIdx: 0,
            visualRole: "still_image",
            presentation: "full_frame",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("material.match 一条违约映射不会拖垮同批合法素材", () => {
    const schema = buildVideoMaterialMatchSchema(["screen", "still"], 2);
    const parsed = schema.safeParse({
      matches: [
        {
          assetId: "screen",
          role: "clip",
          reason: "真实操作录屏",
          sceneIdx: 0,
          visualRole: "screen_recording",
          presentation: "full_frame",
        },
        {
          assetId: "missing",
          role: "clip",
          reason: "模型编造的素材",
          sceneIdx: 1,
          visualRole: "still_image",
          presentation: "large_stage",
        },
        {
          assetId: "still",
          role: "cover",
          reason: "封面不应进入时间线",
          sceneIdx: 1,
          visualRole: "cover",
          presentation: "large_stage",
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;
    expect(parsed.data.matches).toEqual([
      expect.objectContaining({ assetId: "screen", sceneIdx: 0 }),
    ]);
  });

  it("authored 分镜点名的录屏即使模型漏选，也会按同序场景确定性进入时间线", () => {
    const result = enforceStoryboardBroll({
      storyboard: [
        { narration: "开场", visualDescription: "展示后台", assetRefs: ["screen-1"] },
        { narration: "结尾", visualDescription: "回到人物", assetRefs: [] },
      ],
      scenes: SCENES.slice(0, 2),
      srtLines,
      inventory: [
        { assetId: "screen-1", label: "真实录屏", kind: "video", description: "" },
      ],
      excludedAssetIds: new Set(),
      modelBroll: [],
    });
    expect(result.broll).toEqual([
      expect.objectContaining({ sceneIdx: 0, assetId: "screen-1", at: 0 }),
    ]);
    expect(result.unusedStoryboardAssets).toEqual([]);
  });

  it("分镜点名多个候选时不能把它们全塞进同一秒，已有 AI 主视觉时也不追加", () => {
    const result = enforceStoryboardBroll({
      storyboard: [
        {
          narration: "开场",
          visualDescription: "从两个真实候选中择一",
          assetRefs: ["screen-1", "screen-2"],
        },
      ],
      scenes: [SCENES[0]!],
      srtLines,
      inventory: [
        { assetId: "screen-1", label: "录屏一", kind: "video", description: "" },
        { assetId: "screen-2", label: "录屏二", kind: "video", description: "" },
        { assetId: "screen-ai", label: "AI 已选录屏", kind: "video", description: "" },
      ],
      excludedAssetIds: new Set(),
      modelBroll: [
        { sceneIdx: 0, assetId: "screen-ai", at: 0, durationSec: 3.5 },
      ],
    });

    expect(result.broll).toEqual([
      expect.objectContaining({ assetId: "screen-ai", sceneIdx: 0 }),
    ]);
  });

  it("同一 authored 素材被多段重复引用时只进入首次场景", () => {
    const result = enforceStoryboardBroll({
      storyboard: [
        { narration: "开场", visualDescription: "同一素材", assetRefs: ["screen-1"] },
        { narration: "正文", visualDescription: "重复引用", assetRefs: ["screen-1"] },
      ],
      scenes: SCENES.slice(0, 2),
      srtLines,
      inventory: [
        { assetId: "screen-1", label: "真实录屏", kind: "video", description: "" },
      ],
      excludedAssetIds: new Set(),
      modelBroll: [],
    });

    expect(result.broll).toEqual([
      expect.objectContaining({ assetId: "screen-1", sceneIdx: 0 }),
    ]);
  });

  it("video.broll 不再直接采用清单内/外 assetId，真实选料只走 material.match", async () => {
    const call = fakeCall({
      "video.broll": {
        broll: [
          { sceneIdx: 1, assetId: "asset-2", at: 4.9, durationSec: 30 }, // at→3.5? 4.9离3.5=1.4,离8=3.1 → 3.5;dur 钳 ≤ 12-3.5
          { sceneIdx: 1, assetId: "asset-hallucinated", at: 4, durationSec: 3 }, // 剔除
        ],
      },
    });
    const result = await decideBroll(
      { scenes: SCENES, srtLines, script: SCRIPT, inventory: INVENTORY },
      call,
    );
    expect(result.broll).toEqual([]);
  });

  it("素材清单为空 → 仍生成可执行的联想画面需求，但不编造已存在素材", async () => {
    const call = vi.fn(async () => ({
      slots: [
        {
          sceneIdx: 0,
          at: 0,
          purpose: "fact_evidence",
          spokenAnchor: "效率提升 47%",
          visualBrief: "真实效率对比数据界面，突出 47% 差异",
          searchQuery: "AI 提示词 效率 对比 数据",
        },
      ],
      broll: [],
    })) as unknown as StructuredCall;
    const result = await decideBroll(
      { scenes: SCENES, srtLines, script: SCRIPT, inventory: [] },
      call,
    );
    expect(result.broll).toEqual([]);
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]).toMatchObject({
      purpose: "fact_evidence",
      spokenAnchor: "效率提升 47%",
    });
    expect(call).toHaveBeenCalledOnce();
    expect((call as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      skillId: "video.broll",
      facets: expect.objectContaining({ script: expect.stringContaining("效率提升 47%") }),
    });
  });

  it("purpose 的中英文别名在严格 schema 前逐槽归一化，不能整批失败", async () => {
    const aliases = [
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
    const call = vi.fn(async <T>(input: StructuredCallInput<T>) => {
      expect(input.normalizeObject).toBeTypeOf("function");
      const raw = {
        slots: aliases.map((purpose, index) => ({
          sceneIdx: index % SCENES.length,
          at: 0,
          purpose,
          spokenAnchor: `口播原话 ${index}`,
          visualBrief: `具体画面 ${index}`,
          searchQuery: `搜索词 ${index}`,
        })),
        broll: [],
      };
      return input.outputSchema.parse(input.normalizeObject!(raw));
    }) as unknown as StructuredCall;

    const result = await decideBroll(
      { scenes: SCENES, srtLines, script: SCRIPT, inventory: [] },
      call,
    );

    expect(result.slots).toHaveLength(14);
    expect(result.slots.map((slot) => slot.purpose)).toEqual([
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

  it("手动上传来源与语义描述必须进入可观测 prompt，模型能识别用户明确意图", () => {
    const facet = libraryFacet([
      {
        assetId: "asset-manual",
        label: "产品后台录屏.mp4",
        kind: "video",
        description: "展示发布按钮和成功提示",
        source: "manual",
      },
    ]);
    expect(facet).toContain("用户手动上传");
    expect(facet).toContain("产品后台录屏.mp4");
    expect(facet).toContain("展示发布按钮和成功提示");
  });

  it("原始文件名、尺寸与时长进入 AI 选料语义，人工选料成为重分镜硬约束", () => {
    const inventory: BrollAssetRef[] = [
      {
        assetId: "asset-schedule",
        label: "项目排期.mov",
        kind: "video",
        description: "周排期界面录屏",
        source: "manual",
        width: 1170,
        height: 2532,
        durationMs: 8_400,
      },
    ];
    const library = libraryFacet(inventory);
    expect(library).toContain("项目排期.mov");
    expect(library).toContain("尺寸:1170×2532");
    expect(library).toContain("时长:8.4s");

    const assignments: ManualMaterialAssignment[] = [
      {
        assetId: "asset-schedule",
        sceneIdx: 1,
        sceneTitle: "第三步排期",
        sceneSummary: "根据互动曲线安排发布时间",
      },
    ];
    const brief = manualAssignmentsFacet(assignments, inventory);
    expect(brief).toContain("原始文件名:项目排期.mov");
    expect(brief).toContain("重新计算场景边界");
    expect(brief).toContain("不得遗漏、替换或机械截成固定时长");
  });
});

describe("enforceManualMaterialAssignments(人工选料不丢失)", () => {
  it("模型遗漏时保留用户选的真实素材，使用素材真实时长而非固定 4 秒", () => {
    const result = enforceManualMaterialAssignments({
      assignments: [
        {
          assetId: "asset-manual",
          sceneIdx: 1,
          sceneTitle: "角色技巧",
          sceneSummary: "给模型一个角色",
        },
      ],
      scenes: SCENES,
      srtLines,
      inventory: [
        {
          assetId: "asset-manual",
          label: "角色设置录屏.mov",
          kind: "video",
          description: "",
          durationMs: 7_200,
        },
      ],
      modelBroll: [],
    });
    expect(result).toEqual([
      expect.objectContaining({
        assetId: "asset-manual",
        sceneIdx: 1,
        at: 3.5,
        durationSec: 7.2,
        presentation: "large_stage",
      }),
    ]);
  });

  it("人工指定的场景覆盖 AI 的旧场景，不能因为资产已出现就沿用错误位置", () => {
    const result = enforceManualMaterialAssignments({
      assignments: [
        {
          assetId: "asset-manual",
          sceneIdx: 1,
          sceneTitle: "第二步写稿",
          sceneSummary: "写稿界面录屏",
        },
      ],
      scenes: SCENES,
      srtLines,
      inventory: [
        {
          assetId: "asset-manual",
          label: "项目制作.mov",
          kind: "video",
          description: "写稿界面录屏",
          durationMs: 7_200,
        },
      ],
      modelBroll: [
        { sceneIdx: 0, assetId: "asset-manual", at: 0, durationSec: 3.5 },
      ],
    });

    expect(result).toEqual([
      expect.objectContaining({ assetId: "asset-manual", sceneIdx: 1, at: 3.5 }),
    ]);
  });
});

describe("collectProjectBrollInventory(项目/账号边界 + 上传链投影)", () => {
  it("先校验当前账号的项目所有权，只读取该项目 links，并过滤越权/非视觉素材", async () => {
    const order: string[] = [];
    const assertProjectAccess = vi.fn(async (_ctx, projectId: string) => {
      order.push(`project:${projectId}`);
    });
    const listProjectMaterialLinks = vi.fn(async (_ctx, projectId: string) => {
      order.push(`links:${projectId}`);
      return [
        { entityType: "asset", entityId: "manual", role: "broll" },
        { entityType: "asset", entityId: "rough-clip", role: "clip" },
        { entityType: "asset", entityId: "legacy-image", role: "clip" },
        { entityType: "asset", entityId: "project-cover", role: "cover" },
        { entityType: "asset", entityId: "foreign", role: "reference" },
        { entityType: "asset", entityId: "doc", role: "reference" },
      ];
    });
    const getAsset = vi.fn(async (_ctx, assetId: string) => {
      if (assetId === "foreign") throw new Error("cross-account hidden");
      if (assetId === "doc") {
        return { id: assetId, name: "资料.pdf", assetType: "document", description: "" };
      }
      if (assetId === "legacy-image") {
        return {
          id: assetId,
          name: "已采纳的 AI 截图",
          assetType: "image",
          description: "作为制作阶段画面",
        };
      }
      return {
        id: assetId,
        name: "制作页手动上传录屏",
        assetType: "video",
        description: "展示产品操作",
      };
    });
    const result = await collectProjectBrollInventory(ctx, "proj-1", {
      assertProjectAccess,
      listProjectMaterialLinks,
      getAsset,
      readArtifactContentData: async () => null,
    });
    expect(order.slice(0, 2)).toEqual(["project:proj-1", "links:proj-1"]);
    expect(listProjectMaterialLinks).toHaveBeenCalledWith(ctx, "proj-1");
    expect(getAsset).toHaveBeenCalledWith(ctx, "rough-clip");
    expect(getAsset).not.toHaveBeenCalledWith(ctx, "project-cover");
    expect(result).toEqual([
      {
        assetId: "manual",
        label: "制作页手动上传录屏",
        kind: "video",
        description: "展示产品操作",
        source: "manual",
      },
      {
        assetId: "legacy-image",
        label: "已采纳的 AI 截图",
        kind: "image",
        description: "作为制作阶段画面",
        source: "ammo",
      },
    ]);
  });

  it("[T-739] 脚本点名只能提升当前项目已挂载素材的优先级，绝不跨项目取素材", async () => {
    const readArtifactContentData = vi.fn(async (
      _ctx: RequestContext,
      _projectId: string,
      artifactType: "output_script" | "thesis_tree",
    ) => {
      if (artifactType === "thesis_tree") {
        return {
          nodes: [{ materialRefs: [{ id: "thesis-only" }, { id: "shared" }] }],
        };
      }
      return {
        sections: [
          {
            heading: "演示",
            body: "口播：展示产品",
            visual: {
              description: "产品录屏",
              assetRefs: ["script-only", "shared"],
              missing: [],
            },
          },
        ],
      };
    });
    const getAsset = vi.fn(async (_ctx, assetId: string) => ({
      id: assetId,
      name: assetId,
      assetType: "image",
      description: "",
    }));

    const result = await collectProjectBrollInventory(ctx, "proj-retired-thesis", {
      assertProjectAccess: vi.fn(async () => undefined),
      listProjectMaterialLinks: vi.fn(async () => [
        { entityType: "asset", entityId: "shared", role: "reference" },
        { entityType: "asset", entityId: "ammo-only", role: "reference" },
      ]),
      getAsset,
      readArtifactContentData,
    });

    expect(readArtifactContentData).toHaveBeenCalledTimes(1);
    expect(readArtifactContentData).toHaveBeenCalledWith(
      ctx,
      "proj-retired-thesis",
      "output_script",
    );
    expect(result).toEqual([
      expect.objectContaining({ assetId: "shared", source: "script" }),
      expect.objectContaining({ assetId: "ammo-only", source: "ammo" }),
    ]);
    expect(getAsset).not.toHaveBeenCalledWith(ctx, "script-only");
    expect(getAsset).not.toHaveBeenCalledWith(ctx, "thesis-only");
  });

  it("[T-739] 当前项目没有挂载素材时，旧脚本即使残留 assetRefs 也必须诚实为空", async () => {
    const getAsset = vi.fn();
    const result = await collectProjectBrollInventory(ctx, "proj-empty", {
      assertProjectAccess: vi.fn(async () => undefined),
      listProjectMaterialLinks: vi.fn(async () => []),
      getAsset,
      readArtifactContentData: vi.fn(async () => ({
        sections: [
          {
            body: "口播：旧项目画面",
            visual: { assetRefs: ["foreign-script-asset"] },
          },
        ],
      })),
    });

    expect(result).toEqual([]);
    expect(getAsset).not.toHaveBeenCalled();
  });

  it("缺 projectId 直接失败，不得回退当前账号整库冒充项目素材", async () => {
    await expect(
      collectProjectBrollInventory(ctx, null, {
        assertProjectAccess: vi.fn(),
        listProjectMaterialLinks: vi.fn(),
        getAsset: vi.fn(),
        readArtifactContentData: vi.fn(),
      }),
    ).rejects.toThrow(/缺少项目范围/);
  });

  it("封面即使被旧脚本 assetRefs 点名也不能进入 B-roll 候选", async () => {
    const getAsset = vi.fn(async (_ctx, assetId: string) => ({
      id: assetId,
      name: assetId === "project-cover" ? "视频封面.png" : "项目选题.mov",
      assetType: assetId === "project-cover" ? "image" : "video",
      description: "",
    }));
    const result = await collectProjectBrollInventory(ctx, "proj-cover", {
      assertProjectAccess: vi.fn(async () => undefined),
      listProjectMaterialLinks: vi.fn(async () => [
        { entityType: "asset", entityId: "project-cover", role: "cover" },
        { entityType: "asset", entityId: "topic-video", role: "broll" },
      ]),
      getAsset,
      readArtifactContentData: vi.fn(async () => ({
        kind: "script",
        sections: [
          {
            narration: "展示选题",
            visualDescription: "选题界面",
            assetRefs: ["project-cover"],
          },
        ],
      })),
    });

    expect(result.map((asset) => asset.assetId)).toEqual(["topic-video"]);
    expect(getAsset).not.toHaveBeenCalledWith(ctx, "project-cover");
  });
});

describe("decideSubtitles(时间轴不变 + 重写守门)", () => {
  it("时间轴一律回填原值;小改字保留;重写(相似度<阈值)退回原文;en 透传", async () => {
    const call = fakeCall({
      "video.subtitles": {
        lines: [
          { index: 1, zh: "大家好,今天讲三个提示词技巧,效率提升 47%", en: "Hi, three prompt tips, +47% efficiency" },
          { index: 2, zh: "第一个技巧是给模型一个角色", en: "Tip 1: give the model a role" },
          { index: 3, zh: "第二个技巧是提供实例", en: "Tip 2: provide examples" }, // 相近但口播稿无依据 → 退回
          { index: 4, zh: "完全跑题的重写句子在此", en: "Like and subscribe" }, // 重写 → 退回原文
        ],
      },
    });
    const lines = await decideSubtitles({ srtLines, script: SCRIPT }, call);
    expect(lines).toHaveLength(4);
    expect(lines.map((l) => [l.startSec, l.endSec])).toEqual(
      srtLines.map((l) => [l.startSec, l.endSec]),
    );
    expect(lines[2]!.zh).toBe("第二个技巧是提供示例");
    expect(lines[3]!.zh).toBe("记得点赞关注"); // 守门退回
    expect(lines[1]!.en).toBe("Tip 1: give the model a role");
  });

  it("只保留能在口播稿找到依据的 ASR 错字校正", async () => {
    const typoLines = [
      { index: 1, startSec: 0, endSec: 2, text: "先把账号定为说清楚" },
    ];
    const call = fakeCall({
      "video.subtitles": {
        lines: [{ index: 1, zh: "先把账号定位说清楚", en: "Clarify the positioning." }],
      },
    });
    const lines = await decideSubtitles(
      { srtLines: typoLines, script: "第一步，先把账号定位说清楚。" },
      call,
    );
    expect(lines[0]).toEqual({
      index: 1,
      startSec: 0,
      endSec: 2,
      zh: "先把账号定位说清楚",
      en: "Clarify the positioning.",
    });
  });

  it("[T-320] 校正基准=口播稿:script 作为 facet 真喂进 video.subtitles skill", async () => {
    let capturedFacets: Record<string, unknown> | undefined;
    const call: StructuredCall = async <T>({
      skillId,
      facets,
    }: {
      skillId: string;
      facets?: Record<string, unknown>;
    }) => {
      if (skillId === "video.subtitles") capturedFacets = facets;
      return {
        lines: srtLines.map((l) => ({ index: l.index, zh: l.text, en: "en" })),
      } as T;
    };
    await decideSubtitles({ srtLines, script: SCRIPT }, call);
    // 口播稿进了 skill 的 script facet(否则=SRT 自我纠错,纠不了「对口播稿的认错字」)。
    expect(capturedFacets?.script).toBe(SCRIPT);
    expect(typeof capturedFacets?.srt).toBe("string");
  });

  it("长视频按固定行数分批，每批 schema 只绑定本批，最终按原 index 顺序归并", async () => {
    const longLines = Array.from({ length: 85 }, (_, i) => ({
      index: i + 1,
      startSec: i,
      endSec: i + 1,
      text: `第 ${i + 1} 行字幕`,
    }));
    const batchSizes: number[] = [];
    const progress = vi.fn();
    const call: StructuredCall = async <T>(
      { facets, outputSchema }: StructuredCallInput<T>,
    ) => {
      const indexes = (facets.srt ?? "")
        .split("\n")
        .map((line) => Number(line.split("|")[0]?.trim()))
        .filter(Number.isFinite);
      batchSizes.push(indexes.length);
      const output = {
        lines: [...indexes]
          .reverse()
          .map((index) => ({ index, zh: `第 ${index} 行字幕`, en: `line ${index}` })),
      };
      expect(outputSchema.safeParse(output).success).toBe(true);
      return output as T;
    };
    const result = await decideSubtitles(
      { srtLines: longLines, script: "全稿校正基准", onChunkProgress: progress },
      call,
    );
    expect(batchSizes).toEqual([36, 36, 13]);
    expect(result.map((line) => line.index)).toEqual(longLines.map((line) => line.index));
    expect(result[84]?.en).toBe("line 85");
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "completed", completed: 3, total: 3 }),
    );
  });

  it("单批失败仅该批退回原 zh/空 en，其余批继续，进度明确标记 fallback", async () => {
    const longLines = Array.from({ length: 75 }, (_, i) => ({
      index: i + 1,
      startSec: i,
      endSec: i + 1,
      text: `原文 ${i + 1}`,
    }));
    let batch = 0;
    const progress = vi.fn();
    const call: StructuredCall = async <T>(
      { facets }: StructuredCallInput<T>,
    ) => {
      batch += 1;
      if (batch === 2) throw new Error("Invalid JSON response");
      const lines = (facets.srt ?? "").split("\n").map((line) => {
        const index = Number(line.split("|")[0]?.trim());
        return { index, zh: `原文 ${index}`, en: `translated ${index}` };
      });
      return { lines } as T;
    };
    const result = await decideSubtitles(
      { srtLines: longLines, script: "全文", onChunkProgress: progress },
      call,
    );
    expect(result).toHaveLength(75);
    expect(result[35]?.en).toBe("translated 36");
    expect(result[36]).toMatchObject({ index: 37, zh: "原文 37", en: "" });
    expect(result[71]).toMatchObject({ index: 72, zh: "原文 72", en: "" });
    expect(result[72]?.en).toBe("translated 73");
    expect(
      progress.mock.calls.some(([event]) => event.status === "fallback" && event.index === 1),
    ).toBe(true);
  });
});

// ── 编排入口 ────────────────────────────────────────────────────────────────

function makeDeps(
  outputs: Record<string, unknown>,
  inventory = INVENTORY,
  runtimeByTask = new Map<string, Record<string, unknown>>(),
) {
  const calls = {
    markRunning: vi.fn(async () => undefined),
    recordStep: vi.fn(async () => undefined),
    recordCandidate: vi.fn(async () => undefined),
    cancelTask: vi.fn(async () => undefined),
    getTaskRuntimeData: vi.fn(async (_ctx: RequestContext, taskId: string) =>
      runtimeByTask.get(taskId) ?? {},
    ),
    putVideoDecisionsCheckpoint: vi.fn(
      async (
        _ctx: RequestContext,
        taskId: string,
        checkpoint: Record<string, unknown>,
      ) => {
        runtimeByTask.set(taskId, {
          ...(runtimeByTask.get(taskId) ?? {}),
          videoDecisionsCheckpoint: checkpoint,
        });
      },
    ),
  };
  const deps: VideoDecisionsDeps = {
    ai: calls,
    resolveModelSpec: async () => {
      throw new Error("单测不该走真模型解析");
    },
    listBrollInventory: async () => inventory,
    callStructured: fakeCall(outputs),
  };
  return { deps, calls };
}

const HAPPY_OUTPUTS: Record<string, unknown> = {
  "video.scenes": SCENES_OK,
  "video.cards": {
    cards: [{ sceneIdx: 0, kind: "stat", content: "效率提升 47%", at: 0 }],
  },
  "video.broll": {
    slots: [],
    broll: [],
  },
  "material.match": {
    matches: [
      {
        assetId: "asset-1",
        role: "clip",
        reason: "与正文操作对应",
        sceneIdx: 1,
        at: 3.5,
        durationSec: 3,
      },
    ],
  },
  "video.subtitles": {
    lines: srtLines.map((l) => ({ index: l.index, zh: l.text, en: "en" })),
  },
  "video.director": {
    verdict: "ready",
    summary: "叙事、素材和时间线完整。",
    issues: [],
  },
};

const TASK = {
  id: "task-1",
  projectId: "proj-1",
  inputData: { srtText: SRT, script: SCRIPT },
};

describe("runVideoDecisions(编排)", () => {
  it("补充选材只局部调用 material.match，冻结既有分场/信息卡/字幕", async () => {
    const baseDecisions = {
      scenes: SCENES_OK.scenes,
      cards: (HAPPY_OUTPUTS["video.cards"] as { cards: unknown[] }).cards,
      visualSlots: [
        {
          sceneIdx: 1,
          at: 3.5,
          purpose: "process",
          spokenAnchor: "给模型一个角色",
          visualBrief: "展示真实操作",
          searchQuery: "",
        },
      ],
      broll: [
        { sceneIdx: 1, assetId: "asset-1", at: 3.5, durationSec: 3 },
      ],
      subtitles: srtLines.map((line) => ({
        index: line.index,
        startSec: line.startSec,
        endSec: line.endSec,
        zh: line.text,
        en: "en",
      })),
      srtLines,
      directorReview: {
        status: "ready",
        summary: "既有方案已通过",
        issues: [],
        source: "ai",
      },
    };
    const { deps, calls } = makeDeps(HAPPY_OUTPUTS);
    const skillCalls: string[] = [];
    const baseCall = fakeCall(HAPPY_OUTPUTS);
    deps.callStructured = async <T>(input: StructuredCallInput<T>) => {
      skillCalls.push(input.skillId);
      return baseCall(input);
    };

    await runVideoDecisions(
      ctx,
      {
        ...TASK,
        inputData: {
          ...TASK.inputData,
          adjustmentMode: "materials",
          baseDecisions,
          manualMaterialAssignments: [
            {
              assetId: "asset-1",
              sceneIdx: 1,
              sceneTitle: "角色技巧",
              sceneSummary: "给模型角色",
            },
          ],
        },
      },
      deps,
    );

    expect(skillCalls).toEqual(["material.match"]);
    expect(calls.recordStep).toHaveBeenCalledTimes(1);
    const [, , result] = calls.recordCandidate.mock.calls[0]! as unknown as [
      unknown,
      string,
      { resultData: { decisions: typeof baseDecisions } },
    ];
    expect(result.resultData.decisions.scenes).toEqual(baseDecisions.scenes);
    expect(result.resultData.decisions.cards).toEqual(baseDecisions.cards);
    expect(result.resultData.decisions.subtitles).toEqual(baseDecisions.subtitles);
  });

  it("五步顺序跑完 → recordCandidate(video_decisions,含总导演结论 + 清单快照)", async () => {
    const { deps, calls } = makeDeps(HAPPY_OUTPUTS);
    await runVideoDecisions(ctx, TASK, deps);
    expect(calls.markRunning).toHaveBeenCalledWith(ctx, "task-1");
    expect(calls.cancelTask).not.toHaveBeenCalled();
    expect(calls.recordStep).toHaveBeenCalledTimes(5);
    expect(calls.recordCandidate).toHaveBeenCalledTimes(1);
    const [, , result] = calls.recordCandidate.mock.calls[0]! as unknown as [
      unknown,
      string,
      { resultType: string; resultData: Record<string, unknown> },
    ];
    expect(result.resultType).toBe(VIDEO_DECISIONS_RESULT_TYPE);
    const decisions = result.resultData.decisions as {
      scenes: unknown[];
      cards: unknown[];
      broll: unknown[];
      subtitles: unknown[];
      srtLines: unknown[];
      directorReview: { status: string; summary: string };
    };
    expect(decisions.scenes).toHaveLength(3);
    expect(decisions.cards).toHaveLength(1);
    expect(decisions.broll).toHaveLength(1);
    expect(decisions.subtitles).toHaveLength(4);
    expect(decisions.srtLines).toHaveLength(4);
    expect(decisions.directorReview).toMatchObject({
      status: "ready",
      summary: "叙事、素材和时间线完整。",
    });
    expect(result.resultData.inventory).toEqual(INVENTORY);
    const brollStep = (calls.recordStep.mock.calls as unknown as Array<
      [unknown, string, { stepNo: number; toolCalls: unknown[] }]
    >)
      .map((call) => call[2])
      .find((step) => step.stepNo === 3);
    expect(brollStep?.toolCalls).toEqual([
      expect.objectContaining({
        toolName: "video.broll",
        scope: { accountId: "acc-1", projectId: "proj-1" },
        input: { inventory: INVENTORY },
        output: expect.objectContaining({ slots: expect.any(Array) }),
      }),
      expect.objectContaining({
        toolName: "material.match",
        scope: { accountId: "acc-1", projectId: "proj-1" },
        output: expect.objectContaining({ broll: expect.any(Array) }),
      }),
    ]);
    const directorStep = (calls.recordStep.mock.calls as unknown as Array<
      [unknown, string, { stepNo: number; text: string; toolCalls: unknown[] }]
    >)
      .map((call) => call[2])
      .find((step) => step.stepNo === 5);
    expect(directorStep?.text).toContain("总导演统筹审核:通过");
    expect(directorStep?.toolCalls).toEqual([
      expect.objectContaining({ toolName: "video.director" }),
    ]);
  });

  it("总导演首审提出问题时保留既有素材、自动补信息卡并复审后只交付可渲染候选", async () => {
    const outputs = {
      ...HAPPY_OUTPUTS,
      "video.director": {
        verdict: "revise",
        summary: "第二场素材与口播不匹配。",
        issues: [
          {
            sceneIdx: 1,
            severity: "blocking",
            code: "material_conflict",
            message: "录屏内容与本场口播对象不一致。",
          },
        ],
      },
    };
    const { deps, calls } = makeDeps(outputs);
    const baseCall = fakeCall(outputs);
    let directorPass = 0;
    deps.callStructured = (async <T>(input: StructuredCallInput<T>) => {
      if (input.skillId !== "video.director") return baseCall(input);
      directorPass += 1;
      return (directorPass === 1
        ? outputs["video.director"]
        : {
            verdict: "ready",
            summary: "修正后的时间线与口播一致。",
            issues: [],
          }) as T;
    }) as StructuredCall;
    await runVideoDecisions(ctx, TASK, deps);
    expect(calls.cancelTask).not.toHaveBeenCalled();
    const [, , result] = calls.recordCandidate.mock.calls[0]! as unknown as [
      unknown,
      string,
      { resultData: Record<string, unknown> },
    ];
    const decisions = result.resultData.decisions as {
      cards: unknown[];
      broll: Array<{ assetId: string; sceneIdx: number }>;
      directorReview: { status: string; source: string; issues: unknown[] };
    };
    expect(decisions.directorReview).toMatchObject({
      status: "ready",
      source: "auto_repaired",
    });
    expect(decisions.directorReview.issues).toHaveLength(0);
    expect(decisions.broll).toEqual([
      expect.objectContaining({ assetId: "asset-1", sceneIdx: 1 }),
    ]);
    expect(decisions.cards.length).toBeGreaterThan(1);
  });

  it("总导演模型暂不可用时执行确定性安全审核，不无限重试或取消整条任务", async () => {
    const { deps, calls } = makeDeps({
      ...HAPPY_OUTPUTS,
      "video.director": new Error("审片模型暂不可用"),
    });
    await runVideoDecisions(ctx, TASK, deps);
    expect(calls.cancelTask).not.toHaveBeenCalled();
    expect(calls.recordCandidate).toHaveBeenCalledTimes(1);
    const [, , result] = calls.recordCandidate.mock.calls[0]! as unknown as [
      unknown,
      string,
      { resultData: Record<string, unknown> },
    ];
    const decisions = result.resultData.decisions as {
      directorReview: { status: string; source: string; issues: Array<{ severity: string }> };
    };
    expect(decisions.directorReview).toMatchObject({
      status: "ready",
      source: "deterministic_fallback",
    });
    expect(decisions.directorReview.issues).toEqual([]);
  });

  it("第②步失败 → 诚实报「②信息卡」+ cancelTask,不落候选", async () => {
    const { deps, calls } = makeDeps({
      ...HAPPY_OUTPUTS,
      "video.cards": new Error("模型端点 500"),
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runVideoDecisions(ctx, TASK, deps);
    spy.mockRestore();
    expect(calls.recordCandidate).not.toHaveBeenCalled();
    expect(calls.cancelTask).toHaveBeenCalledWith(ctx, "task-1");
    const failStep = calls.recordStep.mock.calls
      .map((c) => (c as unknown as [unknown, string, { kind: string; text: string }])[2])
      .find((s) => s.kind === "failed");
    expect(failStep?.text).toContain(VIDEO_DECISION_STEPS[1]);
    expect(failStep?.text).toContain("模型端点 500");
  });

  it("显式重试复用同输入已完成的分场，不从第①步重新扣一遍执行", async () => {
    const runtimeByTask = new Map<string, Record<string, unknown>>();
    const first = makeDeps(
      { ...HAPPY_OUTPUTS, "video.cards": new Error("模型端点 500") },
      INVENTORY,
      runtimeByTask,
    );
    const firstSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runVideoDecisions(ctx, TASK, first.deps);
    firstSpy.mockRestore();
    expect(runtimeByTask.get(TASK.id)?.videoDecisionsCheckpoint).toBeTruthy();

    const retry = makeDeps(HAPPY_OUTPUTS, INVENTORY, runtimeByTask);
    const retrySkills: string[] = [];
    const baseCall = fakeCall(HAPPY_OUTPUTS);
    retry.deps.callStructured = async <T>(input: StructuredCallInput<T>) => {
      retrySkills.push(input.skillId);
      return baseCall(input);
    };
    await runVideoDecisions(
      ctx,
      { ...TASK, id: "task-2", retryOfTaskId: TASK.id },
      retry.deps,
    );

    expect(retrySkills).not.toContain("video.scenes");
    expect(retrySkills).toContain("video.cards");
    expect(retry.calls.recordCandidate).toHaveBeenCalledTimes(1);
  });

  it("第③步失败后的显式重试同时复用分场和信息卡", async () => {
    const runtimeByTask = new Map<string, Record<string, unknown>>();
    const first = makeDeps(
      { ...HAPPY_OUTPUTS, "video.broll": new Error("provider 503") },
      INVENTORY,
      runtimeByTask,
    );
    const firstSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runVideoDecisions(ctx, TASK, first.deps);
    firstSpy.mockRestore();

    const retry = makeDeps(HAPPY_OUTPUTS, INVENTORY, runtimeByTask);
    const retrySkills: string[] = [];
    const baseCall = fakeCall(HAPPY_OUTPUTS);
    retry.deps.callStructured = async <T>(input: StructuredCallInput<T>) => {
      retrySkills.push(input.skillId);
      return baseCall(input);
    };
    await runVideoDecisions(
      ctx,
      { ...TASK, id: "task-3", retryOfTaskId: TASK.id },
      retry.deps,
    );

    expect(retrySkills).not.toContain("video.scenes");
    expect(retrySkills).not.toContain("video.cards");
    expect(retrySkills).toContain("video.broll");
    expect(retry.calls.recordCandidate).toHaveBeenCalledTimes(1);
  });

  it("material.match 暂时失败时不阻断成片，并在当前方案内自动补位", async () => {
    const { deps, calls } = makeDeps({
      ...HAPPY_OUTPUTS,
      "material.match": new Error("匹配模型暂不可用"),
    });
    await runVideoDecisions(ctx, TASK, deps);
    expect(calls.cancelTask).not.toHaveBeenCalled();
    expect(calls.recordCandidate).toHaveBeenCalledTimes(1);
    const brollStep = (calls.recordStep.mock.calls as unknown as Array<
      [unknown, string, { stepNo: number; text: string; toolCalls: unknown[] }]
    >)
      .map((call) => call[2])
      .find((step) => step.stepNo === 3);
    expect(brollStep?.text).toContain("系统已在当前方案内自动补位");
    expect(brollStep?.text).not.toMatch(/手动指定|重新分镜|缺失素材/);
    expect(brollStep?.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolName: "material.match",
          output: expect.objectContaining({ warning: "匹配模型暂不可用" }),
        }),
      ]),
    );
  });

  it("缺项目范围 → 备料失败，不读取账号整库 B-roll", async () => {
    const { deps, calls } = makeDeps(HAPPY_OUTPUTS);
    const listSpy = vi.fn(async () => INVENTORY);
    deps.listBrollInventory = listSpy;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runVideoDecisions(ctx, { ...TASK, projectId: null }, deps);
    spy.mockRestore();
    expect(listSpy).not.toHaveBeenCalled();
    expect(calls.recordCandidate).not.toHaveBeenCalled();
    expect(calls.cancelTask).toHaveBeenCalledWith(ctx, "task-1");
    const failed = (calls.recordStep.mock.calls as unknown as Array<
      [unknown, string, { kind: string; text: string }]
    >)
      .map((call) => call[2])
      .find((step) => step.kind === "failed");
    expect(failed?.text).toContain("缺少项目范围");
  });

  // ── [T-387c] storyboard facet(四决策=对齐器)────────────────────────────────

  it("[T-387c] 有凝固分镜 → storyboard facet 真喂进 scenes/cards/broll;subtitles 不吃", async () => {
    const seen: Record<string, string | undefined> = {};
    const call: StructuredCall = async <T>({
      skillId,
      facets,
    }: {
      skillId: string;
      facets: Readonly<Record<string, string | undefined>>;
    }) => {
      seen[skillId] = facets.storyboard;
      return HAPPY_OUTPUTS[skillId] as T;
    };
    const { deps, calls } = makeDeps(HAPPY_OUTPUTS);
    deps.callStructured = call;
    deps.readStoryboard = async () => [
      {
        narration: "今天讲三个提示词技巧",
        visualDescription: "屏幕录屏演示",
        assetRefs: ["asset-1"],
      },
    ];
    await runVideoDecisions(ctx, TASK, deps);
    expect(calls.recordCandidate).toHaveBeenCalledTimes(1);
    for (const id of ["video.scenes", "video.cards", "video.broll"]) {
      expect(seen[id]).toContain("已凝固分镜表");
      expect(seen[id]).toContain("asset-1");
      expect(seen[id]).toContain("对齐硬约束");
    }
    // 字幕决策(文本校正)不吃 storyboard facet。
    expect(seen["video.subtitles"]).toBeUndefined();
  });

  it("[T-703] 本次竖屏选择 → scenes/cards/broll 都收到 9:16 构图约束;字幕不受画幅干预", async () => {
    const seen: Record<string, string | undefined> = {};
    const call: StructuredCall = async <T>({
      skillId,
      facets,
    }: {
      skillId: string;
      facets: Readonly<Record<string, string | undefined>>;
    }) => {
      seen[skillId] = facets.orientation;
      return HAPPY_OUTPUTS[skillId] as T;
    };
    const { deps, calls } = makeDeps(HAPPY_OUTPUTS);
    deps.callStructured = call;
    await runVideoDecisions(
      ctx,
      {
        ...TASK,
        inputData: { ...TASK.inputData, orientation: "portrait" },
      },
      deps,
    );
    expect(calls.recordCandidate).toHaveBeenCalledTimes(1);
    for (const id of ["video.scenes", "video.cards", "video.broll", "material.match"]) {
      expect(seen[id]).toContain("竖屏 9:16");
      expect(seen[id]).toContain("中央安全区");
    }
    expect(seen["video.subtitles"]).toBeUndefined();
  });

  it("[T-387c] 无 visual(旧项目)→ facet 空串 = 现状(零回归);reader 未绑同样零回归", async () => {
    const seen: Record<string, string | undefined> = {};
    const call: StructuredCall = async <T>({
      skillId,
      facets,
    }: {
      skillId: string;
      facets: Readonly<Record<string, string | undefined>>;
    }) => {
      seen[skillId] = facets.storyboard;
      return HAPPY_OUTPUTS[skillId] as T;
    };
    const { deps, calls } = makeDeps(HAPPY_OUTPUTS);
    deps.callStructured = call;
    deps.readStoryboard = async () => []; // 旧稿无 visual → 投影空数组
    await runVideoDecisions(ctx, TASK, deps);
    expect(calls.recordCandidate).toHaveBeenCalledTimes(1);
    expect(seen["video.scenes"]).toBe("");
    expect(seen["video.broll"]).toBe("");
  });

  it("[T-387c] inputData.excludedAssetIds → 决策可选集里滤掉被剔项(人可剔)", async () => {
    const twoAssets: BrollAssetRef[] = [
      { assetId: "asset-1", label: "A", kind: "image", description: "" },
      { assetId: "asset-2", label: "B", kind: "video", description: "" },
    ];
    let seenLibrary = "";
    const call: StructuredCall = async <T>({
      skillId,
      facets,
    }: {
      skillId: string;
      facets: Readonly<Record<string, string | undefined>>;
    }) => {
      if (skillId === "video.broll") seenLibrary = facets.library ?? "";
      return HAPPY_OUTPUTS[skillId] as T;
    };
    const { deps, calls } = makeDeps(HAPPY_OUTPUTS, twoAssets);
    deps.callStructured = call;
    await runVideoDecisions(
      ctx,
      { ...TASK, inputData: { ...TASK.inputData, excludedAssetIds: ["asset-2"] } },
      deps,
    );
    expect(calls.recordCandidate).toHaveBeenCalledTimes(1);
    expect(seenLibrary).toContain("asset-1");
    expect(seenLibrary).not.toContain("asset-2");
    // 候选携带的清单快照也是过滤后的(预览卡换选下拉不出现被剔项)。
    const [, , result] = calls.recordCandidate.mock.calls[0]! as unknown as [
      unknown,
      string,
      { resultData: Record<string, unknown> },
    ];
    const inv = result.resultData.inventory as BrollAssetRef[];
    expect(inv.map((a) => a.assetId)).toEqual(["asset-1"]);
  });

  it("SRT 解析不出 → 备料失败诚实终态(不调模型)", async () => {
    const { deps, calls } = makeDeps(HAPPY_OUTPUTS);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runVideoDecisions(
      ctx,
      { ...TASK, inputData: { srtText: "不是 SRT", script: SCRIPT } },
      deps,
    );
    spy.mockRestore();
    expect(calls.cancelTask).toHaveBeenCalled();
    expect(calls.recordCandidate).not.toHaveBeenCalled();
    const failStep = calls.recordStep.mock.calls
      .map((c) => (c as unknown as [unknown, string, { kind: string; text: string }])[2])
      .find((s) => s.kind === "failed");
    expect(failStep?.text).toContain("备料");
  });
});

// ── [T-387c] 纯函数:storyboardFacet / storyboardFromContentData / dedupeBrollRefs ──

describe("[T-387c] storyboardFacet(凝固分镜 → 对齐器 facet)", () => {
  it("无任何 authored 意图(空数组 / 全空段)→ 空串(零回归测锚)", () => {
    expect(storyboardFacet([])).toBe("");
    expect(
      storyboardFacet([
        { narration: "只有口播", visualDescription: "", assetRefs: [] },
      ]),
    ).toBe("");
  });

  it("有意图段 → 渲分镜表 + 对齐硬约束;未写画面的段标注可自主", () => {
    const facet = storyboardFacet([
      {
        narration: "开场钩子",
        visualDescription: "产品特写",
        assetRefs: ["asset-1"],
      },
      { narration: "第二段", visualDescription: "", assetRefs: [] },
    ]);
    expect(facet).toContain("已凝固分镜表");
    expect(facet).toContain("产品特写");
    expect(facet).toContain("asset-1");
    expect(facet).toContain("对齐硬约束");
    expect(facet).toContain("绝不推翻");
    expect(facet).toContain("未写"); // 空白段可自主
  });
});

describe("[T-387c] storyboardFromContentData(凝固分镜投影)", () => {
  it("sections[].visual → 投影行;narration 取「口播：」行", () => {
    const out = storyboardFromContentData({
      sections: [
        {
          heading: "1. 钩子",
          body: "口播：三个技巧\n画面：录屏",
          visual: { description: "录屏演示", assetRefs: ["a1"], missing: [] },
        },
        { heading: "2. 正文", body: "纯正文" },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      narration: "三个技巧",
      visualDescription: "录屏演示",
      assetRefs: ["a1"],
    });
    expect(out[1]!.visualDescription).toBe("");
  });

  it("旧稿无任何 visual / contentData 为空 → 空数组(→ facet 空,零回归)", () => {
    expect(storyboardFromContentData(null)).toEqual([]);
    expect(
      storyboardFromContentData({ sections: [{ heading: "h", body: "b" }] }),
    ).toEqual([]);
  });
});

describe("[T-387c] dedupeBrollRefs(聚合去重,先到先得)", () => {
  it("同 assetId 保留先出现的(来源优先级由调用方排序保证)", () => {
    const out = dedupeBrollRefs([
      { assetId: "a1", label: "脚本点名", kind: "image", description: "", source: "script" },
      { assetId: "a1", label: "弹药同款", kind: "image", description: "", source: "ammo" },
      { assetId: "a2", label: "项目弹药", kind: "video", description: "", source: "ammo" },
      { assetId: "", label: "坏行", kind: "image", description: "" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ assetId: "a1", source: "script" });
    expect(out[1]).toMatchObject({ assetId: "a2", source: "ammo" });
  });
});
