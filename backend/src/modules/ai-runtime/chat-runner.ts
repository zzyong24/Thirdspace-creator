import { prepareScriptImportAuthorization, parseSemanticVerbatimSelection } from "./chat-script-import-authorization";
import { prepareChatDiagnosis, projectChatDiagnosis, chatDiagnosisKeys } from "./chat-diagnosis-node";
import {prepareChatResearchQuery,projectChatSearchResults,type ChatResearchContext} from "./chat-research-preparation";
import type {ChatStructuredContext} from "./chat-structured-tool-nodes";
import { runChatTopicEnrich, runChatPositioning } from "./chat-structured-tool-nodes";
import type { ScriptHooksContext } from "@creatoros/contract/execution-worker";
import { EXTRA_BRIEF_HEADING, prepareScriptHooks, finalizeHookItems } from "@creatoros/ai-worker/chat";
import {createChatReadToolBindings} from "./chat-read-tool-bindings";
import {resolveChatGuideSnapshot} from "./chat-guide-snapshot";
import { createChatModelStream, resolveChatMaxSteps } from "@creatoros/ai-worker/chat";
import {
  type UIMessage,
  type ToolSet,
  type ToolApprovalStatus,
} from "ai";
// [T-263] HITL 授权门:从已挂工具装配 streamText 的 toolApproval 配置(单一真值在 chat-tool-gate)。
import {
  buildChatToolApproval,
} from "./chat-tool-gate";
import type { RequestContext } from "@creatoros/contract";
import type {
  ModelSpec,
} from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  formatProjectStageBlock,
  type ContextDeps,
} from "./creative-context";
import {
  resolveSkillForSurface,
  applyFunctionKey,
  assembleChatSystem,
  assembleSelectionContext,
  wrapUserData,
  selectRecentChatTasks,
  formatRecentTasksBlock,
  type ChatContext,
  normalizeWebReadUrl,
  type RecentTaskTruth,
} from "./chat-context";
import {
  buildChatTools,
  ALL_CHAT_TOOL_NAMES,
  getSurfaceToolScope,
  type ChatToolDeps,
  type PositioningDiscoverySnapshot,
  type ProjectDetailRaw,
  type ProjectLifecycleRaw,
  type ReviewReportRaw,
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
  type CoverReferenceSelection,
  type VerbatimSource,
  type ScriptDraftSourceSnapshot,
} from "./chat-tools";
// [T-256a] 工具探测结果类型(端口契约共用)。
import type { DetectToolsResult } from "./local-env-probe";
import { buildSkillsBrief } from "@creatoros/contract";
import { prepareChatModelMessages } from "./chat-model-messages";
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
import { parseLearnings, reviewFacets } from "./review-runner";
import { parseDiagnosis } from "./calibration-diagnose-runner";
import {
  formatErrorDiagnostic,
  observableModelKey,
} from "./error-diagnostics";

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
  /** [T-652] 定位卡生成前读取当前账号的最新前采 session，防止信任旧对话版本。 */
  getPositioningDiscovery?: (
    ctx: RequestContext,
    sessionId: string,
  ) => Promise<PositioningDiscoverySnapshot | null>;
  /** 按 capability 解析用户配的 model(复用 persistence-client 的 resolveModelSpec)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
  /**
   * [T-513] 对话工具在一个 chatbox Skill 内同步调用另一个 Skill 时，用当前 owner tuple
   * 解析该子调用自己的不可变快照并临时进入 ALS。可选仅为兼容纯单测/旧宿主；生产 composition
   * 必须装配。active snapshot 下若漏装，子节点会因 snapshot 缺少对应 id 而 fail closed。
   */
  runWithSkillSnapshot?: <T>(
    ctx: RequestContext,
    requiredSkillIds: readonly string[],
    execute: () => Promise<T>,
  ) => Promise<T>;
  /**
   * [T-239b S1] 备用对话模型端口(可选)—— **只认 `chat.fallback` 专配行**(不回退 default/env,
   * 否则「备用」会解析成主模型自己);未配返 null。主模型流开始前可重试错误耗尽时,chat-runner
   * 用它换备用模型再启动一次(模型用户可配的铁律 —— 绝不写死 fallback 厂商)。
   */
  resolveFallbackModelSpec?: (
    ctx: RequestContext,
  ) => Promise<ModelSpec | null>;
  /**
   * [T-684] 联网检索端口——由 composition root 绑定 CreatorOS 内置浏览器搜索。
   * probeSearchConfigured 仅为兼容旧接口保留；是否可联网只看 searchWeb 是否装配。
   * 浏览器失败时返回 unavailable，绝不以模型记忆伪装真实检索结果。
   */
  probeSearchConfigured?: (ctx: RequestContext) => Promise<boolean>;
  searchWeb?: (
    ctx: RequestContext,
    query: string,
    opts?: { count?: number; signal?: AbortSignal },
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
    // [T-390] HTTP 被拒(403 反爬/404 下架/5xx)→ 端口已多路搜索(已配 provider→必应→百度)
    //   找替代来源;alternates 可为空(诚实)。message 人话(含未登录时的保管库引导)。
    | {
        blocked: true;
        status: number | null;
        message: string;
        alternates: Array<{ title: string; url: string; snippet: string }>;
      }
  >;
  /**
   * [T-386] 后台任务状态真值端口 —— 每轮对话开始前查该账号近期任务的**库内真实状态**
   * (composition root 绑 aiService.listTasks 投影),装配层渲成「后台任务状态真值」system 块。
   * 治「整稿卡已显✓写入稿面,编导仍说还在后台跑」的记忆断言幻觉。可选:未装配/读失败 →
   * 不注块(best-effort 增强,绝不阻断装配),honesty 第 16 条仍兜底「不确定就看卡片」。
   */
  listRecentTasksPort?: (ctx: RequestContext) => Promise<RecentTaskTruth[]>;
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
  /** T-730：可选论点候选异步分派；不预建 artifact/version。 */
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
    input: {
      projectId: string;
      topic?: string;
      referenceAssetId?: string;
      visualRequirements?: string;
    },
  ) => Promise<{ taskId: string }>;
  /**
   * [T-523] Copilot 抖音分享编排端口：只经 intelligence service 创建持久任务。
   * transcribe=true 只允许来自最新一轮用户原文的明确授权。
   */
  dispatchDouyinSharePort?: (
    ctx: RequestContext,
    input: { shareInput: string; transcribe: boolean },
  ) => Promise<{ taskId: string; ownerId: string }>;
  /**
   * [T-268] script.draft 端口 —— dispatch 既有异步 runner runScriptDraft(script-runner.ts,复活
   * 孤儿;整稿分钟级不能 inline 阻塞对话回合)。绑定层先 ensure 项目的 output_script artifact 并把
   * artifactId 写进 task.inputData(采纳时 append 新版本 → 稿面编辑器读回),再 createTask。由
   * composition root 绑(ai transport 的 ai.tasks.create + artifactsService)。可选:未装配 →
   * 工具报「整稿能力未接入」(诚实降级)。
   */
  dispatchScriptDraftPort?: (
    ctx: RequestContext,
    input: {
      projectId: string;
      topic?: string;
      angle?: string;
      targetDurationSeconds?: number;
      extraBrief?: string;
      instruction?: string;
      sourceSnapshots?: ScriptDraftSourceSnapshot[];
      draftMode?: "verbatim";
      verbatimSourceRef?: string;
      verbatimSourceText?: string;
      verbatimSourceLength?: number;
      verbatimSourceSha256?: string;
    },
  ) => Promise<{ taskId: string }>;
  /** 读取当前已确认剪辑方案并应用有界 patch，只返回候选，不写库。 */
  prepareVideoEditPort?: (
    ctx: RequestContext,
    input: {
      projectId: string;
      instruction: string;
      removeBrollAssetIds?: string[];
      replaceBroll?: Array<{ sceneIdx: number; assetId: string }>;
      moveBroll?: Array<{ assetId: string; at: number; durationSec?: number }>;
      removeCardIndexes?: number[];
    },
  ) => Promise<import("./chat-tools").VideoEditToolResult>;
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
      source?: string;
      publishedAt?: string | null;
    }>;
    total: number;
  }>;
  /** [T-691] 显式历史意图使用的完整项目检索，发布时间来自 Publication 真值。 */
  searchProjects?: (
    ctx: RequestContext,
    opts: {
      query?: string;
      publishedOnly?: boolean;
      orderBy: "publishedAt" | "updatedAt";
      direction: "asc" | "desc";
      limit: number;
      excludeProjectId?: string;
    },
  ) => Promise<{
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
   * [T-523] 封面参考图的全库精确读端口。实现必须完整读取并返回图片总数；只有
   * total===1 才能确定性自动选择，不能把第一页的一张误判为全库唯一。
   */
  listCoverReferenceImages?: (
    ctx: RequestContext,
  ) => Promise<{
    rows: Array<{ id: string; title: string; kind: string }>;
    total: number;
  }>;
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
  /** [T-691] 当前项目跨模块生命周期索引；分区失败必须显式保留在 errors。 */
  getProjectLifecycle?: (
    ctx: RequestContext,
    opts: { projectId: string },
  ) => Promise<ProjectLifecycleRaw | null>;
  /** [T-691] 当前或指定审核报告。 */
  getReviewReport?: (
    ctx: RequestContext,
    opts: { projectId: string; reportId?: string },
  ) => Promise<ReviewReportRaw | null>;
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
    opts: {
      limit: number;
      offset: number;
      view?: "published_cover_candidates";
    },
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


// [T-081①] 产内容工具的 extraBrief 统一注入段头 —— 对话中获得的补充指令/洞察进生成 prompt 的
// 段标题(各工具/facet 同一措辞,单一真值)。导出供各 runner facet 拼装与单测锚定。
export { EXTRA_BRIEF_HEADING, buildHooksPrompt, parseHookItems } from "@creatoros/ai-worker/chat";

// [T-081②] positioning.generate 的真实作品画像 —— formatWorksBrief 已移到 creative-context
// (对话工具 + 后台 task 两条定位生成路径共用,单一真值);此处再导出保持既有 import 面不变。
export { formatWorksBrief, WORKS_BRIEF_MAX_ROWS } from "./creative-context";

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
  /** [T-779] 明确的只读→生成组合请求需要按顺序执行的工具。 */
  forcedToolSequence?: string[];
  /**
   * [T-263] SDK 原生工具授权(HITL)配置 —— 从已挂工具收录登记了授权判定器的工具(当前仅
   * local.read)装配的 per-tool 判定映射,喂给 streamText 的 `toolApproval`。undefined = 本轮无
   * 需授权门的工具(streamText 不传该配置,行为与旧一致)。
   */
  toolApproval?: Record<string, (input: unknown) => Promise<ToolApprovalStatus>>;
}

