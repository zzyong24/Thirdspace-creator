import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@/server/modules/ai";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
import { parseJsonLoose } from "@/server/ai/llm/parse";
import type {
  LlmCompleteOptions,
  LlmCompleter,
} from "@/server/ai/llm/provider";

// 选题补全 runner (topic.enrich node, 选题中心大改). Takes ONE existing 选题候选 (待评估)
// and fills its 选题卡 — the 10 详情字段 + 3 指标 the 选题卡详情 surface renders. Records a
// `topic_card` CANDIDATE; on 采纳, the AI service's topic_card confirm branch calls
// candidateService.enrichCard to upsert the card onto that candidate.
//
// Mirrors positioning-runner (deps.llm → real configurable LLM) but the result is a card
// for a SPECIFIC candidate (inputData.candidateId), so the runner reads that candidate's
// title/angle through a narrow injected reader (no cross-module repo import). The context
// it reasons against is the full CreativeContext (定位 + 飞轮 + 受众信号 + 知识库) so the
// card's 素材依据/观众痛点 are grounded in the creator's real situation.

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
  llm: LlmCompleter;
  candidate: CandidateReader;
}

type Complete = (
  prompt: string,
  opts?: LlmCompleteOptions,
) => Promise<{ text: string }>;

export interface TopicEnrichTask {
  id: string;
  inputData: Record<string, unknown>;
}

function buildEnrichPrompt(
  context: CreativeContext,
  subject: { title: string; angle: string },
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
  return `你是这位创作者的「选题策划 agent」。下面是一条**待补全的选题**,请把它扩展成一张完整的**选题卡**。

【创作者定位】
${positioning}${learnings}${signals}${knowledge}

【待补全选题】
标题:${subject.title}
切入角度:${subject.angle || "（未给出,请你补一个最锋利的角度)"}

【任务】像一个专业自媒体主编那样,把这条选题想透——观众是谁、痛在哪、核心冲突、怎么开头钩住、内容怎么排、用什么形式、有没有素材、风险在哪、要不要立项。指标只给你有把握的,拿不准就给 null(别编)。

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

// Tolerant parse of the agent's final text into a TopicCard. Returns null when nothing
// parseable OR when the card is empty (no oneLiner and no audiencePain) — the runner
// treats null as "no usable card" and cancels.
export function parseCard(text: string): TopicCard | null {
  const parsed = parseJsonLoose(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
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

async function generateCard(
  context: CreativeContext,
  subject: { title: string; angle: string },
  complete: Complete,
): Promise<TopicCard | null> {
  const { text } = await complete(buildEnrichPrompt(context, subject), {
    schema: true,
  });
  return parseCard(text);
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
    const card = await generateCard(context, subject, (prompt, opts) =>
      deps.llm(ctx, "topic.enrich", prompt, opts),
    );
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
