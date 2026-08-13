// [T-254a] HyperFrames 模板生成器单测:快照锚定(改模板必须显式重锚)+ 关键规则
// 断言(PiP 规则/双语字幕夹断/媒体清单)。
import { describe, expect, it } from "vitest";
import { videoRenderProps, type VideoRenderProps } from "@creatoros/contract";
import {
  assertVideoLayoutSafety,
  collectMediaFiles,
  estimateWrappedLines,
  fitMediaRect,
  generateVideoRenderHtml,
  resolveSceneMode,
} from "./template";

/** 覆盖六 kind + 三 special + PiP/right 切换 + B-roll + 双语字幕的全量 fixture。 */
function fullProps(): VideoRenderProps {
  return videoRenderProps.parse({
    meta: { title: "上下文工程实战", brandLabel: "月明 · AI 实战" },
    talkingHead: { file: "th.mp4", durationSec: 60 },
    captions: [
      { start: 0, end: 2.5, cn: "一个下班路上的想法", en: "An idea on the way home" },
      { start: 2.5, end: 5.2, cn: "两三个小时它就能用了" },
      // 与下一行重叠(end 5.4 > next.start 5.3)→ 生成器按 SRT 主时钟夹断
      { start: 5.3, end: 8, cn: "我没写代码也没画图", en: "No code, no design" },
    ],
    scenes: [
      {
        id: "s1",
        label: "REAL STORY",
        title: "一个下班路上的想法",
        sub: "和朋友瞎聊碰出来的",
        startSec: 0,
        endSec: 8,
        role: "hook",
        cards: [{ kind: "stat", at: 2, value: "2–3", unit: "小时", label: "从想法到能用", tone: "amber" }],
      },
      {
        id: "s2",
        label: "SIX KINDS",
        title: "六种信息卡",
        startSec: 8,
        endSec: 30,
        cards: [
          { kind: "stat", at: 8.5, value: "0", label: "行代码", tone: "danger", strike: true },
          { kind: "quote", at: 10, text: "最值钱的是想法本身", tone: "accent" },
          {
            kind: "list",
            at: 12,
            title: "验证清单",
            items: [{ text: "能打开" }, { text: "能点击" }, { text: "能使用", tone: "amber" }],
          },
          {
            kind: "compare",
            at: 15,
            left: { title: "原来", items: ["设计师+前端", "几天起步"], tone: "muted" },
            right: { title: "现在", items: ["一个人", "两三小时"], tone: "green" },
          },
          { kind: "code", at: 18, code: "pnpm install\npnpm dev", label: "两条命令" },
          { kind: "image", at: 21, file: "shots/page_01.png", label: "发现页" },
        ],
      },
      {
        id: "s3",
        label: "AI RELAY",
        title: "剩下全是 AI 接力",
        startSec: 30,
        endSec: 38,
        special: {
          kind: "pipeline",
          nodes: [
            { label: "想法", tone: "accent", sub: "起点" },
            { label: "Codex", tone: "green", sub: "出 UI 稿" },
            { label: "能用的网站", tone: "amber", sub: "成品" },
          ],
        },
      },
      {
        id: "s4",
        label: "OLD VS NEW",
        title: "这条链原来有多重",
        startSec: 38,
        endSec: 46,
        special: {
          kind: "comparison",
          left: { title: "传统链路", items: ["设计稿", "前端", "对需求"], tone: "muted" },
          right: { title: "Agent 链路", items: ["说清楚想法"], tone: "green" },
        },
      },
      {
        id: "s5",
        label: "HOW TO",
        title: "三步上手",
        startSec: 46,
        endSec: 52,
        special: {
          kind: "steps",
          items: [
            { label: "把想法说清楚", sub: "一段话" },
            { label: "丢给 Agent" },
            { label: "当晚验收", sub: "能点能用" },
          ],
        },
      },
      {
        id: "s6",
        label: "FOLLOW",
        title: "关注我",
        sub: "把细节摊开讲",
        startSec: 52,
        endSec: 60,
        role: "cta",
        cards: [{ kind: "quote", at: 53, text: "一步步把想法落地", tone: "accent" }],
      },
    ],
    broll: [
      { at: 9, file: "rec_site_click.mp4", label: "真实录屏 · 能点的网站", big: true },
      { at: 31, file: "rec_codex_ui.mp4", label: "Codex 出 UI", durationSec: 5 },
    ],
  });
}

