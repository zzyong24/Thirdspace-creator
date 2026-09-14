import { describe, it, expect, vi } from "vitest";
import {
  triggerScheduledJob,
  closeRunningJobRunOnError,
  runJobNow,
  dayKeyOf,
  cronMatchesMinute,
  sweepStaleRuns,
  // [T-207] 启动 sweep 僵尸 ai_task。
  sweepStaleAiTasks,
  type TriggerDeps,
  type SchedulableJob,
  type SweepStaleDeps,
} from "./scheduled-collection-scheduler";
import type { RequestContext } from "@creatoros/contract";

// T-007 D3 调度器验证(补 D3 子代理死于提交前没写的:SPEC §10 要求的**幂等断言** +
// cron 匹配器正确性 + gate finding-3 启动扫超时)。全纯逻辑、注入端口,零成本。

const ctx: RequestContext = { userId: "u1", requestId: "sched", source: "ingestion" };
const job: SchedulableJob = {
  id: "job1",
  sourceKind: "self.metrics",
  target: { externalSourceId: "src1" },
};

function makeTriggerDeps(
  runsRows: { id: string; status: string; startedAt: string; aiTaskId: string | null }[] = [],
): TriggerDeps & {
  _createTask: ReturnType<typeof vi.fn>;
  _createRun: ReturnType<typeof vi.fn>;
  _dispatch: ReturnType<typeof vi.fn>;
} {
  const _createTask = vi.fn(async () => ({ id: "task1", status: "queued" }));
  const _createRun = vi.fn(async () => ({ id: "run1" }));
  const _dispatch = vi.fn(() => {});
  return {
    ai: { createTask: _createTask },
    runs: {
      createRun: _createRun,
      listRunsByJob: vi.fn(async () => ({ rows: runsRows, total: runsRows.length })),
      updateRun: vi.fn(async () => ({})),
    },
    dispatch: _dispatch,
    now: () => "2026-07-01T09:00:00.000Z",
    _createTask,
    _createRun,
    _dispatch,
  };
}

