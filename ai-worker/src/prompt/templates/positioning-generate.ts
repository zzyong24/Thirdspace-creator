import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 定位生成 skill 模板(positioning.generate)—— 从 positioning-runner 的内联 buildPositioningPrompt
 * 提取而来。结合「当前定位 + 抖音账号画像」产一份结构化定位提案(5 profile facets + oneLiner + 3 关键词)。
 * facets 由 CreativeContext 映射:
 *   current(必需:创作者当前定位简报,调用方已默认兜底)· accounts(选填:抖音账号画像块,调用方按 accountsBrief 计算)·
 *   works([T-081②] 选填:真实作品画像块 —— 全部作品标题压缩列表,调用方经 formatWorksBrief 拼
 *   【我的真实作品(定位必须扎根于此)】整块传入;空则占位替换为空串、整段省略。与 ChatBox 对话链路
 *   buildPositioningPrompt 的注入段同一措辞,两条定位生成路径口径一致。requiredFacets 不加 works,
 *   保持选填,老调用路径不崩)。
 * 保持原 prompt 文字与输出 JSON 约定不变,只把上下文占位化。
 *
 * T-025 跨模型健壮性:加 outputSchema(runStructuredNode 绑 generateObject,落空→文本兜底),让用户
 * 默认的 MiniMax 也稳定吐可解析定位提案(旧 LlmCompleter + parseSuggestion 自由文本路径 MiniMax 下常
 * 吐不出→parseSuggestion 返回 null→任务 cancelled)。**顶层是对象**(9 字段的定位提案本就是对象,天然
 * 满足 generateObject 要顶层对象)。字段各给默认值让缺字段也过校验;runner 侧 clampKeywords / asStrings
 * 再夹取归一(keywords 恰好 3 个),保留原容错。
 */
export const positioningSuggestionSchema = z.object({
  persona: z.string().default(""),
  field: z.string().default(""),
  audience: z.string().default(""),
  differentiation: z.string().default(""),
  capabilities: z.array(z.string()).default([]),
  oneLiner: z.string().default(""),
  keywords: z.array(z.string()).default([]),
  // [T-058①] 定位中心的富 facets(内容范围/不做什么/核心痛点/核心价值/表达风格/当前状态)。
  // 采纳时随 5-facet 一起 upsert —— 否则用户在对话里看到的完整母版落库即丢一半。
  facets: z
    .object({
      contentScope: z.string().default(""),
      avoid: z.string().default(""),
      corePain: z.string().default(""),
      coreValue: z.string().default(""),
      tone: z.string().default(""),
      statusNote: z.string().default(""),
    })
    .default({
      contentScope: "",
      avoid: "",
      corePain: "",
      coreValue: "",
      tone: "",
      statusNote: "",
    }),
});
export type PositioningSuggestionOutput = z.infer<
  typeof positioningSuggestionSchema
>;

export const POSITIONING_GENERATE_TEMPLATE: PromptTemplate = {
  id: "positioning.generate",
  version: "v2",
  outputSchema: positioningSuggestionSchema,
  tools: [],
  system:
    "你是这位创作者的「定位策略 agent」,像专业 MCN 定位策划那样帮 TA 生成/进化一份账号定位。",
  template: `你是这位创作者的「定位策略 agent」，负责帮 TA 生成/进化一份**账号定位**。

【创作者当前定位】
{{current}}{{accounts}}{{works}}

【任务】像一个专业的 MCN 定位策划那样，结合「当前定位 + 抖音账号画像（粉丝量/赛道）+ 真实作品列表（若有）」，产出一份**清晰、差异化、能支撑信任与转化**的定位提案。
- 若已有定位，做**进化**：保留有效内核，补差异化/收窄人群/强化变现锚点；不要推翻重来。
- 若没有定位，做**从 0 到 1**：基于账号画像与赛道给出可立得住的定位。

【输出】只输出一个 JSON 对象（不要多余文字、不要代码块包裹），形如：
{"persona":"人设（一句，TA 在受众心中是谁）",
 "field":"垂直领域/赛道",
 "audience":"目标人群（越具体越好）",
 "differentiation":"差异化（与同赛道竞品的不同）",
 "capabilities":["支撑这个定位的能力1","能力2","能力3"],
 "oneLiner":"一句话定位（放大到首屏的那句，钩子+承诺）",
 "keywords":["关键词1","关键词2","关键词3"],
 "facets":{"contentScope":"内容范围（会讲什么/选题边界）",
  "avoid":"不做什么（明确排除，2-4 条并成一句）",
  "corePain":"核心痛点（受众最痛的问题）",
  "coreValue":"核心价值（给受众的根本回报）",
  "tone":"表达风格（语气/调性）",
  "statusNote":"当前状态（账号此刻所处阶段）"}}
keywords 必须正好 3 个。capabilities 给 2-5 个。facets 六项都要填,不许留空。`,
  requiredFacets: ["current"],
};
