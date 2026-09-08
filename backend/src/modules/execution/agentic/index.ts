// [T-256b/c] 自主任务运行时(受控 agentic executor)出口。
export {
  classifyLoopType,
  isAgenticTaskType,
  assertLoopType,
  LoopTypeMismatchError,
  AGENTIC_TASK_TYPE_PREFIX,
  type LoopType,
} from "./loop-type";
export {
  createLoopController,
  estimateTokens,
  type LoopBudget,
  type LoopController,
  type LoopCheckpoint,
  type StopReason,
} from "./loop-control";
export type {
  AgenticEngine,
  AgenticEngineRunInput,
  AgenticEngineFinal,
  AgenticTool,
  AgenticToolResult,
  AgenticToolExecOpts,
  ToolEffect,
  EngineLlm,
  EngineLlmResult,
} from "./engine";
export {
  createPiAgenticEngine,
  PiNotInstalledError,
  type PiAgenticEngineDeps,
  type PiStreamFnBuilder,
} from "./pi-engine";
export {
  AGENTIC_TASK_TOOL_SCOPES,
  resolveAgenticToolScope,
  filterToolsToScope,
} from "./tool-scopes";
export {
  createResearchTools,
  RESEARCH_WEB_READ_WINDOW_CHARS,
  createCollectionTools,
  createMaterialTools,
  type ResearchPorts,
  type CollectionPorts,
  type MaterialPorts,
} from "./adapters";