export type CopilotMediaRoute =
  | { kind: "douyin.share"; shareInput: string; transcribe: boolean }
  | { kind: "cover.reference" }
  | { kind: "cover.publication_reference" };

const DOUYIN_URL_RE =
  /https?:\/\/(?:(?:www|v)\.)?douyin\.com\/\S+|https?:\/\/(?:www\.)?iesdouyin\.com\/\S+/i;
const TRANSCRIBE_INTENT_RE =
  /转写|转录|逐字稿|字幕|提取(?:视频)?(?:文字|文案)|\bASR\b|transcrib|speech[\s_-]*to[\s_-]*text/i;
const TRANSCRIBE_NEGATION_RE =
  /(?:(?:不要|不用|无需|不必|不需要|不想|别)(?:(?:再|自动|帮我|给我|进行|做|跑|生成)\s*){0,3}(?:转写|转录|逐字稿|字幕|提取(?:视频)?(?:文字|文案)|\bASR\b|transcrib|speech[\s_-]*to[\s_-]*text)|不(?:转写|转录|生成(?:逐字稿|字幕)|做(?:逐字稿|字幕)|跑\s*ASR|提取(?:视频)?(?:文字|文案)))/i;
const REFERENCE_COVER_INTENT_RE =
  /(?:参考图|参考封面|照着.{0,12}(?:做|生成)|沿用.{0,12}(?:风格|样式)|复用.{0,12}封面)/i;
const REFERENCE_COVER_NEGATION_RE =
  /(?:(?:不要|不用|无需|不必|不需要|不想|别)(?:(?:再|自动|帮我|给我|使用|用)\s*){0,3}(?:参考图|参考封面|沿用|复用|照着)|不(?:使用|用|沿用|复用)(?:这张|该张|当前|之前|以前|原来)?(?:参考图|参考封面|图片|图|风格|样式)?)/i;

function hasExplicitTranscribeAuthorization(text: string): boolean {
  // 否定优先：同一最新用户轮里即便出现“字幕/转写”等关键词，也不能被升级为授权。
  if (TRANSCRIBE_NEGATION_RE.test(text)) return false;
  return TRANSCRIBE_INTENT_RE.test(text);
}

function hasReferenceCoverIntent(text: string): boolean {
  // “不要参考图，直接生成封面”中的“参考图”是拒绝，不是 image-to-image 授权。
  if (REFERENCE_COVER_NEGATION_RE.test(text)) return false;
  return /封面/i.test(text) && REFERENCE_COVER_INTENT_RE.test(text);
}

function hasPublishedCoverReferenceIntent(text: string): boolean {
  if (!hasReferenceCoverIntent(text)) return false;
  return /(?:已发布|发布作品|历史作品|最近发布|最新发布|最新的且最关联)/i.test(
    text,
  );
}

export function latestUserText(messages: UIMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    return (message.parts ?? [])
      .map((part) =>
        part.type === "text" && typeof part.text === "string" ? part.text : "",
      )
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

const ATTACHMENT_CONTEXT_PREFIX = "<attachment_context ";
const ATTACHMENT_USER_DATA_OPEN = "\n<user_data>\n";
const ATTACHMENT_USER_DATA_CLOSE = "\n</user_data>";

/**
 * 把用户消息与 route 已确定性抽取的文本附件登记成当前请求的短时来源句柄。只恢复 exact text，
 * 不做意图/主题选择；附件 wrapper 的解析是内部协议，不把用户数据升级成 system 指令。
 *
 * SEMANTIC_BOUNDARY_ALLOW: 这里只从受信消息 part 拆出原始字符与截断标记，供模型按 ref 选择；不判断创作语义或稿件质量。
 */
export function collectVerbatimSources(
  messages: readonly UIMessage[],
): VerbatimSource[] {
  const sources: VerbatimSource[] = [];
  let userOrdinal = 0;
  messages.forEach((message, messageIndex) => {
    if (message.role !== "user") return;
    const ordinal = userOrdinal;
    userOrdinal += 1;
    (message.parts ?? []).forEach((part, partIndex) => {
      if (part.type !== "text" || typeof part.text !== "string") return;
      let text = part.text;
      let label = `用户消息 ${ordinal + 1}`;
      let truncated = false;
      if (text.startsWith(ATTACHMENT_CONTEXT_PREFIX)) {
        const openIndex = text.indexOf(ATTACHMENT_USER_DATA_OPEN);
        const closeIndex = text.indexOf(
          ATTACHMENT_USER_DATA_CLOSE,
          openIndex + ATTACHMENT_USER_DATA_OPEN.length,
        );
        if (openIndex < 0 || closeIndex < 0) return;
        const headerEnd = text.indexOf(">", ATTACHMENT_CONTEXT_PREFIX.length);
        const nameRaw =
          headerEnd > 0
            ? text.slice(ATTACHMENT_CONTEXT_PREFIX.length, headerEnd)
            : "";
        const nameMatch = nameRaw.match(/^name=([\s\S]+)$/);
        let attachmentName = "文本附件";
        if (nameMatch) {
          try {
            const parsed = JSON.parse(nameMatch[1]!) as unknown;
            if (typeof parsed === "string" && parsed.trim()) {
              attachmentName = parsed.trim();
            }
          } catch {
            attachmentName = "文本附件";
          }
        }
        text = text.slice(
          openIndex + ATTACHMENT_USER_DATA_OPEN.length,
          closeIndex,
        );
        label = `文本附件：${attachmentName}`;
        truncated = part.text.includes("[内容过长，已截取前部]");
      }
      if (!text.trim()) return;
      sources.push({
        ref: `user:${messageIndex}:${partIndex}`,
        label,
        text,
        truncated,
      });
    });
  });
  return sources;
}

function formatVerbatimSourceInventory(
  sources: readonly VerbatimSource[],
): string {
  if (sources.length === 0) return "";
  const visible = sources.slice(-16);
  return [
    "【本轮受信资料来源 —— generate / verbatim 共用】",
    "用户要求基于聊天长文、杂乱资料、文本附件或已有文案创作/润色时，调用 script.draft(mode=generate)，用 sourceRefs 按用户要求纳入的顺序选择全部资料，并用 instruction 保留本轮调整方向。禁止把长资料压成 extraBrief；任一必需来源失败时不要静默跳过。",
    "用户明确要求原文不改/一字不改/逐字写入时，调用 script.draft(mode=verbatim)，从下列 sourceRef 选择来源；禁止把原文压缩进 extraBrief，也禁止自行重抄正文。项目 Brief、定位、复盘与归因中的创作建议不能阻止这条保真导入。",
    "完整稿件是一等输入，不只接受主题、骨架或补充要求。但用户仅仅粘贴/发送稿件，不等于授权你创建候选；只有最新用户指令明确要求写入稿面、导入原稿或先给保真候选时，才调用本工具。",
    "你必须用语义理解判断来源里的稿件正文边界：区分用户对助手交代的视频状态、背景、操作要求，与用户准备面向视频观众表达的稿件。如果同一条消息同时含有两者，必须提交能唯一定位完整稿件正文的 startAnchor / endAnchor。交代结束后紧接的第一句稿件开场也属于正文，不能因为它像过渡句、产品介绍或不是理想 hook 就删掉。只有当整条来源从第一个字符到最后一个字符全部都是稿件正文时，才可以省略锚点导入整份来源。不要用写死关键词或固定句式判断边界。",
    ...visible.map((source) => {
      const preview = source.text.replace(/\s+/g, " ").slice(0, 80);
      return [
        `- sourceRef=${source.ref} | ${source.label} | ${source.text.length} 字符${source.truncated ? " | 已截断，禁止全文保真" : ""}`,
        wrapUserData(preview),
      ].join("\n");
    }),
  ].join("\n");
}

/**
 * [T-523] Host 侧确定性媒体路由。只读最新一轮用户原文，模型不能把普通分享升级成
 * 转写授权；抖音链接一旦命中就走持久内容雷达链，不再落到通用 web.read。
 */
export function detectCopilotMediaRoute(
  messages: UIMessage[],
): CopilotMediaRoute | null {
  const text = latestUserText(messages);
  if (!text) return null;
  if (DOUYIN_URL_RE.test(text)) {
    return {
      kind: "douyin.share",
      shareInput: text,
      transcribe: hasExplicitTranscribeAuthorization(text),
    };
  }
  if (hasPublishedCoverReferenceIntent(text)) {
    return { kind: "cover.publication_reference" };
  }
  if (hasReferenceCoverIntent(text)) {
    return { kind: "cover.reference" };
  }
  return null;
}

export function isScratchPositioningConversation(messages: UIMessage[]): boolean {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    const text = (message.parts ?? [])
      .map((part) =>
        part.type === "text" && typeof part.text === "string" ? part.text : "",
      )
      .join("\n");
    // T-707：定位已收敛到 Copilot，不再依赖旧问卷的「前采已完成」暗号。
    // 只识别明确的 scratch 选择，不能把入口里“你可以选择重新定位”的说明误判为
    // 已经选择 scratch，否则会错误隔离现有母版与作品证据。
    if (
      /(?:^|\n)定位路径：scratch(?:\s|$)/u.test(text) ||
      /(?:^|\n)本次起点：重新定位[。\s]*(?:\n|$)/u.test(text) ||
      /(?:^|\n)(?:我要|我想|选择|按)完全从零开始(?:重新)?定位[。！!\s]*(?:\n|$)/u.test(
        text,
      ) ||
      /(?:^|\n)(?:我要|我想|选择)重新定位[。！!\s]*(?:\n|$)/u.test(text)
    ) {
      return true;
    }
  }
  return false;
}

