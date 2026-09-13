import {createOperationsSyncCollector} from '@creatoros/backend/application/collection/operations-sync';
import {startTrafficCollection} from "@creatoros/backend/application/scheduling/traffic-start";
import { recoverTrafficQueues } from "@creatoros/backend/application/scheduling/traffic-wake";
import {triggerScheduledJob} from '@creatoros/backend/modules/ai-runtime';
import {createTrafficCollector} from '@creatoros/backend/application/collection/traffic';
import { readProjectListCoverIds } from "@creatoros/backend/application/queries/project-list-covers";
import { resolveImportedPublicationIdsInBatch } from "@creatoros/backend/application/queries/imported-publication-ids";
import {resolveSubmittedChatToolParameters} from "@creatoros/backend/modules/ai-runtime";
import {prepareChatReply} from "./prepare-chat-reply";
import {createSchedulingAutomation} from "@creatoros/backend/application/scheduling/automation";
import {createSchedulingControls} from "@creatoros/backend/application/scheduling/controls";
import {createCollectionExecution} from "@creatoros/backend/application/scheduling/collection-execution";
import {createIntelligenceApplicationTransport} from "@creatoros/backend/application/intelligence/transport";
import {createDiscoveryBusinessAdapters} from "@creatoros/backend/application/generation/discovery";
import {createWritingBusinessAdapters} from "@creatoros/backend/application/generation/writing";
import {createMediaBusinessAdapters} from "@creatoros/backend/application/generation/media";

import {createCalibrationScoreReaders} from "@creatoros/backend/application/context/calibration-score";
import {createCalibrationDiagnoseReaders} from "@creatoros/backend/application/context/calibration-diagnose";
import {createChatIngestionTasks} from "@creatoros/backend/application/chat/ingestion-tasks";
import {createChatGenerationTasks} from "@creatoros/backend/application/chat/generation-tasks";
import {createChatPreparationTasks} from "@creatoros/backend/application/chat/preparation-tasks";
import {createCurrentArtifactReader,extractArtifactText} from "@creatoros/backend/application/context/current-artifact";
import {createCurrentScriptSelectionReader} from "@creatoros/backend/application/context/current-script-selection";
import {downloadDouyinImage} from "./ingestion/douyin-cover-backfill";
import {parseDouyinWorkListXlsx} from "./ingestion/douyin-work-detail";
import {isLegacyIncompleteReview} from "@/lib/script-review-status";
import { createSelfCollector } from "@creatoros/backend/application/collection/self";
import { createCommentsCollector } from "@creatoros/backend/application/collection/comments";
import { createFavoritesCollector } from "@creatoros/backend/application/collection/favorites";
import { createBenchmarkCollector } from "@creatoros/backend/application/collection/benchmark";
import { createGenerationContextReaders } from "@creatoros/backend/application/context/generation";
import { createProjectMaterialsContext } from "@creatoros/backend/application/context/project-materials";
import { createBriefContext } from "@creatoros/backend/application/context/brief";
import { createReviewSubjectContext } from "@creatoros/backend/application/context/review-subject";
import { createChatPerformanceReaders } from "@creatoros/backend/application/chat/performance-readers";
import { createChatEvidenceReaders } from "@creatoros/backend/application/chat/evidence-readers";
import { createChatLifecycleReaders } from "@creatoros/backend/application/chat/lifecycle-readers";
import { createChatProjectsReaders } from "@creatoros/backend/application/chat/projects-readers";
import { createProjectOverviewApplication } from "@creatoros/backend/application/queries/project-overview";
import { createDailyReportApplication } from "@creatoros/backend/application/queries/daily-report";
import { createDashboardApplication } from "@creatoros/backend/application/queries/dashboard";
import { createPageReadRevisionReader } from "@creatoros/backend/application/page-read-revision";
import { createRecoveryWakeCoordinator } from "@creatoros/backend/application/recovery-wake";
import { rebuildOwnedSearchIndex } from "@creatoros/backend/application/search-bootstrap";
import { createThesisAdoption } from "@creatoros/backend/application/thesis-adoption";
import { withPageReadInvalidation } from "@/lib/page-read-cache.server";
import { createApplicationTransport } from "@creatoros/backend/application/transport";
import { AsyncLocalStorage } from "node:async_hooks";
import { createScheduledFavoritesAsrService } from "@creatoros/backend/modules/favorites";
import { createKnowledgeApplication } from "@creatoros/backend/application/knowledge";
import { configureHostBrowserProfileLifecycle } from "./ingestion/host-browser-profile-lifecycle";
import { createHostBrowserProfileLifecycle } from "@creatoros/backend/modules/execution";
import { createAgenticCollectionTools } from "@creatoros/backend/modules/ai-runtime";
import { composeChatProduction, createChatProductionRuntime } from "@creatoros/backend/modules/ai-runtime";
import { resolveDouyinProfileIdentity } from "@creatoros/ai-worker/browser/profile-directory";

import { createScriptDraftTargetService } from "@creatoros/backend/modules/artifacts";
import { createVideoEditCandidatePreparer } from "@creatoros/backend/modules/ai-runtime";
import { createSubmittedTaskPreparationService } from "@creatoros/backend/modules/execution";
import { createAiTaskSubmissionService } from "@creatoros/backend/modules/ai";
import { createDailyTopicRunService, createDailyTopicRunIntentService } from "@creatoros/backend/modules/scheduling";
import { countCandidatesForDay, lockCandidateSupply } from "@creatoros/backend/modules/candidate";
import { createBrowserProfileAuthority, lockAccountForSupply } from "@creatoros/backend/modules/platform-account";

import { createTopicCandidateAdoptionService } from "@creatoros/backend/modules/ai";
import { createDailyTopicBusinessAdapter } from "@creatoros/backend/modules/ai-runtime";
import { createCalibrationPositioningAdoptionService } from "@creatoros/backend/modules/ai";
import { lockPositioningAdoptionAccount } from "@creatoros/backend/modules/positioning";

import { createBrowserTaskAuthorizationService, createAgenticBusinessExecutionService, createAgenticMaterialTools, createAgenticResearchTools } from "@creatoros/backend/modules/ai-runtime";
import { createKnowledgeProposalAdoptionService } from "@creatoros/backend/modules/knowledge";
import { createAssetTagProposalService } from "@creatoros/backend/modules/taxonomy";
import { createGeneratedAssetAdoptionService, createStructuredTargetAdoptionService, createAgenticProposalAdoptionService, createAgenticProposalStagingService } from "@creatoros/backend/modules/ai";
import { createCollectionToolPorts } from "@creatoros/backend/modules/intelligence";
import { resolveExecutionWorkerPath, resolveAgenticWorkerPath, resolveIntelligenceGenerationWorkerPath, resolveIntelligenceTranscriptWorkerPath, resolveEmbeddingWorkerPath, resolveFlywheelWorkerPath, resolveModelProbeWorkerPath } from "./execution-worker-path";
import { createExecutionScheduledChildService, createModelWorkerDispatcher, createAgenticWorkerDispatcher, DEFAULT_AGENTIC_SYSTEM_PROMPT } from "@creatoros/backend/modules/execution";
import { createScriptSimilarityEvaluator, createTopicPreferenceSubmission, createArtifactContextReaders, createStructuredBusinessExecutionService } from "@creatoros/backend/modules/ai-runtime";
import "server-only";

import { createConfiguredDb, createCliInvocationService, resolveMasterKey,
// [T-332 S2] per-account 域 repo 工厂的统一断言:未选号 → AccountRequiredError(引导态)。
requireAccountId, type Db, type CliInvocationService,
// [T-363] 「重置工作区」归档后的首启:PRESERVE 表(模型配置/skill 定制/激活态…)从
// 归档库迁回新库(一次性、幂等、失败诚实不阻断启动)。
restorePreservedUserAssets } from "@creatoros/backend";
import { type Transport, type RequestContext } from "@creatoros/contract";
// [T-084c] ENDPOINTS 值导入 —— dispatchGenerateAsset 经 ai transport 起 asset.generate task
// 时用真 endpoint 对象(带 body zod 类型),避免裸 { id } 造成 body 类型收窄为 undefined。
// [T-084c] ENDPOINTS 值导入 —— dispatchGenerateAsset 经 ai transport 起 asset.generate task
// 时用真 endpoint 对象(带 body zod 类型),避免裸 { id } 造成 body 类型收窄为 undefined。
import { ENDPOINTS } from "@creatoros/contract";
import { createAiTaskAttemptId } from "@/lib/ai-task-attempt";

import { readChannelModelAuthority } from "@/server/activation/client-config.server";
import { prepareManagedTranscribeSpec } from "@/server/activation/managed-asr.server";
import { getScriptReviewBlockReason } from "@/server/script-review-readiness";
import { contentRadarDraftSeedOf, selectReadableProjectScriptArtifact } from "@/server/project-script-truth";
import { buildPublishingScheduleProjection, type PublishingScheduleProjection } from "./publishing-schedule-projection";
import { resolveCurrentScriptSelectionFromTruth } from "./current-script-selection";
// [T-374] projects.transcribe composition-only 拦截工厂(抽出为可单测模块)。
// [T-374] projects.transcribe composition-only 拦截工厂(抽出为可单测模块)。
import { createProjectsWithTranscribe } from "./projects-transcribe-wrap";
import { listPositioningWorksWithPublicationFacts, listRecentProjectsWithPublicationFacts, searchProjectsWithPublicationFacts } from "./recent-projects-context";

import { listAllProjectMaterialAssets } from "@/server/material-export-pagination";
// [T-050] 抖音真实数据里只保留金句知识库 seed(项目/发布/指标图谱旧种子已全删)。
// [T-135] DOUYIN_FAN_TOTAL 已随 canonical platform account seed(唯一使用点)退役移除。

import { createIdentityRepository, createIdentityService, OwnershipError, ensureLocalUser, type IdentityService } from "@creatoros/backend/modules/identity";
import { seedWinVideoTutor,
// [T-211] 存量去前缀 fixup 用的旧标题前缀常量。
WIN_VIDEO_TUTOR_LEGACY_TITLE_PREFIX,
// [T-218] 存量按 module 挂 tag 的回填(观点地图开箱即在)。
fixupWinVideoTutorModuleTags } from "@/server/seeds/win-video-tutor";
import { createTaxonomyRepository, createTaxonomyService, createTaxonomyTransport } from "@creatoros/backend/modules/taxonomy";
import { createNotificationRepository, createNotificationsService, createNotificationsTransport } from "@creatoros/backend/modules/notifications";
import {
// [T-093] hybrid 检索(exact 优先 + 语义余弦补位)。
type HybridSearchHit } from "@creatoros/backend/modules/search";

// [T-050 ⑦] 搜索索引真数据投影要直读六张表(根包导出,别名防与本文件局部变量撞名)。
// [T-050 ⑦] 搜索索引真数据投影要直读六张表(根包导出,别名防与本文件局部变量撞名)。
import { createOnboardingState, createIntegrationCredentials, createSettingsRepository, createSettingsService, createSettingsTransport, type SettingsService } from "@creatoros/backend/modules/settings";
// T-147 P5 桌面激活授权 —— 装配一机一码激活门(桌面拦/web 跳);门控/激活页经 bundle 取用。
// T-147 P5 桌面激活授权 —— 装配一机一码激活门(桌面拦/web 跳);门控/激活页经 bundle 取用。
import { assembleActivationService, type ActivationService } from "./activation";
import { createRadarProjectService, createProjectRepository, createProjectsService, createProjectsTransport, createTranscriptArtifactService, createProjectTranscriptionTargetService, type StageGateReadersRef } from "@creatoros/backend/modules/projects";
import { createKnowledgeRepository, createKnowledgeService } from "@creatoros/backend/modules/knowledge";
import { createAssetRepository, createAssetsService, createWebDocumentCacheService, createAssetsTransport, createMockObjectStorage, createS3ObjectStorage, createLocalFsObjectStorage, ensureBucket, type ObjectStorageForCtx } from "@creatoros/backend/modules/assets";
import { createArtifactsService, createArtifactsTransport } from "@creatoros/backend/modules/artifacts";
import { createProductionService, createProductionTransport } from "@creatoros/backend/modules/production";
import { createPublishingService, createPublishingTransport, createUnavailablePublisher } from "@creatoros/backend/modules/publishing";
import { createPublicationSyncService, createTrafficService, createAnalyticsRepository, createAnalyticsService, createAnalyticsTransport } from "@creatoros/backend/modules/analytics";
import { createIngestionService, createIngestionTransport } from "@creatoros/backend/modules/ingestion";
import { createReviewsService, createReviewsTransport } from "@creatoros/backend/modules/reviews";
// T-086 文案审核门(review_rules + script_review_reports)。
// T-086 文案审核门(review_rules + script_review_reports)。
import { createReviewGateService, createReviewGateTransport, buildReviewRuleSeedRows, createReviewGateRepository } from "@creatoros/backend/modules/review";
import { prepareScriptReviewContext } from "@creatoros/backend/modules/ai-runtime";

import { createEmbeddingIoService, createModelProbeIoService } from "@creatoros/backend/modules/ai-runtime";
import { createLearningsService, createLearningsTransport } from "@creatoros/backend/modules/learnings";
import { createAiService, createAiTransport, createAiRepository, buildAiModelConfigs, buildAiAgentConfigs, type AiService } from "@creatoros/backend/modules/ai";
// [T-255a] 执行层(脑手分离):execution.tasks 5 op + 沙箱 + executor 注册表 + live
// dispatch 编排。存储复用 ai_tasks(taskType `exec.*`),模块本体零 db 依赖(端口注入)。
// [T-255a] 执行层(脑手分离):execution.tasks 5 op + 沙箱 + executor 注册表 + live
// dispatch 编排。存储复用 ai_tasks(taskType `exec.*`),模块本体零 db 依赖(端口注入)。
import { createExecutionService, createPersistentTaskService, createExecutionTransport, createExecutorRegistry, registerBuiltinExecutors, runExecutionTask, abortExecutionTask, resolveWorkspacesRoot, sweepInterruptedRenderFrames, sweepOrphanSandboxes } from "@creatoros/backend/modules/execution";
import { createTranscriptSourceRecoveryService, createRadarProjectQueueService, createIntelligenceService, createIntelligenceTransport, createProjectIntelligenceReferenceService, createIntelligenceTranscriptBridge, createIntelligenceGenerationBridge, createProjectScriptCandidateService, drainProjectScriptCandidateQueue, runIntelligenceSourceTask, drainIntelligenceSourceQueue, drainIntelligenceTranscriptQueue, type IntelligenceTranscriptRunnerDeps, drainIntelligenceTopicPreviewQueue } from "@creatoros/backend/modules/intelligence";
import { createIntelligenceSourceAdapter } from "@/server/intelligence/source-adapter";
import { drainDouyinShareImportQueue } from "@creatoros/backend/modules/intelligence";
import type { ContextDeps as ChatContextDeps } from "@creatoros/backend/modules/ai-runtime";
// [T-184] 声明式 context 注入:CreativeContextDeps = creative-context 的 ContextDeps(facet reader
// 集合的类型),供中央 reader registry + resolveContextDeps 定型;ProjectBriefReader 供命名 briefReader。
// [T-184] 声明式 context 注入:CreativeContextDeps = creative-context 的 ContextDeps(facet reader
// 集合的类型),供中央 reader registry + resolveContextDeps 定型;ProjectBriefReader 供命名 briefReader。

import type { ContextReaders as ChatContextReaders } from "@creatoros/backend/modules/ai-runtime";

import { createResearchMaterialAdoptionService } from "@creatoros/backend/modules/ai";
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

import { DouyinNotLoggedInError } from "@/server/ingestion/douyin-errors";
// [T-330] 绑新号 staging 登录态目录 helpers —— 纯 fs 叶子模块(零 playwright 依赖,静态
//   import 不破 douyin-cdp 懒加载);token→路径映射收在组合根,service 只见不透明 stagingKey。
// [T-330] 绑新号 staging 登录态目录 helpers —— 纯 fs 叶子模块(零 playwright 依赖,静态
//   import 不破 douyin-cdp 懒加载);token→路径映射收在组合根,service 只见不透明 stagingKey。
import { adoptDouyinStagingDir, createDouyinStagingToken, discardDouyinStagingDir, douyinStagingDirFor } from "@/server/ingestion/douyin-auth-staging";

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

// [T-078] 作品封面回填字节下载 + 默认上限(封面回填/逐字稿/重建编排见 douyin-heavy-backfill)。
// [T-078] 作品封面回填字节下载 + 默认上限(封面回填/逐字稿/重建编排见 douyin-heavy-backfill)。
import { DEFAULT_COVER_BACKFILL_LIMIT } from "@/server/ingestion/douyin-cover-backfill";
// [T-195/T-595] 抖音重活编排直接消费源边界归一后的公开作品域。
//   由 self.detail 落完明细(hidden_at/platform_status 已标)后调 —— 可见性已知才跑重活(见根因注释)。
//   多闸幂等在子 helper 内(runner 逐 aweme 跳已转写 / 已有 reconstructed artifact 跳过 / createTask 去重)。

// T-038b 抖音采集限流网关(单例接线):所有对外抖音请求经它 acquire/report(SPEC §4.4)。
// [T-230] DouyinCooldownActiveError:transcribe-runner 冷却延迟重试的判别锚(isCooldownError)。
// T-038b 抖音采集限流网关(单例接线):所有对外抖音请求经它 acquire/report(SPEC §4.4)。
// [T-230] DouyinCooldownActiveError:transcribe-runner 冷却延迟重试的判别锚(isCooldownError)。
import { DouyinRequestGateway, classifyDouyinOutcome, type DouyinChannel } from "@/server/ingestion/douyin-request-gateway";
import { resolveDouyinThrottleConfig } from "@/server/ingestion/douyin-throttle-config";
import { createPgliteThrottleStatePort } from "@/server/ingestion/douyin-throttle-state-port.pglite";
// [T-084b] 通用网页截图(公开页无头 Chromium)—— material.screenshot 端口用。
// [T-084b] 通用网页截图(公开页无头 Chromium)—— material.screenshot 端口用。
import { captureUrl, WebCaptureError, isBlockedHttpCaptureError } from "@/server/ingestion/web-capture";
// [T-390] web.read 被拒(403/5xx 等)→ 搜索引擎找替代来源(纯编排,searcher 在本组合根注入)。
// [T-390] web.read 被拒(403/5xx 等)→ 搜索引擎找替代来源(纯编排,searcher 在本组合根注入)。
import { readWebDocument } from "@creatoros/ai-worker/browser/web-read-workflow";
import type { AlternateSearcher } from "@creatoros/ai-worker/browser/web-read-fallback";
// [T-217a] Web Session Vault —— 泛化抖音登录态底座成任意域名保管库(有头登录 + headless 探针)。
// [T-217a] Web Session Vault —— 泛化抖音登录态底座成任意域名保管库(有头登录 + headless 探针)。
import { openWebLoginWindow, checkWebSessionStatus, webDomainFromUrl, webSessionLookupDomains, importLegacyProfileState, type WebLoginHandle } from "@/server/ingestion/web-session";
// [B-01] Web Session 域名净化/校验(防路径穿越递归删应用数据/上级目录)。纯函数,与 route 入口共用。
// [B-01] Web Session 域名净化/校验(防路径穿越递归删应用数据/上级目录)。纯函数,与 route 入口共用。
import { assertSafeWebDomain, isArchivedWebProfileName, isNestedArchivedWebProfileName, isSafeWebDomain, WebDomainError } from "@/lib/web-domain";
// [T-370a] 浏览器登录态系统化:web 域 storageState 加密单一真值(host 内部 service,无契约 op)。
// [T-370a] 浏览器登录态系统化:web 域 storageState 加密单一真值(host 内部 service,无契约 op)。
import { createBrowserSessionsService, type BrowserSessionsService } from "@creatoros/backend/modules/browser-sessions";
// [T-370b] 持久 profile 池(域亲和 sticky + 征用擦除 + FIFO 排队);web-reader 读取走池。
// [T-370b] 持久 profile 池(域亲和 sticky + 征用擦除 + FIFO 排队);web-reader 读取走池。
import { createBrowserPool, type BrowserPool, type PoolCapableContext } from "@/server/ingestion/browser-pool";
// [T-217b] Web Reader —— 带 .auth/web 登录态读正文全文(编导 web.read 端口用)。
// [T-217b] Web Reader —— 带 .auth/web 登录态读正文全文(编导 web.read 端口用)。
import { readUrl as readWebUrlSidecar, WebReaderLoginRequiredError } from "@/server/ingestion/web-reader";
import { assertUrlAllowed } from "@/server/ingestion/url-guard";
import { createLocalReadHost, createLocalEnvironmentHost } from "@creatoros/backend/modules/ai-runtime";
import { checkGrant as checkLocalReadGrant, consumeOnce as consumeLocalReadOnceGrant, listAlwaysDirs as listLocalReadAlwaysDirs } from "@/server/local-read-grants";
import { type Collector as ScheduledCollector, createScheduledFlywheelExecutionService } from "@creatoros/backend/modules/ai-runtime";
import { sweepStaleAiTasks } from "@creatoros/backend/modules/ai-runtime";
// [T-189a] 绑定抖音 → 幂等建三个每天定时采集 job + 初始化跑一次(纯编排;组合根注入 listJobs/
//   createJob/trigger 端口)。[T-227] ensureCollectionJobs:启动兜底,对存量账号幂等补齐缺失的
//   DEFAULT_JOBS(只建不触发)。
// [T-189a] 绑定抖音 → 幂等建三个每天定时采集 job + 初始化跑一次(纯编排;组合根注入 listJobs/
//   createJob/trigger 端口)。[T-227] ensureCollectionJobs:启动兜底,对存量账号幂等补齐缺失的
//   DEFAULT_JOBS(只建不触发)。
import { ensureCollectionJobs } from "@creatoros/backend/modules/ai-runtime";

