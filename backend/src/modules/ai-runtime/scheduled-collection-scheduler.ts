import type { RequestContext } from "@creatoros/contract";

// 调度器(T-007 D3,SPEC 2026-06-30 §5)——node-cron 进程内轮询 + triggerScheduledJob。
//
// triggerScheduledJob(纯逻辑,可直接单测):一个 job 到点(或「立即运行」D5)→ 产一条
//   `ai_task`(taskType=`scheduled.<sourceKind>`,idempotencyKey=`jobId:自然日` 天然按天幂等)
//   + 一条 `job_run`(running, aiTaskId)→ 触发 dispatch(runScheduledCollection,确定性采集)。
//   **不直接跑采集**(fire-and-forget,即返;runner 在后台跑并回填 job_run)。
//
// 幂等(SPEC §5,不自造键,复用 createTask + job_run 双闸):
//   ① job_run 层:先查同 job 当天是否已有一条 in-flight(status=running)run —— 有则直接返回
//      既有,不重复产 task/run(自然日锚,防同天重复触发重复采)。
//   ② createTask 层:复用 `ai_tasks_user_idempotency`——同 idempotencyKey 的 in-flight task
//      命中返回既有(网络重试/双提交兜底)。
//
// 铁律:调度器只编排"产 task + 写 run + 触发 runner",**不碰死链 drainQueue/runTask**;真实
//   执行是注入的 dispatch → runScheduledCollection(确定性,不调 LLM,见 runner)。

/** 调度器需要的 AI 端口(createTask 产调度 task;host 绑 aiService)。 */
export interface SchedulerAiPort {
  createTask(
    ctx: RequestContext,
    body: { taskType: string; inputData?: Record<string, unknown> },
  ): Promise<{ id: string; status: string }>;
}

/** 调度器需要的 job_run 端口(host 绑 schedulingService)。 */
export interface SchedulerRunsPort {
  createRun(
    ctx: RequestContext,
    input: { jobId: string; aiTaskId?: string | null; status?: string },
  ): Promise<{ id: string }>;
  listRunsByJob(
    ctx: RequestContext,
    jobId: string,
    query: { limit: number; offset: number },
  ): Promise<{
    rows: { id: string; status: string; startedAt: string; aiTaskId: string | null }[];
    total: number;
  }>;
  updateRun(
    ctx: RequestContext,
    runId: string,
    patch: {
      status?: string;
      finishedAt?: string | null;
      error?: string | null;
    },
  ): Promise<unknown>;
}

/** job 的最小投影(triggerScheduledJob 只吃这些字段)。 */
export interface SchedulableJob {
  id: string;
  sourceKind: string; // self.metrics | comments
  target: Record<string, unknown>;
}

export interface TriggerDeps {
  ai: SchedulerAiPort;
  runs: SchedulerRunsPort;
  /** 触发一次确定性采集 runner(host 绑 dispatchScheduledCollection,内部 void runScheduledCollection)。
   *  注入而非 runner 直 import —— 触发点单一(dispatch 分支与调度器共用),且保持可测。 */
  dispatch: (
    ctx: RequestContext,
    task: {
      id: string;
      taskType: string;
      inputData: Record<string, unknown>;
    },
  ) => void;
  now: () => string;
}

export interface TriggerResult {
  /** 本次触发产的(或命中的既有)job_run id。 */
  jobRunId: string;
  /** 关联的 ai_task id。 */
  aiTaskId: string;
  /** 是否命中当天既有 in-flight run(幂等短路,未新产 task/run)。 */
  deduped: boolean;
}

/** ISO8601 时间戳 → 自然日键(YYYY-MM-DD,UTC 切分,与 capturedAt 幂等锚同口径)。 */
export function dayKeyOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * 触发一次调度采集(一个 job 到点 / 「立即运行」)。纯逻辑、无副作用外泄(所有 IO 经注入端口),
 * 可直接单测。幂等:同 (job, 自然日) 重复调只产一条 task + 一条 run(见文件头双闸)。
 */
