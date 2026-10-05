export {createVideoEditCandidatePreparer} from "./video-edit-candidate";
// AI runtime module (T-163) —— 前端 AI SDK 解耦:26 个 runner + AI 编排基底(creative-context /
// llm 适配 / multimodal 解析 / skill 覆盖)从 frontend 包下沉至此,使 AI 生成逻辑 + prompt 调用
// 住在受保护的 backend 侧(桌面化 T-147 护城河前置)。前端只经 `@creatoros/backend/modules/
// ai-runtime` 这一 barrel 取 runner + 端口类型,不再 import `@/server/ai/*`。
//
// 边界(design-spec §3.1/§3.4):本模块 import `@creatoros/ai-worker`(模板 REGISTRY +
// runStructuredNode),故**独立于** `modules/ai`(那个持久化模块的不变量禁 import ai-worker)。
// chat 上下文与工具定义准备及 web search(search/)不在此说明范围 —— 前者走
// §3.2 流式端点(Batch 3),后者属前端 browser 设施经端口注入。

// [T-271] 制作封面链 runner(结构化封面方案 + 文案诚实门 + 结构化组装生图 prompt)。
export * from "./cover-runner";
export * from "./calibration-diagnose-runner";
export * from "./calibration-score-runner";
// [T-189a] 绑定抖音 → 幂等建三个每天定时采集 job + 初始化跑一次(纯编排,组合根经 onDouyinBound 接)。
export * from "./collection-bootstrap";
// [T-212a] 对标采集器(benchmark sourceKind 的确定性采集体,注入端口可单测)。
export * from "./benchmark-collector";
// [T-212c] 对标爆款拆解 → 转化进选题池(runBenchmarkTeardown 编排 + createBenchmarkTeardownPort AI 端口)。
export * from "./benchmark-teardown-runner";
// [T-235b] 低粉黑马雷达采集器(平台内证据:关键词搜近1天最多赞 → 三档判黑马 → 落对标爆款库)。
export * from "./darkhorse-collector";
// [T-235b] 热点信源信号采集(通用网页信源主路 readUrl+AI 抽取 / RSS 辅路 feed 解析)。
// [T-238] 出题依据信号质量画像(纯函数)+ 评论强信号过滤 —— chat 出题 / topic.daily 共享装配。
export * from "./signal-quality";
// 聊天上下文与工具定义准备；模型执行由独立持久 Worker 承担。
export * from "./chat-context";
export * from "./chat-assembly";
export * from "./chat-assembly-types";
export * from "./chat-assembly-context";
export { prepareChatTurn, prepareDurableChatTurn } from "./chat-turn-preparation";
export { createChatTaskToolHost } from "./chat-task-tool-host";
export * from "./chat-tools";
export * from "./channel-model-config";
// [T-429/T-430] 长输入 AI 节点统一的确定性分块、串行执行与进度契约。
export * from "./chunk-and-merge";
// [T-253] local.read 安全硬门(denylist/路径归一/二进制探测,纯函数)—— composition root
// (persistence-client readLocalFile 端口)与授权 route 共用。
export * from "./local-read-security";
// [T-262] local.read 文件名搜索兜底(scoped 目录集按 basename 搜同名,纯逻辑 + 注入式 fs)——
// composition root(persistence-client readLocalFile)在 realpath miss 时调用。
export * from "./local-name-search";
// [T-256a] 环境感知扩展:工具探测纯函数(白名单/防注入/版本解析)—— 端口层与工具门共用。
export * from "./local-env-probe";
export * from "./comment-qa-sift-runner";
export * from "./error-diagnostics";
// [T-513] account-scoped immutable Effective Skill snapshot：task→skill 确定性映射、
// official+overlay 合并、server platform policy 注入与 256 KiB 序列化门。
export * from "./effective-skill-snapshot";
export * from "./creative-context";
export * from "./knowledge-classify-runner";
export * from "./knowledge-distill-runner";
export * from "./knowledge-relate-runner";
export * from "./favorites-distill-runner";
export * from "./llm/parse";
export * from "./llm/provider";
// [T-239b S1] 错误恢复层:分类重试/退避纯函数 + 恢复模型包装器(chat 主链路 + 组合根消费)。
export * from "./llm/resolve";
export * from "./llm/retry-policy";
export * from "./material-match-runner";
export * from "./remote-prompt-bundle";
export * from "./multimodal/resolve";
export * from "./planning-outline-context";
export * from "./positioning-runner";
export * from "./reconstruct-content";
export * from "./research-runner";
export * from "./scheduled-collection-runner";
export * from "./scheduled-collection-scheduler";
export * from "./automation-driver";
export * from "./script-runner";
export * from "./skill-config-overrides";
// [T-235a] 每天自动出题采集器(topic.daily sourceKind:多依据合并出题 → 护栏排序 → 候选落 pool)。
// [T-235d] 正向归因回流(runTopicAttribution 编排 + createTopicAttributionPort AI 端口 + 分层纯函数)。
export * from "./topic-attribution-runner";
export * from "./topic-enrich-runner";
export * from "./topic-runner";
export * from "./topic-basis";
export * from "./transcribe-runner";
// [T-357] 采集逐字稿后处理(同音错字纠正+补标点+语义分段;落库前一遍,失败诚实落原文)。
export * from "./transcript-postprocess";
// [T-254b] 制作视频四决策(runVideoDecisions 编排 + 四决策函数 + 动态 refine schema 构造器
// + 可溯校验)与 SRT 纯函数(解析/时长匹配/口播稿相似度/吸附;T-254c 上传校验共用)。
export * from "./srt";
export * from "./video-decisions-runner";