describe("generateVideoRenderHtml", () => {
  it("全量 fixture 输出快照锚定(六 kind/三 special/PiP 切换/双语字幕/角标+进度条)", () => {
    const html = generateVideoRenderHtml(fullProps());
    expect(html).toMatchSnapshot();
  });

  it("HyperFrames 合成协议齐备:composition 根 + __timelines + 口播头主音频", () => {
    const html = generateVideoRenderHtml(fullProps());
    expect(html).toContain('data-composition-id="main"');
    expect(html).toContain('data-duration="60.00"');
    expect(html).toContain('window.__timelines["main"] = tl;');
    expect(html).toContain('data-has-audio="true"');
    expect(html).toContain('src="media/th.mp4"');
  });

  it("[T-290] 竖版(1080x1920):root 尺寸随 delivery + 口播头用竖版布局坐标", () => {
    const html = generateVideoRenderHtml({
      ...fullProps(),
      delivery: { width: 1080, height: 1920, fps: 30 },
    });
    // root 画布随 delivery 竖版尺寸
    expect(html).toContain('data-width="1080" data-height="1920"');
    expect(html).toContain("width:1080px;height:1920px");
    // 首场 hook(1 卡)→ right 态:人物真正铺满 9:16 主画布，不再缩成中间小卡。
    expect(html).toContain("left:0px;top:0px;width:1080px;height:1920px");
    // 竖版不含横版口播头右侧坐标(1330)
    expect(html).not.toContain("left:1330px");
  });

  it("[T-290] 竖版整体输出快照锚定(改竖版布局需显式重锚)", () => {
    const html = generateVideoRenderHtml({
      ...fullProps(),
      delivery: { width: 1080, height: 1920, fps: 30 },
    });
    expect(html).toMatchSnapshot();
  });

  it("双语字幕:SRT 主时钟,重叠行被夹断(end 夹到下一行 start-0.02)", () => {
    const html = generateVideoRenderHtml(fullProps());
    // 第 2 行 end=5.2 但下一行 start=5.3 → duration = 5.28-2.50 = 2.78
    expect(html).toContain('id="cap1" class="clip" data-start="2.50" data-duration="2.70"');
    expect(html).toContain("An idea on the way home"); // 英文副行
    expect(html).toContain("我没写代码也没画图");
  });

  it("B-roll 视频自身是 clip(帧捕获协议)且 durationSec 截断生效", () => {
    const html = generateVideoRenderHtml(fullProps());
    expect(html).toContain('src="media/rec_site_click.mp4" aria-label="真实录屏 · 能点的网站" muted data-start="9.00"');
    // rec_codex_ui at=31 dur=5 → data-duration="5.00"(非播到场景尾 38-31=7)
    expect(html).toMatch(/src="media\/rec_codex_ui\.mp4" aria-label="Codex 出 UI" muted data-start="31\.00" data-duration="5\.00"/);
  });

  it("B-roll 文件名与内部生成标签只作无障碍说明，绝不烧进成片画面", () => {
    const html = generateVideoRenderHtml(fullProps());
    expect(html).toContain('aria-label="真实录屏 · 能点的网站"');
    expect(html).not.toContain("▶ 真实录屏 · 能点的网站");
    expect(html).not.toContain("▣ 真实录屏 · 能点的网站");
  });

  it("场景编号、标题和概括只是编辑元数据，成片只渲染有视觉价值的卡片", () => {
    const html = generateVideoRenderHtml(fullProps());
    expect(html).not.toContain("REAL STORY");
    expect(html).not.toContain("SIX KINDS");
    expect(html).not.toContain("六种信息卡");
    expect(html).not.toContain("和朋友瞎聊碰出来的");
    expect(html).toContain("从想法到能用");
    expect(html).toContain("最值钱的是想法本身");
  });

  it("special 只由预设枚举渲染,AI 不写模板代码(pipeline 箭头线/steps 序号)", () => {
    const html = generateVideoRenderHtml(fullProps());
    expect(html).toContain("scaleX:0"); // pipeline 连接线动画
    expect(html).toContain(">VS<"); // comparison 中缝
    expect(html).toContain(">1</span>"); // steps 序号
  });
});

describe("fitMediaRect(保留源素材比例)", () => {
  it("横屏成片中的竖图保持竖版舞台并居中，不拉伸成横图", () => {
    expect(
      fitMediaRect(
        { x: 100, y: 80, width: 1200, height: 700 },
        1080,
        1920,
      ),
    ).toEqual({ x: 503, y: 80, width: 394, height: 700 });
  });
});

