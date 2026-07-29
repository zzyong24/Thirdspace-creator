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
  // [T-332 S2 · GAP-08] scheduledFor:cron 到点触发时传计划 tick 的分钟 ISO(写 job_run.
  //   scheduled_for,激活 (job_id, scheduled_for) 部分唯一约束);「立即运行」/绑定初始化不传。
  createRun(
    ctx: RequestContext,
    input: {
      jobId: string;
      aiTaskId?: string | null;
      status?: string;
      scheduledFor?: string | null;
    },
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
  // [T-200] job 的属主号(建 job 时 stamp)。触发时采集 runtime ctx.accountId 由此派生,使
  //   cron 系统 ctx(无 accountId)的采集也落正确号(串号根因修复)。null/缺省 → 退化用 ctx.accountId。
  accountId?: string | null;
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
  ) => void | Promise<void>;
  now: () => string;
  // [T-201d] 可选:查一个账号的 status（隐藏号定时任务停跑 gate）。返回该号 status；
  //   号不存在 / 越权 / 查失败 → null（组合根用 .catch(()=>null) 兜底）。**未绑此端口 → 不查、保持原行为跑**
  //   （诚实降级：绝不因查号失败而误停已在跑的采集）。见 triggerScheduledJob 的 gate。
  getAccountStatus?: (
    ctx: RequestContext,
    accountId: string,
  ) => Promise<string | null>;
}

