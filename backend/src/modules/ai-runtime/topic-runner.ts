
// 选题中心的纯函数:出题依据(basis)的归一化守卫。
//
// topic.generate 的生产准备由 topic-business-adapter 承担，执行归独立 Worker。
// 本文件只保留仍被复用的 normalizeBasis，无模型或执行生命周期。

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