describe("triggerScheduledJob(幂等双闸)", () => {
  it('独立流量cron保留父计划锚，手动流量仍使用空计划',async()=>{
    const traffic={...job,sourceKind:'self.traffic'};
    const deps=makeTriggerDeps();const scheduledFor='2026-07-01T08:40:00.000Z';
    await triggerScheduledJob(ctx,traffic,deps,{scheduledFor});
    expect(deps._createTask.mock.calls[0]![1].inputData.scheduledRun.scheduledFor).toBe(scheduledFor);
    expect(deps._createRun.mock.calls[0]![1].scheduledFor).toBe(scheduledFor);
    const manual=makeTriggerDeps();await triggerScheduledJob(ctx,traffic,manual);
    expect(manual._createRun.mock.calls[0]![1].scheduledFor).toBeNull();
  });
  it("首次触发:产 ai_task + job_run + dispatch,deduped=false", async () => {
    const deps = makeTriggerDeps([]);
    const res = await triggerScheduledJob(ctx, job, deps);

    expect(deps._createTask).toHaveBeenCalledTimes(1);
    // [T-200] ctx 现为派生的 collectionCtx(job 无号 + ctx 无号 → accountId: null)。
    expect(deps._createTask).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", requestId: "sched", accountId: null }),
      {
        taskType: "scheduled.self.metrics",
        attemptId: expect.stringMatching(/^scheduled-[a-f0-9]{32}$/),
        inputData: expect.objectContaining({
          idempotencyKey: "job1:2026-07-01", // jobId:自然日
          jobId: "job1",
        }),
      },
    );
    expect(deps._createRun).toHaveBeenCalledTimes(1);
    // dispatch 收到带 jobRunId 的 task(交 runner 回填)
    expect(deps._dispatch).toHaveBeenCalledTimes(1);
    expect(deps._dispatch.mock.calls[0]![1].inputData).toMatchObject({
      jobId: "job1",
      jobRunId: "run1",
    });
    expect(res).toMatchObject({ deduped: false, aiTaskId: "task1", jobRunId: "run1" });
  });

  it("[T-616] createTask 意外返回终态旧任务时拒绝新建 running job_run", async () => {
    const deps = makeTriggerDeps([]);
    deps._createTask.mockResolvedValueOnce({
      id: "task-finished",
      status: "succeeded",
    });

    await expect(triggerScheduledJob(ctx, job, deps)).rejects.toThrow(
      /已是终态 succeeded/,
    );
    expect(deps._createRun).not.toHaveBeenCalled();
    expect(deps._dispatch).not.toHaveBeenCalled();
  });

  it("[T-616] 同一计划分钟生成相同 attempt，不同计划分钟生成不同 attempt", async () => {
    const first = makeTriggerDeps([]);
    await triggerScheduledJob(ctx, job, first, {
      scheduledFor: "2026-07-01T09:00:00.000Z",
    });
    const second = makeTriggerDeps([]);
    await triggerScheduledJob(ctx, job, second, {
      scheduledFor: "2026-07-01T09:01:00.000Z",
    });

    const firstAttempt = (first._createTask.mock.calls as unknown as Array<[unknown,{attemptId:string}]>)[0]![1].attemptId;
    const secondAttempt = (second._createTask.mock.calls as unknown as Array<[unknown,{attemptId:string}]>)[0]![1].attemptId;
    expect(firstAttempt).toMatch(/^scheduled-[a-f0-9]{32}$/);
    expect(secondAttempt).toMatch(/^scheduled-[a-f0-9]{32}$/);
    expect(secondAttempt).not.toBe(firstAttempt);
  });

  it("[T-433 S1] skipHeavyBackfill:true → dispatch 的 inputData.target 带 __skipHeavyBackfill(且保留原 target 字段)", async () => {
    const deps = makeTriggerDeps([]);
    const detailJob: SchedulableJob = {
      id: "jobd",
      sourceKind: "self.detail",
      target: { externalSourceId: "src1" },
    };
    await triggerScheduledJob(ctx, detailJob, deps, { skipHeavyBackfill: true });

    // runner 实收的是 dispatch 载荷:target 注入 __skipHeavyBackfill,原字段(externalSourceId)不丢。
    const dispatched = deps._dispatch.mock.calls[0]![1].inputData.target;
    expect(dispatched).toMatchObject({
      externalSourceId: "src1",
      __skipHeavyBackfill: true,
    });
  });

  it("[T-433 S1] 默认(无 options)→ dispatch target 不带 __skipHeavyBackfill(定时任务照跑全量重活)", async () => {
    const deps = makeTriggerDeps([]);
    await triggerScheduledJob(ctx, job, deps);

    const dispatched = deps._dispatch.mock.calls[0]![1].inputData.target as Record<
      string,
      unknown
    >;
    expect(dispatched).not.toHaveProperty("__skipHeavyBackfill");
    expect(dispatched).toMatchObject({ externalSourceId: "src1" });
  });

  it("**SPEC §10 幂等**:同 job 当天已有 in-flight run → 短路,不重复产 task/run/dispatch", async () => {
    const deps = makeTriggerDeps([
      { id: "run-existing", status: "running", startedAt: "2026-07-01T08:00:00.000Z", aiTaskId: "task-existing" },
    ]);
    const res = await triggerScheduledJob(ctx, job, deps);

    expect(res.deduped).toBe(true);
    expect(res.jobRunId).toBe("run-existing");
    // 关键:没有重复产 task / run / dispatch(同天不重复采)
    expect(deps._createTask).not.toHaveBeenCalled();
    expect(deps._createRun).not.toHaveBeenCalled();
    expect(deps._dispatch).not.toHaveBeenCalled();
  });

  it("[T-200] 采集 ctx.accountId 由 job.accountId 派生(cron 系统 ctx 无号 → 落 job 的号)", async () => {
    // 模拟 cron:调用方 ctx(schedulerCtx)无 accountId;job 带号 acct-9。
    const cronCtx: RequestContext = { userId: "u1", requestId: "scheduler", source: "ingestion" };
    const jobWithAccount: SchedulableJob = { ...job, accountId: "acct-9" };
    const deps = makeTriggerDeps([]);
    await triggerScheduledJob(cronCtx, jobWithAccount, deps);

    // createTask / createRun / dispatch 全收到派生号 acct-9(userId 仍 canonical u1)。
    const expectAcct = expect.objectContaining({ userId: "u1", accountId: "acct-9" });
    expect(deps._createTask).toHaveBeenCalledWith(expectAcct, expect.anything());
    expect(deps._createRun).toHaveBeenCalledWith(expectAcct, expect.anything());
    expect(deps._dispatch.mock.calls[0]![0]).toMatchObject({
      userId: "u1",
      accountId: "acct-9",
    });
  });

  it("[T-200] job 无号 → 退化用 ctx.accountId(runNow/bind 的请求号)", async () => {
    const reqCtx: RequestContext = {
      userId: "u1",
      requestId: "runNow",
      source: "user",
      accountId: "acct-req",
    };
    const jobNoAccount: SchedulableJob = { ...job, accountId: null };
    const deps = makeTriggerDeps([]);
    await triggerScheduledJob(reqCtx, jobNoAccount, deps);
    expect(deps._dispatch.mock.calls[0]![0]).toMatchObject({ accountId: "acct-req" });
  });

  it("跨天采集仍在运行时保持原任务，不重新生成", async () => {
    const deps = makeTriggerDeps([
      { id: "run-yesterday", status: "running", startedAt: "2026-06-30T09:00:00.000Z", aiTaskId: "t0" },
    ]);
    const res = await triggerScheduledJob(ctx, job, deps);
    expect(res).toMatchObject({deduped:true,jobRunId:"run-yesterday",aiTaskId:"t0"});
    expect(deps._createTask).not.toHaveBeenCalled();
  });
});

describe("closeRunningJobRunOnError(T-616 handler 外层终态闸)", () => {
  it("runner 未进入且 run 仍 running → 补写 failed；已有终态不覆盖", async () => {
    const updateRun = vi.fn(async () => ({}));
    const runningClosed = await closeRunningJobRunOnError(
      ctx,
      "run-running",
      new Error("AI task 无法 claim"),
      {
        getRun: async () => ({ status: "running" }),
        updateRun,
        now: () => "2026-07-01T09:00:00.000Z",
      },
    );
    expect(runningClosed).toBe(true);
    expect(updateRun).toHaveBeenCalledWith(
      ctx,
      "run-running",
      expect.objectContaining({
        status: "failed",
        progress: null,
        error: expect.stringContaining("AI task 无法 claim"),
      }),
    );

    updateRun.mockClear();
    const terminalPreserved = await closeRunningJobRunOnError(
      ctx,
      "run-failed",
      new Error("外层错误"),
      {
        getRun: async () => ({ status: "failed" }),
        updateRun,
        now: () => "2026-07-01T09:00:00.000Z",
      },
    );
    expect(terminalPreserved).toBe(false);
    expect(updateRun).not.toHaveBeenCalled();
  });
});

