import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 复盘 skill 模板(review.insights)—— 从 review-runner 的内联 buildReviewPrompt 提取。
 * 从一条内容(对照定位)提炼可复用的爆款要素/方法论作为经验沉淀(机制⑤飞轮回流)。
 * facets 由 CreativeContext 映射:
 *   positioning(必需,调用方已兜底)· priorLearnings(已有经验,避免重复,选填)·
 *   subject(必需:本次复盘对象,调用方按 topic 计算并兜底)。
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

【任务】像专业编导做数据复盘那样,提炼 3-6 条**可复用的爆款要素/方法论**作为经验沉淀(钩子、节奏、选题角度、CTA、踩坑等),要具体、可迁移到下一条内容,且与已有经验不重复。
【输出】只输出一个 JSON 对象 {"learnings": [...]},learnings 是数组,每条:{"title"(一句话方法论,如"前3秒用具体数字承诺收益"),"insight"(为什么有效/适用场景,一两句中文)}。不要多余文字、不要代码块包裹。`,
  requiredFacets: ["positioning", "subject"],
};
