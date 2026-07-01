import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 内容合同 skill 模板(planning.contract)—— 从 planning-contract-runner 的内联 buildContractPrompt 提取。
 * 策划阶段:从四个固定角度(受众定位/价值主张/核心节奏/行动召唤)写清这条内容对观众的承诺。
 * facets 由 CreativeContext 映射:
 *   positioning(必需,调用方已兜底)· learnings(选填)· thesis(已搭好的论点树,选填)· topic(本期选题,选填)
 * 保持原 prompt 文字与输出 JSON 约定不变,只把上下文占位化。
 *
 * T-025 跨模型健壮性:加 outputSchema(runStructuredNode 绑 generateObject,落空→文本兜底),
 * 让 MiniMax 也稳定吐可解析合同。输出是"标题/ id 为键、承诺为值"的对象,故 schema 用
 * `z.record(string→string)`(宽容任意键);runner 侧 pickBody 按四个固定角度的 title/id 取值,保留原容错。
 */
export const contractSchema = z.record(z.string(), z.string());
export type ContractOutput = z.infer<typeof contractSchema>;

export const PLANNING_CONTRACT_TEMPLATE: PromptTemplate = {
  id: "planning.contract",
  version: "v2",
  outputSchema: contractSchema,
  tools: [],
  system: "你是这位创作者的「策划 agent」,负责为一期内容产一份内容合同。",
  template: `你是这位创作者的「策划 agent」，负责为一期内容产一份**内容合同**——也就是这条内容与观众立下的契约。

【创作者定位】
{{positioning}}{{learnings}}{{thesis}}{{topic}}

【任务】基于定位(+论点树+选题)，从四个固定角度写清楚这条内容对观众的承诺：
- 受众定位：目标人群是谁、他们的痛点与触发场景；
- 价值主张：这条内容承诺的独特价值与差异化收益；
- 核心节奏：开场 15 秒怎么抓人、幕间过渡、高潮节点的节奏安排；
- 行动召唤：结尾的 CTA 文案与转化路径。
每个角度写 1-3 句具体、可执行的承诺，别空泛。

【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹)，形如：
{"受众定位":"...","价值主张":"...","核心节奏":"...","行动召唤":"..."}`,
  requiredFacets: ["positioning"],
};
