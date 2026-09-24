import {isDeepStrictEqual} from "node:util";
import type {executionCalls, executionTasks} from "@creatoros/backend";
import {chatWorkerInputSchema,workerProviderReceiptSchema,workerPortInputSchemas} from "@creatoros/contract/execution-worker";
import {workbenchPlanSchema} from "@creatoros/contract/agent-workbench";
import {createAgenticToolBinding} from "./agentic-tool-binding";
import {chatWorkbenchPlanCapability} from "../ai-runtime/chat-workbench-plan-tool";
import {defineWorkbenchChatTool} from "../ai-runtime/chat-tool-gate";
import {prepareChatToolDefinitions} from "../ai-runtime/chat-tool-definitions";
type Task = typeof executionTasks.$inferSelect;
type Call = typeof executionCalls.$inferSelect;

/**
 * 在 recoverExpiredLeases 已锁定任务的事务中调用；纯判定，不读写数据库或 Blob。
 * 返回的原调用只允许重置 status=reserved、startedAttempt=null、toolExecutionClaimId=null（及 updatedAt）。
 * 由调用方同步 calls；保留原 ID/键/摘要/sequence/预算。新租约沿正式 host 重放并完成原回执。
 */
export async function recoverableWorkbenchPlanCalls(task: Task, calls: Call[], now = new Date().toISOString()): Promise<string[]> {
  if (task.kind !== "ai_task" || task.ownerType !== "ai_task" || !["running", "unknown_result"].includes(task.status)) return [];
  if (!Number.isFinite(Date.parse(now)) || (task.leaseExpiresAt !== null && !(Date.parse(task.leaseExpiresAt) <= Date.parse(now)))) return [];
  if (calls.some(call => call.executionTaskId !== task.id)) return [];
  const payload = task.payload as Record<string, unknown> | null;
  const input = chatWorkerInputSchema.safeParse(payload?.modelInput);
  if (!input.success || input.data.executionEngine !== "pi" || input.data.userId !== task.userId ||
      input.data.accountId !== task.accountId || payload?.aiTaskId !== task.ownerId) return [];
  const current = payload.workbenchPlan === undefined ? null : workbenchPlanSchema.safeParse(payload.workbenchPlan);
  if (current && !current.success) return [];
  const plan = current?.success ? current.data : null;
  const model = calls.filter(call => call.kind === "model" && !call.parentCallId).sort((a, b) => a.sequence - b.sequence).at(-1);
  if (!model || model.status !== "settled" || model.totalTokens === null || !workerProviderReceiptSchema.safeParse(model.providerResult).success) return [];

  const prototype = defineWorkbenchChatTool(chatWorkbenchPlanCapability, async () => {throw new Error("恢复判定不得执行工具");});
  const prepared = await prepareChatToolDefinitions({[chatWorkbenchPlanCapability.name]: prototype}, {workbenchCapabilities: [chatWorkbenchPlanCapability]});
  const definition = prepared.definitions[0]!;
  const frozen = input.data.tools.filter(tool => tool.name === definition.name);
  if (frozen.length !== 1 || !isDeepStrictEqual(frozen[0], definition)) return [];
  const binding = createAgenticToolBinding({[definition.name]: {...definition, parameters: prepared.parameters[definition.name]!.parameters}});
  return calls.filter(call => {
    if (call.kind !== "tool" || call.parentCallId || !["started", "unknown"].includes(call.status) ||
        call.sequence <= model.sequence || call.startedAttempt === null || call.startedAttempt < 1 || call.startedAttempt > task.attempt ||
        call.resultText !== null || call.resultRef !== null || call.providerResult !== null || call.providerJob !== null ||
        call.usage !== null || call.totalTokens !== null || call.reservedTokens !== 0 || call.accountingBasis !== "tokens" ||
        call.retryOfCallId !== null || call.rejectionCode !== null || calls.some(child => child.parentCallId === call.id) ||
        calls.filter(other => other.operationKey === call.operationKey).length !== 1) return false;
    try {
      // SEMANTIC_BOUNDARY_ALLOW: 仅验证冻结协议身份、模型来源、操作键和参数摘要，不按内容猜测意图。
      const bound = binding.forCall(task, calls, call);
      if (bound.modelCallId !== model.id || bound.executionToolName !== definition.name || bound.execution !== "host" || bound.effect !== "committed") return false;
      if (bound.validationOutcome) return true; // schema 拒绝从未进入 save。
      const request = workerPortInputSchemas.saveWorkbenchPlan.safeParse(bound.input);
      if (!request.success) return true;
      const proposed = workbenchPlanSchema.safeParse({planRevision: request.data.expectedRevision + 1, steps: request.data.steps});
      if (!proposed.success) return true; // 依赖图等校验在写入前失败。
      // 保存前可沿原 CAS 再试；保存后必须与原提案完全一致，save 才能幂等返回 committed。
      // 版本已推进且内容不同，无法证明原调用是否写过；继续保持 unknown，禁止伪报 none。
      return (plan?.planRevision ?? 0) <= request.data.expectedRevision || isDeepStrictEqual(plan, proposed.data);
    } catch {return false;} // 损坏/不匹配的账本证据不具备自动恢复资格。
  }).map(call => call.id);
}