describe("[T-201d] 隐藏号定时任务停跑 gate", () => {
  const jobWithAccount: SchedulableJob = { ...job, accountId: "acct-9" };

  it("归属号非 active(archived/隐藏)→ 跳过:不产 task/run/dispatch,返回 skippedReason", async () => {
    const deps = makeTriggerDeps([]);
    const getAccountStatus = vi.fn(async () => "archived");
    const res = await triggerScheduledJob(ctx, jobWithAccount, {
      ...deps,
      getAccountStatus,
    });

    expect(getAccountStatus).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct-9" }),
      "acct-9",
    );
    // 跳过:不产 task/run/dispatch。
    expect(deps._createTask).not.toHaveBeenCalled();
    expect(deps._createRun).not.toHaveBeenCalled();
    expect(deps._dispatch).not.toHaveBeenCalled();
    // 返回「已跳过」形态:空 id + deduped=false + skippedReason。
    expect(res.jobRunId).toBe("");
    expect(res.aiTaskId).toBe("");
    expect(res.deduped).toBe(false);
    expect(res.skippedReason).toContain("archived");
  });

  it("归属号 active → 照常产 task/run/dispatch(不跳过)", async () => {
    const deps = makeTriggerDeps([]);
    const getAccountStatus = vi.fn(async () => "active");
    const res = await triggerScheduledJob(ctx, jobWithAccount, {
      ...deps,
      getAccountStatus,
    });
    expect(deps._createTask).toHaveBeenCalledTimes(1);
    expect(deps._createRun).toHaveBeenCalledTimes(1);
    expect(deps._dispatch).toHaveBeenCalledTimes(1);
    expect(res.skippedReason).toBeUndefined();
    expect(res).toMatchObject({ deduped: false, aiTaskId: "task1", jobRunId: "run1" });
  });

  it("端口未绑(getAccountStatus 缺省)→ 保持原行为跑(不查、不跳过)", async () => {
    const deps = makeTriggerDeps([]); // 无 getAccountStatus
    const res = await triggerScheduledJob(ctx, jobWithAccount, deps);
    expect(deps._createTask).toHaveBeenCalledTimes(1);
    expect(deps._dispatch).toHaveBeenCalledTimes(1);
    expect(res.skippedReason).toBeUndefined();
  });

  it("查号返回 null(号不存在/越权/查失败)→ 降级放行(照跑,不误停)", async () => {
    const deps = makeTriggerDeps([]);
    const getAccountStatus = vi.fn(async () => null);
    const res = await triggerScheduledJob(ctx, jobWithAccount, {
      ...deps,
      getAccountStatus,
    });
    expect(deps._createTask).toHaveBeenCalledTimes(1);
    expect(deps._dispatch).toHaveBeenCalledTimes(1);
    expect(res.skippedReason).toBeUndefined();
  });

  it("查号端口抛错 → 捕获后降级放行(不因查号失败而误停)", async () => {
    const deps = makeTriggerDeps([]);
    const getAccountStatus = vi.fn(async () => {
      throw new Error("boom");
    });
    const res = await triggerScheduledJob(ctx, jobWithAccount, {
      ...deps,
      getAccountStatus,
    });
    expect(deps._createTask).toHaveBeenCalledTimes(1);
    expect(deps._dispatch).toHaveBeenCalledTimes(1);
    expect(res.skippedReason).toBeUndefined();
  });

  it("job 无号 → 不查(gate 只对有归属号的 job 生效)", async () => {
    const deps = makeTriggerDeps([]);
    const getAccountStatus = vi.fn(async () => "archived");
    const jobNoAccount: SchedulableJob = { ...job, accountId: null };
    const res = await triggerScheduledJob(ctx, jobNoAccount, {
      ...deps,
      getAccountStatus,
    });
    expect(getAccountStatus).not.toHaveBeenCalled();
    expect(deps._createTask).toHaveBeenCalledTimes(1);
    expect(res.skippedReason).toBeUndefined();
  });

  it("runNow 复用同 gate:归属号隐藏 → 跳过不产 run", async () => {
    const base = makeTriggerDeps([]);
    const getAccountStatus = vi.fn(async () => "archived");
    const getJob = vi.fn(async () => ({
      id: "job1",
      sourceKind: "self.metrics",
      target: {},
      accountId: "acct-9",
    }));
    const res = await runJobNow(ctx, "job1", {
      ...base,
      getAccountStatus,
      job: { getJob },
    });
    expect(res.skippedReason).toContain("archived");
    expect(base._createTask).not.toHaveBeenCalled();
    expect(base._dispatch).not.toHaveBeenCalled();
  });
});

