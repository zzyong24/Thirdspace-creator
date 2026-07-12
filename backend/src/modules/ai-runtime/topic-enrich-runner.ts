import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, TopicCardOutput } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
import { parseJsonLoose } from "./llm/parse";

// 选题补全 runner (topic.enrich node, 选题中心大改). Takes ONE existing 选题候选 (待评估)
// and fills its 选题卡 — the 10 详情字段 + 3 指标 the 选题卡详情 surface renders. Records a
// `topic_card` CANDIDATE; on 采纳, the AI service's topic_card confirm branch calls
// candidateService.enrichCard to upsert the card onto that candidate.
//
// The result is a card for a SPECIFIC candidate (inputData.candidateId), so the runner reads
// that candidate's title/angle through a narrow injected reader (no cross-module repo import).
// The context it reasons against is the full CreativeContext (定位 + 飞轮 + 受众信号 + 知识库)
// so the card's 素材依据/观众痛点 are grounded in the creator's real situation.
//
// 跑在 **Vercel AI SDK** 上(弃旧 LlmCompleter):resolveModelSpec 按 capability 解析用户配的
// model,提示词走外置模板 topic.enrich(脊柱-1 模板化解耦)。T-025b:改 runStructuredNode
// (generateObject 绑 topic.enrich 的 outputSchema,落空→文本兜底抽 JSON 再同 schema 校验),
// 让用户默认的 MiniMax-M3 也稳定吐可解析选题卡(旧路径:单发 messages.create + parseCard,
// MiniMax 下常吐不出规整 JSON → parseCard 返回 null → 任务 cancelled,和刚修的 8 个节点同类
// bug)。normalizeCard 复用 str/strArr/score/difficulty 保留原容错。
//
// 注:buildEnrichPrompt + parseCard 仍导出且行为不变 —— chat-runner 的 enrichTopic 工具(对话面
// 产选题卡候选,走 runAgentNode 拿自由文本)复用它们,不能改签名/语义。

// The 选题卡 the agent returns (writer ↔ confirm contract). Exactly the contract
// candidateCard shape: 10 详情字段 + 3 指标. All optional — the confirm seam cleans it.
export interface TopicCard {
  oneLiner: string;
  targetAudience: string;
  audiencePain: string;
  coreConflict: string;
  hook: string;
  contentStructure: string[];
  format: string;
  materialBasis: string;
  riskNote: string;
  proposal: string;
  audiencePainScore: number | null;
  materialScore: number | null;
  productionDifficulty: "low" | "mid" | "high" | null;
}

// Narrow read port — the candidate's title/angle the runner enriches. Bound at the
// composition root to candidateService.getCandidate (ownership-gated). No cross-module
// repo import (mirrors the positioning/learnings readers).
export interface CandidateReader {
  get(
    ctx: RequestContext,
    candidateId: string,
  ): Promise<{ title: string; angle: string }>;
}

export interface TopicEnrichDeps extends ContextDeps {
  ai: AiService;
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
  candidate: CandidateReader;
}

export interface TopicEnrichTask {
  id: string;
  inputData: Record<string, unknown>;
}

// Exported so the in-chat `topic.enrich` tool (T-004 ChatBox) reuses the EXACT enrich
// prompt + parseCard rather than forking a second prompt. The tool produces the same
// 选题卡 candidate shape (no entity write); 采纳 still goes through the confirm gate.
// chat-runner 用 runAgentNode 拿自由文本再 parseCard。
export function buildEnrichPrompt(
  context: CreativeContext,
  subject: { title: string; angle: string },
  // [T-269] 可溯硬约束段(下沉自对话外层 honesty rule #9,单一真值 grounding-facets.ANTI_FABRICATION_CLAUSE)。
  // 对话 enrich 走 runAgentNode 自由文本(与结构化 runner 走模板不同路),故这条自由文本 prompt 也须
  // 带同款反编造约束——治「materialBasis 凭空称能依托某资料」的编造敞口。调用方(chat-runner)传入常量;
  // 缺省(旧调用/单测不传)→ 不注(向后兼容)。
  antiFabrication?: string,
): string {
  const positioning = context.positioningBrief
    ? context.positioningBrief
    : "（创作者尚未设置定位——按通用爆款逻辑补全）";
  const learnings = context.learningsBrief
    ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
    : "";
  const signals = context.signalsBrief
    ? `\n【受众信号(评论/咨询)】\n${context.signalsBrief}`
    : "";
  const knowledge = context.knowledgeBrief
    ? `\n【可依托的知识库资料】\n${context.knowledgeBrief}`
    : "";
  const antiFab = antiFabrication ? `\n${antiFabrication}` : "";
  return `你是这位创作者的「选题策划 agent」。下面是一条**待补全的选题**,请把它扩展成一张完整的**选题卡**。

【创作者定位】
${positioning}${learnings}${signals}${knowledge}

【待补全选题】
标题:${subject.title}
切入角度:${subject.angle || "（未给出,请你补一个最锋利的角度)"}

【任务】像一个专业自媒体主编那样,把这条选题想透——观众是谁、痛在哪、核心冲突、怎么开头钩住、内容怎么排、用什么形式、有没有素材、风险在哪、要不要立项。指标只给你有把握的,拿不准就给 null(别编)。${antiFab}
特别地:materialBasis(素材依据)只能写**真实存在**的资料/经历,绝不凭空声称「能依托某资料」;没有可依托素材就如实写「暂无现成素材,需搜集」。

【输出】只输出一个 JSON 对象(不要多余文字、不要代码块包裹),形如:
{"oneLiner":"一句话选题(把这条选题浓缩成一句)",
 "targetAudience":"目标观众(越具体越好)",
 "audiencePain":"观众痛点(他们真正卡在哪)",
 "coreConflict":"核心冲突(反常识/反直觉的张力)",
 "hook":"推荐开头 Hook(前 3 秒说什么)",
 "contentStructure":["内容结构第1段","第2段","第3段"],
 "format":"适合形式(口播/采访/剧情/图文…)",
 "materialBasis":"素材依据(能依托哪些现成资料/经历)",
 "riskNote":"风险点(可能翻车/敏感/同质化的地方)",
 "proposal":"立项建议(做/不做/怎么调整,一句)",
 "audiencePainScore":受众痛感分 0-100 或 null,
 "materialScore":素材充足分 0-100 或 null,
 "productionDifficulty":"low|mid|high 或 null"}`;
}

