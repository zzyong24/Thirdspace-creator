import type { Db } from "@creatoros/backend";
import { ZodError } from "zod";
import { agenticToolOutcomeSchema } from "@creatoros/contract/execution-worker";
import { workerPortInputSchemas } from "@creatoros/contract/execution-worker";
import type { ChatWorkerDispatcherDeps } from "../execution/model-worker-dispatcher";
import { createWorkbenchPlanService } from "../execution/workbench-plan.service";
import { createExecutionLeaseService } from "../execution/execution-lease.service";
import { ConflictError } from "../execution/execution.errors";
import { chatWorkbenchPlanCapability } from "./chat-workbench-plan-tool";
import { defineWorkbenchChatTool } from "./chat-tool-gate";
import { prepareChatToolDefinitions } from "./chat-tool-definitions";

/** 在原聊天账本与租约内保存计划；模型只能提交计划内容，不能自报身份或完成事实。 */
export function createChatWorkbenchPlanToolHost(db: Db, deps: Parameters<typeof createWorkbenchPlanService>[1] = {}): NonNullable<ChatWorkerDispatcherDeps["resolveTools"]> {
  const plans = createWorkbenchPlanService(db, deps);
  const leases = createExecutionLeaseService(db, deps);
  return async (_context, input, _ref, signal) => {
    signal.throwIfAborted();
    const frozen = input.tools.find(item => item.name === chatWorkbenchPlanCapability.name);
    if (!frozen) return {};
    const prototype = defineWorkbenchChatTool(chatWorkbenchPlanCapability, async () => {
      throw new Error("PLAN_EXECUTION_REQUIRES_ORIGINAL_TASK_LEASE");
    });
    const prepared = await prepareChatToolDefinitions({[chatWorkbenchPlanCapability.name]: prototype}, {workbenchCapabilities: [chatWorkbenchPlanCapability]});
    const definition = prepared.definitions[0]!;
    if (definition.version !== frozen.version || definition.effect !== frozen.effect || definition.execution !== frozen.execution) throw new Error("计划工具冻结定义已改变");
    return {[definition.name]: {
      version: definition.version, effect: definition.effect,
      parameters: prepared.parameters[definition.name]!.parameters,
      async approve() {return {status: "not-applicable" as const};},
      async execute(_ctx, raw, scope) {
        scope.signal.throwIfAborted();
        let saved;
        try {
          const request = workerPortInputSchemas.saveWorkbenchPlan.parse(raw);
          saved = await plans.save(scope.execution, request);
        } catch (error) {
          // save 的 Zod/Conflict 守卫发生在写入前或事务回滚时；其他异常不能证明未提交。
          // 保存成功后的取消与回执构造故障不在此边界内，仍由原账本按未知结果对账。
          if (!(error instanceof ZodError || error instanceof ConflictError)) throw error;
          scope.signal.throwIfAborted();
          await leases.withLease(scope.execution, "admission", async () => {});
          scope.signal.throwIfAborted();
          const reason = error instanceof ZodError
            ? error.issues.slice(0, 20).map(issue => `${issue.path.map(String).join(".") || "计划"}：${issue.message}`).join("；")
            : error.message;
          return agenticToolOutcomeSchema.parse({status: "error", summary: "计划未保存，请修正参数后继续", evidence: [],
            error: {code: "invalid_input", retryable: false, recovery: `${reason.slice(0, 8000)}。重新读取当前计划版本，使用真实回执修正后发起新的 plan.update 调用。`},
            continuation: null, sideEffect: "none"});
        }
        scope.signal.throwIfAborted();
        return agenticToolOutcomeSchema.parse({
          status: "ok", summary: `计划已保存，版本 ${saved.planRevision}`,
          evidence: [], data: {kind: "workbench.result", result: {status: "succeeded", operationId: scope.callId, content: [{type: "text", text: JSON.stringify(saved)}], artifactRefs: [], progressCursor: null}},
          error: null, continuation: null, sideEffect: "committed",
        });
      },
    }};
  };
}