describe("runJobNow(D5「立即运行」手动触发)", () => {
  it("查 job(ownership gate)→ triggerScheduledJob 产 task+run+dispatch(不碰真抖音)", async () => {
    const base = makeTriggerDeps([]);
    const getJob = vi.fn(async () => ({
      id: "job1",
      sourceKind: "self.metrics",
      target: { externalSourceId: "src1" },
    }));
    const res = await runJobNow(ctx, "job1", { ...base, job: { getJob } });

    // getJob 命中(ownership gate 经 service),再走 triggerScheduledJob 幂等双闸。
    expect(getJob).toHaveBeenCalledWith(ctx, "job1");
    expect(base._createTask).toHaveBeenCalledTimes(1);
    expect(base._createTask).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", accountId: null }),
      {
        taskType: "scheduled.self.metrics",
        attemptId: expect.stringMatching(/^scheduled-[a-f0-9]{32}$/),
        inputData: expect.objectContaining({ jobId: "job1" }),
      },
    );
    expect(base._createRun).toHaveBeenCalledTimes(1);
    // fire-and-forget:dispatch 收到带 jobRunId 的 task(runner 后台采集,不在此跑真抖音)。
    expect(base._dispatch).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ deduped: false, aiTaskId: "task1", jobRunId: "run1" });
  });

  it("同 job 当天已有 in-flight run → deduped=true,不重复产(复用 triggerScheduledJob 幂等)", async () => {
    const base = makeTriggerDeps([
      { id: "run-x", status: "running", startedAt: "2026-07-01T08:00:00.000Z", aiTaskId: "task-x" },
    ]);
    const getJob = vi.fn(async () => ({
      id: "job1",
      sourceKind: "self.metrics",
      target: {},
    }));
    const res = await runJobNow(ctx, "job1", { ...base, job: { getJob } });
    expect(res).toMatchObject({ deduped: true, jobRunId: "run-x" });
    expect(base._createTask).not.toHaveBeenCalled();
    expect(base._dispatch).not.toHaveBeenCalled();
  });

  it("getJob 越权/不存在抛错 → 传播(不静默产 run)", async () => {
    const base = makeTriggerDeps([]);
    const getJob = vi.fn(async () => {
      throw new Error("OwnershipError");
    });
    await expect(
      runJobNow(ctx, "foreign-job", { ...base, job: { getJob } }),
    ).rejects.toThrow("OwnershipError");
    expect(base._createTask).not.toHaveBeenCalled();
    expect(base._createRun).not.toHaveBeenCalled();
  });
});

describe("[T-332 S2 · GAP-08] scheduled_for 计划触发锚", () => {
  it("cron 到点触发(带 options.scheduledFor)→ createRun 写入该锚", async () => {
    const deps = makeTriggerDeps([]);
    await triggerScheduledJob(ctx, job, deps, {
      scheduledFor: "2026-07-01T09:00:00.000Z",
    });
    expect(deps._createRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        jobId: "job1",
        scheduledFor: "2026-07-01T09:00:00.000Z",
      }),
    );
  });

  it("「立即运行」(runJobNow,无 options)→ scheduledFor 为 null(即时动作无计划 tick,不受唯一约束)", async () => {
    const base = makeTriggerDeps([]);
    const getJob = vi.fn(async () => ({
      id: "job1",
      sourceKind: "self.metrics",
      target: {},
    }));
    await runJobNow(ctx, "job1", { ...base, job: { getJob } });
    expect(base._createRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scheduledFor: null }),
    );
  });

});

describe("dayKeyOf / cronMatchesMinute(手写 cron 匹配器)", () => {
  it("dayKeyOf:ISO → YYYY-MM-DD", () => {
    expect(dayKeyOf("2026-07-01T09:00:00.000Z")).toBe("2026-07-01");
  });

  it("* * * * * 永远匹配", () => {
    expect(cronMatchesMinute("* * * * *", new Date(2026, 6, 1, 3, 27))).toBe(true);
  });

  it("0 9 * * * 只匹配 9:00,不匹配 9:01 / 10:00", () => {
    expect(cronMatchesMinute("0 9 * * *", new Date(2026, 6, 1, 9, 0))).toBe(true);
    expect(cronMatchesMinute("0 9 * * *", new Date(2026, 6, 1, 9, 1))).toBe(false);
    expect(cronMatchesMinute("0 9 * * *", new Date(2026, 6, 1, 10, 0))).toBe(false);
  });

  it("*/15 * * * * 匹配 :00/:15/:30/:45,不匹配 :07", () => {
    expect(cronMatchesMinute("*/15 * * * *", new Date(2026, 6, 1, 3, 0))).toBe(true);
    expect(cronMatchesMinute("*/15 * * * *", new Date(2026, 6, 1, 3, 30))).toBe(true);
    expect(cronMatchesMinute("*/15 * * * *", new Date(2026, 6, 1, 3, 7))).toBe(false);
  });

  it("区间 + 列表:0 9-11 * * 1,3 时/星期匹配", () => {
    // 2026-07-01 是周三(dow=3)
    expect(cronMatchesMinute("0 9-11 * * 1,3", new Date(2026, 6, 1, 10, 0))).toBe(true);
    expect(cronMatchesMinute("0 9-11 * * 1,3", new Date(2026, 6, 1, 12, 0))).toBe(false); // 时超区间
    expect(cronMatchesMinute("0 9-11 * * 1,3", new Date(2026, 6, 2, 10, 0))).toBe(false); // 周四不在列表
  });

  it("非 5 段表达式 → 不匹配(安全)", () => {
    expect(cronMatchesMinute("bad", new Date())).toBe(false);
  });
});

