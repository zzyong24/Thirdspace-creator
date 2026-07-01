import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, PositioningSuggestionOutput } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
import { parseJsonLoose } from "@/server/ai/llm/parse";

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
// 跑在 **Vercel AI SDK** 上(弃旧 LlmCompleter):resolveModelSpec 按 capability 解析用户配的
// model,提示词走外置模板 positioning.generate(脊柱-1 模板化解耦)。T-025b:改 runStructuredNode
// (generateObject 绑 positioning.generate 的 outputSchema,落空→文本兜底抽 JSON 再同 schema 校验),
// 让用户默认的 MiniMax-M3 也稳定吐可解析定位提案(旧路径:单发 messages.create + parseSuggestion,
// MiniMax 下常吐不出规整 JSON → parseSuggestion 返回 null → 任务 cancelled,和刚修的 8 个节点同类
// bug)。normalizeSuggestion 复用 clampKeywords/asStrings 保留原容错(keywords 恰好 3 个等)。
//
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
}

export interface PositioningDeps extends ContextDeps {
  ai: AiService;
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export interface PositioningTask {
  id: string;
  inputData: Record<string, unknown>;
}

// 导出供 ChatBox 的 positioning.generate 工具复用(对话里产定位提案候选,与本 runner 同一份
// prompt + parse,不造影子)。chat-runner 用 runAgentNode 拿自由文本再 parseSuggestion。
export function buildPositioningPrompt(context: CreativeContext): string {
  const current = context.positioningBrief
    ? context.positioningBrief
    : "（创作者尚未设置定位——请基于其抖音账号画像与赛道,给出一份从 0 到 1 的定位提案）";
  const accounts = context.accountsBrief
    ? `\n【创作者抖音账号画像】\n${context.accountsBrief}`
    : "\n（创作者尚未连接平台账号——按通用赛道判断即可）";
  return `你是这位创作者的「定位策略 agent」，负责帮 TA 生成/进化一份**账号定位**。

【创作者当前定位】
${current}${accounts}

【任务】像一个专业的 MCN 定位策划那样，结合「当前定位 + 抖音账号画像（粉丝量/赛道）」，产出一份**清晰、差异化、能支撑信任与转化**的定位提案。
- 若已有定位，做**进化**：保留有效内核，补差异化/收窄人群/强化变现锚点；不要推翻重来。
- 若没有定位，做**从 0 到 1**：基于账号画像与赛道给出可立得住的定位。

【输出】只输出一个 JSON 对象（不要多余文字、不要代码块包裹），形如：
{"persona":"人设（一句，TA 在受众心中是谁）",
 "field":"垂直领域/赛道",
 "audience":"目标人群（越具体越好）",
 "differentiation":"差异化（与同赛道竞品的不同）",
 "capabilities":["支撑这个定位的能力1","能力2","能力3"],
 "oneLiner":"一句话定位（放大到首屏的那句，钩子+承诺）",
 "keywords":["关键词1","关键词2","关键词3"]}
keywords 必须正好 3 个。capabilities 给 2-5 个。`;
}

// Assemble the positioning.generate 模板 facets from the CreativeContext (占位化原
// buildPositioningPrompt 的上下文块). current(当前定位)是必需 facet,兜底与原 prompt 一致;
// accounts(抖音账号画像块)选填。
function positioningFacets(
  context: CreativeContext,
): Record<string, string | undefined> {
  return {
    current: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——请基于其抖音账号画像与赛道,给出一份从 0 到 1 的定位提案）",
    accounts: context.accountsBrief
      ? `\n【创作者抖音账号画像】\n${context.accountsBrief}`
      : "\n（创作者尚未连接平台账号——按通用赛道判断即可）",
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
function normalizeSuggestion(
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

// Orchestrate one positioning.generate task end to end. Owns its lifecycle: on any
// failure (LlmCredentialError when no key is configured, unparseable output, etc.) it
// cancels the task (→ a terminal the UI renders as 失败) so it never lingers in `running`.
// Swallows so a background failure never crashes the server.
export async function runPositioningGenerate(
  ctx: RequestContext,
  task: PositioningTask,
  deps: PositioningDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id); // honest status while the LLM works
    // positioning.generate is account-wide (not project-scoped): no topic.
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: "" },
      deps,
    );
    // Vercel AI SDK 路径:按 "positioning.generate" capability 解析 model + 跑 ai-worker 结构化节点
    // (外置 positioning.generate 模板 + outputSchema)。T-025b:runStructuredNode 绑 generateObject,
    // 落空→文本兜底,让用户默认的 MiniMax 也稳定吐可解析定位提案。顶层是对象,取 object 再 normalize。
    const spec = await deps.resolveModelSpec(ctx, "positioning.generate");
    const { modelFor, runStructuredNode, POSITIONING_GENERATE_TEMPLATE } =
      await import("@creatoros/ai-worker");
    const { object } = await runStructuredNode<PositioningSuggestionOutput>({
      model: modelFor(spec),
      template: POSITIONING_GENERATE_TEMPLATE,
      facets: positioningFacets(context),
    });
    const suggestion = normalizeSuggestion(object);
    if (!suggestion) {
      throw new Error(
        "positioning-runner: LLM returned no parseable positioning suggestion",
      );
    }
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "positioning_profile",
      resultData: { suggestion },
    });
  } catch (err) {
    // Best-effort cancel; swallow so a background failure (incl. LlmCredentialError when
    // no LLM key is configured) never crashes the server.
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* task may already be terminal */
    }
    // eslint-disable-next-line no-console
    console.error(
      `[positioning-runner] generate failed for task ${task.id}:`,
      err,
    );
  }
}