// [T-295] 富动画 motion:决策意图 → GSAP 配方分派 + 缺省按 kind 派生。
describe("generateVideoRenderHtml · [T-295] card.motion 富动画配方", () => {
  /** 单场景最小 props(只装待测卡片,聚焦 motion 断言)。 */
  function motionProps(cards: unknown[]): VideoRenderProps {
    return videoRenderProps.parse({
      meta: { title: "motion 测试" },
      talkingHead: { file: "th.mp4", durationSec: 30 },
      scenes: [
        { id: "s1", label: "L", title: "T", startSec: 0, endSec: 30, cards },
      ],
    });
  }

  it("缺省派生:stat→counter(纯数字 value 走 onUpdate 递增 + .stat-val 钩子)", () => {
    const html = generateVideoRenderHtml(
      motionProps([{ kind: "stat", at: 1, value: "47", label: "效率提升" }]),
    );
    expect(html).toContain('<span class="stat-val">47</span>'); // 数值钩子
    expect(html).toContain("onUpdate:function()"); // 计数器逐帧写文本
    expect(html).toContain("{v:47,"); // 递增到目标值
    expect(html).toContain("toFixed(0)"); // 整数格式化
  });

  it("counter 容忍单位后缀:value '47%' 递增数字并原样保留后缀(组装器常带 %/倍)", () => {
    const html = generateVideoRenderHtml(
      motionProps([{ kind: "stat", at: 1, value: "47%", label: "留存率" }]),
    );
    expect(html).toContain("onUpdate:function()");
    expect(html).toContain("{v:47,"); // 数字递增到 47
    expect(html).toContain('.toFixed(0)+"%"'); // 后缀 % 保留
  });

  it("counter 优雅降级:非纯数字 value(如 2–3)不走 onUpdate,退回 plain 强调进场", () => {
    const html = generateVideoRenderHtml(
      motionProps([{ kind: "stat", at: 1, value: "2–3", unit: "小时", label: "耗时" }]),
    );
    expect(html).toContain('<span class="stat-val">2–3</span>');
    expect(html).not.toContain("onUpdate"); // 无计数器
    expect(html).toContain('{autoAlpha:0,scale:1.02}'); // plain 进场
  });

  it("缺省派生:compare→bar(两侧 .growbar 各一根,scaleX 0→1 依次生长)", () => {
    const html = generateVideoRenderHtml(
      motionProps([
        {
          kind: "compare",
          at: 1,
          left: { title: "原来", items: ["慢"] },
          right: { title: "现在", items: ["快"] },
        },
      ]),
    );
    expect((html.match(/class="growbar"/g) ?? []).length).toBe(2); // 左右各一条
    expect(html).toContain('.growbar",{scaleX:0'); // 起始 0
    expect(html).toContain("scaleX:1,duration:.8"); // 生长到满
  });

  it("缺省派生:list→reveal(容器淡入 + 逐条 .li 错峰,复用现有逐条)", () => {
    const html = generateVideoRenderHtml(
      motionProps([
        { kind: "list", at: 1, items: [{ text: "第一" }, { text: "第二" }] },
      ]),
    );
    expect(html).toContain(".li0"); // 逐条钩子仍在
    expect(html).toContain(".li1");
    expect(html).toContain('{autoAlpha:1,duration:.3,ease:"power2.out"}'); // reveal 容器淡入
  });

  it("缺省派生:quote→plain(轻错峰进场,非整块闷淡入,无计数器/条)", () => {
    const html = generateVideoRenderHtml(
      motionProps([{ kind: "quote", at: 1, text: "一句金句" }]),
    );
    expect(html).toContain('> *:not(.ovl)",{autoAlpha:0,y:8}'); // 直接子元素错峰
    expect(html).not.toContain("onUpdate");
    expect(html).not.toContain("growbar");
  });

  it("显式覆盖 motion=strike:红删除线 .strikeline 由 scaleX 划过(建立→推翻)", () => {
    const html = generateVideoRenderHtml(
      motionProps([{ kind: "quote", at: 1, text: "别以为它很难", motion: "strike" }]),
    );
    expect(html).toContain('class="strikeline ovl"');
    expect(html).toContain('.strikeline",{scaleX:0'); // 先 0
    expect(html).toContain("opacity:.5"); // 划掉后变暗
  });

  it("显式覆盖 motion=metaphor:底部绿线 .metaline 收束 + back.out 弹入(强揭示)", () => {
    const html = generateVideoRenderHtml(
      motionProps([{ kind: "quote", at: 1, text: "抽象概念", motion: "metaphor" }]),
    );
    expect(html).toContain('class="metaline ovl"');
    expect(html).toContain('ease:"back.out(1.5)"'); // 弹入
    expect(html).toContain('.metaline",{scaleX:0'); // 绿线生长
  });

  it("方向无关:竖版下 motion 配方同样是相对变换(counter onUpdate 不含绝对坐标)", () => {
    const html = generateVideoRenderHtml({
      ...motionProps([{ kind: "stat", at: 1, value: "100", label: "规模" }]),
      delivery: { width: 1080, height: 1920, fps: 30 },
    });
    expect(html).toContain("onUpdate:function()");
    expect(html).toContain("{v:100,");
  });
});

