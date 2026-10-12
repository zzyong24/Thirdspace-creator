import type {KnowledgeGenerationPort} from "./knowledge-generation.types";
import type { RequestContext } from "@creatoros/contract";
import type { KnowledgeDistillOutput } from "@creatoros/ai-worker";
import {
  type ChunkProgressListener,
} from "./chunk-and-merge";

// 知识倾倒场蒸馏 runner(knowledge.distill,T-079b SPEC §2)—— 用户往 /knowledge 倒入原文,
// 本 runner 等待受控 Worker 的原任务候选,产 `{ atoms[], suggestedTags[] }` 一批知识原子候选,
// 由 /api/knowledge/distill 路由返回给前端渲**蒸馏批量确认门**(每条可勾选/改 type/改 title,
// 人点「采纳选中 N 条」才逐条 knowledge.create 物化 —— AI 只产候选铁律)。
//
// 抛错**,调用方(API 路由 → 倾倒场)显示内联错误,原始输入保留供重试或手动补录 [gate-F2],
// 绝不静默兜底。classify 保留供他用,知识流入口由本 runner 全面替代。
//
// 自由 capability 天然可用。

export interface KnowledgeDistillDeps {
  runKnowledgeGeneration: KnowledgeGenerationPort;
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

/** 同步公共响应继续等待同一持久任务；分块、模型调用与绝对期限由原 Worker 控制。 */
export async function runKnowledgeDistill(
  ctx: RequestContext,
  input: { content: string; signal?: AbortSignal },
  deps: KnowledgeDistillDeps,
): Promise<KnowledgeDistillation> {
  const content = input.content.trim();
  if (!content) {
    throw new Error("knowledge-distill: 原文为空,无可蒸馏内容");
  }
  input.signal?.throwIfAborted();
  const output=await deps.runKnowledgeGeneration(ctx, {skillId: "knowledge.distill", inputData: {content}}, input.signal) as KnowledgeDistillation;
  if(output.coverage && deps.onChunkProgress){
    // 仅在原任务全文候选完成后报告真实完成数；观察者失败不改变交付。
    try{await deps.onChunkProgress({status:"completed",index:output.coverage.chunkCount-1,total:output.coverage.chunkCount,completed:output.coverage.chunkCount});}catch{}
  }
  return output;
}
