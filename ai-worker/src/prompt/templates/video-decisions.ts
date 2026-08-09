import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * [T-254b/T-712] 制作视频四个候选节点 + 总导演审片模板(video.scenes / video.cards /
 * video.broll / video.subtitles / video.director)—— 执行层 video.render 管线的「脑」侧。
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
{{orientation}}
{{manualAssignments}}
【任务】按内容语义切场:开场事实/问题、每个论点/段落、结尾行动各自成场。一般 3-8 场。
【硬约束】
- 每场的 startSec **必须等于上面某一 SRT 行的起秒**(场景边界只能落在 SRT 行边界上,绝不能取行中间的时间)。
- 第一场从第一行起;场景按时间顺序、不重叠、不留空洞;endSec = 下一场的 startSec(最后一场 = 最后一行的止秒)。
- title 是仅供编辑器回顾的场景名称(≤12 字)，不会烧进成片；必须写本场真实对象或结论，禁止“新闻钩子 / 开场钩子 / 价值段 / 转折 / CTA / 总结”等内部结构词。
- summary 一句话概括本场讲了什么。只依据 SRT/口播稿原文,不要发挥。
- 若存在“用户人工指定的素材”，必须围绕素材的真实时长和叙事作用重新切场；不能把素材硬塞进旧场景边界。
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
{{orientation}}
{{manualAssignments}}
【任务】把口播中**值得可视化**的信息编排成连续的「信息节拍」:数据→stat,金句→quote,要点清单/步骤→list,前后差异→compare,代码/命令→code,需要配图的对象→image。短情绪句可以留白；没有真实素材承接的长场景不能只放一张小标签，而要随着口播推进，让数字、步骤、对比和结论依次接力。
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
【信息密度与节拍(这是成片主视觉，不是角落提示)】
- 先按 SRT 划分语义 beat，再决定卡片：8–14 秒且没有真实素材的场景安排 2 个不同信息节拍；14–24 秒安排 3 个；超过 24 秒最多 4 个。相邻节拍分别落在对应原句的 SRT 起秒，不能把 3 张卡堆在同一时刻。
- 同一长场景优先混用不同表达：数字/量级用 stat，过程/方法用 list，过去与现在用 compare，真正值得记住的结论才用 quote。除非原文确实只有一句金句，否则不要整场只产 quote。
- 每张卡只承担一个认知动作：先给大数字或大结论，再逐项揭示支撑信息；不要把整段口播缩成一行小字，也不要重复上一张卡的同义内容。
- 只要场景中任意连续视觉空档预计超过 7 秒，就必须在空档对应的原句起秒补一个新节拍；“已经有一张卡”不等于整场已覆盖。
【构图约束(给成片留呼吸感,但信息主舞台要充分使用)】
- 口播人物是画面主体,**不拉伸、不裁切**;用户上传的素材一律完整展示(contain),不裁。
- **一个 beat 一个强视觉**:同一时刻别堆两张大卡/两个大动画;情绪句、重要陈述留白,不配卡。
- 卡片是字幕的视觉摘要，不是把整段口播再抄一遍：quote≤28字，stat 的说明≤20字，list 每项≤12字，compare 每侧≤12字。
- 场景 title/summary 只是编辑器元数据，绝不能把它们直接做成卡片；不要为了填空编造数字、对比或事实。
- 超过 8 秒且没有已指定素材的场景，必须按上面的节拍数量从本场原文连续提取信息卡；不能复制整段口播，也不能让整个长场景只有黑底、一个靠边小人物或一张孤零零的小标签。
- 开场若有明确的数字、岗位、人物或事实（例如“时薪 300 元”），优先提取一张 stat/quote 卡，不要只留内部“钩子”标签和空黑画面。
【输出】只输出一个 JSON 对象 {"cards": [...]}(不要多余文字、不要代码块),每张:
{"sceneIdx"(整数),"kind"(六选一),"content"(卡片文案,原文提取),"at"(数字,秒),"motion"(可选,六选一)}。没有值得做卡的就返回 {"cards": []}。`,
  requiredFacets: ["scenes", "srt", "script"],
};

// ── ③ B-roll 选择与插点(video.broll)─────────────────────────────────────────

export const VIDEO_BROLL_PURPOSES = [
  "fact_evidence",
  "analogy",
  "process",
  "contrast",
  "mood",
  "info_card",
] as const;
export type VideoBrollPurpose = (typeof VIDEO_BROLL_PURPOSES)[number];

const VIDEO_BROLL_PURPOSE_SET = new Set<string>(VIDEO_BROLL_PURPOSES);
const VIDEO_BROLL_PURPOSE_ALIASES: Readonly<Record<string, VideoBrollPurpose>> = {
  factevidence: "fact_evidence",
  factualevidence: "fact_evidence",
  fact: "fact_evidence",
  evidence: "fact_evidence",
  proof: "fact_evidence",
  dataevidence: "fact_evidence",
  documentaryevidence: "fact_evidence",
  事实证据: "fact_evidence",
  事实依据: "fact_evidence",
  数据证据: "fact_evidence",
  真实证据: "fact_evidence",
  截图证据: "fact_evidence",
  证据: "fact_evidence",
  analogy: "analogy",
  analogyvisual: "analogy",
  metaphor: "analogy",
  metaphorical: "analogy",
  association: "analogy",
  associativevisual: "analogy",
  类比联想: "analogy",
  类比: "analogy",
  比喻: "analogy",
  隐喻: "analogy",
  联想: "analogy",
  process: "process",
  processdemo: "process",
  demonstration: "process",
  demo: "process",
  walkthrough: "process",
  workflow: "process",
  tutorial: "process",
  operation: "process",
  howto: "process",
  过程演示: "process",
  过程示意: "process",
  流程: "process",
  步骤: "process",
  操作演示: "process",
  录屏演示: "process",
  contrast: "contrast",
  beforeafter: "contrast",
  contrastbeforeafter: "contrast",
  comparison: "contrast",
  difference: "contrast",
  juxtaposition: "contrast",
  前后对比: "contrast",
  对比反差: "contrast",
  对比: "contrast",
  反差: "contrast",
  差异: "contrast",
  前后变化: "contrast",
  mood: "mood",
  atmosphere: "mood",
  emotion: "mood",
  ambiance: "mood",
  ambience: "mood",
  情绪氛围: "mood",
  氛围: "mood",
  情绪: "mood",
  空镜: "mood",
  环境: "mood",
  infocard: "info_card",
  card: "info_card",
  datacard: "info_card",
  textcard: "info_card",
  infographic: "info_card",
  信息卡: "info_card",
  信息卡片: "info_card",
  数据卡: "info_card",
  文字卡: "info_card",
  图表: "info_card",
  列表: "info_card",
};

function compactPurposeToken(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
}

function normalizeVideoBrollPurpose(value: unknown): {
  purpose: VideoBrollPurpose;
  changed: boolean;
  unknown: boolean;
} {
  if (typeof value === "string" && VIDEO_BROLL_PURPOSE_SET.has(value)) {
    return {
      purpose: value as VideoBrollPurpose,
      changed: false,
      unknown: false,
    };
  }
  const token = typeof value === "string" ? compactPurposeToken(value) : "";
  const aliased = VIDEO_BROLL_PURPOSE_ALIASES[token];
  if (aliased) return { purpose: aliased, changed: true, unknown: false };

  // purpose 是画面编辑标签而非事实字段。完全未知时保留用户仍可编辑的槽位，使用最不冒充
  // 事实证据的 info_card；不得让一个标签漂移导致整批视觉计划丢失。
  return { purpose: "info_card", changed: true, unknown: true };
}

export const videoBrollPickSchema = z.object({
  sceneIdx: z.number().int().default(0),
  assetId: z.string().default(""),
  at: z.number().default(0),
  durationSec: z.number().default(3),
});
export const videoBrollSlotSchema = z.object({
  sceneIdx: z.number().int().default(0),
  at: z.number().default(0),
  purpose: z.enum(VIDEO_BROLL_PURPOSES),
  /** 必须能在口播稿里定位到的原话锚点，禁止用“新闻钩子”等内部标签。 */
  spokenAnchor: z.string().min(1),
  /** 给搜索/文生图/人工备料看的具体画面，不是抽象主题词。 */
  visualBrief: z.string().min(1),
  searchQuery: z.string().default(""),
});
export const videoBrollSchema = z.object({
  slots: z.array(videoBrollSlotSchema).default([]),
  broll: z.array(videoBrollPickSchema).default([]),
});
export type VideoBrollOutput = z.infer<typeof videoBrollSchema>;

/**
 * 弱模型常把 schema 枚举翻译成中文、改成空格/连字符或换同义词。这个恢复只整理模型已经
 * 表达的画面用途，不新增画面事实；每个槽位单独验静态 schema，坏一条只丢一条，不能拖垮
 * 整批。动态 assetId/sceneIdx 约束仍由 backend 的 buildBrollDecisionSchema 最终裁决。
 */
export function normalizeVideoBrollOutput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const rawSlots = Array.isArray(record.slots) ? record.slots : [];

  let normalizedPurposeCount = 0;
  let unknownPurposeCount = 0;
  let droppedSlotCount = 0;
  const slots = rawSlots.flatMap((rawSlot) => {
    if (!rawSlot || typeof rawSlot !== "object" || Array.isArray(rawSlot)) {
      droppedSlotCount += 1;
      return [];
    }
    const slot = rawSlot as Record<string, unknown>;
    const normalizedPurpose = normalizeVideoBrollPurpose(slot.purpose);
    if (normalizedPurpose.changed) normalizedPurposeCount += 1;
    if (normalizedPurpose.unknown) unknownPurposeCount += 1;
    const parsed = videoBrollSlotSchema.safeParse({
      ...slot,
      purpose: normalizedPurpose.purpose,
    });
    if (!parsed.success) {
      droppedSlotCount += 1;
      return [];
    }
    return [parsed.data];
  });

  if (normalizedPurposeCount > 0 || droppedSlotCount > 0) {
    console.info(
      `[video.broll] purpose-normalized=${normalizedPurposeCount} unknown=${unknownPurposeCount} droppedSlots=${droppedSlotCount}`,
    );
  }
  // video.broll 的责任到“画面需求”为止。弱模型即使违约返回了旧版
  // broll 选料，也在严格 schema 前清空，真实素材只能由 material.match 选。
  return { ...record, slots, broll: [] };
}

export const VIDEO_BROLL_TEMPLATE: PromptTemplate = {
  id: "video.broll",
  version: "v4",
  outputSchema: videoBrollSchema,
  tools: [],
  system:
    "你是口播视频的视觉编导，只负责判断每段口播为什么需要什么画面；真实素材的语义选择统一交给 material.match Skill。",
  template: `为下面这条口播视频规划 B-roll(叠画/空镜)。先读口播原文，再决定画面的叙事作用。

