import { createHash } from "node:crypto";
import type { Db } from "@creatoros/backend";
import { workerTaskInputSchema, workerPortInputSchemas, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { ConflictError } from "./execution.errors";

/** 后端模型调用端口。模型输入由后端预先固化到任务载荷，Worker 不能自报输入或预算。 */
export function createExecutionWorkerCallPorts(db: Db, deps: Parameters<typeof createExecutionCallLedgerService>[1]) {
  const leases = createExecutionLeaseService(db, deps);
  const ledger = createExecutionCallLedgerService(db, deps);
  const readTaskContext = async (ref: ExecutionRef) => {
    const input=await leases.withLease(ref, "admission", async ({task}) => {
    if (task.kind !== "ai_task") throw new ConflictError("当前任务不是模型任务");
    // modelInput 在入队后保持不变；宿主运行元数据与检查点不改变原模型输入。
    const payload = task.payload as Record<string, unknown>;
    return workerTaskInputSchema.parse(payload.modelInput);
    });
    if(input.kind==="agentic.run" || input.kind==="chat.run")await ledger.initializeBudget(ref);
    return input;
  };
  return {
    readTaskContext,
    async reserveCall(ref: ExecutionRef, raw: unknown) {
      const request = workerPortInputSchemas.reserveCall.parse(raw);
      const input = await readTaskContext(ref);
      if (input.kind !== "model.generate" || request.operationKey !== input.operationKey || request.maxOutputTokens !== input.maxOutputTokens) {
        throw new ConflictError("调用请求与后端固化输入不符");
      }
      // 仅作为短文本请求的保守预算预留：UTF-8 字节数加协议余量；结算始终记录供应商真实用量。
      const reservedTokens = Buffer.byteLength(input.prompt) + Buffer.byteLength(input.system ?? "") + 1024 + input.maxOutputTokens;
      const inputDigest = `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
      const retryOfCallId = await leases.withLease(ref, "admission", async ({task}) => task.retryOfCallId);
      const call = await ledger.reserve(ref, {operationKey: input.operationKey, kind: "model", inputDigest, reservedTokens, ...(retryOfCallId ? {retryOfCallId} : {})});
      return {callId: call.id, status: call.status, ...(call.resultText ? {resultText: call.resultText} : {})};
    },
    async startCall(ref: ExecutionRef, raw: unknown) {
      const {callId} = workerPortInputSchemas.startCall.parse(raw);
      await leases.withLease(ref,"admission",async({task})=>{if((task.payload as {modelInput?:{kind?:string}}).modelInput?.kind==="asset.generate")throw new ConflictError("素材必须使用专用启动端口");});
      const call = await ledger.start(ref, callId, call => {if(call.kind!=="model" || call.parentCallId)throw new ConflictError("通用模型端口只能启动根模型调用");});
      return {callId: call.id, status: call.status};
    },
    async settleCall(ref: ExecutionRef, raw: unknown) {
      const {callId, ...settlement} = workerPortInputSchemas.settleCall.parse(raw);
      await leases.withLease(ref,"settlement",async({task})=>{if((task.payload as {modelInput?:{kind?:string}}).modelInput?.kind==="asset.generate")throw new ConflictError("素材必须使用专用结算端口");});
      const call = await ledger.settle(ref, callId, settlement.status === "settled" ? {status:"settled", usage:settlement.usage, resultText:settlement.text} : settlement, call => {if(call.kind!=="model" || call.parentCallId)throw new ConflictError("通用模型端口只能结算根模型调用");});
      return {callId: call.id, status: call.status};
    },
  };
}