describe("generateVideoRenderHtml · [T-794] 内容驱动视觉句子", () => {
  function visualPlanHtml(relation: string, parts: Array<{ text: string; role: string }>) {
    const props = videoRenderProps.parse({
      meta: { title: "视觉句子" },
      talkingHead: { file: "th.mp4", durationSec: 12 },
      scenes: [
        {
          id: "s1",
          label: "L",
          title: "T",
          startSec: 0,
          endSec: 12,
          cards: [
            {
              kind: "quote",
              at: 1,
              text: parts.map((part) => part.text).join(" → "),
              visualPlan: { relation, parts },
            },
          ],
        },
      ],
    });
    return generateVideoRenderHtml(props);
  }

  it.each([
    ["magnitude", [{ text: "47%", role: "measure" }], "visual-magnitude"],
    [
      "contrast",
      [
        { text: "旧流程", role: "old" },
        { text: "新流程", role: "new" },
      ],
      "visual-contrast",
    ],
    [
      "sequence",
      [
        { text: "输入", role: "step" },
        { text: "处理", role: "step" },
        { text: "输出", role: "step" },
      ],
      "visual-sequence",
    ],
    [
      "cause_effect",
      [
        { text: "输入", role: "cause" },
        { text: "处理", role: "process" },
        { text: "输出", role: "result" },
      ],
      "visual-cause-effect",
    ],
    [
      "replacement",
      [
        { text: "保存对话", role: "old" },
        { text: "理解用户", role: "new" },
      ],
      "visual-replacement",
    ],
  ])("%s 有独立 DOM 与渐进动画，不退化为整卡淡入", (relation, parts, marker) => {
    const html = visualPlanHtml(relation as string, parts as Array<{ text: string; role: string }>);
    expect(html).toContain(`class=\"${marker}`);
    expect(html).toContain("data-visual-part");
    expect(html).toContain("stagger:");
  });

  it("全片底层使用低对比虚线网格，不靠大块纯黑填空", () => {
    const html = visualPlanHtml("sequence", [
      { text: "输入", role: "step" },
      { text: "输出", role: "step" },
    ]);
    expect(html).toContain("stroke-dasharray=%223%207%22");
    expect(html).toContain("background-size:48px 48px");
    expect(html).toContain('id="grid"');
  });

  it("无人物视觉专场把主舞台上移放大，且网格达到实际可见强度", () => {
    const props = videoRenderProps.parse({
      meta: { title: "视觉专场", brandLabel: "CreatorOS" },
      delivery: { width: 1080, height: 1920, fps: 30 },
      talkingHead: { file: "placeholder.mp4", durationSec: 5, hasAudio: false },
      captions: [{ start: 0, end: 5, cn: "字幕" }],
      broll: [],
      scenes: [
        {
          id: "visual-only",
          label: "视觉专场",
          title: "视觉专场",
          startSec: 0,
          endSec: 5,
          cards: [
            {
              kind: "list",
              at: 0,
              items: [{ text: "输入" }, { text: "输出" }],
              visualPlan: {
                relation: "cause_effect",
                parts: [
                  { text: "输入", role: "cause" },
                  { text: "处理", role: "process" },
                  { text: "输出", role: "result" },
                ],
              },
            },
          ],
        },
      ],
    });
    const html = generateVideoRenderHtml(props, { visualOnly: true });
    expect(html).not.toContain('id="th"');
    expect(html).toContain("top:578px");
    expect(html).toContain("background-size:48px 48px");
    expect(html).toContain("opacity:.9");

    const landscapeHtml = generateVideoRenderHtml(
      { ...props, delivery: { width: 1920, height: 1080, fps: 30 } },
      { visualOnly: true },
    );
    expect(landscapeHtml).toContain("transform:scale(1.34)");
  });

  it("v3 的因果/步骤/替换使用场景物件运动，不再退化成圆角框加 PPT 连线", () => {
    const causeHtml = visualPlanHtml("cause_effect", [
      { text: "输入变长", role: "cause" },
      { text: "要求变多", role: "process" },
      { text: "没有更好", role: "result" },
    ]);
    expect(causeHtml).toContain("scene-scroll");
    expect(causeHtml).toContain("scene-machine");
    expect(causeHtml).toContain("scene-output-sheet");
    expect(causeHtml).toContain("scene-pressure");

    const sequenceHtml = visualPlanHtml("sequence", [
      { text: "冻结事实", role: "step" },
      { text: "只改一处", role: "step" },
      { text: "盲评", role: "step" },
      { text: "留下赢家", role: "step" },
    ]);
    expect(sequenceHtml).toContain("scene-runner");
    expect(sequenceHtml).toContain("scene-calibration-gate");
    expect(sequenceHtml).toContain("scene-loop-path");

    const replacementHtml = visualPlanHtml("replacement", [
      { text: "越来越长的说明书", role: "old" },
      { text: "可验证的假设", role: "new" },
    ]);
    expect(replacementHtml).toContain("scene-manual");
    expect(replacementHtml).toContain("scene-hypothesis");
    expect(replacementHtml).toContain("scene-scan-beam");
  });

  it("场景文字使用独立安全层，运动物件和装饰线不得穿过文字", () => {
    const causeHtml = visualPlanHtml("cause_effect", [
      { text: "把提示词从三行补到三页", role: "cause" },
      { text: "要求越来越多", role: "process" },
      { text: "没有更好", role: "result" },
    ]);
    expect(causeHtml).toContain("scene-process-label");
    expect(causeHtml).toContain("data-text-safe");
    expect(causeHtml).not.toContain("white-space:nowrap");
    expect(causeHtml).toContain('.scene-paper-mark",{x:-60');
    expect(causeHtml).toContain("{x:0,rotation:0");

    const sequenceHtml = visualPlanHtml("sequence", [
      { text: "冻结同一个选题和事实", role: "step" },
      { text: "只改一个变量", role: "step" },
      { text: "盲评", role: "step" },
      { text: "留下赢家", role: "step" },
    ]);
    expect(sequenceHtml).toContain("scene-safe-label");
    expect(sequenceHtml).toContain("z-index:10");

    const replacementHtml = visualPlanHtml("replacement", [
      { text: "提示词才不是一份越来越长的说明书", role: "old" },
      { text: "可以被验证、被淘汰、被升级的假设", role: "new" },
    ]);
    expect(replacementHtml).toContain("scene-manual-label");
    expect(replacementHtml).toContain("top:132px;width:375px");
  });

  it("[T-802 RED] 同一 relation 可由 Scene Graph 渲染成不同对象、构图与实际轨迹", () => {
    const make = (scene: unknown) => generateVideoRenderHtml(videoRenderProps.parse({
      meta: { title: "可组合场景" },
      talkingHead: { file: "th.mp4", durationSec: 8 },
      scenes: [{
        id: "s1", label: "L", title: "T", startSec: 0, endSec: 8,
        cards: [{
          kind: "quote", at: 0, text: "原因导致结果",
          visualPlan: {
            relation: "cause_effect",
            parts: [{ text: "原因", role: "cause" }, { text: "结果", role: "result" }],
            scene,
          },
        }],
      }],
    }));
    const blockedPath = make({
      cognitiveGoal: "看见功能堵住路径",
      layout: "path",
      aspectStrategy: "reflow",
      entities: [
        { id: "features", kind: "tile_collection", glyph: "feature", semantic: "功能" },
        { id: "route", kind: "path", glyph: "route", semantic: "路径" },
      ],
      beats: [
        { action: "overflow", target: "features", start: 0, duration: 0.45, from: { count: 2 }, to: { count: 9 } },
        { action: "compress", target: "route", start: 0.4, duration: 0.35, from: { scale: 1 }, to: { scale: 0.35 } },
      ],
    });
    const sleepErosion = make({
      cognitiveGoal: "看见通知侵蚀睡眠",
      layout: "stack",
      aspectStrategy: "reflow",
      entities: [
        { id: "notices", kind: "icon", glyph: "notification", semantic: "通知" },
        { id: "sleep", kind: "meter", glyph: "moon", semantic: "睡眠" },
      ],
      beats: [
        { action: "enter", target: "notices", start: 0, duration: 0.25, from: { opacity: 0 }, to: { opacity: 1 } },
        { action: "shrink", target: "sleep", start: 0.25, duration: 0.5, from: { scale: 1 }, to: { scale: 0.4 } },
      ],
    });
    expect(blockedPath).toContain('data-scene-layout="path"');
    expect(blockedPath).toContain('data-entity-kind="tile_collection"');
    expect(blockedPath).toContain('data-beat-action="overflow"');
    expect(sleepErosion).toContain('data-scene-layout="stack"');
    expect(sleepErosion).toContain('data-entity-kind="meter"');
    expect(sleepErosion).toContain('data-beat-action="shrink"');
    expect(blockedPath).not.toContain("scene-machine");
    expect(sleepErosion).not.toContain("scene-machine");
  });
});

