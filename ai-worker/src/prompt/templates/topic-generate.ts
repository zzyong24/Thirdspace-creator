import { z } from "zod";
import type { PromptTemplate } from "../template";
import { ANTI_FABRICATION_CLAUSE } from "../grounding-facets";

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
export const TOPIC_TITLE_MAX_CHARS = 120;

const STRUCTURED_FIELD_IN_TITLE =
  /(?:^|[{"',;])\s*\\?["']?(?:angle|contentRole|source|predictedScore|reason|sourceComments)\\?["']?\s*:/i;

/**
 * [T-472] 生成标题语义守卫。MiniMax 偶发把后续 JSON 字段吞进 title 字符串，形状仍是
 * string，旧 schema 会误放行。这里拒绝已知结构字段泄漏、代码块和超长正文，让
 * runStructuredNode 走既有 schema 重试；不截断，因为截断会把污染结果伪装成正常标题。
 */
export function isValidGeneratedTopicTitle(title: string): boolean {
  const value = title.trim();
  if (!value) return true; // 缺标题仍由 normalizeTopics/空结果门统一处理。
  return (
    value.length <= TOPIC_TITLE_MAX_CHARS &&
    !value.includes("```") &&
    !STRUCTURED_FIELD_IN_TITLE.test(value)
  );
}

export const topicItemSchema = z.object({
  title: z
    .string()
    .default("")
    .refine(isValidGeneratedTopicTitle, {
      message: `标题不得混入 JSON 字段或超过 ${TOPIC_TITLE_MAX_CHARS} 字`,
    }),
  angle: z.string().default(""),
  contentRole: z.string().default(""),
  source: z.string().default("trend"),
  predictedScore: z.number().nullable().default(null),
  reason: z.string().default(""),
  // [T-066] 基于评论出题必须贴原始评论:该选题依据的原始评论文本(逐字引用,不许改写)。
  // basis=comments 时每条 1-3 条;非评论依据可为空数组(default 兜底,缺字段也过校验)。
  sourceComments: z.array(z.string()).default([]),
});
export const topicArraySchema = z
  .object({
    topics: z.array(topicItemSchema).default([]),
  })
  .refine((value) => value.topics.some((topic) => topic.title.trim()), {
    message: "至少返回一条有标题的选题",
  });
export type TopicArrayOutput = z.infer<typeof topicArraySchema>;

export const TOPIC_GENERATE_TEMPLATE: PromptTemplate = {
  id: "topic.generate",
  outputRecovery: "creative-partial",
  // [T-238] v3:新增选填 facet signalQuality(依据质量画像)—— 装配层(topic-task-adapter /
  // topic-daily-collector / chat-runner)按各依据源**真实数据**算质量画像注入;模板指引按画像
  // 动态定权(评论样本少噪声高→降权只取强信号;定位完整→当骨架),每条候选 reason 注明主要
  // 依据+权重理由。非硬性打分表 = 画像(确定性可测)+ AI 判断(灵活)。
  version: "v3",
  outputSchema: topicArraySchema,
  tools: [],
  system:
    "你是这位创作者的「选题会 agent」,像专业自媒体编导那样按依据产高潜力选题。",
  template: `【创作者定位】
{{positioning}}

【出题依据】{{basisHint}}{{basisContext}}{{knowledgeRef}}{{learningsConstraint}}{{signalQuality}}

【任务】产 6-8 条高潜力选题。每条按 钩子强度/定位契合/变现潜力 衡量。
若上方有【依据质量画像】:各依据**不平权**,按画像动态分配权重 —— 样本少/噪声高/覆盖窄的依据降权(只取其强信号条目,绝不把孤例放大成「受众普遍需求」);完整度高/证据密度高的依据升权当骨架。每条选题的 reason 里用一句话注明主要依据是什么、为何这样定权。
${ANTI_FABRICATION_CLAUSE}
【输出】只输出一个 JSON 对象 {"topics": [...]},topics 是选题数组,每条:{"title","angle"(切入一句),"contentRole"(traffic|trust|conversion),"source"(trend|benchmark|demand),"predictedScore"(0-100 数字),"reason"(一句中文),"sourceComments"(字符串数组)}。出题依据是评论(basis=comments)时,每条选题必须在 sourceComments 里逐字贴出它依据的 1-3 条原始评论——原文照抄,不许改写、不许概括;非评论依据时 sourceComments 给空数组 []。不要多余文字、不要代码块包裹。`,
  requiredFacets: ["positioning", "basisHint"],
};
