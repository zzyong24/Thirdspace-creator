import { describe, it, expect, vi } from "vitest";
import {
  triggerScheduledJob,
  runJobNow,
  dayKeyOf,
  cronMatchesMinute,
  sweepStaleRuns,
  // [T-207] 启动 sweep 僵尸 ai_task。
  sweepStaleAiTasks,
  // [T-326 ENG-H02] 环境守卫回归(next build 阶段不起 cron)。
  startScheduler,
  type SchedulerLoopDeps,
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
  it("首次触发:产 ai_task + job_run + dispatch,deduped=false", async () => {
    const deps = makeTriggerDeps([]);
    const res = await triggerScheduledJob(ctx, job, deps);

    expect(deps._createTask).toHaveBeenCalledTimes(1);
    // [T-200] ctx 现为派生的 collectionCtx(job 无号 + ctx 无号 → accountId: null)。
    expect(deps._createTask).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", requestId: "sched", accountId: null }),
      {
        taskType: "scheduled.self.metrics",
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

  it("昨天的 run 不算数(自然日锚)→ 今天仍会新产", async () => {
    const deps = makeTriggerDeps([
      { id: "run-yesterday", status: "running", startedAt: "2026-06-30T09:00:00.000Z", aiTaskId: "t0" },
    ]);
    const res = await triggerScheduledJob(ctx, job, deps);
    expect(res.deduped).toBe(false);
    expect(deps._createTask).toHaveBeenCalledTimes(1);
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

  it("tick:到点 job 的触发带「本 tick 分钟(秒/毫秒归零)」的 ISO 锚", async () => {
    const deps = makeTriggerDeps([]);
    const loopDeps: SchedulerLoopDeps = {
      ...deps,
      ctx,
      listRunnableJobs: async () => [
        // schedule 用 * * * * *(每分钟必到点)—— cronMatchesMinute 按本地时区解析,
        // 固定 时:分 的表达式在不同时区跑测试会假红。
        { ...job, schedule: "* * * * *", enabled: true },
      ],
    };
    // deps.now = 2026-07-01T09:00:00.000Z(整分)→ 锚 = 该分钟(秒/毫秒归零)的 ISO。
    const { tick } = await import("./scheduled-collection-scheduler");
    await tick(loopDeps, { validate: () => true });
    expect(deps._createRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scheduledFor: "2026-07-01T09:00:00.000Z" }),
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
        // [T-207] reason=stale-on-boot(启动 sweep 的诚实标注)。
        error: expect.stringContaining("stale-on-boot"),
      }),
    );
  });
});

// [T-207] 启动 sweep 僵尸 ai_task:app 被杀后 ai_tasks 也会留 running 僵尸(真机逮到
// transcribe 挂 running 2.5h+),撞 createTask in-flight 幂等闸。默认阈值 2h,可注入覆盖。
describe("sweepStaleAiTasks(T-207 启动 sweep 僵尸 ai_task)", () => {
  const NOW = "2026-07-11T12:00:00.000Z";

  it("running 超 2h → markFailed(stale-on-boot);未超时/无时间锚 → 留着", async () => {
    const markFailed = vi.fn(async () => undefined);
    const swept = await sweepStaleAiTasks({
      listRunningTasks: async () => [
        { id: "zombie", startedAt: "2026-07-11T09:00:00.000Z" }, // 3h 前(>2h)
        { id: "fresh", startedAt: "2026-07-11T11:30:00.000Z" }, // 30min 前
        { id: "no-anchor", startedAt: null }, // 无时间锚 → 不乱标
      ],
      markFailed,
      ctx,
      now: () => NOW,
    });
    expect(swept).toBe(1);
    expect(markFailed).toHaveBeenCalledTimes(1);
    expect(markFailed).toHaveBeenCalledWith(
      ctx,
      "zombie",
      expect.stringContaining("stale-on-boot"),
    );
  });

  it("阈值可注入(env 由 host 解析后传入):staleMs=10min 时 30min 前的也被扫", async () => {
    const markFailed = vi.fn(async () => undefined);
    const swept = await sweepStaleAiTasks({
      listRunningTasks: async () => [
        { id: "t1", startedAt: "2026-07-11T11:30:00.000Z" }, // 30min 前
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
        { id: "boom", startedAt: "2026-07-11T08:00:00.000Z" },
        { id: "zombie2", startedAt: "2026-07-11T08:00:00.000Z" },
      ],
      markFailed,
      ctx,
      now: () => NOW,
    });
    expect(swept).toBe(1); // boom 失败不计,zombie2 照扫
    expect(markFailed).toHaveBeenCalledTimes(2);
  });
});

describe("[T-326 ENG-H02] startScheduler 环境守卫", () => {
  // listRunnableJobs 一旦被调 = 守卫失守(cron 起来了)—— 用抛错的 stub 让失守必炸。
  const forbiddenDeps = {
    ...makeTriggerDeps(),
    ctx,
    listRunnableJobs: vi.fn(async () => {
      throw new Error("guard breached: scheduler tick ran");
    }),
  } as unknown as SchedulerLoopDeps;

  it("NEXT_PHASE=phase-production-build(next build 预渲染 worker)→ 直接返回,不置单例、不起 cron", async () => {
    // 依次压掉 test/VITEST/CI 三个先行守卫,单独验 build 阶段这条新分支。
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "");
    vi.stubEnv("CI", "");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    try {
      await startScheduler(forbiddenDeps);
      expect(globalThis.__creatorosSchedulerStarted).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("NODE_ENV=test(vitest 常态)→ 同样直接返回(既有守卫回归)", async () => {
    await startScheduler(forbiddenDeps);
    expect(globalThis.__creatorosSchedulerStarted).toBeUndefined();
  });
});
