import {z} from "zod";
import type {executionCalls,executionTasks} from "@creatoros/backend";
import {chatWorkerInputSchema,workerProviderReceiptSchema} from "@creatoros/contract/execution-worker";
import {createAgenticToolBinding} from "./agentic-tool-binding";
/** 仅纯事务提交可证明：没有成功回执就没有子任务提交。普通宿主未知操作不能重放。 */
export function uncommittedChatTaskCalls(task:typeof executionTasks.$inferSelect,calls:(typeof executionCalls.$inferSelect)[]):string[]{
 if(task.kind!=="ai_task" || task.ownerType!=="ai_task")return [];
 const input=chatWorkerInputSchema.safeParse((task.payload as {modelInput?:unknown}|null)?.modelInput);
 if(!input.success || input.data.userId!==task.userId || input.data.accountId!==task.accountId)return [];
 if(calls.some(call=>call.executionTaskId!==task.id || call.status==="unknown" || (call.status==="settled" && (call.totalTokens===null || (call.kind==="model" && !workerProviderReceiptSchema.safeParse(call.providerResult).success)))))return [];
 const model=calls.filter(call=>call.kind==="model" && !call.parentCallId).sort((a,b)=>a.sequence-b.sequence).at(-1);
 if(!model || model.status!=="settled")return [];
 const definition=input.data.tools.find(tool=>tool.execution==="host.task-submit" && tool.name==="planning.thesis" && tool.effect==="committed");
 if(!definition)return [];
 try{
  const parameters=z.fromJSONSchema(definition.parameters as Parameters<typeof z.fromJSONSchema>[0]);
  const binding=createAgenticToolBinding({[definition.name]:{version:definition.version,effect:definition.effect,execution:"host.task-submit",parameters}});
  return calls.filter(call=>{
   if(call.kind!=="tool" || call.parentCallId || call.status!=="started" || call.toolExecutionClaimId || call.resultText || call.resultRef || call.providerResult || call.usage || call.totalTokens!==null || call.reservedTokens!==0 || calls.some(child=>child.parentCallId===call.id))return false;
   try{const bound=binding.forCall(task,calls,call);return bound.execution==="host.task-submit" && bound.modelCallId===model.id;}catch{return false;}
  }).map(call=>call.id);
 }catch{return [];}
}