export async function triggerScheduledJob(
  ctx: RequestContext,
  job: SchedulableJob,
  deps: TriggerDeps,
): Promise<TriggerResult> {
  const nowIso = deps.now();
  const today = dayKeyOf(nowIso);

  // 闸①(job_run 层):同 job 当天已有 in-flight run → 幂等短路,不重复产。
  const recent = await deps.runs.listRunsByJob(ctx, job.id, {
    limit: 20,
    offset: 0,
  });
  const inflight = recent.rows.find(
    (r) => r.status === "running" && dayKeyOf(r.startedAt) === today,
  );
  if (inflight) {
    return {
      jobRunId: inflight.id,
      aiTaskId: inflight.aiTaskId ?? "",
      deduped: true,
    };
  }

  const taskType = `scheduled.${job.sourceKind}`;
  const idempotencyKey = `${job.id}:${today}`;

  // 闸②(createTask 层):idempotencyKey 走 inputData,命中 in-flight task 返回既有
  //   (ai_tasks_user_idempotency,SPEC §5 复用既有幂等,不自造)。
  const task = await deps.ai.createTask(ctx, {
    taskType,
    inputData: {
      idempotencyKey,
      jobId: job.id,
      target: job.target,
    },
  });

  // 写 job_run(running, aiTaskId);再把 jobRunId 塞进 task.inputData 交 runner 回填。
  const run = await deps.runs.createRun(ctx, {
    jobId: job.id,
    aiTaskId: task.id,
    status: "running",
  });

  const dispatchInput = {
    id: task.id,
    taskType,
    inputData: {
      jobId: job.id,
      jobRunId: run.id,
      target: job.target,
    },
  };

  // 触发确定性采集 runner(fire-and-forget:即返,runner 后台跑并回填 job_run)。
  deps.dispatch(ctx, dispatchInput);

  return { jobRunId: run.id, aiTaskId: task.id, deduped: false };
}

/** 「立即运行」(D5)需要的 job 读端口(host 绑 schedulingService.getJob;requireJob ownership gate)。 */
export interface RunNowJobPort {
  getJob(
    ctx: RequestContext,
    jobId: string,
  ): Promise<{ id: string; sourceKind: string; target: Record<string, unknown> }>;
}

/**
 * 「立即运行」手动触发(D5,SPEC §5/§9)。绕过 cron:查 job(ownership gate)→ triggerScheduledJob
 * (同一条幂等双闸 + fire-and-forget,与调度器共用 deps)。返回触发结果 { jobRunId, aiTaskId, deduped }。
 * 纯逻辑(IO 经注入),可直接单测。触发编排单一——不自造触发,复用 triggerScheduledJob。
 */
export async function runJobNow(
  ctx: RequestContext,
  jobId: string,
  deps: TriggerDeps & { job: RunNowJobPort },
): Promise<TriggerResult> {
  const job = await deps.job.getJob(ctx, jobId); // requireJob ownership gate（越权 → 抛）
  return triggerScheduledJob(
    ctx,
    { id: job.id, sourceKind: job.sourceKind, target: job.target },
    deps,
  );
}

// ---------------------------------------------------------------------------
// node-cron 进程内调度 + 启动扫超时(host 在 persistence-client 初始化时装配)
// ---------------------------------------------------------------------------

/** 一个 enabled job 的调度投影(轮询到点用)。 */
export interface CronJob extends SchedulableJob {
  schedule: string; // cron 表达式
  enabled: boolean;
}

export interface SchedulerLoopDeps extends TriggerDeps {
  /** 列出该用户 enabled 且"最近一次 run 非 needs_reconnect"的 job(§6:登录态过期停跑)。
   *  host 绑 schedulingService.listJobs + 每 job 查最近 run 过滤。 */
  listRunnableJobs: (ctx: RequestContext) => Promise<CronJob[]>;
  /** 调度上下文(系统身份,canonical user);host 提供。 */
  ctx: RequestContext;
}

// singleton 守卫钉在 globalThis(与 persistence-client 的 pglite 单例同款,防 Next/Turbopack
// 多 entry 各起一个 cron)。
declare global {
  // eslint-disable-next-line no-var
  var __creatorosSchedulerStarted: boolean | undefined;
}

/**
 * 启动 node-cron 进程内调度:每分钟轮询 runnable job,cron 表达式到点则 triggerScheduledJob。
 * **测试/build 环境不启动**(NODE_ENV==='test' || VITEST || CI),单例守卫防重复启动。
 * node-cron 动态 import(纯逻辑 triggerScheduledJob 单测不依赖它)。
 */
export async function startScheduler(deps: SchedulerLoopDeps): Promise<void> {
  // 环境守卫:测试/CI 不启动(与 persistence-client localFsEnabled 的守卫同口径)。
  if (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST ||
    process.env.CI ||
    process.env.CREATOROS_DISABLE_SCHEDULER === "1"
  ) {
    return;
  }
  // 单例守卫:一个进程只起一个 cron。
  if (globalThis.__creatorosSchedulerStarted) return;
  globalThis.__creatorosSchedulerStarted = true;

  let cron: typeof import("node-cron");
  try {
    cron = await import("node-cron");
  } catch (e) {
    console.error("[scheduler] node-cron 未安装,调度器不启动:", e);
    globalThis.__creatorosSchedulerStarted = false;
    return;
  }

  // 每分钟轮询一次:取 runnable job,逐个用 node-cron 的匹配器判"当前分钟是否到点"。
  cron.schedule("* * * * *", () => {
    void tick(deps, cron).catch((e) =>
      console.error("[scheduler] tick 失败:", e),
    );
  });
  console.log("[scheduler] node-cron 进程内调度已启动(每分钟轮询)");
}

