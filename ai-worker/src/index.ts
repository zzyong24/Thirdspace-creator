export const AI_WORKER_PACKAGE = "@creatoros/ai-worker";

// Public worker surface (Task 11). The host (the Next app's composition root, in dev/seed
// run mode) imports the runner factory + the run-loop drainer. The legacy ClaudeAgentRunner
// (@anthropic-ai/claude-agent-sdk) is RETIRED — 全程 Vercel AI SDK(产品定位 §9 铁律1):
// real generation runs on the Vercel AI SDK runtime (runtime/agent-runtime + provider-factory
// + the templated/script/research nodes), so this package no longer depends on the Agent SDK
// at all. createAgentRunner now only yields the deterministic FakeAgentRunner. The
// orchestrator / confirm / state-machine / context tools stay the structural-port substrate
// the host binds to the shared pglite db.
export { createAgentRunner } from "./runner/agent-runner-factory";
export type { AgentRunnerEnv } from "./runner/agent-runner-factory";
export { createFakeAgentRunner } from "./runner/fake-agent-runner";
export { drainQueue } from "./run-loop";
export type { RunLoopDeps, RunLoopOutcome } from "./run-loop";
export { runTask } from "./orchestrator";
export type { RunTaskDeps, RunTaskResult } from "./orchestrator";
export { confirmResult, rejectResult } from "./confirm";
export { canTransition, AI_TASK_STATUSES } from "./state-machine";
export type { AiTaskStatus } from "./state-machine";
export { resolveRunOptions } from "./agent-config-resolver";
export type {
  AgentConfigRow,
  ModelConfigRow,
} from "./agent-config-resolver";
export { createContextTools } from "./context-tools";
export {
  parseCandidate,
  formalizes,
  RESULT_TYPES,
} from "./candidate-schemas";
export type {
  AgentRunner,
  AgentRunOptions,
  AgentRunOutcome,
  AiTaskRecord,
  AiTaskStore,
  AiTaskReferenceRecord,
  AiTaskResultRecord,
  ContextTools,
  DomainReadPort,
  DomainWritePort,
} from "./ports";

// Phase 3 Agent Runtime(Vercel AI SDK 薄壳)+ 节点 + 编排。host(persistence-client)
// 解析 model(modelFor)+ 装配 positioningBrief + 注入真 ports,调 runTopicTask 即可。
export {
  runAgentNode,
  type AgentStepEvent,
  type RunAgentNodeOptions,
  type RunAgentNodeResult,
} from "./runtime/agent-runtime";
export {
  modelFor,
  type ModelSpec,
  type ApiFormat,
} from "./runtime/provider-factory";
// 多模态 provider 工厂(SPEC 2026-07-01 §2.2 / §8 M1/M2)—— 生图/生视频用户可配 provider
// 抽象,与文本 modelFor 并列。host(persistence-client)解析 MultimodalSpec(resolveMultimodalSpec)
// + 注册 provider 适配器,调 generateImage/generateVideo 即可。上层统一 `{ assetBytes }` 契约
// ([gate-F1]),异步 video 轮询封在适配器内。asset.generate runner (M2) 消费这些。
export {
  generateImage,
  generateVideo,
  MultimodalConfigError,
  MultimodalGenerationError,
  type MultimodalSpec,
  type MultimodalProviderAdapter,
  type MultimodalProviderRegistry,
  type GeneratedAsset,
  type GenerateImageOptions,
  type GenerateVideoOptions,
} from "./runtime/multimodal-factory";
// ASR 逐字稿工厂 + 类型(T-030-D1)—— transcribeAudio 与 generateImage/Video 并列。
// host(D2 transcribe-runner)解析 MultimodalSpec(resolveTranscribeSpec,kind=audio)+ 注册
// ASR adapter,调 transcribeAudio 即可,返回 `{ text, language? }`。
export {
  transcribeAudio,
  type GeneratedTranscript,
  type TranscribeAudioOptions,
} from "./runtime/multimodal-factory";
// MiniMax 适配器(M1 的默认真 provider)—— host 注册进 registry(keyed by "minimax")。
// deps 可注入(fake fetch/sleep)供单测;video 的异步轮询状态机(submit→poll→retrieve、
// maxPollAttempts 超时抛错)封在这里,M2 runner 把超时 catch 成 cancelTask。
export {
  createMinimaxAdapter,
  type MinimaxAdapterDeps,
} from "./runtime/multimodal-minimax";
// OpenAI 兼容 ASR 适配器(T-030-D1 的默认真 ASR provider)—— host 注册进 registry(keyed by
// "siliconflow"/"openai"/"groq" 等用户所配 provider 名)。deps 可注入(fake fetch)供单测;
// 直连 `POST {baseUrl}/v1/audio/transcriptions`(multipart file+model,Bearer)。
export {
  createOpenaiAsrAdapter,
  type OpenaiAsrAdapterDeps,
} from "./runtime/multimodal-openai-asr";
// Fake 多模态适配器(测试支持,零成本)—— 与 createFakeAgentRunner 同类的测试用假件,经 index
// 公开出口给消费方单测用(frontend asset.generate runner 测装配 + 异步轮询)。含 fake 异步
// video provider(先 taskId、N 次轮询后返 bytes),坐实 [gate-F1]/[gate-F2] 的异步链路覆盖。
export {
  createFakeAdapter,
  createImageOnlyFakeAdapter,
  createFakeAsyncVideoAdapter,
} from "./runtime/multimodal-factory.fake";

