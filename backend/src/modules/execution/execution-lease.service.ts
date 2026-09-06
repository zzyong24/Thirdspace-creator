import {findScheduledParent} from "./execution-scheduled-child.service";
import { eq, asc, inArray, executionTasks, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { executionRefSchema, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { ConflictError } from "./execution.errors";

type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
type TaskRow = typeof executionTasks.$inferSelect;

/** 只供后端命名服务端口使用，禁止将此事务回调作为通用 Worker 调用暴露。 */
export function createExecutionLeaseService(db: Db, deps: {now?: () => string} = {}) {
  const now = deps.now ?? (() => new Date().toISOString());
  return {
    async withLease<T>(
      execution: ExecutionRef,
      mode: "admission" | "settlement",
      action: (scope: {tx: Transaction; task: TaskRow; context: RequestContext}) => Promise<T>,
    ): Promise<T> {
      const ref = executionRefSchema.parse(execution);
      return db.transaction(async tx => {
        const [snapshot] = await tx.select().from(executionTasks).where(eq(executionTasks.id,ref.executionTaskId));
        const parentSnapshot=mode==='admission'&&snapshot?await findScheduledParent(tx,snapshot):undefined;
        const locked=await tx.select().from(executionTasks).where(inArray(executionTasks.id,parentSnapshot?[ref.executionTaskId,parentSnapshot.id]:[ref.executionTaskId])).orderBy(asc(executionTasks.id)).for("update");
        const task=locked.find(row=>row.id===ref.executionTaskId);
        if(mode==='admission'&&task){const parent=await findScheduledParent(tx,task);if(parent?.id!==parentSnapshot?.id)throw new ConflictError('调度父任务关系改变，请重新领取');if(parent&&['pause_requested','paused','cancel_requested','cancelled'].includes(parent.status))throw new ConflictError('调度父任务已停止，不能启动子任务动作');}
        if (!task || task.attempt !== ref.attempt || task.fenceToken !== ref.fenceToken) {
          throw new ConflictError("执行凭证已失效");
        }
        if (mode === "admission" && (
          task.status !== "running" || !task.leaseOwner || !task.leaseExpiresAt ||
          (task.deadlineAt !== null && !(Date.parse(task.deadlineAt) > Date.parse(now()))) ||
          !(Date.parse(task.leaseExpiresAt) > Date.parse(now()))
        )) throw new ConflictError("当前执行已停止或租约到期，不能启动新动作");
        // settlement 的调用方必须只结算账本中已存在的同键调用；不能启动动作或改终态。
        // 未换租约时，取消/暂停后的迟到用量仍可记账；换过租约则由新执行对账。
        const context: RequestContext = {
          userId: task.userId, accountId: task.accountId,
          requestId: `execution:${task.id}:${task.attempt}`, source: "ai",
        };
        // 校验和写入共享行锁与事务，禁止把 action 中的写操作放到事务返回之后。
        return action({tx, task, context});
      });
    },
  };
}
