
// 选题中心的纯函数:出题依据(basis)的归一化守卫。
//
// 历史:本文件曾有一个 runTopicGenerate(跑 Claude Agent SDK 订阅 + WebSearch 出题)。
// topic.generate 已迁到新 Agent Runtime(Vercel AI SDK)—— dispatch 走 topic-task-adapter
// 的 runTopicGenerateV2(modelFor + @creatoros/ai-worker 的 runTopicTask)。旧的订阅路径随
// 「全程 Vercel AI SDK、去掉 Claude Agent SDK」(产品定位 §9 铁律1)退役;此处只保留仍被
// 复用的纯函数 normalizeBasis(出题依据 4 模式守卫),无 Agent SDK / LLM 依赖。

// 出题依据(选题中心)—— 一次 topic.generate 可立足的四种依据。
//   - positioning(缺省): 定位出题 — 钩子/争议/实用。
//   - comments: 基于评论信号出题 — 从真实受众需求起。
//   - knowledge: 基于知识库出题 — 每条都有素材依托。
//   - trend: 基于热点出题 — 当下热点 / 对标近期爆款。
export type TopicBasis = "positioning" | "comments" | "knowledge" | "trend";

const TOPIC_BASES: ReadonlySet<string> = new Set([
  "positioning",
  "comments",
  "knowledge",
  "trend",
]);

export function normalizeBasis(raw: unknown): TopicBasis {
  return typeof raw === "string" && TOPIC_BASES.has(raw)
    ? (raw as TopicBasis)
    : "positioning"; // 缺省 positioning
}