【口播原文】
{{script}}

【场景列表】(每行: 场景序号 | 起秒-止秒 | 标题 | 概括)
{{scenes}}

【可用素材清单】(每行: assetId | 名称 (类型) | 描述 | 来源)
{{library}}
{{storyboard}}
{{orientation}}
{{manualAssignments}}
【任务】
1. 先输出少而精的画面需求 slots。每个 slot 必须说明它服务于事实证据、类比联想、过程演示、前后对比、情绪氛围或信息卡中的哪一种。
2. 本节点不选择素材，broll 固定返回空数组。后续 material.match Skill 会读取全部已有素材并完成 AI 语义匹配。
【硬约束(违反即废)】
- purpose 只能输出以下六个机器值，禁止翻译、加前后缀或自造枚举：fact_evidence（事实证据）/ analogy（类比联想）/ process（过程演示）/ contrast（前后对比）/ mood（情绪氛围）/ info_card（信息卡）。
- spokenAnchor 必须摘自口播原文，不能写“新闻钩子”“价值段”“场景一”等内部标签。
- visualBrief 要写成能直接搜索或生成的具体画面，例如“招聘网站上中文 AI 训练师时薪 300 元的岗位截图”，禁止“科技感背景”“抽象 AI 粒子”等万能素材。
- 事实与数据优先真实截图/网页/图表；类比和情绪才允许生成画面。不得用 AI 图冒充新闻证据。
- 不要在本节点按文件名、关键词或 id 猜素材；素材匹配是 material.match 的职责。
- 若存在“用户人工指定的素材”，先把它视为不可替换的叙事约束，画面需求与分场时长必须为它让位。
【输出】只输出一个 JSON 对象 {"slots": [...], "broll": [...]}(不要多余文字、不要代码块)。
slot: {"sceneIdx"(整数),"at"(数字,秒),"purpose"(只能是 fact_evidence/analogy/process/contrast/mood/info_card),"spokenAnchor"(口播原话),"visualBrief"(具体画面),"searchQuery"(中文搜索词)}。
broll: {"sceneIdx"(整数),"assetId"(清单真实 id),"at"(数字,秒),"durationSec"(数字,秒)}。
无论清单是否为空，broll 都返回 []；只要口播里存在值得视觉化的事实、过程、类比或对比，slots 仍应给出。`,
  requiredFacets: ["scenes", "script", "library"],
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

// ── ⑤ 总导演统筹审核(video.director)─────────────────────────────────────────

export const VIDEO_DIRECTOR_ISSUE_CODES = [
  "visual_gap",
  "material_conflict",
  "timing_conflict",
  "narrative_gap",
  "subtitle_conflict",
] as const;
export type VideoDirectorIssueCode =
  (typeof VIDEO_DIRECTOR_ISSUE_CODES)[number];

export const videoDirectorIssueSchema = z.object({
  sceneIdx: z.number().int().default(0),
  severity: z.enum(["blocking", "warning"]),
  code: z.enum(VIDEO_DIRECTOR_ISSUE_CODES),
  message: z.string().min(1),
});
export const videoDirectorReviewSchema = z.object({
  verdict: z.enum(["ready", "revise"]),
  summary: z.string().default(""),
  issues: z.array(videoDirectorIssueSchema).default([]),
});
export type VideoDirectorReviewOutput = z.infer<
  typeof videoDirectorReviewSchema
>;

export const VIDEO_DIRECTOR_TEMPLATE: PromptTemplate = {
  id: "video.director",
  version: "v1",
  outputSchema: videoDirectorReviewSchema,
  tools: [],
  system:
    "你是一条真实短视频的总导演，负责把完整候选时间线审到能拍、能剪、能看。首轮已绑定素材是既定事实，不要求用户重新选材；你指出的内部修片项会由系统自动调时长、做素材接力或用信息卡补位后再次送审。",
  template: `审核下面这条视频的完整候选方案。前面的分场、信息卡、真人主画面、用户素材、B-roll 和字幕都已经分别产出；你负责做整体统筹。首轮已进入时间线的素材视为已绑定，不得建议用户重新上传、重新指定场景或从零重做分镜。

