import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 知识倾倒场归类 skill 模板(knowledge.classify,T-062c SPEC §4)—— 用户往 /knowledge 倒入
 * 一段原文(粘贴文本/URL/拖入 .md/.txt),本节点判 `{ knowledgeType, title, tags, summary }`,
 * 前端渲成**确认门卡片**(type/title 可改),人点「存入知识库」才 knowledge.create 物化
 * (铁律:AI 只产候选,人采纳才落库)。
 *
 * facets:content(必需)= 用户倒入的原文(调用方 runner 截断防爆,见 knowledge-classify-runner)。
 *
 * outputSchema(runStructuredNode 绑 generateObject,落空→文本兜底再同 schema 校验):
 *   - knowledgeType:5 枚举同 contract knowledge.create 的 body(note/reference/inspiration/
 *     snippet/transcript),default "note" 让老 provider 落空字段也过校验;
 *   - title:一句标题(空串默认;runner 归一时空标题 = 不可用 → 诚实抛错,不编);
 *   - tags:≤5 个主题标签(prompt 约束,runner 归一再截 5);
 *   - summary:一句话摘要。
 * 模型经 model-config capability "knowledge.classify" 解析(多模态可配铁律,不写死)。
 */
export const knowledgeClassifySchema = z.object({
  knowledgeType: z
    .enum(["note", "reference", "inspiration", "snippet", "transcript"])
    .default("note"),
  title: z.string().default(""),
  tags: z.array(z.string()).default([]),
  summary: z.string().default(""),
});
export type KnowledgeClassifyOutput = z.infer<typeof knowledgeClassifySchema>;

export const KNOWLEDGE_CLASSIFY_TEMPLATE: PromptTemplate = {
  id: "knowledge.classify",
  version: "v1",
  outputSchema: knowledgeClassifySchema,
  tools: [],
  system:
    "你是短视频创作者的知识库管理员。创作者会把各种原始材料整段倒给你——笔记、网页摘录、灵感碎片、金句片段、口播逐字稿、参考链接。你的职责是替他归类建档:判断这段材料属于哪一类知识、起一个一眼看懂的标题、打几个便于日后检索的标签、写一句话摘要。只归类,不改写原文,不编造原文里没有的信息。",
  template: `【倒入的原文】
{{content}}

【任务】把上面这段材料归类建档,输出:
1. knowledgeType —— 五选一(严格用英文枚举值):
   · note(笔记:观点/心得/方法论记录)
   · reference(参考:网页摘录、外部资料、URL 链接类)
   · inspiration(灵感:选题点子、创意碎片)
   · snippet(片段:可直接复用的金句/Hook/开头模板)
   · transcript(记录:口播逐字稿、对话/会议记录)
2. title —— 一句标题(≤30 字,让创作者一眼想起这是什么;别用「无标题」之类的空话)。
3. tags —— 主题标签数组(≤5 个,每个 2-6 字,便于检索;从原文主题提炼,不臆造)。
4. summary —— 一句话摘要(≤50 字,说清这段材料讲了什么、创作时能拿来干什么)。

【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹),形如:
{"knowledgeType":"note","title":"标题","tags":["标签1","标签2"],"summary":"一句话摘要"}`,
  requiredFacets: ["content"],
};
