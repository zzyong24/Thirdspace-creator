import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 素材匹配 skill 模板(material.match)—— 从 material-match-runner 的内联 buildMatchPrompt 提取而来。
 * 从创作者已有素材库里挑出适合本条内容的真实素材(assetId + role + reason)。
 * facets 由 CreativeContext + task 映射:
 *   positioning(必需,调用方已默认兜底)· topic(选填:本条内容主题,调用方按 topic 兜底)·
 *   library(必需:可用素材库清单「id | 名称 (类型)」,调用方按 assetsBrief 兜底)。
 * 保持原 prompt 文字、硬约束(assetId 必来自列表、不编造)与输出 JSON 约定不变,只把上下文占位化。
 *
 * T-025 跨模型健壮性:加 outputSchema(runStructuredNode 绑 generateObject,落空→文本兜底),让用户
 * 默认的 MiniMax 也稳定吐可解析匹配(旧 LlmCompleter + parseJsonArray 自由文本路径 MiniMax 下常吐不出
 * →parseJsonArray 返回 []→任务 cancelled)。**产物是数组,故顶层用对象包一层**(matches 数组)——
 * generateObject 要顶层对象、裸数组在部分 provider 不可靠。字段各给默认值让缺字段也过校验;runner 侧
 * 滤掉缺 assetId 的项(保留"assetId 必须真实"的容错语义)。
 */
export const materialMatchItemSchema = z.object({
  assetId: z.string().default(""),
  role: z.string().default(""),
  reason: z.string().default(""),
});
// 顶层输出契约:一个 matches 数组(顶层对象,非裸数组)。
export const materialMatchSchema = z.object({
  matches: z.array(materialMatchItemSchema).default([]),
});
export type MaterialMatchOutput = z.infer<typeof materialMatchSchema>;

export const MATERIAL_MATCH_TEMPLATE: PromptTemplate = {
  id: "material.match",
  version: "v2",
  outputSchema: materialMatchSchema,
  tools: [],
  system:
    "你是这位创作者的「素材匹配 agent」,从他已有的素材库里挑最合适的真实素材配这条内容。",
  template: `你是这位创作者的「素材匹配 agent」。要为下面这条内容,从他**已有的素材库**里挑出最合适的素材。

【创作者定位】
{{positioning}}

【本条内容主题】
{{topic}}

【可用素材库】(每行: id | 名称 (类型))
{{library}}

【任务】判断素材库里哪些素材适合用在这条内容里,以及怎么用。
【硬约束】assetId **必须**是上面素材库列表里出现过的真实 id,绝对不要编造不存在的 id。素材库为空时返回 {"matches": []}。
【输出】只输出一个 JSON 对象 {"matches": [...]}(不要多余文字、不要代码块包裹),matches 是数组,每条:
{"assetId"(必须来自上面列表的真实 id),"role"(broll空镜/clip片段/cover封面 三选一),"reason"(为什么用它、用在哪里,一句中文)}。`,
  requiredFacets: ["positioning", "library"],
};