export { createPlatformAdaptExecutionService } from "./platform-adapt-execution.service";
export { preparePlatformAdaptContext, projectPlatformAdaptCandidate, type PlatformDraft } from "./platform-adapt-context";
export { createPlatformDraftAdoptionPort } from "./platform-draft-adoption";

export * from "./structured-business-execution.service";
export { prepareScriptReviewContext, buildLexiconBlock, type ScriptSource, type LintRulesSource, type ScriptReviewPositioningReader } from "./script-review-context";
export { prepareReviewContext, projectReviewCandidate, reviewFacets, normalizeLearnings, type LearningItem, type ReviewTask } from "./review-context";
export {preparePlanningContractContext,projectPlanningContractCandidate} from "./planning-contract-context";

export * from "./artifact-context-readers";

export * from "./agentic-business-execution.service";
export * from "./agentic-material-tools";

export {createAgenticResearchTools} from "./agentic-research-tools";
export { projectScriptDraftCandidate } from "./script-candidate-projection";

export { createScriptBusinessAdapter } from "./script-business-adapter";
export { preparePlanningThesisContext } from "./planning-thesis-context";
export { createPlanningThesisBusinessAdapter } from "./planning-thesis-business-adapter";

export * from "./browser-task-authorization.service";

export * from "./target-business-adapters";

export * from "./calibration-positioning-business-adapters";
export * from './research-business-adapter';

export * from './topic-business-adapter';

export {createDailyTopicBusinessAdapter,type DailyTopicPrepareDeps} from "./daily-topic-business-adapter";

export {createCopilotBusinessAdapter} from "./copilot-business-adapter";

export {createLocalEnvironmentHost} from "./local-environment-host";

export {resolveSearchSpec,type SearchSpec,type ResolveSearchDeps} from "./search/resolve";

export {createLocalReadHost,type LocalReadGrantPorts} from "./local-read-host";

export {createAssetBusinessExecutionService} from "./asset-business-execution.service";

export {preparePublishPackageTaskInput} from "./publish-package-task-input";

export {createTranscribeBusinessExecutionService} from "./transcribe-business-execution.service";

export {createChatIngestionTaskToolHost,type ChatIngestionToolPorts} from "./chat-ingestion-tool-host";
export * from "./chat-production-runtime";
export {createChatBusinessGenerationPreparation} from "./chat-business-generation-preparation";
export {createChatTrendRead,type ChatTrendReadDeps} from "./chat-trend-read";
export {createCoverBusinessAdapter} from "./cover-business-adapter";

export {composeChatProduction,type ChatProductionCompositionDeps,type ChatProductionServicePorts} from "./chat-production-composition";

export {createAgenticCollectionTools} from "./agentic-collection-tools";

export * from "./reconstruct-business-adapter";
export {createVideoDecisionsBusinessAdapter} from "./video-decisions-business-adapter";

export * from "./asset-processing-business-adapter";
export {createTopicPreferenceBusinessAdapter,createTopicPreferenceSubmission} from "./topic-preference-business-adapter";

export {createScriptSimilarityBusinessAdapter,createScriptSimilarityEvaluator} from "./script-similarity-business-adapter";
export {createScheduledFlywheelExecutionService,type ScheduledFlywheelScope,type ScheduledFlywheelCollector,type ScheduledFlywheelModels,type ScheduledFlywheelDeps} from './scheduled-flywheel-execution.service';
export {ScheduledFlywheelSuspended} from './scheduled-flywheel-suspension';

export {createEmbeddingIoService} from "./embedding-io.service";

export {createModelProbeIoService} from "./model-probe-io.service";

export {resolveSubmittedChatToolParameters} from "./chat-submitted-tool-parameters";

export {createChatRedfoxTaskToolHost} from "./chat-redfox-tool-host";

export {createLocalCodexStatusService} from "./local-codex-status.service";

export {transcribeConfiguration} from './transcribe-business-execution.service';

export type {StructuredBusinessAdapter} from "./structured-business-execution.service";
