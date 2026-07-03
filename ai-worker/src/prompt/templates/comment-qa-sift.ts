import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 评论回流蒸馏筛模板(comment.qa-sift,T-092 SPEC §2.1 ②)—— 三级去噪门的 AI 层。
 * 不复用 knowledge.distill(它面向单篇长文;这里是多条短评的批处理,输入输出形状都不同)。
 *
 * 输入 facet:comments(必需)= 硬规则预筛后的评论批文本(每行
 * `[signalId] (赞 N) 评论原文`,调用方 runner 拼装并截断防爆)。
 *
 * outputSchema:candidates[] —— qa 原子候选,每条:
 *   · title:归一成一个清晰问题(≤80 字;空串默认——runner 滤掉);
 *   · note:补充语境(可空);
 *   · sourceNote:出处样式(如「抖音评论 ×3,最高赞 57」;可空,runner 兜底自动拼);
 *   · signalIds:支撑此问题的评论 signalId(≥1;**同义合并的核心杠杆**——多条评论问
 *     同一件事 = 一个候选聚合多个 signalIds)。
 * 铁律:AI 只产候选——人勾选采纳才逐条 knowledge.create(type='qa')物化;
 * 空候选诚实返回(评论全是夸赞/水贴就空,不编问题)。
 * 模型经 model-config capability "comment.qa-sift" 解析(可配,不写死)。
 */
export const commentQaCandidateSchema = z.object({
  title: z.string().default(""),
  note: z.string().default(""),
  sourceNote: z.string().default(""),
  signalIds: z.array(z.string()).default([]),
});
export type CommentQaCandidate = z.infer<typeof commentQaCandidateSchema>;

export const commentQaSiftSchema = z.object({
  candidates: z.array(commentQaCandidateSchema).default([]),
});
export type CommentQaSiftOutput = z.infer<typeof commentQaSiftSchema>;

export const COMMENT_QA_SIFT_TEMPLATE: PromptTemplate = {
  id: "comment.qa-sift",
  version: "v1",
  outputSchema: commentQaSiftSchema,
  tools: [],
  system:
    "你是短视频创作者的评论蒸馏师。创作者采集了自己作品的观众评论,评论 99% 是噪音(夸赞/附和/表情/闲聊),你的职责是**只捞出真实的疑问、需求与反驳**,把它们归一成清晰的问题,作为知识库 qa 原子(观众问题)的候选。你只筛选提炼,不发明观众没问过的问题。",
  template: `【采集到的评论批】(每行:[signalId] (赞 N) 评论原文)
{{comments}}

【任务】筛出有知识价值的评论,输出 candidates —— qa 原子候选数组,每条含:
· title —— 把评论归一成**一个清晰的问题**(≤80 字,问题式表述,忠于评论原意,不拔高不发明)。
· note —— 补充语境(可空):评论里带的场景/前提,原文有才写。
· sourceNote —— 出处样式,如「抖音评论 ×3,最高赞 57」(按支撑评论数与最高赞拼)。
· signalIds —— 支撑此问题的评论 signalId 数组(≥1,必须逐字取自清单)。

【硬约束】
- **只留真实疑问/需求/反驳**:夸赞(「学到了」「太强了」)、附和、闲聊、表情一律丢弃。
- **同义合并**:多条评论问同一件事 = 只出一个候选,signalIds 聚合全部支撑评论——这是去噪的核心。
- title 忠于评论原意;观众没问的不许编。
- 全是噪音 → candidates 输出空数组 [],不硬凑。

【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹),形如:
{"candidates":[{"title":"怎么在本地跑大模型?","note":"","sourceNote":"抖音评论 ×2,最高赞 31","signalIds":["sig-1","sig-2"]}]}`,
  requiredFacets: ["comments"],
};