【口播原文】
{{script}}

【本次画幅】
{{orientation}}

【候选时间线】
{{plan}}

【当前项目真实素材】
{{inventory}}

【审核维度】
1. 叙事连续：每个场景都承接口播，顺序和转折不跳跃；不能出现“素材很好但放错段”。
2. 画面齐全：长场景不能只有黑底、角落小人物或大段无有效视觉；真人、用户素材、信息卡之间要轮换承接。
3. 素材使用：用户上传素材若已进入本次时间线，就必须保留；语义或时长不完全匹配时，提出“缩短该镜头 + 由信息卡/同场素材接力”的内部修片建议，不得要求用户重选。
   - 同一真实素材全片只能出现一次；不能因为它同时被脚本点名、项目挂载或模型选中就跨场景重复使用。
   - 项目封面和既有成片不是 B-roll，绝不能进入时间线；封面只服务发布物料，不能拿来填充正文画面。
4. 信息卡质量：卡片必须是短而有用的视觉摘要，不能照抄整段口播，不能出现“SCENE / 分镜一 / 新闻钩子 / CTA”等编辑器内部标签。超过 8 秒且没有真实主视觉的段落，不能用一张角落小标签敷衍：应有 2–4 个随口播推进的语义节拍，并优先用大数字、步骤清单、前后对比和强结论轮换承接；同义 quote 连续出现也视为视觉空档。
5. 构图与时间：素材不得拉伸；竖图/竖视频在横屏里应完整展示并留出合理陪衬，不强行横裁；插点、时长和字幕不能越过所属场景。
6. 整体可看：同一时刻只能有一个非 overlay 主视觉，不能让多个图片、录屏、真人主画面或旧标题互相重叠；所有视觉都应服务当前口播，而不是随机抽卡。

【输出规则】
- verdict=ready：没有 blocking 问题，并且 issues 必须为空；不能一边写“通过”一边继续列建议删除、挪动或补画面的事项。
- verdict=revise：至少列出 1 条 blocking 内部修片项；系统会在当前方案内自动修正并复审，不得把作业退给用户。
- sceneIdx 使用候选时间线里的 0 起场景序号；code 只能是 visual_gap/material_conflict/timing_conflict/narrative_gap/subtitle_conflict。
- 只报告当前方案里需要自动修正的问题；不要要求用户补素材、重新绑定或从零重做。

【输出】只输出 JSON：
{"verdict":"ready|revise","summary":"一句总评","issues":[{"sceneIdx":0,"severity":"blocking|warning","code":"visual_gap|material_conflict|timing_conflict|narrative_gap|subtitle_conflict","message":"明确且可执行的修改意见"}]}`,
  requiredFacets: ["script", "plan", "inventory"],
};
