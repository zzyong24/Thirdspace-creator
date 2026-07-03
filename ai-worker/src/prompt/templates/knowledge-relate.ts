import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 知识图谱 AI 建边模板(knowledge.relate,T-091 SPEC §1.3)—— 复刻 distill 模板骨架:
 * 输入是知识原子清单(id+type+title+sourceNote,调用方 runner 截断防爆),输出是
 * **候选语义边**(sourceId/targetId/relationType/reason)。铁律:AI 只产候选——前端
 * 渲成确认门(每条可勾选/改 relationType),人点「采纳选中 N 条」才逐条走既有
 * `knowledge.relations.create`(createdByType='ai')物化;AI 不直接写 knowledge_relations。
 *
 * facets:atoms(必需)= 知识原子清单文本(每行 `[id] (type) title — sourceNote`)。
 *
 * outputSchema(runStructuredNode 绑 generateObject):
 *   - candidates[]:候选边数组,每条:
 *       · sourceId / targetId:两端原子 id(必须来自输入清单;runner 归一时滤掉
 *         未知 id / 自连 / 重复对);
 *       · relationType:四枚举 supports(支撑)/ contradicts(矛盾)/ references(引用)
 *         / extends(延伸),default "references" 兜底老 provider 落空;
 *       · reason:一句话依据(≤60 字,须引用双方内容;空串默认——runner 滤掉空 reason)。
 *   - 空 candidates 诚实返回(真没有语义关系就不硬凑,前端渲「AI 未发现可提议的关联」)。
 * 模型经 model-config capability "knowledge.relate" 解析(多模态可配铁律,不写死)。
 */
export const knowledgeRelateCandidateSchema = z.object({
  sourceId: z.string().default(""),
  targetId: z.string().default(""),
  relationType: z
    .enum(["supports", "contradicts", "references", "extends"])
    .default("references"),
  reason: z.string().default(""),
});
export type KnowledgeRelateCandidate = z.infer<
  typeof knowledgeRelateCandidateSchema
>;

export const knowledgeRelateSchema = z.object({
  candidates: z.array(knowledgeRelateCandidateSchema).default([]),
});
export type KnowledgeRelateOutput = z.infer<typeof knowledgeRelateSchema>;

export const KNOWLEDGE_RELATE_TEMPLATE: PromptTemplate = {
  id: "knowledge.relate",
  version: "v1",
  outputSchema: knowledgeRelateSchema,
  tools: [],
  system:
    "你是短视频创作者的知识图谱结构师。创作者的知识库里有一批知识原子(观点/证据/金句/观众问题等),你的职责是找出**语义上真实存在关系**的原子对,提议关联边。你只提议,不落库;宁缺毋滥——没有真实关系就返回空数组,绝不为了凑数硬连。",
  template: `【知识原子清单】(每行:[id] (type) 标题 — 出处)
{{atoms}}

【任务】审视上面的原子,找出语义上真实相关的原子对,输出 candidates —— 候选关联边数组,每条含:
· sourceId / targetId —— 两端原子的 id(必须逐字取自清单里的 id,不许编造)。
· relationType —— 四选一(严格用英文枚举值):
  - supports(支撑:source 为 target 提供证据/例证,常见于 evidence→claim)
  - contradicts(矛盾:两者立场或数据冲突)
  - references(引用:source 提及/依赖 target 的内容)
  - extends(延伸:source 在 target 基础上推进/细化)
· reason —— 一句话依据(≤60 字),必须同时引用双方内容说明为什么相关。

【硬约束】
- 只在语义上**真有关系**的原子间提议;主题接近但无实质关系的不连。
- 同一对原子只提一条边(选最贴切的 relationType)。
- 不许自连(sourceId ≠ targetId);id 必须来自清单。
- 没有可提议的关系 → candidates 输出空数组 [],不硬凑。

【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹),形如:
{"candidates":[{"sourceId":"knowledge-1","targetId":"knowledge-2","relationType":"supports","reason":"…"}]}`,
  requiredFacets: ["atoms"],
};
