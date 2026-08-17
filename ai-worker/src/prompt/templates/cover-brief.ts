import { z } from "zod";
import type { PromptTemplate } from "../template";
import { ANTI_FABRICATION_CLAUSE } from "../grounding-facets";

/**
 * 封面方案 skill 模板(cover.brief)—— [T-271] 制作封面链 0→1 的「结构化产方案」位。
 *
 * 病根(见 docs/research/2026-07-12-creative-chain-grounding-audit.md「制作封面链」段):此前无专用
 * 封面链——「生成封面」只是对话发**自由文本** → material.generate → asset-generate-runner **原样
 * 透传**生图,是全链唯一零接地零诚实门的 AI 生成入口(封面上压的文案/数字可随便编)。
 *
 * 修法:封面**先产结构化方案**(封面文案 headline/subheadline/keyPoints + 主视觉 visualConcept +
 * 构图 composition + 色调 palette),prompt **硬注入立项 brief(核心信息/内容形式)+ 口播稿主张**——
 * 封面文案必须承载 brief 钦定的核心信息,不自创、不编造数字博眼球。生图 prompt 再由这份结构化方案
 * **确定性组装**(cover-runner.composeCoverImagePrompt),而非把生图交给对话模型自由发挥。
 *
 * 三位一体:system(封面策划方法论)⊕ template(含 {{facet}} 硬锚占位)⊕ outputSchema(封面方案结构)。
 * 文案诚实门:模板正文静态嵌 ANTI_FABRICATION_CLAUSE(与 hooks/thesis/draft 单一真值),生成后 cover-
 * runner 再跑 annotateUngroundedClaims 可溯后处理(T-224 同款)对 headline/subheadline/keyPoints 标注。
 */
export const coverBriefSchema = z
  .object({
    // 压在封面正中的大字主标题(≤14 字);封面第一眼的钩子,须紧扣核心信息。
    headline: z.string().default(""),
    // 副标题/补充钩子(可空,≤20 字)。
    subheadline: z.string().default(""),
    // 封面可露出的短信息点/卖点(0-3 条,每条≤10 字);只写素材/brief 真有的,不编。
    keyPoints: z.array(z.string()).default([]),
    // 主视觉建议(画面主体/场景/隐喻)—— 给生图用的画面描述,不含叠加文字。
    visualConcept: z.string().default(""),
    // 构图建议(主体位置/文案排布/层次)。
    composition: z.string().default(""),
    // 色调/风格基调(可空)。
    palette: z.string().default(""),
  })
  .default({
    headline: "",
    subheadline: "",
    keyPoints: [],
    visualConcept: "",
    composition: "",
    palette: "",
  })
  .refine(
    (value) => Boolean(value.headline.trim() || value.visualConcept.trim()),
    { message: "封面方案至少包含标题或主视觉" },
  );
export type CoverBriefOutput = z.infer<typeof coverBriefSchema>;

