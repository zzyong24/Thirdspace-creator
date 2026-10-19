import {isDeepStrictEqual} from "node:util";
import type {executionCalls, executionTasks} from "@creatoros/backend";
import {workbenchPlanSchema, workbenchResultSchema, type WorkbenchPlan} from "@creatoros/contract/agent-workbench";
import {agenticToolOutcomeSchema, chatWorkerInputSchema, checkpointToolCallSchema, workerPortInputSchemas,
  externalChatReceiptSchema,workerProviderReceiptSchema, workerToolResultReceiptSchema} from "@creatoros/contract/execution-worker";
import {agenticModelToolParts,agenticToolOperationKey, createAgenticToolBinding} from "./agentic-tool-binding";
import {chatFallbackParent, isChatModelOperation} from "./execution-chat-fallback.service";
import {ConflictError} from "./execution.errors";
import {chatWorkbenchPlanCapability} from "../ai-runtime/chat-workbench-plan-tool";
import {defineWorkbenchChatTool} from "../ai-runtime/chat-tool-gate";
import {prepareChatToolDefinitions} from "../ai-runtime/chat-tool-definitions";

type Call = typeof executionCalls.$inferSelect;
type Task = typeof executionTasks.$inferSelect;
const unproven = (): never => {throw new ConflictError("WORKBENCH_PLAN_HISTORY_UNPROVEN");};
const noLaterThan = (left: string, right: string) => Number.isFinite(Date.parse(left)) && Number.isFinite(Date.parse(right)) && Date.parse(left) <= Date.parse(right);

/** SEMANTIC_BOUNDARY_ALLOW: 只按正式调用身份、版本、顺序与结算事实还原历史计划，不重做计划决策。
 * Pi 原链先结算工具再预留下一模型；sequence 单独不证明提交时间，故同时核验 updatedAt。
 * 当前计划仅用于证明版本链完整，绝不作为历史读取的回退值。
 */
