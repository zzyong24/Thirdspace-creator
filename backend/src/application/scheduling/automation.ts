import type {RequestContext} from "@creatoros/contract";
import {triggerScheduledJob,closeRunningJobRunOnError,createAutomationHandlerRegistry,startAutomationDriver,sweepStaleRuns,type AutomationDriverJob,type TriggerDeps} from "../../modules/ai-runtime";
/** 自动化任务枚举、原运行对账与父子执行挂接；驱动仍复用唯一持久任务权威。 */
export function createSchedulingAutomation(ports:{
  aiService:Pick<ReturnType<typeof import("../../modules/ai").createAiService>,"listRunningTasksSystem"|"getTask"|"markFailed">;
  schedulingService:Pick<ReturnType<typeof import("../../modules/scheduling").createSchedulingService>,"updateRun"|"listRunningRuns"|"listJobsSystem"|"listRunsByJob"|"getRun"|"getRunScheduledFor">;
  schedulerCtx:RequestContext;
  syncDailyExecutionRuns:ReturnType<typeof import("../../modules/scheduling").createDailyTopicRunService>["syncExecutionRuns"];
  syncCollectionExecutionRuns:ReturnType<typeof import("../../modules/scheduling").createCollectionRunStateService>["syncExecutionRuns"];
  staleJobRunMs:number;
  deps:{now:()=>string};
  triggerDeps:TriggerDeps;
  flywheelSourceKinds:ReadonlySet<string>;
  dispatchScheduledCollection:ReturnType<typeof import("./collection-execution").createCollectionExecution>["dispatchScheduledCollection"];
  persistentTaskService:Parameters<typeof startAutomationDriver>[0]["tasks"];
  scheduledChildren:Parameters<typeof startAutomationDriver>[0]["scheduledChildren"];
  wakeDelegated:()=>void;
}){
const {aiService,schedulingService,schedulerCtx,syncDailyExecutionRuns,syncCollectionExecutionRuns,staleJobRunMs,deps,triggerDeps,flywheelSourceKinds,dispatchScheduledCollection,persistentTaskService,scheduledChildren,wakeDelegated}=ports;
  const sweepStaleJobRuns = async (): Promise<number> => {
    try {
      const activeTaskIds = new Set(
        (await aiService.listRunningTasksSystem(schedulerCtx)).map((task) => task.id),
      );
      const dailySync=await syncDailyExecutionRuns(schedulerCtx);
      for(const id of dailySync.activeAiTaskIds)activeTaskIds.add(id);
      for(const item of dailySync.inconsistencies)console.error("[scheduler] 每日选题回执不一致",item);
      const collectionSync=await syncCollectionExecutionRuns(schedulerCtx);
      for(const id of collectionSync.activeAiTaskIds)activeTaskIds.add(id);
      for(const item of collectionSync.inconsistencies)console.error("[scheduler] 采集运行回执不一致",item);
      return await sweepStaleRuns({
        runs: {
          // sweep 只用 updateRun；其余端口为窄接口占位。
          createRun: async () => ({ id: "" }),
          listRunsByJob: async () => ({ rows: [], total: 0 }),
          updateRun: (c, runId, patch) =>
            schedulingService.updateRun(c, runId, patch),
        },
        listRunningRuns: async (c) => {
          const rows = await schedulingService.listRunningRuns(c);
          return rows.map((r) => ({
            id: r.id,
            jobId: r.jobId,
            aiTaskId: r.aiTaskId,
            startedAt: r.startedAt,
          }));
        },
        isRunActive: async (_c, run) =>
          Boolean(run.aiTaskId && activeTaskIds.has(run.aiTaskId)),
        ctx: schedulerCtx,
        now: deps.now,
        staleMs: staleJobRunMs,
      });
    } catch (error) {
      console.error("[scheduler] 运行期 job_run 清扫失败，本轮已安全跳过:", error);
      return 0;
    }
  };

  const listRunnableAutomationJobs = async (
    c: RequestContext,
  ): Promise<AutomationDriverJob[]> => {
    // enabled job 全取,再逐个用最近一次 run 过滤掉"最近 needs_reconnect"的(§6 停跑)。
    // [T-332 S2 · ISO-06] 调度器是系统 daemon:枚举走显式 listJobsSystem(跨号全见;用户面
    //   listJobs 已 strict 按号,系统 ctx 无号会被断言拒绝)。逐 job 的 run 读用该 job 的
    //   account_id 派生 ctx(读写恒同号,过 strict 门)。
    const { rows } = await schedulingService.listJobsSystem(c, {
      enabled: true,
      limit: 200,
      offset: 0,
    });
    const runnable: AutomationDriverJob[] = [];
    for (const job of rows) {
      if (!job.accountId) continue;
      const jobCtx: RequestContext = { ...c, accountId: job.accountId };
      const recent = await schedulingService.listRunsByJob(jobCtx, job.id, {
        limit: 1,
        offset: 0,
      });
      const last = recent.rows[0];
      if (last && last.status === "needs_reconnect") continue;
      runnable.push({
        id: job.id,
        sourceKind: job.sourceKind,
        target: (job.target ?? {}) as Record<string, unknown>,
        schedule: job.schedule,
        enabled: job.enabled,
        accountId: job.accountId,
        // [T-636] 每日作品同步漏跑补偿只需知道“当天计划后是否已经尝试过”。最近 run
        // 无论成功或失败都算一次尝试，避免失败时每分钟自动重试；needs_reconnect 已在上方停跑。
        lastRunStartedAt: last?.startedAt ?? null,
      });
    }
    return runnable;
  };

  const automationHandlers = createAutomationHandlerRegistry()
    .register("scheduled_collection", async (c, input) => {
      let result: Awaited<ReturnType<typeof triggerScheduledJob>> | null = null;
      try {
        result = await triggerScheduledJob(
          c,
          {
            id: input.job.id,
            sourceKind: input.job.sourceKind,
            target: input.job.target,
            accountId: input.job.accountId,
          },
          triggerDeps,
          { scheduledFor: input.scheduledFor },
        );
        if (result.skippedReason) return;
        if(input.job.sourceKind==="topic.daily"||flywheelSourceKinds.has(input.job.sourceKind)){
          // 新计划撞上旧在途运行，只跳过；原计划恢复才允许挂接原子任务。
          if(result.deduped && (await schedulingService.getRunScheduledFor(c,result.jobRunId))!==input.scheduledFor)return;
          const child=result.deduped
            ? await dispatchScheduledCollection(c,{id:result.aiTaskId,taskType:`scheduled.${input.job.sourceKind}`,inputData:{jobId:input.job.id,jobRunId:result.jobRunId,target:input.job.target}})
            : await result.completion;
          if(!child?.executionTaskId)throw new Error("调度任务缺少持久执行绑定");
          return child;
        }

        if (result.deduped) {
          if (input.attempt <= 1) {
            // 已有真实运行是一次成功的“重叠跳过”，不是执行失败；原 run 继续负责终态。
            return;
          }
          // 重启恢复时旧 job_run 仍 running：复用原 ai_task/run 继续真实 collector。
          if (!result.aiTaskId || !result.jobRunId) {
            throw new Error("已有自动化运行缺少 task/run 关联，无法恢复");
          }
          await dispatchScheduledCollection(c, {
            id: result.aiTaskId,
            taskType: `scheduled.${input.job.sourceKind}`,
            inputData: {
              jobId: input.job.id,
              jobRunId: result.jobRunId,
              target: input.job.target,
            },
          });
        } else {
          await result.completion;
        }
        const run = await schedulingService.getRun(c, result.jobRunId);
        if (run.status !== "succeeded") {
          throw new Error(run.error || `自动化运行结束状态为 ${run.status}`);
        }
      } catch (error) {
        if((input.job.sourceKind==="topic.daily"||flywheelSourceKinds.has(input.job.sourceKind))&&result?.aiTaskId){
          const existing=await aiService.getTask(c,result.aiTaskId);
          if(existing.executionTaskId){
            const scheduledFor=await schedulingService.getRunScheduledFor(c,result.jobRunId);
            if(scheduledFor!==input.scheduledFor)return;
            return {executionTaskId:existing.executionTaskId};
          }
          await aiService.markFailed(c,result.aiTaskId,error instanceof Error?error.message:String(error));
        }
        // runner 进入后会在 finally 自己收口；这里兜住“终态 task 无法 claim / snapshot
        // 装配失败 / dispatch 外层异常”等 runner 尚未进入的路径，不能只让 execution_task 失败。
        if (result?.jobRunId) {
          try {
            await closeRunningJobRunOnError(c, result.jobRunId, error, {
              getRun: (ctx, runId) => schedulingService.getRun(ctx, runId),
              updateRun: (ctx, runId, patch) =>
                schedulingService.updateRun(ctx, runId, patch),
              now: deps.now,
            });
          } catch (finalizeError) {
            console.error(
              `[automation-driver] job_run ${result.jobRunId} 失败终态回写失败:`,
              finalizeError,
            );
          }
        }
        throw error;
      }
    })
    .seal();

  const startUnifiedAutomationDriver = () =>
    startAutomationDriver({
      ctx: schedulerCtx,
      tasks: persistentTaskService,
      registry: automationHandlers,
      listRunnableJobs: listRunnableAutomationJobs,
      now: deps.now,
      workerId: `automation-driver:${process.pid}`,
      maxClaims: 8,
      leaseSeconds: 120,
      sweepStaleJobRuns,
      scheduledChildren,
      wakeDelegated,
    });

return {start:startUnifiedAutomationDriver};
}
