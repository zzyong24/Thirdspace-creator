// [T-254a] HyperFrames HTML 模板生成器(纯函数:props → 完整 index.html 字符串)。
//
// e03 打法泛化(参照用户已验证形态 /Users/zyongzhu/Creative/e03-opendesign-hf/build_hf.py,
// SPEC 2026-07-11 execution-layer-video-pipeline §3.2):
//   - 场景容器(眉标/标题/副题)+ 六 kind 信息卡(stat/quote/list/compare/code/image);
//   - 口播头右大卡 ↔ 左下圆 PiP(规则:≥3 视觉节点 → pip;hook/cta 且 <3 → right);
//   - spotlight→dock 进场(autoAlpha+上移+轻微缩放落位);
//   - 双语字幕(SRT 主时钟,单轨夹断防重叠);
//   - 品牌角标 + 底部进度条;
//   - special 联想动画 = 预设枚举 3(pipeline/comparison/steps),AI 不写模板代码。
//
// HyperFrames 合成协议(npm hyperframes 0.7.x,已 10s 小样真渲验证):
//   #root[data-composition-id][data-duration] + .clip[data-start/data-duration/data-track-index]
//   + GSAP timeline 挂 window.__timelines["main"]。渲染器无关性留在 props 契约侧,
//   本文件是 HyperFrames 专用实现。
import type {
  VideoRenderBroll,
  VideoRenderCard,
  VideoRenderProps,
  VideoRenderScene,
  VideoRenderSpecial,
  VideoRenderTone,
} from "@creatoros/contract";

// ── 设计 token(Linear 系,与 e03 一致;v1 固定不外配)────────────────────────────
const TK = {
  bg: "#08090a",
  surface: "#191a1b",
  surface2: "#202122",
  fg: "#f7f8f8",
  fg2: "#d0d6e0",
  muted: "#8a8f98",
  meta: "#62666d",
  border: "rgba(255,255,255,0.08)",
  borderSoft: "rgba(255,255,255,0.05)",
  accent: "#5e6ad2",
  accentH: "#828fff",
  green: "#27a644",
  amber: "#eab308",
  danger: "#dc2626",
} as const;

