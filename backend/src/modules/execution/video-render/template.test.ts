// [T-254a] HyperFrames 模板生成器单测:快照锚定(改模板必须显式重锚)+ 关键规则
// 断言(PiP 规则/双语字幕夹断/媒体清单)。
import { describe, expect, it } from "vitest";
import { videoRenderProps, type VideoRenderProps } from "@creatoros/contract";
import {
  collectMediaFiles,
  estimateWrappedLines,
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
    // 首场 hook(1 卡)→ right 态:竖版口播头居中 9:16 上半屏(thRight 竖版坐标)
    expect(html).toContain("left:210px;top:200px;width:600px;height:1066px");
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
    expect(html).toContain('src="media/rec_site_click.mp4" muted data-start="9.00"');
    // rec_codex_ui at=31 dur=5 → data-duration="5.00"(非播到场景尾 38-31=7)
    expect(html).toMatch(/src="media\/rec_codex_ui\.mp4" muted data-start="31\.00" data-duration="5\.00"/);
  });

  it("special 只由预设枚举渲染,AI 不写模板代码(pipeline 箭头线/steps 序号)", () => {
    const html = generateVideoRenderHtml(fullProps());
    expect(html).toContain("scaleX:0"); // pipeline 连接线动画
    expect(html).toContain(">VS<"); // comparison 中缝
    expect(html).toContain(">1</span>"); // steps 序号
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

describe("resolveSceneMode(PiP 规则:≥3 视觉节点→圆;hook/cta 且 <3 →右大卡)", () => {
  const props = fullProps();
  it("hook 场景 1 张卡 → right;cta 场景 → right", () => {
    expect(resolveSceneMode(props.scenes[0]!, 0)).toBe("right");
    expect(resolveSceneMode(props.scenes[5]!, 0)).toBe("right");
  });
  it("body 场景 ≥3 视觉节点(卡+B-roll)→ pip", () => {
    expect(resolveSceneMode(props.scenes[1]!, 1)).toBe("pip");
  });
  it("special 场景视觉权重拉满 → pip(即使 hook/cta)", () => {
    expect(resolveSceneMode({ ...props.scenes[2]!, role: "hook" }, 0)).toBe("pip");
  });
  it("hook 场景凑满 3 节点 → 规则压过 role,进 pip", () => {
    expect(resolveSceneMode(props.scenes[0]!, 2)).toBe("pip");
  });
  it("显式 mode 覆盖规则", () => {
    expect(resolveSceneMode({ ...props.scenes[1]!, mode: "right" }, 5)).toBe("right");
  });
  it("body 少节点默认 pip(口播为主的正文段不抢右侧)", () => {
    expect(resolveSceneMode({ ...props.scenes[1]!, cards: [] }, 0)).toBe("pip");
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

// [T-320b] 各 kind 高度改用估算器:长内容显著大于旧硬编码(证明不再低估)、短内容不塌。
// 走公开 API:竖版(1080×1920,rightEdge=1020)下放待测卡 + 一张会换行的卡,读第 2 张卡的
// top(= contentY.pip 340 + 第 1 张卡真实高度 + GAP 18),间接验证第 1 张卡高度随内容增长。
describe("各 kind 卡高随内容测高([T-320b] 不再低估)", () => {
  const CONTENT_Y = 340; // 竖版 contentY.pip
  const GAP = 18;

  /** 竖版单场景 props(待测卡在前,后跟换行卡)。 */
  function vProps(cards: unknown[]): VideoRenderProps {
    return videoRenderProps.parse({
      meta: { title: "测高" },
      talkingHead: { file: "th.mp4", durationSec: 30 },
      delivery: { width: 1080, height: 1920, fps: 30 },
      scenes: [{ id: "s1", label: "L", title: "T", startSec: 0, endSec: 30, cards }],
    });
  }

  /** 第 2 张卡的 top(反推第 1 张卡真实高度 = top - CONTENT_Y - GAP)。 */
  function secondCardTop(cards: unknown[]): number {
    const html = generateVideoRenderHtml(vProps(cards));
    const tops = [...html.matchAll(/id="c\d+"[^>]*top:(\d+)px/g)].map((m) => Number(m[1]));
    expect(tops.length).toBeGreaterThanOrEqual(2);
    return tops[1]!;
  }

  it("quote:金句换 3 行,高度 >> 旧固定 92(不再低估)且 > 单行短句", () => {
    const long = "一二三四五六七八九十".repeat(4); // 40 全角 → 3 行
    const longTop = secondCardTop([
      { kind: "quote", at: 1, text: long },
      { kind: "quote", at: 2, text: "占位" },
    ]);
    const shortTop = secondCardTop([
      { kind: "quote", at: 1, text: "短" },
      { kind: "quote", at: 2, text: "占位" },
    ]);
    const oldTop = CONTENT_Y + 92 + GAP; // 旧硬编码高度推的 top
    expect(longTop).toBeGreaterThan(oldTop);
    expect(longTop).toBeGreaterThan(shortTop);
  });

  it("stat:label 换 2 行,高度 > 旧固定 160(长 label 不再被吞)", () => {
    const longLabel = "一二三四五六七八九十".repeat(3); // 30 全角 @17px 在 316 宽 → 2 行
    const longTop = secondCardTop([
      { kind: "stat", at: 1, value: "42", label: longLabel },
      { kind: "quote", at: 2, text: "占位换行卡" },
    ]);
    const shortTop = secondCardTop([
      { kind: "stat", at: 1, value: "42", label: "短" },
      { kind: "quote", at: 2, text: "占位换行卡" },
    ]);
    const oldTop = CONTENT_Y + 160 + GAP;
    expect(longTop).toBeGreaterThan(oldTop);
    expect(longTop).toBeGreaterThan(shortTop);
  });

  it("list:3 条每条超一行,高度 >> 旧 60+items*50(每条单行的少算被修正)", () => {
    const longItem = "一二三四五六七八九十".repeat(3); // 30 全角 @26px 在 480 宽 → 2 行
    const longTop = secondCardTop([
      {
        kind: "list",
        at: 1,
        items: [{ text: longItem }, { text: longItem }, { text: longItem }],
      },
      { kind: "list", at: 2, items: [{ text: "占位" }] },
    ]);
    const shortTop = secondCardTop([
      {
        kind: "list",
        at: 1,
        items: [{ text: "甲" }, { text: "乙" }, { text: "丙" }],
      },
      { kind: "list", at: 2, items: [{ text: "占位" }] },
    ]);
    const oldTop = CONTENT_Y + (60 + 3 * 50) + GAP; // 旧:3 条 × 50
    expect(longTop).toBeGreaterThan(oldTop);
    expect(longTop).toBeGreaterThan(shortTop);
  });

  it("compare:窄半栏 item 换行,高度 > 旧 96+rows*32(每半栏 ~328 宽的少算被修正)", () => {
    const longItem = "一二三四五六七八九十".repeat(3); // 30 全角 @20px 在 328 宽 → 2 行
    const longTop = secondCardTop([
      {
        kind: "compare",
        at: 1,
        left: { title: "左", items: [longItem, longItem] },
        right: { title: "右", items: [longItem, longItem] },
      },
      { kind: "compare", at: 2, left: { title: "l", items: ["x"] }, right: { title: "r", items: ["y"] } },
    ]);
    const shortTop = secondCardTop([
      {
        kind: "compare",
        at: 1,
        left: { title: "左", items: ["甲", "乙"] },
        right: { title: "右", items: ["丙", "丁"] },
      },
      { kind: "compare", at: 2, left: { title: "l", items: ["x"] }, right: { title: "r", items: ["y"] } },
    ]);
    // 旧:96 + rows(2)*32 + bar 18 = 178
    const oldTop = CONTENT_Y + 178 + GAP;
    expect(longTop).toBeGreaterThan(oldTop);
    expect(longTop).toBeGreaterThan(shortTop);
  });

  it("code:pre-wrap 长行软换,高度 > 旧 64+lines*30(长行少算被修正)", () => {
    const longLine = "x".repeat(200); // 200 半角 @20px×0.6=12 → 2400 宽,在 680 宽 → 4 行
    const longTop = secondCardTop([
      { kind: "code", at: 1, code: longLine },
      { kind: "code", at: 2, code: "y" },
    ]);
    const shortTop = secondCardTop([
      { kind: "code", at: 1, code: "y" },
      { kind: "code", at: 2, code: "y" },
    ]);
    const oldTop = CONTENT_Y + (64 + 1 * 30) + GAP; // 旧:1 硬 \n 行 × 30
    expect(longTop).toBeGreaterThan(oldTop);
    expect(longTop).toBeGreaterThan(shortTop);
  });
});

describe("collectMediaFiles", () => {
  it("口播+B-roll 视频与 image 卡图片全收齐、去重", () => {
    const media = collectMediaFiles(fullProps());
    expect(media.videos).toEqual(["th.mp4", "rec_site_click.mp4", "rec_codex_ui.mp4"]);
    expect(media.images).toEqual(["shots/page_01.png"]);
  });
});
