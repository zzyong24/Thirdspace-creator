import type {KnowledgeGenerationPort} from "./knowledge-generation.types";
import type { RequestContext } from "@creatoros/contract";
import type { KnowledgeClassifyOutput } from "@creatoros/ai-worker";

// 知识倾倒场归类 runner(knowledge.classify,T-062c SPEC §4)—— 用户往 /knowledge 倒入原文,
// 本 runner 等待受控 Worker 的原任务候选,产 `{ knowledgeType, title, tags, summary }` 归类候选,
// 由 /api/knowledge/classify 路由返回给前端渲**确认门卡片**(type/title 可改,人点「存入
// 知识库」才 knowledge.create 物化 —— AI 只产候选铁律)。
//
// 一环,同步请求/响应;**失败直接抛错**,调用方(API 路由 → 倾倒场)显示内联错误,原始输入
// 保留供重试或手动补录 [gate-F2],绝不静默兜底。
//
// Tier 1→2→3),自由 capability 天然可用。

export interface KnowledgeClassifyDeps {
  runKnowledgeGeneration: KnowledgeGenerationPort;
}

/** 归一后的归类候选 —— 确认门卡片的渲染形状(= knowledge.create 的 type/title 预填)。 */
export interface KnowledgeClassification {
  knowledgeType: "note" | "reference" | "inspiration" | "snippet" | "transcript";
  title: string;
  tags: string[];
  summary: string;
}

// 原文截断上限(字符)—— 倾倒场可能整篇逐字稿倒进来,截断防 prompt 爆(归类只需要开头
// 就能判型;存库仍存全文,截断只影响送模型的 facet)。
// [T-431] 归类判型主要看开头,但吃全文能提升 summary 质量;1M 上下文下放宽,只挡病态输入。
export const MAX_CLASSIFY_CONTENT_CHARS = 40_000;

/** 截断送模型的原文 facet(超限截断 + 标注,让模型知道后面还有)。 */
export function truncateForClassify(raw: string): string {
  const text = raw.trim();
  if (text.length <= MAX_CLASSIFY_CONTENT_CHARS) return text;
  return `${text.slice(0, MAX_CLASSIFY_CONTENT_CHARS)}\n…(原文过长已截断,以上为开头部分)`;
}

/**
 * 把 schema 校验过的输出归一成确认门卡片形状:trim、tags 去重截 5、summary 截 100。
 * title 空 = 模型没产出可用归类 → 返回 null(调用方抛错,诚实失败,不编标题)。
 */
export function normalizeClassification(
  o: KnowledgeClassifyOutput,
): KnowledgeClassification | null {
  const title = o.title.trim().slice(0, 60);
  if (!title) return null;
  const tags = Array.from(
    new Set(o.tags.map((t) => t.trim()).filter(Boolean)),
  ).slice(0, 5);
  return {
    knowledgeType: o.knowledgeType,
    title,
    tags,
    summary: o.summary.trim().slice(0, 100),
  };
}

/** 由原任务端口执行归类，保持确认门响应与用户采纳方式。 */
export async function runKnowledgeClassify(
  ctx: RequestContext,
  input: { content: string; signal?: AbortSignal },
  deps: KnowledgeClassifyDeps,
): Promise<KnowledgeClassification> {
  const content = input.content.trim();
  if (!content) {
    throw new Error("knowledge-classify: 原文为空,无可归类内容");
  }
  input.signal?.throwIfAborted();
  return await deps.runKnowledgeGeneration(ctx, {skillId: "knowledge.classify", inputData: {content}}, input.signal) as KnowledgeClassification;
}
