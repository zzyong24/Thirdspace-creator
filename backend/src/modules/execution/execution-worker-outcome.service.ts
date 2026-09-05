import { and, desc, eq, executionCalls, executionTasks, type Db } from "@creatoros/backend";
import { workerPortInputSchemas, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { computeBackoffMs } from "@creatoros/ai-worker/retry-policy";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";

/** 后端保存等待时间和重试来源；调度 attempt 仅用于 fencing，不作为供应商调用次数。 */
export function createExecutionWorkerOutcomeService(db: Db, deps: {now?:()=>string; random?:()=>number} = {}) {
  const now=deps.now ?? (()=>new Date().toISOString());
  const leases=createExecutionLeaseService(db,{now});
  return {
    async recordFailure(ref:ExecutionRef, raw:unknown) {
      const input=workerPortInputSchemas.commitResult.parse(raw);
      if(input.outcome === "succeeded")throw new ConflictError("成功必须经候选提交端口");
      return leases.withLease(ref,"settlement",async({tx,task})=>{
        if(task.kind !== "ai_task" || task.status !== "running")throw new ConflictError("任务已停止，不能覆盖状态");
        const [last]=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(desc(executionCalls.sequence)).limit(1);
        let status:string=input.outcome;
        let retryAt:string|null=null;
        let retryOfCallId:string|null=null;
        if(input.outcome === "retry_wait") {
          if(!last || last.status !== "rejected")throw new ConflictError("没有明确拒绝事实，禁止自动重试");
          const budget=task.executionBudget as {maxCalls?:number}|null;
          const delay=Math.max(input.retryAfterMs ?? 0,computeBackoffMs(last.sequence,deps.random));
          const next=Date.parse(now())+delay;
          if(!budget?.maxCalls || last.sequence >= budget.maxCalls || !task.deadlineAt || next >= Date.parse(task.deadlineAt)) {
            status="failed";
          }else{
            retryAt=new Date(next).toISOString();retryOfCallId=last.id;
          }
        }
        if(input.outcome === "waiting_user" && last?.status === "rejected") retryOfCallId=last.id;
        if(last && (last.status === "started" || last.status === "unknown") && input.outcome !== "unknown_result") {
          throw new ConflictError("已有未知调用不能改成可恢复失败");
        }
        const [updated]=await tx.update(executionTasks).set({status,retryAt,retryOfCallId,
          leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,lastErrorCode: status === "failed" && input.outcome === "retry_wait" ? "RETRY_BUDGET_EXHAUSTED" : input.errorCode,
          lastErrorMessage:status === "retry_wait" ? "供应商明确拒绝，等待重试时间到达" : status === "unknown_result" ? "提交结果未知，须同键对账" : "执行停止，等待恢复或诊断",
          updatedAt:now(),
        }).where(and(eq(executionTasks.id,task.id),eq(executionTasks.fenceToken,ref.fenceToken))).returning();
        return {status:updated!.status,retryAt:updated!.retryAt};
      });
    },
  };
}
