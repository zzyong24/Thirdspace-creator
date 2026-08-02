import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * [T-254b] 制作视频四决策 skill 模板(video.scenes / video.cards / video.broll /
 * video.subtitles)—— 执行层 video.render 管线的「脑」侧:粗剪人物视频 + SRT + 口播稿 →
 * 结构化决策 JSON(零代码生成,SPEC 2026-07-11 §3.1 步骤 2)。四个模板都走
 * runStructuredNode(generateObject 绑 outputSchema,落空→文本兜底),模型全由用户
 * model-config 可配(capability = skill id)。
 *
 * 跨模型稳定关键(SPEC 原文):**所有时间插点吸附 SRT 行 start 集合**。模板内置的
 * outputSchema 只卡「形状」(字段/枚举);跟输入绑定的动态约束(边界落 SRT 行 start 集合 /
 * assetId 必须在素材清单内 / 字幕行数不变)由 backend runner 用
 * buildXxxDecisionSchema(...)(zod refine 逃生口)+ 后处理吸附落实 —— schema 不合时
 * Vercel SDK 自动重试,吸附兜住小偏差。
 *
 * 诚实硬约束(prompt 侧,与 T-224 同源):
 *   - 信息卡数值/文案**只从口播原文提取,禁编造**(runner 侧另有可溯校验剔除);
 *   - B-roll **精确匹配被讲对象,禁近似替代**;assetId 必须来自清单;label 禁内部词。
 *
 * [T-387c] 四决策 = **对齐器**(SPEC 2026-07-17 §2b):scenes/cards/broll 模板加可选
 * `{{storyboard}}` facet(采纳定稿时凝固的分镜表:per-section 口播摘要 + visual 描述 +
 * assetRefs,含对齐硬约束,由 backend video-decisions-runner storyboardFacet 组装)——
 * 有 authored 意图段:scene 边界对齐 section(仍吸附 SRT)、broll 必选点名素材、cards 不与
 * authored 画面冲突;无意图段自主。旧项目无凝固分镜 → facet 空串,占位替换为空,行为=现状
 * (零回归)。subtitles(文本校正)不吃 storyboard。
 */

/** 信息卡六 kind 枚举(e03 Scene/Card 打法的天然 props schema,SPEC §3.2)。 */
export const VIDEO_CARD_KINDS = [
  "stat",
  "quote",
  "list",
  "compare",
  "code",
  "image",
] as const;
export type VideoCardKind = (typeof VIDEO_CARD_KINDS)[number];

/**
 * [T-295] 信息卡动画意图枚举(「5 问」产出;template 落对应 GSAP 富动画配方)。
 * **可选产出**:缺省时 backend/template 按 kind 派生兜底(弱模型不产也仍有富动画),
 * 故 videoCardSchema 用 `.optional()`,绝不 required(会崩 MiniMax 等弱模型)。
 */
export const VIDEO_CARD_MOTIONS = [
  "bar",
  "counter",
  "metaphor",
  "strike",
  "reveal",
  "plain",
] as const;
export type VideoCardMotion = (typeof VIDEO_CARD_MOTIONS)[number];

// ── ① 语义分场(video.scenes)────────────────────────────────────────────────

export const videoSceneSchema = z.object({
  title: z.string().default(""),
  startSec: z.number().default(0),
  endSec: z.number().default(0),
  summary: z.string().default(""),
});
/** 顶层输出契约:对象包 scenes 数组(generateObject 顶层要对象,裸数组部分 provider 不可靠)。 */
export const videoScenesSchema = z.object({
  scenes: z.array(videoSceneSchema).default([]),
});
export type VideoScenesOutput = z.infer<typeof videoScenesSchema>;

export const VIDEO_SCENES_TEMPLATE: PromptTemplate = {
  id: "video.scenes",
  version: "v1",
  outputSchema: videoScenesSchema,
  tools: [],
  system:
    "你是这位创作者的「视频分场 agent」,把一条口播视频按语义切成若干场景,给每场一个标题和一句概括。",
  template: `把下面这条口播视频按**语义**切分成场景(scene)。SRT 是唯一时间真值。

【SRT 逐行】(每行: 序号 | 起秒-止秒 | 文本)
{{srt}}

【口播稿全文】
{{script}}
{{storyboard}}
【任务】按内容语义切场:开场事实/问题、每个论点/段落、结尾行动各自成场。一般 3-8 场。
【硬约束】
- 每场的 startSec **必须等于上面某一 SRT 行的起秒**(场景边界只能落在 SRT 行边界上,绝不能取行中间的时间)。
- 第一场从第一行起;场景按时间顺序、不重叠、不留空洞;endSec = 下一场的 startSec(最后一场 = 最后一行的止秒)。
- title 是给观众看的场景小标题(≤12 字)，必须写本场真实对象或结论；禁止把“新闻钩子 / 开场钩子 / 价值段 / 转折 / CTA / 总结”等内部编导结构词当标题。
- summary 一句话概括本场讲了什么。只依据 SRT/口播稿原文,不要发挥。
【输出】只输出一个 JSON 对象 {"scenes": [...]}(不要多余文字、不要代码块),每场:
{"title","startSec"(数字,秒),"endSec"(数字,秒),"summary"}。`,
  requiredFacets: ["srt", "script"],
};

