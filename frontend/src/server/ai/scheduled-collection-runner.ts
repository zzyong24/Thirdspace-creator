import "server-only";
import type { RequestContext } from "@creatoros/contract";

// 调度采集 runner(T-007 D3,SPEC 2026-06-30 §3/§5/§6,已 re-gate PASS)。
//
// 定位:又一个 live dispatch runner —— 但**确定性、不调 LLM**。dispatch(persistence-client)
// 见 `scheduled.*` queued task → `void runScheduledCollection(...)`(仿 runAssetGenerate 的
// fire-and-forget 生命周期:markRunning → 跑 → 终态),区别是**不产候选、不过采纳门**:直接调
// 注入的 collector 抓真数据 → ingestion 落库 → 合成 step 写 ai_task_steps → task 终态 succeeded
// → 回填 job_run。**绝不碰死链 drainQueue/runTask/ai-worker orchestrator(见 SPEC 顶部🔧)。**
//
// 铁律:
//   ① 不 import fetchDouyinMetrics/ingestMetrics/fetchDouyinComments —— 全靠 deps.collectors
//      注入(host 在 persistence-client 里接真采集+落库;测试注 fake collector,零成本冒烟,
//      不碰真抖音、不起 Chromium)。故本 runner 可纯逻辑单测。
//   ② 不调任何 LLM/generateObject/runStructuredNode —— 采集是确定性重放,数值由采集器从 DOM/
//      XHR JSON 程序化抽取(SPEC §2 铁律①),模型绝不"看"数字。
//   ③ fire-and-forget 兜底(gate finding 3):try/catch/finally —— job_run 终态(succeeded/
//      failed/needs_reconnect)+ finished_at + items 回填一律在 **finally** 落,任何异常路径
//      (采集失败 / 落库后 crash)job_run 都不悬挂在 running。

/** 一次确定性采集的产出(采集器从真 XHR/DOM 抽值后落库返回的新鲜度统计)。 */
export interface CollectResult {
  itemsNew: number;
  itemsUpdated: number;
}

/** runner 需要的 AI 生命周期窄端口(host 绑 aiService;测试注 fake)。不产候选,故无
 *  recordCandidate —— 只 markRunning / recordStep / markSucceeded / markFailed。 */
export interface ScheduledCollectionAiPort {
  markRunning(ctx: RequestContext, taskId: string): Promise<void>;
  recordStep(
    ctx: RequestContext,
    taskId: string,
    input: { stepNo: number; kind: string; text: string; toolCalls: unknown[] },
  ): Promise<void>;
  markSucceeded(ctx: RequestContext, taskId: string): Promise<void>;
  markFailed(
    ctx: RequestContext,
    taskId: string,
    errorMessage?: string,
  ): Promise<void>;
}

/** runner 回填 job_run 的窄端口(host 绑 schedulingService.updateRun;测试注 fake)。 */
export interface ScheduledCollectionRunsPort {
  updateRun(
    ctx: RequestContext,
    runId: string,
    patch: {
      status?: string;
      itemsNew?: number;
      itemsUpdated?: number;
      error?: string | null;
      finishedAt?: string | null;
    },
  ): Promise<unknown>;
}

/** 一个源的确定性采集器:拿 target → 抓真数据 → ingestion 落库 → 返回新鲜度统计。
 *  host 为每个 sourceKind 装配一个(self.metrics=fetchDouyinMetrics+ingestMetrics /
 *  comments=fetchDouyinComments+ingestComments);测试注 fake(返回固定统计 / 抛异常)。 */
export type Collector = (
  ctx: RequestContext,
  target: Record<string, unknown>,
) => Promise<CollectResult>;

export interface ScheduledCollectionDeps {
  ai: ScheduledCollectionAiPort;
  runs: ScheduledCollectionRunsPort;
  /** keyed by sourceKind(`self.metrics` | `comments`);host 装配真采集器,测试注 fake。 */
  collectors: Record<string, Collector>;
  /** 判一个异常是否是"抖音未登录"(→ needs_reconnect,非普通失败)。host 绑
   *  `(e) => e instanceof DouyinNotLoggedInError`,让 runner 不 import douyin-cdp(保持可测)。 */
  isNotLoggedInError: (err: unknown) => boolean;
  now: () => string;
}

export interface ScheduledCollectionTask {
  id: string;
  taskType: string; // scheduled.self.metrics | scheduled.comments
  inputData: Record<string, unknown>; // { jobId, jobRunId, target }
}

const NEEDS_RECONNECT_ERROR =
  "需重连 Chrome:登录态过期,请在任务中心点「登录抖音」扫码";