function col(tone: VideoRenderTone): string {
  return TK[tone];
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 秒值统一两位小数(向下取整,与 build_hf.py f2 同规则)—— 输出确定性。 */
function f2(x: number): number {
  return Math.floor(x * 100) / 100;
}
function fmt(x: number): string {
  return f2(x).toFixed(2);
}

export interface TemplateOptions {
  /** GSAP 脚本相对路径(executor 把 gsap.min.js 落到工程根)。 */
  gsapSrc?: string;
  /** 媒体文件前缀(executor 把预处理后的素材落到工程 media/)。 */
  mediaPrefix?: string;
}

/** 场景口播头形态(规则 + 显式覆盖;快照测试锚定)。 */
export function resolveSceneMode(scene: VideoRenderScene, brollCount: number): "right" | "pip" {
  if (scene.mode) return scene.mode;
  const visualNodes = scene.cards.length + brollCount + (scene.special ? 3 : 0);
  if (visualNodes >= 3) return "pip";
  if (scene.role === "hook" || scene.role === "cta") return "right";
  return "pip";
}

const GAP = 18;

// [T-291] PiP 由整圆(143)改圆角矩形(24):配 object-fit:contain 时整圆会在圆内留黑弧,
// 圆角矩形的深色 letterbox 更干净。按 SPEC §2「保完整 > 圆形」。
interface LayoutBox {
  left: number;
  top: number;
  width: number;
  height: number;
  borderRadius: number;
}

// [T-290] 全套布局常量随画幅解析:横版(w≥h)沿用 1920x1080 原布局;竖版(h>w,抖音 9:16)
// 重排——口播头「主」态为居中 9:16 上半屏大图、「pip」态为左下气泡(在字幕之上);卡片 flow
// 内容区与 PiP 安全区按竖屏坐标重算。thRight=口播「主/right」态位,thPip=小窗态位;contentY/
// headRightInset/rightEdge 按态(right/pip)取值。竖版口播头默认按竖屏源(9:16)构图(contain)。
interface Layout {
  thRight: LayoutBox;
  thPip: LayoutBox;
  contentX: number;
  headTop: number;
  contentY: Record<"right" | "pip", number>;
  headRightInset: Record<"right" | "pip", number>;
  rightEdge: Record<"right" | "pip", number>;
  pipSafeX: number;
  pipSafeY: number;
}

function resolveLayout(width: number, height: number): Layout {
  if (height > width) {
    // 竖版 1080x1920(及等比):口播头上半屏、卡片下半屏纵向流。
    return {
      thRight: { left: 210, top: 200, width: 600, height: 1066, borderRadius: 20 },
      thPip: { left: 60, top: 1440, width: 300, height: 300, borderRadius: 24 },
      contentX: 60,
      headTop: 96,
      contentY: { right: 1300, pip: 340 },
      headRightInset: { right: 60, pip: 60 },
      rightEdge: { right: 1020, pip: 1020 },
      pipSafeX: 388,
      pipSafeY: 1420, // 左下 PiP 安全区(竖版):x < pipSafeX 且 y+h > pipSafeY 禁放
    };
  }
  // 横版 1920x1080(原布局,快照锚定不变)。
  return {
    thRight: { left: 1330, top: 138, width: 500, height: 804, borderRadius: 18 },
    thPip: { left: 84, top: 712, width: 286, height: 286, borderRadius: 24 },
    contentX: 120,
    headTop: 132,
    contentY: { right: 320, pip: 320 },
    headRightInset: { right: 720, pip: 120 },
    rightEdge: { right: 1180, pip: 1800 },
    pipSafeX: 405,
    pipSafeY: 660, // 左下 PiP 安全区(286×286 圆角矩形):x < pipSafeX 且 y+h > pipSafeY 禁放
  };
}

interface Ctx {
  clips: string[];
  tweens: string[];
  trackNo: number;
  mediaPrefix: string;
}

function nextTrack(ctx: Ctx): number {
  ctx.trackNo += 1;
  return ctx.trackNo;
}

function clip(
  ctx: Ctx,
  id: string,
  track: number,
  start: number,
  duration: number,
  style: string,
  inner = "",
): void {
  ctx.clips.push(
    `<div id="${id}" class="clip" data-start="${fmt(start)}" data-duration="${fmt(duration)}" data-track-index="${track}" style="position:absolute;${style}">${inner}</div>`,
  );
}

/** spotlight→dock 进场:autoAlpha+上移+轻微缩放落位;末尾淡出+硬关。 */
function appear(ctx: Ctx, id: string, at: number, endAt: number, y = 16): void {
  ctx.tweens.push(
    `tl.fromTo("#${id}",{autoAlpha:0,y:${y},scale:1.04},{autoAlpha:1,y:0,scale:1,duration:.45,ease:"power3.out"},${fmt(at)});`,
  );
  ctx.tweens.push(`tl.to("#${id}",{autoAlpha:0,duration:.3},${fmt(Math.max(at, endAt - 0.3))});`);
  ctx.tweens.push(`tl.set("#${id}",{autoAlpha:0},${fmt(endAt)});`);
}

const CARD_BASE = `background:${TK.surface};border:1px solid ${TK.border};border-radius:12px;box-shadow:rgba(0,0,0,.4) 0 2px 4px;`;

interface CardBox {
  width: number;
  height: number;
  style: string;
  inner: string;
}

// ── 六 kind 卡片渲染(尺寸为 flow 排布的预估占位)─────────────────────────────────
function renderCard(card: VideoRenderCard, mediaPrefix: string): CardBox {
  switch (card.kind) {
    case "stat": {
      const strike = card.strike
        ? `<span style="position:absolute;left:-6px;right:-6px;top:50%;height:4px;background:${TK.danger};transform:rotate(-12deg)"></span>`
        : "";
      const unit = card.unit
        ? `<span style="color:${TK.fg2};font-size:30px;font-weight:600">${esc(card.unit)}</span>`
        : "";
      return {
        width: 360,
        height: 160,
        style: `${CARD_BASE}padding:18px 22px;min-width:340px;`,
        inner:
          `<div style="color:${TK.muted};font-size:17px;font-weight:600">${esc(card.label)}</div>` +
          `<div style="display:flex;align-items:baseline;gap:10px"><span style="position:relative;color:${col(card.tone)};font-size:84px;font-weight:800;letter-spacing:-.03em;line-height:1">${esc(card.value)}${strike}</span>${unit}</div>`,
      };
    }
    case "quote":
      return {
        width: 620,
        height: 92,
        style: `background:${col(card.tone)}12;border:1px solid ${TK.border};border-left:3px solid ${col(card.tone)};border-radius:12px;padding:18px 22px;`,
        inner: `<span style="color:${TK.fg};font-size:30px;font-weight:700;letter-spacing:-.01em">${esc(card.text)}</span>`,
      };
    case "list": {
      const title = card.title
        ? `<div style="color:${TK.muted};font-size:18px;font-weight:700;margin-bottom:12px">${esc(card.title)}</div>`
        : "";
      const items = card.items
        .map(
          (item, i) =>
            `<div class="li li${i}" style="display:flex;align-items:center;gap:12px;margin-top:${i === 0 ? 0 : 10}px">` +
            `<span style="width:28px;height:28px;border-radius:14px;background:${col(item.tone)}22;color:${col(item.tone)};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;flex:none">✓</span>` +
            `<span style="color:${TK.fg};font-size:26px;font-weight:600">${esc(item.text)}</span></div>`,
        )
        .join("");
      return {
        width: 560,
        height: 60 + card.items.length * 50 + (card.title ? 34 : 0),
        style: `${CARD_BASE}padding:16px 20px;`,
        inner: title + items,
      };
    }
    case "compare": {
      const side = (s: { title: string; items: string[]; tone: VideoRenderTone }): string =>
        `<div style="flex:1;background:${col(s.tone)}10;border:1px solid ${col(s.tone)}66;border-radius:10px;padding:14px 16px">` +
        `<div style="color:${col(s.tone)};font-size:20px;font-weight:800">${esc(s.title)}</div>` +
        s.items
          .map(
            (t) =>
              `<div style="color:${TK.fg2};font-size:20px;font-weight:600;margin-top:8px">· ${esc(t)}</div>`,
          )
          .join("") +
        `</div>`;
      const rows = Math.max(card.left.items.length, card.right.items.length);
      return {
        width: 760,
        height: 96 + rows * 32,
        style: `${CARD_BASE}padding:14px;`,
        inner: `<div style="display:flex;gap:12px">${side(card.left)}${side(card.right)}</div>`,
      };
    }
    case "code": {
      const label = card.label
        ? `<div style="color:${TK.muted};font-size:17px;font-weight:600;margin-bottom:10px">${esc(card.label)}</div>`
        : "";
      const lines = card.code.split("\n");
      return {
        width: 720,
        height: 64 + lines.length * 30 + (card.label ? 28 : 0),
        style: `${CARD_BASE}padding:16px 20px;background:${TK.bg};`,
        inner:
          label +
          `<pre style="margin:0;color:${TK.fg2};font-family:'SF Mono',Menlo,monospace;font-size:20px;line-height:1.5;white-space:pre-wrap">${esc(card.code)}</pre>`,
      };
    }
    case "image":
      return {
        width: 320,
        height: 240,
        style: `${CARD_BASE}padding:10px;width:320px;`,
        inner:
          `<div style="width:300px;height:176px;border-radius:8px;overflow:hidden;background:${TK.bg};border:1px solid ${TK.border};display:flex;align-items:center;justify-content:center">` +
          `<img src="${esc(mediaPrefix + card.file)}" style="max-width:100%;max-height:100%;object-fit:contain"></div>` +
          `<div style="color:${TK.fg2};font-size:19px;font-weight:600;margin-top:8px;text-align:center">${esc(card.label)}</div>`,
      };
  }
}

// ── special 预设动画(枚举 3)────────────────────────────────────────────────────
// [T-290/T-295] special 目前是死代码(decideScenes 从不产 special);坐标仍按横版硬编码。
// T-295 接入富动画时会把 special 决策产出打通并按画幅(L)重排;此处保留横版 CONTENT_X 兜编译。
const CONTENT_X = 120;
function renderSpecial(ctx: Ctx, special: VideoRenderSpecial, scene: VideoRenderScene): void {
  const S = scene.startSec;
  const E = scene.endSec;
  const du = f2(E - S);
  if (special.kind === "pipeline") {
    const n = special.nodes.length;
    const gap = 84;
    const total = 1680;
    const bw = Math.floor((total - gap * (n - 1)) / n);
    special.nodes.forEach((node, i) => {
      const id = `sp${nextTrack(ctx)}`;
      const x = CONTENT_X + i * (bw + gap);
      const sub = node.sub
        ? `<div style="color:${TK.meta};font-size:16px;margin-top:6px">${esc(node.sub)}</div>`
        : "";
      clip(
        ctx,
        id,
        nextTrack(ctx),
        S,
        du,
        `left:${x}px;top:470px;width:${bw}px;text-align:center;background:${col(node.tone)}14;border:1px solid ${col(node.tone)}99;border-radius:12px;padding:24px 0;`,
        `<div style="color:${col(node.tone)};font-size:30px;font-weight:800">${esc(node.label)}</div>${sub}`,
      );
      const at = S + 0.2 + i * 1.1;
      appear(ctx, id, at, E);
      if (i < n - 1) {
        const lid = `spl${nextTrack(ctx)}`;
        clip(
          ctx,
          lid,
          nextTrack(ctx),
          S,
          du,
          `left:${x + bw + 12}px;top:520px;width:${gap - 24}px;height:3px;background:${TK.green};transform-origin:left center;`,
        );
        ctx.tweens.push(
          `tl.fromTo("#${lid}",{scaleX:0,autoAlpha:0},{scaleX:1,autoAlpha:1,duration:.5,ease:"power2.out"},${fmt(S + 0.5 + i * 1.1)});`,
        );
        ctx.tweens.push(`tl.set("#${lid}",{autoAlpha:0},${fmt(E)});`);
      }
    });
    return;
  }
  if (special.kind === "comparison") {
    const side = (
      s: { title: string; items: string[]; tone: VideoRenderTone },
      pos: "L" | "R",
      at: number,
    ): void => {
      const id = `cmp${nextTrack(ctx)}`;
      const items = s.items
        .map(
          (t) =>
            `<div style="color:${TK.fg2};font-size:22px;font-weight:600;margin-top:10px">· ${esc(t)}</div>`,
        )
        .join("");
      clip(
        ctx,
        id,
        nextTrack(ctx),
        S,
        du,
        `top:430px;${pos === "L" ? "left:180px" : "right:180px"};width:640px;background:${TK.surface};border:1px solid ${col(s.tone)}66;border-radius:12px;padding:22px 26px;`,
        `<div style="color:${col(s.tone)};font-size:26px;font-weight:800">${esc(s.title)}</div>${items}`,
      );
      appear(ctx, id, at, E, 0);
      ctx.tweens.push(
        `tl.from("#${id}",{x:${pos === "L" ? -40 : 40},duration:.5},${fmt(at)});`,
      );
    };
    side(special.left, "L", S + 0.3);
    side(special.right, "R", S + 0.9);
    const vsId = `cmpv${nextTrack(ctx)}`;
    clip(
      ctx,
      vsId,
      nextTrack(ctx),
      S,
      du,
      `top:470px;left:0;right:0;text-align:center;color:${TK.muted};font-size:34px;font-weight:800;`,
      "VS",
    );
    appear(ctx, vsId, S + 1.4, E, 0);
    return;
  }
  // steps:纵向步骤逐条点亮
  special.items.forEach((item, i) => {
    const id = `st${nextTrack(ctx)}`;
    const y = 400 + i * 108;
    const sub = item.sub
      ? `<span style="color:${TK.meta};font-size:18px;font-weight:500;margin-left:14px">${esc(item.sub)}</span>`
      : "";
    clip(
      ctx,
      id,
      nextTrack(ctx),
      S,
      du,
      `left:${CONTENT_X + 320}px;top:${y}px;width:1100px;background:${TK.surface};border:1px solid ${TK.border};border-radius:12px;padding:20px 24px;display:flex;align-items:center;`,
      `<span style="width:44px;height:44px;border-radius:22px;background:${TK.accent}22;color:${TK.accentH};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;flex:none;margin-right:18px">${i + 1}</span>` +
        `<span style="color:${TK.fg};font-size:28px;font-weight:700">${esc(item.label)}</span>${sub}`,
    );
    appear(ctx, id, S + 0.3 + i * 1.2, E);
  });
}

// ── 主函数 ───────────────────────────────────────────────────────────────────
export function generateVideoRenderHtml(
  props: VideoRenderProps,
  options: TemplateOptions = {},
): string {
  const gsapSrc = options.gsapSrc ?? "gsap.min.js";
  const mediaPrefix = options.mediaPrefix ?? "media/";
  const DUR = f2(props.talkingHead.durationSec);
  const { width, height, fps } = props.delivery;
  void fps; // fps 由渲染命令行控制;合成本身以秒为时钟
  const L = resolveLayout(width, height); // [T-290] 布局随画幅(横/竖版)

  const ctx: Ctx = { clips: [], tweens: [], trackNo: 9, mediaPrefix };

  // 背景三层:纯色 + 网格 + 辉光
  clip(ctx, "bg", 0, 0, DUR, `inset:0;background:${TK.bg};`);
  clip(
    ctx,
    "grid",
    1,
    0,
    DUR,
    `inset:0;opacity:.5;background:linear-gradient(${TK.borderSoft} 1px,transparent 1px),linear-gradient(90deg,${TK.borderSoft} 1px,transparent 1px);background-size:64px 64px;`,
  );
  clip(
    ctx,
    "glow",
    2,
    0,
    DUR,
    `inset:0;background:radial-gradient(900px 520px at 24% 36%,${TK.accent}22,transparent 60%);`,
  );

  // 每场景 B-roll 归属(按 at 落区间;区间外的丢给最近场景不做,诚实按区间)
  const brollByScene = new Map<string, VideoRenderBroll[]>();
  for (const b of props.broll) {
    const scene = props.scenes.find((s) => b.at >= s.startSec && b.at < s.endSec);
    if (!scene) continue; // superRefine 已保证 at < 片长;缝隙区间(无场景)不渲染
    const list = brollByScene.get(scene.id) ?? [];
    list.push(b);
    brollByScene.set(scene.id, list);
  }

  // 口播头(整片连续 = master 音频;右侧竖卡 ↔ 左下 PiP 由 GSAP 切换)
  const modes = props.scenes.map((s) =>
    resolveSceneMode(s, (brollByScene.get(s.id) ?? []).length),
  );
  const initialMode = modes[0] ?? "pip";
  const initPos = initialMode === "right" ? L.thRight : L.thPip;
  ctx.clips.push(
    `<video id="th" class="clip" src="${esc(mediaPrefix + props.talkingHead.file)}"${props.talkingHead.hasAudio ? ' data-has-audio="true"' : ""} data-start="0" data-duration="${fmt(DUR)}" data-track-index="900" ` +
      // [T-291] 口播头改 object-fit:contain(完整不裁,治「脸没在框」)+ 深色底补边。
      // 原 cover+object-position:center 20% 会裁掉竖屏源上下大半、位置写死猜测无人脸检测 → 脸出框。
      // 合 video-editing skill 铁律「不随意裁切口播画面」。深色 letterbox 是「保完整」的可接受代价。
      `style="position:absolute;left:${initPos.left}px;top:${initPos.top}px;width:${initPos.width}px;height:${initPos.height}px;border-radius:${initPos.borderRadius}px;object-fit:contain;background:#08090a;` +
      `border:2px solid ${TK.accent};box-shadow:0 18px 60px rgba(0,0,0,.5),0 0 0 6px ${TK.accent}1f;"></video>`,
  );
  // 形态切换 tween:在模式变化的场景边界前 0.7s 开始(首场景不切)
  for (let i = 1; i < props.scenes.length; i++) {
    if (modes[i] === modes[i - 1]) continue;
    const to = modes[i] === "right" ? L.thRight : L.thPip;
    const at = Math.max(0, props.scenes[i]!.startSec - 0.7);
    ctx.tweens.push(
      `tl.to("#th",{left:${to.left},top:${to.top},width:${to.width},height:${to.height},borderRadius:${to.borderRadius},duration:.7,ease:"power2.inOut"},${fmt(at)});`,
    );
  }

  // 场景:眉标+标题+副题 + 卡片 flow + B-roll + special
  props.scenes.forEach((scene, si) => {
    const mode = modes[si]!;
    const sceneDur = f2(scene.endSec - scene.startSec);
    const headId = `h${nextTrack(ctx)}`;
    const sub = scene.sub
      ? `<div style="color:${TK.muted};font-size:25px;font-weight:500;margin-top:12px">${esc(scene.sub)}</div>`
      : "";
    const rightInset = L.headRightInset[mode];
    clip(
      ctx,
      headId,
      nextTrack(ctx),
      scene.startSec,
      sceneDur,
      `left:${L.contentX}px;top:${L.headTop}px;right:${rightInset}px;`,
      `<div style="color:${TK.accentH};font-size:18px;font-weight:700;letter-spacing:.22em">${esc(scene.label)}</div>` +
        `<div style="color:${TK.fg};font-size:58px;font-weight:800;letter-spacing:-.022em;line-height:1.06;margin-top:12px">${esc(scene.title)}</div>${sub}`,
    );
    appear(ctx, headId, scene.startSec + 0.05, scene.endSec);

    if (scene.special) {
      renderSpecial(ctx, scene.special, scene);
    }

    // 卡片 + B-roll 统一按 at 排 flow(PiP 安全区避让)
    const flowItems: Array<
      | { type: "card"; at: number; card: VideoRenderCard }
      | { type: "broll"; at: number; broll: VideoRenderBroll }
    > = [
      ...scene.cards.map((card) => ({ type: "card" as const, at: card.at, card })),
      ...(brollByScene.get(scene.id) ?? []).map((broll) => ({
        type: "broll" as const,
        at: broll.at,
        broll,
      })),
    ].sort((a, b) => a.at - b.at);

    const rightEdge = L.rightEdge[mode];
    let px = L.contentX;
    let py = L.contentY[mode];
    let rowH = 0;
    const place = (w: number, h: number): { x: number; y: number } => {
      if (px + w > rightEdge) {
        px = L.contentX;
        py += rowH + GAP;
        rowH = 0;
      }
      if (mode === "pip" && px < L.pipSafeX && py + h > L.pipSafeY) {
        px = L.pipSafeX + 16;
        if (px + w > rightEdge) {
          px = L.contentX;
          py += rowH + GAP;
          rowH = 0;
          if (px < L.pipSafeX && py + h > L.pipSafeY) px = L.pipSafeX + 16;
        }
      }
      const pos = { x: px, y: py };
      px += w + GAP;
      rowH = Math.max(rowH, h);
      return pos;
    };

    for (const item of flowItems) {
      const endAt = scene.endSec;
      if (item.type === "card") {
        const box = renderCard(item.card, mediaPrefix);
        const pos = place(box.width, box.height);
        const id = `c${nextTrack(ctx)}`;
        clip(
          ctx,
          id,
          nextTrack(ctx),
          item.at,
          f2(endAt - item.at),
          `left:${pos.x}px;top:${pos.y}px;${box.style}`,
          box.inner,
        );
        appear(ctx, id, item.at, endAt);
        // list 卡逐条进场(相对卡片 at;默认 0.6s 步进)
        if (item.card.kind === "list") {
          item.card.items.forEach((li, i) => {
            const delay = li.delaySec ?? i * 0.6;
            ctx.tweens.push(
              `tl.fromTo("#${id} .li${i}",{autoAlpha:0,x:-10},{autoAlpha:1,x:0,duration:.35,ease:"power2.out"},${fmt(item.at + 0.2 + delay)});`,
            );
          });
        }
      } else {
        // B-roll:视频必须自身是 clip(帧捕获协议);框卡 + 视频两层
        const b = item.broll;
        const w = b.big ? 800 : 460;
        const vh = Math.round(((w - 20) * 9) / 16);
        const h = vh + 66;
        const pos = place(w, h);
        const frameId = `br${nextTrack(ctx)}`;
        const brollEnd = b.durationSec ? Math.min(endAt, b.at + b.durationSec) : endAt;
        const brollDur = f2(brollEnd - b.at);
        clip(
          ctx,
          frameId,
          nextTrack(ctx),
          b.at,
          brollDur,
          `left:${pos.x}px;top:${pos.y}px;${CARD_BASE}padding:10px;width:${w}px;`,
          `<div style="height:${vh}px"></div><div style="color:${TK.fg2};font-size:20px;font-weight:600;margin-top:10px">▶ ${esc(b.label)}</div>`,
        );
        appear(ctx, frameId, b.at, brollEnd);
        const vidId = `${frameId}v`;
        ctx.clips.push(
          `<video id="${vidId}" class="clip" src="${esc(mediaPrefix + b.file)}" muted data-start="${fmt(b.at)}" data-duration="${fmt(brollDur)}" data-track-index="${nextTrack(ctx)}" ` +
            `style="position:absolute;left:${pos.x + 10}px;top:${pos.y + 10}px;width:${w - 20}px;height:${vh}px;border-radius:8px;object-fit:contain;background:${TK.bg};border:1px solid ${TK.border};"></video>`,
        );
        appear(ctx, vidId, b.at, brollEnd);
      }
    }
  });

  // 双语字幕(单轨 950,SRT 主时钟;夹断防重叠)
  props.captions.forEach((cap, i) => {
    const nextStart = props.captions[i + 1]?.start ?? DUR;
    const end = Math.min(cap.end, nextStart - 0.02, DUR);
    const du = f2(end - cap.start);
    if (du <= 0.05) return;
    const en = cap.en
      ? `<div style="color:${TK.muted};font-size:19px;font-weight:500;margin-top:6px">${esc(cap.en)}</div>`
      : "";
    clip(
      ctx,
      `cap${i}`,
      950,
      cap.start,
      du,
      "left:0;right:0;bottom:56px;text-align:center;",
      `<div style="background:rgba(8,9,10,.74);border:1px solid ${TK.border};border-radius:10px;padding:11px 26px;color:${TK.fg};font-size:33px;font-weight:600;display:inline-block">${esc(cap.cn)}</div>${en}`,
    );
  });

  // 品牌角标 + 底部进度条
  if (props.meta.brandLabel) {
    clip(
      ctx,
      "brand",
      960,
      0,
      DUR,
      "left:120px;top:60px;display:flex;align-items:center;gap:10px;",
      `<span style="width:10px;height:10px;border-radius:5px;background:${TK.green}"></span><span style="color:${TK.fg2};font-size:20px;font-weight:700;letter-spacing:.04em">${esc(props.meta.brandLabel)}</span>`,
    );
  }
  clip(
    ctx,
    "pbar",
    961,
    0,
    DUR,
    `left:0;right:0;bottom:0;height:3px;background:${TK.borderSoft};`,
    `<div id="pbarf" style="position:absolute;left:0;top:0;height:100%;width:0;background:${TK.accent}"></div>`,
  );
  ctx.tweens.push(`tl.fromTo("#pbarf",{width:"0%"},{width:"100%",ease:"none",duration:${fmt(DUR)}},0);`);

  return `<!doctype html><html><head><meta charset="utf-8"><script src="${esc(gsapSrc)}"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${width}px;height:${height}px;background:${TK.bg};overflow:hidden;font-family:"Inter","PingFang SC","Microsoft YaHei",sans-serif}
#root{position:relative;width:${width}px;height:${height}px;background:${TK.bg}}
.clip{position:absolute}
</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${fmt(DUR)}" data-width="${width}" data-height="${height}">
${ctx.clips.join("\n")}
</div>
<script>
const tl = gsap.timeline({paused:true});
${ctx.tweens.join("\n")}
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
</script></body></html>`;
}

/** 模板引用的全部媒体文件(mountAs 相对路径,去重保序)—— executor 预处理清单。 */
export function collectMediaFiles(props: VideoRenderProps): {
  videos: string[];
  images: string[];
} {
  const videos: string[] = [props.talkingHead.file];
  const images: string[] = [];
  for (const b of props.broll) {
    if (!videos.includes(b.file)) videos.push(b.file);
  }
  for (const scene of props.scenes) {
    for (const card of scene.cards) {
      if (card.kind === "image" && !images.includes(card.file)) images.push(card.file);
    }
  }
  return { videos, images };
}
