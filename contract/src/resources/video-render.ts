import { z } from "zod";

// [T-254a] video.render 决策 props 契约(渲染器无关,SPEC 2026-07-11
// execution-layer-video-pipeline §3.2)。
//
// 这是「脑→手」的决策 JSON 单一真值:T-254b 四决策 runner(分场/卡片/B-roll/双语字幕)
// 产出它,T-254a video.render executor(HyperFrames 模板生成器)消费它。**AI 不写任何
// 模板代码** —— 全部视觉由固定模板按本 props 确定性排布;special 动画只允许 3 个预设枚举。
//
// 渲染器无关:字段只描述「讲什么/何时出现/什么形态」,不含 HyperFrames/GSAP/Remotion
// 任何术语(skill 打法已在两个渲染器上验证,将来可换渲染器零改动)。
// 文件引用(talkingHead.file / image 卡 file / broll file)一律是沙箱 input/ 的
// mountAs 相对路径 —— 与 executionTaskInput.mountAs 同一域。

// 语义色调(模板映射到设计系统 token,AI 只挑语义不挑色值)。
export const videoRenderTone = z.enum([
  "accent",
  "green",
  "amber",
  "muted",
  "danger",
]);
export type VideoRenderTone = z.infer<typeof videoRenderTone>;

// [T-295] 信息卡动画意图(决策层「5 问」产出,template 落对应 GSAP 富动画配方,替换整块淡入)。
//   bar     = 对比条生长(前后/多少/快慢对比)
//   counter = 数字递增计数器(数字/规模/速度)
//   metaphor= 视觉隐喻/强进度式揭示(抽象概念可具象)
//   strike  = 建立→推翻(元素先亮起像要用,再被划掉/盖红戳)
//   reveal  = 逐条/逐元素进度式揭示(列举/步骤)
//   plain   = 精炼进场(纯陈述;非整块闷淡入,轻错峰)
// **必须 optional**:弱模型(用户配 MiniMax 等)可能不产 motion,template 缺省时按卡类型派生兜底,
// 保证仍有富动画(stat→counter / compare→bar / list·code→reveal / quote·image→plain)。
export const videoCardMotion = z.enum([
  "bar",
  "counter",
  "metaphor",
  "strike",
  "reveal",
  "plain",
]);
export type VideoCardMotion = z.infer<typeof videoCardMotion>;

export const videoCardVisualRelation = z.enum([
  "magnitude",
  "contrast",
  "sequence",
  "cause_effect",
  "replacement",
  "statement",
]);
export const videoCardVisualRole = z.enum([
  "subject",
  "measure",
  "old",
  "new",
  "step",
  "cause",
  "process",
  "result",
  "claim",
  "evidence",
  "conclusion",
]);
export const videoCardVisualPlan = z.object({
  relation: videoCardVisualRelation,
  parts: z
    .array(z.object({ text: z.string().min(1), role: videoCardVisualRole }))
    .min(1)
    .max(6),
});
export type VideoCardVisualPlan = z.infer<typeof videoCardVisualPlan>;

// 交付规格:v1 固定 1920x1080 / 30fps(默认值即规格;留字段是为了将来竖版/60fps
// 不改契约形状)。
export const videoRenderDelivery = z.object({
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).default(30),
});
export type VideoRenderDelivery = z.infer<typeof videoRenderDelivery>;

export const videoRenderMeta = z.object({
  /** 成片标题(交付元信息/文件命名用,不上画面)。 */
  title: z.string().min(1),
  /** 品牌角标文案(左上常驻);空串 = 不渲染角标。 */
  brandLabel: z.string().default(""),
});
export type VideoRenderMeta = z.infer<typeof videoRenderMeta>;

// 口播人物视频(整片主时钟的载体:master 音频来自它,durationSec 即成片时长)。
export const videoRenderTalkingHead = z.object({
  /** 沙箱 input/ 的 mountAs 相对路径。 */
  file: z.string().min(1),
  /** 粗剪人物视频时长(秒)= 成片总时长。 */
  durationSec: z.number().positive(),
  hasAudio: z.boolean().default(true),
});
export type VideoRenderTalkingHead = z.infer<typeof videoRenderTalkingHead>;

