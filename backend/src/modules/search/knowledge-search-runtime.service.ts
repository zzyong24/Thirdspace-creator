import type { RequestContext } from "@creatoros/contract";
import type { KnowledgeService } from "../knowledge";
import type { SearchService, HybridSearchHit } from "./search.service";

const BACKFILL_BATCH = 8;
const BACKFILL_INTERVAL_MS = 60_000;

/** 查询只等待本次查询向量；存量补算由同一应用生命周期管理，不创建业务任务。 */
export function createKnowledgeSearchRuntime<Spec>(deps: {
  knowledge: Pick<KnowledgeService, "getKnowledge" | "listRevisions">;
  search: Pick<SearchService, "upsertDocument" | "listMissingEmbeddings" | "fillMissingEmbedding" | "hybridSearch" | "recordSearch">;
  resolveEmbedSpec: (ctx: RequestContext) => Promise<Spec | null>;
  embedTexts: (ctx: RequestContext, spec: Spec, texts: string[], signal?: AbortSignal) => Promise<number[][]>;
}) {
  const controller = new AbortController();
  const operations = new Set<Promise<unknown>>();
  let background: Promise<void> | null = null;
  // 仅限制触发频率，不缓存正文、配置、凭据或向量。按用户和账号隔离。
  const lastAttempt = new Map<string, number>();
  let stopped = false;
  let stopPromise: Promise<void> | undefined;

  function tracked<T>(work: () => Promise<T>): Promise<T> {
    if (stopped) return Promise.reject(new Error("知识搜索运行时已停止"));
    const promise = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return work(); });
    operations.add(promise);
    void promise.then(() => operations.delete(promise), () => operations.delete(promise));
    return promise;
  }

  function scheduleBackfill(context: RequestContext): void {
    if (stopped || background) return;
    const ctx = { ...context };
    const key = JSON.stringify([ctx.userId, ctx.accountId]);
    const now = Date.now();
    if (now - (lastAttempt.get(key) ?? 0) < BACKFILL_INTERVAL_MS) return;
    if (lastAttempt.size >= 64) lastAttempt.delete(lastAttempt.keys().next().value!);
    lastAttempt.set(key, now);
    // embedding IO持有冷启、排队和模型执行的完整期限；此处仅传播宿主停止。
    // 不再以独立短外帽先中断仍合法排队/执行的同一请求。
    const signal = controller.signal;
    const flight = tracked(async () => {
      signal.throwIfAborted();
      const docs = await deps.search.listMissingEmbeddings(ctx, "knowledge", BACKFILL_BATCH);
      signal.throwIfAborted();
      if (!docs.length) return;
      const spec = await deps.resolveEmbedSpec(ctx);
      signal.throwIfAborted();
      if (!spec) return;
      const vectors = await deps.embedTexts(ctx, spec, docs.map(doc => doc.searchText), signal);
      signal.throwIfAborted();
      if (vectors.length !== docs.length) throw new Error("向量结果数量不匹配");
      for (let index = 0; index < docs.length; index++) {
        signal.throwIfAborted();
        await deps.search.fillMissingEmbedding(ctx, docs[index]!, vectors[index]!, signal);
      }
    }).catch(() => {
      // 派生增益失败不影响查询，也不在本次批次内自动重付费重试。
    });
    background = flight;
    void flight.then(() => { if (background === flight) background = null; });
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
          // 保存返回前关键词索引已持久化；不再等待模型。
          await deps.search.upsertDocument(ctx, {
            entityType: "knowledge", entityId: item.id, title: item.title,
            body: JSON.stringify({ excerpt: content.slice(0, 120), tags: [] }),
            searchText: `${item.title}\n${content}`.toLowerCase().trim(),
          });
          scheduleBackfill(ctx);
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
        let queryEmbedding: number[] | null = null;
        let semanticError: string | null = null;
        const querySignal = controller.signal;
        try {
          const spec = await deps.resolveEmbedSpec(ctx);
          querySignal.throwIfAborted();
          if (spec) {
            const [vector] = await deps.embedTexts(ctx, spec, [query], querySignal);
            querySignal.throwIfAborted();
            queryEmbedding = vector?.length ? vector : null;
          }
        } catch (error) {
          if (controller.signal.aborted) throw error;
          semanticError = querySignal.aborted
            ? "语义查询超时，已使用关键词搜索"
            : error instanceof Error ? error.message : String(error);
        }
        controller.signal.throwIfAborted();
        const hits = await deps.search.hybridSearch(ctx, query, {
          entityType: "knowledge", limit: 20, queryEmbedding,
        });
        controller.signal.throwIfAborted();
        const semanticEnabled = queryEmbedding !== null;
        await deps.search.recordSearch(ctx, {
          query, filters: { entityType: "knowledge", semantic: semanticEnabled }, resultCount: hits.length,
        });
        // 已完成本次结果后才启动一个有上限的补算批次，不 await 全库存量。
        if (!semanticError) scheduleBackfill(ctx);
        return { semanticEnabled, semanticError, hits };
      });
    },

    stop(): Promise<void> {
      if (stopPromise) return stopPromise;
      stopped = true;
      controller.abort(new Error("知识搜索运行时已停止"));
      stopPromise = Promise.allSettled([...operations, ...(background ? [background] : [])]).then(() => {
        lastAttempt.clear();
      });
      return stopPromise;
    },
  };
}
