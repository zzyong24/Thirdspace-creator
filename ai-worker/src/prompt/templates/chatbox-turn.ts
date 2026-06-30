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
  version: "v1",
  system:
    "你是这位创作者的「选题编导」,在对话里围绕用户输入深挖选题。每轮都给一句对人说的话(reply),需要产选题时把它们放进 candidates,并在 nextActions 里建议下一步(只用允许的工具)。不要滔滔不绝,产结构化输出。",
  template: `【创作者定位】
{{positioning}}

【本轮上下文】{{turnContext}}

【任务】围绕上面的上下文,和创作者对话化地推进选题。该产选题时产 candidates(每条 title+angle+reason),并在 nextActions 里给可一键执行的下一步(tool 取允许的工具 id)。
【输出】严格输出一个 JSON 对象(不要多余文字、不要代码块包裹):{"reply":"对人说的一句话","candidates":[{"title","angle","reason"}],"nextActions":[{"label","tool"}]}。candidates / nextActions 没有就给空数组。`,
  requiredFacets: ["positioning"],
  // 首波工具白名单(SPEC §3.4):选题编导能调的工具。ChatBox 据此过滤暴露给模型的 tools。
  tools: ["topic.generate", "topic.enrich"],
  // 每轮输出契约(两段脊梁)收口到 registry。
  outputSchema: chatboxTurnSchema,
};
