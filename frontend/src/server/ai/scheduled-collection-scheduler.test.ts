import { describe, it, expect, vi } from "vitest";
import {
  triggerScheduledJob,
  runJobNow,
  dayKeyOf,
  cronMatchesMinute,
  sweepStaleRuns,
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
    expect(deps._createTask).toHaveBeenCalledWith(ctx, {
      taskType: "scheduled.self.metrics",
      inputData: expect.objectContaining({
        idempotencyKey: "job1:2026-07-01", // jobId:自然日
        jobId: "job1",
      }),
    });
    expect(deps._createRun).toHaveBeenCalledTimes(1);
    // dispatch 收到带 jobRunId 的 task(交 runner 回填)
    expect(deps._dispatch).toHaveBeenCalledTimes(1);
    expect(deps._dispatch.mock.calls[0][1].inputData).toMatchObject({
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

  it("昨天的 run 不算数(自然日锚)→ 今天仍会新产", async () => {
    const deps = makeTriggerDeps([
      { id: "run-yesterday", status: "running", startedAt: "2026-06-30T09:00:00.000Z", aiTaskId: "t0" },
    ]);
    const res = await triggerScheduledJob(ctx, job, deps);
    expect(res.deduped).toBe(false);
    expect(deps._createTask).toHaveBeenCalledTimes(1);
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
    expect(base._createTask).toHaveBeenCalledWith(ctx, {
      taskType: "scheduled.self.metrics",
      inputData: expect.objectContaining({ jobId: "job1" }),
    });
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
      expect.objectContaining({ status: "failed", finishedAt: "2026-07-01T09:00:00.000Z" }),
    );
  });
});