describe("sweepStaleRuns(gate finding-3 启动扫超时)", () => {
  it("超时 running → 标 failed;未超时 → 留着", async () => {
    const updateRun = vi.fn(async () => ({}));
    const deps: SweepStaleDeps = {
      runs: {
        createRun: async () => ({ id: "" }),
        listRunsByJob: async () => ({ rows: [], total: 0 }),
        updateRun,
      },
      listRunningRuns: async () => [
        { id: "stale", startedAt: "2026-07-01T08:00:00.000Z" }, // 1h 前(>30min)
        { id: "fresh", startedAt: "2026-07-01T08:55:00.000Z" }, // 5min 前
      ],
      ctx,
      now: () => "2026-07-01T09:00:00.000Z",
    };
    const swept = await sweepStaleRuns(deps);
    expect(swept).toBe(1);
    expect(updateRun).toHaveBeenCalledTimes(1);
    expect(updateRun).toHaveBeenCalledWith(
      ctx,
      "stale",
      expect.objectContaining({
        status: "failed",
        finishedAt: "2026-07-01T09:00:00.000Z",
        // [T-616] 启动与运行期共用同一清扫语义。
        error: expect.stringContaining("stale-run"),
      }),
    );
  });

  it("[T-616] 运行期清扫保护仍有 active AI task 的长任务，只清终态/失联任务", async () => {
    const updateRun = vi.fn(async () => ({}));
    const isRunActive = vi.fn(async (_ctx, run: { aiTaskId?: string | null }) =>
      run.aiTaskId === "task-active"
    );
    const swept = await sweepStaleRuns({
      runs: {
        createRun: async () => ({ id: "" }),
        listRunsByJob: async () => ({ rows: [], total: 0 }),
        updateRun,
      },
      listRunningRuns: async () => [
        {
          id: "long-but-active",
          startedAt: "2026-07-01T08:00:00.000Z",
          aiTaskId: "task-active",
        },
        {
          id: "orphaned",
          startedAt: "2026-07-01T08:00:00.000Z",
          aiTaskId: "task-terminal",
        },
      ],
      isRunActive,
      ctx,
      now: () => "2026-07-01T09:00:00.000Z",
    });

    expect(swept).toBe(1);
    expect(updateRun).toHaveBeenCalledTimes(1);
    expect(updateRun).toHaveBeenCalledWith(
      ctx,
      "orphaned",
      expect.objectContaining({ status: "failed" }),
    );
  });
});

