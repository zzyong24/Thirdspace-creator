import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec, KnowledgeDistillOutput } from "@creatoros/ai-worker";
import {
  ChunkProcessingError,
  chunkTextDeterministically,
  runOrderedChunks,
  type ChunkProgressListener,
} from "./chunk-and-merge";

// 知识倾倒场蒸馏 runner(knowledge.distill,T-079b SPEC §2)—— 用户往 /knowledge 倒入原文,
// 本 runner 同步跑一次结构化节点,产 `{ atoms[], suggestedTags[] }` 一批知识原子候选,
// 由 /api/knowledge/distill 路由返回给前端渲**蒸馏批量确认门**(每条可勾选/改 type/改 title,
// 人点「采纳选中 N 条」才逐条 knowledge.create 物化 —— AI 只产候选铁律)。
//
// 与 knowledge-classify-runner 同款形态(同步请求/响应,无 ai_tasks 生命周期):**失败直接
// 抛错**,调用方(API 路由 → 倾倒场)显示内联错误,原始输入保留供重试或手动补录 [gate-F2],
// 绝不静默兜底。classify 保留供他用,知识流入口由本 runner 全面替代。
//
// 模型按 capability "knowledge.distill" 经 model-config 解析(多模态可配铁律,不写死):
// resolveLlmConfig 无该 capability 专配行时自动回退 "default" 行 → env 默认(Tier 1→2→3),
// 自由 capability 天然可用。

export interface KnowledgeDistillDeps {
  /** 按 capability 解析用户配的 model(Vercel SDK;composition root 的 resolveModelSpec)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
  /** [T-430] 分块旁路进度；回调失败不改变蒸馏结果。 */
  onChunkProgress?: ChunkProgressListener;
}

/** 归一后的单个知识原子 —— 确认门每行卡的渲染形状(= knowledge.create 的预填)。 */
export interface DistilledAtom {
  type: "claim" | "evidence" | "quote" | "qa";
  title: string;
  note: string;
  sourceNote: string;
}

/** 归一后的蒸馏结果 —— 批量确认门的渲染形状。 */
export interface KnowledgeDistillation {
  atoms: DistilledAtom[];
  suggestedTags: string[];
  /** [T-430] 全文覆盖真相；硬上限截断时调用方必须据此如实告知用户。 */
  coverage?: KnowledgeDistillCoverage;
}

export interface KnowledgeDistillCoverage {
  inputChars: number;
  processedChars: number;
  truncatedChars: number;
  chunkCount: number;
}

// 原文截断上限(字符)—— 倾倒场可能整篇逐字稿倒进来,截断防 prompt 爆。蒸馏要吃全文
// (原子散布全篇,不像归类只看开头),故上限比 classify 的 6000 更宽;存库仍存全文,
// 截断只影响送模型的 facet。
// [T-431] 现代模型(200K~1M 上下文)完整吃得下整篇逐字稿/笔记,不再激进截断到几千字。
// 此上限只挡病态的百万字级粘贴,真实文档不触发(用户 2026-07-19:「1M 上下文不要截断」)。
// 弱模型(小上下文)的稳健靠 T-430 chunk-and-merge,不靠这里砍。
export const MAX_DISTILL_CONTENT_CHARS = 200_000;
/** 单次模型调用的稳定窗口：既避免小上下文模型爆窗，也控制结构化输出规模。 */
export const DISTILL_CHUNK_CHARS = 7_000;

/** 截断送模型的原文 facet(超限截断 + 标注,让模型知道后面还有)。 */
export function truncateForDistill(raw: string): string {
  const text = raw.trim();
  if (text.length <= MAX_DISTILL_CONTENT_CHARS) return text;
  return `${text.slice(0, MAX_DISTILL_CONTENT_CHARS)}\n…(原文过长已截断,以上为开头部分)`;
}

