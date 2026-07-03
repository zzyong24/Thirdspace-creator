import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 复盘 skill 模板(review.insights)—— 从 review-runner 的内联 buildReviewPrompt 提取。
 * 从一条内容(对照定位)提炼可复用的爆款要素/方法论作为经验沉淀(机制⑤飞轮回流)。
 * facets 由 CreativeContext 映射:
 *   positioning(必需,调用方已兜底)· priorLearnings(已有经验,避免重复,选填)·
 *   subject(必需:本次复盘对象=作品真标题,调用方按真项目标题/topic 计算并兜底)。
 * T-039a 复盘注入真数据:再加三个**整块占位**(选填)——
 *   reviewScriptBlock(本次复盘作品·文案)· reviewMetricsBlock(本次复盘作品·真实数据)·
 *   reviewCommentsBlock(本次复盘作品·观众评论)。调用方把「标题行 + 真内容」拼成整块传入;读不到
 *   就传空串,占位替换为空 → 该块在 prompt 里自然省略(不硬塞空占位、不喂噪声,数据要真)。
 * [T-081] 再加 extraBrief(选填):对话中获得的补充指令/洞察整块(调用方拼「本次生成指令」标题行),
 *   空则整段省略 —— ChatBox 对话里聊出的复盘方向经此进 prompt,不再被零通道丢弃。
 * 保持原 prompt 文字与输出 JSON 约定不变,只把上下文占位化。
 * 注:resolveModelSpec 按 "review.insights" capability 解析模型(触发器 taskType=review.analyze)。
 *
 * T-025 跨模型健壮性:加 outputSchema(runStructuredNode 绑 generateObject,落空→文本兜底),
 * 让用户默认的 MiniMax 也稳定吐可解析经验列表(旧 runTemplatedNode 自由文本路径 MiniMax 下常吐
 * 不出→parseLearnings 返回空→任务 cancelled)。**顶层是对象**(learnings 数组包一层)——
 * generateObject 要顶层对象、裸数组在部分 provider 不可靠。字段各给默认值让缺字段也过校验。
 */
export const learningItemSchema = z.object({
  title: z.string().default(""),
  insight: z.string().default(""),
});
// 顶层输出契约:一个 learnings 数组(顶层对象,非裸数组)。
export const reviewInsightsSchema = z.object({
  learnings: z.array(learningItemSchema).default([]),
});
export type ReviewInsightsOutput = z.infer<typeof reviewInsightsSchema>;

export const REVIEW_INSIGHTS_TEMPLATE: PromptTemplate = {
  id: "review.insights",
  version: "v2",
  outputSchema: reviewInsightsSchema,
  tools: [],
  system: "你是这位创作者的「复盘 agent」。",
  template: `你是这位创作者的「复盘 agent」。

【创作者定位】
{{positioning}}{{priorLearnings}}

【本次复盘对象】{{subject}}
{{reviewScriptBlock}}{{reviewMetricsBlock}}{{reviewCommentsBlock}}{{extraBrief}}
【任务】像专业编导那样,**只针对上面这一条作品**(它的文案 / 数据 / 评论)提炼 3-6 条可复用方法论。**硬性要求(违反即算错):**
① 每条都必须从**这一条作品**的真实文案或数据里找到依据(引用它的钩子/结构/数据点来归因),**严禁引用其他作品、严禁把知识库或账号里其他内容的标题拿来当经验**;
② title 必须是**一句话方法论**(如「前 3 秒用具体数字承诺收益」),**绝不能是作品标题、视频描述或话题标签(#…)**——把别的标题/简介照抄进 title 一律算错;
③ insight 说明为什么有效 + 适用场景;
④【已有经验】只用来**避免重复**,**不要把它们当本次新经验再抄一遍**;
⑤ 若这条作品材料不足以提炼这么多,**诚实少给几条**,绝不用无关内容凑数。
【输出】只输出一个 JSON 对象 {"learnings": [...]},learnings 是数组,每条:{"title"(一句话方法论,如"前3秒用具体数字承诺收益"),"insight"(为什么有效/适用场景,一两句中文)}。不要多余文字、不要代码块包裹。`,
  requiredFacets: ["positioning", "subject"],
};
