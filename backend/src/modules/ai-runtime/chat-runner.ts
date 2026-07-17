import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
  type ToolSet,
  type ToolApprovalStatus,
} from "ai";
// [T-263] HITL 授权门:从已挂工具装配 streamText 的 toolApproval 配置(单一真值在 chat-tool-gate)。
import { buildChatToolApproval } from "./chat-tool-gate";
import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  formatWorksBrief,
  formatProjectStageBlock,
  type ContextDeps,
} from "./creative-context";
import {
  resolveSkillForSurface,
  applyFunctionKey,
  assembleChatSystem,
  assembleSelectionContext,
  wrapUserData,
  type ChatContext,
} from "./chat-context";
import {
  buildChatTools,
  ALL_CHAT_TOOL_NAMES,
  getSurfaceToolScope,
  type ChatToolDeps,
  type ProjectDetailRaw,
  type PositioningDetailRaw,
  type KnowledgeDetailRaw,
  type ArtifactListRaw,
  type ArtifactTextRaw,
  type KnowledgeTextRaw,
  type PublicationsListRaw,
  type MetricsRaw,
  type LearningsListRaw,
  type CandidatesListRaw,
  type PredictionsRaw,
} from "./chat-tools";
// [T-256a] 工具探测结果类型(端口契约共用)。
import type { DetectToolsResult } from "./local-env-probe";
import { buildSkillsBrief } from "@creatoros/contract";
// [T-239d] 对话历史窗口化 —— 喂模型前投影(tool-result 清体 + token 估算截窗),存储原样。
import {
  projectChatHistory,
  formatChatContextLog,
  resolveToolResultKeepTurns,
  resolveTruncateKeepTurns,
  resolveContextWindowTokens,
  dropAbandonedApprovalParts,
} from "./chat-history-window";
import { buildEnrichPrompt, parseCard } from "./topic-enrich-runner";
// [T-245] trend 出题多源装配(T-235b 信源信号 + web 搜索并行,与选题页出题同一装配器)——
// 对话编导 topic.generate(basis=trend)复用,不再空 brief 出「假热点题」。
import {
  assembleTrendBriefDetailed,
  trendQualityFromDetail,
} from "./topic-task-adapter";
// [T-238] 信号质量画像 + 评论滤噪 —— 对话编导 topic.generate 与选题页/每日出题同一装配:
// 画像段注入 prompt 动态定权;comments basis 滤噪(666/纯 emoji/夸赞不进,强信号带 ★)。
import {
  assembleSignalQualityInputs,
  buildSignalQualityProfile,
  formatFilteredSignalsBrief,
  renderSignalQualityBrief,
} from "./signal-quality";
import { createRecoveringModel } from "./llm/recovering-model";
import { resolveLlmMaxRetries } from "./llm/retry-policy";
import { buildPositioningPrompt, parseSuggestion } from "./positioning-runner";
import { parseLearnings, reviewFacets } from "./review-runner";
import { parseDiagnosis } from "./calibration-diagnose-runner";

// 上下文感知 ChatBox 的服务端装配(SPEC §3.3)—— /api/chat 路由的「大脑」,从这里调
// streamText。把路由薄壳化:路由只管鉴权 + 解析 body + 持久化;真正的「resolve skill →
// 注入 CreativeContext facets → 挂工具 → streamText」装配逻辑在此,故可单测(SPEC §7
// 「/api/chat 装配:resolve skill + 注入 context + tools 挂载」)。
//
// 铁律:全程 Vercel AI SDK(streamText + 工具);提示词 / 工具白名单 / 输出契约走 registry
// (别内联);工具结果 = 候选(execute 复用现有 runner 核心,不直接写实体)。

export interface AssembleChatDeps extends ContextDeps {
  /** [T-163] 错误→人话端口,透传给 chat-tools(host=route 传前端 humanizeAiError;该 lib 含
   *  ArtifactType 依赖故留前端,经端口注入不跨包)。 */
  humanizeError: (
    err: unknown,
  ) => { message: string; suggestSwitchModel: boolean } | null;
  /** 按 capability 解析用户配的 model(复用 persistence-client 的 resolveModelSpec)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
  /**
   * [T-239b S1] 备用对话模型端口(可选)—— **只认 `chat.fallback` 专配行**(不回退 default/env,
   * 否则「备用」会解析成主模型自己);未配返 null。主模型流开始前可重试错误耗尽时,chat-runner
   * 用它换备用模型再启动一次(模型用户可配的铁律 —— 绝不写死 fallback 厂商)。
   */
  resolveFallbackModelSpec?: (
    ctx: RequestContext,
  ) => Promise<ModelSpec | null>;
  /**
   * [T-084a] 联网检索端口(可选)—— gatherMaterials 的「先真联网检索」用。由 composition root
   * (persistence-client)绑:内部 resolveSearchSpec(web.search)+ 按 provider 分派 REST adapter。
   *   - probeSearchConfigured: 探测用户是否配了 web.search(honestyBlock 第 6 条 + 工具动态描述用),
   *     不打网络、只查配置;未装配 → 视为未配(诚实降级)。
   *   - searchWeb: 真执行一次联网检索,返 SearchResult[];未配抛 SearchConfigError、检索失败抛
   *     SearchExecutionError,由 gatherMaterials catch 成 model_memory 降级(不 crash)。
   * 两者都可选:未装配时 gatherMaterials 走纯记忆(与今天现状一致),honestyBlock 注未配措辞。
   */
  probeSearchConfigured?: (ctx: RequestContext) => Promise<boolean>;
  searchWeb?: (
    ctx: RequestContext,
    query: string,
    opts?: { count?: number },
  ) => Promise<
    Array<{
      title: string;
      url: string;
      snippet: string;
      publishedAt?: string;
      siteName?: string;
    }>
  >;
  /**
   * 只读 context 读端口(供 context.projects / context.knowledge / context.materials 工具)。
   * **只读、按 ctx.userId 过滤**,由 composition root(persistence-client)绑到 user-scoped 读源
   * (projects repo / knowledge service / assets service)。可选:未装配时对应工具读到空(诚实降级,
   * 不塞假数据)。与 CreativeContext 的 facet reader 不同 —— 这些是「用户问才实时拉」的按需读。
   */
  contextReaders?: ContextReaders;
  /**
   * [T-084b] material.screenshot 端口 —— 真开无头浏览器给公开 URL 截图 → createGeneratedAsset
   * 落库(带 sourceUrl 存证)→ 返回落库 asset 摘要 + 签名预览 URL。由 composition root 绑
   * (captureUrl + assetsService.createGeneratedAsset + downloadUrl)。截图/落库失败**抛错**,
   * 由工具 execute 接住转人话。可选:未装配 → 工具报「截图能力未接入」(诚实降级)。
   * [T-239c] input.signal(additive):用户中断本轮 → Playwright 导航/截图提前退出,不空烧。
   */
  captureScreenshotPort?: (
    ctx: RequestContext,
    input: { url: string; fullPage?: boolean; signal?: AbortSignal },
  ) => Promise<{
    assetId: string;
    name: string;
    previewUrl: string | null;
    sourceUrl: string;
  }>;
  /**
   * [T-217c] web.read 端口 —— 带 `.auth/web` 登录态读一个 URL 的正文全文 → createGeneratedAsset
   * 落**逐字稿文本素材**(pending 走确认门,带 sourceUrl)。无会话/过期 → 返回 { needLogin, domain }
   * (编导引导「去保管库登录」,不落库、不截登录页)。由 composition root 绑(readUrl + assetsService)。
   * 可选:未装配 → 工具报「网页正文读取能力未接入」(诚实降级)。
   * [T-239c] input.signal(additive):用户中断本轮 → 带登录态浏览器导航/抽取提前退出。
   */
  readWebUrlPort?: (
    ctx: RequestContext,
    input: { url: string; signal?: AbortSignal },
  ) => Promise<
    | {
        needLogin: false;
        assetId: string;
        name: string;
        previewUrl: string | null;
        sourceUrl: string;
        title: string;
        excerpt: string;
        extractor: string;
        /** [T-237] 抽到的对话轮次数(非对话页 null/缺省)。 */
        turnCount?: number | null;
        /** [T-237] 抽取诊断人话(「抽到 N 轮(SSR 全量/DOM 可能不全)」);非对话页 null/缺省。 */
        extraction?: string | null;
        /** [T-251] 正文全文(未截断)—— 工具 execute 侧按窗返回;旧端口缺省 → 工具退回 excerpt。 */
        fullText?: string | null;
        /** [T-251] true = 命中已落库同 URL 正文素材(未重新抓取)。 */
        fromCache?: boolean;
      }
    | { needLogin: true; domain: string }
  >;
  /**
   * [T-253] local.read 端口 —— 读用户本机文件(任意路径 + 运行时逐次授权)。composition root
   * (persistence-client)绑:路径归一/realpath + 敏感 denylist 硬门 + 授权表(内存一次授权 +
   * 持久化「总是允许该目录」)+ 大小/二进制门 + 目录 listing。四态返回(见 ChatToolDeps.readLocal);
   * IO 级失败抛错由工具 execute 接住转 error。可选:未装配 → 工具报「本地读取能力未接入」。
   */
  readLocalFilePort?: (
    ctx: RequestContext,
    input: { path: string; signal?: AbortSignal },
  ) => Promise<
    | { status: "needApproval"; path: string; size: number | null; type: string }
    | { status: "denied"; path: string; reason: string }
    | { status: "file"; path: string; name: string; fullText: string }
    | {
        status: "dir";
        path: string;
        entries: Array<{ name: string; kind: "file" | "dir"; size: number | null }>;
        total: number;
      }
    // [T-262] 文件名搜索兜底两态(精确路径解析不到时按 basename 搜 scoped 目录集)。
    | {
        status: "nameMatch";
        requestedName: string;
        path: string;
        size: number | null;
        type: string;
      }
    | {
        status: "nameCandidates";
        requestedName: string;
        items: Array<{ path: string; size: number | null; type: string }>;
        truncated: boolean;
      }
  >;
  /**
   * [T-263] local.read 授权**判定**端口(HITL 门用,与执行读取 readLocalFilePort 拆开)—— 只跑
   * 归一/realpath/敏感/授权表判定,不读内容、不消费一次授权。composition root(persistence-client)
   * 绑 decideLocalReadAccess。可选:未装配 → local.read 无授权门(工具回落既有 needApproval 四态)。
   */
  decideLocalReadAccessPort?: (
    ctx: RequestContext,
    input: { path: string },
  ) => Promise<
    | { status: "needApproval" }
    | { status: "denied"; reason: string }
    | { status: "granted" }
  >;
  /**
   * [T-256a] local.tools 端口 —— 探测系统已装工具(ffmpeg/node/python3/git…)。composition root
   * (persistence-client)绑:白名单过滤(resolveToolsToProbe)→ 固定 arg 数组 spawn which/--version
   * → parseToolVersion。只读探测、不执行任意命令。可选:未装配 → 工具报「环境探测能力未接入」。
   */
  detectToolsPort?: (
    ctx: RequestContext,
    input: { tools?: string[] },
  ) => Promise<DetectToolsResult>;
  /**
   * [T-256a] local.workspace 端口 —— 列该用户「总是允许该目录」授权过的本地目录根(复用 T-253
   * 授权表 local-read-grants,不新建授权机制)。composition root 绑 listAlwaysDirs(ctx.userId)。
   * 可选:未装配 → 工具报「工作区感知能力未接入」(诚实降级)。
   */
  listAuthorizedDirsPort?: (ctx: RequestContext) => Promise<{ dirs: string[] }>;
  /**
   * [T-084c] material.generate 端口 —— dispatch 既有 asset.generate task(persistence-client
   * dispatch → void runAssetGenerate 范式),立即返回 taskId(不阻塞对话回合)。由 composition
   * root 绑(ai transport 的 ai.tasks.create,复用既有 asset.generate 分派链)。可选:未装配 →
   * 工具报「生成能力未接入」(诚实降级)。
   */
  dispatchGenerateAssetPort?: (
    ctx: RequestContext,
    input: { kind: "image" | "video"; prompt: string; projectId?: string | null },
  ) => Promise<{ taskId: string }>;
  /**
   * [T-103b] review.script 端口 —— dispatch 既有 script.review ai_task(复用 T-086 审核链路:
   * L1 违禁词 lint + L2 豆包语义审 → 落 script_review_reports,别重造),立即返回 taskId(不阻塞
   * 对话回合)。由 composition root 绑(reviewGateService.triggerReview,同稿面「审核」按钮的旧
   * trigger 链路)。可选:未装配 → 工具报「审核能力未接入」(诚实降级)。
   */
  dispatchScriptReviewPort?: (
    ctx: RequestContext,
    input: { projectId: string },
  ) => Promise<{ taskId: string }>;
  /**
   * [T-265] planning.thesis 端口 —— dispatch 既有 planning.thesis ai_task(复活孤儿
   * runPlanningThesis:persistence-client dispatch → 声明式 context 注入的接地模板),立即返回
   * taskId(不阻塞对话回合;论点树生成重,同步会超时)。绑定层先 ensure 项目的 thesis_tree
   * artifact 并把 artifactId 写进 task.inputData(采纳时 append 新版本挂进「论点骨架」面板)。
   * 由 composition root 绑(ai transport 的 ai.tasks.create + artifactsService)。可选:未装配 →
   * 工具报「论点树能力未接入」(诚实降级)。
   */
  dispatchPlanningThesisPort?: (
    ctx: RequestContext,
    input: { projectId: string; topic?: string },
  ) => Promise<{ taskId: string }>;
  /**
   * [T-271] cover.generate 端口 —— dispatch 既有 cover.generate ai_task(void runCoverGenerate:
   * 结构化封面方案硬锚立项 brief/口播稿 → 文案诚实门 → 结构化组装生图 prompt → image.generate 生图),
   * 立即返回 taskId(不阻塞对话回合;封面链跑文本 + 生图,分钟级)。绑定层把 projectId 写进
   * task.inputData(采纳时既有 asset 采纳门把封面图绑进项目用料链)。由 composition root 绑(ai
   * transport 的 ai.tasks.create)。可选:未装配 → 工具报「封面生成能力未接入」(诚实降级)。
   */
  dispatchGenerateCoverPort?: (
    ctx: RequestContext,
    // [T-380] referenceAssetId = 以图生图风格参考(素材库 asset id;绑定层写进 task.inputData,
    // cover-runner host 侧读字节喂生图 adapter 的 image-to-image)。可选,不传行为不变。
    input: { projectId: string; topic?: string; referenceAssetId?: string },
  ) => Promise<{ taskId: string }>;
  /**
   * [T-268] script.draft 端口 —— dispatch 既有异步 runner runScriptDraft(script-runner.ts,复活
   * 孤儿;整稿分钟级不能 inline 阻塞对话回合)。绑定层先 ensure 项目的 output_script artifact 并把
   * artifactId 写进 task.inputData(采纳时 append 新版本 → 稿面编辑器读回),再 createTask。由
   * composition root 绑(ai transport 的 ai.tasks.create + artifactsService)。可选:未装配 →
   * 工具报「整稿能力未接入」(诚实降级)。
   */
  dispatchScriptDraftPort?: (
    ctx: RequestContext,
    input: { projectId: string; topic?: string; angle?: string; extraBrief?: string },
  ) => Promise<{ taskId: string }>;
  /**
   * [T-350a] publish.package 端口 —— dispatch 既有 publish.platform_adapt runner(单平台抖音,
   * platform.adapt 模板已内嵌 cheat-package 发布审核 SOP)。绑定层先过空稿诚实门 + ensure 内容产出
   * 挂点 outputId(采纳时 createPublicationFromDraft 在其下铸真 Publication),再 createTask。由
   * composition root 绑。可选:未装配 → 工具报「发布物料能力未接入」(诚实降级)。
   */
  dispatchPublishPackagePort?: (
    ctx: RequestContext,
    input: { projectId: string; topic?: string },
  ) => Promise<{ taskId: string }>;
  /**
   * [T-385] project.transcribe 端口 —— 复用 T-374 的 projects.transcribe composition-only
   * 链(解析该项目 platformRef 抖音锚 → ai transport 排单条 transcribe.douyin → live dispatch
   * 后台跑;无锚 → ValidationError 诚实拒,由工具层接住转 error)。由 composition root 绑
   * (persistence-client 的 projectsWithTranscribe transport)。可选:未装配 → 工具报
   * 「抓逐字稿能力未接入」(诚实降级)。
   */
  dispatchProjectTranscribePort?: (
    ctx: RequestContext,
    input: { projectId: string },
  ) => Promise<{ taskId: string }>;
}

