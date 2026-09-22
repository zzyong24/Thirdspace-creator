import type {executionCalls,executionTasks} from "@creatoros/backend";
import {chatWorkerInputSchema} from "@creatoros/contract/execution-worker";
type Call=typeof executionCalls.$inferSelect;

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
