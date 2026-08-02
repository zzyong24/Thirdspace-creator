import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 结构方案 skill 模板(planning.outline)—— 从 planning-outline-runner 的内联 buildOutlinePrompt 提取。
 * 策划阶段(脚本阶段入口票):把内容合同 + 论点树落成一份结构方案(结构类型/开头/段落/结尾/CTA)。
 * facets 由 CreativeContext 映射:
 *   positioning(必需,调用方已兜底)· contract(已确认的内容合同,选填)· thesis(已搭好的论点树,选填)· topic(本期选题,选填)
 * 保持原 prompt 文字与输出 JSON 约定不变,只把上下文占位化。
 *
 * T-025 跨模型健壮性:加 outputSchema(runStructuredNode 绑 generateObject,落空→文本兜底),
 * 让 MiniMax 也稳定吐可解析结构方案(旧自由文本路径 MiniMax 下常吐不出→parseOutline 返回空→cancelled)。
 * 各字段 .default("")/.default([]) 让缺字段也过校验;runner 侧再 trim/滤空段,保留原容错。
 */
export const outlineSchema = z.object({
  structureType: z.string().default(""),
  opening: z.string().default(""),
  sections: z
    .array(
      z.object({
        label: z.string().default(""),
        intent: z.string().default(""),
      }),
    )
    .default([]),
  ending: z.string().default(""),
  cta: z.string().default(""),
}).refine(
  (value) =>
    Boolean(
      value.opening.trim() ||
        value.ending.trim() ||
        value.sections.some((section) => section.label.trim() || section.intent.trim()),
    ),
  { message: "结构方案至少包含开头、结尾或一条段落" },
);
export type OutlineOutput = z.infer<typeof outlineSchema>;

export const PLANNING_OUTLINE_TEMPLATE: PromptTemplate = {
  id: "planning.outline",
  outputRecovery: "creative-partial",
  version: "v2",
  outputSchema: outlineSchema,
  tools: [],
  system: "你是这位创作者的「策划 agent」,负责把内容合同 + 论点树落成结构方案。",
  template: `你是这位创作者的「策划 agent」，负责把内容合同 + 论点树落成一份**结构方案**——这是脚本阶段的入口票。

【创作者定位】
{{positioning}}{{benchmarkRef}}{{contract}}{{thesis}}{{topic}}

【任务】产 **1 个**结构方案，让脚本作者照着就能写：
- 结构类型：这条内容用哪种叙事结构(如 总分总 / 问题-解决 / 故事线 / 清单体)；
- 开头策略：前 3-5 秒怎么开场抓人；
- 段落安排：按顺序列出每个段落/节拍(如 钩子→痛点→价值→卡点)，每段说清楚要完成什么；
- 结尾：怎么收束、留下什么记忆点；
- 行动召唤：结尾 CTA。

【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹)，形如：
{"structureType":"...","opening":"...","sections":[{"label":"钩子","intent":"..."},{"label":"痛点","intent":"..."}],"ending":"...","cta":"..."}`,
  requiredFacets: ["positioning"],
};
