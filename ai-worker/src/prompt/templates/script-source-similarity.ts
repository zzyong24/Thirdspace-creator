import { z } from "zod";
import type { PromptTemplate } from "../template";

export const scriptSourceSimilaritySchema = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string().default(""),
});

export const SCRIPT_SOURCE_SIMILARITY_TEMPLATE: PromptTemplate = {
  id: "script.source_similarity",
  version: "v1",
  outputSchema: scriptSourceSimilaritySchema,
  tools: [],
  system:
    "你是内容原创性审核员，只判断候选稿与来源稿在观点展开、段落顺序、案例和表达上的整体相似程度。",
  template: `【候选稿】
{{candidate}}

【来源逐字稿】
{{sources}}

给出 0-1 相似分。事实、产品名和常见短语相同不能单独判高；如果内容选择、展开顺序和表达方式同时高度相同才接近 1。
只输出 JSON：{"score":0到1,"rationale":"一句话依据"}`,
  requiredFacets: ["candidate", "sources"],
  contextRequirements: [],
};
