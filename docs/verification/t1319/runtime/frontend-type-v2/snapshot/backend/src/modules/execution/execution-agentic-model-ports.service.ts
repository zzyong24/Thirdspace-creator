import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { canonicalToPiAssistant, normalizePiContext, AGENTIC_CONTINUATION_PROMPT, windowAgenticContext } from "@creatoros/ai-worker/durable-pi-stream";
import { type Db } from "@creatoros/backend";
import { agenticWorkerInputSchema, workerPortInputSchemas, workerProviderReceiptSchema, workerToolResultReceiptSchema, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";

/** 新模型回合必须使用冻结输入和全部已确认事实；旧请求只重放原调用。 */
export function createExecutionAgenticModelPorts(db:Db,deps:Parameters<typeof createExecutionCallLedgerService>[1]){
 const ledger=createExecutionCallLedgerService(db,deps);const leases=createExecutionLeaseService(db,deps);
 return {
  async reserve(ref:ExecutionRef,raw:unknown){
   const request=workerPortInputSchemas.reserveAgenticModel.parse(raw);
   const input=await leases.withLease(ref,"admission",async({task})=>{
    if(task.kind!=="ai_task")throw new ConflictError("当前任务不是Agent执行");return agenticWorkerInputSchema.parse((task.payload as Record<string,unknown>).modelInput);
   });
   if(request.maxOutputTokens>input.maxOutputTokens)throw new ConflictError("模型请求超过冻结输出上限");
   const encoded=JSON.stringify(request);const inputDigest=`sha256:${createHash("sha256").update(encoded).digest("hex")}`;
   const operationKey=`agentic-model:${createHash("sha256").update(JSON.stringify([input.operationKey,inputDigest])).digest("hex")}`;
   const state=await ledger.inspect(ref);const previous=state.calls.filter(call=>call.operationKey===operationKey).at(-1);
   const retryOfCallId=await leases.withLease(ref,"admission",async({task})=>task.retryOfCallId && (previous?.id===task.retryOfCallId || previous?.retryOfCallId===task.retryOfCallId)?task.retryOfCallId:undefined);
   const call=await ledger.reserve(ref,{operationKey,kind:"model",inputDigest,reservedTokens:Buffer.byteLength(encoded)+1024+request.maxOutputTokens,...(retryOfCallId?{retryOfCallId}:{})},(calls)=>{
    if(calls.some(call=>call.operationKey===operationKey))return;
    const messages:unknown[]=[{role:"user",content:[{type:"text",text:input.goal}],timestamp:0}];
    const pending=new Map<string,string>();
    for(const previous of calls){
     if(previous.status==="rejected" || previous.status==="superseded")continue;
     if(previous.status!=="settled")throw new ConflictError("已有未确认调用，不能规划新回合");
     if(previous.kind==="model"){
      if(pending.size)throw new ConflictError("工具回合尚未闭合");
      const message=canonicalToPiAssistant(workerProviderReceiptSchema.parse(previous.providerResult));
      for(const part of message.content)if(part.type==="toolCall"){
       if(pending.has(part.id))throw new ConflictError("模型工具ID重复");pending.set(part.id,part.name);
      }
      messages.push(message);
      if(input.runtimeVersion==="intent-v1" && message.stopReason==="length" && !pending.size)messages.push({role:"user",content:[{type:"text",text:AGENTIC_CONTINUATION_PROMPT}],timestamp:0});
     }else if(previous.kind==="tool"){
      const receipt=workerToolResultReceiptSchema.parse(JSON.parse(previous.resultText ?? ""));
      if(pending.get(receipt.toolCallId)!==receipt.toolName)throw new ConflictError("工具结果没有模型调用依据");pending.delete(receipt.toolCallId);
      const output=receipt.output as {summary?:unknown};
      messages.push({role:"toolResult",toolCallId:receipt.toolCallId,toolName:receipt.toolName,content:[{type:"text",text:JSON.stringify({summary:output.summary,evidence:output})}],isError:false,timestamp:0});
     }else throw new ConflictError("不支持恢复该调用类型");
    }
    if(pending.size)throw new ConflictError("工具结果尚未全部确认");
    if(messages.length>1 && (messages.at(-1) as {role:string}).role!=="toolResult" && !(input.runtimeVersion==="intent-v1" && (messages.at(-1) as {role:string}).role==="user"))throw new ConflictError("模型已结束，不能追加无依据回合");
    const fullContext={systemPrompt:input.systemPrompt,messages,tools:input.tools.map(tool=>({name:tool.name,description:tool.description,parameters:tool.parameters}))} as Parameters<typeof normalizePiContext>[0];
    const expected=normalizePiContext(input.runtimeVersion==="intent-v1" ? windowAgenticContext(fullContext) : fullContext);
    if(!isDeepStrictEqual(expected,request.request))throw new ConflictError("模型上下文与冻结输入及真实调用回执不符");
   });
   return {callId:call.id,status:call.status,...(call.providerResult?{providerResult:call.providerResult}:{})};
  },
 };
}
