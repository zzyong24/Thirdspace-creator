import type { LanguageModel } from "ai";
import { topicGenerateFrozenSchema } from "./topic-worker-input";
import { runStructuredNode } from "../nodes/structured-node";
import { getEffectiveTemplate } from "../prompt/effective-skill-runtime";
import { topicFacets } from "../nodes/topic-node";
import { renderSignalQualityBrief } from "../nodes/topic-signal-quality";
import {
  formatTrendBrief,
  formatTrendSourceBrief,
  type TrendSourceSignal,
} from "../nodes/topic-trend-context";
import { topicArraySchema } from "../prompt/templates/topic-generate";
import { trendExtractSchema } from "../prompt/templates/trend-extract";
import { parseFeed } from "../runtime/search-rss";
import { GenerationFailure } from "./generation-error";
export type TopicReadTarget =
  { kind: "search" } | { kind: "source"; sourceId: string };
export type TopicReadData =
  | {
      kind: "search";
      results: Array<{ title: string; url: string; snippet: string }>;
    }
  | { kind: "web" | "rss"; sourceUrl: string; title: string; text: string };
/** 数据库上下文已冻结；所有外部读取和模型结果都经调用方的持久端口。 */
export async function runTopicWorkerPipeline(
  raw: unknown,
  deps: {
    model: LanguageModel;
    signal: AbortSignal;
    maxOutputTokens: number;
    timeoutMs?: number;
    read(target: TopicReadTarget): Promise<TopicReadData | null>;
  },
) {
  const input = topicGenerateFrozenSchema.parse(raw),
    { signal } = deps;
  let basisBrief = input.basisBrief;
  let trend = { sourceCount: 0, signalCount: 0 };
  signal.throwIfAborted();
  if (input.basis === "trend" || input.mode === "daily") {
    const signals: TrendSourceSignal[] = [];
    // 固定顺序保证中间模型调用序号跨恢复稳定。单个已知失败由read落回执后返回空。
    const search = await deps.read({ kind: "search" });
    signal.throwIfAborted();
    for (const source of input.trendSources) {
      signal.throwIfAborted();
      const page = await deps.read({ kind: "source", sourceId: source.id });
      signal.throwIfAborted();
      if (!page || page.kind === "search") continue;
      if (source.sourceType === "rss") {
        for (const row of parseFeed(page.text, source.domain).slice(0, 8))
          signals.push({
            title: row.title,
            url: row.url || null,
            heat: null,
            publishedAt: row.publishedAt ?? null,
            sourceName: source.name,
          });
        continue;
      }
      const pageText = page.text.slice(0, 40000).trim();
      if (!pageText) continue;
      try {
        const result = await runStructuredNode({
          model: deps.model,
          template: getEffectiveTemplate("trend.extract"),
          facets: { sourceName: source.name, pageText },
          outputSchema: trendExtractSchema,
          maxOutputTokens: deps.maxOutputTokens,
          timeoutMs: deps.timeoutMs,
          signal,
        });
        signal.throwIfAborted();
        signals.push(
          ...trendExtractSchema
            .parse(result.object)
            .signals.filter((row) => row.title.trim())
            .slice(0, 8)
            .map((row) => ({
              ...row,
              title: row.title.trim(),
              sourceName: source.name,
            })),
        );
      } catch (error) {
        signal.throwIfAborted();
        // 已确认格式失败保留旧单源降级；预算、鉴权和任何未知供应商结果必须停止。
        if (error instanceof GenerationFailure) throw error;
        if (!(
          error instanceof Error && error.message.startsWith("结构化节点:")
        ))
          throw error;
      }
    }
    const hits = search?.kind === "search" ? search.results : [];
    basisBrief = [input.mode === "daily" && input.basisBrief ? `【受众评论信号】\n${input.basisBrief}` : "", formatTrendSourceBrief(signals), formatTrendBrief(hits)]
      .filter(Boolean)
      .join("\n\n");
    trend = {
      sourceCount:
        new Set(signals.map((row) => row.sourceName.trim()).filter(Boolean))
          .size + (hits.length ? 1 : 0),
      signalCount: signals.length + hits.length,
    };
  }
  signal.throwIfAborted();
  return runStructuredNode({
    model: deps.model,
    template: getEffectiveTemplate("topic.generate"),
    facets: topicFacets(
      input.context.positioningBrief,
      input.basis,
      basisBrief,
      input.basis === "knowledge"
        ? undefined
        : input.context.knowledgeBrief || undefined,
      input.context.learningsBrief || undefined,
      renderSignalQualityBrief({ ...input.qualityProfile, trend }),
    ),
    outputSchema: topicArraySchema,
    maxOutputTokens: deps.maxOutputTokens,
    timeoutMs: deps.timeoutMs,
    signal,
  });
}