export interface TriggerResult {
  /** 本次触发产的(或命中的既有)job_run id。 */
  jobRunId: string;
  /** 关联的 ai_task id。 */
  aiTaskId: string;
  /** 是否命中当天既有 in-flight run(幂等短路,未新产 task/run)。 */
  deduped: boolean;
  /** [T-201d] 若因归属号非 active(隐藏/archived)而跳过不跑 → 填跳过原因(诚实标注);
   *  正常触发 / 幂等短路时缺省。跳过时 jobRunId/aiTaskId 为空串(不产 run,故无 id)。 */
  skippedReason?: string;
  /** 新持久 driver 会 await 它后再结束 execution task；旧 runNow 可继续忽略并立即返回。 */
  completion?: Promise<void>;
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
  // [T-332 S2 · GAP-08] options.scheduledFor:cron 到点触发传该 tick 的分钟 ISO(写入
  //   job_run.scheduled_for,让 (job_id, scheduled_for) 部分唯一约束真生效,根治「先查再建」
  //   竞态重复触发);「立即运行」(runJobNow)与绑定初始化触发不带锚(即时动作,无计划 tick)。
  options?: { scheduledFor?: string; skipHeavyBackfill?: boolean },
): Promise<TriggerResult> {
  const nowIso = deps.now();
  const today = dayKeyOf(nowIso);

  // [T-200 → T-332 S2] 采集 runtime ctx:userId 保持调用方(cron=canonical / bind/runNow=请求
  //   user,均正确),accountId 由 job.account_id 派生(ISO-06)—— cron 系统 ctx 无 accountId,
  //   不派生就无号。S1 后 scheduled_job.account_id NOT NULL,job 恒有号;ctx.accountId 兜底分支
  //   仅为投影类型宽松(SchedulableJob.accountId 可缺省)保留。task/run/dispatch 全用这个 ctx,
  //   使 ai_task + 下游采集落库 stamp 正确 account_id(strict 门下无号写会被 service 断言拒绝)。
  const collectionCtx: RequestContext = {
    ...ctx,
    accountId: job.accountId ?? ctx.accountId ?? null,
  };

  // [T-201d] 隐藏号定时任务停跑 gate:job 有归属号 + 端口已绑 → 查该号 status;非 active
  //   (archived/隐藏等)→ 跳过不跑(不产 task/run/dispatch),诚实 log + 返回 skippedReason。
  //   恢复 active 后照常跑(每次触发都查,无需额外恢复代码)。
  //   诚实降级:status 为 null(号不存在/越权/查失败,组合根 .catch(()=>null))或端口未绑 →
  //   保持原行为跑(绝不因查号失败而误停在跑的采集)。gate 落在触发单点 → cron 与手动 runNow 同源生效。
  if (job.accountId && deps.getAccountStatus) {
    let status: string | null = null;
    try {
      status = await deps.getAccountStatus(collectionCtx, job.accountId);
    } catch {
      status = null; // 查失败 → 降级放行(不误停)
    }
    if (status !== null && status !== "active") {
      const skippedReason = `账号 ${job.accountId} status=${status}(非 active,已隐藏/归档)→ 定时采集跳过`;
      console.log(`[scheduler] job ${job.id} 跳过:${skippedReason}`);
      return { jobRunId: "", aiTaskId: "", deduped: false, skippedReason };
    }
  }

  // 闸①(job_run 层):同 job 当天已有 in-flight run → 幂等短路,不重复产。
  const recent = await deps.runs.listRunsByJob(collectionCtx, job.id, {
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
  //   (ai_tasks_user_idempotency,SPEC §5 复用既有幂等,不自造)。ctx 带派生号 → ai_task 落正确号。
  const task = await deps.ai.createTask(collectionCtx, {
    taskType,
    inputData: {
      idempotencyKey,
      jobId: job.id,
      target: job.target,
    },
  });

  // 写 job_run(running, aiTaskId);再把 jobRunId 塞进 task.inputData 交 runner 回填。
  // [GAP-08] cron 到点触发带 scheduledFor 锚(部分唯一约束兜竞态);即时触发不带。
  const run = await deps.runs.createRun(collectionCtx, {
    jobId: job.id,
    aiTaskId: task.id,
    status: "running",
    scheduledFor: options?.scheduledFor ?? null,
  });

  const dispatchInput = {
    id: task.id,
    taskType,
    inputData: {
      jobId: job.id,
      jobRunId: run.id,
      // [T-433 S1] 绑号轻触发:self.detail 从绑号初始化跑时带 __skipHeavyBackfill —— runner 尾
      //   跳过逐条重活(封面/逐字稿/重建),避免多账号绑号把重活堆进 gate-F5 超长串行队列;
      //   重活留次日 daily self.detail(不带此标)到点补(现有增量幂等,不漏)。
      target: options?.skipHeavyBackfill
        ? { ...job.target, __skipHeavyBackfill: true }
        : job.target,
    },
  };

  // 触发确定性采集 runner(fire-and-forget:即返,runner 后台跑并回填 job_run)。
  //   collectionCtx 带派生号 → runner → collectors → ingestion 落库全 stamp 正确 account_id。
  const completion = Promise.resolve(deps.dispatch(collectionCtx, dispatchInput));

  return {
    jobRunId: run.id,
    aiTaskId: task.id,
    deduped: false,
    completion,
  };
}

/** 「立即运行」(D5)需要的 job 读端口(host 绑 schedulingService.getJob;requireJob ownership gate)。 */
export interface RunNowJobPort {
  getJob(
    ctx: RequestContext,
    jobId: string,
  ): Promise<{
    id: string;
    sourceKind: string;
    target: Record<string, unknown>;
    accountId?: string | null; // [T-200] 触发采集 ctx 由此派生
  }>;
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
    {
      id: job.id,
      sourceKind: job.sourceKind,
      target: job.target,
      accountId: job.accountId ?? null,
    },
    deps,
  );
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
  /** 超时阈值(毫秒;默认 30min)。started_at 早于 now-阈值 且仍 running → 标 failed。
   *  [T-207] host 可从 env(CREATOROS_STALE_JOB_RUN_MS)注入覆盖默认。 */
  staleMs?: number;
}

/**
 * 启动扫超时(gate finding 3 / T-207):进程重启后,上一进程留下的仍 `running` 且 started_at
 * 超时(>staleMs,默认 30min)的 job_run → 标 failed(+ finished_at + error,reason=
 * stale-on-boot),兜"进程崩在 running"的残留 —— 僵尸 run 会撞 triggerScheduledJob 的当天
 * in-flight 幂等闸,把「立即运行/到点采集」全 dedup 挡住(真机 T-207 逮到)。
 * 导出供 host 初始化时调(fire-and-forget,不阻断启动)+ 测试驱动。
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
      error:
        "启动扫超时(stale-on-boot):进程重启前该 run 仍悬挂在 running,标记为 failed",
    });
    swept += 1;
  }
  return swept;
}

// ---------------------------------------------------------------------------
// [T-207] 启动 sweep 僵尸 ai_task —— 与 sweepStaleRuns 同族的第二把扫帚。
// 真机实锤:app 被杀后除 job_run 外,ai_tasks 表也会留 running 僵尸(如 transcribe 挂
// running 2.5h+),同样撞 createTask 的 in-flight 幂等闸(queued/running 命中返回既有)
// 把后续同键任务挡住。启动时把「running 超过合理时长」的 task 标 failed(fire-and-forget)。
// ---------------------------------------------------------------------------

// [T-389] 进程内 runner 的 taskType 全集 —— 从 persistence-client dispatch 分支枚举(凡
// `void runXxx(...)` live dispatch 的都在此):这些 runner 跑在 app 进程内,进程重启即死,
// 表里残留的 running 是确定僵尸 → 启动扫到**直接判死,不看年龄**。
// 不在此集的保留宽阈值(2h):transcribe.douyin(worker+限流冷却重试是合法长活)、
// agentic.*(走 Pi 外部引擎自主循环)、未知类型(诚实保守,不乱标)。
const IN_PROCESS_RUNNER_TASK_TYPES: ReadonlySet<string> = new Set([
  "research.gather_material",
  "topic.generate",
  "topic.enrich",
  "calibration.diagnose",
  "calibration.score",
  "script.draft",
  "planning.thesis",
  "planning.contract",
  "planning.outline",
  "review.analyze",
  "script.review",
  "publish.platform_adapt",
  "material.match",
  "video.decisions",
  "positioning.generate",
  "asset.generate",
  "cover.generate",
  "asset.classify",
  "material.extract",
  "reconstruct.project",
]);

/** [T-389] 该 taskType 是否进程内 runner(重启即死)。`scheduled.*` 前缀整族算进程内
 *  (dispatchScheduledCollection 确定性采集也跑在 app 进程内)。 */
export function isInProcessRunnerTaskType(taskType: string): boolean {
  return (
    IN_PROCESS_RUNNER_TASK_TYPES.has(taskType) ||
    taskType.startsWith("scheduled.")
  );
}

export interface SweepStaleAiTasksDeps {
  /** 列出该用户当前 status='running' 的 ai_task 投影(host 绑 aiService.listTasks 过滤;
   *  startedAt 缺失时 host 用 requestedAt 兜底填入;[T-389] 带 taskType 做类型感知)。 */
  listRunningTasks: (
    ctx: RequestContext,
  ) => Promise<
    {
      id: string;
      accountId: string;
      taskType: string;
      startedAt: string | null;
    }[]
  >;
  /** 标 failed(host 绑 aiService.markFailed;no-op-safe,已终态吞冲突)。 */
  markFailed: (
    ctx: RequestContext,
    taskId: string,
    errorMessage: string,
  ) => Promise<void>;
  ctx: RequestContext;
  now: () => string;
  /** 超时阈值(毫秒;默认 2h —— ai_task 里有合法长活如转录+限流冷却延迟重试,阈值比
   *  job_run 宽)。host 可从 env(CREATOROS_STALE_AI_TASK_MS)注入覆盖。 */
  staleMs?: number;
  /** [T-389] 本进程启动时刻(ISO)。**不传 = 启动扫语义**:进程内 runner 类型扫到 running
   *  一律立即判死。传了 = 周期复扫语义:进程内类型仅当 startedAt 早于此锚(= 上一进程遗留)
   *  才立即判死 —— 本进程内正在跑的活任务不误杀,落回年龄门兜底。 */
  processStartedAt?: string;
}

/**
 * [T-207] 启动 sweep 僵尸 ai_task,[T-389] 类型感知:
 * - **进程内 runner 类型**(isInProcessRunnerTaskType):扫到 running 直接 markFailed
 *   (人话原因「应用重启导致任务中断,请重试」),**不看年龄** —— runner 跑在 app 进程内,
 *   本次(重)启动还能扫到 running 就是确定僵尸,没有"还在跑"的可能。
 * - 其余类型(transcribe.douyin / agentic.* / 未知):保留年龄门 —— running 且 started_at
 *   (缺失退 requestedAt,由 host 兜底)早于 now-staleMs(默认 2h)→ markFailed
 *   (reason=stale-on-boot)。startedAt 解析不出 → 跳过(诚实不乱标)。
 * 单条失败不阻断其余(best-effort,记日志继续)。返回扫掉的条数。
 */
export async function sweepStaleAiTasks(
  deps: SweepStaleAiTasksDeps,
): Promise<number> {
  const staleMs = deps.staleMs ?? 2 * 60 * 60 * 1000;
  const nowMs = new Date(deps.now()).getTime();
  const running = await deps.listRunningTasks(deps.ctx);
  let swept = 0;
  const processStartMs = deps.processStartedAt
    ? new Date(deps.processStartedAt).getTime()
    : null;
  for (const t of running) {
    let reason: string | null = null;
    if (isInProcessRunnerTaskType(t.taskType)) {
      // [T-389] 进程内 runner:重启即死。启动扫(无 processStartedAt 锚)→ 立即判死,
      // 不看年龄、不要时间锚;周期复扫(带锚)→ 仅 startedAt 早于本进程启动的遗留判死,
      // 本进程内正在跑的不误杀(落回下方年龄门兜底)。
      const startedMs = t.startedAt ? new Date(t.startedAt).getTime() : NaN;
      if (
        processStartMs === null ||
        !Number.isFinite(processStartMs) ||
        !Number.isFinite(startedMs) ||
        startedMs < processStartMs
      ) {
        reason = "应用重启导致任务中断,请重试";
      }
    }
    if (reason === null) {
      if (!t.startedAt) continue; // 无时间锚 → 不乱标(诚实跳过)
      const startedMs = new Date(t.startedAt).getTime();
      if (!Number.isFinite(startedMs)) continue;
      if (nowMs - startedMs < staleMs) continue;
      reason =
        "启动扫超时(stale-on-boot):进程重启前该任务仍悬挂在 running,标记为 failed";
    }
    try {
      // 系统读可以跨账号，但终态写必须重新收窄到每条任务的真实属主号。
      await deps.markFailed({ ...deps.ctx, accountId: t.accountId }, t.id, reason);
      swept += 1;
    } catch (e) {
      // 单条 markFailed 失败不阻断其余(fire-and-forget 兜底语义)。
      console.error(`[scheduler] 僵尸 ai_task ${t.id} 标 failed 失败:`, e);
    }
  }
  return swept;
}