/**
 * 只读 context 读端口集 —— 三个工具各自的真数据源。composition root 绑真实 user-scoped 读方法;
 * 单测注入 fake。全部按当前用户过滤(由绑定处的 service/repo 用 ctx.userId 收窄)。
 */
export interface ContextReaders {
  /** 列该用户最近的项目/作品(用于 context.projects)。 */
  listProjects: (
    ctx: RequestContext,
    opts: { limit: number; offset: number },
  ) => Promise<{
    rows: Array<{
      id: string;
      title: string;
      stage: string;
      status: string;
      publishedAt?: string | null;
    }>;
    total: number;
  }>;
  /** [T-058③] 观众评论只读(audience_signals source='comment',最新在前)。 */
  listComments: (
    ctx: RequestContext,
    opts: { limit: number; offset: number },
  ) => Promise<{
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
  getProjectBrief: (
    ctx: RequestContext,
    opts: { projectId: string },
  ) => Promise<{
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
  searchKnowledge: (
    ctx: RequestContext,
    opts: { query: string; limit: number },
  ) => Promise<Array<{ id: string; title: string; snippet: string }>>;
  /** 搜该用户素材库 assets(用于 context.materials)。query 空 → 回最近若干条。 */
  searchMaterials: (
    ctx: RequestContext,
    opts: { query: string; limit: number },
  ) => Promise<Array<{ id: string; title: string; kind: string }>>;
  /**
   * [T-099b] context.project.detail —— 某项目全档(brief/阶段/发布/产物索引/最新指标)。
   * composition root 复用既有公开读源(projects getProject/briefDetail + artifacts
   * listProjectArtifacts/listVersions + publishing + ReviewSubjectReader 口径的最新 snapshot)。
   * 读不到(不存在/越权)→ null(诚实降级)。可选:未装配 → 工具报「查不到」(诚实空态)。
   */
  getProjectDetail?: (
    ctx: RequestContext,
    opts: { projectId: string },
  ) => Promise<ProjectDetailRaw | null>;
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
  getKnowledgeDetail?: (
    ctx: RequestContext,
    opts: { id: string },
  ) => Promise<KnowledgeDetailRaw | null>;
  /**
   * [T-099c] context.artifacts —— 某项目产物清单(每类产物 artifactType/当前版本号/updatedAt/字数)。
   * composition root 复用 artifactsService.listProjectArtifacts + listVersions + 当前版本文本长度
   * (与 getScript 同口径)。读不到(不存在/越权)→ null(诚实降级)。可选:未装配 → 工具报「查不到」。
   */
  listProjectArtifacts?: (
    ctx: RequestContext,
    opts: { projectId: string },
  ) => Promise<ArtifactListRaw | null>;
  /**
   * [T-099c] context.artifact.text —— 某项目某类产物正文全文(事故二根治)。output_script 走
   * ReviewSubjectReader.getScript 同读法(transcript 优先);其它 artifactType 走当前版本 contentData
   * 正文字段。**返回原始全文**;窗口截断(§3)在工具 execute 侧强制。读不到 → null(诚实降级)。
   */
  getArtifactText?: (
    ctx: RequestContext,
    opts: { projectId: string; artifactType: string },
  ) => Promise<ArtifactTextRaw | null>;
  /**
   * [T-099c] context.knowledge.text —— 某知识条目长文正文全文(transcript/reference/note 当前修订正文,
   * 与 knowledge.detail 的 note 同读法)。**返回原始全文**;窗口截断(§3)在工具 execute 侧强制。
   * 读不到(不存在/越权)→ null(诚实降级)。可选:未装配 → 工具报「查不到」。
   */
  getKnowledgeText?: (
    ctx: RequestContext,
    opts: { id: string },
  ) => Promise<KnowledgeTextRaw | null>;
  /**
   * [T-099 切片四] context.publications —— 该用户发布记录清单(平台/链接/发布时间/关联作品标题),
   * 分页。composition root 复用 publishing getRecentPublicationsWithTitle(user-scoped)。可选:
   * 未装配 → 工具读到空(诚实空态)。
   */
  listPublications?: (
    ctx: RequestContext,
    opts: { limit: number; offset: number },
  ) => Promise<PublicationsListRaw>;
  /**
   * [T-099 切片四] context.metrics —— 给 projectId → 单作品指标快照 + 留存点;不给 → 账号级最近 N
   * 作品指标行。composition root 复用 analytics(snapshot 口径复用 dashboard 的 views??plays + 最新帧)。
   * 可选:未装配 → 工具读到空(诚实空态)。
   */
  getMetrics?: (
    ctx: RequestContext,
    opts: { projectId?: string; limit: number },
  ) => Promise<MetricsRaw>;
  /**
   * [T-099 切片五] context.learnings —— 经验清单(含 validated/candidate 状态)。composition root
   * 复用 learnings listLearnings(user-scoped),按 query/learningType/status 内存过滤。可选:未装配
   * → 工具读到空(诚实空态)。
   */
  listLearnings?: (
    ctx: RequestContext,
    opts: {
      query?: string;
      learningType?: string;
      status?: string;
      limit: number;
    },
  ) => Promise<LearningsListRaw>;
  /**
   * [T-099 切片五] context.candidates —— 选题候选池清单(title/status/score/来源),分页。composition
   * root 复用 candidate listCandidates(user-scoped)。可选:未装配 → 工具读到空(诚实空态)。
   */
  listCandidates?: (
    ctx: RequestContext,
    opts: { limit: number; offset: number },
  ) => Promise<CandidatesListRaw>;
  /**
   * [T-099 切片五] context.predictions —— 预测 vs 实绩对照(prediction + calibrationResult 拼)+ 当前
   * rubric 版本摘要。composition root 复用 calibration getOverview(reflowRows/KPI)+ getCurrentRubricVersion。
   * 可选:未装配 → 工具读到空(诚实空态)。
   */
  getPredictions?: (
    ctx: RequestContext,
    opts: { limit: number },
  ) => Promise<PredictionsRaw>;
}

// 各 ChatBox skill 的「主能力档」—— 基础模型按它解析(各 surface 复用对应节点的模型配置,
// 与一键岛同一引擎)。各工具 exec 内再按自己的 capability 解析(允许不同工具配不同模型)。
const SKILL_PRIMARY_CAPABILITY: Record<string, string> = {
  "chatbox.topic": "topic.generate",
  "chatbox.calibration": "calibration.diagnose",
  "chatbox.positioning": "positioning.generate",
  "chatbox.review": "review.insights",
  // [T-094] 蒸馏对话面:基础档 + 工具都走 knowledge.distill capability(与倾倒场旧管线同档)。
  "chatbox.distill": "knowledge.distill",
};

// 通用维度评分标准(对话里没有绑定 rubric reader 时的诚实降级)—— 让 calibration.diagnose 工具
// 在 free-chat 也能逐维度盲评。一键岛带 subject 时仍走这套通用维度(对话不接库内 rubric reader,
// 避免跨模块直连 repo;真·按用户 rubric 的诊断在工作台 StartPredictionButton 那条任务链上)。
const GENERIC_RUBRIC_DIMENSIONS: ReadonlyArray<{
  key: string;
  label: string;
  description: string;
}> = [
  { key: "hook", label: "开头钩子", description: "前 3 秒能否抓住注意力" },
  { key: "value", label: "价值密度", description: "信息/情绪价值是否扎实" },
  { key: "structure", label: "结构节奏", description: "推进是否清晰不拖沓" },
  { key: "audience_fit", label: "人群契合", description: "是否打中目标受众的痛点" },
  { key: "conversion", label: "转化引导", description: "是否自然引导到信任/转化" },
];

// [T-081①] 产内容工具的 extraBrief 统一注入段头 —— 对话中获得的补充指令/洞察进生成 prompt 的
// 段标题(各工具/facet 同一措辞,单一真值)。导出供各 runner facet 拼装与单测锚定。
export const EXTRA_BRIEF_HEADING = "【本次生成指令(来自对话,优先遵循)】";

// [T-081②] positioning.generate 的真实作品画像 —— formatWorksBrief 已移到 creative-context
// (对话工具 + 后台 task 两条定位生成路径共用,单一真值);此处再导出保持既有 import 面不变。
export { formatWorksBrief, WORKS_BRIEF_MAX_ROWS } from "./creative-context";

// [T-081①] script.hooks 的 prompt 拼装 —— 从 generateHooks 内联提出为纯函数(可单测):
// extraBrief 段(空则整段省略)。
// [T-269/T-270] 接地根修复:hook 是**最悬空**的生成环(审计定位「22 个 AI」假钩子源头)。补三样:
//   ① projectBriefHard(立项硬锚,项目态):钩子主张锚定钦定核心信息、别硬塞 brief 明禁的角度;
//   ② userMaterialHard/Ref(用户素材=弹药):钩子有据可溯而非脑补;
//   ③ antiFabrication(可溯硬约束段,单一真值 grounding-facets.ANTI_FABRICATION_CLAUSE):
//      「数据冲击」类钩子的具体数字必须可溯,不可溯则不写——治「凭空造数字撑反共识钩子」。
// 调用方(generateHooks)从 CreativeContext 取素材/brief、从 ai-worker 动态取 antiFabrication 常量传入。
export function buildHooksPrompt(input: {
  topic: string;
  direction?: string;
  extraBrief?: string;
  positioningBrief: string;
  projectBriefHard?: string;
  userMaterialHard?: string;
  userMaterialRef?: string;
  antiFabrication?: string;
  /** [T-355] 观众心智预设写法纪律段(单一真值 AUDIENCE_MINDSET_CLAUSE,调用方从 ai-worker 取)。 */
  audienceMindset?: string;
}): string {
  return [
    "为这条短视频内容生成 4 条口播开场 hook 候选(前 3 秒抓注意力的第一句话)。",
    input.topic
      ? `内容主题:《${input.topic}》`
      : "内容主题:见下方创作者定位,选最有张力的切入。",
    input.positioningBrief
      ? `创作者定位:
${input.positioningBrief}`
      : "",
    // [T-270] 立项硬锚(项目态):钩子必须与核心信息一致、遵守内容目标的『避免X』负向约束。
    input.projectBriefHard ? `\n${input.projectBriefHard}` : "",
    // [T-269] 用户素材=可溯弹药:钩子里的事实/数字优先从这里取(有出处才敢写)。
    input.userMaterialHard ? `\n${input.userMaterialHard}` : "",
    input.userMaterialRef
      ? `\n【参考素材(AI 搜集,参考级)】\n${input.userMaterialRef}`
      : "",
    input.direction ? `方向要求:${input.direction}` : "",
    input.extraBrief ? `${EXTRA_BRIEF_HEADING}\n${input.extraBrief}` : "",
    '4 条彼此切角不同(如:反常识断言 / 数据冲击 / 场景代入 / 利益承诺)。每条 ≤40 字,口语化,不要书面腔。选「数据冲击」角度时,数字必须能追溯到上方素材/定位/立项资料原文;追溯不到就不用具体数字,改用可溯的反差或场景。',
    // [T-355] 观众心智预设写法纪律(单一真值 AUDIENCE_MINDSET_CLAUSE):钩子是最贴观众的一句,
    // 归因外置铁律在此最要紧(激将式钩子=高危区)。
    input.audienceMindset ? `\n${input.audienceMindset}` : "",
    // [T-269] 可溯硬约束段(下沉自对话外层 honesty rule #9,单一真值)。
    input.antiFabrication ? `\n${input.antiFabrication}` : "",
    '只输出 JSON 数组,形如 [{"text":"hook 文案","angle":"切角名"}],不要多余文字。',
  ]
    .filter(Boolean)
    .join("\n");
}

// 解析结果:路由把它交给 streamText 的 stream 喂回前端 + 落库。导出供单测断言「选对 skill /
// 注入了 facets / 挂对了 tools」而不真跑模型(单测注入 fake streamText 不便,故拆出
// buildChatAssembly 只做装配、不调网络,由它单测;runChatStream 串起 streamText)。
export interface ChatAssembly {
  skillId: string;
  system: string;
  tools: ToolSet;
  modelSpec: ModelSpec;
  /**
   * [T-117 确定性修] functionKey 命中真工具(深链/按钮明确要某工具,如「补全选题卡」→
   * `topic.enrich`)时,本轮**强制**模型调该工具 —— 光靠 skill 提示词压不住弱 tool-calling
   * 的模型(它会把卡当文本吐 + 谎称已渲卡)。runChatStream 用 prepareStep 在第 0 步 toolChoice
   * 强制它,之后步恢复 auto。undefined = 不强制(自由对话)。
   */
  forcedTool?: string;
  /**
   * [T-263] SDK 原生工具授权(HITL)配置 —— 从已挂工具收录登记了授权判定器的工具(当前仅
   * local.read)装配的 per-tool 判定映射,喂给 streamText 的 `toolApproval`。undefined = 本轮无
   * 需授权门的工具(streamText 不传该配置,行为与旧一致)。
   */
  toolApproval?: Record<string, (input: unknown) => Promise<ToolApprovalStatus>>;
}

/**
 * 纯装配(不调模型)—— resolve skill(surface 层)→ 装配 CreativeContext facets(数据层)→
 * 拼 system → 按 skill 白名单挂工具(工具白名单层)。单测直接断言它的产物。
 *
 * 工具 execute 复用现有 runner 核心(runTopicNode / 选题卡补全),都在请求期用解析好的 model
 * 跑;故这里先解析 model(没配 key 抛 LlmCredentialError,由路由接住返 4xx,不假成功)。
 */
export async function buildChatAssembly(
  ctx: RequestContext,
  chatContext: ChatContext,
  deps: AssembleChatDeps,
): Promise<ChatAssembly> {
  // 1) 页面层:surface → 基础 skill。
  const skillId = resolveSkillForSurface(chatContext.surface);

  // 2) registry 取 skill(模板 system + 工具白名单)。懒加载 ai-worker(AI SDK 不进顶层 bundle)。
  const {
    getTemplate,
    getTools,
    modelFor,
    runTopicNode,
    runTemplatedNode,
  } = await import("@creatoros/ai-worker");
  const skill = getTemplate(skillId);

  // [T-240①] 阶段判据(动态层):项目对话读该项目的 stage + 发布状态(getProjectDetail 读端口
  // 已在 composition root 绑好,不新造)。best-effort:读不到/端口未装配 → null(不注阶段块、
  // 场景白名单不做阶段收窄,兜底不破坏)。用途:①渲成「当前项目阶段」system 块(创作前 vs 已发布,
  // 治「创作前项目被按复盘套路要逐字稿」实录病例);②喂 getSurfaceToolScope 做阶段感知工具收窄。
  let projectStage: { stage: string; published: boolean } | null = null;
  if (chatContext.projectId && deps.contextReaders?.getProjectDetail) {
    try {
      const detail = await deps.contextReaders.getProjectDetail(ctx, {
        projectId: chatContext.projectId,
      });
      if (detail) {
        projectStage = {
          stage: detail.stage,
          published: detail.publish.published,
        };
      }
    } catch {
      projectStage = null; // 阶段判据是 best-effort 增强,读失败绝不阻断装配
    }
  }

  // 工具层(SPEC §3.2 第 1+2 层 + [T-240③] 场景真收窄):
  //   1. 场景白名单:surface 声明允许工具集(getSurfaceToolScope);未知 surface(global/兜底)
  //      → 回落全量(向后兼容)。project surface 阶段感知:明确未发布 → 砍 review.analyze。
  //   2. functionKey(深链按钮的显式用户意图)命中真工具但被场景砍掉 → 补回白名单尾部,保
  //      T-231⑨ 强制置顶机制(forcedTool 依赖 toolWhitelist.includes)不受场景收窄影响。
  //   3. 排序:skill preferred(registry getTools + applyFunctionKey 置顶)在前,其余场景白名单
  //      工具在后(skillsBrief 也按此列)。
  const scopedNames = getSurfaceToolScope(chatContext.surface, {
    projectPublished: projectStage ? projectStage.published : null,
  });
  const baseAllowed = scopedNames ?? ALL_CHAT_TOOL_NAMES;
  const allowedNames =
    chatContext.functionKey &&
    ALL_CHAT_TOOL_NAMES.includes(chatContext.functionKey) &&
    !baseAllowed.includes(chatContext.functionKey)
      ? [...baseAllowed, chatContext.functionKey]
      : baseAllowed;
  const preferredTools = applyFunctionKey(
    getTools(skillId),
    chatContext.functionKey,
  ).filter((n) => allowedNames.includes(n));
  const toolWhitelist = [
    ...preferredTools,
    ...allowedNames.filter((n) => !preferredTools.includes(n)),
  ];

  // 3) 解析 model。基础档按 skill 主能力解析(chatbox.topic/review/positioning 复用各自
  //    主工具的配置档);各工具 exec 内按自己的 capability 再解析(不同工具可配不同模型)。
  const skillCapability = SKILL_PRIMARY_CAPABILITY[skillId] ?? "topic.generate";
  const modelSpec = await deps.resolveModelSpec(ctx, skillCapability);
  const model = modelFor(modelSpec);

  // 4) 数据层:装配 CreativeContext facets(定位 / 飞轮 / 受众信号 / 知识库 / 复盘作品真材料),
  //    注进 system。T-039a:把 chatContext.projectId 真正传下去(原写死 null → 复盘/项目相关
  //    facet 永远读不到本项目),让复盘路径能拿到这条作品的真文案/标题/数据/评论;topic 从选中态
  //    标题(工作台一键岛带进来的作品标题)派生(不再恒 ""),让账号级兜底也有真主题可用。
  const context = await assembleCreativeContext(
    ctx,
    {
      projectId: chatContext.projectId ?? null,
      topic: chatContext.selection?.label?.trim() ?? "",
    },
    deps,
  );
  // 数据层 + 选中态层(T-027):先拼 CreativeContext facets,再接上"本次对话针对的选中内容"块 ——
  // 让模型一进来就知道用户"这条"指哪条,不再瞎答/反复索要标题。
  // T-039b per-action 注入矩阵:定位对话(chatbox.positioning)额外注入账号画像 accountsBrief
  // ——定位提案要立足「这个人在平台上已经是谁」;其它 surface 不注(避免账号噪声)。
  const baseSystem = assembleChatSystem(skill.system, context, {
    includeAccounts: skillId === "chatbox.positioning",
  });
  // [T-084a] 联网检索配置探测(honestyBlock 第 6.5 条 + material.gather 工具动态描述用)。
  // 只查配置、不打网络;端口未装配(probeSearchConfigured 缺省)或探测抛错 → 视为未配(诚实降级)。
  let searchConfigured = false;
  if (deps.probeSearchConfigured) {
    try {
      searchConfigured = await deps.probeSearchConfigured(ctx);
    } catch {
      searchConfigured = false;
    }
  }
  // [T-058①B / T-240②] 能力边界诚实(实录复盘:模型口头宣称「已采纳写入定位母版」但 DB 未动):
  // 写库只经工具产卡+用户点采纳;禁止假承诺;工具带分页限制时如实说明。
  // [T-240②] 规则带作用域:分「全局条款」(1-10,任何场景都生效:不假承诺/不编数字/指针权/
  // 论点树铁律…)与「场景条款」(S1/S2,只对对应场景生效)。治的实录病例:原第 9 条无稿门不带
  // 作用域 → 创作前项目立论点也被它压住,编导「脚下没土立不起来」要用户贴逐字稿。
  const honestyBlock = [
    "【能力边界 —— 全局条款,任何场景都必须遵守】",
    "1. 你对任何数据的写入都只有一条路径:调用对应工具产出候选卡,由用户点卡上的「采纳/写入」按钮完成。你自己没有直接写库能力。",
    "2. 绝不口头宣称「已写入/已采纳/已保存」—— 除非你看到用户明确说 TA 已点过采纳按钮。用户想落库时,引导 TA:先让你调工具产卡,再点卡上的按钮。",
    "3. 用户要新定位 → 必须调 positioning.generate 工具(产带采纳按钮的卡),不要只在文本里写定位 —— 文本无法被采纳。",
    "4. 工具有分页/条数上限时,如实告知拿到了多少、还有没有更多,不要谎称已看全部。",
    // [T-081⑤] 边界诚实:不许把「工具做不到的操作」包装成可选项摆给用户(实录:模型给用户
    // 列了不存在的操作选项 → 用户点了 = 死路)。
    "5. 绝不向用户提供你的工具不具备的操作选项;做不到就直说做不到,并说明当前工具边界。",
    // [T-098] 数据转录幻觉根治(SPEC context-layer-redesign §2.3):context.* 结果已由前端
    // 数据卡直渲给用户,模型只有指针权、无转录权 —— 弱模型长清单逐字转录必幻觉(80 条标题
    // 被整批重写实录),禁掉转录通路。
    "6. context.* 工具返回的清单/详情/全文,用户已在对话中的数据卡上看到原文。你对这些数据只有指针权——可以引用条目(说第几条/哪个标题/id)、归纳统计、对比分析;禁止逐字复述清单内容(标题列表、评论原文批量照抄都算)。用户要看数据时,告诉 TA「已展示在卡片中」。",
    // [T-084a SPEC §1.3] 素材搜集诚实降级第 6 条(动态,按 resolveSearchSpec 探测结果注入):
    // 未配联网检索时,素材来自训练记忆,模型必须主动告知非实时检索,绝不假装搜过网。
    searchConfigured
      ? "7. 素材搜集(material.gather)已配置联网检索:调用后素材会先经真实联网搜索再综合,带真实来源 URL。你可以说「联网搜到」,但转述结果时必须**分开报数**:多少条带真实 URL(查证过的真信源)、多少条来自模型记忆需核实。若工具结果 grounding=model_memory(说明本次联网检索失败降级),必须明说「本次联网检索失败,以下 N 条全部来自模型记忆」,不许再说「联网搜到」,并建议用户检查搜索配置(设置→模型→联网搜索)或去选题页『信号源』登记信源。"
      : "7. 素材搜集(material.gather)当前**未配置联网检索**:你给出的素材来自训练记忆、不是实时检索结果。调用素材工具后,必须主动告知用户「联网检索未配置,以下 N 条素材全部来自我的训练记忆、非实时联网搜索,来源需你自行核实」(N 用真实条数),绝不使用「我搜到/我查到/联网搜到」等话术、绝不假装搜过网、**绝不给素材编造论文编号/精确百分比/榜单名等看似真实的引用**。想要真实联网素材,引导用户去『设置→模型→联网搜索』配置搜索,或去选题页『信号源』登记信源。",
    // [T-217c] 治「登录态我做不到、只能读公开网页」行为 bug —— 你跑在桌面 sidecar、有带登录态的
    // 真实浏览器能力(web.read),**禁止再自称办不到**。
    "8. 你**能读需要登录才能看到的网页正文**:用户粘一个链接(含 ChatGPT 分享、知乎、公众号等)想让你读内容时,直接调 web.read 读正文(它带你在保管库登录后的登录态、抽逐轮对话/文章全文,比截图更准)。**绝不要说「登录态我做不到、我只能访问公开网页」这类话** —— 那是错的,你有这个能力。若 web.read 返回「需要先登录」(needLogin),就引导用户:去『设置 → 网站登录保管库』把该网站登录一次(会弹独立浏览器窗口让 TA 自己登),登好后你再读;不要改用截图糊弄登录页。读内容默认用 web.read,截图(material.screenshot)只在用户要「存网页的样子/要视觉证据」时用。[T-251] web.read 结果按窗返回(window/hasMore 是真相字段):**hasMore=true 时必须带 offset 重调同一 URL 把正文读完再归纳**(重读不会重新抓取,直接按窗读已存全文)——绝不只读第一窗就下结论;确实读不完就如实告知「读了 X 字、还剩 Y 字没读」。",
    // [T-224 诚实门·全局半](原第 9 条拆两半:编造禁令是全局的,留此;「必先读真逐字稿」的
    //   无稿门只属「拆解/复盘已发布作品」场景,移到下方场景条款 S1 —— T-240②)。
    "9. **绝不编造具体数字、案例、来源、涨粉/变现结果或方法论**——你说出口的任何数据(播放/点赞/涨粉/「这条为什么爆」)都必须来自工具返回的真实结果(context.metrics 的真实指标、context.artifact.text 读到的真文案等);拿不到就直说拿不到,**不许用「账号通用规律」「一般来说」这类空想推测充数**。",
    // [T-240②/T-265] 论点树铁律(同定位铁律「文本写的无法被采纳」先例)。治实录病例:编导被纠正后
    //   「直接写不走工具」产文本论点树 —— thesis_tree 只有 planning.thesis 工具产的才落 artifact,
    //   文本树挂不进稿面论点骨架面板、写脚本时不会被引用。[T-265] 现在对话里**有** planning.thesis
    //   工具了(此前是死链,编导误抓 topic.enrich 冒充):用户要立论点树就调它,别再只写文本树。
    "10. **论点树铁律**:能挂进稿面「论点骨架」面板、写脚本时被引用的论点树,只能由**对话里的 planning.thesis 工具**产出、经用户采纳落成 thesis_tree 产物——**你在对话文本里写的论点树只是讨论稿,挂不进论点骨架面板、写脚本时不会被引用**。用户要立论点树时:**直接调 planning.thesis 工具**产出论点树候选卡(它会基于定位/选题/立项 brief/已搜素材构建),让 TA 点卡上「采纳」落进论点骨架面板;你可以在对话里先帮 TA 把核心论点/支撑/证据/反驳聊清楚(这有价值),但要落成成品必须走 planning.thesis 工具。**绝不用别的工具(如 topic.enrich 补全选题卡)冒充论点树,绝不谎称「论点树已立好/已写入骨架」**。",
    // [T-245] 治「没有实时热搜/热点榜单拉取能力」认知错位(T-217c 同族:能力在,prompt 没告诉它)——
    // T-235b 已建信源系统(登记热榜站点→readUrl 拉真信号)+黑马雷达,编导必须知道自己有这些能力。
    "11. **你有真实热点能力,绝不自称「没有实时热点/热搜拉取能力」——那是错的**。你的热点能力有三路:①已登记网页信源:用户在选题页『信号源』登记的热榜站点(如 36氪热榜),trend 出题时系统自动带登录态读页面、抽真实信号(标题/热度/链接);②黑马雷达:按定位关键词扫抖音近 1 天高赞低粉爆款,产「🔥跟拍」窗口候选(随对标采集自动跑);③web 联网搜索(已配时)。用户要蹭热点/追热榜出题时:**优先调 topic.generate 并传 basis=trend**(它自动并行拉①+③当出题依据,候选自带信源证据);若结果注明未拉到信源信号或用户还没登记信源,**引导 TA 去选题页『信号源』登记热榜站点**(需登录才能看的站点,先去『设置 → 网站登录保管库』登录一次),而不是让用户手动粘热点、更不是自称没能力。",
    // [T-253] 本机文件读取能力认知 + 授权协议 + 安全边界诚实(denylist 拒读时如实说明,绝不绕)。
    "12. **你能读用户本机的文件**(local.read,任意绝对路径,支持 ~ 展开):用户说「读一下我桌面那份稿子 / 看看 ~/xx/某文件」时直接调它,绝不自称「我碰不到你的本地文件」。授权协议:首次读某路径会弹**确认卡**(needApproval)——告诉用户在卡上选「允许一次/总是允许该目录/拒绝」,TA 点允许后你**再调一次 local.read 传同一路径**;被拒绝就不再尝试。安全边界(如实转述,绝不绕):敏感文件(.env、含 key/secret/token 的文件、SSH/钥匙串/证书)无论授权与否都拒读——被拒时向用户说明这是确定性安全规则并给出原因,**绝不换路径/改名建议来绕过**;超 1MB 或二进制文件拒读,建议用户直接上传到素材库。",
    // [T-256a] 环境感知能力认知(能力在,须诚实用):编导能探测本机已装工具 + 能列已授权工作区目录。
    // 铁律:探到什么报什么,缺工具诚实引导安装,绝不假装工具存在/编造版本号/臆造未授权目录。
    "13. **你能感知用户的电脑环境,但只能读、不能装、不能乱跑命令**。两件事:①**探测已装工具**(local.tools):要判断某能力能不能落地时先探——如用户要「抽音频/转码/渲染视频」前先看 ffmpeg 在不在,要跑脚本前看 node/python3 在不在。装了就说装了(可报版本),**没装就直说没装并给出安装命令**(如「ffmpeg 没装,装一下:brew install ffmpeg」),**绝不假装工具存在、绝不编造版本号**;你只能探内置白名单工具(ffmpeg/ffprobe/node/python3/git),传别的名字会被忽略并在结果里列出,照实说即可。②**列工作区目录**(local.workspace):用户问「我授权过哪些目录/我放素材的文件夹」时列出 TA 已「总是允许该目录」的本地目录;要看某目录里有什么,再用 local.read 读那个目录(会返回文件清单)。清单为空就说还没授权过、引导 TA 去授权,**绝不臆造用户没授权过的目录**。你没有安装工具、执行任意命令、写本地文件的能力——只有「读环境」这一层,别对用户承诺装工具或跑命令。",
    // [T-265] 反工具冒充(治实录病例:论点树深链曾是死链 → 编导抓最近的 topic.enrich 冒充论点树)。
    //   工具清单(上方「你的技能清单」)是你能力的单一真值:清单没列的能力=你现在没有。
    "14. **绝不用「用途不同的工具」冒充用户真正要的能力**。用户要某能力(如立论点树、生成封面、做某种产物)时,先看你的技能清单里**有没有对应的工具**:有就调那个对的工具;**没有就诚实告诉用户「这个能力我现在没有对应工具」**,并说明现有工具能做到的最接近的事——**绝不拿一个用途不同的工具(比如用『补全选题卡 topic.enrich』冒充『立论点树』)硬凑,更不把它的产物说成用户要的东西**。宁可诚实说没有,也不误接工具骗过去。",
    // [T-380] 对话减摩擦:能力边界当场诚实 + 顺手的事直接做,不摆选项清单、不堆免责预防针。
    "15. **能力边界诚实 + 减摩擦**:系统不支持的能力(如某种生成方式/某个平台/某类操作)**绝不假装执行**,在动手前当场说明「这个当前不支持」;反过来,你的工具能顺手替用户做到的动作就**直接做**(该调工具就调),不要把本可直接执行的事拆成多选项清单抛回给用户选。要么先拦(不支持就直说),要么干净执行(支持就直接干)——**不要在执行前堆一段免责/预防针式的铺垫**(「可能会失败/仅供参考/我先说明几点」云云),执行结果如何就如实报什么。",
    "",
    // [T-240②] 场景条款 —— 带作用域的规则,只在对应场景生效,禁止跨场景套用。
    "【场景条款 —— 只在对应场景生效,禁止跨场景套用】",
    // [T-224 诚实门·场景半] 无稿门只管「拆解/复盘已发布作品」;创作前立框架不适用(S2)。
    "S1.(仅在拆解/复盘一条**已发布**作品时生效)拆它、产它的经验/方法论之前,**必须先读到这条作品的真逐字稿**:用 context.metrics / context.projects 拿到该作品的 projectId,再调 context.artifact.text(传该 projectId)读它的真文案;拆经验就调 review.analyze 并传该 projectId(它会强制读真稿,读不到会拒绝产卡)。读不到真稿时,若该作品关联了抖音,**顺手调 project.transcribe(传该 projectId)帮用户立即抓逐字稿**(约 1-3 分钟,完成后再拆);抓不了(无抖音锚)就直说做不到、要用户贴逐字稿,绝不推测充数。",
    "S2.(仅在为**创作前(未发布)**的项目立框架时生效)立论点/写大纲/起草脚本的依据是定位+选题卡+已搜集素材——这是正常创作流,**不适用 S1 的无稿门**:创作前没有逐字稿不是缺陷,不要因读不到逐字稿而卡住、不要向用户索要逐字稿、更不要把「没有逐字稿」当成拒绝立框架的理由。",
  ].join("\n");
  // [T-077c] 技能自感知(SPEC §1.3 [gate-F1]):把当前 surface 白名单的技能清单注进 system
  // (每工具一行「中文名(工具名):一句话用途」,行数=白名单工具数、上限 20 超出截断)——
  // 让模型能如实回答「你能干什么」,并在对话中主动建议(「这个我可以用『记录经验』帮你存下来」)。
  // 词表与前端工具 trace 行同源(lib/chat-tool-labels 单一真值),不编造白名单外的能力。
  const skillsBriefBlock = [
    "【你的技能清单 —— 本对话你能调用的全部工具,回答「你能干什么」时以此为准,不要编造清单外的能力】",
    buildSkillsBrief(toolWhitelist),
  ].join("\n");
  const selectionBlock = assembleSelectionContext(chatContext.selection);
  // T-039a 补:复盘对话「瞎问复盘对象」根因 —— 本项目真材料虽已装进 context(reviewSubject reader)
  // 且进了 review.analyze 工具的 facets,但**没进对话系统提示**,故 LLM 在决定调用工具前不知道复盘哪条,
  // 于是反复问「复盘对象是什么」并退回账号级泛论。这里把「本次复盘对象(真标题+文案+数据+评论)」直接
  // 注进对话 system + 强指令「别再问、直接基于它复盘」,让模型一进来就扣住这条作品。有 projectId 才注入
  // (reviewTitle/reviewScript 非空);读不到(无脚本/数据)则该行省略,不喂空噪声。
  const reviewSubjectBlock =
    context.reviewTitle || context.reviewScript || context.reviewMetrics
      ? [
          "【本次复盘对象 —— 创作者已在工作台选定这一条作品,请直接基于它提炼可复用要素,不要再问用户「复盘对象是什么」、也不要退回账号整体泛论】",
          // [T-134] 逐字稿/评论是外部来源用户可控内容(prompt-injection 最高危面)→ <user_data> 硬边界
          // 包裹;真实数据是派生统计数字,不含自由文本、不包。守卫指令已在 baseSystem 顶部(全局覆盖)。
          context.reviewTitle ? `标题:${wrapUserData(`《${context.reviewTitle}》`)}` : "",
          context.reviewScript ? `文案/逐字稿:\n${wrapUserData(context.reviewScript)}` : "",
          context.reviewMetrics ? `真实数据:${context.reviewMetrics}` : "",
          context.reviewComments ? `观众评论(真实):\n${wrapUserData(context.reviewComments)}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";
  // [T-106] 项目态当前项目注入 —— 项目内对话(chatContext.projectId 有值)把「当前项目 id」作为
  // **工具可用值**注入 + 指路 context.artifact.text/detail,免得模型不知道 id 就调 context.projects
  // 列全站去找(实录:项目内编导拉 79 条项目库还找不到匹配、退回口播稿脑补)。id 是工具入参,标题仅提示。
  const currentProjectTitle = chatContext.selection?.label?.trim() ?? "";
  const currentProjectBlock = chatContext.projectId
    ? [
        `【当前项目 —— 你正在为这一个具体项目编导,projectId="${chatContext.projectId}"${
          currentProjectTitle ? `,标题《${currentProjectTitle}》` : ""
        }】`,
        `要读这个项目的脚本/逐字稿/产物正文,直接调 context.artifact.text 或 context.project.detail 并传 projectId="${chatContext.projectId}";要读它的指标/发布,调 context.metrics / context.publications 传同一个 projectId。`,
        `你已经知道这条内容的 projectId 了,**绝不要用 context.projects 列出全站项目去找这一条**——那是全账号清单,不是当前项目。`,
      ].join("\n")
    : "";
  // [T-240①] 阶段判据块 —— 项目对话把「创作前(未发布)/已发布(可复盘)」渲成明确场景信号
  // (formatProjectStageBlock 纯函数);读不到项目详情(projectStage=null)→ 不注(不喂猜测)。
  const stageBlock = projectStage ? formatProjectStageBlock(projectStage) : "";
  // [T-382] 当前选中号块 —— ctx.accountId(x-account-id 已验属主)命中账号画像行时,把「用户
  // 当前操作的抖音号是谁」渲成明确 system 事实 + 指令。治实录病例:用户问「我当前登录的是哪个
  // 账号」,编导答「从你这侧的登录状态我没法判断」—— 系统明明知道(header 已验属主、画像已注入),
  // 只是没标哪个是当前号。所有 surface 都注(不限定位对话:「我的账号/我的数据」在任何面都该
  // 默认指当前号);未选号 / reader 无 id / 无匹配 → 空串不注(诚实,不猜)。
  const currentAccountBlock = context.currentAccountLine
    ? [
        `【当前选中的抖音号】用户当前操作的抖音号:${context.currentAccountLine}。`,
        "用户说「我的账号 / 我的数据 / 我当前登录的是哪个账号」时,默认都指这个号——直接如实回答、直接拉它的数据;**绝不要说「我没法判断你登录的是哪个号」、也绝不要反问用户当前是哪个号**(系统已把当前号告诉你了)。",
      ].join("\n")
    : "";
  // [T-270] 立项 Brief 硬锚块 —— 项目态对话把「本条内容立项硬约束(钦定核心信息/内容目标含避免X/
  // 内容形式/目标观众)」注进 system,让编导聊 hook/论点/整稿前就锚定钦定前提,不再漂移/自创矛盾主张。
  // 作**权威约束块**(与 stageBlock/currentProjectBlock 同类,不套 <user_data> 数据边界——brief 是
  // 创作者自己对本项目的钦定决策,须以「必须遵守」的指令力生效,而非当外部数据降权)。account 态
  // (projectId=null)→ context.projectBriefHard 恒空 → filter(Boolean) 略过,不注空壳。
  const briefHardBlock = context.projectBriefHard || "";
  const system = [
    baseSystem,
    honestyBlock,
    skillsBriefBlock,
    currentAccountBlock,
    currentProjectBlock,
    briefHardBlock,
    stageBlock,
    reviewSubjectBlock,
    selectionBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
  // 选中态标题 —— 工具入参兜底(模型没显式传 title/subject 时用它,避免拿空标题去诊断)。
  const selectionTitle = chatContext.selection?.label?.trim() || "";

  // 5) 工具白名单层:按 skill 白名单挂工具,execute 复用现有 runner 核心产**候选**(非实体)。
  const toolDeps: ChatToolDeps = {
    // [T-163] 错误→人话端口透传(route 注入前端 humanizeAiError)。
    humanizeError: deps.humanizeError,
    // [T-084a] 联网检索是否已配 —— 驱动 material.gather 工具的动态诚实描述(上方已探测)。
    searchConfigured,
    generateTopics: async ({ basis, extraBrief }) => {
      // 复用 ai-worker.runTopicNode —— 产 TopicItem[] 候选(与一键岛同一引擎)。
      // [T-081] extraBrief 对任意 basis 都生效:comments/knowledge 依据块后追加「本次生成指令」段
      // (原实现只在 positioning/trend 分支吃 extraBrief,评论/知识出题时对话洞察被静默丢弃)。
      // [T-238] 画像输入(best-effort 读评论信号/定位中心/知识库原始行;失败 → 空,不阻断出题)。
      const qualityInputs = await assembleSignalQualityInputs(ctx, deps);
      let trendQuality = { sourceCount: 0, signalCount: 0 };
      let basisSource =
        basis === "comments"
          ? // [T-238] 评论滤噪:666/纯 emoji/夸赞不进 brief,强信号带 ★;读源空 → 退回
            // context.signalsBrief(旧行为,诚实降级)。
            qualityInputs.signals.length > 0
            ? formatFilteredSignalsBrief(qualityInputs.signals)
            : context.signalsBrief
          : basis === "knowledge"
            ? context.knowledgeBrief
            : "";
      // [T-245] trend 出题真接信号:复用选题页出题同一装配器(assembleTrendBriefDetailed,
      // T-235b 已登记信源信号 + web 搜索并行)。此前对话编导 basis=trend 是空 brief(节点走
      // 无热点降级路径出「假热点题」),与工具描述「自动拉真实信号」名实不符。信源信号为空时
      // 产 trendNote 诚实注记(随 tool-result 回编导,如实转述 + 引导去『信号源』登记),不猜不编。
      let trendNote: string | null = null;
      if (basis === "trend") {
        const detail = await assembleTrendBriefDetailed(
          ctx,
          context.positioningBrief,
          {
            trendSourceSignals: deps.trendSourceSignals,
            // web 搜索路复用 material.gather 的联网检索端口(SearchResult ⊇ TrendHit,
            // 未配/失败 → 该段空,assembleTrendBriefDetailed 内 allSettled 诚实降级)。
            trendSearch: deps.searchWeb,
          },
        );
        basisSource = detail.brief;
        trendQuality = trendQualityFromDetail(detail);
        if (detail.sourceSignalCount === 0) {
          let registered: number | null = null;
          try {
            registered = deps.countEnabledTrendSources
              ? await deps.countEnabledTrendSources(ctx)
              : null;
          } catch {
            registered = null; // 计数是注记增强,读失败绝不阻断出题
          }
          trendNote =
            registered === 0
              ? "本次出题未拉到已登记信源的实时信号:当前还没有登记任何网页信源。请如实告知用户,并引导 TA 去选题页『信号源』登记热榜站点(需登录的站点先去『设置 → 网站登录保管库』登录)。" +
                (detail.searchHitCount > 0
                  ? "本次热点依据仅来自 web 联网搜索。"
                  : "本次候选没有实时热点信号支撑,不要声称基于实时热榜。")
              : `本次出题未拉到已登记信源的实时信号${
                  registered != null
                    ? `(已登记 ${registered} 个信源,可能抓取失败/登录失效)`
                    : "(可能抓取失败/登录失效)"
                }。请如实告知用户,并建议去选题页『信号源』检查信源、或去『设置 → 网站登录保管库』重新登录。` +
                (detail.searchHitCount > 0
                  ? "本次热点依据仅来自 web 联网搜索。"
                  : "本次候选没有实时热点信号支撑,不要声称基于实时热榜。");
        }
      }
      const basisBrief = [
        basisSource,
        extraBrief
          ? `${EXTRA_BRIEF_HEADING}\n${extraBrief}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      const { topics } = await runTopicNode({
        model,
        positioningBrief: context.positioningBrief,
        basisBrief,
        // [T-062b gate-F3] KNOW-X 修真:对话出题同样吃知识库参考 + 已验证经验约束
        // (basis=knowledge 时知识已进 basisBrief,置空防重复)。
        knowledgeBrief:
          basis === "knowledge" ? undefined : context.knowledgeBrief || undefined,
        learningsBrief: context.learningsBrief || undefined,
        // [T-238] 依据质量画像段(模板 v3 据它动态定权、reason 注明主要依据+权重理由)。
        signalQualityBrief: renderSignalQualityBrief(
          buildSignalQualityProfile({
            signals: qualityInputs.signals,
            positioning: qualityInputs.positioning,
            knowledge: qualityInputs.knowledge,
            trend: trendQuality,
          }),
        ),
        basis,
      });
      const items = topics.map((t) => ({
        title: t.title,
        angle: t.angle,
        contentRole: t.contentRole,
        // [T-149] 出题渠道(trend|benchmark|demand)透传到工具结果 → 采纳时落成候选 source,
        // 不再在采纳卡里被硬编码成 idea 冲进「手动灵感」统计。
        source: t.source,
        predictedScore: t.predictedScore,
        reason: t.reason,
        // [T-066] 原始评论引用透传到工具结果 → 候选卡渲「依据评论」。
        sourceComments: t.sourceComments,
      }));
      // [T-245] 新形状 { items, trendNote }:trend 降级注记随 tool-result 回编导(chat-tools
      // execute 兼容旧裸数组;无注记时 trendNote=null,execute 侧不渲字段)。
      return { items, trendNote };
    },
    enrichTopic: async ({ title, angle, verifiedBrief }) => {
      // [T-111] 选中某选题(编导起草深链 selection.kind="candidate")时,补全**一律锚定这条选题的
      // 标题** —— 别让模型把开场选中的选题当「新选题」、或拿自己另生成的候选替换掉它(实录:模型
      // 传错标题把《Hermes对比》补成不相干的《Claude Code 装好第一步报错》)。无 candidate 选中时
      // 退回模型传的 title、再退回 selectionTitle 兜底(与其它工具同款锚定)。
      const effTitle =
        (chatContext.selection?.kind === "candidate" && selectionTitle) ||
        title?.trim() ||
        selectionTitle ||
        "";
      // 复用 topic-enrich-runner 的 enrich prompt + parseCard —— 产选题卡候选(非实体)。
      // [T-269] 反编造:对话 enrich 走自由文本(非模板),把可溯硬约束段注进 prompt + system(单一
      // 真值 grounding-facets)——治「materialBasis 凭空称能依托某资料」的编造敞口。enrich 是账号态
      // (projectId=null),不注 brief 硬锚(不项目化,守审计边界),只上 anti-fabrication。
      const { runAgentNode, ANTI_FABRICATION_CLAUSE } = await import("@creatoros/ai-worker");
      // [T-371] 先搜后卡:对话里联网核实到的事实经 verifiedBrief 进 enrich prompt(素材依据段
      // 据实引用来源);缺省走「未联网核实」诚实门,禁「待联网拉取」占位承诺。
      const prompt = buildEnrichPrompt(
        context,
        { title: effTitle, angle },
        ANTI_FABRICATION_CLAUSE,
        verifiedBrief,
      );
      const res = await runAgentNode({
        model,
        system:
          "你是这位创作者的选题策划 agent,把一条选题补全成完整选题卡。只输出 JSON,不要多余文字。\n\n" +
          ANTI_FABRICATION_CLAUSE,
        prompt,
        maxSteps: 2,
      });
      // [T-266] 随卡回补全**当时**锚定的已有候选 id(selection.kind==="candidate" → 就地补全
      // 这条);账号态/未选中某条候选 → null。持久化随 tool-result 走,刷新后前端仍据它 patch
      // (而非依赖易失的当前 selection),null 则采纳走 createCandidate 新建(治死胡同)。
      const candidateId =
        chatContext.selection?.kind === "candidate"
          ? (chatContext.selection.ids[0] ?? null)
          : null;
      return { card: parseCard(res.text), candidateId };
    },
    generateHooks: async ({ topic, direction, extraBrief }) => {
      // [T-055c] 复用 runAgentNode 一次调用产 hook 候选组(非实体)。主题兜底:模型没传
      // topic 时用选中项目标题(稿面右栏常驻 = 当前项目)。产出走 ChatHookCard 逐条写入稿面。
      const effTopic = topic?.trim() || selectionTitle || "";
      // [T-269/T-270] 接地根:antiFabrication 常量 + 可溯后处理纯函数从 ai-worker 取(单一真值)。
      const { runAgentNode, ANTI_FABRICATION_CLAUSE, AUDIENCE_MINDSET_CLAUSE, buildGroundingHaystack, annotateUngroundedClaims } =
        await import("@creatoros/ai-worker");
      const prompt = buildHooksPrompt({
        topic: effTopic,
        direction,
        extraBrief,
        positioningBrief: context.positioningBrief,
        // [T-270] 立项硬锚(项目态;账号态对话 projectId=null → 空,整段省略)。
        projectBriefHard: context.projectBriefHard || undefined,
        // [T-269] 用户素材=钩子的可溯弹药(此前 hook 生成链完全没传素材)。
        userMaterialHard: context.userMaterialHardBrief || undefined,
        userMaterialRef: context.userMaterialRefBrief || undefined,
        antiFabrication: ANTI_FABRICATION_CLAUSE,
        // [T-355] 观众心智预设写法纪律(激将式钩子=归因外置铁律的高危区)。
        audienceMindset: AUDIENCE_MINDSET_CLAUSE,
      });
      const res = await runAgentNode({
        model,
        // [T-269] hooks system 也带同款可溯硬约束段(弱模型 tool-calling 靠重复压住编造冲动)。
        system:
          "你是这位创作者的口播编导,专门打磨前 3 秒开场 hook。只输出 JSON,不要多余文字。\n\n" +
          ANTI_FABRICATION_CLAUSE,
        prompt,
        maxSteps: 2,
      });
      // [T-269] 可溯后处理(参照 T-224):校验每条 hook 的具体 claim(数字/命名)是否命中已注入的
      // 素材/定位/立项 brief;不可溯的 → 非破坏式追加「⚠️含未溯源数据」标注(不删,让用户/下游核实)。
      const haystack = buildGroundingHaystack(
        context.positioningBrief,
        context.projectBriefHard,
        context.userMaterialHardBrief,
        context.userMaterialRefBrief,
        context.knowledgeBrief,
        effTopic,
      );
      return parseHookItems(res.text).map((h) => ({
        ...h,
        text: annotateUngroundedClaims(h.text, haystack).text,
      }));
    },
    // [T-268] 整稿改异步 dispatch(不再 inline 同步 runScriptNode —— 整稿分钟级,弱模型下同步必超时
    // → 回合被腰斩 → 退回轻量 hooks,「点生成脚本只出 hook」的根因)。整稿恒是「当前项目的」(要落成
    // output_script 版本写进稿面),项目从模型显式传参优先,否则用 chatContext.projectId(稿面右栏对话
    // 恒有)。无项目上下文 → 不 dispatch,诚实回 error(卡渲「去项目稿面写脚本」);端口未装配 → 同样
    // 诚实 error(不抛裸码)。topic 缺省用工作台选中标题兜底(与写稿/复盘同款 selection.label 派生)。
    dispatchScriptDraft: async ({ projectId, topic, angle, extraBrief }) => {
      const pid =
        (typeof projectId === "string" && projectId.trim() ? projectId.trim() : "") ||
        chatContext.projectId ||
        "";
      if (!pid) {
        return {
          taskId: null,
          projectId: null,
          error:
            "整稿要落进具体项目的稿面 —— 请在项目稿面右栏的编导对话里让我写脚本,我会把整稿写进这个项目。",
        };
      }
      if (!deps.dispatchScriptDraftPort) {
        return {
          taskId: null,
          projectId: pid,
          error: "整稿能力当前未接入(服务端未装配整稿分派) —— 暂时无法生成整稿。",
        };
      }
      const effTopic =
        (typeof topic === "string" && topic.trim() ? topic.trim() : "") ||
        selectionTitle ||
        "";
      try {
        const { taskId } = await deps.dispatchScriptDraftPort(ctx, {
          projectId: pid,
          ...(effTopic ? { topic: effTopic } : {}),
          ...(angle ? { angle } : {}),
          ...(extraBrief ? { extraBrief } : {}),
        });
        return { taskId, projectId: pid, error: null };
      } catch (err) {
        return {
          taskId: null,
          projectId: pid,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    // [T-350a] 发布物料生成 —— 同 dispatchScriptDraft 范式:无项目上下文 / 端口未装配 → 诚实 error;
    // topic 缺省用工作台选中标题兜底。空稿门 / ensure outputId 在绑定层(dispatchPublishPackagePort)内。
    dispatchPublishPackage: async ({ projectId, topic }) => {
      const pid =
        (typeof projectId === "string" && projectId.trim() ? projectId.trim() : "") ||
        chatContext.projectId ||
        "";
      if (!pid) {
        return {
          taskId: null,
          projectId: null,
          error:
            "发布物料要落进具体项目 —— 请在项目稿面右栏的编导对话里让我生成发布物料。",
        };
      }
      if (!deps.dispatchPublishPackagePort) {
        return {
          taskId: null,
          projectId: pid,
          error: "发布物料能力当前未接入(服务端未装配发布物料分派) —— 暂时无法生成。",
        };
      }
      const effTopic =
        (typeof topic === "string" && topic.trim() ? topic.trim() : "") ||
        selectionTitle ||
        "";
      try {
        const { taskId } = await deps.dispatchPublishPackagePort(ctx, {
          projectId: pid,
          ...(effTopic ? { topic: effTopic } : {}),
        });
        return { taskId, projectId: pid, error: null };
      } catch (err) {
        return {
          taskId: null,
          projectId: pid,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    // [T-385] 对话内一键抓逐字稿 —— 同 dispatchPublishPackage 范式:projectId 模型显式传参优先,
    // 否则 chatContext.projectId 兜底;无项目上下文 / 端口未装配 → 诚实 error(不抛裸码)。
    // 无抖音锚等 ValidationError 由端口抛出 → catch 转 error 原样透传(persistence 层文案已是人话)。
    dispatchProjectTranscribe: async ({ projectId }) => {
      const pid =
        (typeof projectId === "string" && projectId.trim() ? projectId.trim() : "") ||
        chatContext.projectId ||
        "";
      if (!pid) {
        return {
          taskId: null,
          projectId: null,
          error:
            "抓逐字稿要落到具体作品 —— 传要抓的作品 projectId(从 context.metrics / context.projects 每行拿),或在该作品的项目对话里让我抓。",
        };
      }
      if (!deps.dispatchProjectTranscribePort) {
        return {
          taskId: null,
          projectId: pid,
          error: "抓逐字稿能力当前未接入(服务端未装配转写分派) —— 暂时无法发起抓取。",
        };
      }
      try {
        const { taskId } = await deps.dispatchProjectTranscribePort(ctx, {
          projectId: pid,
        });
        return { taskId, projectId: pid, error: null };
      } catch (err) {
        return {
          taskId: null,
          projectId: pid,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    gatherMaterials: async ({ query }) => {
      // [T-057④/T-084a] 两步:①先真联网检索(searchWeb,失败/未配降级)②runResearchNode 结构化
      // 综合(检索结果前置注入,非模型工具 —— 保住任何模型都产可解析输出,ffb7951 教训)。
      const baseQuery = query?.trim() || selectionTitle || "";
      // [T-146d] 搜索深度结合用户素材:构造 query 前读当前项目 high-priority 用户素材要点(关键词/
      // 实体)→ 扩展 query(标题 + 资料关键词,而非纯标题),让搜索贴着 PR/第一手资料搜。
      // context.userMaterialQueryTerms 已由 creative-context 从高优先素材要点卡抽好(只 high,去重上限)。
      const materialTerms = context.userMaterialQueryTerms ?? [];
      const effQuery = [baseQuery, ...materialTerms].filter(Boolean).join(" ");
      // ① 联网检索(端口未装配 → 空;SearchConfigError/SearchExecutionError → catch 成空降级)。
      let searchResults: Array<{
        title: string;
        url: string;
        snippet: string;
        publishedAt?: string;
        siteName?: string;
      }> = [];
      if (deps.searchWeb && effQuery) {
        try {
          searchResults = await deps.searchWeb(ctx, effQuery, { count: 10 });
        } catch (err) {
          // 未配/检索失败 → 诚实降级纯记忆(不 crash);记日志供 dev 排查。
          console.warn(
            `[chat-runner] gatherMaterials searchWeb 降级(model_memory): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          searchResults = [];
        }
      }
      // ② 结构化综合(research.gather capability,四类结构化素材;检索结果注入 → 模型据其填真实 URL)。
      // [T-146d] 高优先用户素材要点作 facet 注入 → 综合「贴着资料产」(优先服务于它、补充它、佐证它,
      // 而非跑题)。topicTitle 保持原选题(不掺资料词,避免污染综合的相关性判断);资料主权走 facet。
      const spec = await deps.resolveModelSpec(ctx, "research.gather");
      const { runResearchNode, formatUserMaterialFacet } = await import(
        "@creatoros/ai-worker"
      );
      const { items, grounding } = await runResearchNode({
        model: modelFor(spec),
        positioningBrief: context.positioningBrief,
        topicTitle: baseQuery,
        searchResults,
        userMaterialFacet: context.userMaterialHardBrief
          ? formatUserMaterialFacet(context.userMaterialHardBrief)
          : undefined,
      });
      return {
        grounding,
        items: items.map((it) => ({
          title: it.title,
          url: it.url,
          source: it.source,
          whyRelevant: it.why_relevant,
          category: it.source || "素材",
          ...(it.sourceUrl ? { sourceUrl: it.sourceUrl } : {}),
        })),
      };
    },
    // [T-084b] material.screenshot:端口未装配 → 诚实抛错(工具 execute 接住转人话渲错误态,
    // 「截图能力未接入」);装配了则真截图 → createGeneratedAsset → 返回 asset + 预览 URL。
    // [T-239c] signal 透传:工具 execute 从 SDK 第二参 { abortSignal } 拿到本轮中断信号,
    // 经这里进端口 → Playwright 层提前退出(用户点「停止」长工具不再空烧)。
    captureScreenshot: async ({ url, fullPage, signal }) => {
      if (!deps.captureScreenshotPort) {
        throw new Error(
          "截图能力当前未接入(服务端未装配无头浏览器) —— 暂时无法截图。",
        );
      }
      return deps.captureScreenshotPort(ctx, { url, fullPage, signal });
    },
    // [T-217c] web.read:端口未装配 → 诚实抛错;装配了则带登录态读正文 → 落逐字稿素材(pending
    // 确认门)或返回需登录降级(编导引导去保管库登录)。
    readWeb: async ({ url, signal }) => {
      if (!deps.readWebUrlPort) {
        throw new Error(
          "网页正文读取能力当前未接入(服务端未装配带登录态浏览器) —— 暂时无法读取。",
        );
      }
      return deps.readWebUrlPort(ctx, { url, signal });
    },
    // [T-253] local.read:端口未装配 → 诚实抛错(工具 execute 接住转 error);装配了则端口内
    // 走「授权表 → 敏感硬门 → 大小/二进制门 → 读文件/列目录」全链(四态返回,不在这里拆)。
    readLocal: async ({ path, signal }) => {
      if (!deps.readLocalFilePort) {
        throw new Error(
          "本地文件读取能力当前未接入(服务端未装配本机读取端口) —— 暂时无法读取本机文件。",
        );
      }
      return deps.readLocalFilePort(ctx, { path, signal });
    },
    // [T-263] local.read 授权判定(HITL 门用)—— 端口未装配 → 缺席(local.read 无授权门,回落既有
    // needApproval 四态);装配了则只跑判定(不读内容),给 defineChatTool 的 needsApproval 用。
    decideLocalRead: deps.decideLocalReadAccessPort
      ? async ({ path }) => deps.decideLocalReadAccessPort!(ctx, { path })
      : undefined,
    // [T-256a] local.tools:端口未装配 → 诚实抛错(工具 execute 接住转 error);装配了则端口内走
    // 白名单过滤 + 固定 arg 数组 spawn which/--version(只读探测,不执行任意命令)。
    detectTools: async ({ tools }) => {
      if (!deps.detectToolsPort) {
        throw new Error(
          "环境探测能力当前未接入(服务端未装配工具探测端口) —— 暂时无法探测本机已装工具。",
        );
      }
      return deps.detectToolsPort(ctx, { tools });
    },
    // [T-256a] local.workspace:端口未装配 → 诚实抛错;装配了则列该用户「总是允许该目录」授权过的
    // 本地目录根(复用 T-253 授权表,不新建授权机制)。
    listAuthorizedDirs: async () => {
      if (!deps.listAuthorizedDirsPort) {
        throw new Error(
          "工作区感知能力当前未接入(服务端未装配授权目录端口) —— 暂时无法列出已授权目录。",
        );
      }
      return deps.listAuthorizedDirsPort(ctx);
    },
    // [T-084c] material.generate:端口未装配 → 诚实抛错;装配了则 dispatch 既有 asset.generate
    // task(不直接生成,视频异步分钟级不阻塞对话回合),立即返回 taskId 供前端卡轮询。
    dispatchGenerateAsset: async ({ kind, prompt, style }) => {
      if (!deps.dispatchGenerateAssetPort) {
        throw new Error(
          "AI 生成能力当前未接入(服务端未装配生成分派) —— 暂时无法生成素材。",
        );
      }
      // style 折进 prompt(asset.generate task 的 inputData 只吃 prompt;不改既有 task 契约)。
      const effPrompt = style ? `${prompt}\n风格:${style}` : prompt;
      return deps.dispatchGenerateAssetPort(ctx, {
        kind,
        prompt: effPrompt,
        // 项目对话(chatContext.projectId)时把生成 task 挂到当前项目(采纳可绑用料链)。
        projectId: chatContext.projectId ?? null,
      });
    },
    // [T-103b] review.script:审的恒是「当前项目的脚本」(script.review 只吃 projectId)。项目
    // 从模型显式传参优先,否则用 chatContext.projectId(稿面右栏对话恒有)。无项目上下文 →
    // 不 dispatch,诚实回 error(卡渲「去项目稿面里审」);端口未装配 → 同样诚实 error(不抛裸码)。
    dispatchScriptReview: async ({ projectId }) => {
      const pid =
        (typeof projectId === "string" && projectId.trim() ? projectId.trim() : "") ||
        chatContext.projectId ||
        "";
      if (!pid) {
        return {
          taskId: null,
          projectId: null,
          error:
            "文案审核要在具体项目的稿面里进行 —— 请在项目稿面右栏的编导对话里让我审核这份脚本。",
        };
      }
      if (!deps.dispatchScriptReviewPort) {
        return {
          taskId: null,
          projectId: pid,
          error: "文案审核能力当前未接入(服务端未装配审核分派) —— 暂时无法审核。",
        };
      }
      try {
        const { taskId } = await deps.dispatchScriptReviewPort(ctx, { projectId: pid });
        return { taskId, projectId: pid, error: null };
      } catch (err) {
        return {
          taskId: null,
          projectId: pid,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    // [T-265] planning.thesis:论点树恒是「当前项目的」(要挂进该项目稿面论点骨架面板)。项目
    // 从模型显式传参优先,否则用 chatContext.projectId(稿面右栏对话恒有)。无项目上下文 → 不
    // dispatch,诚实回 error(卡渲「去项目稿面立论点」);端口未装配 → 同样诚实 error(不抛裸码)。
    // topic 缺省用工作台选中标题兜底(与写稿/复盘同款 selection.label 派生)。
    dispatchPlanningThesis: async ({ projectId, topic }) => {
      const pid =
        (typeof projectId === "string" && projectId.trim() ? projectId.trim() : "") ||
        chatContext.projectId ||
        "";
      if (!pid) {
        return {
          taskId: null,
          projectId: null,
          error:
            "论点树要挂进具体项目的稿面「论点骨架」面板 —— 请在项目稿面右栏的编导对话里让我立论点。",
        };
      }
      if (!deps.dispatchPlanningThesisPort) {
        return {
          taskId: null,
          projectId: pid,
          error: "论点树能力当前未接入(服务端未装配论点树分派) —— 暂时无法立论点。",
        };
      }
      const effTopic =
        (typeof topic === "string" && topic.trim() ? topic.trim() : "") ||
        selectionTitle ||
        "";
      try {
        const { taskId } = await deps.dispatchPlanningThesisPort(ctx, {
          projectId: pid,
          ...(effTopic ? { topic: effTopic } : {}),
        });
        return { taskId, projectId: pid, error: null };
      } catch (err) {
        return {
          taskId: null,
          projectId: pid,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    // [T-271] cover.generate:封面恒是「当前项目的」(封面文案要锚该项目的核心信息/口播稿)。项目从
    // 模型显式传参优先,否则用 chatContext.projectId(稿面右栏对话恒有)。无项目上下文 → 不 dispatch,
    // 诚实回 error(卡渲「去项目稿面生成封面」);端口未装配 → 同样诚实 error(不抛裸码)。topic 缺省
    // 用工作台选中标题兜底(与写稿/立论点同款 selection.label 派生)。
    dispatchGenerateCover: async ({ projectId, topic, referenceAssetId }) => {
      const pid =
        (typeof projectId === "string" && projectId.trim() ? projectId.trim() : "") ||
        chatContext.projectId ||
        "";
      if (!pid) {
        return {
          taskId: null,
          projectId: null,
          error:
            "封面要锚这条内容的立项核心信息与口播稿 —— 请在项目稿面右栏的编导对话里让我生成封面。",
        };
      }
      if (!deps.dispatchGenerateCoverPort) {
        return {
          taskId: null,
          projectId: pid,
          error: "封面生成能力当前未接入(服务端未装配封面分派) —— 暂时无法生成封面。",
        };
      }
      const effTopic =
        (typeof topic === "string" && topic.trim() ? topic.trim() : "") ||
        selectionTitle ||
        "";
      try {
        const { taskId } = await deps.dispatchGenerateCoverPort(ctx, {
          projectId: pid,
          ...(effTopic ? { topic: effTopic } : {}),
          // [T-380] 以图生图风格参考透传(可选;素材库 asset id)。
          ...(referenceAssetId ? { referenceAssetId } : {}),
        });
        return { taskId, projectId: pid, error: null };
      } catch (err) {
        return {
          taskId: null,
          projectId: pid,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    diagnoseContent: async ({ title, script, extraBrief }) => {
      // 复用 calibration.diagnose 模板 + parseDiagnosis(与 calibration-diagnose-runner 同源)。
      // 对话里没有库内 rubric reader → 用通用维度评(诚实降级)。产诊断候选(非实体)。
      // T-027:模型没显式传 title 时用工作台选中内容的标题兜底(不拿空标题去诊断)。
      const effTitle = title?.trim() ? title : selectionTitle;
      const spec = await deps.resolveModelSpec(ctx, "calibration.diagnose");
      const rubricBlock = GENERIC_RUBRIC_DIMENSIONS.map(
        (d, i) => `${i + 1}. ${d.label}（key=${d.key}） —— ${d.description}`,
      ).join("\n");
      const { text } = await runTemplatedNode({
        model: modelFor(spec),
        // T-040b:运行时 getTemplate 取被覆盖后的 REGISTRY 对象(非 import 快照),吃服务端覆盖。
        template: getTemplate("calibration.diagnose"),
        facets: {
          positioning: context.positioningBrief
            ? context.positioningBrief
            : "（创作者尚未设置定位——按通用爆款逻辑判断）",
          learnings: context.learningsBrief
            ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
            : "",
          // [T-081①] 对话洞察/补充指令(模板 {{extraBrief}} 占位,空则整段省略)。
          extraBrief: extraBrief
            ? `\n${EXTRA_BRIEF_HEADING}\n${extraBrief}`
            : "",
          rubricBlock,
          title: effTitle || "（未提供标题）",
          script:
            script && script.trim()
              ? script
              : "（暂无文稿——请基于标题与定位做尽力诊断,拿不准的指标给 null）",
        },
      });
      const parsed = parseDiagnosis(
        text,
        new Set(GENERIC_RUBRIC_DIMENSIONS.map((d) => d.key)),
      );
      if (!parsed) return null;
      // 对话卡只用维度评分 + 综合判断三段(performance 留给工作台诊断卡;对话里不渲分数 chips)。
      return {
        dimensions: parsed.dimensions,
        verdict: parsed.verdict,
        mainIssues: parsed.mainIssues,
        priorityFixes: parsed.priorityFixes,
      };
    },
    analyzeReview: async ({ subject, projectId, extraBrief }) => {
      // 复用 review.insights 模板 + reviewFacets + parseLearnings(与 review-runner 同源、同一份
      // 真数据注入,不造影子)。T-039a:facets 走共用 reviewFacets —— 它把本项目的真文案/数据/评论
      // 拼成整块注入(前提是 assembleCreativeContext 拿到了 projectId → reviewSubject reader 读齐)。
      //
      // [T-224 诚实门,最高优先级] 拆某条作品的经验/方法论**必须基于它的真逐字稿**:
      //   1) 先定位目标作品(模型显式传的 projectId 优先,否则当前对话项目);
      //   2) 若目标作品 ≠ 当前对话项目 → 为它单独装配 CreativeContext(读它自己的真文案/数据/评论);
      //   3) 拿不到真逐字稿(reviewScript 空)→ **不产经验卡**,返回诚实提示要 projectId/逐字稿,
      //      绝不用「账号通用规律」推测充数、绝不编造具体数字/案例/方法论当可采纳经验。
      const targetProjectId =
        (typeof projectId === "string" && projectId.trim()
          ? projectId.trim()
          : "") ||
        chatContext.projectId ||
        "";
      let reviewContext = context;
      if (targetProjectId && targetProjectId !== (chatContext.projectId ?? "")) {
        try {
          reviewContext = await assembleCreativeContext(
            ctx,
            { projectId: targetProjectId, topic: subject?.trim() ?? "" },
            deps,
          );
        } catch {
          // 目标作品装配失败(越权/不存在)→ 退回当前 context;下方诚实门仍会拦无稿。
          reviewContext = context;
        }
      }
      if (!reviewContext.reviewScript?.trim()) {
        return {
          items: [],
          error:
            // [T-385] 不止让用户贴稿 —— 引导模型顺手调 project.transcribe 帮用户立即抓取(能顺手做直接做)。
            "我没读到这条作品的真实逐字稿,不能凭标题、指标或账号通用规律编方法论当经验。这条作品若关联了抖音,可直接调 project.transcribe 工具(传该作品 projectId)帮用户立即发起逐字稿抓取,约 1-3 分钟完成后重新拆解;或让用户把逐字稿贴进来,我再基于真稿拆。",
        };
      }
      // subject 优先级:模型显式传 > 目标作品真标题 > 工作台选中标题(reviewFacets 内还有兜底)。
      const effSubject = subject?.trim()
        ? subject
        : reviewContext.reviewTitle?.trim() || selectionTitle;
      const spec = await deps.resolveModelSpec(ctx, "review.insights");
      const { text } = await runTemplatedNode({
        model: modelFor(spec),
        // T-040b:运行时 getTemplate 取被覆盖后的 REGISTRY 对象(非 import 快照),吃服务端覆盖。
        template: getTemplate("review.insights"),
        // [T-081①] extraBrief 第三参 → 模板 {{extraBrief}} 占位(空则整段省略)。
        facets: reviewFacets(reviewContext, effSubject, extraBrief),
      });
      return { items: parseLearnings(text), error: null };
    },
    generatePositioning: async ({ extraBrief }) => {
      // 复用 positioning-runner 的 prompt + parseSuggestion —— 产定位提案候选(非实体)。
      // [T-081②] 真实作品画像:读全部作品标题(压缩列表,截 40 字/上限 100 条/带发布状态)注入
      // prompt,让「结合我的内容生成定位」不依赖模型翻页;读端口未装配/读失败 → 空(诚实降级,
      // 不阻断生成)。[T-081①] extraBrief:对话洞察经新 facet 段进 prompt(优先级高于既有档案)。
      let worksBrief = "";
      if (deps.contextReaders) {
        try {
          const { rows, total } = await deps.contextReaders.listProjects(ctx, {
            limit: 100,
            offset: 0,
          });
          worksBrief = formatWorksBrief(rows, total);
        } catch {
          worksBrief = ""; // 作品画像 best-effort,读失败不阻断定位生成
        }
      }
      const { runAgentNode } = await import("@creatoros/ai-worker");
      const spec = await deps.resolveModelSpec(ctx, "positioning.generate");
      const res = await runAgentNode({
        model: modelFor(spec),
        system: "你是这位创作者的定位策略 agent。只输出 JSON,不要多余文字。",
        prompt: buildPositioningPrompt(context, { extraBrief, worksBrief }),
        maxSteps: 2,
      });
      return parseSuggestion(res.text);
    },
    // [T-094] 对话蒸馏:复用倾倒场同一引擎 runKnowledgeDistill(knowledge.distill 模板 +
    // capability 走 model-config,多模态可配铁律)。失败抛错由工具 execute 接住转人话渲卡。
    distillKnowledge: async ({ content }) => {
      const { runKnowledgeDistill } = await import(
        "./knowledge-distill-runner"
      );
      return runKnowledgeDistill(
        ctx,
        { content },
        { resolveModelSpec: deps.resolveModelSpec },
      );
    },
    // [T-077b] brief.fill 的现状读:当前项目对话(chatContext.projectId,project surface 的
    // selection kind=project 已装进来)才读得到;无项目上下文 / 端口未装配 → null(卡上现值显「未填」)。
    getProjectBrief: async () => {
      if (!deps.contextReaders || !chatContext.projectId) return null;
      return deps.contextReaders.getProjectBrief(ctx, {
        projectId: chatContext.projectId,
      });
    },
    // 只读 context 工具 —— execute 直接调注入的 user-scoped 读端口(不跑模型、不产候选、不写实体)。
    // 端口未装配(contextReaders 缺省)→ 回空数组(诚实降级,绝不塞假数据),模型据此如实作答。
    listProjects: async ({ limit, offset }) => {
      if (!deps.contextReaders) return { rows: [], total: 0 };
      return deps.contextReaders.listProjects(ctx, { limit, offset });
    },
    listComments: async ({ limit, offset }) => {
      if (!deps.contextReaders) return { rows: [], total: 0 };
      return deps.contextReaders.listComments(ctx, { limit, offset });
    },
    searchKnowledge: async ({ query, limit }) => {
      if (!deps.contextReaders) return [];
      return deps.contextReaders.searchKnowledge(ctx, { query, limit });
    },
    searchMaterials: async ({ query, limit }) => {
      if (!deps.contextReaders) return [];
      return deps.contextReaders.searchMaterials(ctx, { query, limit });
    },
    // [T-099b] 详情类 context 工具(切片二)—— execute 直接调注入的 user-scoped 详情读端口。
    // 端口未装配(contextReaders 缺省 / 具体方法缺省)→ 工具侧诚实空态(found:false / null),
    // 绝不塞假数据。全部按 ctx.userId 收窄(读端口内部据 ctx 收窄,读不到 → null/空)。
    getProjectDetail: async ({ projectId }) => {
      if (!deps.contextReaders?.getProjectDetail) return null;
      return deps.contextReaders.getProjectDetail(ctx, { projectId });
    },
    getPositioningDetail: async () => {
      if (!deps.contextReaders?.getPositioningDetail) {
        return {
          profile: null,
          currentStatement: null,
          statementCount: null,
          accounts: [],
        };
      }
      return deps.contextReaders.getPositioningDetail(ctx);
    },
    getKnowledgeDetail: async ({ id }) => {
      if (!deps.contextReaders?.getKnowledgeDetail) return null;
      return deps.contextReaders.getKnowledgeDetail(ctx, { id });
    },
    // [T-099c] 全文类 context 工具(切片三)—— execute 调注入的 user-scoped 全文读端口。
    // 端口未装配(contextReaders 缺省 / 具体方法缺省)→ 工具侧诚实空态(found:false),
    // 绝不塞假数据。窗口截断(§3 全文档预算)由工具 execute 侧强制,读端口只回原始全文。
    listProjectArtifacts: async ({ projectId }) => {
      if (!deps.contextReaders?.listProjectArtifacts) return null;
      return deps.contextReaders.listProjectArtifacts(ctx, { projectId });
    },
    getArtifactText: async ({ projectId, artifactType }) => {
      if (!deps.contextReaders?.getArtifactText) return null;
      return deps.contextReaders.getArtifactText(ctx, { projectId, artifactType });
    },
    getKnowledgeText: async ({ id }) => {
      if (!deps.contextReaders?.getKnowledgeText) return null;
      return deps.contextReaders.getKnowledgeText(ctx, { id });
    },
    // [T-099 切片四/五] 指标/发布/经验/候选/校准类 context 工具 —— execute 调注入的 user-scoped
    // 清单读端口。端口未装配(contextReaders 缺省 / 具体方法缺省)→ 工具侧诚实空态(空数组 /
    // rows 空 / rubric:null),绝不塞假数据。全部按 ctx.userId 收窄(读端口内部据 ctx 收窄)。
    listPublications: async ({ limit, offset }) => {
      if (!deps.contextReaders?.listPublications) {
        return { rows: [], total: 0 };
      }
      return deps.contextReaders.listPublications(ctx, { limit, offset });
    },
    getMetrics: async ({ projectId, limit }) => {
      if (!deps.contextReaders?.getMetrics) {
        return { subject: null, rows: [], retention: [] };
      }
      return deps.contextReaders.getMetrics(ctx, { projectId, limit });
    },
    listLearnings: async ({ query, learningType, status, limit }) => {
      if (!deps.contextReaders?.listLearnings) {
        return { rows: [], total: 0 };
      }
      return deps.contextReaders.listLearnings(ctx, {
        query,
        learningType,
        status,
        limit,
      });
    },
    listCandidates: async ({ limit, offset }) => {
      if (!deps.contextReaders?.listCandidates) {
        return { rows: [], total: 0 };
      }
      return deps.contextReaders.listCandidates(ctx, { limit, offset });
    },
    getPredictions: async ({ limit }) => {
      if (!deps.contextReaders?.getPredictions) {
        return { rubric: null, rows: [], total: 0 };
      }
      return deps.contextReaders.getPredictions(ctx, { limit });
    },
  };
  const tools = buildChatTools(toolWhitelist, toolDeps);

  // [T-117 确定性修] functionKey 是深链/按钮明确指定的工具(如「补全选题卡」深链 fn=topic.enrich);
  // 命中真工具时强制本轮调它,防模型把卡当文本吐 + 谎称已渲卡(弱 tool-calling 模型的常态)。
  const forcedTool =
    chatContext.functionKey && toolWhitelist.includes(chatContext.functionKey)
      ? chatContext.functionKey
      : undefined;

  // [T-263] HITL 授权门:从本轮已挂工具收录登记了授权判定器的工具(当前仅 local.read),装配
  // streamText 的 toolApproval 配置。工具不在白名单 / decideLocalRead 端口未装配 → 自然缺席。
  const toolApproval = buildChatToolApproval(tools);

  return { skillId, system, tools, modelSpec, forcedTool, toolApproval };
}

// ── [T-239f S6] 步数收尾 ────────────────────────────────────────────────────
/** 对话工具循环步数上限:env CREATOROS_CHAT_MAX_STEPS,默认 6,夹在 [2, 12](至少留 1 步
 *  给「禁工具强制收尾」;上限防误配无限循环)。 */
export function resolveChatMaxSteps(
  env: Record<string, string | undefined>,
): number {
  const raw = env.CREATOROS_CHAT_MAX_STEPS?.trim();
  if (!raw) return 6;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 6;
  return Math.min(12, Math.max(2, Math.floor(n)));
}

/**
 * [T-117 强制工具 + T-239f 末步禁工具] 的 prepareStep 纯函数(可单测):
 *   - 第 0 步:forcedTool 有值 → toolChoice 强制调它(深链按钮的显式意图,防弱模型吐文本谎称渲卡);
 *   - 最后一步(stepNumber === maxSteps-1):toolChoice:'none' 禁工具 —— stopWhen 只会「掐断」,
 *     模型没机会总结;末步禁工具让它**必须**用文字把已有工具结果收尾,多工具任务不再静默腰斩;
 *   - 其余步:{}(auto,行为不变)。
 */
export function buildChatPrepareStep(opts: {
  forcedTool?: string;
  maxSteps: number;
}): (step: { stepNumber: number }) => {
  toolChoice?: "none" | { type: "tool"; toolName: string };
} {
  return ({ stepNumber }) => {
    if (opts.forcedTool && stepNumber === 0) {
      return {
        toolChoice: { type: "tool" as const, toolName: opts.forcedTool },
      };
    }
    if (stepNumber >= opts.maxSteps - 1) {
      return { toolChoice: "none" as const };
    }
    return {};
  };
}

/**
 * 串起 streamText(SPEC §3.3)—— 装配 + 把 UIMessage[] 转成 ModelMessage[] 喂模型,流式产出。
 * `onFinish` 由路由传入(落 ai_messages 的 assistant 文本)。返回 StreamTextResult,路由用
 * `toUIMessageStreamResponse()` 流回前端(useChat 消费)。
 * [T-239c S2] input.abortSignal = 请求的 req.signal:用户点「停止」/关页 → streamText 立停
 * (不再空烧后续步),且经工具 execute 第二参 { abortSignal } 透传给长工具(截图/web.read)提前退出。
 * [T-239e] input.onUsage(additive,可选):本轮 token 用量回报口 —— 每步完成时以**累计值**
 * 回调(route 持最新值,toUIMessageStreamResponse onFinish 落 ai_messages;中断轮已完成步的
 * 用量也已回报过,照落);整轮 finish 时再以 SDK totalUsage 权威值覆盖一次。
 */
export async function runChatStream(
  ctx: RequestContext,
  input: {
    messages: UIMessage[];
    chatContext: ChatContext;
    abortSignal?: AbortSignal;
    onUsage?: (usage: {
      inputTokens: number | null;
      outputTokens: number | null;
      cachedTokens: number | null;
      modelKey: string;
    }) => void;
  },
  deps: AssembleChatDeps,
  onFinish?: (finalText: string) => void | Promise<void>,
) {
  const assembly = await buildChatAssembly(ctx, input.chatContext, deps);
  const { modelFor } = await import("@creatoros/ai-worker");
  // [T-239d] 喂模型前投影(chat-history-window 纯函数;**只改喂模型的副本,ai_messages 存储
  // 原样** —— 刷新恢复/卡重渲不受影响):① 近 N 轮之外的 tool-result 换指针占位(数据卡已渲
  // 给用户,模型只有指针权 —— honesty 规则 6);② 清体后仍超「窗口×80%」→ 只保 system+近 K 轮,
  // 更早整轮截掉 + 首条注入「更早历史已省略」。切点选 convertToModelMessages **之前**:
  // UIMessage 层按「轮」操作最薄;转 ModelMessage 后 tool-call/result 拆散成对,再截会拦腰断对。
  // [T-274] 先净化「被后续对话遗弃的未完成 tool 调用」(HITL 授权卡没点就发新消息 → 悬空
  // tool-call → convertToLanguageModelPrompt 抛 MissingToolResultsError 崩整流)。再投影窗口。
  const sanitized = dropAbandonedApprovalParts(input.messages);
  const projection = projectChatHistory(sanitized, {
    systemText: assembly.system,
    keepToolResultTurns: resolveToolResultKeepTurns(process.env),
    keepTurns: resolveTruncateKeepTurns(process.env),
    contextWindowTokens: resolveContextWindowTokens(process.env),
  });
  console.info(formatChatContextLog(projection));
  // [T-274] ignoreIncompleteToolCalls:兜住 input-available/input-streaming 中断态残留(净化器
  // 已摘 approval-requested;两者叠加 = 悬空 tool-call 全覆盖,不误伤正常批准 resume)。
  const modelMessages = await convertToModelMessages(projection.messages, {
    ignoreIncompleteToolCalls: true,
  });

  // [T-239e] token 用量累计(usage 可见):onStepEnd 逐步累加并回报(中断轮已完成步不丢);
  // finish 时以 totalUsage 权威值覆盖。字段名以 ai@7.0.4 d.ts LanguageModelUsage 为准:
  // inputTokens / outputTokens / inputTokenDetails.cacheReadTokens(命中缓存的输入)。
  // 「没拿到任何数字」时不回报(诚实缺省,落库 NULL 而非 0 充数)。
  const usageAcc = { input: 0, output: 0, cached: 0, seen: false };
  const reportUsage = () => {
    if (!input.onUsage || !usageAcc.seen) return;
    input.onUsage({
      inputTokens: usageAcc.input,
      outputTokens: usageAcc.output,
      cachedTokens: usageAcc.cached,
      // fallback 接管轮如实记 fallback 的模型 id(计费主体是它),否则记主模型。
      modelKey:
        recovery.fallbackUsed && fallbackSpecModel
          ? fallbackSpecModel
          : assembly.modelSpec.model,
    });
  };
  const addUsage = (u: {
    inputTokens?: number;
    outputTokens?: number;
    inputTokenDetails?: { cacheReadTokens?: number };
  }) => {
    const inTok = u?.inputTokens;
    const outTok = u?.outputTokens;
    const cachedTok = u?.inputTokenDetails?.cacheReadTokens;
    if (
      typeof inTok !== "number" &&
      typeof outTok !== "number" &&
      typeof cachedTok !== "number"
    ) {
      return;
    }
    usageAcc.seen = true;
    usageAcc.input += typeof inTok === "number" ? inTok : 0;
    usageAcc.output += typeof outTok === "number" ? outTok : 0;
    usageAcc.cached += typeof cachedTok === "number" ? cachedTok : 0;
    reportUsage();
  };

  // [T-239b S1] fallback 模型(用户可配 chat.fallback,只认专配行):解析失败/未配 → null,
  // 绝不阻断主流程(fallback 是增强,不是门)。
  let fallbackModel: ReturnType<typeof modelFor> | null = null;
  // [T-239e] fallback 模型 id 留档 —— fallback 接管轮 usage 落库时 modelKey 如实记它。
  let fallbackSpecModel: string | null = null;
  if (deps.resolveFallbackModelSpec) {
    try {
      const fallbackSpec = await deps.resolveFallbackModelSpec(ctx);
      if (fallbackSpec) {
        fallbackModel = modelFor(fallbackSpec);
        fallbackSpecModel = fallbackSpec.model;
      }
    } catch {
      fallbackModel = null;
    }
  }

  // [T-239b S1] typed 终止原因打点:恢复层事件归纳到本轮 outcome(completed|error_recovered|
  // fallback_used|retry_exhausted|aborted|error),轻量 console 可观测(SPEC §5 验收)。
  const startedAt = Date.now();
  const recovery = { retried: false, fallbackUsed: false, exhausted: false };
  const logOutcome = (outcome: string) => {
    console.info(
      `[chat-turn] outcome=${outcome} durationMs=${Date.now() - startedAt}`,
    );
  };

  // 主模型包上错误恢复层(分类重试 + 500ms×2^n 封顶 32s + 25% jitter + honor retry-after +
  // fallback 接管);streamText 的 maxRetries 置 0 —— 重试语义收归恢复层,SDK 原生重试
  // (不分类、无 fallback)留着会与本层相乘。流中途断不重发(交前端 regenerate,SPEC 边界)。
  const model = createRecoveringModel({
    model: modelFor(assembly.modelSpec),
    fallbackModel,
    maxRetries: resolveLlmMaxRetries(process.env),
    onEvent: (e) => {
      if (e.type === "retry") {
        recovery.retried = true;
        console.warn(
          `[chat-turn] llm retry attempt=${e.attempt} delayMs=${Math.round(e.delayMs ?? 0)} reason=${e.reason}`,
        );
      } else if (e.type === "fallback") {
        recovery.fallbackUsed = true;
        console.warn(
          `[chat-turn] fallback 接管:主模型可重试错误耗尽(reason=${e.reason}),切换用户配置的备用对话模型`,
        );
      } else if (e.type === "exhausted") {
        recovery.exhausted = true;
      }
    },
  });

  // [T-239f S6] 步数上限可配(默认 6)+ 最后一步禁工具强制收尾(buildChatPrepareStep 纯函数,
  // 兼管 [T-117] forcedTool 第 0 步强制)—— 多工具任务不再被 stopWhen 静默腰斩。
  const maxSteps = resolveChatMaxSteps(process.env);

  const result = streamText({
    model,
    maxRetries: 0,
    // [T-239c S2] 中断真一致:route 传 req.signal —— 用户点「停止」/断开,服务端本轮立停
    // (不再跑后续工具烧钱);SDK 会把 signal 经工具 execute 第二参 { abortSignal } 透传。
    abortSignal: input.abortSignal,
    system: assembly.system,
    messages: modelMessages,
    tools: assembly.tools,
    // [T-117 确定性修] functionKey 命中真工具时,第 0 步 toolChoice 强制调它 → 必产 tool-result
    // → 前端渲真卡(弱 tool-calling 模型不再把卡当文本吐 + 谎称已渲卡);之后步恢复 auto,让模型
    // 据工具结果把话说完。[T-239f] 最后一步 toolChoice:'none' 禁工具,模型必须文字总结收尾。
    prepareStep: buildChatPrepareStep({
      forcedTool: assembly.forcedTool,
      maxSteps,
    }),
    // [T-263] 原生工具授权(HITL):local.read 未授权 → SDK 挂起该工具调用、以 approval-requested
    // 态 surface 前端确认卡(execute 暂不跑),用户「允许」写 grant + addToolApprovalResponse →
    // sendAutomaticallyWhen 同回合 resume 续跑 execute 读到内容。无需授权门时 undefined(行为不变)。
    ...(assembly.toolApproval ? { toolApproval: assembly.toolApproval } : {}),
    // 工具调用后让模型据工具结果继续把话说完(候选已在 tool-result part 里流回前端渲卡)。
    stopWhen: stepCountIs(maxSteps),
    // [T-239b] typed 终止原因:成功轮按恢复层事件归纳;错误轮区分「可重试耗尽」与其它;
    // 中断轮(abortSignal / 客户端断开)单独记 aborted。打点不影响既有 onFinish 落库语义。
    onAbort: () => {
      logOutcome("aborted");
    },
    onError: () => {
      logOutcome(recovery.exhausted ? "retry_exhausted" : "error");
    },
    // [T-239e] 每步完成即累加回报 usage —— 中断轮(onFinish 不触发)已完成步的用量也已回报,
    // route 的中断落库分支照带(SPEC「中断轮也落」)。
    onStepEnd: (step) => {
      addUsage(step.usage ?? {});
    },
    onFinish: async ({ text, totalUsage }) => {
      // [T-239e] finish 用 SDK totalUsage 权威值覆盖累计(个别 provider 步内 usage 不全时
      // 以整轮汇总为准),再回报一次 —— route 落库拿到的恒是最终值。
      if (
        totalUsage &&
        (typeof totalUsage.inputTokens === "number" ||
          typeof totalUsage.outputTokens === "number")
      ) {
        usageAcc.seen = true;
        usageAcc.input = totalUsage.inputTokens ?? 0;
        usageAcc.output = totalUsage.outputTokens ?? 0;
        usageAcc.cached = totalUsage.inputTokenDetails?.cacheReadTokens ?? 0;
        reportUsage();
      }
      logOutcome(
        recovery.fallbackUsed
          ? "fallback_used"
          : recovery.retried
            ? "error_recovered"
            : "completed",
      );
      if (onFinish) await onFinish(text);
    },
  });
  return result;
}

// [T-055c] script.hooks 的宽容 JSON 解析:剥围栏 → 找首个 [...] → 逐条收窄。
// 模型输出不合形 → 返回 []（诚实空,前端渲「没生成出来」而非崩)。
export function parseHookItems(
  raw: string,
): Array<{ text: string; angle: string }> {
  const text = raw.replace(/```(?:json)?/g, "").trim();
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((it) => {
        const o = it as { text?: unknown; angle?: unknown };
        const t = typeof o.text === "string" ? o.text.trim() : "";
        const a = typeof o.angle === "string" ? o.angle.trim() : "";
        return t ? { text: t, angle: a || "hook" } : null;
      })
      .filter((x): x is { text: string; angle: string } => x !== null)
      .slice(0, 6);
  } catch {
    return [];
  }
}
