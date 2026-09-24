import type {executionCalls,executionTasks} from "@creatoros/backend";
import {chatWorkerInputSchema,executionCheckpointSchema,workerProviderReceiptSchema} from "@creatoros/contract/execution-worker";
import {partitionExecutionCalls} from "./execution-call-tree";
import {reconstructCheckpointMessages} from "./execution-checkpoint.service";
import {isChatModelOperation,chatFallbackParent} from "./execution-chat-fallback.service";
type Call=typeof executionCalls.$inferSelect;
type Task=typeof executionTasks.$inferSelect;

export const isChatReplayRecoveryError=(code:string|null)=>code==="CHAT_MODEL_REQUEST_REPLAY_MISMATCH"||code==="MODEL_CALL_REQUIRES_RECONCILIATION";

/** 纯事实证明：只返回完整已确认前缀后的末个废弃根模型，不读取数据库或改变费用。
 * 调用方必须持有任务行锁；恢复许可与实际同摘要reserve/预算校验分别执行。
 */
export function provenChatModelRetryTail(task:Task,rawCalls:readonly Call[]):Call|null{
 const payload=task.payload as Record<string,unknown>|null,input=chatWorkerInputSchema.safeParse(payload?.modelInput);
 if(task.kind!=="ai_task"||task.ownerType!=="ai_task"||!input.success||input.data.executionEngine!=="pi"||
  input.data.userId!==task.userId||input.data.accountId!==task.accountId||payload?.aiTaskId!==task.ownerId)return null;
 const calls=[...rawCalls].sort((a,b)=>a.sequence-b.sequence),tail=calls.at(-1);
 if(!tail||new Set(calls.map(c=>c.id)).size!==calls.length||calls.some((c,i)=>c.sequence!==i+1||c.executionTaskId!==task.id||
  !["settled","superseded","rejected"].includes(c.status)||(c.status==="settled"&&(c.totalTokens===null||c.usage===null||
  (c.kind==="model"&&!workerProviderReceiptSchema.safeParse(c.providerResult).success)))))return null;
 if(tail.kind!=="model"||tail.status!=="superseded"||tail.parentCallId!==null||tail.accountingBasis!=="tokens"||
  tail.startedAttempt===null||tail.startedAttempt<1||tail.startedAttempt>task.attempt||tail.toolExecutionClaimId!==null||
  tail.providerJob!==null||tail.providerResult!==null||tail.resultRef!==null||tail.resultText!==null||tail.usage!==null||
  tail.totalTokens!==null||tail.rejectionCode!==null||!isChatModelOperation(input.data.operationKey,tail.operationKey))return null;
 try{
  const {roots}=partitionExecutionCalls(calls),groups=new Map<string,Call>();let nextModel=1;
  for(const call of roots.filter(c=>c.kind==="model")){
   const previous=groups.get(call.operationKey),fallback=chatFallbackParent(input.data.operationKey,call.operationKey);
   if(previous){
    if(!["rejected","superseded"].includes(previous.status)||call.retryOfCallId!==previous.id||call.inputDigest!==previous.inputDigest||
     call.reservedTokens!==previous.reservedTokens||call.accountingBasis!==previous.accountingBasis)return null;
   }else{
    if(call.retryOfCallId!==null)return null;
    if(fallback){
     const parent=groups.get(fallback);
     if(!payload?.chatFallbackModelIdentity||parent?.status!=="rejected"||parent.rejectionCode!=="CHAT_MODEL_RETRYABLE_REJECTION")return null;
    }else if(call.operationKey!==`${input.data.operationKey}/model/${nextModel++}`)return null;
   }
   groups.set(call.operationKey,call);
  }
  const latestKey=`${input.data.operationKey}/model/${nextModel-1}`;
  if(tail.operationKey!==latestKey||groups.has(`${latestKey}/fallback/model/1`))return null;
  // 更早的每个逻辑模型槽必须已有成功回放事实；旧superseded不因后续槽存在而被跳过。
  for(let n=1;n<nextModel-1;n++){
   const key=`${input.data.operationKey}/model/${n}`,model=groups.get(key)!,fallback=groups.get(`${key}/fallback/model/1`);
   if(model.status!=="settled"&&!(model.status==="rejected"&&model.rejectionCode==="CHAT_MODEL_RETRYABLE_REJECTION"&&fallback?.status==="settled"))return null;
  }
  // refs必须完整覆盖全部已确认根调用；只校验refs自身或最大sequence都不足以证明前缀。
  const confirmed=roots.filter(c=>c.status==="settled"),checkpoint=task.checkpoint===null?null:executionCheckpointSchema.parse(task.checkpoint);
  if(!checkpoint&&confirmed.length)return null;
  if(checkpoint&&(checkpoint.ledgerSequence>=tail.sequence||checkpoint.ledgerSequence<(calls.filter(c=>c.status==="settled").at(-1)?.sequence??0)))return null;
  const refs=checkpoint?.messages??[];
  if(refs.length!==confirmed.length||refs.some((r,i)=>r.callId!==confirmed[i]!.id||r.role!==(confirmed[i]!.kind==="model"?"assistant":"tool")))return null;
  if(reconstructCheckpointMessages(refs,calls,true).unresolvedToolCalls.length)return null;
  return tail;
 }catch{return null;}
}

