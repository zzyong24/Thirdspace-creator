import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { parseSrt } from "./srt";
import {
  decideScenes,
  decideCards,
  decideBroll,
  decideSubtitles,
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
  type StructuredCall,
  type VideoScene,
  type BrollAssetRef,
  type VideoDecisionsDeps,
} from "./video-decisions-runner";

// [T-254b] 四决策 runner 单测 —— 全 fake 模型注入(callStructured 逃生口,不碰真 AI):
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
});

const INVENTORY: BrollAssetRef[] = [
  { assetId: "asset-1", label: "提示词界面录屏", kind: "video", description: "ChatGPT 输入框特写" },
  { assetId: "asset-2", label: "角色扮演示意图", kind: "image", description: "" },
];

describe("decideBroll(清单硬门)", () => {
  it("清单外 assetId 剔除;at 吸附;durationSec 钳进场景", async () => {
    const call = fakeCall({
      "video.broll": {
        broll: [
          { sceneIdx: 1, assetId: "asset-2", at: 4.9, durationSec: 30 }, // at→3.5? 4.9离3.5=1.4,离8=3.1 → 3.5;dur 钳 ≤ 12-3.5
          { sceneIdx: 1, assetId: "asset-hallucinated", at: 4, durationSec: 3 }, // 剔除
        ],
      },
    });
    const broll = await decideBroll({ scenes: SCENES, srtLines, inventory: INVENTORY }, call);
    expect(broll).toHaveLength(1);
    expect(broll[0]).toMatchObject({ assetId: "asset-2", at: 3.5 });
    expect(broll[0]!.durationSec).toBeLessThanOrEqual(12 - 3.5);
  });

  it("素材清单为空 → 不调模型,诚实返回 []", async () => {
    const call = vi.fn() as unknown as StructuredCall;
    const broll = await decideBroll({ scenes: SCENES, srtLines, inventory: [] }, call);
    expect(broll).toEqual([]);
    expect(call).not.toHaveBeenCalled();
  });
});

describe("decideSubtitles(时间轴不变 + 重写守门)", () => {
  it("时间轴一律回填原值;小改字保留;重写(相似度<阈值)退回原文;en 透传", async () => {
    const call = fakeCall({
      "video.subtitles": {
        lines: [
          { index: 1, zh: "大家好,今天讲三个提示词技巧,效率提升 47%", en: "Hi, three prompt tips, +47% efficiency" },
          { index: 2, zh: "第一个技巧是给模型一个角色", en: "Tip 1: give the model a role" },
          { index: 3, zh: "第二个技巧是提供实例", en: "Tip 2: provide examples" }, // 示→实 小改,保留
          { index: 4, zh: "完全跑题的重写句子在此", en: "Like and subscribe" }, // 重写 → 退回原文
        ],
      },
    });
    const lines = await decideSubtitles({ srtLines, script: SCRIPT }, call);
    expect(lines).toHaveLength(4);
    expect(lines.map((l) => [l.startSec, l.endSec])).toEqual(
      srtLines.map((l) => [l.startSec, l.endSec]),
    );
    expect(lines[2]!.zh).toBe("第二个技巧是提供实例");
    expect(lines[3]!.zh).toBe("记得点赞关注"); // 守门退回
    expect(lines[1]!.en).toBe("Tip 1: give the model a role");
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
});

// ── 编排入口 ────────────────────────────────────────────────────────────────

function makeDeps(outputs: Record<string, unknown>, inventory = INVENTORY) {
  const calls = {
    markRunning: vi.fn(async () => undefined),
    recordStep: vi.fn(async () => undefined),
    recordCandidate: vi.fn(async () => undefined),
    cancelTask: vi.fn(async () => undefined),
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
    broll: [{ sceneIdx: 1, assetId: "asset-1", at: 3.5, durationSec: 3 }],
  },
  "video.subtitles": {
    lines: srtLines.map((l) => ({ index: l.index, zh: l.text, en: "en" })),
  },
};

const TASK = {
  id: "task-1",
  projectId: "proj-1",
  inputData: { srtText: SRT, script: SCRIPT },
};

describe("runVideoDecisions(编排)", () => {
  it("四步顺序跑完 → recordCandidate(video_decisions,决策完整 + 清单快照),四条步骤留痕", async () => {
    const { deps, calls } = makeDeps(HAPPY_OUTPUTS);
    await runVideoDecisions(ctx, TASK, deps);
    expect(calls.markRunning).toHaveBeenCalledWith(ctx, "task-1");
    expect(calls.cancelTask).not.toHaveBeenCalled();
    expect(calls.recordStep).toHaveBeenCalledTimes(4);
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
    };
    expect(decisions.scenes).toHaveLength(3);
    expect(decisions.cards).toHaveLength(1);
    expect(decisions.broll).toHaveLength(1);
    expect(decisions.subtitles).toHaveLength(4);
    expect(decisions.srtLines).toHaveLength(4);
    expect(result.resultData.inventory).toEqual(INVENTORY);
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
      { assetId: "a2", label: "论点挂载", kind: "video", description: "", source: "thesis" },
      { assetId: "", label: "坏行", kind: "image", description: "" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ assetId: "a1", source: "script" });
    expect(out[1]).toMatchObject({ assetId: "a2", source: "thesis" });
  });
});
