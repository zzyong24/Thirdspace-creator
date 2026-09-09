import { z } from "zod";
import { contentRole } from "@creatoros/contract";
import type { PromptTemplate } from "../template";

/**
 * 相同逐字稿已经完成可信拆解时，只基于已保存的结构证据重新生成本账号选题。
 * 这条短路径不重新发送整篇逐字稿，也不改写既有拆解证据。
 */
export const intelligenceTopicFromDecompositionSchema = z.object({
  // 创作候选先展示、后补齐：改写初稿非空即可进入后续创作，结构化辅助字段可继续补充。
  title: z.string().max(80).default(""),
  angle: z.string().max(300).default(""),
  differentiation: z.string().max(300).default(""),
  sourceSummary: z.string().max(300).default(""),
  targetAudience: z.string().max(200).default(""),
  audiencePain: z.string().max(300).default(""),
  coreConflict: z.string().max(300).default(""),
  format: z.string().max(100).default(""),
  // 可选推荐不能阻断旧候选或已有合法初稿。
  contentRole: contentRole.nullish().catch(null),
  contentRoleReason: z.string().max(500).optional().catch(undefined),
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
  version: "v4",
  tools: [],
  outputSchema: intelligenceTopicFromDecompositionSchema,
  system:
    "你是短视频选题编辑。来源作品已经完成可信拆解，你只根据已保存的结构证据和本账号定位生成一个全新选题。" +
    "严禁重写或补造来源证据，可借鉴脱离原表达的因果推进关系，严禁复制原标题、句子或冒用原作者案例。",
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
6. contentRole：结合完整拆解、本账号定位、受众与当前业务目标推荐 traffic（流量型）、trust（信任型）或 conversion（获客型），证据不足可空。contentRoleReason：先说明原作品承担的作用，再解释本账号为何采用推荐目的、有哪些事实或资源条件；不要仅按题材、标题词或热度分类。format 是独立的表现形式，不能代替内容目的。
7. adaptationStrategy：明确 keep/replace/add/avoid 四栏改写策略；可空数组，但禁止把来源原句列为保留项。
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
