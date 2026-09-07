import {chatSubmittedTaskType,chatSubmittedTaskResultKind} from "@creatoros/contract/execution-worker";
import {classifyLlmError} from "@creatoros/ai-worker/retry-policy";
import {isDeepStrictEqual} from "node:util";
import {z} from "zod";
import {and,asc,eq,aiTasks,executionCalls,type Db} from "@creatoros/backend";
import {agenticToolOutcomeSchema,workerToolResultReceiptSchema,workerPortInputSchemas,type ExecutionRef} from "@creatoros/contract/execution-worker";
import type {PreparedAiTaskCommit} from "../ai/ai-task-commit";
import type {ChatBackendTool} from "./execution-chat-tool-ports.service";
import {createAgenticToolBinding} from "./agentic-tool-binding";
import {createExecutionLeaseService} from "./execution-lease.service";
import {ConflictError} from "./execution.errors";

type Outcome=z.infer<typeof agenticToolOutcomeSchema>;
type Child=Awaited<ReturnType<PreparedAiTaskCommit["commit"]>>;
/** 已确认未提交的业务前置失败，保留原工具卡；不能携带成功或副作用声明。 */
export class ChatTaskPreparationFailure extends Error {
 readonly outcome:Outcome;
 constructor(outcome:Outcome){
  super(outcome.summary);this.outcome=agenticToolOutcomeSchema.parse(outcome);
  if(this.outcome.status!=="error" || this.outcome.sideEffect!=="none")throw new Error("任务准备失败不得声明副作用");
 }
}
export interface ChatTaskPreparation {task:PreparedAiTaskCommit;result(task:Child):Outcome}
/** 只处理冻结为纯数据库提交的工具；子任务与工具成功回执共用父执行行锁与事务。 */
export function createExecutionChatTaskSubmissionService(db:Db,deps:{now?:()=>string;tools:Record<string,ChatBackendTool>;check:(ref:ExecutionRef,input:{modelCallId:string;toolCallId:string},signal?:AbortSignal)=>Promise<{status:string}>}){
 const leases=createExecutionLeaseService(db,deps),binding=createAgenticToolBinding(deps.tools);
 const now=deps.now??(()=>new Date().toISOString());
 const blocked=(status:string)=>agenticToolOutcomeSchema.parse({status:"blocked",summary:status==="denied"?"本次操作已被拒绝":"本次操作需要恢复授权",evidence:[],data:status==="denied"?{denied:true}:{recoveryState:"chat_authorization_required"},error:{code:"permission",retryable:false,recovery:"恢复工具权限后继续原任务"},continuation:null,sideEffect:"none"});
 const output=(call:typeof executionCalls.$inferSelect)=>agenticToolOutcomeSchema.parse(workerToolResultReceiptSchema.parse(JSON.parse(call.resultText??"")).output);
 async function read(scope:Parameters<Parameters<typeof leases.withLease>[2]>[0],callId:string,settlement=false){
  const {tx,task,context}=scope;
  const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId!))).for("update");
  if(task.ownerType!=="ai_task" || !business || business.taskType!=="copilot.assist" || (!settlement && !["queued","running"].includes(business.status)))throw new ConflictError("提交工具缺少真实聊天归属");
  const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
  const call=calls.find(row=>row.id===callId);if(!call)throw new ConflictError("提交工具调用不存在");
  const bound=binding.forCall(task,calls,call);
  return {call,bound,calls,context,task};
 }
 function assertPending(state:Awaited<ReturnType<typeof read>>,ref:ExecutionRef){
  const {call,bound,calls}=state;
  if(bound.execution!=="host.task-submit" || bound.effect!=="committed" || !chatSubmittedTaskType(bound.executionToolName) || call.kind!=="tool" || call.parentCallId || call.status!=="started" || call.startedAttempt!==ref.attempt || call.toolExecutionClaimId || call.resultText || call.totalTokens!==null || call.reservedTokens!==0 || calls.some(row=>row.parentCallId===call.id))throw new ConflictError("当前调用不是可提交的原子任务工具");
  if(calls.filter(row=>row.kind==="model" && !row.parentCallId).at(-1)?.id!==bound.modelCallId)throw new ConflictError("旧模型回合不能提交新任务");
 }
 function priorResult(state:Awaited<ReturnType<typeof read>>){
  if(state.bound.validationOutcome)return null;
  for(const prior of [...state.calls].reverse()){
   if(prior.sequence>=state.call.sequence || prior.kind!=="tool" || prior.status==="rejected")continue;
   const previous=binding.forCall(state.task,state.calls,prior);
   if(previous.validationOutcome || previous.execution!=="host.task-submit" || previous.executionToolName!==state.bound.executionToolName || !isDeepStrictEqual(previous.input,state.bound.input))continue;
   if(prior.status==="settled"){
    const result=output(prior);
    if(result.status==="ok" && result.sideEffect==="committed" && !result.error)return {callId:prior.id,result};
    continue;
   }
   if(prior.status==="unknown")throw new ConflictError("同参提交结果未知，不能创建新任务");
   return {callId:prior.id,result:null};
  }
  return null;
 }
 return {
  async wake(ref:ExecutionRef,callId:string){
   const state=await leases.withLease(ref,"settlement",scope=>read(scope,callId,true));
   if(state.bound.execution!=="host.task-submit" || state.call.status!=="settled")return;
   const result=output(state.call),data=result.data as Record<string,unknown>|undefined;
   if(result.status!=="ok" || result.sideEffect!=="committed" || result.error || typeof data?.taskId!=="string")return;
   // 已提交事实不因唤醒失败降为未知；启动恢复继续处理原 queued 子任务。
   try{await deps.tools[state.bound.executionToolName]?.wakeTask?.(structuredClone(state.context),data.taskId);}
   catch{console.error("[chat-task] TASK_WAKE_FAILED");}
  },
  async handles(ref:ExecutionRef,raw:unknown){const {callId}=workerPortInputSchemas.executeAgenticTool.parse(raw);return leases.withLease(ref,"admission",async scope=>(await read(scope,callId)).bound.execution==="host.task-submit");},
  async execute(ref:ExecutionRef,raw:unknown,signal?:AbortSignal):Promise<Outcome>{
   signal?.throwIfAborted();const {callId}=workerPortInputSchemas.executeAgenticTool.parse(raw);
   const initial=await leases.withLease(ref,"admission",scope=>read(scope,callId));
   if(initial.call.status==="settled")return output(initial.call);
   assertPending(initial,ref);
   const tool=deps.tools[initial.bound.executionToolName];if(!tool?.prepareTask || tool.execute)throw new ConflictError("事务工具未装配纯提交端口");
   const request={modelCallId:initial.bound.modelCallId,toolCallId:initial.bound.toolCallId};
   const decision=await deps.check(ref,request,signal);signal?.throwIfAborted();
   let permission=decision.status==="not-applicable"?undefined:blocked(decision.status);
   let reuse=priorResult(initial);
   while(reuse && !reuse.result){
    signal?.throwIfAborted();
    await new Promise(resolve=>setTimeout(resolve,25));
    const state=await leases.withLease(ref,"admission",scope=>read(scope,callId));
    if(state.call.status==="settled")return output(state.call);
    assertPending(state,ref);reuse=priorResult(state);
   }
   const attemptId=`chat-submit:${callId}`;
   let prepared:ChatTaskPreparation|null=null,preparationFailure:Outcome|undefined;
   if(!permission && !reuse?.result && !initial.bound.validationOutcome){
    try{prepared=await tool.prepareTask(structuredClone(initial.context),structuredClone(initial.bound.input),{execution:{...ref},callId,attemptId,signal});}
    catch(error){
     signal?.throwIfAborted();
     const classified=classifyLlmError(error);
     preparationFailure=error instanceof ChatTaskPreparationFailure?error.outcome:classified.reason==="auth_401" || classified.reason==="auth_403"?blocked("unavailable"):agenticToolOutcomeSchema.parse({status:"error",summary:"任务准备未完成，尚未提交",evidence:[],error:{code:classified.retryable?"transient":"no_evidence",retryable:classified.retryable,recovery:"检查任务输入与服务状态后继续"},continuation:null,sideEffect:"none"});
    }
   }
   signal?.throwIfAborted();
   const currentDecision=await deps.check(ref,request,signal);signal?.throwIfAborted();
   if(currentDecision.status!=="not-applicable")permission=blocked(currentDecision.status);
   return leases.withLease(ref,"admission",async scope=>{
    signal?.throwIfAborted();const current=await read(scope,callId);
    if(current.call.status==="settled")return output(current.call);
    assertPending(current,ref);
    if(current.bound.inputDigest!==initial.bound.inputDigest)throw new ConflictError("准备期间工具输入改变");
    const prior=priorResult(current);
    if(prior && !prior.result)throw new ConflictError("同参提交尚未完成");
    const reused=!current.bound.validationOutcome && !permission?prior:null;
    let result=current.bound.validationOutcome??permission??reused?.result??preparationFailure;
    if(!result){
     const child=await prepared!.task.commit(scope.tx,{executionTaskId:ref.executionTaskId,callId,inputDigest:current.bound.inputDigest});
     if(child.taskType!==chatSubmittedTaskType(current.bound.executionToolName) || child.attemptId!==attemptId)throw new ConflictError("子任务与原工具提交不符");
     result=agenticToolOutcomeSchema.parse(prepared!.result(structuredClone(child)));
     const data=result.data as Record<string,unknown>|undefined;
     if(result.status!=="ok" || result.sideEffect!=="committed" || result.error || data?.kind!==chatSubmittedTaskResultKind(current.bound.executionToolName) || data?.taskId!==child.id)throw new ConflictError("子任务回执未引用真实提交结果");
    }
    const resultText=JSON.stringify(workerToolResultReceiptSchema.parse({schemaVersion:1,kind:"tool",toolCallId:current.bound.toolCallId,toolName:current.bound.toolName,output:result,...(reused?{reusedCallId:reused.callId}:{})}));
    await scope.tx.update(executionCalls).set({status:"settled",usage:{totalTokens:0},totalTokens:0,resultText,updatedAt:now()}).where(eq(executionCalls.id,callId));
    return result;
   });
  },
 };
}
