import type { RequestContext } from "@creatoros/contract";
import type { ContextReaders } from "../../modules/ai-runtime";
import { knowledgeRelevanceScore } from "../../modules/ai-runtime";

/** 通过公开服务组合evidence读取；不持有数据库或任务执行权。 */
export function createChatEvidenceReaders(ports: {
assetsService: Pick<ReturnType<typeof import("../../modules/assets").createAssetsService>, "searchAssets" | "listAssets">;
knowledgeService: Pick<ReturnType<typeof import("../../modules/knowledge").createKnowledgeService>, "listKnowledge" | "getKnowledge" | "listRevisions" | "listRelations">;
}): Pick<ContextReaders,"searchKnowledge" | "searchMaterials" | "listCoverReferenceImages" | "getKnowledgeDetail" | "getKnowledgeText"> {
 const {assetsService,knowledgeService}=ports;

return {
searchKnowledge: async (
        c: RequestContext,
        opts: { query: string; limit: number },
      ) => {
        const rows = await knowledgeService.listKnowledge(c);
        const snippetOf = (k: (typeof rows)[number]): string => {
          const meta = (k.sourceMetadata ?? {}) as {
            summary?: unknown;
            description?: unknown;
          };
          return typeof meta.summary === "string"
            ? meta.summary
            : typeof meta.description === "string"
              ? meta.description
              : "";
        };
        const q = opts.query.trim();
        if (!q) {
          return rows.slice(0, opts.limit).map((k) => ({
            id: k.id,
            title: k.title,
            snippet: snippetOf(k),
          }));
        }
        // 标题 + 摘要一起当 haystack 做模糊匹配(放宽命中面,但仍以真实内容为准)。
        const scored = rows
          .map((k, idx) => ({
            k,
            idx,
            score: knowledgeRelevanceScore(`${k.title}\n${snippetOf(k)}`, q),
          }))
          .filter((r) => r.score > 0)
          // 相关度降序;同分保持原顺序(listKnowledge 的近→远)稳定。
          .sort((a, b) => b.score - a.score || a.idx - b.idx);
        return scored.slice(0, opts.limit).map(({ k }) => ({
          id: k.id,
          title: k.title,
          snippet: snippetOf(k),
        }));
      },
searchMaterials: async (
        c: RequestContext,
        opts: { query: string; limit: number },
      ) => {
        const result=await assetsService.searchAssets(c,{query:opts.query,limit:Math.max(1,Math.min(100,opts.limit))});
        return result.rows.map(a=>({id:a.id,title:a.name,kind:a.assetType}));
      },
listCoverReferenceImages: async (c: RequestContext) => {
        const all = await assetsService.listAssets(c, {
          limit: Number.MAX_SAFE_INTEGER,
          cursor: null,
        });
        const images = all.filter((asset) => asset.assetType === "image");
        return {
          rows: images.slice(0, 20).map((asset) => ({
            id: asset.id,
            title: asset.name,
            kind: asset.assetType,
          })),
          total: images.length,
        };
      },
getKnowledgeDetail: async (c: RequestContext, opts: { id: string }) => {
        try {
          const item = await knowledgeService.getKnowledge(c, opts.id);
          // 正文 note —— 当前修订 content(缺则取 revisionNumber 最大的最新修订)。
          let note = "";
          try {
            const revisions = await knowledgeService.listRevisions(c, opts.id);
            const current =
              revisions.find((r) => r.id === item.currentRevisionId) ??
              revisions
                .slice()
                .sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
            note = current?.content ?? "";
          } catch {
            note = "";
          }
          // 关联边 —— 语义关系(目标 id + 关系类型)。
          let relations: Array<{
            targetKnowledgeId: string;
            relationType: string;
          }> = [];
          try {
            const rels = await knowledgeService.listRelations(c, opts.id);
            relations = rels.map((r) => ({
              targetKnowledgeId: r.targetKnowledgeId,
              relationType: r.relationType,
            }));
          } catch {
            relations = [];
          }
          // tags —— sourceMetadata.tags(字符串数组;缺失/形状不符 → 空)。
          const meta = (item.sourceMetadata ?? {}) as { tags?: unknown };
          const tags = Array.isArray(meta.tags)
            ? meta.tags.filter((t): t is string => typeof t === "string")
            : [];
          return {
            id: item.id,
            title: item.title,
            knowledgeType: item.knowledgeType,
            note,
            sourceNote: item.sourceNote ?? null,
            sourceType: item.sourceType,
            sourceUrl: item.sourceUrl ?? null,
            tags,
            usedCount: item.usedCount,
            usedInPublished: item.usedInPublished,
            relations,
          };
        } catch {
          return null;
        }
      },
getKnowledgeText: async (c: RequestContext, opts: { id: string }) => {
        try {
          const item = await knowledgeService.getKnowledge(c, opts.id);
          let fullText = "";
          try {
            const revisions = await knowledgeService.listRevisions(c, opts.id);
            const current =
              revisions.find((r) => r.id === item.currentRevisionId) ??
              revisions
                .slice()
                .sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
            fullText = current?.content ?? "";
          } catch {
            fullText = "";
          }
          return {
            id: item.id,
            title: item.title,
            knowledgeType: item.knowledgeType,
            fullText,
          };
        } catch {
          return null;
        }
      }
};
}
