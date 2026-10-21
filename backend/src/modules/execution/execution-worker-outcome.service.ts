import {executionBudgetSchema,executionAttemptAvailable,isContinuousExecutionBudget} from "@creatoros/contract/execution-worker";
import {recoverableAssetCalls} from "./asset-execution-recovery";
import { and, desc, eq, executionCalls, executionTasks, type Db } from "@creatoros/backend";
import { workerPortInputSchemas, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { computeBackoffMs } from "@creatoros/ai-worker/retry-policy";
import { createExecutionLeaseService } from "./execution-lease.service";
import { observeCommittedTaskSettlement } from "./persistent-task.service";
import { ConflictError } from "./execution.errors";
import {provenChatModelRetryTail} from "./model-call-recovery";
import {preparationGenerationAttemptsExhausted} from './execution-preparation-parent';
import {modelEngineUnavailableMessage} from './model-engine-error';

/** 后端保存等待时间和重试来源；调度 attempt 仅用于 fencing，不作为供应商调用次数。 */
export function createExecutionWorkerOutcomeService(db: Db, deps: {now?:()=>string; random?:()=>number;allowedKinds?:readonly ("ai_task"|"topic_preview"|"script_candidate"|"transcribe")[]} = {}) {
  const now=deps.now ?? (()=>new Date().toISOString());
  const leases=createExecutionLeaseService(db,{now});
  return {
    async recordFailure(ref:ExecutionRef, raw:unknown, validate?: (calls:typeof executionCalls.$inferSelect[],task:typeof executionTasks.$inferSelect)=>string[]) {
      const input=workerPortInputSchemas.commitResult.parse(raw);
      if(input.outcome === "succeeded")throw new ConflictError("成功必须经候选提交端口");
      const committed = await leases.withLease(ref,"settlement",async({tx,task,context})=>{
        if(!(deps.allowedKinds??["ai_task"]).includes(task.kind as "ai_task"|"topic_preview"|"script_candidate"|"transcribe") || task.status !== "running")throw new ConflictError("任务已停止，不能覆盖状态");
        const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(desc(executionCalls.sequence));
        const allowedStarted=new Set(validate?.(calls,task)??[]),last=calls[0];
        if(input.outcome!=="unknown_result" && calls.some(call=>call.status==="unknown" || (call.status==="started" && !allowedStarted.has(call.id))))throw new ConflictError("存在未确认调用，禁止改成可恢复失败");
        let status:string=input.outcome;
        let retryAt:string|null=null;
        // 回放尚未到达原重试槽时，准备失败不能抹掉仍有完整物理证明的已授许可。
        let retryOfCallId:string|null=input.outcome==="unknown_result"&&task.retryOfCallId!==null&&
          provenChatModelRetryTail(task,calls)?.id===task.retryOfCallId?task.retryOfCallId:null;
        if(input.outcome === "retry_wait") {
          if(!last || !["rejected","superseded"].includes(last.status) || (last.status === "superseded" && last.kind !== "model"))throw new ConflictError("没有可安全续跑的模型失败事实，禁止自动重试");
          const budget=task.executionBudget === null ? null : executionBudgetSchema.parse(task.executionBudget);
          const delay=Math.max(input.retryAfterMs ?? 0,computeBackoffMs(last.sequence,deps.random));
          const next=Date.parse(now())+delay;
          if(!budget || preparationGenerationAttemptsExhausted(task) || (task.deadlineAt===null&&!isContinuousExecutionBudget(budget)) || (isContinuousExecutionBudget(budget)&&!executionAttemptAvailable(budget,task.attempt,task.maxAttempts)) || (budget.maxCalls !== null && last.sequence >= budget.maxCalls) || (task.deadlineAt !== null && next >= Date.parse(task.deadlineAt))) {
            status="failed";
          }else{
            retryAt=new Date(next).toISOString();retryOfCallId=last.id;
          }
        }
        if(input.outcome==="unknown_result" && input.errorCode==="ASSET_RECONCILE_RETRYABLE" && last?.providerJob && calls.every(call=>call.id===last.id || call.status==="rejected")){
          const stamp=now(),recoverable=await recoverableAssetCalls({tx,task,context},calls,stamp);
          const next=Date.parse(stamp)+Math.max(input.retryAfterMs??0,computeBackoffMs(task.attempt,deps.random));
          if(recoverable.includes(last.id) && (task.deadlineAt === null ? isContinuousExecutionBudget(task.executionBudget) : next<Date.parse(task.deadlineAt))){
            // 只重新领取原调用查询结果，账本继续 unknown，不能获得新提交资格。
            status="retry_wait";retryAt=new Date(next).toISOString();retryOfCallId=last.retryOfCallId;
          }
        }
        if(input.outcome === "waiting_user" && last?.status === "rejected") retryOfCallId=last.id;
        if(input.outcome==='waiting_user'&&preparationGenerationAttemptsExhausted(task))status='failed';
        const generationExhausted=status==='failed'&&preparationGenerationAttemptsExhausted(task);
        if(last && (last.status === "started" || last.status === "unknown") && input.outcome !== "unknown_result") {
          throw new ConflictError("已有未知调用不能改成可恢复失败");
        }
        const [updated]=await tx.update(executionTasks).set({status,retryAt,retryOfCallId,
          leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,lastErrorCode: generationExhausted?'GENERATION_RECOVERY_EXHAUSTED':status === "failed" && input.outcome === "retry_wait" ? "RETRY_BUDGET_EXHAUSTED" : input.errorCode,
          lastErrorMessage:generationExhausted?'原任务生成重试次数已用尽，已停止自动重试':input.outcome==='waiting_user'&&modelEngineUnavailableMessage(input.errorCode)?modelEngineUnavailableMessage(input.errorCode):input.errorCode === "CHAT_LEGACY_RUNTIME_UPGRADE_REQUIRED" ? "该任务使用已退役的聊天执行协议，无法自动续跑。原回执和历史已保留，请新建任务继续；未知调用须先对账。" : status === "retry_wait" ? (input.outcome==="unknown_result"?"原视频查询暂时失败，等待续查同一任务":last?.status==="superseded"?"模型连接中断，原任务正在自动续跑":"供应商明确拒绝，等待重试时间到达") : status === "unknown_result" ? "服务尚未返回完整结果，任务已暂停，已完成内容保留" : "执行停止，等待恢复或诊断",
          updatedAt:now(),
        }).where(and(eq(executionTasks.id,task.id),eq(executionTasks.fenceToken,ref.fenceToken))).returning();
        return {result:{status:updated!.status,retryAt:updated!.retryAt},event:{taskId:updated!.id,userId:updated!.userId,attempt:updated!.attempt,kind:updated!.kind,status:updated!.status,occurredAt:updated!.updatedAt}};
      });
      observeCommittedTaskSettlement(db,committed.event);
      return committed.result;
    },
  };
}
