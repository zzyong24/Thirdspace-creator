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
  VideoCardMotion,
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

// [T-794] 信息型视频统一使用低对比度虚线网格。SVG 只画每个 64px 单元的上/左边，
// stroke-dasharray 让网格保持“工作台/推演纸”质感；opacity 足够低，不与字幕和卡片争夺注意力。
const DASHED_GRID_DATA_URL =
  "data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2248%22%20height=%2248%22%20viewBox=%220%200%2048%2048%22%3E%3Cpath%20d=%22M48%200H0V48%22%20fill=%22none%22%20stroke=%22%23ffffff%22%20stroke-opacity=%22.14%22%20stroke-width=%221%22%20stroke-dasharray=%223%207%22/%3E%3C/svg%3E";

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
  /**
   * 已按资产权威 MIME 判定为图片的 B-roll 文件名。
   * B-roll 契约为兼容旧任务没有 kind 字段，不能靠 assetId/扩展名猜类型；
   * executor 在物化输入处持有 MIME，重命名后把图片集合显式传进模板。
   */
  imageFiles?: ReadonlySet<string>;
  /** 无真人视觉专场：不渲染口播头，信息舞台使用完整画布安全区。仅用于动效验看/纯动画导出。 */
  visualOnly?: boolean;
}

/** 场景口播头形态(规则 + 显式覆盖;快照测试锚定)。 */
type SceneMode = "right" | "pip" | "focus";

export function resolveSceneMode(
  scene: VideoRenderScene,
  brollCount: number,
  options: { hasLargeStage?: boolean; portrait?: boolean } = {},
): SceneMode {
  // large_stage 必须给人物留出独立安全区。横屏采用左主舞台 + 右人物；竖屏采用
  // 上主舞台 + 下方人物 PiP。不能再把大卡居中压在人物上，只露出半张脸。
  if (options.hasLargeStage) return options.portrait ? "pip" : "right";
  // 普通信息卡/图片段都必须拥有稳定的「主舞台 + 人物安全区」。模型历史上给出的
  // scene.mode=pip 只是一条创作建议，不能让整场在没有全屏录屏时退成左下角小人，
  // 留下大块黑底。真正的全屏录屏会在自己的有效时间窗里临时把人物切到左下 PiP，
  // 不需要靠场景级 mode 提前缩小人物。
  if (options.portrait) return "right";
  const visualNodes = scene.cards.length + brollCount + (scene.special ? 3 : 0);
  // 没有任何视觉承接时，不能服从模型遗留的 right/pip 提示把人物塞到角落；
  // 用居中主讲 + 同源氛围背景作为确定性兜底，避免整段大片空黑。
  if (visualNodes === 0) return "focus";
  // 所有已有视觉节点都走左侧主舞台 + 右侧人物。B-roll 活跃时由单条素材自己的
  // presentation 决定 large_stage 或 full_frame；full_frame 期间再瞬时切 PiP。
  return "right";
}

function resolveHeadBox(layout: Layout, mode: SceneMode): LayoutBox {
  if (mode === "right") return layout.thRight;
  if (mode === "focus") return layout.thFocus;
  return layout.thPip;
}

