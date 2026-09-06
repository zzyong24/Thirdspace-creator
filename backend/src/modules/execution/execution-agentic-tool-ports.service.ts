import { isDeepStrictEqual } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { and, asc, eq, aiTasks, executionCalls, type Db } from "@creatoros/backend";
import { agenticToolOutcomeSchema, workerPortInputSchemas, workerToolResultReceiptSchema, agenticToolReservationSchema, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";
import {createAgenticToolBinding,type AgenticBackendTool} from "./agentic-tool-binding";
export type {AgenticBackendTool} from "./agentic-tool-binding";
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Call=typeof executionCalls.$inferSelect;
type ToolOutcome=z.infer<typeof agenticToolOutcomeSchema>;
/** 工具名、参数和允许副作用来自后端冻结定义与已结算模型回执，不接受Worker自报。 */
export function createExecutionAgenticToolPorts(db:Db,deps:Parameters<typeof createExecutionCallLedgerService>[1]&{tools:Record<string,AgenticBackendTool>;waitForResultMs?:number}){
 const leases=createExecutionLeaseService(db,deps);const ledger=createExecutionCallLedgerService(db,deps);
 const {bind:binding,forCall:bindingForCall}=createAgenticToolBinding(deps.tools);
 const readOutput=(call:Call)=>agenticToolOutcomeSchema.parse(workerToolResultReceiptSchema.parse(JSON.parse(call.resultText ?? "")).output);
 // 已确认副作用不能重复；纯读只有成功结果可复用，明确无副作用错误仍允许后续调用。
 const reusable=(output:ToolOutcome)=>output.sideEffect==="committed" || output.sideEffect==="proposal" || (output.status==="ok" && output.error===null);
 async function settle(ref:ExecutionRef,raw:unknown,claimId?:string,reusedCallId?:string){
   const validated=workerPortInputSchemas.settleAgenticTool.parse(raw);
   // 先校验再按私有 JSON 传输形式规范化可选 undefined 字段。
   const request=JSON.parse(JSON.stringify(validated)) as typeof validated;
   const state=await ledger.inspect(ref);const original=state.calls.find(call=>call.id===request.callId);if(!original)throw new ConflictError("工具调用不存在");
   if(original.toolExecutionClaimId && !claimId && original.status!=="settled")throw new ConflictError("Host执行回执只能由实际执行者结算");
   if(claimId && original.toolExecutionClaimId!==claimId)throw new ConflictError("工具执行领取凭证不符");
   const bound=await leases.withLease(ref,"settlement",async({task})=>bindingForCall(task,state.calls,original));
   if(bound.validationOutcome && request.status==="settled" && hash(request.output)!==hash(bound.validationOutcome))throw new ConflictError("非法参数只能结算后端确定的校验回执");
   const unknown=request.status==="unknown" || request.output.sideEffect==="unknown" || request.output.error?.code==="unknown_commit";
   if(request.status==="settled" && !unknown && bound.dryRun && request.output.sideEffect!=="none")throw new ConflictError("预演任务不能结算真实副作用");
   if(request.status==="settled" && !unknown && request.output.sideEffect!=="none" && request.output.sideEffect!==bound.effect)throw new ConflictError("工具回执副作用超出已授权定义");
   const savedReuse=original.status==="settled" && original.resultText ? workerToolResultReceiptSchema.parse(JSON.parse(original.resultText)).reusedCallId : undefined;
   const reuse=reusedCallId??savedReuse;
   const settled=await ledger.settle(ref,request.callId,unknown?{status:"unknown"}:{status:"settled",usage:{totalTokens:0},resultText:JSON.stringify(workerToolResultReceiptSchema.parse({schemaVersion:1,kind:"tool",toolCallId:bound.toolCallId,toolName:bound.toolName,output:request.status==="settled"?request.output:null,...(reuse?{reusedCallId:reuse}:{})}))},call=>{
    if(claimId && call.toolExecutionClaimId!==claimId)throw new ConflictError("工具执行领取凭证已改变");
    if(call.toolExecutionClaimId && !claimId && call.status!=="settled")throw new ConflictError("等待者不能结算Host执行");
    if(call.kind!=="tool" || (!unknown && call.status==="unknown"))throw new ConflictError("未知工具提交须经独立对账，不能当正常重试结算");
   });return {callId:settled.id,status:settled.status};
  }

 return {
  settle:(ref:ExecutionRef,raw:unknown)=>settle(ref,raw),
  async execute(ref:ExecutionRef,raw:unknown,parentSignal?:AbortSignal):Promise<ToolOutcome>{
   parentSignal?.throwIfAborted();
   const {callId}=workerPortInputSchemas.executeAgenticTool.parse(raw);
   const claimed=await leases.withLease(ref,"admission",async({tx,task,context})=>{
    if(task.ownerType!=="ai_task")throw new ConflictError("工具执行没有AI业务归属");
    const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId!))).for("update");
    if(!business || !["queued","running"].includes(business.status))throw new ConflictError("工具执行的AI任务映射或状态不符");
    const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
    const call=calls.find(row=>row.id===callId);if(!call)throw new ConflictError("工具调用不存在");
    const bound=bindingForCall(task,calls,call);
    if(call.status==="settled")return {kind:"replay" as const,call};
    if(call.status!=="started" || call.startedAttempt!==ref.attempt)throw new ConflictError("工具未获当前执行许可或须对账");
    if(call.toolExecutionClaimId)return {kind:"waiting" as const,call};
    if(calls.filter(row=>row.kind==="model").at(-1)?.id!==bound.modelCallId)throw new ConflictError("旧模型回合不能执行");
    const handler=deps.tools[bound.executionToolName]?.execute;
    if(!handler && !bound.validationOutcome && !(bound.dryRun && bound.effect!=="none"))throw new ConflictError("工具没有后端执行端口");
    let reuseCallId:string|undefined;
    if(bound.reuseWithinRound && !bound.validationOutcome){
     for(const prior of [...calls].reverse()){
      if(prior.sequence>=call.sequence || prior.kind!=="tool" || prior.status==="rejected")continue;
      const previous=bindingForCall(task,calls,prior);
      if(previous.validationOutcome || previous.executionToolName!==bound.executionToolName || previous.effect!==bound.effect || !isDeepStrictEqual(previous.input,bound.input))continue;
      if(prior.status==="settled" && !reusable(readOutput(prior)))continue;
      reuseCallId=prior.id;break;
     }
    }
    const claimId=randomUUID();
    await tx.update(executionCalls).set({toolExecutionClaimId:claimId}).where(eq(executionCalls.id,callId));
    return {kind:"owner" as const,claimId,bound,handler,context,aiTaskId:task.ownerId,reuseCallId};
   });
   if(claimed.kind==="replay")return readOutput(claimed.call);
   if(claimed.kind==="waiting"){
    const until=Date.now()+(deps.waitForResultMs ?? 5000);
    do{
     parentSignal?.throwIfAborted();
     const call=(await ledger.inspect(ref)).calls.find(row=>row.id===callId);
     if(call?.status==="settled")return readOutput(call);
     if(call?.status!=="started")throw new ConflictError("工具结果须按原调用对账");
     if(Date.now()>=until)break;
     await new Promise(resolve=>setTimeout(resolve,25));
    }while(true);
    // 等待者没有执行权，超时不能结算unknown污染仍在执行的owner。
    throw new ConflictError("工具仍在执行，只能等待原回执");
   }
   const stop=new AbortController();const signal=parentSignal?AbortSignal.any([parentSignal,stop.signal]):stop.signal;
   let checking=false;
   const timer=setInterval(()=>{
    if(checking || signal.aborted)return;checking=true;
    void leases.withLease(ref,"admission",async()=>{}).catch(()=>stop.abort()).finally(()=>{checking=false;});
   },250);
   try{
    signal.throwIfAborted();
    let reused:ToolOutcome|undefined;
    if(claimed.reuseCallId){
     while(true){
      signal.throwIfAborted();
      const prior=(await ledger.inspect(ref)).calls.find(row=>row.id===claimed.reuseCallId);
      if(!prior || prior.status==="unknown")throw new ConflictError("同参前序调用结果未知，不能重复执行");
      if(prior.status==="settled"){const output=readOutput(prior);if(reusable(output))reused=output;break;}
      if(prior.status==="rejected")break;
      await new Promise(resolve=>setTimeout(resolve,25));
     }
    }
    signal.throwIfAborted();
    const output=agenticToolOutcomeSchema.parse(reused ?? claimed.bound.validationOutcome ?? (claimed.bound.dryRun && claimed.bound.effect!=="none"
     ? {status:"ok",summary:"已生成操作预演",evidence:[],data:{plan:{toolName:claimed.bound.toolName,input:claimed.bound.input}},error:null,continuation:null,sideEffect:"none"}
     : await claimed.handler!(claimed.context,claimed.bound.input,{execution:ref,aiTaskId:claimed.aiTaskId,callId,toolCallId:claimed.bound.toolCallId,signal})));
    const receipt=await settle(ref,{callId,status:"settled",output},claimed.claimId,reused?claimed.reuseCallId:undefined);
    if(receipt.status!=="settled")throw new ConflictError("工具提交结果未知，须对账");
    return output;
   }catch{
    await settle(ref,{callId,status:"unknown"},claimed.claimId).catch(()=>{});
    throw new ConflictError("工具执行结果未确认，须按原调用对账");
   }finally{clearInterval(timer);stop.abort();}
  },
  async reserve(ref:ExecutionRef,raw:unknown){
   const request=workerPortInputSchemas.reserveAgenticTool.parse(raw);
   const state=await ledger.inspect(ref);
   const bound=await leases.withLease(ref,"admission",async({task})=>binding(task,state.calls,request));
   const previous=state.calls.find(call=>call.operationKey===bound.operationKey);
   if(!previous && state.calls.filter(call=>call.kind==="model").at(-1)?.id!==bound.modelCallId)throw new ConflictError("模型回合已被后续决策替代");
   const call=await ledger.reserve(ref,{operationKey:bound.operationKey,inputDigest:bound.inputDigest,kind:"tool",reservedTokens:0},(calls,task)=>{
    const current=binding(task,calls,request);
    if(current.inputDigest!==bound.inputDigest)throw new ConflictError("工具定义在预留期间改变");
    if(!calls.some(call=>call.operationKey===bound.operationKey) && calls.filter(call=>call.kind==="model").at(-1)?.id!==bound.modelCallId)throw new ConflictError("模型回合在预留期间改变");
   });
   return agenticToolReservationSchema.parse({callId:call.id,status:call.status,toolName:bound.toolName,input:bound.input,...(bound.validationOutcome?{validationOutcome:bound.validationOutcome}:{}),...(call.status==="settled" && call.resultText?{receipt:JSON.parse(call.resultText)}:{})});
  },
  async start(ref:ExecutionRef,raw:unknown){
   const {callId}=workerPortInputSchemas.startAgenticTool.parse(raw);
   const call=await ledger.start(ref,callId,(call,calls,task)=>{
    const bound=bindingForCall(task,calls,call);
    if(calls.filter(candidate=>candidate.kind==="model").at(-1)?.id!==bound.modelCallId)throw new ConflictError("旧模型回合的工具不能再启动");
   });return {callId:call.id,status:call.status};
  },

 };
}