/** 保留的许可必须仍指同一事实尾；旧版丢失许可只在已知回放阻断状态重建。 */
export function recoverableChatModelRetryAnchor(task:Task,calls:readonly Call[]):Call|null{
 if(!["paused","unknown_result"].includes(task.status)||task.leaseOwner!==null||task.leaseExpiresAt!==null||task.heartbeatAt!==null)return null;
 const tail=provenChatModelRetryTail(task,calls);
 if(!tail)return null;
 return task.retryOfCallId===tail.id||(task.retryOfCallId===null&&isChatReplayRecoveryError(task.lastErrorCode))?tail:null;
}

/** Existing safe-model selection shared by lease recovery and explicit resume.
 * Callers must still reject unresolved external actions and own the task lock.
 * No token usage or provider success is inferred from a missing response.
 */
export function unconfirmedModelCalls(calls:readonly Call[]):Call[]{
 return calls.filter(call=>call.kind==="model"&&["started","unknown"].includes(call.status)&&
  call.providerJob===null&&call.providerResult===null&&call.resultRef===null);
}

/** 显式继续仅回收无外部结果的根模型；调用方已锁定归属任务，先完整判定再写账本。 */
export function resumableChatModelCalls(task:typeof executionTasks.$inferSelect,calls:readonly Call[]):Call[]{
 if(task.kind!=="ai_task"||task.ownerType!=="ai_task"||!["paused","unknown_result"].includes(task.status)||
  task.leaseOwner!==null||task.leaseExpiresAt!==null)return [];
 const payload=task.payload as Record<string,unknown>|null,input=chatWorkerInputSchema.safeParse(payload?.modelInput);
 if(!input.success||input.data.executionEngine!=="pi"||input.data.userId!==task.userId||
  input.data.accountId!==task.accountId||payload?.aiTaskId!==task.ownerId)return [];
 if(calls.some(call=>call.executionTaskId!==task.id||(call.status==="settled"&&call.totalTokens===null)))return [];
 const pending=calls.filter(call=>["reserved","started","unknown"].includes(call.status));
 const safe=unconfirmedModelCalls(calls);
 if(!safe.length||safe.length!==pending.length||safe.some(call=>call.parentCallId!==null||call.resultText!==null||
  call.startedAttempt===null||call.startedAttempt<1||call.startedAttempt>task.attempt||calls.some(child=>child.parentCallId===call.id)))return [];
 return safe.sort((a,b)=>a.sequence-b.sequence);
}
