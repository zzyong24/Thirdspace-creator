import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 选题会 skill 模板(topic.generate)。从 topic-node 的内联 prompt 提取而来 —— 证明"提示词模板化解耦"。
 * facets:positioning(创作者定位简报,调用方已默认兜底)、basisHint(出题依据提示,调用方按 basis 计算)、
 * knowledgeRef/learningsConstraint(T-062b gate-F3:知识库参考 + 已验证经验约束,选填,调用方按
 * CreativeContext 装配;空库落「(暂无沉淀)」诚实不编)。
 *
 * T-025 跨模型健壮性:加 outputSchema(runStructuredNode 绑 generateObject,落空→文本兜底),让用户
 * 默认的 MiniMax 也稳定吐可解析选题(旧 runAgentNode 自由文本 + parseTopics 路径 MiniMax 下常吐不出
 * 数组→抛「未产出可解析选题」→任务 cancelled)。**顶层是对象**(topics 数组包一层,generateObject 要
 * 顶层对象、不能裸数组);字段各 .default 让缺字段也过校验;runner 侧 normalizeTopics 再滤空/兜底。
 */
export const topicItemSchema = z.object({
  title: z.string().default(""),
  angle: z.string().default(""),
  contentRole: z.string().default(""),
  source: z.string().default("trend"),
  predictedScore: z.number().nullable().default(null),
  reason: z.string().default(""),
});
export const topicArraySchema = z.object({
  topics: z.array(topicItemSchema).default([]),
});
export type TopicArrayOutput = z.infer<typeof topicArraySchema>;

export const TOPIC_GENERATE_TEMPLATE: PromptTemplate = {
  id: "topic.generate",
  version: "v2",
  outputSchema: topicArraySchema,
  tools: [],
  system:
    "你是这位创作者的「选题会 agent」,像专业自媒体编导那样按依据产高潜力选题。",
  template: `【创作者定位】
{{positioning}}

【出题依据】{{basisHint}}{{basisContext}}{{knowledgeRef}}{{learningsConstraint}}

【任务】产 6-8 条高潜力选题。每条按 钩子强度/定位契合/变现潜力 衡量。
【输出】只输出一个 JSON 对象 {"topics": [...]},topics 是选题数组,每条:{"title","angle"(切入一句),"contentRole"(traffic|trust|conversion),"source"(trend|benchmark|demand),"predictedScore"(0-100 数字),"reason"(一句中文)}。不要多余文字、不要代码块包裹。`,
  requiredFacets: ["positioning", "basisHint"],
};
