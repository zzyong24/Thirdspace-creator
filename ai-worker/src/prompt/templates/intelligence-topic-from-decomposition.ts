import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 相同逐字稿已经完成可信拆解时，只基于已保存的结构证据重新生成本账号选题。
 * 这条短路径不重新发送整篇逐字稿，也不改写既有拆解证据。
 */
export const intelligenceTopicFromDecompositionSchema = z.object({
  title: z.string().min(1).max(80),
  angle: z.string().min(1).max(300),
  differentiation: z.string().min(1).max(300),
  sourceSummary: z.string().min(1).max(300),
});

export type IntelligenceTopicFromDecompositionOutput = z.infer<
  typeof intelligenceTopicFromDecompositionSchema
>;

export const INTELLIGENCE_TOPIC_FROM_DECOMPOSITION_TEMPLATE: PromptTemplate = {
  id: "intelligence.topic-from-decomposition",
  version: "v1",
  tools: [],
  outputSchema: intelligenceTopicFromDecompositionSchema,
  system:
    "你是短视频选题编辑。来源作品已经完成可信拆解，你只根据已保存的结构证据和本账号定位生成一个全新选题。" +
    "严禁重写或补造来源证据，严禁复制原作者的标题、句子、案例和叙事顺序。",
  template: `【本账号定位】
{{positioning}}

【来源作品】
标题：{{sourceTitle}}
作者：{{sourceAuthor}}
原视频链接：{{sourceUrl}}

【已保存的结构证据】
{{decomposition}}

【任务】
只生成属于本账号的新选题：
1. title：不是原标题改写。
2. angle：说明本账号从什么问题切入。
3. differentiation：明确与来源作品在观点、案例或叙事上的差异。
4. sourceSummary：用一两句话概括这条来源为何值得研究。

只输出符合 schema 的 JSON。`,
  requiredFacets: [
    "positioning",
    "sourceTitle",
    "sourceAuthor",
    "sourceUrl",
    "decomposition",
  ],
  contextRequirements: ["positioning"],
};
