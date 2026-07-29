import "server-only";
import { createHash } from "node:crypto";
import {
  createConfiguredDb,
  UnsupportedOperationError,
  resolveMasterKey,
  // [T-332 S2] per-account 域 repo 工厂的统一断言:未选号 → AccountRequiredError(引导态)。
  requireAccountId,
  // [T-363] 「重置工作区」归档后的首启:PRESERVE 表(模型配置/skill 定制/激活态…)从
  // 归档库迁回新库(一次性、幂等、失败诚实不阻断启动)。
  restorePreservedUserAssets,
} from "@creatoros/backend";
import type { Endpoint, Transport, RequestContext } from "@creatoros/contract";
// [T-084c] ENDPOINTS 值导入 —— dispatchGenerateAsset 经 ai transport 起 asset.generate task
// 时用真 endpoint 对象(带 body zod 类型),避免裸 { id } 造成 body 类型收窄为 undefined。
import { ENDPOINTS } from "@creatoros/contract";
import { createAiTaskAttemptId } from "@/lib/ai-task-attempt";
import { mockTransport } from "@/server/mock-backend/mock-transport";
// [T-374] projects.transcribe composition-only 拦截工厂(抽出为可单测模块)。
import { createProjectsWithTranscribe } from "./projects-transcribe-wrap";
import {
  listPositioningWorksWithPublicationFacts,
  listRecentProjectsWithPublicationFacts,
} from "./recent-projects-context";
import { FIXED_NOW_ISO } from "@/server/mock-backend/store";
import { canonicalDataset } from "@/fixtures/canonical";
// [T-050] 抖音真实数据里只保留金句知识库 seed(项目/发布/指标图谱旧种子已全删)。
// [T-135] DOUYIN_FAN_TOTAL 已随 canonical platform account seed(唯一使用点)退役移除。
import {
} from "@/fixtures/douyin-real";
import type { MetricCard } from "@/types/view-models";
import type { ProjectStageName, TaskStatus } from "@/types/domain";
import {
  CANONICAL_USER_ID,
  createIdentityRepository,
  createIdentityService,
  OwnershipError,
  seedCanonicalUser,
  type IdentityService,
} from "@creatoros/backend/modules/identity";
import {
  seedWinVideoTutor,
  // [T-211] 存量去前缀 fixup 用的旧标题前缀常量。
  WIN_VIDEO_TUTOR_LEGACY_TITLE_PREFIX,
  // [T-218] 存量按 module 挂 tag 的回填(观点地图开箱即在)。
  fixupWinVideoTutorModuleTags,
} from "@/server/seeds/win-video-tutor";
import {
  createTaxonomyRepository,
  createTaxonomyService,
  createTaxonomyTransport,
  TAXONOMY_OP_IDS,
} from "@creatoros/backend/modules/taxonomy";
import {
  createNotificationRepository,
  createNotificationsService,
  createNotificationsTransport,
  NOTIFICATION_OP_IDS,
} from "@creatoros/backend/modules/notifications";
import {
  createSearchRepository,
  createSearchService,
  createSearchTransport,
  SEARCH_OP_IDS,
  // [T-093] hybrid 检索(exact 优先 + 语义余弦补位)。
  type HybridSearchHit,
} from "@creatoros/backend/modules/search";
import {
  buildCanonicalSearchDocuments,
  // [T-332 S2 · ISO-06] 启动全量重建的显式系统路径:整删该 user 派生索引 → 按源实体行
  //   自带的 accountId 整批重播(跨号各归各号,不经 ctx.accountId)。
  rebuildSearchIndexSystem,
} from "@creatoros/backend/modules/search";
// [T-050 ⑦] 搜索索引真数据投影要直读六张表(根包导出,别名防与本文件局部变量撞名)。
import {
  projects as projectsTable,
  knowledgeItems as knowledgeItemsTable,
  knowledgeRevisions as knowledgeRevisionsTable,
  assets as assetsTable,
  publications as publicationsTable,
  publicationRevisions as publicationRevisionsTable,
} from "@creatoros/backend";
import {
  createSettingsRepository,
  createSettingsService,
  createSettingsTransport,
  SETTINGS_OP_IDS,
  type SettingsService,
  // [T-135] ModelConfigurationRow / UserPreferenceRow / AgentConfigurationRow 已随
  // canonical settings seed(toModelRow/toPreferenceRow/toAgentRow)退役一并移除。
} from "@creatoros/backend/modules/settings";
// T-147 P5 桌面激活授权 —— 装配一机一码激活门(桌面拦/web 跳);门控/激活页经 bundle 取用。
import {
  assembleActivationService,
  type ActivationService,
} from "./activation";
import {
  createProjectRepository,
  createProjectsService,
  createProjectsTransport,
  ensureTranscriptArtifact,
  PROJECT_OP_IDS,
  type StageGateReadersRef,
} from "@creatoros/backend/modules/projects";
import {
  createKnowledgeRepository,
  createKnowledgeService,
  createKnowledgeTransport,
  KNOWLEDGE_OP_IDS,
} from "@creatoros/backend/modules/knowledge";
import {
  createAssetRepository,
  createAssetsService,
  createAssetsTransport,
  createMockObjectStorage,
  createS3ObjectStorage,
  createLocalFsObjectStorage,
  ensureBucket,
  type ObjectStorageForCtx,
  ASSET_OP_IDS,
  // [T-135] AssetRow / AssetFileRow 已随 canonical assets seed(toAssetRow/toAssetFileRow)退役移除。
} from "@creatoros/backend/modules/assets";
import {
  createArtifactRepository,
  createArtifactsService,
  createArtifactsTransport,
  ARTIFACT_OP_IDS,
} from "@creatoros/backend/modules/artifacts";
import {
  createProductionService,
  createProductionTransport,
  PRODUCTION_OP_IDS,
} from "@creatoros/backend/modules/production";
import {
  createPublishingService,
  createPublishingTransport,
  createMockPublisher,
  PUBLISHING_OP_IDS,
} from "@creatoros/backend/modules/publishing";
import {
  createAnalyticsRepository,
  createAnalyticsService,
  createAnalyticsTransport,
  ANALYTICS_OP_IDS,
} from "@creatoros/backend/modules/analytics";
import {
  createIngestionRepository,
  createIngestionService,
  createIngestionTransport,
  createMockIngestionSource,
  INGESTION_OP_IDS,
} from "@creatoros/backend/modules/ingestion";
import {
  createReviewsService,
  createReviewsTransport,
  REVIEWS_OP_IDS,
} from "@creatoros/backend/modules/reviews";
// T-086 文案审核门(review_rules + script_review_reports)。
import {
  createReviewGateService,
  createReviewGateTransport,
  REVIEW_GATE_OP_IDS,
  buildReviewRuleSeedRows,
  createReviewGateRepository,
} from "@creatoros/backend/modules/review";
import { runScriptReview } from "@creatoros/backend/modules/ai-runtime";
import { runMaterialSummary } from "@creatoros/backend/modules/ai-runtime";
import { runEmbedTexts } from "@creatoros/backend/modules/ai-runtime";
import {
  createLearningsService,
  createLearningsTransport,
  // [T-135] createLearningsRepository / LearningRow 已随 canonical learnings seed 退役移除。
  LEARNINGS_OP_IDS,
} from "@creatoros/backend/modules/learnings";
import {
  createAiService,
  createAiTransport,
  createAiRepository,
  buildAiModelConfigs,
  buildAiAgentConfigs,
  AI_OP_IDS,
  type AiService,
} from "@creatoros/backend/modules/ai";
// [T-255a] 执行层(脑手分离):execution.tasks 5 op + 沙箱 + executor 注册表 + live
// dispatch 编排。存储复用 ai_tasks(taskType `exec.*`),模块本体零 db 依赖(端口注入)。
import {
  createExecutionService,
  createPersistentTaskService,
  createExecutionTransport,
  createExecutorRegistry,
  registerBuiltinExecutors,
  runExecutionTask,
  abortExecutionTask,
  resolveWorkspacesRoot,
  sweepOrphanSandboxes,
  EXECUTION_OP_IDS,
  // [T-256b/c/T-313] 自主任务运行时:agentic executor + Pi 引擎(带确定性兜底)+ 三领域适配器 + token 估算。
  createAgenticExecutor,
  createDeterministicAgenticEngine,
  createPiAgenticEngine,
  createResearchTools,
  createCollectionTools,
  createMaterialTools,
  estimateTokens as estimateAgenticTokens,
  type EngineLlm as AgenticEngineLlm,
  type ResearchPorts,
  type CollectionPorts,
  type MaterialPorts,
} from "@creatoros/backend/modules/execution";
import {
  createIntelligenceService,
  createIntelligenceTransport,
  createProjectIntelligenceReferenceService,
  createProjectScriptCandidateService,
  runProjectScriptCandidateTask,
  drainProjectScriptCandidateQueue,
  type ProjectScriptCandidateGeneratorPort,
  runIntelligenceSourceTask,
  drainIntelligenceSourceQueue,
  runIntelligenceTranscriptTask,
  drainIntelligenceTranscriptQueue,
  type IntelligenceTranscriptRunnerDeps,
  runIntelligenceTopicPreviewTask,
  INTELLIGENCE_OP_IDS,
} from "@creatoros/backend/modules/intelligence";
import { createIntelligenceSourceAdapter } from "@/server/intelligence/source-adapter";
import {
  drainDouyinShareImportQueue,
  runDouyinShareImportTask,
} from "@/server/intelligence/share-import-runner";
import type {
  ContextDeps as ChatContextDeps,
  ReviewSubjectReader,
  ProjectMaterialsReader,
  ProjectMaterial,
} from "@creatoros/backend/modules/ai-runtime";
// [T-184] 声明式 context 注入:CreativeContextDeps = creative-context 的 ContextDeps(facet reader
// 集合的类型),供中央 reader registry + resolveContextDeps 定型;ProjectBriefReader 供命名 briefReader。
import type {
  ContextDeps as CreativeContextDeps,
  ProjectBriefReader,
} from "@creatoros/backend/modules/ai-runtime";
import type { ContextReaders as ChatContextReaders } from "@creatoros/backend/modules/ai-runtime";
import { knowledgeRelevanceScore } from "@creatoros/backend/modules/ai-runtime";
import { runGatherMaterial } from "@creatoros/backend/modules/ai-runtime";
import { runTopicGenerateV2 } from "@creatoros/backend/modules/ai-runtime";
import * as nodePath from "node:path";
import { existsSync, renameSync } from "node:fs";
// [T-326 B-04] douyin-cdp(抖音浏览器采集,拉 Playwright/Chromium 链)改**真正的懒加载**:
//   原静态 import 把这棵重依赖树钉进了所有经 contract-client.server / dispatch 进本文件的
//   路由编译图(审计 B-04:根路由 dev 首编译超时,build 全程报 douyin-cdp
//   `Module not found: Can't resolve <dynamic>` 警告)。现只静态引 **type**(编译期擦除)+
//   零依赖错误类(douyin-errors.ts,同步 instanceof 判别点用);函数体一律经下方
//   loadDouyinCdp() 在调用点动态 import —— 与 web-session/web-capture/web-reader 内部
//   `await import("./douyin-cdp")` 同款、字面量 specifier(Turbopack 可解析,运行时真实
//   调用路径不变:dispatch → 采集端口 → await loadDouyinCdp() → 真函数)。
import type {
  CommentIngestPorts,
  CommentRecord,
} from "@/server/ingestion/douyin-cdp";
import { DouyinNotLoggedInError } from "@/server/ingestion/douyin-errors";
// [T-330] 绑新号 staging 登录态目录 helpers —— 纯 fs 叶子模块(零 playwright 依赖,静态
//   import 不破 douyin-cdp 懒加载);token→路径映射收在组合根,service 只见不透明 stagingKey。
import {
  adoptDouyinStagingDir,
  createDouyinStagingToken,
  discardDouyinStagingDir,
  douyinStagingDirFor,
} from "@/server/ingestion/douyin-auth-staging";

// douyin-cdp 懒加载单例(模块加载幂等,天然可并发复用;失败不缓存 → 下次调用重试)。
type DouyinCdpModule = typeof import("@/server/ingestion/douyin-cdp");
let douyinCdpModulePromise: Promise<DouyinCdpModule> | null = null;
function loadDouyinCdp(): Promise<DouyinCdpModule> {
  if (!douyinCdpModulePromise) {
    douyinCdpModulePromise = import("@/server/ingestion/douyin-cdp").catch(
      (err) => {
        douyinCdpModulePromise = null; // 失败不缓存,后续调用可重试
        throw err;
      },
    );
  }
  return douyinCdpModulePromise;
}
type DouhotCdpModule = typeof import("@/server/ingestion/douhot-cdp");
let douhotCdpModulePromise: Promise<DouhotCdpModule> | null = null;
function loadDouhotCdp(): Promise<DouhotCdpModule> {
  if (!douhotCdpModulePromise) {
    douhotCdpModulePromise = import("@/server/ingestion/douhot-cdp").catch(
      (error) => {
        douhotCdpModulePromise = null;
        throw error;
      },
    );
  }
  return douhotCdpModulePromise;
}
// [T-232] 评论批量采集预算规划(纯逻辑):未采优先 + 爆款优先排序 + 全量/截断诚实 message。
import {
  orderCommentCollection,
  buildCommentCoverageMessage,
  type CommentCollectionCandidate,
} from "@/server/ingestion/comment-collection-plan";
import {
  parseDouyinWorkListXlsx,
  matchDetailsToPublications,
  toDetailMetricRecords,
  visibilityFromDetailStatus,
  type PublicationCatalogEntry,
} from "@/server/ingestion/douyin-work-detail";
// [T-078] 作品封面回填字节下载 + 默认上限(封面回填/逐字稿/重建编排见 douyin-heavy-backfill)。
import {
  downloadDouyinImage,
  DEFAULT_COVER_BACKFILL_LIMIT,
} from "@/server/ingestion/douyin-cover-backfill";
// [T-195] 抖音初始化重活编排:封面回填(只对可见作品)+ 逐字稿/重建排队(隐藏经 isWorkHidden 跳)。
//   由 self.detail 落完明细(hidden_at/platform_status 已标)后调 —— 可见性已知才跑重活(见根因注释)。
//   多闸幂等在子 helper 内(runner 逐 aweme 跳已转写 / 已有 reconstructed artifact 跳过 / createTask 去重)。
import { runDouyinHeavyBackfill } from "@/server/ingestion/douyin-heavy-backfill";
// T-038b 抖音采集限流网关(单例接线):所有对外抖音请求经它 acquire/report(SPEC §4.4)。
// [T-230] DouyinCooldownActiveError:transcribe-runner 冷却延迟重试的判别锚(isCooldownError)。
import {
  DouyinRequestGateway,
  DouyinCooldownActiveError,
  type DouyinChannel,
} from "@/server/ingestion/douyin-request-gateway";
import { resolveDouyinThrottleConfig } from "@/server/ingestion/douyin-throttle-config";
import { createPgliteThrottleStatePort } from "@/server/ingestion/douyin-throttle-state-port.pglite";
// [T-084b] 通用网页截图(公开页无头 Chromium)—— material.screenshot 端口用。
import {
  captureUrl,
  WebCaptureError,
  isBlockedHttpCaptureError,
} from "@/server/ingestion/web-capture";
// [T-390] web.read 被拒(403/5xx 等)→ 搜索引擎找替代来源(纯编排,searcher 在本组合根注入)。
import {
  findAlternatesViaSearch,
  type AlternateSearcher,
} from "@/server/ingestion/web-read-fallback";
// [T-217a] Web Session Vault —— 泛化抖音登录态底座成任意域名保管库(有头登录 + headless 探针)。
import {
  openWebLoginWindow,
  checkWebSessionStatus,
  webDomainFromUrl,
  webSessionLookupDomains,
  importLegacyProfileState,
  type WebLoginHandle,
} from "@/server/ingestion/web-session";
// [B-01] Web Session 域名净化/校验(防路径穿越递归删应用数据/上级目录)。纯函数,与 route 入口共用。
import {
  assertSafeWebDomain,
  isArchivedWebProfileName,
  isNestedArchivedWebProfileName,
  isSafeWebDomain,
  WebDomainError,
} from "@/lib/web-domain";
// [T-370a] 浏览器登录态系统化:web 域 storageState 加密单一真值(host 内部 service,无契约 op)。
import {
  createBrowserSessionsService,
  type BrowserSessionsService,
} from "@creatoros/backend/modules/browser-sessions";
// [T-370b] 持久 profile 池(域亲和 sticky + 征用擦除 + FIFO 排队);web-reader 读取走池。
import {
  createBrowserPool,
  type BrowserPool,
  type PoolCapableContext,
} from "@/server/ingestion/browser-pool";
// [T-217b] Web Reader —— 带 .auth/web 登录态读正文全文(编导 web.read 端口用)。
import {
  readUrl as readWebUrlSidecar,
  WebReaderLoginRequiredError,
} from "@/server/ingestion/web-reader";
import { assertUrlAllowed } from "@/server/ingestion/url-guard";
// [T-253] local.read 安全硬门(denylist/路径归一/二进制探测,backend 纯函数)+ 授权表
// (会话级一次授权 + 持久化「总是允许该目录」,本文件旁的 server 模块)。
import {
  normalizeLocalPath,
  sensitivePathReason,
  isProbablyBinary,
  MAX_LOCAL_READ_BYTES,
  MAX_LOCAL_DIR_ENTRIES,
  // [T-262] local.read 文件名搜索兜底(scoped 目录集按 basename 搜同名,纯逻辑 + 注入式 fs)。
  searchLocalByBasename,
  defaultSearchRoots,
  localBasename,
  type LocalSearchFs,
  // [T-256a] 工具探测纯函数:白名单过滤 + 防注入 + 版本解析(IO 在本文件端口)。
  resolveToolsToProbe,
  parseToolVersion,
} from "@creatoros/backend/modules/ai-runtime";
import {
  checkGrant as checkLocalReadGrant,
  consumeOnce as consumeLocalReadOnceGrant,
  listAlwaysDirs as listLocalReadAlwaysDirs,
} from "@/server/local-read-grants";
import {
  runScheduledCollection,
  type Collector as ScheduledCollector,
  // [T-212a] 对标采集器(benchmark sourceKind)。
  collectBenchmark,
  // [T-212c] 对标爆款拆解 → 转化进选题池(采集落库后 best-effort 触发)。
  runBenchmarkTeardown,
  createBenchmarkTeardownPort,
  // [T-235d-distill] 收藏夹作品蒸馏链(收藏采集落库后 best-effort 触发):transcribe→判库→知识蒸馏确认门。
  runFavoritesDistill,
  createFavoritesTriagePort,
  runKnowledgeDistill,
  // [T-212d] 防茧房校准:淘汰原因蒸馏(选题淘汰写原因后 best-effort 触发)。
  runTopicPreferenceDistill,
  createTopicPreferenceDistillPort,
  // [T-212c] 定位简报装配(拆解 getPositioningBrief 端口复用,与各 runner 同一格式)。
  assembleCreativeContext,
  // [T-235a] 每天自动出题采集器(topic.daily sourceKind:多依据合并出题 → 护栏排序 → 候选落 pool)。
  collectDailyTopics,
  // [T-235d] 正向归因回流(self.detail 采集尾 best-effort 触发:实绩 → 枚举化归因 → 实验候选进池)。
  runTopicAttribution,
  createTopicAttributionPort,
  // [T-235b] 低粉黑马雷达采集器(并进 benchmark 采集:对标源后跑黑马关键词,共享限流预算)。
  collectDarkhorse,
  // [T-235b] 热点信源信号采集(web 主路 readUrl+AI 抽取 / rss 辅路 feed 解析)+ AI 抽取端口工厂。
  collectTrendSourceSignals,
  createTrendExtractPort,
} from "@creatoros/backend/modules/ai-runtime";
import {
  runJobNow,
  triggerScheduledJob,
  createAutomationHandlerRegistry,
  startAutomationDriver,
  sweepStaleRuns,
  // [T-207] 启动 sweep 僵尸 ai_task(与 sweepStaleRuns 同族;running 超时标 failed)。
  sweepStaleAiTasks,
  type AutomationDriverJob,
  type TriggerDeps,
} from "@creatoros/backend/modules/ai-runtime";
// [T-189a] 绑定抖音 → 幂等建三个每天定时采集 job + 初始化跑一次(纯编排;组合根注入 listJobs/
//   createJob/trigger 端口)。[T-227] ensureCollectionJobs:启动兜底,对存量账号幂等补齐缺失的
//   DEFAULT_JOBS(只建不触发)。
import {
  bootstrapDouyinCollectionJobs,
  ensureCollectionJobs,
} from "@creatoros/backend/modules/ai-runtime";
import { runTopicEnrich } from "@creatoros/backend/modules/ai-runtime";
import { runCalibrationDiagnose } from "@creatoros/backend/modules/ai-runtime";
import { runCalibrationScore } from "@creatoros/backend/modules/ai-runtime";
import { runScriptDraft } from "@creatoros/backend/modules/ai-runtime";
import { runPlanningThesis } from "@creatoros/backend/modules/ai-runtime";
import { runPlanningContract } from "@creatoros/backend/modules/ai-runtime";
import { runPlanningOutline } from "@creatoros/backend/modules/ai-runtime";
import { runReviewAnalyze } from "@creatoros/backend/modules/ai-runtime";
import { runPlatformAdapt } from "@creatoros/backend/modules/ai-runtime";
import { runMaterialMatch } from "@creatoros/backend/modules/ai-runtime";
// [T-254b] 制作视频四决策编排(分场/信息卡/B-roll/双语字幕 → video_decisions 候选,
// 预览卡确认门;素材清单投影类型一并引入给 listBrollInventory 端口)。
// [T-309] collectProjectBrollInventory 把项目/账号边界收进唯一 B-roll 素材入口；
// storyboardFromContentData 仍用于四决策 authored 分镜 facet。
import {
  collectProjectBrollInventory,
  runVideoDecisions,
  storyboardFromContentData,
} from "@creatoros/backend/modules/ai-runtime";
import { runPositioningGenerate } from "@creatoros/backend/modules/ai-runtime";
import { runCopilotAssist } from "@creatoros/backend/modules/ai-runtime";
import { runAssetGenerate } from "@creatoros/backend/modules/ai-runtime";
// [T-271] 制作封面链 runner(结构化封面方案 + 文案诚实门 + 结构化组装生图 prompt)。
import { runCoverGenerate } from "@creatoros/backend/modules/ai-runtime";
import { runTranscribe } from "@creatoros/backend/modules/ai-runtime";
// [T-357] 采集逐字稿后处理(ASR 文本落库前:同音错字纠正+补标点+语义分段;失败诚实落原文)。
import { runTranscriptPostprocess } from "@creatoros/backend/modules/ai-runtime";
import { runAssetClassify } from "@creatoros/backend/modules/ai-runtime";
// [T-146 切片 a] 文档抽取 runner + 未配摘要模型的信号错误(诚实降级)。
import {
  runMaterialExtract,
  MaterialSummaryModelNotConfiguredError,
} from "@creatoros/backend/modules/ai-runtime";
import { runReconstruct } from "@creatoros/backend/modules/ai-runtime";
import {
  getOfficialSkillBase,
  listOfficialSkillBases,
  runWithEffectiveSkillSnapshot,
  type EffectiveSkillSnapshotV1,
} from "@creatoros/ai-worker";
import {
  createEffectiveSkillSnapshotResolver,
  parseEffectiveSkillSnapshot,
  requiredSkillIdsForTask,
  type EffectiveSkillSnapshotResolver,
} from "@creatoros/backend/modules/ai-runtime";
import { createLlmCompleter, LlmCredentialError } from "@creatoros/backend/modules/ai-runtime";
import {
  resolveLlmConfig,
  resolveDedicatedLlmConfig,
  resolveLlmConfigWithCapabilityFallback,
} from "@creatoros/backend/modules/ai-runtime";
import {
  resolveMultimodalSpec as resolveMultimodalSpecFn,
  resolveTranscribeSpec as resolveTranscribeSpecFn,
} from "@creatoros/backend/modules/ai-runtime";
// [T-084a] 联网检索解析层 —— 与多模态 resolve 并列(web.search capability,自由字符串零契约改)。
import { resolveSearchSpec as resolveSearchSpecFn } from "@/server/ai/search/resolve";
// 多模态 provider 适配器(L5 asset.generate)。createMinimaxAdapter 是纯自建 REST(image
// 同步 / video 异步轮询),不碰 Agent SDK —— 不违 determinism 边界,可在 host 组合层直接注册。
// createOpenaiAsrAdapter(T-030-D2)= OpenAI 兼容 ASR(SiliconFlow/OpenAI/Groq),逐字稿转写用。
// transcribeAudio = ASR 工厂(按 provider 取适配器 → { text })。
import {
  createMinimaxAdapter,
  modelFor,
  // [T-379] OpenAI 兼容生图(gpt-image 系官方 + one-api/new-api 系中转站同形状)。
  createOpenaiImagesAdapter,
  createOpenaiAsrAdapter,
  // [T-160] 本地 Whisper 适配器(ASR 选配的兜底后端;未配云端 ASR 时走它,免 key、自动下模型)。
  createDefaultWhisperLocalAdapter,
  transcribeAudio as transcribeAudioFn,
  // [T-377] 「测试连接」image.generate 真实最小生图探测用(与 runner 同一工厂真路径)。
  generateImage as generateImageFn,
  resolveExecutablePath,
  type MultimodalProviderRegistry,
} from "@creatoros/ai-worker";
// [T-377] settings.models.test composition-only 拦截工厂(抽出为可单测模块)。
import {
  consumeTextProbeStream,
  createSettingsWithModelTest,
} from "./settings-model-test-wrap";
// [T-084a] 联网检索工厂 + 三家 provider 适配器 —— host 注册进 registry(keyed by provider),
// gatherMaterials 前置检索用。与多模态 registry 并列;加 provider = 在此注册一个适配器。
import {
  searchWeb as searchWebFn,
  createBochaAdapter,
  createTavilyAdapter,
  createSerpapiAdapter,
  createRssAdapter,
  // [T-235b] rss 型热点信源辅路:直接 fetch feed 后复用同一解析(不重造)。
  parseFeed,
  type SearchProviderRegistry,
} from "@creatoros/ai-worker";
// [T-184] script.draft 模板的 contextRequirements 声明 —— 组合根按它 resolveContextDeps 注入 reader。
// [T-269/T-270] planning.thesis 也走声明式注入(补 brief 硬锚 + projectMaterials 素材可溯的 reader)。
import { SCRIPT_DRAFT_TEMPLATE, PLANNING_THESIS_TEMPLATE } from "@creatoros/ai-worker";
// [T-271] 封面链 cover.generate 也走声明式 context 注入(brief 硬锚 + reviewSubject 读口播稿 + 素材可溯)。
import { COVER_BRIEF_TEMPLATE } from "@creatoros/ai-worker";
// [T-126b] 浏览器搜索适配器落 frontend/server(需 playwright,复用 web-capture 无头 context)。
import { createBrowserScrapeAdapter } from "@/server/ai/search/search-browser";
import {
  discoverSameOriginFeedUrl,
  isSyndicationFeed,
} from "@/server/intelligence/feed-discovery";
import {
  createPositioningService,
  createPositioningTransport,
  // [T-135] createPositioningRepository / CreatorProfileRow / PositioningStatementRow
  // 已随 canonical positioning seed(Zyong Zhu 人设)退役移除——唯一调用点是被删的 seed。
  POSITIONING_OP_IDS,
} from "@creatoros/backend/modules/positioning";

// T-513 official-only 平台规则：它属于程序基座，不接受账号 overlay，也不从客户端输入。
// 版本随规则正文变化而递增，和 effective Skill 一起内联到每个任务的 server-only snapshot。
const PLATFORM_POLICY_VERSION = "creatoros-platform-policy-v1";
const PLATFORM_POLICY_TEXT = [
  "AI 只能产生候选；真实数据写入必须经过用户确认和后端服务端口。",
  "不得编造指标、来源、执行结果或已保存状态；缺失数据必须如实标空。",
  "工具只允许使用 effective Skill 白名单与当前账号授权范围的交集。",
].join("\n");
import {
  createCandidateService,
  createCandidateTransport,
  // [T-135] createCandidateRepository / CandidateRow 已随 canonical candidates seed 退役移除。
  CANDIDATE_OP_IDS,
} from "@creatoros/backend/modules/candidate";
import {
  createCalibrationService,
  createCalibrationTransport,
  createCalibrationRepository,
  CALIBRATION_OP_IDS,
  type RubricRow as CalibrationRubricRow,
  type RubricVersionRow as CalibrationRubricVersionRow,
  // [T-135] CalibrationRuleSuggestionRow(RuleSuggestionRow)已随 canonical 复盘回流建议 seed 退役移除。
} from "@creatoros/backend/modules/calibration";
import {
  createPlatformAccountService,
  createPlatformAccountTransport,
  type PlatformAccountService,
  // [T-135] createPlatformAccountRepository / PlatformAccountRow 已随 canonical platform account seed 退役移除。
  PLATFORM_ACCOUNT_OP_IDS,
} from "@creatoros/backend/modules/platform-account";
import {
  createContentCalendarService,
  createContentCalendarTransport,
  CONTENT_CALENDAR_OP_IDS,
  type ContentCalendarService,
} from "@creatoros/backend/modules/content-calendar";
import {
  createMaterialLinksService,
  createMaterialLinksTransport,
  MATERIAL_LINKS_OP_IDS,
} from "@creatoros/backend/modules/material-links";
// [T-212a] 对标源 + 对标作品(选题/对标强化)。
import {
  createBenchmarkService,
  createBenchmarkTransport,
  BENCHMARK_OP_IDS,
  OwnershipError as BenchmarkOwnershipError,
  type BenchmarkService,
} from "@creatoros/backend/modules/benchmark";
// [T-235b] 热点信源(通用网页/RSS 信源登记,热点多源证据)。
import {
  createTrendSourcesService,
  createTrendSourcesTransport,
  TREND_SOURCES_OP_IDS,
  type TrendSourcesService,
} from "@creatoros/backend/modules/trend-sources";
// [T-235c] 指定抖音收藏夹(收藏夹跟拍信号源)。
import {
  createFavoritesService,
  createFavoritesTransport,
  FAVORITES_OP_IDS,
  type FavoritesService,
} from "@creatoros/backend/modules/favorites";
// [T-235d] 选题归因(正向归因回流 —— 选题验证库;读侧 1 op + runner 写侧薄层)。
import {
  createTopicAttributionService,
  createTopicAttributionTransport,
  TOPIC_ATTRIBUTION_OP_IDS,
  type TopicAttributionService,
} from "@creatoros/backend/modules/topic-attribution";
import {
  createSchedulingService,
  createSchedulingTransport,
  SCHEDULING_OP_IDS,
} from "@creatoros/backend/modules/scheduling";
import {
  createDashboardQueryService,
  createProjectOverviewQueryService,
  createGlobalSearchQueryService,
  createPublishingCenterQueryService,
  createQueryServicesTransport,
  QUERY_SERVICES_OP_IDS,
  type PublishingCenterQueryService,
} from "@creatoros/backend/modules/query-services";

// [T-163 Batch 4] 文档 AI 摘要节点(模板 + JSON schema + runStructuredNode)已提到 backend
// ai-runtime 的 runMaterialSummary —— 组合根只解析 spec + 映射错误,AI 逻辑不住前端包。

// Project-entity operations now served by REAL SQL persistence (@creatoros/backend
// over pglite). Everything else falls back to the in-memory mock. Listed
// explicitly so non-persisted ops (e.g. the static Dashboard page DTO) never
// trigger a pglite init — keeps pglite out of the static build.
const PERSISTED_OPS = new Set<string>([
  // Projects (module 05) — all 15 "项目与流程" ops served by the module's own
  // user-scoped transport (outputs/tasks/stages/activity included).
  ...PROJECT_OP_IDS,
  // Taxonomy (module 04) — tags + entity_tags served by REAL SQL persistence.
  ...TAXONOMY_OP_IDS,
  // Notifications (module 01) — list + read served by REAL SQL persistence.
  ...NOTIFICATION_OP_IDS,
  // Search (module 02) — the composed `pages.search.get` read served by REAL SQL.
  ...SEARCH_OP_IDS,
  // Settings (module 03) — account read + preference/model/agent mutations.
  ...SETTINGS_OP_IDS,
  // Knowledge (module 06) — list/create/get + revisions.create + relations.create.
  ...KNOWLEDGE_OP_IDS,
  // Assets (module 07) — list/get + two-phase upload + files.create + trash/restore.
  ...ASSET_OP_IDS,
  // Artifacts (module 08) — list/create/get + versions.create/list + restore +
  // relations.create, all user-scoped with append-only immutable versions.
  ...ARTIFACT_OP_IDS,
  // Production (module 09) — get/put production + segments.create + exports
  // create/complete, user-scoped with §12 status machine + cross-module fan-out.
  ...PRODUCTION_OP_IDS,
  // Publishing (module 10) — list/create/get publications + revisions.create +
  // transition, user-scoped with §12 publish machine + MockPublisher idempotency.
  ...PUBLISHING_OP_IDS,
  // Analytics (module 11) — publication/project metric reads, user-scoped over the
  // append-only metric store; idempotent appendSnapshot is the Ingestion seam.
  ...ANALYTICS_OP_IDS,
  // Ingestion (module 12) — the 7 batch-push run ops, user-scoped, idempotent
  // (§17), fanning out to peer Services. No FE page (external skill writes only).
  ...INGESTION_OP_IDS,
  // Reviews (module 13) — create/get review + insights.create + complete,
  // user-scoped with §12 Review status machine (idempotent complete). Period from
  // the Publishing window, evidence from the Analytics snapshot (injected ports).
  ...REVIEWS_OP_IDS,
  ...REVIEW_GATE_OP_IDS,
  // Learnings (module 14) — list/create + applications.create + evaluate,
  // user-scoped with the §12 validationStatus machine (candidate→validated|
  // discarded; validated→discarded). Apply-target project ownership + activity via
  // the injected Projects port; reusable across projects (reviewId nullable).
  ...LEARNINGS_OP_IDS,
  // AI (module 15) — conversations list/create + messages.create + tasks
  // create/confirm/cancel, user-scoped with the §12 AI Task state machine. confirmTask
  // formalizes an artifact_version candidate through the Artifacts public service
  // (createVersion createdByType:'ai'); the Agent SDK runs only in @creatoros/ai-worker.
  ...AI_OP_IDS,
  // [T-255a] Execution(执行层,脑手分离)— execution.tasks create/list/get/confirm/
  // discard。存储复用 ai_tasks(taskType `exec.*`);沙箱产物过确认门才入资产库(铁律②)。
  ...EXECUTION_OP_IDS,
  // T-482 内容雷达：当前已落地的分类、来源、运行、作品与手动转写主链。
  ...INTELLIGENCE_OP_IDS,
  // Query services (module Q, Wave 4) — the 3 page-composition reads
  // (pages.dashboard.get / pages.projectOverview.get / pages.search.get). Composes
  // public upstream services only (SPEC §19); pages.search.get is TAKEN OVER from
  // the Search module's interim composer here. publishingCenterPage has no op.
  ...QUERY_SERVICES_OP_IDS,
  // Positioning (module 17, Wave 5) — 七步①② 定位中心. profile get/upsert +
  // statements list/create/get (append-only immutable version chain) + gate.evaluate
  // (deterministic advisory 0–100 fit) + pages.positioning.get (定位中心 page DTO),
  // all user-scoped. The gate reaches Projects via the injected port; the AI 定位演进
  // 回流 formalizes through createStatementVersion (createdByType:'ai') — no parallel
  // candidate machine (C-3).
  ...POSITIONING_OP_IDS,
  // [T-052 裁决③] Monetization(module 18)已随变现中心物理删除(宪法 §8)。
  // Candidate (module 19, Wave 5) — 七步③ 选题情报层. candidates.list/create/get/
  // patch/promote + audienceSignals.list/linkToCandidate, all user-scoped. AI-sourced
  // candidates arrive via the service's createFromAIResult (C-3 formalize — no
  // duplicate submit/confirm op); AudienceSignal writes ride Ingestion's intake
  // (C-4 — no second write op). promote → Project reaches Projects via the injected
  // port; the PositioningGate is a nullable soft-dep port (fit=null when unwired).
  ...CANDIDATE_OP_IDS,
  // Calibration (module 20, Wave 5–7) — 七步⑤⑥ 校准闭环. rubrics.create/bumpVersion/
  // get + predictions.create/lock/get + results.create, all user-scoped. Prediction is
  // immutable once locked; RubricVersion is an append-only chain; CalibrationResult.
  // actualMetrics is recycled via a verified IngestionRun (§C-4/RISK-005). The §6.3
  // confidence feedback reaches Learnings via an injected port (no cross-module repo
  // import).
  ...CALIBRATION_OP_IDS,
  // PlatformAccount (module 21, Wave 5–7) — 七步⑤ 多账号矩阵. accounts.list/create/
  // get/update/archive, all user-scoped. Promotes 矩阵号 from a free-text
  // account_reference string to a first-class user-scoped entity; the PUBLIC
  // assertOwnedAccount(ctx, accountId, platform) guard is the cross-module binding seam
  // Publishing/Projects call before stamping accountId (no cross-module repo import).
  // secretReference is an opaque reference (§7.1) — never a raw token. archive is a soft
  // flip (attribution preserved); per-account metrics are a read-time rollup over
  // Publication.accountId (C-4 — no new metric write path, no MetricSnapshot.accountId).
  ...PLATFORM_ACCOUNT_OP_IDS,
  // ContentCalendar (module 22, Wave 5–7) — 七步⑦ 发布节奏 / 内容日历. The 8 ops
  // accounts.calendar.list / .entries.create + calendar.entries.update/transition/
  // delete + accounts.cadence.get/upsert/attainment, all user-scoped. Entries hang off
  // an account_id (a soft FK validated via PlatformAccountService — no cross-module repo
  // import). The planned→published/missed reconcile reads already-ingested publishing
  // reality (C-4 — no new external-write path); 断更 fires a Notification only on the
  // planned→missed edge. attainment is a derived read (no stored table).
  ...CONTENT_CALENDAR_OP_IDS,
  // MaterialLinks (用料链 / Bill-of-Materials, Plan A4) — materialLinks.list/create/
  // delete, all user-scoped. The 料库⇄创作 edge: a project (and optionally an output)
  // USES a KnowledgeItem or Asset with a role + stage + provenance. Pure local records
  // (entityId/contentOutputId are soft references validated at the caller's seam, no
  // cross-module repo import); delete is ownership-gated (cross-user → OwnershipError →
  // 404).
  ...MATERIAL_LINKS_OP_IDS,
  // [T-212a] Benchmark 对标源 CRUD(选题/对标强化,SPEC 2026-07-11 §2.1)。user/account-scoped,
  // 采集 job 落对标作品供 T-212c 拆解转化。
  ...BENCHMARK_OP_IDS,
  // [T-235b] 热点信源 CRUD(热点多源证据,SPEC 2026-07-11 daily-topic-autopilot §2.2)。
  // user/account-scoped,出题时逐 enabled 源抓信号拼 trend brief。
  ...TREND_SOURCES_OP_IDS,
  // [T-235c] 指定收藏夹登记 CRUD(收藏夹跟拍信号源)。user/account-scoped,采集 job 按名匹配
  // 拉夹内视频 → 限量进候选池(source=favorites)。
  ...FAVORITES_OP_IDS,
  // [T-235d] 选题归因只读(正向归因回流,SPEC 2026-07-11 daily-topic-autopilot §2.4)。
  // user/account-scoped;写侧由 self.detail 采集尾的归因 runner 落库,不走契约 op。
  ...TOPIC_ATTRIBUTION_OP_IDS,
  // Scheduling (module 23, T-007) — scheduled_job CRUD (create/list/get/update/setEnabled)
  // + job_run reads (listByJob/get). owned-root, transport 按 ctx.userId 收窄, job_run 经
  // requireJob ownership gate。D1 建了 backend module 却没接 dispatch;这条接线让 /automations
  // 的 client island 走 HTTP → dispatch → REAL SQL(pglite 迁移 0009 已建两表),读/管才真跑通。
  ...SCHEDULING_OP_IDS,
]);

// The set of op ids owned by the taxonomy module's transport (module 04).
const TAXONOMY_OPS = new Set<string>(TAXONOMY_OP_IDS);

// The set of op ids owned by the notifications module's transport (module 01).
const NOTIFICATION_OPS = new Set<string>(NOTIFICATION_OP_IDS);

// The set of op ids the Search module's transport handles at DISPATCH time
// (module 02). Wave-4 takeover (foundation §6): the query-services module now owns
// `pages.search.get`, so the Search transport is NO LONGER routed for it. But the
// module DOES still own its own standalone reads — `search.facets`
// (GAP-SRCH-facets, GET /search/facets) is routed here. So this set is
// SEARCH_OP_IDS minus the taken-over page op (rather than a hardcoded empty set):
// adding a new standalone op to SEARCH_OP_IDS auto-registers it for dispatch, while
// pages.search.get stays owned by query-services below. The Search SERVICE is also
// consumed by the GlobalSearchQueryService facade (search/recordSearch/listHistory).
const SEARCH_OPS = new Set<string>(
  SEARCH_OP_IDS.filter((opId) => opId !== "pages.search.get"),
);

// The set of op ids owned by the query-services module's transport (module Q).
const QUERY_SERVICES_OPS = new Set<string>(QUERY_SERVICES_OP_IDS);

// The set of op ids owned by the settings module's transport (module 03).
const SETTINGS_OPS = new Set<string>(SETTINGS_OP_IDS);

// The set of op ids owned by the projects module's transport (module 05).
const PROJECT_OPS = new Set<string>(PROJECT_OP_IDS);

// The set of op ids owned by the knowledge module's transport (module 06).
const KNOWLEDGE_OPS = new Set<string>(KNOWLEDGE_OP_IDS);

// The set of op ids owned by the assets module's transport (module 07).
const ASSET_OPS = new Set<string>(ASSET_OP_IDS);

// The set of op ids owned by the artifacts module's transport (module 08).
const ARTIFACT_OPS = new Set<string>(ARTIFACT_OP_IDS);

// The set of op ids owned by the production module's transport (module 09).
const PRODUCTION_OPS = new Set<string>(PRODUCTION_OP_IDS);

// The set of op ids owned by the publishing module's transport (module 10).
const PUBLISHING_OPS = new Set<string>(PUBLISHING_OP_IDS);

// The set of op ids owned by the analytics module's transport (module 11).
const ANALYTICS_OPS = new Set<string>(ANALYTICS_OP_IDS);

// The set of op ids owned by the ingestion module's transport (module 12).
const INGESTION_OPS = new Set<string>(INGESTION_OP_IDS);

// The set of op ids owned by the reviews module's transport (module 13).
const REVIEWS_OPS = new Set<string>(REVIEWS_OP_IDS);

// T-086 审核门 op ids(reviewRules.* + scriptReviews.*),独立 transport 路由。
const REVIEW_GATE_OPS = new Set<string>(REVIEW_GATE_OP_IDS);

// The set of op ids owned by the learnings module's transport (module 14).
const LEARNINGS_OPS = new Set<string>(LEARNINGS_OP_IDS);

// The set of op ids owned by the ai module's transport (module 15).
const AI_OPS = new Set<string>(AI_OP_IDS);

// [T-255a] The set of op ids owned by the execution module's transport.
const EXECUTION_OPS = new Set<string>(EXECUTION_OP_IDS);
const INTELLIGENCE_OPS = new Set<string>(INTELLIGENCE_OP_IDS);

// The set of op ids owned by the positioning module's transport (module 17).
const POSITIONING_OPS = new Set<string>(POSITIONING_OP_IDS);

// The set of op ids owned by the candidate module's transport (module 19).
const CANDIDATE_OPS = new Set<string>(CANDIDATE_OP_IDS);

// The set of op ids owned by the calibration module's transport (module 20).
const CALIBRATION_OPS = new Set<string>(CALIBRATION_OP_IDS);

// The set of op ids owned by the platform-account module's transport (module 21).
const PLATFORM_ACCOUNT_OPS = new Set<string>(PLATFORM_ACCOUNT_OP_IDS);

// [T-136§D-bind⑤] 抖音号占位 handle 集合 —— 扫码阶段 cookie 不含昵称,先占位;真实身份由
// applyDouyinIdentity(refresh 抓 secUid/昵称)回填后合并。判定用于:①ensureAccount 复用既有
// 占位不冒新号;②updateAccountHandle 把所有占位合并为一行真实号。
//   「我的抖音」= loginDouyin ensureAccount 建;「待完善」= migration 0025 默认号 seed。
const DOUYIN_PLACEHOLDER_HANDLES = new Set<string>(["我的抖音", "待完善"]);
const DOUYIN_PENDING_HANDLE =
  /^抖音账号（待识别·[A-Za-z0-9_-]{1,16}）$/;
function isPendingIdentityHandle(handle: string): boolean {
  return DOUYIN_PENDING_HANDLE.test(handle.trim());
}
function isPlaceholderHandle(handle: string): boolean {
  return (
    DOUYIN_PLACEHOLDER_HANDLES.has(handle.trim()) ||
    isPendingIdentityHandle(handle)
  );
}

// [T-136§D-bind⑤] 合并占位号 = archive(status→archived,可逆/诚实,不硬删)。best-effort:
// 单条失败吞错记日志,不阻断(登录/采集主流程已成功)。合并后账号列表(只显 active)只剩真实号一行。
async function archivePlaceholderBestEffort(
  service: PlatformAccountService,
  ctx: RequestContext,
  accountId: string,
): Promise<void> {
  try {
    await service.archiveAccount(ctx, accountId);
  } catch (err) {
    console.error(
      "[persistence] archivePlaceholderBestEffort: 合并占位号(archive)失败:",
      err,
    );
  }
}

// [T-184] 声明式 context 注入 —— resolver。给定模板声明的 contextRequirements(要哪些 context 源)
// 和中央 reader registry(key→已构造 reader),按声明挑出子集组成 facet-reader deps。取代 runXxx
// dispatch **手列 deps**(手列漏一个 reader = 对应 facet 恒空,T-182 CLAIM-1 script.draft 漏 knowledge
// 的根因)。只解析 facet-reader 类 deps;ai / resolveModelSpec 等基础设施由组合根 always-注入,不进声明。
// - 未声明(requirements=undefined)→ 空 deps(调用方保持自身既有手列,互不影响)。
// - registry 里没有 / 值为 undefined 的 key → 跳过(诚实:声明了但装配层没登记该源就是没注入,不塞空壳)。
// future(本切片不做):当 contextRequirements 升级成带权重/渐进/askUser 的结构时,resolver 在此按预算/
// 轮次裁剪;当前只做「声明 key → 静态取 reader」最小映射。
export function resolveContextDeps(
  requirements: readonly string[] | undefined,
  registry: Partial<CreativeContextDeps>,
): Partial<CreativeContextDeps> {
  const deps: Partial<CreativeContextDeps> = {};
  const reg = registry as Record<string, unknown>;
  const out = deps as Record<string, unknown>;
  for (const key of requirements ?? []) {
    const reader = reg[key];
    if (reader !== undefined) out[key] = reader;
  }
  return deps;
}

// [T-136§D-bind⑤] 扫码 ensureAccount 的 upsert 去重:传占位 handle 时,若已存在**任意** active
// douyin 占位号(migration 0025 的「待完善」/ 上次扫码的「我的抖音」)→ 复用它,绝不冒第二个占位;
// 精确 handle 命中(含真实昵称号)→ 幂等复用;都不命中 → 建新号(catch UNIQUE 并发重查)。
// 导出供单测直接验(against 真实 platformAccountService),不经 loginDouyin 黑盒。
export async function ensureDouyinAccountUpsert(
  service: PlatformAccountService,
  ctx: RequestContext,
  input: { platform: string; handle: string; externalAccountId?: string | null },
): Promise<{ id: string }> {
  const { rows } = await service.listAccounts(ctx, {
    platform: input.platform,
    limit: 100,
    offset: 0,
  });
  // [T-201b] 身份解析**优先**按稳定 external_account_id(sec_uid)幂等复用 —— 身份键不再是可变 handle。
  //   有 sec_uid 且命中 → 直接复用该号(display 名叫什么都无关)。account_handle 只用于显示,绝不匹配身份。
  const ext = input.externalAccountId?.trim();
  if (ext) {
    const byExt = rows.find((r) => r.externalAccountId === ext);
    if (byExt) return { id: byExt.id };
  }
  const existing = rows.find((r) => r.accountHandle === input.handle);
  if (existing) return { id: existing.id };
  if (
    isPlaceholderHandle(input.handle) &&
    !isPendingIdentityHandle(input.handle)
  ) {
    // [T-201a] 绑定用占位 handle → 复用**任一既有 active 号**(单号现实),不再仅匹配「handle 仍是
    //   占位」的号:一旦 updateAccountHandle 把昵称改成真实值(如「月明水清深」),再绑仍用占位
    //   handle 调本函数,旧写法(只找占位 handle 的 active 号)找不到→冒**第二个号**=锚点漂移根因
    //   (Bug-2)。单号现实下「同 platform 任一 active 号」即本人,复用它。多账号精确 targeting=T-136 §D。
    const activeExisting = rows.find((r) => r.status === "active");
    if (activeExisting) return { id: activeExisting.id };
  }
  try {
    const created = await service.createAccount(ctx, {
      platform: input.platform,
      accountHandle: input.handle,
      externalAccountId: ext || null, // [T-201b] 首绑 sec_uid 未知 → null(回填不到共存)
    });
    return { id: created.id };
  } catch (err) {
    const again = await service.listAccounts(ctx, {
      platform: input.platform,
      limit: 100,
      offset: 0,
    });
    const hit = again.rows.find((r) => r.accountHandle === input.handle);
    if (hit) return { id: hit.id };
    throw err;
  }
}

// [T-136§D-bind⑤] applyDouyinIdentity 抓到真实昵称后:把占位号回填为真实昵称 + **合并所有占位为一行**。
//   A. 已有同 handle=真实昵称号 → 其余占位全 archive(合并),幂等 no-op 该真实号。
//   B. 无真实号但有占位 → 取一个占位改真实昵称,其余占位全 archive(只留一行);改名撞 UNIQUE →
//      archive 该占位(合并到并发已建的真实号)。
//   C. 无占位 → no-op(交由后续 ensureAccount 建真实号)。
//   archive 可逆/诚实;合并后账号列表(只显 active)只剩真实号一行 —— 干掉「扫一次冒俩占位」。
//   导出供单测直接验(against 真实 platformAccountService)。
export async function mergeDouyinPlaceholders(
  service: PlatformAccountService,
  ctx: RequestContext,
  input: {
    platform: string;
    handle: string;
    externalAccountId?: string | null;
    followerCount?: number | null; // [T-214] 采集到的总粉丝数(可空)
  },
): Promise<void> {
  const real = input.handle.trim();
  if (!real) return;
  const ext = input.externalAccountId?.trim() || null; // [T-201b] 采集到的 sec_uid(可空)
  // [T-214] 总粉丝数回填值:仅当采到 >0 才认(0/null → undefined,下面不写,不覆盖已有 baseline)。
  const follower =
    typeof input.followerCount === "number" && input.followerCount > 0
      ? input.followerCount
      : undefined;
  const { rows } = await service.listAccounts(ctx, {
    platform: input.platform,
    limit: 100,
    offset: 0,
  });
  const active = rows.filter((r) => r.status === "active");
  const placeholders = active.filter((r) => isPlaceholderHandle(r.accountHandle));
  // [T-469] forceNew 身份暂不可读时会创建一个**独立且唯一**的待识别账号。后续该账号首次
  // 采集读到身份，只能回填 ctx.accountId 指向的这一行；绝不能沿旧单账号合并逻辑误改/归档
  // 其它仍待识别的新号。
  const currentPending =
    ctx.accountId == null
      ? undefined
      : placeholders.find(
          (r) =>
            r.id === ctx.accountId &&
            isPendingIdentityHandle(r.accountHandle),
        );
  // [T-201b] 身份键回填:仅当该号 external_account_id 当前为空(NULL/空串)才写入采集到的 sec_uid;
  //   **永不覆盖已有身份键 / id**。是身份锚的一次性落地,不参与后续显示逻辑。
  async function backfillExternalId(accountId: string, current: string | null): Promise<void> {
    if (!ext) return;
    if (current && current.trim()) return; // 已有身份键 → 不动
    try {
      await service.updateAccount(ctx, accountId, { externalAccountId: ext });
    } catch (err) {
      console.error(
        "[persistence] mergeDouyinPlaceholders: 回填 external_account_id 失败:",
        err,
      );
    }
  }
  // [T-214] 总粉丝数回填:与 externalAccountId 不同,粉丝数是**会增长的指标**,故每次采集都用
  //   最新 >0 值刷新 followerBaseline(不是一次性锚)。0/null(follower=undefined)→ 不写,
  //   保留已有值(诚实降级,治编导 agent「粉丝数 0」)。best-effort,失败吞错不阻断合并。
  async function backfillFollower(accountId: string): Promise<void> {
    if (follower === undefined) return;
    try {
      await service.updateAccount(ctx, accountId, { followerBaseline: follower });
    } catch (err) {
      console.error(
        "[persistence] mergeDouyinPlaceholders: 回填 followerBaseline 失败:",
        err,
      );
    }
  }
  const realExisting = active.find((r) => r.accountHandle === real);

  if (currentPending) {
    if (realExisting && realExisting.id !== currentPending.id) {
      await backfillExternalId(realExisting.id, realExisting.externalAccountId);
      await backfillFollower(realExisting.id);
      await archivePlaceholderBestEffort(service, ctx, currentPending.id);
      return;
    }
    await backfillExternalId(
      currentPending.id,
      currentPending.externalAccountId,
    );
    await backfillFollower(currentPending.id);
    try {
      await service.updateAccount(ctx, currentPending.id, {
        accountHandle: real,
      });
    } catch (err) {
      console.error(
        "[persistence] mergeDouyinPlaceholders: 待识别账号回填真实昵称失败:",
        err,
      );
    }
    return;
  }

  if (realExisting) {
    await backfillExternalId(realExisting.id, realExisting.externalAccountId);
    await backfillFollower(realExisting.id);
    for (const p of placeholders) {
      await archivePlaceholderBestEffort(service, ctx, p.id);
    }
    return;
  }
  const [keep, ...rest] = placeholders;
  if (!keep) return; // 无占位可更新 → 交由后续 ensureAccount 建真实号
  await backfillExternalId(keep.id, keep.externalAccountId);
  await backfillFollower(keep.id); // [T-214] 顺带回填总粉丝数(>0 才写)
  try {
    await service.updateAccount(ctx, keep.id, { accountHandle: real });
  } catch (err) {
    console.error(
      "[persistence] mergeDouyinPlaceholders: 占位改真实昵称失败(可能已存在真实号),改为 archive 占位:",
      err,
    );
    await archivePlaceholderBestEffort(service, ctx, keep.id);
  }
  for (const p of rest) {
    await archivePlaceholderBestEffort(service, ctx, p.id);
  }
}

// The set of op ids owned by the content-calendar module's transport (module 22).
const CONTENT_CALENDAR_OPS = new Set<string>(CONTENT_CALENDAR_OP_IDS);

// The set of op ids owned by the material-links module's transport (Plan A4).
const MATERIAL_LINKS_OPS = new Set<string>(MATERIAL_LINKS_OP_IDS);
// [T-212a] 对标源 CRUD ops 路由集。
const BENCHMARK_OPS = new Set<string>(BENCHMARK_OP_IDS);
// [T-235b] 热点信源 CRUD ops 路由集。
const TREND_SOURCES_OPS = new Set<string>(TREND_SOURCES_OP_IDS);
// [T-235c] 指定收藏夹登记 CRUD ops 路由集。
const FAVORITES_OPS = new Set<string>(FAVORITES_OP_IDS);
// [T-235d] 选题归因只读 ops 路由集。
const TOPIC_ATTRIBUTION_OPS = new Set<string>(TOPIC_ATTRIBUTION_OP_IDS);

// The set of op ids owned by the scheduling module's transport (module 23, T-007).
const SCHEDULING_OPS = new Set<string>(SCHEDULING_OP_IDS);

// [T-332 S2] canonical 变现加权 Rubric 改为 **per-account** 种子(SPEC §3.2:rubrics 是
// per-account 域、每号一套打分口径,account_id NOT NULL 后不能再有「系统级 null 号」rubric)。
// id 约定 = `rubric-canonical:<accountId>`;seed(逐 active 号)与所有运行时解析点
// (复盘回流轨B / 编导评分 worker / ChatBox context)都经本 helper 达成同一把 key。
// ctx 未选号 → 返回不可能命中的哨兵 id,调用方 lookup 失败走各自的诚实空态(null/回退)。
const canonicalRubricIdFor = (ctx: RequestContext): string =>
  `rubric-canonical:${ctx.accountId ?? "__no-account__"}`;

// [T-277] 可审整稿的最短正文阈值 —— 低于此视作「还没有整稿」(空稿/占位/整稿未落地)。一份
// 6-10 镜的真实分镜脚本正文恒在数百字级,25 字级的陈旧占位稿会被这道门拦下,不进审核。
const MIN_REVIEWABLE_SCRIPT_CHARS = 40;

// [T-278] 收藏夹每轮进池上限 —— 收藏夹是用户亲手挑的(非自动信息流),不限速。50 = 单夹抓取
// 上限 ≤50/夹,一轮就把用户新存的全部转候选,当天即见(治「采 13 条今日只见 3 条」)。
const FAVORITES_PROMOTE_PER_RUN = 50;

// [T-135] canonical + douyin knowledge seed 全退役 → CanonicalKnowledge/CanonicalRevision 类型
// + toKnowledgeRow/toRevisionRow mapper 一并移除(知识全由用户真实采集/录入进库,不再 seed)。

// [T-099c] 产物版本正文抽取(单一真值,context.artifacts 字数 + context.artifact.text 全文共用)——
// output_script transcript 优先(与 makeReviewSubjectReader.getScript 同读法),回退 contentText,
// 再回退 contentData.sections 拼段 / body(与 scriptSource.getLatestScript 同抽取口径)。无正文 → 空串。
function extractArtifactText(
  contentText: string | null | undefined,
  contentData: unknown,
): string {
  const data =
    contentData && typeof contentData === "object"
      ? (contentData as Record<string, unknown>)
      : null;
  // 逐字稿:contentData.transcript 优先(output_script 的正文落这里)。
  if (data && typeof data.transcript === "string" && data.transcript.trim()) {
    return data.transcript;
  }
  // 通用回退:artifact 版本的 contentText(结构化编辑器落的纯文本快照)。
  if (typeof contentText === "string" && contentText.trim()) {
    return contentText;
  }
  // 结构化产物:sections 拼段(label/text/narration/body 任一非空即取)。
  if (data && Array.isArray(data.sections)) {
    const joined = (data.sections as unknown[])
      .map((s) => {
        const so =
          s && typeof s === "object" ? (s as Record<string, unknown>) : {};
        return [so.label, so.text, so.narration, so.body]
          .filter((x): x is string => typeof x === "string" && x.length > 0)
          .join(" ");
      })
      .filter((line) => line.length > 0)
      .join("\n");
    if (joined.trim()) return joined;
  }
  // 兜底:contentData.body 纯文本字段。
  if (data && typeof data.body === "string" && data.body.trim()) {
    return data.body;
  }
  return "";
}

// [T-135] toKnowledgeRow/toRevisionRow(及 toRelationRow/toAssetRow/toAssetFileRow/
// toPreferenceRow/toModelRow/toAgentRow 等)已随全部 canonical + douyin 内容 seed 退役移除
// (知识/素材/定位等全由用户真实采集或录入进库,不再 seed 固化任何内容)。

// Pin the singleton on globalThis, NOT a module-level `let`: Next/Turbopack give
// the route handler and server components separate module instances, so a
// module-level singleton would be a SEPARATE in-memory pglite per entry — island
// writes (via the route) would never be visible to page reads. globalThis is
// per-process, shared across all module graphs, so both see one store.
// The persistence bundle cached on globalThis: the composite-backing
// persistence transport AND the identity service, BOTH bound to the SAME pglite
// db. Task 9's dispatch + auth routes resolve `RequestContext` from the session
// cookie via `getIdentityService()`, so the ctx they thread into the transport
// reads/writes the same store the persistence transport serves.
interface PersistenceBundle {
  projects: Transport;
  taxonomy: Transport;
  notifications: Transport;
  search: Transport;
  settings: Transport;
  knowledge: Transport;
  assets: Transport;
  artifacts: Transport;
  production: Transport;
  publishing: Transport;
  analytics: Transport;
  ingestion: Transport;
  reviews: Transport;
  // T-086 审核门 transport(reviewRules.* + scriptReviews.*)。
  reviewGate: Transport;
  learnings: Transport;
  ai: Transport;
  // [T-255a] 执行层 transport(execution.tasks.*,存储复用 ai_tasks)。
  execution: Transport;
  // T-482 内容雷达领域 transport。
  intelligence: Transport;
  positioning: Transport;
  candidate: Transport;
  calibration: Transport;
  platformAccount: Transport;
  scheduling: Transport;
  contentCalendar: Transport;
  materialLinks: Transport;
  // [T-212a] 对标源 CRUD transport(选题/对标强化)。
  benchmark: Transport;
  // [T-235b] 热点信源 CRUD transport(热点多源证据)。
  trendSources: Transport;
  // [T-235c] 指定收藏夹登记 CRUD transport(收藏夹跟拍信号源)。
  favoritesFolders: Transport;
  // [T-235d] 选题归因只读 transport(正向归因回流)。
  topicAttribution: Transport;
  // Query services (module Q, Wave 4): the composite transport for the 3 page
  // reads, plus the Publishing Center composer (no endpoint — the FE calls it
  // server-side via getPublishingCenterService()).
  queryServices: Transport;
  publishingCenter: PublishingCenterQueryService;
  identity: IdentityService;
  // [T-136 切片 a] 暴露 platform-account service(不只 transport),供 resolveRequestContext
  // 在解析 ctx 时对 x-account-id header 做属主硬校验(getAccount 域内查号,不属主抛 404 → 降级
  // null)。与 identity/settingsService 同款「无 dispatch endpoint 的 route 直调服务」逃生口。
  platformAccountService: PlatformAccountService;
  // item B — exposed so the blob route (no dispatch endpoint) can resolve the
  // request user's media root, the same root uploads were minted against.
  settingsService: SettingsService;
  // T-147 P5 — 一机一码激活门 service(无 dispatch endpoint;门控 RSC + 激活页 server action
  // 直调,同 settingsService 逃生口)。web/dev 装了不触发,桌面态才真 check/activate。
  activationService: ActivationService;
  // T-004 ChatBox — exposed so the /api/chat route (no dispatch endpoint; it streams
  // via the Vercel AI SDK, not the RPC envelope) can assemble + persist a turn against
  // the SAME pglite store: aiService (persist conversation/messages), resolveModelSpec
  // (按 capability 解析 model), and the bound CreativeContext readers (定位/飞轮/受众信号/
  // 知识库 数据层注入). Mirrors how getStorageRootForRequest exposes settingsService.
  chatRuntime: ChatRuntime;
  // [T-093] 知识库 AI 搜索 route(/api/knowledge/search,无 dispatch endpoint)的运行时:
  // 可配 embedding(capability knowledge.search.embed,只认专配行)+ 存量回填 + hybrid 检索。
  knowledgeSearchRuntime: {
    hybridSearch: (
      ctx: RequestContext,
      query: string,
    ) => Promise<{
      semanticEnabled: boolean;
      semanticError: string | null;
      hits: HybridSearchHit[];
    }>;
  };
  // [T-055d] Finder「在 Finder 打开/显示」route(无 dispatch endpoint)的最小面。
  localFileRuntime: {
    assetStorageKey: (
      ctx: RequestContext,
      assetId: string,
    ) => Promise<string | null>;
    projectFolder: (
      ctx: RequestContext,
      projectId: string,
    ) => Promise<string | null>;
  };
  // [T-217a] Web Session Vault runtime —— `/api/web-session` route(无 dispatch endpoint;
  //   sidecar 浏览器 + 文件系统能力,非 DB/非 user-scoped,per-machine 全局)据此列站点/有头
  //   登录/被动探针/移除。与 localFileRuntime / knowledgeSearchRuntime 同款「无 endpoint 的
  //   runtime 逃生口」(而非 DB 契约 transport op —— 保管库无 DB 层,套 transport 只是空壳 service)。
  // [T-370a] 登录态真值迁到 browser_sessions 加密表(user 级域名维)→ 各操作带 ctx
  //   (route 已解析 RequestContext,原先丢弃,现传入 stamp ctx.userId)。
  webSessionRuntime: {
    /** 列已保存站点会话(DB 加密记录 ∪ 旧 profile 目录;域名 + 上次登录时间)。 */
    listSessions: (
      ctx: RequestContext,
    ) => Promise<Array<{ domain: string; lastLoginAt: string | null }>>;
    /** [T-221] 开一个有头登录窗口(弹独立 Chromium,用户自己登录)并**保持打开**,不再赌 cookie 名
     *  自动关(治「浏览器秒关」)。返回 pending=true;登好由用户在 vault 卡点「我登好了」→ confirmSession。 */
    loginSession: (
      ctx: RequestContext,
      url: string,
    ) => Promise<{ domain: string; pending: boolean }>;
    /** [T-221] 用户显式「我登好了」:storageState 回写 DB(T-370a)+ 关登录窗,认可成功。 */
    confirmSession: (domain: string) => Promise<{ domain: string; loggedIn: boolean }>;
    /** [T-221] 用户「取消」登录:关登录窗,不留登录承诺。 */
    cancelSession: (domain: string) => Promise<{ domain: string; cancelled: boolean }>;
    /** 被动探针(headless 不弹窗):DB state 注入回灌后查是否已登录(含存量惰性迁移)。 */
    sessionStatus: (
      ctx: RequestContext,
      domain: string,
    ) => Promise<{ domain: string; loggedIn: boolean }>;
    /** 移除某域名登录态(DB 加密记录 + 持久 profile 目录都删)。 */
    removeSession: (
      ctx: RequestContext,
      domain: string,
    ) => Promise<{ removed: boolean }>;
  };
}

// T-004 ChatBox runtime — the minimal surface the /api/chat route needs from the
// composition root: persist (aiService) + resolve model (resolveModelSpec) + the bound
// context readers (assembleChatAssembly reads them for 数据层注入). The readers are bound
// to the same public services the topic.generate trigger uses (no cross-module repo import).
export interface ChatRuntime {
  ai: AiService;
  // [T-513] 每轮对话在服务端按当前 user/account 解析不可变 Effective Skill。
  // route 只传受控的 official skill id，不接收客户端自带 prompt/policy。
  resolveEffectiveSkillSnapshot: (
    ctx: RequestContext,
    requiredSkillIds: readonly string[],
  ) => Promise<EffectiveSkillSnapshotV1>;
  /** 同步非 ai_task 入口的唯一 account-scoped Skill 执行门。 */
  runWithEffectiveSkills: <T>(
    ctx: RequestContext,
    requiredSkillIds: readonly string[],
    execute: () => Promise<T>,
  ) => Promise<T>;
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<{
    apiFormat: "anthropic" | "openai_chat" | "openai_responses";
    baseUrl: string | null;
    model: string;
    token: string;
  }>;
  // [T-239b S1] 备用对话模型解析 —— **只认 `chat.fallback` 专配行**(resolveDedicatedLlmConfig,
  // 不回退 default/env,否则「备用」会解析成主模型自己);未配/无 key → null(现状报错,诚实降级)。
  // chat-runner 在主模型流开始前可重试错误耗尽时用它接管一次。
  resolveFallbackModelSpec: (ctx: RequestContext) => Promise<{
    apiFormat: "anthropic" | "openai_chat" | "openai_responses";
    baseUrl: string | null;
    model: string;
    token: string;
  } | null>;
  context: ChatContextDeps;
  // 只读 context 工具(context.projects / context.knowledge / context.materials)的真数据读端口。
  // 与 `context`(CreativeContext facet reader,进 system 的记忆)不同:这些是「用户问才实时拉」的
  // 按需读,由 chat-runner 的对应工具 execute 调用。全部 user-scoped(绑到 projects repo / knowledge
  // service / assets service 的 ctx.userId 读)。
  contextReaders: ChatContextReaders;
  // [T-084a] 联网检索端口(gatherMaterials 前置检索用)。probeSearchConfigured 探测 web.search
  // 是否已配(honestyBlock 第 6 条 + 工具动态描述);searchWeb 真执行检索(未配/失败抛错,
  // chat-runner catch 成 model_memory 降级)。
  probeSearchConfigured: (ctx: RequestContext) => Promise<boolean>;
  searchWeb: (
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
  // [T-084b] material.screenshot 端口 —— captureUrl(真无头浏览器截图公开页)→
  // assetsService.createGeneratedAsset(落字节 + 建 asset,带 sourceUrl 存证)→ 换签名预览 URL。
  // 失败(打不开/HTTP/登录墙)抛错,chat-runner 工具 execute 接住转人话。
  // [T-239c] input.signal(additive):用户中断本轮 → Playwright 导航/截图提前退出,不空烧。
  captureScreenshot: (
    ctx: RequestContext,
    input: { url: string; fullPage?: boolean; signal?: AbortSignal },
  ) => Promise<{
    assetId: string;
    name: string;
    previewUrl: string | null;
    sourceUrl: string;
  }>;
  // [T-217b/c] web.read 端口 —— 带 .auth/web 登录态读正文全文 → createGeneratedAsset 落**逐字稿
  //   文本素材**(assetType document,pending 走 T-219 确认门,带 sourceUrl 存证)。无会话/过期 →
  //   返回 { needLogin:true, domain }(编导据此引导「去保管库登录」,不落库、不截登录页)。
  // [T-239c] input.signal(additive):用户中断本轮 → 带登录态浏览器导航/抽取提前退出。
  readWebUrl: (
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
        /** [T-237] 抽到的对话轮次数(非对话页 null)—— 编导如实转述,不猜「分享页本来就短」。 */
        turnCount?: number | null;
        /** [T-237] 抽取诊断人话(如「抽到 12 轮对话(SSR 全量)」);非对话页 null。 */
        extraction?: string | null;
        /** [T-251] 正文全文(未截断)—— 工具 execute 侧按窗返回给模型(默认/封顶 12k)。 */
        fullText?: string | null;
        /** [T-251] true = 命中已落库的同 URL document asset(未重新抓取,读的是已存全文)。 */
        fromCache?: boolean;
      }
    | { needLogin: true; domain: string }
    // [T-390] HTTP 被拒(403 反爬/404 下架/5xx)→ 多路搜索找到的替代来源候选(可为空,诚实);
    //   message 已是人话(含未登录时的保管库引导),编导据 alternates 挑一条再 web.read。
    | {
        blocked: true;
        status: number | null;
        message: string;
        alternates: Array<{ title: string; url: string; snippet: string }>;
      }
  >;
  // [T-386] 后台任务状态真值端口 —— 每轮对话前查该账号近期任务的库内真实状态(aiService.listTasks
  //   最小投影),装配层渲「后台任务状态真值」块,治「凭记忆断言任务还在跑」的幻觉。
  listRecentTasks: (ctx: RequestContext) => Promise<
    Array<{
      id: string;
      taskType: string;
      status: string;
      requestedAt: string | Date;
      completedAt?: string | Date | null;
      errorMessage?: string | null;
    }>
  >;
  // [T-253] local.read 端口 —— 读本机文件(任意路径 + 运行时逐次授权)。端口内:路径归一/realpath
  // 穿越防护 → 敏感 denylist 硬拒(无论授权与否)→ 授权表查询(未授权返 needApproval 渲确认卡)→
  // 大小上限 1MB + 二进制拒读 → 文本全文/目录清单。IO 失败抛错(工具 execute 转 error)。
  readLocalFile: (
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
    // [T-262] 文件名搜索兜底两态(精确路径解析不到时按 basename 搜 scoped 目录集):唯一命中 →
    // nameMatch(走既有授权门读真实路径);多命中 → nameCandidates(候选选择态)。
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
  // [T-263] local.read 授权判定端口(HITL 门用,与执行读取 readLocalFile 拆开)—— 只跑归一/realpath/
  // 敏感/授权表判定,不读内容、不消费一次授权。三态:needApproval(未授权→挂起弹卡)/denied(敏感
  // 硬拒)/granted(已授权或无法判定→放行,execute 时 readLocalFile 再权威处理)。
  decideLocalReadAccess: (
    ctx: RequestContext,
    input: { path: string },
  ) => Promise<
    | { status: "needApproval" }
    | { status: "denied"; reason: string }
    | { status: "granted" }
  >;
  // [T-256a] local.tools 端口 —— 探测系统已装工具(ffmpeg/node/python3/git…)。端口内:白名单过滤
  // (resolveToolsToProbe,非法/非白名单名落 rejected)→ 固定 arg 数组 spawn which/--version(绝不
  // 拼 shell 串)→ parseToolVersion。只读探测,不执行任意命令。返回每个工具 installed/path/version +
  // 缺失安装引导 + rejected 清单。
  detectTools: (
    ctx: RequestContext,
    input: { tools?: string[] },
  ) => Promise<{
    tools: Array<{
      name: string;
      installed: boolean;
      path: string | null;
      version: string | null;
      purpose: string;
      installHint: string | null;
    }>;
    rejected: string[];
  }>;
  // [T-256a] local.workspace 端口 —— 列该用户「总是允许该目录」授权过的本地目录根(复用 T-253
  // 授权表 local-read-grants,不新建授权机制)。只读,回目录根数组(空 = 还没授权过)。
  listAuthorizedDirs: (ctx: RequestContext) => Promise<{ dirs: string[] }>;
  // [T-084c] material.generate 端口 —— dispatch 既有 asset.generate task(经 ai transport 的
  // ai.tasks.create,复用既有分派链 void runAssetGenerate),立即返回 taskId(不阻塞对话回合)。
  dispatchGenerateAsset: (
    ctx: RequestContext,
    input: { kind: "image" | "video"; prompt: string; projectId?: string | null },
  ) => Promise<{ taskId: string }>;
  // [T-103b] review.script 端口 —— dispatch 既有 script.review ai_task(reviewGateService.triggerReview,
  // 复用 T-086 审核链路 L1 lint + L2 语义审 → 落 script_review_reports),立即返回 taskId。对话审核工具
  // (review.script)据此触发,前端 ChatReviewReportCard 轮询 getTask → 读 getLatestScriptReview 渲报告卡。
  dispatchScriptReview: (
    ctx: RequestContext,
    input: { projectId: string },
  ) => Promise<{ taskId: string }>;
  // [T-265] planning.thesis 端口 —— ensure 项目 thesis_tree artifact + dispatch 既有 planning.thesis
  // ai_task(复活孤儿 runPlanningThesis),立即返回 taskId(不阻塞对话回合)。对话论点树工具
  // (planning.thesis)据此触发,前端 ChatThesisCard 轮询 getTask → awaiting_confirmation 渲候选 → 采纳落面板。
  dispatchPlanningThesis: (
    ctx: RequestContext,
    input: { projectId: string; topic?: string },
  ) => Promise<{ taskId: string }>;
  // [T-271] cover.generate 端口 —— dispatch 既有 cover.generate ai_task(void runCoverGenerate:结构化
  // 封面方案硬锚 brief/口播稿 → 文案诚实门 → 结构化组装生图 prompt → image.generate 生图),立即返回
  // taskId(不阻塞对话回合)。对话封面工具(cover.generate)据此触发,前端 ChatGenerateCard 轮询 getTask
  // → awaiting_confirmation 渲封面方案 + 封面图候选 → 采纳 confirmTask(既有 asset 采纳门绑进项目)。
  dispatchGenerateCover: (
    ctx: RequestContext,
    input: { projectId: string; topic?: string; referenceAssetId?: string },
  ) => Promise<{ taskId: string }>;
  // 抖音分享走 intelligence 持久父任务；普通建档与明确转写使用不同幂等指纹。
  dispatchDouyinShare: (
    ctx: RequestContext,
    input: { shareInput: string; transcribe: boolean },
  ) => Promise<{ taskId: string; ownerId: string }>;
  // [T-268] script.draft 端口 —— ensure 项目 output_script artifact + dispatch 既有异步 runner
  // runScriptDraft(复活孤儿:整稿分钟级不能 inline 阻塞对话回合),立即返回 taskId。对话整稿工具
  // (script.draft)据此触发,前端 ChatScriptDraftCard 轮询 getTask → awaiting_confirmation 渲整稿
  // 候选 → 采纳 confirmTask(artifact_version append 进 output_script → 稿面编辑器局部刷新读回)。
  dispatchScriptDraft: (
    ctx: RequestContext,
    input: { projectId: string; topic?: string; angle?: string; extraBrief?: string },
  ) => Promise<{ taskId: string }>;
  // [T-350a] publish.package 端口 —— ensure 内容产出挂点(outputId)+ 读整稿正文(空稿诚实门)
  // + dispatch 既有 publish.platform_adapt runner(单平台抖音,platform.adapt 模板已内嵌审核 SOP),
  // 立即返回 taskId。发布物料工具(publish.package)据此触发,前端候选卡轮询 → 采纳物化 Publication。
  dispatchPublishPackage: (
    ctx: RequestContext,
    input: { projectId: string; topic?: string },
  ) => Promise<{ taskId: string }>;
  // [T-385] project.transcribe 端口 —— 复用 T-374 projectsWithTranscribe 拦截链(解析该项目
  // platformRef 抖音锚 → ai.tasks.create 排单条 transcribe.douyin → live dispatch 后台跑;
  // 无锚 → ValidationError 人话拒)。对话工具 project.transcribe 据此触发(复盘无稿门的可执行动作)。
  dispatchProjectTranscribe: (
    ctx: RequestContext,
    input: { projectId: string },
  ) => Promise<{ taskId: string }>;
}

const globalForPersistence = globalThis as unknown as {
  __creatorosPersistence?: Promise<PersistenceBundle>;
};

async function buildPersistence(): Promise<PersistenceBundle> {
  // 本地优先存储 driver(L0,SPEC §4.1/§7-L0)—— 三态优先级,经 backend 的
  // createConfiguredDb 统一解析:
  //   1. DATABASE_URL    → 真 Postgres(node-postgres;用户当前 docker-PG + 71 作品走这条,不变)。
  //   2. PGLITE_DATA_DIR → file-backed PGlite 落盘(Postgres-WASM 持久化到本地目录)。
  //   3. 内存 PGlite     → 仅 测试/vitest;runtime 无任何配置则本地优先默认落盘(非内存,重启不丢)。
  // 三条都套同一份 drizzle 迁移(0000…),test/runtime schema 一致。dispose 当前进程不
  // 主动调(singleton 跟随进程生命周期),保留以备未来显式 teardown。
  const { db, driver, dispose } = await createConfiguredDb();
  // [T-365/T-362] 把库的优雅关闭(PGlite client.close() = flush WAL)挂到 global,供
  //   sidecar-lifecycle 在 SIGTERM/孤儿自检退出时调用 —— 防「进程死于写库中途 → WAL 半写
  //   → 下次启动判损坏」(2026-07-16 数据事故根因)。挂 global 是刻意的:instrumentation
  //   不能 import 本模块(会在启动钩子里触发整个 persistence 装配)。
  (globalThis as { __creatorosDisposePersistence?: () => Promise<void> }).__creatorosDisposePersistence =
    async () => { await dispose(); };

  // [T-363] 重置工作区(T-332 S5 Rust 整目录归档)后的首次启动:把 PRESERVE 清单表
  // (reset-preserve.ts 单一真值:users/sessions/模型配置/skill 定制/激活态…)从最新
  // `db.archived-<ts>` 归档库迁回刚建好的空库。位置刻意在**任何 seed 之前**(下方
  // seedCanonicalUser 是 onConflictDoNothing,迁回的 users 行优先)。语义:
  //   - 仅 file-pglite(桌面/本地落盘)路径;docker-PG 走 reset-db.ts 表级 PRESERVE,无归档;
  //   - 一次性(归档目录内 .preserve-restored.json 标记)+ 幂等(新库非空表跳过);
  //   - 失败诚实:只记日志不阻断启动,资产完整留在归档目录可手工找回(rename 不动字节)。
  if (driver.kind === "file-pglite" && driver.target) {
    try {
      const restoreReport = await restorePreservedUserAssets({
        dataDir: driver.target,
        db,
      });
      if (restoreReport) {
        console.warn(
          `[persistence][T-363] 重置归档迁回${restoreReport.ok ? "完成" : "部分失败(下次启动重试)"}:` +
            restoreReport.tables
              .map((t) => `${t.table}=${t.status}${t.rows ? `(${t.rows})` : ""}`)
              .join(", "),
        );
      }
    } catch (err) {
      // restorePreservedUserAssets 自身不 throw;此兜底只防未知装配错误拖垮启动。
      console.error("[persistence][T-363] 迁回流程异常(不阻断启动):", err);
    }
  }

  // [T-136 §D 切片 c] 抖音登录态**按号分目录**:`.auth/douyin/<accountId>`(每号独立
  //   persistent context / sessionid,互不顶号)。accountId 为 null(单号 / 未选号 / 存量)→
  //   确定回退目录 `_default`(兼容旧单号,不破)。base 走 env(CREATOROS_DOUYIN_AUTH_DIR)或
  //   默认项目内 `.auth/douyin`(cookie 只在本机、不入 Git)。douyinFetch 端口 + 采集器共用。
  const douyinAuthDirBase =
    process.env.CREATOROS_DOUYIN_AUTH_DIR ??
    nodePath.join(process.cwd(), ".auth", "douyin");
  const douyinAuthDirFor = (accountId?: string | null): string =>
    nodePath.join(douyinAuthDirBase, accountId ?? "_default");

  // [T-217a] Web Session Vault 登录态**按域名分目录**:`.auth/web/<domain>/`(每站独立持久
  //   profile,与 `.auth/douyin/<accountId>` 并列、与用户日常浏览器隔离)。base 走 env
  //   (CREATOROS_WEB_AUTH_DIR,lib.rs 注 appDataDir 顶层跨版本持久,复用 T-205 注入机制)或
  //   默认项目内 `.auth/web`(cookie 只在本机、不入 Git —— `.auth/` 已在 .gitignore)。per-user
  //   全局归属(ChatGPT/知乎登录与抖音号无关),不按 accountId 分。
  const webAuthDirBase =
    process.env.CREATOROS_WEB_AUTH_DIR ??
    nodePath.join(process.cwd(), ".auth", "web");
  // [B-01] domain → 目录路径的纵深防御(FS 边界二次校验,不信任任何上游):
  //   ① 白名单校验(assertSafeWebDomain 拒 `..`/分隔符/编码分隔符/绝对路径/非法字符);
  //   ② containment:path.resolve 后必须严格位于 webAuthDirBase 之内(path.relative 非空、
  //      不以 `..` 开头、非绝对)——挡任何绕过白名单的解析逃逸。任一不过 → 抛 WebDomainError。
  // symlink 逃逸复查(realpath,防御③)在真删除处(removeSession)做,详见下方。
  const webAuthDirFor = (domain: string): string => {
    const safe = assertSafeWebDomain(domain);
    const resolved = nodePath.resolve(webAuthDirBase, safe);
    const rel = nodePath.relative(webAuthDirBase, resolved);
    if (!rel || rel.startsWith("..") || nodePath.isAbsolute(rel)) {
      throw new WebDomainError(
        `域名解析越出登录态保管库根,已拒绝:${JSON.stringify(domain)}`,
      );
    }
    return resolved;
  };

  // Deterministic clock/ids keep the seeded dataset reproducible (visual/test
  // parity); new creates get collision-free ids distinct from the slug seeds.
  // `createSeq` lives at build scope (NOT per-request) so ids stay stable across
  // the many per-ctx repos the factory mints below.
  // Real persistent DB: the deterministic counter RESETS each process but rows
  // PERSIST, so generated ids + timestamps must be PROCESS-UNIQUE — otherwise runtime
  // creates (register user / login session / new project / activity…) collide on PK
  // across restarts (the `duplicate key … _pkey` bug). Seeds use explicit slug ids +
  // fixture timestamps, so seed idempotency is unaffected. L0:**file-backed PGlite
  // 也持久**(落盘),所以它和 postgres 同样要 process-unique ids;只有 内存 PGlite
  // (测试/vitest)保留确定性 `p` base + FIXED_NOW 以复现。
  const persistent = driver.kind !== "memory-pglite";
  const idBase = persistent ? globalThis.crypto.randomUUID().slice(0, 8) : "p";
  let createSeq = 0;
  const deps = {
    now: persistent ? () => new Date().toISOString() : () => FIXED_NOW_ISO,
    nextId: (prefix: string) => `${prefix}-${idBase}-${++createSeq}`,
  };

  // T-147 P2 本地加密 —— 解析 master key(桌面 keychain via env `CREATOROS_MASTER_KEY`
  // 由 Rust keyring 注入 / web-dev 降级)。[T-370a] 前移到此(原在 settings 装配处):
  // browser_sessions(web 登录态密文)与 settings(模型 key)共用同一把 key/同一 crypto。
  const { key: masterKey, degraded: masterKeyDegraded } = resolveMasterKey(
    process.env,
  );
  if (masterKeyDegraded) {
    console.warn(
      "[persistence] 模型密钥本地加密使用降级 master key(未取到 keychain key)。" +
        "桌面端应由 Tauri keyring 注入 CREATOROS_MASTER_KEY;此降级安全性弱于 keychain。",
    );
  }

  // [T-370a] 浏览器登录态系统化:web 域 storageState 加密单一真值(host 内部 service,
  // 无契约 op —— web-session 保管库 / browser-pool 经端口闭包用它,不暴露 API)。
  // gate F-3:service 内 master-key 不可用/加密失败 → 抛人话错拒存,绝不明文落库。
  const browserSessionsService: BrowserSessionsService =
    createBrowserSessionsService({ db, now: deps.now, nextId: deps.nextId, masterKey });
  const getWebSessionState = async (
    ctx: RequestContext,
    domain: string,
  ): Promise<string | null> => {
    const lookup = webSessionLookupDomains(domain);
    for (const key of lookup) {
      const state = await browserSessionsService.getState(ctx, key);
      if (!state) continue;
      if (key !== lookup[0]) {
        // T-488 存量惰性迁移：旧版可能把短链 state 存到 v.douyin.com。
        // 先成功读密文再复制到 canonical key；旧记录保留，避免破坏性清理。
        await browserSessionsService
          .saveState(ctx, lookup[0]!, state)
          .catch(() => {});
      }
      return state;
    }
    return null;
  };

  // ── T-038b 抖音采集限流网关(单例接线,SPEC §4.1/§4.4)────────────────────────────
  // 一个 module 单例 DouyinRequestGateway(per-channel 串行 + 最小间隔 + jitter + 指数退避 +
  // [gate-F3] readyPromise barrier 从 douyin_throttle_state 恢复 cooldown)。所有对外抖音请求
  // 的插装点(collectors + runTranscribe 的 fetchDouyin*)经它 acquire/report。**注真 PGlite
  // store(与 scheduled_job / job_run 同一个 db 句柄)做持久层**([gate-F2])。gateway 经 DI
  // 注入 douyin-cdp 调用点(下方 host 绑定),douyin-cdp 内部不硬 import 单例(否则单测真等 9s)。
  // 具体类(非窄接口 DouyinChannelGate)—— 下游注入点仍只吃窄接口(acquire/report),但
  // T-038c 可观测要读它的 getChannelStatus,故此处持具体类型。
  const douyinGateway: DouyinRequestGateway = new DouyinRequestGateway({
    config: resolveDouyinThrottleConfig(),
    port: createPgliteThrottleStatePort(db),
    now: () => Date.now(),
    // 真 sleep(setTimeout);gateway 用它落 cooldown/间隔等待(测试侧另注假 sleep,此处 runtime 真等)。
    sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  });

  // T-038c 采集限流可观测读端口:绑到 gateway 单例的 getChannelStatus(读内存镜像,同步)。
  // 遍历两个 channel 组装 contract 的 throttle-status 快照,供 ingestion.douyin.throttleStatus
  // 只读 op 返给自动化。纯读、无副作用、不落表。
  const DOUYIN_CHANNELS: DouyinChannel[] = ["creator-center", "iesdouyin"];
  const readDouyinThrottleStatus = () => ({
    channels: DOUYIN_CHANNELS.map((channel) => {
      const s = douyinGateway.getChannelStatus(channel);
      return {
        channel,
        cooldownActive: s.cooldownActive,
        cooldownEtaMs: s.cooldownEtaMs,
        consecutiveThrottles: s.consecutiveThrottles,
        lastRequestAt: s.lastRequestAt,
      };
    }),
  });

  // [gate-F5] 采集 job/进程级串行闸(与 gateway 的请求级节奏正交):一条 module 级 promise 链,
  // concurrency=1 —— 同时只跑一个采集 job,防两个 Chromium 各打一 channel 并存(gateway 每 channel
  // 并发=1 拦不住 job-A 抓 creator-center + job-B 抓 iesdouyin 两进程并存)。轻量:一条 promise
  // 链尾串行,无需 p-queue。fire-and-forget 的 dispatch 把 runScheduledCollection 挂到链尾。
  let collectionRunTail: Promise<void> = Promise.resolve();
  const enqueueCollectionRun = (run: () => Promise<void>): Promise<void> => {
    // 串到链尾:上一个采集跑完(无论成败)才开始本次;链尾用 catch 吞错防一次失败堵死后续。
    collectionRunTail = collectionRunTail.then(
      () => run(),
      () => run(),
    );
    // 兜底:链尾自身的 reject 不外溢(fire-and-forget;每个 run 内部已 try/catch 落终态)。
    collectionRunTail = collectionRunTail.catch(() => {});
    return collectionRunTail;
  };

  // Projects (module 05): one user-scoped repository over the shared db (every
  // query filters eq(userId, ctx.userId) / ownership-checks via the parent). The
  // transport mints a per-ctx service so the §12 state machines run under the
  // caller; the repo is shared (it takes ctx per-call, not at construction).
  const projectsRepo = createProjectRepository(db);
  // §15/§16 内容门禁的只读数据源 holder。projectsService 先于它依赖的 peer service
  // (artifacts / production / publishing / reviews)在本文件下方创建,所以 gate 的
  // reader 用一个可变 holder 后置绑定:此处先传空 holder 构造 service,等所有 peer
  // service 建好后再填 stageGateReadersRef.current(见本文件末尾的「gate readers
  // 后置绑定」)。绑定前 gate 所有项「无数据源」→ 诚实跳过 → gate 恒过(不破坏任何
  // 在 service 构造后、绑定前发生的调用)。
  const stageGateReadersRef: StageGateReadersRef = { current: null };
  // A stable service handle (deterministic deps) reused both by the per-ctx
  // transport factory AND by the Production module's completeExport fan-out
  // (setPrimaryOutputAsset → patchOutput, which also appends the activity). The
  // service is stateless per call (it takes ctx per method), so one instance is
  // safe across requests.
  const projectsService = createProjectsService(
    projectsRepo,
    deps,
    stageGateReadersRef,
  );
  const projectsBaseTransport = createProjectsTransport(() => ({
    service: projectsService,
    repo: projectsRepo,
  }));
  // [全局搜索修复①] 项目写路径的搜索索引 fan-out(composition root 组合,projects 模块
  // 不反向依赖 search)。projects 是四大实体里唯一漏接搜索索引的 —— createProject/
  // patchProject 全程不碰 search_documents,导致「搜项目标题恒 0」。这里在 create/patch
  // 成功后**同步 await** 投影一条 entity_type='project' 的 search_document(载荷 stage/
  // progressPct/snippet 与读侧 toProjectCard 对齐);delete 走 removeDocument。同步(非
  // fire-and-forget)消除「建完即搜」竞态。索引 best-effort:失败只丢检索增益,业务真值
  // 已提交不回滚(SPEC §16 派生索引纪律),故 try/catch 吞掉。
  const indexProjectBestEffort = async (
    ctx: RequestContext,
    data: {
      id?: string;
      title?: string;
      currentStage?: string;
      progressPct?: number;
      brief?: string;
    },
  ): Promise<void> => {
    if (!data.id) return;
    try {
      const title = data.title ?? "";
      const snippet = data.brief ?? "";
      await searchService.upsertDocument(ctx, {
        entityType: "project",
        entityId: data.id,
        title,
        body: JSON.stringify({
          stage: data.currentStage ?? "",
          progressPct: data.progressPct ?? 0,
          snippet,
        }),
        searchText: `${title}\n${snippet}`.toLowerCase().trim(),
      });
    } catch (err) {
      console.warn("[project-index] 索引失败(业务真值不受影响):", err);
    }
  };
  const projects: Transport = {
    async request(endpoint, input, ctx) {
      const result = await projectsBaseTransport.request(endpoint, input, ctx);
      if (ctx) {
        if (
          endpoint.id === "projects.create" ||
          endpoint.id === "projects.patch"
        ) {
          const data = (result as { data?: unknown }).data as
            | {
                id?: string;
                title?: string;
                currentStage?: string;
                progressPct?: number;
                brief?: string;
              }
            | undefined;
          if (data) await indexProjectBestEffort(ctx, data);
        } else if (endpoint.id === "projects.delete") {
          const data = (result as { data?: unknown }).data as
            | { id?: string }
            | undefined;
          if (data?.id) {
            try {
              await searchService.removeDocument(ctx, "project", data.id);
            } catch (err) {
              console.warn("[project-index] 删除索引失败:", err);
            }
          }
        }
      }
      return result;
    },
  };

  // Taxonomy (module 04): one repository over the shared db; its transport mints
  // a per-ctx service so every tag/entity_tag query is scoped to `ctx.userId`.
  // Ids/clock share the deterministic `deps` (createSeq above keeps tag ids
  // collision-free across requests).
  const taxonomyRepo = createTaxonomyRepository(db, deps);
  const taxonomy = createTaxonomyTransport(() =>
    createTaxonomyService(taxonomyRepo),
  );

  // Notifications (module 01): one repository over the shared db; its transport
  // mints a per-ctx service so every list/read is scoped to `ctx.userId`. The
  // clock comes from the deterministic `deps` (FIXED_NOW) so a markRead stamps a
  // reproducible readAt (visual/test parity).
  const notificationsRepo = createNotificationRepository(db);
  const notifications = createNotificationsTransport(() =>
    createNotificationsService(notificationsRepo, deps),
  );

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
        accountId: requireAccountId(ctx.accountId, "search.repo"),
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
  // [T-093] 知识写路径的搜索索引 fan-out(composition root 组合,knowledge 模块不反向
  // 依赖 search):create / revisions.create 成功后 best-effort 重建该条的 search_document
  // (含可配 embedding;失败绝不回滚业务真值——SPEC §16 派生索引纪律)。
  // `indexKnowledgeDocumentBestEffort` 定义在下方 settingsService/resolveModelSpec 之后,
  // 此回调在请求期才执行,闭包引用无 TDZ 问题(与 llmCompleter 同款)。
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

  // Assets (module 07): one user-scoped repository over the shared db (the repo
  // takes ctx per-call, not at construction). The service is the SOLE
  // object-storage caller (SPEC §15) — it gets the MockObjectStorage swap-seam
  // adapter (foundation §4; in-memory, deterministic keys). The transport mints a
  // per-ctx service so every list/get/upload/file/trash/restore is scoped to
  // `ctx.userId`; children inherit ownership via the parent asset's gate.
  // Clock/ids share the deterministic `deps`; the mock's nextKey reuses createSeq
  // so storage keys stay collision-free across requests.
  const assetsRepo = createAssetRepository(db, deps);
  // item B — per-ctx object-storage factory (硬决策 2). AssetsService no longer
  // holds a singleton adapter: each storage-touching method resolves the adapter
  // for the REQUEST's ctx. The choice reads that user's storage_config (via the
  // SettingsService, built below — the factory runs at request time so closing
  // over the later `settingsService` const is TDZ-safe, same as `llmCompleter`):
  //
  //   backend='s3' AND S3_* env present → createS3ObjectStorage (bytes land in the
  //     bucket via presigned PUT/GET),
  //   else → createLocalFsObjectStorage at resolveStorageRoot(ctx) (bytes land on
  //     local disk under the user's configured media root; the FE PUTs to the
  //     token-gated /api/v1/blob route).
  //
  // When no SettingsService is wired yet (defensive) OR neither backend resolves,
  // fall back to the deterministic in-memory mock (vitest / no-storage env).
  const nextKey = () => `uploads/${deps.nextId("objkey")}`;
  const s3Bucket = process.env.S3_BUCKET;
  const s3Cfg = s3Bucket
    ? {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION ?? "us-east-1",
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
        bucket: s3Bucket,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      }
    : null;
  if (s3Cfg) await ensureBucket(s3Cfg);
  // The in-memory mock (no real backend) — pinned once for the vitest / no-storage
  // path so storage keys stay collision-free.
  const mockStorage = createMockObjectStorage({ nextKey });
  // Whether local-fs is usable at all: in vitest we keep the deterministic mock
  // (no real disk writes / blob route). The runtime (Next server) opts in via
  // CREATOROS_STORAGE=local or simply by NOT being a test env.
  const localFsEnabled =
    process.env.CREATOROS_STORAGE === "local" ||
    (process.env.NODE_ENV !== "test" && !process.env.VITEST);

  const objectStorageForCtx: ObjectStorageForCtx = async (ctx) => {
    // Defensive: before settingsService exists, or for the mock path.
    const svc = settingsService as SettingsService | undefined;
    if (!svc) return mockStorage;
    const backend = await svc.resolveStorageBackend(ctx);
    if (backend === "s3" && s3Cfg) {
      return createS3ObjectStorage(s3Cfg, { nextKey });
    }
    if (localFsEnabled) {
      const rootPath = await svc.resolveStorageRoot(ctx);
      return createLocalFsObjectStorage(
        { rootPath, publicBaseUrl: "/api/v1/blob" },
        { nextKey },
      );
    }
    return mockStorage;
  };

  // [T-055d SPEC §7.1] 项目目录名:projects/<safe-title>-<id 后 6 位>。safe-title = 去
  // 文件系统非法字符 + 截 24 字;目录名以创建时标题为准(改名不追改,storageKey 即映射)。
  // getProject 走 projects public service(含归属校验;未知/越权 → null 落 inbox)。
  const safeProjectDirTitle = (title: string): string => {
    const cleaned = title
      .replace(/[\/\\:*?"<>|\x00-\x1f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 24)
      .trim();
    return cleaned || "untitled";
  };
  const resolveProjectFolder = async (
    ctx: RequestContext,
    projectId: string,
  ): Promise<string | null> => {
    try {
      const project = await projectsRepo.get(ctx, projectId);
      const suffix = projectId.slice(-6);
      return `projects/${safeProjectDirTitle(project.title)}-${suffix}`;
    } catch {
      return null;
    }
  };
  const assetsService = createAssetsService(assetsRepo, objectStorageForCtx, {
    ...deps,
    resolveProjectFolder,
  });
  // [T-055d SPEC §7.2] Finder/下载 route 的最小运行时面:assetId → 归属校验 + 当前
  // file 的 storageKey(相对 media root);projectId → 项目目录相对路径。
  const localFileRuntime = {
    assetStorageKey: async (
      ctx: RequestContext,
      assetId: string,
    ): Promise<string | null> => {
      const asset = await assetsService.getAsset(ctx, assetId); // OwnershipError → 上抛
      // [T-332 S2] asset_files 经父 asset 号门透传:未选号 → AccountRequiredError。
      const files = await assetsRepo.listAssetFiles(
        ctx.userId,
        assetId,
        requireAccountId(ctx.accountId, "assets.listAssetFiles"),
      );
      const current =
        files.find((f) => f.id === (asset as { currentFileId?: string | null }).currentFileId) ??
        files[files.length - 1] ??
        null;
      return current?.storageKey ?? null;
    },
    projectFolder: resolveProjectFolder,
  };
  // [T-217a] Web Session Vault runtime —— per-machine 全局(非 user-scoped),文件系统 + sidecar
  //   浏览器能力:list/remove 是 `.auth/web/` 目录读写(不起浏览器);login 有头弹窗、status
  //   headless 探针(泛化 douyin-cdp 登录/探针)。`/api/web-session` route 据此提供管理面板。
  // [T-221] 待确认登录窗口注册表(按域名):loginSession 开窗后把 handle 存这里(跨 HTTP 请求持有,
  //   webSessionRuntime 是 getBundle 单例,存活整进程),confirmSession/cancelSession 据域名取回关窗。
  //   兜底:15min 未确认自动 cancel(防用户关标签页后遗留独立 Chromium 进程)。
  const pendingWebLogins = new Map<
    string,
    { handle: WebLoginHandle; timer: ReturnType<typeof setTimeout> }
  >();
  const disposePendingLogin = (domain: string): WebLoginHandle | null => {
    const entry = pendingWebLogins.get(domain);
    if (!entry) return null;
    clearTimeout(entry.timer);
    pendingWebLogins.delete(domain);
    return entry.handle;
  };
  const webSessionRuntime = {
    listSessions: async (
      ctx: RequestContext,
    ): Promise<Array<{ domain: string; lastLoginAt: string | null }>> => {
      const { readdir, stat, rm } = await import("node:fs/promises");
      // [T-370a] DB 加密记录是单一真值(惰性迁移会归档旧目录 → 只看目录会漏)∪ 旧 profile
      //   目录(未迁移存量仍可见)。同域取 DB updatedAt 优先。
      const byDomain = new Map<string, string | null>();
      const dbRows = await browserSessionsService.listDomains(ctx).catch(() => []);
      // [T-378] DB 侧同样过滤脏行(增殖 bug 曾把 `x.migrated-<ts>` 当域名写进 browser_sessions;
      //   迁移 0048 删存量,这里兜底防旧库/慢迁移把归档名再列给设置页 → 再触发探针增殖)。
      for (const r of dbRows) {
        if (!isSafeWebDomain(r.domain)) continue;
        const canonical = webSessionLookupDomains(r.domain)[0]!;
        const previous = byDomain.get(canonical);
        if (!previous || r.updatedAt > previous) {
          byDomain.set(canonical, r.updatedAt);
        }
      }
      let entries: string[] = [];
      try {
        entries = await readdir(webAuthDirBase);
      } catch {
        entries = []; // 目录不存在(还没登录过任何站)→ 只看 DB(诚实,不报错)
      }
      for (const domain of entries) {
        if (domain.startsWith(".")) continue; // 跳过隐藏项(.DS_Store 等)
        // [T-378] 嵌套归档目录(`x.migrated-a.migrated-b` = 增殖 bug 产物,归档的归档无价值)
        //   顺手 best-effort 删;一层归档(`x.migrated-a`)保留 —— 可能还有未迁移的登录态。
        //   entry 是 readdir basename(无路径分隔符),join 不会越出 base。
        if (isNestedArchivedWebProfileName(domain)) {
          void rm(nodePath.join(webAuthDirBase, domain), {
            recursive: true,
            force: true,
          }).catch(() => {});
          continue;
        }
        // [B-01] 白名单预检:磁盘上不合规的遗留目录名(旧版本产物/用户手放/归档后缀)跳过,
        //   不让 webAuthDirFor 的硬校验抛错炸穿整个列表(列表是读操作,宜宽容)。
        if (!isSafeWebDomain(domain)) continue;
        if (byDomain.has(domain)) continue; // DB 已有 → 以 DB 为准
        const dir = webAuthDirFor(domain);
        try {
          const s = await stat(dir);
          if (!s.isDirectory()) continue;
          byDomain.set(domain, s.mtime.toISOString()); // profile 目录 mtime ≈ 上次登录/使用时间
        } catch {
          continue;
        }
      }
      return [...byDomain.entries()]
        .map(([domain, lastLoginAt]) => ({ domain, lastLoginAt }))
        .sort((a, b) => (b.lastLoginAt ?? "").localeCompare(a.lastLoginAt ?? ""));
    },
    // [T-221] 开窗即返(不阻塞、不赌 cookie 自动关):弹独立 Chromium 让用户自己登,返回 pending;
    //   登好由用户在 vault 卡点「我登好了」→ confirmSession 才关窗持久化。重复登同一域先关旧窗。
    // [T-370a] saveState 端口在开窗时绑 ctx —— confirm 关窗前 storageState 回写 DB(单一真值)。
    loginSession: async (
      ctx: RequestContext,
      url: string,
    ): Promise<{ domain: string; pending: boolean }> => {
      const domain = webDomainFromUrl(url); // 非法 URL → 抛,route 转 400
      const stale = disposePendingLogin(domain);
      if (stale) await stale.cancel().catch(() => {}); // 同域重复开窗:先关上一次遗留窗
      const handle = await openWebLoginWindow(
        {
          authDir: webAuthDirFor(domain),
          url,
          domain,
        },
        {
          saveState: (d, stateJson) =>
            browserSessionsService.saveState(ctx, d, stateJson),
        },
      );
      const timer = setTimeout(
        () => {
          const h = disposePendingLogin(domain);
          void h?.cancel().catch(() => {});
        },
        15 * 60 * 1000,
      );
      pendingWebLogins.set(domain, { handle, timer });
      return { domain, pending: true };
    },
    // [T-221] 用户显式「我登好了」:取回该域待确认 handle → confirm(关窗 + 持久化 profile)→ 认可成功。
    //   无待确认窗(过期/已确认)→ 诚实回 loggedIn=false(不假装成功)。
    confirmSession: async (
      domain: string,
    ): Promise<{ domain: string; loggedIn: boolean }> => {
      const raw = domain.trim().toLowerCase().replace(/^www\./, "");
      const d = isSafeWebDomain(raw)
        ? webSessionLookupDomains(raw)[0]!
        : raw;
      const handle = disposePendingLogin(d);
      if (!handle) return { domain: d, loggedIn: false };
      const { loggedIn } = await handle.confirm();
      return { domain: d, loggedIn };
    },
    // [T-221] 用户「取消」:取回并关窗,不留登录承诺。无待确认窗 → 幂等回 cancelled=true。
    cancelSession: async (
      domain: string,
    ): Promise<{ domain: string; cancelled: boolean }> => {
      const raw = domain.trim().toLowerCase().replace(/^www\./, "");
      const d = isSafeWebDomain(raw)
        ? webSessionLookupDomains(raw)[0]!
        : raw;
      const handle = disposePendingLogin(d);
      if (handle) await handle.cancel().catch(() => {});
      return { domain: d, cancelled: true };
    },
    sessionStatus: async (
      ctx: RequestContext,
      domain: string,
    ): Promise<{ domain: string; loggedIn: boolean }> => {
      const raw = domain.trim().toLowerCase().replace(/^www\./, "");
      // [T-378] 归档目录名(`x.migrated-<ts>`)被当域名探针 → 直接返未登录,绝不起浏览器/
      //   触发迁移(增殖链的探针侧闸门;route 入口 400 兜一层,这里防别的调用方绕过 route)。
      //   其余非法域名(路径穿越等)仍走下方 webAuthDirFor 白名单硬拒抛 WebDomainError(B-01)。
      if (isArchivedWebProfileName(raw)) {
        return { domain: raw, loggedIn: false };
      }
      webAuthDirFor(raw); // 保留 B-01 的 WebDomainError 分类与路径穿越闸门。
      const d = webSessionLookupDomains(raw)[0]!;
      // [T-370a] DB state 注入回灌探针(§2.5)+ 存量惰性迁移(旧目录导入 DB 后归档)。
      const { loggedIn } = await checkWebSessionStatus(
        {
          authDir: webAuthDirFor(d),
          domain: d,
        },
        {
          getState: (dom) => getWebSessionState(ctx, dom),
          saveState: (dom, stateJson) =>
            browserSessionsService.saveState(ctx, dom, stateJson),
        },
      );
      return { domain: d, loggedIn };
    },
    removeSession: async (
      ctx: RequestContext,
      domain: string,
    ): Promise<{ removed: boolean }> => {
      const raw = domain.trim().toLowerCase().replace(/^www\./, "");
      // 防御①②:非法/越界 domain → webAuthDirFor 抛,绝不触碰文件系统。
      let d: string;
      let target: string;
      try {
        webAuthDirFor(raw);
        d = webSessionLookupDomains(raw)[0]!;
        target = webAuthDirFor(d);
      } catch (err) {
        console.warn(
          "[web-session] removeSession 拒绝非法 domain(路径穿越防线):",
          err instanceof Error ? err.message : String(err),
        );
        return { removed: false };
      }
      // [T-370a] DB 加密记录一并删(登出必须清单一真值,否则删目录后池注入仍复活登录态)。
      const dbRemoved = await browserSessionsService
        .removeState(ctx, d)
        .catch(() => false);
      const { rm, realpath } = await import("node:fs/promises");
      try {
        // 防御③:真删除前 realpath 复查——目标的**真实路径**(解开 symlink)必须仍严格位于
        //   base 的真实路径之内。挡「.auth/web/<domain> 是指向上级的软链」这类逃逸。
        const baseReal = await realpath(webAuthDirBase);
        let targetReal: string;
        try {
          targetReal = await realpath(target);
        } catch {
          // 目录不存在(已惰性迁移归档/从未登录)→ 无目录可删;DB 删过即算移除成功。
          return { removed: dbRemoved };
        }
        const rel = nodePath.relative(baseReal, targetReal);
        if (!rel || rel.startsWith("..") || nodePath.isAbsolute(rel)) {
          console.warn(
            "[web-session] removeSession 拒绝:真实路径越出保管库根(疑似 symlink 逃逸):",
            targetReal,
          );
          return { removed: dbRemoved };
        }
        await rm(targetReal, { recursive: true, force: true });
        return { removed: true };
      } catch {
        return { removed: dbRemoved };
      }
    },
  };

  // ── [T-370b] web 域读取 profile 池(SPEC §2.3/§3.2)────────────────────────────────
  // `.auth/pool/p1..pN`(N=env CREATOROS_BROWSER_POOL_SIZE 默认 5;目录与 `.auth/web` 同级,
  // 桌面端随 CREATOROS_WEB_AUTH_DIR 落 appDataDir)。启动走 T-369 chromium-guard 的
  // guardedLaunch(**guard 零语义改动,只调用**,gate F-4)+ T-307 统一浏览器选择
  // (channel:"chrome" → 回落打包 chromium),参数对齐 web-reader.realOpenReaderContext。
  // 红线:抖音不进池(douyin-cdp 零改动,§2.1)。
  const browserPoolDir =
    process.env.CREATOROS_BROWSER_POOL_DIR ??
    nodePath.join(nodePath.dirname(webAuthDirBase), "pool");
  const launchPoolMember = async (
    memberDir: string,
  ): Promise<PoolCapableContext> => {
    const { chromium } = await import("@playwright/test");
    const { mkdir } = await import("node:fs/promises");
    const { guardedLaunch, chromiumSandboxOpts } = await import(
      "@/server/ingestion/chromium-guard"
    );
    const { launchWithBrowser } = await import("@/server/ingestion/douyin-cdp");
    await mkdir(memberDir, { recursive: true }).catch(() => {});
    const ctx = await guardedLaunch(
      memberDir,
      () =>
        launchWithBrowser((sel) =>
          chromium.launchPersistentContext(memberDir, {
            headless: true,
            ...sel,
            ...chromiumSandboxOpts(), // [T-369] 去掉 Playwright 默认 --no-sandbox
            viewport: { width: 1440, height: 900 },
            args: ["--disable-blink-features=AutomationControlled"],
          }),
        ),
      { label: "网页读取浏览器" },
    );
    return ctx as unknown as PoolCapableContext;
  };
  const browserPool: BrowserPool = createBrowserPool({
    poolDir: browserPoolDir,
    launch: launchPoolMember,
  });

  // [T-370b] 读取路径统一入口:pool.checkout(domain)(域亲和 sticky + DB state 注入),
  // 适配成 web-reader 的 ReaderCapableContext(close = handle.release:storageState 回写 DB
  // → clearCookies → 归还唤醒)。checkout 前若 DB 无该域记录,先走存量惰性迁移(§3.3,
  // 旧 `.auth/web/<domain>` 导入 DB 后归档;失败诚实 → 干净 context 撞登录墙要求重登)。
  const openPooledReaderContext = async (
    ctx: RequestContext,
    domain: string,
  ): Promise<{
    pages: () => never[];
    newPage: () => Promise<never>;
    close: () => Promise<void>;
  }> => {
    const session = {
      getState: (d: string) => getWebSessionState(ctx, d),
      saveState: (d: string, stateJson: string) =>
        browserSessionsService.saveState(ctx, d, stateJson),
    };
    const existing = await session.getState(domain).catch(() => null);
    if (!existing) {
      try {
        await importLegacyProfileState(
          { authDir: webAuthDirFor(domain), domain },
          session,
        );
      } catch (err) {
        // 迁移 best-effort:失败不阻断读取(干净 context 会诚实撞登录墙 → 引导重登)。
        console.warn(
          `[browser-pool] ${domain} 存量登录态迁移失败(继续无状态读取):`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    const handle = await browserPool.checkout(domain, session);
    const poolCtx = handle.context as unknown as {
      pages(): never[];
      newPage(): Promise<never>;
    };
    return {
      pages: () => poolCtx.pages(),
      newPage: () => poolCtx.newPage(),
      close: () => handle.release(),
    };
  };
  const assets = createAssetsTransport(() => assetsService);

  // Artifacts (module 08): the service builds a per-ctx user-scoped repo over the
  // shared db (the repo bakes userId in; the service mints one per request). The
  // transport returns this ONE shared service. createVersion post-commit re-indexes
  // via the Search service (best-effort, never rolls back); evidence-target
  // ownership is validated through the Knowledge/Assets public services
  // (getKnowledge/getAsset throw OwnershipError) — no cross-module repo import.
  // Clock/ids share the deterministic `deps` (createSeq keeps artifact/version ids
  // collision-free across requests).
  const artifactsService = createArtifactsService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    searchUpsert: (ctx, input) => searchService.upsertDocument(ctx, input),
    assertKnowledgeOwned: (ctx, id) => knowledgeService.getKnowledge(ctx, id),
    assertAssetOwned: (ctx, id) => assetsService.getAsset(ctx, id),
    // [T-183] 改稿 delta → 品味信号 best-effort seam。Lazy 箭头:`learningsService` 在下方
    // 构造(request 时才求值,TDZ-safe,同 calibration/AI confirm thunk 范式)。用户手改
    // AI 产出的脚本 → 一条 edit_delta candidate learning 进裁决台。
    recordEditDelta: (ctx, input) =>
      learningsService.captureEditDelta(ctx, input),
  });
  const artifacts = createArtifactsTransport(() => artifactsService);

  // Production (module 09): the service builds a per-ctx user-scoped repo over the
  // shared db (the repo bakes userId in; the service mints one per request). The
  // transport returns this ONE shared service. completeExport's cross-module
  // fan-out reaches peers ONLY through their public services (no repo import):
  //   - setPrimaryOutputAsset → projectsService.patchOutput (drives ContentOutput
  //     active→ready primary-asset link AND appends the output activity),
  //   - searchIndexAsset → searchService.upsertDocument (best-effort post-commit).
  // Clock/ids share the deterministic `deps` (createSeq keeps production/segment/
  // export ids collision-free across requests).
  const productionService = createProductionService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    setPrimaryOutputAsset: (ctx, input) =>
      projectsService.patchOutput(ctx, input.outputId, {
        primaryAssetId: input.assetId,
      }),
    searchIndexAsset: (ctx, input) => searchService.upsertDocument(ctx, input),
    // [T-366b] 素材包统一导出接线 —— 全部经各模块公开 service(无跨模块 repo):
    //   素材枚举 materialLinksService.list / 素材名+字节 assetsService / 口播稿
    //   makeReviewSubjectReader().getScript(与复盘同一读法)/ 四决策 aiService
    //   listTasks+listResults(video.decisions 最近候选)/ zip 落 asset
    //   createGeneratedAsset(服务端直写,P-04 本地不出网)/ 下载 getDownloadUrl。
    //   下方各 const(materialLinksService/aiService/makeReviewSubjectReader)在
    //   request 时才求值(lazy 箭头,TDZ-safe,同 learningsService thunk 范式)。
    materialExport: {
      resolveProjectIdByOutput: (ctx, outputId) =>
        projectsService.getProjectIdByOutput(ctx, outputId),
      storeZipAsset: async (ctx, input) => {
        const asset = await assetsService.createGeneratedAsset(ctx, {
          assetType: "document",
          name: input.name,
          bytes: input.bytes,
          mimeType: "application/zip",
        });
        return { assetId: asset.id };
      },
      getDownloadUrl: (ctx, assetId) =>
        assetsService.getDownloadUrl(ctx, assetId),
      ports: {
        // 项目关联素材全量(VP-04 不挑不减):materialLinks entityType=asset。
        listMaterialAssets: async (ctx, projectId) => {
          const { rows } = await materialLinksService.list(ctx, {
            projectId,
            page: 1,
            pageSize: 100,
          });
          return rows
            .filter((l) => l.entityType === "asset")
            .map((l) => ({ assetId: l.entityId, role: l.role }));
        },
        getAssetName: async (ctx, assetId) => {
          try {
            const a = await assetsService.getAsset(ctx, assetId);
            return a.name ?? assetId;
          } catch {
            return null; // 越权/已删 → 聚合层进 missing 诚实列出
          }
        },
        getAssetBytes: async (ctx, assetId) => {
          try {
            const blob = await assetsService.getAssetBytes(ctx, assetId);
            return blob ? { bytes: blob.bytes } : null;
          } catch {
            return null;
          }
        },
        // 口播稿:与复盘 reader 同一读法(output_script 当前版本,transcript 优先)。
        getScriptText: (ctx, projectId) =>
          makeReviewSubjectReader().getScript(ctx, projectId),
        // 最近一次 video.decisions 候选产物(newest-first;failed/cancelled 跳过)。
        // 没跑过/读不到 → null(readme 按 §5.1② 空态诚实)。
        getVideoDecisions: async (ctx, projectId) => {
          try {
            const { rows } = await aiService.listTasks(ctx, {
              limit: 10,
              offset: 0,
              projectId,
              taskType: "video.decisions",
            });
            for (const task of rows) {
              if (task.status === "failed" || task.status === "cancelled") {
                continue;
              }
              const results = await aiService.listResults(ctx, task.id);
              const hit = [...results]
                .reverse()
                .find((r) => r.resultType === "video_decisions");
              const data = hit?.resultData as
                | { decisions?: unknown }
                | undefined;
              if (data?.decisions) return data.decisions;
            }
            return null;
          } catch {
            return null;
          }
        },
        getProjectTitle: async (ctx, projectId) => {
          try {
            const row = await projectsRepo.get(ctx, projectId);
            return row.title ?? "";
          } catch {
            return "";
          }
        },
      },
    },
  });
  const production = createProductionTransport(() => productionService);

  // Publishing (module 10): the service builds a per-ctx user-scoped repo over the
  // shared db (the repo bakes userId in; the service mints one per request). The
  // transport returns this ONE shared service. The platform publish/remove
  // side-effect goes through the MockPublisher swap-seam (foundation §4; SPEC §15:
  // Publishing never calls a platform SDK / S3 directly) — deterministic external
  // id for idempotency. The transition fan-out reaches peers ONLY through their
  // public services (no repo import):
  //   - searchIndex → searchService.upsertDocument (best-effort post-commit),
  //   - assertCoverOwned → assetsService.getAsset (cover validation, SPEC §15).
  // The ContentOutput active→published rollup / notify / activity seams are
  // optional and left unwired this wave (best-effort, SPEC §11) — the realized
  // Production module likewise wired only the seams with a concrete peer method.
  // Clock/ids share the deterministic `deps` (createSeq keeps pub/rev ids
  // collision-free across requests).
  const publishingService = createPublishingService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    publisher: createMockPublisher(),
    // [全局搜索修复③] video/publication tab 对齐:publishing.service 发布时投影
    // entity_type='publication',但读侧 search.transport 的 video tab 查的是
    // entity_type='video'(启动 seed 亦投影成 video)→ 已发布作品在 video tab 恒搜不到。
    // 只在 wiring 层把 'publication' 归一为 'video'(不动 publishing.service 业务代码),
    // 与读侧 TAB_DEFS + 启动重建三处一致。
    searchIndex: (ctx, input) =>
      searchService.upsertDocument(ctx, {
        ...input,
        entityType: input.entityType === "publication" ? "video" : input.entityType,
      }),
    assertCoverOwned: (ctx, id) => assetsService.getAsset(ctx, id),
    // Project→ContentOutput-ids resolver — drives Analytics' project metric read
    // (publishing.listPublicationIdsByProject → analytics.projects.get) without an
    // Analytics cross-module join. The project-ownership gate lives in Projects.
    listOutputIdsByProject: (ctx, projectId) =>
      projectsService.listOutputIdsByProject(ctx, projectId),
    // [T-321 治本] 登记已发布 → 属主项目跃迁到已发布态(getProjectIdByOutput + markPublished,
    //   经公共 service,不跨模块直连 repo)。best-effort:失败在 service 内被吞,不阻断登记。
    markOwnerProjectPublished: async (ctx, outputId) => {
      const projectId = await projectsService.getProjectIdByOutput(ctx, outputId);
      if (projectId) await projectsService.markPublished(ctx, projectId);
    },
    // [T-323 治本] register 重锚判据端口:反查 output 属主项目 + source(判 imported 空壳 vs
    //   用户手动项目),及归档被让位的空壳。经公共 service,不跨模块直连 repo(守 SPEC §22)。
    //   命中「日拉自动建的 imported 空壳占用的作品」→ 重锚到用户手动项目 + 归档空壳,让手动
    //   项目成正主(不再卡「立项中」),而非返回锚在空壳上的既有 pub。
    resolveOutputOwner: (ctx, outputId) =>
      projectsService.getOutputOwnerSummary(ctx, outputId),
    archiveProjectSeam: (ctx, projectId) =>
      projectsService.archiveProject(ctx, projectId).then(() => {}),
  });
  const publishing = createPublishingTransport(() => publishingService);

  // 数据底座(SPEC §1.4)「优先读真」接线 —— composition root 是唯一允许跨模块组合读的层。
  // 判据单一:projectsService.hasImportedProjects(ctx)(source='imported' 非空)。判据为真时,
  // 把 dashboard/复盘 的作品级读收窄到"真实导入作品"的 publication 集 —— 让演示 fixture 让位、
  // 界面直接出真值(治 dy-pub-00 假标题/0 播放);为假时(用户尚未拉真账号)三向回退全量
  // fixture 演示态(过渡期不破)。解析链:imported 项目 id → 各项目 ContentOutput id →
  // 各 output 的 publication id,全程经公共 service(projects.listImportedProjectIds /
  // publishing.listPublicationIdsByProject),不跨模块直连 repo(守 SPEC §22)。定义在
  // projects/publishing service 之后、各读侧装配之前,供 dashboard/calibration 复用(无前向引用)。
  const resolveImportedPublicationIds = async (
    ctx: RequestContext,
  ): Promise<string[]> => {
    const projectIds = await projectsService.listImportedProjectIds(ctx);
    if (projectIds.length === 0) return [];
    const ids = new Set<string>();
    for (const projectId of projectIds) {
      const pubIds = await publishingService.listPublicationIdsByProject(
        ctx,
        projectId,
      );
      for (const id of pubIds) ids.add(id);
    }
    return [...ids];
  };

  // Analytics (module 11): one user-scoped repository over the shared db (the repo
  // takes userId per-call — the metric store is append-only). The service reaches
  // Publishing ONLY through the injected AnalyticsPublishingPort (no cross-module
  // repo import): resolvePublication = ownership gate via getPublication;
  // listPublicationIdsByProject = the project→publication resolver. The transport
  // returns this ONE shared service. Clock/ids share the deterministic `deps`.
  const analyticsRepo = createAnalyticsRepository(db, deps);
  const analyticsService = createAnalyticsService({
    repo: analyticsRepo,
    publishing: {
      resolvePublication: (ctx, publicationId) =>
        publishingService.getPublication(ctx, publicationId),
      listPublicationIdsByProject: (ctx, projectId) =>
        publishingService.listPublicationIdsByProject(ctx, projectId),
    },
  });
  const analytics = createAnalyticsTransport(() => analyticsService);

  // Ingestion (module 12): the service builds a per-ctx user-scoped repo over the
  // shared db (the repo bakes userId in; the service mints one per request). It
  // fans out to peer modules ONLY through their public Services, adapted onto the
  // narrow IngestionPorts (no cross-module repository import, SPEC §17.6/.7):
  //   - publishing.resolvePublication → publishingService.resolvePublication,
  //   - analytics.appendSnapshot → analyticsService.appendSnapshot (idempotent),
  //   - knowledge.ingest → knowledgeService.createKnowledge,
  //   - assets.registerExternalAsset → the assets two-phase upload (createUpload +
  //     completeUpload) so the external object lands as a real Asset,
  //   - artifacts.createCandidateVersion → artifactsService.createVersion with
  //     createdByType:"ingestion" (a CANDIDATE append — never current_version;
  //     the downstream adopt gate promotes it, roadmap §401).
  // The transport returns this ONE shared service. Clock/ids share the
  // deterministic `deps`. The MockIngestionSource is the deterministic producer
  // (foundation §4) used by dev/seeds — not on the dispatch path.
  const ingestionMockSource = createMockIngestionSource();
  void ingestionMockSource; // producer-side seam; reserved for dev/seed import flows
  const ingestionService = createIngestionService({
    deps,
    db,
    // [T-189a] 绑定成功回调:fire-and-forget 触发组合根 bootstrap(建 job + 初始化)。
    onDouyinBound: (ctx) => bootstrapDouyinOnBind?.(ctx),
    ports: {
      publishing: {
        resolvePublication: (ctx, ref) =>
          publishingService.resolvePublication(ctx, ref),
        // 数据底座(SPEC §1.3):导入作品落 published publication(external_id=aweme_id)。
        createImportedPublication: (ctx, outputId, input) =>
          publishingService.createImportedPublication(ctx, outputId, input),
        // [T-177 主 agent 复核决定] 不接线 listPublishedExternalIds → refreshDouyin 传 knownAwemeIds=
        //   undefined → fetchDouyinMetrics 保持**全量翻页刷新所有作品指标**。metrics 翻页 early-stop
        //   机制留在抓取层(fetchDouyinMetrics 支持 knownAwemeIds,单测覆盖),但默认不启:
        //   ① metrics 快照随时间变化,停刷旧作品会让首页总粉丝/完播率等聚合陈旧(依赖所有作品当前指标);
        //   ② metrics 翻页是浏览器 XHR 成本(非 token),不是"太耗 token"的来源——真正 token 大头是评论
        //     (已 commentWatermark 增量)与逐字稿/reconstruct(已幂等跳过)。故作品"增量"由幂等重活跳过承担,
        //     指标保持全量刷新。若将来要"快速发现新作品"模式,再接此端口即可。
      },
      // 数据底座(SPEC §1.3):导入历史项目端口 → projectsService.ensureImportedProject
      //   (建 project source:imported + content_output,经公共 service,不跨模块直连 repo)。
      projects: {
        ensureImportedProject: (ctx, input) =>
          projectsService.ensureImportedProject(ctx, input),
        // [T-321] 日拉去重主键 = publications.externalId → 反查属主项目 → merge 更新(不新建
        //   重复项目)。让用户手建 manual 项目「登记已发布」绑定的作品被日拉命中合并,而不是
        //   另建一条 imported 重复。merge 保持原 source(不翻 imported → 不触发 reconstruct
        //   覆盖用户手写内容),只补真实发布数据 + 跃迁 stage 显已发布。
        getProjectIdByOutput: (ctx, outputId) =>
          projectsService.getProjectIdByOutput(ctx, outputId),
        mergePublishedWork: (ctx, projectId, input) =>
          projectsService.mergePublishedWork(ctx, projectId, input),
      },
      analytics: {
        appendSnapshot: (ctx, input) =>
          analyticsService.appendSnapshot(ctx, input),
      },
      knowledge: {
        ingest: (ctx, input) =>
          knowledgeService.createKnowledge(ctx, {
            title: input.title,
            knowledgeType: input.knowledgeType,
            content: input.content,
          }),
      },
      assets: {
        registerExternalAsset: async (ctx, input) => {
          const upload = await assetsService.createUpload(ctx, {
            assetType: input.assetType,
            mimeType: "application/octet-stream",
            fileSize: 0,
          });
          return assetsService.completeUpload(ctx, upload.uploadId, {
            name: input.name,
          });
        },
      },
      artifacts: {
        createCandidateVersion: (ctx, input) =>
          artifactsService.createVersion(ctx, input.artifactId, {
            contentText: input.contentText,
            contentData: input.contentData,
            changeSummary: input.changeSummary,
            createdByType: input.createdByType,
          }),
      },
    },
    // 线 B:抖音真抓端口 —— 自起持久化 Chromium(.auth/ 复用扫码登录态,见 douyin-cdp.ts)。
    // [T-136 §D 切片 c] authDir **按号分目录**(douyinAuthDirFor(opts.accountId)):每号独立
    //   登录态,互不顶号;accountId 为 null → `_default` 回退(单号 / 未选号,兼容旧行为)。
    //   测试经各自的 createIngestionService 注入 fake,不连真浏览器。
    douyinFetch: {
      // [T-136 §D] fetchDouyinMetrics 现返回 { records, identity }(identity=登录用户自己的
      //   身份,抓不到 null)—— 直接透传;service 用真实昵称替占位「我的抖音」。
      // [T-326 B-04] douyin-cdp 懒加载:运行时被调时才 import(端口本就返回 Promise,语义不变)。
      fetch: async (opts) =>
        (await loadDouyinCdp()).fetchDouyinMetrics({
          capturedAt: opts.capturedAt,
          authDir: douyinAuthDirFor(opts.accountId),
          gateway: douyinGateway, // [gate-F7 插装点②] creator-center 翻页限流(注真单例)
          knownAwemeIds: opts.knownAwemeIds, // [T-177] 翻页 early-stop 锚(undefined → 全量)
        }),
      login: async (opts) =>
        (await loadDouyinCdp()).loginDouyin({
          authDir: douyinAuthDirFor(opts?.accountId),
        }),
      // [T-546] 热点宝 OAuth 使用与该采集账号相同的持久 profile；只切换登录目标，
      // 不复制 cookie、不新建另一套账号保管逻辑。
      loginDouhot: async (opts) =>
        (
          await loadDouhotCdp()
        ).loginDouhot({
          authDir: douyinAuthDirFor(opts?.accountId),
        }).then((result) => result.loggedIn),
      // [T-330] 绑新号 staging 四步端口(service loginDouyinForceNew 编排;根治「绑新号命中
      //   当前号/_default 旧 sessionid → 二维码不出现直接登进旧号」):
      //   loginNew 在全新 `_staging-<token>` 空目录扫码(必出二维码);fetchIdentity 同步读回
      //   身份(轻量 maxPages=1,口径同 refresh 采集);adoptStaging 身份确认后整目录搬到
      //   `.auth/douyin/<accountId>`(已存在先删=登录态更新;EXDEV 回退 copy+rm);
      //   discardStaging 失败路径清理。token→路径映射收在此组合根,service 不碰文件路径。
      loginNew: async () => {
        const stagingKey = createDouyinStagingToken();
        const loggedIn = await (await loadDouyinCdp()).loginDouyin({
          authDir: douyinStagingDirFor(douyinAuthDirBase, stagingKey),
        });
        return { loggedIn, stagingKey };
      },
      fetchIdentity: async (opts) =>
        (await loadDouyinCdp()).fetchDouyinIdentity({
          authDir: douyinStagingDirFor(douyinAuthDirBase, opts.stagingKey),
        }),
      adoptStaging: async (opts) =>
        adoptDouyinStagingDir(
          douyinStagingDirFor(douyinAuthDirBase, opts.stagingKey),
          douyinAuthDirFor(opts.accountId),
        ),
      discardStaging: async (opts) =>
        discardDouyinStagingDir(
          douyinStagingDirFor(douyinAuthDirBase, opts.stagingKey),
        ),
      // T-032a:被动状态探针 —— headless 快查登录态(不弹窗),设置页「账号绑定」徽标读它。
      status: async (opts) =>
        (await loadDouyinCdp()).checkDouyinStatus({
          authDir: douyinAuthDirFor(opts?.accountId),
        }),
    },
    // T-038c:限流可观测读端口 —— 绑 gateway 单例 getChannelStatus(内存镜像,同步无 IO)。
    throttleStatus: { read: readDouyinThrottleStatus },
    // [T-144] 扫码绑定时 ensure 平台账号 —— 让「设置徽标 / 切换器 / 日历」三处账号状态同源
    // (都基于真实 platform_account)。幂等:先 listAccounts 找同 (platform, handle) 既有,无则
    // createAccount(catch ConflictError 兜并发)。thunk 引用 platformAccountService(下方构造,
    // ensureAccount 只在扫码运行时被调,晚于其初始化,闭包安全)。
    platformAccount: {
      // [T-136§D-bind⑤] upsert 去重:传占位 handle 时复用既有占位,不冒第二个占位(逻辑抽为
      //   导出的 ensureDouyinAccountUpsert,单测直接验)。
      ensureAccount: (ctx, input) =>
        ensureDouyinAccountUpsert(platformAccountService, ctx, input),
      // [T-136 §D / §D-bind⑤] 采集到真实昵称后回填占位 + **合并所有占位为一行**(逻辑抽为导出的
      //   mergeDouyinPlaceholders,单测直接验)—— 干掉「扫一次冒俩占位」的用户报障。
      updateAccountHandle: (ctx, input) =>
        mergeDouyinPlaceholders(platformAccountService, ctx, input),
    },
  });
  const ingestion = createIngestionTransport(() => ingestionService);

  // Reviews (module 13): the service builds a per-ctx user-scoped repo over the
  // shared db (the repo bakes userId in; the service mints one per request). It
  // reaches peer modules ONLY through injected narrow ports (no cross-module repo
  // import, SPEC §22), satisfied here by the peers' public services / the shared
  // projects repo (the composition root, not the module, owns these adapters):
  //   - projects.verifyProjectOwned → projectsService.listOutputIdsByProject (the
  //     project-ownership gate throws OwnershipError for a cross-user/unknown id),
  //   - projects.verifyOutputOwned → projectsRepo.getOutput (output ownership gate),
  //   - projects.recordActivity → projectsService.recordActivity-equivalent via the
  //     projects repo appendActivity (best-effort; swallow on failure, SPEC §11),
  //   - publishing.listProjectPublications → projectsService.listOutputIdsByProject
  //     then publishingService.listPublications per output (the published window for
  //     period derivation — min/max publishedAt),
  //   - analytics.getProjectSnapshots → analyticsService.getProjectAnalytics reduced
  //     to the small evidence record the AI review node (G15) + FE render share.
  // The transport returns this ONE shared service. Clock/ids share the deterministic
  // `deps` (createSeq keeps review/insight/reviewpub ids collision-free).
  const reviewsService = createReviewsService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    projects: {
      verifyProjectOwned: async (ctx, projectId) => {
        // listOutputIdsByProject gates the project's ownership (cross-user /
        // unknown → OwnershipError → 404) before any review row is written.
        await projectsService.listOutputIdsByProject(ctx, projectId);
      },
      verifyOutputOwned: async (ctx, contentOutputId) => {
        // getOutput joins output→project and gates ownership (→ OwnershipError).
        await projectsRepo.getOutput(ctx, contentOutputId);
      },
      recordActivity: async (ctx, input) => {
        // Best-effort post-commit activity (SPEC §11) — a failure here must not
        // roll back the review fact, so swallow. appendActivity is user-scoped via
        // the parent project's ownership gate.
        try {
          await projectsRepo.appendActivity(ctx, {
            id: deps.nextId("activity"),
            projectId: input.projectId,
            eventType: input.eventType,
            entityType: input.entityType,
            entityId: input.entityId,
            eventData: {},
            occurredAt: deps.now(),
          });
        } catch {
          // intentionally swallowed — activity is non-critical telemetry.
        }
      },
    },
    publishing: {
      listProjectPublications: async (ctx, projectId) => {
        // Resolve project→ContentOutput ids via Projects (project-ownership gate
        // lives there), then list Publishing's OWN publications per output. No
        // cross-module repo import; an unwired/empty project → [].
        const outputIds = await projectsService.listOutputIdsByProject(
          ctx,
          projectId,
        );
        const windows: {
          contentOutputId: string;
          publishedAt: string | null;
        }[] = [];
        for (const outputId of outputIds) {
          const pubs = await publishingService.listPublications(ctx, outputId, {
            limit: 200,
            offset: 0,
          });
          for (const pub of pubs) {
            windows.push({
              contentOutputId: pub.contentOutputId,
              publishedAt: pub.publishedAt ?? null,
            });
          }
        }
        return windows;
      },
    },
    analytics: {
      getProjectSnapshots: async (ctx, projectId, window) => {
        // Reduce the project's Analytics snapshots to the small evidence record the
        // AI review node + FE render share (determinate; never user-supplied). The
        // project→publication resolution + user-scoping live inside Analytics.
        const { rows, total } = await analyticsService.getProjectAnalytics(
          ctx,
          projectId,
          1,
          50,
        );
        if (total === 0) return {};
        return {
          source: "analytics",
          window,
          snapshotCount: total,
          latestCapturedAt: rows[0]?.capturedAt ?? null,
        };
      },
    },
  });
  const reviews = createReviewsTransport(() => reviewsService);

  // ── gate readers 后置绑定(§15/§16 内容门禁的真实数据源)──────────────────
  // 此时 artifacts / production / publishing / reviews 服务都已构造好。把 projectsService
  // 的 stageGateReadersRef 填上,让阶段流转 gate 经各模块的公共 service 读真实交付物
  // (零跨模块 repo import)。每个 reader 用的数据源:
  //   - research/planning/script → artifactsService.listProjectArtifacts(按 artifactType)
  //   - production               → 遍历 project 的 outputs,任一 production.status==='ready'
  //   - publishing               → publishingService.listPublicationIdsByProject 非空
  //   - review                   → reviewsService.listCompletedReviewInsights 非空
  // 诚实标注的近似:
  //   - production reader 用 productionService.getProduction(get-or-create),对未进
  //     制作的 output 会幂等地建一个 drafting production 行(与制作页加载行为一致;
  //     drafting≠ready 不影响 gate 判定)。
  //   - review gate 用「完成复盘的洞察非空」近似「存在 ReviewReport」:reviews 模块
  //     的公共 service 只暴露 listCompletedReviewInsights(不暴露 hasCompletedReview),
  //     不为一个 gate 反向扩散改 reviews 模块。一个有完成复盘但零洞察的极端情形会被
  //     判为「缺失」——这与「复盘交付物 = 报告+洞察」的语义一致,不算编造。
  stageGateReadersRef.current = {
    listProjectArtifactTypes: async (ctx, projectId) => {
      const rows = await artifactsService.listProjectArtifacts(ctx, projectId);
      return rows.map((r) => r.artifactType);
    },
    hasReadyProduction: async (ctx, projectId) => {
      const outputIds = await projectsService.listOutputIdsByProject(
        ctx,
        projectId,
      );
      for (const outputId of outputIds) {
        const production = await productionService.getProduction(ctx, outputId);
        if (production.status === "ready") return true;
      }
      return false;
    },
    hasPublication: async (ctx, projectId) => {
      const ids = await publishingService.listPublicationIdsByProject(
        ctx,
        projectId,
      );
      return ids.length > 0;
    },
    hasCompletedReview: async (ctx, projectId) => {
      const insights = await reviewsService.listCompletedReviewInsights(
        ctx,
        projectId,
      );
      return insights.length > 0;
    },
  };

  // Learnings (module 14): the service builds a per-ctx user-scoped repo over the
  // shared db (the repo bakes userId in; the service mints one per request). It
  // reaches Projects ONLY through the injected LearningsProjectsPort (no cross-module
  // repo import, SPEC §22), satisfied here by the Projects public service / shared
  // repo (the composition root, not the module, owns these adapters):
  //   - projects.assertOwnsProject → projectsService.listOutputIdsByProject (the
  //     project-ownership gate throws OwnershipError for a cross-user/unknown id
  //     before any application row is written),
  //   - projects.recordActivity → projectsRepo.appendActivity (best-effort; swallow
  //     on failure, SPEC §11 — an activity-append must not roll back the apply fact).
  // The transport returns this ONE shared service. Clock/ids share the deterministic
  // `deps` (createSeq keeps learning/learning-app ids collision-free).
  const learningsService = createLearningsService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    projects: {
      assertOwnsProject: async (ctx, projectId) => {
        // listOutputIdsByProject gates the project's ownership (cross-user /
        // unknown → OwnershipError → 404) before any application row is written.
        await projectsService.listOutputIdsByProject(ctx, projectId);
      },
      recordActivity: async (ctx, input) => {
        // Best-effort post-commit activity (SPEC §11) — a failure here must not roll
        // back the application fact, so swallow. appendActivity is user-scoped via
        // the parent project's ownership gate.
        try {
          await projectsRepo.appendActivity(ctx, {
            id: deps.nextId("activity"),
            projectId: input.projectId,
            eventType: input.eventType,
            entityType: "learning",
            entityId: input.refId,
            eventData: {},
            occurredAt: deps.now(),
          });
        } catch {
          // intentionally swallowed — activity is non-critical telemetry.
        }
      },
    },
    // 复盘飞轮回流 轨B (Learning→校准): the cross-module write seam. A 复盘 Learning is promoted
    // into a real CalibrationRuleSuggestion through the Calibration PUBLIC service (no
    // cross-module repo import, SPEC §22). Lazy thunks — `calibrationService` is constructed
    // BELOW; these run at request time, never at construction (TDZ-safe, same as the AI
    // module's positioning/candidate/calibration confirm thunks). The current rubric resolves
    // to 当前号的 canonical rubric(`rubric-canonical:<accountId>`,[T-332 S2] per-account)
    // when the user can read it; null(→ honest ConflictError)when no rubric exists.
    calibration: {
      resolveCurrentRubricId: async (ctx) => {
        try {
          const rubric = await calibrationService.getRubric(
            ctx,
            canonicalRubricIdFor(ctx),
          );
          return rubric.id;
        } catch {
          return null;
        }
      },
      createSuggestion: (ctx, input) =>
        calibrationService.createRuleSuggestion(ctx, input),
    },
  });
  const learnings = createLearningsTransport(() => learningsService);

  // AI (module 15): the service builds a per-ctx user-scoped repo over the shared db
  // (the repo bakes userId in; the service mints one per request). The transport returns
  // this ONE shared service. The candidate→confirm boundary (SPEC §18) reaches Artifacts
  // ONLY through the injected AiArtifactsPort — satisfied here by the Artifacts public
  // service's createVersion (createdByType:"ai" → a NEW immutable ArtifactVersion; the AI
  // never writes a current version directly). No cross-module repo import (SPEC §22). The
  // Agent SDK lives only in @creatoros/ai-worker; this composition never imports it
  // (determinism boundary). Clock/ids share the deterministic `deps` (createSeq keeps
  // ai-conv/ai-task/ai-msg/ai-ref/ai-result ids collision-free across requests).
  // Settings 在下方才完成装配；AI service 的依赖闭包只在 createTask 请求时执行，
  // 因而可以先声明端口，再于 settingsRepo 可用后绑定真实 account-scoped resolver。
  let resolveEffectiveSkillSnapshotForRuntime: EffectiveSkillSnapshotResolver | null =
    null;
  const aiService = createAiService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    resolveTaskRuntimeData: async (ctx, taskType, inputData) => {
      if (!resolveEffectiveSkillSnapshotForRuntime) {
        throw new Error(
          "[T-513] Effective Skill snapshot resolver 尚未完成装配",
        );
      }
      const requiredSkillIds = requiredSkillIdsForTask(taskType, inputData);
      return {
        skillSnapshot: await resolveEffectiveSkillSnapshotForRuntime(
          ctx,
          requiredSkillIds,
        ),
      };
    },
    artifacts: {
      createVersion: (ctx, artifactId, input) =>
        artifactsService.createVersion(ctx, artifactId, input),
    },
    // 机制③ candidate-confirm bus — confirmTask materializes a `material_list` candidate
    // (research_gather node) into KnowledgeItems through the Knowledge public service.
    knowledge: {
      createKnowledge: (ctx, input) =>
        knowledgeService.createKnowledge(ctx, input),
    },
    // 机制④ 选题会 — confirmTask materializes a candidate_list into 选题池 Candidates via
    // the candidate module's C-3 seam. enrichCard formalizes a topic_card candidate
    // (topic.enrich node, 选题中心大改) onto an existing candidate. Lazy: candidateService
    // is constructed below, and these thunks only run at confirm time (request), never at
    // construction.
    candidate: {
      createFromAIResult: (ctx, result) =>
        candidateService.createFromAIResult(ctx, result),
      enrichCard: (ctx, candidateId, card) =>
        candidateService.enrichCard(ctx, candidateId, card),
    },
    // 机制④⑤ 复盘 — confirmTask materializes a learning_list into Learnings (which then
    // feed back into later nodes' context). learningsService is constructed above.
    learnings: {
      // [T-284c G3-A] review.insights 的 capture 点算 evidenceStrength:来自一条**已发布 + 有真实
      // metric_snapshots** 的作品复盘 → grounded → 该 learning 直接 validated 自动进生成;无真实数据
      // 背书(纯 AI 推断 / 无来源作品 / 作品无指标)→ 留 candidate 走人工裁决门(守宪法②)。判据从既有
      // 数据算:getProjectAnalytics total>0 = 该项目有已发布作品的真实指标快照(metric_snapshots
      // 只对已发布作品采集)。best-effort:读失败 → 无背书退 candidate,绝不误判 grounded。
      createLearning: async (ctx, body) => {
        let evidenceStrength: "grounded" | null = null;
        if (body.projectId) {
          try {
            const { total } = await analyticsService.getProjectAnalytics(
              ctx,
              body.projectId,
              1,
              1,
            );
            if (total > 0) evidenceStrength = "grounded";
          } catch {
            // 读不到指标 → 无背书,退 candidate(诚实,不放行)。
          }
        }
        return learningsService.createLearning(ctx, { ...body, evidenceStrength });
      },
    },
    // 机制③ 一稿多平台 — confirmTask materializes a publication_drafts candidate into real
    // Publications (+ an initial revision carrying the adapted title/body) via the
    // Publishing public service. The agent's per-platform label is normalized to the
    // Publishing platform enum (wechat → wechatVideo); accountReference is empty (the user
    // binds an account at 发布 time). publishingService is constructed above.
    publishing: {
      createPublicationFromDraft: async (ctx, outputId, draft) => {
        const PLATFORM_ALIAS: Record<string, string> = {
          wechat: "wechatVideo",
          weixin: "wechatVideo",
        };
        const platform = PLATFORM_ALIAS[draft.platform] ?? draft.platform;
        const pub = await publishingService.createPublication(ctx, outputId, {
          platform,
          accountReference: "",
        });
        await publishingService.createRevision(ctx, pub.id, {
          title: draft.title,
          description: draft.body,
          platformTags: draft.tags ?? [],
        });
        return pub;
      },
    },
    // Plan A5 用料链 — when a material_list candidate is 采纳ed, each new KnowledgeItem is
    // also tied to the task's project via a material-link (料库⇄创作 live edge). Lazy:
    // materialLinksService is constructed below; this thunk only runs at confirm time.
    materialLinks: {
      link: (ctx, input) => materialLinksService.create(ctx, input),
    },
    // Plan Phase A 定位演进回流 (OQ2) — when a positioning_profile candidate
    // (positioning.generate node) is 采纳ed, the AI confirm branch formalizes it through
    // the Positioning public service: upsertProfile lands the 5-facet profile, then
    // createStatementVersion appends a NEW statement version tagged createdByType:"ai" +
    // aiTaskId. Lazy: positioningService is constructed below; this thunk only runs at
    // confirm time (request), never at construction. The AI module never writes
    // creator_profiles / positioning_statements directly (SPEC §22).
    positioning: {
      upsertProfile: (ctx, input) =>
        positioningService.upsertProfile(ctx, input),
      createStatementVersion: (ctx, input) =>
        positioningService.createStatementVersion(ctx, input),
    },
    // 校准中心大改 Slice 1 — when a `calibration_diagnosis` candidate (calibration.diagnose
    // node) is 采纳ed, the AI confirm branch mints ONE draft Prediction through the
    // Calibration public service (AI never writes the predictions row directly, SPEC §22).
    // Lazy: calibrationService is constructed below; this thunk only runs at confirm time.
    calibration: {
      createDraftPrediction: (ctx, input) =>
        calibrationService.createDraftPrediction(ctx, input),
    },
    // [T-387b] 分镜凝固 pass 的素材库只读端口 —— confirmTask 物化整稿前,用真实 asset id 集合
    // 校验 sections[].visual.assetRefs(不存在的剔除挪 missing)。只读 id,不取内容。
    assetLibrary: {
      listAssetIds: async (ctx) =>
        (await assetsService.listAssets(ctx, { limit: 500, cursor: null })).map(
          (a) => a.id,
        ),
    },
  });
  const runWithResolvedEffectiveSkills = async <T>(
    ctx: RequestContext,
    requiredSkillIds: readonly string[],
    execute: () => Promise<T>,
  ): Promise<T> => {
    if (!resolveEffectiveSkillSnapshotForRuntime) {
      throw new Error(
        "[T-513] Effective Skill snapshot resolver 尚未完成装配",
      );
    }
    const snapshot = await resolveEffectiveSkillSnapshotForRuntime(
      ctx,
      requiredSkillIds,
    );
    return runWithEffectiveSkillSnapshot(snapshot, execute);
  };
  const runTaskWithEffectiveSkillSnapshot = async (
    ctx: RequestContext,
    taskId: string,
    execute: (signal: AbortSignal) => void | Promise<void>,
  ): Promise<void> => {
    const runtimeData = await aiService.getTaskRuntimeData(ctx, taskId);
    const rawSkillSnapshot = runtimeData.skillSnapshot;
    if (!rawSkillSnapshot) {
      throw new Error(
        `[T-513] AI task ${taskId} 缺少冻结的 Skill snapshot`,
      );
    }
    const skillSnapshot = parseEffectiveSkillSnapshot(
      JSON.stringify(rawSkillSnapshot),
    );
    if (
      skillSnapshot.userId !== ctx.userId ||
      skillSnapshot.accountId !== ctx.accountId
    ) {
      throw new Error(
        `[T-513] AI task ${taskId} 的 Skill snapshot 属主不匹配`,
      );
    }
    await runWithEffectiveSkillSnapshot(skillSnapshot, async () => {
      const execution = await aiService.runClaimedTaskExecution(
        ctx,
        taskId,
        async ({ signal }) => {
          await execute(signal);
        },
      );
      // 第二个同 attempt/同 task dispatch 竞争失败是正常幂等命中，不能再调用模型。
      if (!execution.claimed) return;
    });
  };
  const aiBase = createAiTransport(() => aiService);

  // T-086 审核门 service + transport(reviewRules.* + scriptReviews.*)。scriptReviews.trigger
  // 经注入的 AI 端口起 script.review ai_task。**关键**:审核门 op 不经 ai transport 的
  // ai.tasks.create 拦截(它直调 aiService.createTask),故 createTask 起任务后必须在此显式
  // 接入后台 dispatch(dispatchScriptReview,下方 resolveModelSpec 后赋值),否则任务只 queued
  // 不跑 L1 lint + L2 语义审。best-effort:dispatch 触发失败不回滚已建任务(诚实:任务留 queued
  // 可重试),但正常路径 dispatchScriptReview 恒已赋值(请求晚于 build)。
  const reviewGateService = createReviewGateService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    ai: {
      createTask: async (ctx, body) => {
        const task = await aiService.createTask(ctx, body);
        if (task && (task as { taskType?: string }).taskType === "script.review") {
          const t = task as {
            id: string | number;
            projectId?: string | null;
            inputData?: Record<string, unknown> | null;
          };
          void dispatchScriptReview?.(ctx, {
            id: String(t.id),
            projectId: typeof t.projectId === "string" ? t.projectId : null,
            inputData: (t.inputData ?? {}) as Record<string, unknown>,
          });
        }
        return task;
      },
    },
  });
  const reviewGate = createReviewGateTransport(() => reviewGateService);

  // Positioning (module 17, Wave 5): the service builds a per-ctx user-scoped repo
  // over the shared db (the repo bakes userId in; the service mints one per request).
  // The transport returns this ONE shared service. The PositioningGate's project
  // subject reaches Projects ONLY through the injected PositioningProjectsPort (no
  // cross-module repo import, SPEC §22), satisfied here by the Projects public
  // repo's ownership-gated get (a cross-user / unknown projectId throws
  // OwnershipError → 404 BEFORE the gate scores). The AI 定位演进回流 formalizes
  // through positioningService.upsertProfile + createStatementVersion (createdByType:'ai')
  // — WIRED (Plan Phase A): the AI module's `positioning_profile` confirm branch calls
  // these via the AiPositioningPort below, fed by the positioning.generate runner. (OQ2
  // closed.) positioning owns no candidate state machine (C-3). Clock/ids share the
  // deterministic `deps`
  // (createSeq keeps profile/posstmt ids collision-free across requests).
  const positioningService = createPositioningService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    projects: {
      getProjectSubject: async (ctx, projectId) => {
        // projectsRepo.get gates the project's ownership (cross-user / unknown →
        // OwnershipError → 404) and returns the title/brief the scorer reads.
        const row = await projectsRepo.get(ctx, projectId);
        return { title: row.title, brief: row.brief };
      },
    },
    // T-521：清理事件进入 sidecar 结构化日志，只记内部归属 ID + 旧值 hash，
    // 不记录 statusNote 原文。实际写库仍只发生在 Positioning service 内。
    auditLegacyStatusNoteCleanup: (event) => {
      process.stdout.write(`[positioning-audit] ${JSON.stringify(event)}\n`);
    },
  });
  const positioning = createPositioningTransport(() => positioningService);

  // [T-081②/T-521] 通用最近项目分页读：Project 提供 source/lifecycle，Publishing 窄读
  // port 提供 canonical publishedAt；review 绝不作为发布状态判据。
  const listRecentProjects = async (
    c: RequestContext,
    opts: { limit: number; offset: number },
  ) =>
    listRecentProjectsWithPublicationFacts(c, opts, {
      listProjects: (ctx) => projectsRepo.list(ctx),
      listOutputRefsByProjects: (ctx, projectIds) =>
        projectsService.listOutputRefsByProjects(ctx, projectIds),
      listPublicationsByOutputIds: (ctx, outputIds) =>
        publishingService.listPublicationsByOutputIds(ctx, outputIds),
    });
  // [T-578] 定位生成专用作品投影：Publishing service 负责 canonical 可见性
  // (hiddenAt/platformStatus)，投影只保留有真实 publishedAt 的 published 行并按其新→旧。
  // 后台 runner 与对话 runner 绑定下面同一个 reader 对象，避免再次分叉。
  const listPositioningWorks = async (
    c: RequestContext,
    opts: { limit: number; offset: number },
  ) =>
    listPositioningWorksWithPublicationFacts(c, opts, {
      listProjects: (ctx) => projectsRepo.list(ctx),
      listOutputRefsByProjects: (ctx, projectIds) =>
        projectsService.listOutputRefsByProjects(ctx, projectIds),
      listVisiblePublicationsByOutputIds: (ctx, outputIds) =>
        publishingService.listPublicationsByOutputIds(ctx, outputIds, {
          visibility: "visible",
        }),
    });
  const positioningWorksReader = { listProjects: listPositioningWorks };

  // 复盘对象 reader 工厂 (T-039a) —— 读「本次复盘的这一条作品」的真材料(标题/文案/数据/评论),
  // 供 review.analyze 路径(后端 task runner + ChatBox 对话复盘)注入 review.insights prompt,让复盘
  // 扣住真实内容归因而不是账号级泛论。全部 best-effort、诚实空兜底(读不到 → 空,绝不塞假),且**复用
  // 数据底座既有读法**:标题走 projectsRepo.get(带 ownership 门),文案走 output_script transcript
  // artifact(与 reconstruct-runner 的 getTranscript 同法),数据走 analytics 最新 snapshot rawMetrics
  // (播放优先 views 回退 plays,与 dashboard 同口径),评论走 candidateService.listSignals 里 source
  // 含 comment 的信号。绑到 creative-context 的 ReviewSubjectReader 端口。
  const makeReviewSubjectReader = (): ReviewSubjectReader => ({
    // 本作品真标题 —— projectsRepo.get 顺带做 ownership 门(跨用户/未知 → OwnershipError)。
    getTitle: async (c, projectId) => {
      try {
        const row = await projectsRepo.get(c, projectId);
        return row.title ?? "";
      } catch {
        return "";
      }
    },
    // 本作品真文案 —— output_script transcript artifact 当前版本(contentData.transcript 优先,
    // 回退 contentText)。与 reconstruct task 的 getTranscript 同一读法(公开 service + per-ctx repo)。
    getScript: async (c, projectId) => {
      try {
        const rows = await artifactsService.listProjectArtifacts(c, projectId);
        const repo = createArtifactRepository(db, {
          ...deps,
          userId: c.userId,
          // [T-332 S2] strict:artifact 是 per-account 域,未选号 → AccountRequiredError。
          accountId: requireAccountId(c.accountId, "artifacts.repo"),
        });
        for (const r of rows) {
          if (r.artifactType !== "output_script") continue;
          if (!r.currentVersionId) continue;
          const version = await repo.getVersion(r.currentVersionId);
          const data = version.contentData as
            | Record<string, unknown>
            | null
            | undefined;
          const t =
            data && typeof data.transcript === "string"
              ? data.transcript
              : version.contentText;
          if (t && t.trim()) return t;
        }
        return "";
      } catch {
        return "";
      }
    },
    // 本作品真实数据摘要 —— 解析项目 outputs → publications → 最新 snapshot rawMetrics,合并成
    // 人类可读串(播放优先 views 回退 plays,与 dashboard/getMetricsSummary 同口径)。数据是真实值。
    getMetricsSummary: async (c, projectId) => {
      try {
        const outputIds = await projectsService.listOutputIdsByProject(
          c,
          projectId,
        );
        const merged = new Map<string, number>();
        for (const outputId of outputIds) {
          let pubs: Array<{ id: string }> = [];
          try {
            pubs = await publishingService.listPublications(c, outputId, {
              limit: 20,
              offset: 0,
            });
          } catch {
            pubs = [];
          }
          for (const pub of pubs) {
            try {
              const page = await analyticsService.getPublicationAnalytics(
                c,
                pub.id,
                1,
                10,
              );
              const latest = page.rows
                .slice()
                .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
              const raw = (latest?.rawMetrics ?? {}) as Record<string, unknown>;
              for (const [k, v] of Object.entries(raw)) {
                if (typeof v === "number" && Number.isFinite(v)) {
                  merged.set(k, v);
                }
              }
            } catch {
              /* single publication read failing → skip, never crash */
            }
          }
        }
        if (merged.size === 0) return "";
        // 播放量归一(views/plays 同义合并,只呈现一次;views 真采集优先)。
        if (merged.has("views") && merged.has("plays")) merged.delete("plays");
        const LABELS: Record<string, string> = {
          views: "播放",
          plays: "播放",
          likes: "点赞",
          digg: "点赞",
          comments: "评论",
          shares: "分享",
          favorites: "收藏",
          finish_rate: "完播率",
        };
        return Array.from(merged.entries())
          .map(([k, v]) => `${LABELS[k] ?? k}：${v}`)
          .join(" · ");
      } catch {
        return "";
      }
    },
    // [T-182b] 本作品观众评论 —— 走 per-work 归属查询(不再账号级内存筛)。project → outputs →
    // 逐 publication 调 listCommentsForPublication(source='comment' AND publication_id=pubId,
    // 已按点赞热榜倒序)→ 合并取前 limit 条。与 getMetricsSummary 同一 project→outputs→pubs 装配
    // 口径,零 schema 变更(per-work 外键与查询已建齐)。无 publication / 读失败 → 诚实空兜底。
    getComments: async (c, projectId, opts) => {
      try {
        const outputIds = await projectsService.listOutputIdsByProject(
          c,
          projectId,
        );
        const comments: string[] = [];
        for (const outputId of outputIds) {
          let pubs: Array<{ id: string }> = [];
          try {
            pubs = await publishingService.listPublications(c, outputId, {
              limit: 20,
              offset: 0,
            });
          } catch {
            pubs = []; // 单 output 的 publication 读失败 → 跳过,不牵连其它、不崩
          }
          for (const pub of pubs) {
            if (comments.length >= opts.limit) break;
            try {
              const rows = await candidateService.listCommentsForPublication(
                c,
                pub.id,
                opts.limit,
              );
              for (const r of rows) {
                if (typeof r.rawText === "string" && r.rawText.trim() !== "") {
                  comments.push(r.rawText);
                }
              }
            } catch {
              /* 单 publication 评论读失败 → skip, never crash */
            }
          }
          if (comments.length >= opts.limit) break;
        }
        return comments.slice(0, opts.limit);
      } catch {
        return [];
      }
    },
  });

  // [T-270] 立项 Brief reader 工厂(单一真值)—— 读项目 brief_detail jsonb 的全核心字段(画幅 +
  // 核心信息/内容目标/内容形式/目标受众/成功标准),供 creative-context 渲成立项硬锚段。dispatch 路径
  // (script.draft/planning.thesis)与对话路径(runtime.context → chat)共用同一份读法,不造影子。
  // 病根:此前 dispatch 内联 briefReader 只投影 orientation + 对话路径根本没绑 brief → brief 核心字段
  // 从读取端就被丢。best-effort:读不到 → null(绝不阻塞写文案/立论点)。
  const makeBriefReader = (): ProjectBriefReader => ({
    getBriefDetail: async (c, projectId) => {
      try {
        const row = await projectsRepo.get(c, projectId);
        const d = (row.briefDetail ?? {}) as {
          orientation?: "landscape" | "portrait";
          coreMessage?: string;
          contentGoal?: string;
          contentFormat?: string;
          targetAudience?: string;
          successCriteria?: string;
          // [T-284a] 复刻补链 G1 —— 复刻项目携带的原爆款拆解要素(briefDetail.benchmarkRef jsonb)。
          benchmarkRef?: {
            钩子拆解?: string;
            结构拆解?: string;
            为什么爆?: string;
            可借鉴点?: string[];
            适配本账号建议?: string;
          };
        };
        return {
          orientation: d.orientation,
          coreMessage: d.coreMessage,
          contentGoal: d.contentGoal,
          contentFormat: d.contentFormat,
          targetAudience: d.targetAudience,
          successCriteria: d.successCriteria,
          // [T-284a] 带出复刻参照(creative-context 据此产 benchmarkRefBrief 回流写稿/立论点/搭结构)。
          benchmarkRef: d.benchmarkRef,
        };
      } catch {
        return null; // best-effort;读不到 brief 绝不阻塞写文案/立论点
      }
    },
  });

  // [T-146 切片 c/d] 项目素材 reader —— 读**当前项目**挂载的用户上传 document 素材(带 per-project
  // priority + 文档抽取投影),供写文案(script.draft)硬约束注入 + 搜索(gatherMaterials)深度结合。
  // 读法:materialLinksService.list(projectId) → 取 entityType='asset' 的边(带 priority)→ 逐个
  // assetsService.getAsset + listFilesByIds 取当前文件(materialSummary 在 mediaMetadata)→ 组装
  // ProjectMaterial。只保留 document 类且解析成功/有内容的(失败/非文档不进,不冒充可读)。全程 best-
  // effort:任一素材读失败只跳过该条(不牵连其它、不阻断节点)。与既有 assetsReader/复盘 reader 同
  // 「per-ctx 公开 service 读法」,不造影子 repo。
  const makeProjectMaterialsReader = (): ProjectMaterialsReader => ({
    listProjectMaterials: async (c, projectId) => {
      // material_links 是「料库⇄创作」一等公民边;list(projectId) 已 user-scoped(repo 用 ctx.userId)。
      const { rows } = await materialLinksService.list(c, {
        projectId,
        page: 1,
        pageSize: 100,
      });
      const assetLinks = rows.filter((r) => r.entityType === "asset");
      const materials: ProjectMaterial[] = [];
      for (const link of assetLinks) {
        try {
          const asset = await assetsService.getAsset(c, link.entityId); // OwnershipError → catch 跳过
          // 只读 document 类(图/视/音不是「资料」,不进硬约束);非文档跳过。
          if (asset.assetType !== "document") continue;
          // 文档抽取的三件套(extractedText/extractStatus/materialSummary)都落在**当前文件**行
          // (切片 a:extracted_text/extract_status 是 asset_files 列,materialSummary 在其 mediaMetadata),
          // 与契约 assetResource 的 file 派生投影同源。故一并从 current file 读(与 toAssetResource 一致)。
          let materialSummary: ProjectMaterial["materialSummary"] = null;
          let extractStatus: string | null = null;
          let extractedText: string | null = null;
          if (asset.currentFileId) {
            const files = await assetsService.listFilesByIds(c, [
              asset.currentFileId,
            ]);
            const file = files[0] ?? null;
            extractStatus = file?.extractStatus ?? null;
            extractedText = file?.extractedText ?? null;
            const meta = (file?.mediaMetadata ?? null) as Record<
              string,
              unknown
            > | null;
            const summary = meta?.materialSummary;
            if (summary && typeof summary === "object" && !Array.isArray(summary)) {
              materialSummary = summary as ProjectMaterial["materialSummary"];
            }
          }
          materials.push({
            name: asset.name,
            priority: link.priority === "high" ? "high" : "normal",
            extractStatus,
            materialSummary,
            extractedText,
          });
        } catch {
          // 单份素材读失败(越权/已删)→ 跳过该条,不牵连其它素材、不阻断写文案/搜索。
          continue;
        }
      }
      return materials;
    },
  });

  // 机制③④ — the gather-trigger seam. The AI module/service stays deterministic (never
  // imports the Agent SDK); the non-determinism lives HERE in the composition layer. We
  // wrap the AI transport so that a freshly-queued `research.gather_material` task fires
  // the real-agent runner in the BACKGROUND (Option A: in-process, non-blocking). The
  // runner assembles CreativeContext (positioning + topic), runs the Vercel AI SDK research
  // node (@creatoros/ai-worker + 外置 research.gather 模板 + anthropic 内置 web search), and
  // records a `material_list` candidate via aiService.recordCandidate → awaiting_confirmation.
  const ai: Transport = {
    async request(endpoint, input, ctx) {
      const res = await aiBase.request(endpoint, input, ctx);
      if (endpoint.id === "ai.tasks.create" && ctx) {
        const task = (res as { data?: Record<string, unknown> }).data;
        if (
          !task ||
          (typeof task.id !== "string" && typeof task.id !== "number")
        ) {
          return res;
        }
        // [T-513] createTask 已把 official base + 当前账号增量覆盖冻结进 server-only
        // runtimeData。执行端只消费该快照，绝不重新读“当前配置”，因此排队期间改配置、
        // 多账号并发、重试都不会串 prompt。缺失/属主不符一律 fail closed。
        const dispatchCreatedTask = async () => {
        const positioningReader = {
          getPositioningCenter: (c: RequestContext) =>
            positioningService.getPositioningCenter(c),
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
        // 论点树 reader (策划 downstream nodes) — read the project's `thesis_tree` artifact's
        // current version's `contentData.nodes` back as the upstream 编导判断 that
        // planning.contract / planning.outline build on. Reaches Artifacts ONLY through the
        // public service (listProjectArtifacts + listVersions); no cross-module repo import.
        const readArtifactContentData = async (
          c: RequestContext,
          projectId: string,
          artifactType: string,
        ): Promise<Record<string, unknown> | null> => {
          const artifacts = await artifactsService.listProjectArtifacts(
            c,
            projectId,
          );
          const target = artifacts.find((a) => a.artifactType === artifactType);
          if (!target) return null;
          const versions = await artifactsService.listVersions(c, target.id);
          if (versions.length === 0) return null;
          const current = versions
            .slice()
            .sort((a, b) => b.versionNumber - a.versionNumber)[0];
          const data = current?.contentData;
          return data && typeof data === "object" && !Array.isArray(data)
            ? (data as Record<string, unknown>)
            : null;
        };
        const thesisReader = {
          getThesisNodes: async (c: RequestContext, projectId: string) => {
            const data = await readArtifactContentData(
              c,
              projectId,
              "thesis_tree",
            );
            const rawNodes = Array.isArray(data?.nodes) ? data!.nodes : [];
            return rawNodes
              .map((raw) => {
                const o = (raw ?? {}) as Record<string, unknown>;
                return {
                  column: typeof o.column === "string" ? o.column : "",
                  title: typeof o.title === "string" ? o.title : "",
                  summary: typeof o.summary === "string" ? o.summary : "",
                };
              })
              .filter((n) => n.column && (n.title || n.summary));
          },
        };
        // 内容合同 reader (planning.outline) — read the project's `content_contract`
        // artifact's current version's `contentData.cards` back as the constraint the
        // structure must honor.
        const contractReader = {
          getContractCards: async (c: RequestContext, projectId: string) => {
            const data = await readArtifactContentData(
              c,
              projectId,
              "content_contract",
            );
            const rawCards = Array.isArray(data?.cards) ? data!.cards : [];
            return rawCards
              .map((raw) => {
                const o = (raw ?? {}) as Record<string, unknown>;
                return {
                  title: typeof o.title === "string" ? o.title : "",
                  body: typeof o.body === "string" ? o.body : "",
                };
              })
              .filter((c2) => c2.title || c2.body);
          },
        };
        // 结构方案 reader (SEAM-01, script.draft) — read the project's `content_outline`
        // artifact's current version `contentData` ({structureType, opening, sections,
        // ending, cta}) back as the blueprint the script.draft node fleshes out. Same
        // public-service read path as thesis/contract (no cross-module repo import).
        const outlineReader = {
          getOutline: async (c: RequestContext, projectId: string) => {
            const data = await readArtifactContentData(
              c,
              projectId,
              "content_outline",
            );
            if (!data) return null;
            const rawSections = Array.isArray(data.sections)
              ? data.sections
              : [];
            const sections = rawSections
              .map((raw) => {
                const o = (raw ?? {}) as Record<string, unknown>;
                return {
                  label: typeof o.label === "string" ? o.label : "",
                  intent: typeof o.intent === "string" ? o.intent : "",
                };
              })
              .filter((s) => s.label || s.intent);
            const structureType =
              typeof data.structureType === "string" ? data.structureType : "";
            const opening = typeof data.opening === "string" ? data.opening : "";
            const ending = typeof data.ending === "string" ? data.ending : "";
            const cta = typeof data.cta === "string" ? data.cta : "";
            // No adopted outline content at all → null (script.draft degrades to no blueprint).
            if (
              sections.length === 0 &&
              !structureType &&
              !opening &&
              !ending &&
              !cta
            ) {
              return null;
            }
            return { structureType, opening, sections, ending, cta };
          },
        };
        // F2 消费侧隔离 reader (T-030-D4, SPEC §7 边界②) — reports the origin of the
        // project's current artifact of a given type so assembleCreativeContext can mark a
        // reconstructed thesis/contract/outline brief "未经确认" before it rides downstream
        // as a 已确认前提. Reuses the SAME public-service read (listProjectArtifacts →
        // ArtifactRow.origin) the content readers use — no extra content fetch, no repo import.
        const artifactOriginReader = {
          getArtifactOrigin: async (
            c: RequestContext,
            projectId: string,
            artifactType: string,
          ): Promise<"user" | "reconstructed" | null> => {
            const artifacts = await artifactsService.listProjectArtifacts(
              c,
              projectId,
            );
            const target = artifacts.find(
              (a) => a.artifactType === artifactType,
            );
            const origin = target?.origin ?? null;
            return origin === "reconstructed" || origin === "user"
              ? origin
              : null;
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
          // [T-271] 封面链声明 reviewSubject 以读**口播稿主张**(getScript 读 output_script 当前版本,
          // 与复盘同一读法)—— assembleCreativeContext 据此填 context.reviewScript,封面文案硬锚正片主张。
          reviewSubject: makeReviewSubjectReader(),
        };
        // Fire-and-forget: the HTTP response returns immediately; the agent (30–60s
        // subprocess) drains in the background against the shared pglite. The UI polls
        // getTask/listResults for the candidate. Each node has a runner; one trigger map.
        if (
          task &&
          task.taskType === "research.gather_material" &&
          task.status === "queued"
        ) {
          await runGatherMaterial(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              // [T-146d] 搜索深度结合用户素材:本项目高优先素材要点作 facet 注入 research 综合,让
              // 「贴着 PR/第一手资料产素材」而非泛搜。creative-context 按 material_link.priority 分流。
              projectMaterials: makeProjectMaterialsReader(),
              // Vercel AI SDK 路径:素材搜集节点跑在 ai-worker + 外置模板 + generateObject
              // 绑四类 outputSchema(钩子/案例/数据点/金句),schema 强约束根治不可解析卡死。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "topic.generate" &&
          task.status === "queued"
        ) {
          // Phase 3 A 路径:跑在新 Agent Runtime 上(按 capability 配的 model + 步骤日志),
          // 替掉旧的 runClaudeAgent 订阅路径。没配 model key → 适配器 cancelTask(不假成功)。
          await runTopicGenerateV2(
            ctx,
            {
              id: String(task.id),
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              signals: signalsReader,
              knowledge: knowledgeReader,
              // [T-182c] trend 出题依据接 T-126 联网检索:组合根把 searchWebPort(rss 免key/browser
              // 无头采集,同一 search registry)绑进来抓当前热点。未配 web.search → searchWebPort 抛
              // SearchConfigError,adapter 内 catch 成空 brief 降级,不重造采集器、不崩。
              trendSearch: (c, query, opts) => searchWebPort(c, query, opts),
              // [T-235b] 已登记信源信号(主路):web 型 readUrl+AI 抽取 / rss 型 feed 解析,
              // 与 web 搜索并行拼 trend brief(assembleTrendBrief,单路失败只丢该段)。
              trendSourceSignals: (c) => trendSourceSignalsPort(c),
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "topic.enrich" &&
          task.status === "queued"
        ) {
          // 选题补全 node (topic.enrich, 选题中心大改) — fills the 选题卡 (10 详情字段 + 3
          // 指标) for ONE existing 选题候选 (inputData.candidateId), records a `topic_card`
          // candidate; 采纳 upserts the card onto that candidate via the candidate module's
          // enrichCard seam (wired on the AiCandidatePort above). The candidate reader is
          // bound to candidateService.getCandidate (ownership-gated, no cross-module repo
          // import).
          await runTopicEnrich(
            ctx,
            {
              id: String(task.id),
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              signals: signalsReader,
              knowledge: knowledgeReader,
              candidate: {
                get: async (c: RequestContext, candidateId: string) => {
                  const cand = await candidateService.getCandidate(
                    c,
                    candidateId,
                  );
                  return { title: cand.title, angle: cand.angle };
                },
              },
              // Vercel AI SDK 路径:选题补全跑在 ai-worker 结构化节点(外置 topic.enrich 模板
              // + generateObject 绑 outputSchema,落空→文本兜底),跨模型健壮(MiniMax 也稳出)。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "calibration.diagnose" &&
          task.status === "queued"
        ) {
          // AI 编导诊断 node (calibration.diagnose, 校准中心大改 Slice 1) — scores ONE content
          // subject (content_output / publication) against the creator's current 变现加权
          // rubric + records a `calibration_diagnosis` candidate; 采纳 mints a draft Prediction
          // via the calibration_diagnosis confirm branch (wired on the AiCalibrationPort
          // above). The subject reader is bound to the projects/publishing services
          // (ownership-gated, no cross-module repo import); the rubric reader resolves the
          // creator's default rubric's current version.
          await runCalibrationDiagnose(
            ctx,
            {
              id: String(task.id),
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              // Vercel AI SDK 路径(弃 LlmCompleter):AI 编导诊断跑在 ai-worker + 外置模板。
              resolveModelSpec,
              subject: {
                get: async (
                  c: RequestContext,
                  subjectType: string,
                  subjectId: string,
                ) => {
                  if (subjectType === "publication") {
                    // publication → its title + current revision body (the 文稿 the agent
                    // scores). A publication with no revision keeps "" (尽力诊断).
                    const pub = await publishingService.getPublication(
                      c,
                      subjectId,
                    );
                    const revisions = await publishingService.listRevisions(
                      c,
                      subjectId,
                      { limit: 1, offset: 0 },
                    );
                    const rev = revisions[0];
                    return {
                      title: rev?.title || `${pub.platform} 发布`,
                      scriptText: rev?.description ?? "",
                    };
                  }
                  // content_output → its title (the storyboard/文稿 plumbing lands later; the
                  // agent grounds on title + positioning + rubric for Slice 1).
                  const output = await projectsRepo.getOutput(c, subjectId);
                  return { title: output.title, scriptText: "" };
                },
              },
              rubric: {
                current: async (c: RequestContext) => {
                  // The creator's default 变现加权 rubric (canonical seed id) — its current
                  // version's dimensions are exactly what the agent scores. inputData may
                  // override the rubricVersionId; otherwise resolve the default rubric's
                  // current version.
                  // [T-332 S2] per-account 默认 rubric(当前号的 canonical id)。
                  const v = await calibrationService.getCurrentRubricVersion(
                    c,
                    canonicalRubricIdFor(c),
                  );
                  return {
                    rubricVersionId: v.id,
                    dimensions: v.dimensions.map((d) => ({
                      key: d.key,
                      label: d.label,
                      description: d.description,
                    })),
                  };
                },
              },
            },
          );
        } else if (
          task &&
          task.taskType === "calibration.score" &&
          task.status === "queued"
        ) {
          // B2 编导自动评分 node (calibration.score, 数据底座 SPEC §5 / §2 回看·校准) — reads ONE
          // **locked prediction**'s dimensions + that work's **REAL metrics** (from analytics,
          // resolved via publishing — no cross-module repo import, SPEC §22) and records a
          // NON-formalizing `calibration_score` candidate (resultData.dimensions = 维度真实分候选).
          // The frontend reads that candidate to **prefill** the 录入真实表现 form; the human
          // edits/confirms and the EXISTING createResult path (采纳门) lands the calibration_result.
          // The runner NEVER writes calibration_result directly (铁律②). 每轮 schema 约束:
          // generateObject 绑 Zod(calibrationScoreSchema),校验失败 Vercel SDK 自动重试。
          await runCalibrationScore(
            ctx,
            {
              id: String(task.id),
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              // Vercel AI SDK 路径(弃 LlmCompleter):编导自动评分跑在 ai-worker + 外置模板。
              resolveModelSpec,
              prediction: {
                get: async (c: RequestContext, predictionId: string) => {
                  // The locked prediction's 维度评分约定 (predictedConversion.dimensions =
                  // [{key,score,...}]) + subject. Ownership-gated via the calibration public
                  // service (cross-user / unknown → 404). The rubric version resolves each
                  // dimension's 中文 label (取不到回退 key).
                  const pred = await calibrationService.getPrediction(
                    c,
                    predictionId,
                  );
                  const conv = (pred.predictedConversion ?? {}) as {
                    dimensions?: Array<{ key?: unknown; score?: unknown }>;
                  };
                  const rawDims = Array.isArray(conv.dimensions)
                    ? conv.dimensions
                    : [];
                  // Resolve dimension labels from the prediction's rubric version (best-effort).
                  const labelByKey = new Map<string, string>();
                  try {
                    const version =
                      await calibrationService.getCurrentRubricVersion(
                        c,
                        canonicalRubricIdFor(c), // [T-332 S2] per-account 默认 rubric
                      );
                    for (const d of version.dimensions) {
                      labelByKey.set(d.key, d.label);
                    }
                  } catch {
                    /* label is decoration — fall back to key */
                  }
                  const dimensions = rawDims
                    .map((d) => {
                      const key = typeof d.key === "string" ? d.key : "";
                      const predicted =
                        typeof d.score === "number" && Number.isFinite(d.score)
                          ? d.score
                          : null;
                      return {
                        key,
                        label: labelByKey.get(key) ?? key,
                        predicted,
                      };
                    })
                    .filter((d) => d.key !== "");
                  // The subject's 标题 (the work being scored). For a publication, the latest
                  // revision title; for a content_output, its title. Best-effort — 取不到给空串。
                  let title = "";
                  try {
                    if (pred.subjectType === "publication") {
                      const revisions = await publishingService.listRevisions(
                        c,
                        pred.subjectId,
                        { limit: 1, offset: 0 },
                      );
                      title = revisions[0]?.title ?? "";
                    } else {
                      const output = await projectsRepo.getOutput(
                        c,
                        pred.subjectId,
                      );
                      title = output.title;
                    }
                  } catch {
                    /* title is decoration — 尽力评分 */
                  }
                  return {
                    subjectType: pred.subjectType,
                    subjectId: pred.subjectId,
                    title,
                    dimensions,
                  };
                },
              },
              metrics: {
                forSubject: async (
                  c: RequestContext,
                  subjectType: string,
                  subjectId: string,
                ) => {
                  // Real metrics live in analytics' metric_snapshots (rawMetrics jsonb with the
                  // platform payload: views/likes/comments/shares/favorites/finish_rate/...).
                  // For a publication, subjectId IS the publicationId; for a content_output,
                  // resolve its publication(s) via publishing first. Read the LATEST snapshot
                  // per publication (captured-at desc), merge numeric rawMetrics. No snapshot →
                  // [](honest: the runner then scores from title+定位 and says so).
                  const numericMetrics = (
                    raw: Record<string, unknown>,
                  ): Array<{ key: string; value: number }> =>
                    Object.entries(raw)
                      .filter(
                        ([, v]) =>
                          typeof v === "number" && Number.isFinite(v),
                      )
                      .map(([key, v]) => ({ key, value: v as number }));
                  const latestFor = async (
                    publicationId: string,
                  ): Promise<Array<{ key: string; value: number }>> => {
                    try {
                      const page =
                        await analyticsService.getPublicationAnalytics(
                          c,
                          publicationId,
                          1,
                          10,
                        );
                      const latest = page.rows
                        .slice()
                        .sort((a, b) =>
                          b.capturedAt.localeCompare(a.capturedAt),
                        )[0];
                      const raw = (latest?.rawMetrics ?? {}) as Record<
                        string,
                        unknown
                      >;
                      return numericMetrics(raw);
                    } catch {
                      return []; // a single publication's read failing → no metrics, never crash
                    }
                  };
                  let publicationIds: string[] = [];
                  if (subjectType === "publication") {
                    publicationIds = [subjectId];
                  } else {
                    try {
                      const pubs = await publishingService.listPublications(
                        c,
                        subjectId,
                        { limit: 20, offset: 0 },
                      );
                      publicationIds = pubs.map((p) => p.id);
                    } catch {
                      publicationIds = [];
                    }
                  }
                  // Merge metrics across the subject's publications (last写入 wins per key —
                  // a single-publication subject is the common case).
                  const merged = new Map<string, number>();
                  for (const pid of publicationIds) {
                    for (const m of await latestFor(pid)) {
                      merged.set(m.key, m.value);
                    }
                  }
                  return Array.from(merged.entries()).map(([key, value]) => ({
                    key,
                    value,
                  }));
                },
              },
            },
          );
        } else if (
          task &&
          task.taskType === "script.draft" &&
          task.status === "queued"
        ) {
          // 分镜脚本 node — drafts a storyboard from the full creative context, records an
          // `artifact_version` candidate; 采纳 appends a new ArtifactVersion (reuses the
          // existing artifact_version confirm path).
          // [T-184] 声明式 context 注入(script-first 范式):facet-reader deps 不再手列,改由
          // resolveContextDeps 按 SCRIPT_DRAFT_TEMPLATE.contextRequirements 从中央 registry 自动取
          // (positioning/learnings/knowledge/thesis/contract/outline/artifactOrigin/projectMaterials/
          // brief —— 与旧手列逐项一致,零行为变化)。根治「手列漏一个 reader = 该 facet 恒空」
          // (T-182 CLAIM-1 script.draft 漏 knowledge 的根因):现在漏接只可能来自漏声明,声明即真值。
          // ai / resolveModelSpec 是非 facet 基础设施,组合根 always-注入(不进声明/registry)。
          await runScriptDraft(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              ...resolveContextDeps(
                SCRIPT_DRAFT_TEMPLATE.contextRequirements,
                contextReaderRegistry,
              ),
              // positioning 已在 contextRequirements 声明(resolver 已注入同一 positioningReader);
              // 此处显式 pin 仅为满足 ScriptDeps 把 positioning 类型标为必需(值同,零行为变化)。
              positioning: positioningReader,
              // Vercel AI SDK 路径(弃 LlmCompleter):写文案节点跑在 ai-worker + 外置模板。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "planning.thesis" &&
          task.status === "queued"
        ) {
          // 论点树 node (策划 stage) — drafts a thesis tree (核心论点 + 支撑/证据/反驳
          // 分支) from the creative context, records an `artifact_version` candidate;
          // 采纳 appends a new ArtifactVersion onto the project's `thesis_tree` artifact
          // (reuses the existing artifact_version confirm path). The 策划 workspace reads
          // that version's contentData.nodes back into the 论点树 surface.
          // [T-269/T-270] 声明式 context 注入(同 script.draft 范式):按 PLANNING_THESIS_TEMPLATE
          // .contextRequirements 从中央 registry 自动取 reader —— 补上此前手列漏掉的 brief(立项硬锚)
          // + projectMaterials(素材可溯弹药)+ artifactOrigin(F2 反推标注),不再只有 positioning/
          // learnings 两项悬空。positioning 显式 pin 满足 PlanningDeps 必需类型(值同 registry,零行为变化)。
          await runPlanningThesis(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              ...resolveContextDeps(
                PLANNING_THESIS_TEMPLATE.contextRequirements,
                contextReaderRegistry,
              ),
              positioning: positioningReader,
              // [T-387a] 项目弹药 reader(materialLinks ⋈ assets/knowledge 轻量 id+标题+类型
              // 投影,与稿面 readAmmo 同一数据源)—— runner 产树后据此对支撑/证据节点做
              // 确定性词面匹配预挂 1-2 条(source:"ai")。best-effort:单条读失败跳过,
              // 整体失败 runner 侧吞掉不阻塞(零回归)。
              projectAmmo: {
                list: async (c: RequestContext, projectId: string) => {
                  const { rows: links } = await materialLinksService.list(c, {
                    projectId,
                    page: 1,
                    pageSize: 30,
                  });
                  const items: Array<{ id: string; title: string; kind: string }> =
                    [];
                  for (const link of links) {
                    try {
                      if (link.entityType === "knowledge") {
                        const k = await knowledgeService.getKnowledge(
                          c,
                          link.entityId,
                        );
                        items.push({ id: k.id, title: k.title, kind: "knowledge" });
                      } else if (link.entityType === "asset") {
                        const a = await assetsService.getAsset(c, link.entityId);
                        items.push({ id: a.id, title: a.name, kind: a.assetType });
                      }
                    } catch {
                      continue; // 单条越权/已删跳过,不牵连整批
                    }
                  }
                  return items;
                },
              },
              // Vercel AI SDK 路径(弃 LlmCompleter):论点树节点跑在 ai-worker + 外置模板。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "planning.contract" &&
          task.status === "queued"
        ) {
          // 内容合同 node (策划 stage) — drafts the audience contract (受众定位/价值主张/
          // 核心节奏/行动召唤) from 定位 + 选题 + 已采纳论点树, records an `artifact_version`
          // candidate; 采纳 appends a new ArtifactVersion onto the project's
          // `content_contract` artifact (reuses the existing artifact_version confirm path).
          // The 策划 workspace reads that version's contentData.cards back into the 内容合同
          // surface.
          await runPlanningContract(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              thesis: thesisReader,
              // F2:反推论点树注入内容合同上下文时标「未经确认」。
              artifactOrigin: artifactOriginReader,
              // Vercel AI SDK 路径(弃 LlmCompleter):内容合同节点跑在 ai-worker + 外置模板。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "planning.outline" &&
          task.status === "queued"
        ) {
          // 结构方案 node (策划 stage, 脚本阶段入口票) — drafts ONE structure plan
          // (结构类型/开头策略/段落安排/结尾/CTA) from 内容合同 + 论点树, records an
          // `artifact_version` candidate; 采纳 appends a new ArtifactVersion onto the
          // project's `content_outline` artifact (reuses the existing artifact_version
          // confirm path).
          await runPlanningOutline(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              thesis: thesisReader,
              contract: contractReader,
              // F2:反推论点树/合同注入结构方案上下文时标「未经确认」。
              artifactOrigin: artifactOriginReader,
              // [T-284a] 复刻补链 G1:装配 brief reader,让 creative-context 带出 benchmarkRef →
              //   结构方案参照原爆款结构编排(段头诚实门,非复刻项目为空,不污染)。
              brief: briefReader,
              // Vercel AI SDK 路径(弃 LlmCompleter):结构方案节点跑在 ai-worker + 外置模板。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "review.analyze" &&
          task.status === "queued"
        ) {
          await runReviewAnalyze(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              // T-039a:复盘对象 reader —— 让后端复盘 task 也吃到「这一条作品」的真文案/标题/数据/评论
              // (原来只有 positioning + learnings + topic.title → subject 空即账号级泛论)。
              reviewSubject: makeReviewSubjectReader(),
              // Vercel AI SDK 路径(弃 LlmCompleter):复盘节点跑在 ai-worker + 外置模板。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "script.review" &&
          task.status === "queued"
        ) {
          // T-086 文案审核门 —— 单一 dispatch 触发点(下方 resolveModelSpec 后赋值),
          // 与审核门 op 直起任务路径共用同一 runScriptReview 装配(读脚本当前版本 → L1 lint +
          // L2 语义审 → 落 script_review_reports)。此分支覆盖经 ai.tasks.create 起的审核任务。
          await dispatchScriptReview?.(ctx, {
            id: String(task.id),
            projectId:
              typeof task.projectId === "string" ? task.projectId : null,
            inputData: (task.inputData ?? {}) as Record<string, unknown>,
          });
        } else if (
          task &&
          task.taskType === "publish.platform_adapt" &&
          task.status === "queued"
        ) {
          // 一稿多平台 node — adapts one finished script into a per-platform draft
          // (抖音/B站/小红书/公众号), records a `publication_drafts` candidate; 采纳
          // materializes each draft into a real Publication (+ revision) via the
          // publishing port wired above.
          await runPlatformAdapt(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              // Vercel AI SDK 路径(弃 LlmCompleter):一稿多平台节点跑在 ai-worker + 外置模板。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "material.match" &&
          task.status === "queued"
        ) {
          // 素材匹配 node (制作 stage, Plan D2) — scans the creator's asset library and
          // proposes which real assets fit this content (role + reason), records a
          // `material_link_list` candidate; 采纳 ties each match to the project as a
          // material-link (entityType:"asset", stage:"production") via the materialLinks
          // port wired above (素材库⇄制作 live edge).
          await runMaterialMatch(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              assets: assetsReader,
              // Vercel AI SDK 路径:素材匹配跑在 ai-worker 结构化节点(外置 material.match 模板
              // + generateObject 绑 outputSchema,落空→文本兜底),跨模型健壮(MiniMax 也稳出)。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "video.decisions" &&
          task.status === "queued"
        ) {
          // [T-254b] 制作视频四决策 node(video.decisions,SPEC 2026-07-11 §3.1 步骤 2-3)——
          // 粗剪 SRT + 口播稿 → ①语义分场 ②信息卡(可溯剔除)③B-roll(清单硬门)④双语字幕,
          // 四个 runStructuredNode 顺序编排,产 `video_decisions` 候选(awaiting_confirmation)→
          // 前端分场预览卡过目可改,确认才组 props 交渲染(T-254a video.render executor)。
          // 素材清单投影只读当前账号下的当前项目；缺项目/越权直接失败，绝不回退整库。
          await runVideoDecisions(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              resolveModelSpec,
              // [T-309/T-387c] B-roll 备料自动聚合:数据源从「项目 material-links」扩为——
              //   ① 脚本凝固分镜点名的素材(visual.assetRefs,source:"script")
              //   ② 论点树挂载的图/视频素材(thesis_tree nodes[].materialRefs,source:"thesis")
              //   ③ 项目弹药 image/video 资产(material-links;role=broll 手动上传标 "manual",
              //      其余标 "ammo";role=clip 口播原片仍排除)
              listBrollInventory: (c, projectId) =>
                collectProjectBrollInventory(c, projectId, {
                  assertProjectAccess: async (scopeCtx, scopeProjectId) => {
                    await projectsService.listOutputIdsByProject(
                      scopeCtx,
                      scopeProjectId,
                    );
                  },
                  readArtifactContentData,
                  listProjectMaterialLinks: async (
                    scopeCtx,
                    scopeProjectId,
                  ) =>
                    (
                      await materialLinksService.list(scopeCtx, {
                        projectId: scopeProjectId,
                        page: 1,
                        pageSize: 100,
                      })
                    ).rows,
                  getAsset: (scopeCtx, assetId) =>
                    assetsService.getAsset(scopeCtx, assetId),
                }),
              // [T-387c] 凝固分镜 reader:output_script 当前版本 contentData → 分镜投影
              // (storyboardFromContentData 宽容解析;旧稿无 visual → 空数组 → facet 空 = 现状)。
              readStoryboard: async (c, projectId) => {
                if (!projectId) return [];
                try {
                  return storyboardFromContentData(
                    await readArtifactContentData(c, projectId, "output_script"),
                  );
                } catch {
                  return [];
                }
              },
            },
          );
        } else if (
          task &&
          task.taskType === "positioning.generate" &&
          task.status === "queued"
        ) {
          // 定位生成 node (positioning.generate, Plan Phase A — the audit's level-1 gap:
          // 定位中心 could only *use* positioning, never *generate* one). Reads the
          // creator's CURRENT positioning + 抖音账号画像, runs the configurable LLM
          // (item A) to draft a structured 定位提案, records a `positioning_profile`
          // candidate; 采纳 formalizes it into a CreatorProfile (upsertProfile) + a NEW
          // statement version (createdByType:"ai", aiTaskId) via the positioning port —
          // the OQ2 演进回流 source.
          await runPositioningGenerate(
            ctx,
            {
              id: String(task.id),
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              accounts: accountsReader,
              // [T-578] 与 ChatBox positioning.generate 共用同一定位作品 reader：
              // 当前账号 canonical 可见 + 真实 publishedAt 新→旧。
              positioningWorks: positioningWorksReader,
              // Vercel AI SDK 路径:定位生成跑在 ai-worker 结构化节点(外置 positioning.generate
              // 模板 + generateObject 绑 outputSchema,落空→文本兜底),跨模型健壮(MiniMax 也稳出)。
              resolveModelSpec,
            },
          );
        } else if (
          task &&
          task.taskType === "asset.generate" &&
          task.status === "queued"
        ) {
          // 生成素材 node (asset.generate, L5 录制, SPEC 2026-07-01 §3 / M2) — AI 生图/生视频
          // (用户可配 provider,铁律:绝不写死 MiniMax)→ 落对象存储(P3 直写 putObject)→ 建
          // asset(候选态)→ records a `generated_asset` candidate; 采纳 ties the generated asset
          // into the 用料链 for the project (entityType:"asset", stage:"production") via the
          // materialLinks port wired above. video 的异步轮询(submit→poll→retrieve + 超时)封在
          // M1 minimax 适配器内;超时/失败 → runner catch → cancelTask(UI 失败态,绝不卡 running)。
          // 未配 image.generate/video.generate model → MultimodalConfigError → cancelTask(诚实禁用)。
          await runAssetGenerate(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              // 多模态解析(按 image.generate/video.generate capability 解析用户配的 provider/
              // model/key),与文本层 resolveModelSpec 并列。
              resolveMultimodalSpec,
              // provider 适配器注册表(真 MiniMax;加 provider = 注册一个适配器,不改 runner)。
              registry: multimodalRegistry,
              // 建 asset 的窄端口 —— 落字节到对象存储 + 建 asset 行(候选态,未绑项目)。绑到
              // AssetsService 的服务端直写方法(SOLE object-storage caller,SPEC §15)。
              assets: {
                createGeneratedAsset: async (c, input) => {
                  const row = await assetsService.createGeneratedAsset(c, input);
                  return {
                    id: row.id,
                    name: row.name,
                    assetType: row.assetType,
                  };
                },
              },
            },
          );
        } else if (
          task &&
          task.taskType === "cover.generate" &&
          task.status === "queued"
        ) {
          // [T-271] 制作封面链 node —— 结构化封面方案(硬锚立项 brief 核心信息/内容形式 + 口播稿主张)
          // → 封面文案诚实门(annotateUngroundedClaims,数字/成绩只能从内容提取禁编造)→ 生图 prompt
          // 由结构化方案确定性组装(非裸自由文本)→ 走既有 image.generate 生图(模型用户可配,铁律不写死
          // MiniMax)→ 记 generated_asset 候选(**复用既有 asset 采纳门**,人采纳才绑项目用料链,铁律②)。
          // 声明式 context 注入(同 script.draft/planning.thesis 范式):按 COVER_BRIEF_TEMPLATE
          // .contextRequirements 从中央 registry 自动取 reader —— brief(立项硬锚)+ reviewSubject(读
          // 口播稿)+ projectMaterials(封面数字可溯来源)+ knowledge。文本层 resolveModelSpec(封面方案)
          // 与多模态 resolveMultimodalSpec/multimodalRegistry(生图)并列注入,是封面链「文案 + 图」两产物
          // 的两套模型解析。positioning 显式 pin 满足 CoverGenerateDeps 必需类型(值同 registry)。
          await runCoverGenerate(
            ctx,
            {
              id: String(task.id),
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: aiService,
              ...resolveContextDeps(
                COVER_BRIEF_TEMPLATE.contextRequirements,
                contextReaderRegistry,
              ),
              positioning: positioningReader,
              // 封面方案(文案)的文本模型(Vercel SDK;复用 copy.generate capability)。
              resolveModelSpec,
              // 封面图的多模态模型(image.generate;用户可配)+ provider 适配器注册表 + 建 asset 窄端口
              // —— 与 asset.generate 生图同一套(不重造生图能力)。
              resolveMultimodalSpec,
              registry: multimodalRegistry,
              // 建生成 asset 的写端口(命名避开 ContextDeps.assets 素材库读端口)。
              generatedAssets: {
                createGeneratedAsset: async (c, input) => {
                  const row = await assetsService.createGeneratedAsset(c, input);
                  return {
                    id: row.id,
                    name: row.name,
                    assetType: row.assetType,
                  };
                },
              },
              // [T-380] 以图生图风格参考读端口(user-scoped 读素材字节;inputData.
              // referenceAssetId 存在时 runner 读它喂生图 adapter 的 image-to-image)。
              referenceAssets: {
                getAssetBytes: (c, assetId) =>
                  assetsService.getAssetBytes(c, assetId),
              },
            },
          );
        } else if (
          task &&
          task.taskType === "asset.classify" &&
          task.status === "queued"
        ) {
          // [T-055h SPEC §6.2 第二层] 素材 AI 归类 —— 倾倒场上传完成后 fire-and-forget:
          // VLM(用户可配 asset.classify capability)看图打标签+一句话描述;未配置诚实跳过
          // (只跑确定性第一层),绝不阻塞上传主链。
          await runAssetClassify(
            ctx,
            {
              id: String(task.id),
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: {
                markRunning: (c, id) => aiService.markRunning(c, id),
                recordStep: (c, id, stepInput) =>
                  aiService.recordStep(c, id, stepInput),
                markSucceeded: (c, id) => aiService.markSucceeded(c, id),
                markFailed: (c, id, err) => aiService.markFailed(c, id, err),
              },
              resolveVisionSpec: (c) =>
                resolveMultimodalSpecFn(c, "asset.classify", {
                  getModelConfig: (cc: RequestContext, cap: string) =>
                    settingsService.getModelConfig(cc, cap),
                  env: process.env,
                }),
              assets: {
                getAssetBytes: (c, id) => assetsService.getAssetBytes(c, id),
                mergeAiAnnotation: (c, id, patch) =>
                  assetsService.mergeAiAnnotation(c, id, patch),
              },
              // taxonomy 落标签:同名 tag 幂等(list 命中复用,缺则 create),再 assign。
              assignTags: async (c, assetId, tags) => {
                const taxonomySvc = createTaxonomyService(taxonomyRepo);
                const listed = await taxonomySvc.listTags(c, { limit: 200 });
                const byName = new Map(
                  listed.map((t: { name: string; id: string }) => [t.name, t.id]),
                );
                const tagIds: string[] = [];
                for (const name of tags) {
                  const hit = byName.get(name);
                  if (hit) {
                    tagIds.push(hit);
                    continue;
                  }
                  const created = await taxonomySvc.createTag(c, {
                    name,
                    kind: "asset-usage",
                  });
                  tagIds.push(created.id);
                }
                await taxonomySvc.assignTags(c, {
                  entityType: "asset",
                  entityId: assetId,
                  tagIds,
                });
              },
              describeImage: async (spec, input) => {
                const { describeImageOpenAICompatible } = await import(
                  "@creatoros/ai-worker"
                );
                return describeImageOpenAICompatible(spec, input);
              },
            },
          );
        } else if (
          task &&
          task.taskType === "material.extract" &&
          task.status === "queued"
        ) {
          // [T-146 切片 a SPEC §1] 用户上传文档抽取 —— 上传 document 完成后 fire-and-forget:
          // ① 确定性抽全文(pdf-parse/mammoth/UTF-8,无 AI)② AI 摘要要点卡(复用现有文本模型
          // script.draft capability + runStructuredNode,不新增 capability)。三类诚实降级(抽取
          // 失败/未配摘要模型/超长截断),绝不阻塞上传主链。
          await runMaterialExtract(
            ctx,
            {
              id: String(task.id),
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: {
                markRunning: (c, id) => aiService.markRunning(c, id),
                recordStep: (c, id, stepInput) =>
                  aiService.recordStep(c, id, stepInput),
                markSucceeded: (c, id) => aiService.markSucceeded(c, id),
                markFailed: (c, id, err) => aiService.markFailed(c, id, err),
              },
              assets: {
                getAssetBytes: (c, id) => assetsService.getAssetBytes(c, id),
                updateExtraction: (c, id, patch) =>
                  assetsService.updateFileExtraction(c, id, patch),
                mergeSummary: (c, id, summary) =>
                  assetsService.mergeAiAnnotation(c, id, {
                    materialSummary: summary,
                  }),
              },
              // 阶段①确定性抽全文:按 family 分派纯文本抽取器(只取文本层,不执行 PDF JS / Word 宏)。
              extractText: async (family, bytes) => {
                if (family === "plaintext") {
                  return new TextDecoder("utf-8").decode(bytes);
                }
                if (family === "docx") {
                  const mammoth = (await import("mammoth")).default;
                  const { value } = await mammoth.extractRawText({
                    buffer: Buffer.from(bytes),
                  });
                  return value;
                }
                // pdf:pdf-parse v2 —— new PDFParse({ data }).getText().text(纯文本层)。
                const { PDFParse } = await import("pdf-parse");
                const parser = new PDFParse({ data: bytes });
                const result = await parser.getText();
                return result.text;
              },
              // 阶段② AI 摘要:复用现有文本模型(script.draft capability)+ runStructuredNode 绑
              // materialSummary JSON schema(逃生口,不污染 registry / 不新增 capability)。未配模型
              // → LlmCredentialError → 转 MaterialSummaryModelNotConfiguredError(runner 诚实降级)。
              summarize: async (fullText) => {
                let spec: Awaited<ReturnType<typeof resolveModelSpec>>;
                try {
                  spec = await resolveModelSpec(ctx, "script.draft");
                } catch (err) {
                  if (err instanceof LlmCredentialError) {
                    throw new MaterialSummaryModelNotConfiguredError(
                      err.message,
                    );
                  }
                  throw err;
                }
                // [T-163 Batch 4] AI 摘要节点(模板 + jsonSchema + runStructuredNode)已下沉
                // backend ai-runtime;组合根只解析 spec + 映射未配错误,把 spec 传进去。
                return runMaterialSummary(spec, fullText);
              },
            },
          );
        } else if (
          task &&
          task.taskType === "transcribe.douyin" &&
          task.status === "queued"
        ) {
          // 抖音逐字稿采集 node(transcribe.douyin, T-030-D2, SPEC §5.2/§5.3)—— 取音频(iesdouyin
          // 无水印直链 + ffmpeg 抽 mp3)→ 云端 ASR(用户可配 provider,铁律:绝不写死)→ 按 aweme_id
          // 绑 imported 作品的 script transcript artifact(幂等,已有则跳过 fetch/ASR 省流)。F7 失败
          // 分类:ASR 未配(TranscribeConfigError)→ 整任务停 markFailed + 引导;取音频失败 → 标该
          // aweme 失败其余继续。端口全注入真依赖(下方装配),runner 本身可确定性单测(见 test)。
          await runTranscribe(
            ctx,
            {
              id: String(task.id),
              taskType: task.taskType,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: {
                markRunning: (c, id) => aiService.markRunning(c, id),
                recordStep: (c, id, stepInput) =>
                  aiService.recordStep(c, id, stepInput),
                markSucceeded: (c, id) => aiService.markSucceeded(c, id),
                markFailed: (c, id, err) => aiService.markFailed(c, id, err),
              },
              // 取无水印直链 —— [T-243] host 绑组合入口 fetchDouyinVideoSource:
              //   ① iesdouyin 匿名分享页(快,无 cookie);② 解析失败(item_list 空等,对部分
              //   可见作品就是解析不出)→ 回落登录态 detail 接口(.auth/douyin/<accountId>,
              //   页内 fetch 借 cookie);③ 图集识别 → { kind:"image-album" }(runner 诚实跳过)。
              // [gate-F7 插装点①] 两条路各走各的 channel 限流(iesdouyin / creator-center),注真单例。
              fetchVideoUrl: async (c, awemeId) =>
                (await loadDouyinCdp()).fetchDouyinVideoSource({
                  awemeId,
                  authDir: douyinAuthDirFor(c.accountId), // [T-136] 按当前号登录态
                  gateway: douyinGateway,
                }),
              // 抽音频 bytes(ffmpeg)—— host 绑真 streamAudioFromVideo(默认 child_process.spawn)。
              streamAudio: async (_c, playUrl) =>
                (await loadDouyinCdp()).streamAudioFromVideo(playUrl),
              // 解析用户配的 ASR model(transcribe.audio;未配抛 TranscribeConfigError → 整任务停)。
              resolveTranscribeSpec: (c) =>
                resolveTranscribeSpecFn(c, {
                  getModelConfig: (cc, cap) =>
                    settingsService.getModelConfig(cc, cap),
                  env: process.env,
                }),
              // 云端 ASR 转写(ai-worker 工厂,按 spec.provider 取 ASR 适配器)。
              transcribeAudio: (spec, opts, registry) =>
                transcribeAudioFn(spec, opts, registry),
              // ASR provider 适配器注册表 —— OpenAI 兼容 adapter 一件覆盖 SiliconFlow/OpenAI/Groq
              // (同形状转写端点);按用户所配 provider 名归一到同一适配器,加 provider 只需在此注册。
              registry: asrRegistry,
              // 幂等**只读**探测:该 aweme 是否已有 output_script transcript artifact(content_data.awemeId
              // 命中)。只读组合 findImportedByRef + listProjectArtifacts + getVersion,不写(不像 ensure
              // 那样「不存在则建」),故可安全当省流探针(已有 → 跳过 fetch/ASR)。
              hasTranscriptArtifact: async (c, awemeId) => {
                const p = await projectsRepo.findImportedByRef(c, {
                  platform: "douyin",
                  externalId: awemeId,
                });
                if (!p) return false;
                const rows = await artifactsService.listProjectArtifacts(
                  c,
                  p.id,
                );
                const repo = createArtifactRepository(db, {
                  ...deps,
                  userId: c.userId,
                  // [T-332 S2] strict:artifact 是 per-account 域,未选号 → AccountRequiredError。
            accountId: requireAccountId(c.accountId, "artifacts.repo"),
                });
                for (const r of rows) {
                  if (r.artifactType !== "output_script") continue;
                  if (!r.currentVersionId) continue;
                  const version = await repo.getVersion(r.currentVersionId);
                  const data = version.contentData as
                    | Record<string, unknown>
                    | null
                    | undefined;
                  if (data && data.awemeId === awemeId) return true;
                }
                return false;
              },
              // [T-230] 冷却延迟重试三件套:runner 检测到冷却类失败 → 查通道剩余 → 上限内
              //   sleep 到冷却结束重试失败子集一次(幂等锚已保成功子集不重转)。
              //   判别用 instanceof(runner 不 import 前端 ingestion,经注入,同 isNotLoggedInError 先例)。
              isCooldownError: (e) => e instanceof DouyinCooldownActiveError,
              //   剩余冷却取两通道 max:transcribe 主路走 iesdouyin,解析失败回落登录态 detail
              //   走 creator-center —— 任一在冷却都会让重试再撞,保守等最长的。
              getCooldownRemainMs: () =>
                Math.max(
                  douyinGateway.getChannelStatus("iesdouyin").cooldownEtaMs,
                  douyinGateway.getChannelStatus("creator-center").cooldownEtaMs,
                ),
              //   等待上限 env 可配(默认 30min;> gateway 单通道 maxAcquireWaitMs 15min,
              //   覆盖真机撞到的「剩 960s」场景;仍 < T-207 ai_task 僵尸阈值 2h,不会被误扫)。
              maxCooldownWaitMs: (() => {
                const raw = Number(
                  process.env.CREATOROS_TRANSCRIBE_COOLDOWN_WAIT_MAX_MS,
                );
                return Number.isFinite(raw) && raw > 0
                  ? Math.floor(raw)
                  : 30 * 60 * 1000;
              })(),
              // [T-357] 采集逐字稿后处理:ASR 文本落库前轻 AI 校正(同音错字+补标点+语义分段)。
              //   capability 复用 video.subtitles(T-320a「ASR 认错字校正」同任务族既有档,未配
              //   自动回退 default 行 → env,零新增配置负担,绝不写死厂商);上下文可选注入:
              //   账号定位 oneLiner + imported 作品标题(有就带,拿不到就裸纠,best-effort 不抛);
              //   runTranscriptPostprocess 自身绝不抛(失败/越权改写 → 落原文 + reason 注记)。
              postprocessTranscript: async (c, ppInput) => {
                let accountPositioning: string | undefined;
                let title: string | undefined;
                try {
                  const center =
                    await positioningService.getPositioningCenter(c);
                  accountPositioning =
                    center.currentStatement?.oneLiner || undefined;
                } catch {
                  /* 可选上下文,拿不到就裸纠 */
                }
                try {
                  const p = await projectsRepo.findImportedByRef(c, {
                    platform: "douyin",
                    externalId: ppInput.awemeId,
                  });
                  title = p?.title || undefined;
                } catch {
                  /* 同上 */
                }
                return runTranscriptPostprocess(
                  c,
                  {
                    transcript: ppInput.transcript,
                    accountPositioning,
                    title,
                  },
                  { resolveModelSpec },
                );
              },
              // 幂等绑作品:ensureTranscriptArtifact + 其 5 端口(projectsRepo/artifactsService 现成实例)。
              ensureTranscriptArtifact: (c, ensureInput) =>
                ensureTranscriptArtifact(c, ensureInput, {
                  findImportedProjectByAwemeId: async (cc, awemeId) => {
                    const p = await projectsRepo.findImportedByRef(cc, {
                      platform: "douyin",
                      externalId: awemeId,
                    });
                    return p?.id ?? null;
                  },
                  listProjectArtifacts: async (cc, projectId) => {
                    const rows = await artifactsService.listProjectArtifacts(
                      cc,
                      projectId,
                    );
                    return rows.map((r) => ({
                      id: r.id,
                      artifactType: r.artifactType,
                      currentVersionId: r.currentVersionId,
                    }));
                  },
                  getVersionContentData: async (cc, versionId) => {
                    // service 无 by-versionId 读 → per-ctx 现取 artifacts repo 的 getVersion。
                    const repo = createArtifactRepository(db, {
                      ...deps,
                      userId: cc.userId,
                      // [T-332 S2] strict:artifact 是 per-account 域,未选号 → AccountRequiredError。
                      accountId: requireAccountId(cc.accountId, "artifacts.repo"),
                    });
                    const version = await repo.getVersion(versionId);
                    const data = version.contentData;
                    return data &&
                      typeof data === "object" &&
                      !Array.isArray(data)
                      ? (data as Record<string, unknown>)
                      : null;
                  },
                  createScriptArtifact: (cc, artifactInput) =>
                    artifactsService.createArtifact(cc, artifactInput),
                  createArtifactVersion: (cc, artifactId, versionInput) =>
                    artifactsService.createVersion(cc, artifactId, versionInput),
                }),
            },
          );
        } else if (
          task &&
          task.taskType === "reconstruct.project" &&
          task.status === "queued"
        ) {
          // 作品初始化 auto-fill 重建 node(reconstruct.project, T-030-D4, SPEC §4.5/§6/§7)——
          // 仅 source='imported' 的已发布作品:逐字稿(D3)+ 真实指标 + 定位 → runStructuredNode
          // 产 { research, planning } → 物化 research(trend_analysis)+ planning(thesis_tree),
          // **均 origin='reconstructed'**(F1)。§5 守卫:runner 断言仅 imported,manual/topic 不触发。
          // 确定性终态 runner(不产候选、不过采纳门,§6.1 明确不走 candidate 确认路径)。端口全注入。
          await runReconstruct(
            ctx,
            {
              id: String(task.id),
              taskType: task.taskType,
              projectId:
                typeof task.projectId === "string" ? task.projectId : null,
              inputData: (task.inputData ?? {}) as Record<string, unknown>,
            },
            {
              ai: {
                markRunning: (c, id) => aiService.markRunning(c, id),
                recordStep: (c, id, stepInput) =>
                  aiService.recordStep(c, id, stepInput),
                markSucceeded: (c, id) => aiService.markSucceeded(c, id),
                markFailed: (c, id, err) => aiService.markFailed(c, id, err),
              },
              positioning: positioningReader,
              learnings: learningsReader,
              resolveModelSpec,
              // §5 守卫(边界①):读该项目 source,断言仅 imported(非 imported → runner markFailed 不写)。
              getProjectSource: async (c, projectId) => {
                try {
                  const row = await projectsRepo.get(c, projectId);
                  return row.source ?? null;
                } catch {
                  return null; // 读不到 → runner 视为非 imported → 失败,不误触发
                }
              },
              // 读该作品逐字稿(D3 绑的 output_script transcript artifact 当前版本 contentText/
              // contentData.transcript)。走公开 service(listProjectArtifacts)+ per-ctx repo getVersion。
              getTranscript: async (c, projectId) => {
                const rows = await artifactsService.listProjectArtifacts(
                  c,
                  projectId,
                );
                const repo = createArtifactRepository(db, {
                  ...deps,
                  userId: c.userId,
                  // [T-332 S2] strict:artifact 是 per-account 域,未选号 → AccountRequiredError。
            accountId: requireAccountId(c.accountId, "artifacts.repo"),
                });
                for (const r of rows) {
                  if (r.artifactType !== "output_script") continue;
                  if (!r.currentVersionId) continue;
                  const version = await repo.getVersion(r.currentVersionId);
                  const data = version.contentData as
                    | Record<string, unknown>
                    | null
                    | undefined;
                  const t =
                    data && typeof data.transcript === "string"
                      ? data.transcript
                      : version.contentText;
                  if (t && t.trim()) return t;
                }
                return null;
              },
              // 读该作品真实指标摘要(digg/comment/play 等)——解析项目 publications → 最新 snapshot
              // 的 rawMetrics(views/likes/comments/...)→ 人类可读串喂给模型(数据是真实值,模型不改)。
              getMetricsSummary: async (c, projectId) => {
                try {
                  const outputIds =
                    await projectsService.listOutputIdsByProject(c, projectId);
                  const merged = new Map<string, number>();
                  for (const outputId of outputIds) {
                    let pubs: Array<{ id: string }> = [];
                    try {
                      pubs = await publishingService.listPublications(
                        c,
                        outputId,
                        { limit: 20, offset: 0 },
                      );
                    } catch {
                      pubs = [];
                    }
                    for (const pub of pubs) {
                      try {
                        const page =
                          await analyticsService.getPublicationAnalytics(
                            c,
                            pub.id,
                            1,
                            10,
                          );
                        const latest = page.rows
                          .slice()
                          .sort((a, b) =>
                            b.capturedAt.localeCompare(a.capturedAt),
                          )[0];
                        const raw = (latest?.rawMetrics ?? {}) as Record<
                          string,
                          unknown
                        >;
                        for (const [k, v] of Object.entries(raw)) {
                          if (typeof v === "number" && Number.isFinite(v)) {
                            merged.set(k, v);
                          }
                        }
                      } catch {
                        /* single publication read failing → skip, never crash */
                      }
                    }
                  }
                  if (merged.size === 0) return "";
                  const LABELS: Record<string, string> = {
                    views: "播放",
                    plays: "播放",
                    likes: "点赞",
                    digg: "点赞",
                    comments: "评论",
                    shares: "分享",
                    favorites: "收藏",
                    finish_rate: "完播率",
                  };
                  return Array.from(merged.entries())
                    .map(([k, v]) => `${LABELS[k] ?? k}：${v}`)
                    .join(" · ");
                } catch {
                  return "";
                }
              },
              // 物化重建产物 —— createArtifact(origin='reconstructed')+ createVersion 写内容
              // (createdByType='ai' + 显式 origin='reconstructed';F1 强制,消费侧靠 origin 隔离)。
              artifacts: {
                materializeReconstructed: async (c, matInput) => {
                  const artifact = await artifactsService.createArtifact(c, {
                    projectId: matInput.projectId,
                    title: matInput.title,
                    artifactType: matInput.artifactType,
                    stage: matInput.stage,
                    origin: "reconstructed",
                  });
                  await artifactsService.createVersion(c, artifact.id, {
                    contentText: matInput.contentText,
                    contentData: matInput.contentData,
                    changeSummary: "AI 历史反推重建",
                    createdByType: "ai",
                    origin: "reconstructed",
                  });
                  return { id: artifact.id };
                },
              },
            },
          );
        } else if (
          task &&
          typeof task.taskType === "string" &&
          task.taskType.startsWith("scheduled.") &&
          task.status === "queued"
        ) {
          // 调度采集 node (scheduled.self.metrics | scheduled.comments, T-007 D3, SPEC
          // 2026-06-30 §3/§5) — 确定性、不调 LLM 的又一个 live dispatch runner。区别于上面
          // 15 个 LLM runner:不产候选、不过采纳门,直接调注入的 collector 抓真数据(fetchDouyin
          // Metrics/Comments,数值程序化抽取)→ ingestion 落库 → 合成 step 写 ai_task_steps →
          // task succeeded → 回填 job_run。未登录 → job_run needs_reconnect(§6);任一异常 →
          // task failed + job_run failed(finally 兜底,绝不悬挂 running)。**不碰死链
          // drainQueue/runTask(见 SPEC 顶部🔧)。** 触发经 dispatchScheduledCollection(与调度器
          // triggerScheduledJob 共用的单一触发点,下方装配)。
          await dispatchScheduledCollection?.(ctx, {
            id: String(task.id),
            taskType: task.taskType,
            inputData: (task.inputData ?? {}) as Record<string, unknown>,
          });
        }
        };
        // 真 runner promise 留在 snapshot/lease scope 内等待；最外层才 fire-and-forget，
        // 保持 create API 立即返回 taskId，同时 heartbeat 不会因 `void runXxx` 提前结束。
        void runTaskWithEffectiveSkillSnapshot(
          ctx,
          String(task.id),
          dispatchCreatedTask,
        ).catch(async (error) => {
          const message =
            error instanceof Error ? error.message : String(error);
          await aiService
            .markFailed(ctx, String(task.id), message)
            .catch(() => undefined);
        });
      }
      // 全局 AI 助手 (copilot.assist) — a USER message create fires the positioning-aware
      // assistant runner in the BACKGROUND (fire-and-forget, mirrors the task triggers).
      // The runner reads the conversation, assembles the positioning brief (+ 飞轮
      // learnings), runs real Claude, and appends the assistant reply via the service; the
      // UI polls listMessages for it. The AI module/service stays deterministic.
      if (endpoint.id === "ai.conversations.messages.create" && ctx) {
        const { params, body } = (input ?? {}) as {
          params?: { conversationId?: string };
          body?: { projectId?: string };
        };
        const conversationId =
          typeof params?.conversationId === "string"
            ? params.conversationId
            : "";
        if (conversationId) {
          const positioningReader = {
            getPositioningCenter: (c: RequestContext) =>
              positioningService.getPositioningCenter(c),
          };
          const learningsReader = {
            getSuggestions: (c: RequestContext, opts: { limit?: number }) =>
              learningsService.getSuggestions(c, opts),
          };
          void runCopilotAssist(
            ctx,
            {
              conversationId,
              projectId:
                typeof body?.projectId === "string" ? body.projectId : null,
            },
            {
              ai: aiService,
              positioning: positioningReader,
              learnings: learningsReader,
              llm: llmCompleter,
            },
          );
        }
      }
      return res;
    },
  };

  // [T-255a] Execution 执行层装配(脑手分离,SPEC 2026-07-11 execution-layer §2)。
  // 存储复用 ai_tasks(taskType `exec.*`,六态+步骤流+结果表现成,零新表);模块本体
  // 零 db 依赖 —— AI 端口走 aiService,产物入库走 assetsService(SOLE object-storage
  // caller)。executor 注册表:demo `echo.manifest` 先行(框架自检),T-254a 在
  // registerBuiltinExecutors 追加 video.render。
  const executorRegistry = createExecutorRegistry();
  // [T-281] 注入 Chromium 下载器:未装时 video.render 自动 `playwright install chromium`
  //   (复用 douyin 的 frontend-context 实现,解析基准对;executor 在 backend chunk 里 resolve
  //   playwright 会「too dynamic」运行时崩)。下载 ~340MB 前后回步骤流报诚实进度,装过秒过。
  registerBuiltinExecutors(executorRegistry, {
    videoDownloadChromium: async (onProgress) => {
      onProgress?.("首次渲染需下载 Chromium(~340MB),下载中…(之后共享缓存,秒过)");
      await (await loadDouyinCdp()).ensureChromiumInstalled();
      onProgress?.("Chromium 下载完成");
    },
  });
  const executionWorkspacesRoot = resolveWorkspacesRoot();
  const executionService = createExecutionService({
    ai: {
      createTask: (c, body) => aiService.createTask(c, body),
      getTask: (c, taskId) => aiService.getTask(c, taskId),
      listTasks: (c, page) => aiService.listTasks(c, page),
      listResults: (c, taskId) => aiService.listResults(c, taskId),
      recordAuxResult: (c, taskId, input) =>
        aiService.recordAuxResult(c, taskId, input),
      markSucceeded: (c, taskId) => aiService.markSucceeded(c, taskId),
      cancelTask: (c, taskId) => aiService.cancelTask(c, taskId),
    },
    assets: {
      // 采纳入库:沙箱 out/ 实体 → 对象存储 + asset 行(与 asset.generate 同一直写链)。
      createGeneratedAsset: async (c, input) => {
        const row = await assetsService.createGeneratedAsset(c, input);
        return { id: row.id };
      },
    },
    hasExecutor: (t) => executorRegistry.has(t),
    // [T-256b] 判定规则建任务端 gate:taskType 命名判定的循环类型必须与其 executor 声明一致
    // (agentic 执行器在下方 llmCompleter 就绪后追加注册;请求期才读,注册已完成)。
    loopTypeOf: (t) => executorRegistry.loopTypeOf(t),
    workspacesRoot: executionWorkspacesRoot,
    // 丢弃在跑任务 → 中止其 executor(abort signal 贯通,T-239c 模式)。
    abortRun: abortExecutionTask,
  });
  const persistentTaskService = createPersistentTaskService(db, {
    now: deps.now,
    nextId: deps.nextId,
  });
  // T-482 startup recovery：上次进程退出时仍持有租约的任务，按 checkpoint / attempt
  // 预算回到队列或诚实失败；控制请求则收敛到 paused / cancelled。
  await persistentTaskService.recoverExpiredLeases();
  const executionBase = createExecutionTransport(
    () => executionService,
    () => persistentTaskService,
  );
  let createTopicFromIntelligence: (
    ctx: RequestContext,
    input: {
      title: string;
      angle: string;
      card?: {
        oneLiner: string;
        hook?: string;
        contentStructure?: string[];
        materialBasis?: string;
        riskNote?: string;
        proposal?: string;
      };
      sourceReferences?: Array<{
        kind: "original_video" | "source_page";
        platform: string;
        label: string;
        url: string;
        intelligenceItemId?: string;
      }>;
    },
  ) => Promise<{ id: string }> = async () => {
    throw new Error("CandidateServiceNotReady");
  };
  let platformAccountServiceForCollectors: PlatformAccountService | null =
    null;
  const requirePlatformAccountServiceForCollectors = () => {
    if (!platformAccountServiceForCollectors) {
      throw new Error("PlatformAccountServiceNotReady");
    }
    return platformAccountServiceForCollectors;
  };
  const intelligenceService = createIntelligenceService(db, {
    now: deps.now,
    nextId: deps.nextId,
    tasks: persistentTaskService,
    positioning: {
      getVersion: async (ctx, positioningVersionId) => {
        const statement = await positioningService.getStatement(
          ctx,
          positioningVersionId,
        );
        return {
          id: statement.id,
          oneLiner: statement.oneLiner,
          keywords: statement.keywords,
        };
      },
    },
    topics: {
      create: (ctx, input) => createTopicFromIntelligence(ctx, input),
    },
    collectorAccounts: {
      listCollectorAccounts: async (ctx) => {
        const { rows } =
          await requirePlatformAccountServiceForCollectors().listAccounts(
            ctx,
            { platform: "douyin", limit: 1_000, offset: 0 },
          );
        return rows.map((row) => ({
          accountId: row.id,
          accountHandle: row.accountHandle,
          platform: row.platform,
          status: row.status,
        }));
      },
      getCollectorAccount: async (ctx, accountId) => {
        try {
          const row =
            await requirePlatformAccountServiceForCollectors().getAccount(
              ctx,
              accountId,
            );
          return {
            accountId: row.id,
            accountHandle: row.accountHandle,
            platform: row.platform,
            status: row.status,
          };
        } catch (error) {
          if (error instanceof OwnershipError) return null;
          throw error;
        }
      },
    },
  });
  const projectIntelligenceReferences =
    createProjectIntelligenceReferenceService(db, {
      now: deps.now,
      nextId: deps.nextId,
      projects: {
        assertExists: async (ctx, projectId) => {
          await projectsBaseTransport.request(
            ENDPOINTS.getProject,
            {
              params: { projectId },
              query: undefined,
              body: undefined,
            },
            ctx,
          );
        },
      },
    });
  const projectScriptCandidates = createProjectScriptCandidateService({
    tasks: persistentTaskService,
    references: projectIntelligenceReferences,
    artifacts: {
      listProjectArtifacts: (ctx, projectId) =>
        artifactsService.listProjectArtifacts(ctx, projectId),
      createArtifact: (ctx, input) =>
        artifactsService.createArtifact(ctx, input),
      listVersions: (ctx, artifactId) =>
        artifactsService.listVersions(ctx, artifactId),
      createVersion: (ctx, artifactId, input) =>
        artifactsService.createVersion(ctx, artifactId, input),
    },
    similarity: {
      evaluate: async (ctx, input) => {
        const {
          SCRIPT_SOURCE_SIMILARITY_TEMPLATE,
          scriptSourceSimilaritySchema,
          modelFor,
          runStructuredNode,
        } = await import("@creatoros/ai-worker");
        const spec = await resolveModelSpec(ctx, "script.review");
        const result = await runStructuredNode({
          model: modelFor(spec),
          template: SCRIPT_SOURCE_SIMILARITY_TEMPLATE,
          facets: {
            candidate: input.candidateText,
            sources: input.sourceTexts
              .map((text, index) => `【来源 ${index + 1}】\n${text}`)
              .join("\n\n"),
          },
        });
        return scriptSourceSimilaritySchema.parse(result.object).score;
      },
    },
  });
  const projectScriptGenerator: ProjectScriptCandidateGeneratorPort = {
    generate: async (c, target) => {
        const { modelFor, runScriptNode } = await import(
          "@creatoros/ai-worker"
        );
        const spec = await resolveModelSpec(c, "script.draft");
        const sourceBrief = target.sources
          .map(
            (source, index) =>
              `【来源 ${index + 1}·只作事实与结构参照，禁照搬原句】\n` +
              `链接：${source.item.canonicalUrl}\n` +
              `已确认拆写：${JSON.stringify(source.transform.outputSnapshot)}\n` +
              `逐字稿：${source.transcript.text}`,
          )
          .join("\n\n");
        const generated = await runWithResolvedEffectiveSkills(
          c,
          ["script.draft"],
          () =>
            runScriptNode({
              model: modelFor(spec),
              positioningBrief:
                "必须按当前 Project 已确认的选题与创作者定位表达，不冒充来源作者。",
              ...(target.sources[0]?.item.title
                ? { topicTitle: target.sources[0].item.title }
                : {}),
              extraBrief: `${target.strategy}\n\n${sourceBrief}`,
            }),
        );
        return {
          text: generated.shots
            .map((shot) => shot.口播.trim())
            .filter(Boolean)
            .join("\n"),
        };
    },
  };
  const projectScriptRunnerDeps = {
    tasks: persistentTaskService,
    references: projectIntelligenceReferences,
    generator: projectScriptGenerator,
  };
  const intelligenceBase = createIntelligenceTransport(
    () => intelligenceService,
    () => projectIntelligenceReferences,
    () => projectScriptCandidates,
  );
  const fetchIntelligenceFeed = async (url: string) => {
    let current = url;
    let discoveredFeed = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      for (let hop = 0; hop <= 6; hop += 1) {
        await assertUrlAllowed(current);
        const response = await fetch(current, {
          signal: controller.signal,
          redirect: "manual",
          headers: {
            accept:
              "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
          },
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location || hop === 6) {
            throw Object.assign(new Error("RSS 重定向无效或次数过多"), {
              name: "RssHttpError",
            });
          }
          current = new URL(location, current).toString();
          continue;
        }
        if (!response.ok) {
          throw Object.assign(new Error(`RSS HTTP ${response.status}`), {
            name: "RssHttpError",
          });
        }
        const announced = Number(response.headers.get("content-length"));
        if (Number.isFinite(announced) && announced > 5 * 1024 * 1024) {
          throw Object.assign(new Error("RSS 响应超过 5MB"), {
            name: "RssResponseTooLargeError",
          });
        }
        const xml = await response.text();
        if (new TextEncoder().encode(xml).byteLength > 5 * 1024 * 1024) {
          throw Object.assign(new Error("RSS 响应超过 5MB"), {
            name: "RssResponseTooLargeError",
          });
        }
        if (!isSyndicationFeed(xml) && !discoveredFeed) {
          const discovered = discoverSameOriginFeedUrl(xml, current);
          if (discovered) {
            discoveredFeed = true;
            current = discovered;
            continue;
          }
        }
        return { xml, finalUrl: current };
      }
      throw Object.assign(new Error("RSS 重定向次数过多"), {
        name: "RssHttpError",
      });
    } finally {
      clearTimeout(timer);
    }
  };
  const intelligenceSourceAdapter = createIntelligenceSourceAdapter({
    now: deps.now,
    fetchProfileWorks: async ({
      collectorAccountId,
      externalAccountId,
    }) => {
      const rows = await (await loadDouyinCdp()).fetchDouyinUserPosts({
        authDir: douyinAuthDirFor(collectorAccountId),
        secUid: externalAccountId,
        maxPages: 100,
        strictEvidence: true,
        gateway: douyinGateway,
      });
      return rows;
    },
    fetchFavoriteWorks: async ({ ctx, collectorAccountId, folderId }) => {
      const cdp = await loadDouyinCdp();
      const authDir = douyinAuthDirFor(collectorAccountId);
      const diagnostics = {
        requestId: ctx.requestId,
        accountId: collectorAccountId,
      };
      let collectsId = folderId;
      // 旧收藏来源只保存了用户看到的收藏夹名称（例如“选题”），不是抖音
      // collects_id。直接把名称传给 video/list 永远采不到数据。登录恢复后先
      // 读取真实收藏夹列表并按“稳定 ID 优先、精确名称兼容”解析，再抓作品。
      if (!/^\d{8,}$/.test(folderId)) {
        const folders = await cdp.fetchDouyinCollectsFolders({
          authDir,
          strictEvidence: true,
          gateway: douyinGateway,
          diagnostics,
        });
        const normalized = folderId.trim();
        const matched = folders.find(
          (folder) =>
            folder.collectsId === normalized ||
            folder.name.trim() === normalized,
        );
        if (!matched) {
          throw Object.assign(
            new Error("已绑定收藏夹在当前抖音账号中不存在"),
            {
              name: "DouyinFavoritesFolderMissingError",
              code: "FOLDER_MISSING",
            },
          );
        }
        collectsId = matched.collectsId;
      }
      return cdp.fetchDouyinCollectsVideos({
        authDir,
        collectsId,
        maxItems: 1_000,
        strictEvidence: true,
        gateway: douyinGateway,
        diagnostics,
      });
    },
    readWeb: async ({ ctx, url }) => {
      const domain = webDomainFromUrl(url);
      return readWebUrlSidecar(
        url,
        { authDir: webAuthDirFor(domain) },
        {
          openContext: () =>
            openPooledReaderContext(ctx, domain) as never,
        },
      );
    },
    fetchFeed: ({ url }) => fetchIntelligenceFeed(url),
    parseFeed,
    fetchDouhot: async ({ collectorAccountId, keyword, board }) =>
      (await loadDouhotCdp()).fetchDouhotLowFollowerBreakout({
        authDir: douyinAuthDirFor(collectorAccountId),
        keyword,
        board,
      }),
  });
  const sourceRunnerDeps = {
    tasks: persistentTaskService,
    intelligence: intelligenceService,
    adapter: intelligenceSourceAdapter,
    now: deps.now,
  };
  let intelligenceTranscriptRunnerDeps:
    | IntelligenceTranscriptRunnerDeps
    | null = null;
  const shareImportRunnerDeps = {
    tasks: persistentTaskService,
    intelligence: intelligenceService,
    now: deps.now,
    onTranscriptTasksQueued: (
      ctx: RequestContext,
      taskIds: string[],
    ): void => {
      const transcriptDeps = intelligenceTranscriptRunnerDeps;
      if (!transcriptDeps) return;
      for (const taskId of taskIds) {
        void runIntelligenceTranscriptTask(
          ctx,
          { taskId },
          transcriptDeps,
        ).catch((error) => {
          console.error(
            "[intelligence] 分享建档后的逐字稿任务启动失败:",
            error instanceof Error ? error.name : "UnknownError",
          );
        });
      }
    },
    fetcher: {
      fetch: async (
        ctx: RequestContext,
        input: { shareText: string; capturedAt: string },
      ) => {
        const cdp = await loadDouyinCdp();
        const target = await cdp.resolveDouyinShareTarget(input.shareText);
        const parsed = await cdp.fetchDouyinSharedItem({
          awemeId: target.awemeId,
          canonicalUrl: target.canonicalUrl,
          authDir: douyinAuthDirFor(ctx.accountId),
          capturedAt: input.capturedAt,
          gateway: douyinGateway,
        });
        return {
          shareUrl: target.shareUrl,
          resolvedUrl: target.resolvedUrl,
          item: parsed.item,
          browserSessionRef: `douyin-profile:${ctx.accountId}`,
        };
      },
    },
  };
  const dispatchIntelligenceRun = (
    ctx: RequestContext,
    result: unknown,
  ): void => {
    const data = (result as {
      data?: {
        source?: { id?: unknown };
        run?: { id?: unknown; sourceId?: unknown };
        task?: { id?: unknown; status?: unknown };
      };
    }).data;
    const sourceId =
      typeof data?.source?.id === "string"
        ? data.source.id
        : typeof data?.run?.sourceId === "string"
          ? data.run.sourceId
          : null;
    if (
      sourceId &&
      typeof data?.run?.id === "string" &&
      typeof data?.task?.id === "string" &&
      data.task.status === "queued"
    ) {
      void runIntelligenceSourceTask(
        ctx,
        {
          sourceId,
          runId: data.run.id,
          taskId: data.task.id,
        },
        sourceRunnerDeps,
      ).catch((error) => {
        console.error(
          "[intelligence] 来源任务启动失败:",
          error instanceof Error ? error.name : "UnknownError",
        );
      });
    }
  };
  const intelligence: Transport = {
    async request(endpoint, input, ctx) {
      if (ctx && endpoint.id === "intelligence.sources.previewProfile") {
        const body = (input as {
          body?: {
            accountId?: string;
            collectorAccountId?: string;
            url?: string;
          };
        })?.body;
        const accountId = requireAccountId(
          ctx.accountId,
          endpoint.id,
        );
        if (body?.accountId !== accountId) {
          throw new Error("Intelligence source not found");
        }
        const collectorAccountId = body.collectorAccountId ?? "";
        const collector =
          await requirePlatformAccountServiceForCollectors().getAccount(
            ctx,
            collectorAccountId,
          );
        if (
          collector.status !== "active" ||
          collector.platform !== "douyin"
        ) {
          throw new OwnershipError("采集账号不可用，请重新选择");
        }
        const url = new URL(body.url ?? "");
        if (
          !/(^|\.)douyin\.com$/i.test(url.hostname) ||
          !url.pathname.match(/\/user\/([^/?#]+)/)
        ) {
          throw new Error("请输入完整的抖音博主主页链接");
        }
        const externalAccountId = decodeURIComponent(
          url.pathname.match(/\/user\/([^/?#]+)/)?.[1] ?? "",
        );
        const preview = await (
          await loadDouyinCdp()
        ).previewDouyinUserProfile({
          authDir: douyinAuthDirFor(collectorAccountId),
          secUid: externalAccountId,
          canonicalUrl: url.toString(),
          maxPages: 1,
          strictEvidence: true,
          gateway: douyinGateway,
        });
        return {
          data: {
            platform: "douyin",
            ...preview,
          },
          meta: { requestId: ctx.requestId },
        };
      }
      if (ctx && endpoint.id === "intelligence.sources.previewWeb") {
        const body = (input as {
          body?: {
            accountId?: string;
            url?: string;
            instruction?: string;
            browserSessionRef?: string;
          };
        })?.body;
        const accountId = requireAccountId(ctx.accountId, endpoint.id);
        if (body?.accountId !== accountId) {
          throw new Error("Intelligence source not found");
        }
        const requestedUrl = new URL(body.url ?? "").toString();
        try {
          const feed = await fetchIntelligenceFeed(requestedUrl);
          if (isSyndicationFeed(feed.xml)) {
            const rows = parseFeed(
              feed.xml,
              new URL(feed.finalUrl).hostname,
            );
            return {
              data: {
                type: "rss",
                title: new URL(feed.finalUrl).hostname,
                finalUrl: feed.finalUrl,
                samples: rows.slice(0, 3).map((row) => ({
                  title: row.title,
                  url: row.url,
                  summary: row.snippet || null,
                })),
                loginRequired: false,
                parser: "rss-or-atom-feed",
                browserSessionRef: body.browserSessionRef ?? null,
              },
              meta: { requestId: ctx.requestId },
            };
          }
        } catch {
          // 不是公开 feed 时继续尝试受控浏览器正文预览；最终错误由该真实读取路径返回。
        }
        const domain = webDomainFromUrl(requestedUrl);
        try {
          const read = await readWebUrlSidecar(
            requestedUrl,
            { authDir: webAuthDirFor(domain) },
            {
              openContext: () =>
                openPooledReaderContext(ctx, domain) as never,
            },
          );
          return {
            data: {
              type: "web",
              title: read.title || null,
              finalUrl: read.finalUrl,
              samples: [
                {
                  title: read.title,
                  url: read.finalUrl,
                  summary: read.text.trim().slice(0, 320) || null,
                },
              ],
              loginRequired: false,
              parser: `readable:${read.extractor}`,
              browserSessionRef: body.browserSessionRef ?? null,
            },
            meta: { requestId: ctx.requestId },
          };
        } catch (error) {
          if (error instanceof WebReaderLoginRequiredError) {
            return {
              data: {
                type: "web",
                title: null,
                finalUrl: requestedUrl,
                samples: [],
                loginRequired: true,
                parser: "login-required",
                browserSessionRef: body.browserSessionRef ?? null,
              },
              meta: { requestId: ctx.requestId },
            };
          }
          throw error;
        }
      }
      if (
        ctx &&
        endpoint.id === "intelligence.sources.listFavoriteFolders"
      ) {
        const query = (input as {
          query?: {
            accountId?: string;
            collectorAccountId?: string;
          };
        })?.query;
        const accountId = requireAccountId(ctx.accountId, endpoint.id);
        if (query?.accountId !== accountId) {
          // 已知是当前页面账号与收藏归属不一致；仍使用 404-class OwnershipError，
          // 但给本机用户可操作的收藏语义，避免 UI 只得到无关的 source not found。
          throw new OwnershipError("收藏账号与当前页面账号不一致");
        }
        const collectorAccountId = query.collectorAccountId ?? "";
        const collector =
          await requirePlatformAccountServiceForCollectors().getAccount(
            ctx,
            collectorAccountId,
          );
        if (
          collector.status !== "active" ||
          collector.platform !== "douyin"
        ) {
          throw new OwnershipError("采集账号不可用，请重新选择");
        }
        const folders = await (
          await loadDouyinCdp()
        ).fetchDouyinCollectsFolders({
          authDir: douyinAuthDirFor(collectorAccountId),
          strictEvidence: true,
          gateway: douyinGateway,
          diagnostics: {
            requestId: ctx.requestId,
            accountId: collectorAccountId,
          },
        });
        return {
          data: folders.map((folder) => ({
            id: folder.collectsId,
            name: folder.name,
            itemCount: folder.totalCount,
          })),
          meta: {
            requestId: ctx.requestId,
            page: 1,
            pageSize: folders.length || 1,
            total: folders.length,
          },
        };
      }
      const result = await intelligenceBase.request(endpoint, input, ctx);
      if (
        ctx &&
        endpoint.id === "intelligence.items.importDouyinShare"
      ) {
        const task = (
          result as { data?: { task?: { id?: unknown; status?: unknown } } }
        ).data?.task;
        if (
          typeof task?.id === "string" &&
          task.status === "queued"
        ) {
          void runDouyinShareImportTask(
            ctx,
            { taskId: task.id },
            shareImportRunnerDeps,
          ).catch((error) => {
            console.error(
              "[intelligence] 单条分享导入任务启动失败:",
              error instanceof Error ? error.name : "UnknownError",
            );
          });
        }
      }
      if (
        ctx &&
        (endpoint.id === "intelligence.sources.create" ||
          endpoint.id === "intelligence.runs.start")
      ) {
        dispatchIntelligenceRun(ctx, result);
      }
      if (
        ctx &&
        endpoint.id === "intelligence.transcripts.enqueue" &&
        intelligenceTranscriptRunnerDeps
      ) {
        const tasks = (
          result as { data?: { tasks?: Array<{ id?: unknown }> } }
        ).data?.tasks;
        for (const task of tasks ?? []) {
          if (typeof task.id !== "string") continue;
          void runIntelligenceTranscriptTask(
            ctx,
            { taskId: task.id },
            intelligenceTranscriptRunnerDeps,
          ).catch((error) => {
            console.error(
              "[intelligence] 逐字稿任务启动失败:",
              error instanceof Error ? error.name : "UnknownError",
            );
          });
        }
      }
      if (
        ctx &&
        endpoint.id === "intelligence.transforms.previewTopic"
      ) {
        const task = (
          result as { data?: { task?: { id?: unknown; status?: unknown } } }
        ).data?.task;
        if (
          typeof task?.id === "string" &&
          task.status === "queued"
        ) {
          void runIntelligenceTopicPreviewTask(
            ctx,
            { taskId: task.id },
            {
              tasks: persistentTaskService,
              intelligence: intelligenceService,
              generator: {
                generate: async (c, target) => {
                  const {
                    INTELLIGENCE_TOPIC_DECOMPOSE_TEMPLATE,
                    INTELLIGENCE_TOPIC_FROM_DECOMPOSITION_TEMPLATE,
                    intelligenceTopicDecomposeSchema,
                    intelligenceTopicFromDecompositionSchema,
                    modelFor,
                    runStructuredNode,
                  } = await import("@creatoros/ai-worker");
                  const spec = await resolveTopicPreviewModelSpec(c);
                  const positioning = [
                    target.positioning.oneLiner,
                    target.positioning.keywords.length > 0
                      ? `关键词：${target.positioning.keywords.join("、")}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join("\n");
                  if (target.reusableDecomposition) {
                    const result = await runWithResolvedEffectiveSkills(
                      c,
                      ["intelligence.topic-from-decomposition"],
                      () =>
                        runStructuredNode({
                          model: modelFor(spec),
                          template:
                            INTELLIGENCE_TOPIC_FROM_DECOMPOSITION_TEMPLATE,
                          facets: {
                            positioning,
                            sourceTitle: target.item.title,
                            sourceAuthor:
                              target.item.authorName ?? target.item.platform,
                            sourceUrl: target.item.canonicalUrl,
                            decomposition: JSON.stringify(
                              target.reusableDecomposition,
                            ),
                          },
                          maxRetries: 0,
                          maxOutputTokens: 900,
                        }),
                    );
                    return {
                      ...target.reusableDecomposition,
                      ...intelligenceTopicFromDecompositionSchema.parse(
                        result.object,
                      ),
                    };
                  }
                  const result = await runWithResolvedEffectiveSkills(
                    c,
                    ["intelligence.topic-decompose"],
                    () =>
                      runStructuredNode({
                        model: modelFor(spec),
                        template: INTELLIGENCE_TOPIC_DECOMPOSE_TEMPLATE,
                        facets: {
                          positioning,
                          sourceTitle: target.item.title,
                          sourceAuthor:
                            target.item.authorName ?? target.item.platform,
                          sourceUrl: target.item.canonicalUrl,
                          // 这里必须使用手动转写完成的逐字稿，不能退化成标题/摘要猜结构。
                          transcript: target.transcript.text,
                        },
                        maxRetries: 0,
                        maxOutputTokens: 1_600,
                      }),
                  );
                  return intelligenceTopicDecomposeSchema.parse(
                    result.object,
                  );
                },
              },
            },
          ).catch((error) => {
            console.error(
              "[intelligence] 选题候选任务启动失败:",
              error instanceof Error ? error.name : "UnknownError",
            );
          });
        }
      }
      if (
        ctx &&
        endpoint.id === "projects.scripts.generateCandidate"
      ) {
        const task = (result as { data?: { id?: unknown; status?: unknown } })
          .data;
        if (typeof task?.id === "string" && task.status === "queued") {
          void runProjectScriptCandidateTask(
            ctx,
            { taskId: task.id },
            projectScriptRunnerDeps,
          ).catch((error) => {
            console.error(
              "[intelligence] Project 稿件候选任务启动失败:",
              error instanceof Error ? error.name : "UnknownError",
            );
          });
        }
      }
      return result;
    },
  };
  // 恢复租约后继续真正排队的来源同步，并补跑已错过 nextRunAt 的每日监控。
  // APP 退出时没有伪装成云端常驻进程；下次启动会先扫 due source，再驱动真实 run。
  let intelligenceScheduleRunning = false;
  const runIntelligenceSchedule = async () => {
    if (intelligenceScheduleRunning) return;
    intelligenceScheduleRunning = true;
    try {
      // 先回收上次进程退出遗留的过期租约，再 drain；否则 task 仍是 running，
      // drain 只认 queued，来源 run 会永久占着 active 状态。
      await persistentTaskService.recoverExpiredLeases();
      await drainIntelligenceSourceQueue(sourceRunnerDeps);
      const enqueued = await intelligenceService.enqueueDueSourceRuns();
      if (enqueued > 0) {
        await drainIntelligenceSourceQueue(sourceRunnerDeps);
      }
    } finally {
      intelligenceScheduleRunning = false;
    }
  };
  void runIntelligenceSchedule().catch((error) => {
    console.error(
      "[intelligence] 启动恢复/定时补跑失败:",
      error instanceof Error ? error.name : "UnknownError",
    );
  });
  if (
    !(process.env.NODE_ENV === "test" || process.env.VITEST || process.env.CI)
  ) {
    const configured = Number(
      process.env.CREATOROS_INTELLIGENCE_SCHEDULER_INTERVAL_MS,
    );
    const intervalMs =
      Number.isFinite(configured) && configured >= 30_000
        ? Math.floor(configured)
        : 60_000;
    const intelligenceTimer = setInterval(() => {
      void runIntelligenceSchedule().catch((error) => {
        console.error(
          "[intelligence] 定时监控扫描失败:",
          error instanceof Error ? error.name : "UnknownError",
        );
      });
    }, intervalMs);
    intelligenceTimer.unref?.();
  }
  void drainProjectScriptCandidateQueue(projectScriptRunnerDeps).catch(
    (error) => {
      console.error(
        "[intelligence] Project 稿件候选启动恢复失败:",
        error instanceof Error ? error.name : "UnknownError",
      );
    },
  );
  void drainDouyinShareImportQueue(shareImportRunnerDeps).catch((error) => {
    console.error(
      "[intelligence] 单条分享导入启动恢复失败:",
      error instanceof Error ? error.name : "UnknownError",
    );
  });
  // live dispatch 范式(MEMORY 铁律):create 落 queued 后 fire-and-forget 后台编排,
  // HTTP 立即返回,UI 轮询 execution.tasks.get / ai.tasks.steps.list。
  const execution: Transport = {
    async request(endpoint, input, ctx) {
      const res = await executionBase.request(endpoint, input, ctx);
      if (endpoint.id === "execution.tasks.create" && ctx) {
        const task = (
          res as { data?: { id?: string; status?: string; spec?: unknown } }
        ).data;
        if (task && typeof task.id === "string" && task.status === "queued") {
          const executionTaskId = task.id;
          void runTaskWithEffectiveSkillSnapshot(ctx, executionTaskId, () =>
            runExecutionTask(
              ctx,
              { id: executionTaskId, inputData: { spec: task.spec } },
              {
                ai: aiService,
                assets: {
                  getAssetBytes: (c, assetId) =>
                    assetsService.getAssetBytes(c, assetId),
                },
                registry: executorRegistry,
                workspacesRoot: executionWorkspacesRoot,
              },
            ),
          ).catch(async (error) => {
            const message =
              error instanceof Error ? error.message : String(error);
            await aiService
              .markFailed(ctx, executionTaskId, message)
              .catch(() => undefined);
          });
        }
      }
      return res;
    },
  };

  // [T-052 裁决③] Monetization service/transport 装配段已随变现中心物理删除(宪法 §8)。

  // Candidate (module 19, Wave 5): the service builds a per-ctx user-scoped repo over
  // the shared db (the repo bakes userId in; the service mints one per request). The
  // transport returns this ONE shared service. Peers are reached ONLY through injected
  // narrow ports (no cross-module repo import, SPEC §22), satisfied here by the peers'
  // public services / the shared projects repo:
  //   - projects.createProject → projectsService.createProject (promote → Project,
  //     Research-stage seed; ProjectsService stamps ctx.userId). The promotion returns
  //     the new project id so the FE can navigate to /projects/:id.
  //   - positioning.evaluateFit → positioningService.evaluateGate (subjectType
  //     "candidate", inline payload) → its deterministic 0–100 fit. SOFT dep: when the
  //     user has no positioning statement the gate throws GateSubjectError — swallow to
  //     null so the Candidate renders ungated (the page is not blocked by module 17).
  //   - ingestion.assertRunExists → ingestionService.getRun (RISK-005 — the run must
  //     be a REAL IngestionRun; cross-user / unknown → OwnershipError).
  // Clock/ids share the deterministic `deps` (createSeq keeps cand/sig/promo ids
  // collision-free across requests).
  const candidateService = createCandidateService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    projects: {
      // promote → Project:转发 briefDetail 草稿,新项目落 brief 阶段(立项工作台)。
      createProject: async (ctx, cmd) => {
        const row = await projectsService.createProject(ctx, cmd);
        return { id: row.id };
      },
    },
    positioning: {
      evaluateFit: async (ctx, subject) => {
        try {
          const result = await positioningService.evaluateGate(ctx, {
            subjectType: "candidate",
            subjectId: "candidate-inline",
            candidate: {
              title: subject.title,
              angle: subject.angle,
              contentRole: subject.contentRole ?? undefined,
              productAnchorId: subject.productAnchorId ?? undefined,
            },
          });
          return result.positioningFit;
        } catch {
          // SOFT dep — no positioning statement yet (GateSubjectError) ⇒ ungated.
          // Return null so the Candidate renders without a fit; module 17 is not a
          // hard blocker (a one-shot backfill recomputes fit when positioning lands).
          return null;
        }
      },
    },
    ingestion: {
      assertRunExists: async (ctx, runId) => {
        await ingestionService.getRun(ctx, runId);
      },
    },
    // 选题中心总览 cross-module aggregates (topics.overview 出题依据 + 来源). Each binds to a
    // peer's PUBLIC service (no cross-module repo import). SOFT — the service catches any
    // rejection and degrades to 0/"" so the overview never blocks on a peer.
    overview: {
      // 定位领域一句 — the creator's positioning field (or one-liner) for the 出题依据 label.
      positioningLabel: async (ctx) => {
        const center = await positioningService.getPositioningCenter(ctx);
        return (
          center.profile?.field ||
          center.currentStatement?.oneLiner ||
          ""
        );
      },
      // 知识库条数 — count of the creator's KnowledgeItems (listKnowledge returns the rows).
      knowledgeCount: async (ctx) =>
        (await knowledgeService.listKnowledge(ctx)).length,
      // 历史爆款 (高表现作品数) — there is NO honest per-publication 高表现 read on the
      // Analytics public surface yet (getDashboardRollup is an account-wide rollup, not a
      // per-work threshold count). Rather than fabricate one, report 0 until Analytics
      // exposes a real 高表现 count (零造假 — no 对应数据源, count=0).
      highPerformerCount: async () => 0,
      // 复盘回流经验条数 — count of the creator's Learnings (复盘沉淀, drives 已发布回流 +
      // 项目复盘 source). listLearnings returns the page total.
      learningsCount: async (ctx) => {
        const { total } = await learningsService.listLearnings(ctx, {
          limit: 1,
          offset: 0,
        });
        return total;
      },
    },
    // [T-212d] 防茧房校准触发点:用户淘汰选题写原因后,后台 best-effort 跑淘汰原因蒸馏 →
    //   AI(runStructuredNode 绑 topic.preference)聚类偏好信号 → upsertTopicPreference 落库
    //   (护栏在 service 内强制:±10 封顶 / ≥3 例才升级 active)。fire-and-forget,不阻塞淘汰返回;
    //   失败只记日志。蒸馏端口/落库端口都绑 candidateService 自身的公开方法(同一 service,无跨模块 repo)。
    dispatchPreferenceDistill: (ctx) => {
      void runWithResolvedEffectiveSkills(ctx, ["topic.preference"], () =>
        runTopicPreferenceDistill(ctx, {
          listDropReasons: (c) => candidateService.listDropReasons(c),
          distill: createTopicPreferenceDistillPort({ resolveModelSpec }),
          upsertPreference: (c, input) =>
            candidateService.upsertTopicPreference(c, input),
        }),
      ).catch((err) => {
        console.error(
          "[topic-preference] 淘汰原因蒸馏触发失败(best-effort,不影响淘汰):",
          err,
        );
      });
    },
  });
  createTopicFromIntelligence = async (ctx, input) => {
    const candidate = await candidateService.createCandidate(ctx, {
      title: input.title,
      angle: input.angle,
      source: "benchmark",
      card: input.card,
      sourceReferences: input.sourceReferences,
    });
    return { id: candidate.id };
  };
  const candidateBase = createCandidateTransport(() => candidateService);
  // 内容雷达候选沿用现有 Candidate→Project 主链；promote 成功后，同步把
  // item/snapshot/transform/transcript hash 固定为 Project 来源。普通候选没有
  // intelligence transform，attachFromPromotion 诚实返回 null，不制造伪来源。
  const candidate: Transport = {
    async request(endpoint, input, ctx) {
      const result = await candidateBase.request(endpoint, input, ctx);
      if (ctx && endpoint.id === "candidates.promote") {
        const promotion = (
          result as {
            data?: { candidateId?: unknown; projectId?: unknown };
          }
        ).data;
        if (
          typeof promotion?.candidateId === "string" &&
          typeof promotion.projectId === "string"
        ) {
          await projectIntelligenceReferences.attachFromPromotion(ctx, {
            topicId: promotion.candidateId,
            projectId: promotion.projectId,
          });
        }
      }
      return result;
    },
  };

  // Calibration (module 20, Wave 5–7): the service builds a per-ctx user-scoped repo
  // over the shared db (the repo bakes userId in; the service mints one per request).
  // The transport returns this ONE shared service. Peers are reached ONLY through
  // injected narrow ports (no cross-module repo import, SPEC §22):
  //   - ingestion.assertRunExists → ingestionService.getRun (§C-4/RISK-005 — the
  //     CalibrationResult.actualMetrics must trace to a REAL, owned IngestionRun;
  //     cross-user / unknown → OwnershipError → 404; no new external write path).
  //   - learnings.adjustConfidence → BEST-EFFORT no-op this wave: the Learnings public
  //     surface exposes no confidence-adjust write yet (plan OQ3 — a new public method is
  //     the lighter path, deferred). The seam is wired so the §6.3 feedback lands in ONE
  //     place the moment Learnings exposes it; swallow until then (the CalibrationResult
  //     remains the source of truth, so this is non-destructive — SPEC §11).
  // Clock/ids share the deterministic `deps` (createSeq keeps rubric/rubricver/pred/
  // calibres ids collision-free across requests).
  const calibrationService = createCalibrationService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    ingestion: {
      assertRunExists: async (ctx, runId) => {
        // getRun is the ownership-gated IngestionRun read (cross-user / unknown →
        // OwnershipError). RISK-005: reject 悬空 ingestionRunId before any
        // CalibrationResult references it.
        await ingestionService.getRun(ctx, runId);
      },
      // 手动回流:无采集 run 时,建一次 source='manual' 的真 run(§C-4 溯源不破)。
      ensureManualRun: async (ctx, idempotencyKey) =>
        ingestionService.ensureManualRun(ctx, idempotencyKey),
    },
    learnings: {
      // §6.3 confidence feedback bridge — no public adjust-write on the Learnings
      // surface this wave (OQ3); best-effort no-op seam wired for when it lands.
      adjustConfidence: async () => {},
    },
    // 校准中心总览 cross-module aggregates (calibration.overview 待校准内容 + 经验沉淀). Each
    // binds to a peer's PUBLIC service (no cross-module repo import, SPEC §22). SOFT — the
    // service catches any rejection and degrades to [] so the overview never blocks.
    overview: {
      // 待校准内容 — the user's content_outputs (per project) + publications (with title).
      // content_outputs carry no platform (未发布), so platform="" there; publications carry
      // their real platform. The service subtracts subjects that already have a locked
      // prediction. Best-effort: a peer read failure degrades the whole list to [].
      listSubjects: async (ctx) => {
        const subjects: Array<{
          subjectType: "content_output" | "publication";
          subjectId: string;
          title: string;
          platform: string;
        }> = [];
        // 数据底座(SPEC §1.4)portfolio 级让位:有 imported 真项目 → 待校准内容只列真实
        //   导入项目(及其作品/发布),演示 fixture 项目让位;无 imported → 全量(过渡期)。
        const hasImported = await projectsService.hasImportedProjects(ctx);
        const allProjects = await projectsRepo.list(ctx);
        const projectRows = hasImported
          ? allProjects.filter((p) => p.source === "imported")
          : allProjects;
        const allowedPubIds = hasImported
          ? new Set(await resolveImportedPublicationIds(ctx))
          : null;
        // content_outputs — iterate the (已让位的)项目集, then each project's outputs.
        for (const proj of projectRows) {
          const outputs = await projectsRepo.listOutputs(ctx, proj.id);
          for (const o of outputs) {
            subjects.push({
              subjectType: "content_output",
              subjectId: o.id,
              title: o.title,
              platform: "",
            });
          }
        }
        // publications — the user's recent publications with their resolved display title.
        //   有 imported 时只收真实导入作品对应的发布(allowedPubIds 过滤)。
        const pubs = await publishingService.getRecentPublicationsWithTitle(ctx, {
          limit: 100,
          offset: 0,
        });
        for (const p of pubs) {
          if (allowedPubIds && !allowedPubIds.has(p.id)) continue;
          // imported publication 无 revision → 标题回退到作品(content_output)真实标题。
          let title = p.title;
          if (!title) {
            try {
              const out = await projectsRepo.getOutput(ctx, p.contentOutputId);
              title = out.title;
            } catch {
              // 防御:保持空,落到下方平台兜底。
            }
          }
          subjects.push({
            subjectType: "publication",
            subjectId: p.id,
            title: title || `${p.platform} 发布`,
            platform: p.platform,
          });
        }
        return subjects;
      },
      // 经验沉淀 — the user's Learnings (复盘回流经验), newest first, capped.
      listLearnings: async (ctx, limit) => {
        const { rows } = await learningsService.listLearnings(ctx, {
          limit,
          offset: 0,
        });
        return rows.map((l) => ({
          id: l.id,
          title: l.title,
          insight: l.insight ?? "",
        }));
      },
    },
  });
  const calibration = createCalibrationTransport(() => calibrationService);

  // PlatformAccount (module 21, Wave 5–7): the service builds a per-ctx user-scoped repo
  // over the shared db (the service mints one per request; the repo bakes userId in).
  // The transport returns this ONE shared service. No external port + no peer fan-out —
  // accounts are pure local records (the secretReference is an opaque reference resolved
  // elsewhere; §7.1 + Settings precedent, never a raw token). The PUBLIC
  // assertOwnedAccount(ctx, accountId, platform) guard is the cross-module binding seam
  // Publishing/Projects call before stamping accountId (through index.ts, no cross-module
  // repo import). Clock/ids share the deterministic `deps` (createSeq keeps acct ids
  // collision-free across requests).
  const platformAccountService = createPlatformAccountService({
    db,
    now: deps.now,
    nextId: deps.nextId,
  });
  platformAccountServiceForCollectors = platformAccountService;
  const platformAccount = createPlatformAccountTransport(
    () => platformAccountService,
  );

  // Scheduling (module 23, T-007 / data-source-pipeline §4): the service builds a
  // per-ctx user-scoped repo over the shared db (repo bakes userId in). No external
  // port + no peer fan-out — scheduled_job/job_run are pure local owned-root records
  // (the scheduler D3 / 「立即运行」 D5 drive createRun/updateRun; the wire only reads
  // runs). Clock/ids share the deterministic `deps`. D6 UI reads/manages jobs through
  // this transport over the SAME pglite store.
  const schedulingService = createSchedulingService({
    db,
    now: deps.now,
    nextId: deps.nextId,
  });
  const scheduling = createSchedulingTransport(() => schedulingService);

  // [T-212a] 对标源服务(选题/对标强化)。collectors["benchmark"] 用它读 enabled 源 + 落对标作品;
  //   composite 用它服务 4 个对标源 CRUD op。clock/ids 共享 deterministic deps。
  const benchmarkService: BenchmarkService = createBenchmarkService({
    db,
    now: deps.now,
    nextId: deps.nextId,
  });

  // [T-235b] 热点信源服务(热点多源证据)。信号采集端口用它读 enabled 信源;composite 用它服务
  //   4 个信源 CRUD op。clock/ids 共享 deterministic deps。
  const trendSourcesService: TrendSourcesService = createTrendSourcesService({
    db,
    now: deps.now,
    nextId: deps.nextId,
  });

  // [T-235c] 指定收藏夹服务(收藏夹跟拍信号源)。collectors["favorites"] 用它读 enabled 登记夹 +
  //   落台账/进池流转;composite 用它服务 4 个登记 CRUD op。clock/ids 共享 deterministic deps。
  const favoritesService: FavoritesService = createFavoritesService({
    db,
    now: deps.now,
    nextId: deps.nextId,
  });

  // [T-235d] 选题归因服务(正向归因回流)。self.detail 采集尾的归因 runner 用它做幂等锚
  //   (hasAttribution)+ 落库(saveAttribution);composite 用它服务 topics.attributions.list。
  //   [gate-F1] 与 learnings 零接触:独立表 topic_attributions,由发布实绩触发。
  const topicAttributionService: TopicAttributionService =
    createTopicAttributionService({
      db,
      now: deps.now,
      nextId: deps.nextId,
    });

  // ── 调度采集接线 (T-007 D3, SPEC 2026-06-30 §3/§5/§6) ─────────────────────────────
  // collectors:每个 sourceKind 一个确定性采集器(抓真数据 → ingestion 落库 → 返回新鲜度
  // 统计)。runner 靠注入调它,不 import fetchDouyin*(保持可测)。
  //
  // [T-136 §D 切片 c] 抖音 authDir **按号分目录**:采集器内用 douyinAuthDirFor(ctx.accountId)
  //   逐调解析(每号独立登录态,与 douyinFetch 端口同源、同 base)。评论 / 明细采集直连
  //   fetchDouyinComments*/Export,故在此按当前号拼路径(不像 refresh 走端口透传)。

  // [T-078] 每轮封面回填上限(env 可调,验证/降载用;非法值回默认)。
  const resolveCoverBackfillLimit = (): number => {
    const raw = Number(process.env.CREATOROS_COVER_BACKFILL_LIMIT);
    return Number.isFinite(raw) && raw > 0
      ? Math.floor(raw)
      : DEFAULT_COVER_BACKFILL_LIMIT;
  };

  // [T-349] 单条按需逐字稿公共原语(iesdouyin 直链 → ffmpeg 抽音 → 云 ASR)。抽成 buildPersistence
  //   作用域内具名闭包 —— favorites-distill(收藏他人作品)与 benchmark(对标他号作品)复用同一份,
  //   **绝不复制**。图集/无口播 → 返 null(诚实 skip)。[T-136] 按当前号(c.accountId)登录态指纹。
  //   origin 隔离:两条调用方都**不**走 ensureTranscriptArtifact —— 逐字稿落各自表自身,永不建 imported。
  const transcribeOneAweme = async (
    c: RequestContext,
    awemeId: string,
  ): Promise<string | null> => {
    const cdp = await loadDouyinCdp();
    const src = await cdp.fetchDouyinVideoSource({
      awemeId,
      authDir: douyinAuthDirFor(c.accountId),
      gateway: douyinGateway,
    });
    if (src.kind === "image-album") return null;
    const audioBytes = await cdp.streamAudioFromVideo(src.playUrl);
    const spec = await resolveTranscribeSpecFn(c, {
      getModelConfig: (cc, cap) => settingsService.getModelConfig(cc, cap),
      env: process.env,
    });
    const { text } = await transcribeAudioFn(
      spec,
      { audioBytes, language: "zh" },
      asrRegistry,
    );
    return text && text.trim() ? text : null;
  };
  intelligenceTranscriptRunnerDeps = {
    tasks: persistentTaskService,
    intelligence: intelligenceService,
    transcript: {
      transcribe: async (c, input) => {
        const awemeId =
          input.externalId ??
          input.canonicalUrl.match(/\/video\/([^/?#]+)/)?.[1] ??
          null;
        if (!awemeId) {
          return {
            text: null,
            provider: null,
            model: null,
            language: "zh",
            skippedReason: "NO_AUDIO_SOURCE",
          };
        }
        const cdp = await loadDouyinCdp();
        const source = await cdp.fetchDouyinVideoSource({
          awemeId,
          authDir: douyinAuthDirFor(c.accountId),
          gateway: douyinGateway,
        });
        if (source.kind === "image-album") {
          return {
            text: null,
            provider: null,
            model: null,
            language: "zh",
            skippedReason: "IMAGE_ALBUM",
          };
        }
        const audioBytes = await cdp.streamAudioFromVideo(source.playUrl);
        const spec = await resolveTranscribeSpecFn(c, {
          getModelConfig: (cc, capability) =>
            settingsService.getModelConfig(cc, capability),
          env: process.env,
        });
        const result = await transcribeAudioFn(
          spec,
          { audioBytes, language: "zh" },
          asrRegistry,
        );
        return {
          text: result.text,
          provider: spec.provider,
          model: spec.model,
          language: "zh",
        };
      },
    },
  };

  const scheduledCollectors: Record<string, ScheduledCollector> = {
    // 自己主页作品+指标:直接复用 ingestionService.refreshDouyin(内部:校验源 → fetchDouyin
    // Metrics(launchPersistentContext 复用扫码登录态)→ ensureImportedProject×N →
    // ingestMetrics → completeRun)。未登录 → refreshDouyin 抛 DouyinNotLoggedInError(runner
    // catch → needs_reconnect)。itemsNew=本次真写入快照数(recordsWritten);metric_snapshots
    // 是 append-only 时间序列(同 capturedAt 幂等),无"更新"语义。
    // [T-078] 指标落库后追加封面回填(best-effort):对尚无 coverAssetId 的已发布抖音
    // publication,iesdouyin 分享页(经限流网关)抽 coverUrl → 下载(带 Referer)→
    // createGeneratedAsset 直落字节 → setCover 写 revision.coverAssetId。幂等(已有
    // 封面不进候选集)、单作品降级(runner 内 catch 继续)、整批失败不影响指标主流程
    // (此处再 catch 一层)。itemsUpdated = 本轮真回填的封面数(publication 确被更新,诚实)。
    "self.metrics": async (ctx, target, report) => {
      // [T-152] 阶段①:登录校验 + 确保采集源(refreshDouyin 内部先校验登录态再抓)。
      report({ stage: "login", processed: 0, total: null, message: "校验抖音登录态" });
      const externalSourceId =
        typeof target.externalSourceId === "string" && target.externalSourceId
          ? target.externalSourceId
          : // [T-144] 空 target(job 未绑源)→ ensure 本 user 的真实抖音采集源(无源建、有源
            // 复用),绝不再指已退役的 "src-douyin-canonical"(新库查无 → 抛「外部来源不存在」
            // → runner 报 failed → 采 0 条的根因)。ensure 后 refreshDouyin 能校验通过。
            await ingestionService.ensureDouyinSource(ctx);
      // [T-152] 阶段②:抓主页作品列表 + 落库(refreshDouyin 内部翻页/逐字稿是慢阶段,但在
      //   douyinFetch 端口后不可逐页上报 —— 见诚实存疑⑥。此处只标进入抓取阶段,完成后报条数)。
      report({ stage: "fetch", processed: 0, total: null, message: "抓取主页作品与指标" });
      const run = await ingestionService.refreshDouyin(ctx, {
        externalSourceId,
      });
      // 抓取落库完成:上报本轮真写入的快照数(累计条数)。
      report({
        stage: "fetch",
        processed: run.recordsWritten,
        total: null,
        message: `已落库 ${run.recordsWritten} 条作品指标`,
      });
      // [T-195] self.metrics 轻量化:封面回填 + 逐字稿/重建排队(重活)已整体挪到 self.detail 尾。
      //   根因(真机实测):这两步撞可见性——可见性(hidden_at/platform_status)要到 self.detail 落
      //   明细才标。原挂在 self.metrics 尾会照撞全部作品(含隐藏),隐藏作品分享页 item_list 为空逐个
      //   失败(~40s/个),把串行闸(gate-F5 并发 1)后面的 self.detail/comments/逐字稿全堵住。故只保留
      //   建作品(ensureImportedProject)+ 指标快照(ingestMetrics)+ 身份回填(applyDouyinIdentity/
      //   昵称,均在 refreshDouyin 内),让 self.metrics 秒返回、昵称秒回;重活见 self.detail 尾。
      const selfMetricsResult = {
        itemsNew: run.recordsWritten,
        // [T-195] 封面回填已挪到 self.detail → self.metrics 不再回填封面,itemsUpdated 恒 0。
        itemsUpdated: 0,
      };
      // [T-176] 移除 self.metrics → self.detail 的每轮 fire-and-forget 自接。
      //   旧行为(Bug-10/11 T-023/T-024):self.metrics 每次成功后自动再跑一次 self.detail 全量导出。
      //   死循环根因之一:self.detail 走创作者中心导出面板,DOM 极脆(直播 tab 无数据 / 图集 /
      //   微前端未就绪)→ waitForEvent('download') 超时,反复触发脆弱路径 + 污染共享的 creator-center
      //   退避状态,把评论采集拖进退避死循环。故**解耦**:self.detail 改由用户/调度显式触发,
      //   拉指标不再每轮自动接全量导出(finish_rate/follower_gain/ctr 请单独配 self.detail job)。
      //   注:即便 self.detail 单跑失败,classifyDouyinOutcome(export-download-timeout)也已判
      //   content-error 不顶退避(见 douyin-request-gateway.ts),双保险。
      return selfMetricsResult;
    },
    // 评论:fetchDouyinComments(target)→ ingestComments(D2 的纯 ports 落库:建 run → 逐条经
    // ux_ingestion_records_run_key 去重 → candidateService.ingestAudienceSignal(source=
    // "comment",带 ingestionRunId,C-4)→ completeRun)。itemsNew=written(新写信号数);
    // 评论只新写不更新 → itemsUpdated 恒 0。
    comments: async (ctx, target, report) => {
      // [T-152] 阶段①:登录校验 + 确保采集源(抓评论前 fetchDouyinComments* 内先校验登录态)。
      report({ stage: "login", processed: 0, total: null, message: "校验抖音登录态" });
      const externalSourceId =
        typeof target.externalSourceId === "string" && target.externalSourceId
          ? target.externalSourceId
          : // [T-144] 空 target(job 未绑源)→ ensure 本 user 的真实抖音采集源(无源建、有源
            // 复用),绝不再指已退役的 "src-douyin-canonical"(新库查无 → 抛「外部来源不存在」
            // → runner 报 failed → 采 0 条的根因)。ensure 后 refreshDouyin 能校验通过。
            await ingestionService.ensureDouyinSource(ctx);
      const maxPages =
        typeof target.maxPages === "number" ? target.maxPages : undefined;
      // CommentIngestPorts 真实装配(所有作品共用一套 ports):ingestion repo(去重 ledger)+
      // candidate service(信号写,C-4 骑 ingestion run)+ ingestion service(run 生命周期)。
      const ingestionRepo = createIngestionRepository(db, {
        now: deps.now,
        nextId: deps.nextId,
        userId: ctx.userId,
        // [T-136 §D 切片 c] 评论采集 run/去重 ledger 按当前号(去重锚仍是 run+recordKey,
        //   run 已 stamp 号;这里带号让 repo 门与 service 侧一致)。
        accountId: ctx.accountId ?? null,
      });
      const commentPorts: CommentIngestPorts = {
        createRun: async (input) => {
          const run = await ingestionService.createRun(ctx, {
            externalSourceId: input.externalSourceId,
            runType: input.runType,
            idempotencyKey: input.idempotencyKey,
          });
          return { id: run.id };
        },
        recordExists: (runId, recordKey) =>
          ingestionRepo.recordExists(runId, recordKey),
        markRecordWritten: (runId, recordKey) =>
          ingestionRepo.markRecordResult(runId, recordKey, "written"),
        ingestSignal: async (input) => {
          // C-4:AudienceSignal 写必带 ctx.ingestionRunId(source="ingestion")。
          // [T-136 §D 切片 c] 关键:透传当前号 —— candidateService.ingestAudienceSignal 的
          //   repo 门据 ctx.accountId stamp audience_signals.account_id。漏传 = 评论信号无号
          //   归属(切号看不到该号受众信号 / 串味)。这是手搓 ctx,不经 downstreamCtx,必须显式带。
          const signalCtx: RequestContext = {
            userId: ctx.userId,
            requestId: ctx.requestId,
            source: "ingestion",
            accountId: ctx.accountId ?? null,
            ingestionRunId: input.ingestionRunId,
          };
          const res = await candidateService.ingestAudienceSignal(signalCtx, {
            source: input.source,
            rawText: input.rawText,
            demandTag: input.demandTag,
            // 评论按作品可读 (T-030 D6) — 回填作品绑定(ingestComments 已按评论自身 aweme_id 解析)。
            publicationId: input.publicationId,
            // 评论点赞数 (T-042 热榜排序依据) — 采集抓的 digg_count。
            likeCount: input.likeCount,
            // 评论粒度幂等锚 (T-065) — `douyin:comment:<cid>`;跨 run 唯一,重采不重复入库。
            externalId: input.externalId,
          });
          // inserted=false → 命中跨 run 幂等锚(库里已有该评论),ingestComments 计 skipped。
          return { inserted: res.inserted };
        },
        // 按 aweme_id 查对应作品的 publication_id(T-030 D6 回填,F3):命中 published +
        // external_id=aweme_id 的 publication → id,否则 null(评论仍落库,只是不绑作品)。
        resolvePublicationId: async (aweme: string) => {
          const pub = await publishingService.resolvePublication(ctx, {
            platform: "douyin",
            externalId: aweme,
          });
          return pub?.id ?? null;
        },
        completeRun: async (runId: string) => {
          await ingestionService.completeRun(ctx, { runId });
        },
      };
      // 单作品评论落库(纯 ingest 部分,抓取已由调用方完成;每作品前 100 条由抓取层 maxPages 控)。
      // commentPorts 复用(整批共用一套),ingest 逻辑不变。
      const ingestRecordsForWork = async (
        awemeId: string,
        records: CommentRecord[],
      ): Promise<number> => {
        const capturedAt = deps.now();
        const result = await (await loadDouyinCdp()).ingestComments(
          awemeId,
          records,
          {
            externalSourceId,
            capturedAt,
            ports: commentPorts,
          },
        );
        return result.written;
      };
      // [T-177 增量化] 评论 watermark 只读端口:按 awemeId 反查库里该作品已知评论的 externalId 集
      //   (`douyin:comment:<cid>`)。resolvePublication(aweme→pubId) + listCommentsForPublication
      //   (source='comment' AND publication_id=pubId 的信号,externalId 即去重锚)。抓取层据此在倒序
      //   翻页里 early-break(某页评论全 ∈ 该集 → 停)。无匹配作品 / 无已知评论 → 空集 → 退化全量。
      //   limit 取大值(覆盖该作品全量已存评论);该读一次/作品,不在热路径,成本远低于省下的重复滚动。
      const commentWatermark = async (aweme: string): Promise<Set<string>> => {
        const pub = await publishingService.resolvePublication(ctx, {
          platform: "douyin",
          externalId: aweme,
        });
        if (!pub?.id) return new Set<string>();
        const rows = await candidateService.listCommentsForPublication(
          ctx,
          pub.id,
          5000,
        );
        const ids = new Set<string>();
        for (const r of rows) if (r.externalId) ids.add(r.externalId);
        return ids;
      };
      // ① 指定 target.awemeId → 只抓该作品;② 未指定 → 抓「我所有作品」评论:遍历用户所有
      //    douyin publications(external_id=aweme_id),**复用单 browser context 跨作品**
      //    (fetchDouyinCommentsForWorks:openContext 开一次 → 循环内逐作品抓 → close 一次),
      //    取代旧「N 作品 × 各开一个 headless 浏览器」路径。
      const single =
        typeof target.awemeId === "string" && target.awemeId
          ? target.awemeId
          : "";
      if (single) {
        // 单作品仍走单作品抓取路径(fetchDouyinComments 内部 openContext 一次)。
        // [gate-F7 插装点③] creator-center 评论翻页限流(注真单例)。
        // [T-152] 单作品:标进入抓取阶段(1/1)。
        report({
          stage: "comments",
          processed: 0,
          total: 1,
          message: "抓取该作品评论",
        });
        const records = await (await loadDouyinCdp()).fetchDouyinComments(
          {
            awemeId: single,
            authDir: douyinAuthDirFor(ctx.accountId), // [T-136] 按当前号登录态
            maxPages,
          },
          { gateway: douyinGateway, commentWatermark }, // [T-177] 增量 early-break
        );
        const written = await ingestRecordsForWork(single, records);
        report({
          stage: "comments",
          processed: 1,
          total: 1,
          message: `已落库 ${written} 条评论`,
        });
        return { itemsNew: written, itemsUpdated: 0 };
      }
      const pubs = await publishingService.getRecentPublicationsWithTitle(ctx, {
        limit: 500,
      });
      const douyinPubs = pubs.filter(
        (p) => p.platform === "douyin" && p.externalId,
      );
      // [T-232 断点续采] 逐作品预取 watermark:一石二鸟 ——「已采与否」的判据(非空 = 采过,
      //   复用 T-177 既有机制不新造持久锚)+ 直接喂给抓取层做增量 early-break(免每作品双读)。
      const watermarks = new Map<string, Set<string>>();
      for (const p of douyinPubs) {
        const aweme = p.externalId as string;
        watermarks.set(
          aweme,
          await commentWatermark(aweme).catch(() => new Set<string>()),
        );
      }
      // [T-232 爆款优先] 逐作品取 analytics 最新快照的评论数(采集顺序依据:330 评的先采,
      //   额度别烧在 0 评作品上)。读不到/无快照 → 0(诚实降级排后,不编)。
      const candidates: CommentCollectionCandidate[] = [];
      for (const p of douyinPubs) {
        const aweme = p.externalId as string;
        let commentCount = 0;
        try {
          const pageOfSnapshots = await analyticsService.getPublicationAnalytics(
            ctx,
            p.id,
            1,
            1, // capturedAt 降序 → 第 1 条即最新快照
          );
          const raw = pageOfSnapshots.rows[0]?.rawMetrics as
            | Record<string, unknown>
            | undefined;
          const n = Number(raw?.comments);
          if (Number.isFinite(n) && n > 0) commentCount = n;
        } catch {
          /* 快照读不到 → 0,排序自然靠后 */
        }
        candidates.push({
          awemeId: aweme,
          commentCount,
          collected: (watermarks.get(aweme)?.size ?? 0) > 0,
        });
      }
      // [T-232] 顺序 = 未采优先(断点续采:上轮截断后下轮自动从未采作品继续)→ 组内评论数
      //   降序(爆款优先)。已采作品排后,额度富余时增量补新评论(watermark early-break 保便宜)。
      const awemeIds = orderCommentCollection(candidates);
      // 复用单 context 一次性抓完所有作品评论(未登录 → 一次性抛 DouyinNotLoggedInError,
      // runner catch → needs_reconnect),再逐作品 ingestComments 落库(落库逻辑不变)。
      // [gate-F7 插装点③④] creator-center:每作品 acquire 一次 + 作品内翻页每页 acquire(注真单例)。
      // [T-152] 标进入抓取阶段(总作品数已知 → total=awemeIds.length)。
      report({
        stage: "comments",
        processed: 0,
        total: awemeIds.length,
        message: `抓取 ${awemeIds.length} 个作品的评论(未采/爆款优先)`,
      });
      // [T-232 额度断点] 抓取层撞 DouyinCooldownActiveError → 立即停剩余作品,带回部分结果
      //   (truncated=true);不再逐作品白撞冷却。
      const batch = await (await loadDouyinCdp()).fetchDouyinCommentsForWorks(
        awemeIds,
        {
          authDir: douyinAuthDirFor(ctx.accountId), // [T-136] 按当前号登录态
          maxPages,
        },
        {
          gateway: douyinGateway,
          // [T-177] 每作品增量 early-break(预取缓存版;缺失键退化空集全量)。
          commentWatermark: async (aweme) =>
            watermarks.get(aweme) ?? new Set<string>(),
        },
      );
      let total = 0;
      let doneWorks = 0;
      for (const { awemeId, records } of batch.works) {
        total += await ingestRecordsForWork(awemeId, records);
        // [T-152] 逐作品上报进度(M/N;runner 节流写库)。processed=已落库作品数,累计评论数入 message。
        doneWorks += 1;
        report({
          stage: "comments",
          processed: doneWorks,
          total: awemeIds.length,
          message: `已处理 ${doneWorks}/${awemeIds.length} 个作品 · 累计 ${total} 条评论`,
        });
      }
      // [T-232 run 诚实] 全量完成 vs 额度截断,message 走 CollectResult.message(T-235a 既有
      //   机制,runner 拼进合成 step 文本供运行详情展示);itemsNew 照实,不假装全量。
      const coverageMessage = buildCommentCoverageMessage({
        collectedWorks: batch.works.length,
        totalWorks: awemeIds.length,
        truncated: batch.truncated,
        cooldownRemainMs: batch.cooldownRemainMs,
      });
      report({
        stage: "comments",
        processed: batch.works.length,
        total: awemeIds.length,
        message: coverageMessage,
      });
      return { itemsNew: total, itemsUpdated: 0, message: coverageMessage };
    },
    // 作品明细导出(T-030-D8a,SPEC §9b):fetchDouyinWorkListExport(headless 复用 .auth/ →
    // 导航数据中心作品分析 → 点「刷新数据」+「导出数据」→ 截 xlsx 校验 PK 头)→ parseDouyin
    // WorkListXlsx(16 字段容错解析)→ 按 title/pub_date 匹配 publication(无 aweme_id 维度,
    // 匹配不上跳过)→ toDetailMetricRecords → ingestMetrics(resolvePublication→appendSnapshot,
    // rawMetrics 带完播/封面CTR/5s完播/2s跳出/主页访问 → 复盘核心指标从 0/fixture 变真)。
    // 未登录 → DouyinNotLoggedInError(runner catch → needs_reconnect,§6);导出非 xlsx →
    // DouyinExportError(普通失败)。itemsNew=真写入快照数;明细快照 append-only → itemsUpdated 0。
    "self.detail": async (ctx, target, report) => {
      // [T-152] 阶段①:登录校验 + 确保采集源(导出前 fetchDouyinWorkListExport 内先校验登录态)。
      report({ stage: "login", processed: 0, total: null, message: "校验抖音登录态" });
      const externalSourceId =
        typeof target.externalSourceId === "string" && target.externalSourceId
          ? target.externalSourceId
          : // [T-144] 空 target(job 未绑源)→ ensure 本 user 的真实抖音采集源(无源建、有源
            // 复用),绝不再指已退役的 "src-douyin-canonical"(新库查无 → 抛「外部来源不存在」
            // → runner 报 failed → 采 0 条的根因)。ensure 后 refreshDouyin 能校验通过。
            await ingestionService.ensureDouyinSource(ctx);
      const capturedAt = deps.now();
      // [T-322] detailWritten 提到 try 外(下方封面回填段 return 读它)。导出→解析→可见性
      //   同步→明细落库整段包 try:任一抛错只 console.error + 报一条 export 降级,**不**
      //   rethrow,让控制流继续到下方 runDouyinHeavyBackfill(封面回填不依赖导出结果,§④修点 A)。
      let detailWritten = 0;
      try {
        // 1) 抓导出 xlsx bytes(headless 复用扫码登录态;未登录/非 xlsx 抛,run 不建 → 快速失败)。
        // [gate-F7 插装点⑤] creator-center 导出限流(注真单例)。
        // [T-152] 阶段②:导出明细 xlsx(点「刷新数据」+「导出数据」,慢阶段)。
        report({ stage: "export", processed: 0, total: null, message: "导出作品明细数据" });
        const bytes = await (await loadDouyinCdp()).fetchDouyinWorkListExport(
          { authDir: douyinAuthDirFor(ctx.accountId) }, // [T-136] 按当前号登录态
          { gateway: douyinGateway },
        );
        // 2) 解析 16 字段明细(纯,exceljs 读内存 buffer)。
        // [T-152] 阶段③:解析明细(N 条)。
        report({ stage: "parse", processed: 0, total: null, message: "解析明细数据" });
        const details = await parseDouyinWorkListXlsx(bytes);
        // [T-202] 导出/解析条数落 console(不止 job_run progress):真机排「隐藏 0 标」时,先看这行——
        //   details.length===0 → 导出本身 0 条(登录态/tab/导出按钮问题,查上面 debugShot);
        //   details.length>0 但下方 hiddenSynced===0 → 同步/匹配问题(看 [douyin-detail-visibility])。
        console.log(
          `[douyin-detail-export] 解析 xlsx 得 ${details.length} 条明细行(bytes ${bytes.byteLength})`,
        );
        report({
          stage: "parse",
          processed: details.length,
          total: null,
          message: `解析出 ${details.length} 条明细`,
        });
        // 3) 装配作品目录(title + externalId=aweme_id + publishedAt),按 title/pub_date 匹配。
        //    T-034 断裂修复:导入作品(external_id=aweme_id)故意无 revision(见 publishing.repository
        //    createImportedPublication),故 getRecentPublicationsWithTitle 回来的 title 为空 —— 与
        //    L3004 dossier 装配同款回退:revision title 空时取 content_output 真实标题(导入时落在
        //    projects/content_output 上)。不回退 → 72 条采集作品 catalog title 恒空 → xlsx 明细
        //    永远匹配不上 → items_new 恒 0(断裂根因)。
        const pubs = await publishingService.getRecentPublicationsWithTitle(ctx, {
          limit: 500,
        });
        const catalog: PublicationCatalogEntry[] = [];
        for (const p of pubs) {
          let title = p.title;
          if (!title) {
            try {
              const out = await projectsRepo.getOutput(ctx, p.contentOutputId);
              title = out.title;
            } catch {
              // 防御:取不到作品标题就保持空(该条明细自然匹配不上,诚实跳过)。
            }
          }
          catalog.push({
            id: p.id,
            platform: p.platform,
            title,
            publishedAt: p.publishedAt,
            // [T-036] 同名同刻双轨(fixture 无 externalId / imported 有)消歧优先 imported ——
            // 落库锚就是 externalId,匹到 fixture 轨整条明细会被 toDetailMetricRecords 丢弃。
            externalId: p.externalId ?? null,
          });
        }
        const externalIdById = new Map<string, string>();
        for (const p of pubs) {
          if (p.externalId) externalIdById.set(p.id, p.externalId);
        }
        const matches = matchDetailsToPublications(details, catalog);
        // 3b) [T-073] 平台侧可见性同步:明细「审核状态」列(如「仅自己可见」/「已通过」)
        //     → publication.hidden_at + 导入项目 platform_ref.hidden。判定不了(审核中/
        //     未通过/空)诚实跳过,不动既有标记;找不到承载行也跳过(不硬造)。放在指标
        //     落库之前、且不受 records.length===0 早退影响(隐藏作品也可能产不出 record)。
        // [T-151 缺口 C 诊断] 可见性同步逐档计数 —— 存量真机 hidden_at 全 NULL 的根因需真机 xlsx
        //   才能定位(是 title 匹配不上?还是「审核状态」列没解析到值?还是状态字面量不含隐藏口径?)。
        //   加这组计数 + 采样,让下次真扫**自证根因**(不改数据、不硬猜),诚实分层。
        const visDiag = {
          total: matches.length,
          unmatched: 0, // publicationId=null(title 匹配不上 → T-034 断裂域)
          unknownStatus: 0, // 匹上了但审核状态判不出(列没解析 / 字面量不含隐藏口径)
          noExtId: 0, // 匹上了但无 externalId 锚(fixture 轨)
          hiddenSynced: 0, // 真标了 hidden
          visibleSynced: 0, // 真标了 visible
        };
        const statusSamples = new Set<string>();
        // [T-202] 未匹配明细的「作品标题」采样(锚 = title,匹不上多因 title 断裂 T-034)。真机看到
        //   具体标题 → 立刻能判是 catalog title 空、还是 xlsx 标题被截断/带表情不一致导致匹不上。
        const unmatchedTitleSamples = new Set<string>();
        for (const m of matches) {
          if (!m.publicationId) {
            visDiag.unmatched += 1;
            // 采样未匹配明细的「审核状态」原值 + 「标题」(去重,最多留几个),便于真机比对列/字面量。
            if (statusSamples.size < 8) statusSamples.add(m.detail.status ?? "");
            if (unmatchedTitleSamples.size < 8)
              unmatchedTitleSamples.add(m.detail.title ?? "");
            continue;
          }
          const vis = visibilityFromDetailStatus(m.detail.status);
          if (vis === "unknown") {
            visDiag.unknownStatus += 1;
            if (statusSamples.size < 8) statusSamples.add(m.detail.status ?? "");
            continue;
          }
          const extId = externalIdById.get(m.publicationId);
          if (!extId) {
            visDiag.noExtId += 1;
            continue; // 无 externalId 锚(fixture 轨)→ 跳过
          }
          const hidden = vis === "hidden";
          try {
            await publishingService.setVisibilityByExternalKey(ctx, {
              platform: "douyin",
              externalId: extId,
              hidden,
            });
            // [T-033] 同步平台侧审核状态,供 list「默认只显示已通过」+ 重活判据
            //   (isPublicationRunnableForHeavyWork)的 `platformStatus = '已通过'` 用。
            // [T-206] **归一**:真机 xlsx 原值是「公开」/「自见」而非「已通过」/「仅自己可见」——
            //   若直落原值,可见作品(公开)的 platformStatus='公开' 会被过滤器/判据 `=已通过` 误杀
            //   (连列表都不显)。故 visible → 落规范值「已通过」(过滤器/判据放行);hidden 由 hidden_at
            //   兜住(过滤器先判 hiddenAt IS NULL),platformStatus 保留原值方便诊断。
            await publishingService.setPlatformStatusByExternalKey(ctx, {
              platform: "douyin",
              externalId: extId,
              platformStatus: hidden ? (m.detail.status ?? null) : "已通过",
            });
            await projectsService.setImportedProjectHidden(ctx, {
              platform: "douyin",
              externalId: extId,
              hidden,
            });
            if (hidden) visDiag.hiddenSynced += 1;
            else visDiag.visibleSynced += 1;
          } catch {
            // 可见性同步失败不拖垮整批指标落库(best-effort;下轮采集会再同步)。
          }
        }
        // [缺口 C 诊断] 打印逐档结果 + 未判定明细的审核状态采样。真机看这行即知根因:
        //   unmatched 高 → title 匹配断裂;unknownStatus 高 + 采样非空 → 列/字面量口径需扩;
        //   hidden/visibleSynced 有值 → 同步链本身通(问题只在存量那一次)。
        console.log(
          `[douyin-detail-visibility] 明细 ${visDiag.total}(catalog ${catalog.length} 条作品):未匹配 ${visDiag.unmatched},状态判不出 ${visDiag.unknownStatus},无锚 ${visDiag.noExtId},标隐藏 ${visDiag.hiddenSynced},标可见 ${visDiag.visibleSynced}` +
            (statusSamples.size > 0
              ? ` · 未判定审核状态采样: ${Array.from(statusSamples)
                  .map((s) => JSON.stringify(s))
                  .join(", ")}`
              : "") +
            (unmatchedTitleSamples.size > 0
              ? ` · 未匹配标题采样: ${Array.from(unmatchedTitleSamples)
                  .map((s) => JSON.stringify(s))
                  .join(", ")}`
              : ""),
        );
        // 4) 匹配上的明细 → MetricRecord[](未匹配 / 无 externalId 锚 → 跳过,诚实)。
        const records = toDetailMetricRecords(
          matches,
          (pubId) => externalIdById.get(pubId) ?? null,
          capturedAt,
        );
        // [T-195] records 空(一条都没匹配上)时**不早退**:可见性已在上面同步(hidden_at/
        //   platform_status 已标),缺封面 / 待重建的可见作品仍应跑重活。故只跳过「建空 run」,
        //   下面的初始化重活(封面回填 + 逐字稿/重建)无论 records 是否为空都要跑。
        if (records.length > 0) {
          // [T-152] 阶段④:匹配落库(records.length 条匹配上的明细 → ingestMetrics)。
          report({
            stage: "ingest",
            processed: 0,
            total: records.length,
            message: `匹配落库 ${records.length} 条明细`,
          });
          const run = await ingestionService.createRun(ctx, {
            externalSourceId,
            runType: "douyin_detail",
            idempotencyKey: `${externalSourceId}:detail:${capturedAt}`,
          });
          const result = await ingestionService.ingestMetrics(ctx, {
            runId: run.id,
            records: records as unknown as Array<Record<string, unknown>>,
          });
          await ingestionService.completeRun(ctx, { runId: run.id });
          report({
            stage: "ingest",
            processed: result.recordsWritten,
            total: records.length,
            message: `已落库 ${result.recordsWritten} 条明细`,
          });
          detailWritten = result.recordsWritten;
        }
        // [T-202] 落库条数落 console:与上面 export/visibility 三行拼成完整链路证据
        //   (导出 N 行 → 匹配 M 条 → 落库 detailWritten 条),真机一眼定位断点。
        console.log(
          `[douyin-detail-ingest] 明细落库 ${detailWritten} 条快照(匹配上 ${records.length} 条 record)`,
        );
      } catch (detailErr) {
        // [T-322] 导出/解析/可见性/落库任一失败 → 只记日志 + 报一条 export 降级,**不**
        //   rethrow:继续跑下方封面回填(候选是纯 DB 查、分享页独立拉,不依赖 xlsx;可见性
        //   未同步 → platformStatus NULL 仍被重活判据 isPublicationRunnableForHeavyWork 放行,§②)。
        console.error(
          "[douyin-detail] 明细导出/解析/同步失败,跳过明细、继续回填封面:",
          detailErr,
        );
        report({
          stage: "export",
          processed: 0,
          total: null,
          message: "明细导出失败,跳过明细、继续回填封面",
        });
      }
      // 5) [T-195] 明细落库(可见性已标)后跑初始化重活:①封面回填(只对可见作品)②逐字稿 +
      //    重建排队(隐藏经 isWorkHidden 跳)。整体从 self.metrics 尾挪到这里 —— 此刻 hidden_at /
      //    platform_status 已标,故重活天然只对可见作品跑(不撞隐藏作品空 item_list 分享页)。两步
      //    各自 best-effort(见 runDouyinHeavyBackfill),整批失败绝不拖垮明细采集主流程。
      // [T-433 S1] 绑号轻触发:target.__skipHeavyBackfill 时跳过尾部逐条重活(封面/逐字稿/重建),
      //   避免多账号绑号把逐条重活堆进 gate-F5 超长串行队列;重活留次日 daily self.detail(不带此标)
      //   到点幂等补,不漏。明细导出/落库主流程不受影响(coversFilled=0 仅供 return itemsUpdated)。
      const heavy = (target as { __skipHeavyBackfill?: boolean })
        .__skipHeavyBackfill
        ? { coversFilled: 0 }
        : await runDouyinHeavyBackfill(
        ctx,
        {
          // ── 封面回填 host ──────────────────────────────────────────────────
          listPublicationsMissingCover: async (c, limit) =>
            (
              await publishingService.listPublicationsMissingCover(c, {
                platform: "douyin",
                limit,
              })
            ).map((p) => ({
              id: p.id,
              externalId: p.externalId ?? null,
              contentOutputId: p.contentOutputId ?? null,
              hiddenAt: p.hiddenAt,
              platformStatus: p.platformStatus,
            })),
          // [gate-F7] iesdouyin channel 限流:注真网关单例(与逐字稿取直链同一 channel)。
          fetchVideoUrl: async (awemeId) =>
            (await loadDouyinCdp()).fetchDouyinVideoUrl(awemeId, {
              fetch: (...args) => fetch(...args),
              gateway: douyinGateway,
            }),
          downloadImage: (url) => downloadDouyinImage(url),
          createImageAsset: (c, input) =>
            assetsService.createGeneratedAsset(c, {
              assetType: "image",
              name: input.name,
              bytes: input.bytes,
              mimeType: input.mimeType,
            }),
          setCover: async (c, publicationId, coverAssetId) => {
            await publishingService.setCover(c, publicationId, coverAssetId);
          },
          // [T-151 缺口 B] 封面绑作品所属项目:contentOutputId → getOutput().projectId →
          //   materialLinksService.create(entityType='asset')。素材中心「按项目」可见该封面。
          //   解析不到 project → 诚实跳过;建边失败由本 host 独立吞掉(封面已落是真的)。
          bindCoverToProjectByOutput: async (c, { contentOutputId, coverAssetId }) => {
            const output = await projectsRepo.getOutput(c, contentOutputId);
            const projectId = output.projectId;
            if (!projectId) return;
            await materialLinksService.create(c, {
              projectId,
              contentOutputId,
              entityType: "asset",
              entityId: coverAssetId,
              role: "cover",
              stage: "publishing",
              addedByType: "ingestion",
            });
          },
          // ── 逐字稿 + 重建排队 host ─────────────────────────────────────────
          listImportedWorks: (c) => projectsService.listImportedWorks(c),
          // [T-190] 反查作品 publication 可见性两列(找不到 → null,模块据此不硬跳)。
          resolvePublicationVisibility: async (c, externalId) => {
            const pub = await publishingService.resolvePublication(c, {
              platform: "douyin",
              externalId,
            });
            if (!pub) return null;
            return { hiddenAt: pub.hiddenAt, platformStatus: pub.platformStatus };
          },
          // 逐字稿:一批 awemeId 经 ai transport 排一个 transcribe.douyin(dispatch 链拦
          //   ai.tasks.create → runTranscribe;直调 service 会死链)。
          enqueueTranscribe: async (c, awemeIds) => {
            await ai.request(
              ENDPOINTS.createAITask,
              {
                params: undefined,
                query: undefined,
                body: {
                  taskType: "transcribe.douyin",
                  attemptId: createAiTaskAttemptId(),
                  inputData: { awemeIds },
                },
              },
              c,
            );
          },
          // 闸:该项目是否已有 origin='reconstructed' 的 artifact(重建过了不重跑)。
          hasReconstructedArtifact: async (c, projectId) => {
            const rows = await artifactsService.listProjectArtifacts(c, projectId);
            return rows.some((r) => r.origin === "reconstructed");
          },
          // 重建:经 ai transport 的 ai.tasks.create 起 reconstruct.project(dispatch 链后台跑;
          //   service 从 inputData.projectId 派生幂等键去重 IN-FLIGHT 重复)。
          enqueueReconstruct: async (c, projectId) => {
            await ai.request(
              ENDPOINTS.createAITask,
              {
                params: undefined,
                query: undefined,
                body: {
                  taskType: "reconstruct.project",
                  attemptId: createAiTaskAttemptId(),
                  inputData: { projectId },
                },
              },
              c,
            );
          },
        },
        {
          coverLimit: resolveCoverBackfillLimit(),
          // [T-152] 封面回填阶段逐条上报进度(M/N;runner 节流到每 ~1.5s 写一次库)。
          onCoverProgress: (doneN, totalN) =>
            report({
              stage: "cover_backfill",
              processed: doneN,
              total: totalN,
              message: `回填封面 ${doneN}/${totalN}`,
            }),
        },
      );
      // 6) [T-235d/T-513] 明细落库后 **best-effort** 触发正向归因回流；必须 await 到当前
      //    scheduled task 的 snapshot/lease 内（失败仍 catch，不把采集主结果改成失败）：
      //    对「有新指标 + 有真逐字稿 + 未归因」
      //    的已发布作品逐条 AI 归因(枚举化,相对本账号基线分层)→ 落 topic_attributions →
      //    next_experiments ≤3/run 进候选池(title 前缀「实验|」,card.attributionId 溯源)。
      //    幂等锚 publication_id;未配文本模型 / 无稿 / 无指标各态诚实跳过(runner 内计数)。
      //    本轮 enqueueTranscribe 排的新逐字稿要到下一轮 self.detail 才可归因(异步,诚实滞后)。
      //    [gate-F1] 与 learnings 零接触:由发布实绩触发,独立表,不互相触发。
      await runTopicAttribution(ctx, {
        // 未配文本模型 → 整轮诚实跳过(resolveModelSpec 抛 = 未配;闭包引用,无 TDZ,同 topic.daily)。
        isModelConfigured: async (c) => {
          try {
            await resolveModelSpec(c, "topic.attribution");
            return true;
          } catch {
            return false;
          }
        },
        // 候选作品:近期已发布(隐藏的跳过)+ 解析 projectId(output → project;导入作品的
        // title 回退 content_output 真实标题,与上方 catalog 装配同款回退)。单条解析失败跳过。
        listWorks: async (c, limit) => {
          const recent = await publishingService.getRecentPublicationsWithTitle(
            c,
            { limit },
          );
          const works: Array<{
            publicationId: string;
            projectId: string | null;
            title: string;
          }> = [];
          for (const p of recent) {
            if (p.hiddenAt) continue; // 隐藏作品不归因(与重活判据同口径)
            let projectId: string | null = null;
            let title = p.title;
            try {
              const out = await projectsRepo.getOutput(c, p.contentOutputId);
              projectId = out.projectId ?? null;
              if (!title) title = out.title;
            } catch {
              /* output 读不到 → projectId null(runner 按无稿跳过,诚实) */
            }
            works.push({ publicationId: p.id, projectId, title: title ?? "" });
          }
          return works;
        },
        hasAttribution: (c, publicationId) =>
          topicAttributionService.hasAttribution(c, publicationId),
        // 真逐字稿:output_script contentData.transcript(与复盘 reader getScript 同一读法,T-225 管线)。
        getTranscript: (c, projectId) =>
          makeReviewSubjectReader().getScript(c, projectId),
        // 该作品最新指标(最新 metric_snapshot rawMetrics;播放归一 views??plays)。无快照 → null。
        getMetrics: async (c, publicationId) => {
          const page = await analyticsService.getPublicationAnalytics(
            c,
            publicationId,
            1,
            10,
          );
          const latest = page.rows
            .slice()
            .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
          if (!latest) return null;
          const raw: Record<string, number> = {};
          for (const [k, v] of Object.entries(
            (latest.rawMetrics ?? {}) as Record<string, unknown>,
          )) {
            const n = typeof v === "number" ? v : Number(v);
            if (Number.isFinite(n)) raw[k] = n;
          }
          const plays = raw.views ?? raw.plays ?? null;
          const likes = raw.likes ?? null;
          return { plays, likes, raw };
        },
        // 本账号基线 = 各发布最新快照的播放/赞均值(dashboard rollup 现成口径,latest-per-publication)。
        getAccountBaseline: async (c) => {
          const rollup = await analyticsService.getDashboardRollup(c);
          if (rollup.snapshotCount === 0) return null;
          return {
            avgPlays:
              rollup.plays > 0 ? rollup.plays / rollup.snapshotCount : null,
            avgLikes:
              rollup.likes > 0 ? rollup.likes / rollup.snapshotCount : null,
          };
        },
        getPositioningBrief: async (c) => {
          try {
            const cc = await assembleCreativeContext(
              c,
              { projectId: null, topic: "" },
              {
                positioning: {
                  getPositioningCenter: (c2) =>
                    positioningService.getPositioningCenter(c2),
                },
              },
            );
            return cc.positioningBrief;
          } catch {
            return "";
          }
        },
        attribute: createTopicAttributionPort({ resolveModelSpec }),
        saveAttribution: async (c, input) => {
          const saved = await topicAttributionService.saveAttribution(c, input);
          return { id: saved.id };
        },
        // 实验候选进池:source 用现有枚举里语义最近的 demand(回流实验 = 账号自证的需求信号);
        // card.attributionId 溯源(additive 字段,UI「实验」徽标点开看归因依据)。
        createExperimentCandidate: async (c, input) => {
          const cand = await candidateService.createCandidate(c, {
            title: input.title,
            angle: input.angle,
            source: "demand",
          });
          try {
            await candidateService.patchCandidate(c, cand.id, {
              card: { attributionId: input.attributionId },
            });
          } catch (e) {
            // 溯源 patch 失败只丢角标(候选已进池是真的),不崩进池。
            console.error(
              `[topic-attribution] 实验候选 ${cand.id} 归因溯源 patch 失败(候选已进池):`,
              e,
            );
          }
          return { id: cand.id };
        },
        // [T-284b G2 / T-284c G3-A] 可复用公式回流成 learning(复用 learnings 管线)。
        // attribution 只在「已发布 + 有真实指标 + 有真逐字稿」作品跑,故其经验天然扎在真实发布
        // 数据上 → evidenceStrength='grounded' → learningsService 直接落 validated 自动进生成
        // (守宪法②第二道闸唯一放开口:只放行客观真实数据背书,不放 AI 空想)。best-effort。
        createLearning: async (c, input) => {
          await learningsService.createLearning(c, {
            title: input.title,
            insight: input.insight,
            learningType: input.learningType,
            evidenceStrength: input.evidenceStrength,
          });
        },
        // grounded 判据阈值 N(真实指标条数下限;env 配置化,默认 1)。
        groundingMinMetrics: (() => {
          const n = Number(process.env.CREATOROS_LEARNING_GROUNDING_MIN_METRICS);
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
        })(),
        // 单轮归因上限(省 token,默认 3;env 配置化)。
        maxWorksPerRun: (() => {
          const n = Number(process.env.CREATOROS_TOPIC_ATTRIBUTION_LIMIT);
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
        })(),
        // 分层阈值配置化(默认 ≥3x 爆款 / ≤0.5x 低表现)。
        tierThresholds: {
          viralMultiple: (() => {
            const n = Number(process.env.CREATOROS_ATTRIBUTION_VIRAL_MULTIPLE);
            return Number.isFinite(n) && n > 0 ? n : undefined;
          })(),
          lowMultiple: (() => {
            const n = Number(process.env.CREATOROS_ATTRIBUTION_LOW_MULTIPLE);
            return Number.isFinite(n) && n > 0 ? n : undefined;
          })(),
        },
      }).catch((err) => {
        console.error(
          "[topic-attribution] 归因回流触发失败(best-effort,不影响明细采集):",
          err,
        );
      });
      // itemsUpdated 承载本轮真回填的封面数(诚实;明细写入数入 itemsNew)。
      return { itemsNew: detailWritten, itemsUpdated: heavy.coversFilled };
    },
    // [T-212a] 对标他号采集:读该号 enabled 对标源 → 逐源抓公开作品列表(fetchDouyinUserPosts:
    //   sec_uid 主页 aweme/post,只读公开统计)→ detectViral 筛爆款 → 每源 ≤10 条落 benchmark_works
    //   (拆解状态=待拆,供 T-212c)。降频(源间 sleep ≥1.5s)、单源失败跳过、限流网关已接(gateway
    //   在 fetchDouyinUserPosts 内每页 acquire)。空源 → 诚实 0 跑(非失败)。
    benchmark: async (ctx, _target, report) => {
      if (await intelligenceService.isLegacySignalSourceWriteFenced(ctx)) {
        report({
          stage: "retired",
          processed: 0,
          total: 0,
          message: "旧对标采集已退役；请在内容雷达同步博主与作品。",
        });
        return {
          itemsNew: 0,
          itemsUpdated: 0,
          message: "旧对标采集已退役；来源、作品与转选题统一由内容雷达处理。",
        };
      }
      const result = await collectBenchmark(ctx, {
        listEnabledSources: (c) => benchmarkService.listEnabledSources(c),
        fetchSourcePosts: async (c, source) => {
          const works = await (await loadDouyinCdp()).fetchDouyinUserPosts(
            {
              authDir: douyinAuthDirFor(c.accountId), // [T-136] 按当前号登录态指纹
              secUid: source.externalAccountId,
              gateway: douyinGateway,
            },
            {},
          );
          return works.map((w) => ({
            awemeId: w.awemeId,
            description: w.description,
            diggCount: w.diggCount,
            commentCount: w.commentCount,
            collectCount: w.collectCount,
            shareCount: w.shareCount,
            duration: w.durationSec * 1000, // 秒 → ms(schema duration 存 ms)
            createTime: w.createTime ? String(w.createTime) : null, // unix 秒原值
          }));
        },
        recordWork: (c, input) => benchmarkService.recordWork(c, input),
        now: deps.now,
        report,
      });
      // [T-235b] 黑马雷达(平台内证据):对标源采集后**串行**跑关键词黑马搜索(共享 gate-F5
      //   串行闸 + douyinGateway 限流预算)。关键词 = 定位 keywords + env
      //   CREATOROS_DARKHORSE_KEYWORDS(逗号分隔)可配;无关键词/未登录/验证码 → 采集器内
      //   诚实降级(0 跑/跳词),**绝不回退对标采集结果**(黑马失败只丢黑马)。
      let darkhorseResult: { itemsNew: number; itemsUpdated: number; message?: string } = { itemsNew: 0, itemsUpdated: 0 };
      try {
        darkhorseResult = await collectDarkhorse(ctx, {
          listKeywords: async (c) => {
            const envKeywords = (process.env.CREATOROS_DARKHORSE_KEYWORDS ?? "")
              .split(/[,，]/)
              .map((k) => k.trim())
              .filter((k) => k.length > 0);
            let positioningKeywords: string[] = [];
            try {
              const center = await positioningService.getPositioningCenter(c);
              positioningKeywords = center.keywords ?? [];
            } catch {
              positioningKeywords = []; // 定位读失败 → 只用 env(诚实降级)
            }
            return [...positioningKeywords, ...envKeywords];
          },
          searchVideos: async (c, keyword) => {
            const videos = await (await loadDouyinCdp()).fetchDouyinSearchVideos(
              {
                authDir: douyinAuthDirFor(c.accountId), // [T-136] 按当前号登录态
                keyword,
                gateway: douyinGateway,
              },
              {},
            );
            return videos.map((v) => ({
              awemeId: v.awemeId,
              description: v.description,
              diggCount: v.diggCount,
              commentCount: v.commentCount,
              collectCount: v.collectCount,
              shareCount: v.shareCount,
              duration: v.durationMs, // 抖音 video.duration 原值已是 ms
              createTime: v.createTime,
              authorSecUid: v.authorSecUid,
              authorNickname: v.authorNickname,
              authorFollowerCount: v.authorFollowerCount,
            }));
          },
          recordWork: (c, input) => benchmarkService.recordWork(c, input),
          now: deps.now,
          report,
        });
      } catch (err) {
        // 黑马整体失败(极端)→ 只丢黑马,不影响对标采集结果(诚实记错)。
        console.error("[darkhorse] 黑马雷达失败(不影响对标采集):", err);
      }
      // 合并计数(job_run 的 itemsNew/Updated = 对标 + 黑马;message 注明黑马实绩)。
      const result2 = {
        itemsNew: result.itemsNew + darkhorseResult.itemsNew,
        itemsUpdated: result.itemsUpdated + darkhorseResult.itemsUpdated,
        message: darkhorseResult.message,
      };
      // [T-212c/T-513] 采集落库后 **best-effort** 触发拆解转化；await 保证模型调用不逃出
      // 当前 scheduled task 的 snapshot/lease（失败仍 catch，不影响采集主结果）：
      //   读该号待拆爆款(is_viral+pending)→ AI 拆解(runStructuredNode,不抄袭换角度)→ 高适配
      //   ≤3 条 createCandidate(source=benchmark,参考链接+爆款倍数入 angle)→ 标 teardown_status=done。
      //   拆解走真 AI(慢),故不并进采集的 await;失败只记日志,绝不回退采集结果。
      await runBenchmarkTeardown(ctx, {
        listPendingViralWorks: (c, limit) =>
          benchmarkService.listPendingViralWorks(c, limit),
        getPositioningBrief: async (c) => {
          try {
            const cc = await assembleCreativeContext(
              c,
              { projectId: null, topic: "" },
              {
                positioning: {
                  getPositioningCenter: (c2) =>
                    positioningService.getPositioningCenter(c2),
                },
              },
            );
            return cc.positioningBrief;
          } catch {
            return "";
          }
        },
        teardown: createBenchmarkTeardownPort({ resolveModelSpec }),
        createCandidate: async (c, input) => {
          const cand = await candidateService.createCandidate(c, input);
          return { id: cand.id };
        },
        // [T-284a] 复刻补链 G1:给刚建的 benchmark 候选补挂原爆款拆解要素(card.teardown)。绑
        //   candidateService.patchCandidate(card partial 浅合并;pickCardFields 已放行 teardown 对象)。
        patchCandidate: async (c, candidateId, patch) => {
          await candidateService.patchCandidate(c, candidateId, patch);
        },
        markTeardownDone: (c, workId) =>
          benchmarkService.markTeardownDone(c, workId),
      }).catch((err) => {
        console.error(
          "[benchmark] 拆解转化触发失败(best-effort,不影响采集):",
          err,
        );
      });
      return result2;
    },
    // [T-235a] 每天自动出题(topic.daily):多依据合并(定位+评论信号+知识库+热点)→ topic.generate
    //   同模板出题(runTopicNode)→ T-212d 护栏排序(探索位保底)→ candidateService.createCandidate
    //   落 pool(source 透传 trend/benchmark/demand)。防灌库 ≤N/天(env CREATOROS_TOPIC_DAILY_LIMIT,
    //   默认 5,按当天已建候选计数);未配文本模型 → 诚实跳过(itemsNew=0 + message)。纯 AI + 库内
    //   数据 + web 检索,不碰 douyinGateway(与采集类 job 无限流冲突;仍走 gate-F5 串行闸统一排队,
    //   错峰 9:40 在 benchmark 9:30 后)。resolveModelSpec/searchWebPort 定义在本工厂后方 —— 采集器
    //   闭包只在到点/触发时执行(工厂初始化早已完成),按闭包引用捕获无 TDZ 问题(与 dispatch 分支同款)。
    "topic.daily": async (ctx, _target, report) => {
      const dailyLimitRaw = Number(process.env.CREATOROS_TOPIC_DAILY_LIMIT);
      return collectDailyTopics(ctx, {
        // ContextDeps(与 topic.generate dispatch 同源绑法,只装出题需要的读源;知识用 list dump,
        // creative-context 内部 best-effort 空兜底)。
        positioning: {
          getPositioningCenter: (c) =>
            positioningService.getPositioningCenter(c),
        },
        learnings: {
          getSuggestions: (c, opts) => learningsService.getSuggestions(c, opts),
        },
        signals: {
          list: async (c, opts) =>
            (
              await candidateService.listSignals(c, {
                limit: opts.limit ?? 30,
                offset: 0,
              })
            ).rows.map((s) => ({
              source: s.source,
              rawText: s.rawText,
              demandTag: s.demandTag,
              // [T-238] 评论按作品锚 → 信号质量画像算覆盖作品数。
              publicationId: s.publicationId ?? null,
            })),
        },
        knowledge: {
          list: async (c, opts) =>
            (await knowledgeService.listKnowledge(c))
              .slice(0, opts.limit ?? 40)
              .map((k) => ({
                title: k.title,
                knowledgeType: k.knowledgeType,
                usedCount: k.usedCount,
                usedInPublished: k.usedInPublished,
                sourceNote: k.sourceNote ?? null,
                // [T-238] 新鲜度 → 信号质量画像算近 30 天占比。
                createdAt: k.createdAt ?? null,
              })),
        },
        resolveModelSpec,
        // [T-126] 热点依据:复用联网检索端口(rss 免 key / browser 无头采集)。未配 web.search →
        // 抛 SearchConfigError,collector 内(assembleTrendBrief allSettled)成空热点段(诚实降级)。
        trendSearch: (c, query, opts) => searchWebPort(c, query, opts),
        // [T-235b] 已登记信源信号(主路),与 web 搜索并行拼热点段(单路失败只丢该段)。
        trendSourceSignals: (c) => trendSourceSignalsPort(c),
        // 出题节点:ai-worker runTopicNode(topic.generate 同模板 + runStructuredNode 跨模型健壮)。
        // 多依据已合并进 basisBrief(分段),basis 取 "positioning"(定位为纲的通用出题 hint)。
        generateTopics: async (_c, input) => {
          const { modelFor, runTopicNode } = await import(
            "@creatoros/ai-worker"
          );
          const { topics } = await runTopicNode({
            model: modelFor(input.spec),
            positioningBrief: input.positioningBrief,
            basisBrief: input.basisBrief,
            knowledgeBrief: input.knowledgeBrief,
            learningsBrief: input.learningsBrief,
            // [T-238] 依据质量画像段(collector 装配)→ 模板 v3 动态定权。
            signalQualityBrief: input.signalQualityBrief,
            basis: "positioning",
          });
          return topics;
        },
        // [T-212d] active 硬偏好(candidateService 是唯一读法;service 层已保 ±10 封顶/≥3 例)。
        listActivePreferences: async (c) =>
          (await candidateService.listActiveTopicPreferences(c)).map((p) => ({
            keyword: p.keyword,
            direction: p.direction === "prefer" ? ("prefer" as const) : ("avoid" as const),
            weight: p.weight,
            exampleCount: p.exampleCount,
            lastReinforcedAt: p.lastReinforcedAt,
          })),
        // 防灌库计数:当天(UTC 自然日,与 triggerScheduledJob dayKey 同口径)已建候选数。
        countCandidatesCreatedToday: async (c) => {
          const today = deps.now().slice(0, 10);
          const { rows } = await candidateService.listCandidates(c, {
            limit: 1000,
            offset: 0,
          });
          return rows.filter((r) => (r.createdAt ?? "").slice(0, 10) === today)
            .length;
        },
        createCandidate: async (c, input) => {
          const cand = await candidateService.createCandidate(c, input);
          return { id: cand.id };
        },
        now: deps.now,
        dailyLimit:
          Number.isFinite(dailyLimitRaw) && dailyLimitRaw > 0
            ? Math.floor(dailyLimitRaw)
            : undefined,
        report,
      });
    },
    // [T-235c] 旧指定收藏夹采集兼容链：只供迁移前存量任务读取；新来源统一在内容雷达登记。
    //   收藏夹列表按 name 精确匹配(回填 collectsId + lastSyncedAt)→ 逐匹配夹拉夹内视频
    //   (≤50/夹)→ favorites_items 幂等台账((user, aweme_id) 去重只插新)→ **≤3/run 限量进池**
    //   (照 benchmark-teardown maxPromotePerRun 语义,防灌库)→ createCandidate(source=favorites)
    //   + markItemPromoted 溯源。**只采登记的指定夹,不碰其他收藏**(隐私红线)。
    //   诚实降级:无登记夹 → 0 跑 + 引导 message(非失败);抖音上找不到同名夹 → message 点名;
    //   验证码 → fetch 函数内返空跳过。未登录 → DouyinNotLoggedInError 直接上抛(runner
    //   isNotLoggedInError → needs_reconnect,与 self.metrics/comments 同款路径)。
    favorites: async (ctx, _target, report) => {
      if (await intelligenceService.isLegacySignalSourceWriteFenced(ctx)) {
        report({
          stage: "retired",
          processed: 0,
          total: 0,
          message: "旧收藏夹采集已退役；请在内容雷达使用“我的收藏”。",
        });
        return {
          itemsNew: 0,
          itemsUpdated: 0,
          message: "旧收藏夹采集已退役；收藏作品统一由内容雷达建档。",
        };
      }
      report({ stage: "favorites", processed: 0, total: null, message: "读取登记的收藏夹" });
      const folders = await favoritesService.listEnabledFolders(ctx);
      if (folders.length === 0) {
        // 诚实降级(照 benchmark collector 空源 0 跑风格):没登记 = 没开这路信号,引导去登记。
        return {
          itemsNew: 0,
          itemsUpdated: 0,
          message:
            "未指定收藏夹：请在内容雷达添加“我的收藏”来源；旧收藏夹自动化已进入迁移兼容期。",
        };
      }

      // ① 拉本人收藏夹列表(未登录在此抛 DouyinNotLoggedInError → needs_reconnect;验证码返空)。
      report({ stage: "favorites", processed: 0, total: folders.length, message: "拉取抖音收藏夹列表" });
      const remoteFolders = await (await loadDouyinCdp()).fetchDouyinCollectsFolders({
        authDir: douyinAuthDirFor(ctx.accountId), // [T-136] 按当前号登录态
        gateway: douyinGateway,
        diagnostics: {
          requestId: ctx.requestId,
          accountId: ctx.accountId ?? undefined,
        },
      });
      const remoteByName = new Map(remoteFolders.map((f) => [f.name, f]));

      // ② 按 name 精确匹配登记夹;匹配到回填 collectsId + lastSyncedAt,匹配不到记 message 点名。
      const messages: string[] = [];
      const matched: { id: string; name: string; collectsId: string }[] = [];
      for (const folder of folders) {
        const remote = remoteByName.get(folder.name);
        if (!remote) {
          messages.push(
            `抖音上找不到收藏夹「${folder.name}」,请在抖音建同名夹或改登记名`,
          );
          continue;
        }
        matched.push({ id: folder.id, name: folder.name, collectsId: remote.collectsId });
        try {
          await favoritesService.updateFolderSync(ctx, folder.id, {
            collectsId: remote.collectsId,
            lastSyncedAt: deps.now(),
          });
        } catch {
          // 回填失败只丢诊断字段(下轮重匹配即可),不阻断该夹采集。
          console.error(
            "[favorites] request_failed",
            JSON.stringify({
              category: "folder_sync",
              requestId: ctx.requestId,
              traceId: null,
              accountId: ctx.accountId,
            }),
          );
        }
      }

      // ③ 逐匹配夹拉视频 → 幂等落台账(单夹失败跳过不崩整批;未登录仍上抛保持 needs_reconnect)。
      let recordedNew = 0;
      for (let i = 0; i < matched.length; i++) {
        const folder = matched[i]!;
        report({
          stage: "favorites",
          processed: i,
          total: matched.length,
          message: `采集收藏夹「${folder.name}」`,
        });
        try {
          const videos = await (await loadDouyinCdp()).fetchDouyinCollectsVideos({
            authDir: douyinAuthDirFor(ctx.accountId), // [T-136] 按当前号登录态
            collectsId: folder.collectsId,
            maxItems: 50,
            gateway: douyinGateway,
            diagnostics: {
              requestId: ctx.requestId,
              accountId: ctx.accountId ?? undefined,
            },
          });
          const { recordedNew: n } = await favoritesService.recordItems(
            ctx,
            folder.id,
            videos.map((v) => ({
              awemeId: v.awemeId,
              // title = desc 截 80(展示/进池标题;空 desc 进池侧再兜「收藏夹视频」)。
              title: v.description.slice(0, 80),
              authorNickname: v.authorNickname,
              url: `https://www.douyin.com/video/${v.awemeId}`,
            })),
          );
          recordedNew += n;
        } catch (err) {
          if (err instanceof DouyinNotLoggedInError) throw err; // 登录态断 → needs_reconnect
          // 单夹失败(验证码外的网络/解析)→ 跳过该夹,不崩整批(诚实记错,同 benchmark 单源纪律)。
          console.error(
            "[favorites] folder_ingest_failed",
            JSON.stringify({
              category: "service",
              requestId: ctx.requestId,
              traceId: null,
              accountId: ctx.accountId,
            }),
          );
          messages.push(`收藏夹「${folder.name}」本次采集失败,已跳过`);
        }
      }

      // ④ 进池:pending 台账 FIFO → createCandidate(source=favorites)→ 标 promoted。单条失败跳过
      //   (候选门失败不吞台账;下轮 pending 仍在)。
      //   [T-278] 上限 3→50:收藏夹是**用户亲手挑的**,不是自动发现的信息流(benchmark/darkhorse
      //   那种才需 ≤3/run「防灌库」)。3/run + 每天只跑一次 → 用户存 13 条要 ~5 天才全进池,实测
      //   「采集 13 条但今日新选题只见 3 条」的根因。50 = 匹配单夹抓取上限 ≤50/夹,一轮把用户新存
      //   的全部进池,当天即见。
      const folderNameById = new Map(folders.map((f) => [f.id, f.name]));
      const pending = await favoritesService.listPendingItems(
        ctx,
        FAVORITES_PROMOTE_PER_RUN,
      );
      let promoted = 0;
      for (const item of pending) {
        const folderName = folderNameById.get(item.folderId) ?? "收藏夹";
        try {
          const cand = await candidateService.createCandidate(ctx, {
            title: item.title || "收藏夹视频",
            angle: `收藏夹「${folderName}」跟拍参考 · @${item.authorNickname || "未知作者"} · ${item.url}`,
            source: "favorites",
          });
          await favoritesService.markItemPromoted(ctx, item.id, cand.id);
          promoted += 1;
        } catch {
          console.error(
            "[favorites] request_failed",
            JSON.stringify({
              category: "candidate_promotion",
              requestId: ctx.requestId,
              traceId: null,
              accountId: ctx.accountId,
            }),
          );
        }
      }

      // ⑤ [T-235d-distill] 蒸馏链(best-effort,采集主流程绝不受影响):transcribe→判库→知识蒸馏确认门。
      //   与④进池路径**正交**:一条收藏既是跟拍候选(④),又可判知识(⑤)——各答各的问题,不去重。
      //   **origin 隔离**:逐字稿落 favorites_items.transcript,**永不建 imported project/artifact**
      //   (见 favorites-distill-runner);故 transcribeOne 复用 transcribe 原语但**不**走 ensureTranscriptArtifact。
      //   ≤3/run(runner 默认)防超载;整体 try/catch 兜底(runner 内已 best-effort 逐条,这里再保一层)。
      let distilled = { processed: 0, knowledge: 0, topic: 0, skip: 0, failed: 0 };
      try {
        distilled = await runFavoritesDistill(ctx, {
          listItemsForDistill: (c, limit) =>
            favoritesService.listItemsForDistill(c, limit),
          saveTranscript: (c, itemId, t) =>
            favoritesService.saveTranscript(c, itemId, t),
          saveVerdict: (c, itemId, v) =>
            favoritesService.saveDistillVerdict(c, itemId, v),
          // 取逐字稿:复用 [T-349] 抽出的公共原语 transcribeOneAweme(iesdouyin 直链 → ffmpeg
          //   抽音 → 云 ASR)。图集/无口播 → 返 null(runner 诚实 skip)。行为零变(原内联段抽出)。
          transcribeOne: (c, awemeId) => transcribeOneAweme(c, awemeId),
          // 判库(favorites.triage)+ 知识蒸馏(knowledge.distill)—— capability 经 model-config 解析,不写死。
          triage: createFavoritesTriagePort({ resolveModelSpec }),
          distillKnowledge: (c, content) =>
            runKnowledgeDistill(c, { content }, { resolveModelSpec }),
        });
      } catch {
        // 蒸馏链整体失败(不该发生;runner 内已逐条 best-effort)→ 记日志,采集主流程照常返回。
        console.error(
          "[favorites] request_failed",
          JSON.stringify({
            category: "distillation",
            requestId: ctx.requestId,
            traceId: null,
            accountId: ctx.accountId,
          }),
        );
      }

      const distillNote =
        distilled.processed > 0
          ? `,蒸馏 ${distilled.processed} 条(知识 ${distilled.knowledge}/选题 ${distilled.topic}/跳过 ${distilled.skip}/失败 ${distilled.failed})`
          : "";
      report({
        stage: "favorites",
        processed: matched.length,
        total: matched.length,
        message: `收藏夹采集完成:台账新增 ${recordedNew} 条,进池 ${promoted} 条${distillNote}`,
      });
      // itemsNew=台账真新增;itemsUpdated=本轮真进池数(诚实);message 汇总匹配失败/引导。
      return {
        itemsNew: recordedNew,
        itemsUpdated: promoted,
        message: messages.length > 0 ? messages.join(";") : undefined,
      };
    },
  };

  // dispatchScheduledCollection 实体:装 runner deps 后经 [gate-F5] 采集串行闸挂到链尾
  // (fire-and-forget,concurrency=1)。forward-declared 于 ai transport 之上;dispatch 分支 +
  // 调度器共用。**串行闸让同时只跑一个采集 job**(防两个 Chromium 各打一 channel 并存),与
  // gateway 的请求级节奏正交(SPEC §4.4 [gate-F5])。runScheduledCollection 内部已 try/catch/
  // finally 落 job_run 终态,链尾再 catch 兜底,一次失败不堵死后续采集。
  const dispatchScheduledCollection = (ctx: RequestContext, task: {
    id: string;
    taskType: string;
    inputData: Record<string, unknown>;
  }) => {
    return runTaskWithEffectiveSkillSnapshot(ctx, task.id, () =>
      enqueueCollectionRun(() =>
        runScheduledCollection(ctx, task, {
          ai: {
            markRunning: (c, id) => aiService.markRunning(c, id),
            recordStep: (c, id, input) => aiService.recordStep(c, id, input),
            markSucceeded: (c, id) => aiService.markSucceeded(c, id),
            markFailed: (c, id, err) => aiService.markFailed(c, id, err),
          },
          runs: {
            updateRun: (c, runId, patch) =>
              schedulingService.updateRun(c, runId, patch),
          },
          collectors: scheduledCollectors,
          // runner 不 import douyin-cdp:未登录判别经注入(→ needs_reconnect,§6)。
          isNotLoggedInError: (err) => err instanceof DouyinNotLoggedInError,
          now: deps.now,
        }),
      ),
    );
  };

  // 调度器系统 ctx:自发触发(无 HTTP 请求),用 canonical user 身份(本机单用户起步)。
  // source="ingestion":调度器本质是数据采集 pipeline 触发(与 L2816 采集 ctx 一致;
  // RequestContext.source 枚举无 "system",ingestion 是诚实 provenance)。
  const schedulerCtx: RequestContext = {
    userId: canonicalDataset.user.id,
    requestId: "scheduler",
    source: "ingestion",
  };

  // triggerScheduledJob 的共用 deps(TriggerDeps):cron 到点(startScheduler)与「立即运行」
  // (D5,scheduledJobs.runNow)共用同一份端口 —— 触发点单一(SPEC §5),幂等双闸只此一处。
  // ai.createTask/runs.*/dispatch 绑工厂内可见的 aiService/schedulingService/
  // dispatchScheduledCollection。
  const triggerDeps: TriggerDeps = {
    ai: {
      createTask: async (c, body) => {
        const t = await aiService.createTask(c, body);
        return { id: t.id, status: t.status };
      },
    },
    runs: {
      createRun: (c, input) => schedulingService.createRun(c, input),
      listRunsByJob: async (c, jobId, query) => {
        const { rows, total } = await schedulingService.listRunsByJob(
          c,
          jobId,
          query,
        );
        return {
          rows: rows.map((r) => ({
            id: r.id,
            status: r.status,
            startedAt: r.startedAt,
            aiTaskId: r.aiTaskId ?? null,
          })),
          total,
        };
      },
      updateRun: (c, runId, patch) =>
        schedulingService.updateRun(c, runId, patch),
    },
    dispatch: (ctx, task) => dispatchScheduledCollection(ctx, task),
    now: deps.now,
    // [T-201d] 隐藏号定时任务停跑 gate 的查号端口:复用 platformAccountService.getAccount
    //   (自带 ownership gate)取该号 status;号不存在/越权/查失败 → null(降级放行,不误停)。
    getAccountStatus: (c, accountId) =>
      platformAccountService
        .getAccount(c, accountId)
        .then((a) => a?.status ?? null)
        .catch(() => null),
  };

  // [T-189a] 绑定抖音成功回调实体(loginDouyin 成功后 fire-and-forget 调):幂等建三个每天定时采集
  //   job(self.metrics / self.detail / comments)+ 按序初始化触发一次拉全量(triggerScheduledJob
  //   经 triggerDeps → dispatch 挂 gate-F5 串行链)。用**请求 ctx**(带当前号 accountId,init 采集
  //   走该号 authDir);整体经 void 包裹不阻塞绑定返回。schedulingService/triggerDeps 均已在上方装配。
  const bootstrapDouyinOnBind = (ctx: RequestContext) => {
    // [T-201a2] 登录态锚点对齐:新绑号 scan 时 ctx.accountId=null(号是 scan 后 ensureAccount 才建)→
    //   loginDouyin 的 `login({accountId: null})` 把登录态落 `.auth/douyin/_default`;而账号是真 id →
    //   设置/自动化按号探针 statusDouyin(带 x-account-id)读 `.auth/douyin/<id>` 找不到登录 → 误报
    //   「重新扫码」;初始采集按号也读 `<id>`(空)→ 采不到。**在触发采集前**(此刻 `<id>` 目录尚未被
    //   采集建成空壳)把 `_default` 登录态迁到 `<id>` 目录 → 登录态与不可变 id 锚点一致(单号现实;
    //   多号各自扫码 = T-136 §D)。同步 renameSync(同目录基址、原子);best-effort,失败不阻断建 job/采集。
    if (ctx.accountId) {
      try {
        const fromDir = douyinAuthDirFor(null); // _default
        const toDir = douyinAuthDirFor(ctx.accountId);
        if (fromDir !== toDir && existsSync(fromDir) && !existsSync(toDir)) {
          renameSync(fromDir, toDir);
        }
      } catch {
        /* 登录态迁移 best-effort:失败则 statusDouyin 仍回退可查(见 douyinAuthDirFor 回退),不阻断绑定 */
      }
    }
    // [T-332 S2] 新号绑定即补种该号的默认变现加权 rubric(rubrics 是 per-account 域,
    //   NOT NULL;不种则该号校准/编导评分无默认口径,要等下次启动)。幂等
    //   (onConflictDoNothing);fire-and-forget,失败不阻断绑定。
    //   注:ensureCanonicalRubricForAccount 在本工厂靠后定义 —— 绑定回调只在构造完成后
    //   触发,无 TDZ 风险(与 calibrationService lazy thunk 同款模式)。
    if (ctx.accountId) {
      void ensureCanonicalRubricForAccount(ctx.accountId).catch((err) =>
        console.warn("[seed] 绑定补种默认 rubric 失败(不阻断绑定):", err),
      );
    }
    void bootstrapDouyinCollectionJobs(ctx, {
      listJobsBySourceKind: async (c, sourceKind) => {
        const { rows } = await schedulingService.listJobs(c, {
          sourceKind,
          limit: 1,
          offset: 0,
        });
        // [T-200] 带既有 job 属主号:复用既有 job 时把号带给 trigger(触发采集 ctx 由此派生)。
        return rows.map((r) => ({ id: r.id, accountId: r.accountId ?? null }));
      },
      createJob: async (c, input) => {
        const job = await schedulingService.createJob(c, {
          name: input.name,
          prompt: input.prompt,
          sourceKind: input.sourceKind,
          schedule: input.schedule,
          target: input.target,
          // [T-359] 分层启用透传:默认关的模板建即 disabled(缺省 undefined = service 默认 true)。
          enabled: input.enabled,
        });
        return { id: job.id };
      },
      // 初始化触发复用 triggerScheduledJob(与 cron 到点 / 「立即运行」同一幂等双闸 + 触发点)。
      //   [T-433 S1] 透传 options(绑号 self.detail 带 skipHeavyBackfill,重活延后次日)。
      trigger: async (c, job, options) => {
        await triggerScheduledJob(c, job, triggerDeps, options);
      },
      // [T-332 S2] claimOrphans / hasOtherActiveDouyinAccount(T-200/T-331)接线已全链退役
      //   (SPEC §4.4):strict + NOT NULL 世界不存在无号存量,绑定 = 只建号绑定 job + 初始化
      //   触发,零 claim —— 绑第二个号不改动任何既有行归属(ISO-08)。
      // 空 target:采集器空 target 时自 ensureDouyinSource 兜底解析源(与手动建的 job 一致)。
      target: {},
    }).catch((err) =>
      console.error("[persistence-client] 绑定抖音 bootstrap 建 job/初始化失败:", err),
    );
  };

  // 「立即运行」(D5):wrap scheduling transport,拦 scheduledJobs.runNow(composition-only
  // op —— module transport 不认它,因触发后台动作要 dispatchScheduledCollection,在此 composition
  // 层才可见)。命中 → 用**请求 ctx**(真实 userId,手动触发归当前用户)查 job → triggerScheduledJob
  // (幂等双闸 + fire-and-forget)→ 返回 { jobRunId, aiTaskId, deduped }。其余 op 透传 module
  // transport(scheduling)。
  const schedulingWithRunNow: Transport = {
    async request(endpoint, input, ctx) {
      if (endpoint.id === "scheduledJobs.runNow") {
        if (!ctx) throw new Error("AuthenticationError: runNow requires ctx");
        const { params } = (input ?? {}) as { params?: { jobId?: string } };
        const jobId = params?.jobId ?? "";
        const result = await runJobNow(ctx, jobId, {
          ...triggerDeps,
          job: {
            getJob: async (c, id) => {
              const j = await schedulingService.getJob(c, id);
              // [T-200] 带 job 属主号:触发采集 ctx.accountId 由此派生(与 cron/bind 三路统一)。
              return {
                id: j.id,
                sourceKind: j.sourceKind,
                target: j.target,
                accountId: j.accountId ?? null,
              };
            },
          },
        });
        // [T-201d] 归属号已隐藏(status 非 active)→ triggerScheduledJob 跳过不产 run,
        //   jobRunId 为空串。runNow response 契约要求 jobRunId 非空(id=min(1)),且此路是用户
        //   手动「立即运行」→ 诚实抛错告知(账号已隐藏,先恢复再运行),不假装产了 run。
        //   (与既有 getJob ownership 错误传播同款:runNow 本就可抛。)
        if (result.skippedReason) {
          throw new Error(
            `AccountHiddenError: ${result.skippedReason}。请先在账号管理恢复该抖音号后再运行。`,
          );
        }
        return {
          data: {
            jobRunId: result.jobRunId,
            aiTaskId: result.aiTaskId,
            deduped: result.deduped,
          },
          meta: { requestId: ctx.requestId },
        };
      }
      return scheduling.request(endpoint, input, ctx);
    },
  };

  // [T-207] sweep 阈值 env 可配(毫秒;非法/缺省 → fallback)。job_run 默认 30min;
  //   ai_task 默认 2h(转录等长活合法,阈值更宽)。
  const envMsOf = (name: string, fallback: number): number => {
    const raw = Number(process.env[name]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
  };

  // 启动扫超时(gate finding 3 / T-207):进程(重)启动时,扫上一进程留下仍 running 且
  // started_at 超时(默认 >30min,CREATOROS_STALE_JOB_RUN_MS 可配)的 job_run → 标 failed
  // (reason=stale-on-boot),兜"进程崩在 running"的残留——僵尸 run 会把当天幂等闸挡死。
  // best-effort:失败不阻断 build。
  void sweepStaleRuns({
    runs: {
      // sweep 只用 updateRun;createRun/listRunsByJob 此路径不触达,给 no-op 满足端口形状。
      createRun: async () => ({ id: "" }),
      listRunsByJob: async () => ({ rows: [], total: 0 }),
      updateRun: (c, runId, patch) => schedulingService.updateRun(c, runId, patch),
    },
    listRunningRuns: async (c) => {
      const rows = await schedulingService.listRunningRuns(c);
      return rows.map((r) => ({ id: r.id, startedAt: r.startedAt }));
    },
    ctx: schedulerCtx,
    now: deps.now,
    staleMs: envMsOf("CREATOROS_STALE_JOB_RUN_MS", 30 * 60 * 1000),
  }).catch((e) => console.error("[scheduler] 启动扫超时失败:", e));

  // [T-207] 启动 sweep 僵尸 ai_task:app 被杀后 ai_tasks 也会留 running 僵尸(真机逮到
  // transcribe 挂 running 2.5h+),撞 createTask 的 in-flight 幂等闸挡后续同键任务。
  // [T-389] 类型感知:进程内 runner 类型(planning.thesis/script.draft/cover.generate 等
  // live dispatch void runXxx 的)重启即死 → 启动扫到 running 直接判死(不看年龄);
  // transcribe.douyin/agentic.* 保留宽阈值 —— running 且 startedAt(缺失退 requestedAt)
  // 超 2h(CREATOROS_STALE_AI_TASK_MS 可配)→ markFailed(stale-on-boot)。
  // fire-and-forget,不阻断启动。
  const sweepAiTaskDeps = {
    // [T-332 S2 修补] 扫僵尸是系统 daemon(schedulerCtx 无选中号):走系统级
    //   listRunningTasksSystem(跨号、只 running、不经 requireAccountId),不再用
    //   用户面 listTasks(S2 已 strict 按号,无号会抛 AccountRequiredError)。
    listRunningTasks: async (c: RequestContext) => {
      return aiService.listRunningTasksSystem(c);
    },
    markFailed: (c: RequestContext, taskId: string, msg: string) =>
      aiService.markFailed(c, taskId, msg),
    ctx: schedulerCtx,
    now: deps.now,
    staleMs: envMsOf("CREATOROS_STALE_AI_TASK_MS", 2 * 60 * 60 * 1000),
  };
  void sweepStaleAiTasks(sweepAiTaskDeps).catch((e) =>
    console.error("[scheduler] 启动扫僵尸 ai_task 失败:", e),
  );
  // [T-389] 低频周期复扫(默认 30min,CREATOROS_AI_TASK_SWEEP_INTERVAL_MS 可配):兜
  // 「启动扫单条 markFailed 失败」与「本进程运行期悬挂超阈值」的残留。带 processStartedAt
  // 锚 → 进程内类型只判上一进程遗留,本进程正在跑的活任务不误杀(落回年龄门)。
  // fire-and-forget,best-effort;测试/CI 环境不起(与 startScheduler 同守卫族),unref
  // 不占进程退出。
  if (
    !(process.env.NODE_ENV === "test" || process.env.VITEST || process.env.CI)
  ) {
    const processStartedAt = deps.now();
    const sweepTimer = setInterval(() => {
      void sweepStaleAiTasks({ ...sweepAiTaskDeps, processStartedAt }).catch(
        (e) => console.error("[scheduler] 周期复扫僵尸 ai_task 失败:", e),
      );
    }, envMsOf("CREATOROS_AI_TASK_SWEEP_INTERVAL_MS", 30 * 60 * 1000));
    sweepTimer.unref?.();
  }

  // [T-255a] 启动清扫孤儿沙箱(T-207 sweep 兜底同族):采纳/丢弃/失败本会清沙箱,
  // 残留 = 进程中途被杀的孤儿;超 7 天(mtime)一律清除。fire-and-forget,不阻断启动。
  void sweepOrphanSandboxes(executionWorkspacesRoot).catch((e) =>
    console.error("[execution] 启动清扫孤儿沙箱失败:", e),
  );

  // [T-517] 单一持久自动化 driver：scheduled_job 只供 due producer 读取；
  // execution_tasks/PersistentTaskService 才是 lease/attempt/recovery 唯一真值。
  const listRunnableAutomationJobs = async (
    c: RequestContext,
  ): Promise<AutomationDriverJob[]> => {
    // enabled job 全取,再逐个用最近一次 run 过滤掉"最近 needs_reconnect"的(§6 停跑)。
    // [T-332 S2 · ISO-06] 调度器是系统 daemon:枚举走显式 listJobsSystem(跨号全见;用户面
    //   listJobs 已 strict 按号,系统 ctx 无号会被断言拒绝)。逐 job 的 run 读用该 job 的
    //   account_id 派生 ctx(读写恒同号,过 strict 门)。
    const { rows } = await schedulingService.listJobsSystem(c, {
      enabled: true,
      limit: 200,
      offset: 0,
    });
    const runnable: AutomationDriverJob[] = [];
    for (const job of rows) {
      if (!job.accountId) continue;
      const jobCtx: RequestContext = { ...c, accountId: job.accountId };
      const recent = await schedulingService.listRunsByJob(jobCtx, job.id, {
        limit: 1,
        offset: 0,
      });
      const last = recent.rows[0];
      if (last && last.status === "needs_reconnect") continue;
      runnable.push({
        id: job.id,
        sourceKind: job.sourceKind,
        target: (job.target ?? {}) as Record<string, unknown>,
        schedule: job.schedule,
        enabled: job.enabled,
        accountId: job.accountId,
      });
    }
    return runnable;
  };

  const automationHandlers = createAutomationHandlerRegistry()
    .register("scheduled_collection", async (c, input) => {
      const result = await triggerScheduledJob(
        c,
        {
          id: input.job.id,
          sourceKind: input.job.sourceKind,
          target: input.job.target,
          accountId: input.job.accountId,
        },
        triggerDeps,
        { scheduledFor: input.scheduledFor },
      );
      if (result.skippedReason) throw new Error(result.skippedReason);
      if (result.deduped) {
        if (input.attempt <= 1) {
          throw new Error(
            `同一自动化 job 已有运行中的 run ${result.jobRunId}，本次计划触发未重复执行`,
          );
        }
        // 重启恢复时旧 job_run 仍 running：复用原 ai_task/run 继续真实 collector，
        // 不创建第二 run，也不把 execution task 假装成功。
        if (!result.aiTaskId || !result.jobRunId) {
          throw new Error("已有自动化运行缺少 task/run 关联，无法恢复");
        }
        await dispatchScheduledCollection(c, {
          id: result.aiTaskId,
          taskType: `scheduled.${input.job.sourceKind}`,
          inputData: {
            jobId: input.job.id,
            jobRunId: result.jobRunId,
            target: input.job.target,
          },
        });
      } else {
        await result.completion;
      }
      const run = await schedulingService.getRun(c, result.jobRunId);
      if (run.status !== "succeeded") {
        throw new Error(run.error || `自动化运行结束状态为 ${run.status}`);
      }
    })
    .seal();

  void startAutomationDriver({
    ctx: schedulerCtx,
    tasks: persistentTaskService,
    registry: automationHandlers,
    listRunnableJobs: listRunnableAutomationJobs,
    now: deps.now,
    workerId: `automation-driver:${process.pid}`,
    maxClaims: 8,
    leaseSeconds: 120,
  }).catch((e) => console.error("[automation-driver] 启动失败:", e));

  // ContentCalendar (module 22, Wave 5–7): the service builds a per-ctx user-scoped
  // repo over the shared db; peer modules are reached ONLY through narrow injected
  // ports bound here to the REAL public services (no cross-module repo import,
  // foundation §1). platformAccounts.getAccount is the account ownership gate;
  // publishing.isOutputPublished reads already-ingested publishing reality for the
  // reconcile pass (C-4 — derived from PublicationService.listPublications status, no
  // new write path); candidates.exists is the C-3 FK validation (wraps getCandidate,
  // which throws OwnershipError when absent — we never create a Candidate here);
  // notifications.notify is the 断更 seam (best-effort no-op until a public
  // create-notification op lands — mirrors the learnings.adjustConfidence seam below).
  const contentCalendarService: ContentCalendarService =
    createContentCalendarService({
      db,
      now: deps.now,
      nextId: deps.nextId,
      clock: { now: deps.now },
      platformAccounts: {
        getAccount: (ctx, accountId) =>
          platformAccountService.getAccount(ctx, accountId),
      },
      publishing: {
        isOutputPublished: async (ctx, contentOutputId) => {
          const pubs = await publishingService.listPublications(
            ctx,
            contentOutputId,
            { limit: 100, offset: 0 },
          );
          return pubs.some((p) => p.status === "published");
        },
      },
      candidates: {
        exists: async (ctx, candidateId) => {
          try {
            await candidateService.getCandidate(ctx, candidateId);
            return true;
          } catch {
            return false;
          }
        },
      },
      notifications: {
        // No public create-notification op this wave (OQ5): the 断更 reminder is a
        // Notifications/Todo concern wired via getLaggingAccounts on the Wave-4
        // Dashboard. Best-effort no-op seam keeps reconcile total + deterministic.
        notify: async () => {},
      },
    });
  const contentCalendar = createContentCalendarTransport(
    () => contentCalendarService,
  );

  // MaterialLinks (用料链 / Bill-of-Materials, Plan A4): the service builds a per-ctx
  // user-scoped repo over the shared db (the service mints one per request; the repo
  // bakes userId in). The transport returns this ONE shared service. No external port +
  // no peer fan-out — links are pure local records (entityId/contentOutputId are soft
  // references validated at the caller's seam, never a DB FK across module schemas).
  // delete is ownership-gated (cross-user → OwnershipError → 404). Clock/ids share the
  // deterministic `deps` (createSeq keeps matlink ids collision-free across requests).
  const materialLinksService = createMaterialLinksService({
    db,
    now: deps.now,
    nextId: deps.nextId,
  });
  const materialLinks = createMaterialLinksTransport(
    () => materialLinksService,
  );

  // [T-212a] 对标源 CRUD transport(benchmarkService 已在 collectors 装配前创建,此处复用同一实例)。
  const benchmark = createBenchmarkTransport(() => benchmarkService);
  // [T-349] 单条按需逐字稿(composition-only op):wrap benchmark transport,拦
  //   benchmark.works.transcribe(module transport 不认它 —— 触发要 transcribe 原语 + 号登录态,
  //   在 composition 层才可见,同 schedulingWithRunNow / scheduledJobs.runNow 约定)。其余 op 透传。
  //   origin 隔离:逐字稿落 benchmark_works 自身(saveWorkTranscript),**永不建 imported project/artifact**。
  const benchmarkWithTranscribe: Transport = {
    async request(endpoint, input, ctx) {
      if (endpoint.id === "benchmark.works.transcribe") {
        if (!ctx) throw new Error("AuthenticationError: transcribe requires ctx");
        const { params, body } = (input ?? {}) as {
          params?: { workId?: string };
          body?: { workId?: string };
        };
        const workId = params?.workId ?? body?.workId ?? "";
        // 叠号门:查不到/跨号 → null → ownership 404(不泄露行存在)。
        const work = await benchmarkService.getWork(ctx, workId);
        if (!work) {
          throw new BenchmarkOwnershipError(
            `OwnershipError: benchmark work not found: ${workId}`,
          );
        }
        // 已有非空逐字稿 → 复用,不重抓(单条按需的幂等)。
        if (work.transcript && work.transcript.trim()) {
          return {
            data: { status: "reused", transcript: work.transcript },
            meta: { requestId: ctx.requestId },
          };
        }
        // 标记抓取中(前端可渲 pending)。
        await benchmarkService.saveWorkTranscript(ctx, workId, null, "pending");
        try {
          const text = await transcribeOneAweme(ctx, work.awemeId);
          if (!text) {
            // 图集/无口播 → transcribeOne 返 null → skipped(诚实,非失败)。
            await benchmarkService.saveWorkTranscript(ctx, workId, null, "skipped");
            return {
              data: { status: "skipped", transcript: null },
              meta: { requestId: ctx.requestId },
            };
          }
          await benchmarkService.saveWorkTranscript(ctx, workId, text, "done");
          return {
            data: { status: "done", transcript: text },
            meta: { requestId: ctx.requestId },
          };
        } catch (err) {
          // 抓取抛错 → failed(可重试)→ 重新抛错(前端渲失败可重试)。
          await benchmarkService.saveWorkTranscript(ctx, workId, null, "failed");
          throw err;
        }
      }
      return benchmark.request(endpoint, input, ctx);
    },
  };
  // [T-374] 自己作品单条立抓逐字稿(composition-only op):wrap projects transport,拦
  //   projects.transcribe(解析 platformRef 抖音锚 → ai transport 排 transcribe.douyin →
  //   live dispatch 后台跑;无锚 → ValidationError 400)。逻辑抽在 projects-transcribe-wrap.ts
  //   工厂(注入假 transports 可确定性单测,同文件头注释);此处只绑真 projects + ai。
  const projectsWithTranscribe = createProjectsWithTranscribe({
    projects,
    ai,
    artifacts,
  });
  // [T-235b] 热点信源 CRUD transport(trendSourcesService 已在 collectors 装配前创建,复用同一实例)。
  const trendSources = createTrendSourcesTransport(() => trendSourcesService);
  // [T-235c] 指定收藏夹登记 CRUD transport(favoritesService 已在 collectors 装配前创建,复用同一实例)。
  const favoritesFolders = createFavoritesTransport(() => favoritesService);
  // [T-235d] 选题归因只读 transport(topicAttributionService 已在 collectors 装配前创建,复用同一实例)。
  const topicAttribution = createTopicAttributionTransport(
    () => topicAttributionService,
  );

  // Query services (module Q, Wave 4 — SPEC §19). Composition module: NO repo, NO
  // SQL. Each composer is built with facade interfaces; here the composition root
  // binds those facades to the REAL public services (consumed only via their
  // index.ts entries above — projectsService / publishingService / analyticsService
  // / learningsService / notificationsRepo→service / knowledgeService / assetsService
  // / searchService). The request's `ctx` is threaded UNCHANGED into every facade
  // call, so each downstream service enforces its own eq(userId, ctx.userId) scope.
  //
  // Open question #1: several SPEC §19 read methods are NOT yet on the frozen
  // upstream index.ts (Projects has no getDashboardSummary / project-overview read;
  // Analytics has no dashboard/publishing metric rollup). Rather than read a peer
  // repository (forbidden, SPEC §19/§22), the gap sections compose to DTO-valid
  // EMPTY/zero projections — the page renders a real (possibly empty) composition,
  // never a 500, and slots real data the moment those upstream reads land. The
  // ownership-404 path is REAL: getProjectOverview gates via
  // projectsService.listOutputIdsByProject (throws OwnershipError for a cross-user /
  // unknown project id).
  const notificationsServiceForQuery = createNotificationsService(
    notificationsRepo,
    deps,
  );
  const EMPTY_STAGE = "research" as const;

  const dashboardQuery = createDashboardQueryService({
    projects: {
      // GAP-DASH-1 做真:继续创作 = 用户最近活跃的非归档项目;待办 = 该项目下真实
      // 未完成 task。数据来自 projectsService.getDashboardSummary(本模块 repo 组合,
      // 不跨模块);facade 只补 heading + 收窄类型。
      getDashboardSummary: async (ctx) => {
        const s = await projectsService.getDashboardSummary(ctx);
        const clampPriority = (p: number): 1 | 2 | 3 | 4 | 5 =>
          Math.min(5, Math.max(1, Math.round(p))) as 1 | 2 | 3 | 4 | 5;
        // [T-302] 派生待办:待确认渲染(exec.video.render 处 awaiting_confirmation → 采纳成片)。
        //   读时按当前状态算——采纳/丢弃后该任务离开 awaiting_confirmation → 待办自动消失,
        //   不依赖没人写的 stored task。派生项 completable=false(不给「完成」勾,状态驱动),
        //   href 直达制作视频页去采纳。读失败不崩看板。
        let derivedTodos: Array<{
          id: string;
          title: string;
          projectId: string;
          projectTitle: string;
          stage: ProjectStageName;
          dueAt: string | null;
          priority: 1 | 2 | 3 | 4 | 5;
          status: TaskStatus;
          href: string;
          completable: boolean;
        }> = [];
        try {
          const { rows } = await executionService.list(ctx, {
            limit: 30,
            offset: 0,
          });
          derivedTodos = rows
            .filter(
              (t) =>
                t.status === "awaiting_confirmation" &&
                t.execType === "video.render" &&
                typeof t.projectId === "string",
            )
            .slice(0, 3)
            .map((t) => ({
              id: t.id,
              title: "成片待采纳",
              projectId: t.projectId as string,
              projectTitle: "制作视频",
              stage: "production" as ProjectStageName,
              dueAt: null,
              priority: 2 as const,
              status: "todo" as TaskStatus,
              href: `/projects/${t.projectId}/production`,
              completable: false,
            }));
        } catch {
          // 派生待办读失败 → 只出 stored 待办(通常也空),不崩看板。
        }
        const storedTodos = s.todos.map((t) => ({
          id: t.id,
          title: t.title,
          projectId: t.projectId,
          projectTitle: t.projectTitle,
          stage: t.stage as ProjectStageName,
          dueAt: t.dueAt,
          priority: clampPriority(t.priority),
          status: t.status as TaskStatus,
          href: undefined,
          completable: true,
        }));
        return {
          continueCreating: s.continueCreating
            ? {
                heading: "继续创作",
                projectId: s.continueCreating.projectId,
                projectTitle: s.continueCreating.projectTitle,
                stage: s.continueCreating.stage as ProjectStageName,
                progressPct: s.continueCreating.progressPct,
                updatedAt: s.continueCreating.updatedAt,
              }
            : null,
          // 派生(actionable now)排前,再接 stored;总取前 5。
          todos: [...derivedTodos, ...storedTodos].slice(0, 5),
        };
      },
    },
    publishing: {
      getRecentPublications: async (ctx) => {
        // GAP-DASH-3 做真:真标题(来自 revision,publishing 模块内解析)+ 真播放/
        // 互动(facade 层 join analytics 最新快照 rawMetrics,跨模块组合只在此层)。
        // 数据底座(SPEC §1.4):有 imported 真项目 → 只取真实导入作品的发布(演示 fixture
        //   发布让位,治 dy-pub-00 假标题/0 播放);无 imported → 全量(过渡期演示态)。
        //   先多取一些再按 imported 集过滤,保证过滤后仍能凑满前 5 条真发布。
        const hasImported = await projectsService.hasImportedProjects(ctx);
        const importedPubIds = hasImported
          ? new Set(await resolveImportedPublicationIds(ctx))
          : null;
        const fetched = await publishingService.getRecentPublicationsWithTitle(
          ctx,
          { limit: importedPubIds ? 100 : 5 },
        );
        const rows = (
          importedPubIds
            ? fetched.filter((r) => importedPubIds.has(r.id))
            : fetched
        ).slice(0, 5);
        const numOf = (raw: Record<string, unknown>, key: string): number => {
          const v = raw[key];
          return typeof v === "number" && Number.isFinite(v) ? v : 0;
        };
        return Promise.all(
          rows.map(async (r) => {
            let views = 0;
            let engagement = 0;
            try {
              const page = await analyticsService.getPublicationAnalytics(
                ctx,
                r.id,
                1,
                10,
              );
              const latest = page.rows
                .slice()
                .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
              const raw = (latest?.rawMetrics ?? {}) as Record<string, unknown>;
              // 数据底座(SPEC §1.4):播放量键名归一 —— 真采集(douyin ingestion)写
              //   `views`,演示 fixture 写 `plays`;优先真 `views`,缺失回退 `plays`(二者
              //   不并存)。否则真实导入作品的播放恒为 0(原只读 `plays`)。
              views = numOf(raw, "views") || numOf(raw, "plays");
              engagement =
                numOf(raw, "likes") +
                numOf(raw, "comments") +
                numOf(raw, "shares");
            } catch {
              // A single publication's analytics read failing degrades to 0 —
              // never crashes the whole dashboard composition.
            }
            // 数据底座(SPEC §1.4):imported publication 不带 revision(标题挂在
            //   content_output / project),故 revision 解析的 r.title 为空 → 回退到
            //   作品(content_output)的真实标题(治"未命名发布",出真实导入标题)。
            let title = r.title;
            if (!title) {
              try {
                const out = await projectsRepo.getOutput(ctx, r.contentOutputId);
                title = out.title;
              } catch {
                // 输出读失败(防御)→ 保持空,落到下方"未命名发布"兜底。
              }
            }
            return {
              id: r.id,
              title: title || "未命名发布",
              platform: r.platform as "youtube",
              status: r.status as "published",
              views,
              engagement,
              publishedAt: r.publishedAt ?? r.createdAt,
            };
          }),
        );
      },
    },
    analytics: {
      // GAP-DASH-2 做真:5 张指标卡(总播放/总点赞/新增粉丝/平均完播/总分享)+ 本周
      // 播放趋势,全来自 analyticsService.getDashboardRollup(本模块 user-scoped 聚合,
      // 每 publication 取最新快照)。无快照 → 空集(composer 判 empty),不造假。
      getDashboardMetrics: async (ctx) => {
        // 数据底座(SPEC §1.4):有 imported 真项目 → 指标卡/趋势只汇总真实导入作品的
        //   快照(演示 fixture 让位);无 imported → 全量 user-scoped(过渡期演示态)。
        const hasImported = await projectsService.hasImportedProjects(ctx);
        const r = hasImported
          ? await analyticsService.getDashboardRollup(ctx, {
              publicationIds: await resolveImportedPublicationIds(ctx),
            })
          : await analyticsService.getDashboardRollup(ctx);
        if (r.snapshotCount === 0) return { metrics: [], trend: [] };
        const fmt = (v: number) =>
          v >= 10000
            ? `${(v / 10000).toFixed(1)} 万`
            : v.toLocaleString("zh-CN");
        const card = (
          id: string,
          label: string,
          value: string,
        ): MetricCard => ({
          id,
          label,
          value,
          delta: "",
          trend: "flat",
          tone: "positive",
        });
        // [T-071] 总粉丝(用户裁决:算不了增量就算总数)—— platform_accounts 基线求和,
        // 读失败诚实「—」。[Bug-2 T-015] 用户没手动设基线(baseline=0)时,**回退到 rollup
        // 的 followerGain**(采集期内粉丝增长,真值),label 跟着切到「新增粉丝(期内)」——不
        // 假装那是「总粉丝」。两者都没 → 「—」诚实空。
        let followerTotal: { label: string; value: string } = {
          label: "总粉丝",
          value: "—",
        };
        try {
          const { rows: accounts } = await platformAccountService.listAccounts(
            ctx,
            { limit: 100, offset: 0 },
          );
          // [T-074 用户裁决] 总粉丝只统计抖音(B站 8400 系 seed 幻觉数据已清,
          // 用户:「不要统计B站」);未来接别的平台前不并入总数。
          // [T-358] 账号隔离:只取**当前选中号**的基线——T-071 单号时代的「全号求和」在多号下
          // 变成跨号加总(真机实锤:两号 1103+2570=3673 同值串号,ISO-08 反例)。dashboard 其余
          // 指标走 per-account rollup 本就隔离,粉丝这条此前漏改。
          const baselineSum = accounts
            .filter(
              (a) =>
                a.status === "active" &&
                a.platform === "douyin" &&
                a.id === ctx.accountId,
            )
            .reduce((acc, a) => acc + (a.followerBaseline ?? 0), 0);
          if (baselineSum > 0) {
            followerTotal = { label: "总粉丝", value: fmt(baselineSum) };
          } else if (r.followerGain > 0) {
            // [Bug-2 T-015] 真值兜底:期内采集到的新增粉丝总和(label 显式标「期内」,别假装总数)。
            followerTotal = {
              label: "新增粉丝(期内)",
              value: fmt(r.followerGain),
            };
          }
        } catch {
          /* 显「—」 */
        }
        const metrics: MetricCard[] = [
          card("d-views", "总播放量", fmt(r.plays)),
          card("d-likes", "总点赞", fmt(r.likes)),
          // [Bug-2 T-015] label 随数据源动态切(基线 vs 期内增长 vs 诚实空)。
          card("d-followers", followerTotal.label, followerTotal.value),
          // [T-071] 完播率只在有明细快照(finish_rate 字段,拉明细采集产)时显真均值;
          // 没有 → 「—」,绝不显假 0.0%。
          {
            ...card(
              "d-finish",
              "平均完播率",
              r.finishCount > 0 ? `${r.finishAvg.toFixed(1)}%` : "—",
            ),
            tone: "info",
          },
          card("d-shares", "总分享", fmt(r.shares)),
        ];
        // [T-071] 本周趋势改真逐日:快照按日聚合差分(替换旧「总量按固定形状分摊」的
        // 假曲线)。有效点 < 2 天 → 空 trend(composer 显引导),不编形状。
        const daily = hasImported
          ? await analyticsService.getDailyPlayTrend(ctx, {
              publicationIds: await resolveImportedPublicationIds(ctx),
              days: 7,
            })
          : await analyticsService.getDailyPlayTrend(ctx, { days: 7 });
        const trend =
          daily.length >= 2
            ? daily.map((d) => ({
                label: d.day.slice(5).replace("-", "/"),
                value: d.plays,
              }))
            : [];
        return { metrics, trend };
      },
    },
    learnings: {
      getSuggestions: async (ctx) => {
        const rows = await learningsService.getSuggestions(ctx, { limit: 3 });
        return rows.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.recommendation ?? r.insight ?? "",
          category: r.learningType ?? "建议",
        }));
      },
    },
    notifications: {
      getUnreadCount: (ctx) => notificationsServiceForQuery.getUnreadCount(ctx),
    },
    knowledge: {
      // GAP-DASH-4 做真:热门选题 = 用户选题池(candidate)按预测分排序的前几条。
      // [T-049 B8] heat 直接用 predictedScore —— rubric 全链就是 0–100 分,旧代码误当
      // 0–1 再 ×100 → UI 显「热度 8800」;无分候选诚实置 0(不再编 50-i*5 假数)。
      // 读失败降级为空集,不崩面板。
      getTrendingTopics: async (ctx) => {
        try {
          const { rows } = await candidateService.listCandidates(ctx, {
            status: "pool",
            sort: "predictedScore",
            limit: 5,
            offset: 0,
          });
          return rows.map((c) => ({
            id: c.id,
            title: c.title,
            // [T-303] 热度优先预测分(每日出题落库);为空/0 时兜底 positioningFit(每候选都有的
            //   0–100 契合分)→ 存量/手动候选也有真热度,不再死列恒 0。都无 → 0(诚实)。
            heat:
              typeof c.predictedScore === "number" && c.predictedScore > 0
                ? Math.round(c.predictedScore)
                : typeof c.positioningFit === "number" && c.positioningFit > 0
                  ? Math.round(c.positioningFit)
                  : 0,
            trend: "up" as const,
          }));
        } catch {
          return [];
        }
      },
    },
  });

  const overviewQuery = createProjectOverviewQueryService({
    projects: {
      getProjectOverview: async (ctx, projectId) => {
        // listOutputIdsByProject GATES ownership: a cross-user / unknown project
        // throws OwnershipError (→404) BEFORE any overview section is composed.
        await projectsService.listOutputIdsByProject(ctx, projectId);
        return {
          projectId,
          projectTitle: "",
          stage: EMPTY_STAGE,
          progressPct: 0,
          stages: [],
          outputs: [],
          activities: [],
          projectInfo: [],
          milestones: [],
        };
      },
    },
    assets: {
      getProjectAssetStats: async () => ({
        assetStats: [],
        recentFiles: [],
      }),
    },
    publishing: {
      getProjectPublishing: async () => [],
    },
  });

  const searchQuery = createGlobalSearchQueryService({
    search: {
      search: (ctx, query, opts) => searchService.search(ctx, query, opts),
      // [T-051 2d] tab 计数走全量分面(不受 per-type top-N 截断)。
      facets: (ctx, query) => searchService.facets(ctx, query),
      recordSearch: (ctx, input) => searchService.recordSearch(ctx, input),
      listHistory: (ctx, limit) => searchService.listHistory(ctx, limit),
    },
  });

  const publishingCenter = createPublishingCenterQueryService({
    publishing: {
      listPublicationsForUser: async (ctx) => {
        const rows = await publishingService.getRecentPublications(ctx, {
          limit: 200,
        });
        return rows.map((r) => ({
          id: r.id,
          title: r.id,
          projectId: r.contentOutputId,
          projectTitle: "",
          platform: r.platform as "youtube",
          publishedAt: r.publishedAt ?? r.createdAt,
          status: r.status as "published",
          views: 0,
          engagement: 0,
        }));
      },
    },
    analytics: {
      getPublishingMetrics: async () => ({
        metrics: [],
        platformComparison: [],
        trend: [],
        topContent: [],
      }),
    },
  });

  const queryServices = createQueryServicesTransport({
    dashboard: dashboardQuery,
    overview: overviewQuery,
    search: searchQuery,
  });

  // [T-135] canonical external sources 种子已退役(用户裁决 2026-07-05:新库/新用户开箱空)。
  // 外部源全部来自用户运行时真实创建/绑定(抖音扫码走 CDP 连已登录 Chrome,不预置任何来源行)。

  // Seed the Projects exemplar dataset (owned by the canonical user) AND the
  // canonical identity row, so real login resolves to `user-zyongzhu` and every
  // fixture-backed page + the Projects seed keep resolving under a real ctx
  // (foundation §2). seedCanonicalUser is idempotent (onConflictDoNothing), so a
  // re-built singleton never double-seeds. IDENTITY_DDL was applied in createDb().
  const identityRepo = createIdentityRepository(db, deps);
  // [T-050] canonical demo 项目图种子已退役(用户裁决 2026-07-02:4 个演示项目彻底
  // 删除,不再重种)。项目/产出/任务全部来自真实导入(T-030 管线)与用户运行时创建。
  await seedCanonicalUser(identityRepo, deps);

  // [User] win-video-tutor 22 节课程 → canonical user 知识库(knowledge_items reference 类型,
  // 整篇 markdown 入 content)。**替代 T-135 退役的金句假内容**,让知识库开箱就有真东西。
  // Idempotent(查 sourceMetadata.origin);文件缺失/异常 → 安静 no-op(该 skill 没装到本机是合法状态,
  // 绝不能因此炸 buildPersistence)。用户首次开 app 触发一次,后续 build/install 跳过。
  // [T-211] 课程保留作预设(读法 B),只去品牌前缀:seed 内部标题模板已去「Win 短视频私教 · 」,
  // 存量带前缀条目由下方 fixupWinVideoTutorTitles 幂等改名。
  try {
    // [T-218] tag 写侧 service:与 taxonomy transport 同一 repo/db,给 seed 挂 module
    // tag + 给存量回填(tags 是 user 级词表,C-04,不随号切)。
    const canonTaxonomyService = createTaxonomyService(taxonomyRepo);
    // [T-332 S2] 知识库按号独立(SPEC C-01,strict + NOT NULL):课程预设按 active 账号
    // **逐号**种入(每号一套知识库,一套预设;seed 幂等判据 origin 是 per-account ctx 读的,
    // 每号各判各的)。0 账号 → 跳过(引导态无处落号;绑号后下次启动自动补种)。
    const wvtSeedCtx: RequestContext = {
      userId: CANONICAL_USER_ID,
      requestId: "seed-win-video-tutor",
      source: "ingestion",
    };
    const { rows: wvtAccounts } = await platformAccountService.listAccounts(
      wvtSeedCtx,
      { limit: 100, offset: 0 },
    );
    for (const wvtAcct of wvtAccounts.filter((a) => a.status === "active")) {
      const acctCtx = { userId: CANONICAL_USER_ID, accountId: wvtAcct.id };
      const seeded = await seedWinVideoTutor(knowledgeService, acctCtx, {
        taxonomyService: canonTaxonomyService,
      });
      if (seeded > 0) {
        console.log(
          `[seed] win-video-tutor 课程已写入 ${seeded} 节到账号 ${wvtAcct.id} 的知识库`,
        );
      }
      // [T-218] 存量按 module 挂 tag 回填:seed 早于 T-218 的装机(现网 22/23 条)只有
      // knowledge item、无 tag → 观点地图(默认视图,按 tag 聚类)开箱即空。这里对已存在的
      // origin=win-video-tutor 条目按 sourceMetadata.module 幂等补挂 module tag,用户不用
      // reset、下次启动观点地图即填充。幂等(tag 名 per-user 唯一 + entity_tags 唯一)。
      const backfilledTags = await fixupWinVideoTutorModuleTags(
        knowledgeService,
        canonTaxonomyService,
        acctCtx,
      );
      if (backfilledTags > 0) {
        console.log(
          `[seed] win-video-tutor ${backfilledTags} 条存量已按 module 回填 tag(观点地图,账号 ${wvtAcct.id})`,
        );
      }
    }
    // [T-211] 存量去前缀 fixup:已装机(seed 早于本改动)的条目标题仍带「Win 短视频私教 · 」
    // 前缀 —— 经仓储幂等 strip(drizzle 留在后端,不在前端引 drizzle-orm)。安全边界:
    // ①仅 canonical user 名下(System 方法 userId 收窄);②仅 sourceMetadata.origin=
    // 'win-video-tutor' 的 seed 条目(不碰用户自己的笔记);③仅标题仍带旧前缀者(已去过
    // 的跳过 → 幂等,重启不重复动)。renameTitleSystem 只改 title + updatedAt(不动 content/
    // revision/status)。[T-332 S2 · ISO-06] 种子巡检跨号扫描走显式 *System 方法(组合根
    // 种子维护语义),不是隐式全量读退化。
    const legacyPrefix = WIN_VIDEO_TUTOR_LEGACY_TITLE_PREFIX;
    const canonKnowledgeRows =
      await knowledgeRepo.listAllAccountsSystem(CANONICAL_USER_ID);
    let renamed = 0;
    for (const row of canonKnowledgeRows) {
      const meta = row.sourceMetadata as { origin?: unknown } | null;
      const isSeed =
        typeof meta === "object" &&
        meta !== null &&
        (meta as { origin?: unknown }).origin === "win-video-tutor";
      if (!isSeed) continue;
      if (!row.title.startsWith(legacyPrefix)) continue;
      await knowledgeRepo.renameTitleSystem(
        CANONICAL_USER_ID,
        row.id,
        row.title.slice(legacyPrefix.length),
      );
      renamed += 1;
    }
    if (renamed > 0) {
      console.log(
        `[seed] win-video-tutor ${renamed} 条存量标题已去「Win 短视频私教 · 」前缀`,
      );
    }
  } catch (seedErr) {
    console.error(
      "[seed] win-video-tutor 知识库 seed 失败(已 ignore,app 仍可启动):",
      seedErr instanceof Error ? seedErr.message : seedErr,
    );
  }

  // [T-332 S2] T-220「启动认领存量无号 asset」已随 claimOrphans 全链退役(SPEC §4.4):
  //   strict + NOT NULL 世界不存在无号 asset(写侧 chat route / 截图端口已治本 stamp 真号),
  //   存量污染走「设置 → 重置工作区」(S5),不再有任何启动期归属改写。

  // [T-227] 启动幂等 ensure 全部 DEFAULT_JOBS(存量账号回填缺失采集 job)。根因:collection-
  //   bootstrap 只在**绑定抖音时**跑一次 —— 账号绑定早于新 job 模板上线(T-212 benchmark /
  //   T-235a topic.daily)的存量号,模板后加的 job 永远缺(真机曾现「还没有对标采集作业」)。
  //   修:启动时对 active 账号跑 ensureCollectionJobs(有则跳无则建,**只建不触发** —— 新 job 等
  //   下一次到点跑,不在每次启动拉一轮采集)。
  //   [T-332 S2] 账号全域隔离后 scheduled_job strict 按号:**逐个** active 账号各自 ensure
  //   (listJobs 在该号 ctx 下只见该号 job → 每号缺啥补啥,job 出生即带号)。0 号 → 跳过。
  //   best-effort:失败只告警,不阻断启动。
  try {
    const ensureJobsCtx: RequestContext = {
      userId: canonicalDataset.user.id,
      requestId: "startup-collection-ensure",
      source: "ingestion",
    };
    const { rows: ensureAccounts } = await platformAccountService.listAccounts(
      ensureJobsCtx,
      { limit: 100, offset: 0 },
    );
    const activeForEnsure = ensureAccounts.filter((a) => a.status === "active");
    for (const ensureAcct of activeForEnsure) {
      const { created } = await ensureCollectionJobs(
        { ...ensureJobsCtx, accountId: ensureAcct.id },
        {
          listJobsBySourceKind: async (c, sourceKind) => {
            const { rows } = await schedulingService.listJobs(c, {
              sourceKind,
              limit: 1,
              offset: 0,
            });
            return rows.map((r) => ({ id: r.id, accountId: r.accountId ?? null }));
          },
          createJob: async (c, input) => {
            const job = await schedulingService.createJob(c, {
              name: input.name,
              prompt: input.prompt,
              sourceKind: input.sourceKind,
              schedule: input.schedule,
              target: input.target,
              // [T-359] 启动兜底补建同样分层:默认关的补建即 disabled。
              enabled: input.enabled,
            });
            return { id: job.id };
          },
          // 空 target:采集器空 target 时自 ensureDouyinSource 兜底解析源(与 bootstrap 一致)。
          target: {},
        },
      );
      if (created.length > 0) {
        console.log(
          `[T-227] 启动回填缺失采集 job(账号 ${ensureAcct.id}):${created.join(", ")}`,
        );
      }
    }
  } catch (ensureErr) {
    console.warn(
      "[T-227] 启动 ensure 采集 job 失败(已 ignore,app 仍可启动):",
      ensureErr instanceof Error ? ensureErr.message : ensureErr,
    );
  }

  // [T-050] canonical 通知种子已退役(demo 文案指向已删除的演示项目);通知全部
  // 来自运行时真实事件。

  // [T-135] canonical knowledge graph 种子已退役(金句 items+revisions+relations 都是
  // Zyong Zhu 假内容)。知识库开箱空;真实知识由用户导入/蒸馏/对话沉淀写入。
  // (下方仍保留用户抖音真实作品的金句知识种子 douyinKnowledge*,那是真内容不是 canonical。)

  // [T-135] canonical assets graph 种子已退役(素材 assets+files 都是 Zyong Zhu 假素材)。
  // /assets 画廊开箱空;真实素材由用户上传/录制/生成写入。

  // [T-050] canonical artifacts 种子已退役(挂在已删除的 demo 项目上)。
  // 真实项目的 artifact 由 AI 节点首次起草时创建(见 AdoptCandidateCard.prepareInput)。
  // [T-050 ⑦] 搜索索引投影**真实数据**:旧实现投影 canonical mock 数据集 → 用户自己
  // 的真实作品一条都搜不到(审计 B19)。现在启动时从 DB 读真 projects/knowledge/assets/
  // publications(+revision 真标题)拼成同形状喂 buildCanonicalSearchDocuments。
  // [全局搜索修复④] 启动全量重建改用 searchService.rebuildUserIndex(deleteAll +
  //   re-upsert),取代旧的 seedDocuments(insert-only + onConflictDoNothing)。旧路径三宗罪:
  //   ① 只 insert 不刷新 —— 存量项目改了标题,search_document 仍是旧标题;② onConflictDoNothing
  //   固定 seed id,重启后新建的项目/删除的实体既不进也不清(孤儿留存);③ 存量项目(如既有
  //   2 个)若 seed id 已占位就永不回填。rebuildUserIndex 先 deleteAllDocuments(user-scoped)
  //   再从 DB 真值逐条 re-upsert —— 幂等、刷新标题、清孤儿,把存量一并索引。启动时跑一次即可
  //   (运行时 create/patch/delete 由上面的 fan-out wrapper 增量维护)。
  // [T-332 S2] 启动全量重建改走 rebuildSearchIndexSystem(ISO-06 显式系统路径):
  //   search_documents 是 per-account 投影(NOT NULL),重建行的号由**源实体行**派生
  //   (projects/knowledge_items/assets/publications 自 S1 起 account_id NOT NULL)——
  //   不是「无号退化全量」,而是「逐行自带号」的多号重播;经 ctx 的业务读写
  //   (searchService)一律 strict 按号。语义与旧 rebuildUserIndex 相同:先整删该 user
  //   派生索引再重播(幂等、刷新标题、清孤儿)。
  {
    const [dbProjects, dbKnowledge, dbKRevisions, dbAssets, dbPubs, dbPubRevs] =
      await Promise.all([
        db.select().from(projectsTable),
        db.select().from(knowledgeItemsTable),
        db.select().from(knowledgeRevisionsTable),
        db.select().from(assetsTable),
        db.select().from(publicationsTable),
        db.select().from(publicationRevisionsTable),
      ]);
    const rebuildRows = buildCanonicalSearchDocuments(
      {
        user: { id: canonicalDataset.user.id },
        projects: dbProjects.map((p) => ({
          id: p.id,
          title: p.title,
          brief: p.brief ?? "",
          currentStage: p.currentStage,
          progressPct: p.progressPct ?? 0,
          accountId: p.accountId, // [T-332 S2] 源行派生号
        })),
        knowledgeItems: dbKnowledge.map((k) => ({
          id: k.id,
          title: k.title,
          currentRevisionId: k.currentRevisionId ?? "",
          accountId: k.accountId, // [T-332 S2] 源行派生号
        })),
        knowledgeRevisions: dbKRevisions.map((r) => ({
          id: r.id,
          knowledgeItemId: r.knowledgeItemId,
          content: r.content ?? "",
        })),
        assets: dbAssets.map((a) => ({
          id: a.id,
          name: a.name,
          assetType: a.assetType,
          accountId: a.accountId, // [T-332 S2] 源行派生号
        })),
        publications: dbPubs.map((pub) => ({
          id: pub.id,
          platform: pub.platform,
          currentRevisionId: pub.currentRevisionId ?? null,
          accountId: pub.accountId, // [T-332 S2] 源行派生号
        })),
        publicationRevisions: dbPubRevs.map((r) => ({
          id: r.id,
          title: r.title ?? "",
        })),
      },
      FIXED_NOW_ISO,
    );
    await rebuildSearchIndexSystem(db, canonicalDataset.user.id, rebuildRows);
  }

  // [T-050] canonical analytics 种子已退役(快照/留存/观众全挂在已删除的 demo 发布上)。
  // 真实指标由采集管线写入(self.metrics/self.detail,T-030/T-036)。

  // The identity service shares the SAME db (and the same seeded canonical user)
  // as the persistence transport, so a ctx resolved from the session cookie owns
  // the rows the transport serves under it.
  const identity = createIdentityService(identityRepo, deps);

  // Settings (module 03): one repository over the shared db; the service's
  // account read (`settings.get`) delegates to the Identity service's
  // getCurrentUser (injected as the accountReader — NO cross-module repo import,
  // foundation §1). The preference/model/agent mutations are user-scoped via the
  // per-ctx repo. resolveModelForCapability (public on the service) is what the AI
  // worker reads. Clock/ids share the deterministic `deps`.
  // T-147 P2 本地加密 —— master key 已在工厂前段解析([T-370a] 与 browser_sessions 共用),
  // 注入 settings repo 后 model_configurations.secret_value 静态加密(AES-256-GCM),
  // 读出透明解密。web 路径永不崩(降级 key)。
  const settingsRepo = createSettingsRepository(db, { ...deps, masterKey });
  const settingsService = createSettingsService(
    () => settingsRepo,
    (ctx) => identity.getCurrentUser(ctx),
    // Account profile WRITE (`PATCH /me`) — delegated to Identity's
    // updateProfile, the same boundary as the read above. Settings owns no
    // `users` repo (foundation §1: no cross-module repository import).
    (ctx, patch) => identity.updateProfile(ctx, patch),
    {
      get(skillId) {
        const base = getOfficialSkillBase(skillId);
        return base
          ? {
              ...base,
              system: base.methodSystem,
              supportsCompletionPolicySchema: () =>
                base.completionPolicyAdapter !== null,
            }
          : null;
      },
      list() {
        return listOfficialSkillBases().map((base) => ({
          ...base,
          system: base.methodSystem,
          supportsCompletionPolicySchema: () =>
            base.completionPolicyAdapter !== null,
        }));
      },
    },
  );
  const settings = createSettingsTransport(() => settingsService);
  resolveEffectiveSkillSnapshotForRuntime =
    createEffectiveSkillSnapshotResolver({
      officialSkills: {
        get: getOfficialSkillBase,
        list: listOfficialSkillBases,
        platformPolicy: () => ({
          version: PLATFORM_POLICY_VERSION,
          text: PLATFORM_POLICY_TEXT,
        }),
      },
      accountOverlays: {
        listBySkillIds: (ctx, skillIds) =>
          settingsRepo.listAccountSkillOverlays(ctx, skillIds),
      },
      now: deps.now,
    });

  // T-147 P5 — 装配一机一码激活门 service(复用上面解析的 masterKey 加密激活码,同 db)。
  // web/dev 装了不触发(门控前置 isDesktopRuntime 判 false 直接放行);桌面态才真 check/activate。
  const activationService = await assembleActivationService({
    db,
    masterKey,
    env: process.env,
  });

  // 纯-prompt 节点的可配置 LLM completer:resolveLlmConfig 读 settings 拥有的
  // model_configurations 行(注入 getModelConfig,settings 不反向依赖 ai 层)+ process.env。
  // 在此(settingsService 已定义后)构造;6 个 `void runXxx(...)` dispatch 调用位于
  // `ai` transport 的 request 回调里——该回调在请求期才执行(工厂体初始化早已完成),
  // 故按闭包引用捕获此 `const llmCompleter` 无 TDZ 问题。
  const llmCompleter = createLlmCompleter((ctx, capability) =>
    resolveLlmConfig(ctx, capability, {
      getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
      env: process.env,
    }),
  );

  // ── [T-256b/c] 自主任务运行时装配(独立区域,additive:三 agentic executor 追加进上方
  //    executorRegistry;dispatch/沙箱/确认门/步骤流零改动,复用 T-255a 编排)──────────────
  //  引擎:确定性引擎(Pi 就绪前默认;真 Pi = createPiAgenticEngine + streamFn,见 pi-engine.ts + 报告)。
  //  §6.1 硬门:引擎每步推理回接 model-config —— buildAgenticLlm 闭包走上面同一 llmCompleter
  //    (resolveLlmConfig 解析用户 provider),token 由 estimateAgenticTokens 兜(喂预算硬顶)。
  //  领域端口:本轮为**诚实 bundle seam**(读诚实降级 / 写只 staged 不碰 live 数据,守铁律②/封号纪律);
  //    真联网检索端口(resolveSearchSpec,在 chat route)、真 ingestion 采集端口、真 pending 知识写入
  //    的接线为 follow-up(见交付报告「差最后一步」)。框架校验(循环/白名单/预算硬顶/干跑/manifest/
  //    确认门)不依赖端口真伪。
  const buildAgenticLlm = (
    ctx: RequestContext,
    capability: string,
  ): AgenticEngineLlm => {
    return async (prompt, opts) => {
      const r = await llmCompleter(ctx, capability, prompt, {
        system: opts?.system,
        maxTokens: opts?.maxTokens,
      });
      return {
        text: r.text,
        tokensUsed:
          estimateAgenticTokens(prompt) + estimateAgenticTokens(r.text ?? ""),
      };
    };
  };
  // [RT-H07] 自主循环领域端口:真实端口(联网检索 / ingestion 采集 / 素材库读写 / 知识 pending 写入)
  //   的接线为**后续任务**(见交付报告 follow-up)。在真端口接上前,这些 seam **绝不伪装成功**——
  //   此前它们返回「假 pendingId(`staged-…`)/ 固定 ok:true 结果 0 / 空成功」,违反「严禁假按钮 ·
  //   诚实置 0」:模型会把「什么都没做」当成「搜到 0 条 / 已采集 / 已写入」,据此继续推理产出幻觉。
  //   改为一律抛「未实现」错误(501 语义)。deterministic-engine 不吞 tool 异常(tool.execute 直接
  //   冒泡),故任一工具被调用即让自主任务**诚实失败**,模型/UI 明确知道「暂无此能力」。真端口落地
  //   即用真实现替换这些 throw(端口形状不变,executor 注册与框架校验零改动)。
  class AgenticPortNotImplementedError extends Error {
    readonly code = "NotImplemented";
    constructor(port: string) {
      super(`自主循环端口「${port}」尚未接线(未实现),暂不可用。`);
      this.name = "AgenticPortNotImplementedError";
    }
  }
  const agenticResearchPorts: ResearchPorts = {
    async webSearch() {
      throw new AgenticPortNotImplementedError("web.search");
    },
    async webRead() {
      throw new AgenticPortNotImplementedError("web.read");
    },
    async knowledgeWrite() {
      throw new AgenticPortNotImplementedError("knowledge.write");
    },
  };
  const agenticCollectionPorts: CollectionPorts = {
    async listTargets() {
      throw new AgenticPortNotImplementedError("collect.plan");
    },
    async runCollection() {
      throw new AgenticPortNotImplementedError("collect.run");
    },
  };
  const agenticMaterialPorts: MaterialPorts = {
    async searchMaterials() {
      throw new AgenticPortNotImplementedError("material.search");
    },
    async organizeMaterials() {
      throw new AgenticPortNotImplementedError("material.organize");
    },
  };
  // [T-313] 引擎切 Pi:createPiAgenticEngine 真接 pi-coding-agent SDK 自主循环;**保留确定性兜底**
  //   (依赖缺席 / 打包实拷缺失 / 无 §6.1 raw config / 运行异常 → 退 deterministicEngine,现有全绿路径)。
  //   §6.1 raw config 经 resolveLlmConfig(同 llmCompleter 一套 getModelConfig+env)注入引擎自建 provider;
  //   production 不传 buildStreamSimple(走 pi 内建 anthropic-messages/openai-completions api,真烧用户 provider)。
  const deterministicEngine = createDeterministicAgenticEngine();
  const agenticEngine = createPiAgenticEngine({ fallback: deterministicEngine });
  const buildAgenticLlmConfig = (ctx: RequestContext, capability: string) =>
    resolveLlmConfig(ctx, capability, {
      getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
      env: process.env,
    });
  const AGENTIC_DEFAULT_BUDGET = { maxSteps: 8, maxTokens: 20000 };
  executorRegistry.register(
    createAgenticExecutor({
      taskType: "agentic.research",
      engine: agenticEngine,
      resolveLlm: (ctx) => buildAgenticLlm(ctx, "agentic.research"),
      resolveLlmConfig: (ctx) => buildAgenticLlmConfig(ctx, "agentic.research"),
      resolveTools: () => createResearchTools(agenticResearchPorts),
      defaultBudget: AGENTIC_DEFAULT_BUDGET,
    }),
  );
  executorRegistry.register(
    createAgenticExecutor({
      taskType: "agentic.collect",
      engine: agenticEngine,
      resolveLlm: (ctx) => buildAgenticLlm(ctx, "agentic.collect"),
      resolveLlmConfig: (ctx) => buildAgenticLlmConfig(ctx, "agentic.collect"),
      resolveTools: () => createCollectionTools(agenticCollectionPorts),
      defaultBudget: AGENTIC_DEFAULT_BUDGET,
    }),
  );
  executorRegistry.register(
    createAgenticExecutor({
      taskType: "agentic.material",
      engine: agenticEngine,
      resolveLlm: (ctx) => buildAgenticLlm(ctx, "agentic.material"),
      resolveLlmConfig: (ctx) => buildAgenticLlmConfig(ctx, "agentic.material"),
      resolveTools: () => createMaterialTools(agenticMaterialPorts),
      defaultBudget: AGENTIC_DEFAULT_BUDGET,
    }),
  );

  // resolveModelSpec — 新 Agent Runtime(modelFor)按 capability 解析用户配的 model;复用
  // llmCompleter 同一套 resolve(getModelConfig + env),投影成 ModelSpec。没配 key → 抛
  // LlmCredentialError(适配器接住 → cancelTask,不假成功)。
  const resolveModelSpec = async (ctx: RequestContext, capability: string) => {
    const cfg = await resolveLlmConfig(ctx, capability, {
      getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
      env: process.env,
    });
    return {
      apiFormat: cfg.apiFormat,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      token: cfg.token,
    };
  };

  // [T-589] 内容雷达允许绑定低延迟专用模型；未专配时继续读取既有 topic.generate，
  // 避免升级后要求用户重复配置，也避免误把全局 default 当成专配。
  const resolveTopicPreviewModelSpec = async (ctx: RequestContext) => {
    const cfg = await resolveLlmConfigWithCapabilityFallback(
      ctx,
      "intelligence.topic-decompose",
      "topic.generate",
      {
        getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
        env: process.env,
      },
    );
    return {
      apiFormat: cfg.apiFormat,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      token: cfg.token,
    };
  };

  // [T-239b S1] 备用对话模型 —— 只认 chat.fallback 专配行(不回退 default/env;回退会把
  // 「备用」解析成主模型自己,fallback 失去意义)。未配/无 key → null(chat-runner 按现状报错)。
  const resolveFallbackModelSpec = async (ctx: RequestContext) => {
    const cfg = await resolveDedicatedLlmConfig(ctx, "chat.fallback", {
      getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
      env: process.env,
    });
    if (!cfg) return null;
    return {
      apiFormat: cfg.apiFormat,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      token: cfg.token,
    };
  };

  // T-086 文案审核 dispatch 实体(forward-declared 于 build 顶部):此处所有依赖已就绪
  // (aiService/positioningService/settingsService/artifactsService/reviewGateService/
  // resolveModelSpec)。两条起任务路径共用它:① 审核门 op(reviewGateService.createTask 直起
  // → 该 port 调用本函数)② ai.tasks.create 拦截分支(下方 ai transport)。后台跑
  // runScriptReview → L1 违禁词 lint(active 词表)+ L2 语义审(script.review capability,
  // 预设豆包,未配回退默认并标注非专用)→ 落 script_review_reports(绑 artifactVersion)。
  const dispatchScriptReview = (
    ctx: RequestContext,
    task: {
      id: string;
      projectId: string | null;
      inputData: Record<string, unknown>;
    },
  ) => {
    return runTaskWithEffectiveSkillSnapshot(ctx, task.id, () =>
      runScriptReview(ctx, task, {
      ai: aiService,
      positioning: {
        getPositioningCenter: (c: RequestContext) =>
          positioningService.getPositioningCenter(c),
      },
      resolveModelSpec,
      // 只有专用审核行本身具备可用凭据才标“专用”。空 key / 解密失败时实际由
      // resolveModelSpec 回退普通默认模型，标签也必须如实显示为非专用。
      hasDedicatedReviewModel: async (c) =>
        Boolean(
          await resolveDedicatedLlmConfig(c, "script.review", {
            getModelConfig: (ctx, capability) =>
              settingsService.getModelConfig(ctx, capability),
            env: process.env,
          }),
        ),
      // 脚本源:项目「脚本」stage 当前版本(优先 output_script,回退 master_script)的
      // 文本 + 版本号(与 script-editor-data 同口径)。
      scriptSource: {
        getLatestScript: async (c, projectId) => {
          const artifacts = await artifactsService.listProjectArtifacts(
            c,
            projectId,
          );
          const scriptArtifacts = artifacts.filter((a) => a.stage === "script");
          const target =
            scriptArtifacts.find((a) => a.artifactType === "output_script") ??
            scriptArtifacts.find((a) => a.artifactType === "master_script");
          if (!target) return null;
          const versions = await artifactsService.listVersions(c, target.id);
          if (versions.length === 0) return null;
          const current = versions
            .slice()
            .sort((a, b) => b.versionNumber - a.versionNumber)[0]!;
          // 文本抽取:contentData.transcript / sections(拼段)/ body 兜底。
          const data = (current.contentData ?? {}) as Record<string, unknown>;
          let text = "";
          if (typeof data.transcript === "string") {
            text = data.transcript;
          } else if (Array.isArray(data.sections)) {
            text = (data.sections as unknown[])
              .map((s) => {
                const so = (s ?? {}) as Record<string, unknown>;
                return [so.label, so.text, so.narration, so.body]
                  .filter(
                    (x): x is string =>
                      typeof x === "string" && x.length > 0,
                  )
                  .join(" ");
              })
              .join("\n");
          } else if (typeof data.body === "string") {
            text = data.body;
          }
          return {
            artifactId: target.id,
            version: current.versionNumber,
            text,
          };
        },
      },
      lintRules: {
        listActiveLintRules: (c) => reviewGateService.listActiveLintRules(c),
      },
      reportSink: {
        saveReport: (c, input) => reviewGateService.saveReport(c, input),
      },
      }),
    ).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await aiService.markFailed(ctx, task.id, message).catch(() => undefined);
    });
  };

  // ── [T-093] 知识库 AI 搜索:可配 embedding 管线 ─────────────────────────────
  // capability "knowledge.search.embed" **只认专配行,不回退 default 聊天模型**
  // (把 chat LLM 当 embedding 用是错的;未配 = 诚实降级纯关键词,前端渲提示条)。
  const resolveEnvSecretRef = (secretRef: string | undefined): string => {
    if (!secretRef) return "";
    const m = /^env:(.+)$/.exec(secretRef.trim());
    if (!m) return "";
    return (process.env[m[1]!] ?? "").trim();
  };
  const resolveEmbedSpec = async (
    ctx: RequestContext,
  ): Promise<{
    apiFormat: "anthropic" | "openai_chat" | "openai_responses";
    baseUrl: string | null;
    model: string;
    token: string;
  } | null> => {
    const row = await settingsService.getModelConfig(
      ctx,
      "knowledge.search.embed",
    );
    if (!row) return null;
    const token =
      row.secretValue?.trim() || resolveEnvSecretRef(row.secretReference);
    if (!token) return null;
    return {
      apiFormat: row.apiFormat,
      baseUrl: row.baseUrl ?? null,
      model: row.modelName,
      token,
    };
  };

  // [T-163 Batch 4] 批量算 embedding 已下沉 backend ai-runtime 的 runEmbedTexts(embedMany +
  // embeddingModelFor 用 embedding key,不住前端包);组合根只解析 spec + 传入。
  const embedTexts = async (
    spec: NonNullable<Awaited<ReturnType<typeof resolveEmbedSpec>>>,
    texts: string[],
  ): Promise<number[][]> => runEmbedTexts(spec, texts);

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
          const [vec] = await embedTexts(spec, [
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
              spec,
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
          const [qVec] = await embedTexts(spec, [query]);
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

  // resolveMultimodalSpec — L5 asset.generate 的多模态解析(SPEC 2026-07-01 §2.2 / M2),与文本
  // 层 resolveModelSpec 并列:复用同一套 getModelConfig(settings 拥有 model_configurations)+
  // env,投影成 MultimodalSpec(provider/model/baseUrl/token/kind)。image.generate/video.generate
  // 未配 → 抛 MultimodalConfigError(runner 接住 → cancelTask + 录制页「未配置生图/生视频模型」)。
  const resolveMultimodalSpec = (
    ctx: RequestContext,
    capability: "image.generate" | "video.generate",
  ) =>
    resolveMultimodalSpecFn(ctx, capability, {
      getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
      env: process.env,
    });
  // 多模态 provider 适配器注册表(keyed by provider)。真链路注册 MiniMax(M1 适配器,含 video
  // 异步轮询状态机 submit→poll→retrieve + 超时);加 provider = 在此注册一个适配器,不改 runner
  // 与业务代码([gate-F1])。真出图/视频要真 image.generate/video.generate key(本环境无 →
  // 未配抛错、诚实禁用);单测装配用 M1 的 fake provider 注入,不碰这个真 registry。
  // [T-379] "openai" = OpenAI 兼容 images API 适配器(POST /v1/images/generations)——
  // 覆盖 gpt-image 系官方 + one-api/new-api 系中转站(Seedream/Flux/Nano Banana 等经中转
  // 同形状;用户配中转 baseUrl + 任意生图 model id 即通)。生视频仍仅 minimax(各家视频
  // API 形态不统一,裁决见 docs/research/2026-07-17-image-video-gen-provider-landscape-research.md)。
  const multimodalRegistry: MultimodalProviderRegistry = {
    minimax: createMinimaxAdapter(),
    openai: createOpenaiImagesAdapter(),
  };
  // ASR provider 注册表(T-030-D2 逐字稿转写)—— 一个 OpenAI 兼容 adapter 覆盖 SiliconFlow/
  // OpenAI/Groq(转写端点同形状,SPEC D-d)。按用户可能所配的 provider 名各挂同一适配器实例
  // (归一);加 provider = 在此注册。真跑要真 transcribe.audio key(未配 → resolveTranscribeSpec
  // 抛 TranscribeConfigError,整任务停 + 引导);单测装配注 fake,不碰这个真 registry。
  const openaiAsrAdapter = createOpenaiAsrAdapter();
  // [T-160] 本地 Whisper 兜底(ASR 选配):用户没配云端 ASR → resolveTranscribeSpec 回退
  // provider="whisper-local",转写走本地 Transformers.js(Xenova/whisper-<level>,默认 small,
  // ffmpeg 解 16kHz mono PCM)。首次自动下模型到 ~/CreatorOS/models/whisper,幂等复用。免 key。
  const whisperLocalAdapter = createDefaultWhisperLocalAdapter();
  const asrRegistry: MultimodalProviderRegistry = {
    siliconflow: openaiAsrAdapter,
    openai: openaiAsrAdapter,
    groq: openaiAsrAdapter,
    "whisper-local": whisperLocalAdapter,
  };
  const transcriptStartupDeps = intelligenceTranscriptRunnerDeps;
  if (transcriptStartupDeps) {
    void drainIntelligenceTranscriptQueue(transcriptStartupDeps).catch(
      (error) => {
        console.error(
          "[intelligence] 逐字稿启动恢复失败:",
          error instanceof Error ? error.name : "UnknownError",
        );
      },
    );
  }

  // ── [T-084a] 联网检索解析 + registry(SPEC 2026-07-03 §1.1)─────────────────────
  // resolveSearchSpec:与多模态层同一套 getModelConfig(settings 拥有 model_configurations)+ env,
  // 投影成 SearchSpec(provider/baseUrl/model/token)。web.search 未配 → 抛 SearchConfigError
  // (gatherMaterials 接住 → grounding=model_memory 降级,不 crash)。search provider 用户可配。
  const resolveSearchSpec = (ctx: RequestContext) =>
    resolveSearchSpecFn(ctx, {
      getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
      env: process.env,
    });
  // 搜索 provider 注册表(keyed by provider)。三家首发适配器(纯自建 REST,不碰 Agent SDK);
  // 加 provider = 在此注册一个适配器,不改 runner 与业务代码。真检索要真 web.search key(未配 →
  // resolveSearchSpec 抛错、诚实降级);单测装配注 fake fetch,不碰这个真 registry。
  const searchRegistry: SearchProviderRegistry = {
    bocha: createBochaAdapter(),
    tavily: createTavilyAdapter(),
    serpapi: createSerpapiAdapter(),
    // [T-126a] RSS/Atom 免 key 检索 —— provider "rss",baseUrl 填 feed URL(s),无需搜索 API key。
    rss: createRssAdapter(),
    // [T-126b] 浏览器采集 —— provider "browser",真开无头 Chromium 搜(默认 Bing,baseUrl 可换)+ 自截图存证,免 key。
    browser: createBrowserScrapeAdapter(),
  };
  // ChatBox gatherMaterials 前置检索端口:解析 spec + 按 provider 分派 REST。未配抛 SearchConfigError、
  // 检索失败抛 SearchExecutionError(chat-runner catch 成 model_memory 降级)。
  const searchWebPort = async (
    ctx: RequestContext,
    query: string,
    opts?: { count?: number },
  ) => {
    const spec = await resolveSearchSpec(ctx);
    return searchWebFn(spec, query, searchRegistry, opts);
  };

  // ── [T-377] settings.models.test「测试连接」拦截:各能力现有解析链 + 最小真实调用/
  //    最便宜鉴权探测(策略见 settings-model-test-wrap.ts 头注)。解析器与 registry 都住
  //    组合根 → composition-only op(同 projects.transcribe 约定)。
  const settingsWithModelTest = createSettingsWithModelTest({
    settings,
    resolveLlm: (ctx, capability) =>
      resolveLlmConfig(ctx, capability, {
        getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
        env: process.env,
      }),
    resolveDedicatedLlm: (ctx, capability) =>
      resolveDedicatedLlmConfig(ctx, capability, {
        getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
        env: process.env,
      }),
    resolveMultimodal: (ctx, capability) =>
      resolveMultimodalSpecFn(
        ctx,
        capability as "image.generate" | "video.generate" | "asset.classify",
        {
          getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
          env: process.env,
        },
      ),
    resolveTranscribe: (ctx) =>
      resolveTranscribeSpecFn(ctx, {
        getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
        env: process.env,
      }),
    resolveEmbed: (ctx) =>
      resolveEmbedSpec(ctx).then((spec) =>
        spec ? { ...spec, authStyle: "bearer" as const } : null,
      ),
    resolveSearch: (ctx) => resolveSearchSpec(ctx),
    // 真实最小生图(与 runner 同一工厂真路径;kind 补齐成 MultimodalSpec)。
    generateImageMinimal: async (spec) => {
      const { assetBytes } = await generateImageFn(
        { ...spec, kind: "image" },
        { prompt: "连接测试:一个纯色小圆点", aspectRatio: "1:1" },
        multimodalRegistry,
      );
      return { byteLength: assetBytes?.byteLength ?? 0 };
    },
    // 真实最小检索(count=1;bocha/tavily/serpapi 消耗少量额度)。
    searchMinimal: async (_ctx, spec) => {
      const results = await searchWebFn(
        { ...spec, model: spec.model ?? "" },
        "连接测试",
        searchRegistry,
        { count: 1 },
      );
      return results.length;
    },
    // 与正式聊天完全复用同一 modelFor + streamText；必须消费出非空文本，
    // 不能再把 HTML 200 / 2xx 空流误报成“连通”。
    probeTextModel: async (spec) => {
      const { streamText } = await import("ai");
      const result = streamText({
        model: modelFor(spec),
        prompt: "连接测试。请只回复 OK。",
        // DeepSeek V4 默认先输出思考流；8 tokens 会在最终正文前耗尽。探针收到首个正文或
        // reasoning delta 即结束，因此 128 只是兼容缓冲，不会无谓消费完整额度。
        maxOutputTokens: 128,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(30_000),
      });
      return consumeTextProbeStream(result.fullStream);
    },
    fetchImpl: fetch,
  });
  // [T-235b] 已登记信源信号端口(热点多源证据主路)—— trend 出题(topic.generate trend basis /
  //   topic.daily)经它逐 enabled 信源抓信号:
  //   · web 型:readUrl(webAuthDirFor(domain),T-217b 带登录态读正文,**只 import 不改**)→
  //     trend.extract 结构化抽取(runStructuredNode 绑 Zod,无热度 null 不编);
  //   · rss 型:直接 fetch feed → parseFeed(search-rss 同一解析,辅路不调 AI)。
  //   单源失败跳过不拖垮(collectTrendSourceSignals 内容错);未登记信源 → [](诚实空)。
  const trendExtractPort = createTrendExtractPort({ resolveModelSpec });
  const trendSourceSignalsPort = (ctx: RequestContext) =>
    collectTrendSourceSignals(ctx, {
      listEnabledSources: (c) => trendSourcesService.listEnabledSources(c),
      readWebSource: async (c, source) => {
        // [T-370b] 读取走 profile 池(域亲和 checkout + DB 登录态注入;authDir 仅作
        //   存量惰性迁移的旧目录定位,openContext 注入后不再直开该目录)。
        const result = await readWebUrlSidecar(source.url, {
          authDir: webAuthDirFor(source.domain),
        }, {
          openContext: () =>
            openPooledReaderContext(c, source.domain) as never,
        });
        return { text: result.text };
      },
      extractSignals: (c, input) => trendExtractPort(c, input),
      fetchRssSignals: async (_c, source) => {
        const resp = await fetch(source.url, {
          headers: {
            Accept:
              "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
          },
          signal: AbortSignal.timeout(15_000),
        });
        if (!resp.ok) {
          throw new Error(`RSS 信源 HTTP ${resp.status}: ${source.url}`);
        }
        const xml = await resp.text();
        // parseFeed → 信号形状(feed 无热度概念 → heat=null,诚实;时间/链接原样)。
        return parseFeed(xml, source.domain)
          .slice(0, 8)
          .map((item) => ({
            title: item.title,
            url: item.url || null,
            heat: null,
            publishedAt: item.publishedAt ?? null,
            sourceName: source.name,
          }));
      },
    });

  // honestyBlock 第 6 条 + 工具动态描述用:探测 web.search 是否已配(只查配置、不打网络)。
  const probeSearchConfigured = async (ctx: RequestContext): Promise<boolean> => {
    try {
      await resolveSearchSpec(ctx);
      return true;
    } catch {
      return false;
    }
  };

  // [T-135] canonical Settings 种子已退役(userPreferences + modelConfigurations +
  // agentConfigurations 都是 Zyong Zhu 的预设,含默认 Anthropic model + env key)。
  // 偏好走 service 默认值;AI 能力骨架仍由下方 buildAiModelConfigs/buildAiAgentConfigs
  // seed(去 provider 预设的空占位行),用户 onboarding 自行配置。

  // Seed the AI per-capability catalog (Step 3 seed; design-spec §3): one
  // ModelConfiguration per capability (script.rewrite → fable-5/high, copilot.assist →
  // opus-4-8/medium default, …) and one AgentConfiguration per node (capabilities.skills
  // selects the enabled Skill), all owned by the canonical user. secretReference is
  // "env:ANTHROPIC_API_KEY" (resolved at runtime, never hardcoded). The AI capabilities
  // (`*.*` dotted) are disjoint from the Settings canonical capabilities (`script` /
  // `research`), so the (user_id, capability) unique index never collides. seed* are
  // onConflictDoNothing → a re-built singleton never double-seeds.
  const aiSeedRepo = createAiRepository(db, {
    ...deps,
    userId: canonicalDataset.user.id,
    // [T-332 S2] 本 repo 实例只跑 seedModelConfigs/seedAgentConfigs —— 这两张是 **user 级**
    //   表(model_configurations/agent_configurations,SPEC §3.2「模型配置共享」用户拍板),
    //   行上无 account 维。RepoDeps.accountId 已收紧为必填 string(为 conversations/tasks
    //   的 per-account 门),此处给显式占位哨兵:任何误用本实例走会话/任务读写都只会命中
    //   不存在的号(空集/404),不会串号。
    accountId: "__seed-user-level-only__",
  });
  await aiSeedRepo.seedModelConfigs(
    buildAiModelConfigs(canonicalDataset.user.id, FIXED_NOW_ISO),
  );
  await aiSeedRepo.seedAgentConfigs(
    buildAiAgentConfigs(canonicalDataset.user.id, FIXED_NOW_ISO),
  );

  // T-086 审核规则种子(SPEC §1)—— 从用户知识库移植的抖音违禁词表(Tier1 官方硬规则确定性
  // 投影 + Tier2 经验限流 + doud+ 投放特有词),幂等 id(rrule-seed-<user>-<slug>)+
  // onConflictDoNothing → 重建单例不双写。规则种子本体在 backend review 模块(review-rules.seed.ts)。
  const reviewGateSeedRepo = createReviewGateRepository(db, {
    ...deps,
    userId: canonicalDataset.user.id,
  });
  await reviewGateSeedRepo.seedRules(
    buildReviewRuleSeedRows(canonicalDataset.user.id, FIXED_NOW_ISO),
  );

  // [T-135] canonical positioning 种子已退役(CreatorProfile + statements = Zyong Zhu 人设,
  // 「把前沿 AI 论文工程化的硬核创作者」全是假身份定位)。/positioning 定位中心开箱空;
  // 真实定位由用户在定位中心填写/一键岛 AI 生成后落库(配合 T-131 引导页、T-136 per-account 人设)。

  // [T-052 裁决③] canonical monetization products 种子(module 18)已随变现中心物理删除。

  // [T-135] canonical candidates(选题候选池)种子已退役(cand-canonical-1/2/3 = Zyong Zhu
  // 口吻的假选题「用 RAG 把内部文档变成问答助手」等)。/topics 选题候选池开箱空;真实候选由
  // 用户从热点/需求/想法生成(ChatBox 选题、AI 选题一键岛)后落库。

  // Seed the canonical 变现加权 rubric (module 20): one Rubric + its immutable v1
  // RubricVersion (五维: hook 强度 / 利他性 / 人群匹配 / CTA 清晰度 / 为产品铺路程度,
  // weights sum to 1.0), so the calibration FE surface + the Candidate 变现加权 ranking
  // resolve a real current RubricVersion under the seeded login (foundation §2).
  // [T-332 S2] rubrics 是 per-account 域(SPEC §3.2:每号一套打分口径,NOT NULL):默认
  // rubric 改为**逐 active 号**种入(id = rubric-canonical:<accountId>,运行时经
  // canonicalRubricIdFor(ctx) 解析);0 号 → 跳过(绑号时 bootstrapDouyinOnBind 即时补种,
  // 兜底下次启动再补)。Deterministic ids/clock (FIXED_NOW_ISO);seed* onConflictDoNothing
  // → 重建单例/重复绑定不双写。version 先种,currentVersionId 才解析得到。
  const canonicalRubricDimensions = [
      {
        key: "hook",
        label: "钩子强度",
        weight: 0.2,
        description:
          "前3秒能否逼观众看下去 30 秒。0=通用开场「大家好今天聊聊」；3=反直觉断言/具体承诺；5=无法停止处理的具体场景或断言",
      },
      {
        key: "emotion",
        label: "情感共鸣",
        weight: 0.2,
        description:
          "前30秒能否触发具体、可命名的情感。0=纯信息无钩子；3=一般共鸣「我也有过」；5=锐利到观众不愿承认的自我识别「这就是我」",
      },
      {
        key: "product_path",
        label: "为产品铺路",
        weight: 0.2,
        description:
          "内容能否支撑信任/转化、为产品铺路（不只追播放）。0=纯流量噱头；3=隐约关联产品价值；5=自然把观众引向信任与下一步转化",
      },
      {
        key: "social",
        label: "社会共振",
        weight: 0.15,
        description:
          "是否触及当下有争议/结构性的社会模式。0=纯个人；3=公认社会现象无新视角；5=命名一个观众认识但没有语言形容的结构性模式",
      },
      {
        key: "cta",
        label: "CTA 清晰度",
        weight: 0.15,
        description:
          "行动召唤是否清晰且不突兀。0=无 CTA；3=结尾生硬喊一句；5=CTA 与内容价值自然衔接、观众想点",
      },
      {
        key: "quotable",
        label: "金句密度",
        weight: 0.1,
        description:
          "有几句能被截图、离开视频独立传播。0=全叙述无金句；3=结尾一句；5=多句分布开场/中间/结尾、能在评论与转发里独立存活",
      },
  ];
  // [T-332 S2] 按号幂等 ensure 默认 rubric(启动逐 active 号 + 绑定编排即时调;两处同一实体)。
  //   id 约定与 canonicalRubricIdFor(ctx) 恒一致;onConflictDoNothing 幂等。
  const ensureCanonicalRubricForAccount = async (
    accountId: string,
  ): Promise<void> => {
    const calibrationSeedRepo = createCalibrationRepository(db, {
      ...deps,
      userId: canonicalDataset.user.id,
      accountId,
    });
    const versionRow: CalibrationRubricVersionRow = {
      id: `rubricver-canonical-1:${accountId}`,
      userId: canonicalDataset.user.id,
      accountId, // per-account stamp(NOT NULL 终态)
      rubricId: `rubric-canonical:${accountId}`,
      versionNumber: 1,
      dimensions: canonicalRubricDimensions,
      changeSummary:
        "v2 借鉴 cheat-on-content 的已校准 rubric：合并传播驱动（钩子/情感/社会/金句）与变现维度（为产品铺路/CTA），每维带 0/3/5 锚点",
      createdAt: FIXED_NOW_ISO,
    };
    const rubricRow: CalibrationRubricRow = {
      id: `rubric-canonical:${accountId}`,
      userId: canonicalDataset.user.id,
      accountId, // per-account stamp(NOT NULL 终态)
      name: "变现加权评分标准",
      currentVersionId: versionRow.id,
      createdAt: FIXED_NOW_ISO,
    };
    await calibrationSeedRepo.seedRubricVersions([versionRow]);
    await calibrationSeedRepo.seedRubrics([rubricRow]);
  };
  // 启动:逐 active 号补种(存量号/重启幂等);0 号 → 静默跳过(引导态)。best-effort。
  try {
    const rubricSeedCtx: RequestContext = {
      userId: canonicalDataset.user.id,
      requestId: "seed-canonical-rubric",
      source: "ingestion",
    };
    const { rows: rubricAccounts } = await platformAccountService.listAccounts(
      rubricSeedCtx,
      { limit: 100, offset: 0 },
    );
    for (const acct of rubricAccounts.filter((a) => a.status === "active")) {
      await ensureCanonicalRubricForAccount(acct.id);
    }
  } catch (rubricSeedErr) {
    console.warn(
      "[seed] canonical rubric 按号种入失败(已 ignore,app 仍可启动):",
      rubricSeedErr instanceof Error ? rubricSeedErr.message : rubricSeedErr,
    );
  }

  // [T-050][T-332 S2] canonical 盲预测/回流结果种子已随 demo 数据整体退役,其残留的
  // calUser/calRubricVer/predDimensions/predMetrics 死代码本次一并清除(calRubricVer 曾
  // 引用旧的系统级 canonicalRubricVersion —— 该常量已被 per-account 默认 rubric 种子取代)。
  // [T-050] canonical 盲预测/回流结果种子已退役(主体 dy-out-* 已随 demo 数据删除;
  // 审计 B30:seed 预测把校准页撕成两个数据世界)。真实预测由用户在校准中心创建。

  // [T-135] canonical platform account 种子已退役(acct-canonical-douyin「@抖音创作者」
  // 是假账号)。账号管理开箱空;新用户自己扫码绑第一个抖音号(T-136 建默认账号)。

  // [T-135] canonical learnings(经验沉淀)种子已退役(canonicalDataset.learnings 是假方法论
  // 示例)。经验中心开箱空;真实经验由用户复盘沉淀写入。

  // [T-135] 复盘飞轮回流 轨B 的 canonical CalibrationRuleSuggestion 种子已退役(它引用被删的
  // 复盘 learning「learning-hook-15s」→ 无来源可回流)。校准中心「复盘回流建议」开箱空;
  // 真实建议由用户复盘结论回流生成。

  // [T-135 补漏 2026-07-05] douyin 金句知识种子(dy-know-*/dy-krev-*)已退役 —— 它是**用户本人**
  // 的真实抖音文案/金句/粉丝画像固化在代码(fixtures/douyin-real.ts),每次启动 seed 会灌进
  // **任何**库 → 部署给新用户时会把私人内容泄漏给每个人,且令「开箱空」不成立。知识改由用户
  // 真实采集(douyin-anchor-transcribe / 知识库录入)进库,不再 seed 固化内容。

  // T-004 ChatBox runtime — bundle the /api/chat route's needs: persist (aiService),
  // resolve model (resolveModelSpec), and the bound CreativeContext readers (定位/飞轮/
  // 受众信号/知识库 数据层注入). The readers reach peer modules ONLY through their public
  // services (positioning/learnings/candidate/knowledge), mirroring the topic.generate
  // trigger's bindings — no cross-module repo import (SPEC §22). The /api/chat route reads
  // these to assemble the system prompt; AI produces candidates (采纳 gate), never entities.
  const chatRuntime: ChatRuntime = {
    ai: aiService,
    resolveEffectiveSkillSnapshot: async (ctx, requiredSkillIds) => {
      if (!resolveEffectiveSkillSnapshotForRuntime) {
        throw new Error(
          "[T-513] Effective Skill snapshot resolver 尚未完成装配",
        );
      }
      return resolveEffectiveSkillSnapshotForRuntime(ctx, requiredSkillIds);
    },
    runWithEffectiveSkills: runWithResolvedEffectiveSkills,
    resolveModelSpec,
    // [T-239b] 备用对话模型端口(只认 chat.fallback 专配行)。
    resolveFallbackModelSpec,
    context: {
      positioning: {
        getPositioningCenter: (c: RequestContext) =>
          positioningService.getPositioningCenter(c),
      },
      learnings: {
        getSuggestions: (c: RequestContext, opts: { limit?: number }) =>
          learningsService.getSuggestions(c, opts),
      },
      signals: {
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
            // [T-238] 评论按作品锚 → 信号质量画像算覆盖作品数。
            publicationId: s.publicationId ?? null,
          })),
      },
      knowledge: {
        // [T-079c] 与 dispatch 路径的 knowledgeReader 同投影:补战绩/出处字段
        // (usedCount/usedInPublished/sourceNote)→ knowledgeBrief 分段+战绩排序。
        list: async (c: RequestContext, opts: { limit?: number }) =>
          (await knowledgeService.listKnowledge(c))
            .slice(0, opts.limit ?? 40)
            .map((k) => ({
              title: k.title,
              knowledgeType: k.knowledgeType,
              usedCount: k.usedCount,
              usedInPublished: k.usedInPublished,
              sourceNote: k.sourceNote ?? null,
              // [T-238] 新鲜度 → 信号质量画像算近 30 天占比。
              createdAt: k.createdAt ?? null,
            })),
      },
      // T-039b:抖音账号画像 reader —— 定位对话(chatbox.positioning)据此把「这个人在平台上已经
      // 是谁」(平台/账号/粉丝量)注进 system,让定位提案立足真实账号身份。复用 platformAccountService
      // .listAccounts(user-scoped),映射到 runner 的 {platform, accountHandle, followerBaseline} 形状。
      // 与 positioning.generate 一键岛节点同一份读法,不造影子。空/未连账号 → 空数组(诚实降级)。
      accounts: {
        list: async (c: RequestContext) =>
          (
            await platformAccountService.listAccounts(c, {
              limit: 100,
              offset: 0,
            })
          ).rows.map((a) => ({
            // [T-382] 透传账号 id —— 装配层据它与 ctx.accountId(x-account-id 已验属主的
            // 当前选中号)匹配,画像标「⭐当前选中号」+ 渲「当前操作的抖音号」system 块。
            id: a.id,
            platform: a.platform,
            accountHandle: a.accountHandle,
            followerBaseline: a.followerBaseline,
          })),
      },
      // T-039a:复盘对象 reader —— ChatBox 对话复盘(review.analyze)路径据此读「这一条作品」的真
      // 文案/标题/数据/评论(前提是前端带了 projectId → 复盘一键岛以 kind=project 打开时已带)。
      // 与后端复盘 task 共用同一份读法(makeReviewSubjectReader),不造影子。
      reviewSubject: makeReviewSubjectReader(),
      // [T-146c/d] 用户上传素材主权(稿面对话路径)—— 稿面右栏对话里整稿(draftScript)吃硬约束段、
      // 搜素材(gatherMaterials)贴资料搜。与写文案 task / research task 共用同一份读法,不造影子。
      projectMaterials: makeProjectMaterialsReader(),
      // [T-270] 立项 Brief reader(对话路径)—— 项目态对话据此把立项硬锚(核心信息/内容目标含避免X/
      // 内容形式/目标观众)渲进 system(briefHardBlock)+ hooks/整稿子调用,让编导锚定钦定前提、不漂移。
      // 此前对话路径根本没绑 brief → 项目态 chat 的 context.projectBriefHard 恒空(A3 注入落不了地)。
      // 与 dispatch 路径共用 makeBriefReader(单一真值,扩投影全字段)。
      brief: makeBriefReader(),
      // [T-245] 已登记信源信号端口 —— 对话编导 topic.generate(basis=trend)与选题页出题共用
      // 同一个 trendSourceSignalsPort(readUrl 带登录态读热榜页 + AI 结构化抽取 / rss 解析),
      // 不造影子。经 route 的 `...runtime.context` 展开注入 chat-runner,不加路由接线。
      trendSourceSignals: (c: RequestContext) => trendSourceSignalsPort(c),
      // [T-245] enabled 信源计数 —— 只用于 trend 出题降级注记「已登记 N 个」的诚实措辞。
      countEnabledTrendSources: async (c: RequestContext) =>
        (await trendSourcesService.listEnabledSources(c)).length,
      // [T-578] 由 route 的 ...runtime.context 自动透传给 chat-runner，和后台 runner
      // 绑定同一个 reader；无需在控制层手枚举新增字段。
      positioningWorks: positioningWorksReader,
    },
    // 只读 context 工具的真数据读端口 —— 全部 user-scoped(经各自 service/repo 用 ctx.userId 收窄),
    // 只读、不写实体。找不到现成的「带 query 搜」读方法时,在此对现成 list 端口做内存过滤(优先复用
    // 现成读端口,不新造 repo 方法)。诚实说明:knowledge/materials 的 query 是内存 contains 过滤
    // (list 本身不带全文检索);projects 无真实 publishedAt(那在 publication 上)→ 不塞、留空。
    contextReaders: {
      // context.projects —— 复用 projectsRepo.list(user-scoped: WHERE user_id = ctx.userId)。
      // [T-058②] 分页 + 总数仍走通用 listRecentProjects；定位生成另走上方
      // positioningWorks，避免隐藏作品混入画像又不误伤项目检索。
      listProjects: listRecentProjects,
      // [T-077b] brief.fill 的现状读 —— 复用 projectsRepo.get(user-scoped)取当前项目的
      // brief_detail jsonb 原样返回(契约 projectBriefDetail 形状)。读不到(项目不存在/越权)
      // → null(工具结果 current=null,前端卡现值显「未填」),绝不抛崩对话流。
      getProjectBrief: async (
        c: RequestContext,
        opts: { projectId: string },
      ) => {
        try {
          const row = await projectsRepo.get(c, opts.projectId);
          return (row.briefDetail ?? null) as {
            targetAudience?: string;
            contentGoal?: string;
            contentFormat?: string;
            orientation?: "landscape" | "portrait";
            targetPlatforms?: string[];
            durationEstimate?: string;
            coreMessage?: string;
            successCriteria?: string;
          } | null;
        } catch {
          return null;
        }
      },
      // [T-058③] 观众评论只读(audience_signals source='comment',最新在前,带 total)。
      listComments: async (
        c: RequestContext,
        opts: { limit: number; offset: number },
      ) => {
        const { rows, total } = await candidateService.listSignals(c, {
          source: "comment",
          limit: opts.limit,
          offset: opts.offset,
        });
        return {
          total,
          rows: rows.map((r) => ({
            text: r.rawText,
            likeCount: r.likeCount ?? null,
            source: r.source,
            createdAt: r.createdAt,
          })),
        };
      },
      // context.knowledge —— 复用 knowledgeService.listKnowledge(user-scoped: repo.list(ctx.userId))。
      // query 空 → 回最近若干条;非空 → **分词 OR 模糊匹配**(T-039a 放宽:原来是「整串 title.includes」
      // 精确子串,复盘拿主题/标题搜时命中率极低 → 用户反馈「匹配太死」)。用 knowledgeRelevanceScore 对
      // 标题+摘要计相关度(命中的 query 词数),命中(>0)才留,按相关度降序 + 原序稳定排。**诚实**:
      // 全不命中就空(不塞无关资料),不是全返回。snippet:item row 不含正文 → 用摘要/描述元数据兜一句,
      // 真拿不到给空串(不编内容)。
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
      // context.materials —— 复用 assetsService.listAssets(user-scoped: repo.listAssets(ctx.userId))。
      // ListAssetsQuery 只有 { limit, cursor }(无 query 文本)→ 取一批后做名称内存 contains 过滤。
      // 拉多一点(query 时最多 100)再截断,避免过滤后不足 limit;title=name,kind=assetType。
      searchMaterials: async (
        c: RequestContext,
        opts: { query: string; limit: number },
      ) => {
        const q = opts.query.trim().toLowerCase();
        const rows = await assetsService.listAssets(c, {
          limit: q ? 100 : opts.limit,
          cursor: null,
        });
        const filtered = q
          ? rows.filter((a) => a.name.toLowerCase().includes(q))
          : rows;
        return filtered.slice(0, opts.limit).map((a) => ({
          id: a.id,
          title: a.name,
          kind: a.assetType,
        }));
      },
      // 参考封面自动选择必须建立在“全库图片精确只有 1 张”上，不能把首 100 条误当全库。
      // assets service 是内部端口，repo 本身已取完账号内 active 行再 slice，因此用无限上限
      // 一次得到完整集合；仅回传少量候选供澄清，但 total 是精确图片总数。
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
      // [T-099b] context.project.detail —— 某项目全档。复用既有公开读源(不新造 repo 方法):
      //   · 项目行(标题/阶段/状态/brief)→ projectsRepo.get(user-scoped,顺带 ownership 门)
      //   · 产物索引(type/版本数/updatedAt/字数)→ artifactsService.listProjectArtifacts +
      //     listVersions + 当前版本 contentText 长度(transcript 回退,与 getScript 同口径)
      //   · 发布状态 → listOutputIdsByProject → publishingService.listPublications(取首个已发布)
      //   · 最新指标摘要 → makeReviewSubjectReader().getMetricsSummary(同口径,不新造)
      // 读不到(不存在/越权)→ null(projectsRepo.get 抛 → catch 成 null,诚实降级不崩)。
      getProjectDetail: async (c: RequestContext, opts: { projectId: string }) => {
        try {
          const project = await projectsRepo.get(c, opts.projectId);
          const brief = (project.briefDetail ?? {}) as Record<string, unknown>;
          const s = (v: unknown): string | undefined =>
            typeof v === "string" && v.trim() ? v.trim() : undefined;
          const platforms = Array.isArray(brief.targetPlatforms)
            ? brief.targetPlatforms.filter((p): p is string => typeof p === "string")
            : undefined;
          // 产物索引 —— 每类产物的版本数 + updatedAt + 当前版本字数(全文走 context.artifact.text)。
          const artifactRows = await artifactsService.listProjectArtifacts(
            c,
            opts.projectId,
          );
          const repo = createArtifactRepository(db, {
            ...deps,
            userId: c.userId,
            // [T-332 S2] strict:artifact 是 per-account 域,未选号 → AccountRequiredError。
            accountId: requireAccountId(c.accountId, "artifacts.repo"),
          });
          const artifacts = await Promise.all(
            artifactRows.map(async (a) => {
              let versionCount = 0;
              let charCount = 0;
              try {
                const versions = await artifactsService.listVersions(c, a.id);
                versionCount = versions.length;
              } catch {
                versionCount = 0;
              }
              if (a.currentVersionId) {
                try {
                  const version = await repo.getVersion(a.currentVersionId);
                  const data = version.contentData as
                    | Record<string, unknown>
                    | null
                    | undefined;
                  const text =
                    version.contentText && version.contentText.trim()
                      ? version.contentText
                      : data && typeof data.transcript === "string"
                        ? data.transcript
                        : "";
                  charCount = text.length;
                } catch {
                  charCount = 0;
                }
              }
              return {
                artifactType: a.artifactType,
                versionCount,
                updatedAt: a.updatedAt ?? null,
                charCount,
              };
            }),
          );
          // 发布状态 —— 项目 outputs → publications;取首个已发布(publishedAt 非空)作代表。
          let publish = {
            published: false,
            platform: null as string | null,
            publishedAt: null as string | null,
          };
          try {
            const outputIds = await projectsService.listOutputIdsByProject(
              c,
              opts.projectId,
            );
            outer: for (const outputId of outputIds) {
              const pubs = await publishingService.listPublications(c, outputId, {
                limit: 20,
                offset: 0,
              });
              for (const pub of pubs) {
                if (pub.publishedAt) {
                  publish = {
                    published: true,
                    platform: pub.platform,
                    publishedAt: pub.publishedAt,
                  };
                  break outer;
                }
              }
            }
          } catch {
            /* 发布状态 best-effort,读失败按未发布(诚实,不编) */
          }
          // 最新指标摘要 —— 复用 ReviewSubjectReader 口径(views/plays 归一,人类可读串)。
          let metricsSummary = "";
          try {
            metricsSummary = await makeReviewSubjectReader().getMetricsSummary(
              c,
              opts.projectId,
            );
          } catch {
            metricsSummary = "";
          }
          return {
            id: project.id,
            title: project.title,
            stage: project.currentStage,
            status: project.status,
            publish,
            brief: {
              targetAudience: s(brief.targetAudience),
              contentGoal: s(brief.contentGoal),
              contentFormat: s(brief.contentFormat),
              targetPlatforms: platforms,
              durationEstimate: s(brief.durationEstimate),
              coreMessage: s(brief.coreMessage),
              successCriteria: s(brief.successCriteria),
            },
            artifacts,
            metricsSummary,
          };
        } catch {
          return null;
        }
      },
      // [T-099b] context.positioning.detail —— 定位母版全档 + 账号画像并入(不单开账号工具)。
      // 复用 positioningService.getPositioningCenter(profile 全 facets + downstreamRules + 陈述 +
      // history 版本数)+ platformAccountService.listAccounts(账号画像)。母版未建 → profile:null
      // (诚实空态)。best-effort:账号读失败 → 空数组(不阻断定位档案)。
      getPositioningDetail: async (c: RequestContext) => {
        const center = await positioningService.getPositioningCenter(c);
        const p = center.profile;
        const facets = (p?.facets ?? {}) as Record<string, string>;
        const rules = (p?.downstreamRules ?? {}) as Record<string, string>;
        let accounts: Array<{
          platform: string;
          accountHandle: string;
          followerBaseline: number;
          current?: boolean;
        }> = [];
        try {
          const res = await platformAccountService.listAccounts(c, {
            limit: 100,
            offset: 0,
          });
          accounts = res.rows.map((a) => ({
            platform: a.platform,
            accountHandle: a.accountHandle,
            followerBaseline: a.followerBaseline,
            // [T-382] 当前选中号标注(ctx.accountId 已验属主)—— 模型读工具结果时能直接
            // 回答「我当前登录的是哪个账号」,不再把两个号当并列无主态。
            ...(c.accountId != null && a.id === c.accountId
              ? { current: true }
              : {}),
          }));
        } catch {
          accounts = [];
        }
        return {
          profile: p
            ? {
                persona: p.persona,
                field: p.field,
                audience: p.audience,
                differentiation: p.differentiation,
                capabilities: p.capabilities,
                facets: {
                  contentScope: facets.contentScope || undefined,
                  avoid: facets.avoid || undefined,
                  corePain: facets.corePain || undefined,
                  coreValue: facets.coreValue || undefined,
                  tone: facets.tone || undefined,
                  statusNote: facets.statusNote || undefined,
                },
                downstreamRules: {
                  topicRule: rules.topicRule || undefined,
                  scriptRule: rules.scriptRule || undefined,
                  projectRule: rules.projectRule || undefined,
                  forbidRule: rules.forbidRule || undefined,
                  expressionRule: rules.expressionRule || undefined,
                },
              }
            : null,
          currentStatement: center.currentStatement
            ? {
                oneLiner: center.currentStatement.oneLiner,
                keywords: center.currentStatement.keywords,
              }
            : null,
          statementCount: Array.isArray(center.history)
            ? center.history.length
            : null,
          accounts,
        };
      },
      // [T-099b] context.knowledge.detail —— 单条知识全字段。复用 knowledgeService.getKnowledge
      //   (带 T-079c 战绩投影 usedCount/usedInPublished)+ listRevisions(取当前修订正文 note)+
      //   listRelations(语义关联边)。tags 从 sourceMetadata.tags 取(schema 无独立 tags 列)。
      //   读不到(不存在/越权)→ null(getKnowledge 抛 → catch 成 null,诚实降级)。
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
      // [T-099c] context.artifacts —— 某项目产物清单。复用既有公开读源(不新造 repo 方法):
      //   · 产物行 → artifactsService.listProjectArtifacts(user-scoped)
      //   · 每类产物版本数 → listVersions;当前版本字数 → getVersion 的 contentText/transcript 长度
      //     (与 getProjectDetail 的产物索引、getScript 同口径,不造影子)。
      // projectsRepo.get 顺带 ownership 门(越权/不存在 → 抛 → catch 成 null,诚实降级)。
      listProjectArtifacts: async (
        c: RequestContext,
        opts: { projectId: string },
      ) => {
        try {
          const project = await projectsRepo.get(c, opts.projectId);
          const artifactRows = await artifactsService.listProjectArtifacts(
            c,
            opts.projectId,
          );
          const repo = createArtifactRepository(db, {
            ...deps,
            userId: c.userId,
            // [T-332 S2] strict:artifact 是 per-account 域,未选号 → AccountRequiredError。
            accountId: requireAccountId(c.accountId, "artifacts.repo"),
          });
          const items = await Promise.all(
            artifactRows.map(async (a) => {
              let currentVersion: number | null = null;
              let totalChars = 0;
              try {
                const versions = await artifactsService.listVersions(c, a.id);
                const current = versions
                  .slice()
                  .sort((x, y) => y.versionNumber - x.versionNumber)[0];
                currentVersion = current?.versionNumber ?? null;
              } catch {
                currentVersion = null;
              }
              if (a.currentVersionId) {
                try {
                  const version = await repo.getVersion(a.currentVersionId);
                  totalChars = extractArtifactText(
                    version.contentText,
                    version.contentData,
                  ).length;
                } catch {
                  totalChars = 0;
                }
              }
              return {
                artifactType: a.artifactType,
                currentVersion,
                updatedAt: a.updatedAt ?? null,
                totalChars,
              };
            }),
          );
          return {
            projectId: project.id,
            projectTitle: project.title,
            items,
          };
        } catch {
          return null;
        }
      },
      // [T-099c] context.artifact.text —— 某项目某类产物正文全文(事故二根治)。找该 artifactType 的
      // 当前版本,抽正文:output_script transcript 优先(与 getScript 同读法),回退 contentText,再回退
      // contentData.sections 拼段 / body(与 scriptSource.getLatestScript 同抽取口径)。找不到该类产物 /
      // 无当前版本 → null(诚实空态,工具侧渲「这个项目还没有 X 产物」)。ownership 门经 projectsRepo.get。
      getArtifactText: async (
        c: RequestContext,
        opts: { projectId: string; artifactType: string },
      ) => {
        try {
          await projectsRepo.get(c, opts.projectId); // ownership 门(越权/不存在 → 抛 → null)
          const artifactRows = await artifactsService.listProjectArtifacts(
            c,
            opts.projectId,
          );
          const target = artifactRows.find(
            (a) => a.artifactType === opts.artifactType,
          );
          if (!target || !target.currentVersionId) return null;
          const repo = createArtifactRepository(db, {
            ...deps,
            userId: c.userId,
            // [T-332 S2] strict:artifact 是 per-account 域,未选号 → AccountRequiredError。
            accountId: requireAccountId(c.accountId, "artifacts.repo"),
          });
          const version = await repo.getVersion(target.currentVersionId);
          const fullText = extractArtifactText(
            version.contentText,
            version.contentData,
          );
          return { artifactType: target.artifactType, fullText };
        } catch {
          return null;
        }
      },
      // [T-099c] context.knowledge.text —— 某知识条目长文正文全文。取当前修订(缺则 revisionNumber 最大)
      // 的 content(transcript/reference/note 长文都落在 revision content,与 getKnowledgeDetail 的 note
      // 同读法)。读不到(不存在/越权)→ null(getKnowledge 抛 → catch 成 null,诚实降级)。
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
      },
      // [T-099 切片四] context.publications —— 该用户发布记录清单。复用 publishing 公开读源
      // getRecentPublicationsWithTitle(user-scoped,已把 revision 标题解析进 row.title)。该读源
      // 无 total:多拉一页(limit+1)探 hasMore,total 用「offset+已见 + (还有更多 ? 1 : 0)」诚实近似
      // (不新造 count op;分页真相 hasMore 精确,total 为下界近似,前端脚注不谎称已看全)。
      listPublications: async (
        c: RequestContext,
        opts: { limit: number; offset: number },
      ) => {
        try {
          const probe = await publishingService.getRecentPublicationsWithTitle(c, {
            limit: opts.limit + 1,
            offset: opts.offset,
          });
          const hasMore = probe.length > opts.limit;
          const page = probe.slice(0, opts.limit);
          return {
            rows: page.map((p) => ({
              id: p.id,
              platform: p.platform,
              url: p.externalUrl ?? null,
              publishedAt: p.publishedAt ?? null,
              projectTitle: p.title ?? "",
              coverAssetId: p.coverAssetId ?? null,
              status: p.status,
            })),
            // total 下界:本页起点 + 本页条数 (+1 当还有更多)。工具 hasMore 精确,total 诚实近似。
            total: opts.offset + page.length + (hasMore ? 1 : 0),
          };
        } catch {
          return { rows: [], total: 0 };
        }
      },
      // [T-099 切片四] context.metrics —— 给 projectId → 单作品指标快照(播放/点赞/评论/分享,复用
      // dashboard 的 views??plays 归一 + 最新帧口径,与 getMetricsSummary 同读法);不给 → 账号级最近
      // N 作品指标行(getRecentPublicationsWithTitle 的作品 × 各自最新 snapshot)。留存点无公开读 seam
      // (不跨模块直连 repo,守 SPEC §22 / 零新 contract)→ 诚实回空数组(不编)。全 best-effort 空兜底。
      getMetrics: async (
        c: RequestContext,
        opts: { projectId?: string; limit: number },
      ) => {
        // 从一条 publication 的最新 snapshot rawMetrics 抽 4 项核心指标(views??plays 归一)。
        const metricsOfPublication = async (
          publicationId: string,
        ): Promise<{
          plays: number | null;
          likes: number | null;
          comments: number | null;
          shares: number | null;
        }> => {
          try {
            const page = await analyticsService.getPublicationAnalytics(
              c,
              publicationId,
              1,
              10,
            );
            const latest = page.rows
              .slice()
              .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
            const raw = (latest?.rawMetrics ?? {}) as Record<string, unknown>;
            const num = (k: string): number | null => {
              const v = raw[k];
              return typeof v === "number" && Number.isFinite(v) ? v : null;
            };
            return {
              plays: num("views") ?? num("plays"),
              likes: num("likes") ?? num("digg"),
              comments: num("comments"),
              shares: num("shares"),
            };
          } catch {
            return { plays: null, likes: null, comments: null, shares: null };
          }
        };
        // 单作品模式:该项目 outputs → publications,合并各 publication 最新 snapshot(取有值者)。
        if (opts.projectId) {
          try {
            const project = await projectsRepo.get(c, opts.projectId); // ownership 门
            const outputIds = await projectsService.listOutputIdsByProject(
              c,
              opts.projectId,
            );
            const merged = {
              plays: null as number | null,
              likes: null as number | null,
              comments: null as number | null,
              shares: null as number | null,
            };
            for (const outputId of outputIds) {
              let pubs: Array<{ id: string }> = [];
              try {
                pubs = await publishingService.listPublications(c, outputId, {
                  limit: 20,
                  offset: 0,
                });
              } catch {
                pubs = [];
              }
              for (const pub of pubs) {
                const m = await metricsOfPublication(pub.id);
                merged.plays = merged.plays ?? m.plays;
                merged.likes = merged.likes ?? m.likes;
                merged.comments = merged.comments ?? m.comments;
                merged.shares = merged.shares ?? m.shares;
              }
            }
            const hasAny =
              merged.plays !== null ||
              merged.likes !== null ||
              merged.comments !== null ||
              merged.shares !== null;
            return {
              subject: project.title,
              // [T-223] 单作品模式该行也带 projectId(前端/编导映射一致);externalId 从 platformRef 兜底。
              rows: hasAny
                ? [{ projectId: opts.projectId, title: project.title, ...merged }]
                : [],
              // 留存点无公开读 seam → 诚实空(不跨模块直连 repo、不编)。
              retention: [],
            };
          } catch {
            return { subject: null, rows: [], retention: [] };
          }
        }
        // 账号级模式:最近 N 发布作品,每作品一行(标题 + 该 publication 最新 snapshot 指标)。
        // [T-223] 每行 join 出 projectId + 真实 project.title —— 治「编导认不出作品」:原本只给
        //   revision 标题(imported publication 无 revision → 空 → 退到 platform="douyin" 匿名行),
        //   编导拿不到 projectId 无法读真逐字稿,只能瞎连/编造。现经 publication.contentOutputId →
        //   content_output(projectId) → project.title 补上锚点(project.title 是导入时落的真标题,
        //   reconstruct/复盘全档也在这条 project 上),让编导能把「最高播放」映射到具体作品读真稿。
        try {
          const pubs = await publishingService.getRecentPublicationsWithTitle(c, {
            limit: opts.limit,
            offset: 0,
          });
          // 同一 projectId 的真标题缓存(避免每行重复 get 项目)。
          const projectTitleCache = new Map<string, string>();
          const rows = await Promise.all(
            pubs.map(async (p) => {
              const m = await metricsOfPublication(p.id);
              let projectId: string | null = null;
              let projectTitle = "";
              try {
                // publication → content_output(带 projectId + output 标题,ownership 门)。
                const out = await projectsRepo.getOutput(c, p.contentOutputId);
                projectId = out.projectId;
                if (projectTitleCache.has(projectId)) {
                  projectTitle = projectTitleCache.get(projectId) ?? "";
                } else {
                  try {
                    const proj = await projectsRepo.get(c, projectId);
                    projectTitle = proj.title?.trim() ?? "";
                  } catch {
                    // 项目读不到(越权/已删)→ 退回 output 标题(仍比匿名平台名强)。
                    projectTitle = out.title?.trim() ?? "";
                  }
                  projectTitleCache.set(projectId, projectTitle);
                }
              } catch {
                // 解析不到作品映射 → projectId 留 null(诚实空,不硬造)。
                projectId = null;
              }
              return {
                projectId,
                externalId: p.externalId ?? null,
                // 真标题优先 project.title;回退 revision(p.title)→ 平台兜底(不再匿名化为 douyin)。
                title: projectTitle || p.title || p.platform || "（无标题发布）",
                ...m,
              };
            }),
          );
          return { subject: null, rows, retention: [] };
        } catch {
          return { subject: null, rows: [], retention: [] };
        }
      },
      // [T-099 切片五] context.learnings —— 经验清单(含 validated/candidate 状态)。复用 learnings
      // 公开读源 listLearnings(user-scoped,带 reuseCount 战绩)。契约 list op 无 query/type/status
      // 过滤 → 多拉一批(上限 200)后内存过滤:query 命中标题/洞察(knowledgeRelevanceScore 分词 OR),
      // learningType/status 精确匹配。诚实:全不命中 → 空。total = 过滤后全量数(前端脚注真相)。
      listLearnings: async (
        c: RequestContext,
        opts: {
          query?: string;
          learningType?: string;
          status?: string;
          limit: number;
        },
      ) => {
        try {
          const { rows } = await learningsService.listLearnings(c, {
            limit: 200,
            offset: 0,
          });
          const q = (opts.query ?? "").trim();
          const filtered = rows.filter((r) => {
            if (opts.learningType && r.learningType !== opts.learningType)
              return false;
            if (opts.status && r.validationStatus !== opts.status) return false;
            if (q && knowledgeRelevanceScore(`${r.title}\n${r.insight}`, q) === 0)
              return false;
            return true;
          });
          return {
            total: filtered.length,
            rows: filtered.slice(0, opts.limit).map((r) => ({
              id: r.id,
              title: r.title,
              insight: r.insight,
              learningType: r.learningType,
              status: r.validationStatus,
              reuseCount: r.reuseCount,
            })),
          };
        } catch {
          return { rows: [], total: 0 };
        }
      },
      // [T-099 切片五] context.candidates —— 选题候选池清单。复用 candidate 公开读源 listCandidates
      // (user-scoped,带 total 分页)。title/status/predictedScore/source 直投影。
      listCandidates: async (
        c: RequestContext,
        opts: { limit: number; offset: number },
      ) => {
        try {
          const { rows, total } = await candidateService.listCandidates(c, {
            limit: opts.limit,
            offset: opts.offset,
          });
          return {
            total,
            rows: rows.map((r) => ({
              id: r.id,
              title: r.title,
              status: r.status,
              score: r.predictedScore,
              source: r.source,
            })),
          };
        } catch {
          return { rows: [], total: 0 };
        }
      },
      // [T-099 切片五] context.predictions —— 预测 vs 实绩对照 + 当前 rubric 摘要。复用 calibration
      // 公开读源:getOverview(reflowRows = prediction+result 逐维度对照 + KPI)+ getCurrentRubricVersion
      // (canonical rubric 摘要)。overview.reflowRows 只含已回流的预测;total 用 reflowRows 长度(诚实:
      // 未回流的预测无对照行,不编 actual)。rubric 读失败 / 母版未建 → rubric:null(诚实空态)。
      getPredictions: async (c: RequestContext, opts: { limit: number }) => {
        let rubric: {
          name: string;
          versionNumber: number;
          dimensionCount: number;
        } | null = null;
        try {
          const version = await calibrationService.getCurrentRubricVersion(
            c,
            canonicalRubricIdFor(c), // [T-332 S2] per-account 默认 rubric
          );
          rubric = {
            name: "校准评分标准",
            versionNumber: version.versionNumber,
            dimensionCount: version.dimensions.length,
          };
        } catch {
          rubric = null; // 母版未建 / 读不到 → 诚实空(不编版本号)
        }
        try {
          const overview = await calibrationService.getOverview(c);
          const reflow = overview.reflowRows.slice(0, opts.limit);
          // 各对照行的作品标题 —— 从 pendingSubjects 按 subjectId 反查(overview 已含,不新读)。
          const titleBySubject = new Map(
            overview.pendingSubjects.map((s) => [s.subjectId, s.title]),
          );
          const rows = reflow.map((r) => {
            const hasResult = r.dimensions.some((d) => d.actual !== null);
            return {
              predictionId: r.predictionId,
              subjectTitle: titleBySubject.get(r.subjectId) ?? "",
              hasResult,
              deviationBand: r.deviationBand,
              finding: r.reason,
              dimensions: r.dimensions.map((d) => ({
                key: d.key,
                label: d.label,
                predicted: d.predicted,
                actual: d.actual,
                deviation: d.deviation,
              })),
            };
          });
          return { rubric, rows, total: overview.reflowRows.length };
        } catch {
          return { rubric, rows: [], total: 0 };
        }
      },
    },
    // [T-084a] 联网检索端口 —— gatherMaterials 前置检索 + honestyBlock/工具动态描述探测。
    probeSearchConfigured,
    searchWeb: searchWebPort,
    // [T-084b] material.screenshot 端口 —— 真无头浏览器截公开页 → createGeneratedAsset 落库
    // (sourceUrl 存证进 mediaMetadata,复用 mergeAiAnnotation 不改 schema)→ 换签名预览 URL。
    // captureUrl 逐类抛错(打不开/HTTP/登录墙),原样上抛给工具 execute 转人话渲错误态。
    captureScreenshot: async (
      ctx: RequestContext,
      input: { url: string; fullPage?: boolean; signal?: AbortSignal },
    ) => {
      // [T-239c] signal 透传进 captureUrl:用户点「停止」→ 关无头浏览器提前退出(AbortError)。
      // [T-390] 素材搜集韧性:媒体站对干净无头 context 常回 403/5xx —— 若该域在保管库有登录态
      // (browser_sessions),带登录态经 profile 池**重试一次**(登录态访问通常能过);没有登录态
      // 则在诚实报错上追加可行动引导(去保管库登录 / material.gather 换路检索),不静默吞。
      let shot;
      try {
        shot = await captureUrl(input.url, {
          fullPage: input.fullPage,
          signal: input.signal,
        });
      } catch (err) {
        if (!isBlockedHttpCaptureError(err)) throw err;
        const blockedErr = err as WebCaptureError;
        const domain = (() => {
          try {
            return webDomainFromUrl(input.url);
          } catch {
            return null;
          }
        })();
        const hasSession = domain
          ? await getWebSessionState(ctx, domain)
              .then((s) => s !== null)
              .catch(() => false)
          : false;
        if (!hasSession || !domain) {
          throw new WebCaptureError(
            `${blockedErr.message}。可在「设置 → 网站登录保管库」登录该网站后重试(带登录态访问通常能过),或用 material.gather 换路检索同主题素材。`,
            { status: blockedErr.status ?? undefined },
          );
        }
        // 带登录态重试(池 context 满足 CaptureCapableContext:newPage + close=回写归还)。
        shot = await captureUrl(
          input.url,
          { fullPage: input.fullPage, signal: input.signal },
          {
            openContext: () =>
              openPooledReaderContext(ctx, domain) as never,
          },
        );
      }
      const name = `截图·${(shot.title || shot.finalUrl).slice(0, 40)}`;
      // [T-219] 铁律②:AI 写入需人确认。截图落 **pending** asset(素材库 list 按 active 过滤 →
      //   不显示、不进库),对话确认门卡「存入素材库」→ assets.commit 翻 active 才入库。
      //   [T-220] account 归属:ctx 现由 chat route 读 x-account-id 带当前号(见 route.ts),
      //   createGeneratedAsset 据 ctx.accountId stamp → 存量破图根因(NULL 号)在写侧治本。
      const asset = await assetsService.createGeneratedAsset(ctx, {
        assetType: "image",
        name,
        bytes: shot.bytes,
        mimeType: shot.contentType,
        pending: true,
      });
      // sourceUrl 存证:merge 进 asset 文件 mediaMetadata(与 asset-classify 的 aiDescription
      // 同一条 merge 路径,jsonb additive,不改 DB schema —— SPEC §2.2 来源存证)。best-effort:
      // 存证失败不回滚已落的截图字节(截图本身已是真产物)。
      await assetsService
        .mergeAiAnnotation(ctx, asset.id, { sourceUrl: input.url })
        .catch(() => {});
      let previewUrl: string | null = null;
      try {
        const dl = await assetsService.getDownloadUrl(ctx, asset.id);
        previewUrl = dl.url ?? null;
      } catch {
        previewUrl = null; // 换签名 URL 失败 → 卡渲占位,不阻断(asset 已落库)
      }
      return { assetId: asset.id, name: asset.name, previewUrl, sourceUrl: input.url };
    },
    // [T-217b/c] web.read 端口 —— launchPersistentContext(webAuthDirFor(domain)) 读正文 →
    //   createGeneratedAsset 落**逐字稿文本素材**(assetType document,text/plain,pending 走
    //   T-219 确认门,不自动入库)+ sourceUrl 存证(mergeAiAnnotation,同截图路径)。无会话/过期
    //   (WebReaderLoginRequiredError)→ 不落库,返回 { needLogin:true, domain } 供编导引导登录。
    readWebUrl: async (
      ctx: RequestContext,
      input: { url: string; signal?: AbortSignal },
    ) => {
      // [T-251] 重读同 URL 不重新抓取:先按 sourceUrl 反查已落库的 document asset(pending/active
      // 都算 —— pending = 已抓到全文只是用户还没点「存入素材库」),命中则直接读回其正文全文按窗
      // 返回(fromCache=true),不再开浏览器。查/读失败(极端:字节丢失)→ 静默回落真抓。
      try {
        const cached = await assetsService.findAssetBySourceUrl(ctx, input.url);
        if (cached) {
          const blob = await assetsService.getAssetBytes(ctx, cached.id);
          if (blob && blob.mimeType.startsWith("text/")) {
            const fullText = new TextDecoder().decode(blob.bytes);
            let previewUrl: string | null = null;
            try {
              const dl = await assetsService.getDownloadUrl(ctx, cached.id);
              previewUrl = dl.url ?? null;
            } catch {
              previewUrl = null;
            }
            return {
              needLogin: false as const,
              assetId: cached.id,
              name: cached.name,
              previewUrl,
              sourceUrl: input.url,
              title: cached.name.replace(/^正文·/, ""),
              excerpt: fullText.slice(0, 280),
              extractor: "cached",
              turnCount: null,
              extraction: `复用已存正文素材(未重新抓取;全文 ${fullText.length} 字,按窗读取)`,
              fullText,
              fromCache: true,
            };
          }
        }
      } catch (err) {
        // 缓存路是增强:任何失败都回落真抓,不阻断。
        console.warn("[chat-runtime] web.read 缓存反查失败,回落真抓:", err);
      }
      const domain = webDomainFromUrl(input.url);
      let read;
      try {
        // [T-239c] signal 透传进 readUrl:用户点「停止」→ 关带登录态浏览器提前退出(AbortError)。
        // [T-370b] 读取走 profile 池(域亲和 checkout + DB 登录态注入;authDir 仅作存量惰性
        //   迁移的旧目录定位,openContext 注入后不再直开该目录)。
        read = await readWebUrlSidecar(input.url, {
          authDir: webAuthDirFor(domain),
          signal: input.signal,
        }, {
          openContext: () => openPooledReaderContext(ctx, domain) as never,
        });
      } catch (err) {
        if (err instanceof WebReaderLoginRequiredError) {
          return { needLogin: true as const, domain: err.domain };
        }
        // [T-390] 素材搜集韧性:HTTP 被拒(403 反爬 / 404 下架 / 5xx)→ 不当场认输,多路搜索
        // (已配 search provider → 必应 → 百度,后两路免 key 浏览器采集)用原 URL 找「同一内容
        // 的替代来源」,结构化返回给编导挑一条再读。登录态第一次就带着(池注入),不重复重试;
        // 该域没登录过则在 message 里如实引导去保管库登录。全部搜不到 → alternates=[](诚实空)。
        if (
          err instanceof WebCaptureError &&
          err.status !== null &&
          err.status >= 400
        ) {
          const searchers: AlternateSearcher[] = [];
          const configured = await resolveSearchSpec(ctx).catch(() => null);
          if (
            configured &&
            configured.provider !== "rss" &&
            configured.provider !== "browser"
          ) {
            // 用户已配的真检索 provider(bocha/tavily/serpapi)优先。
            searchers.push((q, count) =>
              searchWebFn(configured, q, searchRegistry, { count }),
            );
          }
          const browserSpec = (baseUrl: string | null) => ({
            provider: "browser",
            baseUrl,
            model: "",
            token: "",
          });
          // 免 key 浏览器采集:必应(browser 适配器默认引擎)→ 百度(引擎感知解析)。
          searchers.push((q, count) =>
            searchWebFn(browserSpec(null), q, searchRegistry, { count }),
          );
          searchers.push((q, count) =>
            searchWebFn(
              browserSpec("https://www.baidu.com/s?wd={q}"),
              q,
              searchRegistry,
              { count },
            ),
          );
          const alternates = await findAlternatesViaSearch(
            input.url,
            searchers,
          ).catch(() => []);
          const hasSession = await getWebSessionState(ctx, domain)
            .then((s) => s !== null)
            .catch(() => false);
          return {
            blocked: true as const,
            status: err.status,
            message: hasSession
              ? err.message
              : `${err.message}(该站还没在「设置 → 网站登录保管库」登录过 —— 登录后重试,带登录态访问更容易通过)`,
            alternates,
          };
        }
        throw err; // 三墙其余分类(打不开/抽不出正文)原样上抛,工具 execute 转人话
      }
      const name = `正文·${(read.title || read.finalUrl).slice(0, 40)}`;
      const bytes = new TextEncoder().encode(read.text);
      // 逐字稿文本素材:assetType document(文本正文;非截图),pending 待确认(铁律②)。
      const asset = await assetsService.createGeneratedAsset(ctx, {
        assetType: "document",
        name,
        bytes,
        mimeType: "text/plain",
        pending: true,
      });
      await assetsService
        .mergeAiAnnotation(ctx, asset.id, { sourceUrl: input.url })
        .catch(() => {});
      let previewUrl: string | null = null;
      try {
        const dl = await assetsService.getDownloadUrl(ctx, asset.id);
        previewUrl = dl.url ?? null;
      } catch {
        previewUrl = null;
      }
      // [T-237] 抽取诊断人话:让编导如实报告「抽到 N 轮(SSR 全量 / DOM 可能不全)」,
      // 而不是把 DOM 截断误判成「分享页本来就短」。
      const extraction =
        read.turnCount != null
          ? read.extractPath === "ssr"
            ? `抽到 ${read.turnCount} 轮对话(SSR 全量,长对话不截断)`
            : `抽到 ${read.turnCount} 轮对话(DOM 渲染抽取,超长对话可能不全)`
          : null;
      return {
        needLogin: false as const,
        assetId: asset.id,
        name: asset.name,
        previewUrl,
        sourceUrl: input.url,
        title: read.title,
        excerpt: read.text.slice(0, 280),
        extractor: read.extractor,
        turnCount: read.turnCount,
        extraction,
        // [T-251] 全文透传 —— 工具 execute 侧按窗返回(首窗即含正文,不再只有 280 字 excerpt)。
        fullText: read.text,
        fromCache: false,
      };
    },
    // [T-386] 后台任务状态真值端口 —— aiService.listTasks(strict 按当前号)最新 30 条最小投影;
    // 类型筛选/时间窗/格式化在 chat-runner 装配层纯函数做(selectRecentChatTasks)。读失败上抛
    // 由 runner catch 成空(best-effort 增强不阻断对话)。
    listRecentTasks: async (ctx: RequestContext) => {
      const { rows } = await aiService.listTasks(ctx, { limit: 30, offset: 0 });
      return rows.map((r) => ({
        id: r.id,
        taskType: r.taskType,
        status: r.status,
        requestedAt: r.requestedAt,
        completedAt: r.completedAt ?? null,
        errorMessage: r.errorMessage ?? null,
      }));
    },
    // [T-253] local.read 端口 —— 编导读本机文件的全链:归一/realpath 穿越防护 → 敏感 denylist
    // 硬拒(授权之上,无论授权与否)→ 授权表(未授权 → needApproval 渲确认卡;授权经
    // /api/v1/local/read-grant 写入)→ 大小 1MB/二进制门 → 文本全文 or 目录清单。
    readLocalFile: async (
      ctx: RequestContext,
      input: { path: string; signal?: AbortSignal },
    ) => {
      const { homedir } = await import("node:os");
      const fsp = await import("node:fs/promises");
      const home = homedir();
      // [T-262] 文件名搜索兜底:精确路径解析不到(相对无法归一 / realpath miss)→ 提取 basename 在
      // **scoped 目录集**(用户「总是允许该目录」授权过的目录 + 常用目录 Desktop/Documents/ThirdSpace)
      // 按名搜同名文件(scoped 非全盘、守 denylist、限深度/结果数/节点数)。唯一命中 → nameMatch(走既有
      // 授权门读该真实路径);多命中 → nameCandidates(候选选择态);零命中 → null(调用方回落诚实
      // 「不存在」)。目标名本身敏感(passwd/.env/*key*…)→ 不搜(搜到也会被拒),直接回落。
      const nameSearchFallback = async (
        rawPath: string,
      ): Promise<
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
        | null
      > => {
        const wanted = localBasename(rawPath);
        if (!wanted || sensitivePathReason(wanted)) return null;
        const roots = [
          ...listLocalReadAlwaysDirs(ctx.userId),
          ...defaultSearchRoots(home),
        ];
        const searchFs: LocalSearchFs = {
          readdir: async (dir) => {
            const ds = await fsp.readdir(dir, { withFileTypes: true });
            return ds.map((d) => ({
              name: d.name,
              isDir: d.isDirectory(),
              isFile: d.isFile(),
              isSymlink: d.isSymbolicLink(),
            }));
          },
          fileSize: async (p) => {
            try {
              return Number((await fsp.stat(p)).size);
            } catch {
              return null;
            }
          },
        };
        const { items, truncated } = await searchLocalByBasename({
          roots,
          targetName: wanted,
          fs: searchFs,
          isSensitive: (p) => sensitivePathReason(p) != null,
        });
        if (items.length === 0) return null;
        if (items.length === 1) {
          const h = items[0]!;
          return {
            status: "nameMatch",
            requestedName: wanted,
            path: h.path,
            size: h.size,
            type: h.type,
          };
        }
        return { status: "nameCandidates", requestedName: wanted, items, truncated };
      };
      const normalized = normalizeLocalPath(input.path, home);
      if (!normalized) {
        // [T-262] 相对/无法归一 → 先按名搜兜底(basename 常仍可用,如 `scripts/xxx.md`→`xxx.md`)。
        const fb = await nameSearchFallback(input.path);
        if (fb) return fb;
        return {
          status: "denied" as const,
          path: input.path,
          reason:
            "路径必须是绝对路径(以 / 开头,或 ~ 开头的家目录路径)—— 相对路径无法确定基准;也没在你已授权/常用目录里找到同名文件。请给绝对路径,或直接把内容粘贴进来。",
        };
      }
      // 敏感硬门第一遍:对归一路径检查(realpath 之前就能挡住明着写的敏感路径)。
      const reason1 = sensitivePathReason(normalized);
      if (reason1) {
        return { status: "denied" as const, path: normalized, reason: reason1 };
      }
      // realpath 复检(symlink 防绕:软链把 ~/.ssh/id_rsa 伪装成 note.txt 也会被第二遍抓住)。
      let real: string;
      try {
        real = await fsp.realpath(normalized);
      } catch {
        // [T-262] 绝对路径不存在 → 按名搜兜底(唯一 nameMatch / 多命中 nameCandidates);零命中才诚实抛。
        const fb = await nameSearchFallback(normalized);
        if (fb) return fb;
        throw new Error(
          `路径不存在或不可访问:${normalized}(也没在你已授权/常用目录里找到同名文件「${localBasename(normalized)}」)`,
        );
      }
      const reason2 = sensitivePathReason(real);
      if (reason2) {
        return { status: "denied" as const, path: real, reason: reason2 };
      }
      const st = await fsp.stat(real);
      const isDir = st.isDirectory();
      // 授权表:未授权 → needApproval(前端渲「允许一次/总是允许该目录/拒绝」确认卡)。
      const grant = checkLocalReadGrant(ctx.userId, real);
      if (!grant) {
        return {
          status: "needApproval" as const,
          path: real,
          size: isDir ? null : Number(st.size),
          type: isDir
            ? "directory"
            : nodePath.extname(real).replace(/^\./, "") || "file",
        };
      }
      if (isDir) {
        // 目录 listing:名字 + 类型 + 大小(上限 MAX_LOCAL_DIR_ENTRIES 条,防超大目录炸上下文)。
        const dirents = await fsp.readdir(real, { withFileTypes: true });
        const entries: Array<{
          name: string;
          kind: "file" | "dir";
          size: number | null;
        }> = [];
        for (const d of dirents.slice(0, MAX_LOCAL_DIR_ENTRIES)) {
          let size: number | null = null;
          if (d.isFile()) {
            try {
              size = Number((await fsp.stat(nodePath.join(real, d.name))).size);
            } catch {
              size = null;
            }
          }
          entries.push({
            name: d.name,
            kind: d.isDirectory() ? "dir" : "file",
            size,
          });
        }
        if (grant === "once") consumeLocalReadOnceGrant(ctx.userId, real);
        return {
          status: "dir" as const,
          path: real,
          entries,
          total: dirents.length,
        };
      }
      // 文件:大小上限(1MB 文本)→ 二进制探测 → utf8 解码全文(窗口截断在工具 execute 侧)。
      if (Number(st.size) > MAX_LOCAL_READ_BYTES) {
        return {
          status: "denied" as const,
          path: real,
          reason: `文件 ${(Number(st.size) / 1024 / 1024).toFixed(1)}MB,超过本地读取上限 1MB —— 请裁剪后再读,或直接把它上传到素材库(素材上传支持到 20MB)。`,
        };
      }
      const bytes = await fsp.readFile(real);
      if (isProbablyBinary(new Uint8Array(bytes))) {
        return {
          status: "denied" as const,
          path: real,
          reason:
            "这是二进制文件(非文本),对话内读取只支持文本 —— 建议直接把它上传到素材库(图/视频/文档走既有上传链)。",
        };
      }
      if (grant === "once") consumeLocalReadOnceGrant(ctx.userId, real);
      return {
        status: "file" as const,
        path: real,
        name: nodePath.basename(real),
        fullText: bytes.toString("utf8"),
      };
    },
    // [T-263] local.read 授权**判定**(HITL 门用)—— 与 readLocalFile 的「执行读取」拆开:只跑
    // 「归一/realpath 穿越防护 → 敏感 denylist → 授权表查询」,**不读文件内容、不消费一次授权**
    // (真读时 readLocalFile 会再查一遍授权表并消费)。三态:
    //   denied      = 归一失败 / 敏感硬门(无论授权与否);
    //   needApproval = 路径已解析但未授权 → HITL 门返 'user-approval' 挂起弹卡;
    //   granted     = 已授权(免卡)**或路径尚无法解析**(realpath 失败等)→ 放行,让 readLocalFile
    //                 执行时按四态权威处理(不存在 → 它抛错转 error;不弹一张读不到的授权卡)。
    decideLocalReadAccess: async (
      ctx: RequestContext,
      input: { path: string },
    ) => {
      const { homedir } = await import("node:os");
      const fsp = await import("node:fs/promises");
      const normalized = normalizeLocalPath(input.path, homedir());
      if (!normalized) {
        // [T-262] 相对/无法归一的路径:不在判定期硬拒 —— 放行让 readLocalFile 执行时做文件名搜索兜底
        // (提取 basename 在授权/常用目录搜同名,搜到 → needApproval/候选卡;零命中 → 诚实回落)。
        // 安全不松:搜索 scoped 非全盘 + denylist 硬拒 + 搜到的路径读取仍走本授权门(真读时复检授权表)。
        return { status: "granted" as const };
      }
      const reason1 = sensitivePathReason(normalized);
      if (reason1) return { status: "denied" as const, reason: reason1 };
      // realpath 失败(不存在/不可访问)→ 不在判定期弹卡:交给 readLocalFile 执行时如实抛「不存在」。
      let real: string;
      try {
        real = await fsp.realpath(normalized);
      } catch {
        return { status: "granted" as const };
      }
      const reason2 = sensitivePathReason(real);
      if (reason2) return { status: "denied" as const, reason: reason2 };
      // 授权表:命中(once/dir)→ granted(免卡);未命中 → needApproval(HITL 挂起弹卡)。
      const grant = checkLocalReadGrant(ctx.userId, real);
      return grant
        ? { status: "granted" as const }
        : { status: "needApproval" as const };
    },
    // [T-256a] local.tools 端口 —— 探测系统已装工具。安全铁律:工具名一律来自 local-env-probe 白名单
    // 常量(resolveToolsToProbe 已把非法/非白名单请求过滤进 rejected),用**固定 arg 数组** execFile
    // 统一解析绝对路径后执行 `<absolute> --version`，绝不拼 shell 字符串。只读探测、不执行任意命令。
    detectTools: async (
      _ctx: RequestContext,
      input: { tools?: string[] },
    ) => {
      const { probe, rejected } = resolveToolsToProbe(input.tools);
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const run = promisify(execFile);
      const PROBE_TIMEOUT_MS = 3000;
      const tools = await Promise.all(
        probe.map(async (spec) => {
          let installed = false;
          let path: string | null = null;
          let version: string | null = null;
          // ① 统一路径解析：显式路径 → 随包 bin → PATH → 平台常见目录。
          // Finder/桌面快捷方式启动时 PATH 不含 Homebrew；Windows 也没有 `which`，不能再
          // 用 shell 命令当“是否安装”的真值。
          try {
            const found = resolveExecutablePath(spec.name, {
              explicitEnvVar:
                spec.name === "ffmpeg"
                  ? "CREATOROS_FFMPEG_PATH"
                  : spec.name === "ffprobe"
                    ? "CREATOROS_FFPROBE_PATH"
                    : undefined,
              bundled: spec.name === "ffmpeg" || spec.name === "ffprobe",
              preferredPaths:
                spec.name === "node" ? [process.execPath] : undefined,
            });
            if (found) {
              installed = true;
              path = found;
            }
          } catch {
            installed = false;
          }
          // ② 已装则读版本(<name> --version,argv;name 是白名单常量,安全)。拿不到版本仍算已装。
          if (installed) {
            try {
              const { stdout, stderr } = await run(path!, [...spec.versionArgs], {
                timeout: PROBE_TIMEOUT_MS,
                windowsHide: true,
              });
              version = parseToolVersion(stdout || stderr);
            } catch {
              version = null;
            }
          }
          return {
            name: spec.name,
            installed,
            path,
            version,
            purpose: spec.purpose,
            // 已装不冗余给安装引导;缺失才给(诚实引导)。
            installHint: installed ? null : spec.installHint,
          };
        }),
      );
      return { tools, rejected };
    },
    // [T-256a] local.workspace 端口 —— 列该用户「总是允许该目录」授权过的本地目录根。复用 T-253
    // 授权表(local-read-grants),不新建授权机制;目录内容仍走 readLocalFile 的 listing(不重造)。
    listAuthorizedDirs: async (ctx: RequestContext) => {
      return { dirs: listLocalReadAlwaysDirs(ctx.userId) };
    },
    // [T-084c] material.generate 端口 —— dispatch 既有 asset.generate task(经 ai transport
    // 的 ai.tasks.create,复用既有分派链 void runAssetGenerate;projectId 走 inputData,service
    // createTask 据它归属项目)。立即返回 taskId,不阻塞对话回合(视频异步分钟级)。
    dispatchGenerateAsset: async (
      ctx: RequestContext,
      input: { kind: "image" | "video"; prompt: string; projectId?: string | null },
    ) => {
      const res = await ai.request(
        // key = op 方法名 createAITask;其 .id === "ai.tasks.create"(ai transport 拦此 id 分派)。
        ENDPOINTS.createAITask,
        {
          params: undefined,
          query: undefined,
          body: {
            taskType: "asset.generate",
            attemptId: createAiTaskAttemptId(),
            inputData: {
              kind: input.kind,
              prompt: input.prompt,
              ...(input.projectId ? { projectId: input.projectId } : {}),
            },
          },
        },
        ctx,
      );
      const task = (res as { data?: { id?: unknown } }).data;
      const taskId = task && typeof task.id === "string" ? task.id : "";
      if (!taskId) {
        throw new Error("dispatchGenerateAsset: 起 asset.generate task 失败(无 taskId)");
      }
      return { taskId };
    },
    // [T-103b] review.script 端口 —— 起 script.review ai_task 复用稿面「审核」按钮的旧 trigger 链路
    // (reviewGateService.triggerReview:createTask 后由注入 AI 端口显式接 dispatchScriptReview 在后台
    // 跑 L1 违禁词 lint + L2 语义审 → saveReport)。立即返回 taskId,不阻塞对话回合(审核分钟内)。
    dispatchScriptReview: async (
      ctx: RequestContext,
      input: { projectId: string },
    ) => {
      // [T-277] 防「审核跑在整稿前 → 审到旧空稿」(用户实测:审核结论基于 25 字/2 版本的陈旧稿,
      //   编导自己都标注「审核跑在整稿前面是 bug」)。触发前两道诚实门:
      //   ① 整稿任务在飞:该项目有未终态的 script.draft 任务(queued/running/awaiting_confirmation)
      //      → 新整稿还没落地/待采纳,此刻审的是旧版本 → 拦下,让用户等整稿采纳后再审;
      //   ② 空/过短稿:当前 output_script 正文不足 → 没有可审内容 → 拦下,不白起审空稿的 task。
      //   两道门都抛友好错误 → review.script 工具 execute 接住 → ChatReviewReportCard 渲诚实提示。
      let draftInFlight = false;
      try {
        const { rows } = await aiService.listTasks(ctx, {
          limit: 20,
          offset: 0,
          projectId: input.projectId,
          taskType: "script.draft",
        });
        draftInFlight = rows.some(
          (t) => !["succeeded", "failed", "cancelled"].includes(t.status),
        );
      } catch {
        // 探测失败(极少)不阻断:宁可少拦一层,也不因探测异常挡住正常审核。
      }
      if (draftInFlight) {
        throw new Error(
          "整稿还在生成中或待采纳 —— 现在审核会审到旧版本。请等整稿候选卡出结果、点「采纳写入稿面」后再审核。",
        );
      }
      const currentScript = await makeReviewSubjectReader().getScript(
        ctx,
        input.projectId,
      );
      if (currentScript.trim().length < MIN_REVIEWABLE_SCRIPT_CHARS) {
        throw new Error(
          "当前项目还没有可审的整稿(稿面为空或太短)—— 先生成整稿并采纳写入稿面,再来审核,别审一份空稿。",
        );
      }
      const task = (await reviewGateService.triggerReview(
        ctx,
        input.projectId,
      )) as { id?: unknown } | null;
      const taskId = task && typeof task.id === "string" ? task.id : "";
      if (!taskId) {
        throw new Error("dispatchScriptReview: 起 script.review task 失败(无 taskId)");
      }
      return { taskId };
    },
    // [T-265] planning.thesis 端口 —— 复活孤儿 runPlanningThesis 的创建端(T-127 改路由时删了)。
    // 论点树 runner 要求 inputData.artifactId(采纳时 confirmTask 的 artifact_version 分支 append 新
    // ArtifactVersion 到该 thesis_tree artifact → 稿面「论点骨架」面板读回),故先 ensure 项目的
    // thesis_tree artifact(无则建,stage=planning),再经 ai transport 的 ai.tasks.create 起
    // planning.thesis task(inputData.projectId 让 service createTask 归属项目 → dispatch 分支
    // task.taskType==="planning.thesis" 触发 void runPlanningThesis)。立即返回 { taskId, projectId },
    // 不阻塞对话回合(论点树生成重、分钟级)。artifactsService 与本工厂同作用域(同 aiService 装配)。
    dispatchPlanningThesis: async (
      ctx: RequestContext,
      input: { projectId: string; topic?: string },
    ) => {
      // ensure thesis_tree artifact(读写同一目标:采纳 append 版本、面板读当前版本)。
      const arts = await artifactsService.listProjectArtifacts(ctx, input.projectId);
      const existing = arts.find((a) => a.artifactType === "thesis_tree");
      const artifactId =
        existing?.id ??
        (
          await artifactsService.createArtifact(ctx, {
            projectId: input.projectId,
            title: "论点树",
            artifactType: "thesis_tree",
            stage: "planning",
          })
        ).id;
      const res = await ai.request(
        // key = op 方法名 createAITask;其 .id === "ai.tasks.create"(ai transport 拦此 id 分派)。
        ENDPOINTS.createAITask,
        {
          params: undefined,
          query: undefined,
          body: {
            taskType: "planning.thesis",
            attemptId: createAiTaskAttemptId(),
            inputData: {
              artifactId,
              projectId: input.projectId,
              ...(input.topic ? { topic: input.topic } : {}),
            },
          },
        },
        ctx,
      );
      const task = (res as { data?: { id?: unknown } }).data;
      const taskId = task && typeof task.id === "string" ? task.id : "";
      if (!taskId) {
        throw new Error("dispatchPlanningThesis: 起 planning.thesis task 失败(无 taskId)");
      }
      return { taskId };
    },
    // [T-271] cover.generate 端口 —— dispatch 制作封面链 task(经 ai transport 的 ai.tasks.create →
    // dispatch 分支 task.taskType==="cover.generate" 触发 void runCoverGenerate)。projectId 走
    // inputData(service createTask 据它归属项目 → 采纳时既有 asset 采纳门把封面图绑进该项目用料链)。
    // 与 planning.thesis 不同:封面记 generated_asset 候选(非 artifact_version),故**不 ensure
    // artifact**(复用既有 asset 采纳门,无需 artifactId)。立即返回 { taskId },不阻塞对话回合。
    dispatchGenerateCover: async (
      ctx: RequestContext,
      // [T-380] referenceAssetId = 以图生图风格参考(素材库 asset id,走 inputData 透传;
      // cover-runner host 侧 getAssetBytes 读字节喂生图 adapter 的 image-to-image)。
      input: { projectId: string; topic?: string; referenceAssetId?: string },
    ) => {
      const res = await ai.request(
        // key = op 方法名 createAITask;其 .id === "ai.tasks.create"(ai transport 拦此 id 分派)。
        ENDPOINTS.createAITask,
        {
          params: undefined,
          query: undefined,
          body: {
            taskType: "cover.generate",
            attemptId: createAiTaskAttemptId(),
            inputData: {
              projectId: input.projectId,
              ...(input.topic ? { topic: input.topic } : {}),
              ...(input.referenceAssetId
                ? { referenceAssetId: input.referenceAssetId }
                : {}),
            },
          },
        },
        ctx,
      );
      const task = (res as { data?: { id?: unknown } }).data;
      const taskId = task && typeof task.id === "string" ? task.id : "";
      if (!taskId) {
        throw new Error("dispatchGenerateCover: 起 cover.generate task 失败(无 taskId)");
      }
      return { taskId };
    },
    dispatchDouyinShare: async (
      ctx: RequestContext,
      input: { shareInput: string; transcribe: boolean },
    ) => {
      const shareInput = input.shareInput.trim();
      const accountId = requireAccountId(
        ctx.accountId,
        "chat.douyin.share",
      );
      const fingerprint = createHash("sha256")
        .update(
          `${ctx.userId}\n${accountId}\n${
            input.transcribe ? "archive_and_transcribe" : "archive"
          }\n${shareInput}`,
        )
        .digest("hex");
      const { task } = await intelligenceService.enqueueDouyinShareImport(ctx, {
        collectionId: null,
        shareInput,
        idempotencyKey: `chat-douyin-share:${fingerprint}`,
        transcribeAfterImport: input.transcribe,
      });
      if (task.status === "queued") {
        void runDouyinShareImportTask(
          ctx,
          { taskId: task.id },
          shareImportRunnerDeps,
        ).catch((error) => {
          console.error(
            "[intelligence] Copilot 抖音分享任务启动失败:",
            error instanceof Error ? error.name : "UnknownError",
          );
        });
      }
      return { taskId: task.id, ownerId: task.ownerId };
    },
    // [T-268] script.draft 端口 —— 复活孤儿 runScriptDraft 的创建端(此前全仓无任何
    // createTask({taskType:'script.draft'}),runner 是死链;对话整稿 inline 同步跑必超时)。整稿
    // runner 要求 inputData.artifactId(采纳时 confirmTask 的 artifact_version 分支 append 新
    // ArtifactVersion 到该 output_script artifact → 稿面编辑器读回),故先 ensure 项目的
    // output_script/master_script artifact(无则建 output_script,stage=script),再经 ai transport
    // 的 ai.tasks.create 起 script.draft task(inputData.projectId 让 service createTask 归属项目 →
    // dispatch 分支 task.taskType==="script.draft" 触发 void runScriptDraft)。立即返回 { taskId },
    // 不阻塞对话回合(整稿重、分钟级)。artifactsService 与本工厂同作用域(同 aiService 装配)。
    dispatchScriptDraft: async (
      ctx: RequestContext,
      input: { projectId: string; topic?: string; angle?: string; extraBrief?: string },
    ) => {
      // ensure output_script artifact(读写同一目标:采纳 append 版本、稿面编辑器读当前版本)。
      // 与前端 ensureScriptArtifact / 读侧 resolveScriptArtifactIdFromDb 同口径:优先复用已有
      // output_script,其次 master_script,都没有才建 output_script(读写同一目标)。
      const arts = await artifactsService.listProjectArtifacts(ctx, input.projectId);
      const scriptArts = arts.filter((a) => a.stage === "script");
      const existing =
        scriptArts.find((a) => a.artifactType === "output_script") ??
        scriptArts.find((a) => a.artifactType === "master_script");
      const artifactId =
        existing?.id ??
        (
          await artifactsService.createArtifact(ctx, {
            projectId: input.projectId,
            title: "分镜脚本",
            artifactType: "output_script",
            stage: "script",
          })
        ).id;
      const res = await ai.request(
        // key = op 方法名 createAITask;其 .id === "ai.tasks.create"(ai transport 拦此 id 分派)。
        ENDPOINTS.createAITask,
        {
          params: undefined,
          query: undefined,
          body: {
            taskType: "script.draft",
            attemptId: createAiTaskAttemptId(),
            inputData: {
              artifactId,
              projectId: input.projectId,
              ...(input.topic ? { topic: input.topic } : {}),
              ...(input.angle ? { angle: input.angle } : {}),
              ...(input.extraBrief ? { extraBrief: input.extraBrief } : {}),
            },
          },
        },
        ctx,
      );
      const task = (res as { data?: { id?: unknown } }).data;
      const taskId = task && typeof task.id === "string" ? task.id : "";
      if (!taskId) {
        throw new Error("dispatchScriptDraft: 起 script.draft task 失败(无 taskId)");
      }
      return { taskId };
    },
    // [T-350a] publish.package 端口 —— 稿面「生成发布物料」:复用既有 publish.platform_adapt runner
    // (platform.adapt 模板已内嵌 cheat-package 发布审核 SOP),**单平台抖音**。
    //   ① 空稿诚实门:当前整稿为空/过短 → 抛友好错误(同 dispatchScriptReview 口径,不生成空物料);
    //   ② ensure 内容产出挂点 outputId(采纳时 createPublicationFromDraft 在其下铸真 Publication;
    //      无产出行 → 抛错,理论上项目建时即建首个 output);
    //   ③ createTask(taskType publish.platform_adapt,inputData.{outputId,scriptText,platforms:["douyin"],
    //      topic,projectId})→ live dispatch 分支触发 runPlatformAdapt,立即返回 taskId。
    dispatchPublishPackage: async (
      ctx: RequestContext,
      input: { projectId: string; topic?: string },
    ) => {
      const currentScript = await makeReviewSubjectReader().getScript(
        ctx,
        input.projectId,
      );
      if (currentScript.trim().length < MIN_REVIEWABLE_SCRIPT_CHARS) {
        throw new Error(
          "当前项目还没有可用的整稿(稿面为空或太短)—— 先生成整稿并采纳写入稿面,再来生成发布物料,别给空稿打包。",
        );
      }
      const outputIds = await projectsService.listOutputIdsByProject(
        ctx,
        input.projectId,
      );
      const outputId = outputIds[0];
      if (!outputId) {
        throw new Error(
          "dispatchPublishPackage: 项目还没有内容产出挂点(outputId)—— 无法铸发布物料。",
        );
      }
      const res = await ai.request(
        ENDPOINTS.createAITask,
        {
          params: undefined,
          query: undefined,
          body: {
            taskType: "publish.platform_adapt",
            attemptId: createAiTaskAttemptId(),
            inputData: {
              outputId,
              scriptText: currentScript,
              // [T-350a] 稿面聚焦单平台抖音(不给模型选平台;多平台走发布中心既有全平台链)。
              platforms: ["douyin"],
              projectId: input.projectId,
              ...(input.topic ? { topic: input.topic } : {}),
            },
          },
        },
        ctx,
      );
      const task = (res as { data?: { id?: unknown } }).data;
      const taskId = task && typeof task.id === "string" ? task.id : "";
      if (!taskId) {
        throw new Error(
          "dispatchPublishPackage: 起 publish.platform_adapt task 失败(无 taskId)",
        );
      }
      return { taskId };
    },
    // [T-385] project.transcribe 端口 —— 直调 T-374 的 projectsWithTranscribe 拦截链(单一真值:
    // 属主门/抖音锚解析/排 transcribe.douyin 全在 wrap 里,这里不复述)。无锚 ValidationError
    // 人话文案原样抛出 → chat-runner catch 转工具 error 卡渲。
    dispatchProjectTranscribe: async (
      ctx: RequestContext,
      input: { projectId: string },
    ) => {
      const res = await projectsWithTranscribe.request(
        ENDPOINTS.transcribeProjectWork,
        {
          params: { projectId: input.projectId },
          query: undefined,
          body: { attemptId: createAiTaskAttemptId() },
        },
        ctx,
      );
      const data = (res as { data?: { taskId?: unknown } }).data;
      const taskId = data && typeof data.taskId === "string" ? data.taskId : "";
      if (!taskId) {
        throw new Error(
          "dispatchProjectTranscribe: 起 transcribe.douyin task 失败(无 taskId)",
        );
      }
      return { taskId };
    },
  };

  return {
    projects: projectsWithTranscribe, // wrap:透传 CRUD + 拦 projects.transcribe(T-374)
    taxonomy,
    notifications,
    search,
    settings: settingsWithModelTest, // wrap:透传 CRUD + 拦 settings.models.test(T-377)
    knowledge,
    assets,
    artifacts,
    production,
    publishing,
    analytics,
    ingestion,
    reviews,
    reviewGate,
    learnings,
    ai,
    execution,
    intelligence,
    positioning,
    candidate,
    calibration,
    platformAccount,
    scheduling: schedulingWithRunNow, // wrap:透传 CRUD + 拦 scheduledJobs.runNow(D5)
    contentCalendar,
    materialLinks,
    benchmark: benchmarkWithTranscribe, // wrap:透传 CRUD + 拦 benchmark.works.transcribe(T-349)
    trendSources,
    favoritesFolders,
    topicAttribution,
    queryServices,
    publishingCenter,
    identity,
    platformAccountService,
    settingsService,
    activationService,
    chatRuntime,
    localFileRuntime,
    knowledgeSearchRuntime,
    webSessionRuntime,
  };
}

// [T-326 ENG-H02] `next build` 绝不允许触碰持久层。build(预渲染/收集页面数据)是产编译
// 产物的阶段,不是运行时 —— 而 buildPersistence() 一旦执行就会:建 DB 连接 + 跑迁移、seed
// canonical user/课程 + 回填 tag、sweep 僵尸 job_run/ai_task/沙箱、解析 master key(无 keychain
// 即降级告警)、startScheduler 起 node-cron(审计实录:普通 web build 日志已出现上述全部副作
// 用;且多个预渲染 worker 进程并发各建一个连接,还违反 PGlite 单写者)。
//
// 信号选择:`process.env.NEXT_PHASE === "phase-production-build"`。依据(Next 16.2.9 实查):
//   - build 主进程在 `next/dist/build/index.js` 里显式 `process.env.NEXT_PHASE =
//     PHASE_PRODUCTION_BUILD`,预渲染 worker 继承该 env;
//   - Next 自己的运行时代码(`server/web/globals.js`、`server/lib/router-utils/
//     instrumentation-globals.external.js`)判 build 阶段用的正是同一字符串 —— 官方语义信号,
//     非私约猜测。运行时(next dev / next start / 桌面 sidecar)NEXT_PHASE 不为该值,行为不变。
//
// 守卫落点 = 组合根**唯一入口** getBundle():所有 transport/service getter(getProjects/
// getIdentityService/getChatRuntime/…)都经它,buildPersistence 里的 createConfiguredDb/
// seed/sweep/startScheduler 因此一个都不会执行 —— 不是只挡一半。同步 throw(先于单例缓存
// 赋值),不会把 rejected promise 钉进 globalThis。
export class PersistenceUnavailableDuringBuildError extends Error {
  constructor() {
    super(
      "PersistenceUnavailableDuringBuildError: next build(phase-production-build)阶段" +
        "禁止初始化持久层(DB 连接/seed/sweep/cron 都是运行时副作用)。预渲染页面不应读取" +
        "持久层数据;该数据属于请求期动态渲染。",
    );
    this.name = "PersistenceUnavailableDuringBuildError";
  }
}

function getBundle(): Promise<PersistenceBundle> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    throw new PersistenceUnavailableDuringBuildError();
  }
  if (!globalForPersistence.__creatorosPersistence) {
    globalForPersistence.__creatorosPersistence = buildPersistence();
  }
  return globalForPersistence.__creatorosPersistence;
}

async function getProjects(): Promise<Transport> {
  return (await getBundle()).projects;
}

async function getTaxonomy(): Promise<Transport> {
  return (await getBundle()).taxonomy;
}

async function getNotifications(): Promise<Transport> {
  return (await getBundle()).notifications;
}

async function getSearch(): Promise<Transport> {
  return (await getBundle()).search;
}

async function getKnowledge(): Promise<Transport> {
  return (await getBundle()).knowledge;
}

async function getAssets(): Promise<Transport> {
  return (await getBundle()).assets;
}

async function getArtifacts(): Promise<Transport> {
  return (await getBundle()).artifacts;
}

async function getProduction(): Promise<Transport> {
  return (await getBundle()).production;
}

async function getPublishing(): Promise<Transport> {
  return (await getBundle()).publishing;
}

async function getAnalytics(): Promise<Transport> {
  return (await getBundle()).analytics;
}

async function getIngestion(): Promise<Transport> {
  return (await getBundle()).ingestion;
}

async function getReviews(): Promise<Transport> {
  return (await getBundle()).reviews;
}

async function getReviewGate(): Promise<Transport> {
  return (await getBundle()).reviewGate;
}

async function getLearnings(): Promise<Transport> {
  return (await getBundle()).learnings;
}

async function getAi(): Promise<Transport> {
  return (await getBundle()).ai;
}

// [T-255a] 执行层 transport 取用(execution.tasks.*)。
async function getExecution(): Promise<Transport> {
  return (await getBundle()).execution;
}

async function getIntelligence(): Promise<Transport> {
  return (await getBundle()).intelligence;
}

async function getPositioning(): Promise<Transport> {
  return (await getBundle()).positioning;
}

async function getCandidate(): Promise<Transport> {
  return (await getBundle()).candidate;
}

async function getCalibration(): Promise<Transport> {
  return (await getBundle()).calibration;
}

async function getPlatformAccount(): Promise<Transport> {
  return (await getBundle()).platformAccount;
}

async function getScheduling(): Promise<Transport> {
  return (await getBundle()).scheduling;
}

async function getContentCalendar(): Promise<Transport> {
  return (await getBundle()).contentCalendar;
}

async function getMaterialLinks(): Promise<Transport> {
  return (await getBundle()).materialLinks;
}

// [T-212a] 对标源 CRUD transport 访问器。
async function getBenchmark(): Promise<Transport> {
  return (await getBundle()).benchmark;
}

// [T-235b] 热点信源 CRUD transport 访问器。
async function getTrendSources(): Promise<Transport> {
  return (await getBundle()).trendSources;
}

// [T-235c] 指定收藏夹登记 CRUD transport 访问器。
async function getFavoritesFolders(): Promise<Transport> {
  return (await getBundle()).favoritesFolders;
}

// [T-235d] 选题归因只读 transport 访问器。
async function getTopicAttribution(): Promise<Transport> {
  return (await getBundle()).topicAttribution;
}

async function getQueryServices(): Promise<Transport> {
  return (await getBundle()).queryServices;
}

/**
 * The Publishing Center composer (module Q). It has NO dispatch endpoint (SPEC §13
 * has no read path; contract/src/operations/pages.ts:7-10) — the Server Component
 * for `/publishing` calls this server-side to compose `publishingCenterPage` from
 * public services only (touching no repository). Bound to the same pglite store.
 */
export async function getPublishingCenterService(): Promise<PublishingCenterQueryService> {
  return (await getBundle()).publishingCenter;
}

/**
 * The shared identity service, bound to the same pglite store as the composite
 * transport. The dispatch route + the three auth routes (Task 9) resolve ctx /
 * mint sessions / read the current user through this — never the db client
 * directly (SPEC §22). Routes go through identity.service or compositeTransport.
 */
export async function getIdentityService(): Promise<IdentityService> {
  return (await getBundle()).identity;
}

/**
 * T-147 P5 — 一机一码激活门 service。(creator)/layout gate(RSC)+ /activate 激活页
 * (server action)经此直调 check()/activate();无 dispatch endpoint(同 identity 逃生口)。
 * web/dev 门控前置 isDesktopRuntime 判 false 直接放行,不 check。
 */
export async function getActivationService(): Promise<ActivationService> {
  return (await getBundle()).activationService;
}

/**
 * [T-363] settings service 逃生口(同 identity/activation 姿态:无 dispatch endpoint 的
 * route 直调 service)。模型配置导出/导入 route(/api/v1/settings-transfer/models)用它
 * 走 exportModelConfigs / importModelConfigs —— 导出含密钥密文,绝不能过公开 DTO
 * (listModels 把 secret 掩码成 hasSecret),故不走契约 op。
 */
export async function getSettingsService(): Promise<SettingsService> {
  return (await getBundle()).settingsService;
}

/**
 * [T-136 切片 a] platform-account service,bound to the same pglite store。
 * `resolveRequestContext` 用它对 x-account-id header 做属主硬校验(gate BLOCKER-1):
 * getAccount(ctx, accountId) 在 ctx.userId 域内查号,不属主 / 不存在 → OwnershipError,
 * 调用侧据此把 accountId 降级为 null(防伪造 header 越权穿透 per-account repo 门)。
 * 与 getIdentityService 同款「无 dispatch endpoint 的 route 直调服务」逃生口。
 */
export async function getPlatformAccountService(): Promise<PlatformAccountService> {
  return (await getBundle()).platformAccountService;
}

/**
 * item B — resolve the request user's absolute media root. The blob route
 * (/api/v1/blob/[...key]) has no dispatch endpoint, so it resolves ctx from the
 * session cookie and calls this to learn WHERE on disk to read/write bytes — the
 * same root the local-fs adapter minted the upload URL against. Bound to the same
 * pglite store as the composite transport.
 */
export async function getStorageRootForRequest(
  ctx: RequestContext,
): Promise<string> {
  const { settingsService } = await getBundle();
  return settingsService.resolveStorageRoot(ctx);
}

/**
 * T-004 ChatBox — the /api/chat route's runtime (aiService + resolveModelSpec + bound
 * CreativeContext readers), bound to the same pglite store as the composite transport.
 * The route streams via the Vercel AI SDK (not the RPC envelope), so it resolves ctx from
 * the session cookie and assembles + persists a turn through this — never the db client
 * directly (SPEC §22). Mirrors getStorageRootForRequest's escape hatch for endpoint-less routes.
 */
export async function getChatRuntime(): Promise<ChatRuntime> {
  return (await getBundle()).chatRuntime;
}

/**
 * [T-055d] Finder / 本地文件 route 的运行时(assetId→storageKey / projectId→目录),
 * 与 getStorageRootForRequest 同款 escape hatch 模式。
 */
export async function getLocalFileRuntime(): Promise<
  PersistenceBundle["localFileRuntime"]
> {
  return (await getBundle()).localFileRuntime;
}

/**
 * [T-093] 知识库 AI 搜索运行时(/api/knowledge/search 消费),与 getChatRuntime 同款
 * escape hatch:embedding 走 model-config capability "knowledge.search.embed"(用户可配,
 * 只认专配行,不回退 default 聊天模型);未配 → 纯关键词诚实降级。
 */
export async function getKnowledgeSearchRuntime(): Promise<
  PersistenceBundle["knowledgeSearchRuntime"]
> {
  return (await getBundle()).knowledgeSearchRuntime;
}

/**
 * [T-217a] Web Session Vault 运行时(/api/web-session 消费),与 getLocalFileRuntime 同款
 * escape hatch:登录态保管库无 DB 层(sidecar 浏览器 + `.auth/web/` 文件系统,per-machine 全局),
 * 故不走 dispatch 契约 transport,由专用 route 直调本 runtime。
 */
export async function getWebSessionRuntime(): Promise<
  PersistenceBundle["webSessionRuntime"]
> {
  return (await getBundle()).webSessionRuntime;
}

// Composite server transport: persistence for project ops, mock for the rest.
// Used by BOTH the server pages (contract-client.server) and the /api/v1 route,
// so server reads and island writes share one pglite store — island mutations
// persist and a router.refresh() reflects them.
export const compositeTransport: Transport = {
  async request(endpoint: Endpoint, input, ctx) {
    // Non-persisted (mock) ops ignore ctx — the deterministic mock store is not
    // user-scoped, and the browser typed client / static pages carry no ctx.
    if (!PERSISTED_OPS.has(endpoint.id)) {
      return mockTransport.request(endpoint, input, ctx);
    }
    // Taxonomy ops (module 04) are served by the module's own transport over
    // the SAME pglite store. Routed before the projects persistence transport so
    // each module owns its op ids (foundation §1 module registry).
    if (TAXONOMY_OPS.has(endpoint.id)) {
      const taxonomy = await getTaxonomy();
      return taxonomy.request(endpoint, input, ctx);
    }
    // Notifications ops (module 01) are served by the module's own transport over
    // the SAME pglite store. Each module owns its op ids (foundation §1 registry).
    if (NOTIFICATION_OPS.has(endpoint.id)) {
      const notifications = await getNotifications();
      return notifications.request(endpoint, input, ctx);
    }
    // Search ops (module 02) — the composed `pages.search.get` read served by the
    // module's own transport over the SAME pglite store (foundation §1 registry).
    if (SEARCH_OPS.has(endpoint.id)) {
      const search = await getSearch();
      return search.request(endpoint, input, ctx);
    }
    // Settings ops (module 03) — account read + preference/model/agent mutations
    // served by the module's own transport over the SAME pglite store (foundation
    // §1 registry).
    if (SETTINGS_OPS.has(endpoint.id)) {
      const bundle = await getBundle();
      return bundle.settings.request(endpoint, input, ctx);
    }
    // Knowledge ops (module 06) — list/create/get + revisions.create +
    // relations.create served by the module's own user-scoped transport over the
    // SAME pglite store (foundation §1 registry). No ctx ⇒ AuthenticationError.
    if (KNOWLEDGE_OPS.has(endpoint.id)) {
      const knowledge = await getKnowledge();
      return knowledge.request(endpoint, input, ctx);
    }
    // Assets ops (module 07) — list/get + two-phase upload + files.create +
    // trash/restore served by the module's own user-scoped transport over the
    // SAME pglite store (foundation §1 registry). No ctx ⇒ AuthenticationError.
    if (ASSET_OPS.has(endpoint.id)) {
      const assets = await getAssets();
      return assets.request(endpoint, input, ctx);
    }
    // Artifacts ops (module 08) — list/create/get + versions.create/list +
    // restore + relations.create served by the module's own user-scoped transport
    // over the SAME pglite store (foundation §1 registry). No ctx ⇒
    // AuthenticationError.
    if (ARTIFACT_OPS.has(endpoint.id)) {
      const artifacts = await getArtifacts();
      return artifacts.request(endpoint, input, ctx);
    }
    // Production ops (module 09) — get/put production + segments.create + exports
    // create/complete served by the module's own user-scoped transport over the
    // SAME pglite store (foundation §1 registry). completeExport's cross-module
    // fan-out runs inside the service via injected public peer services. No ctx ⇒
    // AuthenticationError.
    if (PRODUCTION_OPS.has(endpoint.id)) {
      const production = await getProduction();
      return production.request(endpoint, input, ctx);
    }
    // Publishing ops (module 10) — list/create/get publications + revisions.create
    // + transition served by the module's own user-scoped transport over the SAME
    // pglite store (foundation §1 registry). The transition publish/remove
    // side-effect runs inside the service via the MockPublisher seam; the
    // cross-module fan-out reaches peers via injected public services. No ctx ⇒
    // AuthenticationError.
    if (PUBLISHING_OPS.has(endpoint.id)) {
      const publishing = await getPublishing();
      return publishing.request(endpoint, input, ctx);
    }
    // Analytics ops (module 11) — analytics.publications.get / analytics.projects.get
    // served by the module's own user-scoped transport over the SAME pglite store
    // (foundation §1 registry). The project→publication ownership resolve runs
    // inside the service via the injected Publishing public seam. No ctx ⇒
    // AuthenticationError.
    if (ANALYTICS_OPS.has(endpoint.id)) {
      const analytics = await getAnalytics();
      return analytics.request(endpoint, input, ctx);
    }
    // Ingestion ops (module 12) — the 7 batch-push run ops served by the module's
    // own user-scoped transport over the SAME pglite store (foundation §1 registry).
    // The fan-out to peer modules runs inside the service via injected public Service
    // ports (no repo import). No ctx ⇒ AuthenticationError.
    if (INGESTION_OPS.has(endpoint.id)) {
      const ingestion = await getIngestion();
      return ingestion.request(endpoint, input, ctx);
    }
    // Reviews ops (module 13) — reviews.create/get + reviews.insights.create +
    // reviews.complete served by the module's own user-scoped transport over the
    // SAME pglite store (foundation §1 registry). Period/evidence derivation +
    // ownership gates run inside the service via injected public peer ports. No ctx
    // ⇒ AuthenticationError.
    if (REVIEWS_OPS.has(endpoint.id)) {
      const reviews = await getReviews();
      return reviews.request(endpoint, input, ctx);
    }
    // T-086 审核门 ops(reviewRules.* + scriptReviews.*)—— 规则库 CRUD + 稿面审核
    // 报告读/触发,走本模块 user-scoped transport(同一 pglite store)。scriptReviews.trigger
    // 起 script.review ai_task,dispatch 后台跑 L1+L2。No ctx ⇒ AuthenticationError。
    if (REVIEW_GATE_OPS.has(endpoint.id)) {
      const reviewGate = await getReviewGate();
      return reviewGate.request(endpoint, input, ctx);
    }
    // Learnings ops (module 14) — learnings.list/create + learnings.applications.create
    // + learnings.evaluate served by the module's own user-scoped transport over the
    // SAME pglite store (foundation §1 registry). The §12 validationStatus machine +
    // apply-target ownership/activity run inside the service via the injected Projects
    // port. No ctx ⇒ AuthenticationError.
    if (LEARNINGS_OPS.has(endpoint.id)) {
      const learnings = await getLearnings();
      return learnings.request(endpoint, input, ctx);
    }
    // AI ops (module 15) — conversations list/create + messages.create + tasks
    // create/confirm/cancel served by the module's own user-scoped transport over the
    // SAME pglite store (foundation §1 registry). The §12 AI Task state machine +
    // candidate→confirm formalize (through the injected Artifacts service) run inside the
    // service; the Agent SDK runs only in @creatoros/ai-worker. No ctx ⇒
    // AuthenticationError.
    if (AI_OPS.has(endpoint.id)) {
      const ai = await getAi();
      return ai.request(endpoint, input, ctx);
    }
    // [T-255a] Execution ops — execution.tasks create/list/get/confirm/discard served
    // by the module's own transport(存储复用 ai_tasks,taskType `exec.*`)。create 后
    // composition 层 fire-and-forget runExecutionTask(沙箱→物化→executor→收割 manifest
    // →awaiting_confirmation);confirm 采纳产物入资产库(铁律②),discard 中止+清沙箱。
    // No ctx ⇒ AuthenticationError.
    if (EXECUTION_OPS.has(endpoint.id)) {
      const execution = await getExecution();
      return execution.request(endpoint, input, ctx);
    }
    // T-482 内容雷达：分类/来源/运行/作品/手动转写均走真实 DB；不回退 mock，
    // 防止界面显示“成功”但实际没有入库。
    if (INTELLIGENCE_OPS.has(endpoint.id)) {
      const intelligence = await getIntelligence();
      return intelligence.request(endpoint, input, ctx);
    }
    // Positioning ops (module 17, Wave 5) — profile get/upsert + statements
    // list/create/get + gate.evaluate + pages.positioning.get served by the module's
    // own user-scoped transport over the SAME pglite store (foundation §1 registry).
    // The append-only version chain + deterministic advisory gate run inside the
    // service; the gate's project subject reaches Projects via the injected port. No
    // ctx ⇒ AuthenticationError.
    if (POSITIONING_OPS.has(endpoint.id)) {
      const positioning = await getPositioning();
      return positioning.request(endpoint, input, ctx);
    }
    // [T-052 裁决③] Monetization ops 分发分支已随变现中心物理删除(宪法 §8)。
    // Candidate ops (module 19, Wave 5) — candidates.list/create/get/patch/promote +
    // audienceSignals.list/linkToCandidate served by the module's own user-scoped
    // transport over the SAME pglite store (foundation §1 registry). The lightweight
    // pool + promote → Project + demand_count aggregation run inside the service;
    // AI-sourced candidates arrive via createFromAIResult (C-3) and signal writes ride
    // Ingestion (C-4) — neither is a contract op here. No ctx ⇒ AuthenticationError.
    if (CANDIDATE_OPS.has(endpoint.id)) {
      const candidate = await getCandidate();
      return candidate.request(endpoint, input, ctx);
    }
    // Calibration ops (module 20, Wave 5–7) — rubrics.create/bumpVersion/get +
    // predictions.create/lock/get/list + results.create + overview (校准中心总览) served by
    // the module's own user-scoped transport over the SAME pglite store (registry). The
    // immutable lock + append-only RubricVersion + §C-4/RISK-005 run guard run inside
    // the service; the IngestionRun existence + §6.3 Learnings feedback reach peers via
    // injected ports. No ctx ⇒ AuthenticationError.
    if (CALIBRATION_OPS.has(endpoint.id)) {
      const calibration = await getCalibration();
      return calibration.request(endpoint, input, ctx);
    }
    // PlatformAccount ops (module 21, Wave 5–7) — accounts.list/create/get/update/
    // archive served by the module's own user-scoped transport over the SAME pglite
    // store (foundation §1 registry). 矩阵号 registry + the assertOwnedAccount binding
    // guard run inside the service; no peer fan-out (pure local records). No ctx ⇒
    // AuthenticationError.
    if (PLATFORM_ACCOUNT_OPS.has(endpoint.id)) {
      const platformAccount = await getPlatformAccount();
      return platformAccount.request(endpoint, input, ctx);
    }
    // Scheduling ops (module 23, T-007) — scheduledJobs.create/list/get/update/setEnabled
    // + jobRuns.listByJob/get served by the module's own user-scoped transport over the
    // SAME pglite store (foundation §1 registry). owned-root, job_run 经 requireJob
    // ownership gate;pure local records, no peer fan-out. No ctx ⇒ AuthenticationError.
    if (SCHEDULING_OPS.has(endpoint.id)) {
      const scheduling = await getScheduling();
      return scheduling.request(endpoint, input, ctx);
    }
    // ContentCalendar ops (module 22, Wave 5–7) — accounts.calendar.list/.entries.create
    // + calendar.entries.update/transition/delete + accounts.cadence.get/upsert/
    // attainment served by the module's own user-scoped transport over the SAME pglite
    // store (foundation §1 registry). The §7.2 state machine + 达成率/断更 reconcile run
    // inside the service; account ownership is gated via the injected
    // PlatformAccountService port (no cross-module repo import). No ctx ⇒
    // AuthenticationError.
    if (CONTENT_CALENDAR_OPS.has(endpoint.id)) {
      const contentCalendar = await getContentCalendar();
      return contentCalendar.request(endpoint, input, ctx);
    }
    // MaterialLinks ops (Plan A4) — materialLinks.list/create/delete served by the
    // module's own user-scoped transport over the SAME pglite store (foundation §1
    // registry). The 料库⇄创作 用料链 edge; delete is ownership-gated (cross-user →
    // OwnershipError → 404). No peer fan-out (pure local records). No ctx ⇒
    // AuthenticationError.
    if (MATERIAL_LINKS_OPS.has(endpoint.id)) {
      const materialLinks = await getMaterialLinks();
      return materialLinks.request(endpoint, input, ctx);
    }
    // [T-212a] Benchmark 对标源 CRUD(选题/对标强化)—— 4 ops(list/create/toggle/remove)由模块
    // 自有 user/account-scoped transport 服务,同一 pglite store。toggle/remove ownership-gated
    // (跨用户 → OwnershipError → 404)。No ctx ⇒ AuthenticationError。
    if (BENCHMARK_OPS.has(endpoint.id)) {
      const benchmark = await getBenchmark();
      return benchmark.request(endpoint, input, ctx);
    }
    // [T-235b] 热点信源 CRUD(热点多源证据)—— 4 ops(list/create/toggle/remove)由模块自有
    // user/account-scoped transport 服务,同一 pglite store。toggle/remove ownership-gated
    // (跨用户 → OwnershipError → 404)。No ctx ⇒ AuthenticationError。
    if (TREND_SOURCES_OPS.has(endpoint.id)) {
      const trendSources = await getTrendSources();
      return trendSources.request(endpoint, input, ctx);
    }
    // [T-235c] 指定收藏夹登记 CRUD(收藏夹跟拍信号源)—— 4 ops(list/create/toggle/remove)由模块
    // 自有 user/account-scoped transport 服务,同一 pglite store。toggle/remove ownership-gated
    // (跨用户 → OwnershipError → 404)。No ctx ⇒ AuthenticationError。
    if (FAVORITES_OPS.has(endpoint.id)) {
      const favoritesFolders = await getFavoritesFolders();
      return favoritesFolders.request(endpoint, input, ctx);
    }
    // [T-235d] 选题归因只读(正向归因回流)—— topics.attributions.list 由模块自有
    // user/account-scoped transport 服务,同一 pglite store。No ctx ⇒ AuthenticationError。
    if (TOPIC_ATTRIBUTION_OPS.has(endpoint.id)) {
      const topicAttribution = await getTopicAttribution();
      return topicAttribution.request(endpoint, input, ctx);
    }
    // Query-services ops (module Q, Wave 4) — the 3 page-composition reads
    // (pages.dashboard.get / pages.projectOverview.get / pages.search.get) served by
    // the module's own transport, composing public upstream services (SPEC §19). This
    // TAKES OVER pages.search.get from the Search interim composer (foundation §6) —
    // checked before SEARCH_OPS (now empty) so exactly one handler owns it. No ctx ⇒
    // AuthenticationError.
    if (QUERY_SERVICES_OPS.has(endpoint.id)) {
      const queryServices = await getQueryServices();
      return queryServices.request(endpoint, input, ctx);
    }
    // Projects ops (module 05) — all 15 "项目与流程" ops served by the module's
    // own user-scoped transport over the SAME pglite store (foundation §1
    // registry). No ctx ⇒ the transport throws AuthenticationError (→401).
    if (PROJECT_OPS.has(endpoint.id)) {
      const projects = await getProjects();
      try {
        return await projects.request(endpoint, input, ctx);
      } catch (err) {
        if (err instanceof UnsupportedOperationError) {
          return mockTransport.request(endpoint, input, ctx);
        }
        throw err;
      }
    }
    // Any other persisted op id with no owning module falls back to the mock.
    return mockTransport.request(endpoint, input, ctx);
  },
};

// Test hook: drop the pglite singleton so each test starts from a fresh seed.
export function __resetPersistenceForTests(): void {
  globalForPersistence.__creatorosPersistence = undefined;
}
