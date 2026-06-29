export const AI_WORKER_PACKAGE = "@creatoros/ai-worker";

// Public worker surface (Task 11). The host (the Next app's composition root, in dev/seed
// run mode) imports the runner factory + the run-loop drainer; the SDK lives ONLY in the
// lazily-imported ClaudeAgentRunner so importing this package never requires
// @anthropic-ai/claude-agent-sdk. The orchestrator / confirm / state-machine / context
// tools stay the structural-port substrate the host binds to the shared pglite db.
export {
  createAgentRunner,
  createClaudeAgentRunner,
} from "./runner/agent-runner-factory.js";
export type { AgentRunnerEnv } from "./runner/agent-runner-factory.js";
export { createFakeAgentRunner } from "./runner/fake-agent-runner.js";
export { drainQueue } from "./run-loop.js";
export type { RunLoopDeps, RunLoopOutcome } from "./run-loop.js";
export { runTask } from "./orchestrator.js";
export type { RunTaskDeps, RunTaskResult } from "./orchestrator.js";
export { confirmResult, rejectResult } from "./confirm.js";
export { canTransition, AI_TASK_STATUSES } from "./state-machine.js";
export type { AiTaskStatus } from "./state-machine.js";
export { resolveRunOptions } from "./agent-config-resolver.js";
export type {
  AgentConfigRow,
  ModelConfigRow,
} from "./agent-config-resolver.js";
export { createContextTools } from "./context-tools.js";
export {
  parseCandidate,
  formalizes,
  RESULT_TYPES,
} from "./candidate-schemas.js";
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
} from "./ports.js";

// Phase 3 Agent Runtime(Vercel AI SDK 薄壳)+ 节点 + 编排。host(persistence-client)
// 解析 model(modelFor)+ 装配 positioningBrief + 注入真 ports,调 runTopicTask 即可。
export {
  runAgentNode,
  type AgentStepEvent,
  type RunAgentNodeOptions,
  type RunAgentNodeResult,
} from "./runtime/agent-runtime.js";
export {
  modelFor,
  type ModelSpec,
  type ApiFormat,
} from "./runtime/provider-factory.js";
export { toToolSet, type ToolDef } from "./runtime/tool-registry.js";
export {
  runTopicNode,
  parseTopics,
  type TopicItem,
  type TopicBasis,
} from "./nodes/topic-node.js";
export {
  runTopicTask,
  type TopicTaskPorts,
  type RunTopicTaskInput,
} from "./orchestrate/run-topic-task.js";
