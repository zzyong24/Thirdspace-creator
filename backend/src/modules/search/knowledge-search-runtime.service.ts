import type { RequestContext } from "@creatoros/contract";
import type { KnowledgeService } from "../knowledge";
import type { SearchService, HybridSearchHit } from "./search.service";

/** T1294：知识查询与索引仅走原关键词路径；保留历史注入形状，不再消费向量端口。 */
export function createKnowledgeSearchRuntime<Spec>(deps: {
  knowledge: Pick<KnowledgeService, "getKnowledge" | "listRevisions">;
  search: Pick<SearchService, "upsertDocument" | "listMissingEmbeddings" | "fillMissingEmbedding" | "hybridSearch" | "recordSearch">;
  resolveEmbedSpec: (ctx: RequestContext) => Promise<Spec | null>;
  embeddingConfigDigest?: (spec:Spec)=>string|undefined;
  embedTexts: (ctx: RequestContext, spec: Spec, texts: string[], signal?: AbortSignal) => Promise<number[][]>;
}) {
  const controller = new AbortController();
  const operations = new Set<Promise<unknown>>();
  let stopped = false;
  let stopPromise: Promise<void> | undefined;

  function tracked<T>(work: () => Promise<T>): Promise<T> {
    if (stopped) return Promise.reject(new Error("知识搜索运行时已停止"));
    const promise = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return work(); });
    operations.add(promise);
    void promise.then(() => operations.delete(promise), () => operations.delete(promise));
    return promise;
  }

  return {
    indexKnowledgeDocumentBestEffort(context: RequestContext, knowledgeId: string): Promise<void> {
      const ctx = { ...context };
      return tracked(async () => {
        try {
          const item = await deps.knowledge.getKnowledge(ctx, knowledgeId);
          const revisions = await deps.knowledge.listRevisions(ctx, knowledgeId);
          const head = revisions.find(revision => revision.id === item.currentRevisionId) ?? revisions[0];
          const content = head?.content ?? "";
          controller.signal.throwIfAborted();
          // 原关键词索引同步可读；不解析模型，也不启动存量补算。
          await deps.search.upsertDocument(ctx, {
            entityType: "knowledge", entityId: item.id, title: item.title,
            body: JSON.stringify({ excerpt: content.slice(0, 120), tags: [] }),
            searchText: `${item.title}\n${content}`.toLowerCase().trim(),
          });
        } catch (error) {
          if (controller.signal.aborted) throw error;
          console.warn("[knowledge-index] 索引失败(业务真值不受影响)");
        }
      });
    },

    hybridSearch(context: RequestContext, query: string): Promise<{
      semanticEnabled: boolean; semanticError: string | null; hits: HybridSearchHit[];
    }> {
      const ctx = { ...context };
      return tracked(async () => {
        controller.signal.throwIfAborted();
        const hits = await deps.search.hybridSearch(ctx, query, {
          entityType: "knowledge", limit: 20, queryEmbedding: null,
        });
        controller.signal.throwIfAborted();
        await deps.search.recordSearch(ctx, {
          query, filters: { entityType: "knowledge", semantic: false }, resultCount: hits.length,
        });
        return { semanticEnabled: false, semanticError: null, hits };
      });
    },

    stop(): Promise<void> {
      if (stopPromise) return stopPromise;
      stopped = true;
      controller.abort(new Error("知识搜索运行时已停止"));
      // 已进入的领域读取仍由原service持有；等待其结算，停止后不追加搜索记录。
      stopPromise = Promise.allSettled([...operations]).then(() => {});
      return stopPromise;
    },
  };
}
