import type { RequestContext } from "@creatoros/contract";
import { reviewInsightsSchema, type ReviewInsightsOutput } from "@creatoros/ai-worker";
import type { RecordCandidateInput } from "../ai/ai.service";
import { assembleCreativeContext, type ContextDeps, type CreativeContext } from "./creative-context";
export interface LearningItem { title: string; insight: string; source?: string; applicability?: string }
export interface ReviewTask { id: string; projectId: string | null; inputData: Record<string, unknown> }
// 把 CreativeContext 映射成 review.insights 模板的 facets(占位化原 buildReviewPrompt 的上下文块）。
// subject(本次复盘对象)是必需 facet。
// T-039a:复盘要「就这一条作品」提炼经验而非账号级泛论 —— subject 优先用作品真标题(reviewTitle),
// 并把本作品的真文案/数据/评论各拼成一个整块注入。缺稿或缺指标明确标注证据边界，
// 三个块与 subject 真标题一起让模型只依据实际材料分析。
// `overrideSubject`:chat 路径模型可能显式传了 subject(用户在对话里指定的复盘对象),优先于 reviewTitle。
// [T-081①] `extraBrief`(选填第三参,签名 additive):对话中获得的补充指令/洞察,注入模板
// {{extraBrief}} 占位(优先级高于既有档案);空则整段省略,后台 task 路径不传、行为不变。
export function reviewFacets(
  context: CreativeContext,
  overrideSubject?: string,
  extraBrief?: string,
): Record<string, string | undefined> {
  // subject 真值优先级:对话里显式指定 > 作品真标题 > 旧 topic.title > 账号级兜底。
  const subject =
    overrideSubject?.trim() ||
    context.reviewTitle?.trim() ||
    context.topic.title?.trim() ||
    "";
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（未设置定位——按通用内容方法论提炼）",
    priorLearnings: context.learningsBrief
      ? `\n【已有经验(避免重复)】\n${context.learningsBrief}`
      : "",
    subject: subject
      ? subject
      : "（未指定具体内容,按这个账号的整体表现提炼)",
    // 有内容传真实材料；缺稿或缺指标时明确限制可分析范围。
    reviewScriptBlock: context.reviewScript
      ? `\n【本次复盘作品·文案】\n${context.reviewScript}\n`
      : "\n【本次复盘作品·文案】未取得真实稿件，不能评价具体开头台词、段落或叙事结构。\n",
    reviewMetricsBlock: context.reviewMetrics
      ? `\n【本次复盘作品·真实数据】${context.reviewMetrics}\n`
      : "\n【本次复盘作品·真实数据】未取得发布指标，不能归因传播或成交效果。\n",
    reviewCommentsBlock: context.reviewComments
      ? `\n【本次复盘作品·观众评论】\n${context.reviewComments}\n`
      : "",
    // [T-081①] 对话洞察/补充指令(模板 {{extraBrief}} 占位,空则整段省略)。
    extraBrief: extraBrief?.trim()
      ? `\n【本次生成指令(来自对话,优先遵循)】\n${extraBrief.trim()}\n`
      : "",
  };
}

// 导出 facets 映射 + parse 供 ChatBox 的 review.analyze 工具复用(对话里产经验候选,与本 runner
// 同一份模板 + parse + 同一份真数据注入,不造影子)。


// Normalize the schema-validated learnings array into reusable learnings (T-025:结构化后拿的是
// 已解析对象,归一逻辑原样保留 —— trim、滤掉缺 title 的项)。
export function normalizeLearnings(
  learnings: ReviewInsightsOutput["learnings"],
): LearningItem[] {
  return (learnings ?? [])
    .map((o): LearningItem | null => {
      const title = (o.title ?? "").trim();
      if (!title) return null;
      return { title, insight: o.insight ?? "", ...(o.source ? {source:o.source} : {}), ...(o.applicability ? {applicability:o.applicability} : {}) };
    })
    .filter((l): l is LearningItem => l !== null);
}


/** 只检查真实证据是否存在，不评判内容质量；聊天和持久复盘共享同一门。 */
export function assertReviewEvidence(context: Pick<CreativeContext,"reviewScript"|"reviewMetrics"|"reviewComments">): void {
  if (![context.reviewScript,context.reviewMetrics,context.reviewComments].some(value=>value.trim()))
    throw new Error("review-runner: missing current-project evidence；没有真实逐字稿、指标或评论，请同步本作品资料");
}

export async function prepareReviewContext(ctx: RequestContext, task: Pick<ReviewTask,"projectId"|"inputData">, deps: ContextDeps): Promise<Record<string, string | undefined>> {
  const topic = typeof task.inputData.topic === "string" ? task.inputData.topic : "";
  const context = await assembleCreativeContext(ctx, { projectId: task.projectId, topic }, deps);
  assertReviewEvidence(context);
  return reviewFacets(context);
}
export function projectReviewCandidate(_inputData: Record<string, unknown>, object: unknown): RecordCandidateInput {
  const parsed = reviewInsightsSchema.parse(object);
  const items = normalizeLearnings(parsed.learnings);
  const {learnings: _, ...report} = parsed;
  return { resultType: "learning_list", resultData: { items, ...report } };
}