describe("resolveSceneMode(普通视觉固定主舞台；仅全屏录屏在素材窗口内切 PiP)", () => {
  const props = fullProps();
  it("hook 场景 1 张卡 → right;cta 场景 → right", () => {
    expect(resolveSceneMode(props.scenes[0]!, 0)).toBe("right");
    expect(resolveSceneMode(props.scenes[5]!, 0)).toBe("right");
  });
  it("body 场景即使有多个视觉节点仍保持右侧人物，避免卡片段大片空黑", () => {
    expect(resolveSceneMode(props.scenes[1]!, 1)).toBe("right");
  });
  it("special 场景仍使用左主舞台 + 右侧人物", () => {
    expect(resolveSceneMode({ ...props.scenes[2]!, role: "hook" }, 0)).toBe("right");
  });
  it("hook 场景多个节点也不提前缩成 PiP", () => {
    expect(resolveSceneMode(props.scenes[0]!, 2)).toBe("right");
  });
  it("模型历史 mode=pip 不得覆盖确定性安全布局", () => {
    expect(resolveSceneMode({ ...props.scenes[1]!, mode: "pip" }, 5)).toBe("right");
  });
  it("body 无视觉节点进入居中主讲模式，禁止人物靠边后留下大片空黑底", () => {
    expect(resolveSceneMode({ ...props.scenes[1]!, cards: [] }, 0)).toBe("focus");
  });
  it("横屏 large_stage 强制人物留在右侧安全框，禁止素材盖脸后只露半张脸", () => {
    expect(
      resolveSceneMode({ ...props.scenes[1]!, cards: [] }, 1, {
        hasLargeStage: true,
        portrait: false,
      }),
    ).toBe("right");
  });
  it("竖屏 large_stage 使用底部 PiP，把上方主舞台让给素材", () => {
    expect(
      resolveSceneMode({ ...props.scenes[1]!, cards: [] }, 1, {
        hasLargeStage: true,
        portrait: true,
      }),
    ).toBe("pip");
  });
  it("竖屏只有普通卡片或 special 时仍保持人物主画面，不因节点数量退成角落小窗", () => {
    expect(
      resolveSceneMode(props.scenes[1]!, 1, {
        hasLargeStage: false,
        portrait: true,
      }),
    ).toBe("right");
    expect(
      resolveSceneMode(props.scenes[2]!, 0, {
        hasLargeStage: false,
        portrait: true,
      }),
    ).toBe("right");
  });
});

describe("横屏无视觉节点的确定性画面兜底", () => {
  it("用同源氛围层填满背景，并把竖版主讲画面置中放大", () => {
    const props = fullProps();
    const scene = {
      ...props.scenes[1]!,
      id: "empty-body",
      startSec: 0,
      endSec: props.talkingHead.durationSec,
      cards: [],
      special: undefined,
      mode: undefined,
    };
    const html = generateVideoRenderHtml({
      ...props,
      scenes: [scene],
      broll: [],
    });

    expect(html).toContain('id="thAmbient"');
    expect(html).toContain('class="clip talking-head-ambient"');
    expect(html).toContain('object-fit:cover;filter:blur(');
    expect(html).toContain('id="th"');
    expect(html).toContain("left:688px;top:56px;width:544px;height:968px");
  });
});

