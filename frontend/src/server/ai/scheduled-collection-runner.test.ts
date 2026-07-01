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
    // T-032b ②:error 走人话包装(前缀「采集{label}失败」+ 保留原始信息「boom」),不再是裸串
    const failedArg = (deps.ai.markFailed as ReturnType<typeof vi.fn>).mock
      .calls[0][2] as string;
    expect(failedArg).toContain("boom");
    expect(failedArg).toContain("采集抖音主页作品失败");
    // 关键:job_run 落终态 failed + finished_at,不悬挂在 running
    expect(deps.runs.updateRun).toHaveBeenCalledTimes(1);
    const patch = (deps.runs.updateRun as ReturnType<typeof vi.fn>).mock
      .calls[0][2];
    expect(patch.status).toBe("failed");
    expect(patch.error).toContain("boom");
    expect(patch.finishedAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("§6:未登录异常 → job_run 落 needs_reconnect(非普通 failed)+ error 含「设置 → 账户」扫码引导", async () => {
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
    // T-032b ②:人话引导(去「设置 → 账户」扫码),不留空/泛化
    expect(patch.error).toContain("设置 → 账户");
    expect(patch.error).toContain("扫码登录");
    expect(deps.ai.markFailed).toHaveBeenCalled(); // task 也落诚实终态
  });

  // T-032b 测 1:评论无登录 → runner 置 needs_reconnect(核查①的守卫,链路完好的确定性证明)。
  // fake comments collector 抛「未登录」(host 里就是 fetchDouyinComments 开头的 DouyinNotLoggedInError)。
  it("测1·评论无登录:comments collector 抛 DouyinNotLoggedInError → needs_reconnect + 扫码引导", async () => {
    class DouyinNotLoggedInError extends Error {
      constructor() {
        super("未检测到抖音创作者中心登录态,请先扫码登录");
        this.name = "DouyinNotLoggedInError";
      }
    }
    const deps = makeDeps({
      collectors: {
        comments: vi.fn(async () => {
          throw new DouyinNotLoggedInError();
        }),
      },
      isNotLoggedInError: (e) => e instanceof DouyinNotLoggedInError,
    });
    await runScheduledCollection(
      ctx,
      { ...baseTask, taskType: "scheduled.comments" },
      deps,
    );
    const patch = (deps.runs.updateRun as ReturnType<typeof vi.fn>).mock
      .calls[0][2];
    expect(patch.status).toBe("needs_reconnect");
    expect(patch.error).toContain("设置 → 账户");
    // 关键:未登录不是普通 failed,itemsNew 保持 0(没抓到任何东西)
    expect(patch.itemsNew).toBe(0);
  });

  // T-032b 测 2:评论已登录但 0 条 → succeeded itemsNew=0(**不是 needs_reconnect**,防误报「需重连」)。
  // 红线:作品本就可能 0 评论,绝不能因「抓到 0 条」就当未登录。
  it("测2·评论已登录 0 条:comments collector 返 {itemsNew:0}(不抛)→ succeeded itemsNew=0(非 needs_reconnect)", async () => {
    const deps = makeDeps({
      collectors: {
        comments: vi.fn(async () => ({ itemsNew: 0, itemsUpdated: 0 })),
      },
      // 关键:isNotLoggedInError 永远 false(collector 没抛,已登录)
      isNotLoggedInError: () => false,
    });
    await runScheduledCollection(
      ctx,
      { ...baseTask, taskType: "scheduled.comments" },
      deps,
    );
    const patch = (deps.runs.updateRun as ReturnType<typeof vi.fn>).mock
      .calls[0][2];
    expect(patch.status).toBe("succeeded"); // 不是 needs_reconnect!
    expect(patch.itemsNew).toBe(0);
    expect(deps.ai.markSucceeded).toHaveBeenCalled();
    expect(deps.ai.markFailed).not.toHaveBeenCalled();
  });

  // T-032b 测 3(runner 侧):普通失败(取音频/网络)→ error 是人话,不塞裸 stack。
  it("测3·普通失败人话:网络超时 → error 归类为「网络或页面加载超时」并保留原始信息", async () => {
    const deps = makeDeps({
      collectors: {
        comments: vi.fn(async () => {
          throw new Error("net::ERR_CONNECTION_TIMED_OUT at goto");
        }),
      },
      isNotLoggedInError: () => false,
    });
    await runScheduledCollection(
      ctx,
      { ...baseTask, taskType: "scheduled.comments" },
      deps,
    );
    const patch = (deps.runs.updateRun as ReturnType<typeof vi.fn>).mock
      .calls[0][2];
    expect(patch.status).toBe("failed");
    expect(patch.error).toContain("网络或页面加载超时");
    expect(patch.error).toContain("抖音评论"); // 源标签
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

  it("self.detail 源(T-030-D8a):taskType 路由到明细采集 collector,fake fetch+parse→ingest 被调", async () => {
    // fake detail collector 模拟 fetchDouyinWorkListExport→parseDouyinWorkListXlsx→ingest 被调
    // (返回真写入统计);测试只关心 runner 按 taskType 把明细路由到它,不碰真下载/解析。
    const detailCollector = vi.fn(async () => ({ itemsNew: 7, itemsUpdated: 0 }));
    const deps = makeDeps({
      collectors: { "self.detail": detailCollector },
    });
    await runScheduledCollection(
      ctx,
      {
        ...baseTask,
        taskType: "scheduled.self.detail",
        inputData: {
          jobId: "job1",
          jobRunId: "run1",
          target: { externalSourceId: "src1" },
        },
      },
      deps,
    );
    // 明细 collector 被调(带 target);其它 collector 不被调
    expect(detailCollector).toHaveBeenCalledTimes(1);
    expect(detailCollector).toHaveBeenCalledWith(ctx, { externalSourceId: "src1" });
    // 合成 step 文案含明细源标签 + 新增条数
    const stepArg = (deps.ai.recordStep as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(stepArg.text).toContain("抖音作品明细数据");
    expect(stepArg.text).toContain("7");
    // job_run 回填 succeeded + itemsNew=7
    expect(deps.ai.markSucceeded).toHaveBeenCalledWith(ctx, "task1");
    expect(deps.runs.updateRun).toHaveBeenCalledWith(
      ctx,
      "run1",
      expect.objectContaining({ status: "succeeded", itemsNew: 7 }),
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
