import { z } from "zod";
import type { PromptTemplate } from "../template";
import { ANTI_FABRICATION_CLAUSE } from "../grounding-facets";

/**
 * 选题补全 skill 模板(topic.enrich)—— 从 topic-enrich-runner 的内联 buildEnrichPrompt 提取而来。
 * 把一条待补全选题扩展成完整选题卡(10 详情字段 + 3 指标)。
 * facets 由 CreativeContext + subject 映射:
 *   positioning(必需,调用方已默认兜底)· learnings/signals/knowledge(选填上下文块,调用方按对应 brief 计算)·
 *   title(必需:待补全选题标题)· angle(必需:切入角度,调用方按 subject.angle 兜底)。
 * 保持原 prompt 文字与输出 JSON 约定不变,只把上下文占位化。
 *
 * T-025 跨模型健壮性:加 outputSchema(runStructuredNode 绑 generateObject,落空→文本兜底),让用户
 * 默认的 MiniMax 也稳定吐可解析选题卡(旧 LlmCompleter + parseCard 自由文本路径 MiniMax 下常吐不出
 * →parseCard 返回 null→任务 cancelled)。**顶层是对象**(选题卡本就是对象,天然满足 generateObject)。
 * score/difficulty 用宽容类型(nullable),runner 侧 score 夹 0-100 / difficulty 枚举归一,保留原容错。
 * 字段各给默认值让缺字段也过校验。
 */
export const topicCardSchema = z.object({
  oneLiner: z.string().default(""),
  targetAudience: z.string().default(""),
  audiencePain: z.string().default(""),
  coreConflict: z.string().default(""),
  hook: z.string().default(""),
  contentStructure: z.array(z.string()).default([]),
  format: z.string().default(""),
  materialBasis: z.string().default(""),
  riskNote: z.string().default(""),
  proposal: z.string().default(""),
  audiencePainScore: z.number().nullable().default(null),
  materialScore: z.number().nullable().default(null),
  productionDifficulty: z.string().nullable().default(null),
});
export type TopicCardOutput = z.infer<typeof topicCardSchema>;

export const TOPIC_ENRICH_TEMPLATE: PromptTemplate = {
  id: "topic.enrich",
  version: "v2",
  outputSchema: topicCardSchema,
  tools: [],
  system:
    "你是这位创作者的「选题策划 agent」,像专业自媒体主编那样把一条选题补全成完整选题卡。",
  template: `你是这位创作者的「选题策划 agent」。下面是一条**待补全的选题**,请把它扩展成一张完整的**选题卡**。

【创作者定位】
{{positioning}}{{learnings}}{{signals}}{{knowledge}}

【待补全选题】
标题:{{title}}
切入角度:{{angle}}

【任务】像一个专业自媒体主编那样,把这条选题想透——观众是谁、痛在哪、核心冲突、怎么开头钩住、内容怎么排、用什么形式、有没有素材、风险在哪、要不要立项。指标只给你有把握的,拿不准就给 null(别编)。
${ANTI_FABRICATION_CLAUSE}
特别地:materialBasis(素材依据)只能写**真实存在**的资料/经历,绝不凭空声称「能依托某资料」;没有可依托素材就如实写「暂无现成素材,需搜集」。

【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹),形如:
{"oneLiner":"一句话选题(把这条选题浓缩成一句)",
 "targetAudience":"目标观众(越具体越好)",
 "audiencePain":"观众痛点(他们真正卡在哪)",
 "coreConflict":"核心冲突(反常识/反直觉的张力)",
 "hook":"推荐开头 Hook(前 3 秒说什么)",
 "contentStructure":["内容结构第1段","第2段","第3段"],
 "format":"适合形式(口播/采访/剧情/图文…)",
 "materialBasis":"素材依据(能依托哪些现成资料/经历)",
 "riskNote":"风险点(可能翻车/敏感/同质化的地方)",
 "proposal":"立项建议(做/不做/怎么调整,一句)",
 "audiencePainScore":受众痛感分 0-100 或 null,
 "materialScore":素材充足分 0-100 或 null,
 "productionDifficulty":"low|mid|high 或 null"}`,
  requiredFacets: ["positioning", "title", "angle"],
};