describe("竖屏界面素材可读性", () => {
  it("full_frame 横录屏保留完整前景，并用同源氛围层填满竖屏而非中央窄条加黑边", () => {
    const props = fullProps();
    const html = generateVideoRenderHtml({
      ...props,
      delivery: { width: 1080, height: 1920, fps: 30 },
      broll: [
        {
          at: 9,
          file: "screen.mp4",
          durationSec: 8,
          label: "系统操作录屏",
          big: false,
          presentation: "full_frame",
          visualRole: "screen_recording",
          speakerMode: "pip_bottom_left",
          sourceWidth: 1920,
          sourceHeight: 1080,
        },
      ],
    });
    expect(html).toContain("left:0px;top:0px;z-index:940");
    expect(html).toContain("width:1080px;height:1920px");
    expect(html).toContain('class="clip portrait-ambient-fill"');
    expect(html).toContain("object-fit:cover;filter:blur(28px) brightness(.34)");
    // 1920×1080 完整前景按 contain 放在竖屏上半段，不能被 cover 裁切，也不能
    // 机械居中后在顶部留下六百多像素空白。
    expect(html).toContain("left:0px;top:176px;width:1080px;height:608px");
    expect(html).toContain("object-fit:contain");
    expect(html).toContain("z-index:942");
    expect(html).toContain('tl.set("#th",{zIndex:945}');
    expect(html).toContain("left:54,top:902,width:410,height:729");
    expect(html).toContain("bottom:56px;text-align:center;z-index:950");
  });

  it("竖屏 PiP 使用更大的 9:16 底部人物安全区，不再缩成左下角 300×533 小窗", () => {
    const props = fullProps();
    const html = generateVideoRenderHtml({
      ...props,
      delivery: { width: 1080, height: 1920, fps: 30 },
      scenes: [
        {
          ...props.scenes[0]!,
          id: "portrait-stage",
          startSec: 0,
          endSec: props.talkingHead.durationSec,
          cards: [],
          special: undefined,
        },
      ],
      broll: [
        {
          at: 1,
          file: "portrait-stage.jpg",
          durationSec: 8,
          label: "竖屏主舞台",
          big: false,
          presentation: "large_stage",
          sourceWidth: 1080,
          sourceHeight: 1920,
        },
      ],
    });
    expect(html).toContain("left:500px;top:850px;width:530px;height:942px");
  });

  it("large_stage 横图在竖屏上半区保留完整前景并填充舞台背景", () => {
    const props = fullProps();
    const html = generateVideoRenderHtml(
      {
        ...props,
        delivery: { width: 1080, height: 1920, fps: 30 },
        scenes: props.scenes.map((scene, index) =>
          index === 1 ? { ...scene, cards: [], special: undefined } : scene,
        ),
        broll: [
          {
            at: 9,
            file: "landscape-photo.jpg",
            durationSec: 8,
            label: "横版配图",
            big: false,
            presentation: "large_stage",
            sourceWidth: 1920,
            sourceHeight: 1080,
          },
        ],
      },
      { imageFiles: new Set(["landscape-photo.jpg"]) },
    );
    expect(html).toContain('class="clip portrait-ambient-fill"');
    expect(html).toContain("left:54px;top:80px;width:972px;height:750px");
    expect(html).toContain("left:64px;top:187px;width:952px;height:536px");
    expect(html).toContain("object-fit:contain");
  });
});

describe("B-roll 主视觉安全区", () => {
  it("下一主素材进场会切断上一主素材，禁止横图与竖图同时叠放", () => {
    const props = fullProps();
    const html = generateVideoRenderHtml(
      {
        ...props,
        scenes: [
          {
            id: "s1",
            label: "编辑标签",
            title: "编辑标题",
            startSec: 0,
            endSec: 12,
            role: "body",
            cards: [],
          },
        ],
        talkingHead: { ...props.talkingHead, durationSec: 12 },
        captions: [],
        broll: [
          {
            at: 1,
            file: "landscape.png",
            durationSec: 8,
            label: "横图",
            big: false,
            presentation: "large_stage",
            sourceWidth: 1920,
            sourceHeight: 1080,
          },
          {
            at: 4,
            file: "portrait.png",
            durationSec: 5,
            label: "竖图",
            big: false,
            presentation: "large_stage",
            sourceWidth: 1080,
            sourceHeight: 1920,
          },
        ],
      },
      { imageFiles: new Set(["landscape.png", "portrait.png"]) },
    );

    expect(html).toMatch(
      /src="media\/landscape\.png"[^>]+data-start="1\.00" data-duration="3\.00"/,
    );
    expect(html).toMatch(
      /src="media\/portrait\.png"[^>]+data-start="4\.00" data-duration="5\.00"/,
    );
  });

  it("主素材马上进场时不再保留旧信息卡，large_stage 先清空自己的安全舞台", () => {
    const props = fullProps();
    const html = generateVideoRenderHtml(
      {
        ...props,
        scenes: [
          {
            id: "s1",
            label: "编辑标签",
            title: "编辑标题",
            startSec: 0,
            endSec: 12,
            role: "body",
            cards: [
              {
                kind: "quote",
                at: 1,
                text: "不应残留在静态图片背后的旧标题",
                tone: "accent",
              },
            ],
          },
        ],
        talkingHead: { ...props.talkingHead, durationSec: 12 },
        captions: [],
        broll: [
          {
            at: 1.2,
            file: "portrait.png",
            durationSec: 5,
            label: "竖图",
            big: false,
            presentation: "large_stage",
            sourceWidth: 1080,
            sourceHeight: 1920,
          },
        ],
      },
      { imageFiles: new Set(["portrait.png"]) },
    );

    expect(html).not.toContain("不应残留在静态图片背后的旧标题");
    expect(html).toContain('class="clip main-visual-clear"');
    expect(html).toContain("left:0px;top:0px;z-index:699;width:1330px;height:1080px");
  });

  it("横屏 full_frame 录屏覆盖画布，但人物始终保留为左下角画中画", () => {
    const props = fullProps();
    const html = generateVideoRenderHtml({
      ...props,
      broll: [
        {
          at: 9,
          file: "screen.mp4",
          durationSec: 8,
          label: "系统操作录屏",
          big: false,
          presentation: "full_frame",
          visualRole: "screen_recording",
          speakerMode: "pip_bottom_left",
        },
      ],
    });
    expect(html).toContain("left:0px;top:0px;z-index:940");
    expect(html).toContain("width:1920px;height:1080px");
    expect(html).toContain("left:0px;top:0px;width:1920px;height:1080px;z-index:941");
    expect(html).toContain('tl.set("#th",{zIndex:945}');
    expect(html).toContain("left:67,top:453,width:307,height:546");
    expect(html).toContain("bottom:56px;text-align:center;z-index:950");
  });

  it("横屏 large_stage 固定在人物左侧，素材右边界 1300 小于人物左边界 1330", () => {
    const props = fullProps();
    const html = generateVideoRenderHtml({
      ...props,
      scenes: props.scenes.map((scene, index) =>
        index === 1 ? { ...scene, cards: [], special: undefined } : scene,
      ),
      broll: [
        {
          at: 9,
          file: "screen.mp4",
          durationSec: 8,
          label: "系统操作录屏",
          big: false,
          presentation: "large_stage",
        },
      ],
    });
    expect(html).toContain("left:50px;top:190px;z-index:700");
    expect(html).toContain("width:1250px;height:760px");
    expect(html).toContain("left:1330px;top:138px;width:500px;height:804px");
    expect(html).not.toContain("left:240px;top:125px");
  });

  it("静态图即使 AI 误选 full_frame 也会被契约拒绝", () => {
    const props = fullProps();
    expect(() =>
      assertVideoLayoutSafety({
        ...props,
        broll: [
          {
            at: 9,
            file: "photo.jpg",
            durationSec: 8,
            label: "情绪画面",
            big: false,
            presentation: "full_frame",
            visualRole: "still_image",
            motion: "push_in",
          },
        ],
      }),
    ).toThrow("只有录屏素材可以全屏");
  });
});