export async function workbenchPlanAtModel(task: Task, calls: Call[], modelCallId: string, current: WorkbenchPlan | null): Promise<WorkbenchPlan | null> {
  try {
    const input = chatWorkerInputSchema.parse((task.payload as Record<string, unknown>).modelInput);
    if (task.kind !== "ai_task" || !["pi","codex"].includes(input.executionEngine??'pi') || input.userId !== task.userId || input.accountId !== task.accountId ||
        calls.some(call => call.executionTaskId !== task.id)) return unproven();
    const ordered = [...calls].sort((a, b) => a.sequence - b.sequence);
    const rootModel = (call: Call): boolean => {
      if(input.executionEngine==='codex'){
        const receipt=externalChatReceiptSchema.safeParse(call.providerResult);
        const binding=(task.payload as {codexCalls?:Record<string,{threadId?:string;turnId?:string}>}).codexCalls?.[call.id];
        return !!binding&&receipt.success&&binding.threadId===receipt.data.sessionId&&(receipt.data.protocolKind==='acp'||binding.turnId===receipt.data.providerTurnId)&&call.operationKey===`${input.operationKey}/external-turn/1`&&call.kind==='external_agent'&&!call.parentCallId&&call.status==='settled'&&receipt.success&&receipt.data.engine==='codex'&&receipt.data.turnId===call.id&&receipt.data.stopReason==='end_turn';
      }
      if (call.parentCallId || call.kind !== "model") return false;
      if (isChatModelOperation(input.operationKey, call.operationKey)) return true;
      const parentKey = chatFallbackParent(input.operationKey, call.operationKey);
      const parent = parentKey && ordered.filter(row => row.operationKey === parentKey && row.sequence < call.sequence).at(-1);
      return !!parent && !parent.parentCallId && parent.kind === "model" && parent.status === "rejected" &&
        parent.rejectionCode === "CHAT_MODEL_RETRYABLE_REJECTION" && !!(task.payload as Record<string, unknown>).chatFallbackModelIdentity;
    };
    const model = ordered.find(call => call.id === modelCallId);
    if (!model || model.status !== "settled" || !rootModel(model) ||
        (input.executionEngine!=='codex'&&workerProviderReceiptSchema.parse(model.providerResult).finishReason.unified !== "stop")) return unproven();
    const frozen = input.tools.filter(tool => tool.name === "plan.update");
    if (frozen.length > 1 || frozen.some(tool => tool.effect !== "committed" || (tool.execution ?? "host") !== "host")) return unproven();
    if (frozen.length) {
      const prototype = defineWorkbenchChatTool(chatWorkbenchPlanCapability, () => {throw Error("HISTORY_READ_CANNOT_EXECUTE");});
      const prepared = await prepareChatToolDefinitions({"plan.update": prototype}, {workbenchCapabilities: [chatWorkbenchPlanCapability]});
      if (!isDeepStrictEqual(frozen[0], prepared.definitions[0])) return unproven();
    }
    const binding = createAgenticToolBinding(frozen.length ? {"plan.update": {
      version: frozen[0]!.version, effect: "committed", parameters: workerPortInputSchemas.saveWorkbenchPlan,
    }} : {});
    const snapshots: Array<{call: Call; plan: WorkbenchPlan}> = [];
    const confirmed = new Map<string, {call: Call; input: unknown; output: unknown}>();
    const unfinished: Array<{source: Call; call?: Call}> = [];
    for (const source of ordered.filter(call => !call.parentCallId && call.status === "settled" && (call.kind==='model'||call.kind==='external_agent'))) {
      const parts=input.executionEngine==='codex'?agenticModelToolParts(task,source):workerProviderReceiptSchema.parse(source.providerResult).content;
      for (const part of parts) {
        const proposed = checkpointToolCallSchema.safeParse(part);
        if (!proposed.success || proposed.data.toolName !== "plan_update") continue;
        if (!rootModel(source) || frozen.length !== 1) return unproven();
        const candidates = ordered.filter(call => call.operationKey === agenticToolOperationKey(source.id, proposed.data.toolCallId));
        // 未来尚未执行的提案不构成历史提交；若它已改当前投影，末尾完整版本链仍会拒绝缺证据。
        if (source.sequence > model.sequence && (candidates.length === 0 || candidates.length === 1 && candidates[0]!.status !== "settled")) {
          unfinished.push({source, call: candidates[0]}); continue;
        }
        if (candidates.length !== 1) return unproven();
        const call = candidates[0]!;
        if (call.kind !== "tool" || call.parentCallId || call.status !== "settled" || call.sequence <= source.sequence ||
            !call.resultText || !(input.executionEngine==='codex'?noLaterThan(source.createdAt,call.createdAt)&&noLaterThan(call.updatedAt,source.updatedAt):noLaterThan(source.updatedAt, call.createdAt))) return unproven();
        const bound = binding.forCall(task, ordered, call);
        const receipt = workerToolResultReceiptSchema.parse(JSON.parse(call.resultText));
        if (receipt.toolCallId !== bound.toolCallId || receipt.toolName !== bound.toolName) return unproven();
        const output = agenticToolOutcomeSchema.parse(receipt.output);
        if (receipt.reusedCallId) {
          const previous = confirmed.get(receipt.reusedCallId);
          if (!previous || previous.call.sequence >= call.sequence || bound.validationOutcome ||
              !isDeepStrictEqual(previous.input, bound.input) || !isDeepStrictEqual(previous.output, output)) return unproven();
          // 正式同参复用保留原 operationId；它不是新的计划提交，更不能令较新的计划倒退。
          confirmed.set(call.id, {call, input: bound.input, output});
          continue;
        }
        // 失败反馈的 currentPlan 是观测信息，不是成功提交证明。
        if (output.status !== "ok" || output.error !== null || output.sideEffect !== "committed") {
          if (output.sideEffect !== "none") return unproven();
          continue;
        }
        if (bound.validationOutcome) return unproven();
        const data = output.data as Record<string, unknown> | null;
        if (!data || data.kind !== "workbench.result") return unproven();
        const result = workbenchResultSchema.parse(data.result);
        if (result.status !== "succeeded" || result.operationId !== call.id || result.content.length !== 1 || result.content[0]?.type !== "text") return unproven();
        const plan = workbenchPlanSchema.parse(JSON.parse(result.content[0].text));
        const request = workerPortInputSchemas.saveWorkbenchPlan.parse(bound.input);
        if (!isDeepStrictEqual(plan, {planRevision: request.expectedRevision + 1, steps: request.steps})) return unproven();
        snapshots.push({call, plan});
        confirmed.set(call.id, {call, input: bound.input, output});
      }
    }
    snapshots.sort((a, b) => a.call.sequence - b.call.sequence);
    let latest: WorkbenchPlan | null = null, historical: WorkbenchPlan | null = null;
    for (const {call, plan} of snapshots) {
      if (plan.planRevision === latest?.planRevision) {
        if (!isDeepStrictEqual(plan, latest)) return unproven();
      } else if (plan.planRevision !== (latest?.planRevision ?? 0) + 1) return unproven();
      // 迟到结算不能仅凭低序号冒充模型当时已接受的计划。
      const followingModel = ordered.find(row => row.sequence > call.sequence && (row.kind === "model"||row.kind==='external_agent') && !row.parentCallId);
      if (!Number.isFinite(Date.parse(call.updatedAt)) || followingModel && !noLaterThan(call.updatedAt, followingModel.createdAt)) return unproven();
      latest = plan;
      if(input.executionEngine==='codex'?noLaterThan(call.updatedAt,model.updatedAt):call.sequence < model.sequence) historical = plan;
    }
    // 从 revision 1 开始证明完整已结算前缀。唯一例外是正式恢复后尚待原call结算的未来尾部：
    // 它只解释当前投影为何更晚，不加入 historical，不生成提交回执，更不取得工具执行权。
    if (!isDeepStrictEqual(latest, current)) {
      if (input.executionEngine==='codex'||unfinished.length !== 1) return unproven();
      const {source, call} = unfinished[0]!;
      if (!call || ordered.filter(row => row.kind === "model" && !row.parentCallId).at(-1)?.id !== source.id ||
          call.kind !== "tool" || call.parentCallId || call.status !== "reserved" || call.sequence <= source.sequence ||
          call.startedAttempt !== null || call.toolExecutionClaimId !== null || call.resultText !== null || call.resultRef !== null ||
          call.providerResult !== null || call.providerJob !== null || call.usage !== null || call.totalTokens !== null ||
          call.reservedTokens !== 0 || call.accountingBasis !== "tokens" || call.retryOfCallId !== null || call.rejectionCode !== null ||
          ordered.some(row => row.parentCallId === call.id || row.status === "unknown" || row.status === "started") ||
          !noLaterThan(model.updatedAt, source.createdAt) || !noLaterThan(source.updatedAt, call.createdAt)) return unproven();
      const bound = binding.forCall(task, ordered, call);
      if (bound.validationOutcome || bound.modelCallId !== source.id || bound.executionToolName !== "plan.update") return unproven();
      const request = workerPortInputSchemas.saveWorkbenchPlan.parse(bound.input);
      if (request.expectedRevision !== (latest?.planRevision ?? 0) ||
          !isDeepStrictEqual(current, workbenchPlanSchema.parse({planRevision: request.expectedRevision + 1, steps: request.steps}))) return unproven();
    }
    return historical;
  } catch {return unproven();}
}
