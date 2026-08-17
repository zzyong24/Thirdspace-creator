import { describe, expect, it } from "vitest";
import {
  VIDEO_BROLL_TEMPLATE,
  VIDEO_CARDS_TEMPLATE,
  VIDEO_DIRECTOR_TEMPLATE,
  VIDEO_SUBTITLES_TEMPLATE,
  normalizeVideoBrollOutput,
  videoCardsSchema,
  videoBrollSchema,
  videoDirectorReviewSchema,
  videoSubtitlesSchema,
} from "./video-decisions";
import { _resetRegistry, getOfficialSkillBase } from "../registry";

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

describe("[T-792] VIDEO_BROLL_TEMPLATE 内容辅助型生图提示词", () => {
  it("画面槽位同时给出认知任务、选图理由和可直接生图的 prompt", () => {
    const parsed = videoBrollSchema.parse({
      slots: [
        {
          ...slot("analogy", 0),
          visualClaim: "工具变了，模糊流程没有变",
          reason: "把抽象的工作流问题变成观众一眼能看懂的因果关系",
          generationPrompt:
            "竖屏纪实插画，同一个未拆解的纸箱任务从一台机器传到另一台机器，箱内仍是一团乱线，人物停在两台机器之间观察，中央构图，冷暖对比，画面内无文字",
        },
      ],
      broll: [],
    });

    expect(parsed.slots[0]).toMatchObject({
      visualClaim: "工具变了，模糊流程没有变",
      reason: expect.stringContaining("一眼能看懂"),
      generationPrompt: expect.stringContaining("画面内无文字"),
    });
  });

  it("提示词先定画面在论证中的职责，再落成一个可见关系而不是复述口播", () => {
    expect(VIDEO_BROLL_TEMPLATE.version).toBe("v7");
    expect(VIDEO_BROLL_TEMPLATE.template).toContain("观众看完这张图应多理解什么");
    expect(VIDEO_BROLL_TEMPLATE.template).toContain("一个画面只完成一个认知动作");
    expect(VIDEO_BROLL_TEMPLATE.template).toContain("主体、动作或关系、环境、构图");
    expect(VIDEO_BROLL_TEMPLATE.template).toContain("默认不生成文字");
    expect(VIDEO_BROLL_TEMPLATE.template).toContain("generationPrompt 必须留空");
    expect(VIDEO_BROLL_TEMPLATE.template).toContain("定位只影响视觉语言");
    expect(VIDEO_BROLL_TEMPLATE.template).toContain("万能 AI 海报");
    expect(VIDEO_BROLL_TEMPLATE.template).toContain("约 6 秒的连续镜头");
    expect(VIDEO_BROLL_TEMPLATE.template).toContain("平稳开始与稳定结尾");
    expect(VIDEO_BROLL_TEMPLATE.template).toContain("禁止音乐和人声");
    expect(VIDEO_BROLL_TEMPLATE.template).toContain("开场前三秒是独立的留人窗口");
    expect(VIDEO_BROLL_TEMPLATE.template).toContain("第一场第一句的 SRT 起秒");
  });
});