export interface MainBrollGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 在给定舞台中保持源素材比例居中。缺少可靠尺寸时保持原舞台，由 CSS contain 兜底。 */
export function fitMediaRect(
  frame: MainBrollGeometry,
  sourceWidth?: number,
  sourceHeight?: number,
): MainBrollGeometry {
  if (
    !sourceWidth ||
    !sourceHeight ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    return { ...frame };
  }
  const scale = Math.min(frame.width / sourceWidth, frame.height / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  return {
    x: frame.x + Math.round((frame.width - width) / 2),
    y: frame.y + Math.round((frame.height - height) / 2),
    width,
    height,
  };
}

/** 主视觉几何单一真值：full_frame 真切走；large_stage 与人物安全分区。 */
export function resolveMainBrollGeometry(
  width: number,
  height: number,
  presentation: "full_frame" | "large_stage",
): MainBrollGeometry {
  if (presentation === "full_frame") return { x: 0, y: 0, width, height };
  if (height > width) {
    return {
      x: Math.round((54 / 1080) * width),
      y: Math.round((80 / 1920) * height),
      width: Math.round((972 / 1080) * width),
      height: Math.round((750 / 1920) * height),
    };
  }
  return {
    x: Math.round((50 / 1920) * width),
    y: Math.round((190 / 1080) * height),
    width: Math.round((1250 / 1920) * width),
    height: Math.round((760 / 1080) * height),
  };
}

function overlaps(a: MainBrollGeometry, b: LayoutBox): boolean {
  return !(
    a.x + a.width <= b.left ||
    b.left + b.width <= a.x ||
    a.y + a.height <= b.top ||
    b.top + b.height <= a.y
  );
}

/**
 * 渲染前确定性安全门。它不替代视觉模型审美审核，只负责代码能可靠判断的遮挡与主画面
 * 可读面积，防止“图很小却占大卡、人物只露半张脸”再次被编码进成片。
 */
export function assertVideoLayoutSafety(props: VideoRenderProps): void {
  const layout = resolveLayout(props.delivery.width, props.delivery.height);
  const portrait = props.delivery.height > props.delivery.width;
  for (const broll of props.broll) {
    const presentation = resolveBrollPresentation(broll);
    if (
      presentation === "full_frame" &&
      broll.visualRole !== "screen_recording"
    ) {
      throw new Error(`只有录屏素材可以全屏:${broll.label}`);
    }
    if (
      presentation === "full_frame" &&
      broll.speakerMode !== "pip_bottom_left"
    ) {
      throw new Error(`全屏录屏必须保留左下角人物画中画:${broll.label}`);
    }
    if (presentation === "overlay") continue;
    const scene = props.scenes.find(
      (item) => broll.at >= item.startSec && broll.at < item.endSec,
    );
    if (!scene) continue;
    const sceneBroll = props.broll.filter(
      (item) => item.at >= scene.startSec && item.at < scene.endSec,
    );
    const mode = resolveSceneMode(scene, sceneBroll.length, {
      hasLargeStage: presentation === "large_stage",
      portrait,
    });
    const geometry = resolveMainBrollGeometry(
      props.delivery.width,
      props.delivery.height,
      presentation,
    );
    const areaRatio =
      (geometry.width * geometry.height) /
      (props.delivery.width * props.delivery.height);
    if (areaRatio < 0.35) {
      throw new Error(`B-roll 主画面可读面积不足:${broll.label}`);
    }
    if (
      presentation === "large_stage" &&
      overlaps(geometry, resolveHeadBox(layout, mode))
    ) {
      throw new Error(`B-roll 主画面与人物安全区重叠:${broll.label}`);
    }
  }
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
  thFocus: LayoutBox;
  contentX: number;
  headTop: number;
  contentY: Record<SceneMode, number>;
  headRightInset: Record<SceneMode, number>;
  rightEdge: Record<SceneMode, number>;
  pipSafeX: number;
  pipSafeY: number;
}

function resolveLayout(width: number, height: number): Layout {
  if (height > width) {
    // 竖版 1080x1920(及等比):无大舞台时人物就是完整手机画布；只有 large_stage
    // 活跃时才切到底部 9:16 PiP。旧 600×1066 / 300×533 布局让真人和录屏都
    // 缩成小条，是当前竖屏成片“看不清”的直接原因。
    return {
      thRight: { left: 0, top: 0, width: 1080, height: 1920, borderRadius: 0 },
      thPip: { left: 500, top: 850, width: 530, height: 942, borderRadius: 24 },
      thFocus: { left: 0, top: 0, width: 1080, height: 1920, borderRadius: 0 },
      contentX: 60,
      headTop: 96,
      contentY: { right: 1300, pip: 100, focus: 1300 },
      headRightInset: { right: 60, pip: 60, focus: 60 },
      rightEdge: { right: 1020, pip: 1020, focus: 1020 },
      pipSafeX: 470,
      pipSafeY: 800,
    };
  }
  // 横版 1920x1080(原布局,快照锚定不变)。
  return {
    thRight: { left: 1330, top: 138, width: 500, height: 804, borderRadius: 18 },
    thPip: { left: 84, top: 712, width: 286, height: 286, borderRadius: 24 },
    thFocus: { left: 688, top: 56, width: 544, height: 968, borderRadius: 18 },
    contentX: 120,
    headTop: 132,
    contentY: { right: 180, pip: 180, focus: 180 },
    headRightInset: { right: 720, pip: 120, focus: 120 },
    rightEdge: { right: 1180, pip: 1800, focus: 1800 },
    pipSafeX: 405,
    pipSafeY: 660, // 左下 PiP 安全区(286×286 圆角矩形):x < pipSafeX 且 y+h > pipSafeY 禁放
  };
}

/**
 * 全屏录屏专用人物画中画。它和普通 scene pip 分开：必须保持竖版人物原比例、位于左下角，
 * 并始终浮在录屏之上。坐标只做画幅边界，不承担任何素材语义判断。
 */
function resolveFullFrameSpeakerPip(width: number, height: number): LayoutBox {
  if (height > width) {
    const pipWidth = Math.round(width * 0.38);
    const pipHeight = Math.round((pipWidth * 16) / 9);
    return {
      left: Math.round(width * 0.05),
      // 横录屏完整显示在竖屏上半区，人物放到其下方；旧版把 302px 小窗沉到底部，
      // 既看不清人脸，也在中间留下超过 600px 的空黑区。
      top: Math.round(height * 0.47),
      width: pipWidth,
      height: pipHeight,
      borderRadius: Math.max(18, Math.round(width * 0.022)),
    };
  }
  const pipWidth = Math.round(width * 0.16);
  const pipHeight = Math.round((pipWidth * 16) / 9);
  return {
    left: Math.round(width * 0.035),
    top: Math.max(0, height - pipHeight - Math.round(height * 0.075)),
    width: pipWidth,
    height: pipHeight,
    borderRadius: Math.max(16, Math.round(width * 0.012)),
  };
}

/**
 * 竖屏不能把 16:9 录屏机械居中到 9:16 画布，否则上、下各留下六百多像素的
 * 无信息区域。录屏仍保持完整比例和整屏宽度，只把可读前景放到上半段；下半段交给
 * 真人画中画与字幕。横屏、竖屏录屏素材本身都不裁切。
 */
function resolveBrollMediaBounds(
  width: number,
  height: number,
  presentation: "full_frame" | "large_stage" | "overlay",
  visualRole: VideoRenderBroll["visualRole"],
  fallback: MainBrollGeometry,
): MainBrollGeometry {
  if (
    height > width &&
    presentation === "full_frame" &&
    visualRole === "screen_recording"
  ) {
    return {
      x: 0,
      y: Math.round((90 / 1920) * height),
      width,
      height: Math.round((780 / 1920) * height),
    };
  }
  return fallback;
}

interface Ctx {
  clips: string[];
  tweens: string[];
  trackNo: number;
  mediaPrefix: string;
}

/**
 * 新版由 material.match 明确给出 presentation + visualRole。旧版只有 big，无法证明
 * 它真的是录屏，因此必须降级到安全舞台，不能继续把任意图片/实拍铺满画布。
 */
function resolveBrollPresentation(
  broll: Pick<VideoRenderBroll, "big" | "presentation" | "visualRole">,
): "full_frame" | "large_stage" | "overlay" {
  if (broll.presentation) return broll.presentation;
  if (broll.big && broll.visualRole === "screen_recording") return "full_frame";
  return "large_stage";
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
  className = "clip",
): void {
  ctx.clips.push(
    `<div id="${id}" class="${className}" data-start="${fmt(start)}" data-duration="${fmt(duration)}" data-track-index="${track}" style="position:absolute;${style}">${inner}</div>`,
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

/** AI 决定的轻量素材运镜。布局、遮挡和可读性仍由渲染器硬约束。 */
function animateBrollMedia(
  ctx: Ctx,
  id: string,
  motion: VideoRenderBroll["motion"],
  at: number,
  endAt: number,
): void {
  const duration = f2(Math.max(0.1, endAt - at - 0.6));
  if (motion === "push_in") {
    ctx.tweens.push(
      `tl.to("#${id}",{scale:1.035,duration:${fmt(duration)},ease:"none"},${fmt(at + 0.3)});`,
    );
  } else if (motion === "pan_left") {
    ctx.tweens.push(
      `tl.fromTo("#${id}",{xPercent:1.5},{xPercent:-1.5,duration:${fmt(duration)},ease:"none"},${fmt(at + 0.3)});`,
    );
  } else if (motion === "pan_right") {
    ctx.tweens.push(
      `tl.fromTo("#${id}",{xPercent:-1.5},{xPercent:1.5,duration:${fmt(duration)},ease:"none"},${fmt(at + 0.3)});`,
    );
  }
}

// ── [T-295] 富动画:card.motion 决策意图 → GSAP 配方分派 ──────────────────────────
// 现状(治的病):卡片全走整块 `appear`(淡入弹出)= video-editing skill 判为「偷懒」的形态。
// 改为:决策层给每卡产 motion(可选),template 按 motion 落「长出来」的富动画;motion 缺省时
// **按 kind 派生**(弱模型不产也保底有富动画)。配方全用相对变换(scaleX/autoAlpha/位移/onUpdate
// 文本),不写绝对坐标 → 横竖版通吃(布局坐标归 resolveLayout,此处不碰)。

/** motion 缺省时按卡类型派生(SPEC §7 映射;保证弱模型不产 motion 仍有富动画)。 */
function resolveMotion(card: VideoRenderCard): VideoCardMotion {
  if (card.motion) return card.motion;
  switch (card.kind) {
    case "stat":
      return "counter";
    case "compare":
      return "bar";
    case "list":
    case "code":
      return "reveal";
    case "quote":
    case "image":
      return "plain";
  }
}

// counter 只吃「数字 + 至多一个单位后缀」(如 "47"/"0"/"3.5"/"47%"/"3倍"/"1.2x")。
// 组装器 stat value 常带 %/万/倍 后缀(FIRST_NUMBER_RE),故须容忍后缀(递增数字、原样保留后缀)。
// 真正的区间/非数值(如 "2–3")解析失败 → null → 降级 plain 强调进场。
const COUNTER_RE = /^(\d+(?:\.\d+)?)\s*([%‰万亿kKmMxX×倍+]?)$/;
function parseCounter(v: string): { target: number; dec: number; suffix: string } | null {
  const m = COUNTER_RE.exec(v.trim());
  if (!m) return null;
  const num = m[1]!;
  return {
    target: Number(num),
    dec: num.includes(".") ? num.split(".")[1]!.length : 0,
    suffix: m[2] ?? "",
  };
}

// 动画叠层钩子(绝对定位,不占 flow、不改卡尺寸;class .ovl 让进场 stagger 用 :not(.ovl) 排除)。
function strikeOverlay(): string {
  // 建立→推翻:一条红删除线(scaleX 由 motionTween 从 0 划到 1)。
  return `<span class="strikeline ovl" style="position:absolute;left:14px;right:14px;top:52%;height:5px;border-radius:3px;background:${TK.danger};transform:rotate(-3deg);transform-origin:left center"></span>`;
}
function metaOverlay(): string {
  // 强揭示收束:底部绿线(scaleX 生长)。
  return `<span class="metaline ovl" style="position:absolute;left:0;right:0;bottom:0;height:3px;background:${TK.green};transform-origin:left center"></span>`;
}
function growbarTop(): string {
  // 非 compare 卡拿到 bar 时的顶部生长条(compare 的两条在各侧内,见 renderCard)。
  return `<div class="growbar ovl" style="height:8px;border-radius:4px;background:${TK.accent};transform-origin:left center;margin-bottom:12px"></div>`;
}

/**
 * 卡片富动画分派:按 motion 生成进场配方(编排在 [at, endAt) 可见窗内),替换整块 `appear`。
 * 末尾统一淡出 + 硬关(沿用 appear 收尾)。进场选择器一律 `:not(.ovl)` 排除叠层钩子。
 */
function motionTween(
  ctx: Ctx,
  id: string,
  card: VideoRenderCard,
  at: number,
  endAt: number,
): void {
  const t = ctx.tweens;
  const S = fmt(at);
  if (card.visualPlan) {
    const relation = card.visualPlan.relation;
    const partSelector = `#${id} [data-visual-part]`;
    const lineSelector = `#${id} [data-relation-line]`;
    // [T-794] 关系已由 AI 明确声明；这里仅执行固定视觉语法，不从文案猜语义。
    t.push(`tl.set("#${id}",{autoAlpha:1},${S});`);
    if (relation === "cause_effect") {
      t.push(
        `tl.fromTo("#${id} .scene-scroll",{scaleX:.12},{scaleX:1,duration:1.2,ease:"power2.inOut",transformOrigin:"right center"},${S});`,
        `tl.fromTo("#${id} .scene-paper-mark",{x:-60,rotation:-4},{x:0,rotation:0,duration:1.15,ease:"power1.inOut"},${S});`,
        `tl.fromTo("#${id} .scene-pressure",{scaleX:.08},{scaleX:1,duration:.9,ease:"power2.in",transformOrigin:"left center"},${fmt(at + 0.55)});`,
        `tl.fromTo("#${id} .scene-machine-core",{scale:.96},{scale:1.04,duration:.14,yoyo:true,repeat:5,ease:"sine.inOut"},${fmt(at + 0.72)});`,
        `tl.fromTo("#${id} .scene-output-sheet",{x:-82,autoAlpha:0,rotation:-3},{x:0,autoAlpha:1,rotation:0,duration:.7,stagger:.22,ease:"power3.out"},${fmt(at + 1.12)});`,
        `tl.fromTo("#${id} .scene-result-seal",{scale:1.35,autoAlpha:0},{scale:1,autoAlpha:1,duration:.45,ease:"back.out(1.8)"},${fmt(at + 2.05)});`,
      );
    } else if (relation === "sequence") {
      t.push(
        `tl.fromTo("#${id} .scene-loop-path",{strokeDashoffset:820,autoAlpha:.25},{strokeDashoffset:0,autoAlpha:1,duration:2.8,ease:"power1.inOut"},${S});`,
        `tl.fromTo("#${id} .scene-calibration-gate",{autoAlpha:.28,scale:.92},{autoAlpha:1,scale:1,duration:.32,stagger:.58,ease:"power2.out"},${fmt(at + 0.35)});`,
        `tl.fromTo("#${id} .scene-runner",{offsetDistance:"0%",scale:.82},{offsetDistance:"76%",scale:1,duration:2.35,ease:"power1.inOut"},${fmt(at + 0.22)});`,
        `tl.to("#${id} .scene-reject",{y:90,rotation:16,autoAlpha:0,duration:.55,stagger:.2,ease:"power2.in"},${fmt(at + 1.18)});`,
        `tl.to("#${id} .scene-runner",{offsetDistance:"100%",duration:.78,ease:"power2.inOut"},${fmt(at + 2.62)});`,
        `tl.fromTo("#${id} .scene-winner-pulse",{scale:.7,autoAlpha:0},{scale:1.2,autoAlpha:0,duration:.7,ease:"power2.out"},${fmt(at + 2.35)});`,
      );
    } else if (relation === "replacement") {
      const orbitDuration = Math.min(1.9, Math.max(0.5, endAt - at - 2.12));
      t.push(
        `tl.fromTo("#${id} .scene-manual-page",{x:-36,y:-18,rotation:-4,autoAlpha:0},{x:0,y:0,rotation:0,autoAlpha:1,duration:.38,stagger:.1,ease:"power2.out"},${S});`,
        `tl.fromTo("#${id} .scene-scan-beam",{scaleX:0},{scaleX:1,duration:.72,ease:"power2.inOut",transformOrigin:"left center"},${fmt(at + 0.65)});`,
        `tl.to("#${id} .scene-manual",{scaleX:.08,rotation:-7,x:-310,autoAlpha:0,duration:.82,ease:"power3.in"},${fmt(at + 1.28)});`,
        `tl.fromTo("#${id} .scene-hypothesis",{x:250,scale:.72,autoAlpha:0},{x:0,scale:1,autoAlpha:1,duration:.82,ease:"power3.out"},${fmt(at + 1.65)});`,
        `tl.fromTo("#${id} .scene-orbit-dot",{rotation:0},{rotation:360,duration:${fmt(orbitDuration)},ease:"none",transformOrigin:"center center"},${fmt(at + 1.82)});`,
      );
    } else {
      t.push(
        `tl.fromTo("${partSelector}",{autoAlpha:0,y:24,scale:.96},{autoAlpha:1,y:0,scale:1,duration:.52,stagger:.32,ease:"power3.out"},${S});`,
      );
      t.push(
        `tl.fromTo("${lineSelector}",{scaleX:0,autoAlpha:0,transformOrigin:"left center"},{scaleX:1,autoAlpha:1,duration:.55,stagger:.32,ease:"power2.out"},${fmt(at + 0.32)});`,
      );
    }
    t.push(`tl.to("#${id}",{autoAlpha:0,duration:.3},${fmt(Math.max(at, endAt - 0.3))});`);
    t.push(`tl.set("#${id}",{autoAlpha:0},${fmt(endAt)});`);
    return;
  }
  const motion = resolveMotion(card);
  const kids = `#${id} > *:not(.ovl)`;

  // 精炼进场(plain / counter 降级 / 兜底):容器轻淡入 + 直接子元素 .08s 错峰(非整块闷淡入)。
  const plainEntrance = (): void => {
    t.push(
      `tl.fromTo("#${id}",{autoAlpha:0,scale:1.02},{autoAlpha:1,scale:1,duration:.4,ease:"power3.out"},${S});`,
    );
    t.push(
      `tl.fromTo("${kids}",{autoAlpha:0,y:8},{autoAlpha:1,y:0,duration:.35,stagger:.08,ease:"power2.out"},${S});`,
    );
  };

  switch (motion) {
    case "counter": {
      // 数字递增计数器:GSAP proxy {v:0} → target,onUpdate 写 .stat-val 文本(不碰 strike 子层)。
      // 渲染器帧捕获走 totalTime(t,false) 不 suppress 事件 → onUpdate 逐帧生效(已核实 hyperframes runtime)。
      const cnt = card.kind === "stat" ? parseCounter(card.value) : null;
      if (cnt) {
        const suffix = JSON.stringify(cnt.suffix); // 后缀原样拼接(单字符安全集,JSON 转义兜底)
        t.push(
          `tl.fromTo("#${id}",{autoAlpha:0,y:10,scale:1.03},{autoAlpha:1,y:0,scale:1,duration:.4,ease:"power3.out"},${S});`,
        );
        t.push(
          `(function(){var o={v:0},s="#${id} .stat-val";tl.fromTo(o,{v:0},{v:${cnt.target},duration:.9,ease:"power2.out",onUpdate:function(){var e=document.querySelector(s);if(e)e.textContent=o.v.toFixed(${cnt.dec})+${suffix};}},${S});})();`,
        );
      } else {
        plainEntrance(); // 区间/非数值 value 优雅降级
      }
      break;
    }
    case "bar": {
      // 对比条生长:容器淡入 → 条 scaleX 0→1 依次(stagger)→ 内容随容器出现。
      t.push(
        `tl.fromTo("#${id}",{autoAlpha:0,y:8},{autoAlpha:1,y:0,duration:.35,ease:"power2.out"},${S});`,
      );
      t.push(`tl.set("#${id} .growbar",{scaleX:0,transformOrigin:"left center"},${S});`);
      t.push(
        `tl.to("#${id} .growbar",{scaleX:1,duration:.8,ease:"power2.out",stagger:.18},${fmt(at + 0.15)});`,
      );
      break;
    }
    case "reveal": {
      // 逐条/逐元素揭示(「建起来」的过程感)。list 复用现有逐条 delaySec;其余错峰直接子元素。
      t.push(
        `tl.fromTo("#${id}",{autoAlpha:0},{autoAlpha:1,duration:.3,ease:"power2.out"},${S});`,
      );
      if (card.kind === "list") {
        card.items.forEach((li, i) => {
          const delay = li.delaySec ?? i * 0.6;
          t.push(
            `tl.fromTo("#${id} .li${i}",{autoAlpha:0,x:-10},{autoAlpha:1,x:0,duration:.35,ease:"power2.out"},${fmt(at + 0.2 + delay)});`,
          );
        });
      } else {
        t.push(
          `tl.fromTo("${kids}",{autoAlpha:0,x:-12},{autoAlpha:1,x:0,duration:.4,stagger:.16,ease:"power2.out"},${S});`,
        );
      }
      break;
    }
    case "strike": {
      // 建立→推翻:元素先正常进场(像要用)→ 中后段红线划掉 + 整卡变暗(删除张力)。
      t.push(
        `tl.fromTo("#${id}",{autoAlpha:0,y:10,scale:1.02},{autoAlpha:1,y:0,scale:1,duration:.4,ease:"power3.out"},${S});`,
      );
      t.push(
        `tl.fromTo("${kids}",{autoAlpha:0,y:6},{autoAlpha:1,y:0,duration:.3,stagger:.08,ease:"power2.out"},${S});`,
      );
      const strikeAt = at + Math.max(0.8, (endAt - at) * 0.45);
      t.push(`tl.set("#${id} .strikeline",{scaleX:0,transformOrigin:"left center"},${S});`);
      t.push(
        `tl.to("#${id} .strikeline",{scaleX:1,duration:.4,ease:"power2.in"},${fmt(strikeAt)});`,
      );
      t.push(`tl.to("#${id}",{opacity:.5,duration:.5,ease:"power1.out"},${fmt(strikeAt + 0.1)});`);
      break;
    }
    case "metaphor": {
      // 强进度式揭示:分节 stagger 弹入(back.out)+ 底部绿线 scaleX 收束。专属隐喻(墙崩/门开)
      // 需按具体文案定制,本期做「强建立」通用形态,不硬编死某场景。
      t.push(
        `tl.fromTo("#${id}",{autoAlpha:0,y:14},{autoAlpha:1,y:0,duration:.45,ease:"power3.out"},${S});`,
      );
      t.push(
        `tl.fromTo("${kids}",{autoAlpha:0,y:12},{autoAlpha:1,y:0,duration:.45,stagger:.16,ease:"back.out(1.5)"},${fmt(at + 0.1)});`,
      );
      t.push(`tl.set("#${id} .metaline",{scaleX:0,transformOrigin:"left center"},${S});`);
      t.push(
        `tl.to("#${id} .metaline",{scaleX:1,duration:.7,ease:"power2.out"},${fmt(at + 0.4)});`,
      );
      break;
    }
    case "plain":
    default:
      plainEntrance();
      break;
  }

  // 共用收尾:淡出 + 硬关(编排在场景末尾,沿用 appear 收尾)。
  t.push(`tl.to("#${id}",{autoAlpha:0,duration:.3},${fmt(Math.max(at, endAt - 0.3))});`);
  t.push(`tl.set("#${id}",{autoAlpha:0},${fmt(endAt)});`);
}

// ── [T-320b] 确定性文本测高估算器(替换硬编码卡高:治「文字重合」)──────────────────
// 病根(见 docs/research/2026-07-14-...-research.md §1):renderCardBase 各 kind 返回写死/
// 按条目数线性估的 height,但内容是不定长文本 + 自动换行,长文本换行 → 真实高度超估 →
// place() 用少算的 h 定下一行 py → 后卡压进前卡真实内容区 → 视觉重合。
//
// 解法:纯函数确定性近似换行行数(不引真实 DOM/无头测量——太重;目标是「不再低估」)。
// 逐字累加「排版宽度」:CJK/全角 advance ≈ 1em(fontSize),半角 latin/数字/空格/标点 ≈ 0.5em,
// 全角标点落 CJK 区间天然按 1em。lines = ceil(总排版宽 / 可用宽),显式 \n 硬分段各自求行再累加。
// 铁律:宁可略高估(卡间多留白)也不低估(低估=重叠,本 bug 根因)。

const LH_RATIO = 1.4; // 比例字体行高 ≈ 1.4×font-size(偏保守取上界,不低估多行 CJK)

export interface AdvanceOpts {
  /** 半角字符 advance / font-size(默认 0.5em)。 */
  latinFactor?: number;
  /** 全角 / CJK 字符 advance / font-size(默认 1.0em)。 */
  cjkFactor?: number;
}

/** 该码点是否按全角(≈1em)排版:CJK 表意/假名/谚文/CJK 标点/全角 ASCII 等。 */
function isFullWidthCode(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303e) || // CJK 部首补充 + 符号/标点(含 、。「」)
    (code >= 0x3041 && code <= 0x33ff) || // 平/片假名 … CJK 兼容
    (code >= 0x3400 && code <= 0x4dbf) || // CJK 扩展 A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一表意
    (code >= 0xa000 && code <= 0xa4cf) || // 彝文
    (code >= 0xac00 && code <= 0xd7a3) || // 谚文音节
    (code >= 0xf900 && code <= 0xfaff) || // CJK 兼容表意
    (code >= 0xfe30 && code <= 0xfe4f) || // CJK 兼容形式
    (code >= 0xff01 && code <= 0xff60) || // 全角 ASCII + 标点
    (code >= 0xffe0 && code <= 0xffe6) // 全角符号
  );
}

/**
 * 估算文本在给定可用宽度、字号下的换行行数(确定性近似,offset「不再低估」)。
 * - 逐 code point 累加 advance(全角≈cjkFactor·em,半角≈latinFactor·em),ceil(总宽/可用宽)得软换行行数。
 * - 显式换行符 `\n`(如 code kind pre-wrap)按硬换行分段,每段各自软换行行数求和。
 * - 边界:空串 / 空段 → 1 行(不塌);恰好整行 → 不多算一行。
 */
export function estimateWrappedLines(
  text: string,
  availWidthPx: number,
  fontSizePx: number,
  opts: AdvanceOpts = {},
): number {
  const latinFactor = opts.latinFactor ?? 0.5;
  const cjkFactor = opts.cjkFactor ?? 1.0;
  const avail = availWidthPx > 0 ? availWidthPx : fontSizePx; // 可用宽非正兜底防除零/负
  let lines = 0;
  for (const seg of text.split("\n")) {
    let w = 0;
    for (const ch of seg) {
      const code = ch.codePointAt(0)!;
      w += fontSizePx * (isFullWidthCode(code) ? cjkFactor : latinFactor);
    }
    lines += Math.max(1, Math.ceil(w / avail));
  }
  return Math.max(1, lines);
}

/** 单行盒高(font-size × 行高比,向上取整——不低估)。 */
function lineBox(fontSizePx: number, ratio = LH_RATIO): number {
  return Math.ceil(fontSizePx * ratio);
}

const CARD_BASE = `background:${TK.surface};border:1px solid ${TK.border};border-radius:12px;box-shadow:rgba(0,0,0,.4) 0 2px 4px;`;

interface CardBox {
  width: number;
  height: number;
  style: string;
  inner: string;
}

function renderVisualSentence(card: VideoRenderCard): CardBox | null {
  const plan = card.visualPlan;
  if (!plan) return null;
  const parts = plan.parts;
  const byRole = (role: string, fallbackIndex: number) =>
    parts.find((part) => part.role === role) ?? parts[fallbackIndex] ?? parts[0]!;
  const node = (
    part: (typeof parts)[number],
    extraStyle = "",
    extraClass = "",
  ) =>
    `<div class="visual-part ${extraClass}" data-visual-part data-role="${esc(part.role)}" ` +
    `style="color:${TK.fg};font-size:38px;line-height:1.15;font-weight:780;letter-spacing:-.025em;${extraStyle}">${esc(part.text)}</div>`;
  const line = (extraClass = "") =>
    `<div class="relation-line ${extraClass}" data-relation-line style="height:6px;border-radius:999px;background:linear-gradient(90deg,${TK.accent},${TK.accentH});"></div>`;
  const shell = (relationClass: string, inner: string, background = "transparent") => ({
    width: 1000,
    height: 460,
    style: `background:${background};border:none;border-radius:0;box-shadow:none;padding:28px 18px;overflow:visible;display:flex;align-items:center;`,
    inner: `<div class="${relationClass} visual-sentence" style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center">${inner}</div>`,
  });

  switch (plan.relation) {
    case "magnitude": {
      const subject = byRole("subject", 0);
      const measure = byRole("measure", parts.length > 1 ? 1 : 0);
      return shell(
        "visual-magnitude",
        `<div style="width:100%;display:grid;grid-template-columns:1fr auto;gap:20px 36px;align-items:end">` +
          node(subject, `color:${TK.fg2};font-size:34px;align-self:center`) +
          node(measure, `color:${TK.accentH};font-size:112px;font-weight:900;line-height:.9;text-align:right`) +
          `<div style="grid-column:1/-1">${line("magnitude-track")}</div></div>`,
        `radial-gradient(540px 260px at 76% 50%,${TK.accent}1f,transparent 72%)`,
      );
    }
    case "contrast": {
      const oldPart = byRole("old", 0);
      const newPart = byRole("new", parts.length > 1 ? 1 : 0);
      return shell(
        "visual-contrast",
        `<div style="width:100%;display:grid;grid-template-columns:1fr 100px 1fr;align-items:stretch;gap:20px">` +
          `<div style="display:flex;align-items:center;justify-content:center;padding:30px;border:1px solid ${TK.border};border-radius:24px;background:${TK.bg}99">${node(oldPart, `color:${TK.muted};text-align:center`, "contrast-old")}</div>` +
          `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px"><div style="color:${TK.accentH};font-size:48px;font-weight:900">→</div>${line("contrast-bridge")}</div>` +
          `<div style="display:flex;align-items:center;justify-content:center;padding:30px;border:1px solid ${TK.accent}88;border-radius:24px;background:${TK.accent}18">${node(newPart, `color:${TK.fg};text-align:center`, "contrast-new")}</div></div>`,
      );
    }
    case "sequence": {
      const gateGap = Math.min(205, Math.floor(760 / Math.max(1, parts.length - 1)));
      const gateLabelWidth = Math.min(176, gateGap + 24);
      const gateLabelSize = parts.length > 4 ? 19 : 23;
      const gates = parts
        .map(
          (part, index) =>
            `<div class="scene-calibration-gate" style="position:absolute;left:${92 + index * gateGap - Math.round((gateLabelWidth - 112) / 2)}px;top:${index % 2 === 0 ? 110 : 215}px;width:${gateLabelWidth}px;height:180px;display:flex;flex-direction:column;align-items:center;z-index:9"><div style="width:112px;height:112px;flex:0 0 auto;border:3px solid ${index === parts.length - 1 ? TK.green : TK.accent}cc;clip-path:polygon(14% 0,86% 0,100% 50%,86% 100%,14% 100%,0 50%);background:radial-gradient(circle,${index === parts.length - 1 ? TK.green : TK.accent}30 0 42%,${TK.bg} 44%);box-shadow:0 0 26px ${index === parts.length - 1 ? TK.green : TK.accent}33"></div><div class="scene-safe-label" data-text-safe style="position:relative;z-index:10;width:${gateLabelWidth}px;min-height:46px;margin-top:8px;padding:5px 7px;border-radius:8px;background:${TK.bg}ee;text-align:center">${node(part, `font-size:${gateLabelSize}px;text-align:center`, "sequence-node")}</div></div>`,
        )
        .join("");
      return shell(
        "visual-sequence",
        `<div style="position:relative;width:100%;height:100%">` +
          `<svg viewBox="0 0 964 404" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible"><path class="scene-loop-path" d="M80 180 C210 30 385 55 470 190 S720 330 875 170 C930 110 910 40 790 36" fill="none" stroke="${TK.accentH}" stroke-width="8" stroke-linecap="round" stroke-dasharray="16 18" stroke-dashoffset="820"/><path d="M790 36 C630 -25 350 10 130 116" fill="none" stroke="${TK.green}" stroke-width="3" stroke-dasharray="8 14" opacity=".62"/></svg>` +
          gates +
          `<div class="scene-runner" data-text-avoid style="position:absolute;left:0;top:0;width:74px;height:92px;border-radius:8px;background:${TK.fg};box-shadow:0 16px 32px #0008, inset 0 -12px 0 #d6d2c8;offset-path:path('M80 180 C210 30 385 55 470 190 S720 330 875 170 C930 110 910 40 790 36 C630 -25 350 10 130 116');offset-distance:0%;z-index:8" data-layout-allow-occlusion><span style="position:absolute;left:13px;right:13px;top:22px;height:5px;background:${TK.accent};box-shadow:0 16px 0 ${TK.muted},0 32px 0 ${TK.muted}"></span></div>` +
          `<div class="scene-winner-pulse" style="position:absolute;right:78px;top:34px;width:92px;height:92px;border:4px solid ${TK.green};border-radius:50%;z-index:2"></div>` +
          `<div class="scene-reject" style="position:absolute;left:372px;top:294px;width:42px;height:54px;background:${TK.muted};opacity:.7;transform:rotate(-10deg)"></div>` +
          `<div class="scene-reject" style="position:absolute;left:602px;top:308px;width:42px;height:54px;background:${TK.muted};opacity:.55;transform:rotate(12deg)"></div>` +
          `</div>`,
      );
    }
    case "cause_effect": {
      const cause = byRole("cause", 0);
      const process = byRole("process", Math.min(1, parts.length - 1));
      const result = byRole("result", parts.length - 1);
      return shell(
        "visual-cause-effect",
        `<div style="position:relative;width:100%;height:100%;overflow:hidden">` +
          `<div class="scene-scroll" style="position:absolute;left:10px;top:82px;width:410px;height:150px;transform-origin:right center;background:repeating-linear-gradient(90deg,#d9d3c8 0 42px,#c8c1b5 42px 44px);box-shadow:0 18px 20px #0008"><div class="scene-paper-mark" data-text-safe style="position:absolute;left:34px;right:70px;top:38px;min-height:74px;padding:8px 10px;display:flex;align-items:center;background:#eee9dfdd">${node(cause, `color:#24211d;font-size:27px;line-height:1.22;text-align:left`, "cause-node")}</div></div>` +
          `<div class="scene-machine" style="position:absolute;left:390px;top:56px;width:260px;height:258px;clip-path:polygon(12% 0,88% 0,100% 16%,100% 84%,88% 100%,12% 100%,0 84%,0 16%);background:linear-gradient(145deg,#30333a,#15171b);border:2px solid ${TK.accent}88;box-shadow:0 20px 34px #0009;z-index:4"><div class="scene-machine-core" data-text-avoid style="position:absolute;left:56px;top:38px;width:148px;height:148px;border:12px solid ${TK.accent};border-radius:50%;box-shadow:inset 0 0 0 12px #111,0 0 30px ${TK.accent}55"></div></div>` +
          `<div class="scene-process-label" data-text-safe style="position:absolute;left:400px;top:326px;width:240px;min-height:54px;padding:7px 10px;border-top:3px solid ${TK.accent};border-radius:7px;background:${TK.bg}f2;text-align:center;z-index:7">${node(process, `font-size:24px;line-height:1.18;color:${TK.fg2};text-align:center`, "process-node")}</div>` +
          `<div style="position:absolute;left:430px;top:18px;width:180px;height:12px;background:${TK.border};border-radius:99px;overflow:hidden"><div class="scene-pressure" style="width:100%;height:100%;background:linear-gradient(90deg,${TK.amber},${TK.danger})"></div></div>` +
          `<div style="position:absolute;left:680px;top:78px;width:250px;height:250px">` +
            `<div class="scene-output-sheet" style="position:absolute;left:16px;top:18px;width:170px;height:210px;background:#d7d3ca;box-shadow:0 14px 28px #0008"></div>` +
            `<div class="scene-output-sheet" style="position:absolute;left:42px;top:34px;width:170px;height:210px;background:#e5e1d8;box-shadow:0 14px 28px #0008"></div>` +
            `<div class="scene-output-sheet" style="position:absolute;left:68px;top:50px;width:170px;height:210px;background:#f2efe8;box-shadow:0 14px 28px #0008"><span style="position:absolute;left:24px;right:24px;top:40px;height:8px;background:${TK.muted};box-shadow:0 28px 0 ${TK.muted},0 56px 0 ${TK.muted},0 84px 0 ${TK.muted}"></span></div>` +
            `<div class="scene-result-seal" style="position:absolute;right:-2px;bottom:18px;padding:12px 18px;border:4px solid ${TK.danger};color:${TK.danger};font-size:28px;font-weight:900;transform:rotate(-8deg);background:${TK.bg}dd">${esc(result.text)}</div>` +
          `</div></div>`,
      );
    }
    case "replacement": {
      const oldPart = byRole("old", 0);
      const newPart = byRole("new", parts.length - 1);
      return shell(
        "visual-replacement",
        `<div style="position:relative;width:100%;height:100%;overflow:hidden">` +
          `<div class="scene-manual" style="position:absolute;left:44px;top:24px;width:430px;height:350px;transform-origin:left center">` +
            [0, 1, 2, 3, 4].map((index) => `<div class="scene-manual-page" style="position:absolute;left:${index * 18}px;top:${index * 12}px;width:330px;height:250px;background:${index === 4 ? "#eee9df" : "#bcb6aa"};box-shadow:0 18px 32px #0009;clip-path:polygon(0 0,90% 0,100% 12%,100% 100%,0 100%)"><span style="position:absolute;left:30px;right:30px;top:38px;height:7px;background:#3b3833;box-shadow:0 30px 0 #777168,0 60px 0 #777168,0 90px 0 #777168,0 120px 0 #777168"></span></div>`).join("") +
            `<div class="scene-manual-label" data-text-safe style="position:absolute;left:48px;top:156px;width:330px;min-height:78px;padding:8px 12px;background:#eee9dff2;z-index:6">${node(oldPart, `font-size:28px;line-height:1.2;color:#24211d;text-align:center`, "replacement-old")}</div>` +
          `</div>` +
          `<div class="scene-scan-beam" data-text-avoid style="position:absolute;left:82px;top:132px;width:375px;height:7px;background:${TK.danger};box-shadow:0 0 24px ${TK.danger};z-index:5"></div>` +
          `<div class="scene-hypothesis" style="position:absolute;right:60px;top:62px;width:350px;height:282px;display:flex;align-items:center;justify-content:center">` +
            `<div class="scene-orbit-dot" style="position:absolute;inset:6px;border:2px dashed ${TK.accentH};border-radius:50%"><span style="position:absolute;left:50%;top:-12px;width:24px;height:24px;border-radius:50%;background:${TK.green};box-shadow:0 0 24px ${TK.green}"></span></div>` +
            `<div style="width:226px;height:226px;border-radius:50%;background:radial-gradient(circle at 38% 32%,${TK.accentH},${TK.accent} 42%,#171923 74%);box-shadow:0 0 0 12px ${TK.accent}22,0 26px 60px #0009;display:flex;align-items:center;justify-content:center;padding:32px">${node(newPart, `font-size:31px;text-align:center`, "replacement-new")}</div>` +
          `</div></div>`,
      );
    }
    case "statement": {
      const inner = parts
        .map((part, index) => node(part, `${index === 0 ? "font-size:54px;color:" + TK.fg : "font-size:28px;color:" + TK.fg2};text-align:left`, "statement-line"))
        .join("");
      return shell(
        "visual-statement",
        `<div style="width:100%;display:flex;flex-direction:column;align-items:flex-start;gap:24px">${inner}${line("statement-rule")}</div>`,
      );
    }
  }
}

// ── 六 kind 卡片渲染(尺寸为 flow 排布的预估占位)─────────────────────────────────
// [T-295] 接受 motion:renderCardBase 产 kind 专属结构,renderCard 再叠加 motion 动画钩子。
function renderCardBase(
  card: VideoRenderCard,
  mediaPrefix: string,
  motion: VideoCardMotion,
): CardBox {
  switch (card.kind) {
    case "stat": {
      const strike = card.strike
        ? `<span style="position:absolute;left:-6px;right:-6px;top:50%;height:4px;background:${TK.danger};transform:rotate(-12deg)"></span>`
        : "";
      const unit = card.unit
        ? `<span style="color:${TK.fg2};font-size:44px;font-weight:650">${esc(card.unit)}</span>`
        : "";
      // [T-295] 数值裹进 .stat-val 独立 span:counter 的 onUpdate 只写它、不吞掉 strike 子层。
      // [T-320b] 高度 = 上下 padding(18×2) + label 换行行数×行高(17px) + 大数字行(84px,line-height:1 固定)。
      const STAT_W = 1000;
      const statLabelLines = estimateWrappedLines(card.label, STAT_W - 44 * 2, 30);
      const statHeight = Math.max(420, 38 * 2 + statLabelLines * lineBox(30) + 132);
      return {
        width: STAT_W,
        height: statHeight,
        style: `background:linear-gradient(135deg,${col(card.tone)}24,${TK.surface} 62%);border:1px solid ${col(card.tone)}77;border-radius:24px;box-shadow:rgba(0,0,0,.42) 0 18px 60px;padding:38px 44px;min-width:920px;overflow:hidden;display:flex;flex-direction:column;justify-content:center;`,
        inner:
          `<div style="position:absolute;right:-50px;top:-90px;width:300px;height:300px;border-radius:50%;background:${col(card.tone)}16"></div>` +
          `<div style="position:relative;color:${TK.fg2};font-size:30px;font-weight:700;letter-spacing:.02em">${esc(card.label)}</div>` +
          `<div style="position:relative;display:flex;align-items:baseline;gap:16px;margin-top:16px"><span style="position:relative;color:${col(card.tone)};font-size:132px;font-weight:850;letter-spacing:-.055em;line-height:.9"><span class="stat-val">${esc(card.value)}</span>${strike}</span>${unit}</div>`,
      };
    }
    case "quote": {
      // [T-320b] 高度 = 上下 padding(18×2) + text 换行行数×行高(30px)。原固定 92 在 576px 可用宽下
      // 换 2–3 行远超,后卡被压。可用宽 = 620 - 22×2。
      const QUOTE_W = 1000;
      const quoteLines = estimateWrappedLines(card.text, QUOTE_W - 54 * 2, 52);
      const quoteHeight = Math.max(420, 42 * 2 + quoteLines * lineBox(52) + 24);
      return {
        width: QUOTE_W,
        height: quoteHeight,
        style: `background:linear-gradient(135deg,${TK.surface},${col(card.tone)}14);border:1px solid ${TK.border};border-radius:24px;padding:42px 54px;box-shadow:rgba(0,0,0,.42) 0 18px 60px;overflow:hidden;display:flex;flex-direction:column;justify-content:center;`,
        inner:
          `<span aria-hidden="true" style="position:absolute;right:34px;top:-28px;color:${col(card.tone)}28;font-family:Georgia,serif;font-size:190px;line-height:1">“</span>` +
          `<span style="position:relative;display:block;color:${TK.fg};font-size:52px;line-height:1.22;font-weight:800;letter-spacing:-.025em">${esc(card.text)}</span>` +
          `<span class="ovl" style="position:relative;display:block;width:118px;height:7px;border-radius:4px;background:${col(card.tone)};margin-top:24px"></span>`,
      };
    }
    case "list": {
      // [T-320b] 高度 = 上下 padding(16×2) + title(换行×18px + margin-bottom 12)+ 各 item 高度。
      // item 可用宽 = 560 - padding(20×2) - ✓图标 28 - gap 12;单条 item 超一行时按真实行数(原每条按 1 行,少算)。
      // 单条 item 盒高 = max(图标 28, 文本行数×行高 26px);首条无 margin-top,其余 +10。
      const LIST_W = 1000;
      const listTitleH = card.title
        ? estimateWrappedLines(card.title, LIST_W - 42 * 2, 28) * lineBox(28) + 22
        : 0;
      const itemAvail = LIST_W - 42 * 2 - 48 - 18;
      let listItemsH = 0;
      card.items.forEach((item, i) => {
        const itemLines = estimateWrappedLines(item.text, itemAvail, 38);
        listItemsH += Math.max(48, itemLines * lineBox(38)) + (i === 0 ? 0 : 18);
      });
      const listHeight = Math.max(440, 36 * 2 + listTitleH + listItemsH);
      return {
        width: LIST_W,
        height: listHeight,
        style: `background:linear-gradient(145deg,${TK.surface},${TK.bg});border:1px solid ${TK.border};border-radius:24px;box-shadow:rgba(0,0,0,.42) 0 18px 60px;padding:36px 42px;display:flex;flex-direction:column;justify-content:center;`,
        inner:
          (card.title
            ? `<div style="color:${TK.fg2};font-size:28px;font-weight:750;margin-bottom:22px">${esc(card.title)}</div>`
            : "") +
          card.items
            .map(
              (item, i) =>
                `<div class="li li${i}" style="display:flex;align-items:flex-start;gap:18px;margin-top:${i === 0 ? 0 : 18}px">` +
                `<span style="width:48px;height:48px;border-radius:15px;background:${col(item.tone)}22;color:${col(item.tone)};display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:850;flex:none">${i + 1}</span>` +
                `<span style="color:${TK.fg};font-size:38px;line-height:1.2;font-weight:720;letter-spacing:-.02em">${esc(item.text)}</span></div>`,
            )
            .join(""),
      };
    }
    case "compare": {
      // [T-295] bar motion:两侧各放一根 .growbar(左/右对比条 scaleX 依次生长,SPEC §7)。
      const withBar = motion === "bar";
      const side = (s: { title: string; items: string[]; tone: VideoRenderTone }): string =>
        `<div style="flex:1;background:${col(s.tone)}10;border:1px solid ${col(s.tone)}66;border-radius:18px;padding:24px 26px">` +
        (withBar
          ? `<div class="growbar" style="height:8px;border-radius:4px;background:${col(s.tone)};transform-origin:left center;margin-bottom:10px"></div>`
          : "") +
        `<div style="color:${col(s.tone)};font-size:28px;font-weight:850">${esc(s.title)}</div>` +
        s.items
          .map(
            (t) =>
              `<div style="color:${TK.fg};font-size:28px;line-height:1.25;font-weight:650;margin-top:12px">· ${esc(t)}</div>`,
          )
          .join("") +
        `</div>`;
      // [T-320b] 高度 = 卡上下 padding(14×2) + 较高一侧栏高度。每半栏可用宽 ≈ (760 - 卡 padding 14×2
      // - gap 12)/2 - 侧 padding(16×2);item(20px)换行按真实行数(原 32/行且不算换行,窄栏必少算)。
      const CMP_W = 1000;
      const sideAvail = (CMP_W - 20 * 2 - 56) / 2 - 26 * 2;
      const sideHeight = (s: {
        title: string;
        items: string[];
        tone: VideoRenderTone;
      }): number => {
        let h = 24 * 2; // 侧 padding(上下)
        if (withBar) h += 8 + 10; // growbar 高 8 + margin-bottom 10
        h += estimateWrappedLines(s.title, sideAvail, 28) * lineBox(28);
        for (const it of s.items) {
          h += estimateWrappedLines(it, sideAvail, 28) * lineBox(28) + 12;
        }
        return h;
      };
      return {
        width: CMP_W,
        height: Math.max(440, 20 * 2 + Math.max(sideHeight(card.left), sideHeight(card.right))),
        style: `background:${TK.surface};border:1px solid ${TK.border};border-radius:24px;box-shadow:rgba(0,0,0,.42) 0 18px 60px;padding:20px;display:flex;flex-direction:column;justify-content:center;`,
        inner: `<div style="display:flex;align-items:stretch;gap:16px">${side(card.left)}<div class="ovl" style="align-self:center;color:${TK.accent};font-size:40px;font-weight:900">→</div>${side(card.right)}</div>`,
      };
    }
    case "code": {
      const label = card.label
        ? `<div style="color:${TK.muted};font-size:17px;font-weight:600;margin-bottom:10px">${esc(card.label)}</div>`
        : "";
      // [T-320b] 高度 = 上下 padding(16×2) + label(换行×17px + margin-bottom 10)+ 代码软换行总行数×行高。
      // pre 是 white-space:pre-wrap:长行会软换,原按硬 \n 行数算,长行少算。等宽字 advance:半角 ≈ 0.6em、
      // 全角 ≈ 1.2em(monospace CJK 双宽);line-height:1.5 → 行高固定 30。
      const CODE_W = 1000;
      const codeLabelH = card.label
        ? estimateWrappedLines(card.label, CODE_W - 20 * 2, 17) * lineBox(17) + 10
        : 0;
      const codeLines = estimateWrappedLines(card.code, CODE_W - 20 * 2, 20, {
        latinFactor: 0.6,
        cjkFactor: 1.2,
      });
      return {
        width: CODE_W,
        height: Math.max(400, 16 * 2 + codeLabelH + codeLines * 30),
        style: `${CARD_BASE}padding:28px 34px;background:${TK.bg};display:flex;flex-direction:column;justify-content:center;`,
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

/**
 * [T-295] 卡片渲染 = kind 专属结构(renderCardBase)+ motion 动画钩子叠层。
 * 钩子绝对定位(.ovl,不占 flow):strike→红删除线、metaphor→底部绿线;非 compare 的 bar 补顶部生长条
 * (compare 的两条在 renderCardBase 各侧内)。motionTween 按 motion 选中这些钩子做 GSAP 动画。
 */
function renderCard(card: VideoRenderCard, mediaPrefix: string): CardBox {
  const visualSentence = renderVisualSentence(card);
  if (visualSentence) return visualSentence;
  const motion = resolveMotion(card);
  const box = renderCardBase(card, mediaPrefix, motion);
  let inner = box.inner;
  let height = box.height;
  if (motion === "bar" && card.kind !== "compare") {
    inner = growbarTop() + inner; // 顶部生长条(compare 的条已在两侧内)
    height += 20;
  }
  if (motion === "strike") inner += strikeOverlay();
  if (motion === "metaphor") inner += metaOverlay();
  return { ...box, inner, height };
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
  const imageFiles = options.imageFiles ?? new Set<string>();
  const DUR = f2(props.talkingHead.durationSec);
  const { width, height, fps } = props.delivery;
  const visualOnly = options.visualOnly === true;
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
    `inset:0;opacity:.9;background-image:url(${DASHED_GRID_DATA_URL});background-size:48px 48px;`,
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
  const isPortraitDelivery = props.delivery.height > props.delivery.width;
  const modes = props.scenes.map((s) => {
    const sceneBroll = brollByScene.get(s.id) ?? [];
    return resolveSceneMode(s, sceneBroll.length, {
      hasLargeStage: sceneBroll.some(
        (b) => !b.big && (b.presentation ?? "large_stage") === "large_stage",
      ),
      portrait: isPortraitDelivery,
    });
  });
  const initialMode = modes[0] ?? "pip";
  const initPos = resolveHeadBox(L, initialMode);
  // 横屏无素材场景的兜底背景：复用同一口播源做低亮度模糊氛围层，前景人物仍完整
  // contain 展示。它只消除大片死黑，不创造任何内容，也不会与主音轨重复出声。
  if (!isPortraitDelivery && modes.includes("focus")) {
    ctx.clips.push(
      `<video id="thAmbient" class="clip talking-head-ambient" src="${esc(mediaPrefix + props.talkingHead.file)}" aria-hidden="true" muted data-start="0" data-duration="${fmt(DUR)}" data-track-index="899" ` +
        `style="position:absolute;left:0;top:0;width:${width}px;height:${height}px;object-fit:cover;filter:blur(42px) brightness(.28) saturate(.82);transform:scale(1.08);opacity:.9;"></video>`,
    );
  }
  if (!visualOnly) {
    ctx.clips.push(
      `<video id="th" class="clip" src="${esc(mediaPrefix + props.talkingHead.file)}"${props.talkingHead.hasAudio ? ' data-has-audio="true"' : ""} data-start="0" data-duration="${fmt(DUR)}" data-track-index="900" ` +
      // [T-291] 口播头改 object-fit:contain(完整不裁,治「脸没在框」)+ 深色底补边。
      // 原 cover+object-position:center 20% 会裁掉竖屏源上下大半、位置写死猜测无人脸检测 → 脸出框。
      // 合 video-editing skill 铁律「不随意裁切口播画面」。深色 letterbox 是「保完整」的可接受代价。
      `style="position:absolute;left:${initPos.left}px;top:${initPos.top}px;width:${initPos.width}px;height:${initPos.height}px;border-radius:${initPos.borderRadius}px;object-fit:contain;background:#08090a;` +
        `z-index:900;border:2px solid ${TK.accent};box-shadow:0 18px 60px rgba(0,0,0,.5),0 0 0 6px ${TK.accent}1f;"></video>`,
    );
  }
  // 形态切换 tween:在模式变化的场景边界前 0.7s 开始(首场景不切)
  for (let i = 1; i < props.scenes.length; i++) {
    if (visualOnly || modes[i] === modes[i - 1]) continue;
    const to = resolveHeadBox(L, modes[i]!);
    const at = Math.max(0, props.scenes[i]!.startSec - 0.7);
    ctx.tweens.push(
      `tl.to("#th",{left:${to.left},top:${to.top},width:${to.width},height:${to.height},borderRadius:${to.borderRadius},duration:.7,ease:"power2.inOut"},${fmt(at)});`,
    );
  }

  // 场景 title/summary 只服务编辑器回顾，绝不烧进成片。成片只渲染 AI 明确选中的
  // 信息卡、special 与真实素材，避免“SCENE 5 + 口播摘要”的干巴 PPT 片头。
  props.scenes.forEach((scene, si) => {
    const mode = modes[si]!;

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

    const rightEdge = visualOnly ? width - 60 : L.rightEdge[mode];
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

    const resolvePresentation = (broll: VideoRenderBroll) =>
      resolveBrollPresentation(broll);
    const isOccludingVisual = (candidate: (typeof flowItems)[number]) =>
      candidate.type === "card" || resolvePresentation(candidate.broll) !== "overlay";

    for (const [itemIndex, item] of flowItems.entries()) {
      // 卡片只活到下一张真正会占据主舞台的视觉。旧实现只看“紧邻下一项”，且
      // 对 0.35 秒内进场的主素材反而把卡片延长到场景尾，导致标题藏在图片后面。
      const nextOccludingAt = flowItems
        .slice(itemIndex + 1)
        .find((candidate) => isOccludingVisual(candidate))?.at;
      const endAt = scene.endSec;
      if (item.type === "card") {
        const box = renderCard(item.card, mediaPrefix);
        // 信息卡是当前口播 beat 的主视觉，不是左上角的小标签。每个 beat 复用同一
        // 信息舞台并替换上一个，避免卡片沿 flow 越堆越散、大片区域仍然空黑。
        const stageWidth = Math.max(1, rightEdge - L.contentX);
        const stageHeight = visualOnly
          ? props.delivery.height > props.delivery.width
            ? 1120
            : 760
          : props.delivery.height > props.delivery.width
            ? mode === "pip"
              ? 650
              : 520
            : 640;
        const stageTop = visualOnly
          ? props.delivery.height > props.delivery.width
            ? 248
            : 120
          : L.contentY[mode];
        const pos = {
          x: L.contentX + Math.max(0, Math.round((stageWidth - box.width) / 2)),
          y: stageTop + Math.max(0, Math.round((stageHeight - box.height) / 2)),
        };
        // 信息卡承担两段真实素材之间的视觉接力，必须一直保持到下一个主视觉/信息卡
        // 进场或本场结束。旧的 5.8 秒硬上限会在长口播中制造 4~10 秒纯黑空档，
        // 即使总导演已经给本场配了卡片，成片仍像“卡片播完后断电”。卡片内部已有
        // 持续的轻量 motion，延长的是承接时间，不是在代码里替 AI 选择创作语义。
        const cardEnd = Math.min(
          scene.endSec,
          nextOccludingAt ?? scene.endSec,
        );
        // 下一段真实主画面马上进场时，不闪一张不到 1.2 秒、来不及阅读的信息卡。
        // 该时间段会由后续真实素材承接；信息卡只服务真正的空镜与语义节拍。
        if (cardEnd - item.at < 1.2) continue;
        const id = `c${nextTrack(ctx)}`;
        const visualOnlyScale = visualOnly && width > height && item.card.visualPlan ? 1.34 : 1;
        clip(
          ctx,
          id,
          nextTrack(ctx),
          item.at,
          f2(cardEnd - item.at),
          `left:${pos.x}px;top:${pos.y}px;width:${box.width}px;height:${box.height}px;z-index:420;transform:scale(${visualOnlyScale});transform-origin:center center;${box.style}`,
          box.inner,
        );
        // [T-295] 富动画:按 card.motion(缺省按 kind 派生)落配方,替换整块 appear。
        // list 逐条进场已并入 motionTween 的 reveal 分支。
        motionTween(ctx, id, item.card, item.at, cardEnd);
      } else {
        // B-roll:图片与视频必须按物化输入的权威 MIME 分流。旧实现无条件生成 <video>，
        // PNG/JPEG 会解码失败，只剩黑框和标题却仍被记为渲染成功。
        const b = item.broll;
        const isImage = imageFiles.has(b.file);
        const presentation = resolvePresentation(b);
        const isPortrait = props.delivery.height > props.delivery.width;
        const geometry =
          presentation === "full_frame"
            ? resolveMainBrollGeometry(
                props.delivery.width,
                props.delivery.height,
                "full_frame",
              )
            : presentation === "large_stage"
              ? resolveMainBrollGeometry(
                  props.delivery.width,
                  props.delivery.height,
                  "large_stage",
                )
              : null;
        const w = geometry?.width ?? 460;
        const vh = geometry?.height ?? Math.round(((w - 20) * 9) / 16);
        // 素材标签只用于编辑器/无障碍定位，不属于成片内容。此前这里把文件名、
        // “生成图”等内部操作词作为 footer 烧进画面，既泄露实现细节又污染成片。
        const h = geometry?.height ?? vh + 20;
        const pos =
          presentation === "overlay"
            ? place(w, h)
            : { x: geometry!.x, y: geometry!.y };
        const frameId = `br${nextTrack(ctx)}`;
        // 非 overlay 主素材是互斥轨：下一张主素材开始即切断当前素材。这样即便 AI
        // 给出相互覆盖的 durationSec，也不会再出现横图底上叠一张竖图的三层画面。
        const nextMainBrollAt =
          presentation === "overlay"
            ? undefined
            : flowItems
                .slice(itemIndex + 1)
                .find(
                  (candidate) =>
                    candidate.type === "broll" &&
                    resolvePresentation(candidate.broll) !== "overlay",
                )?.at;
        const requestedBrollEnd = b.durationSec
          ? Math.min(endAt, b.at + b.durationSec)
          : endAt;
        const brollEnd = Math.min(
          requestedBrollEnd,
          nextMainBrollAt ?? requestedBrollEnd,
        );
        const brollDur = f2(brollEnd - b.at);
        if (brollDur <= 0.05) continue;
        // full_frame / large_stage 是本拍的视觉主层，必须盖过此前仍在存续的信息卡；
        // overlay 才允许与卡片并列。字幕和角标在下方以更高 z-index 保持可读。
        const frameLayer =
          presentation === "full_frame"
            ? "z-index:940;"
            : presentation === "large_stage"
              ? "z-index:700;"
              : "";
        const mediaLayer =
          presentation === "full_frame"
            ? `z-index:${isPortrait ? 942 : 941};`
            : presentation === "large_stage"
              ? `z-index:${isPortrait ? 702 : 701};`
              : "";
        const padding = presentation === "full_frame" ? 0 : 10;
        const paddedMediaBounds = {
          x: pos.x + padding,
          y: pos.y + padding,
          width: Math.max(1, w - padding * 2),
          height: Math.max(1, h - padding * 2),
        };
        const mediaBounds = resolveBrollMediaBounds(
          props.delivery.width,
          props.delivery.height,
          presentation,
          b.visualRole,
          paddedMediaBounds,
        );
        const mediaRect = fitMediaRect(
          mediaBounds,
          b.sourceWidth,
          b.sourceHeight,
        );
        // 非全屏素材的外框跟随真实媒体比例；竖图不再套进一块横向大黑卡。
        const visibleFrame =
          presentation === "full_frame" ||
          (isPortrait && presentation === "large_stage")
            ? { x: pos.x, y: pos.y, width: w, height: h }
            : {
                x: Math.max(pos.x, mediaRect.x - padding),
                y: Math.max(pos.y, mediaRect.y - padding),
                width: Math.min(w, mediaRect.width + padding * 2),
                height: Math.min(h, mediaRect.height + padding * 2),
              };
        const frameStyle =
          presentation === "full_frame"
            ? `left:${visibleFrame.x}px;top:${visibleFrame.y}px;${frameLayer}width:${visibleFrame.width}px;height:${visibleFrame.height}px;background:${TK.bg};`
            : `left:${visibleFrame.x}px;top:${visibleFrame.y}px;${frameLayer}${CARD_BASE}padding:${padding}px;width:${visibleFrame.width}px;height:${visibleFrame.height}px;`;
        // large_stage 只清理它负责的舞台，不侵入人物与字幕安全区。该层在素材下、
        // 在旧卡片/special 上，确保静态图出现时不会继续透出上一张标题或动画。
        if (presentation === "large_stage") {
          const clearId = `${frameId}clear`;
          const clearWidth = isPortrait
            ? props.delivery.width
            : Math.round((1330 / 1920) * props.delivery.width);
          const clearHeight = isPortrait
            ? Math.round((850 / 1920) * props.delivery.height)
            : props.delivery.height;
          clip(
            ctx,
            clearId,
            nextTrack(ctx),
            b.at,
            brollDur,
            `left:0px;top:0px;z-index:699;width:${clearWidth}px;height:${clearHeight}px;background:${TK.bg};`,
            "",
            "clip main-visual-clear",
          );
        }
        clip(
          ctx,
          frameId,
          nextTrack(ctx),
          b.at,
          brollDur,
          frameStyle,
          `<div style="height:${Math.max(0, visibleFrame.height - padding * 2)}px"></div>`,
        );
        appear(ctx, frameId, b.at, brollEnd);

        // 横图/方图进入竖屏时，完整前景必须 contain 才可读，但只放完整前景会形成
        // “中央窄条 + 巨幅黑边”。同源氛围层只负责填满该舞台，真正可读内容仍由
        // 上层 contain 前景承担；横屏链路保持既有单层输出不变。
        if (isPortrait && presentation !== "overlay") {
          const ambientId = `${frameId}a`;
          const ambientLayer = presentation === "full_frame" ? 941 : 701;
          const ambientStyle =
            `position:absolute;left:${pos.x}px;top:${pos.y}px;width:${w}px;height:${h}px;z-index:${ambientLayer};` +
            `object-fit:cover;filter:blur(28px) brightness(.34) saturate(.82);transform:scale(1.06);`;
          if (isImage) {
            ctx.clips.push(
              `<img id="${ambientId}" class="clip portrait-ambient-fill" src="${esc(mediaPrefix + b.file)}" alt="" aria-hidden="true" ` +
                `data-start="${fmt(b.at)}" data-duration="${fmt(brollDur)}" data-track-index="${nextTrack(ctx)}" style="${ambientStyle}">`,
            );
          } else {
            ctx.clips.push(
              `<video id="${ambientId}" class="clip portrait-ambient-fill" src="${esc(mediaPrefix + b.file)}" aria-hidden="true" muted ` +
                `data-start="${fmt(b.at)}" data-duration="${fmt(brollDur)}" data-track-index="${nextTrack(ctx)}" style="${ambientStyle}"></video>`,
            );
          }
          appear(ctx, ambientId, b.at, brollEnd);
        }
        const mediaId = `${frameId}${isImage ? "i" : "v"}`;
        const mediaStyle =
          `position:absolute;left:${mediaRect.x}px;top:${mediaRect.y}px;width:${mediaRect.width}px;height:${mediaRect.height}px;${mediaLayer}` +
          `border-radius:${presentation === "full_frame" ? 0 : 8}px;object-fit:contain;background:${TK.bg};` +
          (presentation === "full_frame" ? "" : `border:1px solid ${TK.border};`);
        if (isImage) {
          ctx.clips.push(
            `<img id="${mediaId}" class="clip" src="${esc(mediaPrefix + b.file)}" alt="${esc(b.label)}" ` +
              `data-start="${fmt(b.at)}" data-duration="${fmt(brollDur)}" data-track-index="${nextTrack(ctx)}" style="${mediaStyle}">`,
          );
        } else {
          // 保持既有 video 标记形状与属性顺序，避免无意义改动历史快照/HyperFrames 协议。
          ctx.clips.push(
            `<video id="${mediaId}" class="clip" src="${esc(mediaPrefix + b.file)}" aria-label="${esc(b.label)}" muted data-start="${fmt(b.at)}" data-duration="${fmt(brollDur)}" data-track-index="${nextTrack(ctx)}" ` +
              `style="${mediaStyle}"></video>`,
          );
        }
        appear(ctx, mediaId, b.at, brollEnd);
        animateBrollMedia(ctx, mediaId, b.motion ?? "static", b.at, brollEnd);
        if (
          presentation === "full_frame" &&
          b.visualRole === "screen_recording" &&
          b.speakerMode === "pip_bottom_left"
        ) {
          const pip = resolveFullFrameSpeakerPip(
            props.delivery.width,
            props.delivery.height,
          );
          const restore = resolveHeadBox(L, mode);
          const transition = Math.min(0.32, Math.max(0.12, brollDur / 4));
          ctx.tweens.push(
            `tl.set("#th",{zIndex:945},${fmt(b.at)});`,
            `tl.to("#th",{left:${pip.left},top:${pip.top},width:${pip.width},height:${pip.height},borderRadius:${pip.borderRadius},duration:${fmt(transition)},ease:"power2.out"},${fmt(b.at)});`,
            `tl.to("#th",{left:${restore.left},top:${restore.top},width:${restore.width},height:${restore.height},borderRadius:${restore.borderRadius},duration:${fmt(transition)},ease:"power2.inOut"},${fmt(Math.max(b.at, brollEnd - transition))});`,
            `tl.set("#th",{zIndex:900},${fmt(brollEnd)});`,
          );
        }
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
      "left:0;right:0;bottom:56px;text-align:center;z-index:950;",
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
export function collectMediaFiles(
  props: VideoRenderProps,
  inputMimeTypes: ReadonlyMap<string, string | null> = new Map(),
): {
  videos: string[];
  images: string[];
} {
  const videos: string[] = [props.talkingHead.file];
  const images: string[] = [];
  for (const b of props.broll) {
    const mimeType = inputMimeTypes.get(b.file)?.split(";", 1)[0]?.toLowerCase();
    // B-roll 契约历史上没有 media kind，且 mountAs 使用 assetId、没有扩展名，不能靠
    // 文件名猜。执行沙箱已经带着资产库权威 MIME，把 image/* 直拷；其余保留既有视频
    // 预处理语义。此前把官网截图一律交给 ffprobe，稳定报“未识别出视频流”。
    if (mimeType?.startsWith("image/")) {
      if (!images.includes(b.file)) images.push(b.file);
    } else if (!videos.includes(b.file)) {
      videos.push(b.file);
    }
  }
  for (const scene of props.scenes) {
    for (const card of scene.cards) {
      if (card.kind === "image" && !images.includes(card.file)) images.push(card.file);
    }
  }
  return { videos, images };
}