// ── ② 信息卡文案与插点(video.cards)──────────────────────────────────────────

export const videoCardSchema = z.object({
  sceneIdx: z.number().int().default(0),
  kind: z.enum(VIDEO_CARD_KINDS),
  content: z.string().default(""),
  at: z.number().default(0),
  // [T-295] 动画意图(可选;弱模型不产 → template 按 kind 派生)。
  motion: z.enum(VIDEO_CARD_MOTIONS).optional(),
});
export const videoCardsSchema = z.object({
  cards: z.array(videoCardSchema).default([]),
});
export type VideoCardsOutput = z.infer<typeof videoCardsSchema>;

export const VIDEO_CARDS_TEMPLATE: PromptTemplate = {
  id: "video.cards",
  version: "v1",
  outputSchema: videoCardsSchema,
  tools: [],
  system:
    "你是这位创作者的「信息卡 agent」,为口播视频的每个场景挑值得可视化的信息做成卡片(只从口播原文提取,绝不编造)。",
  template: `为下面这条口播视频的各场景设计「信息卡」(屏幕上的可视化卡片)。

【场景列表】(每行: 场景序号 | 起秒-止秒 | 标题 | 概括)
{{scenes}}

【SRT 逐行】(每行: 序号 | 起秒-止秒 | 文本)
{{srt}}

【口播稿全文】
{{script}}
{{storyboard}}
【任务】挑口播里**值得可视化**的信息做卡片:数据→stat,金句→quote,要点清单→list,对比→compare,代码/命令→code,需要配图的对象→image。不是每场都必须有卡,宁缺毋滥。
【硬约束(诚实门,违反即废)】
- 卡片上的**数值、文案只能从口播稿原文提取**,一个数字都不许编造、不许换算、不许"优化措辞"。
- kind 只能是 stat/quote/list/compare/code/image 六选一。
- at(卡片出现时刻,秒)**必须等于某一 SRT 行的起秒**,且落在所属场景的时间范围内。
- sceneIdx 是上面场景列表的场景序号(从 0 起)。
【动画意图 motion(每张卡按「5 问」选一个,让画面"长出来"而非"整块淡入弹出")】
  1. 有前后/多少/快慢**对比**? → bar(对比条从 0 生长)
  2. 有**数字/规模/速度**? → counter(数字从 0 递增到目标)
  3. **抽象概念可具象**(能画出来)? → metaphor(视觉隐喻/强揭示)
  4. 先**建立再否定/推翻**(说"别以为…其实不是")? → strike(元素先亮起像要用,再被划掉)
  5. **列举/步骤/接力**? → reveal(逐条依次揭示)
  6. 其它纯陈述 → plain(精炼进场)
  motion 是**可选**产出:拿不准就不填,系统会按卡类型派生兜底(stat→counter / compare→bar / list·code→reveal / quote·image→plain)。别硬凑。
【构图约束(给成片留呼吸感,别把画面堆满)】
- 口播人物是画面主体,**不拉伸、不裁切**;用户上传的素材一律完整展示(contain),不裁。
- **一个 beat 一个强视觉**:同一时刻别堆两张大卡/两个大动画;情绪句、重要陈述留白,不配卡。
- 卡片是字幕的视觉摘要，不是把整段口播再抄一遍：quote≤28字，stat 的说明≤20字，list 每项≤12字，compare 每侧≤12字。
- 开场若有明确的数字、岗位、人物或事实（例如“时薪 300 元”），优先提取一张 stat/quote 卡，不要只留内部“钩子”标签和空黑画面。
【输出】只输出一个 JSON 对象 {"cards": [...]}(不要多余文字、不要代码块),每张:
{"sceneIdx"(整数),"kind"(六选一),"content"(卡片文案,原文提取),"at"(数字,秒),"motion"(可选,六选一)}。没有值得做卡的就返回 {"cards": []}。`,
  requiredFacets: ["scenes", "srt", "script"],
};

// ── ③ B-roll 选择与插点(video.broll)─────────────────────────────────────────

