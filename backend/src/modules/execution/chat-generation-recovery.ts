import type {executionEvidence} from "../../schema/intelligence";
import {readChatWebReadEvidence} from "./chat-web-read-evidence";
import type {executionCalls,executionTasks} from "@creatoros/backend";
import {chatWorkerInputSchema,checkpointToolCallSchema,workerProviderReceiptSchema,chatToolProviderName} from "@creatoros/contract/execution-worker";
import {agenticToolOperationKey} from "./agentic-tool-binding";
type Call=typeof executionCalls.$inferSelect;
type Task=typeof executionTasks.$inferSelect;
/** 只识别有已确认前缀的父工具；是否完成及下一请求仍由原节点与账本验证。 */
export function recoverableChatNodeParents(task:Task,calls:Call[],evidence:(typeof executionEvidence.$inferSelect)[]=[]){
 const empty=()=>({completedHooks:[] as string[],resumableHooks:[] as string[],structured:[] as string[],webReads:[] as string[]});
 const input=chatWorkerInputSchema.safeParse((task.payload as {modelInput?:unknown}|null)?.modelInput);
 if(task.kind!=="ai_task" || task.ownerType!=="ai_task" || !input.success || input.data.userId!==task.userId || input.data.accountId!==task.accountId)return empty();
 if(calls.some(call=>call.executionTaskId!==task.id || call.status==="unknown" || (call.status==="settled" && (call.totalTokens===null || (call.kind==="model" && !workerProviderReceiptSchema.safeParse(call.providerResult).success)))))return empty();
 const model=calls.filter(call=>call.kind==="model" && !call.parentCallId).sort((a,b)=>a.sequence-b.sequence).at(-1);
 if(!model || model.status!=="settled")return empty();
 const receipt=workerProviderReceiptSchema.safeParse(model.providerResult);
 if(!receipt.success || receipt.data.finishReason.unified!=="tool-calls")return empty();
 const proposed=receipt.data.content.map(part=>checkpointToolCallSchema.safeParse(part)).filter(value=>value.success).map(value=>value.data);
 const result=empty();
 for(const parent of calls){
  if(parent.kind!=="tool" || parent.parentCallId || parent.status!=="started" || parent.toolExecutionClaimId || parent.resultText || parent.sequence<=model.sequence)continue;
  const matched=proposed.filter(part=>agenticToolOperationKey(model.id,part.toolCallId)===parent.operationKey);
  if(matched.length!==1)continue;
  const definitions=input.data.tools.filter(tool=>chatToolProviderName(tool.name)===matched[0]!.toolName);
  if(definitions.length!==1)continue;
  if(definitions[0]!.name === "web.read" && definitions[0]!.execution === "worker.web-read" && definitions[0]!.effect === "committed") {
    const rows = evidence.filter(row => row.originCallId === parent.id);
    if(rows.length === 1 && !calls.some(call => call.parentCallId === parent.id)) {
      try { readChatWebReadEvidence(rows[0]!, { taskId: task.id, callId: parent.id, inputDigest: parent.inputDigest }); result.webReads.push(parent.id); } catch { /* 损坏事实保持待对账。 */ }
    }
    continue;
  }
  if(definitions[0]!.effect!=="proposal")continue;
  const definition=definitions[0]!,hooks=definition.name==="script.hooks" && definition.execution==="worker.script-hooks";
  if(!hooks && definition.execution!=="worker.structured-node")continue;
  const children=calls.filter(call=>call.parentCallId===parent.id).sort((a,b)=>a.sequence-b.sequence);
  if(!children.length)continue;
  const prefix=`${hooks?"hooks":"structured"}:${parent.id}:`,key=children[0]!.operationKey.split("/model/")[0]!;
  if(!key.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(key.slice(prefix.length)))continue;
  const groups:Call[][]=[];let invalid=false;
  for(const child of children){
   const suffix=child.operationKey.startsWith(`${key}/model/`)?child.operationKey.slice(`${key}/model/`.length):"";
   if(child.kind!=="model" || child.sequence<=parent.sequence || !/^[1-9][0-9]*$/.test(suffix) || ["reserved","started","unknown"].includes(child.status)){invalid=true;break;}
   const index=Number(suffix);
   if(hooks && index!==1){invalid=true;break;}
   if(index===groups.length+1){if(child.retryOfCallId){invalid=true;break;}groups.push([child]);}
   else if(index===groups.length && groups.length){
    const previous=groups[index-1]!.at(-1)!;
    if(previous.status!=="rejected" || previous.rejectionCode==="STRUCTURED_PROTOCOL_UNSUPPORTED" || child.retryOfCallId!==previous.id || child.inputDigest!==previous.inputDigest){invalid=true;break;}
    groups[index-1]!.push(child);
   }else {invalid=true;break;}
  }
  if(invalid)continue;
  const last=groups.at(-1)!.at(-1)!;
  const known=(call:Call)=>call.status==="settled" || (!hooks && call.status==="rejected" && call.rejectionCode==="STRUCTURED_PROTOCOL_UNSUPPORTED");
  if(groups.slice(0,-1).some(group=>!known(group.at(-1)!)))continue;
  const retry=last.status==="rejected" && !last.rejectionCode && last.id===task.retryOfCallId;
  if(!known(last) && !retry)continue;
  if(hooks)(retry?result.resumableHooks:result.completedHooks).push(parent.id);
  else result.structured.push(parent.id);
 }
 // 同轮多个合法父工具一起核对，不能互相误判成未知的在途模型。
 const allowed=new Set([...result.completedHooks,...result.resumableHooks,...result.structured,...result.webReads]);
 return calls.some(call=>call.status==="started" && !allowed.has(call.id))?empty():result;
}
