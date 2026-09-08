import {isDeepStrictEqual} from "node:util";
import {and,eq,executionCalls,executionTasks,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {chatWorkerInputSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {createExecutionLeaseService} from "./execution-lease.service";
import {prepareExecutionModelIdentity} from "./execution-model-identity.service";
import {ConflictError} from "./execution.errors";

/** 备用模型只替换明确拒绝的单轮供应商调用；不创建任务，也不改根模型和历史回执。 */
export function createExecutionChatFallbackService(db:Db,deps:{now?:()=>string;resolve(context:RequestContext):Promise<unknown|null>}){
 const leases=createExecutionLeaseService(db,deps);
 const scope=(ref:ExecutionRef,operationKey:string)=>leases.withLease(ref,"admission",async({tx,task,context})=>{
  const payload=task.payload as Record<string,unknown>,input=chatWorkerInputSchema.parse(payload.modelInput);
  if(task.kind!=="ai_task" || !isChatModelOperation(input.operationKey,operationKey))throw new ConflictError("备用模型不属于原聊天调用");
  const calls=await tx.select().from(executionCalls).where(and(eq(executionCalls.executionTaskId,task.id),eq(executionCalls.operationKey,operationKey)));
  const last=calls.sort((a,b)=>a.sequence-b.sequence).at(-1);
  if(!last || last.kind!=="model" || last.parentCallId || last.status!=="rejected" || last.rejectionCode!=="CHAT_MODEL_RETRYABLE_REJECTION")throw new ConflictError("备用模型缺少明确拒绝回执");
  return {context,payload};
 });
 return {async resolve(ref:ExecutionRef,operationKey:string){
  const original=await scope(ref,operationKey);
  if(original.payload.chatFallbackModelIdentity===null)return null;
  const raw=await deps.resolve(original.context);
  const prepared=raw==null?null:prepareExecutionModelIdentity("chat.fallback",raw);
  // 外部配置读取后再次验租约；凭据只返回当前 Worker，不进入 payload。
  await scope(ref,operationKey);
  await leases.withLease(ref,"admission",async({tx,task})=>{
   const payload=task.payload as Record<string,unknown>,identity=prepared?.identity??null;
   if(payload.chatFallbackModelIdentity!==undefined){
    if(!isDeepStrictEqual(payload.chatFallbackModelIdentity,identity))throw new ConflictError("备用模型配置与原执行身份不符");
    return;
   }
   await tx.update(executionTasks).set({payload:{...payload,chatFallbackModelIdentity:identity}}).where(eq(executionTasks.id,task.id));
  });
  return prepared?.credential??null;
 }};
}

export function isChatModelOperation(root:string,key:string){
 const prefix=`${root}/model/`;
 return key.startsWith(prefix) && /^[1-9][0-9]*$/.test(key.slice(prefix.length));
}
export function chatFallbackParent(root:string,key:string){
 const suffix="/fallback/model/1";
 if(!key.endsWith(suffix))return null;
 const parent=key.slice(0,-suffix.length);
 return isChatModelOperation(root,parent)?parent:null;
}
