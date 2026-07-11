import { z } from "zod";
import { id, iso8601 } from "../primitives";

// [T-235d] 选题归因(正向归因回流,SPEC 2026-07-11 daily-topic-autopilot §2.4)。
// 已发布作品实绩按**选题维度**归因的验证资产:枚举化字段(gate-F3,可聚合)+ 受限自由文本
// (带逐字稿引用,无据空)。读侧给选题中心 UI(T-235e 实验徽标点开看依据)与编导 context 用。
//
// 枚举集合的单一真源在 ai-worker topic.attribution 模板(gate-F3,Zod 写侧强校验):
//   topicType ∈ {教程,观点,案例拆解,工具测评,热点跟进,故事}
//   hookType ∈ {反差,具体数字,痛点直击,悬念,利益承诺,身份共鸣}
//   structureFormula ∈ {痛点-方案-证明-CTA,三步教程,对比实验,叙事-转折-干货,清单式}
//   performanceTier ∈ {viral,normal,low}(相对本账号基线分层)
// wire 层收 string(写侧已枚举校验;读侧不因未来枚举扩展/存量值破 parse —— 契约 additive 稳)。
export const topicAttributionResource = z.object({
  id,
  userId: id,
  accountId: id.nullable(), // 按抖音号隔离
  publicationId: id, // 归因锚(一条发布作品至多一条归因)
  projectId: id.nullable(), // 溯源(与 learnings 的关联锚;导入作品可能缺项目 → null)
  performanceTier: z.string(), // viral|normal|low(相对本账号基线)
  baselineRatio: z.number().nullable(), // 播放(回退赞)相对账号均值的倍数(分层依据;无基线 null)
  topicType: z.string(),
  hookType: z.string(),
  structureFormula: z.string(),
  whyWorked: z.string(), // 须引逐字稿原文片段;无据空串(诚实)
  whyFailed: z.string(),
  reusableFormula: z.string(),
  // 完整归因产出 + 分层依据(next_experiments/指标快照等,溯源用;jsonb 原样透出)。
  raw: z.record(z.string(), z.unknown()),
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type TopicAttributionResource = z.infer<typeof topicAttributionResource>;