import { createPlatformDraftAdoptionPort } from "@creatoros/backend/modules/ai-runtime";
// [T-254b] 制作视频四决策编排(分场/信息卡/B-roll/双语字幕 → video_decisions 候选,
// 预览卡确认门;素材清单投影类型一并引入给 listBrollInventory 端口)。
// [T-309] collectProjectBrollInventory 把项目/账号边界收进唯一 B-roll 素材入口；
// storyboardFromContentData 仍用于四决策 authored 分镜 facet。
// [T-254b] 制作视频四决策编排(分场/信息卡/B-roll/双语字幕 → video_decisions 候选,
// 预览卡确认门;素材清单投影类型一并引入给 listBrollInventory 端口)。
// [T-309] collectProjectBrollInventory 把项目/账号边界收进唯一 B-roll 素材入口；
// storyboardFromContentData 仍用于四决策 authored 分镜 facet。

import { createAssetBusinessExecutionService } from "@creatoros/backend/modules/ai-runtime";
// [T-271] 制作封面链 runner(结构化封面方案 + 文案诚实门 + 结构化组装生图 prompt)。
// [T-271] 制作封面链 runner(结构化封面方案 + 文案诚实门 + 结构化组装生图 prompt)。

import { createExecutionCoverService } from "@creatoros/backend/modules/execution";
import { createTranscribeBusinessExecutionService } from "@creatoros/backend/modules/ai-runtime";
// [T-357] 采集逐字稿后处理(ASR 文本落库前:同音错字纠正+补标点+语义分段;失败诚实落原文)。
// [T-146 切片 a] 文档抽取 runner + 未配摘要模型的信号错误(诚实降级)。
// [T-357] 采集逐字稿后处理(ASR 文本落库前:同音错字纠正+补标点+语义分段;失败诚实落原文)。
// [T-146 切片 a] 文档抽取 runner + 未配摘要模型的信号错误(诚实降级)。
import { getOfficialSkillBase, listOfficialSkillBases, runWithEffectiveSkillSnapshot, type EffectiveSkillSnapshotV1 } from "@creatoros/ai-worker";
import { createEffectiveSkillSnapshotResolver, parseEffectiveSkillSnapshot, requiredSkillIdsForTask, type EffectiveSkillSnapshotResolver } from "@creatoros/backend/modules/ai-runtime";
import { LlmCredentialError } from "@creatoros/backend/modules/ai-runtime";
import { channelLlmConfigFromRoute, resolveChannelCapabilityRoute, resolveLlmConfig, resolveDedicatedLlmConfig } from "@creatoros/backend/modules/ai-runtime";

import { matchesPinnedModelAuthority, pinModelAuthority, TaskModelAuthorityScope } from "./task-model-authority";
import { resolveMultimodalSpec as resolveMultimodalSpecFn, resolveTranscribeSpec as resolveTranscribeSpecFn } from "@creatoros/backend/modules/ai-runtime";
// [T-084a] 联网检索解析层 —— 与多模态 resolve 并列(web.search capability,自由字符串零契约改)。
// [T-084a] 联网检索解析层 —— 与多模态 resolve 并列(web.search capability,自由字符串零契约改)。
import { resolveSearchSpec as resolveSearchSpecFn } from "@creatoros/backend/modules/ai-runtime";
import { resolveExecutablePath } from "@creatoros/ai-worker";
// [T-377] settings.models.test composition-only 拦截工厂(抽出为可单测模块)。
// [T-377] settings.models.test composition-only 拦截工厂(抽出为可单测模块)。
import { createSettingsWithModelTest } from "./settings-model-test-wrap";
import { createSettingsWithChannelModelCredentials } from "./settings-channel-model-credentials-wrap";
// [T-084a] 联网检索工厂 + 三家 provider 适配器 —— host 注册进 registry(keyed by provider),
// gatherMaterials 前置检索用。与多模态 registry 并列;加 provider = 在此注册一个适配器。
// [T-084a] 联网检索工厂 + 三家 provider 适配器 —— host 注册进 registry(keyed by provider),
// gatherMaterials 前置检索用。与多模态 registry 并列;加 provider = 在此注册一个适配器。
import { searchWeb as searchWebFn, createBochaAdapter, createTavilyAdapter, createSerpapiAdapter, createRssAdapter,
// [T-235b] rss 型热点信源辅路:直接 fetch feed 后复用同一解析(不重造)。
parseFeed, type SearchProviderRegistry } from "@creatoros/ai-worker";
// [T-184] script.draft 模板的 contextRequirements 声明 —— 组合根按它 resolveContextDeps 注入 reader。
// [T-184] script.draft 模板的 contextRequirements 声明 —— 组合根按它 resolveContextDeps 注入 reader。

// [T-271] 封面链 cover.generate 也走声明式 context 注入(brief 硬锚 + reviewSubject 读口播稿 + 素材可溯)。
// [T-271] 封面链 cover.generate 也走声明式 context 注入(brief 硬锚 + reviewSubject 读口播稿 + 素材可溯)。

// [T-126b] 浏览器搜索适配器落 frontend/server(需 playwright,复用 web-capture 无头 context)。
// [T-126b] 浏览器搜索适配器落 frontend/server(需 playwright,复用 web-capture 无头 context)。
import { createBrowserScrapeAdapter } from "@/server/ai/search/search-browser";
import { createBrowserSearchFallbackState, searchBundledBrowserWithFallback } from "@/server/ai/search/browser-search-fallback";
import { discoverSameOriginFeedUrl, isSyndicationFeed } from "@/server/intelligence/feed-discovery";
import { createPositioningService, createPositioningTransport, type PositioningDiscoverySessionResource } from "@creatoros/backend/modules/positioning";

// T-513 official-only 平台规则：它属于程序基座，不接受账号 overlay，也不从客户端输入。
// 版本随规则正文变化而递增，和 effective Skill 一起内联到每个任务的 server-only snapshot。
const PLATFORM_POLICY_VERSION = "creatoros-platform-policy-v1";
const PLATFORM_POLICY_TEXT = [
  "AI 只能产生候选；真实数据写入必须经过用户确认和后端服务端口。",
  "不得编造指标、来源、执行结果或已保存状态；缺失数据必须如实标空。",
  "工具只允许使用 effective Skill 白名单与当前账号授权范围的交集。",
].join("\n");
import { createCandidateService, createCandidateTransport } from "@creatoros/backend/modules/candidate";
import { createCalibrationService, createCalibrationTransport, createCalibrationRepository, type RubricRow as CalibrationRubricRow, type RubricVersionRow as CalibrationRubricVersionRow } from "@creatoros/backend/modules/calibration";
import { createPlatformAccountService, createPlatformAccountTransport, type PlatformAccountService } from "@creatoros/backend/modules/platform-account";
import { createContentCalendarService, createContentCalendarTransport, type ContentCalendarService } from "@creatoros/backend/modules/content-calendar";
import { createMaterialLinksService, createMaterialLinksTransport } from "@creatoros/backend/modules/material-links";
// [T-212a] 对标源 + 对标作品(选题/对标强化)。
// [T-212a] 对标源 + 对标作品(选题/对标强化)。
import { createBenchmarkService, createBenchmarkTranscriptionService, createBenchmarkTransport, OwnershipError as BenchmarkOwnershipError, type BenchmarkService } from "@creatoros/backend/modules/benchmark";
// [T-235b] 热点信源(通用网页/RSS 信源登记,热点多源证据)。
// [T-235b] 热点信源(通用网页/RSS 信源登记,热点多源证据)。
import { createTrendSourcesService, createTrendSourcesTransport, type TrendSourcesService } from "@creatoros/backend/modules/trend-sources";
// [T-235c] 指定抖音收藏夹(收藏夹跟拍信号源)。
// [T-235c] 指定抖音收藏夹(收藏夹跟拍信号源)。
import { createFavoritesService, createFavoritesTransport, type FavoritesService } from "@creatoros/backend/modules/favorites";
// [T-235d] 选题归因(正向归因回流 —— 选题验证库;读侧 1 op + runner 写侧薄层)。
// [T-235d] 选题归因(正向归因回流 —— 选题验证库;读侧 1 op + runner 写侧薄层)。
import { createTopicAttributionService, createTopicAttributionTransport, type TopicAttributionService } from "@creatoros/backend/modules/topic-attribution";
import { createSchedulingService, createSchedulingTransport } from "@creatoros/backend/modules/scheduling";
import { createGlobalSearchQueryService, createPublishingCenterQueryService, createQueryServicesTransport, type PublishingCenterQueryService } from "@creatoros/backend/modules/query-services";

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
export {resolveContextDeps} from "@creatoros/backend/application/context/registry";

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
// T-816：稿面实际渲染的 contentData.sections 是当前确认稿第一真相；旧 transcript/contentText
// 可能只是同版本的派生快照，不能反向覆盖结构稿。无 sections 时再兼容 transcript/contentText/body。

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
  projectListCoverIds: (ctx: RequestContext, projectIds: readonly string[]) => Promise<Record<string, string | null>>;
  readPageRevision: () => Promise<string>;
  cliInvocations: CliInvocationService;
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
  browserTaskAuthorizationRuntime: { grant(ctx:RequestContext,taskId:string,input:unknown):Promise<{status:"granted"|"denied"}>; prepare(ctx:RequestContext,taskId:string):Promise<void> };
  executionPreviewRuntime: {
    readVideo(
      ctx: RequestContext,
      taskId: string,
      artifactPath: string,
    ): Promise<{ bytes: Uint8Array; mimeType: string }>;
  };
  // T-482 内容雷达领域 transport。
  intelligence: Transport;
  positioning: Transport;
  candidate: Transport;
  calibration: Transport;
  platformAccount: Transport;
  scheduling: Transport;
  contentCalendar: Transport;
  /** T-599：无新增公开 operation 的服务端月历/首页组合端口。 */
  contentCalendarService: ContentCalendarService;
  publishingScheduleProjection: (
    ctx: RequestContext,
    month?: string,
  ) => Promise<PublishingScheduleProjection>;
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
  resolveRedfoxCredential: ReturnType<typeof createIntegrationCredentials>["resolve"];
  readCurrentScript?: (ctx:RequestContext,projectId:string,signal?:AbortSignal)=>ReturnType<ReturnType<typeof createCurrentArtifactReader>>;
  durable: ReturnType<typeof createChatProductionRuntime>;
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
  /** [T-652] Copilot 生成定位卡前读取最新前采真值，避免旧 revision 候选。 */
  getPositioningDiscovery: (
    ctx: RequestContext,
    sessionId: string,
  ) => Promise<PositioningDiscoverySessionResource>;
  /**
   * [T-716] 局部改稿可信锚点。浏览器只负责表达“用户点了哪一段”，服务端在每次发送前
   * 重新读取 artifact.currentVersionId 与当前版本正文，避免恢复/保存后继续拿旧快照改稿。
   */
  resolveCurrentScriptSelection?: (
    ctx: RequestContext,
    input: {
      artifactId: string;
      versionId?: string;
      sectionId: string;
      sectionIndex?: number;
      excerpt: string;
    },
  ) => Promise<{
    artifactId: string;
    versionId: string;
    sectionId: string;
    originalText: string;
    matchStrategy: "id" | "text" | "position" | "whole_text";
  } | null>;
  /**
   * Copilot 附件读取门：先经 asset user+account 归属校验，再取 current file 与字节。
   * 路由只在单次模型调用内消费 bytes；消息持久化只保存 assetId。
   */
  readChatAttachment?: (
    ctx: RequestContext,
    assetId: string,
  ) => Promise<{
    assetId: string;
    name: string;
    assetType: string;
    mimeType: string;
    fileSize: number;
    extractedText: string | null;
    bytes: Uint8Array;
  }>;
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
    input: { tools?: string[]; signal?: AbortSignal },
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
  // ai.tasks.create,交由持久素材执行入口，旧提交事实沿原对账路径),立即返回 taskId(不阻塞对话回合)。
  dispatchGenerateAsset: (
    ctx: RequestContext,
    input: { kind: "image" | "video"; prompt: string; projectId?: string | null; attemptId?: string },
  ) => Promise<{ taskId: string }>;
  // [T-103b] review.script 端口 —— dispatch 既有 script.review ai_task(reviewGateService.triggerReview,
  // 复用 T-086 审核链路 L1 lint + L2 语义审 → 落 script_review_reports),立即返回 taskId。对话审核工具
  // (review.script)据此触发,前端 ChatReviewReportCard 轮询 getTask → 读 getLatestScriptReview 渲报告卡。
  dispatchScriptReview: (
    ctx: RequestContext,
    input: { projectId: string },
  ) => Promise<{ taskId: string }>;
  prepareChatScriptDraftTask: AiService["prepareScriptDraftTaskCommit"];
  wakeChatScriptDraftTask: (ctx:RequestContext,taskId:string)=>Promise<void>;
  prepareChatPublishTask: (ctx:RequestContext,input:{projectId:string;topic?:string;attemptId:string})=>ReturnType<AiService["prepareTaskCommit"]>;
  wakeChatPublishTask: (ctx:RequestContext,taskId:string)=>Promise<void>;
  prepareChatScriptReviewTask: (ctx:RequestContext,input:{projectId:string;attemptId:string})=>ReturnType<AiService["prepareTaskCommit"]>;
  wakeChatScriptReviewTask: (ctx:RequestContext,taskId:string)=>Promise<void>;
  wakeChatCoverTask:(ctx:RequestContext,taskId:string)=>Promise<void>;
  wakeChatResearchTask: (ctx:RequestContext,taskId:string)=>Promise<void>;
  wakeChatPlanningTask: (ctx: RequestContext, taskId: string) => Promise<void>;
  wakeChatMaterialTask: (ctx: RequestContext, taskId: string) => Promise<void>;
  dispatchPlanningThesis: (
    ctx: RequestContext,
    input: { projectId: string; topic?: string; attemptId?: string },
  ) => Promise<{ taskId: string }>;
  // [T-271] cover.generate 端口 —— dispatch 既有 cover.generate ai_task(void runCoverGenerate:结构化
  // 封面方案硬锚 brief/口播稿 → 文案诚实门 → 结构化组装生图 prompt → image.generate 生图),立即返回
  // taskId(不阻塞对话回合)。对话封面工具(cover.generate)据此触发,前端 ChatGenerateCard 轮询 getTask
  // → awaiting_confirmation 渲封面方案 + 封面图候选 → 采纳 confirmTask(既有 asset 采纳门绑进项目)。
  dispatchGenerateCover: (
    ctx: RequestContext,
    input: {
      projectId: string;
      topic?: string;
      referenceAssetId?: string;
      visualRequirements?: string;
    },
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
    input: {
      projectId: string;
      attemptId?: string;
      topic?: string;
      angle?: string;
      targetDurationSeconds?: number;
      extraBrief?: string;
      instruction?: string;
      sourceSnapshots?: import("@creatoros/backend/modules/ai-runtime").ScriptDraftSourceSnapshot[];
      draftMode?: "verbatim";
      verbatimSourceRef?: string;
      verbatimSourceText?: string;
      verbatimSourceLength?: number;
      verbatimSourceSha256?: string;
    },
  ) => Promise<{ taskId: string }>;
  prepareVideoEdit: (
    ctx: RequestContext,
    input: {
      projectId: string;
      instruction: string;
      removeBrollAssetIds?: string[];
      replaceBroll?: Array<{ sceneIdx: number; assetId: string }>;
      moveBroll?: Array<{ assetId: string; at: number; durationSec?: number }>;
      removeCardIndexes?: number[];
    },
  ) => Promise<import("@creatoros/backend/modules/ai-runtime").VideoEditToolResult>;
  // [T-350a] publish.package 端口 —— ensure 内容产出挂点(outputId)+ 读整稿正文(空稿诚实门)
  // + dispatch 既有 publish.platform_adapt runner(单平台抖音,platform.adapt 模板已内嵌审核 SOP),
  // 立即返回 taskId。发布物料工具(publish.package)据此触发,前端候选卡轮询 → 采纳物化 Publication。
  dispatchPublishPackage: (
    ctx: RequestContext,
    input: { projectId: string; topic?: string; attemptId?: string },
  ) => Promise<{ taskId: string }>;
  // [T-385] project.transcribe 端口 —— 复用 T-374 projectsWithTranscribe 拦截链(解析该项目
  // platformRef 抖音锚 → ai.tasks.create 排单条 transcribe.douyin → live dispatch 后台跑;
  // 无锚 → ValidationError 人话拒)。对话工具 project.transcribe 据此触发(复盘无稿门的可执行动作)。
  dispatchProjectTranscribe: (
    ctx: RequestContext,
    input: { projectId: string; attemptId?: string },
  ) => Promise<{ taskId: string }>;
}

const globalForPersistence = globalThis as unknown as {
  __creatorosPersistence?: Promise<PersistenceBundle>;
  __creatorosStopExecutionWorker?:()=>Promise<void>;
};

const taskModelAuthorityScope = new TaskModelAuthorityScope();

