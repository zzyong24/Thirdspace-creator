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
export { SCRIPT_DRAFT_TEMPLATE } from "./prompt/templates/script-draft";
// 脊柱-1 第二批:6 个 runner 迁 Vercel SDK 共用的外置模板(提示词模板化解耦)。
export { PLANNING_THESIS_TEMPLATE } from "./prompt/templates/planning-thesis";
export { PLANNING_CONTRACT_TEMPLATE } from "./prompt/templates/planning-contract";
export { PLANNING_OUTLINE_TEMPLATE } from "./prompt/templates/planning-outline";
export { PLATFORM_ADAPT_TEMPLATE } from "./prompt/templates/platform-adapt";
export { REVIEW_INSIGHTS_TEMPLATE } from "./prompt/templates/review-insights";
export { CALIBRATION_DIAGNOSE_TEMPLATE } from "./prompt/templates/calibration-diagnose";
export {
  runScriptNode,
  parseShots,
  type ScriptShot,
  type RunScriptNodeInput,
  type RunScriptNodeResult,
} from "./nodes/script-node";
// 素材搜集节点 —— 唯一带工具的迁移节点(anthropic 内置 web search;弃旧 Claude Agent SDK)。
export {
  runResearchNode,
  parseMaterials,
  anthropicWebSearchTools,
  type MaterialItem,
  type RunResearchNodeInput,
  type RunResearchNodeResult,
} from "./nodes/research-node";
export { RESEARCH_GATHER_TEMPLATE } from "./prompt/templates/research-gather";
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