// 双语字幕行(SRT 主时钟铁律:start/end 来自用户上传的 SRT,决策 runner 只做
// 错字校正与英文行补全,不改时间)。
export const videoRenderCaption = z.object({
  start: z.number().nonnegative(),
  end: z.number().positive(),
  /** 中文行(主)。 */
  cn: z.string().min(1),
  /** 英文行(副,可缺)。 */
  en: z.string().optional(),
});
export type VideoRenderCaption = z.infer<typeof videoRenderCaption>;

// ── 信息卡六 kind(e03 打法泛化:kpi/proof→stat,stmt→quote,node 组→list,
//    对照→compare,代码证据→code,截图证据→image)──────────────────────────────
// `at` 为绝对秒(吸附 SRT 行 start 集合的 refine 归 T-254b 决策侧;本契约只保证
// at 落在所属场景区间内)。卡片从 at 出现,持续到场景结束。

const cardBase = {
  /** 出现时刻(绝对秒)。 */
  at: z.number().nonnegative(),
  /** [T-295] 动画意图(决策层可选产出;缺省 template 按 kind 派生富动画)。 */
  motion: videoCardMotion.optional(),
  /** [T-794] AI 已声明的内容关系与原文部件；渲染器不得二次猜语义。 */
  visualPlan: videoCardVisualPlan.optional(),
};

export const videoRenderStatCard = z.object({
  kind: z.literal("stat"),
  ...cardBase,
  /** 大数字/大文本(如 "2–3"、"0")。 */
  value: z.string().min(1),
  unit: z.string().optional(),
  label: z.string().min(1),
  tone: videoRenderTone.default("accent"),
  /** 红线划掉(反证用,e03 proof 形态)。 */
  strike: z.boolean().default(false),
});

export const videoRenderQuoteCard = z.object({
  kind: z.literal("quote"),
  ...cardBase,
  /** 引述/断言原句(决策侧铁律:只从口播原文提取,禁编造)。 */
  text: z.string().min(1),
  tone: videoRenderTone.default("muted"),
});

export const videoRenderListCard = z.object({
  kind: z.literal("list"),
  ...cardBase,
  title: z.string().optional(),
  items: z
    .array(
      z.object({
        text: z.string().min(1),
        tone: videoRenderTone.default("green"),
        /** 逐条出现的相对延迟(秒,相对卡片 at);缺省按序 0.6s 步进。 */
        delaySec: z.number().nonnegative().optional(),
      }),
    )
    .min(1)
    .max(8),
});

export const videoRenderCompareCard = z.object({
  kind: z.literal("compare"),
  ...cardBase,
  left: z.object({
    title: z.string().min(1),
    items: z.array(z.string().min(1)).min(1).max(6),
    tone: videoRenderTone.default("muted"),
  }),
  right: z.object({
    title: z.string().min(1),
    items: z.array(z.string().min(1)).min(1).max(6),
    tone: videoRenderTone.default("accent"),
  }),
});

export const videoRenderCodeCard = z.object({
  kind: z.literal("code"),
  ...cardBase,
  /** 代码/命令原文(等宽渲染,不高亮 —— 确定性优先)。 */
  code: z.string().min(1),
  label: z.string().optional(),
});

export const videoRenderImageCard = z.object({
  kind: z.literal("image"),
  ...cardBase,
  /** 沙箱 input/ 的 mountAs 相对路径(截图/图片证据)。 */
  file: z.string().min(1),
  label: z.string().min(1),
});

export const videoRenderCard = z.discriminatedUnion("kind", [
  videoRenderStatCard,
  videoRenderQuoteCard,
  videoRenderListCard,
  videoRenderCompareCard,
  videoRenderCodeCard,
  videoRenderImageCard,
]);
export type VideoRenderCard = z.infer<typeof videoRenderCard>;