async function buildPersistence(): Promise<PersistenceBundle> {
  // T-606：所有模型 resolver 共用这一条 server-only authority 读面。configured 时返回渠道
  // opaque JSON；其他三态返回 null，既有本地 DB/env 链才可继续。
  const getChannelModelConfig = async () => {
    const pinnedPayload = taskModelAuthorityScope.currentPayload();
    if (pinnedPayload !== undefined) return pinnedPayload;
    const authority = await readChannelModelAuthority();
    return authority.authority === "channel" ? authority.payload : null;
  };
  // T-645：渠道 graph 只下发“服务与模型”，service Key 永不进入渠道 payload。
  // resolver 通过当前任务钉住的 scopeId（同步请求则读当前验签 authority）从本地加密库取 Key。
  // 绑定函数在 settingsService 装配后赋值；所有调用都发生在 build 完成后的请求/任务期。
  let readStoredChannelModelCredential:
    | ((ctx: RequestContext, scopeId: string, serviceId: string) => Promise<string | null>)
    | null = null;
  const getChannelModelCredential = async (
    ctx: RequestContext,
    serviceId: string,
  ): Promise<string | null> => {
    const pinnedScopeId = taskModelAuthorityScope.currentScopeId();
    let scopeId: string | null;
    if (pinnedScopeId !== undefined) {
      scopeId = pinnedScopeId;
    } else {
      const authority = await readChannelModelAuthority();
      scopeId = authority.authority === "channel" ? authority.scopeId : null;
    }
    if (!scopeId) return null;
    if (!readStoredChannelModelCredential) {
      throw new Error("渠道模型凭据存储尚未初始化");
    }
    return readStoredChannelModelCredential(ctx, scopeId, serviceId);
  };
  const getChannelModelSelection = async (
    ctx: RequestContext,
    capability: string,
  ): Promise<string | null> => {
    const pinnedScopeId = taskModelAuthorityScope.currentScopeId();
    const authority = pinnedScopeId === undefined
      ? await readChannelModelAuthority()
      : null;
    const scopeId = pinnedScopeId !== undefined
      ? pinnedScopeId
      : authority?.authority === "channel"
        ? authority.scopeId
        : null;
    if (!scopeId || !readStoredChannelModelCredential) return null;
    const stored = await readStoredChannelModelCredential(
      ctx,
      scopeId,
      `__model_selection__:${capability}`,
    );
    if (!stored) return null;
    try {
      const value = JSON.parse(stored) as { id?: unknown };
      return typeof value.id === "string" && value.id.trim() ? value.id.trim() : null;
    } catch {
      // 兼容本功能内测阶段已存的单字符串 option id。
      return stored.trim() || null;
    }
  };
  // 本地优先存储 driver(L0,SPEC §4.1/§7-L0)—— 三态优先级,经 backend 的
  // createConfiguredDb 统一解析:
  //   1. DATABASE_URL    → 真 Postgres(node-postgres;用户当前 docker-PG + 71 作品走这条,不变)。
  //   2. PGLITE_DATA_DIR → file-backed PGlite 落盘(Postgres-WASM 持久化到本地目录)。
  //   3. 内存 PGlite     → 仅 测试/vitest;runtime 无任何配置则本地优先默认落盘(非内存,重启不丢)。
  // 三条都套同一份 drizzle 迁移(0000…),test/runtime schema 一致。dispose 当前进程不
  // 主动调(singleton 跟随进程生命周期),保留以备未来显式 teardown。
  const { db, driver, dispose } = await createConfiguredDb();
  let stopExecutionWorker: (()=>Promise<void>) | undefined;
  // [T-365/T-362] 把库的优雅关闭(PGlite client.close() = flush WAL)挂到 global,供
  //   sidecar-lifecycle 在 SIGTERM/孤儿自检退出时调用 —— 防「进程死于写库中途 → WAL 半写
  //   → 下次启动判损坏」(2026-07-16 数据事故根因)。挂 global 是刻意的:instrumentation
  //   不能 import 本模块(会在启动钩子里触发整个 persistence 装配)。
  (globalThis as { __creatorosDisposePersistence?: () => Promise<void> }).__creatorosDisposePersistence =
    async () => { await stopExecutionWorker?.(); await dispose(); };

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
  const profileAuthority=createBrowserProfileAuthority(db,douyinAuthDirBase);
  const hostProfileLifecycle=createHostBrowserProfileLifecycle(db,{resolveProfile:profileAuthority.resolveProfile});
  configureHostBrowserProfileLifecycle(hostProfileLifecycle.acquire);
  const douyinAuthDirFor = async (accountId?: string | null, signal?: AbortSignal,userId?:string): Promise<string> => {
    if(!accountId){
      if(!userId)throw new Error("旧登录目录缺少当前用户授权");
      return (await profileAuthority.authorizeTemporary(userId,"_default")).authDir;
    }
    const identity=await resolveDouyinProfileIdentity(douyinAuthDirBase,accountId,signal);
    if(userId && (await profileAuthority.resolveProfile(identity.authDir,signal)).userId!==userId)throw new Error("登录目录与当前用户不符");
    return identity.authDir;
  };
  const ownedStagingDir=async(stagingKey:string,userId:string)=>{
    const dir=douyinStagingDirFor(douyinAuthDirBase,stagingKey),identity=await profileAuthority.resolveProfile(dir);
    if(identity.userId!==userId)throw new Error("临时登录目录与当前用户不符");
    return identity.authDir;
  };

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
    now: persistent ? () => new Date().toISOString() : () => "2026-06-13T02:00:00.000Z",
    nextId: (prefix: string) => `${prefix}-${idBase}-${++createSeq}`,
  };
  // Identity 是排期三个表面的唯一时区来源；组合根提前构造同一个 service，
  // 后续 calendar/dashboard/settings 全部复用，避免各自猜浏览器或本机时区。
  const identityRepo = createIdentityRepository(db, deps);
  const identity = createIdentityService(identityRepo, deps);
  const localUser = await ensureLocalUser(identityRepo, deps);

  // T-147 P2 本地加密 —— 解析 master key(桌面 keychain via env `CREATOROS_MASTER_KEY`
  // 由 Rust keyring 注入 / web-dev 降级)。[T-370a] 前移到此(原在 settings 装配处):
  // browser_sessions(web 登录态密文)与 settings(模型 key)共用同一把 key/同一 crypto。
  const { key: masterKey, degraded: masterKeyDegraded } = resolveMasterKey(
    process.env,
  );
  const cliInvocations = createCliInvocationService({
    db,
    masterKey,
    now: deps.now,
    nextId: deps.nextId,
  });
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
    const pending = collectionRunTail.then(
      () => run(),
      () => run(),
    );
    // 兜底:链尾自身的 reject 不外溢(fire-and-forget;每个 run 内部已 try/catch 落终态)。
    collectionRunTail = pending.catch(() => {});
    return pending;
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

  const {knowledge,knowledgeService,search,searchService,knowledgeSearchRuntime,repairSeedTitles}=createKnowledgeApplication(db,deps,{
    resolveEmbedSpec:c=>resolveEmbedSpec(c),
    embedTexts:(c,spec,texts,signal)=>embedTexts(c,spec,texts,signal),
  });

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
  // over the later `settingsService` const is TDZ-safe, resolved only when invoked):
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
  const mockStorage = process.env.NODE_ENV === "test" && process.env.CREATOROS_STORAGE !== "local"
    ? createMockObjectStorage({ nextKey }) : null;
  const objectStorageForCtx: ObjectStorageForCtx = async (ctx) => {
    // 内存适配器只用于隔离测试；正式上传必须取得真实存储。
    if(mockStorage)return mockStorage;
    const svc = settingsService as SettingsService | undefined;
    if (!svc) throw new Error("存储设置服务未就绪");
    const backend = await svc.resolveStorageBackend(ctx);
    if (backend === "s3" && s3Cfg) {
      return createS3ObjectStorage(s3Cfg, { nextKey });
    }
    const rootPath = await svc.resolveStorageRoot(ctx);
    return createLocalFsObjectStorage({ rootPath, publicBaseUrl: "/api/v1/blob" },{ nextKey });
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
  const webDocumentCache = createWebDocumentCacheService(db, {objectStorageForCtx});
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
    control: { signal?: AbortSignal; deadlineAt?: number } = {},
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
    control.signal?.throwIfAborted();
    const existing = await session.getState(domain).catch(() => null);
    control.signal?.throwIfAborted();
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
    const handle = await browserPool.checkout(domain, session, control);
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
    assertProjectOwned: async (ctx, projectId) => {
      await projectsService.listOutputIdsByProject(ctx, projectId);
    },
    resolveOutputProjectId: (ctx, outputId) =>
      projectsService.getProjectIdByOutput(ctx, outputId),
    // [T-183] 改稿 delta → 品味信号 best-effort seam。Lazy 箭头:`learningsService` 在下方
    // 构造(request 时才求值,TDZ-safe,同 calibration/AI confirm thunk 范式)。用户手改
    // AI 产出的脚本 → 一条 edit_delta candidate learning 进裁决台。
    recordEditDelta: (ctx, input) =>
      learningsService.captureEditDelta(ctx, input),
  });
  const artifacts = createArtifactsTransport(() => artifactsService);
  const transcriptArtifacts = createTranscriptArtifactService({
    db, now: deps.now, nextId: deps.nextId,
    searchUpsert: (ctx, input) => searchService.upsertDocument(ctx, input),
  });

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
    //   listTasks+listResults(video.decisions 最近候选)/ zip 只落一次性对象存储产物。
    //   下方各 const(materialLinksService/aiService/makeReviewSubjectReader)在
    //   request 时才求值(lazy 箭头,TDZ-safe,同 learningsService thunk 范式)。
    materialExport: {
      resolveProjectIdByOutput: (ctx, outputId) =>
        projectsService.getProjectIdByOutput(ctx, outputId),
      storeDownloadArtifact: (ctx, input) =>
        assetsService.createTemporaryDownload(ctx, {
          name: input.name,
          bytes: input.bytes,
          mimeType: "application/zip",
        }),
      ports: {
        // 项目关联素材全量(VP-04 不挑不减):materialLinks entityType=asset。
        listMaterialAssets: (ctx, projectId) =>
          listAllProjectMaterialAssets(projectId, (query) =>
            materialLinksService.list(ctx, query),
          ),
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
            return blob
              ? { bytes: blob.bytes, mimeType: blob.mimeType }
              : null;
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
    publisher: createUnavailablePublisher(),
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
    // [T-724] register 身份判据 + imported 投影幂等收口均走 Projects 公共 service。
    // publication 换锚是核心事实；Projects 在自己的事务内归档所有 loser 投影并写 activity。
    resolveOutputOwner: (ctx, outputId) =>
      projectsService.getOutputOwnerSummary(ctx, outputId),
    reconcileImportedProjections: (ctx, input) =>
      projectsService.reconcileImportedProjections(ctx, input),
  });
  const publishing = createPublishingTransport(() => publishingService);

  // 数据底座(SPEC §1.4)「优先读真」接线 —— composition root 是唯一允许跨模块组合读的层。
  // 判据单一:projectsService.hasImportedProjects(ctx)(source='imported' 非空)。判据为真时,
  // 把 dashboard/复盘 的作品级读收窄到"真实导入作品"的 publication 集 —— 让演示 fixture 让位、
  // 界面直接出真值(治 dy-pub-00 假标题/0 播放);为假时(用户尚未拉真账号)三向回退全量
  // fixture 演示态(过渡期不破)。解析链:imported 项目 id → 批量 ContentOutput 引用 →
  // 批量 publication id,全程经公共 service 且保留 user/account 守卫,
  // 不跨模块直连 repo(守 SPEC §22)。定义在
  // projects/publishing service 之后、各读侧装配之前,供 dashboard/calibration 复用(无前向引用)。
  const resolveImportedPublicationIds = async (
    ctx: RequestContext,
  ): Promise<string[]> => {
    return resolveImportedPublicationIdsInBatch(ctx, {
      projects: projectsService,
      publishing: publishingService,
    });
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
  const trafficService=createTrafficService(db,{now:deps.now,publishing:publishingService});
  const publicationSyncService=createPublicationSyncService(db,{now:deps.now,assertPublication:(c,id)=>trafficService.assertPublication(c,id)});
  const ensureTrafficJob=(ctx:RequestContext)=>schedulingService.createJob(ctx,{name:'作品流量来源补采',sourceKind:'self.traffic',target:{mergedIntoSelfMetrics:true},schedule:'0 0 * * *',enabled:false,systemManaged:true});
  const startTrafficJob=async(ctx:RequestContext)=>{
    return startTrafficCollection(ctx,{snapshot:()=>trafficService.pending(ctx,2147483647),trigger:async()=>{const job=await ensureTrafficJob(ctx);return triggerScheduledJob(ctx,{...job,target:job.target??{}},triggerDeps);},fail:(rows,message)=>trafficService.failPending(ctx,rows,message)});
  };
  const analytics = createAnalyticsTransport(() => analyticsService,{
    getProject:(ctx,id)=>trafficService.getProject(ctx,id),
    refresh:async(ctx,id)=>{
      await ensureTrafficJob(ctx);
      const queued=await trafficService.enqueueProject(ctx,id);
      if(!(await trafficService.pending(ctx,1)).length)return {queued,jobRunId:null,aiTaskId:null};
      const run=await startTrafficJob(ctx);return {queued,jobRunId:run.jobRunId||null,aiTaskId:run.aiTaskId||null};
    },
  });

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
  const ingestionService = createIngestionService({
    deps,
    db,
    // [T-189a] 绑定成功回调:fire-and-forget 触发组合根 bootstrap(建 job + 初始化)。
    onDouyinBound: (ctx) => {
      void bootstrapDouyinOnBind(ctx).catch((error) =>
        console.error("[persistence-client] 绑定后初始化失败:", error),
      );
    },
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
        reconcileImportedProjections: (ctx, input) =>
          projectsService.reconcileImportedProjections(ctx, input),
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
    // [T-136 §D 切片 c] authDir **按号分目录**(douyinAuthDirFor(opts.accountId,undefined,opts.userId)):每号独立
    //   登录态,互不顶号;accountId 为 null → `_default` 回退(单号 / 未选号,兼容旧行为)。
    //   测试经各自的 createIngestionService 注入 fake,不连真浏览器。
    douyinFetch: {
      // [T-136 §D] fetchDouyinMetrics 现返回 { records, identity }(identity=登录用户自己的
      //   身份,抓不到 null)—— 直接透传;service 用真实昵称替占位「我的抖音」。
      // [T-326 B-04] douyin-cdp 懒加载:运行时被调时才 import(端口本就返回 Promise,语义不变)。
      fetch: async (opts) =>
        (await loadDouyinCdp()).fetchDouyinMetrics({
          capturedAt: opts.capturedAt,
          authDir: await douyinAuthDirFor(opts.accountId,undefined,opts.userId),
          gateway: douyinGateway, // [gate-F7 插装点②] creator-center 翻页限流(注真单例)
          knownAwemeIds: opts.knownAwemeIds, // [T-177] 翻页 early-stop 锚(undefined → 全量)
        }),
      login: async (opts) =>
        (await loadDouyinCdp()).loginDouyin({
          authDir: await douyinAuthDirFor(opts?.accountId,undefined,opts?.userId),
        }),
      // [T-546] 热点宝 OAuth 使用与该采集账号相同的持久 profile；只切换登录目标，
      // 不复制 cookie、不新建另一套账号保管逻辑。
      loginDouhot: async (opts) =>
        (
          await loadDouhotCdp()
        ).loginDouhot({
          authDir: await douyinAuthDirFor(opts?.accountId,undefined,opts?.userId),
        }).then((result) => result.loggedIn),
      // [T-330] 绑新号 staging 四步端口(service loginDouyinForceNew 编排;根治「绑新号命中
      //   当前号/_default 旧 sessionid → 二维码不出现直接登进旧号」):
      //   loginNew 在全新 `_staging-<token>` 空目录扫码(必出二维码);fetchIdentity 同步读回
      //   身份(轻量 maxPages=1,口径同 refresh 采集);adoptStaging 身份确认后整目录搬到
      //   `.auth/douyin/<accountId>`(已存在先删=登录态更新;EXDEV 回退 copy+rm);
      //   discardStaging 失败路径清理。token→路径映射收在此组合根,service 不碰文件路径。
      loginNew: async ({userId}) => {
        const stagingKey=createDouyinStagingToken();
        const identity=await profileAuthority.authorizeTemporary(userId,`_staging-${stagingKey}`);
        try{
          const loggedIn=await (await loadDouyinCdp()).loginDouyin({authDir:identity.authDir});
          return {loggedIn,stagingKey};
        }catch(error){
          await hostProfileLifecycle.withProfiles([identity.authDir],()=>discardDouyinStagingDir(identity.authDir)).then(()=>profileAuthority.forgetTemporary(`_staging-${stagingKey}`)).catch(()=>{});
          throw error;
        }
      },
      fetchIdentity: async opts => (await loadDouyinCdp()).fetchDouyinIdentity({authDir:await ownedStagingDir(opts.stagingKey,opts.userId)}),
      adoptStaging: async opts => {
        const source=await ownedStagingDir(opts.stagingKey,opts.userId),target=await douyinAuthDirFor(opts.accountId,undefined,opts.userId);
        await hostProfileLifecycle.withProfiles([source,target],()=>adoptDouyinStagingDir(source,target));
        profileAuthority.forgetTemporary(`_staging-${opts.stagingKey}`);
      },
      discardStaging: async opts => {
        const source=await ownedStagingDir(opts.stagingKey,opts.userId);
        await hostProfileLifecycle.withProfiles([source],()=>discardDouyinStagingDir(source));
        profileAuthority.forgetTemporary(`_staging-${opts.stagingKey}`);
      },
      // T-032a:被动状态探针 —— headless 快查登录态(不弹窗),设置页「账号绑定」徽标读它。
      status: async (opts) =>
        (await loadDouyinCdp()).checkDouyinStatus({
          authDir: await douyinAuthDirFor(opts?.accountId,undefined,opts?.userId),
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
  const knowledgeProposalAdoption = createKnowledgeProposalAdoptionService(db, deps.now);
  const assetTagProposalAdoption = createAssetTagProposalService(db, deps);
  const agenticProposalStaging = createAgenticProposalStagingService(db, { resolveLease: (c,id) => aiService.getExecutionLeaseReference(c,id), now:deps.now, prepareAssets: (c, ids) => assetTagProposalAdoption.prepare(c, ids) });
  const agenticProposalAdoption = createAgenticProposalAdoptionService(db, {
    knowledge: (c, proposal, tx) => knowledgeProposalAdoption.adopt(c, proposal, tx),
    assetTagsBatch: (c, proposals, tx) => assetTagProposalAdoption.adoptBatch(c, proposals, tx),
  }, deps.now);
  const linkAdoptedMaterial: Parameters<typeof createStructuredTargetAdoptionService>[1]["link"] = (c,input,tx)=>{
      const txDb=tx as unknown as Db;
      const txProjects=createProjectsService(createProjectRepository(txDb),deps);
      const txAssets=createAssetsService(createAssetRepository(txDb,deps),objectStorageForCtx,deps);
      return createMaterialLinksService({db:txDb,...deps,
        assertProjectOwned:async(context,id)=>{await txProjects.listOutputIdsByProject(context,id);},
        assertAssetOwned:async(context,id)=>{
          const asset=await txAssets.getAsset(context,id);
          if(asset.status!=="active")throw new Error("素材已不可用，请重新选择素材");
          return asset;
        },
      }).create(c,input);
    };
  const generatedAssetAdoption=createGeneratedAssetAdoptionService(db,{link:linkAdoptedMaterial},deps.now);
  const structuredTargetAdoption = createStructuredTargetAdoptionService(db, {
    enrichCard(c,id,card,tx){
      const txProjects=createProjectsService(createProjectRepository(tx as unknown as Db),deps);
      return createCandidateService({db:tx as unknown as Db,...deps,
        projects:{createProject:(context,input)=>txProjects.createProject(context,input)},
        ingestion:{assertRunExists:async(context,runId)=>{await ingestionService.getRun(context,runId);}},
      }).enrichCard(c,id,card);
    },
    link:linkAdoptedMaterial,
  },deps.now);
  const calibrationPositioningAdoption=createCalibrationPositioningAdoptionService(db,{
    async assertSubject(c,type,id,tx){
      const txDb=tx as unknown as Db;
      if(type==="publication")return createPublishingService({db:txDb,...deps,publisher:createUnavailablePublisher()}).getPublication(c,id);
      const owner=await createProjectsService(createProjectRepository(txDb),deps).getOutputOwnerSummary(c,id);
      if(!owner)throw new OwnershipError("诊断作品不存在");
      return owner;
    },
    createDraftPrediction(c,input,tx){
      return createCalibrationService({db:tx as unknown as Db,...deps,
        ingestion:{assertRunExists:async(context,id)=>{await ingestionService.getRun(context,id);},ensureManualRun:(context,key)=>ingestionService.ensureManualRun(context,key)},
        learnings:{adjustConfidence:async()=>{}},
      }).createDraftPrediction(c,input);
    },
    lockPositioning:lockPositioningAdoptionAccount,
    upsertProfile(c,input,tx){
      return createPositioningService({db:tx as unknown as Db,...deps,projects:{getProjectSubject:async(context,id)=>{
        const row=await createProjectsService(createProjectRepository(tx as unknown as Db),deps).getProjectOverviewCore(context,id);return {title:row.project.title,brief:row.project.brief};
      }}}).upsertProfile(c,input);
    },
    createStatementVersion(c,input,tx){
      return createPositioningService({db:tx as unknown as Db,...deps,projects:{getProjectSubject:async(context,id)=>{
        const row=await createProjectsService(createProjectRepository(tx as unknown as Db),deps).getProjectOverviewCore(context,id);return {title:row.project.title,brief:row.project.brief};
      }}}).createStatementVersion(c,input);
    },
  },deps.now);
  const researchMaterialAdoption=createResearchMaterialAdoptionService(db,{
    assertProject(c,id,tx){return createProjectsService(createProjectRepository(tx as unknown as Db),deps).getProjectOverviewCore(c,id);},
    createKnowledge(c,input,tx){return createKnowledgeService(createKnowledgeRepository(tx as unknown as Db,deps)).createKnowledge(c,input);},
    linkKnowledge(c,input,tx){
      const txDb=tx as unknown as Db;
      const txProjects=createProjectsService(createProjectRepository(txDb),deps);
      const txKnowledge=createKnowledgeService(createKnowledgeRepository(txDb,deps));
      return createMaterialLinksService({db:txDb,...deps,
        assertProjectOwned:async(context,id)=>{await txProjects.listOutputIdsByProject(context,id);},
        assertKnowledgeOwned:(context,id)=>txKnowledge.getKnowledge(context,id),
      }).create(c,input);
    },
  },deps.now);
  const createTopicCandidateInTransaction: import("@creatoros/backend/modules/ai").DailyTopicCompletionPorts["createCandidate"] = (c,input,tx) => {
      const txDb=tx as unknown as Db;
      const txProjects=createProjectsService(createProjectRepository(txDb),deps);
      const txPositioning=createPositioningService({db:txDb,...deps,projects:{getProjectSubject:async(context,id)=>{const row=await txProjects.getProjectOverviewCore(context,id);return {title:row.project.title,brief:row.project.brief};}}});
      return createCandidateService({db:txDb,...deps,
        projects:{createProject:(context,value)=>txProjects.createProject(context,value)},
        ingestion:{assertRunExists:async(context,id)=>{await ingestionService.getRun(context,id);}},
        positioning:{evaluateFit:async(context,subject)=>{
          try{return (await txPositioning.evaluateGate(context,{subjectType:"candidate",subjectId:"candidate-inline",candidate:{title:subject.title,angle:subject.angle,contentRole:subject.contentRole??undefined,productAnchorId:subject.productAnchorId??undefined}})).positioningFit;}catch{return null;}
        }},
      }).createFromAIResult(c,input);
  };
  const topicCandidateAdoption=createTopicCandidateAdoptionService(db,{
    assertProject(c,id,tx){return createProjectsService(createProjectRepository(tx as unknown as Db),deps).getProjectOverviewCore(c,id);},
    createFromAIResult:createTopicCandidateInTransaction,
  },deps.now);
  const aiService = createAiService({
    prepareChatReply:(ctx,snapshot)=>{
      if(stoppingPreparation)throw new Error("应用正在停止，无法启动新聊天");
      void chatRuntime.durable;
      return prepareChatReply(chatRuntime,ctx,snapshot);
    },
    assertChatProject:(ctx,id)=>projectsService.getProjectOverviewCore(ctx,id),
    projectTranscriptionTargets:createProjectTranscriptionTargetService(),
    scriptDraftTargets:createScriptDraftTargetService({now:deps.now,nextId:deps.nextId}),
    topicCandidates:topicCandidateAdoption,
    researchMaterials:researchMaterialAdoption,
    calibrationPositioning:calibrationPositioningAdoption,
    generatedAssets:generatedAssetAdoption,
    structuredTargets: structuredTargetAdoption,
    agenticProposals: agenticProposalAdoption,
    db,
    now: deps.now,
    nextId: deps.nextId,
    resolveTaskRuntimeData: async (ctx, taskType, inputData) => {
      // 纯 ASR 使用业务提交冻结的音源/配置及按次凭据，不申请文本 Skill。
      if(taskType==="benchmark.transcribe")return {};
      if (!resolveEffectiveSkillSnapshotForRuntime) {
        throw new Error(
          "[T-513] Effective Skill snapshot resolver 尚未完成装配",
        );
      }
      const requiredSkillIds = requiredSkillIdsForTask(taskType, inputData);
      const modelAuthority = pinModelAuthority(
        await readChannelModelAuthority(),
      );
      return {
        skillSnapshot: await resolveEffectiveSkillSnapshotForRuntime(
          ctx,
          requiredSkillIds,
        ),
        modelAuthority: modelAuthority.authority,
        modelAuthorityDigest: modelAuthority.digest,
      };
    },
    artifacts: {
      createVersion: (ctx, artifactId, input) =>
        artifactsService.createVersion(ctx, artifactId, input),
      adoptThesisCandidate: createThesisAdoption(db,deps),
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
    publishing: createPlatformDraftAdoptionPort(publishingService),
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
    const liveModelAuthority = pinModelAuthority(
      await readChannelModelAuthority(),
    );
    if (
      !matchesPinnedModelAuthority(runtimeData, liveModelAuthority)
    ) {
      await aiService.cancelTask(
        ctx,
        taskId,
        "模型配置已变化，请重新发起",
      );
      return;
    }
    await taskModelAuthorityScope.run(liveModelAuthority, () =>
      runWithEffectiveSkillSnapshot(skillSnapshot, async () => {
      const execution = await aiService.runClaimedTaskExecution(
        ctx,
        taskId,
        async ({ signal }) => {
          await execute(signal);
        },
      );
      // 第二个同 attempt/同 task dispatch 竞争失败是正常幂等命中，不能再调用模型。
      if (!execution.claimed) return;
      }),
    );
  };
  const aiBase = createAiTransport(() => aiService);

  const readCurrentScriptRefForReview = async (
    ctx: RequestContext,
    projectId: string,
  ): Promise<{ artifactId: string | null; artifactVersion: number }> => {
    const artifacts = await artifactsService.listProjectArtifacts(ctx, projectId);
    const target = selectReadableProjectScriptArtifact(artifacts);
    if (!target) return { artifactId: null, artifactVersion: 0 };
    const versions = await artifactsService.listVersions(ctx, target.id);
    const current = versions
      .slice()
      .sort((a, b) => b.versionNumber - a.versionNumber)[0];
    return {
      artifactId: target.id,
      artifactVersion: current?.versionNumber ?? 0,
    };
  };

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
    script: { getCurrentScriptRef: readCurrentScriptRefForReview },
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
      listWorkIds: async (ctx) => {
        const rows = await projectsRepo.list(ctx);
        return rows.map((row) => row.id);
      },
    },
    // T-652 复用全局唯一的联网检索端口。闭包只在用户显式点击“联网补充”后执行；
    // service 只传用户确认过的短 query，不会拼接访谈答案、作品或账号资料。
    research: {
      // 定位前采是面向普通用户的内置能力：固定走随包浏览器检索，不读取已经
      // 从设置 UI 隐藏的 web.search/search.default 旧配置。否则本机残留一个
      // 失效 provider 时会在打开浏览器前直接报错，且无法自动回退(T-686)。
      search: (ctx, query, opts) =>
        positioningResearchSearchPort(ctx, query, opts),
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
  // [T-578/T-595] 定位投影直接消费源边界归一后的 publication 域，
  // 只保留有真实 publishedAt 的 published 行并按其新→旧。
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
        publishingService.listPublicationsByOutputIds(ctx, outputIds),
    });
  const positioningWorksReader = { listProjects: listPositioningWorks };
  const readProjectRadarDraftSeed = async (
    c: RequestContext,
    projectId: string,
  ): Promise<string | null> => {
    const project = await projectsRepo.get(c, projectId);
    return contentRadarDraftSeedOf(project.briefDetail);
  };

  // 复盘对象 reader 工厂 (T-039a) —— 读「本次复盘的这一条作品」的真材料(标题/文案/数据/评论),
  // 供 review.analyze 路径(后端 task runner + ChatBox 对话复盘)注入 review.insights prompt,让复盘
  // 扣住真实内容归因而不是账号级泛论。全部 best-effort、诚实空兜底(读不到 → 空,绝不塞假),且**复用
  // 数据底座既有读法**:标题走 projectsRepo.get(带 ownership 门),文案走 output_script transcript
  // artifact(与 reconstruct-runner 的 getTranscript 同法),数据走 analytics 最新 snapshot rawMetrics
  // (播放优先 views 回退 plays,与 dashboard 同口径),评论走 candidateService.listSignals 里 source
  // 含 comment 的信号。绑到 creative-context 的 ReviewSubjectReader 端口。
  const makeReviewSubjectReader = () => createReviewSubjectContext({trafficService,projectsService,publishingService,analyticsService,candidateService,artifactsService,selectReadableProjectScriptArtifact,readProjectRadarDraftSeed});

  // [T-270] 立项 Brief reader 工厂(单一真值)—— 读项目 brief_detail jsonb 的全核心字段(画幅 +
  // 核心信息/内容目标/内容形式/目标受众/成功标准),供 creative-context 渲成立项硬锚段。dispatch 路径
  // script.draft 与对话路径(runtime.context → chat)共用同一份读法,不造影子。
  // 病根:此前 dispatch 内联 briefReader 只投影 orientation + 对话路径根本没绑 brief → brief 核心字段
  // 从读取端就被丢。best-effort:读不到 → null(绝不阻塞写文案)。
  const makeBriefReader = () => createBriefContext({projectsService});

  // [T-146 切片 c/d] 项目素材 reader —— 读**当前项目**挂载的用户上传 document 素材(带 per-project
  // priority + 文档抽取投影),供写文案(script.draft)硬约束注入 + 搜索(gatherMaterials)深度结合。
  // 读法:materialLinksService.list(projectId) → 取 entityType='asset' 的边(带 priority)→ 逐个
  // assetsService.getAsset + listFilesByIds 取当前文件(materialSummary 在 mediaMetadata)→ 组装
  // ProjectMaterial。只保留 document 类且解析成功/有内容的(失败/非文档不进,不冒充可读)。全程 best-
  // effort:任一素材读失败只跳过该条(不牵连其它、不阻断节点)。与既有 assetsReader/复盘 reader 同
  // 「per-ctx 公开 service 读法」,不造影子 repo。
  const makeProjectMaterialsReader = () => createProjectMaterialsContext({assetsService,materialLinksService});

  const makeGenerationReaders = () => createGenerationContextReaders({candidateService,assetsService,knowledgeService,positioningService,learningsService,platformAccountService,projectIntelligenceReferences,knowledgeSearchRuntime,makeBriefReader,makeReviewSubjectReader,makeProjectMaterialsReader,thesisReader,contractReader,outlineReader,artifactOriginReader});

  // 创建只负责唤醒对应执行 owner；租约与冻结快照由该 owner 领取一次。
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
        // 幂等命中终态或在途任务只回读，不重新领取、取消或覆盖原结果。
        if (task.status !== "queued") return res;
        const execution = task.taskType==="benchmark.transcribe" && task.status==="queued"
          ? benchmarkTranscription.prepare(ctx,String(task.id)).then(mapped=>{recoveryWake?.wake("benchmark");return mapped;})
          : task.taskType==="transcribe.douyin" && task.status==="queued"
          ? dispatchTranscribeTask(ctx,String(task.id))
          : task.taskType==="asset.generate" && task.status==="queued"
          ? dispatchAssetTask(ctx,String(task.id))
          : agenticBusiness.supports(String(task.taskType)) && task.status === "queued"
          ? (agenticWorker ? agenticBusiness.prepare(ctx,String(task.id)).then(()=>{agenticWorker.start();}) : Promise.reject(new Error("自主执行服务未就绪，请修复或更新应用")))
          : businessExecution.supports(String(task.taskType)) && task.status === "queued"
          ? (modelWorker ? businessExecution.prepare(ctx,String(task.id)).then(()=>{modelWorker.start();}) : Promise.reject(new Error("生成服务未就绪，请修复或更新应用")))
          : String(task.taskType).startsWith("scheduled.")
          ? dispatchScheduledCollection(ctx,{id:String(task.id),taskType:String(task.taskType),inputData:(task.inputData??{}) as Record<string,unknown>})
          : Promise.reject(new Error(`任务类型未注册执行服务：${String(task.taskType)}`));
        void execution.catch(async (error) => {
          if(stoppingPreparation)return;
          const message =
            error instanceof Error ? error.message : String(error);
          await aiService
            .markFailed(ctx, String(task.id), message)
            .catch(() => undefined);
        });
      }
      // 公开 CLI 和页面共用持久聊天 Worker；此时消息与 chat.run 已原子提交。
      if (endpoint.id === "ai.conversations.messages.create" && ctx) {
        const message = (res as {data:{modelMetadata?:{chatTaskId?:unknown}}}).data;
        if(typeof message.modelMetadata?.chatTaskId!=="string")throw new Error("聊天任务未保存");
        chatRuntime.durable.start();
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
    // [T-712] 成片抽帧视觉审核复用既有 asset.classify/vision.default。只在已配置时
    // 调一次受控 VLM 端口；未配置返回 null，executor 记录 skipped 且不阻断成片。
    videoVisualReview: async (c, input) => {
      let spec;
      try {
        spec = await resolveMultimodalSpecFn(c, "asset.classify", {
          getModelConfig: (cc: RequestContext, cap: string) =>
            settingsService.getModelConfig(cc, cap),
          env: process.env,
          getChannelModelConfig,
          getChannelModelCredential: (serviceId) =>
            getChannelModelCredential(c, serviceId),
          getChannelModelSelection: (capability) =>
            getChannelModelSelection(c, capability),
        });
      } catch (err) {
        if (err instanceof Error && err.name === "MultimodalConfigError") return null;
        throw err;
      }
      const { describeImageOpenAICompatible } = await import(
        "@creatoros/ai-worker"
      );
      return describeImageOpenAICompatible(spec, input);
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
      confirmTask: (c, taskId) => aiService.confirmTask(c, taskId),
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
    // (agentic 执行器在下方配置解析就绪后追加注册；请求期才读取)。
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
      contentRole?: "traffic" | "trust" | "conversion" | null;
      card?: {
        oneLiner?: string;
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
    similarity:createScriptSimilarityEvaluator({
      tasks:persistentTaskService,references:projectIntelligenceReferences,ai:aiService,
      prepare:(c,id)=>businessExecution.prepare(c,id),
      wake:()=>{if(!modelWorker)throw new Error("生成服务未就绪");modelWorker.start();},
    }),
  });
  const intelligenceGeneration=createIntelligenceGenerationBridge(db,{
    entryPath:resolveIntelligenceGenerationWorkerPath,tasks:persistentTaskService,resolveModelSpec:(c,capability)=>resolveModelSpec(c,capability),
    resolveSkillSnapshot:(c,ids)=>{
      if(!resolveEffectiveSkillSnapshotForRuntime)throw new Error("Skill 服务未就绪");
      return resolveEffectiveSkillSnapshotForRuntime(c,ids);
    },now:deps.now,
  });
  const {projectScriptGenerator,topicPreviewGenerator}=intelligenceGeneration;
  let recoveryWake:ReturnType<typeof createRecoveryWakeCoordinator>|undefined;
  const projectScriptRunnerDeps={tasks:persistentTaskService,references:projectIntelligenceReferences,generator:projectScriptGenerator};
  const topicPreviewRunnerDeps = {
    tasks: persistentTaskService,
    intelligence: intelligenceService,
    generator: topicPreviewGenerator,
  };
  const transcriptSourceRecovery=createTranscriptSourceRecoveryService(db,deps);
  const radarProjectQueue = createRadarProjectQueueService({
    tasks: persistentTaskService, intelligence: intelligenceService,
    assertPositioning: (c, id) => positioningService.getStatement(c, id),
    projects: createRadarProjectService(db, deps),
    recoverSourceCooldown:(c,id)=>transcriptSourceRecovery.recoverReferenced(c,id),
  });
  const intelligenceBase = createIntelligenceTransport(
    () => intelligenceService,
    () => projectIntelligenceReferences,
    () => projectScriptCandidates,
    () => radarProjectQueue,
  );
  const fetchIntelligenceFeed = async (url: string, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    let current = url;
    let discoveredFeed = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      for (let hop = 0; hop <= 6; hop += 1) {
        await assertUrlAllowed(current);
        const response = await fetch(current, {
          signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
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
      signal,
    }) => {
      const rows = await (await loadDouyinCdp()).fetchDouyinUserPosts({
        authDir: await douyinAuthDirFor(collectorAccountId, signal),
        secUid: externalAccountId,
        signal,
        maxPages: 100,
        strictEvidence: true,
        gateway: douyinGateway,
      });
      return rows;
    },
    fetchFavoriteWorks: async ({ ctx, collectorAccountId, folderId, signal }) => {
      const cdp = await loadDouyinCdp();
      const authDir = await douyinAuthDirFor(collectorAccountId, signal);
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
          signal,
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
        signal,
        maxItems: 1_000,
        strictEvidence: true,
        gateway: douyinGateway,
        diagnostics,
      });
    },
    readWeb: async ({ ctx, url, signal }) => {
      const domain = webDomainFromUrl(url);
      return readWebUrlSidecar(
        url,
        { authDir: webAuthDirFor(domain), signal },
        {
          openContext: () =>
            openPooledReaderContext(ctx, domain, { signal }) as never,
        },
      );
    },
    fetchFeed: ({ url, signal }) => fetchIntelligenceFeed(url, signal),
    parseFeed,
    fetchDouhot: async ({ collectorAccountId, keyword, board, signal }) =>
      (await loadDouhotCdp()).fetchDouhotLowFollowerBreakout({
        authDir: await douyinAuthDirFor(collectorAccountId, signal),
        keyword,
        board,
        signal,
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
    onTranscriptTasksQueued: (_ctx:RequestContext,taskIds:string[]):void=>{
      if(taskIds.length)recoveryWake?.wake("transcribe");
    },
    fetcher: {
      fetch: async (
        ctx: RequestContext,
        input: { shareText: string; capturedAt: string; signal?:AbortSignal },
      ) => {
        const cdp = await loadDouyinCdp();
        const target = await cdp.resolveDouyinShareTarget(input.shareText,{signal:input.signal});
        const parsed = await cdp.fetchDouyinSharedItem({
          signal:input.signal,
          awemeId: target.awemeId,
          canonicalUrl: target.canonicalUrl,
          authDir: await douyinAuthDirFor(ctx.accountId,input.signal,ctx.userId),
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
      recoveryWake?.wake("source_sync");
    }
  };
  const intelligence: Transport = createIntelligenceApplicationTransport({intelligenceBase,
getCollectorAccount:(ctx,id)=>requirePlatformAccountServiceForCollectors().getAccount(ctx,id),
previewProfile:async (collectorAccountId:string, externalAccountId:string, canonicalUrl:string)=>(
          await loadDouyinCdp()
        ).previewDouyinUserProfile({
          authDir: await douyinAuthDirFor(collectorAccountId),
          secUid: externalAccountId,
          canonicalUrl,
          maxPages: 1,
          strictEvidence: true,
          gateway: douyinGateway,
        }),
readFavoriteFolders:async (ctx:RequestContext, collectorAccountId:string)=>(
          await loadDouyinCdp()
        ).fetchDouyinCollectsFolders({
          authDir: await douyinAuthDirFor(collectorAccountId),
          strictEvidence: true,
          gateway: douyinGateway,
          diagnostics: {
            requestId: ctx.requestId,
            accountId: collectorAccountId,
          },
        }),
fetchIntelligenceFeed,
isSyndicationFeed,
readWeb:(ctx,url)=>{const domain=webDomainFromUrl(url);return readWebUrlSidecar(url,{authDir:webAuthDirFor(domain)},{openContext:()=>openPooledReaderContext(ctx,domain) as never});},
isLoginRequiredError:error=>error instanceof WebReaderLoginRequiredError,
wake:kind=>recoveryWake?.wake(kind),
canWakeTranscript:()=>Boolean(intelligenceTranscriptRunnerDeps),
dispatchIntelligenceRun});
  // T-598：内容雷达不再自建 timer。到期发现由下方唯一 automation-driver 触发
  // `intelligence.sync`；本段只保留用户手动操作产生的持久 source_sync runner。

  // live dispatch 范式(MEMORY 铁律):create 落 queued 后 fire-and-forget 后台编排,
  // HTTP 立即返回,UI 轮询 execution.tasks.get / ai.tasks.steps.list。
  const execution: Transport = {
    async request(endpoint, input, ctx) {
      const res = await executionBase.request(endpoint, input, ctx);
      if(endpoint.id==="execution.tasks.command")recoveryWake?.wake();
      if (endpoint.id === "execution.tasks.create" && ctx) {
        const task = (
          res as { data?: { id?: string; status?: string; spec?: unknown } }
        ).data;
        if (task && typeof task.id === "string" && task.status === "queued") {
          const executionTaskId = task.id;
          const pending=agenticBusiness.supports(`exec.${(task.spec as {taskType?:string}|undefined)?.taskType}`)
            ? (agenticWorker ? agenticBusiness.prepare(ctx,executionTaskId).then(()=>{agenticWorker.start();}) : Promise.reject(new Error("自主执行服务未就绪，请修复或更新应用")))
            : runTaskWithEffectiveSkillSnapshot(ctx, executionTaskId, () =>
            runExecutionTask(
              ctx,
              { id: executionTaskId, inputData: { spec: task.spec } },
              {
                ai: aiService,
                assets: {
                  materializeAsset: (c, assetId, destinationPath) =>
                    assetsService.materializeAsset(c, assetId, destinationPath),
                },
                registry: executorRegistry,
                workspacesRoot: executionWorkspacesRoot,
              },
            ),
          );
          void pending.catch(async (error) => {
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
        const center = await positioningService.readPositioningCenter(ctx);
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
      void topicPreferenceSubmission.submit(ctx).catch((err) => {
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
      contentRole: input.contentRole,
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
  // [T-136 §D 切片 c] 抖音 authDir **按号分目录**:采集器内用 douyinAuthDirFor(ctx.accountId,undefined,ctx.userId)
  //   逐调解析(每号独立登录态,与 douyinFetch 端口同源、同 base)。评论 / 明细采集直连
  //   fetchDouyinComments*/Export,故在此按当前号拼路径(不像 refresh 走端口透传)。

  // [T-078] 每轮封面回填上限(env 可调,验证/降载用;非法值回默认)。
  const resolveCoverBackfillLimit = (): number => {
    const raw = Number(process.env.CREATOROS_COVER_BACKFILL_LIMIT);
    return Number.isFinite(raw) && raw > 0
      ? Math.floor(raw)
      : DEFAULT_COVER_BACKFILL_LIMIT;
  };

  // 2 GiB 既有输入上限在最小云端分片下最多 925 次请求；保留本地回退及恢复余量。
  const asrResourceDeps:Omit<Parameters<typeof createIntelligenceTranscriptBridge>[1],"entryPath"|"tasks">={
    // ASR 最小分片限额(Qwen) raw=2,324,982；MP3 帧≤1,441 B，2 GiB 输入≤925片。
    // 2048覆盖925云请求+1本地回退并留同规模恢复余量；原token/时限与已冻结预算不重置。
    budget:{maxCalls:2048,maxTokens:1_000_000,deadlineMs:1_800_000},objectStorageForCtx,now:deps.now,
    resolveSpec:c=>resolveTranscribeRuntimeSpec(c),
    prepareSpec:(c,spec,input)=>prepareManagedTranscribeSpec(c,spec,input),
    async readSource(c,awemeId,signal){
      const cdp=await loadDouyinCdp();
      const source=await cdp.fetchDouyinVideoSource({awemeId,authDir:await douyinAuthDirFor(c.accountId,signal,c.userId),gateway:douyinGateway,signal});
      return source.kind==="image-album"?{kind:"image-album" as const}:{kind:"video" as const,playUrl:source.playUrl};
    },
    extractAudio:async(playUrl,signal)=>(await loadDouyinCdp()).streamAudioFromVideo(playUrl,undefined,signal),
  };
  const intelligenceTranscriptBridge=createIntelligenceTranscriptBridge(db,{...asrResourceDeps,entryPath:resolveIntelligenceTranscriptWorkerPath,tasks:persistentTaskService});
  const benchmarkTranscription=createBenchmarkTranscriptionService(db,{...asrResourceDeps,ai:aiService,entryPath:resolveIntelligenceTranscriptWorkerPath,wake:()=>recoveryWake?.wake("benchmark")});
  const scheduledSignals=new AsyncLocalStorage<AbortSignal>();
  const checkScheduledSignal=()=>scheduledSignals.getStore()?.throwIfAborted();
  const scheduledFlywheel=createScheduledFlywheelExecutionService(db,{
    entryPath:resolveFlywheelWorkerPath,resolveModelSpec:(c,capability)=>resolveModelSpec(c,capability),
    // 收藏每轮 3 条 × 至多 29 个知识分块；预算同时覆盖 ASR、判库与结构修复。
    // 每轮最多 3 条收藏；覆盖音频分片、知识分块和有界修复，仍服从 token/截止时间。
    budget:{maxCalls:6144,maxTokens:8_000_000,deadlineMs:1_800_000},now:deps.now,
    createFavoritesAsr:runWorker=>createScheduledFavoritesAsrService(db,{...asrResourceDeps,runWorker}),
  });
  const flywheelSourceKinds=new Set(["benchmark","self.detail","self.metrics","self.traffic","favorites"]);

  intelligenceTranscriptRunnerDeps = {tasks:persistentTaskService,intelligence:intelligenceService,transcript:intelligenceTranscriptBridge.transcript,sourceRecovery:transcriptSourceRecovery};

  const scheduledCollectors: Record<string, ScheduledCollector> = {
    "intelligence.sync": async (ctx, _target, report) => {
      report({
        stage: "radar_scan",
        processed: 0,
        total: null,
        message: "检查当前账号已到期的内容雷达来源",
      });
      const enqueued = await intelligenceService.enqueueDueSourceRuns(ctx);
      let processed = 0;
      // source_sync 共用每轮 5 条的恢复队列；剩余任务由周期唤醒继续领取。
      for (let batchNo = 0; batchNo < 10; batchNo += 1) {
        const batch = Number(await recoveryWake?.run("source_sync") ?? 0);
        processed += batch;
        if (batch < 5) break;
      }
      report({
        stage: "radar_sync",
        processed,
        total: enqueued,
        message: `已排队 ${enqueued} 个到期来源，完成 ${processed} 个来源任务`,
      });
      return {
        itemsNew: enqueued,
        itemsUpdated: processed,
        message:
          enqueued === 0
            ? "当前账号没有到期来源"
            : `已统一调度 ${enqueued} 个来源`,
      };
    },
    // 评论:fetchDouyinComments(target)→ ingestComments(D2 的纯 ports 落库:建 run → 逐条经
    // ux_ingestion_records_run_key 去重 → candidateService.ingestAudienceSignal(source=
    // "comment",带 ingestionRunId,C-4)→ completeRun)。itemsNew=written(新写信号数);
    // 评论只新写不更新 → itemsUpdated 恒 0。
    comments: createCommentsCollector({sync:publicationSyncService,db,deps,checkScheduledSignal,ingestionService,candidateService,publishingService,analyticsService,
readComments: async (ctx,awemeId,options)=>(await loadDouyinCdp()).fetchDouyinComments({awemeId,maxPages:options.maxPages,authDir:await douyinAuthDirFor(ctx.accountId,scheduledSignals.getStore(),ctx.userId)},{gateway:douyinGateway,commentWatermark:options.commentWatermark}),
readCommentsForWorks:async(ctx,awemeIds,options)=>(await loadDouyinCdp()).fetchDouyinCommentsForWorks(awemeIds,{authDir:await douyinAuthDirFor(ctx.accountId,scheduledSignals.getStore(),ctx.userId),maxPages:options.maxPages},{gateway:douyinGateway,commentWatermark:options.commentWatermark,onWorkComplete:options.onWorkComplete})}),
    // 作品明细导出(T-030-D8a,SPEC §9b):fetchDouyinWorkListExport(headless 复用 .auth/ →
    // 导航数据中心作品分析 → 点「刷新数据」+「导出数据」→ 截 xlsx 校验 PK 头)→ parseDouyin
    // WorkListXlsx(16 字段容错解析)→ 按 title/pub_date 匹配 publication(无 aweme_id 维度,
    // 匹配不上跳过)→ toDetailMetricRecords → ingestMetrics(resolvePublication→appendSnapshot,
    // rawMetrics 带完播/封面CTR/5s完播/2s跳出/主页访问 → 复盘核心指标从 0/fixture 变真)。
    // 未登录 → DouyinNotLoggedInError(runner catch → needs_reconnect,§6);导出非 xlsx →
    // DouyinExportError(普通失败)。itemsNew=真写入快照数;明细快照 append-only → itemsUpdated 0。
    "self.traffic":createTrafficCollector({service:trafficService,checkSignal:checkScheduledSignal,isNotLoggedIn:error=>error instanceof DouyinNotLoggedInError,read:async(ctx,awemeId)=>(await loadDouyinCdp()).fetchDouyinTraffic({awemeId,authDir:await douyinAuthDirFor(ctx.accountId,scheduledSignals.getStore(),ctx.userId),signal:scheduledSignals.getStore(),gateway:douyinGateway})}),
    "self.detail": createSelfCollector({sync:publicationSyncService,resolvePublication:(c,externalId)=>publishingService.resolvePublication(c,{platform:"douyin",externalId}),projectsService,
 enqueueTraffic:async(ctx,ids)=>{await ensureTrafficJob(ctx);await trafficService.enqueueVisible(ctx,ids);if((await trafficService.pending(ctx,1)).length)await startTrafficJob(ctx);},
publishingService,
analyticsService,
ingestionService,
assetsService,
artifactsService,
materialLinksService:()=>materialLinksService,
topicAttributionService,
candidateService,
learningsService,
positioningService,
now:deps.now,
models:scheduledFlywheel.models,
checkScheduledSignal,
assertAttributionConfigured:c=>resolveModelSpec(c,"topic.attribution"),
makeReviewSubjectReader,
ai,
createAiTaskAttemptId,
resolveCoverBackfillLimit,
configuration:{CREATOROS_TRANSCRIBE_BACKFILL_BATCH_LIMIT:process.env.CREATOROS_TRANSCRIBE_BACKFILL_BATCH_LIMIT,CREATOROS_LEARNING_GROUNDING_MIN_METRICS:process.env.CREATOROS_LEARNING_GROUNDING_MIN_METRICS,CREATOROS_TOPIC_ATTRIBUTION_LIMIT:process.env.CREATOROS_TOPIC_ATTRIBUTION_LIMIT,CREATOROS_ATTRIBUTION_VIRAL_MULTIPLE:process.env.CREATOROS_ATTRIBUTION_VIRAL_MULTIPLE,CREATOROS_ATTRIBUTION_LOW_MULTIPLE:process.env.CREATOROS_ATTRIBUTION_LOW_MULTIPLE},
readMetrics: async (ctx: RequestContext, capturedAt: string) => (await loadDouyinCdp()).fetchDouyinMetrics({
        signal:scheduledSignals.getStore(),
        capturedAt,
        authDir: await douyinAuthDirFor(ctx.accountId,scheduledSignals.getStore(),ctx.userId),
        gateway: douyinGateway,
        // 公开恢复必须能重新发现，不能被当前库里的 knownAwemeIds 提前截断。
        knownAwemeIds: undefined,
      }),
readExport: async (ctx: RequestContext) => (await loadDouyinCdp()).fetchDouyinWorkListExport(
          { signal:scheduledSignals.getStore(), authDir: await douyinAuthDirFor(ctx.accountId,scheduledSignals.getStore(),ctx.userId) }, // [T-136] 按当前号登录态
          { gateway: douyinGateway },
        ),
readCover: async (ctx: RequestContext, awemeId: string) => (await loadDouyinCdp()).fetchDouyinCoverUrl({
              signal:scheduledSignals.getStore(),
              awemeId,
              authDir: await douyinAuthDirFor(ctx.accountId,scheduledSignals.getStore(),ctx.userId),
              gateway: douyinGateway,
            }),
downloadDouyinImage,
parseDouyinWorkListXlsx}),
    // [T-212a] 对标他号采集:读该号 enabled 对标源 → 逐源抓公开作品列表(fetchDouyinUserPosts:
    //   sec_uid 主页 aweme/post,只读公开统计)→ detectViral 筛爆款 → 每源 ≤10 条落 benchmark_works
    //   (拆解状态=待拆,供 T-212c)。降频(源间 sleep ≥1.5s)、单源失败跳过、限流网关已接(gateway
    //   在 fetchDouyinUserPosts 内每页 acquire)。空源 → 诚实 0 跑(非失败)。
    benchmark: createBenchmarkCollector({
benchmarkService,
intelligenceService,
candidateService,
positioningService,
now: deps.now,
models: scheduledFlywheel.models,
fetchSourcePosts: async (c, source) => {
          const works = await (await loadDouyinCdp()).fetchDouyinUserPosts(
            {
              signal:scheduledSignals.getStore(),
              authDir: await douyinAuthDirFor(c.accountId,scheduledSignals.getStore(),c.userId), // [T-136] 按当前号登录态指纹
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
searchVideos: async (c, keyword) => {
            const videos = await (await loadDouyinCdp()).fetchDouyinSearchVideos(
              {
                signal:scheduledSignals.getStore(),
                authDir: await douyinAuthDirFor(c.accountId,scheduledSignals.getStore(),c.userId), // [T-136] 按当前号登录态
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
darkhorseKeywords: process.env.CREATOROS_DARKHORSE_KEYWORDS ?? "",
checkScheduledSignal
}),
    // [T-235c] 旧指定收藏夹采集兼容链：只供迁移前存量任务读取；新来源统一在内容雷达登记。
    //   收藏夹列表按 name 精确匹配(回填 collectsId + lastSyncedAt)→ 逐匹配夹拉夹内视频
    //   (≤50/夹)→ favorites_items 幂等台账((user, aweme_id) 去重只插新)→ **≤3/run 限量进池**
    //   (照 benchmark-teardown maxPromotePerRun 语义,防灌库)→ createCandidate(source=favorites)
    //   + markItemPromoted 溯源。**只采登记的指定夹,不碰其他收藏**(隐私红线)。
    //   诚实降级:无登记夹 → 0 跑 + 引导 message(非失败);抖音上找不到同名夹 → message 点名;
    //   验证码 → fetch 函数内返空跳过。未登录 → DouyinNotLoggedInError 直接上抛(runner
    //   isNotLoggedInError → needs_reconnect,与 self.metrics/comments 同款路径)。
    favorites: createFavoritesCollector({
favoritesService,
intelligenceService,
candidateService,
now: deps.now,
models: scheduledFlywheel.models,
readFolders: async (ctx: RequestContext) => (await loadDouyinCdp()).fetchDouyinCollectsFolders({
              signal:scheduledSignals.getStore(),
        authDir: await douyinAuthDirFor(ctx.accountId,scheduledSignals.getStore(),ctx.userId), // [T-136] 按当前号登录态
        gateway: douyinGateway,
        diagnostics: {
          requestId: ctx.requestId,
          accountId: ctx.accountId ?? undefined,
        },
      }),
readVideos: async (ctx: RequestContext, collectsId: string) => (await loadDouyinCdp()).fetchDouyinCollectsVideos({
              signal:scheduledSignals.getStore(),
            authDir: await douyinAuthDirFor(ctx.accountId,scheduledSignals.getStore(),ctx.userId), // [T-136] 按当前号登录态
            collectsId,
            maxItems: 50,
            gateway: douyinGateway,
            diagnostics: {
              requestId: ctx.requestId,
              accountId: ctx.accountId ?? undefined,
            },
          }),
isNotLoggedInError: error => error instanceof DouyinNotLoggedInError,
FAVORITES_PROMOTE_PER_RUN
}),
  };

  scheduledCollectors["self.metrics"]=createOperationsSyncCollector({
    failures:(c,capabilities)=>publicationSyncService.failures(c,capabilities),
    metrics:(c,t,r,e)=>scheduledCollectors["self.detail"]!(c,t,r,e),
    comments:(c,t,r,e)=>scheduledCollectors.comments!(c,t,r,e),
    traffic:async(c,t,r,e)=>{await trafficService.enqueueVisible(c);return scheduledCollectors["self.traffic"]!(c,t,r,e);},
    checkSignal:checkScheduledSignal,isNotLoggedIn:error=>error instanceof DouyinNotLoggedInError,
  });

  // dispatchScheduledCollection 实体:装 runner deps 后经 [gate-F5] 采集串行闸挂到链尾
  // (fire-and-forget,concurrency=1)。forward-declared 于 ai transport 之上;dispatch 分支 +
  // 调度器共用。**串行闸让同时只跑一个采集 job**(防两个 Chromium 各打一 channel 并存),与
  // gateway 的请求级节奏正交(SPEC §4.4 [gate-F5])。runScheduledCollection 内部已 try/catch/
  // finally 落 job_run 终态,链尾再 catch 兜底,一次失败不堵死后续采集。
  const wakeScheduledFlywheel=()=>recoveryWake?.wake("flywheel");
  const {collectFlywheel,dispatchScheduledCollection,recoverQueuedCollection}=createCollectionExecution({trafficQueue:{snapshot:c=>trafficService.pending(c,2147483647),fail:(c,rows,message)=>trafficService.failPending(c,rows,message)},scheduledCollectors,scheduledSignals,flywheelSourceKinds,scheduledFlywheel,schedulingService,aiService,deps,enqueueCollectionRun,wakeScheduledFlywheel,prepareDailyTopic:async(ctx,id)=>{if(!modelWorker)throw new Error("生成服务未就绪，请修复或更新应用");const bound=await businessExecution.prepare(ctx,id);modelWorker.start();return bound;},runTaskWithEffectiveSkillSnapshot,isNotLoggedInError:error=>error instanceof DouyinNotLoggedInError});

  // 调度器沿用身份服务已确认的本机真实主用户，不使用fixture默认身份。
  // source="ingestion":调度器本质是数据采集 pipeline 触发(与 L2816 采集 ctx 一致;
  // RequestContext.source 枚举无 "system",ingestion 是诚实 provenance)。
  const schedulerCtx: RequestContext = {
    userId: localUser.id,
    requestId: "scheduler",
    source: "ingestion",
  };

  // triggerScheduledJob 的共用 deps(TriggerDeps):唯一 automation-driver 与「立即运行」
  // (D5,scheduledJobs.runNow)共用同一份执行端口。
  // ai.createTask/runs.*/dispatch 绑工厂内可见的 aiService/schedulingService/
  // dispatchScheduledCollection。
  const {triggerDeps,bootstrapDouyinOnBind,schedulingWithRunNow}=createSchedulingControls({aiService,schedulingService,platformAccountService,dispatchScheduledCollection,deps,ensureDailyRun:(c,id)=>dailyTopicRunIntents.ensureRunForTask(c,id),ensureCollectionRun:(c,id)=>scheduledFlywheel.ensureRunForTask(c,id),ensureCanonicalRubricForAccount:id=>ensureCanonicalRubricForAccount(id),migrateProfile:async(ctx)=>{    if (ctx.accountId) {
      try {
        const fromDir = await douyinAuthDirFor(null,undefined,ctx.userId); // _default
        const toDir = await douyinAuthDirFor(ctx.accountId,undefined,ctx.userId);
        await hostProfileLifecycle.withProfiles([fromDir,toDir],async()=>{
          if (fromDir !== toDir && existsSync(fromDir) && !existsSync(toDir)) renameSync(fromDir, toDir);
        });
      } catch {
        /* 登录态迁移 best-effort:失败则 statusDouyin 仍回退可查(见 douyinAuthDirFor 回退),不阻断绑定 */
      }
    }
},scheduling});

  // [T-207] sweep 阈值 env 可配(毫秒;非法/缺省 → fallback)。job_run 默认 30min;
  //   ai_task 默认 2h(转录等长活合法,阈值更宽)。
  const envMsOf = (name: string, fallback: number): number => {
    const raw = Number(process.env[name]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
  };

  // T-616：僵尸 job_run 清扫并入唯一 automation-driver 的分钟 tick，不再只在启动时扫。
  // 先读取仍真实 running 的 AI task 作为保护集，合法长采集不会被 30 分钟阈值误杀；
  // task 已终态/失联而 run 仍 running 才会收口。任一只读失败则 fail-closed 跳过本轮清扫。

  // [T-207] 启动 sweep 僵尸 ai_task:app 被杀后 ai_tasks 也会留 running 僵尸(真机逮到
  // transcribe 挂 running 2.5h+),撞 createTask 的 in-flight 幂等闸挡后续同键任务。
  // [T-389] 类型感知:进程内 runner 类型(script.draft/cover.generate 等
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
  // fire-and-forget,best-effort;测试/CI 环境不起,unref
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
  // [T-869] HyperFrames 若随应用一起被杀，自己的 finally 无法执行，会遗留数千张
  // captured-frames。启动时先定向删帧，不等待 7 天，也不碰 out/ 候选成片。
  await sweepInterruptedRenderFrames(executionWorkspacesRoot)
    .then((result) => {
      if (result.directoriesRemoved > 0) {
        console.info("[execution] 已清理中断渲染逐帧缓存", result);
      }
    })
    .catch((e) => console.error("[execution] 启动清理逐帧缓存失败:", e));
  void sweepOrphanSandboxes(executionWorkspacesRoot).catch((e) =>
    console.error("[execution] 启动清扫孤儿沙箱失败:", e),
  );

  // [T-517] 单一持久自动化 driver：scheduled_job 只供 due producer 读取；
  // execution_tasks/PersistentTaskService 才是 lease/attempt/recovery 唯一真值。
  const {start:startUnifiedAutomationDriver}=createSchedulingAutomation({
    aiService,schedulingService,schedulerCtx,
    syncDailyExecutionRuns:(ctx)=>dailyTopicRuns.syncExecutionRuns(ctx),
    staleJobRunMs:envMsOf("CREATOROS_STALE_JOB_RUN_MS",30*60*1000),
    deps,triggerDeps,flywheelSourceKinds,dispatchScheduledCollection,persistentTaskService,
    scheduledChildren:createExecutionScheduledChildService(db,{now:deps.now}),
    wakeDelegated:()=>{modelWorker?.start();wakeScheduledFlywheel();},
  });

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
      identity: {
        getEffectiveTimezone: async (ctx) =>
          (await identity.getCurrentUser(ctx)).timezone,
      },
      projects: {
        getScheduleProject: (ctx, projectId) =>
          projectsService.getScheduleProject(ctx, projectId),
      },
      schedulePublishing: {
        getProjectPublicationFact: (ctx, projectId) =>
          publishingService.getProjectPublicationFact(ctx, projectId),
      },
    });
  const contentCalendar = createContentCalendarTransport(
    () => contentCalendarService,
  );

  // MaterialLinks (用料链 / Bill-of-Materials, Plan A4): the service builds a per-ctx
  // user-scoped repo over the shared db (the service mints one per request; the repo
  // bakes userId in). The transport returns this ONE shared service. Entity/project/
  // output references remain soft SQL references, but the injected public-service
  // ports validate every production write without importing peer repositories.
  // delete is ownership-gated (cross-user → OwnershipError → 404). Clock/ids share the
  // deterministic `deps` (createSeq keeps matlink ids collision-free across requests).
  const materialLinksService = createMaterialLinksService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    assertProjectOwned: async (ctx, projectId) => {
      await projectsService.listOutputIdsByProject(ctx, projectId);
    },
    resolveOutputProjectId: (ctx, outputId) =>
      projectsService.getProjectIdByOutput(ctx, outputId),
    assertKnowledgeOwned: (ctx, knowledgeId) =>
      knowledgeService.getKnowledge(ctx, knowledgeId),
    assertAssetOwned: (ctx, assetId) => assetsService.getAsset(ctx, assetId),
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
        const data=await benchmarkTranscription.transcribe(ctx,workId);
        return {data,meta:{requestId:ctx.requestId}};
      }
      return benchmark.request(endpoint, input, ctx);
    },
  };
  // 来源与任务回执在后端原子提交；事务后沿原派发入口唤醒同一个任务。
  const projectsWithTranscribe = createProjectsWithTranscribe({
    projects,
    submit: (ctx, input) => aiService.createProjectTranscriptionTask(ctx, input),
    wake: async (ctx, task) => {
      await ai.request(ENDPOINTS.createAITask, {
        params: undefined, query: undefined,
        body: {taskType: task.taskType, attemptId: task.attemptId, inputData: task.inputData},
      }, ctx);
    },
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
  // Every page facade below binds only to public module services. Project Overview
  // reads its root/stages/outputs/activities through Projects' narrow composition
  // port, then joins Artifacts, MaterialLinks/Assets and Publishing here. No peer
  // repository access and no synthetic empty project projection.
  const notificationsServiceForQuery = createNotificationsService(
    notificationsRepo,
    deps,
  );

  const dashboardQuery = createDashboardApplication({projectsService,publishingService,analyticsService,learningsService,executionService,candidateService,platformAccountService,contentCalendarService,notificationsServiceForQuery,resolveImportedPublicationIds});

  const overviewQuery = createProjectOverviewApplication({projectsService,publishingService,assetsService,artifactsService,materialLinksService});

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

  const dailyReportQuery = createDailyReportApplication({
    now: deps.now, projectsService, publishingService, analyticsService, trafficService,
    readAccountName: async ctx => ctx.accountId ? (await platformAccountService.getAccount(ctx, ctx.accountId)).accountHandle : null,
    readScript: async (ctx, projectId) => {
      const rows = await artifactsService.listProjectArtifacts(ctx, projectId);
      const artifact = selectReadableProjectScriptArtifact(rows);
      if (artifact?.currentVersionId) {
        const current = await readCurrentArtifactTruth(ctx, projectId, artifact.artifactType);
        return current?.fullText ?? null;
      }
      return readProjectRadarDraftSeed(ctx, projectId);
    },
    readPositioning: async ctx => {
      const center = await positioningService.readPositioningCenter(ctx);
      const profile = center.profile;
      return [center.currentStatement?.oneLiner, profile?.field, profile?.audience, profile?.differentiation].filter(Boolean).join("\n") || null;
    },
  });
  const queryServices = createQueryServicesTransport({
    dailyReport: dailyReportQuery,
    dashboard: dashboardQuery,
    overview: overviewQuery,
    search: searchQuery,
  });

  // [T-135] canonical external sources 种子已退役(用户裁决 2026-07-05:新库/新用户开箱空)。
  // 外部源全部来自用户运行时真实创建/绑定(抖音扫码走 CDP 连已登录 Chrome,不预置任何来源行)。

  // 本机用户已在装配入口经identity初始化；此处不再种固定身份或演示项目。

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
      userId: localUser.id,
      requestId: "seed-win-video-tutor",
      source: "ingestion",
    };
    const { rows: wvtAccounts } = await platformAccountService.listAccounts(
      wvtSeedCtx,
      { limit: 100, offset: 0 },
    );
    for (const wvtAcct of wvtAccounts.filter((a) => a.status === "active")) {
      const acctCtx = { userId: localUser.id, accountId: wvtAcct.id };
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
    const renamed=await repairSeedTitles(localUser.id,"win-video-tutor",WIN_VIDEO_TUTOR_LEGACY_TITLE_PREFIX);
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
      userId: localUser.id,
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
              systemManaged: input.sourceKind === "intelligence.sync",
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
  await rebuildOwnedSearchIndex(db,localUser.id,deps.now);

  // [T-050] canonical analytics 种子已退役(快照/留存/观众全挂在已删除的 demo 发布上)。
  // 真实指标由采集管线写入(self.metrics/self.detail,T-030/T-036)。

  // Identity与服务使用同一数据库；请求身份来自session，本机后台任务使用真实主用户。
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
  const redfoxCredentials = createIntegrationCredentials(db, masterKey);
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
        // T-770:设置页是“账号可定制 Skill”管理面。editableFields=[] 的系统元 Skill 不在此
        // 暴露，避免渲出可编辑 textarea/保存按钮后再由服务端拒绝的假交互；运行时 official
        // provider 仍使用下方未过滤的 listOfficialSkillBases，snapshot 能正常冻结它。
        return listOfficialSkillBases()
          .filter((base) => base.editableFields.length > 0)
          .map((base) => ({
            ...base,
            system: base.methodSystem,
            supportsCompletionPolicySchema: () =>
              base.completionPolicyAdapter !== null,
          }));
      },
    },
  );
  readStoredChannelModelCredential = (ctx, scopeId, serviceId) =>
    settingsService.getChannelModelCredential(ctx, scopeId, serviceId);
  const onboardingState = createOnboardingState(db, (ctx, id) => platformAccountService.getAccount(ctx, id));
  const settings = createSettingsTransport(() => settingsService, redfoxCredentials, onboardingState);
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

  // 只解析冻结模型配置；实际模型调用归独立 Worker。
  const resolveModelSpec = async (ctx: RequestContext, capability: string) => {
    const cfg = await resolveLlmConfig(ctx, capability, {
      getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
      env: process.env,
      getChannelModelConfig,
      getChannelModelCredential: (serviceId) =>
        getChannelModelCredential(ctx, serviceId),
      getChannelModelSelection: (selectedCapability) =>
        getChannelModelSelection(ctx, selectedCapability),
    });
    return {
      apiFormat: cfg.apiFormat,
      authStyle: cfg.authStyle,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      token: cfg.token,
      ...(typeof cfg.settings.structuredOutputs === "boolean"
        ? { structuredOutputs: cfg.settings.structuredOutputs }
        : {}),
      ...(cfg.displayModelKey
        ? { displayModelKey: cfg.displayModelKey }
        : {}),
    };
  };

  const resolveChatFallbackCredential=async(ctx:RequestContext)=>{
    const cfg=await resolveDedicatedLlmConfig(ctx,"chat.fallback",{
      getModelConfig:(c,cap)=>settingsService.getModelConfig(c,cap),env:process.env,
      getChannelModelConfig,getChannelModelCredential:serviceId=>getChannelModelCredential(ctx,serviceId),
    });
    if(!cfg)return null;
    return {apiFormat:cfg.apiFormat,authStyle:cfg.authStyle,baseUrl:cfg.baseUrl,model:cfg.model,token:cfg.token,
      ...(typeof cfg.settings.structuredOutputs==="boolean"?{structuredOutputs:cfg.settings.structuredOutputs}:{}),
      ...(cfg.displayModelKey?{displayModelKey:cfg.displayModelKey}:{})};
  };

  const workerBudget={maxCalls:6,maxTokens:1_000_000,deadlineMs:600_000};
  const {readArtifactContentData,thesisReader,contractReader,outlineReader,artifactOriginReader}=createArtifactContextReaders(artifactsService);
  const generationContext={positioning:{getPositioningCenter:(c:RequestContext)=>positioningService.readPositioningCenter(c)},learnings:{getSuggestions:(c:RequestContext,options:{limit?:number})=>learningsService.getSuggestions(c,options)}};
  const reviewScriptSource: Parameters<typeof prepareScriptReviewContext>[2]["scriptSource"] = {
        getLatestScript: async (c, projectId) => {
          const artifacts = await artifactsService.listProjectArtifacts(
            c,
            projectId,
          );
          const scriptArtifacts = artifacts.filter((a) => a.stage === "script");
          const target =
            scriptArtifacts.find((a) => a.artifactType === "output_script") ??
            scriptArtifacts.find((a) => a.artifactType === "master_script");
          if (target) {
            const versions = await artifactsService.listVersions(c, target.id);
            if (versions.length > 0) {
              const current = versions
                .slice()
                .sort((a, b) => b.versionNumber - a.versionNumber)[0]!;
              return {
                artifactId: target.id,
                version: current.versionNumber,
                text: extractArtifactText(
                  current.contentText,
                  current.contentData,
                ),
              };
            }
          }
          const seed = await readProjectRadarDraftSeed(c, projectId);
          return seed
            ? { artifactId: null, version: 0, text: seed }
            : null;
        },
      };
  const calibrationDiagnoseReaders = createCalibrationDiagnoseReaders({projectsService,publishingService,calibrationService,canonicalRubricIdFor,readCurrentScript:(c,projectId)=>createCurrentArtifactReader({projectsService,artifactsService})(c,projectId,"output_script")});
  const calibrationScoreReaders = createCalibrationScoreReaders({projectsService,publishingService,analyticsService,calibrationService});
  const dailyTopicRuns=createDailyTopicRunService(db,{now:deps.now});
  const dailyTopicRunIntents=createDailyTopicRunIntentService(db,deps);
  const dailyTopicAdapter=createDailyTopicBusinessAdapter({
        positioning: {
          getPositioningCenter: (c) =>
            positioningService.readPositioningCenter(c),
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
        listActivePreferences: async (c) =>
          (await candidateService.listActiveTopicPreferences(c)).map((p) => ({
            keyword: p.keyword,
            direction: p.direction === "prefer" ? ("prefer" as const) : ("avoid" as const),
            weight: p.weight,
            exampleCount: p.exampleCount,
            lastReinforcedAt: p.lastReinforcedAt,
          })),
    sourceReader:{listEnabledSources:c=>trendSourcesService.listEnabledSources(c)},
    resolveRun:async(c,id)=>{await dailyTopicRunIntents.ensureRunForTask(c,id);return dailyTopicRuns.resolveRun(c,id);},
    countCandidatesForDay:(c,day)=>countCandidatesForDay(db,c,day),
    async hasConfiguredModel(c){try{await resolveModelSpec(c,"topic.generate");return true;}catch{return false;}},
    dailyLimit:Number(process.env.CREATOROS_TOPIC_DAILY_LIMIT),now:deps.now,
  });
  const assetProcessingPreparation={assets:assetsService,async isModelConfigured(c:RequestContext,taskType:"asset.classify"|"material.extract"){
    try{if(taskType==="asset.classify")await resolveMultimodalSpec(c,"asset.classify");else await resolveModelSpec(c,"script.draft");return true;}
    catch(error){if(error instanceof LlmCredentialError || (error instanceof Error && error.name==="MultimodalConfigError"))return false;throw error;}
  }};
  const businessExecution=createStructuredBusinessExecutionService(db,{budget:workerBudget,maxOutputTokens:65536,adapters:{
    ...createDiscoveryBusinessAdapters({projectsService,candidateService,trendSourcesService,deps,aiService,persistentTaskService,projectIntelligenceReferences,generationContext,makeGenerationReaders,makeProjectMaterialsReader,calibrationDiagnoseReaders,calibrationScoreReaders,dailyTopicAdapter,positioningWorksReader}),

    ...createMediaBusinessAdapters({projectsService,publishingService,analyticsService,assetsService,artifactsService,materialLinksService,resolveModelSpec,aiService,assetProcessingPreparation,generationContext,makeGenerationReaders,readArtifactContentData}),

    ...createWritingBusinessAdapters({projectsService,artifactsService,db,generationContext,makeGenerationReaders,makeBriefReader,makeReviewSubjectReader,artifactOriginReader,contractReader,reviewScriptSource,reviewGateService}),

  }});
  const workerEntry=(()=>{try{return resolveExecutionWorkerPath();}catch{console.error("EXECUTION_WORKER_BUILD_MISSING");return null;}})();
  const resolveWorkerCredential=async(c:RequestContext,capability:string,owner:{aiTaskId:string;executionTaskId:string})=>{
      const runtime=await aiService.getTaskRuntimeData(c,owner.aiTaskId);
      const authority=pinModelAuthority(await readChannelModelAuthority());
      if(!matchesPinnedModelAuthority(runtime,authority))throw Object.assign(new Error("MODEL_AUTHORITY_CHANGED"),{code:"MODEL_AUTHORITY_CHANGED"});
      try{return await taskModelAuthorityScope.run(authority,async()=>{
        if(capability!=="asset.classify")return resolveModelSpec(c,capability);
        const spec=await resolveMultimodalSpec(c,"asset.classify");
        return {apiFormat:"openai_chat" as const,baseUrl:spec.baseUrl??"https://api.siliconflow.cn/v1",model:spec.model,token:spec.token};
      });}
      catch{throw Object.assign(new Error("MODEL_CREDENTIAL_UNAVAILABLE"),{code:"MODEL_CREDENTIAL_UNAVAILABLE"});}
    };
  function resolveTranscribeRuntimeSpec(c:RequestContext){
    return resolveTranscribeSpecFn(c,{getModelConfig:(cc,cap)=>settingsService.getModelConfig(cc,cap),env:process.env,getChannelModelConfig,getChannelModelCredential:serviceId=>getChannelModelCredential(c,serviceId),getChannelModelSelection:capability=>getChannelModelSelection(c,capability)});
  }
  const transcribeBusiness=createTranscribeBusinessExecutionService(db,{
    budget:{...workerBudget,deadlineMs:1_800_000},now:deps.now,
    resolveSpec:resolveTranscribeRuntimeSpec,
  });
  async function dispatchTranscribeTask(c:RequestContext,id:string,signal?:AbortSignal){
    if(!modelWorker)throw new Error("转写服务未就绪，请更新应用后重试");
    const prepared=await transcribeBusiness.prepare(c,id,signal);
    if(prepared.legacy)throw new Error("此转写任务已有旧执行记录，请先核对已有逐字稿，再从作品重新发起转写");
    if(!stoppingPreparation)modelWorker.start();
  }
  const coverExecutionPorts={
    async resolveImageSpec(c:RequestContext,capability:"image.generate"|"image.edit",taskId:string){
      const runtime=await aiService.getTaskRuntimeData(c,taskId);
      const authority=pinModelAuthority(await readChannelModelAuthority());
      if(!matchesPinnedModelAuthority(runtime,authority))throw new Error("MODEL_AUTHORITY_CHANGED");
      return taskModelAuthorityScope.run(authority,()=>resolveMultimodalSpec(c,capability));
    },
    getReferenceBytes:(c:RequestContext,assetId:string)=>assetsService.getAssetBytes(c,assetId),
  };
  const coverBusiness=createExecutionCoverService(db,{...coverExecutionPorts,budget:workerBudget,now:deps.now});
  const assetBusiness=createAssetBusinessExecutionService(db,{
    budget:{...workerBudget,deadlineMs:1_800_000},now:deps.now,
    async assertProject(c,id){await projectsService.getProjectOverviewCore(c,id);},
    async resolveSpec(c,capability,taskId){
      const runtime=await aiService.getTaskRuntimeData(c,taskId);
      const authority=pinModelAuthority(await readChannelModelAuthority());
      if(!matchesPinnedModelAuthority(runtime,authority))throw new Error("MODEL_AUTHORITY_CHANGED");
      return taskModelAuthorityScope.run(authority,()=>resolveMultimodalSpec(c,capability));
    },
  });
  async function dispatchAssetTask(c:RequestContext,id:string){
    if(!modelWorker)throw new Error("生成服务未就绪，请修复或更新应用");
    await assetBusiness.prepare(c,id);
    if(stoppingPreparation)return;
    modelWorker.start();
  }
  async function assertReviewableChatScript(ctx:RequestContext,input:{projectId:string}){
      // [T-708] 当前已保存稿面是审核唯一真值。后台新候选即使仍在生成或等待采纳，也不能
      // 反向锁死一份已经可审的稿件；只有稿面为空/过短时，才查看任务状态并解释缺口。
      const currentScript = await makeReviewSubjectReader().getScript(
        ctx,
        input.projectId,
      );
      let taskStatuses: string[] = [];
      if (currentScript.trim().length < MIN_REVIEWABLE_SCRIPT_CHARS) {
        try {
          const { rows } = await aiService.listTasks(ctx, {
            limit: 20,
            offset: 0,
            projectId: input.projectId,
            taskType: "script.draft",
          });
          taskStatuses = rows.map((task) => task.status);
        } catch {
          // 状态探测失败不冒充「仍在生成」；按当前真实稿面给出空稿提示。
        }
      }
      const blockReason = getScriptReviewBlockReason(
        currentScript,
        taskStatuses,
        MIN_REVIEWABLE_SCRIPT_CHARS,
      );
      if (blockReason === "running") {
        throw new Error(
          "当前稿面还没有可审的整稿，新的整稿正在生成中。你可以等它完成，也可以先粘贴并保存现有文案再审核。",
        );
      }
      if (blockReason === "awaiting_adoption") {
        throw new Error(
          "当前稿面还没有可审的整稿，但已有一份候选稿等待确认。采纳候选，或直接粘贴并保存自己的文案后即可审核。",
        );
      }
      if (blockReason === "empty") {
        throw new Error(
          "当前项目还没有可审的整稿（稿面为空或太短）。可以生成候选，也可以直接粘贴并保存文案后审核。",
        );
      }
  }
  const submittedPreparation=createSubmittedTaskPreparationService(db,{
    resolveToolParameters:resolveSubmittedChatToolParameters,
    deadlineMs:workerBudget.deadlineMs,
    async prepare(c,id,signal,inheritedBudget){
      const task=await aiService.getTask(c,id);signal.throwIfAborted();
      if(task.taskType==="asset.generate"){
        const prepared=await assetBusiness.prepare(c,id,signal,inheritedBudget);
        return prepared;
      }
      return businessExecution.prepare(c,id,signal,inheritedBudget);
    },
    fail:(c,id,message)=>aiService.markFailed(c,id,message),
  });
  async function wakeSubmittedTask(c:RequestContext,id:string,taskType:"planning.thesis"|"asset.generate"|"script.review"|"script.draft"|"publish.platform_adapt"|"cover.generate"){
    const task=await aiService.getTask(c,id);
    if(task.taskType!==taskType)throw new Error("聊天唤醒任务类型不符");
    if(task.status!=="queued")return;
    if(!modelWorker)throw new Error("生成服务未就绪，请修复或更新应用");
    await submittedPreparation.prepare(c,id);
    if(!stoppingPreparation)modelWorker.start();
  }
  async function readTranscribePostprocessContext(c:RequestContext,awemeId:string,signal?:AbortSignal){
    signal?.throwIfAborted();
    const [positioning,project]=await Promise.allSettled([
      positioningService.readPositioningCenter(c),
      projectsRepo.findImportedByRef(c,{platform:"douyin",externalId:awemeId}),
    ]);
    signal?.throwIfAborted();
    return {
      accountPositioning:positioning.status==="fulfilled"?positioning.value.currentStatement?.oneLiner||undefined:undefined,
      title:project.status==="fulfilled"?project.value?.title||undefined:undefined,
    };
  }
  const modelWorker=workerEntry ? createModelWorkerDispatcher(db,{
    recoverPendingPreparation:signal=>submittedPreparation.recover(signal),
    dailyTopicPorts:{
      validateRun:(c,input,tx)=>dailyTopicRuns.validateRun(c,input,tx),
      finishRun:(c,input,tx)=>dailyTopicRuns.finishRun(c,input,tx),
      lockAccount:async(c,tx)=>{await lockAccountForSupply(tx,c);await lockCandidateSupply(tx,{userId:c.userId,accountId:c.accountId!});},
      countCandidatesForDay:(c,day,tx)=>countCandidatesForDay(tx,c,day),
      createCandidate:createTopicCandidateInTransaction,
    },
    browserSessions:browserSessionsService,
    entryPath:workerEntry,workerId:`model-worker-${process.pid}`,budget:workerBudget,
    resolveModelCredential:resolveWorkerCredential,
    video:{resolveModelSpec},
    assetProcessing:{assets:assetsService},
    transcribePostprocess:{resolveModelSpec,readContext:readTranscribePostprocessContext},
    transcribeAudioStorage:objectStorageForCtx,
    transcribeWorkflow:{
      nextId:deps.nextId,
      hasTranscriptArtifact:(c,awemeId)=>transcriptArtifacts.hasExisting(c,awemeId),
      async onTranscriptReady(c,{projectId}){
        const artifacts=await artifactsService.listProjectArtifacts(c,projectId);
        if(artifacts.some(row=>row.origin==="reconstructed"))return;
        await ai.request(ENDPOINTS.createAITask,{params:undefined,query:undefined,body:{taskType:"reconstruct.project",attemptId:createAiTaskAttemptId(),inputData:{projectId}}},c);
      },
    },
    transcribeSource:{
      resolveProfile:async(c,signal)=>{
        if(!c.accountId)throw new Error("转写登录来源缺少真实账号");
        await platformAccountService.getAccount(c,c.accountId);signal?.throwIfAborted();
        return resolveDouyinProfileIdentity(douyinAuthDirBase,c.accountId,signal);
      },
      async acquireChannel(_c,channel,signal){signal?.throwIfAborted();await douyinGateway.acquire(channel);signal?.throwIfAborted();},
      reportChannel:(_c,channel,result)=>douyinGateway.report(channel,classifyDouyinOutcome(result.kind==="success"?{kind:"ok"}:result)),
    },
    transcribePreparation:{
      resolveSpec:resolveTranscribeRuntimeSpec,
      prepareSpec:(c,spec,input)=>prepareManagedTranscribeSpec(c,spec,input),
    },
    cover:coverExecutionPorts,
    assetStorage:objectStorageForCtx,resolveAssetCredential:async(c,owner)=>{
      const task=await aiService.getTask(c,owner.aiTaskId);
      return task.taskType==="cover.generate"?coverBusiness.resolveCredential(c,owner):assetBusiness.resolveCredential(c,owner);
    },
    projectCandidate(_c,input){return businessExecution.projectCandidate(input);},
    onError:code=>console.error(`[execution-worker] ${code}`),
  }) : null;
  const materialWorkerTools=createAgenticMaterialTools({
    async search(c,input,signal){
      signal.throwIfAborted();const result=await assetsService.searchAssets(c,input);signal.throwIfAborted();
      return {items:result.rows.map(row=>({id:row.id,title:row.name,kind:row.assetType})),nextCursor:result.nextCursor};
    },
    stage:(ref,input,signal)=>agenticProposalStaging.stageForExecution(ref,input,signal),
  });
  const researchWorkerTools=createAgenticResearchTools({stage:(ref,input,signal)=>agenticProposalStaging.stageForExecution(ref,input,signal)});
  const collectionWorkerTools=createAgenticCollectionTools({
    forTask:(c,taskId,signal)=>createCollectionToolPorts(c,taskId,intelligenceService,persistentTaskService,
      (ctx,input)=>runIntelligenceSourceTask(ctx,input,sourceRunnerDeps),{
        signal,async isParentCancelled(){
          const parent=await aiService.getTask(c,taskId);
          if(parent.status==="cancelled")return true;
          if(!parent.executionTaskId)return false;
          const execution=await persistentTaskService.get(c,parent.executionTaskId);
          return execution.status==="cancelled" || execution.status==="cancel_requested";
        },
      }),
  });
  const agenticBudget={maxCalls:8,maxTokens:20000,deadlineMs:600_000};
  const agenticBusiness=createAgenticBusinessExecutionService(db,{
    definitions:{
      "exec.agentic.collect":{taskType:"agentic.collect",systemPrompt:DEFAULT_AGENTIC_SYSTEM_PROMPT,capability:"agentic.collect",tools:collectionWorkerTools.definitions},
      "exec.agentic.material":{taskType:"agentic.material",systemPrompt:DEFAULT_AGENTIC_SYSTEM_PROMPT,capability:"agentic.material",tools:materialWorkerTools.definitions},
      "exec.agentic.research":{taskType:"agentic.research",systemPrompt:DEFAULT_AGENTIC_SYSTEM_PROMPT,capability:"agentic.research",tools:researchWorkerTools.definitions},
    },
    budget:agenticBudget,maxOutputTokens:4096,now:deps.now,
    async resolveMethodSystem(c,skillId){
      const snapshot=await resolveEffectiveSkillSnapshotForRuntime(c,[skillId]);
      const skill=snapshot.skills.find(row=>row.skillId===skillId);
      if(!skill)throw new Error("自主任务缺少业务 Skill");
      return skill.effective.methodSystem;
    },
    async validateInputs(c,inputs){for(const input of inputs)await assetsService.getAsset(c,input.assetId);},
  });
  const agenticEntry=(()=>{try{return resolveAgenticWorkerPath();}catch{console.error("AGENTIC_WORKER_BUILD_MISSING");return null;}})();
  const agenticWorker=agenticEntry ? createAgenticWorkerDispatcher(db,{
    entryPath:agenticEntry,workerId:`agentic-worker-${process.pid}`,budget:agenticBudget,modelConcurrency:1,
    tools:{...materialWorkerTools.tools,...researchWorkerTools.tools,...collectionWorkerTools.tools},browserSessions:browserSessionsService,resolveModelCredential:resolveWorkerCredential,
    onError:code=>console.error(`[agentic-worker] ${code}`),
  }) : null;
  let chatWorker: ReturnType<typeof createChatProductionRuntime> | undefined;
  let agenticPreparationRecovery:Promise<void>|undefined;
  let preparationRecovery:Promise<void>|undefined;
  let stoppingPreparation=false;
  const topicPreferenceSubmission=createTopicPreferenceSubmission({
    ai:aiService,listDropReasons:c=>candidateService.listDropReasons(c),
    prepare:(c,id)=>businessExecution.prepare(c,id),
    wake:()=>{if(!modelWorker)throw new Error("生成服务未就绪");modelWorker.start();},
  });
  stopExecutionWorker=async()=>{stoppingPreparation=true;assetBusiness.stop();transcribeBusiness.stop();await Promise.all([recoveryWake?.stop(),scheduledFlywheel.stop(),submittedPreparation.stop(),knowledgeSearchRuntime.stop(),embeddingIo.stop(),modelProbeIo.stop(),intelligenceGeneration.stop(),intelligenceTranscriptBridge.stop(),benchmarkTranscription.stop(),modelWorker?.stop(),agenticWorker?.stop(),chatWorker?.stop()]);await Promise.all([preparationRecovery,agenticPreparationRecovery]);};
  globalForPersistence.__creatorosStopExecutionWorker=stopExecutionWorker;

  // 两个审核入口转交同一持久执行权，报告由后端审核端口绑定冻结版本并原子提交。
  const dispatchScriptReview = async (
    ctx: RequestContext,
    task: {id:string;projectId:string|null;inputData:Record<string,unknown>},
  ) => {
    try {
      if(!modelWorker)throw new Error("审核服务未就绪，请修复或更新应用");
      await businessExecution.prepare(ctx,task.id);
      modelWorker.start();
    } catch(error) {
      await aiService.markFailed(ctx,task.id,error instanceof Error ? error.message : String(error)).catch(()=>undefined);
    }
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
    const channel = await getChannelModelConfig();
    if (channel) {
      const route = resolveChannelCapabilityRoute(
        channel,
        "knowledge.search.embed",
      );
      if (route) {
        const credential = route.serviceId
          ? await getChannelModelCredential(ctx, route.serviceId)
          : null;
        const cfg = channelLlmConfigFromRoute(route, credential);
        return {
          apiFormat: cfg.apiFormat,
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          token: cfg.token,
          ...(cfg.displayModelKey
            ? { displayModelKey: cfg.displayModelKey }
            : {}),
        };
      }
    }
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

  // 交互向量请求复用 IO Worker；领域权限与索引写入仍由当前 service 负责。
  const modelProbeIo = createModelProbeIoService({entryPath:resolveModelProbeWorkerPath});
  const embeddingIo = createEmbeddingIoService({entryPath:resolveEmbeddingWorkerPath});
  const embedTexts = async (
    ctx: RequestContext,
    spec: NonNullable<Awaited<ReturnType<typeof resolveEmbedSpec>>>,
    texts: string[],
    signal?: AbortSignal,
  ): Promise<number[][]> => embeddingIo.embed(ctx, spec, texts, signal);

  // resolveMultimodalSpec — L5 asset.generate 的多模态解析(SPEC 2026-07-01 §2.2 / M2),与文本
  // 层 resolveModelSpec 并列:复用同一套 getModelConfig(settings 拥有 model_configurations)+
  // env,投影成 MultimodalSpec(provider/model/baseUrl/token/kind)。image.generate/video.generate
  // 未配 → 抛 MultimodalConfigError(runner 接住 → cancelTask + 录制页「未配置生图/生视频模型」)。
  const resolveMultimodalSpec = (
    ctx: RequestContext,
    capability: "image.generate" | "image.edit" | "video.generate" | "asset.classify",
  ) =>
    resolveMultimodalSpecFn(ctx, capability, {
      getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
      env: process.env,
      getChannelModelConfig,
      getChannelModelCredential: (serviceId) =>
        getChannelModelCredential(ctx, serviceId),
      getChannelModelSelection: (selectedCapability) =>
        getChannelModelSelection(ctx, selectedCapability),
    });

  // ── [T-084a] 联网检索解析 + registry(SPEC 2026-07-03 §1.1)─────────────────────
  // resolveSearchSpec:与多模态层同一套 getModelConfig(settings 拥有 model_configurations)+ env,
  // 后端投影成 SearchSpec(provider/baseUrl/model/token)；未配置时使用浏览器默认档。
  const resolveSearchSpec = (ctx: RequestContext) =>
    resolveSearchSpecFn(ctx, {
      getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
      env: process.env,
      getChannelModelConfig,
      getChannelModelCredential: (serviceId) =>
        getChannelModelCredential(ctx, serviceId),
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
  // T-789：当前桌面运行期内共享百度登录墙冷却状态。只跳过已确认的登录墙，
  // 普通断网/鉴权错误不封禁；冷却有上界，到期后会真实重试。
  const browserSearchFallbackState = createBrowserSearchFallbackState();
  const browserSearchFallbackRuntime = { state: browserSearchFallbackState };
  // [T-684] ChatBox 素材搜索固定走随包 Chromium（中国大陆/简体中文默认百度）。
  // 不再读取已经从 UI 下线的 web.search/search.default 配置，也不回落模型记忆。
  const searchWebPort = async (
    _ctx: RequestContext,
    query: string,
    opts?: { count?: number; signal?: AbortSignal },
  ) => {
    return searchBundledBrowserWithFallback(
      query,
      opts,
      (baseUrl, q, options) =>
        searchWebFn(
          { provider: "browser", baseUrl, model: "", token: "" },
          q,
          searchRegistry,
          options,
        ),
      (attempt) => {
        const log = `[browser-search] engine=${attempt.engine} status=${attempt.status} durationMs=${attempt.durationMs} resultCount=${attempt.resultCount} queryLength=${query.trim().length}`;
        if (attempt.status === "error") console.warn(log, attempt.error);
        else console.info(log);
      },
      browserSearchFallbackRuntime,
    );
  };

  // [T-686] 定位前采专用真联网端口。前采 UI 已提供地区/语言选择，服务层会把
  // “中国大陆/简体中文”拼进用户显式关键词并过滤结果；这里固定使用随包 Chromium，
  // 彻底绕开历史 web.search 配置与模型记忆降级。浏览器失败会原样抛给前采页面，
  // 不会伪造没有 URL 的参考。
  const positioningResearchSearchPort = async (
    _ctx: RequestContext,
    query: string,
    opts?: { count?: number },
  ) => {
    const startedAt = Date.now();
    try {
      // 定位前采默认是中国大陆/简体中文语境。Bing 在本机真实旅程中会把
      // “湖南餐饮行业 IP”退化成只搜“湖南”，召回百科/旅游页；百度能保留完整
      // 中文查询并返回真实落地 URL，因此该专用端口以百度为默认引擎。
      const results = await searchBundledBrowserWithFallback(
        query,
        opts,
        (baseUrl, q, options) =>
          searchWebFn(
            { provider: "browser", baseUrl, model: "", token: "" },
            q,
            searchRegistry,
            options,
          ),
        (attempt) => {
          const log = `[positioning-research] provider=browser engine=${attempt.engine} status=${attempt.status} durationMs=${attempt.durationMs} resultCount=${attempt.resultCount} queryLength=${query.trim().length}`;
          if (attempt.status === "error") console.warn(log, attempt.error);
          else console.info(log);
        },
        browserSearchFallbackRuntime,
      );
      console.info(
        `[positioning-research] provider=browser engine=baidu status=ok durationMs=${Date.now() - startedAt} resultCount=${results.length} queryLength=${query.trim().length}`,
      );
      return results;
    } catch (error) {
      console.error(
        `[positioning-research] provider=browser status=error durationMs=${Date.now() - startedAt} queryLength=${query.trim().length}`,
        error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      );
      throw error;
    }
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
        getChannelModelConfig,
        getChannelModelCredential: (serviceId) =>
          getChannelModelCredential(ctx, serviceId),
        getChannelModelSelection: (selectedCapability) =>
          getChannelModelSelection(ctx, selectedCapability),
      }),
    resolveDedicatedLlm: (ctx, capability) =>
      resolveDedicatedLlmConfig(ctx, capability, {
        getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
        env: process.env,
        getChannelModelConfig,
        getChannelModelCredential: (serviceId) =>
          getChannelModelCredential(ctx, serviceId),
      }),
    resolveMultimodal: (ctx, capability) =>
      resolveMultimodalSpecFn(
        ctx,
        capability as "image.generate" | "video.generate" | "asset.classify",
        {
          getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
          env: process.env,
          getChannelModelConfig,
          getChannelModelCredential: (serviceId) =>
            getChannelModelCredential(ctx, serviceId),
          getChannelModelSelection: (selectedCapability) =>
            getChannelModelSelection(ctx, selectedCapability),
        },
      ),
    resolveTranscribe: (ctx) =>
      resolveTranscribeSpecFn(ctx, {
        getModelConfig: (c, cap) => settingsService.getModelConfig(c, cap),
        env: process.env,
        getChannelModelConfig,
        getChannelModelCredential: (serviceId) =>
          getChannelModelCredential(ctx, serviceId),
        getChannelModelSelection: (selectedCapability) =>
          getChannelModelSelection(ctx, selectedCapability),
      }),
    resolveEmbed: (ctx) =>
      resolveEmbedSpec(ctx).then((spec) =>
        spec ? { ...spec, authStyle: "bearer" as const } : null,
      ),
    resolveSearch: (ctx) => resolveSearchSpec(ctx),
    generateImageMinimal: (spec,c) => modelProbeIo.probeImage(c,spec),
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
    probeTextModel: (spec,c) => modelProbeIo.probeText(c,spec),
    fetchImpl: fetch,
  });
  const settingsWithChannelModelCredentials =
    createSettingsWithChannelModelCredentials({
      settings: settingsWithModelTest,
      readAuthority: readChannelModelAuthority,
      listCredentials: (ctx, scopeId) =>
        settingsService.listChannelModelCredentials(ctx, scopeId),
      putCredential: (ctx, scopeId, serviceId, secret) =>
        settingsService.setChannelModelCredential(
          ctx,
          scopeId,
          serviceId,
          secret,
        ),
    });
  // 浏览器搜索随包可用，不再探测隐藏的搜索模型配置。
  const probeSearchConfigured = async (_ctx: RequestContext): Promise<boolean> => true;

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
    userId: localUser.id,
    // [T-332 S2] 本 repo 实例只跑 seedModelConfigs/seedAgentConfigs —— 这两张是 **user 级**
    //   表(model_configurations/agent_configurations,SPEC §3.2「模型配置共享」用户拍板),
    //   行上无 account 维。RepoDeps.accountId 已收紧为必填 string(为 conversations/tasks
    //   的 per-account 门),此处给显式占位哨兵:任何误用本实例走会话/任务读写都只会命中
    //   不存在的号(空集/404),不会串号。
    accountId: "__seed-user-level-only__",
  });
  await aiSeedRepo.seedModelConfigs(
    buildAiModelConfigs(localUser.id, deps.now()),
  );
  await aiSeedRepo.seedAgentConfigs(
    buildAiAgentConfigs(localUser.id, deps.now()),
  );

  // T-086 审核规则种子(SPEC §1)—— 从用户知识库移植的抖音违禁词表(Tier1 官方硬规则确定性
  // 投影 + Tier2 经验限流 + doud+ 投放特有词),幂等 id(rrule-seed-<user>-<slug>)+
  // onConflictDoNothing → 重建单例不双写。规则种子本体在 backend review 模块(review-rules.seed.ts)。
  const reviewGateSeedRepo = createReviewGateRepository(db, {
    ...deps,
    userId: localUser.id,
  });
  await reviewGateSeedRepo.seedRules(
    buildReviewRuleSeedRows(localUser.id, deps.now()),
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
  // 兜底下次启动再补)。Deterministic ids/clock (deps.now());seed* onConflictDoNothing
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
      userId: localUser.id,
      accountId,
    });
    const versionRow: CalibrationRubricVersionRow = {
      id: `rubricver-canonical-1:${accountId}`,
      userId: localUser.id,
      accountId, // per-account stamp(NOT NULL 终态)
      rubricId: `rubric-canonical:${accountId}`,
      versionNumber: 1,
      dimensions: canonicalRubricDimensions,
      changeSummary:
        "v2 借鉴 cheat-on-content 的已校准 rubric：合并传播驱动（钩子/情感/社会/金句）与变现维度（为产品铺路/CTA），每维带 0/3/5 锚点",
      createdAt: deps.now(),
    };
    const rubricRow: CalibrationRubricRow = {
      id: `rubric-canonical:${accountId}`,
      userId: localUser.id,
      accountId, // per-account stamp(NOT NULL 终态)
      name: "变现加权评分标准",
      currentVersionId: versionRow.id,
      createdAt: deps.now(),
    };
    await calibrationSeedRepo.seedRubricVersions([versionRow]);
    await calibrationSeedRepo.seedRubrics([rubricRow]);
  };
  // 启动:逐 active 号补种(存量号/重启幂等);0 号 → 静默跳过(引导态)。best-effort。
  try {
    const rubricSeedCtx: RequestContext = {
      userId: localUser.id,
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

  /**
   * T-816：当前 artifact 指针、规范正文、稳定段落引用和内容 hash 的单一读源。
   * context.artifact.text、自然语言 script.patch 与生成任务快照都必须调用这里，避免各自
   * 猜“当前版本”。只走现有 projects/artifacts public service；不写库。
   */
  const readCurrentArtifactTruth = createCurrentArtifactReader({projectsService,artifactsService});

  // T-004 ChatBox runtime — bundle the /api/chat route's needs: persist (aiService),
  // resolve model (resolveModelSpec), and the bound CreativeContext readers (定位/飞轮/
  // 受众信号/知识库 数据层注入). The readers reach peer modules ONLY through their public
  // services (positioning/learnings/candidate/knowledge), mirroring the topic.generate
  // trigger's bindings — no cross-module repo import (SPEC §22). The /api/chat route reads
  // these to assemble the system prompt; AI produces candidates (采纳 gate), never entities.
  const chatTaskSubmissions=createAiTaskSubmissionService({
    findTaskByAttempt:aiService.findTaskByAttempt,
    submit:async(ctx,body)=>{
      if(!body.attemptId)throw new Error("聊天任务提交缺少稳定 attemptId");
      const res=await ai.request(ENDPOINTS.createAITask,{params:undefined,query:undefined,body:{...body,attemptId:body.attemptId}},ctx);
      const task=(res as {data?:Awaited<ReturnType<typeof aiService.createTask>>}).data;
      if(!task?.id)throw new Error("聊天任务提交未返回 taskId");
      return task;
    },
  });
  const chatRuntime: ChatRuntime = {
    resolveRedfoxCredential: ctx => redfoxCredentials.resolve(ctx),
    readCurrentScript: async (c,projectId,signal) => {signal?.throwIfAborted();const result=await readCurrentArtifactTruth(c,projectId,"output_script");signal?.throwIfAborted();return result;},
    get durable(){if(!chatWorker)throw new Error("CHAT_RUNTIME_UNAVAILABLE");return chatWorker;},
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
    getPositioningDiscovery: (c, sessionId) =>
      positioningService.getDiscoverySession(c, sessionId),
    resolveCurrentScriptSelection: createCurrentScriptSelectionReader({artifactsService,resolveCurrentScriptSelectionFromTruth}),
    readChatAttachment: async (c, assetId) => {
      const asset = await assetsService.getAsset(c, assetId);
      if (!asset.currentFileId) {
        throw new Error("附件尚未完成上传，请重新添加后再试。");
      }
      const [file] = await assetsService.listFilesByIds(c, [asset.currentFileId]);
      const blob = await assetsService.getAssetBytes(c, assetId);
      if (!file || !blob) {
        throw new Error("附件文件暂时不可读取，请重新添加后再试。");
      }
      return {
        assetId: asset.id,
        name: asset.name,
        assetType: asset.assetType,
        mimeType: blob.mimeType || file.mimeType,
        fileSize: file.fileSize,
        extractedText: file.extractedText ?? null,
        bytes: blob.bytes,
      };
    },
    context: {
      positioning: {
        getPositioningCenter: (c: RequestContext) =>
          positioningService.readPositioningCenter(c),
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
      // [T-578] 由 route 的 ...runtime.context 自动透传给 chat-runner，和后台 runner
      // 绑定同一个 reader；无需在控制层手枚举新增字段。
      positioningWorks: positioningWorksReader,
    },
    // 只读 context 工具的真数据读端口 —— 全部 user-scoped(经各自 service/repo 用 ctx.userId 收窄),
    // 只读、不写实体。找不到现成的「带 query 搜」读方法时,在此对现成 list 端口做内存过滤(优先复用
    // 现成读端口,不新造 repo 方法)。诚实说明:knowledge 的 query 仍是内存 contains 过滤；materials 已走领域分页检索
    // (list 本身不带全文检索);projects 无真实 publishedAt(那在 publication 上)→ 不塞、留空。
    contextReaders: {
...createChatProjectsReaders({projectsService,publishingService,artifactsService,listRecentProjects,searchProjects: (c,opts)=>searchProjectsWithPublicationFacts(c,opts,{listProjects: ctx=>projectsService.listProjectsForComposition(ctx),listOutputRefsByProjects: (ctx,ids)=>projectsService.listOutputRefsByProjects(ctx,ids),listPublicationsByOutputIds: (ctx,ids)=>publishingService.listPublicationsByOutputIds(ctx,ids)}),contentRadarDraftSeedOf,extractArtifactText,makeReviewSubjectReader,readProjectRadarDraftSeed,readCurrentArtifactTruth}),
...createChatLifecycleReaders({projectsService,publishingService,analyticsService,assetsService,artifactsService,materialLinksService,reviewGateService,extractArtifactText,isLegacyIncompleteReview}),
...createChatEvidenceReaders({assetsService,knowledgeService}),
...createChatPerformanceReaders({projectsService,publishingService,analyticsService,learningsService,candidateService,platformAccountService,positioningService,calibrationService,canonicalRubricIdFor})
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
              openPooledReaderContext(ctx, domain, {signal: input.signal}) as never,
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
    // 读取与备用来源编排由 Worker 所属模块统一维护；本装配只注入既有宿主/领域端口。
    readWebUrl: async (
      context: RequestContext,
      input: { url: string; signal?: AbortSignal },
    ) => {
      const ctx = { ...context };
      return readWebDocument(input, {
        async readCached(url, signal) {
          const prepared = await webDocumentCache.prepare(ctx, url, signal);
          if (!prepared) return null;
          // 确认具体文件仍为当前版本；冲突或修复失败不得转成重新抓取。
          const {assetId, name, previewUrl, fullText} = await webDocumentCache.confirm(ctx, prepared, undefined, signal);
          return {assetId, name, previewUrl, fullText};
        },
        async read(url, signal) {
          const domain = webDomainFromUrl(url);
          return readWebUrlSidecar(url, { authDir: webAuthDirFor(domain), signal }, {
            openContext: () => openPooledReaderContext(ctx, domain, { signal }) as never,
          });
        },
        async searchers(signal) {
          signal?.throwIfAborted();
          const configured = await resolveSearchSpec(ctx).catch(() => null);
          signal?.throwIfAborted();
          const searchers: AlternateSearcher[] = [];
          if (configured && configured.provider !== "rss" && configured.provider !== "browser") {
            searchers.push((query, count, signal) => searchWebFn(configured, query, searchRegistry, { count, signal }));
          }
          for (const baseUrl of [null, "https://www.baidu.com/s?wd={q}"]) {
            searchers.push((query, count, signal) => searchWebFn({ provider: "browser", baseUrl, model: "", token: "" }, query, searchRegistry, { count, signal }));
          }
          return searchers;
        },
        async hasSession(domain, signal) {
          signal?.throwIfAborted();
          return (await getWebSessionState(ctx, domain)) !== null;
        },
        async saveDocument({ name, sourceUrl, fullText }, signal) {
          signal?.throwIfAborted();
          // 旧宿主端口仍待执行账本接入；新 Worker 将绑定持久 pendingDocument 服务。
          const asset = await assetsService.createGeneratedAsset(ctx, {
            assetType: "document", name, bytes: new TextEncoder().encode(fullText), mimeType: "text/plain", pending: true,
          });
          await assetsService.mergeAiAnnotation(ctx, asset.id, { sourceUrl });
          await assetsService.updateFileExtraction(ctx, asset.id, { extractedText: fullText, extractStatus: "done" });
          const previewUrl = await assetsService.getDownloadUrl(ctx, asset.id).then((r) => r.url ?? null).catch(() => null);
          return { assetId: asset.id, name: asset.name, previewUrl };
        },
      });
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
    ...createLocalReadHost({
      checkGrant: checkLocalReadGrant,
      consumeOnce: consumeLocalReadOnceGrant,
      listAlwaysDirs: listLocalReadAlwaysDirs,
    }),
    // [T-256a] local.tools 端口 —— 探测系统已装工具。安全铁律:工具名一律来自 local-env-probe 白名单
    // 常量(resolveToolsToProbe 已把非法/非白名单请求过滤进 rejected),用**固定 arg 数组** execFile
    // 统一解析绝对路径后执行 `<absolute> --version`，绝不拼 shell 字符串。只读探测、不执行任意命令。
    detectTools: createLocalEnvironmentHost(resolveExecutablePath),
    // [T-256a] local.workspace 端口 —— 列该用户「总是允许该目录」授权过的本地目录根。复用 T-253
    // 授权表(local-read-grants),不新建授权机制;目录内容仍走 readLocalFile 的 listing(不重造)。
    listAuthorizedDirs: async (ctx: RequestContext) => {
      return { dirs: listLocalReadAlwaysDirs(ctx.userId) };
    },
    ...createChatGenerationTasks({aiService,projectsService,reviewGateService,chatTaskSubmissions,readCurrentArtifactTruth,createAiTaskAttemptId,makeReviewSubjectReader,assertReviewableChatScript,ai}),
    ...createChatPreparationTasks({aiService,projectsService,makeReviewSubjectReader,assertReviewableChatScript,readCurrentScriptRefForReview,wakeSubmittedTask,agenticBusiness,getAgenticWorker:()=>agenticWorker,isStopping:()=>stoppingPreparation}),
    ...createChatIngestionTasks({createAiTaskAttemptId,intelligenceService,wakeShareImport:()=>recoveryWake?.wake("share_import"),projectsWithTranscribe}),
    prepareVideoEdit: createVideoEditCandidatePreparer({projectsService,productionService,materialLinksService,assetsService}),
  };

  if(workerEntry){
    chatWorker=composeChatProduction(db,{
      entryPath:workerEntry,runtime:chatRuntime,now:deps.now,
      assertProject:(c,id)=>projectsService.getProjectOverviewCore(c,id),
      resolveModelCredential:(c,capability)=>resolveModelSpec(c,capability),
      resolveFallbackModelCredential:resolveChatFallbackCredential,
      prepareTaskCommit:aiService.prepareTaskCommit,
      trend:{
        listEnabledSources:c=>trendSourcesService.listEnabledSources(c),search:searchWebPort,
        readWebSource:(c,source,signal)=>readWebUrlSidecar(source.url,{authDir:webAuthDirFor(source.domain),signal},{openContext:()=>openPooledReaderContext(c,source.domain,{signal}) as never}),
      },
      webRead:{assets:assetsService,objectStorageForCtx,sessions:browserSessionsService,resolveSearch:c=>resolveSearchSpec(c)},
      onError:code=>console.error(`[chat-worker] ${code}`),
    });
    chatWorker.start();
  }

  recoveryWake=createRecoveryWakeCoordinator({
    intervalMs:2000,
    lanes:{
      radar_project_upgrade: control => radarProjectQueue.tick(control),
      script_candidate:control=>drainProjectScriptCandidateQueue(projectScriptRunnerDeps,5,control),
      topic_preview:control=>drainIntelligenceTopicPreviewQueue(topicPreviewRunnerDeps,{...control,maxTasks:5}),
      transcribe:control=>intelligenceTranscriptRunnerDeps?drainIntelligenceTranscriptQueue(intelligenceTranscriptRunnerDeps,{...control,maxTasks:4,concurrency:2}):Promise.resolve(0),
      source_sync:control=>drainIntelligenceSourceQueue(sourceRunnerDeps,5,control),
      share_import:control=>drainDouyinShareImportQueue(shareImportRunnerDeps,5,control),
      async benchmark(control){if(control.shouldStop())return;await benchmarkTranscription.recoverQueued();if(!control.shouldStop())await benchmarkTranscription.drain(5);},
      async traffic_queue(control){await recoverTrafficQueues({userId:localUser.id,accountId:null,requestId:"traffic-recovery",source:"ingestion"},{
        listJobs:(ctx,query)=>schedulingService.listJobsSystem(ctx,query),
        listRuns:(ctx,id)=>schedulingService.listRunsByJob(ctx,id,{limit:20,offset:0}),
        hasPending:async ctx=>(await trafficService.pending(ctx,1)).length>0,
        start:ctx=>startTrafficJob(ctx),shouldStop:control.shouldStop,
      });},
      async flywheel(control){if(control.shouldStop())return;await recoverQueuedCollection();if(!control.shouldStop())await scheduledFlywheel.drain(collectFlywheel,5);},
    },
    onError:(kind,error)=>console.error(`[recovery-wake] ${kind} 恢复失败`,kind==="flywheel"?error:error instanceof Error?error.name:"UnknownError"),
  });
  if(stoppingPreparation)await recoveryWake.stop();else recoveryWake.start();

  // 所有模型、每日任务回执与恢复消费者装配完成后才启动自动化，避免首轮 tick 读取未初始化服务。
  if (!stoppingPreparation && process.env.CREATOROS_DISABLE_BACKGROUND_DRIVERS !== "1") {
    void startUnifiedAutomationDriver().catch(error =>
      console.error("[automation-driver] 启动失败:", error),
    );
  }

  if(modelWorker)preparationRecovery=Promise.all([
    transcribeBusiness.recoverQueued(
      async(c,id)=>{await aiService.markFailed(c,id,"此转写任务已有旧执行记录，请核对逐字稿后从作品重新发起").catch(()=>{});},
      async(c,id)=>{await aiService.markFailed(c,id,"转写任务准备未完成，请检查模型配置后重试").catch(()=>{});},
      ()=>stoppingPreparation,
    ),
    businessExecution.recoverQueued(async(c,id)=>{await aiService.markFailed(c,id,"任务准备未完成，请重新发起").catch(()=>{});},()=>stoppingPreparation),
    assetBusiness.recoverQueued(async(c,id)=>{await aiService.markFailed(c,id,"素材任务准备未完成，请检查配置与原任务").catch(()=>{});},()=>stoppingPreparation),
  ]).then(()=>{}).catch(()=>console.error("[execution-worker] PREPARATION_RECOVERY_FAILED"));
  if(agenticWorker)agenticPreparationRecovery=agenticBusiness.recoverQueued(async(c,id)=>{
    await aiService.markFailed(c,id,"自主任务准备未完成，请重新发起").catch(()=>{});
  },()=>stoppingPreparation).catch(()=>console.error("[agentic-worker] PREPARATION_RECOVERY_FAILED"));
  agenticWorker?.start();
  modelWorker?.start();

  return {
    readPageRevision: createPageReadRevisionReader(db),
    projectListCoverIds: (ctx, projectIds) => readProjectListCoverIds(ctx, projectIds, { projects: projectsService, publishing: publishingService }),
    cliInvocations,
    projects: projectsWithTranscribe, // wrap:透传 CRUD + 拦 projects.transcribe(T-374)
    taxonomy,
    notifications,
    search,
    // 两层 composition wrap：测试连接 + 当前验签 scope 下的渠道 service Key。
    settings: settingsWithChannelModelCredentials,
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
    browserTaskAuthorizationRuntime: {
      async prepare(ctx,taskId) {
        if(!agenticWorker)throw new Error("AGENTIC_WORKER_UNAVAILABLE");
        await createBrowserTaskAuthorizationService(db).requireGrant(ctx,taskId);
        const prepared=await agenticBusiness.prepare(ctx,taskId);
        if(prepared.executionTaskId)agenticWorker.start();
      },
      async grant(ctx,taskId,input) {
        if(!agenticWorker)throw new Error("AGENTIC_WORKER_UNAVAILABLE");
        const result=await createBrowserTaskAuthorizationService(db).grant(ctx,taskId,input);
        const prepared=await agenticBusiness.prepare(ctx,taskId);
        if(prepared.executionTaskId) agenticWorker?.start();
        return result;
      },
    },
    executionPreviewRuntime: {
      readVideo: (ctx, taskId, artifactPath) =>
        executionService.previewArtifact(ctx, taskId, artifactPath),
    },
    intelligence,
    positioning,
    candidate,
    calibration,
    platformAccount,
    scheduling: schedulingWithRunNow, // wrap:透传 CRUD + 拦 scheduledJobs.runNow(D5)
    contentCalendar,
    contentCalendarService,
    publishingScheduleProjection: (ctx, month) =>
      buildPublishingScheduleProjection(
        {
          calendar: contentCalendarService,
          projects: projectsService,
          publishing: publishingService,
          analytics: analyticsService,
        },
        ctx,
        month,
      ),
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
// 即降级告警)、启动统一 automation-driver(审计实录:普通 web build 日志曾出现上述副作
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
// seed/sweep/automation-driver 因此一个都不会执行 —— 不是只挡一半。同步 throw(先于单例缓存
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

async function getKnowledge(): Promise<Transport> {
  return (await getBundle()).knowledge;
}

async function getProduction(): Promise<Transport> {
  return (await getBundle()).production;
}

async function getCandidate(): Promise<Transport> {
  return (await getBundle()).candidate;
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

/** T-599 服务端页面组合使用；写侧仍只走公开 calendar operations。 */
export async function getContentCalendarService(): Promise<ContentCalendarService> {
  return (await getBundle()).contentCalendarService;
}

export async function getPublishingScheduleProjection(
  ctx: RequestContext,
  month?: string,
): Promise<PublishingScheduleProjection> {
  return (await getBundle()).publishingScheduleProjection(ctx, month);
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

/** T-843 CLI Gateway 的唯一持久化端口；route 不直连 Drizzle。 */
export async function getCliInvocationService(): Promise<CliInvocationService> {
  return (await getBundle()).cliInvocations;
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

/** T-703：待确认执行产物的只读临时预览，采纳/丢弃后 service 自动返回 404。 */
export async function getExecutionPreviewRuntime(): Promise<
  PersistenceBundle["executionPreviewRuntime"]
> {
  return (await getBundle()).executionPreviewRuntime;
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

// 生产复合transport只分发给已登记的真实服务；未实现操作明确拒绝。
// Used by BOTH the server pages (contract-client.server) and the /api/v1 route,
// so server reads and island writes share one pglite store — island mutations
// persist and a router.refresh() reflects them.
export const compositeTransport: Transport = withPageReadInvalidation(createApplicationTransport(getBundle));

// Test hook: drop the pglite singleton so each test starts from a fresh seed.
export function __resetPersistenceForTests(): void {
  void globalForPersistence.__creatorosStopExecutionWorker?.().catch(()=>{});
  globalForPersistence.__creatorosStopExecutionWorker=undefined;
  globalForPersistence.__creatorosPersistence = undefined;
}

export async function getBrowserTaskAuthorizationRuntime(): Promise<PersistenceBundle["browserTaskAuthorizationRuntime"]> {
  return (await getBundle()).browserTaskAuthorizationRuntime;
}

/** 仅展示缓存读取提交版本；业务服务和 AI 不使用展示快照。 */
export async function readPageRevision(): Promise<string> {
  return (await getBundle()).readPageRevision();
}

/** 项目列表封面仅经账号隔离的批量业务读取；失败由页面回退占位。 */
export async function getProjectListCoverIds(ctx: RequestContext, projectIds: readonly string[]): Promise<Record<string, string | null>> {
  return (await getBundle()).projectListCoverIds(ctx, projectIds);
}
