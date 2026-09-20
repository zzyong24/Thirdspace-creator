import type { Db } from "@creatoros/backend";
import { agenticToolOutcomeSchema } from "@creatoros/contract/execution-worker";
import { workerPortInputSchemas } from "@creatoros/contract/execution-worker";
import type { ChatWorkerDispatcherDeps } from "../execution/model-worker-dispatcher";
import { createWorkbenchPlanService } from "../execution/workbench-plan.service";
import { chatWorkbenchPlanCapability } from "./chat-workbench-plan-tool";
import { defineWorkbenchChatTool } from "./chat-tool-gate";
import { prepareChatToolDefinitions } from "./chat-tool-definitions";

/** 在原聊天账本与租约内保存计划；模型只能提交计划内容，不能自报身份或完成事实。 */
export function createChatWorkbenchPlanToolHost(db: Db): NonNullable<ChatWorkerDispatcherDeps["resolveTools"]> {
  const plans = createWorkbenchPlanService(db);
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
        const request = workerPortInputSchemas.saveWorkbenchPlan.parse(raw);
        const saved = await plans.save(scope.execution, request);
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
