import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 定位生成 skill 模板(positioning.generate)—— 从 positioning-runner 的内联 buildPositioningPrompt
 * 提取而来。结合「当前定位 + 抖音账号画像」产一份结构化定位提案(5 profile facets + oneLiner + 3 关键词)。
 * facets 由 CreativeContext 映射:
 *   current(必需:创作者当前定位简报,调用方已默认兜底)· accounts(选填:抖音账号画像块,调用方按 accountsBrief 计算)·
 *   works([T-081②] 选填:真实作品画像块 —— 全部作品标题压缩列表,调用方经 formatWorksBrief 拼
 *   【历史作品证据】整块传入;空则占位替换为空串、整段省略。与 ChatBox 对话链路
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
  // [T-234] 定位硬约束(downstreamRules)—— 键与 contract creatorProfileDownstreamRules
  // 一字不差(topicRule/scriptRule/projectRule/forbidRule/expressionRule)。用户在访谈里聊到
  // 的硬约束(不做什么/表达红线/题材边界/效果要求/变现约束)经此字段随提案产出;没聊到的
  // 键留空串(诚实不编造),采纳链只透传非空键。可选 + 全默认空:老模型输出缺字段也过校验。
  downstreamRules: z
    .object({
      topicRule: z.string().default(""),
      scriptRule: z.string().default(""),
      projectRule: z.string().default(""),
      forbidRule: z.string().default(""),
      expressionRule: z.string().default(""),
    })
    .default({
      topicRule: "",
      scriptRule: "",
      projectRule: "",
      forbidRule: "",
      expressionRule: "",
    }),
}).refine(
  (value) => Boolean(value.oneLiner.trim() || value.persona.trim() || value.field.trim()),
  { message: "定位建议至少包含一句话定位、人设或领域" },
);
export type PositioningSuggestionOutput = z.infer<
  typeof positioningSuggestionSchema
>;

export const POSITIONING_GENERATE_TEMPLATE: PromptTemplate = {
  id: "positioning.generate",
  outputRecovery: "creative-partial",
  version: "v3",
  outputSchema: positioningSuggestionSchema,
  tools: [],
  system:
    "你是面向中国内容平台的定位策略 agent。你同时服务纯人设/个人表达型账号与有产品或服务的经营型账号；历史作品是证据而不是裁判，用户本轮明确意图优先。信息不全也先给可编辑候选，缺口留空或标待验证，绝不编造。",
  template: `你是这位创作者的「定位策略 agent」，负责帮 TA 生成/进化一份**账号定位**。

【创作者当前定位】
{{current}}{{accounts}}{{works}}

【任务】结合用户本轮明确意图、当前定位和可用作品证据，产出一份**清晰、差异化、可以直接支持选题与写稿**的定位提案。
- 若本次生成指令声明“完全从零开始”，调用方已物理排除旧定位、账号画像和旧作品；只能以本次前采与用户选定方向为依据，不得猜测或延续旧方向。
- 若本次是“基于当前账号继续深入”，保留被本轮目标和作品共同支持的有效内核，再补清受众场景、差异化、内容供给和信任来源。
- 若本次是“调整方向”，旧定位与旧作品只用于识别可迁移能力、可信证明和自然表达，不得把旧赛道、旧人群或旧商业目标继续当成硬约束。
- 若没有定位或资料很少，基于用户已经说清的目标先给一版；未知字段允许为空或写“待验证”，不能为了填满 JSON 编故事。
- **通版分流**：纯人设/个人表达/作品集型账号围绕人物、受众场景、可持续内容和表达形成定位，不强塞产品、购买顾虑或成交话术；只有用户明确有产品/服务，或目标包含获客/成交时，才把主推产品、核心人群、真实使用场景、痛点与现有替代、购买顾虑、信任证明和内容承接分别落入 audience、facets 与 downstreamRules。目标人群必须是“什么人在什么场景下遇到什么问题”，不能只写年龄职业标签。
- 用户本轮原话与明确选择优先于历史资料；历史作品可以佐证或暴露冲突，不能替用户决定未来。

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
  "statusNote":""},
 "downstreamRules":{"topicRule":"选题规则（什么选题该做/不该做，含题材边界）",
  "scriptRule":"写稿规则（结构/钩子/表达约束，含效果要求）",
  "projectRule":"项目规则（立项/节奏约束，含变现约束）",
  "forbidRule":"禁止事项（绝对红线/绝不做什么）",
  "expressionRule":"表达风格规则（统一语气的硬约束/表达红线）"}}
keywords 必须正好 3 个。capabilities 给 2-5 个。facets 的五项稳定定位要填；
statusNote 是已停用的旧兼容字段，必须返回空字符串，作品数量、发布状态、项目阶段等动态事实不得写入定位。
downstreamRules 是**下游硬约束**（选题/写稿/项目节点会把它当铁律执行）：只从创作者**明确聊到/材料里真实存在**的约束提炼（不做什么、表达红线、题材边界、效果要求、变现约束），没聊到的键**留空字符串**，绝不编造、绝不用泛泛套话凑数。`,
  requiredFacets: ["current"],
};
