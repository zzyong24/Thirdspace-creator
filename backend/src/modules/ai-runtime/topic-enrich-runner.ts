import type { RequestContext } from "@creatoros/contract";
import type { TopicCardOutput } from "@creatoros/ai-worker";
import {
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
// 后台执行由统一 Worker 承接；本文件只保留选题卡共享提示和归一函数。
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
  // [T-371] 本轮联网核实到的真实事实/来源(对话先搜后卡顺序门:模型先 material.gather/web.read
  // 再 enrich,核实结果经 verifiedBrief 进素材依据段)。缺省 → 素材依据段走「未联网核实」诚实门,
  // 禁止「待联网拉取/暂无素材需搜集」这类伪承诺占位。
  verifiedBrief?: string,
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
  // [T-371] 联网核实素材段 + 素材依据段的诚实门(有核实素材 → 据实引用来源;没有 → 如实标注
  // 「未联网核实」,禁止占位承诺冒充产出)。
  const verified = verifiedBrief
    ? `\n【本轮联网核实素材(来自对话检索,据实引用)】\n${verifiedBrief}`
    : "";
  const materialRule = verifiedBrief
    ? "特别地:materialBasis(素材依据)必须**据实引用**上方【本轮联网核实素材】里的事实与来源(可再加其他真实存在的资料/经历),绝不凭空声称「能依托某资料」,也绝不写「待联网拉取/暂无素材需搜集」这类占位承诺。"
    : "特别地:materialBasis(素材依据)只能写**真实存在**的资料/经历,绝不凭空声称「能依托某资料」;本轮**未联网核实**,没有可依托素材时就如实写「未联网核实,以下基于模型已有认知」——**禁止**写「待联网拉取/暂无素材,需搜集补充」这类伪承诺占位(那是拿承诺冒充产出)。";
  return `你是这位创作者的「选题策划 agent」。下面是一条**待补全的选题**,请把它扩展成一张完整的**选题卡**。

【创作者定位】
${positioning}${learnings}${signals}${knowledge}${verified}

【待补全选题】
标题:${subject.title}
切入角度:${subject.angle || "（未给出,请你补一个最锋利的角度)"}

【任务】像一个专业自媒体主编那样,把这条选题想透——观众是谁、痛在哪、核心冲突、怎么开头钩住、内容怎么排、用什么形式、有没有素材、风险在哪、要不要立项。指标只给你有把握的,拿不准就给 null(别编)。${antiFab}
${materialRule}

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
export function enrichFacets(
  context: Pick<CreativeContext,"positioningBrief"|"learningsBrief"|"signalsBrief"|"knowledgeBrief">,
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
export function normalizeCard(o: TopicCardOutput): TopicCard | null {
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
