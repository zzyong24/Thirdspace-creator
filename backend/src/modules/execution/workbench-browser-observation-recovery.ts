import {isDeepStrictEqual} from "node:util";
import {z} from "zod";
import type {executionCalls,executionTasks} from "@creatoros/backend";
import {chatWorkerInputSchema,workerProviderReceiptSchema,workerToolResultReceiptSchema,agenticToolOutcomeSchema,
 isWorkbenchBrowserObservation,browserObservationRecovery} from "@creatoros/contract/execution-worker";
import {createAgenticToolBinding} from "./agentic-tool-binding";
import {defineWorkbenchChatTool} from "../ai-runtime/chat-tool-gate";
import {prepareChatToolDefinitions} from "../ai-runtime/chat-tool-definitions";
type Task=typeof executionTasks.$inferSelect;
type Call=typeof executionCalls.$inferSelect;
const lane=z.string().min(1).max(128).refine(value=>!/[\x00-\x1f]/.test(value));
const observationInput=z.object({laneId:lane,browserEpoch:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict();

/** Pure recovery classification under the caller's task lock. No Native I/O,
 * lease acquisition or re-execution. Missing observation is an error, never a
 * synthetic successful page or a claim that no screenshot Blob was written.
 */
export async function recoverableBrowserObservationFailures(task:Task,calls:Call[],stamp:string){
 const patches:Array<{call:Call;resultText:string}>=[];
 if(task.kind!=="ai_task"||task.ownerType!=="ai_task"||!["running","unknown_result"].includes(task.status)||
  !Number.isFinite(Date.parse(stamp))||!task.accountId||!task.fenceToken||
  (task.leaseExpiresAt!==null&&!(Date.parse(task.leaseExpiresAt)<=Date.parse(stamp)))||
  (task.leaseOwner!==null&&task.leaseExpiresAt===null)||calls.some(call=>call.executionTaskId!==task.id))return patches;
 const payload=task.payload as Record<string,unknown>|null,input=chatWorkerInputSchema.safeParse(payload?.modelInput);
 if(!input.success||input.data.executionEngine!=="pi"||input.data.workbenchPlatform!=="macos"||
  input.data.userId!==task.userId||input.data.accountId!==task.accountId||payload?.aiTaskId!==task.ownerId)return patches;
 const capabilities=(input.data.workbenchCapabilities??[]).filter(isWorkbenchBrowserObservation);
 if(!capabilities.length||new Set(capabilities.map(cap=>cap.name)).size!==capabilities.length)return patches;
 let setup:Awaited<ReturnType<typeof prepareChatToolDefinitions>>;
 try{setup=await prepareChatToolDefinitions(Object.fromEntries(capabilities.map(cap=>[cap.name,defineWorkbenchChatTool(cap,async()=>{throw Error("RECOVERY_CANNOT_OBSERVE");})])),{workbenchCapabilities:capabilities});}
 catch{return patches;}
 const definitions=setup.definitions.filter(def=>{
  const frozen=input.data.tools.filter(tool=>tool.name===def.name);
  return frozen.length===1&&isDeepStrictEqual(frozen[0],def);
 });
 const binding=createAgenticToolBinding(Object.fromEntries(definitions.map(def=>[def.name,{...def,parameters:setup.parameters[def.name]!.parameters}])));
 for(const call of calls){
  if(call.kind!=="tool"||call.parentCallId||!["started","unknown"].includes(call.status)||!call.toolExecutionClaimId||
   call.startedAttempt===null||call.startedAttempt<1||call.startedAttempt>task.attempt||call.resultText!==null||call.resultRef!==null||
   call.providerJob!==null||call.providerResult!==null||call.totalTokens!==null||call.usage!==null||call.reservedTokens!==0||
   call.accountingBasis!=="tokens"||call.retryOfCallId!==null||call.rejectionCode!==null||
   calls.some(child=>child.parentCallId===call.id)||calls.filter(other=>other.operationKey===call.operationKey).length!==1)continue;
  try{
   const bound=binding.forCall(task,calls,call),model=calls.find(row=>row.id===bound.modelCallId);
   if(bound.execution!=="host"||bound.effect!=="none"||bound.validationOutcome||!model||model.parentCallId||
    model.status!=="settled"||model.totalTokens===null||!workerProviderReceiptSchema.safeParse(model.providerResult).success||
    call.sequence<=model.sequence||!definitions.some(def=>def.name===bound.executionToolName))continue;
   const schema=bound.executionToolName==="browser.status"?z.object({laneId:lane}).strict():observationInput;
   if(!schema.safeParse(bound.input).success)continue;
   const output=agenticToolOutcomeSchema.parse({status:"error",summary:"原浏览器观察未保存有效结果；现按原调用收口为读取结果不可用，未重新执行观察。",evidence:[],
    data:{recoveryEvidence:{kind:"browser_observation_unavailable",dispatchState:"unproven",originalCallId:call.id,
     operationKey:call.operationKey,inputDigest:call.inputDigest,reconciledAt:stamp,originalSnapshot:{status:call.status,resultText:call.resultText,
      resultRef:call.resultRef,startedAttempt:call.startedAttempt,toolExecutionClaimId:call.toolExecutionClaimId,totalTokens:call.totalTokens,
      usage:call.usage,reservedTokens:call.reservedTokens,priorUpdatedAt:call.updatedAt}}},
    error:{code:"transient",retryable:false,recovery:browserObservationRecovery},continuation:null,sideEffect:"none"});
   patches.push({call,resultText:JSON.stringify(workerToolResultReceiptSchema.parse({schemaVersion:1,kind:"tool",toolCallId:bound.toolCallId,toolName:bound.toolName,output}))});
  }catch{/* Incomplete or inconsistent frozen evidence keeps its original unknown. */}
 }
 return patches;
}
