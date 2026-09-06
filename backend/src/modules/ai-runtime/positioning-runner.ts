import type { PositioningSuggestionOutput } from "@creatoros/ai-worker";
import {
  type CreativeContext,
  type PositioningWorksReader,
} from "./creative-context";
import { parseJsonLoose } from "./llm/parse";

// 定位生成 runner (positioning.generate node, 机制③④ — Plan Phase A). The audit's level-1
// gap: the 定位中心 could only *use* positioning, never *generate* one. This runner is
// the source for createdByType:"ai" statements.
//
// On 采纳, the AI service's positioning_profile confirm branch formalizes it into the
// creator's CreatorProfile (upsertProfile) + a new PositioningStatement version
// (createStatementVersion, createdByType:"ai", aiTaskId) — closing the OQ2 loop.
//
// Context the agent reasons against: the creator's CURRENT positioning (so a suggestion
// is an *evolution*, not a from-scratch guess) + their 抖音账号画像 (platform/handle/
// follower count) as material for who they already are on-platform. No web tools.
//
// 账号定位的上下文准备/候选投影由calibration-positioning-business-adapters承接；此处保留Chat共享接口。
// 注:buildPositioningPrompt + parseSuggestion 仍导出且行为不变 —— chat-runner 的 generatePositioning
// 工具(对话面产定位提案候选,走 runAgentNode 拿自由文本)复用它们,不能改签名/语义。

// The structured suggestion the agent returns (writer ↔ confirm contract). Exactly the
// 9-field 定位 shape the 定位中心 reads: 5 profile facets + oneLiner + 3 keywords.
export interface PositioningSuggestion {
  persona: string;
  field: string;
  audience: string;
  differentiation: string;
  capabilities: string[];
  oneLiner: string;
  keywords: string[]; // exactly 3 (clamped at parse)
  // [T-058①] 定位中心富 facets —— 采纳时随 5-facet 一起 upsert(缺则空串,诚实不编)。
  facets: {
    contentScope: string;
    avoid: string;
    corePain: string;
    coreValue: string;
    tone: string;
    statusNote: string;
  };
  // [T-234] 定位硬约束(下游规则)—— 键与 contract creatorProfileDownstreamRules 对齐。
  // 用户访谈里聊到的硬约束经此透传进采纳链(此前 AI 链只产 9 facets,硬约束全被丢);
  // 没聊到的键空串,采纳时只写非空键(合并语义与手动表单一致)。
  downstreamRules: {
    topicRule: string;
    scriptRule: string;
    projectRule: string;
    forbidRule: string;
    expressionRule: string;
  };
}

// [T-081②/T-578] 真实作品读端口(选填):后台 task 路径据此把当前账号可见已发布作品
// 压缩列表注入模板 {{works}} facet，与对话工具路径共用同一 reader + formatWorksBrief。
// 组合根按 ctx.userId/accountId 收窄；未装配/读失败 → 该 facet 空(诚实降级)。
export type WorksReader = PositioningWorksReader;


export interface PositioningTask {
  id: string;
  inputData: Record<string, unknown>;
}

// 导出供 ChatBox 的 positioning.generate 工具复用(对话里产定位提案候选,与本 runner 同一份
// prompt + parse,不造影子)。chat-runner 用 runAgentNode 拿自由文本再 parseSuggestion。
// [T-081] 新增可选第二参(签名 additive,零参调用行为不变):
//   - worksBrief:真实作品画像(全部作品标题压缩列表,chat-runner formatWorksBrief 装配)——
//     让「结合我实际发布的内容重新生成定位」有证据可参考,不依赖模型翻页;
//   - extraBrief:对话中获得的补充指令/洞察,原样注入且**优先级高于既有档案**(修「模型翻完
//     作品得出洞察却无通道传入 → 工具永远复读旧卡」的上下文断裂)。
// 两段空则整段省略(不注空噪声,数据要真)。
export function buildPositioningPrompt(
  context: CreativeContext,
  opts?: { extraBrief?: string; worksBrief?: string },
): string {
  const current = context.positioningBrief
    ? context.positioningBrief
    : "（创作者尚未设置定位——请基于其抖音账号画像与赛道,给出一份从 0 到 1 的定位提案）";
  const accounts = context.accountsBrief
    ? `\n【创作者抖音账号画像】\n${context.accountsBrief}`
    : "\n（创作者尚未连接平台账号——按通用赛道判断即可）";
  const works = opts?.worksBrief?.trim()
    ? `\n\n【历史作品证据（只说明过去发生了什么，不能替用户决定未来）】\n${opts.worksBrief.trim()}`
    : "";
  const extra = opts?.extraBrief?.trim()
    ? `\n\n【本次生成指令（来自对话，优先遵循）】\n${opts.extraBrief.trim()}`
    : "";
  return `你是这位创作者的「定位策略 agent」，负责帮 TA 生成/进化一份**账号定位**。

【创作者当前定位】
${current}${accounts}${works}${extra}

【任务】面向中国内容平台，结合「用户本轮明确意图 + 当前定位 + 账号画像${
    works ? " + 真实作品列表" : ""
  }」${
    extra ? "，并**优先遵循上方本次生成指令**" : ""
  }，产出一份**清晰、差异化、能直接支持选题与写稿**的定位提案。
- optimize：保留被本轮目标和作品共同支持的内核，再补清受众场景、差异化、内容供给与信任来源。
- pivot：旧定位和旧作品只用于识别可迁移能力、可信证明与自然表达，不得延续旧赛道、旧人群或旧商业目标。
- scratch：只能使用本轮用户提供的信息，不读取、不引用、不延续旧定位、账号画像或旧作品。
- 纯人设/个人表达/作品集型账号不强塞产品；只有用户明确有产品/服务或目标包含获客/成交时，才梳理主推产品、核心人群、真实场景、痛点与替代、顾虑、证明和内容承接，并分别落入 audience、facets 与 downstreamRules。
- 用户本轮原话优先于历史资料。资料不足时照样生成可编辑候选，未知项留空或标“待验证”，绝不编造；目标人群要写具体场景和问题，不能只写年龄职业标签。

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
downstreamRules 是**下游硬约束**（选题/写稿/项目节点会把它当铁律执行）：只从创作者**明确聊到/材料里真实存在**的约束提炼（不做什么、表达红线、题材边界、效果要求、变现约束），没聊到的键**留空字符串**，绝不编造、绝不用泛泛套话凑数。`;
}

