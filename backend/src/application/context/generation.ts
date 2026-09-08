import type { RequestContext } from "@creatoros/contract";
import type { ContextDeps as CreativeContextDeps, ReviewSubjectReader, ProjectBriefReader, ProjectMaterialsReader } from "../../modules/ai-runtime";
/** 共享业务上下文读取；聊天和持久生成消费同一投影。 */
export function createGenerationContextReaders(ports: {
candidateService: Pick<ReturnType<typeof import("../../modules/candidate").createCandidateService>,"listSignals">;
assetsService: Pick<ReturnType<typeof import("../../modules/assets").createAssetsService>,"listAssets">;
knowledgeService: Pick<ReturnType<typeof import("../../modules/knowledge").createKnowledgeService>,"listKnowledge">;
positioningService: Pick<ReturnType<typeof import("../../modules/positioning").createPositioningService>,"readPositioningCenter">;
learningsService: Pick<ReturnType<typeof import("../../modules/learnings").createLearningsService>,"getSuggestions">;
platformAccountService: Pick<ReturnType<typeof import("../../modules/platform-account").createPlatformAccountService>,"listAccounts">;
projectIntelligenceReferences: Pick<ReturnType<typeof import("../../modules/intelligence").createProjectIntelligenceReferenceService>,"getSourceContexts">;
knowledgeSearchRuntime: Pick<ReturnType<typeof import("../../modules/search").createKnowledgeSearchRuntime>,"hybridSearch">;
makeBriefReader: () => ProjectBriefReader;
makeReviewSubjectReader: () => ReviewSubjectReader;
makeProjectMaterialsReader: () => ProjectMaterialsReader;
thesisReader: CreativeContextDeps["thesis"];
contractReader: CreativeContextDeps["contract"];
outlineReader: CreativeContextDeps["outline"];
artifactOriginReader: CreativeContextDeps["artifactOrigin"];
}) {
const {candidateService,assetsService,knowledgeService,positioningService,learningsService,platformAccountService,projectIntelligenceReferences,knowledgeSearchRuntime,makeBriefReader,makeReviewSubjectReader,makeProjectMaterialsReader,thesisReader,contractReader,outlineReader,artifactOriginReader}=ports;
return (() => {
        const positioningReader = {
          getPositioningCenter: (c: RequestContext) =>
            positioningService.readPositioningCenter(c),
        };
        // 飞轮回流 — top validated Learnings feed the agent's context (topic/script nodes).
        const learningsReader = {
          getSuggestions: (c: RequestContext, opts: { limit?: number }) =>
            learningsService.getSuggestions(c, opts),
        };
        // 素材库 reader (Plan D2) — the creator's asset library (id + name + type) feeds the
        // material.match node's context so the agent matches REAL assets. Maps the Asset DTO
        // (name, assetType) onto the runner's {id,name,type} shape.
        const assetsReader = {
          list: async (c: RequestContext) =>
            (await assetsService.listAssets(c, { limit: 200, cursor: null })).map(
              (a) => ({ id: a.id, name: a.name, type: a.assetType }),
            ),
        };
        // 抖音账号 reader (Plan Phase A) — the creator's connected platform accounts
        // (platform + handle + follower baseline) feed the positioning.generate node's
        // context as material for who they already are on-platform. Maps the
        // PlatformAccount DTO onto the runner's {platform, accountHandle, followerBaseline}
        // shape. platformAccountService is constructed below; this thunk only runs inside
        // the (async) request handler, never at construction.
        const accountsReader = {
          list: async (c: RequestContext) =>
            (
              await platformAccountService.listAccounts(c, {
                limit: 100,
                offset: 0,
              })
            ).rows.map((a) => ({
              // [T-382] 透传账号 id —— 装配层据它与 ctx.accountId 匹配标「⭐当前选中号」。
              id: a.id,
              platform: a.platform,
              accountHandle: a.accountHandle,
              followerBaseline: a.followerBaseline,
            })),
        };
        // 受众信号 reader (topic.generate comments basis, 选题中心大改) — the creator's
        // audience signals feed the agent's context so it can出题 from REAL demand. Maps the
        // AudienceSignal DTO onto the runner's {source, rawText, demandTag} shape.
        const signalsReader = {
          list: async (c: RequestContext, opts: { limit?: number }) =>
            (
              await candidateService.listSignals(c, {
                limit: opts.limit ?? 30,
                offset: 0,
              })
            ).rows.map((s) => ({
              source: s.source,
              rawText: s.rawText,
              demandTag: s.demandTag,
              // [T-238] 评论按作品锚(存量/非评论 null)→ 信号质量画像算覆盖作品数。
              publicationId: s.publicationId ?? null,
            })),
        };
        // 知识库 reader (topic.generate knowledge basis + topic.enrich 素材依据) — the
        // creator's KnowledgeItems feed the agent's context so选题 has 素材依据.
        // [T-079c] 投影补战绩/出处字段(usedCount/usedInPublished/sourceNote,
        // T-079a listKnowledge 已一次算齐)→ knowledgeBrief 按四原子分段 + 战绩排序。
        const knowledgeReader = {
          list: async (c: RequestContext, opts: { limit?: number }) =>
            (await knowledgeService.listKnowledge(c))
              .slice(0, opts.limit ?? 40)
              .map((k) => ({
                title: k.title,
                knowledgeType: k.knowledgeType,
                usedCount: k.usedCount,
                usedInPublished: k.usedInPublished,
                sourceNote: k.sourceNote ?? null,
                // [T-238] 新鲜度(ISO text 列)→ 信号质量画像算近 30 天占比。
                createdAt: k.createdAt ?? null,
              })),
          // [T-186] L3 策展护栏:按 query 相关性检索知识,复用已建 hybridSearch 运行时
          // (knowledgeSearchRuntime,entityType=knowledge,exact ILIKE 优先 + 余弦补位 + 阈值截断;
          // 未配 embedding 时诚实降级纯关键词)。把命中 knowledge id 按 hybridSearch 相关性顺序映射回
          // listKnowledge 的全字段行(带 knowledgeType/战绩/出处),供 creative-context 的
          // formatKnowledgeBrief 分段渲染。knowledgeSearchRuntime 定义在本文件后方,search 仅在任务
          // dispatch(build 完成后)被调用,前向引用安全(与 dispatchScheduledCollection 同款范式)。
          // 无命中 → 空数组(creative-context 据此退回 .list dump 降级)。
          search: async (
            c: RequestContext,
            query: string,
            opts: { limit?: number },
          ) => {
            const { hits } = await knowledgeSearchRuntime.hybridSearch(c, query);
            if (hits.length === 0) return [];
            const all = await knowledgeService.listKnowledge(c);
            const byId = new Map(all.map((k) => [k.id, k]));
            const rows: Array<{
              title: string;
              knowledgeType: string;
              usedCount?: number;
              usedInPublished?: boolean;
              sourceNote?: string | null;
            }> = [];
            const limit = opts.limit ?? 40;
            for (const h of hits) {
              const k = byId.get(h.document.entityId);
              if (!k) continue; // 命中的索引行对应的知识已删/跨号不可见 → 跳过
              rows.push({
                title: k.title,
                knowledgeType: k.knowledgeType,
                usedCount: k.usedCount,
                usedInPublished: k.usedInPublished,
                sourceNote: k.sourceNote ?? null,
              });
              if (rows.length >= limit) break;
            }
            return rows;
          },
        };
        // 立项 Brief reader(立项画幅 横/竖屏 → script.draft 据此调钩子与时长)。best-effort:读不到
        // 画幅返回 null,绝不阻塞写文案。[T-184] 从 script.draft dispatch 内联提到这里命名,供中央
        // registry 登记(逻辑与原内联逐字一致,零行为变化)。
        // [T-270] 立项 Brief reader —— 用共享工厂(单一真值,dispatch/对话两路同一读法,扩投影全字段)。
        const briefReader: ProjectBriefReader = makeBriefReader();
        // [T-184] 中央 context reader registry —— key(= ContextDeps facet 字段名)→ 已构造 reader。
        // 模板用 contextRequirements 声明要哪些源,resolveContextDeps 据此自动取 reader 组 deps,取代
        // runXxx dispatch 手列(手列漏接 = facet 恒空的根因)。本切片只让 script.draft 一条 dispatch
        // 走声明式注入(script-first 范式);其它节点仍各自手列,后续按同范式逐条迁移。ai /
        // resolveModelSpec 是非 facet 基础设施,不进 registry(组合根 always-注入)。
        const contextReaderRegistry: Partial<CreativeContextDeps> = {
          positioning: positioningReader,
          learnings: learningsReader,
          assets: assetsReader,
          accounts: accountsReader,
          signals: signalsReader,
          knowledge: knowledgeReader,
          thesis: thesisReader,
          contract: contractReader,
          outline: outlineReader,
          artifactOrigin: artifactOriginReader,
          projectMaterials: makeProjectMaterialsReader(),
          brief: briefReader,
          projectIntelligence: {
            getSourceContexts: async (c, projectId) => {
              const contexts = await projectIntelligenceReferences.getSourceContexts(c, {
                projectId,
              });
              return contexts.map((context) => ({
                item: context.item,
                transcript: {
                  text: context.transcript.text,
                  hash: context.transcript.hash,
                },
              }));
            },
          },
          // [T-271] 封面链声明 reviewSubject 以读**口播稿主张**(getScript 读 output_script 当前版本,
          // 与复盘同一读法)—— assembleCreativeContext 据此填 context.reviewScript,封面文案硬锚正片主张。
          reviewSubject: makeReviewSubjectReader(),
        };
    return { positioningReader, learningsReader, assetsReader, accountsReader, signalsReader, knowledgeReader, briefReader, contextReaderRegistry };
  })();
}
