import { createHash } from "node:crypto";
import type { RequestContext } from "@creatoros/contract";
import type { IntelligenceService } from "./intelligence.service";
import type { PersistentTaskService } from "../execution/persistent-task.service";
import type { CollectionPorts } from "../execution/agentic/adapters/collection-adapter";
import { IntelligenceValidationError } from "./intelligence.errors";

type DispatchInput = { sourceId: string; runId: string; taskId: string; signal: AbortSignal };

/** 只通过领域服务提交和回读；模型不能指定父任务、账号或幂等键。 */
export function createCollectionToolPorts(
  ctx: RequestContext,
  parentTaskId: string,
  service: Pick<IntelligenceService, "listSources" | "startRun" | "getRun">,
  tasks: Pick<PersistentTaskService, "get" | "command">,
  dispatch: (ctx: RequestContext, input: DispatchInput) => Promise<void>,
  lifecycle?:{signal:AbortSignal;isParentCancelled():Promise<boolean>},
): CollectionPorts & {
  readCollection(input:{targetId:string;runId:string},signal:AbortSignal):ReturnType<CollectionPorts["runCollection"]>;
} {
  if (!parentTaskId) throw new IntelligenceValidationError("采集工具缺少父任务标识");
  const running = new Map<string, Promise<void>>();
  const watches = new Map<string, () => void>();
  return {
    async readCollection(input,signal){
      signal.throwIfAborted();
      const {run}=await service.getRun(ctx,input.runId);
      const task=await tasks.get(ctx,run.executionTaskId);
      const key="agentic-collect:"+createHash("sha256").update(JSON.stringify([parentTaskId,input.targetId])).digest("hex");
      if(run.sourceId!==input.targetId || task.idempotencyKey!==key)throw new IntelligenceValidationError("采集回执不属于当前父任务和目标");
      signal.throwIfAborted();
      if(run.status==="succeeded_with_items" || run.status==="succeeded_no_change")return {ok:true,itemsNew:run.newCount,itemsUpdated:run.updatedCount};
      if(run.status==="blocked" && run.nextAction==="login")return {ok:false,needsLogin:true,runId:run.id,taskId:run.executionTaskId};
      if(run.status==="queued" || run.status==="running")return {ok:false,pending:true,runId:run.id,taskId:run.executionTaskId,status:run.status};
      throw new IntelligenceValidationError(`采集未完成（${run.status}）：${run.errorSummary ?? "请查看任务详情"}`);
    },
    async listTargets(input, signal) {
      signal.throwIfAborted();
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 20;
      if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new IntelligenceValidationError("采集分页参数无效");
      }
      const all = [];
      for (let start = 0; ; start += 100) {
        const page = await service.listSources(ctx, { status: "active", limit: 100, offset: start });
        signal.throwIfAborted();
        all.push(...page.rows);
        if (start + page.rows.length >= page.total || page.rows.length === 0) break;
      }
      // SEMANTIC_BOUNDARY_ALLOW: 仅按用户显式字面名称筛选，不自动决定采集优先级。
      const query = input.query?.trim().toLowerCase();
      const filtered = query ? all.filter(row => row.displayName.toLowerCase().includes(query)) : all;
      return {
        targets: filtered.slice(offset, offset + limit).map(row => ({ id: row.id, label: row.displayName, lastCollectedAt: row.lastRunAt })),
        total: filtered.length,
        nextOffset: offset + limit < filtered.length ? offset + limit : null,
      };
    },
    async runCollection(input, signal) {
      signal.throwIfAborted();
      // SEMANTIC_BOUNDARY_ALLOW: 稳定键只绑定父任务和目标，重试/恢复不新建第二次采集。
      const key = "agentic-collect:" + createHash("sha256").update(JSON.stringify([parentTaskId, input.targetId])).digest("hex");
      let runId = input.runId;
      let submittedTask: Awaited<ReturnType<PersistentTaskService["get"]>> | undefined;
      if (!runId) {
        const started = await service.startRun(ctx, input.targetId, { trigger: "manual", idempotencyKey: key, reuseActiveRun: false });
        runId = started.run.id;
        submittedTask = started.task;
      }
      if (submittedTask && signal.aborted && submittedTask.idempotencyKey === key && (!lifecycle || await lifecycle.isParentCancelled())) {
        await tasks.command(ctx, { taskIds: [submittedTask.id], command: "cancel", idempotencyKey: `${key}:cancel` });
        signal.throwIfAborted();
      }
      const { run } = await service.getRun(ctx, runId);
      const task = submittedTask ?? await tasks.get(ctx, run.executionTaskId);
      if (run.sourceId !== input.targetId || task.idempotencyKey !== key) {
        throw new IntelligenceValidationError("采集回执不属于当前父任务和目标");
      }
      const childController=lifecycle?new AbortController():undefined;
      const parentSignal=lifecycle?.signal??signal;
      const cancel = async () => {
        // 工具完成、暂停、宿主收尾都可能 abort；只有持久取消才取消已提交采集。
        if(lifecycle && !await lifecycle.isParentCancelled())return;
        childController?.abort();
        await tasks.command(ctx, { taskIds: [task.id], command: "cancel", idempotencyKey: `${key}:cancel` });
      };
      if (parentSignal.aborted) {
        await cancel();
        signal.throwIfAborted();
      }
      if ((task.status === "queued" || task.status === "running") && !watches.has(task.id)) {
        // 父停止必须先写持久取消，不能只取消当前工具等待而让队列继续启动。
        const onAbort = () => { void cancel().catch(error => console.error("[collection] 取消失败", error instanceof Error ? error.name : "UnknownError")); };
        parentSignal.addEventListener("abort", onAbort, { once: true });
        watches.set(task.id, () => parentSignal.removeEventListener("abort", onAbort));
        if(parentSignal.aborted)onAbort();
      } else if (task.status !== "queued" && task.status !== "running") {
        watches.get(task.id)?.();
        watches.delete(task.id);
      }
      if (task.status === "queued" && !running.has(task.id)) {
        const work = Promise.resolve().then(() => dispatch(ctx, { sourceId: input.targetId, runId, taskId: task.id, signal:childController?.signal??signal }))
          .catch(error => console.error("[collection] 执行失败", error instanceof Error ? error.name : "UnknownError"))
          .finally(() => { running.delete(task.id);watches.get(task.id)?.();watches.delete(task.id); });
        running.set(task.id, work);
      }
      signal.throwIfAborted();
      if (run.status === "succeeded_with_items" || run.status === "succeeded_no_change") {
        return { ok: true, itemsNew: run.newCount, itemsUpdated: run.updatedCount };
      }
      if (run.status === "blocked" && run.nextAction === "login") {
        return { ok: false, needsLogin: true, runId, taskId: run.executionTaskId };
      }
      if (run.status === "queued" || run.status === "running") {
        return { ok: false, pending: true, runId, taskId: run.executionTaskId, status: run.status };
      }
      throw new IntelligenceValidationError(`采集未完成（${run.status}）：${run.errorSummary ?? "请查看任务详情"}`);
    },
  };
}
