import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 相同逐字稿已经完成可信拆解时，只基于已保存的结构证据重新生成本账号选题。
 * 这条短路径不重新发送整篇逐字稿，也不改写既有拆解证据。
 */
export const intelligenceTopicFromDecompositionSchema = z.object({
  // 创作候选先展示、后补齐：缺字段由 UI 标记待补，只有采纳时才执行完整性门槛。
  title: z.string().max(80).default(""),
  angle: z.string().max(300).default(""),
  differentiation: z.string().max(300).default(""),
  sourceSummary: z.string().max(300).default(""),
  targetAudience: z.string().max(200).default(""),
  audiencePain: z.string().max(300).default(""),
  coreConflict: z.string().max(300).default(""),
  format: z.string().max(100).default(""),
  adaptationStrategy: z
    .object({
      keep: z.array(z.string().min(1).max(200)).max(8).default([]),
      replace: z.array(z.string().min(1).max(200)).max(8).default([]),
      add: z.array(z.string().min(1).max(200)).max(8).default([]),
      avoid: z.array(z.string().min(1).max(200)).max(8).default([]),
    })
    .default({ keep: [], replace: [], add: [], avoid: [] }),
}).refine(
  (value) =>
    [value.title, value.angle, value.differentiation, value.sourceSummary].some(
      (field) => field.trim().length > 0,
    ),
  { message: "选题候选不能完全为空" },
);

export type IntelligenceTopicFromDecompositionOutput = z.infer<
  typeof intelligenceTopicFromDecompositionSchema
>;

export const INTELLIGENCE_TOPIC_FROM_DECOMPOSITION_TEMPLATE: PromptTemplate = {
  id: "intelligence.topic-from-decomposition",
  outputRecovery: "creative-partial",
  version: "v3",
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
5. targetAudience / audiencePain / coreConflict / format：补齐可直接立项的完整选题卡。
6. adaptationStrategy：明确 keep/replace/add/avoid 四栏改写策略；可空数组，但禁止把来源原句列为保留项。
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
