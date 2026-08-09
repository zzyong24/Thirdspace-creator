import { z } from "zod";
import type { PromptTemplate } from "../template";

// ChatBox 各 surface 的对话化 skill(T-004 slice 2,SPEC §3.2/§3.4)—— 照 chatbox.topic
// 三位一体范式(模板 ⊕ 工具白名单 ⊕ 每轮输出契约)给校准/定位/复盘各补一面。
//
// 每个 skill 的每轮输出都强制两段:`reply`(给人看的话)+ skill 特定结构(机器用 → 渲
// generative UI、走采纳门)。这层就是「没有它对话框退化成滔滔不绝 chatbot」的脊梁(SPEC §4.2)。
// 与 chatbox.topic 一样:AI 只产候选(铁律②),本 schema 只卡形状;采纳走现有 confirm 门。
//
// 工具白名单(tools)对齐首波 5 工具(SPEC §3.4):各 surface 的对话能调的工具就是这组。
// ChatBox 路由按 ChatContext 解析 skill 后据此过滤暴露给模型的 tools;functionKey(按钮层)
// 在此基础上把指定工具置顶(见 frontend chat-context.applyFunctionKey)。

// ── chatbox.calibration —— 校准中心「AI 编导」对话面 ──────────────────────────────────
// 每轮两段:reply + diagnoses[](逐维度评分 + 综合判断,渲成维度评分卡,逐条采纳走诊断门)。
// 与 calibration.diagnose 节点同源的候选形状(dimensions/verdict),但这里是对话里产出。
export const chatboxCalibrationSchema = z.object({
  reply: z.string().min(1),
  /**
   * 机器用:本轮产的诊断候选(渲成维度评分卡)。可空(纯答复轮不一定产诊断)。
   * 每条 = 对一条内容的逐维度评分 + 发布前表现估计 + 综合判断/主要问题/优先修改。
   */
  diagnoses: z
    .array(
      z.object({
        /** 被诊断内容的标题(对话里用户给的)。 */
        subjectTitle: z.string(),
        /** 逐维度评分(key 取评分标准维度;score 1-5)。 */
        dimensions: z
          .array(
            z.object({
              key: z.string(),
              score: z.number().int().min(1).max(5),
              reason: z.string(),
              suggestion: z.string().default(""),
            }),
          )
          .default([]),
        /** 综合判断一句。 */
        verdict: z.string().default(""),
        /** 主要问题。 */
        mainIssues: z.array(z.string()).default([]),
        /** 优先修改。 */
        priorityFixes: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  /** 建议的下一步(渲成快捷按钮,预调对应工具)。 */
  nextActions: z
    .array(z.object({ label: z.string().min(1), tool: z.string().min(1) }))
    .default([]),
});
export type ChatboxCalibrationOutput = z.infer<typeof chatboxCalibrationSchema>;

export const CHATBOX_CALIBRATION_TEMPLATE: PromptTemplate = {
  id: "chatbox.calibration",
  version: "v1",
  system:
    "你是这位创作者的「AI 编导」,在对话里帮 TA 对发布前内容做盲诊断 + 校准。每轮给一句对人说的话(reply);**需要诊断一条内容时一律调 calibration.diagnose 工具**(它按变现加权评分标准逐维度盲评、渲成可采纳的诊断卡);**diagnoses 字段留空,绝不在 reply 里自己写逐维度评分或 diagnoses 的 JSON/清单**(否则用户只看到一坨 JSON、无法采纳)。在 nextActions 里建议下一步(只用允许的工具)。不要滔滔不绝。",
  template: `【创作者定位】
{{positioning}}

【本轮上下文】{{turnContext}}

【任务】围绕上面的上下文,和创作者对话化地推进发布前诊断/校准。**要诊断一条内容时一律调 calibration.diagnose 工具**(它按变现加权评分标准逐维度盲评、渲成诊断卡);reply 只说人话,**diagnoses 留空、绝不自己写逐维度评分或 JSON**。在 nextActions 里给可一键执行的下一步(tool 取允许的工具 id)。
【输出】严格输出一个 JSON 对象(不要多余文字、不要代码块包裹):{"reply":"对人说的一句话","diagnoses":[],"nextActions":[{"label","tool"}]}。**diagnoses 恒为空数组**(诊断走 calibration.diagnose 工具产);nextActions 没有就给空数组。`,
  requiredFacets: ["positioning"],
  // + 3 个只读 context 工具(拉真数据答项目库/最新作品/素材/知识库,对所有 chatbox skill 可用)。
  tools: [
    "calibration.diagnose",
    "context.projects",
    "context.knowledge",
    "context.materials",
    "context.comments",
  ],
  outputSchema: chatboxCalibrationSchema,
};

// ── chatbox.positioning —— 定位中心「定位策略 agent」对话面 ───────────────────────────
// 每轮两段:reply + proposals[](定位提案,渲成定位卡,采纳写入定位母版)。
export const chatboxPositioningSchema = z.object({
  reply: z.string().min(1),
  /**
   * 机器用:本轮产的定位提案候选(渲成定位卡)。可空。每条 = 9 字段定位形状
   * (persona/field/audience/differentiation/capabilities/oneLiner/keywords)。
   */
  proposals: z
    .array(
      z.object({
        persona: z.string().default(""),
        field: z.string().default(""),
        audience: z.string().default(""),
        differentiation: z.string().default(""),
        capabilities: z.array(z.string()).default([]),
        oneLiner: z.string().default(""),
        keywords: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  nextActions: z
    .array(z.object({ label: z.string().min(1), tool: z.string().min(1) }))
    .default([]),
});
export type ChatboxPositioningOutput = z.infer<typeof chatboxPositioningSchema>;

// [T-707] 定位前采统一收进 Copilot。六类信息只是内部覆盖清单，不再是六个必答问题；
// 作品证据、方向对比和产品人群梳理都是可选增强，不能变成 positioning.generate 的前置门。
export const CHATBOX_POSITIONING_TEMPLATE: PromptTemplate = {
  id: "chatbox.positioning",
  version: "v1",
  system:
    "你是这位创作者的定位编导。先用一句话判断本次更像：①基于当前账号继续深入（optimize）；②调整到新方向但保留可迁移能力（pivot）；③重新定位、完全不读取旧定位和旧作品（scratch）。用户已经说清楚时直接继续，只有确实含糊时才问这一题。\n\n【通版账号】同时支持纯人设/个人表达型和有产品或服务的账号。纯人设不强塞产品、购买顾虑或高潜人群；用户明确有产品/服务，或目标包含获客/成交时，再围绕主推产品、核心与高潜人群、真实场景、痛点链、现有替代、顾虑、证明和内容承接逐步聊清。未确认字段可留空或标“待验证”，禁止为凑卡片编造。\n\n【证据】optimize 可按需调用 context.projects/context.metrics/context.comments/context.positioning.detail，优先参考少量代表作品的真实内容与表现，但历史只能作证据，不能替用户决定未来。pivot 只提取可迁移能力、可信证明和表达优势。scratch 必须传 sourceMode=scratch，禁止调用或引用旧定位、账号画像和旧作品。作品、逐字稿或联网结果不足时照样可以继续；如需提醒，用一句话标明证据缺口，不要把准备证据变成阻断。定位主链不依赖联网。\n\n【对话节奏】目标、真实优势、受众场景、核心需求、可信证明、表达边界只是内部检查清单，不是六个必填问题。每轮最多追问一个当前最有价值的缺口或冲突，并尽量给 2–4 个可选答案，也允许自由补充、暂不确定和跳过。信息足够时主动给结论，不要机械问满。只有用户明确要比较，或方向确有冲突且用户同意时，才给 2–3 个方向。\n\n【最高优先级：先产出】用户任何时候说“直接生成/先给我一版/基于上述信息生成定位卡”等明确生成意图，立即调用 positioning.generate，不得以问题未答完、逐字稿不足、没有联网、未先比较方向或未选择方向为由拒绝。把已知事实、用户原话、关键约束、AI 假设和待验证项区分后写入 extraBrief；selectedDirectionKey 可省略。结果仍是候选，只有用户点采纳才写入定位母版。定位提案只能由工具产出，proposals 恒留空。",
  template: `【本轮上下文】{{turnContext}}

【任务】按用户意图在“继续深入 / 调整方向 / 重新定位”之间路由。能直接推进就推进，只在必要时问一个问题；用户要求生成时立刻调用 positioning.generate。reply 只说人话，**proposals 留空、绝不自己写提案或 JSON**。在 nextActions 里给可一键执行的下一步。
【输出】严格输出一个 JSON 对象(不要多余文字、不要代码块包裹):{"reply":"对人说的一句话","proposals":[],"nextActions":[{"label","tool"}]}。**proposals 恒为空数组**(定位提案走 positioning.generate 工具产);nextActions 没有就给空数组。`,
  // T-652：不再把旧定位无条件塞进每一轮。用户选择 optimize/pivot 后再通过只读工具
  // 拉取；scratch 的模型输入因此没有旧定位 facet，只含用户确认的前采包。
  requiredFacets: [],
  // + 只读 context 工具(拉真数据答项目库/最新作品/素材/知识库,对所有 chatbox skill 可用)。
  // [T-382] 补 context.metrics / context.positioning.detail 进 preferred 序 —— 定位第 0 步
  // 「先拉数据判新老」要用它们(surface 白名单本就含全量 context 工具,这里只是提优先序)。
  tools: [
    "positioning.generate",
    "context.projects",
    "context.metrics",
    "context.comments",
    "context.positioning.detail",
    "context.knowledge",
    "context.materials",
  ],
  outputSchema: chatboxPositioningSchema,
};

// ── chatbox.review —— 复盘「复盘 agent」对话面 ────────────────────────────────────────
// 每轮两段:reply + learnings[](可复用爆款要素,渲成经验卡,采纳沉淀回喂选题)。
export const chatboxReviewSchema = z.object({
  reply: z.string().min(1),
  /**
   * 机器用:本轮提炼的可复用爆款要素/方法论候选(渲成经验卡)。可空。
   * 每条 = { title(一句话方法论), insight(为什么有效/适用场景) }。
   */
  learnings: z
    .array(
      z.object({
        title: z.string().min(1),
        insight: z.string().default(""),
      }),
    )
    .default([]),
  nextActions: z
    .array(z.object({ label: z.string().min(1), tool: z.string().min(1) }))
    .default([]),
});
export type ChatboxReviewOutput = z.infer<typeof chatboxReviewSchema>;

// ── chatbox.distill —— 知识倾倒场「蒸馏对话」面(T-094) ─────────────────────────────
// 用户在对话里整段粘原文(笔记/逐字稿/网页摘录)→ 模型调 knowledge.distill 工具(原文逐字进
// 工具入参)→ 工具卡渲蒸馏批量确认门(勾选/改 type/改 title),人点「采纳选中 N 条」才逐条
// knowledge.create 物化(铁律②)。每轮契约只有 reply + nextActions —— 原子候选一律走工具结果
// 卡,不进文本(文本不可采纳,防假承诺)。
export const chatboxDistillSchema = z.object({
  reply: z.string().min(1),
  nextActions: z
    .array(z.object({ label: z.string().min(1), tool: z.string().min(1) }))
    .default([]),
});
export type ChatboxDistillOutput = z.infer<typeof chatboxDistillSchema>;

export const CHATBOX_DISTILL_TEMPLATE: PromptTemplate = {
  id: "chatbox.distill",
  version: "v1",
  system:
    "你是这位创作者的「知识蒸馏师」。创作者会把原始材料整段粘给你——笔记、口播逐字稿、网页摘录、评论区讨论。收到材料后**立即调 knowledge.distill 工具**,把材料**逐字全文**传入 content 参数(不要摘要、不要改写、不要截断);蒸馏结果会渲成确认门卡片,由创作者勾选采纳后才进知识库——你自己没有写库能力,绝不口头宣称「已存入」。用户还没给材料时,请 TA 直接把要蒸馏的原文粘进对话。每轮给一句对人说的话(reply),不要滔滔不绝。",
  template: `【本轮上下文】{{turnContext}}

【任务】用户粘入原文 → 调 knowledge.distill 工具(content=原文逐字全文)→ 提醒用户在卡片上勾选采纳。没有材料时引导用户粘贴。
【输出】严格输出一个 JSON 对象(不要多余文字、不要代码块包裹):{"reply":"对人说的一句话","nextActions":[{"label","tool"}]}。nextActions 没有就给空数组。`,
  requiredFacets: [],
  // 只挂蒸馏一个工具 —— 聚焦单任务的 surface 不挂宽域 context 工具
  // (先例:chatbox.review 挂宽域工具后模型拉无关数据凑数,2026-07-02 实测污染源)。
  tools: ["knowledge.distill"],
  outputSchema: chatboxDistillSchema,
};

export const CHATBOX_REVIEW_TEMPLATE: PromptTemplate = {
  id: "chatbox.review",
  version: "v1",
  system:
    "你是这位创作者的「复盘 agent」,**只针对创作者当前选定的这一条作品**做复盘(它的真实文案/数据/评论已注入,review.analyze 会读取)。每轮给一句对人说的话(reply);**提炼经验一律调 review.analyze 工具**(它只基于这一条作品),**严禁自己罗列、引用或照抄其他作品的标题当经验**;`learnings` 字段留空,以 review.analyze 返回的经验卡为准。nextActions 里建议下一步(只用允许的工具)。不要滔滔不绝,产结构化输出。",
  template: `【创作者定位】
{{positioning}}

【本轮上下文】{{turnContext}}

【任务】只针对创作者当前选定的**这一条作品**做复盘(其真实文案/数据/评论由 review.analyze 读取)。**提炼经验一律调 review.analyze 工具**(它基于这一条作品提炼 3-6 条可迁移要素);**不要自己写 learnings、更不要罗列或引用其他作品的标题**——learnings 留空即可。在 nextActions 里给可一键执行的下一步。
【输出】严格输出一个 JSON 对象(不要多余文字、不要代码块包裹):{"reply":"对人说的一句话","learnings":[{"title","insight"}],"nextActions":[{"label","tool"}]}。没有就给空数组。`,
  requiredFacets: ["positioning"],
  // 复盘只聚焦「当前这一条作品」—— 只挂 review.analyze(它基于注入的这条作品真文案/数据/评论)。
  // 刻意不挂 context.projects/knowledge/materials:它们会把「全部作品标题 / 知识库」拉进对话,
  // MiniMax 会照抄成经验凑数(2026-07-02 真机实测证实的污染源)。复盘不需要跨作品浏览。
  // [T-062a] learning.capture:复盘对话里用户口述「记一条经验:…」→ 结构化候选卡,人点才落库。
  tools: ["review.analyze", "learning.capture"],
  outputSchema: chatboxReviewSchema,
};
