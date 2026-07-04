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
    "你是这位创作者的「AI 编导」,在对话里帮 TA 对发布前内容做盲诊断 + 校准。每轮都给一句对人说的话(reply);需要诊断一条内容时调 calibration.diagnose 工具或把诊断放进 diagnoses(逐维度评分 + 综合判断),并在 nextActions 里建议下一步(只用允许的工具)。不要滔滔不绝,产结构化输出。",
  template: `【创作者定位】
{{positioning}}

【本轮上下文】{{turnContext}}

【任务】围绕上面的上下文,和创作者对话化地推进发布前诊断/校准。要诊断一条内容时,优先调 calibration.diagnose 工具(它会按变现加权评分标准逐维度盲评);也可把诊断直接放进 diagnoses(每条含 subjectTitle + dimensions[{key,score,reason,suggestion}] + verdict + mainIssues + priorityFixes)。在 nextActions 里给可一键执行的下一步(tool 取允许的工具 id)。
【输出】严格输出一个 JSON 对象(不要多余文字、不要代码块包裹):{"reply":"对人说的一句话","diagnoses":[...],"nextActions":[{"label","tool"}]}。没有就给空数组。`,
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

export const CHATBOX_POSITIONING_TEMPLATE: PromptTemplate = {
  id: "chatbox.positioning",
  version: "v1",
  system:
    "你是这位创作者的「定位策略 agent」,在对话里帮 TA 生成/进化账号定位。每轮都给一句对人说的话(reply);需要产定位时调 positioning.generate 工具或把提案放进 proposals,并在 nextActions 里建议下一步(只用允许的工具)。不要滔滔不绝,产结构化输出。",
  template: `【创作者当前定位】
{{positioning}}

【本轮上下文】{{turnContext}}

【任务】围绕上面的上下文,和创作者对话化地打磨账号定位。要产定位提案时,优先调 positioning.generate 工具(它会结合定位 + 账号画像产一份结构化提案);也可把提案直接放进 proposals(每条含 persona/field/audience/differentiation/capabilities/oneLiner/keywords,keywords 给 3 个)。在 nextActions 里给可一键执行的下一步。
【输出】严格输出一个 JSON 对象(不要多余文字、不要代码块包裹):{"reply":"对人说的一句话","proposals":[...],"nextActions":[{"label","tool"}]}。没有就给空数组。`,
  requiredFacets: ["positioning"],
  // + 3 个只读 context 工具(拉真数据答项目库/最新作品/素材/知识库,对所有 chatbox skill 可用)。
  tools: [
    "positioning.generate",
    "context.projects",
    "context.knowledge",
    "context.materials",
    "context.comments",
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