/** taskType `scheduled.self.metrics` → sourceKind `self.metrics`。 */
function sourceKindOf(taskType: string): string {
  return taskType.startsWith("scheduled.")
    ? taskType.slice("scheduled.".length)
    : taskType;
}

const SOURCE_LABEL: Record<string, string> = {
  "self.metrics": "抖音主页作品",
  comments: "抖音评论",
};

/**
 * Orchestrate one scheduled collection task end to end —— 确定性、不调 LLM。
 *   markRunning → 调 collector 抓真数据+落库 → 合成 step 写 ai_task_steps → markSucceeded;
 *   任一异常坍缩到 catch:未登录 → job_run needs_reconnect(D4 接停跑/恢复,此处只正确置态);
 *   其它 → task markFailed + job_run failed。
 *   **finally(gate finding 3)**:job_run 终态 + finished_at + items 回填 —— 任何异常路径
 *   job_run 都不悬挂 running。
 */
export async function runScheduledCollection(
  ctx: RequestContext,
  task: ScheduledCollectionTask,
  deps: ScheduledCollectionDeps,
): Promise<void> {
  const jobRunId =
    typeof task.inputData.jobRunId === "string" ? task.inputData.jobRunId : "";
  const target =
    task.inputData.target && typeof task.inputData.target === "object"
      ? (task.inputData.target as Record<string, unknown>)
      : {};
  const sourceKind = sourceKindOf(task.taskType);
  const label = SOURCE_LABEL[sourceKind] ?? sourceKind;

  // finally 用它落 job_run 终态;三条路径各自赋值(默认 failed,防"忘记赋值"漏成功)。
  let runStatus: "succeeded" | "failed" | "needs_reconnect" = "failed";
  let runError: string | null = null;
  let itemsNew = 0;
  let itemsUpdated = 0;

  try {
    await deps.ai.markRunning(ctx, task.id); // honest status while 采集

    const collector = deps.collectors[sourceKind];
    if (!collector) {
      throw new Error(
        `scheduled-collection-runner: no collector for sourceKind "${sourceKind}"`,
      );
    }

    // 确定性采集(collector 内:抓真 XHR/DOM 抽值 → ingestion 落库 → 返回新鲜度统计)。
    // 绝不调 LLM —— 数值程序化抽取(SPEC §2 铁律①)。
    const result = await collector(ctx, target);
    itemsNew = result.itemsNew;
    itemsUpdated = result.itemsUpdated;

    // 合成 step 写 ai_task_steps(经现有 recordStep;任务中心运行详情复用窗口步骤日志渲染)。
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 1,
      kind: "collect",
      text: `采集${label} → 新增 ${itemsNew} 条,更新 ${itemsUpdated} 条`,
      toolCalls: [],
    });

    await deps.ai.markSucceeded(ctx, task.id);
    runStatus = "succeeded";
    runError = null;
  } catch (err) {
    if (deps.isNotLoggedInError(err)) {
      // 未登录 → 不当普通失败(§6):job_run 标 needs_reconnect + 提示文案。task 也置 failed
      // (一个诚实终态;D4 再接"停后续到点触发" + 「登录抖音」恢复,此处只正确置态)。
      runStatus = "needs_reconnect";
      runError = NEEDS_RECONNECT_ERROR;
      try {
        await deps.ai.markFailed(ctx, task.id, NEEDS_RECONNECT_ERROR);
      } catch {
        /* task may already be terminal */
      }
    } else {
      const message =
        err instanceof Error ? err.message : String(err ?? "unknown error");
      runStatus = "failed";
      runError = message;
      try {
        await deps.ai.markFailed(ctx, task.id, message);
      } catch {
        /* task may already be terminal */
      }
    }
    console.error(
      `[scheduled-collection-runner] collect failed for task ${task.id} (${task.taskType}):`,
      err,
    );
  } finally {
    // gate finding 3:job_run 终态 + finished_at + items 回填一律在 finally 落,任何异常路径
    // job_run 都不悬挂 running。jobRunId 缺失(异常输入)→ 跳过回填(无处可写),但 task 已在
    // try/catch 里落终态。best-effort:回填失败不再抛(否则 fire-and-forget 崩服务)。
    if (jobRunId) {
      try {
        await deps.runs.updateRun(ctx, jobRunId, {
          status: runStatus,
          itemsNew,
          itemsUpdated,
          error: runError,
          finishedAt: deps.now(),
        });
      } catch (e) {
        console.error(
          `[scheduled-collection-runner] job_run 回填失败 (run ${jobRunId}):`,
          e,
        );
      }
    }
  }
}