// 把 CreativeContext + subject 映射成 topic.enrich 模板的 facets(占位化原 buildEnrichPrompt 的
// 上下文块）。positioning/title/angle 是必需 facet,angle 沿用原 prompt 的兜底文案。
function enrichFacets(
  context: CreativeContext,
  subject: { title: string; angle: string },
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——按通用爆款逻辑补全）",
    learnings: context.learningsBrief
      ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
      : "",
    signals: context.signalsBrief
      ? `\n【受众信号(评论/咨询)】\n${context.signalsBrief}`
      : "",
    knowledge: context.knowledgeBrief
      ? `\n【可依托的知识库资料】\n${context.knowledgeBrief}`
      : "",
    title: subject.title,
    angle: subject.angle || "（未给出,请你补一个最锋利的角度)",
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function strArr(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)
    : [];
}
function score(v: unknown): number | null {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  if (v < 0 || v > 100) return null;
  return Math.round(v);
}
function difficulty(v: unknown): "low" | "mid" | "high" | null {
  return v === "low" || v === "mid" || v === "high" ? v : null;
}

// Normalize the schema-validated card object into a TopicCard (T-025:结构化后拿的是已解析对象,
// 容错逻辑原样保留 —— trim、score 夹 0-100、difficulty 枚举归一)。Returns null when the card is
// empty (no oneLiner and no audiencePain) — the runner treats null as "no usable card" and cancels.
function normalizeCard(o: TopicCardOutput): TopicCard | null {
  const card: TopicCard = {
    oneLiner: str(o.oneLiner),
    targetAudience: str(o.targetAudience),
    audiencePain: str(o.audiencePain),
    coreConflict: str(o.coreConflict),
    hook: str(o.hook),
    contentStructure: strArr(o.contentStructure),
    format: str(o.format),
    materialBasis: str(o.materialBasis),
    riskNote: str(o.riskNote),
    proposal: str(o.proposal),
    audiencePainScore: score(o.audiencePainScore),
    materialScore: score(o.materialScore),
    productionDifficulty: difficulty(o.productionDifficulty),
  };
  if (!card.oneLiner && !card.audiencePain) return null;
  return card;
}

// Tolerant parse of the agent's final text into a TopicCard — used by the CHAT path
// (chat-runner 的 enrichTopic 工具走 runAgentNode 拿自由文本)。结构化 runner 已改走 normalizeCard
// (拿已校验对象);这里是文本兜底薄壳:宽容抽 JSON 对象 → 交给同一 normalizeCard(容错单点收口)。
export function parseCard(text: string): TopicCard | null {
  const parsed = parseJsonLoose(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return normalizeCard(parsed as TopicCardOutput);
}

// Orchestrate one topic.enrich task end to end. Owns its lifecycle: on any failure
// (missing candidateId, unparseable output, LlmCredentialError when no key is configured)
// it cancels the task (→ a terminal the UI renders as 失败) so it never lingers in
// `running`. Swallows so a background failure never crashes the server.
export async function runTopicEnrich(
  ctx: RequestContext,
  task: TopicEnrichTask,
  deps: TopicEnrichDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id); // honest status while the LLM works
    const candidateId =
      typeof task.inputData.candidateId === "string"
        ? task.inputData.candidateId
        : "";
    if (!candidateId) {
      throw new Error("topic-enrich-runner: inputData.candidateId is required");
    }
    // Read the candidate's title/angle (ownership-gated through the candidate service).
    const subject = await deps.candidate.get(ctx, candidateId);
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: subject.title, angle: subject.angle },
      deps,
    );
    // Vercel AI SDK 路径:按 "topic.enrich" capability 解析 model + 跑 ai-worker 结构化节点(外置
    // topic.enrich 模板 + outputSchema)。T-025b:runStructuredNode 绑 generateObject,落空→文本
    // 兜底,让用户默认的 MiniMax 也稳定吐可解析选题卡。顶层是对象,取 object 再 normalize。
    const spec = await deps.resolveModelSpec(ctx, "topic.enrich");
    // T-040b:运行时 getTemplate 取被服务端覆盖后的 REGISTRY 对象(而非编译期 import 快照),
    // 让 topic.enrich 的 system/template/tools 也能吃到 skill_config_overrides 覆盖。
    const { modelFor, runStructuredNode, getTemplate } =
      await import("@creatoros/ai-worker");
    const { object } = await runStructuredNode<TopicCardOutput>({
      model: modelFor(spec),
      template: getTemplate("topic.enrich"),
      facets: enrichFacets(context, subject),
    });
    const card = normalizeCard(object);
    if (!card) {
      throw new Error("topic-enrich-runner: LLM returned no parseable 选题卡");
    }
    // Record the card candidate; 采纳 → enrichCard(candidateId, card) via the
    // topic_card confirm branch. Carry candidateId so confirm knows the target.
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "topic_card",
      resultData: { candidateId, card },
    });
  } catch (err) {
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* task may already be terminal */
    }
    // eslint-disable-next-line no-console
    console.error(`[topic-enrich-runner] enrich failed for task ${task.id}:`, err);
  }
}
