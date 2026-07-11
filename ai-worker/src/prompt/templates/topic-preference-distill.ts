import { z } from "zod";
import type { PromptTemplate } from "../template";

// [T-212d] 防茧房校准 —— 淘汰原因蒸馏 skill（topic.preference）。SPEC 2026-07-11 §2.4。
//
// 输入：用户淘汰选题时写的一批**原因原文**（如「太理论了没人看」「又是复盘我不想做」）。
// 输出：把这批原因聚类成若干条**结构化偏好信号**（该创作者「不喜欢 X / 偏好 Y」），每条给:
//   - signal：一句人话偏好（给人看的）。
//   - keyword：用于**匹配候选选题标题/角度**的短词/短语（护栏在评分注入时按它命中，故要短、要具体）。
//   - direction：avoid（负向：命中则压低分）| prefer（正向：命中则抬分）。
//   - supportingCount：本次这批原因里，有几条支持这条偏好（**≥3 才会被升级为硬偏好**——这条硬门在
//       backend 护栏里强制，AI 只诚实报数，不自行决定升不升级）。
//
// 反过拟合边界（写进 system，防 AI 越蒸越窄）：只蒸「稳定、可复用」的角度/题材偏好；**不要**把一次性
//   的情绪、具体某条视频的吐槽、或过度细分的长尾当成偏好。宁少勿滥——3-6 条足够。
//
// 输出契约走 generateObject 绑 Zod（每轮 schema 约束，SPEC §4.2 防发散），跨模型健壮
// （runStructuredNode 文本兜底）。schema 定义在本包（有 zod 依赖）；backend runner 只引类型。

// 一条蒸馏出的偏好信号。
export const topicPreferenceSchema = z.object({
  signal: z.string().default(""), // 一句人话偏好（「不喜欢纯理论角度」）
  // 匹配候选标题/角度的短词（护栏按 includes 命中；空则该条无法注入评分，弃用）。
  keyword: z.string().default(""),
  direction: z.enum(["avoid", "prefer"]).default("avoid"),
  // 支持这条偏好的原因条数（诚实报数；≥3 的硬门由 backend 护栏强制，非模型裁量）。
  supportingCount: z.number().int().min(0).default(1),
});
export type TopicPreferenceItem = z.infer<typeof topicPreferenceSchema>;

// 顶层输出契约（顶层对象，非裸数组 —— generateObject 要顶层对象）。
export const topicPreferenceDistillSchema = z.object({
  偏好信号: z.array(topicPreferenceSchema).default([]),
});
export type TopicPreferenceDistillOutput = z.infer<
  typeof topicPreferenceDistillSchema
>;

export const TOPIC_PREFERENCE_DISTILL_TEMPLATE: PromptTemplate = {
  id: "topic.preference",
  version: "v1",
  // 三位一体「输出 Zod schema」收口到 registry（SPEC §4.2）：runStructuredNode 从 registry 取它
  // 绑 generateObject，校验失败自动重试。
  outputSchema: topicPreferenceDistillSchema,
  tools: [],
  system:
    "你是这位创作者的「选题偏好蒸馏 agent」。用户淘汰选题时会写一句原因，你要把这些原因聚类成**稳定、可复用**的偏好信号，" +
    "供选题评分参考。**反过拟合硬约束**：只提炼能长期复用的角度/题材偏好（如「不喜欢纯理论」「偏好真实案例」），" +
    "**绝不**把一次性情绪、对某一条具体视频的吐槽、或过度细分的长尾当偏好——那会让评分越学越窄（信息茧房）。宁少勿滥，3-6 条足够。" +
    "keyword 要短、要具体，能在候选选题的标题/角度里命中；supportingCount 如实数有几条原因支持，别夸大。",
  // facets：dropReasons（淘汰原因原文，逐条一行，必需）。
  template: `【用户淘汰选题时写的原因（逐条）】
{{dropReasons}}

【任务】把上面这些淘汰原因聚类成若干条**稳定可复用**的选题偏好信号：
- signal：一句人话概括这条偏好（给创作者看）。
- keyword：一个能在候选选题标题/角度里命中的**短词/短语**（如「理论」「复盘」「案例」）。要短、要具体。
- direction：avoid=负向（这类角度不想做，命中要压低分）；prefer=正向（这类想多做，命中要抬分）。多数淘汰原因是 avoid。
- supportingCount：本批原因里有几条支持这条偏好（如实数，别夸大——决定它够不够格升级为硬偏好）。

【反过拟合】只留稳定、可复用的偏好，别把一次性情绪/单条视频吐槽/长尾细分当偏好。3-6 条足够，宁缺毋滥。

【输出】只输出一个 JSON 对象：
{"偏好信号":[{"signal":"不喜欢纯理论角度","keyword":"理论","direction":"avoid","supportingCount":3}]}`,
  requiredFacets: ["dropReasons"],
  // 声明式 context：本模板的 dropReasons 由 runner 直接从淘汰候选装配（非 reader），无 context 源。
  contextRequirements: [],
};
