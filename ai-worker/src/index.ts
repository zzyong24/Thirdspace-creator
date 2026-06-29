export const AI_WORKER_PACKAGE = "@creatoros/ai-worker";

// Public worker surface (Task 11). The host (the Next app's composition root, in dev/seed
// run mode) imports the runner factory + the run-loop drainer; the SDK lives ONLY in the
// lazily-imported ClaudeAgentRunner so importing this package never requires
// @anthropic-ai/claude-agent-sdk. The orchestrator / confirm / state-machine / context
// tools stay the structural-port substrate the host binds to the shared pglite db.
export {
  createAgentRunner,
  createClaudeAgentRunner,
} from "./runner/agent-runner-factory";
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
  getTemplate,
  hasTemplate,
  overrideTemplates,
} from "./prompt/registry";
export { TOPIC_GENERATE_TEMPLATE } from "./prompt/templates/topic-generate";
export { SCRIPT_DRAFT_TEMPLATE } from "./prompt/templates/script-draft";
export {
  runScriptNode,
  parseShots,
  type ScriptShot,
  type RunScriptNodeInput,
  type RunScriptNodeResult,
} from "./nodes/script-node";
