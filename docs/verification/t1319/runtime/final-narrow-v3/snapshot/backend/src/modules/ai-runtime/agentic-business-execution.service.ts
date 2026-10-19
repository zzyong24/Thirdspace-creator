import {workspaceFilter} from "../../workspace-scope";
import {createContinuousExecutionBudget} from "@creatoros/contract/execution-worker";
import { readBrowserTaskGrant, assertFrozenBrowserTaskGrant } from "../execution/browser-task-grant";
import { createHash } from "node:crypto";
import { and, eq, isNull, asc, inArray, aiTasks, executionTasks, OwnershipError, type Db } from "@creatoros/backend";
import { executionTaskSpec, type ExecutionTaskInput, type RequestContext } from "@creatoros/contract";
import { agenticWorkerInputSchema } from "@creatoros/contract/execution-worker";
import { z } from "zod";
import { createExecutionAuthorityService, type PreparedModelExecution } from "../execution/execution-authority.service";

type AgentInput = z.infer<typeof agenticWorkerInputSchema>;
type AgentTaskType = `exec.${AgentInput["taskType"]}`;
export type AgenticBusinessDefinition = Pick<AgentInput, "taskType" | "systemPrompt" | "capability" | "tools">;
export interface AgenticBusinessExecutionDeps {
  definitions: Partial<Record<AgentTaskType, AgenticBusinessDefinition>>;
  budget: PreparedModelExecution["budget"];
  maxOutputTokens: number;
  resolveMethodSystem?(ctx: RequestContext, skillId: AgentInput["taskType"]): Promise<string>;
  validateInputs(ctx: RequestContext, inputs: ExecutionTaskInput[]): Promise<void>;
  now?: () => string;
}
// 与旧执行器一致：正数向下取整，非数值/非正值忽略；最终仍受宿主上限约束。
const optionalLimit = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0
  ? Math.floor(value) || undefined : undefined;

/** 从公共任务冻结自主执行输入；模型凭证继续由既有 runtime 权威解析，不接受 Worker 回传。 */
export function createAgenticBusinessExecutionService(db: Db, deps: AgenticBusinessExecutionDeps) {
  const authority = createExecutionAuthorityService(db, { now: deps.now });
  const definitions = structuredClone(deps.definitions);
  const definitionFor = (type: string) => Object.prototype.hasOwnProperty.call(definitions, type) ? definitions[type as AgentTaskType] : undefined;
  const taskTypes = Object.keys(definitions) as AgentTaskType[];
  const service = {
    supports(type: string) { return Boolean(definitionFor(type)); },
    async prepare(ctx: RequestContext, taskId: string) {
      const [task] = await db.select().from(aiTasks).where(and(eq(aiTasks.id, taskId), eq(aiTasks.userId, ctx.userId), workspaceFilter(aiTasks,ctx)));
      if (!task) throw new OwnershipError("自主任务不存在");
      const definition = definitionFor(task.taskType);
      if (!definition) throw new Error("AGENTIC_TASK_ADAPTER_UNAVAILABLE");
      const spec = executionTaskSpec.parse((task.inputData as { spec?: unknown }).spec);
      if (`exec.${spec.taskType}` !== task.taskType || spec.taskType !== definition.taskType) throw new Error("AGENTIC_TASK_TYPE_MISMATCH");
      if (spec.constraints.network !== "deny") throw new Error("AGENTIC_NETWORK_POLICY_UNSUPPORTED");
      const steps = optionalLimit(spec.params.maxSteps);
      const tokens = optionalLimit(spec.params.maxTokens);
      const dryRun = spec.params.dryRun === true;
      // 用户 checkpoint 只参与原请求身份，不可作为已用预算或恢复事实。
      const operationKey = `agentic:${createHash("sha256").update(JSON.stringify(spec)).digest("hex")}`;
      if (task.executionTaskId) {
        const [execution] = await db.select().from(executionTasks).where(and(eq(executionTasks.id, task.executionTaskId), eq(executionTasks.ownerId, task.id), eq(executionTasks.userId, task.userId), workspaceFilter(executionTasks,task)));
        const frozen = agenticWorkerInputSchema.parse((execution?.payload as { modelInput?: unknown } | undefined)?.modelInput);
        if (frozen.taskType !== spec.taskType || frozen.operationKey !== operationKey || frozen.goal !== spec.goal) throw new Error("AGENTIC_EXECUTION_MISMATCH");
        assertFrozenBrowserTaskGrant(task, frozen.browserAuthorization);
        // 新配置不能重写历史快照。版本变化由实际工具 admission 诊断。
        return authority.bindAiTask(ctx, task.id);
      }
      const grant = spec.taskType === "agentic.research" ? readBrowserTaskGrant(task) : null;
      if (spec.taskType === "agentic.research" && spec.params.browserAuthorization !== undefined && !grant) return {aiTaskId:task.id,status:"awaiting_authorization" as const,executionTaskId:undefined};
      const browserAuthorization = grant?.authorization;
      const methodSystem = await deps.resolveMethodSystem?.(ctx, spec.taskType);
      const modelInput = agenticWorkerInputSchema.parse({ ...definition, runtimeVersion:"intent-v1",
        ...(methodSystem !== undefined ? {systemPrompt: methodSystem} : {}), ...(browserAuthorization ? {browserAuthorization:{...browserAuthorization,source:"user_task"}} : {}), kind: "agentic.run", operationKey, goal: spec.goal,
        maxOutputTokens: deps.maxOutputTokens, dryRun });
      const budget = createContinuousExecutionBudget({
        ...(steps === undefined ? {} : {maxCalls:steps}),
        ...(tokens === undefined ? {} : {maxTokens:tokens}),
        ...(spec.constraints.timeoutSec === null ? {} : {deadlineMs:spec.constraints.timeoutSec * 1000}),
      });
      await deps.validateInputs(ctx, spec.inputs);
      return authority.bindAiTask(ctx, task.id, { requestFingerprint: task.requestFingerprint, modelInput, budget });
    },
    async recoverQueued(onFailure: (ctx: RequestContext, taskId: string) => Promise<void>, shouldStop = () => false) {
      if (!taskTypes.length) return;
      let offset = 0;
      while (!shouldStop()) {
        const rows = await db.select().from(aiTasks).where(and(inArray(aiTasks.taskType, taskTypes), eq(aiTasks.status, "queued"), isNull(aiTasks.executionTaskId),
          isNull(aiTasks.leaseOwner), isNull(aiTasks.leaseToken), isNull(aiTasks.modelCallStartedAt))).orderBy(asc(aiTasks.requestedAt), asc(aiTasks.id)).limit(50).offset(offset);
        if (!rows.length) return;
        let unresolved = 0;
        for (const task of rows) {
          if (shouldStop()) return;
          const context: RequestContext = { userId: task.userId, accountId: task.accountId,groupId:task.groupId,groupVersion:task.groupVersion??undefined,membershipVersion:task.membershipVersion??undefined, requestId: `recover:${task.id}`, source: "user" };
          try { const prepared=await service.prepare(context, task.id); if (!prepared.executionTaskId) unresolved++; }
          catch {
            await onFailure(context, task.id);
            const [current] = await db.select().from(aiTasks).where(eq(aiTasks.id, task.id));
            if (current?.status === "queued" && !current.executionTaskId) unresolved++;
          }
        }
        offset += unresolved;
      }
    },
  };
  return service;
}
