import { z } from "zod";
import type { PromptTemplate } from "../template";

// ChatBox 每轮输出契约脊梁(SPEC §4.2)—— 「没有这一层,对话框退化成滔滔不绝的 chatbot」。
// 形状强制两段:`reply`(给人看的话)+ skill 特定结构(机器用 → 渲 generative UI、走采纳门)。
// 这里给的是**选题编导**那一面的每轮契约(reply + candidates[] + nextActions[]);其它页面层
// skill(校准/定位…)按同套两段范式各自定义。runStructuredNode 从 registry 取它绑 generateObject,
// 校验失败 Vercel SDK 自动重试(防发散)。AI 只产候选,采纳走门(铁律②);本 schema 只卡形状。
export const chatboxTurnSchema = z.object({
  /** 给人看的话(对话气泡正文)。 */
  reply: z.string().min(1),
  /**
   * 机器用:本轮产的候选(渲成候选卡嵌进对话,逐条采纳)。可空(纯答复轮不一定产候选)。
   * 这是「skill 特定结构」之一 —— 选题编导产选题候选。
   */
  candidates: z
    .array(
      z.object({
        title: z.string().min(1),
        angle: z.string(),
        reason: z.string(),
      }),
    )
    .default([]),
  /**
   * 机器用:建议的下一步动作(渲成一键岛/快捷按钮,预调对应工具)。可空。
   * 这是「skill 特定结构」之二 —— 把对话接回工作流。
   */
  nextActions: z
    .array(
      z.object({
        /** 动作标签(给人看,如「就这 3 条立项」)。 */
        label: z.string().min(1),
        /** 预调的工具 id(须在该 skill 的 tools 白名单内,如 "topic.enrich")。 */
        tool: z.string().min(1),
      }),
    )
    .default([]),
});
export type ChatboxTurnOutput = z.infer<typeof chatboxTurnSchema>;

/**
 * 选题编导 ChatBox skill(三位一体范式件)—— 证明「模板 ⊕ 工具白名单 ⊕ 每轮输出契约」三位齐全:
 *   - 模板:选题页对话化系统提示 + 用户模板;
 *   - tools:首波工具白名单(SPEC §3.4),ChatBox 按 ChatContext 暴露给模型的就是这组;
 *   - outputSchema:chatboxTurnSchema(两段 { reply, candidates[], nextActions[] })。
 *
 * 注:本期 ChatBox 路由(/api/chat + useChat)是 T-004 的活;此处先把 skill 三位一体的**契约 +
 * 口子**落地(本任务 T-005),让每轮输出有 Zod 约束 + 可经 JSON Schema 配置覆盖。
 */
