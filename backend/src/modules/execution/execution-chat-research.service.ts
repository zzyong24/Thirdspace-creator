import {asc,eq,executionCalls,type Db} from "@creatoros/backend";
import {workerPortInputSchemas,workerToolResultReceiptSchema,agenticToolOutcomeSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {createChatHostContextReader} from "../ai/chat-host-context.service";
import {prepareChatResearchQuery,projectChatSearchResults} from "../ai-runtime/chat-research-preparation";
import {createExecutionLeaseService} from "./execution-lease.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createAgenticToolBinding} from "./agentic-tool-binding";
import type {ChatBackendTool} from "./execution-chat-tool-ports.service";
import {readExecutionChatTask} from "./execution-chat-tool-ports.service";
import {ConflictError} from "./execution.errors";
/** 原父工具决定查询；宿主仅接原始浏览器观察，并生成原结果卡，不接受 Worker 自报候选。 */
export function createExecutionChatResearchService(db:Db,deps:{now?:()=>string;budget:{maxCalls:number;maxTokens:number;deadlineMs:number};tools:Record<string,ChatBackendTool>;check:(ref:ExecutionRef,raw:unknown,signal?:AbortSignal)=>Promise<{status:string}>}){
 const leases=createExecutionLeaseService(db,deps),ledger=createExecutionCallLedgerService(db,deps),binding=createAgenticToolBinding(deps.tools),reader=createChatHostContextReader(db,deps);
 const find=(task:Parameters<typeof binding.forCall>[0],calls:Parameters<typeof binding.forCall>[1],callId:string)=>{
  const parent=calls.find(call=>call.id===callId);if(!parent || parent.parentCallId || parent.toolExecutionClaimId)throw new ConflictError("搜索调用身份不符");
  const bound=binding.forCall(task,calls,parent);
  if(bound.validationOutcome || bound.execution!=="worker.research" || bound.executionToolName!=="material.gather" || bound.effect!=="none")throw new ConflictError("当前调用不是浏览器素材搜索");
  return {parent,bound};
 };
 async function current(ref:ExecutionRef,callId:string,mode:"admission"|"settlement"){
  return leases.withLease(ref,mode,async({tx,task})=>{
   const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
   return find(task,calls,callId);
  });
 }
 return {
  async prepare(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const {callId}=workerPortInputSchemas.prepareChatResearch.parse(raw);signal?.throwIfAborted();
   await readExecutionChatTask(db,ref,deps.now);const before=await current(ref,callId,"admission");
   if(before.parent.status!=="started" || before.parent.startedAttempt!==ref.attempt)throw new ConflictError("搜索调用尚未取得执行权");
   const decision=await deps.check(ref,{modelCallId:before.bound.modelCallId,toolCallId:before.bound.toolCallId},signal);
   if(decision.status!=="not-applicable")throw new ConflictError("搜索调用授权不可用");
   const restored=await reader.read(ref);signal?.throwIfAborted();
   if(!restored.hostContext.researchContext)throw new ConflictError("原任务没有搜索上下文");
   const after=await current(ref,callId,"admission");
   if(after.parent.status!=="started" || after.parent.startedAttempt!==ref.attempt || before.bound.inputDigest!==after.bound.inputDigest)throw new ConflictError("搜索准备期间执行权改变");
   return {available:restored.hostContext.researchContext.searchConfigured,query:prepareChatResearchQuery(restored.hostContext.researchContext,before.bound.input as {query?:string}),count:10 as const};
  },
  async settle(ref:ExecutionRef,raw:unknown){
   const {callId,observation}=workerPortInputSchemas.settleChatResearch.parse(raw),found=await current(ref,callId,"settlement");
   if(found.parent.status==="settled")return agenticToolOutcomeSchema.parse(workerToolResultReceiptSchema.parse(JSON.parse(found.parent.resultText!)).output);
   if(found.parent.status!=="started" || found.parent.startedAttempt!==ref.attempt)throw new ConflictError("搜索观察不属于当前已启动调用");
   const output=agenticToolOutcomeSchema.parse(observation.status==="ok"?{status:"ok",summary:`联网检索到 ${observation.results.length} 条`,evidence:observation.results.map(item=>({sourceUrl:item.url,title:item.title,text:item.snippet})),data:projectChatSearchResults(observation.results),error:null,continuation:null,sideEffect:"none"}:{status:observation.status,summary:observation.summary,error:observation.error,evidence:[],data:{kind:"material.gather",grounding:"unavailable",items:[],error:observation.summary,...(observation.recoveryState?{recoveryState:observation.recoveryState}:{})},continuation:null,sideEffect:"none"});
   const resultText=JSON.stringify(workerToolResultReceiptSchema.parse({schemaVersion:1,kind:"tool",toolCallId:found.bound.toolCallId,toolName:found.bound.toolName,output}));
   await ledger.settle(ref,callId,{status:"settled",usage:{totalTokens:0},resultText},undefined,(calls,task)=>{
    const actual=find(task,calls,callId);if(actual.parent.status!=="started" || actual.parent.startedAttempt!==ref.attempt || actual.bound.inputDigest!==found.bound.inputDigest)throw new ConflictError("搜索结算期间执行权改变");
   });return output;
  },
 };
}