// [T-320b] 确定性文本测高估算器:CJK-aware 换行行数近似(纯函数,不再低估)。
describe("estimateWrappedLines([T-320b] 确定性测高)", () => {
  it("空串 → 1 行(不塌)", () => {
    expect(estimateWrappedLines("", 300, 30)).toBe(1);
  });

  it("CJK 短文本单行:10 字 @30px 落进 576 宽 → 1 行", () => {
    // 10 全角 × 30px = 300 排版宽 < 576 → 1 行
    expect(estimateWrappedLines("一二三四五六七八九十", 576, 30)).toBe(1);
  });

  it("CJK 长文本换行:40 字 @30px 在 576 宽 → 40×30=1200 → ceil(1200/576)=3 行", () => {
    const text = "一二三四五六七八九十".repeat(4); // 40 全角字
    expect(estimateWrappedLines(text, 576, 30)).toBe(3);
  });

  it("恰好整行边界:10 全角 @30px 在 300 宽(=300)→ 不多算一行 = 1 行", () => {
    expect(estimateWrappedLines("一二三四五六七八九十", 300, 30)).toBe(1);
    // 再加一个全角(330 > 300)→ 2 行
    expect(estimateWrappedLines("一二三四五六七八九十甲", 300, 30)).toBe(2);
  });

  it("latin 半角按 0.5em:40 个半角 @20px = 40×10=400 → 在 300 宽 → ceil(400/300)=2 行", () => {
    expect(estimateWrappedLines("a".repeat(40), 300, 20)).toBe(2);
  });

  it("CJK/latin 混排:全角 1em + 半角 0.5em 分别累加", () => {
    // 10 全角(300)+ 20 半角(20×10=200)= 500 排版宽,在 240 宽 → ceil(500/240)=3 行
    const mixed = "一二三四五六七八九十" + "a".repeat(20);
    expect(estimateWrappedLines(mixed, 240, 30)).toBe(3);
  });

  it("显式 \\n 硬分段:每段各自软换行行数求和", () => {
    // 3 段,每段短 → 各 1 行 → 3 行
    expect(estimateWrappedLines("行一\n行二\n行三", 500, 20)).toBe(3);
    // 中间一段长(40 全角 @20px=800,在 300 宽 → 3 行)+ 两短段各 1 行 → 5 行
    const longMid = "一二三四五六七八九十".repeat(4);
    expect(estimateWrappedLines(`短\n${longMid}\n短`, 300, 20)).toBe(5);
  });

  it("opts 可调 advance 系数:等宽 latin 0.6em 比默认 0.5em 更宽 → 行数不减", () => {
    const wide = estimateWrappedLines("a".repeat(50), 300, 20, { latinFactor: 0.6 });
    const narrow = estimateWrappedLines("a".repeat(50), 300, 20, { latinFactor: 0.5 });
    expect(wide).toBeGreaterThanOrEqual(narrow);
  });

  it("可用宽非正兜底:不除零、返回 ≥1", () => {
    expect(estimateWrappedLines("文字", 0, 30)).toBeGreaterThanOrEqual(1);
    expect(estimateWrappedLines("文字", -5, 30)).toBeGreaterThanOrEqual(1);
  });
});

