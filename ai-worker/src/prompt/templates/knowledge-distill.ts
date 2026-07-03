import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 知识蒸馏 skill 模板(knowledge.distill,T-079b SPEC §2)—— 替代 classify 在知识流的位置
 * (classify 模板保留供他用):用户往倾倒场倒入整段原文(笔记/逐字稿/网页摘录),本节点把它
 * **蒸馏成一批可独立引用的知识原子**,前端渲成**蒸馏批量确认门**(每条可勾选/改 type/改 title),
 * 人点「采纳选中 N 条」才逐条 knowledge.create 物化(铁律:AI 只产候选,人采纳才落库)。
 *
 * facets:content(必需)= 用户倒入的原文(调用方 runner 截断 8000 字符防爆,见
 * knowledge-distill-runner)。
 *
 * outputSchema(runStructuredNode 绑 generateObject,落空→文本兜底再同 schema 校验):
 *   - atoms[]:知识原子数组,每条:
 *       · type:四原子枚举(claim 观点/evidence 证据/quote 金句/qa 观众问题),default "claim"
 *         让老 provider 落空字段也过校验;
 *       · title:原子本体一句话(≤80 字;空串默认 —— runner 归一时滤掉空 title 条目,
 *         全空 = 蒸馏不可用 → 诚实抛错,不编);
 *       · note:评注/上下文(可空,default "");
 *       · sourceNote:出处与可信度(可空,default "");
 *   - suggestedTags:1~3 个主题词(prompt 约束;runner 归一再截 3)—— AI 馆长(轻):
 *     采纳时随原子挂 tag,即主题聚类的挂载来源。
 * 模型经 model-config capability "knowledge.distill" 解析(多模态可配铁律,不写死)。
 */
export const knowledgeAtomSchema = z.object({
  type: z.enum(["claim", "evidence", "quote", "qa"]).default("claim"),
  title: z.string().default(""),
  note: z.string().default(""),
  sourceNote: z.string().default(""),
});
export type KnowledgeAtom = z.infer<typeof knowledgeAtomSchema>;

export const knowledgeDistillSchema = z.object({
  atoms: z.array(knowledgeAtomSchema).default([]),
  suggestedTags: z.array(z.string()).default([]),
});
export type KnowledgeDistillOutput = z.infer<typeof knowledgeDistillSchema>;

export const KNOWLEDGE_DISTILL_TEMPLATE: PromptTemplate = {
  id: "knowledge.distill",
  version: "v1",
  outputSchema: knowledgeDistillSchema,
  tools: [],
  system:
    "你是短视频创作者的知识资产蒸馏师。创作者会把原始材料整段倒给你——笔记、口播逐字稿、网页摘录、评论区讨论。你的职责是把材料蒸馏成一批**可独立引用的知识原子**:每个原子单独拿出来就能直接用于写稿,不依赖原文上下文。你只提炼,不发明;金句和数据必须逐字保真,绝不允许改写。",
  template: `【倒入的原文】
{{content}}

【任务】把上面的材料蒸馏成知识原子,输出:
1. atoms —— 知识原子数组,每篇 3~12 个,每条含:
   · type —— 四选一(严格用英文枚举值):
     - claim(观点:立场/角度/比喻/方法论主张,创作复利的核心)
     - evidence(证据:案例/数据/亲测结果/踩坑记录)
     - quote(金句:可独立传播的原话表达)
     - qa(观众问题:评论区或受众的真实疑问)
   · title —— 原子本体一句话(≤80 字):这条知识本身,不是对它的描述;单独读也成立。
   · note —— 评注/上下文(可空):什么场景下用、有什么前提,原文里有才写。
   · sourceNote —— 出处与可信度(可空):谁说的/哪来的/是否需核实,原文里有才写。
2. suggestedTags —— 1~3 个主题词(每个 2~6 字,从材料主题提炼,便于聚类检索)。

【硬约束】
- 每个原子必须**可独立引用**:脱离原文单独读,意思完整。
- **逐字保真**:type=quote 的 title 必须是原文原话,一字不改;数据/数字必须与原文完全一致,不许四舍五入或改写。
- **同义合并**:同一个意思只出一个原子,不重复不注水。
- 只从原文提炼,不编造原文没有的信息;原文没有出处就让 sourceNote 留空,不臆造。

【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹),形如:
{"atoms":[{"type":"claim","title":"观点本体","note":"","sourceNote":""}],"suggestedTags":["主题词"]}`,
  requiredFacets: ["content"],
};
