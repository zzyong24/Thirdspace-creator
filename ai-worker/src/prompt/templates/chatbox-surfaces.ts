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
  tools: ["calibration.diagnose"],
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
  tools: ["positioning.generate"],
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

export const CHATBOX_REVIEW_TEMPLATE: PromptTemplate = {
  id: "chatbox.review",
  version: "v1",
  system:
    "你是这位创作者的「复盘 agent」,在对话里帮 TA 从内容里提炼可复用的爆款要素/方法论。每轮都给一句对人说的话(reply);需要复盘时调 review.analyze 工具或把要素放进 learnings,并在 nextActions 里建议下一步(只用允许的工具)。不要滔滔不绝,产结构化输出。",
  template: `【创作者定位】
{{positioning}}

【本轮上下文】{{turnContext}}

【任务】围绕上面的上下文,和创作者对话化地做内容复盘。要提炼经验时,优先调 review.analyze 工具(它会提炼 3-6 条可迁移的爆款要素);也可把要素直接放进 learnings(每条含 title 一句话方法论 + insight 为什么有效)。在 nextActions 里给可一键执行的下一步。
【输出】严格输出一个 JSON 对象(不要多余文字、不要代码块包裹):{"reply":"对人说的一句话","learnings":[{"title","insight"}],"nextActions":[{"label","tool"}]}。没有就给空数组。`,
  requiredFacets: ["positioning"],
  tools: ["review.analyze"],
  outputSchema: chatboxReviewSchema,
};
