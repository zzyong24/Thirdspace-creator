import { type UIMessage } from "ai";
import type {ArticleImageReadable} from "./material-generation-preparation";
import type { WorkEditorTarget,WorkCreationTarget,RequestContext } from "@creatoros/contract";
import { type ContextDeps } from "./creative-context";
import { type ChatContext, type RecentTaskTruth } from "./chat-context";
import { type ProjectDetailRaw, type ProjectLifecycleRaw, type ReviewReportRaw, type PositioningDetailRaw, type KnowledgeDetailRaw, type ArtifactListRaw, type ArtifactTextRaw, type KnowledgeTextRaw, type PublicationsListRaw, type MetricsRaw, type LearningsListRaw, type CandidatesListRaw, type PredictionsRaw, type VerbatimSource } from "./chat-tools";
/** 聊天准备只读取上下文及工具配置，不持有模型或提交端口。 */
export interface AssembleChatDeps extends ContextDeps {
    assistantSystem?:import('./chat-tools').ChatToolDeps['assistantSystem'];
    readEditorTarget?:(ctx:RequestContext,target:WorkEditorTarget)=>Promise<WorkEditorTarget>;
    readCreationTarget?:(ctx:RequestContext,target:WorkCreationTarget)=>Promise<WorkCreationTarget>;
    humanizeError: (err: unknown) => {
        message: string;
        suggestSwitchModel: boolean;
    } | null;
    searchWeb?: (ctx: RequestContext, query: string, opts?: {
        count?: number;
        signal?: AbortSignal;
    }) => Promise<Array<{
        title: string;
        url: string;
        snippet: string;
        publishedAt?: string;
        siteName?: string;
    }>>;
    contextReaders?: ContextReaders;
    listRecentTasksPort?: (ctx: RequestContext) => Promise<RecentTaskTruth[]>;
}
/**
 * 只读 context 读端口集 —— 三个工具各自的真数据源。composition root 绑真实 user-scoped 读方法;
 * 单测注入 fake。全部按当前用户过滤(由绑定处的 service/repo 用 ctx.userId 收窄)。
 */