function normalizeForNearDuplicate(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function bigrams(value: string): string[] {
  if (value.length < 2) return value ? [value] : [];
  return Array.from({ length: value.length - 1 }, (_, i) =>
    value.slice(i, i + 2),
  );
}

function nearDuplicate(a: DistilledAtom, b: DistilledAtom): boolean {
  const titleA = normalizeForNearDuplicate(a.title);
  const titleB = normalizeForNearDuplicate(b.title);
  if (titleA === titleB) return true;
  const contentA = normalizeForNearDuplicate(`${a.title}${a.note}`);
  const contentB = normalizeForNearDuplicate(`${b.title}${b.note}`);
  if (Math.min(contentA.length, contentB.length) < 10) return false;
  const left = bigrams(contentA);
  const rightCounts = new Map<string, number>();
  for (const gram of bigrams(contentB)) {
    rightCounts.set(gram, (rightCounts.get(gram) ?? 0) + 1);
  }
  let intersection = 0;
  for (const gram of left) {
    const count = rightCounts.get(gram) ?? 0;
    if (count <= 0) continue;
    intersection += 1;
    rightCounts.set(gram, count - 1);
  }
  const rightLength = Math.max(contentB.length - 1, 1);
  return (2 * intersection) / (left.length + rightLength) >= 0.86;
}

/** 跨块稳定归并：保持原文块顺序，标题/标题+note 近重时保留最先出现项。 */
export function mergeDistillations(
  parts: readonly KnowledgeDistillation[],
): KnowledgeDistillation {
  const atoms: DistilledAtom[] = [];
  const suggestedTags: string[] = [];
  for (const part of parts) {
    for (const atom of part.atoms) {
      if (!atoms.some((kept) => nearDuplicate(kept, atom))) atoms.push(atom);
    }
    for (const tag of part.suggestedTags) {
      if (!suggestedTags.includes(tag)) suggestedTags.push(tag);
    }
  }
  return { atoms, suggestedTags: suggestedTags.slice(0, 3) };
}

/**
 * 把 schema 校验过的输出归一成确认门形状:
 *   - 每条原子 trim;title 空的条目**滤掉**(模型没产出本体的行不进确认门);title 截 80;
 *   - suggestedTags 去重 + 滤空 + 截 3(prompt 约束 1~3,归一兜底);
 *   - 滤后 atoms 为空 = 蒸馏不可用 → 返回 null(调用方抛错,诚实失败,不编原子)。
 */
export function normalizeDistillation(
  o: KnowledgeDistillOutput,
): KnowledgeDistillation | null {
  const atoms: DistilledAtom[] = [];
  for (const a of o.atoms) {
    const title = a.title.trim().slice(0, 80);
    if (!title) continue; // 空本体条目滤掉,不编标题
    atoms.push({
      type: a.type,
      title,
      note: a.note.trim(),
      sourceNote: a.sourceNote.trim(),
    });
  }
  if (atoms.length === 0) return null;
  const suggestedTags = Array.from(
    new Set(o.suggestedTags.map((t) => t.trim()).filter(Boolean)),
  ).slice(0, 3);
  return { atoms, suggestedTags };
}

/**
 * 跑 knowledge.distill —— 确定性分块 + 每块 runStructuredNode + 顺序近重归并
 * (外置模板 + outputSchema,registry 运行时取,吃服务端覆盖)。任何失败(无凭据/模型不可用/
 * 产出不可用)直接抛错,由调用方内联展示。纯函数式端口注入,单测 fake resolveModelSpec + mock
 * ai-worker 即可。
 */
export async function runKnowledgeDistill(
  ctx: RequestContext,
  input: { content: string },
  deps: KnowledgeDistillDeps,
): Promise<KnowledgeDistillation> {
  const content = input.content.trim();
  if (!content) {
    throw new Error("knowledge-distill: 原文为空,无可蒸馏内容");
  }
  const inputChars = content.length;
  const modelContent = content.slice(0, MAX_DISTILL_CONTENT_CHARS);
  const chunks = chunkTextDeterministically(modelContent, DISTILL_CHUNK_CHARS);
  const coverage: KnowledgeDistillCoverage = {
    inputChars,
    processedChars: modelContent.length,
    truncatedChars: Math.max(0, inputChars - modelContent.length),
    chunkCount: chunks.length,
  };
  const spec = await deps.resolveModelSpec(ctx, "knowledge.distill");
  // 运行时 getTemplate 取被服务端覆盖后的 REGISTRY 对象(T-040b 同款),outputSchema 由
  // registry 收口(runStructuredNode 内 resolveOutputSchema)。
  const { modelFor, runStructuredNode, getTemplate } =
    await import("@creatoros/ai-worker");
  const model = modelFor(spec);
  const template = getTemplate("knowledge.distill");
  let parts: KnowledgeDistillation[];
  try {
    parts = await runOrderedChunks({
      chunks,
      onProgress: deps.onChunkProgress,
      process: async (chunk) => {
        const { object } = await runStructuredNode<KnowledgeDistillOutput>({
          model,
          template,
          facets: { content: chunk.text },
        });
        const distillation = normalizeDistillation(object);
        if (!distillation) {
          throw new Error(
            "模型未蒸馏出可用知识原子,请重试或手动补录",
          );
        }
        return distillation;
      },
    });
  } catch (error) {
    if (error instanceof ChunkProcessingError) {
      const cause =
        error.cause instanceof Error ? `：${error.cause.message}` : "";
      throw new Error(
        `knowledge-distill: 第 ${error.chunkIndex + 1}/${error.totalChunks} 块失败${cause}；未返回部分候选，原文仍保留可重试`,
        { cause: error },
      );
    }
    throw error;
  }
  const merged = mergeDistillations(parts);
  if (merged.atoms.length === 0) {
    throw new Error(
      "knowledge-distill: 模型未蒸馏出可用知识原子,请重试或手动补录",
    );
  }
  return { ...merged, coverage };
}