/** 只有全库图片精确总数为 1 时才自动选择；分页未读全也必须要求用户明确选择。 */
export function resolveUniqueCoverReference(
  images: Array<{ id: string; title: string; kind: string }>,
  total: number,
): CoverReferenceSelection {
  const candidates = images
    .filter((material) => material.kind.trim().toLowerCase() === "image")
    .map(({ id, title }) => ({ id, title }));
  if (total === 1 && candidates.length === 1) {
    return {
      status: "selected",
      assetId: candidates[0]!.id,
      title: candidates[0]!.title,
    };
  }
  return {
    status: "needs_clarification",
    reason:
      total === 0
        ? "no_image"
        : Number.isFinite(total) && total > 1
          ? "multiple_images"
          : "incomplete_catalog",
    total:
      Number.isInteger(total) && total >= 0
        ? total
        : null,
    candidates,
  };
}

/**
 * 纯装配(不调模型)—— resolve skill(surface 层)→ 装配 CreativeContext facets(数据层)→
 * 拼 system → 按 skill 白名单挂工具(工具白名单层)。单测直接断言它的产物。
 *
 * 工具 execute 复用现有 runner 核心(runTopicNode / 选题卡补全),都在请求期用解析好的 model
 * 跑;故这里先解析 model(没配 key 抛 LlmCredentialError,由路由接住返 4xx,不假成功)。
 */
export type ChatAssemblyPreparation = Omit<ChatAssembly,"modelSpec"> & {capability:string;researchContext?:ChatResearchContext;structuredContext?:ChatStructuredContext;scriptHooksContext?:ScriptHooksContext};
type ChatAssemblyArgs = [ctx:RequestContext,chatContext:ChatContext,deps:AssembleChatDeps,mediaRoute?:CopilotMediaRoute|null,options?:{positioningScratch?:boolean;verbatimSources?:readonly VerbatimSource[];latestUserInstruction?:string}];
/** 准备上下文与真实工具，不取得主模型凭据；工具执行迁移仍由各真实端口承担。 */
export async function prepareChatAssembly(...args:ChatAssemblyArgs):Promise<ChatAssemblyPreparation>{
  const {modelSpec: _modelSpec,...prepared}=await assembleChat(...args);
  return prepared;
}
/** 兼容现有流式入口：保持装配期凭据校验与主模型句柄复用。 */
export async function buildChatAssembly(...args:ChatAssemblyArgs):Promise<ChatAssembly>{
  const assembled=await assembleChat(args[0],args[1],args[2],args[3],args[4],true);
  if(!assembled.modelSpec)throw new Error("聊天主模型未解析");
  const {capability:_capability,scriptHooksContext:_hooks,structuredContext:_structured,researchContext:_research,...legacy}=assembled;
  return {...legacy,modelSpec:assembled.modelSpec};
}

