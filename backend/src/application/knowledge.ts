import type {RequestContext} from "@creatoros/contract";
import type {Db} from "../db";
import {workspaceStamp} from "../workspace-scope";
import type {Transport} from "@creatoros/contract";
import {createKnowledgeRepository,createKnowledgeService,createKnowledgeTransport} from "../modules/knowledge";
import {createSearchRepository,createSearchService,createSearchTransport,createKnowledgeSearchRuntime} from "../modules/search";

/** 知识写入与派生搜索索引的应用边界；宿主仅提供向量 IO 和配置解析。 */
export function createKnowledgeApplication<Spec>(db:Db,deps:Parameters<typeof createKnowledgeRepository>[1]&Parameters<typeof createSearchService>[1],ports:{
 resolveEmbedSpec:(ctx:RequestContext)=>Promise<Spec|null>;
 embedTexts:(ctx:RequestContext,spec:Spec,texts:string[],signal?:AbortSignal)=>Promise<number[][]>;
}){
  // Search (module 02): the composed `pages.search.get` read served over the
  // SAME pglite store. The service mints a per-ctx repo internally so every index
  // query + history write is scoped to `ctx.userId`; the transport's per-request
  // serviceFactory can therefore return ONE shared service. Clock/ids share the
  // deterministic `deps` (createSeq keeps searchdoc/searchhist ids collision-free).
  const searchService = createSearchService(
    (ctx) =>
      createSearchRepository(db, {
        ...deps,
        userId: ctx.userId,
        // [T-332 S2] strict:搜索投影/检索是 per-account 域(跨号搜到=串味),未选号 →
        //   AccountRequiredError(引导态);「未选号=全局视图」退化已废除(SPEC §4.2)。
        ...workspaceStamp(ctx),
      }),
    deps,
  );
  const search = createSearchTransport(() => searchService);

  // Knowledge (module 06): one user-scoped repository over the shared db (the
  // repo takes ctx per-call, not at construction). Its transport mints a per-ctx
  // service so every list/get/create/revise/relate is scoped to `ctx.userId`,
  // and children inherit ownership via the parent item's gate. Clock/ids share
  // the deterministic `deps` (createSeq keeps knowledge/revision/relation ids
  // collision-free across requests).
  const knowledgeRepo = createKnowledgeRepository(db, deps);
  const knowledgeService = createKnowledgeService(knowledgeRepo);
  const knowledgeBaseTransport = createKnowledgeTransport(() => knowledgeService);
  const knowledgeSearchRuntime=createKnowledgeSearchRuntime({
    knowledge:knowledgeService,search:searchService,
    resolveEmbedSpec:ports.resolveEmbedSpec,embedTexts:ports.embedTexts,
  });
  const {indexKnowledgeDocumentBestEffort}=knowledgeSearchRuntime;
  // [T-093] 知识写路径的搜索索引 fan-out(composition root 组合,knowledge 模块不反向
  // 依赖 search):create / revisions.create 成功后 best-effort 重建该条的 search_document
  // (关键词同步可搜、向量后台补算；失败绝不回滚业务真值——SPEC §16 派生索引纪律)。
  const knowledge: Transport = {
    async request(endpoint, input, ctx) {
      const result = await knowledgeBaseTransport.request(endpoint, input, ctx);
      if (
        ctx &&
        (endpoint.id === "knowledge.create" ||
          endpoint.id === "knowledge.revisions.create")
      ) {
        const data = (result as { data?: unknown }).data as
          | { id?: string; knowledgeItemId?: string }
          | undefined;
        const knowledgeId =
          endpoint.id === "knowledge.create" ? data?.id : data?.knowledgeItemId;
        if (knowledgeId) {
          // [全局搜索修复②] 原 `void ...catch()` fire-and-forget 有「建完即搜」竞态:
          // knowledge.create 返回后 search_document 可能尚未落库 → 立刻搜命中不到。改为
          // 同步 await(indexKnowledgeDocumentBestEffort 内部已 try/catch 吞错,失败绝不
          // 回滚业务真值),消除竞态。
          await indexKnowledgeDocumentBestEffort(ctx, knowledgeId);
        }
      }
      return result;
    },
  };

  async function repairSeedTitles(userId:string,origin:string,prefix:string){
    if(!prefix)throw new Error("种子标题前缀不可为空");
    const rows=await knowledgeRepo.listAllAccountsSystem(userId);let renamed=0;
    // SEMANTIC_BOUNDARY_ALLOW: 仅依据已登记种子来源移除旧展示前缀，不判断内容语义。
    for(const row of rows){
      const meta=row.sourceMetadata as {origin?:unknown}|null;
      if(!meta||meta.origin!==origin||!row.title.startsWith(prefix))continue;
      await knowledgeRepo.renameTitleSystem(userId,row.id,row.title.slice(prefix.length));renamed++;
    }
    return renamed;
  }
  return {knowledge,knowledgeService,search,searchService,knowledgeSearchRuntime,repairSeedTitles};
}