// [T-055h asset.classify] 视觉理解(OpenAI 兼容 chat vision,VLM 看图打标签)。
export { describeImageOpenAICompatible } from "./runtime/vision";
export { toToolSet, type ToolDef } from "./runtime/tool-registry";
export {
  runTopicNode,
  parseTopics,
  type TopicItem,
  type TopicBasis,
} from "./nodes/topic-node";
export {
  runTopicTask,
  type TopicTaskPorts,
  type RunTopicTaskInput,
} from "./orchestrate/run-topic-task";
// 提示词模板系统(脊柱-1):模板化解耦 + 注册表(可版本化/外部覆盖/未来服务端推送)。
export {
  bindPrompt,
  PromptBindError,
  type PromptTemplate,
  type BoundPrompt,
} from "./prompt/template";
export {
  registerTemplate,
  registerAllTemplates,
  getTemplate,
  hasTemplate,
  getTools,
  resolveOutputSchema,
  hasOutputSchema,
  exportSkillSchema,
  overrideTemplates,
  overrideTemplatesFromConfig,
  clearSchemaOverride,
  clearAllSchemaOverrides,
  _resetRegistry,
  type SkillConfigOverride,
} from "./prompt/registry";
// Skill 输出契约 ⇄ JSON Schema 配置口子(SPEC §4.3):导出(zod→JSON Schema)+ 回灌(JSON Schema→ajv 校验器)。
export {
  exportZodToJsonSchema,
  applySchemaOverride,
  type JsonSchema,
  type SchemaValidator,
} from "./prompt/schema-bridge";
export { TOPIC_GENERATE_TEMPLATE } from "./prompt/templates/topic-generate";
export {
  SCRIPT_DRAFT_TEMPLATE,
  scriptDraftSchema,
  scriptShotSchema,
  type ScriptDraftOutput,
} from "./prompt/templates/script-draft";
// 脊柱-1 第二批:6 个 runner 迁 Vercel SDK 共用的外置模板(提示词模板化解耦)。
// T-025:planning 三节点加 outputSchema 走结构化(跨模型健壮),schema/type 一并导出。
export {
  PLANNING_THESIS_TEMPLATE,
  thesisTreeSchema,
  type ThesisTreeOutput,
} from "./prompt/templates/planning-thesis";
export {
  PLANNING_CONTRACT_TEMPLATE,
  contractSchema,
  type ContractOutput,
} from "./prompt/templates/planning-contract";
export {
  PLANNING_OUTLINE_TEMPLATE,
  outlineSchema,
  type OutlineOutput,
} from "./prompt/templates/planning-outline";
// T-025:platform.adapt / review.insights / calibration.diagnose 三节点加 outputSchema 走结构化
// (跨模型健壮,让用户默认 MiniMax 也稳定吐可解析产物),schema/type 一并导出。
export {
  PLATFORM_ADAPT_TEMPLATE,
  platformAdaptSchema,
  type PlatformAdaptOutput,
} from "./prompt/templates/platform-adapt";
export {
  REVIEW_INSIGHTS_TEMPLATE,
  reviewInsightsSchema,
  type ReviewInsightsOutput,
} from "./prompt/templates/review-insights";
export {
  CALIBRATION_DIAGNOSE_TEMPLATE,
  diagnosisSchema,
  type DiagnosisOutput,
} from "./prompt/templates/calibration-diagnose";
// T-025b:positioning.generate / topic.enrich / material.match 三个 frontend runner 迁 runStructuredNode
// (跨模型健壮,让用户默认 MiniMax 也稳定吐可解析产物)所需的外置模板 + outputSchema,schema/type 一并导出。
export {
  POSITIONING_GENERATE_TEMPLATE,
  positioningSuggestionSchema,
  type PositioningSuggestionOutput,
} from "./prompt/templates/positioning-generate";
export {
  TOPIC_ENRICH_TEMPLATE,
  topicCardSchema,
  type TopicCardOutput,
} from "./prompt/templates/topic-enrich";
export {
  MATERIAL_MATCH_TEMPLATE,
  materialMatchSchema,
  type MaterialMatchOutput,
} from "./prompt/templates/material-match";
// T-062c 知识倾倒场:倒入原文 → 结构化归类候选 {knowledgeType,title,tags,summary}(确认门
// 采纳才 knowledge.create)。schema/type 一并导出给 frontend knowledge-classify-runner。
export {
  KNOWLEDGE_CLASSIFY_TEMPLATE,
  knowledgeClassifySchema,
  type KnowledgeClassifyOutput,
} from "./prompt/templates/knowledge-classify";
export {
  runScriptNode,
  parseShots,
  type ScriptShot,
  type RunScriptNodeInput,
  type RunScriptNodeResult,
} from "./nodes/script-node";
// 素材搜集节点 —— L2 创作向重写:generateObject 绑四类 outputSchema(钩子/案例/数据点/金句),
// schema 强约束让任何模型(MiniMax/Claude)都产可解析输出,根治旧版自由文本解析的卡死。
export {
  runResearchNode,
  flattenCategories,
  anthropicWebSearchTools,
  type MaterialItem,
  type ResearchCategories,
  type RunResearchNodeInput,
  type RunResearchNodeResult,
} from "./nodes/research-node";
export {
  RESEARCH_GATHER_TEMPLATE,
  researchMaterialSchema,
  type ResearchMaterialOutput,
} from "./prompt/templates/research-gather";
// T-030-D4:作品初始化 auto-fill 重建 skill —— imported 作品逐字稿 + 真实指标 → { research, planning }
// 重建包(标 origin='reconstructed')。schema 定义在本包(有 zod);frontend runner 引它绑 generateObject。
export {
  RECONSTRUCT_PROJECT_TEMPLATE,
  reconstructProjectSchema,
  type ReconstructProjectOutput,
} from "./prompt/templates/reconstruct-project";
// 通用模板节点 —— 6 个无工具纯生成 runner 共用(bindPrompt → runAgentNode → {text, steps})。
export {
  runTemplatedNode,
  type RunTemplatedNodeInput,
  type RunTemplatedNodeResult,
} from "./nodes/templated-node";
// 结构化模板节点 —— 每轮 schema 约束(generateObject 绑 Zod,校验失败自动重试,防发散)。
// B2 编导自动评分(calibration.score)用它产「维度真实分」候选。
export {
  runStructuredNode,
  type RunStructuredNodeInput,
  type RunStructuredNodeResult,
} from "./nodes/structured-node";
// B2 编导自动评分(calibration.score)外置模板 + 输出 schema —— 真实指标 → 维度真实分候选。
// schema 定义在本包(有 zod);frontend runner 引它绑 generateObject,无需直引 zod。
export {
  CALIBRATION_SCORE_TEMPLATE,
  calibrationScoreSchema,
  type CalibrationScoreOutput,
} from "./prompt/templates/calibration-score";
// ChatBox 每轮输出契约脊梁(SPEC §4.2)—— 两段 { reply, candidates[], nextActions[] } + 工具白名单。
export {
  CHATBOX_TOPIC_TEMPLATE,
  chatboxTurnSchema,
  type ChatboxTurnOutput,
} from "./prompt/templates/chatbox-turn";
// ChatBox 各 surface(校准/定位/复盘)对话化 skill(T-004 slice 2)—— 同两段 { reply, ...特定结构 }。
export {
  CHATBOX_CALIBRATION_TEMPLATE,
  chatboxCalibrationSchema,
  type ChatboxCalibrationOutput,
  CHATBOX_POSITIONING_TEMPLATE,
  chatboxPositioningSchema,
  type ChatboxPositioningOutput,
  CHATBOX_REVIEW_TEMPLATE,
  chatboxReviewSchema,
  type ChatboxReviewOutput,
} from "./prompt/templates/chatbox-surfaces";