export const COVER_BRIEF_TEMPLATE: PromptTemplate = {
  id: "cover.brief",
  outputRecovery: "creative-partial",
  version: "v3",
  outputSchema: coverBriefSchema,
  tools: [],
  system:
    "你是这位创作者的「封面策划 agent」,为一条内容设计封面方案(压在封面上的文案 + 主视觉 + 构图)。封面是用户第一眼看到的东西、决定点不点开,但封面文案必须承载这条内容的钦定核心信息,绝不自创、不编造数字/成绩来吸睛。",
  // {{projectBriefHard}}:立项 Brief 硬锚(核心信息=钦定主张 + 内容形式定调),封面文案必须承载、不得
  //   自创矛盾主张。{{scriptClaim}}:口播稿主张(封面要与正片说的同一件事)。{{userMaterialHard/Ref}}/
  //   {{knowledge}}:封面数字/成绩的**唯一可溯来源**。尾部嵌 ANTI_FABRICATION_CLAUSE(封面文案诚实门)。
  template: `你是这位创作者的「封面策划 agent」,为一条内容设计**封面方案**(压在封面上的文案 + 主视觉 + 构图)。

【创作者定位】
{{positioning}}{{projectBriefHard}}{{scriptClaim}}{{userMaterialHard}}{{userMaterialRef}}{{knowledge}}{{topic}}{{userVisualRequirements}}

【内容真相优先级】如果已经有【本条口播稿主张】，它就是当前确认稿，是封面“这条内容在说什么”的第一真相；项目 Brief 只补受众、形式、背景和缺失信息，不得把当前稿改回旧方向。没有当前稿时才以 Brief 作为首次创作基线。

【任务】基于以上(**优先当前确认稿主张，再用 Brief 与素材补证据/背景**)设计封面方案:
- 如果存在【用户明确画面要求】，它是主体、物体、场景、动作、构图和排除项的硬约束：必须保留用户原意，再围绕内容主张补全；不要用系统偏好的构图覆盖它。该要求只决定画面，不是事实出处，不能据此新增数字、成绩、人物身份或新闻事实；与安全、版权或事实边界冲突的部分不得执行。
- headline(封面主标题):压在封面正中的大字,一句话勾住人,**≤14 字**。必须紧扣上方核心信息/口播稿主张,**不得自创与之矛盾的主张**。
- subheadline(副标题):可空,补一句钩子或利益点,**≤20 字**。
- keyPoints(信息点):0-3 条封面可露出的短信息点/卖点,每条**≤10 字**;只写上方素材/立项资料里**真出现过**的点(如「3 个方法」只在正文真有 3 个方法时才写)。
- visualConcept(主视觉建议):**不超过 220 字**。先把核心信息/口播主张转成**一个观众第一眼能看懂的可见冲突、关系、变化或后果**，再写具体主体、动作和环境；它负责补足标题没有展示的那一层，不能只是把标题换成同义画面。禁止“发光大脑、AI 粒子、机器人握手、商务人士看电脑”等万能 AI 海报，不含叠加文字，不用虚构截图/数据冒充证据。
- composition(构图建议):**不超过 100 字**。围绕这个单一视觉关系安排主体位置、视线、前后景和文案留白(如「主体居中偏下,主标题占上 1/3」)，不能把多个隐喻和卖点塞成拼贴画。
- palette(色调/风格):可空，**不超过 40 字**，一句话定调(如「高对比暖色、大字号无衬线」)。

【定位边界】创作者定位只用于选择目标观众熟悉的场景、视觉语言、信息密度和审美语气；不得因此改变本条核心主张、杜撰身份/成绩或添加素材中不存在的事实。

**封面文案铁律(诚实门)**:headline / subheadline / keyPoints 里出现的任何**数字、成绩、榜单名、机构/人物名**,都必须能在上方【立项硬约束】/口播稿/素材里找到出处;找不到就**别写这个数字**,换成不含具体数字的说法。封面不是靠编数字博眼球的地方——一个假数字压在封面上,比不吸引更糟。
${ANTI_FABRICATION_CLAUSE}
【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹),形如:
{"headline":"封面主标题","subheadline":"副标题(可空)","keyPoints":["信息点1","信息点2"],"visualConcept":"主视觉建议","composition":"构图建议","palette":"色调风格(可空)"}`,
  requiredFacets: ["positioning"],
  // [T-271] 声明式 context 注入 —— 封面链的接地根:brief(立项硬锚,核心信息/内容形式)+ reviewSubject
  // (口播稿主张,复用 review 的 getScript 读 output_script 当前版本)+ projectMaterials(封面数字的
  // 可溯来源)+ knowledge。组合根据此 resolveContextDeps 自动装 reader(取代手列,防漏接)。
  contextRequirements: [
    "positioning",
    "brief",
    "reviewSubject",
    "projectMaterials",
    "knowledge",
  ],
};
