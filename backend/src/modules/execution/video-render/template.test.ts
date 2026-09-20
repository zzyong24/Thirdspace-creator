// [T-254a] HyperFrames 模板生成器单测:快照锚定(改模板必须显式重锚)+ 关键规则
// 断言(PiP 规则/双语字幕夹断/媒体清单)。
import { describe, expect, it } from "vitest";
import { videoRenderProps, type VideoRenderProps } from "@creatoros/contract";
import {
  assertPortraitPipSpacing,
  assertVideoLayoutSafety,
  collectMediaFiles,
  estimateWrappedLines,
  fitMediaRect,
  generateVideoRenderHtml,
  resolveSceneMode,
  stabilizeVideoLayoutSafety,
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

  it("[T-1018] 竖屏人物在片尾切换布局时不延长主时间线", () => {
    const props = fullProps();
    const html = generateVideoRenderHtml({
      ...props,
      delivery: { width: 1080, height: 1920, fps: 30 },
      broll: [],
      scenes: [{
        id: "tail",
        label: "片尾",
        title: "片尾内容",
        startSec: 0,
        endSec: 60,
        role: "body",
        cards: [{ kind: "quote", at: 59.8, text: "片尾信息" }],
      }],
    });
    expect(html).toMatch(/tl\.to\("#th",\{[^\n]*duration:0\.20[^\n]*\},59\.80\);/);
    expect(html).not.toMatch(/tl\.to\("#th",\{[^\n]*\},60\.00\);/);
  });

  it("双语字幕:SRT 主时钟,重叠行被夹断(end 夹到下一行 start-0.02)", () => {
    const html = generateVideoRenderHtml(fullProps());
    // 第 2 行 end=5.2 但下一行 start=5.3 → duration = 5.28-2.50 = 2.78
    expect(html).toContain('id="cap1" class="clip" data-start="2.50" data-duration="2.70"');
    expect(html).toContain("An idea on the way home"); // 英文副行
    expect(html).toContain("我没写代码也没画图");
  });

  it("[T-858 RED] 竖屏双语字幕放大分层，并只在 AI 声明时间窗强调真实字符", () => {
    const props = fullProps();
    const html = generateVideoRenderHtml({
      ...props,
      delivery: { width: 1080, height: 1920, fps: 30 },
      captions: [
        {
          start: 0,
          end: 3,
          cn: "效率提升 47%",
          en: "47% more efficient",
          emphasis: [
            {
              text: "47%",
              startChar: 5,
              endChar: 8,
              startSec: 1.2,
              endSec: 2,
            },
          ],
        },
      ],
    });
    expect(html).toContain('class="caption-shell"');
    expect(html).toContain('class="caption-cn"');
    expect(html).toContain("font-size:48px");
    expect(html).toContain('class="caption-en"');
    expect(html).toContain("font-size:28px");
    expect(html).toContain('id="cap0e0" class="caption-emphasis"');
    expect(html).toContain('tl.set("#cap0e0",{color:');
    expect(html).toContain(",1.20);");
    expect(html).toContain(",2.00);");
  });

  it("B-roll 视频自身是 clip(帧捕获协议)且 durationSec 截断生效", () => {
    const html = generateVideoRenderHtml(fullProps());
    expect(html).toContain('src="media/rec_site_click.mp4" aria-label="真实录屏 · 能点的网站" muted preload="auto" data-start="9.00"');
    // rec_codex_ui at=31 dur=5 → data-duration="5.00"(非播到场景尾 38-31=7)
    expect(html).toMatch(/src="media\/rec_codex_ui\.mp4" aria-label="Codex 出 UI" muted preload="auto" data-start="31\.00" data-duration="5\.00"/);
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

  it("[T-858 RED] 竖屏两步动态内容占据主舞台，而不是缩成中间一条小卡", () => {
    const props = videoRenderProps.parse({
      meta: { title: "竖屏动态内容" },
      talkingHead: { file: "th.mp4", durationSec: 8 },
      delivery: { width: 1080, height: 1920, fps: 30 },
      scenes: [
        {
          id: "s1",
          label: "LOOP",
          title: "完整循环",
          startSec: 0,
          endSec: 8,
          cards: [
            {
              kind: "quote",
              at: 0,
              text: "选题 → 写稿",
              visualPlan: {
                relation: "sequence",
                parts: [
                  { text: "选题", role: "step" },
                  { text: "写稿", role: "step" },
                ],
              },
            },
          ],
        },
      ],
    });
    const html = generateVideoRenderHtml(props);
    expect(html).toContain("width:1000px;height:720px");
    expect(html).toContain('viewBox="0 0 964 664"');
    expect(html).toContain("width:154px;height:154px");
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
    expect(html).toContain("top:448px");
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

  it("[T-803 RED] 无人物横竖舞台的核心视觉主体不能缩成中部小图标", () => {
    const make = (width: number, height: number) => generateVideoRenderHtml(videoRenderProps.parse({
      meta: { title: "主体比例" },
      talkingHead: { file: "th.mp4", durationSec: 8 },
      delivery: { width, height, fps: 24 },
      scenes: [{
        id: "s1", label: "L", title: "T", startSec: 0, endSec: 8,
        cards: [{
          kind: "quote", at: 0, text: "功能越堆越多，任务越来越难",
          visualPlan: {
            relation: "contrast",
            parts: [
              { text: "功能越堆越多", role: "old" },
              { text: "任务越来越难", role: "new" },
            ],
            scene: {
              cognitiveGoal: "看见功能堆积压住路径",
              layout: "split",
              aspectStrategy: "reflow",
              entities: [
                { id: "features", kind: "tile_collection", glyph: "feature", semantic: "功能堆积" },
                { id: "route", kind: "path", glyph: "route", semantic: "任务路径" },
              ],
              beats: [
                { action: "overflow", target: "features", start: 0, duration: 0.5, from: { count: 2 }, to: { count: 9 } },
                { action: "compress", target: "route", start: 0.45, duration: 0.4, from: { scale: 1 }, to: { scale: 0.45 } },
              ],
            },
          },
        }],
      }],
    }), { visualOnly: true });

    const landscape = make(1920, 1080);
    expect(landscape).toMatch(/data-entity-id="features"[^>]+width:[6-9]\d{2}px;height:4\d{2}px/);
    expect(landscape).toMatch(/data-entity-id="route"[^>]+width:[7-9]\d{2}px;height:3\d{2}px/);

    const portrait = make(1080, 1920);
    expect(portrait).toMatch(/data-entity-id="features"[^>]+width:[6-9]\d{2}px;height:4\d{2}px/);
    expect(portrait).toMatch(/data-entity-id="route"[^>]+width:[7-9]\d{2}px;height:3\d{2}px/);
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
  it("body 无视觉节点仍保持右侧人物，左舞台交给可溯内容动效兜底", () => {
    expect(resolveSceneMode({ ...props.scenes[1]!, cards: [] }, 0)).toBe("right");
  });
  it("横屏 large_stage 强制人物留在右侧安全框，禁止素材盖脸后只露半张脸", () => {
    expect(
      resolveSceneMode({ ...props.scenes[1]!, cards: [] }, 1, {
        hasLargeStage: true,
        portrait: false,
      }),
    ).toBe("right");
  });
  it("[T-858 RED] 竖屏场景基底几何不因稍后存在 large_stage 而改变", () => {
    expect(
      resolveSceneMode({ ...props.scenes[1]!, cards: [] }, 1, {
        hasLargeStage: true,
        portrait: true,
      }),
    ).toBe("right");
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
  it("[T-841/T-876] 用原句动效承接空窗，竖版人物保持稳定右栏而不居中放大", () => {
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

    expect(html).toContain('<div id="thAmbient"');
    expect(html).toContain('class="clip talking-head-ambient-static"');
    expect(html).not.toContain('<video id="thAmbient"');
    expect(html).not.toContain('filter:blur(42px)');
    expect(html).toContain('id="th"');
    expect(html).toContain("left:1330px;top:138px;width:500px;height:804px");
    expect(html).toContain("landscape-gap-content");
    expect(html).toContain("一个下班路上的想法");
    expect(html).not.toContain("left:688px;top:56px;width:544px;height:968px");
  });

  it("[T-839/T-841] 横屏即使本场稍后有素材，也预铺低成本静态氛围底承接素材前后的短空窗", () => {
    const props = fullProps();
    const html = generateVideoRenderHtml({
      ...props,
      scenes: [
        {
          id: "has-later-visual",
          label: "L",
          title: "稍后进入素材",
          startSec: 0,
          endSec: 8,
          role: "body",
          cards: [],
        },
      ],
      talkingHead: { ...props.talkingHead, durationSec: 8 },
      broll: [
        {
          at: 3.3,
          file: "later.png",
          label: "稍后主图",
          big: false,
          durationSec: 3,
          presentation: "large_stage",
          visualRole: "still_image",
          motion: "static",
        },
      ],
    }, { imageFiles: new Set(["later.png"]) });

    expect(html).toContain('<div id="thAmbient"');
    expect(html).not.toContain('<video id="thAmbient"');
    expect(html).toContain('data-duration="8.00" data-track-index="899"');
    expect(html).toContain(
      'tl.set("#th",{left:1330,top:138,width:500,height:804,borderRadius:18,zIndex:900,autoAlpha:1},0.00);',
    );
    expect(html).toContain("landscape-gap-content");
    expect(html).not.toContain("left:688,top:56,width:544,height:968");
  });

  it("[T-876] 横屏场景内部时间洞必须补原句动效，人物禁止切到居中主体位", () => {
    const props = fullProps();
    const html = generateVideoRenderHtml({
      ...props,
      talkingHead: { ...props.talkingHead, durationSec: 12 },
      scenes: [
        {
          id: "timeline-hole",
          label: "L",
          title: "场景内部空洞",
          startSec: 0,
          endSec: 12,
          role: "body",
          cards: [
            {
              kind: "quote",
              at: 0,
              text: "先给出一个判断",
              tone: "muted",
            },
          ],
        },
      ],
      direction: {
        motionThesis: "信息卡结束后回到人物，再由真实素材接管。",
        beatGraph: [
          {
            id: "opening-card",
            sceneIdx: 0,
            startSec: 0,
            endSec: 3,
            subject: { kind: "card", ref: "card:0:0" },
            startState: "off_canvas",
            endState: "takeover",
            motionVerb: "reveal",
            stageMode: "takeover",
            transitionIn: "cut",
            transitionOut: "cut",
            returnGeometry: "same_base",
          },
          {
            id: "later-material",
            sceneIdx: 0,
            startSec: 8,
            endSec: 12,
            subject: { kind: "broll", ref: "broll:later.png" },
            startState: "off_canvas",
            endState: "takeover",
            motionVerb: "replace",
            stageMode: "takeover",
            transitionIn: "cut",
            transitionOut: "cut",
            returnGeometry: "same_base",
          },
        ],
      },
      broll: [
        {
          at: 8,
          file: "later.png",
          label: "后半段真实素材",
          big: false,
          durationSec: 4,
          presentation: "large_stage",
          visualRole: "still_image",
          motion: "static",
        },
      ],
    }, { imageFiles: new Set(["later.png"]) });

    expect(html).toContain(
      'tl.set("#th",{left:1330,top:138,width:500,height:804,borderRadius:18,zIndex:900,autoAlpha:1},0.00);',
    );
    expect(html).toContain("landscape-gap-content");
    expect(html).toContain("两三个小时它就能用了");
    expect(html).not.toContain("left:688,top:56,width:544,height:968");
    expect(html).not.toContain('tl.to("#th",{scale:1.025');
  });
});

describe("竖屏界面素材可读性", () => {
  it("[T-902 RED] 横图、方图和竖图都保留安全 PiP，不再用隐藏人物化解冲突", () => {
    const base = fullProps();
    const input = videoRenderProps.parse({
      ...base,
      delivery: { width: 1080, height: 1920, fps: 30 },
      broll: [
        {
          at: 9,
          file: "landscape.mp4",
          durationSec: 4,
          label: "横版录屏",
          presentation: "full_frame",
          visualRole: "screen_recording",
          speakerMode: "pip_bottom_left",
          sourceWidth: 1920,
          sourceHeight: 1080,
        },
        {
          at: 18,
          file: "square.mp4",
          durationSec: 4,
          label: "方形录屏",
          presentation: "full_frame",
          visualRole: "screen_recording",
          speakerMode: "pip_bottom_left",
          sourceWidth: 1024,
          sourceHeight: 1024,
        },
        {
          at: 31,
          file: "portrait.mp4",
          durationSec: 4,
          label: "竖版录屏",
          presentation: "full_frame",
          visualRole: "screen_recording",
          speakerMode: "pip_bottom_left",
          sourceWidth: 1080,
          sourceHeight: 1920,
        },
      ],
    });

    const stabilized = stabilizeVideoLayoutSafety(input);

    expect(stabilized.props.broll.map((item) => item.speakerMode)).toEqual([
      "pip_bottom_left",
      "pip_bottom_left",
      "pip_bottom_left",
    ]);
    expect(stabilized.fallbacks).toEqual([]);
    expect(() => assertVideoLayoutSafety(stabilized.props)).not.toThrow();
  });

  it("[T-902 RED] 竖屏旧候选明确 hidden 也收敛为人物常驻", () => {
    const base = fullProps();
    const input = videoRenderProps.parse({
      ...base,
      delivery: { width: 1080, height: 1920, fps: 30 },
      broll: [
        {
          at: 9,
          file: "square.png",
          durationSec: 4,
          label: "方图",
          presentation: "large_stage",
          visualRole: "still_image",
          speakerMode: "hidden",
          sourceWidth: 1024,
          sourceHeight: 1024,
        },
      ],
    });

    const stabilized = stabilizeVideoLayoutSafety(input);
    expect(stabilized.props).not.toBe(input);
    expect(stabilized.props.broll[0]?.speakerMode).toBe("pip_bottom_left");
    expect(stabilized.fallbacks).toEqual([
      expect.objectContaining({
        file: "square.png",
        from: "hidden",
        to: "pip_bottom_left",
        reason: "竖屏人脸常驻",
      }),
    ]);
    expect(() => assertVideoLayoutSafety(stabilized.props)).not.toThrow();
  });

  it("[T-860 RED] 人物框必须同时离开素材可见底边和双语字幕安全区", () => {
    const media = { x: 0, y: 556, width: 1080, height: 608 };
    expect(() =>
      assertPortraitPipSpacing({
        canvasHeight: 1920,
        media,
        pip: { left: 54, top: 1090, width: 320, height: 569, borderRadius: 24 },
      }),
    ).toThrow(/人物框与素材可见边界重叠/);
    expect(() =>
      assertPortraitPipSpacing({
        canvasHeight: 1920,
        media,
        pip: { left: 54, top: 1188, width: 264, height: 469, borderRadius: 24 },
      }),
    ).not.toThrow();
    expect(() =>
      assertPortraitPipSpacing({
        canvasHeight: 1920,
        media,
        pip: { left: 54, top: 1240, width: 264, height: 469, borderRadius: 24 },
      }),
    ).toThrow(/人物框进入字幕安全区/);
  });

  it("[T-859 RED] direction 下连续两段竖屏素材只把同一人物收进左下角一次，并提前加载平滑淡入", () => {
    const props = fullProps();
    const html = generateVideoRenderHtml({
      ...props,
      delivery: { width: 1080, height: 1920, fps: 30 },
      scenes: [
        {
          ...props.scenes[0]!,
          id: "portrait-materials",
          startSec: 0,
          endSec: 8,
          cards: [],
          special: undefined,
        },
      ],
      talkingHead: { ...props.talkingHead, durationSec: 8 },
      direction: {
        motionThesis: "人物平滑收进左下角，连续素材只交接主画面。",
        beatGraph: [
          {
            id: "material-1",
            sceneIdx: 0,
            startSec: 1,
            endSec: 4,
            subject: { kind: "broll", ref: "broll:screen-1.mp4" },
            startState: "off_canvas",
            endState: "takeover",
            motionVerb: "enter",
            stageMode: "takeover",
            transitionIn: "fade",
            transitionOut: "fade",
            returnGeometry: "same_base",
          },
          {
            id: "material-2",
            sceneIdx: 0,
            startSec: 4,
            endSec: 7,
            subject: { kind: "broll", ref: "broll:screen-2.mp4" },
            startState: "off_canvas",
            endState: "takeover",
            motionVerb: "replace",
            stageMode: "takeover",
            transitionIn: "fade",
            transitionOut: "fade",
            returnGeometry: "same_base",
          },
        ],
      },
      broll: [
        {
          at: 1,
          file: "screen-1.mp4",
          durationSec: 3,
          label: "第一段操作",
          big: false,
          presentation: "full_frame",
          visualRole: "screen_recording",
          speakerMode: "pip_bottom_left",
          sourceWidth: 1920,
          sourceHeight: 1080,
        },
        {
          at: 4,
          file: "screen-2.mp4",
          durationSec: 3,
          label: "第二段操作",
          big: false,
          presentation: "full_frame",
          visualRole: "screen_recording",
          speakerMode: "pip_bottom_left",
          sourceWidth: 1920,
          sourceHeight: 1080,
        },
      ],
    });

    expect(html).toContain('preload="auto"');
    expect(html).toContain('tl.set("#th",{zIndex:945}');
    expect(html).toContain("left:54,top:1188,width:264,height:469,borderRadius:24");
    expect(
      html.match(/left:54,top:1188,width:264,height:469,borderRadius:24/g),
    ).toHaveLength(1);
    expect(html).toMatch(
      /tl\.fromTo\("#br\d+v",\{autoAlpha:0[^}]*\},\{autoAlpha:1[^}]*duration:\.2/,
    );
    expect(html).not.toMatch(
      /tl\.set\("#br\d+v",\{autoAlpha:1,y:0,scale:1\},(?:1\.00|4\.00)\)/,
    );
  });

  it("[T-902 RED] 竖屏卡片和历史 hidden 素材连续覆盖整段时真人仍全程可见", () => {
    const props = fullProps();
    const html = generateVideoRenderHtml({
      ...props,
      delivery: { width: 1080, height: 1920, fps: 30 },
      talkingHead: { ...props.talkingHead, durationSec: 8 },
      scenes: [
        {
          ...props.scenes[0]!,
          id: "presenter-first",
          startSec: 0,
          endSec: 8,
          cards: [
            { kind: "quote", at: 0, text: "卡片只能辅助真人", tone: "accent" },
          ],
          special: undefined,
        },
      ],
      direction: {
        motionThesis: "竖屏真人持续讲解，卡片与素材只做辅助。",
        beatGraph: [
          {
            id: "supporting-card",
            sceneIdx: 0,
            startSec: 0,
            endSec: 3,
            subject: { kind: "card", ref: "card:0:0" },
            startState: "base",
            endState: "takeover",
            motionVerb: "reveal",
            stageMode: "takeover",
            transitionIn: "fade",
            transitionOut: "fade",
            returnGeometry: "same_base",
          },
          {
            id: "legacy-hidden-material",
            sceneIdx: 0,
            startSec: 3,
            endSec: 8,
            subject: { kind: "broll", ref: "broll:screen.mp4" },
            startState: "off_canvas",
            endState: "takeover",
            motionVerb: "replace",
            stageMode: "takeover",
            transitionIn: "fade",
            transitionOut: "fade",
            returnGeometry: "same_base",
          },
        ],
      },
      broll: [
        {
          at: 3,
          file: "screen.mp4",
          durationSec: 5,
          label: "历史候选录屏",
          big: false,
          presentation: "full_frame",
          visualRole: "screen_recording",
          speakerMode: "hidden",
          sourceWidth: 1080,
          sourceHeight: 1920,
        },
      ],
    });

    expect(html).not.toMatch(/(?:to|set)\("#th",\{[^}]*autoAlpha:0/);
    expect(html).toContain('tl.set("#th",{zIndex:945}');
    expect(html.match(/left:54,top:1188,width:264,height:469,borderRadius:24/g)).toHaveLength(1);
  });

  it("[T-858 RED] full_frame 横录屏保留完整前景，并用静态统一舞台承接而非第二路动态视频", () => {
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
          speakerMode: "hidden",
          sourceWidth: 1920,
          sourceHeight: 1080,
        },
      ],
    });
    expect(html).toContain("left:0px;top:0px;z-index:940");
    expect(html).toContain("width:1080px;height:1920px");
    expect(html).toContain('class="clip portrait-stage-ambient-static"');
    expect(html).not.toContain('class="clip portrait-ambient-fill"');
    expect(html).not.toMatch(/<video[^>]+aria-hidden="true"[^>]+screen\.mp4/);
    // 1920×1080 完整前景按 contain 居中，并为左下常驻人物与字幕保留安全区。
    expect(html).toContain("left:54px;top:357px;width:972px;height:547px");
    expect(html).toContain("object-fit:contain");
    expect(html).toContain("z-index:942");
    expect(html).toContain('tl.set("#th",{zIndex:945}');
    expect(html).toContain("bottom:92px;text-align:center;z-index:950");
  });

  it("[T-902] 竖屏素材作为辅助画面时人物收进左下角并持续可见", () => {
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
    expect(html).toContain('tl.set("#th",{zIndex:945}');
    expect(html).toContain("left:54,top:1188,width:264,height:469,borderRadius:24");
    expect(html).not.toMatch(/(?:to|set)\("#th",\{[^}]*autoAlpha:0/);
    expect(html).toContain("z-index:942");
    expect(html).toContain('class="clip portrait-stage-ambient-static"');
  });

  it("[T-902] 竖屏动态内容出现时仍保留左下角人物陪伴", () => {
    const props = fullProps();
    const html = generateVideoRenderHtml({
      ...props,
      delivery: { width: 1080, height: 1920, fps: 30 },
      scenes: [
        {
          ...props.scenes[0]!,
          startSec: 0,
          endSec: props.talkingHead.durationSec,
          cards: [props.scenes[0]!.cards[0]!],
          special: undefined,
        },
      ],
      broll: [],
    });
    expect(html).toMatch(/id="c\d+"[^>]+top:\d+px[^>]+z-index:942/);
    expect(html).toContain('class="clip portrait-card-stage-ambient-static"');
    expect(html).toContain("#11131f 100%),#11131f");
    expect(html).toContain('tl.set("#th",{zIndex:945}');
    expect(html).toContain("left:54,top:1188,width:264,height:469,borderRadius:24");
    expect(html).not.toMatch(/(?:to|set)\("#th",\{[^}]*autoAlpha:0/);
  });

  it("[T-858 RED] 正式渲染安全门按竖屏素材窗内 PiP 检查，不把全画布人物基底误判成遮挡", () => {
    const props = fullProps();
    expect(() =>
      assertVideoLayoutSafety({
        ...props,
        delivery: { width: 1080, height: 1920, fps: 30 },
        broll: [
          {
            at: 9,
            file: "landscape-stage.mp4",
            durationSec: 8,
            label: "横版操作证据",
            big: false,
            presentation: "large_stage",
            visualRole: "screen_recording",
            sourceWidth: 1920,
            sourceHeight: 1080,
          },
        ],
      }),
    ).not.toThrow();
  });

  it("[T-858 RED] large_stage 横图无边框完整 contain，静态承接层覆盖整张竖屏而非上黑卡", () => {
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
    expect(html).toContain('class="clip portrait-stage-ambient-static"');
    expect(html).toContain("#10121c 100%),#10121c");
    expect(html).not.toContain('class="clip portrait-ambient-fill"');
    expect(html).toContain(
      "left:54px;top:92px;z-index:941;padding:10px;width:972px;height:1076px",
    );
    expect(html).toContain("left:54px;top:357px;width:972px;height:547px");
    expect(html).toContain("object-fit:contain");
    expect(html).toContain("left:0px;top:0px;z-index:940;width:1080px;height:1920px;background:radial-gradient");
    expect(html).toMatch(
      /src="media\/landscape-photo\.jpg"[^>]+object-fit:contain;background:transparent;/,
    );
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

  it("横屏 full_frame 录屏独占画布，不再自动保留人物画中画", () => {
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
          speakerMode: "hidden",
        },
      ],
    });
    expect(html).toContain("left:0px;top:0px;z-index:940");
    expect(html).toContain("width:1920px;height:1080px");
    expect(html).toContain("left:0px;top:0px;width:1920px;height:1080px;z-index:941");
    expect(html).not.toContain('tl.set("#th",{zIndex:945}');
    expect(html).not.toMatch(/tl\.to\("#th",\{left:/);
    expect(html).toContain("bottom:56px;text-align:center;z-index:950");
  });

  it("旧候选 pip_bottom_left 仅可读兼容，不再生成侧栏位移或缩窄动画", () => {
    const props = fullProps();
    const html = generateVideoRenderHtml({
      ...props,
      broll: [
        {
          at: 9,
          file: "legacy-screen.mp4",
          durationSec: 3,
          label: "旧录屏候选",
          big: false,
          presentation: "full_frame",
          visualRole: "screen_recording",
          speakerMode: "pip_bottom_left",
        },
      ],
    });
    expect(html).not.toContain('tl.set("#th",{zIndex:945}');
    expect(html).not.toMatch(/tl\.to\("#th",\{(?:left|top|width|height):/);
  });

  it("[T-858 RED] direction 存在时缺少素材 beat 必须失败，不能退回旧时间线偷偷叠画面", () => {
    const props = fullProps();
    expect(() =>
      generateVideoRenderHtml({
        ...props,
        scenes: props.scenes.map((scene) => ({ ...scene, cards: [] })),
        direction: {
          motionThesis: "只有明确主语才能上屏。",
          beatGraph: [
            {
              id: "person-only",
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
          ],
        },
        broll: [
          {
            at: 9,
            file: "unplanned.mp4",
            durationSec: 3,
            label: "没有导演 beat 的素材",
            big: false,
            presentation: "full_frame",
            visualRole: "screen_recording",
            speakerMode: "hidden",
          },
        ],
      }),
    ).toThrow(/direction 缺少 broll:unplanned\.mp4/);
  });

  it("开场 full_frame 录屏选择 hidden 时覆盖人物且不生成画中画抬层动画", () => {
    const props = fullProps();
    const opening = generateVideoRenderHtml({
      ...props,
      scenes: [
        { ...props.scenes[0]!, startSec: 0.05 },
        ...props.scenes.slice(1),
      ],
      broll: [
        {
          at: 0,
          file: "opening-screen.mp4",
          durationSec: 3,
          label: "开场真实操作",
          big: false,
          presentation: "full_frame",
          visualRole: "screen_recording",
          speakerMode: "hidden",
        },
      ],
    });
    expect(opening).toContain("left:0px;top:0px;z-index:940");
    expect(opening).toContain('data-start="0.00"');
    expect(opening).not.toContain('tl.set("#th",{zIndex:945}');
    expect(opening).toMatch(
      /tl\.set\("#br\d+v",\{autoAlpha:1,y:0,scale:1\},0\.00\)/,
    );
    expect(opening).not.toMatch(/tl\.fromTo\("#br\d+v",\{autoAlpha:0/);
    expect(() =>
      assertVideoLayoutSafety({
        ...props,
        broll: [
          {
            at: 0,
            file: "opening-screen.mp4",
            durationSec: 3,
            label: "开场真实操作",
            big: false,
            presentation: "full_frame",
            visualRole: "screen_recording",
            speakerMode: "hidden",
          },
        ],
      }),
    ).not.toThrow();
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
    expect(cards.every((card) => card.top >= 520 && card.top <= 700)).toBe(true);
    expect(html).toContain("portrait-card-stage-ambient-static");
    expect(html).toContain('tl.set("#th",{zIndex:945}');
    expect(html.match(/left:54,top:1188,width:264,height:469,borderRadius:24/g)).toHaveLength(1);
    expect(html).not.toMatch(/(?:to|set)\("#th",\{[^}]*autoAlpha:0/);
    expect(cards[0]).toMatchObject({ start: 1, duration: 5 });
    expect(cards[1]).toMatchObject({ start: 6, duration: 6 });
    expect(cards[2]).toMatchObject({ start: 12, duration: 18 });
  });

  it("[T-823] 辅助素材进场也必须结束上一张大卡，禁止把真实图藏在卡片后面", () => {
    const props = vProps([{ kind: "quote", at: 1, text: "模式层" }]);
    props.broll = [
      {
        at: 6,
        file: "architecture.png",
        label: "四层架构图",
        big: false,
        durationSec: 8,
        presentation: "overlay",
        visualRole: "still_image",
        motion: "static",
      },
    ];
    const html = generateVideoRenderHtml(props, {
      imageFiles: new Set(["architecture.png"]),
    });
    const card = html.match(
      /id="c\d+"[^>]*data-start="([\d.]+)" data-duration="([\d.]+)"/,
    );

    expect(card?.[1]).toBe("1.00");
    expect(card?.[2]).toBe("5.00");
    expect(html).toContain('src="media/architecture.png"');
  });

  it("[T-858 RED] direction 下明确辅助 overlay 可附着人物基底，但不驱动接管或人物几何", () => {
    const props = vProps([]);
    props.direction = {
      motionThesis: "人物是主语，辅助图只做附着说明。",
      beatGraph: [
        {
          id: "person_base",
          sceneIdx: 0,
          startSec: 0,
          endSec: 6,
          subject: { kind: "talking_head", ref: "talking_head" },
          startState: "base",
          endState: "base",
          motionVerb: "hold",
          stageMode: "base",
          transitionIn: "cut",
          transitionOut: "cut",
          returnGeometry: "not_applicable",
        },
      ],
    };
    props.broll = [
      {
        at: 1,
        file: "badge.png",
        label: "辅助标记",
        big: false,
        durationSec: 3,
        presentation: "overlay",
        visualRole: "still_image",
        motion: "static",
      },
    ];
    const html = generateVideoRenderHtml(props, { imageFiles: new Set(["badge.png"]) });
    expect(html).toContain('src="media/badge.png"');
    expect(html).not.toContain("portrait-stage-ambient-static");
    expect(html).not.toMatch(/tl\.to\("#th",\{(?:left|top|width|height|scale):/);
  });

  it("[T-823] 主图持续期间的新卡降为舞台外短标注，不再生成遮图大卡", () => {
    const props = vProps([
      { kind: "quote", at: 2, text: "模式层 · 标准 / PTC / 极简 / 创造" },
      { kind: "quote", at: 8, text: "可观测层 · append-only 事件流" },
    ]);
    props.broll = [
      {
        at: 0,
        file: "architecture.png",
        label: "四层架构图",
        big: false,
        durationSec: 14,
        presentation: "large_stage",
        visualRole: "still_image",
        motion: "static",
      },
    ];
    const html = generateVideoRenderHtml(props, {
      imageFiles: new Set(["architecture.png"]),
    });
    const annotations = [...html.matchAll(
      /class="clip main-visual-annotation"[^>]*data-start="([\d.]+)" data-duration="([\d.]+)"[^>]*top:(\d+)px;[^>]*height:(\d+)px/g,
    )].map((match) => ({
      start: Number(match[1]),
      duration: Number(match[2]),
      top: Number(match[3]),
      height: Number(match[4]),
    }));

    expect(annotations).toHaveLength(2);
    expect(annotations[0]).toMatchObject({ start: 2, duration: 6 });
    expect(annotations[1]).toMatchObject({ start: 8, duration: 6 });
    expect(annotations.every((item) => item.top + item.height <= 240)).toBe(true);
    expect(html).toMatch(/main-visual-annotation[^>]+z-index:944/);
    const resumedCards = [...html.matchAll(
      /id="c\d+"[^>]*data-start="([\d.]+)" data-duration="([\d.]+)"/g,
    )].map((match) => ({
      start: Number(match[1]),
      duration: Number(match[2]),
    }));
    expect(resumedCards).toEqual([{ start: 14, duration: 16 }]);
  });

  it("[T-839 RED] 卡片落在 large_stage 尾部时不闪短标注，主图结束后恢复为信息卡接力", () => {
    const props = vProps([
      { kind: "list", at: 25, items: [{ text: "拆开上下文" }, { text: "流程才稳定" }] },
    ]);
    props.talkingHead.durationSec = 35.53;
    props.scenes[0]!.endSec = 35.53;
    props.broll = [
      {
        at: 21.4,
        file: "process.png",
        label: "流程图",
        big: false,
        durationSec: 4,
        presentation: "large_stage",
        visualRole: "still_image",
        motion: "static",
      },
    ];

    const html = generateVideoRenderHtml(props, {
      imageFiles: new Set(["process.png"]),
    });
    const resumedCard = html.match(
      /id="c\d+"[^>]*data-start="([\d.]+)" data-duration="([\d.]+)"/,
    );

    expect(html).not.toContain('class="clip main-visual-annotation"');
    expect(resumedCard?.[1]).toBe("25.40");
    expect(resumedCard?.[2]).toBe("10.13");
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