export interface ContextReaders {
    /** 列该用户最近的项目/作品(用于 context.projects)。 */
    listProjects: (ctx: RequestContext, opts: {
        limit: number;
        offset: number;
    }) => Promise<{
        rows: Array<{
            id: string;
            title: string;
            stage: string;
            status: string;
            source?: string;
            publishedAt?: string | null;
        }>;
        total: number;
    }>;
    /** [T-691] 显式历史意图使用的完整项目检索，发布时间来自 Publication 真值。 */
    searchProjects?: (ctx: RequestContext, opts: {
        query?: string;
        publishedOnly?: boolean;
        orderBy: "publishedAt" | "updatedAt";
        direction: "asc" | "desc";
        limit: number;
        excludeProjectId?: string;
    }) => Promise<{
        rows: Array<{
            id: string;
            title: string;
            stage: string;
            status: string;
            source?: string;
            publishedAt?: string | null;
        }>;
        total: number;
    }>;
    /** [T-058③] 观众评论只读(audience_signals source='comment',最新在前)。 */
    listComments: (ctx: RequestContext, opts: {
        limit: number;
        offset: number;
    }) => Promise<{
        rows: Array<{
            text: string;
            likeCount: number | null;
            source: string;
            createdAt: string;
        }>;
        total: number;
    }>;
    /**
     * [T-077b] 读某项目的选题卡现状 briefDetail(用于 brief.fill 工具结果的 `current`)。
     * 复用 projects 读 op(user-scoped);读不到(项目不存在/越权)→ null,不抛(诚实降级)。
     */
    getProjectBrief: (ctx: RequestContext, opts: {
        projectId: string;
    }) => Promise<{
        targetAudience?: string;
        contentGoal?: string;
        contentFormat?: string;
        orientation?: "landscape" | "portrait";
        targetPlatforms?: string[];
        durationEstimate?: string;
        coreMessage?: string;
        successCriteria?: string;
    } | null>;
    /** 搜该用户知识库(用于 context.knowledge)。query 空 → 回最近若干条。 */
    searchKnowledge: (ctx: RequestContext, opts: {
        query: string;
        limit: number;
    }) => Promise<Array<{
        id: string;
        title: string;
        snippet: string;
    }>>;
    /** 搜该用户素材库 assets(用于 context.materials)。query 空 → 回最近若干条。 */
    searchMaterials: (ctx: RequestContext, opts: {
        query: string;
        limit: number;
    }) => Promise<Array<{
        id: string;
        title: string;
        kind: string;
    }>>;
    /**
     * [T-523] 封面参考图的全库精确读端口。实现必须完整读取并返回图片总数；只有
     * total===1 才能确定性自动选择，不能把第一页的一张误判为全库唯一。
     */
    listCoverReferenceImages?: (ctx: RequestContext) => Promise<{
        rows: Array<{
            id: string;
            title: string;
            kind: string;
        }>;
        total: number;
    }>;
    /**
     * [T-099b] context.project.detail —— 某项目全档(brief/阶段/发布/产物索引/最新指标)。
     * composition root 复用既有公开读源(projects getProject/briefDetail + artifacts
     * listProjectArtifacts/listVersions + publishing + ReviewSubjectReader 口径的最新 snapshot)。
     * 读不到(不存在/越权)→ null(诚实降级)。可选:未装配 → 工具报「查不到」(诚实空态)。
     */
    getProjectDetail?: (ctx: RequestContext, opts: {
        projectId: string;
    }) => Promise<ProjectDetailRaw | null>;
    /** [T-691] 当前项目跨模块生命周期索引；分区失败必须显式保留在 errors。 */
    getProjectLifecycle?: (ctx: RequestContext, opts: {
        projectId: string;
    }) => Promise<ProjectLifecycleRaw | null>;
    /** [T-691] 当前或指定审核报告。 */
    getReviewReport?: (ctx: RequestContext, opts: {
        projectId: string;
        reportId?: string;
    }) => Promise<ReviewReportRaw | null>;
    /**
     * [T-099b] context.positioning.detail —— 定位母版全档(facets/downstreamRules/陈述/陈述版本数)
     * + 账号画像并入。composition root 复用 PositioningReader + AccountsReader。母版未建 → profile
     * 全空(诚实空态,不抛)。可选:未装配 → 工具报空档(诚实降级)。
     */
    getPositioningDetail?: (ctx: RequestContext) => Promise<PositioningDetailRaw>;
    /**
     * [T-099b] context.knowledge.detail —— 单条知识全字段(type/title/note/sourceNote/tags/战绩/关联)。
     * composition root 复用 knowledge getKnowledge(带 T-079c 战绩投影)+ listRevisions(正文)+
     * listRelations。读不到(不存在/越权)→ null(诚实降级)。可选:未装配 → 工具报「查不到」。
     */
    getKnowledgeDetail?: (ctx: RequestContext, opts: {
        id: string;
    }) => Promise<KnowledgeDetailRaw | null>;
    /**
     * [T-099c] context.artifacts —— 某项目产物清单(每类产物 artifactType/当前版本号/updatedAt/字数)。
     * composition root 复用 artifactsService.listProjectArtifacts + listVersions + 当前版本文本长度
     * (与 getScript 同口径)。读不到(不存在/越权)→ null(诚实降级)。可选:未装配 → 工具报「查不到」。
     */
    listProjectArtifacts?: (ctx: RequestContext, opts: {
        projectId: string;
    }) => Promise<ArtifactListRaw | null>;
    /**
     * [T-099c] context.artifact.text —— 某项目某类产物正文全文(事故二根治)。output_script 走
     * ReviewSubjectReader.getScript 同读法(transcript 优先);其它 artifactType 走当前版本 contentData
     * 正文字段。**返回原始全文**;窗口截断(§3)在工具 execute 侧强制。读不到 → null(诚实降级)。
     */
    getArtifactText?: (ctx: RequestContext, opts: {
        projectId: string;
        artifactType: string;
    }) => Promise<ArtifactTextRaw | null>;
    /** T-1023：文章配图执行时按当前账号重读专用文章 output，不从视频脚本猜正文。 */
    getArticleForImage?: (ctx: RequestContext, opts: {outputId: string}) => Promise<ArticleImageReadable>;
    /**
     * [T-099c] context.knowledge.text —— 某知识条目长文正文全文(transcript/reference/note 当前修订正文,
     * 与 knowledge.detail 的 note 同读法)。**返回原始全文**;窗口截断(§3)在工具 execute 侧强制。
     * 读不到(不存在/越权)→ null(诚实降级)。可选:未装配 → 工具报「查不到」。
     */
    getKnowledgeText?: (ctx: RequestContext, opts: {
        id: string;
    }) => Promise<KnowledgeTextRaw | null>;
    /**
     * [T-099 切片四] context.publications —— 该用户发布记录清单(平台/链接/发布时间/关联作品标题),
     * 分页。composition root 复用 publishing getRecentPublicationsWithTitle(user-scoped)。可选:
     * 未装配 → 工具读到空(诚实空态)。
     */
    listPublications?: (ctx: RequestContext, opts: {
        limit: number;
        offset: number;
        view?: "published_cover_candidates";
    }) => Promise<PublicationsListRaw>;
    /**
     * [T-099 切片四] context.metrics —— 给 projectId → 单作品指标快照 + 留存点;不给 → 账号级最近 N
     * 作品指标行。composition root 复用 analytics(snapshot 口径复用 dashboard 的 views??plays + 最新帧)。
     * 可选:未装配 → 工具读到空(诚实空态)。
     */
    getMetrics?: (ctx: RequestContext, opts: {
        projectId?: string;
        limit: number;
    }) => Promise<MetricsRaw>;
    /**
     * [T-099 切片五] context.learnings —— 经验清单(含 validated/candidate 状态)。composition root
     * 复用 learnings listLearnings(user-scoped),按 query/learningType/status 内存过滤。可选:未装配
     * → 工具读到空(诚实空态)。
     */
    listLearnings?: (ctx: RequestContext, opts: {
        query?: string;
        learningType?: string;
        status?: string;
        limit: number;
    }) => Promise<LearningsListRaw>;
    /**
     * [T-099 切片五] context.candidates —— 选题候选池清单(title/status/score/来源),分页。composition
     * root 复用 candidate listCandidates(user-scoped)。可选:未装配 → 工具读到空(诚实空态)。
     */
    listCandidates?: (ctx: RequestContext, opts: {
        limit: number;
        offset: number;
    }) => Promise<CandidatesListRaw>;
    /**
     * [T-099 切片五] context.predictions —— 预测 vs 实绩对照(prediction + calibrationResult 拼)+ 当前
     * rubric 版本摘要。composition root 复用 calibration getOverview(reflowRows/KPI)+ getCurrentRubricVersion。
     * 可选:未装配 → 工具读到空(诚实空态)。
     */
    getPredictions?: (ctx: RequestContext, opts: {
        limit: number;
    }) => Promise<PredictionsRaw>;
}
export interface ChatTurnInput {
    executionEngine?: "pi" | "codex";
    messages: UIMessage[];
    chatContext: ChatContext;
    trustedScriptSources?: readonly VerbatimSource[];
    abortSignal?: AbortSignal;
}