// [T-207] 启动 sweep 僵尸 ai_task:app 被杀后 ai_tasks 也会留 running 僵尸(真机逮到
// transcribe 挂 running 2.5h+),撞 createTask in-flight 幂等闸。默认阈值 2h,可注入覆盖。
// [T-389] 类型感知:进程内 runner 类型重启即死 → 启动扫到 running 立即判死(不看年龄);
// transcribe.douyin/agentic.*/未知类型保留年龄门。
describe("sweepStaleAiTasks(T-207 启动 sweep 僵尸 ai_task)", () => {
  const NOW = "2026-07-11T12:00:00.000Z";

  it("[T-522] system sweep 按每条任务的真实 accountId 写终态，不复用无号 daemon ctx", async () => {
    const markFailed = vi.fn(async () => undefined);
    await sweepStaleAiTasks({
      listRunningTasks: async () => [
        {
          id: "acct-a-task",
          accountId: "acct-a",
          taskType: "script.draft",
          startedAt: "2026-07-11T11:59:00.000Z",
        },
        {
          id: "acct-b-task",
          accountId: "acct-b",
          taskType: "script.draft",
          startedAt: "2026-07-11T11:59:00.000Z",
        },
      ],
      markFailed,
      ctx: { ...ctx, accountId: undefined },
      now: () => NOW,
    });
    expect(markFailed).toHaveBeenNthCalledWith(
      1,
      { ...ctx, accountId: "acct-a" },
      "acct-a-task",
      expect.stringContaining("应用重启导致任务中断"),
    );
    expect(markFailed).toHaveBeenNthCalledWith(
      2,
      { ...ctx, accountId: "acct-b" },
      "acct-b-task",
      expect.stringContaining("应用重启导致任务中断"),
    );
  });

  it("非进程内类型(transcribe)running 超 2h → markFailed(stale-on-boot);未超时/无时间锚 → 留着", async () => {
    const markFailed = vi.fn(async () => undefined);
    const swept = await sweepStaleAiTasks({
      listRunningTasks: async () => [
        // 3h 前(>2h)
        { id: "zombie", accountId: "acct-sweep", taskType: "transcribe.douyin", startedAt: "2026-07-11T09:00:00.000Z" },
        // 30min 前 —— worker+冷却重试是合法长活,年龄门放过
        { id: "fresh", accountId: "acct-sweep", taskType: "transcribe.douyin", startedAt: "2026-07-11T11:30:00.000Z" },
        // 无时间锚 → 不乱标
        { id: "no-anchor", accountId: "acct-sweep", taskType: "transcribe.douyin", startedAt: null },
      ],
      markFailed,
      ctx,
      now: () => NOW,
    });
    expect(swept).toBe(1);
    expect(markFailed).toHaveBeenCalledTimes(1);
    expect(markFailed).toHaveBeenCalledWith(
      { ...ctx, accountId: "acct-sweep" },
      "zombie",
      expect.stringContaining("stale-on-boot"),
    );
  });

  // [T-389] 核心:进程内 runner(planning.thesis/script.draft/cover.generate…)重启即死,
  // 启动扫到 running **立即判死**(哪怕才跑 1 分钟),原因是人话「应用重启导致任务中断」。
  it("[T-389] 进程内 runner 类型 running → 立即 markFailed(不看年龄);转录 <2h 放过", async () => {
    const markFailed = vi.fn(async () => undefined);
    const swept = await sweepStaleAiTasks({
      listRunningTasks: async () => [
        // 才 1 分钟前,但进程内 runner 重启即死 → 立即判死
        { id: "thesis", accountId: "acct-sweep", taskType: "planning.thesis", startedAt: "2026-07-11T11:59:00.000Z" },
        { id: "cover", accountId: "acct-sweep", taskType: "cover.generate", startedAt: "2026-07-11T11:59:00.000Z" },
        // scheduled.* 前缀整族也是进程内(dispatchScheduledCollection)
        { id: "sched", accountId: "acct-sweep", taskType: "scheduled.self.metrics", startedAt: "2026-07-11T11:59:00.000Z" },
        // execution live dispatch 同样随 app 进程退出，重启后不可能仍真实运行。
        { id: "render", accountId: "acct-sweep", taskType: "exec.video.render", startedAt: "2026-07-11T11:59:30.000Z" },
        // 进程内类型无时间锚也判死(启动扫语义:重启即死不需要锚)
        { id: "thesis-no-anchor", accountId: "acct-sweep", taskType: "script.draft", startedAt: null },
        // 转录 30min 前(<2h)→ 合法长活,放过
        { id: "transcribe-fresh", accountId: "acct-sweep", taskType: "transcribe.douyin", startedAt: "2026-07-11T11:30:00.000Z" },
        // agentic.* 走外部引擎 → 保留宽阈值,30min 前放过
        { id: "agentic-fresh", accountId: "acct-sweep", taskType: "agentic.research", startedAt: "2026-07-11T11:30:00.000Z" },
      ],
      markFailed,
      ctx,
      now: () => NOW,
    });
    expect(swept).toBe(5);
    for (const id of ["thesis", "cover", "sched", "render", "thesis-no-anchor"]) {
      expect(markFailed).toHaveBeenCalledWith(
        { ...ctx, accountId: "acct-sweep" },
        id,
        expect.stringContaining("应用重启导致任务中断"),
      );
    }
    expect(markFailed).not.toHaveBeenCalledWith({ ...ctx, accountId: "acct-sweep" }, "transcribe-fresh", expect.anything());
    expect(markFailed).not.toHaveBeenCalledWith({ ...ctx, accountId: "acct-sweep" }, "agentic-fresh", expect.anything());
  });

  // [T-389] 周期复扫(带 processStartedAt 锚):进程内类型只判上一进程遗留(startedAt 早于
  // 本进程启动),本进程内正在跑的活任务不误杀(落回年龄门)。
  it("[T-389] 周期复扫带 processStartedAt:本进程启动后开跑的进程内任务不误杀,遗留照判死", async () => {
    const markFailed = vi.fn(async () => undefined);
    const swept = await sweepStaleAiTasks({
      listRunningTasks: async () => [
        // 上一进程遗留(startedAt 早于本进程启动 11:00)→ 判死
        { id: "leftover", accountId: "acct-sweep", taskType: "planning.thesis", startedAt: "2026-07-11T10:00:00.000Z" },
        // 本进程内 5 分钟前开跑的活任务 → 不误杀(年龄门 <2h 放过)
        { id: "live", accountId: "acct-sweep", taskType: "cover.generate", startedAt: "2026-07-11T11:55:00.000Z" },
      ],
      markFailed,
      ctx,
      now: () => NOW,
      processStartedAt: "2026-07-11T11:00:00.000Z",
    });
    expect(swept).toBe(1);
    expect(markFailed).toHaveBeenCalledTimes(1);
    expect(markFailed).toHaveBeenCalledWith(
      { ...ctx, accountId: "acct-sweep" },
      "leftover",
      expect.stringContaining("应用重启导致任务中断"),
    );
  });

  it("阈值可注入(env 由 host 解析后传入):staleMs=10min 时 30min 前的也被扫", async () => {
    const markFailed = vi.fn(async () => undefined);
    const swept = await sweepStaleAiTasks({
      listRunningTasks: async () => [
        { id: "t1", accountId: "acct-sweep", taskType: "transcribe.douyin", startedAt: "2026-07-11T11:30:00.000Z" }, // 30min 前
      ],
      markFailed,
      ctx,
      now: () => NOW,
      staleMs: 10 * 60 * 1000,
    });
    expect(swept).toBe(1);
  });

  it("单条 markFailed 抛错不阻断其余(best-effort)", async () => {
    const markFailed = vi
      .fn(async (_c: typeof ctx, id: string) => {
        if (id === "boom") throw new Error("already terminal");
      })
      .mockName("markFailed");
    const swept = await sweepStaleAiTasks({
      listRunningTasks: async () => [
        { id: "boom", accountId: "acct-sweep", taskType: "transcribe.douyin", startedAt: "2026-07-11T08:00:00.000Z" },
        { id: "zombie2", accountId: "acct-sweep", taskType: "transcribe.douyin", startedAt: "2026-07-11T08:00:00.000Z" },
      ],
      markFailed,
      ctx,
      now: () => NOW,
    });
    expect(swept).toBe(1); // boom 失败不计,zombie2 照扫
    expect(markFailed).toHaveBeenCalledTimes(2);
  });
});

