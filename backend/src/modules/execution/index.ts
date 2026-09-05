// Execution 模块(T-255a 执行层框架,脑手分离)—— 唯一公共出口(foundation §1)。
//
// 存储复用 ai_tasks(taskType 命名空间 `exec.*`,六态 + 步骤流 + 结果表现成,零新表/
// 零迁移);本模块自己不碰 db,读写全经注入的 AI/Assets 端口(SPEC §22)。组成:
//   - 任务契约/manifest:contract resources/execution.ts(单一真值);
//   - 沙箱:workspaces/<taskId>/{input/,out/},路径防护 + 敏感文件 denylist(T-253 共库);
//   - executor 注册表:A 型确定性脚本先行,接口按 B 案形状建(T-255b 零改动注册引擎);
//   - runExecutionTask:live dispatch 编排(超时/abort/步骤流/收割 manifest);
//   - service/transport:execution.tasks 5 op,确认门(采纳入库/丢弃清沙箱,铁律②)。

export {
  createExecutionService,
  type ExecutionService,
  type ExecutionServiceDeps,
  type ExecutionAiServicePort,
  type ExecutionAssetsWritePort,
} from "./execution.service";

export {
  createExecutionTransport,
  EXECUTION_OP_IDS,
} from "./execution.transport";

export {
  createPersistentTaskService,
  type PersistentTaskService,
  type PersistentTaskServiceDeps,
  type PersistentTaskClaim,
  type PersistentTaskKind,
  type PersistentTaskOwnerType,
  type PersistentTaskStatus,
  type PersistentTaskCommand,
  type EnqueuePersistentTaskInput,
} from "./persistent-task.service";

export {
  runExecutionTask,
  abortExecutionTask,
  type RunExecutionTaskDeps,
  type ExecutionAiPort,
  type ExecutionAssetsReadPort,
} from "./run-execution-task";

export {
  createExecutorRegistry,
  createEchoManifestExecutor,
  registerBuiltinExecutors,
  type ExecutorRegistry,
  type ExecutionExecutor,
  type ExecutorRunOpts,
  type ExecutorSandboxView,
} from "./executor-registry";

export {
  resolveWorkspacesRoot,
  sandboxDirFor,
  resolveInsideDir,
  createSandbox,
  materializeInputs,
  harvestArtifacts,
  readArtifactBytes,
  cleanupSandbox,
  pruneSandboxIntermediates,
  sweepInterruptedRenderFrames,
  sweepOrphanSandboxes,
  mimeForFileName,
  SandboxPathViolation,
  SandboxOutputLimitError,
  type SandboxPaths,
  type MaterializedInput,
  type InterruptedRenderFrameSweepResult,
} from "./sandbox";

export { isSensitiveFileName } from "./sensitive-files";

// [T-254a] video.render executor(HyperFrames 模板工程 + 确定性渲染)。
export {
  createVideoRenderExecutor,
  type VideoVisualReviewer,
  type VideoVisualReview,
  parseVideoVisualReview,
  createDefaultVideoRenderEngine,
  type VideoRenderEngine,
} from "./video-render/executor";
export {
  generateVideoRenderHtml,
  collectMediaFiles,
  resolveSceneMode,
  resolveMainBrollGeometry,
  assertVideoLayoutSafety,
  stabilizeVideoLayoutSafety,
  type VideoLayoutSafetyFallback,
  type TemplateOptions,
} from "./video-render/template";

export {
  EXEC_TASK_TYPE_PREFIX,
  EXECUTION_MANIFEST_RESULT_TYPE,
  EXECUTION_ADOPTED_RESULT_TYPE,
  EXECUTION_ADOPTED_ITEM_RESULT_TYPE,
  adoptedItemsOf,
  isExecutionTaskType,
  execTypeOf,
  toExecutionTaskDto,
} from "./execution.schema";

// [RT-H06] 执行层子进程 env 收窄(allowlist;密钥/DB/S3/master key 不进沙箱进程树)。
export { buildChildEnv } from "./child-env";

export {
  ConflictError,
  ExecutionValidationError,
  OwnershipError,
} from "./execution.errors";

// [T-256b/c] 自主任务运行时(受控 agentic executor + 判定规则 + 三领域适配器)。
export {
  classifyLoopType,
  isAgenticTaskType,
  assertLoopType,
  LoopTypeMismatchError,
  AGENTIC_TASK_TYPE_PREFIX,
  createLoopController,
  estimateTokens,
  createDeterministicAgenticEngine,
  createPiAgenticEngine,
  PiNotInstalledError,
  AGENTIC_TASK_TOOL_SCOPES,
  resolveAgenticToolScope,
  filterToolsToScope,
  createAgenticExecutor,
  createResearchTools,
  createCollectionTools,
  createMaterialTools,
  RESEARCH_WEB_READ_WINDOW_CHARS,
  type LoopType,
  type LoopBudget,
  type LoopController,
  type LoopCheckpoint,
  type StopReason,
  type AgenticEngine,
  type AgenticEngineRunInput,
  type AgenticEngineFinal,
  type AgenticTool,
  type AgenticToolResult,
  type AgenticToolExecOpts,
  type ToolEffect,
  type EngineLlm,
  type EngineLlmResult,
  type AgenticExecutorDeps,
  type PiAgenticEngineDeps,
  type PiStreamFnBuilder,
  type ResearchPorts,
  type CollectionPorts,
  type MaterialPorts,
} from "./agentic";
export { createExecutionAuthorityService } from "./execution-authority.service";
export { createExecutionLeaseService } from "./execution-lease.service";