// [T-712] 信息卡不再沿旧 flow 向下堆成角落小标签，而是在同一主舞台按口播
// 节拍接力。这里验证“大卡 + 大字 + 逐卡替换”的生成协议，防止重新退回大量空黑。
describe("信息卡主舞台与高密度排版([T-712])", () => {
  function vProps(cards: unknown[]): VideoRenderProps {
    return videoRenderProps.parse({
      meta: { title: "信息节拍" },
      talkingHead: { file: "th.mp4", durationSec: 30 },
      delivery: { width: 1080, height: 1920, fps: 30 },
      scenes: [{ id: "s1", label: "L", title: "T", startSec: 0, endSec: 30, cards }],
    });
  }

  it("不同类型都使用大面积信息舞台和清晰字号，不再渲染成 620px 小标签", () => {
    const html = generateVideoRenderHtml(vProps([
      { kind: "quote", at: 1, text: "先把流程压下来" },
      { kind: "stat", at: 7, value: "10", unit: "分钟", label: "跑完完整流程" },
      {
        kind: "list",
        at: 13,
        items: [{ text: "先确定选题" }, { text: "再完成写稿" }, { text: "最后安排发布" }],
      },
      {
        kind: "compare",
        at: 19,
        left: { title: "以前", items: ["来回跳工具"] },
        right: { title: "现在", items: ["一条流程跑完"] },
      },
      { kind: "code", at: 25, code: "topic -> script -> publish" },
    ]));

    expect(html).toContain("width:1000px");
    expect(html).toContain("height:420px");
    expect(html).toContain("height:440px");
    expect(html).toContain("height:400px");
    expect(html).toContain("font-size:52px");
    expect(html).toContain("font-size:132px");
    expect(html).toContain("font-size:38px");
    expect(html).toContain("width:920px");
    expect(html).not.toContain("width:620px");
    expect(html).not.toContain("font-size:30px;font-weight:800");
  });

  it("相邻信息卡复用同一舞台并持续承接到下一个主视觉，场内不留下黑屏空档", () => {
    const html = generateVideoRenderHtml(vProps([
      { kind: "quote", at: 1, text: "先抛出结论" },
      { kind: "list", at: 6, items: [{ text: "第一步" }, { text: "第二步" }] },
      { kind: "stat", at: 12, value: "3", unit: "步", label: "形成完整动作" },
    ]));
    const cards = [...html.matchAll(
      /id="c\d+"[^>]*data-start="([\d.]+)" data-duration="([\d.]+)"[^>]*top:(\d+)px/g,
    )].map((match) => ({
      start: Number(match[1]),
      duration: Number(match[2]),
      top: Number(match[3]),
    }));

    expect(cards).toHaveLength(3);
    expect(cards.every((card) => card.top >= 1300 && card.top <= 1550)).toBe(true);
    expect(cards[0]).toMatchObject({ start: 1, duration: 5 });
    expect(cards[1]).toMatchObject({ start: 6, duration: 6 });
    expect(cards[2]).toMatchObject({ start: 12, duration: 18 });
  });
});

describe("collectMediaFiles", () => {
  it("口播+B-roll 视频与 image 卡图片全收齐、去重", () => {
    const media = collectMediaFiles(fullProps());
    expect(media.videos).toEqual(["th.mp4", "rec_site_click.mp4", "rec_codex_ui.mp4"]);
    expect(media.images).toEqual(["shots/page_01.png"]);
  });
});

describe("generateVideoRenderHtml · 图片 B-roll", () => {
  it("[T-548] 图片必须使用 img 渲染，不能把截图文件塞进 video 后留下黑框", () => {
    const imageBrollProps = videoRenderProps.parse({
      ...fullProps(),
      scenes: [
        {
          id: "s1",
          label: "SCENE 1",
          title: "价格与计费",
          startSec: 0,
          endSec: 8,
          cards: [],
        },
      ],
      broll: [
        {
          at: 1,
          file: "shot.png",
          label: "截图·Kimi K2.6 - Kimi API Platform",
          durationSec: 4,
        },
      ],
    });

    const html = generateVideoRenderHtml(imageBrollProps, {
      imageFiles: new Set(["shot.png"]),
    });

    expect(html).toContain('<img id="');
    expect(html).toContain('src="media/shot.png"');
    expect(html).not.toMatch(/<video[^>]+src="media\/shot\.png"/);
  });

  it("携带源尺寸时生成的媒体框保持竖图比例", () => {
    const imageBrollProps = videoRenderProps.parse({
      ...fullProps(),
      scenes: [
        {
          id: "s1",
          label: "编辑标签",
          title: "编辑标题",
          startSec: 0,
          endSec: 8,
          cards: [],
        },
      ],
      broll: [
        {
          at: 1,
          file: "portrait.png",
          label: "竖版图片",
          durationSec: 4,
          presentation: "large_stage",
          sourceWidth: 1080,
          sourceHeight: 1920,
        },
      ],
    });
    const html = generateVideoRenderHtml(imageBrollProps, {
      imageFiles: new Set(["portrait.png"]),
    });
    expect(html).toContain('src="media/portrait.png"');
    expect(html).toMatch(/src="media\/portrait\.png"[^>]+width:416px;height:740px/);
  });
});
