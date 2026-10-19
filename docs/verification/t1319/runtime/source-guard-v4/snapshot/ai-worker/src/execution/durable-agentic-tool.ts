import { z } from "zod";
import {
  reserveAgenticToolSchema, agenticToolReservationSchema, agenticToolOutcomeSchema,
  workerStartReceiptSchema, type AgenticToolOutcome, type WorkerPort,
} from "@creatoros/contract/execution-worker";
import { GenerationFailure } from "./generation-error";

/** 专用宿主已保存明确失败及任务恢复状态；不能再将父工具改成未知。 */
export class DurableToolSuspension extends GenerationFailure {}
export interface DurableAgenticToolDeps {
  resumeStarted?(callId:string):Promise<void>;
  signal: AbortSignal;
  call(port: WorkerPort, data: unknown, signal?: AbortSignal): Promise<unknown>;
  execute(toolName: string, input: unknown, signal: AbortSignal): Promise<AgenticToolOutcome>;
}
const settlementSchema = z.object({callId:z.string().min(1),status:z.enum(["settled","unknown"])});
const unknownResult = () => new GenerationFailure("unknown_result","TOOL_REQUIRES_RECONCILIATION");
function assertKnown(output:AgenticToolOutcome) {
  if(output.sideEffect === "unknown" || output.error?.code === "unknown_commit") throw unknownResult();
}

/** Worker 只负责执行；许可参数和重放事实均来自后端账本。 */
export async function runDurableAgenticTool(
  input: {modelCallId:string;toolCallId:string}, deps:DurableAgenticToolDeps,
):Promise<AgenticToolOutcome> {
  deps.signal.throwIfAborted();
  let reservation:z.infer<typeof agenticToolReservationSchema>;
  try {
    reservation=agenticToolReservationSchema.parse(await deps.call("reserveAgenticTool",reserveAgenticToolSchema.parse(input),deps.signal));
  } catch {throw unknownResult();}
  deps.signal.throwIfAborted();
  if(reservation.status === "settled") {
    const receipt=reservation.receipt;
    if(!receipt || receipt.toolCallId!==input.toolCallId || receipt.toolName!==reservation.toolName)throw unknownResult();
    assertKnown(receipt.output);
    return receipt.output;
  }
  if(reservation.status!=="reserved" && !(reservation.status==="started" && deps.resumeStarted))throw unknownResult();
  let executionBegan=false;
  let settlementAcknowledged=false;
  try {
    deps.signal.throwIfAborted();
    if(reservation.status==="started")await deps.resumeStarted!(reservation.callId);
    else {
      const started=workerStartReceiptSchema.parse(await deps.call("startAgenticTool",{callId:reservation.callId},deps.signal));
      if(started.callId!==reservation.callId)throw unknownResult();
    }
    deps.signal.throwIfAborted();
    executionBegan=true;
    const output=reservation.validationOutcome ?? agenticToolOutcomeSchema.parse(await deps.execute(reservation.toolName,reservation.input,deps.signal));
    // 取消后仍可结算：已执行工具必须保留真实回执。
    const settled=settlementSchema.parse(await deps.call("settleAgenticTool",{callId:reservation.callId,status:"settled",output}));
    if(settled.callId!==reservation.callId)throw unknownResult();
    settlementAcknowledged=true;
    if(settled.status!=="settled")throw unknownResult();
    assertKnown(output);
    deps.signal.throwIfAborted();
    return output;
  } catch (error) {
    if(error instanceof DurableToolSuspension)throw error;
    if(executionBegan && !settlementAcknowledged) {
      await deps.call("settleAgenticTool",{callId:reservation.callId,status:"unknown"}).catch(()=>{});
    }
    // 回执丢失只查询原调用一次；绝不重新执行工具或换幂等键。
    if(executionBegan && !settlementAcknowledged && !deps.signal.aborted){
      try{
        const confirmed=agenticToolReservationSchema.parse(await deps.call("reserveAgenticTool",reserveAgenticToolSchema.parse(input),deps.signal));
        const receipt=confirmed.receipt;
        if(confirmed.status==="settled" && confirmed.callId===reservation.callId && confirmed.toolName===reservation.toolName && receipt?.toolCallId===input.toolCallId && receipt.toolName===confirmed.toolName){
          assertKnown(receipt.output);deps.signal.throwIfAborted();return receipt.output;
        }
      }catch{/* 没有原调用的已确认事实时仍保留未知结果。 */}
    }
    // 不透传可能包含凭据或不可信网页内容的原始错误。
    throw unknownResult();
  }
}