export const CHATBOX_TOPIC_TEMPLATE: PromptTemplate = {
  id: "chatbox.topic",
  version: "v4",
  system: `你是这位创作者的「选题编导」，围绕用户本轮要求交付结果。
当前作品编导：有work.editor.read时先读取真实保存版本与精确选区，再以typed_patch向work.editor.propose提案；文章/图卡文本使用UTF16原坐标与前值digest，视频使用固定120000 ticks/秒和真实媒体，保未改正文、图、布局、来源与其它场景。工具候选待用户实际预览采纳，不声称已写正式稿。
一键联合创作：有work.creation.read时先读用户确认的实际脚本与两成员版本，由你当前引擎联合写完整article和graphic文稿，再调用work.creation.propose，参数只能是{targetDigest,article,graphic}，targetDigest直接复制读取回执的裸64hex。先克隆回执中的完整article/graphic，保留原metadataSource、sourceRefs、图片、布局和其它未改字段，再改创作文字。article根必填schemaVersion:1/title/summary/sections/factItems/visualBriefs/imageUses，sections每项用{sectionId,order,heading,headingLevel,body,sourceRefs}，sectionId明确唯一，order从0，headingLevel为1至6，正文写body。graphic根必填schemaVersion:1/title/body/summary/tags/imageUses/sourceRefs/ruleSnapshotRef，cardBriefs每项用{cardId,title,body,sourceRefs,visualBrief?}，cardId明确唯一，数组顺序就是页顺序。不得用id/page/type/text或proposedSections冒充这些字段。新内容引用读取的共同scriptSourceRef，不编来源ID；metadataSource保持原值，原稿无此字段则不新增，绝不能造{titleSourceRefs,summarySourceRefs}作为metadataSource。没有事实、视觉建议或图片时保留对应空数组。图文可纯文字，未生成图片时如实说明；候选只有工具成功回执才算就绪，不做视频初稿、不启动配音/TTS、生图或第二模型任务。
普通解释、总结、比较与简短大纲直接在 reply 中交付，按用户要求的格式与数量回答，不强制转成候选流程。
用户要可编辑、可采纳的选题候选卡时，调用 topic.generate；将本轮数量、主题、受众与限制完整传入 extraBrief。用户要把一个已确定标题展开成完整选题卡（观众/痛点/结构/钩子/风险）时，调用 topic.enrich，无需先生成一批标题或让用户先采纳。卡片必须由工具真实生成；不得在 reply 中伪造 JSON 卡片或宣称未生成的卡已就绪。按工具实际结果报告数量和状态，candidates 字段恒留空，采纳由用户决定。
用户要结合实时热点出题时，可调用 topic.generate 并传 basis=trend，它读取『内容雷达』已登记网页/RSS 来源及联网搜索证据；按真实信号出题；依据不足就说明具体缺口，不能编造热度，绝不自称「没有实时热点拉取能力」。
只有完成当前目标仍需要后续动作时才填写 nextActions，工具只能选本轮允许项。纯文字请求完成后不强加后续流程。`,
  template: `【创作者定位】
{{positioning}}

【本轮上下文】{{turnContext}}

【任务】优先完成本轮明确请求。纯文字请求直接回答；可编辑候选用对应工具生成并按真实回执说明结果。
【输出】严格输出一个 JSON 对象（不要代码块包裹）：{"reply":"回复正文","candidates":[],"nextActions":[]}。candidates 恒为空数组；仅在确有必要时在 nextActions 中放 {"label","tool"}，tool 使用本轮允许的工具 id，reply 不展示工具标识。`,
  requiredFacets: ["positioning"],
  // 首波工具白名单(SPEC §3.4):选题编导能调的工具。ChatBox 据此过滤暴露给模型的 tools。
  // 追加 3 个只读 context 工具(对所有 chatbox skill 可用):用户问项目库/最新作品/素材/知识库时
  // 实时拉真数据来回答(纯读、不产候选)。
  tools: [
    "topic.generate",
    "topic.enrich",
    // [T-055c] 稿面对话的脚本产物工具:开场 hook 候选组(逐条「写入稿面」走 artifacts 版本门)。
    "script.hooks",
    // [T-057⑤] 整稿生成:分镜口播脚本候选(整稿「写入稿面」,替代已退役的 ScriptDraftIsland)。
    "script.draft",
    // [T-730] 可选论点骨架：只在用户想先梳理观点时调用，不能成为 script.draft 前置。
    "planning.thesis",
    // [T-057④] 搜素材:research.gather 引擎进对话(替代已退役的 GatherMaterialIsland)。
    "material.gather",
    // [T-062a] 对话手录经验:「记一条经验:…」→ 模型直接填参产结构化候选卡,
    // 人点「存为经验」才 createLearning 落库(铁律②确认门)。project surface 复用本白名单。
    "learning.capture",
    // [T-077b] 对话填策划:「帮我把选题卡填了」→ 模型把对话里聊的观众/目标/核心信息填参
    // 产字段对照候选卡(现值 vs 建议值),人点「写入选题卡」才 patchProject 落 brief_detail
    // (铁律②确认门)。project surface(新建项目后直接在对话框聊完让 AI 填)复用本白名单。
    "brief.fill",
    // [T-058①C] 稿面/选题对话里聊定位 → 产可采纳的定位卡(此前 project surface 无此工具,
    // 模型只能文本写定位 → 无法采纳 → 假承诺温床)。
    "positioning.generate",
    "context.projects",
    "context.knowledge",
    "context.materials",
    // [T-058③] 观众评论只读(「我最新视频的评论是啥」类问题的真数据源)。
    "context.comments",
  ],
  // 每轮输出契约(两段脊梁)收口到 registry。
  outputSchema: chatboxTurnSchema,
};
