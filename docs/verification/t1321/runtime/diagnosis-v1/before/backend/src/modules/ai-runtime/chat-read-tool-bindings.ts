import type { RequestContext } from "@creatoros/contract";
import type {ContextReaders} from "./chat-assembly-types";
import type { ChatToolDeps } from "./chat-tools";

export type ChatReadToolBindings=Pick<ChatToolDeps,
 "listProjects" | "searchProjects" | "listComments" | "searchKnowledge" | "searchMaterials" | "getProjectDetail" | "getProjectLifecycle" | "getReviewReport" | "getPositioningDetail" | "getKnowledgeDetail" | "listProjectArtifacts" | "getArtifactText" | "getArticleForImage" | "getKnowledgeText" | "listPublications" | "getMetrics" | "listLearnings" | "listCandidates" | "getPredictions" | "boundProjectId" | "publicationView" | "readCreatorOsGuide">;
/** 共享原读取绑定；构造时不读库，执行时把当前账号交给真实服务。 */
export function createChatReadToolBindings(ctx:RequestContext,readers:ContextReaders|undefined,binding:Pick<ChatToolDeps,"boundProjectId"|"publicationView"|"readCreatorOsGuide">={}):ChatReadToolBindings {
 return {
  ...binding,
    // 只读 context 工具 —— execute 直接调注入的 user-scoped 读端口(不跑模型、不产候选、不写实体)。
    // 端口未装配(contextReaders 缺省)→ 回空数组(诚实降级,绝不塞假数据),模型据此如实作答。
    listProjects: async ({ limit, offset }) => {
      if (!readers) return { rows: [], total: 0 };
      return readers.listProjects(ctx, { limit, offset });
    },
    searchProjects: async (opts) => {
      if (!readers?.searchProjects) return { rows: [], total: 0 };
      return readers.searchProjects(ctx, opts);
    },
    listComments: async ({ limit, offset }) => {
      if (!readers) return { rows: [], total: 0 };
      return readers.listComments(ctx, { limit, offset });
    },
    searchKnowledge: async ({ query, limit }) => {
      if (!readers) return [];
      return readers.searchKnowledge(ctx, { query, limit });
    },
    searchMaterials: async ({ query, limit }) => {
      if (!readers) return [];
      return readers.searchMaterials(ctx, { query, limit });
    },
    // [T-099b] 详情类 context 工具(切片二)—— execute 直接调注入的 user-scoped 详情读端口。
    // 端口未装配(contextReaders 缺省 / 具体方法缺省)→ 工具侧诚实空态(found:false / null),
    // 绝不塞假数据。全部按 ctx.userId 收窄(读端口内部据 ctx 收窄,读不到 → null/空)。
    getProjectDetail: async ({ projectId }) => {
      if (!readers?.getProjectDetail) return null;
      return readers.getProjectDetail(ctx, { projectId });
    },
    getProjectLifecycle: async ({ projectId }) => {
      if (!readers?.getProjectLifecycle) return null;
      return readers.getProjectLifecycle(ctx, { projectId });
    },
    getReviewReport: async ({ projectId, reportId }) => {
      if (!readers?.getReviewReport) return null;
      return readers.getReviewReport(ctx, { projectId, reportId });
    },
    getPositioningDetail: async () => {
      if (!readers?.getPositioningDetail) {
        return {
          profile: null,
          currentStatement: null,
          statementCount: null,
          accounts: [],
        };
      }
      return readers.getPositioningDetail(ctx);
    },
    getKnowledgeDetail: async ({ id }) => {
      if (!readers?.getKnowledgeDetail) return null;
      return readers.getKnowledgeDetail(ctx, { id });
    },
    // [T-099c] 全文类 context 工具(切片三)—— execute 调注入的 user-scoped 全文读端口。
    // 端口未装配(contextReaders 缺省 / 具体方法缺省)→ 工具侧诚实空态(found:false),
    // 绝不塞假数据。窗口截断(§3 全文档预算)由工具 execute 侧强制,读端口只回原始全文。
    listProjectArtifacts: async ({ projectId }) => {
      if (!readers?.listProjectArtifacts) return null;
      return readers.listProjectArtifacts(ctx, { projectId });
    },
    getArtifactText: async ({ projectId, artifactType }) => {
      if (!readers?.getArtifactText) return null;
      return readers.getArtifactText(ctx, { projectId, artifactType });
    },
    getArticleForImage: async ({outputId}) => {
      if(!readers?.getArticleForImage)throw new Error("ARTICLE_IMAGE_READER_UNAVAILABLE");
      return readers.getArticleForImage(ctx,{outputId});
    },
    getKnowledgeText: async ({ id }) => {
      if (!readers?.getKnowledgeText) return null;
      return readers.getKnowledgeText(ctx, { id });
    },
    // [T-099 切片四/五] 指标/发布/经验/候选/校准类 context 工具 —— execute 调注入的 user-scoped
    // 清单读端口。端口未装配(contextReaders 缺省 / 具体方法缺省)→ 工具侧诚实空态(空数组 /
    // rows 空 / rubric:null),绝不塞假数据。全部按 ctx.userId 收窄(读端口内部据 ctx 收窄)。
    listPublications: async ({ limit, offset, view }) => {
      if (!readers?.listPublications) {
        return { rows: [], total: 0 };
      }
      return readers.listPublications(ctx, { limit, offset, view });
    },
    getMetrics: async ({ projectId, limit }) => {
      if (!readers?.getMetrics) {
        return { subject: null, rows: [], retention: [] };
      }
      return readers.getMetrics(ctx, { projectId, limit });
    },
    listLearnings: async ({ query, learningType, status, limit }) => {
      if (!readers?.listLearnings) {
        return { rows: [], total: 0 };
      }
      return readers.listLearnings(ctx, {
        query,
        learningType,
        status,
        limit,
      });
    },
    listCandidates: async ({ limit, offset }) => {
      if (!readers?.listCandidates) {
        return { rows: [], total: 0 };
      }
      return readers.listCandidates(ctx, { limit, offset });
    },
    getPredictions: async ({ limit }) => {
      if (!readers?.getPredictions) {
        return { rubric: null, rows: [], total: 0 };
      }
      return readers.getPredictions(ctx, { limit });
    },
 };
}
