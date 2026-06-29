import type { PromptTemplate } from "../template";

/**
 * 选题会 skill 模板(topic.generate)。从 topic-node 的内联 prompt 提取而来 —— 证明"提示词模板化解耦"。
 * facets:positioning(创作者定位简报,调用方已默认兜底)、basisHint(出题依据提示,调用方按 basis 计算)。
 */
export const TOPIC_GENERATE_TEMPLATE: PromptTemplate = {
  id: "topic.generate",
  version: "v1",
  system:
    "你是这位创作者的「选题会 agent」,像专业自媒体编导那样按依据产高潜力选题。",
  template: `【创作者定位】
{{positioning}}

【出题依据】{{basisHint}}

【任务】产 6-8 条高潜力选题。每条按 钩子强度/定位契合/变现潜力 衡量。
【输出】只输出一个 JSON 数组,每条:{"title","angle"(切入一句),"contentRole"(traffic|trust|conversion),"source"(trend|benchmark|demand),"predictedScore"(0-100),"reason"(一句中文)}。不要多余文字、不要代码块包裹。`,
  requiredFacets: ["positioning", "basisHint"],
};