describe("VIDEO_CARDS_TEMPLATE 视觉覆盖底线", () => {
  it("设置页 official Skill 与运行时共用 v6 单一真值，可恢复到同一版本", () => {
    _resetRegistry();
    const official = getOfficialSkillBase("video.cards");
    expect(official?.baseVersion).toBe("v6");
    expect(official?.template).toContain("可组合 Scene Graph");
    expect(official?.outputSchema).toMatchObject({ type: "object" });
  });

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

  it("v6 先声明内容关系和原文部件，并把卡片绑定真实 SRT 行", () => {
    expect(VIDEO_CARDS_TEMPLATE.version).toBe("v6");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("观众需要看见什么关系");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("cause_effect");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("srtLineIndex");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("系统会以该行真实起秒为准");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("replacement");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("整卡淡入");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("动态 PPT");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("对象真的发生变化");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("默认不能使用三个并排圆角框");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("cognitiveGoal");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("aspectStrategy");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("entities");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("beats");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("禁止从 relation 反推固定隐喻");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("同一关系也要因内容选择不同对象");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("kind 只选 text/shape/icon/document");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("禁止中文 id");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("glyph 只选 none/document/message");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("from 和 to 都不能省略");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("affects 若填写必须是实体 ID 数组");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("不能因为 Scene Graph 字段多就退回纯文字卡");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("哪怕数值保持不变也不能写");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("sequence 常有多个 step，因此这类实体默认不写 textRole");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("开场前三秒不能只有真人");
    expect(VIDEO_CARDS_TEMPLATE.template).toContain("第一句 SRT 起秒");

    expect(
      videoCardsSchema.parse({
        cards: [
          {
            sceneIdx: 0,
            kind: "list",
            content: "输入、处理、输出",
            at: 0,
            visualPlan: {
              relation: "cause_effect",
              parts: [
                { text: "输入", role: "cause" },
                { text: "处理", role: "process" },
                { text: "输出", role: "result" },
              ],
              scene: {
                cognitiveGoal: "看见输入经过处理到输出",
                layout: "flow",
                aspectStrategy: "reflow",
                entities: [
                  { id: "input", kind: "document", glyph: "document", semantic: "输入", textRole: "cause" },
                  { id: "output", kind: "target", glyph: "target", semantic: "输出", textRole: "result" },
                ],
                beats: [
                  { action: "move", target: "input", start: 0, duration: 0.5, from: { x: -0.7, y: 0 }, to: { x: 0.2, y: 0 } },
                  { action: "reveal", target: "output", start: 0.55, duration: 0.35, from: { progress: 0 }, to: { progress: 1 } },
                ],
              },
            },
          },
        ],
      }).cards[0]?.visualPlan,
    ).toMatchObject({ relation: "cause_effect", scene: { layout: "flow" } });
  });
});

describe("VIDEO_DIRECTOR_TEMPLATE 总导演审片", () => {
  it("必须同时审整体叙事、用户素材、人物安全区和编辑内部标签", () => {
    expect(VIDEO_DIRECTOR_TEMPLATE.version).toBe("v4");
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
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("从第一句起连续检查前三秒");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("人物完全退出");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("只执行候选已选定的 speakerMode");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("不得自动居中缩小");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("连续素材间人物反复弹跳");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("纯背景都不算开场实质视觉");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("motionThesis");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("beatGraph");
    expect(VIDEO_DIRECTOR_TEMPLATE.template).toContain("每拍只有一个主视觉");
  });

  it("结构化结论只接受 ready/revise 与固定问题类型", () => {
    expect(
      videoDirectorReviewSchema.parse({
        verdict: "revise",
        summary: "长段画面没有承接。",
        motionThesis: "证据接管画布后把结论交回人物",
        beatGraph: [
          {
            id: "beat-1",
            sceneIdx: 1,
            startSec: 3.5,
            endSec: 7,
            subject: { kind: "broll", ref: "broll:asset-1" },
            startState: "off_canvas",
            endState: "takeover",
            motionVerb: "enter",
            stageMode: "takeover",
            transitionIn: "cut",
            transitionOut: "fade",
            returnGeometry: "same_base",
          },
        ],
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

describe("VIDEO_SUBTITLES_TEMPLATE 真实重点词", () => {
  it("字幕 schema 接受精确字符范围与真实时间窗，提示词禁止代码猜重点", () => {
    const parsed = videoSubtitlesSchema.parse({
      lines: [
        {
          index: 1,
          zh: "效率提升 47%",
          en: "47% more efficient",
          emphasis: [
            {
              text: "47%",
              startChar: 5,
              endChar: 8,
              startSec: 1.2,
              endSec: 1.9,
            },
          ],
        },
      ],
    });
    expect(parsed.lines[0]?.emphasis).toHaveLength(1);
    expect(VIDEO_SUBTITLES_TEMPLATE.template).toContain("Unicode");
    expect(VIDEO_SUBTITLES_TEMPLATE.template).toContain("重点词");
    expect(VIDEO_SUBTITLES_TEMPLATE.template).toContain("不能用关键词词表");
  });
});
