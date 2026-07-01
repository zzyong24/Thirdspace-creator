import { describe, it, expect, vi } from "vitest";
import {
  runScheduledCollection,
  type ScheduledCollectionDeps,
  type ScheduledCollectionTask,
} from "./scheduled-collection-runner";
import type { RequestContext } from "@creatoros/contract";

// T-007 D3 确定性冒烟(补 D3 子代理死于提交前没写的核心验证)。
// runner 的窄端口全注入 → 零成本纯测:不碰真抖音、不起 Chromium、**不调任何 LLM**。
// 覆盖 SPEC §10 + gate finding 3 要求的断言:
//   (a) 不调 LLM(结构保证:runner 只 import RequestContext type,无 LLM import;
//       且唯一数据路径是注入的 collector) (b) 终态 succeeded (c) 合成 step 写 ai_task_steps
//   (d) job_run 回填 items + finished_at ·· finding-3:异常路径 job_run 不悬挂 running。

const ctx: RequestContext = {
  userId: "u1",
  requestId: "test",
  source: "ingestion",
};

function makeDeps(
  overrides: Partial<ScheduledCollectionDeps> = {},
): ScheduledCollectionDeps {
  return {
    ai: {
      markRunning: vi.fn(async () => {}),
      recordStep: vi.fn(async () => {}),
      markSucceeded: vi.fn(async () => {}),
      markFailed: vi.fn(async () => {}),
    },
    runs: { updateRun: vi.fn(async () => ({})) },
    // fake collector:返回固定新鲜度统计,不碰真抖音。
    collectors: {
      "self.metrics": vi.fn(async () => ({ itemsNew: 3, itemsUpdated: 1 })),
    },
    isNotLoggedInError: () => false,
    now: () => "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const baseTask: ScheduledCollectionTask = {
  id: "task1",
  taskType: "scheduled.self.metrics",
  inputData: { jobId: "job1", jobRunId: "run1", target: { externalSourceId: "src1" } },
};

describe("runScheduledCollection(确定性采集 runner)", () => {
  it("成功路径:collector 抓数 → step → succeeded → 回填 job_run(items + finished_at)", async () => {
    const deps = makeDeps();
    await runScheduledCollection(ctx, baseTask, deps);

    // (a) 唯一数据路径是注入的 collector(结构上不可能调 LLM);带 target 调用
    expect(deps.collectors["self.metrics"]).toHaveBeenCalledTimes(1);
    expect(deps.collectors["self.metrics"]).toHaveBeenCalledWith(ctx, {
      externalSourceId: "src1",
    });

    // markRunning → recordStep(合成 step,文案含新增条数)→ markSucceeded
    expect(deps.ai.markRunning).toHaveBeenCalledWith(ctx, "task1");
    expect(deps.ai.recordStep).toHaveBeenCalledTimes(1);
    const stepArg = (deps.ai.recordStep as ReturnType<typeof vi.fn>).mock
      .calls[0][2];
    expect(stepArg).toMatchObject({ stepNo: 1, kind: "collect" });
    expect(stepArg.text).toContain("3"); // 新增 3 条
    // (b) 终态 succeeded
    expect(deps.ai.markSucceeded).toHaveBeenCalledWith(ctx, "task1");
    expect(deps.ai.markFailed).not.toHaveBeenCalled();

    // (d) job_run 回填:succeeded + items + finished_at
    expect(deps.runs.updateRun).toHaveBeenCalledTimes(1);
    expect(deps.runs.updateRun).toHaveBeenCalledWith(ctx, "run1", {
      status: "succeeded",
      itemsNew: 3,
      itemsUpdated: 1,
      error: null,
      finishedAt: "2026-07-01T00:00:00.000Z",
    });
  });

  it("finding-3:collector 抛普通异常 → job_run 落 failed(不悬挂 running)+ task markFailed", async () => {
    const deps = makeDeps({
      collectors: {
        "self.metrics": vi.fn(async () => {
          throw new Error("boom");
        }),
      },
    });
    await runScheduledCollection(ctx, baseTask, deps);

    expect(deps.ai.markSucceeded).not.toHaveBeenCalled();
    expect(deps.ai.markFailed).toHaveBeenCalledWith(ctx, "task1", "boom");
    // 关键:job_run 落终态 failed + finished_at,不悬挂在 running
    expect(deps.runs.updateRun).toHaveBeenCalledTimes(1);
    const patch = (deps.runs.updateRun as ReturnType<typeof vi.fn>).mock
      .calls[0][2];
    expect(patch.status).toBe("failed");
    expect(patch.error).toBe("boom");
    expect(patch.finishedAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("§6:未登录异常 → job_run 落 needs_reconnect(非普通 failed)", async () => {
    class NotLoggedIn extends Error {}
    const deps = makeDeps({
      collectors: {
        "self.metrics": vi.fn(async () => {
          throw new NotLoggedIn("no session");
        }),
      },
      isNotLoggedInError: (e) => e instanceof NotLoggedIn,
    });
    await runScheduledCollection(ctx, baseTask, deps);

    const patch = (deps.runs.updateRun as ReturnType<typeof vi.fn>).mock
      .calls[0][2];
    expect(patch.status).toBe("needs_reconnect");
    expect(patch.error).toContain("需重连 Chrome");
    expect(deps.ai.markFailed).toHaveBeenCalled(); // task 也落诚实终态
  });

  it("comments 源:按 taskType 选对 collector", async () => {
    const commentsCollector = vi.fn(async () => ({ itemsNew: 5, itemsUpdated: 0 }));
    const deps = makeDeps({
      collectors: { comments: commentsCollector },
    });
    await runScheduledCollection(
      ctx,
      { ...baseTask, taskType: "scheduled.comments" },
      deps,
    );
    expect(commentsCollector).toHaveBeenCalledTimes(1);
    expect(deps.runs.updateRun).toHaveBeenCalledWith(
      ctx,
      "run1",
      expect.objectContaining({ status: "succeeded", itemsNew: 5 }),
    );
  });

  it("未知 sourceKind(无 collector)→ 落 failed,不崩服务(finding-3 兜住)", async () => {
    const deps = makeDeps({ collectors: {} });
    await expect(
      runScheduledCollection(ctx, baseTask, deps),
    ).resolves.toBeUndefined();
    const patch = (deps.runs.updateRun as ReturnType<typeof vi.fn>).mock
      .calls[0][2];
    expect(patch.status).toBe("failed");
  });

  it("缺 jobRunId(异常输入)→ 不回填 job_run(无处可写)但不抛", async () => {
    const deps = makeDeps();
    await expect(
      runScheduledCollection(
        ctx,
        { ...baseTask, inputData: { jobId: "job1", target: {} } },
        deps,
      ),
    ).resolves.toBeUndefined();
    expect(deps.runs.updateRun).not.toHaveBeenCalled();
    // task 仍走完成功路径
    expect(deps.ai.markSucceeded).toHaveBeenCalled();
  });
});
