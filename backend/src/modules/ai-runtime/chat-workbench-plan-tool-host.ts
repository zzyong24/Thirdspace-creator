import { and, desc, eq, executionCalls, type Db } from "@creatoros/backend";
import { ZodError } from "zod";
import { agenticToolOutcomeSchema, workerToolResultReceiptSchema } from "@creatoros/contract/execution-worker";
import { workbenchArtifactSchema, workbenchPlanSchema } from "@creatoros/contract/agent-workbench";
import { workerPortInputSchemas } from "@creatoros/contract/execution-worker";
import type { ChatWorkerDispatcherDeps } from "../execution/model-worker-dispatcher";
import { createWorkbenchPlanService, WorkbenchPlanValidationError } from "../execution/workbench-plan.service";
import { createExecutionLeaseService } from "../execution/execution-lease.service";
import { ConflictError } from "../execution/execution.errors";
import { chatWorkbenchPlanCapability } from "./chat-workbench-plan-tool";
import { defineWorkbenchChatTool } from "./chat-tool-gate";
import { prepareChatToolDefinitions } from "./chat-tool-definitions";

/** 在原聊天账本与租约内保存计划；模型只能提交计划内容，不能自报身份或完成事实。 */
export function createChatWorkbenchPlanToolHost(db: Db, deps: Parameters<typeof createWorkbenchPlanService>[1] = {}): NonNullable<ChatWorkerDispatcherDeps["resolveTools"]> {
  const plans = createWorkbenchPlanService(db, deps);
  const leases = createExecutionLeaseService(db, deps);
  const referenceRules = {
    operationRefs: "只填本任务工具回执的原调用 ID（call_ 开头），逐字复制；不要填工具名、工具名(call_id) 或模型生成的 toolCallId。成功步骤只能引用已结算且确认成功的回执。",
    artifactRefs: "只填已正式登记的 artifactId@version（version 为正整数），逐字复制；文件名、文件路径、尚未登记的文件均不是产物引用。列出的登记元数据仍须在保存时核验字节。",
    unexecutedSteps: "尚未执行、没有真实回执的步骤使用 pending，operationRefs 和 artifactRefs 都填 []，不要用空字符串占位；不能标为 succeeded。已有步骤及回执必须保留，已成功步骤不可改写。",
  };
  const statusRules = {
    allowedStatuses: workbenchPlanSchema.shape.steps.element.shape.status.options,
    failedSteps: "已明确失败的步骤使用 failed 并保留原 stepId、operationRefs 和 artifactRefs；记录失败不等于 succeeded。未确认结果须先按原调用对账，不能改成成功或换键重发。",
    replan: "由模型依据用户目标显式重规划：未成功步骤可以修改 dependsOn，或新增步骤用 supersedes 指向已有旧步骤；旧步骤及其回执仍须保留。已成功步骤不可改写。supersedes 不会自动解除依赖或将旧失败变成功；依赖仍须存在、无环，新成功步骤的所有 dependsOn 必须 succeeded。不能用无关成功回执替代失败证据。",
  };
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
          const feedback = await leases.withLease(scope.execution, "admission", async ({tx, task}) => {
            // 与租约一起读取当前真值；禁止在此事务内经 plans.read/root db 或 Blob 回读。
            const payload = task.payload as Record<string, unknown>;
            const currentPlan = payload.workbenchPlan === undefined ? null : workbenchPlanSchema.parse(payload.workbenchPlan);
            const rows = await tx.select({id: executionCalls.id, resultText: executionCalls.resultText}).from(executionCalls)
              .where(and(eq(executionCalls.executionTaskId, task.id), eq(executionCalls.kind, "tool"), eq(executionCalls.status, "settled")))
              .orderBy(desc(executionCalls.sequence)).limit(50);
            const recentSuccessfulOperations: Array<{operationRef: string; toolName: string}> = [];
            for (const row of rows) {
              if (!row.resultText) continue;
              try {
                const receipt = workerToolResultReceiptSchema.parse(JSON.parse(row.resultText));
                const outcome = agenticToolOutcomeSchema.parse(receipt.output);
                if (outcome.status === "ok" && outcome.error === null && outcome.sideEffect !== "unknown")
                  recentSuccessfulOperations.push({operationRef: row.id, toolName: receipt.toolName});
              } catch { /* 无法解析的历史回执不作为成功证据推荐。 */ }
              if (recentSuccessfulOperations.length === 20) break;
            }
            const registeredArtifacts: Array<{artifactRef: string; relativePath: string}> = [];
            const versions = payload.workbenchArtifactVersions;
            if (Array.isArray(versions)) for (const row of versions.slice(-1000).reverse()) {
              const parsed = workbenchArtifactSchema.safeParse(row?.metadata);
              if (parsed.success && parsed.data.taskId === task.id)
                registeredArtifacts.push({artifactRef: `${parsed.data.artifactId}@${parsed.data.version}`, relativePath: parsed.data.relativePath});
              if (registeredArtifacts.length === 20) break;
            }
            // 错误反馈本身不能因巨型历史计划超过回执上限而变为 unknown；绝不伪装完整计划。
            const currentPlanComplete = currentPlan === null || JSON.stringify(currentPlan).length <= 800_000;
            return {kind: "workbench.plan.validation", currentRevision: currentPlan?.planRevision ?? 0, referenceRules, statusRules,
              // 单条为保存校验当时的首个失败点；不扫描或猜测其他步骤的语义。
              validationIssue: error instanceof WorkbenchPlanValidationError ? error.issue : null,
              currentPlan: currentPlanComplete ? currentPlan : {planRevision: currentPlan!.planRevision, stepCount: currentPlan!.steps.length, truncated: true},
              currentPlanComplete, recentSuccessfulOperations, registeredArtifacts,
              referenceScope: "仅当前任务；列出最近 50 条已结算工具中的最多 20 条成功回执，以及最近最多 20 个登记产物。不代表全部历史；是否支撑某个步骤由模型依据实际结果判断，后端仍校验真实引用。"};
          });
          scope.signal.throwIfAborted();
          const reason = error instanceof ZodError
            ? error.issues.slice(0, 20).map(issue => `${issue.path.map(String).join(".") || "计划"}：${issue.message}`).join("；")
            : error instanceof WorkbenchPlanValidationError ? `${error.message}；校验定位=${JSON.stringify(error.issue)}` : error.message;
          const planInstruction = feedback.currentPlanComplete
            ? "使用本回执的 currentPlan 修订"
            : "当前计划过大，本回执仅含摘要；取得完整计划前不得据摘要覆盖或删除旧步骤";
          return agenticToolOutcomeSchema.parse({status: "error", summary: `计划未保存；当前版本 ${feedback.currentRevision}，下一次 expectedRevision=${feedback.currentRevision}，失败不会增加版本。`, evidence: [], data: feedback,
            error: {code: "invalid_input", retryable: false, recovery: `${reason.slice(0, 6000)}。${planInstruction}，下一次 expectedRevision=${feedback.currentRevision}，不要猜测或递增。可用步骤状态：${statusRules.allowedStatuses.join(", ")}。${referenceRules.operationRefs}${referenceRules.artifactRefs}${referenceRules.unexecutedSteps}${statusRules.failedSteps}${statusRules.replan}`},
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
