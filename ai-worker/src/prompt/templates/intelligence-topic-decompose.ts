import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 内容雷达「逐字稿拆解 → 选题候选」。
 *
 * 输入必须是用户手动转写完成的完整逐字稿；标题和数据只作背景，不允许在缺少逐字稿时
 * 猜结构。输出把“来源内容的结构证据”和“属于当前账号的新选题”分开，Project 后续可以
 * 复用结构证据，但不得把来源原文当成自己的稿件。
 */
export const intelligenceTopicDecomposeSchema = z.object({
  hook: z.string().min(1).max(300),
  structureSteps: z.array(z.string().min(1).max(300)).min(2).max(8),
  coreClaims: z.array(z.string().min(1).max(300)).min(1).max(8),
  reusablePattern: z.string().min(1).max(500),
  factRisks: z.array(z.string().min(1).max(300)).max(12).default([]),
  title: z.string().min(1).max(80),
  angle: z.string().min(1).max(300),
  differentiation: z.string().min(1).max(300),
  sourceSummary: z.string().min(1).max(300),
});

export type IntelligenceTopicDecomposeOutput = z.infer<
  typeof intelligenceTopicDecomposeSchema
>;

export const INTELLIGENCE_TOPIC_DECOMPOSE_TEMPLATE: PromptTemplate = {
  id: "intelligence.topic-decompose",
  version: "v1",
  tools: [],
  outputSchema: intelligenceTopicDecomposeSchema,
  system:
    "你是短视频内容研究员。你先基于完整逐字稿拆出原作品的钩子、论证结构、核心主张和可迁移模式，" +
    "再结合创作者自己的定位生成一个全新的选题候选。严禁只看标题猜结构，严禁复制原作者的标题、句子、案例和叙事顺序。" +
    "来源中的事实只作为待核验线索；不能确认的数字、人物、结论必须列入 factRisks。",
  template: `【本账号定位】
{{positioning}}

【来源作品】
标题：{{sourceTitle}}
作者：{{sourceAuthor}}
原视频链接：{{sourceUrl}}

【用户手动转写完成的逐字稿】
{{transcript}}

【任务】
1. hook：概括原作品如何在开头抓住注意力，不抄原句。
2. structureSteps：按内容推进顺序列出 2-8 个结构步骤。
3. coreClaims：列出原作品的核心主张；不要把推测写成事实。
4. reusablePattern：提炼可以迁移的方法或结构，不得复刻表达。
5. factRisks：列出需要二次核验的数字、因果、引用或身份信息；没有则空数组。
6. 基于【本账号定位】生成一个属于本账号的新选题：
   - title：不是原标题改写；
   - angle：说明本账号从什么问题切入；
   - differentiation：明确与来源作品在观点、案例或叙事上的差异；
   - sourceSummary：用一两句话概括这条来源为何值得研究。

只输出符合 schema 的 JSON。`,
  requiredFacets: [
    "positioning",
    "sourceTitle",
    "sourceAuthor",
    "sourceUrl",
    "transcript",
  ],
  contextRequirements: ["positioning"],
};