// ── special 联想动画:预设枚举 3(pipeline/comparison/steps),AI 只填数据 ────────
export const videoRenderSpecial = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pipeline"),
    nodes: z
      .array(
        z.object({
          label: z.string().min(1),
          sub: z.string().optional(),
          tone: videoRenderTone.default("accent"),
        }),
      )
      .min(2)
      .max(6),
  }),
  z.object({
    kind: z.literal("comparison"),
    left: z.object({
      title: z.string().min(1),
      items: z.array(z.string().min(1)).min(1).max(6),
      tone: videoRenderTone.default("muted"),
    }),
    right: z.object({
      title: z.string().min(1),
      items: z.array(z.string().min(1)).min(1).max(6),
      tone: videoRenderTone.default("accent"),
    }),
  }),
  z.object({
    kind: z.literal("steps"),
    items: z
      .array(
        z.object({
          label: z.string().min(1),
          sub: z.string().optional(),
        }),
      )
      .min(2)
      .max(6),
  }),
]);
export type VideoRenderSpecial = z.infer<typeof videoRenderSpecial>;

// 场景(语义分场,边界落 SRT 行边界 —— 该 refine 归 T-254b 决策侧)。
export const videoRenderScene = z.object({
  id: z.string().min(1),
  /** 场景眉标(如 "REAL STORY",全大写短语)。 */
  label: z.string().min(1),
  title: z.string().min(1),
  sub: z.string().optional(),
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
  /** 叙事角色:hook/cta 场景口播头默认右大卡,body 默认左下圆 PiP。 */
  role: z.enum(["hook", "body", "cta"]).default("body"),
  /**
   * 口播头形态显式覆盖(缺省按规则推导:≥3 视觉节点 → pip;hook/cta 且 <3 节点
   * → right;其余 → pip)。规则实现+快照锚定在模板生成器侧。
   */
  mode: z.enum(["right", "pip"]).optional(),
  cards: z.array(videoRenderCard).default([]),
  special: videoRenderSpecial.optional(),
});
export type VideoRenderScene = z.infer<typeof videoRenderScene>;

export const videoBrollMotion = z.enum([
  "static",
  "push_in",
  "pan_left",
  "pan_right",
]);
export type VideoBrollMotion = z.infer<typeof videoBrollMotion>;

/**
 * 素材的视觉角色由 material.match 的模型语义判断产出。渲染器只据此执行确定性版式边界，
 * 不得用文件名、业务词或“video=image?”一类媒体类型猜测创作语义。
 */
export const videoBrollVisualRole = z.enum([
  "screen_recording",
  "still_image",
  "live_footage",
]);
export type VideoBrollVisualRole = z.infer<typeof videoBrollVisualRole>;

// B-roll 插点(素材来自项目资产,决策侧硬规则:精确匹配被讲对象禁近似替代)。
export const videoRenderBroll = z.object({
  /** 插入时刻(绝对秒)。 */
  at: z.number().nonnegative(),
  /** 沙箱 input/ 的 mountAs 相对路径(视频素材)。 */
  file: z.string().min(1),
  /** 展示时长(秒);缺省播到所属场景结束。 */
  durationSec: z.number().positive().optional(),
  /** 画面上的证据标签(禁内部词)。 */
  label: z.string().min(1),
  /** 大幅展示(证据主角);否则中幅卡。 */
  big: z.boolean().default(false),
  /**
   * AI 编导给出的画面层级。旧计划可缺字段，渲染器按 large_stage 保证录屏/截图可读；
   * big 仅为旧计划兼容，渲染时等价于 full_frame。
   */
  presentation: z
    .enum(["full_frame", "large_stage", "overlay"])
    .optional(),
  /** AI 识别出的视觉角色；旧成片计划可缺省，新计划必须由 material.match 产出。 */
  visualRole: videoBrollVisualRole.optional(),
  /** full_frame 录屏期间人物的确定性承接方式。 */
  speakerMode: z.enum(["hidden", "pip_bottom_left"]).optional(),
  /** AI 编导给出的轻量镜头运动；界面截图/录屏应优先 static，避免破坏可读性。 */
  motion: videoBrollMotion.optional(),
  /** 原素材像素尺寸。渲染器据此保持比例，竖图/竖视频不得被强行铺成横版。 */
  sourceWidth: z.number().int().positive().optional(),
  sourceHeight: z.number().int().positive().optional(),
});
export type VideoRenderBroll = z.infer<typeof videoRenderBroll>;

