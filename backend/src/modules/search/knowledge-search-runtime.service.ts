import type {RequestContext} from "@creatoros/contract";
import type {KnowledgeService} from "../knowledge";
import type {SearchService,HybridSearchHit} from "./search.service";

/** 知识与搜索的应用装配；通过领域 service 读写，模型计算由调用方提供。 */
export function createKnowledgeSearchRuntime<Spec>(deps:{
 knowledge:Pick<KnowledgeService,"getKnowledge"|"listRevisions">;
 search:Pick<SearchService,"upsertDocument"|"listDocumentsByEntityType"|"hybridSearch"|"recordSearch">;
 resolveEmbedSpec:(ctx:RequestContext)=>Promise<Spec|null>;
 embedTexts:(ctx:RequestContext,spec:Spec,texts:string[])=>Promise<number[][]>;
}){
 const {knowledge:knowledgeService,search:searchService,resolveEmbedSpec,embedTexts}=deps;
  // 单条知识 → search_document 重建(标题+正文摘要;embedding 可配则同步算)。
  // best-effort:任何失败只丢索引增益,业务真值不回滚。
  const indexKnowledgeDocumentBestEffort = async (
    ctx: RequestContext,
    knowledgeId: string,
  ): Promise<void> => {
    try {
      const item = await knowledgeService.getKnowledge(ctx, knowledgeId);
      const revisions = await knowledgeService.listRevisions(ctx, knowledgeId);
      const head =
        revisions.find((r) => r.id === item.currentRevisionId) ?? revisions[0];
      const content = head?.content ?? "";
      let embedding: number[] | undefined;
      try {
        const spec = await resolveEmbedSpec(ctx);
        if (spec) {
          const [vec] = await embedTexts(ctx, spec, [
            `${item.title}\n${content}`.trim(),
          ]);
          embedding = vec;
        }
      } catch (err) {
        // embedding 失败 → 只落关键词索引(诚实降级,不假装有向量)。
        console.warn("[knowledge-index] embedding 计算失败:", err);
      }
      await searchService.upsertDocument(ctx, {
        entityType: "knowledge",
        entityId: item.id,
        title: item.title,
        body: JSON.stringify({ excerpt: content.slice(0, 120), tags: [] }),
        searchText: `${item.title}\n${content}`.toLowerCase().trim(),
        ...(embedding ? { embedding } : {}),
      });
    } catch (err) {
      console.warn("[knowledge-index] 索引失败(业务真值不受影响):", err);
    }
  };

  // 知识库 hybrid 搜索运行时(/api/knowledge/search 消费):
  //   1. 存量回填:embedding 为空的 knowledge 文档批量补算(幂等,一次 embedMany);
  //   2. 查询向量:query 单条 embed;
  //   3. searchService.hybridSearch(exact 优先 + 余弦补位,阈值截断);
  //   4. search_history 落真实记录(失败不抛,SPEC §16)。
  // 未配 capability → 纯关键词 + semanticEnabled:false(诚实降级,不静默装 AI)。
  const knowledgeSearchRuntime = {
    hybridSearch: async (
      ctx: RequestContext,
      query: string,
    ): Promise<{
      semanticEnabled: boolean;
      semanticError: string | null;
      hits: HybridSearchHit[];
    }> => {
      let semanticEnabled = false;
      let semanticError: string | null = null;
      let queryEmbedding: number[] | null = null;
      const spec = await resolveEmbedSpec(ctx);
      if (spec) {
        try {
          // 存量回填(embedding 空的 knowledge 文档;<5000 条量级,一次批量)。
          const docs = await searchService.listDocumentsByEntityType(
            ctx,
            "knowledge",
          );
          const missing = docs.filter((d) => (d.embedding ?? []).length === 0);
          if (missing.length > 0) {
            const vectors = await embedTexts(
              ctx, spec,
              missing.map((d) => d.searchText),
            );
            for (let i = 0; i < missing.length; i++) {
              const doc = missing[i]!;
              await searchService.upsertDocument(ctx, {
                entityType: doc.entityType,
                entityId: doc.entityId,
                title: doc.title,
                body: doc.body,
                searchText: doc.searchText,
                embedding: vectors[i],
              });
            }
          }
          const [qVec] = await embedTexts(ctx, spec, [query]);
          queryEmbedding = qVec ?? null;
          semanticEnabled = queryEmbedding !== null;
        } catch (err) {
          // 配置了但跑不通(key 失效/anthropic 协议/网络)→ 诚实降级 + 带原因。
          semanticError = err instanceof Error ? err.message : String(err);
          queryEmbedding = null;
          semanticEnabled = false;
        }
      }
      const hits = await searchService.hybridSearch(ctx, query, {
        entityType: "knowledge",
        limit: 20,
        queryEmbedding,
      });
      await searchService.recordSearch(ctx, {
        query,
        filters: { entityType: "knowledge", semantic: semanticEnabled },
        resultCount: hits.length,
      });
      return { semanticEnabled, semanticError, hits };
    },
  };

 return {indexKnowledgeDocumentBestEffort,...knowledgeSearchRuntime};
}