export const videoBrollPickSchema = z.object({
  sceneIdx: z.number().int().default(0),
  assetId: z.string().default(""),
  at: z.number().default(0),
  durationSec: z.number().default(3),
});
export const videoBrollSchema = z.object({
  broll: z.array(videoBrollPickSchema).default([]),
});
export type VideoBrollOutput = z.infer<typeof videoBrollSchema>;

export const VIDEO_BROLL_TEMPLATE: PromptTemplate = {
  id: "video.broll",
  version: "v1",
  outputSchema: videoBrollSchema,
  tools: [],
  system:
    "你是这位创作者的「B-roll 匹配 agent」,从他已有的素材清单里给口播视频的场景配空镜/示意画面(只用真实素材,精确匹配)。",
  template: `为下面这条口播视频的各场景,从**已有素材清单**里挑 B-roll(叠画/空镜)。

【场景列表】(每行: 场景序号 | 起秒-止秒 | 标题 | 概括)
{{scenes}}

【可用素材清单】(每行: assetId | 名称 (类型) | 描述 | 来源)
{{library}}
{{storyboard}}
【任务】判断哪些场景适合插 B-roll、插哪条素材、什么时刻插、插多久。
【硬约束(违反即废)】
- assetId **必须**是清单里出现过的真实 id,绝对不要编造。
- 来源为「用户手动上传」代表创作者为这次制作明确备好的素材；来源为「脚本分镜点名」代表已采纳的 authored 意图。它们与口播对象精确匹配时必须优先，但来源本身不能替代语义匹配。
- **精确匹配被讲对象**:讲的是 A 产品就只能配 A 产品的素材,**禁止**拿"看起来像/同类"的素材近似替代;没有精确匹配的素材就不配(宁缺毋滥)。
- 引用素材时用它清单里的名称描述,**不要**输出文件路径、内部编号等内部词。
- at(插入时刻,秒)落在所属场景时间范围内;durationSec 一般 2-6 秒,不超过场景长度。
【输出】只输出一个 JSON 对象 {"broll": [...]}(不要多余文字、不要代码块),每条:
{"sceneIdx"(整数),"assetId"(清单真实 id),"at"(数字,秒),"durationSec"(数字,秒)}。清单为空或没有匹配就返回 {"broll": []}。`,
  requiredFacets: ["scenes", "library"],
};

// ── ④ 双语字幕补全(video.subtitles)──────────────────────────────────────────

export const videoSubtitleLineSchema = z.object({
  index: z.number().int(),
  zh: z.string().default(""),
  en: z.string().default(""),
});
export const videoSubtitlesSchema = z.object({
  lines: z.array(videoSubtitleLineSchema).default([]),
});
export type VideoSubtitlesOutput = z.infer<typeof videoSubtitlesSchema>;

export const VIDEO_SUBTITLES_TEMPLATE: PromptTemplate = {
  id: "video.subtitles",
  version: "v1",
  outputSchema: videoSubtitlesSchema,
  tools: [],
  system:
    "你是这位创作者的「双语字幕 agent」,**对照口播稿**校正 SRT 的 ASR 认错字,并给每行配英文翻译。行数和时间轴绝不改动。",
  template: `给下面的 SRT 字幕做双语补全:中文行**以口播稿为准**只做 **ASR 认错字校正**(同音错字、专名错写),英文行是对应翻译。

【口播稿全文(校正基准 —— 这才是创作者真正说的内容,SRT 是 ASR 机器转写、会把同音字/专名听错)】
{{script}}

【SRT 逐行】(每行: 序号 | 起秒-止秒 | 文本)
{{srt}}

【校正方法】
- SRT 每行文本与口播稿逐段比对:ASR 把某字/专名**听成同音或近音的错字**时(如「定位」听成「定为」、产品名/人名/术语听错),**按口播稿的正确写法改回**。
- 口播稿是书面稿、SRT 是口播实录,二者**措辞可能不完全一致**(口语省略/口误/即兴):**只在能明确对上口播稿、且是同音/近音认错字时才改**;对不上或语气词/口语顺序差异**一律不动**(改动最小)。

【硬约束(违反即废)】
- **行数、序号、时间轴一律不变**:输入几行就输出几行,index 与输入一一对应。禁止合并、拆分、增删行。
- zh 在原行文本上**改动最小**:只改能对上口播稿的认错字/专名,不重写、不润色、不改语气词、不按口播稿补全 SRT 没说的内容。没有错字就原样返回。
- en 是该行的自然英文翻译(简洁,适合字幕)。
【输出】只输出一个 JSON 对象 {"lines": [...]}(不要多余文字、不要代码块),每行:
{"index"(整数,与输入序号一致),"zh"(校正后中文),"en"(英文翻译)}。`,
  requiredFacets: ["srt", "script"],
};