// Assemble the positioning.generate 模板 facets from the CreativeContext (占位化原
// buildPositioningPrompt 的上下文块). current(当前定位)是必需 facet,兜底与原 prompt 一致;
// accounts(抖音账号画像块)选填。[T-081②] works(真实作品画像块)选填:worksBrief 非空才拼
// 段头(与对话链路 buildPositioningPrompt 同一措辞),空则占位替换为空串、整段省略。
// 导出供单测断言 facets 组装(纯函数)。
export function positioningFacets(
  context: Pick<CreativeContext,"positioningBrief"|"accountsBrief">,
  worksBrief = "",
): Record<string, string | undefined> {
  return {
    current: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——请基于其抖音账号画像与赛道,给出一份从 0 到 1 的定位提案）",
    accounts: context.accountsBrief
      ? `\n【创作者抖音账号画像】\n${context.accountsBrief}`
      : "\n（创作者尚未连接平台账号——按通用赛道判断即可）",
    works: worksBrief.trim()
      ? `\n\n【历史作品证据（只说明过去发生了什么，不能替用户决定未来）】\n${worksBrief.trim()}`
      : "",
  };
}

// Clamp keywords to EXACTLY 3 — the createStatementVersion invariant
// (StatementValidationError when != 3). Drop extras; pad with "" when short so the
// downstream confirm can still surface a usable draft (the user edits before adopting).
function clampKeywords(raw: unknown): string[] {
  const arr = Array.isArray(raw)
    ? raw.filter((k): k is string => typeof k === "string").map((k) => k.trim())
    : [];
  const out = arr.slice(0, 3);
  while (out.length < 3) out.push("");
  return out;
}

function asStrings(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
    : [];
}

// Normalize the schema-validated suggestion object into a PositioningSuggestion (T-025:结构化
// 后拿的是已解析对象,容错逻辑原样保留 —— trim、clampKeywords 夹 3、asStrings 清 capabilities)。
// Returns null when the suggestion is empty (no persona and no oneLiner) — the runner treats
// null as "no usable candidate" and cancels.
export function normalizeSuggestion(
  o: PositioningSuggestionOutput,
): PositioningSuggestion | null {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const suggestion: PositioningSuggestion = {
    persona: str(o.persona),
    field: str(o.field),
    audience: str(o.audience),
    differentiation: str(o.differentiation),
    capabilities: asStrings(o.capabilities),
    oneLiner: str(o.oneLiner),
    keywords: clampKeywords(o.keywords),
    facets: {
      contentScope: str(o.facets?.contentScope),
      avoid: str(o.facets?.avoid),
      corePain: str(o.facets?.corePain),
      coreValue: str(o.facets?.coreValue),
      tone: str(o.facets?.tone),
      // T-521：动态作品数量/发布状态不得回写长期定位。保留字段仅为旧 wire 兼容，
      // 候选一律归一为空，避免用新的静态计数覆盖旧静态计数。
      statusNote: "",
    },
    // [T-234] 硬约束透传(缺则空串,诚实不编)。
    downstreamRules: {
      topicRule: str(o.downstreamRules?.topicRule),
      scriptRule: str(o.downstreamRules?.scriptRule),
      projectRule: str(o.downstreamRules?.projectRule),
      forbidRule: str(o.downstreamRules?.forbidRule),
      expressionRule: str(o.downstreamRules?.expressionRule),
    },
  };
  // A suggestion with neither a persona nor a one-liner is not usable.
  if (!suggestion.persona && !suggestion.oneLiner) return null;
  return suggestion;
}

// Tolerant parse of the agent's final text into a PositioningSuggestion. Returns null
// when nothing parseable OR when the suggestion is empty (no persona and no oneLiner) —
// used by the CHAT path (chat-runner 的 generatePositioning 工具走 runAgentNode 拿自由文本)。
// 结构化 runner 已改走 normalizeSuggestion(拿已校验对象);这里是文本兜底薄壳:宽容抽 JSON 对象
// → 交给同一 normalizeSuggestion(容错单点收口)。
export function parseSuggestion(text: string): PositioningSuggestion | null {
  const parsed = parseJsonLoose(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return normalizeSuggestion(parsed as PositioningSuggestionOutput);
}
