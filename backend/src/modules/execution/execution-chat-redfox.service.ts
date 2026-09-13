import {createRedfoxSubmissions} from "../settings";
import {asc,eq,executionCalls,type Db} from "@creatoros/backend";
import {workerPortInputSchemas,workerToolResultReceiptSchema,agenticToolOutcomeSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {createChatHostContextReader} from "../ai/chat-host-context.service";
import {redfoxInputSchema} from "@creatoros/contract/execution-worker";
import type {RequestContext} from "@creatoros/contract";
import {createExecutionLeaseService} from "./execution-lease.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createAgenticToolBinding} from "./agentic-tool-binding";
import type {ChatBackendTool} from "./execution-chat-tool-ports.service";
import {readExecutionChatTask} from "./execution-chat-tool-ports.service";
import {ConflictError} from "./execution.errors";
/** 原父工具决定查询；宿主仅接原始浏览器观察，并生成原结果卡，不接受 Worker 自报候选。 */
export function createExecutionChatRedfoxService(db:Db,deps:{now?:()=>string;budget:{maxCalls:number;maxTokens:number;deadlineMs:number};tools:Record<string,ChatBackendTool>;resolveCredential?:(ctx:RequestContext)=>Promise<{key:string;fingerprint:string}|null>;check:(ref:ExecutionRef,raw:unknown,signal?:AbortSignal)=>Promise<{status:string}>}){
 const submissions=createRedfoxSubmissions(db);
 const leases=createExecutionLeaseService(db,deps),ledger=createExecutionCallLedgerService(db,deps),binding=createAgenticToolBinding(deps.tools),reader=createChatHostContextReader(db,deps);
 const find=(task:Parameters<typeof binding.forCall>[0],calls:Parameters<typeof binding.forCall>[1],callId:string)=>{
  const parent=calls.find(call=>call.id===callId);if(!parent || parent.parentCallId || parent.toolExecutionClaimId)throw new ConflictError("搜索调用身份不符");
  const bound=binding.forCall(task,calls,parent);
  if(bound.validationOutcome || bound.execution!=="worker.redfox" || bound.executionToolName!=="redfox.query" || bound.effect!=="committed")throw new ConflictError("当前调用不是浏览器素材搜索");
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
   const {callId}=workerPortInputSchemas.prepareChatRedfox.parse(raw);signal?.throwIfAborted();
   await readExecutionChatTask(db,ref,deps.now);const before=await current(ref,callId,"admission");
   if(before.parent.status!=="started" || before.parent.startedAttempt!==ref.attempt)throw new ConflictError("搜索调用尚未取得执行权");
   const decision=await deps.check(ref,{modelCallId:before.bound.modelCallId,toolCallId:before.bound.toolCallId},signal);
   if(decision.status!=="not-applicable")throw new ConflictError("搜索调用授权不可用");
   const restored=await reader.read(ref);signal?.throwIfAborted();
   const credential=await deps.resolveCredential?.(restored.context);signal?.throwIfAborted();
   const after=await current(ref,callId,"admission");
   if(after.parent.status!=="started" || after.parent.startedAttempt!==ref.attempt || before.bound.inputDigest!==after.bound.inputDigest)throw new ConflictError("RedFox准备期间执行权改变");
   const input=redfoxInputSchema.parse(before.bound.input);
   if(input.action==="transcriptSubmit" && credential){
    const claim=await submissions.claim(restored.context,input.url,credential.fingerprint,callId);
    if(!claim.claimed)return {input,credential:null,observation:claim.observation};
   }
   if(input.action==="transcriptResult" && credential && !(await submissions.canRead(restored.context,input.taskId,credential.fingerprint)))return {input,credential:null,observation:{status:"error",code:"REDFOX_TASK_OR_CREDENTIAL_MISMATCH"}};
   return {input,credential:credential??null};
  },
  async settle(ref:ExecutionRef,raw:unknown){
   const {callId,observation}=workerPortInputSchemas.settleChatRedfox.parse(raw),found=await current(ref,callId,"settlement");
   if(found.parent.status==="settled")return agenticToolOutcomeSchema.parse(workerToolResultReceiptSchema.parse(JSON.parse(found.parent.resultText!)).output);
   if(found.parent.status!=="started" || found.parent.startedAttempt!==ref.attempt)throw new ConflictError("搜索观察不属于当前已启动调用");
   const restored=await reader.read(ref);await submissions.settle(restored.context,callId,observation);
   const output=agenticToolOutcomeSchema.parse({status:observation.status==="ok"?"ok":"error",summary:observation.status==="ok"?"RedFox 查询已返回":observation.status==="unknown"?"提文案提交结果待核对，请保留原任务":"RedFox 暂时不可用",evidence:[],data:{kind:"redfox.query",...observation},error:observation.status==="ok"?null:{code:observation.status==="unknown"?"unknown_commit":"no_evidence",retryable:false,recovery:observation.status==="unknown"?"提交结果未知，不要重新提交同一视频":"检查 RedFox 密钥或稍后重新查询"},continuation:null,sideEffect:observation.status==="unknown"?"unknown":redfoxInputSchema.parse(found.bound.input).action==="transcriptSubmit"&&observation.status==="ok"?"committed":"none"});
   const resultText=JSON.stringify(workerToolResultReceiptSchema.parse({schemaVersion:1,kind:"tool",toolCallId:found.bound.toolCallId,toolName:found.bound.toolName,output}));
   await ledger.settle(ref,callId,{status:"settled",usage:{totalTokens:0},resultText},undefined,(calls,task)=>{
    const actual=find(task,calls,callId);if(actual.parent.status!=="started" || actual.parent.startedAttempt!==ref.attempt || actual.bound.inputDigest!==found.bound.inputDigest)throw new ConflictError("搜索结算期间执行权改变");
   });return output;
  },
 };
}