// ── 顶层 props ────────────────────────────────────────────────────────────────
export const videoRenderProps = z
  .object({
    meta: videoRenderMeta,
    talkingHead: videoRenderTalkingHead,
    captions: z.array(videoRenderCaption).default([]),
    scenes: z.array(videoRenderScene).min(1),
    broll: z.array(videoRenderBroll).default([]),
    delivery: videoRenderDelivery.default({ width: 1920, height: 1080, fps: 30 }),
  })
  .superRefine((props, ctx) => {
    const dur = props.talkingHead.durationSec;
    // 场景:区间合法、按序、不重叠、不越片长。
    let prevEnd = 0;
    props.scenes.forEach((scene, i) => {
      if (scene.endSec <= scene.startSec) {
        ctx.addIssue({
          code: "custom",
          path: ["scenes", i, "endSec"],
          message: `场景 ${scene.id} endSec 必须大于 startSec`,
        });
        return;
      }
      if (scene.startSec < prevEnd - 1e-6) {
        ctx.addIssue({
          code: "custom",
          path: ["scenes", i, "startSec"],
          message: `场景 ${scene.id} 与前一场景重叠(需按时间顺序且不重叠)`,
        });
      }
      if (scene.endSec > dur + 1e-6) {
        ctx.addIssue({
          code: "custom",
          path: ["scenes", i, "endSec"],
          message: `场景 ${scene.id} 超出口播时长 ${dur}s`,
        });
      }
      scene.cards.forEach((card, j) => {
        if (card.at < scene.startSec - 1e-6 || card.at >= scene.endSec) {
          ctx.addIssue({
            code: "custom",
            path: ["scenes", i, "cards", j, "at"],
            message: `卡片 at=${card.at} 不在场景 ${scene.id} 区间 [${scene.startSec}, ${scene.endSec}) 内`,
          });
        }
      });
      prevEnd = scene.endSec;
    });
    // B-roll:插点在片长内。
    props.broll.forEach((b, i) => {
      if (b.at >= dur) {
        ctx.addIssue({
          code: "custom",
          path: ["broll", i, "at"],
          message: `B-roll at=${b.at} 超出口播时长 ${dur}s`,
        });
      }
      // 旧计划只有 big，无法证明素材是真录屏；缺视觉角色时降级安全舞台。
      // 新计划以 material.match 的显式 presentation + visualRole 为准。
      const presentation =
        b.presentation ??
        (b.big && b.visualRole === "screen_recording"
          ? "full_frame"
          : "large_stage");
      if (
        presentation === "full_frame" &&
        b.visualRole &&
        b.visualRole !== "screen_recording"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["broll", i, "presentation"],
          message: "只有录屏素材可以全屏；静态图片与真人素材必须保留安全舞台",
        });
      }
      if (
        presentation === "full_frame" &&
        b.visualRole === "screen_recording" &&
        b.speakerMode !== "pip_bottom_left"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["broll", i, "speakerMode"],
          message: "全屏录屏必须保留左下角人物画中画",
        });
      }
      if (
        b.speakerMode === "pip_bottom_left" &&
        !(
          presentation === "full_frame" &&
          b.visualRole === "screen_recording"
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["broll", i, "speakerMode"],
          message: "人物画中画只用于全屏录屏",
        });
      }
    });
    // 字幕:end>start、不越片长(容忍 SRT 最后一行的毫秒级溢出取整)。
    props.captions.forEach((cap, i) => {
      if (cap.end <= cap.start) {
        ctx.addIssue({
          code: "custom",
          path: ["captions", i, "end"],
          message: `字幕第 ${i + 1} 行 end 必须大于 start`,
        });
      }
    });
  });
export type VideoRenderProps = z.infer<typeof videoRenderProps>;

/** executor params 形状:{ props }(spec.params 经 executor.paramsSchema 二次校验)。 */
export const videoRenderParams = z.object({
  props: videoRenderProps,
});
export type VideoRenderParams = z.infer<typeof videoRenderParams>;