async function assembleChat(
  ctx: RequestContext,
  chatContext: ChatContext,
  deps: AssembleChatDeps,
  mediaRoute: CopilotMediaRoute | null = null,
  options: {
    positioningScratch?: boolean;
    verbatimSources?: readonly VerbatimSource[];
    latestUserInstruction?: string;
  } = {},
  resolvePrimaryCredential = false,
): Promise<ChatAssemblyPreparation & {modelSpec?:ModelSpec}> {
  const runWithSkillSnapshot = <T>(
    requiredSkillIds: readonly string[],
    execute: () => Promise<T>,
  ): Promise<T> =>
    deps.runWithSkillSnapshot
      ? deps.runWithSkillSnapshot(ctx, requiredSkillIds, execute)
      : execute();

  // 1) 页面层:surface → 基础 skill。
  const skillId = resolveSkillForSurface(chatContext.surface);

  // 2) registry 取 skill(模板 system + 工具白名单)。懒加载 ai-worker(AI SDK 不进顶层 bundle)。
  const {
    getEffectiveTemplate,
    getEffectiveTools,
    getTemplate,
    getTools,
    hasActiveEffectiveSkillSnapshot,
    modelFor,
    runTopicNode,
    runStructuredNode,
    runTemplatedNode,
    runAgentNode,
  } = await import("@creatoros/ai-worker");
  const hasEffectiveScope = hasActiveEffectiveSkillSnapshot();
  const skill = hasEffectiveScope
    ? getEffectiveTemplate(skillId)
    : getTemplate(skillId);
  // [T-770] 在当前 ALS scope 内一次性校验并冻结代码随版的产品说明。正文只留在服务端闭包，
  // 不拼进 system；模型真正调用 creatoros.guide 时才进入 tool result。批准 surface 缺失/
  // 错版本/账号 overlay 一律让本轮显式失败，不等工具调用后再用模型记忆兜底。
  const creatorOsGuideSnapshot = await resolveChatGuideSnapshot(chatContext.surface);

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

  // [T-386] 后台任务状态真值(best-effort):每轮开始前查该账号近期 chat 派发类任务的库内
  // 真实状态,渲成 system 块 —— 让模型每轮都拿到「现在」的任务状态,而不是凭上轮记忆断言。
  // 端口未装配/读失败 → 空块不注(增强不阻断),honesty 第 16 条兜底。
  let recentTasks: RecentTaskTruth[] = [];
  if (deps.listRecentTasksPort) {
    try {
      recentTasks = selectRecentChatTasks(
        await deps.listRecentTasksPort(ctx),
        Date.now(),
      );
    } catch {
      recentTasks = [];
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
  let baseAllowed = scopedNames ?? ALL_CHAT_TOOL_NAMES;
  // [T-770] `creatoros.guide` 是低误触发元 Skill，不继承未知 surface 的“全量工具”兼容回退。
  // 只有产品协议明确批准的 topics/project 能看到短工具描述；其它已知或未来 surface 一律物理排除。
  if (chatContext.surface !== "topics" && chatContext.surface !== "project") {
    baseAllowed = baseAllowed.filter((name) => name !== "creatoros.guide");
  }
  if (options.positioningScratch && chatContext.surface === "positioning") {
    baseAllowed = baseAllowed.filter(
      (name) =>
        ![
          "context.projects",
          "context.metrics",
          "context.comments",
          "context.positioning.detail",
        ].includes(name),
    );
  }
  // [T-642] 已有可信项目引用时，当前对象不再需要全量项目库。host 侧直接拿掉列表工具，
  // 把 T-106 的“提示模型别摸索”升级成确定性约束；单项目工具由 boundProjectId 自动补 ID。
  if (chatContext.projectId) {
    baseAllowed = baseAllowed.filter((name) => name !== "context.projects");
  }
  if (mediaRoute?.kind === "douyin.share") {
    baseAllowed = baseAllowed.filter((name) => name !== "web.read");
  } else {
    // 只在本轮明确出现抖音分享或显式深链时暴露，避免普通对话让模型自行“升级”为建档。
    baseAllowed = baseAllowed.filter(
      (name) => name !== "intelligence.douyin.share",
    );
  }
  if (mediaRoute?.kind === "cover.publication_reference") {
    // 系统级可执行文件探测与 CreatorOS 的模型配置无关。该组合请求物理排除 local.tools，
    // 避免模型再次用 ffmpeg/node 探测结果臆断生图模型是否可用。
    baseAllowed = baseAllowed.filter((name) => name !== "local.tools");
  }
  const routedTool =
    mediaRoute?.kind === "douyin.share"
      ? "intelligence.douyin.share"
      : mediaRoute?.kind === "cover.reference" ||
          mediaRoute?.kind === "cover.publication_reference"
        ? "cover.generate"
        : null;
  const forcedMaterialKind =
    chatContext.functionKey === "material.generate.image"
      ? "image"
      : chatContext.functionKey === "material.generate.video"
        ? "video"
        : undefined;
  const forcedToolSequence =
    mediaRoute?.kind === "cover.publication_reference"
      ? ["context.publications", "cover.generate"]
      : forcedMaterialKind && chatContext.projectId
        ? ["context.artifact.text", "material.generate"]
        : undefined;
  if (forcedToolSequence) {
    for (const toolName of forcedToolSequence) {
      if (!baseAllowed.includes(toolName)) baseAllowed = [...baseAllowed, toolName];
    }
  }
  const scratchForbiddenTools = new Set([
    "context.projects",
    "context.metrics",
    "context.comments",
    "context.positioning.detail",
  ]);
  const effectiveFunctionKey =
    mediaRoute?.kind === "douyin.share" &&
    chatContext.functionKey === "web.read"
      ? undefined
      : options.positioningScratch &&
          chatContext.surface === "positioning" &&
          chatContext.functionKey &&
          scratchForbiddenTools.has(chatContext.functionKey)
        ? undefined
      : chatContext.projectId && chatContext.functionKey === "context.projects"
        ? undefined
        : forcedMaterialKind
          ? undefined
          : chatContext.functionKey;
  // [T-716] 局部改稿是一个已由 UI 明确锚定目标段落的原子动作，不是开放式 Copilot
  // 对话。若继续把项目分析、联网、生成整稿等几十个工具一并发给模型，不仅浪费上下文，
  // OpenAI-compatible 模型还可能在强制 tool_choice 后于流中途拒绝复杂 schema，最终只剩
  // “局部改写中断”。这里把它收敛为单工具最小回合；段落锚点仍由服务端当下真值绑定。
  const hasTrustedScriptPatchAnchor =
    chatContext.selection?.kind === "script_section" &&
    Boolean(chatContext.selection.artifactId?.trim()) &&
    Boolean(chatContext.selection.versionId?.trim()) &&
    Boolean(chatContext.selection.ids[0]?.trim()) &&
    Boolean(chatContext.selection.excerpt?.trim());
  // T-819：普通项目对话也可提供候选工具，但它必须依赖当前稿只读端口；模型先读结构化
  // currentVersion，再提交 sectionRef，execute 仍会重读一次。非项目/无读端口继续物理排除。
  const hasContextualScriptPatch = Boolean(
    chatContext.projectId &&
      deps.contextReaders?.getArtifactText &&
      effectiveFunctionKey !== "script.patch",
  );
  const isScriptPatchAction =
    effectiveFunctionKey === "script.patch" && hasTrustedScriptPatchAnchor;
  let allowedNames =
    effectiveFunctionKey &&
    ALL_CHAT_TOOL_NAMES.includes(effectiveFunctionKey) &&
    !baseAllowed.includes(effectiveFunctionKey)
      ? [...baseAllowed, effectiveFunctionKey]
      : baseAllowed;
  if (routedTool && !allowedNames.includes(routedTool)) {
    allowedNames = [...allowedNames, routedTool];
  }
  // [T-732] allChatTools 只会在可信段落锚点完整时真实挂载 script.patch。若仅从 surface
  // skill 或失效 functionKey 把它留在白名单，技能简介会宣传一个不存在的工具，forcedTool
  // 还会继续强制调用它。白名单必须与真实挂载条件使用同一真值。
  if (!hasTrustedScriptPatchAnchor && !hasContextualScriptPatch) {
    allowedNames = allowedNames.filter((name) => name !== "script.patch");
  }
  const preferredTools = applyFunctionKey(
    hasEffectiveScope ? getEffectiveTools(skillId) : getTools(skillId),
    effectiveFunctionKey,
  ).filter((n) => allowedNames.includes(n));
  const toolWhitelist = isScriptPatchAction
    ? ["script.patch"]
    : [
        ...preferredTools,
        ...allowedNames.filter((n) => !preferredTools.includes(n)),
      ];

  // 3) 解析 model。基础档按 skill 主能力解析(chatbox.topic/review/positioning 复用各自
  //    主工具的配置档);各工具 exec 内按自己的 capability 再解析(不同工具可配不同模型)。
  const skillCapability = SKILL_PRIMARY_CAPABILITY[skillId] ?? "topic.generate";
  const modelSpec = resolvePrimaryCredential ? await deps.resolveModelSpec(ctx, skillCapability) : undefined;
  let primaryModel = modelSpec ? Promise.resolve(modelFor(modelSpec)) : undefined;
  const getPrimaryModel = () => {
    if(!primaryModel){
      const loading=Promise.resolve().then(()=>deps.resolveModelSpec(ctx,skillCapability)).then(modelFor);
      primaryModel=loading;
      void loading.catch(()=>{if(primaryModel===loading)primaryModel=undefined;});
    }
    return primaryModel;
  };

  // 4) 数据层:装配 CreativeContext facets(定位 / 飞轮 / 受众信号 / 知识库 / 复盘作品真材料),
  //    注进 system。T-039a:把 chatContext.projectId 真正传下去(原写死 null → 复盘/项目相关
  //    facet 永远读不到本项目),让复盘路径能拿到这条作品的真文案/标题/数据/评论;topic 从选中态
  //    标题(工作台一键岛带进来的作品标题)派生(不再恒 ""),让账号级兜底也有真主题可用。
  const context = await assembleCreativeContext(
    ctx,
    {
      projectId: chatContext.projectId ?? null,
      topic: chatContext.selection?.label?.trim() ?? "",
      excludePositioning:
        options.positioningScratch && chatContext.surface === "positioning",
      excludeAccounts:
        options.positioningScratch && chatContext.surface === "positioning",
      excludeHistoricalCreatorContext:
        options.positioningScratch && chatContext.surface === "positioning",
    },
    deps,
  );
  // 数据层 + 选中态层(T-027):先拼 CreativeContext facets,再接上"本次对话针对的选中内容"块 ——
  // 让模型一进来就知道用户"这条"指哪条,不再瞎答/反复索要标题。
  // T-039b per-action 注入矩阵:定位对话(chatbox.positioning)额外注入账号画像 accountsBrief
  // ——定位提案要立足「这个人在平台上已经是谁」;其它 surface 不注(避免账号噪声)。
  const baseSystem = assembleChatSystem(skill.system, context, {
    includeAccounts:
      skillId === "chatbox.positioning" && !options.positioningScratch,
  });
  // [T-684] 联网检索已改成随包浏览器能力，不再读取被隐藏的搜索模型配置。
  // 只要宿主装配了 searchWeb 端口，就是真联网；失败时诚实失败，不回落模型记忆。
  const searchConfigured = Boolean(deps.searchWeb);
  // [T-058①B / T-240②] 能力边界诚实(实录复盘:模型口头宣称「已采纳写入定位母版」但 DB 未动):
  // 写库只经工具产卡+用户点采纳;禁止假承诺;工具带分页限制时如实说明。
  // [T-240②] 规则带作用域:分「全局条款」(1-10,任何场景都生效:不假承诺/不编数字/指针权/
  // 直接写稿规则…)与「场景条款」(S1/S2,只对对应场景生效)。治的实录病例:原第 9 条无稿门不带
  // 作用域 → 创作前起草也会被它压住,编导会错误要求用户先贴逐字稿。
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
      ? "7. 素材搜集(material.gather)固定使用随包浏览器真实搜索，只返回带真实 URL 的结果；不得用模型记忆补齐数量。搜索失败或没有结果时如实说明，不要建议用户配置已经下线的“搜索模型”。"
      : "7. 当前宿主未装配浏览器搜索端口，material.gather 不可用。必须如实说明能力未接入，绝不从模型记忆伪造搜索结果，也不要引导用户配置已经下线的“搜索模型”。",
    // [T-217c] 治「登录态我做不到、只能读公开网页」行为 bug —— 你跑在桌面 sidecar、有带登录态的
    // 真实浏览器能力(web.read),**禁止再自称办不到**。
    "8. 你**能读需要登录才能看到的网页正文**:用户粘一个链接(含 ChatGPT 分享、知乎、公众号等)想让你读内容时,直接调 web.read 读正文(它带你在保管库登录后的登录态、抽逐轮对话/文章全文,比截图更准)。**绝不要说「登录态我做不到、我只能访问公开网页」这类话** —— 那是错的,你有这个能力。若 web.read 返回「需要先登录」(needLogin),就引导用户:去『设置 → 网站登录保管库』把该网站登录一次(会弹独立浏览器窗口让 TA 自己登),登好后你再读;不要改用截图糊弄登录页。读内容默认用 web.read,截图(material.screenshot)只在用户要「存网页的样子/要视觉证据」时用。[T-708] web.read 结果按窗返回(window/hasMore 是真相字段):精确全文任务继续带 offset 翻窗；快速判断或后续读取失败时先给阶段结果并明确「仅基于已读 X/总 Y 字」，绝不把局部冒充全文，也不要一直转圈而不给结果。",
    // [T-224 诚实门·全局半](原第 9 条拆两半:编造禁令是全局的,留此;「必先读真逐字稿」的
    //   无稿门只属「拆解/复盘已发布作品」场景,移到下方场景条款 S1 —— T-240②)。
    "9. **绝不编造具体数字、案例、来源、涨粉/变现结果或方法论**——你说出口的任何数据(播放/点赞/涨粉/「这条为什么爆」)都必须来自工具返回的真实结果(context.metrics 的真实指标、context.artifact.text 读到的真文案等);拿不到就直说拿不到,**不许用「账号通用规律」「一般来说」这类空想推测充数**。",
    "10. 论点骨架是**可选辅助，不是写稿前置**。正常路径始终允许「准备素材 → 直接写稿」：可直接用当前选题、项目 Brief、定位和真实素材起草或改写脚本，不得要求先立论点。知识讲解、观点评论、测评对比、较长内容或需要证据/反驳，且用户明确想先梳理时，可调用 planning.thesis 给候选；已有完整逐字稿、简单通知、短口播、纯记录或用户要快速成稿时直接调用 script.draft。只有用户点击「采纳并用于写稿」的当前论点版本才能进入普通生成；verbatim 原文保真永远不读取论点。",
    // [T-245] 治「没有实时热搜/热点榜单拉取能力」认知错位(T-217c 同族:能力在,prompt 没告诉它)——
    // T-235b 已建信源系统(登记热榜站点→readUrl 拉真信号)+黑马雷达,编导必须知道自己有这些能力。
    "11. **你有真实热点能力,绝不自称「没有实时热点/热搜拉取能力」——那是错的**。你的热点能力有三路:①内容雷达中的网页/RSS 来源会保留真实条目、链接与抓取证据;②内容雷达的热点宝/黑马发现会保留官方榜单口径与原视频链接;③web 联网搜索(已配时)。用户要蹭热点/追热榜出题时:**优先调 topic.generate 并传 basis=trend**;若结果注明未拉到实时信号或用户还没登记来源,**引导 TA 去『内容雷达』登记网页/RSS、博主或分享链接**(需登录才能看的站点,先去『设置 → 网站登录保管库』登录一次),而不是让用户手动编造热点、更不是自称没能力。",
    // [T-253] 本机文件读取能力认知 + 授权协议 + 安全边界诚实(denylist 拒读时如实说明,绝不绕)。
    "12. **你能读用户本机的文件**(local.read,支持 macOS/Linux 绝对路径、Windows 盘符路径和 UNC 网络路径，也支持 ~ 展开):用户说「读一下我桌面那份稿子 / 看看 ~/xx/某文件 / 读 E:\\资料\\稿子.md / 读 \\\\server\\share\\稿子.md」时直接调它,绝不自称「Windows 路径读不了」「我碰不到你的本地文件」或要求用户换到 macOS。授权协议:首次读某路径会弹**确认卡**(needApproval)并挂起当前调用——告诉用户在卡上选「允许一次/总是允许该目录/拒绝」；允许后系统会在**同一回合自动续跑**，不要要求用户重发，也不要重复调用制造循环；被拒绝就不再尝试。安全边界(如实转述,绝不绕):敏感文件(.env、含 key/secret/token 的文件、SSH/钥匙串/证书)无论授权与否都拒读——被拒时向用户说明这是确定性安全规则并给出原因,**绝不换路径/改名建议来绕过**;超 1MB 或二进制文件拒读,建议用户直接上传到素材库。",
    // [T-256a] 环境感知能力认知(能力在,须诚实用):编导能探测本机已装工具 + 能列已授权工作区目录。
    // 铁律:探到什么报什么,缺工具诚实引导安装,绝不假装工具存在/编造版本号/臆造未授权目录。
    "13. **你能感知用户的电脑环境,但只能读、不能装、不能乱跑命令**。两件事:①**探测已装工具**(local.tools):只在动作确实依赖操作系统可执行文件时探——如用户要「抽音频/转码」前看 ffmpeg，在本机跑脚本前看 node/python3。**绝不能用 local.tools 探测 CreatorOS 的生图/文生视频/文本模型配置、provider、发布能力或其它应用内服务**；这类能力直接调用对应工具，由对应任务返回真实配置或调用错误。系统工具装了就说装了(可报版本),没装就直说并给安装命令；只支持 ffmpeg/ffprobe/node/python3/git，绝不假装工具存在、绝不编造版本号。②**列工作区目录**(local.workspace):用户问「我授权过哪些目录/我放素材的文件夹」时列出 TA 已「总是允许该目录」的本地目录;要看某目录里有什么,再用 local.read 读那个目录。清单为空就说还没授权过、引导 TA 去授权,绝不臆造用户没授权过的目录。你没有安装工具、执行任意命令、写本地文件的能力——只有「读环境」这一层,别对用户承诺装工具或跑命令。",
    // [T-265] 反工具冒充:能力不存在时诚实说明，不能抓相邻工具冒充。
    //   工具清单(上方「你的技能清单」)是你能力的单一真值:清单没列的能力=你现在没有。
    "14. **绝不用「用途不同的工具」冒充用户真正要的能力**。用户要某能力(如生成封面、做某种产物)时,先看你的技能清单里**有没有对应的工具**:有就调那个对的工具;**没有就诚实告诉用户「这个能力我现在没有对应工具」**,并说明现有工具能做到的最接近的事。宁可诚实说没有,也不误接工具骗过去。",
    // [T-380] 对话减摩擦:能力边界当场诚实 + 顺手的事直接做,不摆选项清单、不堆免责预防针。
    "15. **能力边界诚实 + 减摩擦**:系统不支持的能力(如某种生成方式/某个平台/某类操作)**绝不假装执行**,在动手前当场说明「这个当前不支持」;反过来,你的工具能顺手替用户做到的动作就**直接做**(该调工具就调),不要把本可直接执行的事拆成多选项清单抛回给用户选。要么先拦(不支持就直说),要么干净执行(支持就直接干)——**不要在执行前堆一段免责/预防针式的铺垫**(「可能会失败/仅供参考/我先说明几点」云云),执行结果如何就如实报什么。",
    // [T-386] 治实录病例:整稿卡已显「✓写入稿面」,编导下轮仍说「整稿还在后台跑,先审 brief
    // 草案」—— 凭对话记忆断言任务状态 + 凭记忆叙述稿面内容(其实已被采纳的新稿覆盖)。
    "16. **后台任务状态绝不凭记忆断言**:整稿/发布物料/封面/审核/逐字稿这类后台任务的状态,**只信系统注入的【后台任务状态真值】块和界面卡片**——你上一轮说「在后台跑」不代表现在还在跑,任务状态在你回答之间随时变化。真值块显示已完成/已写入的任务,绝不再说「还在跑/还没好/先等等」;不确定时直说「以卡片显示的状态为准」,绝不猜。同理,**要评价/审核/引用稿面当前内容时,先调 context.artifact.text 读当前版本再叙述**——你记忆里的「草案」可能已被用户采纳的新稿覆盖,凭记忆叙述旧版本 = 对着不存在的东西发言。",
    // [T-708] 创作质量条件统一软化。权限/归属/真相仍由其它条款与执行层守住。
    "17. **创作完整度不是拒绝服务的理由**:六问未答完、未先比较方向、逐字稿/素材不齐、联网失败、用户没指定长度或格式，都只能影响候选质量，不能阻止定位卡、选题卡或第一版整稿生成。用户明确说「直接生成/先给一版」时立即调用正确工具；用“待验证/待补证据/待补真实案例”标缺口，禁止编造事实。只有鉴权与数据归属、隐私安全、破坏性操作、幂等冲突、外部发送/发布，以及会把虚假事实沉淀进正式数据的情况可以硬拦。",
    "18. **故障归因必须有运行时证据**:只有工具本轮返回的 error、系统注入的【后台任务状态真值】错误，或界面卡片中的脱敏原始错误，才能支持你判断这一次为什么失败。拿到证据时引用脱敏后的原始错误和发生步骤，区分 HTTP/模型拒绝/超时/配置缺失/输入问题；不要擅自扩大成整个平台坏了。没有这些证据时必须说“原因尚未确认，以错误卡或任务状态为准”，不得笼统说“系统有问题”“平台故障”“配置坏了”，也不得用这些话替代继续执行当前能做的工作。",
    "",
    // [T-240②] 场景条款 —— 带作用域的规则,只在对应场景生效,禁止跨场景套用。
    "【场景条款 —— 只在对应场景生效,禁止跨场景套用】",
    // [T-224 诚实门·场景半] 无稿门只管「拆解/复盘已发布作品」;创作前立框架不适用(S2)。
    chatContext.projectId
      ? `S1.(仅在拆解/复盘一条**已发布**作品时生效)当前作品已绑定 projectId="${chatContext.projectId}",**先调 context.project.lifecycle 看全流程真状态,正文再调 context.artifact.text**,绝不调 context.projects 拉全库找它;拆经验再调 review.analyze。任何 lifecycle 分区是 error 都必须说“读取失败”,不能说“用户没生成/没采纳”。读不到真稿时,若关联抖音就顺手调 project.transcribe 发起抓取;抓不了就直说并请用户贴稿,绝不推测充数。`
      : "S1.(仅在拆解/复盘一条**已发布**作品时生效)拆它、产它的经验/方法论之前,**必须先读到这条作品的真逐字稿**:账号级未引用具体作品时,用户说“前几期/历史/之前发布/同系列”就用 context.projects.search 按真实发布时间找 projectId；普通最近项目才用 context.projects。拿到 id 后先调 context.project.lifecycle,正文再调 context.artifact.text;拆经验再调 review.analyze。读不到真稿时,若关联抖音就顺手调 project.transcribe 发起抓取;抓不了就直说并请用户贴稿,绝不推测充数。",
    "S2.(仅在为**创作前(未发布)**的项目搭结构或起草脚本时生效)依据是定位+选题卡+已搜集素材——这是正常创作流,**不适用 S1 的无稿门**:创作前没有逐字稿不是缺陷,不要因读不到逐字稿而卡住、不要向用户索要逐字稿、更不要把「没有逐字稿」当成拒绝起草的理由。",
  ].join("\n");
  const coverPublicationReferenceBlock =
    mediaRoute?.kind === "cover.publication_reference"
      ? [
          "【参考历史作品生成封面】",
          "先调用 context.publications 读取当前账号真实已发布且有封面的近期候选；再结合当前项目标题、Brief、稿件与候选标题，自动选择‘最新且最关联’的一条。相关性优先，相关程度相当时选择发布时间更新的作品。",
          "选定后必须把该条真实 coverAssetId 原样传给 cover.generate.referenceAssetId 并直接发起封面任务。不要把 A/B 选择抛回用户，不要因为候选不绝对最新而停下追问。",
          "不得调用 local.tools 探测生图模型；它只探测 ffmpeg/node/python/git 等系统可执行文件。生图配置由 cover.generate 自己检查并通过任务卡返回真实结果。",
          "若没有任何合格候选或候选都没有真实 coverAssetId，诚实说明拿不到参考封面并停止；不得降级成无参考图生成。",
        ].join("\n")
      : "";
  // [T-077c] 技能自感知(SPEC §1.3 [gate-F1]):把当前 surface 白名单的技能清单注进 system
  // (每工具一行「中文名(工具名):一句话用途」,行数=白名单工具数、上限 20 超出截断)——
  // 让模型能如实回答「你能干什么」,并在对话中主动建议(「这个我可以用『记录经验』帮你存下来」)。
  // 词表与前端工具 trace 行同源(lib/chat-tool-labels 单一真值),不编造白名单外的能力。
  const skillsBriefBlock = [
    "【你的技能清单 —— 本对话你能调用的全部工具,回答「你能干什么」时以此为准,不要编造清单外的能力】",
    buildSkillsBrief(toolWhitelist),
  ].join("\n");
  const selectionBlock = assembleSelectionContext(chatContext.selection, {
    scriptPatchRequired: isScriptPatchAction,
  });
  const assetAliasBlock = chatContext.assetAliases && Object.keys(chatContext.assetAliases).length
    ? [
        "【当前对话素材别名 —— 用户说图2/image2/视频1时必须按此表识别，绝不猜标题】",
        ...Object.entries(chatContext.assetAliases).map(
          ([alias, assetId]) => `${alias} -> assetId=${assetId}`,
        ),
        "引用已有素材的工具若支持 referenceAssetId，直接传对应 assetId；工具不支持时要诚实说明，不能说‘识别不到图2’。",
      ].join("\n")
    : "";
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
        `先调 context.project.lifecycle 读取这个项目从选题卡、稿件、素材、封面、发布、指标、审核到复盘的真状态；需要正文时再调 context.artifact.text,需要审核命中项时调 context.review.report。以上工具都使用可信 projectId="${chatContext.projectId}"。`,
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
  // [T-727] 创作上下文不是安全政策：本轮明确执行要求可以覆盖历史创作建议。尤其保真导入
  // 必须走 sourceRef 确定性通道，不能再让 Brief 的「避免 X」要求用户先解除规则。
  const currentInstructionPriorityBlock = [
    "【当前明确指令优先级】",
    "用户本轮明确的创作执行要求，优先于项目 Brief、定位、复盘与归因中的创作建议；这些建议是普通生成的创作基线，不是权限、安全或合规政策。发生冲突时直接执行本轮要求，不能要求用户先解除规则、修改选题卡或反复确认。",
    "用户要求原文不改/一字不改/逐字写入时，必须使用 script.draft 的 verbatim 模式与受信 sourceRef；禁止把原文压缩进 extraBrief 后交给写稿模型重写。权限归属、隐私安全、外部发布、破坏性操作、事实不可伪造和候选确认门仍然 fail-closed。",
    "用户可能在一条消息里先交代视频状态、操作背景，再紧接着粘贴完整稿件。仅收到稿件时先正常回应，不自动创建候选；等用户明确要求写入后，稿面只收稿件正文。必须由你理解“对助手说的话”和“面向视频观众的稿件”并用 startAnchor / endAnchor 选择边界，不能把对话说明一起写入，也不能漏掉说明结束后的第一句稿件开场；代码只负责按你选定的精确边界恢复原字符。",
  ].join("\n");
  const currentScriptPriorityBlock = chatContext.projectId
    ? [
        "【当前确认稿优先级】",
        "当用户问当前稿的内容、结构、时长，或要做单段改写、配图、信息卡、封面时，必须先调用 context.artifact.text 读取 output_script 的 currentVersionId 真值。工具返回的 truthPriority=current_confirmed_script、版本、contentHash 与 sections 是‘这条内容现在在说什么’的第一内容真相。",
        "本轮明确要求 > 当前确认稿 > 当前段落/分镜 > 联网原文与项目素材事实证据 > 项目 Brief/定位/历史对话/旧候选。Brief 只在没有当前稿时作为首次创作基线；与当前确认稿冲突时不得用 Brief 覆盖当前稿，须按当前稿回答并可指出冲突。",
        hasContextualScriptPatch
          ? "普通对话中用户说‘改第 N 段’、按语义点名某段或引用当前稿一句话时：先读 context.artifact.text，由你做语义定位；唯一目标时调用 script.patch 并逐字使用返回的 sectionRef。零段或多段可能匹配才澄清，不向用户索要任何技术 ID。整稿改写请求不要调用局部工具。"
          : "如果本轮局部改稿的快捷锚点已经失效，只结束这次快捷动作；不要把旧锚点带入后续普通对话。",
      ].join("\n")
    : "";
  const verbatimSourceBlock = formatVerbatimSourceInventory(
    options.verbatimSources ?? [],
  );
  // [T-386] 后台任务状态真值块(recentTasks 上方已 best-effort 读取;空列表 → 空串不注)。
  const taskTruthBlock = formatRecentTasksBlock(recentTasks, Date.now());
  const system = isScriptPatchAction
    ? [
        "【局部改稿专用回合】",
        "用户已明确选中一个现有脚本段落。只根据用户本轮修改要求重写该段；不得改动、重写或补写其他段落，也不得要求用户提供 artifactId、versionId、sectionId 等技术字段。",
        "必须调用 script.patch 提交 replacementText。技术锚点由服务端绑定；不要调用其他工具，不要只在对话中返回改写文案。",
        selectionBlock,
      ]
        .filter(Boolean)
        .join("\n\n")
    : [
        baseSystem,
        honestyBlock,
        coverPublicationReferenceBlock,
        skillsBriefBlock,
        currentAccountBlock,
        currentProjectBlock,
        briefHardBlock,
        currentInstructionPriorityBlock,
        currentScriptPriorityBlock,
        verbatimSourceBlock,
        stageBlock,
        taskTruthBlock,
        reviewSubjectBlock,
        selectionBlock,
        assetAliasBlock,
      ]
        .filter(Boolean)
        .join("\n\n");
  // 选中态标题 —— 工具入参兜底(模型没显式传 title/subject 时用它,避免拿空标题去诊断)。
  const selectionTitle = chatContext.selection?.label?.trim() || "";
  const scriptHooksContext:ScriptHooksContext={
    selectionTitle,positioningBrief:context.positioningBrief,
    projectBriefHard:context.projectBriefHard ?? "",userMaterialHardBrief:context.userMaterialHardBrief ?? "",
    userMaterialRefBrief:context.userMaterialRefBrief ?? "",knowledgeBrief:context.knowledgeBrief ?? "",
  };

  // 5) 工具白名单层:按 skill 白名单挂工具,execute 复用现有 runner 核心产**候选**(非实体)。
  const toolDeps: ChatToolDeps = {
    ...(mediaRoute?.kind === "cover.publication_reference"
      ? { publicationView: "published_cover_candidates" as const }
      : {}),
    readCreatorOsGuide: creatorOsGuideSnapshot
      ? () => creatorOsGuideSnapshot
      : undefined,
    // [T-642] 单项目只读工具使用可信 ChatContext 绑定，不让模型靠标题/自造 id 改绑。
    boundProjectId: chatContext.projectId ?? undefined,
    ...(forcedMaterialKind ? { forcedMaterialKind } : {}),
    verbatimSources: options.verbatimSources ?? [],
    latestUserInstruction: options.latestUserInstruction ?? "",
    ...(options.latestUserInstruction?.trim()
      ? {
          selectVerbatimSource: async ({
            source,
            latestUserInstruction,
            suggestedStartAnchor,
            suggestedEndAnchor,
          }) => {
            const prepared = prepareScriptImportAuthorization({
              source,
              latestUserInstruction,
              suggestedStartAnchor,
              suggestedEndAnchor,
            });
            const result = await runAgentNode({
              model: await getPrimaryModel(),
              ...prepared,
              maxSteps: 1,
            });
            const decision = parseSemanticVerbatimSelection(result.text);
            if (!decision) {
              throw new Error(
                "AI 没能可靠识别完整稿件边界，请再明确哪一段是稿件正文后重试。",
              );
            }
            return decision;
          },
        }
      : {}),
    // [T-716] 局部改稿技术锚点来自受信 ChatContext，而不是让模型把 system 里的 id 再抄回
    // tool args。模型只产 replacementText；工具 execute 强制封装此锚点，杜绝反问 sectionId
    // 和伪造锚点改错段。字段不完整则不绑定，回落旧兼容契约。
    ...(chatContext.selection?.kind === "script_section" &&
    chatContext.selection.artifactId?.trim() &&
    chatContext.selection.versionId?.trim() &&
    chatContext.selection.ids[0]?.trim() &&
    chatContext.selection.excerpt?.trim()
      ? {
          scriptPatchAnchor: {
            artifactId: chatContext.selection.artifactId.trim(),
            versionId: chatContext.selection.versionId.trim(),
            sectionId: chatContext.selection.ids[0].trim(),
            originalText: chatContext.selection.excerpt,
          },
        }
      : {}),
    // [T-163] 错误→人话端口透传(route 注入前端 humanizeAiError)。
    humanizeError: deps.humanizeError,
    getPositioningDiscovery: deps.getPositioningDiscovery
      ? (sessionId) => deps.getPositioningDiscovery!(ctx, sessionId)
      : undefined,
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
        const detail = await runWithSkillSnapshot(["trend.extract"], () =>
          assembleTrendBriefDetailed(
            ctx,
            context.positioningBrief,
            {
              trendSourceSignals: deps.trendSourceSignals,
              // web 搜索路复用 material.gather 的联网检索端口(SearchResult ⊇ TrendHit,
              // 未配/失败 → 该段空,assembleTrendBriefDetailed 内 allSettled 诚实降级)。
              trendSearch: deps.searchWeb,
            },
          ),
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
              ? "本次出题未拉到已登记来源的实时信号:当前还没有登记任何网页/RSS 来源。请如实告知用户,并引导 TA 去『内容雷达』登记来源(需登录的站点先去『设置 → 网站登录保管库』登录)。" +
                (detail.searchHitCount > 0
                  ? "本次热点依据仅来自 web 联网搜索。"
                  : "本次候选没有实时热点信号支撑,不要声称基于实时热榜。")
              : `本次出题未拉到已登记信源的实时信号${
                  registered != null
                    ? `(已登记 ${registered} 个信源,可能抓取失败/登录失效)`
                    : "(可能抓取失败/登录失效)"
                }。请如实告知用户,并建议去『内容雷达』检查来源、或去『设置 → 网站登录保管库』重新登录。` +
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
      const { topics } = await runWithSkillSnapshot(["topic.generate"], async () =>
        runTopicNode({
          model: await getPrimaryModel(),
          positioningBrief: context.positioningBrief,
          basisBrief,
          // [T-062b gate-F3] KNOW-X 修真:对话出题同样吃知识库参考 + 已验证经验约束
          // (basis=knowledge 时知识已进 basisBrief,置空防重复)。
          knowledgeBrief:
            basis === "knowledge"
              ? undefined
              : context.knowledgeBrief || undefined,
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
        }),
      );
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
    enrichTopic: input => runChatTopicEnrich(ctx, context, chatContext.selection, input, { resolveModelSpec: deps.resolveModelSpec, runWithSkillSnapshot }),
    generateHooks: async (input) => {
      const prepared=prepareScriptHooks(scriptHooksContext,input);
      const {runAgentNode}=await import("@creatoros/ai-worker");
      const result=await runAgentNode({model:await getPrimaryModel(),system:prepared.system,prompt:prepared.prompt,maxSteps:2});
      return finalizeHookItems(result.text,prepared.grounding);
    },
    // [T-268] 整稿改异步 dispatch(不再 inline 同步 runScriptNode —— 整稿分钟级,弱模型下同步必超时
    // → 回合被腰斩 → 退回轻量 hooks,「点生成脚本只出 hook」的根因)。整稿恒是「当前项目的」(要落成
    // output_script 版本写进稿面),项目从模型显式传参优先,否则用 chatContext.projectId(稿面右栏对话
    // 恒有)。无项目上下文 → 不 dispatch,诚实回 error(卡渲「去项目稿面写脚本」);端口未装配 → 同样
    // 诚实 error(不抛裸码)。topic 缺省用工作台选中标题兜底(与写稿/复盘同款 selection.label 派生)。
    dispatchScriptDraft: async ({
      projectId,
      topic,
      angle,
      targetDurationSeconds,
      extraBrief,
      instruction,
      sourceSnapshots,
      draftMode,
      verbatimSourceRef,
      verbatimSourceText,
      verbatimSourceLength,
      verbatimSourceSha256,
    }) => {
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
          ...(typeof targetDurationSeconds === "number"
            ? { targetDurationSeconds }
            : {}),
          ...(extraBrief ? { extraBrief } : {}),
          ...(instruction ? { instruction } : {}),
          ...(sourceSnapshots && sourceSnapshots.length > 0
            ? { sourceSnapshots }
            : {}),
          ...(draftMode === "verbatim"
            ? {
                draftMode,
                verbatimSourceRef,
                verbatimSourceText,
                verbatimSourceLength,
                verbatimSourceSha256,
              }
            : {}),
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
    prepareVideoEdit: async (input) => {
      const pid = chatContext.projectId || "";
      if (!pid) {
        return {
          kind: "video.edit",
          projectId: null,
          outputId: null,
          expectedRevision: null,
          sourceRenderTaskId: null,
          instruction: input.instruction,
          summary: [],
          decisions: null,
          renderProps: null,
          error: "剪辑调整必须在具体项目的编导对话中进行。",
        };
      }
      if (!deps.prepareVideoEditPort) {
        return {
          kind: "video.edit",
          projectId: pid,
          outputId: null,
          expectedRevision: null,
          sourceRenderTaskId: null,
          instruction: input.instruction,
          summary: [],
          decisions: null,
          renderProps: null,
          error: "剪辑调整能力尚未接入。",
        };
      }
      return deps.prepareVideoEditPort(ctx, { ...input, projectId: pid });
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
    gatherMaterials: async ({ query, signal }) => {
      // [T-684] 素材搜索直接复用随包浏览器结果。搜索模型已经下线，不再调用
      // research.gather 用模型记忆“补齐”钩子/案例/数据/金句，避免无 URL 假素材。
      const effQuery=prepareChatResearchQuery({selectionTitle,userMaterialQueryTerms:context.userMaterialQueryTerms??[]},{query});
      if (!deps.searchWeb) {
        throw new Error("应用的浏览器搜索能力未接入，暂时无法联网找素材。");
      }
      const searchResults: Array<{
        title: string;
        url: string;
        snippet: string;
        publishedAt?: string;
        siteName?: string;
      }> = effQuery
        ? await deps.searchWeb(ctx, effQuery, { count: 10, ...(signal ? {signal} : {}) })
        : [];
      const {grounding,items}=projectChatSearchResults(searchResults);
      return {grounding,items};
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
      const modelUrl = normalizeWebReadUrl(url);
      const boundUrl = chatContext.webReadUrl
        ? normalizeWebReadUrl(chatContext.webReadUrl)
        : null;
      // [T-813] 搜索卡点击锚在浏览器端口前生效。模型即使提交另一 URL，也只能读绑定来源。
      const targetUrl = boundUrl ?? modelUrl;
      if (!targetUrl) {
        throw new Error("要读取的网页地址无效，请重新选择来源。");
      }
      const result = await deps.readWebUrlPort(ctx, { url: targetUrl, signal });
      if (
        boundUrl &&
        "needLogin" in result &&
        result.needLogin === false &&
        normalizeWebReadUrl(result.sourceUrl) !== boundUrl
      ) {
        throw new Error("网页读取结果与所选来源不一致，已停止保存。");
      }
      return result;
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
    dispatchPlanningThesis: async ({ projectId, topic }) => {
      const pid =
        (typeof projectId === "string" && projectId.trim()
          ? projectId.trim()
          : "") ||
        chatContext.projectId ||
        "";
      if (!pid) {
        return {
          taskId: null,
          projectId: null,
          error:
            "论点骨架要绑定具体项目。请在项目稿面右栏使用；也可以跳过，直接写稿。",
        };
      }
      if (!deps.dispatchPlanningThesisPort) {
        return {
          taskId: null,
          projectId: pid,
          error: "可选论点梳理能力当前未接入，请直接写稿或稍后重试。",
        };
      }
      const effectiveTopic =
        (typeof topic === "string" && topic.trim() ? topic.trim() : "") ||
        selectionTitle ||
        "";
      try {
        const { taskId } = await deps.dispatchPlanningThesisPort(ctx, {
          projectId: pid,
          ...(effectiveTopic ? { topic: effectiveTopic } : {}),
        });
        return { taskId, projectId: pid, error: null };
      } catch (error) {
        return {
          taskId: null,
          projectId: pid,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    // [T-271] cover.generate:封面恒是「当前项目的」(封面文案要锚该项目的核心信息/口播稿)。项目从
    // 模型显式传参优先,否则用 chatContext.projectId(稿面右栏对话恒有)。无项目上下文 → 不 dispatch,
    // 诚实回 error(卡渲「去项目稿面生成封面」);端口未装配 → 同样诚实 error(不抛裸码)。topic 缺省
    // 用工作台选中标题兜底(与写稿同款 selection.label 派生)。
    dispatchGenerateCover: async ({
      projectId,
      topic,
      referenceAssetId,
      visualRequirements,
    }) => {
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
        let resolvedReferenceAssetId =
          typeof referenceAssetId === "string" && referenceAssetId.trim()
            ? referenceAssetId.trim()
            : undefined;
        let reference: CoverReferenceSelection | undefined =
          resolvedReferenceAssetId
            ? {
                status: "selected",
                assetId: resolvedReferenceAssetId,
                title: "用户指定参考图",
              }
            : undefined;
        if (
          mediaRoute?.kind === "cover.publication_reference" &&
          !resolvedReferenceAssetId
        ) {
          return {
            taskId: null,
            projectId: pid,
            error:
              "没有收到已发布且有封面的作品引用。请先从发布作品候选中选择真实 coverAssetId，本次不会降级为无参考图生成。",
          };
        }
        if (mediaRoute?.kind === "cover.reference" && !resolvedReferenceAssetId) {
          if (!deps.contextReaders?.listCoverReferenceImages) {
            reference = {
              status: "needs_clarification",
              reason: "incomplete_catalog",
              total: null,
              candidates: [],
            };
          } else {
            const catalog =
              await deps.contextReaders.listCoverReferenceImages(ctx);
            reference = resolveUniqueCoverReference(
              catalog.rows,
              catalog.total,
            );
          }
          if (reference.status !== "selected") {
            return {
              taskId: null,
              projectId: pid,
              reference,
              error:
                reference.reason === "no_image"
                  ? "素材库里没有可用图片。请先上传或明确指定一张参考图。"
                  : reference.reason === "multiple_images"
                    ? `素材库里有 ${reference.total ?? "多"} 张可用图片，请明确选择一张参考图后再生成封面。`
                    : "无法确认素材库中参考图的完整数量，请明确指定一张参考图后再生成封面。",
            };
          }
          resolvedReferenceAssetId = reference.assetId;
        }
        const { taskId } = await deps.dispatchGenerateCoverPort(ctx, {
          projectId: pid,
          ...(effTopic ? { topic: effTopic } : {}),
          ...(typeof visualRequirements === "string" && visualRequirements.trim()
            ? { visualRequirements: visualRequirements.trim().slice(0, 1200) }
            : {}),
          // [T-380] 以图生图风格参考透传(可选;素材库 asset id)。
          ...(resolvedReferenceAssetId
            ? { referenceAssetId: resolvedReferenceAssetId }
            : {}),
        });
        return {
          taskId,
          projectId: pid,
          error: null,
          ...(reference ? { reference } : {}),
        };
      } catch (err) {
        return {
          taskId: null,
          projectId: pid,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    dispatchDouyinShare: async ({ shareInput }) => {
      const effective =
        mediaRoute?.kind === "douyin.share"
          ? {
              shareInput: mediaRoute.shareInput,
              transcribe: mediaRoute.transcribe,
            }
          : {
              shareInput,
              // 转写是高成本派生任务；没有最新轮确定性路由的明确授权时，模型不能自行升级。
              transcribe: false,
            };
      if (!deps.dispatchDouyinSharePort) {
        return {
          taskId: null,
          ownerId: null,
          transcribe: effective.transcribe,
          error: "抖音分享建档能力当前未接入。",
        };
      }
      try {
        const { taskId, ownerId } =
          await deps.dispatchDouyinSharePort(ctx, effective);
        return {
          taskId,
          ownerId,
          transcribe: effective.transcribe,
          error: null,
        };
      } catch (error) {
        return {
          taskId: null,
          ownerId: null,
          transcribe: effective.transcribe,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    diagnoseContent: async ({ title, script, extraBrief }) => {
      const prepared = prepareChatDiagnosis(context, selectionTitle, { title, script, extraBrief });
      const spec = await deps.resolveModelSpec(ctx, prepared.capability);
      const { text } = await runWithSkillSnapshot([prepared.capability], () => runTemplatedNode({
        model: modelFor(spec), template: getTemplate(prepared.capability), facets: prepared.facets,
      }));
      return projectChatDiagnosis(parseDiagnosis(text, chatDiagnosisKeys()));
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
      if (
        !reviewContext.reviewMetrics?.trim() &&
        !reviewContext.reviewComments?.trim()
      ) {
        return {
          items: [],
          error:
            "这条作品还没有同步到真实指标或观众评论，不能把写稿过程或其他作品的编辑记录冒充发布复盘。请先发布并同步本作品数据，再重新复盘。",
        };
      }
      // subject 优先级:模型显式传 > 目标作品真标题 > 工作台选中标题(reviewFacets 内还有兜底)。
      const effSubject = subject?.trim()
        ? subject
        : reviewContext.reviewTitle?.trim() || selectionTitle;
      const spec = await deps.resolveModelSpec(ctx, "review.insights");
      const { text } = await runWithSkillSnapshot(["review.insights"], () =>
        runTemplatedNode({
          model: modelFor(spec),
          // 调用方对象只提供受控 id；active scope 下实际模板取账号 snapshot。
          template: getTemplate("review.insights"),
          // [T-081①] extraBrief 第三参 → 模板 {{extraBrief}} 占位(空则整段省略)。
          facets: reviewFacets(reviewContext, effSubject, extraBrief),
        }),
      );
      return { items: parseLearnings(text), error: null };
    },
    generatePositioning: input => runChatPositioning(ctx, context, input, { resolveModelSpec: deps.resolveModelSpec, runWithSkillSnapshot, positioningWorks: deps.positioningWorks }),
    // [T-094] 对话蒸馏:复用倾倒场同一引擎 runKnowledgeDistill(knowledge.distill 模板 +
    // capability 走 model-config,多模态可配铁律)。失败抛错由工具 execute 接住转人话渲卡。
    distillKnowledge: async ({ content }) => {
      const { runKnowledgeDistill } = await import(
        "./knowledge-distill-runner"
      );
      return runWithSkillSnapshot(["knowledge.distill"], () =>
        runKnowledgeDistill(
          ctx,
          { content },
          { resolveModelSpec: deps.resolveModelSpec },
        ),
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
    ...createChatReadToolBindings(ctx,deps.contextReaders),
  };
  // [T-439] 装配层一律用**原名**(内部真值:错误信封登记 / 白名单 / 深链 functionKey / 审计日志
  //   都按原名)。合规化只在发给模型那一刻做,见下方 streamText 入参。
  const tools = buildChatTools(toolWhitelist, toolDeps);

  // [T-117 确定性修] functionKey 是深链/按钮明确指定的工具(如「补全选题卡」深链 fn=topic.enrich);
  // 命中真工具时强制本轮调它,防模型把卡当文本吐 + 谎称已渲卡(弱 tool-calling 模型的常态)。
  const forcedTool =
    forcedToolSequence?.[0] && toolWhitelist.includes(forcedToolSequence[0])
      ? forcedToolSequence[0]
      : routedTool && toolWhitelist.includes(routedTool)
      ? routedTool
      : effectiveFunctionKey && toolWhitelist.includes(effectiveFunctionKey)
        ? effectiveFunctionKey
        : undefined;

  // [T-263] HITL 授权门:从本轮已挂工具收录登记了授权判定器的工具(当前仅 local.read),装配
  // streamText 的 toolApproval 配置。工具不在白名单 / decideLocalRead 端口未装配 → 自然缺席。
  const toolApproval = buildChatToolApproval(tools);

  return {
    skillId,
    system,
    tools,
    capability: skillCapability,
    ...(tools["material.gather"] ? {researchContext:{selectionTitle,userMaterialQueryTerms:[...(context.userMaterialQueryTerms??[])],searchConfigured:Boolean(deps.searchWeb)}} : {}),
    ...((["topic.enrich","positioning.generate","calibration.diagnose","topic.generate","review.analyze","knowledge.distill"].some(name=>tools[name])) ? {structuredContext:{positioningBrief:context.positioningBrief,accountsBrief:context.accountsBrief,learningsBrief:context.learningsBrief,signalsBrief:context.signalsBrief,knowledgeBrief:context.knowledgeBrief}} : {}),
    ...(tools["script.hooks"] ? {scriptHooksContext:{...scriptHooksContext}} : {}),
    ...(modelSpec ? {modelSpec} : {}),
    forcedTool,
    ...(forcedToolSequence ? { forcedToolSequence } : {}),
    toolApproval,
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
    /** 路由从已持久化消息和已验归属附件建立的受信来源；不接受客户端自报正文。 */
    trustedScriptSources?: readonly VerbatimSource[];
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
  const assembly = await buildChatAssembly(
    ctx,
    input.chatContext,
    deps,
    detectCopilotMediaRoute(input.messages),
    {
      positioningScratch: isScratchPositioningConversation(input.messages),
      verbatimSources: input.trustedScriptSources ?? [],
      latestUserInstruction: latestUserText(input.messages),
    },
  );
  const { modelFor } = await import("@creatoros/ai-worker");
  const modelMessages = await prepareChatModelMessages(input.messages,assembly);

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
          : assembly.modelSpec.displayModelKey ?? assembly.modelSpec.model,
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
        fallbackSpecModel =
          fallbackSpec.displayModelKey ?? fallbackSpec.model;
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

  const result = createChatModelStream({
    model,
    abortSignal: input.abortSignal,
    system: assembly.system,
    messages: modelMessages,
    tools: assembly.tools,
    toolApproval: assembly.toolApproval,
    forcedTool: assembly.forcedTool,
    forcedToolSequence: assembly.forcedToolSequence,
    maxSteps,
    onDuplicate: toolName => console.warn(`[chat-turn] 同轮同参工具调用已复用 tool=${toolName}`),
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
