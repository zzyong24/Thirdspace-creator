import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec, KnowledgeClassifyOutput } from "@creatoros/ai-worker";

// 知识倾倒场归类 runner(knowledge.classify,T-062c SPEC §4)—— 用户往 /knowledge 倒入原文,
// 本 runner 同步跑一次结构化节点,产 `{ knowledgeType, title, tags, summary }` 归类候选,
// 由 /api/knowledge/classify 路由返回给前端渲**确认门卡片**(type/title 可改,人点「存入
// 知识库」才 knowledge.create 物化 —— AI 只产候选铁律)。
//
// 与 task 型 runner(topic-enrich 等)不同:这里没有 ai_tasks 生命周期 —— 归类是录入交互的
// 一环,同步请求/响应;**失败直接抛错**,调用方(API 路由 → 倾倒场)显示内联错误,原始输入
// 保留供重试或手动补录 [gate-F2],绝不静默兜底。
//
// 模型按 capability "knowledge.classify" 经 model-config 解析(多模态可配铁律,不写死):
// resolveLlmConfig 无该 capability 专配行时自动回退 "default" 行 → env 默认(resolve.ts
// Tier 1→2→3),自由 capability 天然可用。

export interface KnowledgeClassifyDeps {
  /** 按 capability 解析用户配的 model(Vercel SDK;composition root 的 resolveModelSpec)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
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

/**
 * 跑一次 knowledge.classify —— resolveModelSpec("knowledge.classify") + runStructuredNode
 * (外置模板 + outputSchema,registry 运行时取,吃服务端覆盖)。任何失败(无凭据/模型不可用/
 * 产出不可用)直接抛错,由调用方内联展示。纯函数式端口注入,单测 fake resolveModelSpec + mock
 * ai-worker 即可。
 */
export async function runKnowledgeClassify(
  ctx: RequestContext,
  input: { content: string },
  deps: KnowledgeClassifyDeps,
): Promise<KnowledgeClassification> {
  const content = input.content.trim();
  if (!content) {
    throw new Error("knowledge-classify: 原文为空,无可归类内容");
  }
  const spec = await deps.resolveModelSpec(ctx, "knowledge.classify");
  // 运行时 getTemplate 取被服务端覆盖后的 REGISTRY 对象(T-040b 同款),outputSchema 由
  // registry 收口(runStructuredNode 内 resolveOutputSchema)。
  const { modelFor, runStructuredNode, getTemplate } =
    await import("@creatoros/ai-worker");
  const { object } = await runStructuredNode<KnowledgeClassifyOutput>({
    model: modelFor(spec),
    template: getTemplate("knowledge.classify"),
    facets: { content: truncateForClassify(content) },
  });
  const classification = normalizeClassification(object);
  if (!classification) {
    throw new Error("knowledge-classify: 模型未产出可用归类(标题为空),请重试或手动补录");
  }
  return classification;
}
