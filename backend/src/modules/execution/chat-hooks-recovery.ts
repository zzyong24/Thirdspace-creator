import type {executionCalls,executionTasks} from "@creatoros/backend";
import {chatWorkerInputSchema,checkpointToolCallSchema,workerProviderReceiptSchema,chatToolProviderName} from "@creatoros/contract/execution-worker";
import {agenticToolOperationKey} from "./agentic-tool-binding";
type Call=typeof executionCalls.$inferSelect;
type Task=typeof executionTasks.$inferSelect;

/** 只识别可进入确定性候选恢复的事实；真实绑定、权限和原提示词仍由专用完成端口核对。 */
export function completedChatHooksParents(task:Task,calls:Call[]):string[]{
  if(task.kind!=="ai_task" || task.ownerType!=="ai_task")return [];
  const input=chatWorkerInputSchema.safeParse((task.payload as {modelInput?:unknown}|null)?.modelInput);
  if(!input.success || input.data.userId!==task.userId || input.data.accountId!==task.accountId || !input.data.tools.some(tool=>tool.name==="script.hooks" && tool.execution==="worker.script-hooks" && tool.effect==="proposal"))return [];
  if(calls.some(call=>call.executionTaskId!==task.id || call.status==="unknown" || (call.status==="settled" && (call.totalTokens===null || (call.kind==="model" && !workerProviderReceiptSchema.safeParse(call.providerResult).success)))))return [];
  const model=calls.filter(call=>call.kind==="model" && !call.parentCallId).sort((a,b)=>a.sequence-b.sequence).at(-1);
  if(!model || model.status!=="settled")return [];
  const receipt=workerProviderReceiptSchema.safeParse(model.providerResult);
  if(!receipt.success || receipt.data.finishReason.unified!=="tool-calls")return [];
  const proposed=receipt.data.content.map(part=>checkpointToolCallSchema.safeParse(part)).filter(result=>result.success).map(result=>result.data);
  const candidates=calls.filter(parent=>{
    if(parent.kind!=="tool" || parent.parentCallId || parent.status!=="started" || parent.toolExecutionClaimId || parent.resultText || parent.sequence<=model.sequence)return false;
    const matched=proposed.filter(part=>agenticToolOperationKey(model.id,part.toolCallId)===parent.operationKey);
    if(matched.length!==1 || matched[0]!.toolName!==chatToolProviderName("script.hooks"))return false;
    const children=calls.filter(call=>call.parentCallId===parent.id).sort((a,b)=>a.sequence-b.sequence);
    if(!children.length)return false;
    const prefix=`hooks:${parent.id}:`,key=children[0]!.operationKey;
    if(!key.startsWith(prefix) || !/^[a-f0-9]{64}\/model\/1$/.test(key.slice(prefix.length)))return false;
    return children.every((child,index)=>child.kind==="model" && child.sequence>parent.sequence && child.operationKey===key && child.retryOfCallId===(index?children[index-1]!.id:null) && (index===children.length-1 ? child.status==="settled" && child.totalTokens!==null && workerProviderReceiptSchema.safeParse(child.providerResult).success : child.status==="rejected"));
  }).map(call=>call.id);
  // 其他工具或模型仍在途时，不能借已完成的子模型重新排队整个任务。
  return calls.some(call=>call.status==="started" && !candidates.includes(call.id))?[]:candidates;
}