describe('T954 流量队列触发身份',()=>{
 it.each(['running','needs_reconnect'])('跨日复用%s原运行',async status=>{
  const deps=makeTriggerDeps([{id:'old',status,startedAt:'2026-06-30T09:00:00.000Z',aiTaskId:'old-task'}]);
  const result=await triggerScheduledJob(ctx,{...job,sourceKind:'self.traffic'},deps);
  expect(result).toMatchObject({jobRunId:'old',aiTaskId:'old-task',deduped:true});expect(deps._createTask).not.toHaveBeenCalled();
 });
 it('同一队列代次并发触发使用相同AI幂等身份，不受请求时间影响',async()=>{
  const rows=[{id:'completed-run',status:'succeeded',startedAt:'2026-06-30T09:00:00.000Z',aiTaskId:'old-task'}];
  const first=makeTriggerDeps(rows),second=makeTriggerDeps(rows);second.now=()=> '2026-07-02T12:00:00.000Z';
  await Promise.all([triggerScheduledJob(ctx,{...job,sourceKind:'self.traffic'},first),triggerScheduledJob(ctx,{...job,sourceKind:'self.traffic'},second)]);
  expect((first._createTask.mock.calls as unknown as Array<[unknown,{attemptId:string}]>)[0]![1].attemptId).toEqual((second._createTask.mock.calls as unknown as Array<[unknown,{attemptId:string}]>)[0]![1].attemptId);
 });
});

describe('T956 流量准备失败与拒绝传播',()=>{
 it('明确failed且未绑定的旧task不再被running run挡住',async()=>{
  const deps=makeTriggerDeps([{id:'old-run',status:'running',startedAt:'2026-06-30T00:00:00.000Z',aiTaskId:'old-task'}]);
  deps.getTaskState=async()=>({status:'failed'});
  const result=await triggerScheduledJob(ctx,{...job,sourceKind:'self.traffic'},deps);
  expect(result.deduped).toBe(false);expect(deps.runs.updateRun).toHaveBeenCalledWith({...ctx,accountId:null},'old-run',expect.objectContaining({status:'failed'}));
 });
 it('已绑定且paused的执行任务不自动另起任务',async()=>{
  const deps=makeTriggerDeps([{id:'old-run',status:'running',startedAt:'2026-06-30T00:00:00.000Z',aiTaskId:'old-task'}]);
  deps.getTaskState=async()=>({status:'failed',executionTaskId:'e',runtimeStatus:'paused'});
  const result=await triggerScheduledJob(ctx,{...job,sourceKind:'self.traffic'},deps);expect(result.deduped).toBe(true);expect(deps._createTask).not.toHaveBeenCalled();
 });
 it('completion立即消费拒绝，晚await仍得到原异常',async()=>{
  const deps=makeTriggerDeps();const failure=new Error('prepare failed');deps.dispatch=async()=>{throw failure;};
  const result=await triggerScheduledJob(ctx,{...job,sourceKind:'self.traffic'},deps);
  await new Promise(resolve=>setTimeout(resolve,5));await expect(result.completion).rejects.toBe(failure);
 });
 it('同步dispatch异常同样由completion返回',async()=>{
  const deps=makeTriggerDeps();const failure=new Error('sync prepare failed');deps.dispatch=()=>{throw failure;};
  const result=await triggerScheduledJob(ctx,job,deps);await expect(result.completion).rejects.toBe(failure);
 });
});
it('统一同步跨天等待登录复用原任务，不新建第二个producer',async()=>{
 const deps=makeTriggerDeps([{id:'old-run',aiTaskId:'old-task',status:'needs_reconnect',startedAt:'2026-06-30T00:00:00.000Z'}]);
 const result=await triggerScheduledJob(ctx,{...job,target:{operationsSync:{version:1}}},deps);expect(result).toMatchObject({jobRunId:'old-run',aiTaskId:'old-task',deduped:true});expect(deps._createTask).not.toHaveBeenCalled();
});