/** 一次轮询:runnable job 中 cron 到点的触发采集。导出供测试直接驱动(不起真 cron)。 */
export async function tick(
  deps: SchedulerLoopDeps,
  cron: Pick<typeof import("node-cron"), "validate">,
): Promise<void> {
  const jobs = await deps.listRunnableJobs(deps.ctx);
  const now = new Date(deps.now());
  for (const job of jobs) {
    if (!job.enabled) continue;
    if (!cron.validate(job.schedule)) continue;
    if (!cronMatchesMinute(job.schedule, now)) continue;
    try {
      await triggerScheduledJob(deps.ctx, job, deps);
    } catch (e) {
      console.error(`[scheduler] job ${job.id} 触发失败:`, e);
    }
  }
}

/**
 * 判一个 5 段 cron 表达式是否匹配给定分钟(minute hour dom month dow)。支持 `*`、逗号列表、
 * 步长(星号斜杠 n)、区间(a-b)。够覆盖"每天 HH:MM / 每小时 / 每 N 分钟"这类调度;不做秒级/L/#。
 */
export function cronMatchesMinute(expr: string, when: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hr, dom, mon, dow] = parts;
  if (
    min === undefined || hr === undefined || dom === undefined ||
    mon === undefined || dow === undefined
  )
    return false;
  const m = when.getMinutes();
  const h = when.getHours();
  const d = when.getDate();
  const mo = when.getMonth() + 1; // 1-12
  const wd = when.getDay(); // 0-6 (Sun=0)
  return (
    fieldMatches(min, m, 0, 59) &&
    fieldMatches(hr, h, 0, 23) &&
    fieldMatches(dom, d, 1, 31) &&
    fieldMatches(mon, mo, 1, 12) &&
    fieldMatches(dow, wd, 0, 6)
  );
}

function fieldMatches(field: string, value: number, lo: number, hi: number): boolean {
  for (const token of field.split(",")) {
    // */n
    const stepM = token.match(/^\*\/(\d+)$/);
    if (stepM) {
      const step = Number(stepM[1]);
      if (step > 0 && (value - lo) % step === 0) return true;
      continue;
    }
    if (token === "*") return true;
    // a-b
    const rangeM = token.match(/^(\d+)-(\d+)$/);
    if (rangeM) {
      const a = Number(rangeM[1]);
      const b = Number(rangeM[2]);
      if (value >= a && value <= b) return true;
      continue;
    }
    // 单值
    if (Number(token) === value) return true;
  }
  return false;
}

export interface SweepStaleDeps {
  runs: SchedulerRunsPort;
  /** 列出该用户所有 status='running' 的 job_run(host 绑 schedulingService;跨 job 扫)。 */
  listRunningRuns: (
    ctx: RequestContext,
  ) => Promise<{ id: string; startedAt: string }[]>;
  ctx: RequestContext;
  now: () => string;
  /** 超时阈值(毫秒;默认 30min)。started_at 早于 now-阈值 且仍 running → 标 failed。 */
  staleMs?: number;
}

/**
 * 启动扫超时(gate finding 3):进程重启后,上一进程留下的仍 `running` 且 started_at 超时
 * (>staleMs,默认 30min)的 job_run → 标 failed（+ finished_at + error），兜"进程崩在
 * running"的残留,保证 job_run 不永久悬挂。导出供 host 初始化时调 + 测试驱动。
 */
export async function sweepStaleRuns(deps: SweepStaleDeps): Promise<number> {
  const staleMs = deps.staleMs ?? 30 * 60 * 1000;
  const nowMs = new Date(deps.now()).getTime();
  const running = await deps.listRunningRuns(deps.ctx);
  let swept = 0;
  for (const run of running) {
    const startedMs = new Date(run.startedAt).getTime();
    if (!Number.isFinite(startedMs)) continue;
    if (nowMs - startedMs < staleMs) continue;
    await deps.runs.updateRun(deps.ctx, run.id, {
      status: "failed",
      finishedAt: deps.now(),
      error: "启动扫超时:进程重启前该 run 仍悬挂在 running,标记为 failed",
    });
    swept += 1;
  }
  return swept;
}