describe('T983 新拆分计划与旧合并执行隔离',()=>{
 const oldAnchor='2026-06-30T09:00:00.000Z',newAnchor='2026-07-01T09:00:00.000Z';
 const splitJob={...job,target:{collectionSplitVersion:1}};
 const oldRun={id:'combined-run',status:'running',startedAt:oldAnchor,aiTaskId:'combined-task'};
 const combinedInput={target:{operationsSync:{version:1}}};
 it.each(['paused','unknown_result','retry_wait'])('旧合并%s不阻止新的作品计划入队，保留旧执行',async runtimeStatus=>{
  const deps=makeTriggerDeps([oldRun]);
  deps.getTaskState=async()=>({status:'running',executionTaskId:'combined-execution',runtimeStatus,inputData:combinedInput});
  deps.getRunScheduledFor=vi.fn(async()=>oldAnchor);
  const result=await triggerScheduledJob(ctx,splitJob,deps,{scheduledFor:newAnchor});
  await result.completion;
  expect(result).toMatchObject({deduped:false,aiTaskId:'task1',jobRunId:'run1'});
  expect(deps._createTask).toHaveBeenCalledTimes(1);expect(deps._dispatch).toHaveBeenCalledTimes(1);
  expect(deps.runs.updateRun).not.toHaveBeenCalled();
  expect(deps.getRunScheduledFor).toHaveBeenCalledWith({...ctx,accountId:null},oldRun.id);
 });
 it.each(['running','failed'])('旧合并同计划重放保持原task，即使run投影为%s且前面有新split运行',async status=>{
  const deps=makeTriggerDeps([{id:'split-run',status:'running',startedAt:newAnchor,aiTaskId:'split-task'},{...oldRun,status}]);
  deps.getTaskState=async(_c,id)=>({status:'running',executionTaskId:`execution-${id}`,runtimeStatus:'paused',inputData:id==='combined-task'?combinedInput:{target:{collectionSplitVersion:1}}});
  deps.getRunScheduledFor=vi.fn(async()=>oldAnchor);
  const result=await triggerScheduledJob(ctx,splitJob,deps,{scheduledFor:oldAnchor});
  expect(result).toMatchObject({deduped:true,aiTaskId:'combined-task',jobRunId:'combined-run'});
  expect(deps._createTask).not.toHaveBeenCalled();expect(deps._dispatch).not.toHaveBeenCalled();
 });
 it('旧合并不同计划可跳过，新split自身仍保持inflight去重且无需逐行读计划',async()=>{
  const deps=makeTriggerDeps([oldRun,{id:'split-run',status:'running',startedAt:newAnchor,aiTaskId:'split-task'}]);
  deps.getTaskState=async(_c,id)=>({status:'running',executionTaskId:`execution-${id}`,runtimeStatus:'retry_wait',inputData:id==='combined-task'?combinedInput:{target:{collectionSplitVersion:1}}});
  deps.getRunScheduledFor=vi.fn(async()=>oldAnchor);
  const result=await triggerScheduledJob(ctx,splitJob,deps,{scheduledFor:newAnchor});
  expect(result).toMatchObject({deduped:true,aiTaskId:'split-task',jobRunId:'split-run'});expect(deps._createTask).not.toHaveBeenCalled();
  expect(deps.getRunScheduledFor).toHaveBeenCalledTimes(1);expect(deps.getRunScheduledFor).toHaveBeenCalledWith({...ctx,accountId:null},'combined-run');
 });
 it.each(['missing-port','missing-input','unversioned-split','manual-new','invalid-old-time'])('缺少明确迁移和计划证据时保留原去重：%s',async mode=>{
  const deps=makeTriggerDeps([oldRun]);
  deps.getTaskState=async()=>({status:'running',executionTaskId:'combined-execution',runtimeStatus:'paused',...(mode==='missing-input'?{}:{inputData:combinedInput})});
  if(mode!=='missing-port')deps.getRunScheduledFor=vi.fn(async()=>mode==='invalid-old-time'?'invalid':oldAnchor);
  const result=await triggerScheduledJob(ctx,mode==='unversioned-split'?job:splitJob,deps,mode==='manual-new'?undefined:{scheduledFor:newAnchor});
  expect(result).toMatchObject({deduped:true,aiTaskId:'combined-task'});expect(deps._createTask).not.toHaveBeenCalled();
  if(mode==='missing-input'||mode==='unversioned-split'||mode==='manual-new')expect(deps.getRunScheduledFor).not.toHaveBeenCalled();
 });
 it('旧手动合并任务的真实null计划与新cron计划不同',async()=>{
  const deps=makeTriggerDeps([oldRun]);deps.getTaskState=async()=>({status:'running',inputData:combinedInput});deps.getRunScheduledFor=async()=>null;
  const result=await triggerScheduledJob(ctx,splitJob,deps,{scheduledFor:newAnchor});expect(result.deduped).toBe(false);
 });
 it('新计划attempt继续按真实时间隔离，重复新计划稳定，旧同锚不会改名重提',async()=>{
  const old=makeTriggerDeps();await triggerScheduledJob(ctx,{...job,target:combinedInput.target},old,{scheduledFor:oldAnchor});
  const first=makeTriggerDeps([oldRun]),again=makeTriggerDeps([oldRun]);
  for(const deps of [first,again]){deps.getTaskState=async()=>({status:'running',inputData:combinedInput});deps.getRunScheduledFor=async()=>oldAnchor;await triggerScheduledJob(ctx,splitJob,deps,{scheduledFor:newAnchor});}
  const attempt=(deps:ReturnType<typeof makeTriggerDeps>)=>deps._createTask.mock.calls[0]![1].attemptId;
  expect(attempt(first)).toBe(attempt(again));expect(attempt(first)).not.toBe(attempt(old));
 });
 it('跨作业的旧合并检查不再有权跳过当前新计划',async()=>{
  const deps={...makeTriggerDeps(),hasActiveCombinedRun:vi.fn(async()=>true)};
  const result=await triggerScheduledJob(ctx,splitJob,deps,{scheduledFor:newAnchor});
  expect(result).toMatchObject({deduped:false,aiTaskId:'task1'});expect(deps.hasActiveCombinedRun).not.toHaveBeenCalled();
 });
});
