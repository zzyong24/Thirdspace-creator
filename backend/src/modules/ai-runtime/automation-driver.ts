import type { RequestContext } from "@creatoros/contract";
import type { PersistentTaskService } from "../execution";
import { cronMatchesMinute } from "./scheduled-collection-scheduler";

export const AUTOMATION_TASK_KIND = "automation_sync" as const;
export const AUTOMATION_TASK_OWNER_TYPE = "scheduled_job" as const;

export type AutomationHandlerKey = "scheduled_collection";

export interface AutomationDriverJob {
  id: string;
  accountId: string|null;
  groupId?:string|null;groupVersion?:number|null;membershipVersion?:number|null;
  sourceKind: string;
  target: Record<string, unknown>;
  schedule: string;
  enabled: boolean;
  /** 最近一次真实 job_run 的开始时间；用于判断每日作品同步是否已经尝试过。 */
  lastRunStartedAt?: string | null;
}

export interface AutomationHandlerInput {
  job: AutomationDriverJob;
  scheduledFor: string;
  taskId: string;
  attempt: number;
}

export type AutomationHandler = (
  ctx: RequestContext,
  input: AutomationHandlerInput,
) => Promise<void | {executionTaskId:string}>;

export interface AutomationHandlerRegistry {
  register(key: AutomationHandlerKey, handler: AutomationHandler): AutomationHandlerRegistry;
  seal(): AutomationHandlerRegistry;
  resolve(key: string): AutomationHandler;
  isSealed(): boolean;
}

/**
 * 生产自动化只允许编译期登记的 handler。registry 在组合根装配完成后 seal，
 * 运行期 payload 不能借字符串注入脚本、prompt 或任意工具。
 */
export function createAutomationHandlerRegistry(): AutomationHandlerRegistry {
  const handlers = new Map<AutomationHandlerKey, AutomationHandler>();
  let sealed = false;
  const registry: AutomationHandlerRegistry = {
    register(key, handler) {
      if (sealed) throw new Error("自动化 handler registry 已封闭");
      if (handlers.has(key)) throw new Error(`自动化 handler 重复注册: ${key}`);
      handlers.set(key, handler);
      return registry;
    },
    seal() {
      if (handlers.size === 0) throw new Error("自动化 handler registry 不能为空");
      sealed = true;
      return registry;
    },
    resolve(key) {
      if (!sealed) throw new Error("自动化 handler registry 尚未封闭");
      const handler = handlers.get(key as AutomationHandlerKey);
      if (!handler) throw new Error(`未注册的自动化 handler: ${key}`);
      return handler;
    },
    isSealed: () => sealed,
  };
  return registry;
}

export interface AutomationDriverTickDeps {
  ctx: RequestContext;
  tasks: PersistentTaskService;
  registry: AutomationHandlerRegistry;
  listRunnableJobs: (ctx: RequestContext) => Promise<AutomationDriverJob[]>;
  now: () => string;
  workerId: string;
  cron: { validate(expr: string): boolean };
  maxClaims?: number;
  leaseSeconds?: number;
  /** 启动恢复只对声明 missed-run=once 的系统聚合作业生效。 */
  startupRecovery?: boolean;
  /** 每次分钟 tick 检查一次每日作品任务是否已错过，错过且尚未尝试时补跑。 */
  recoverMissedDailyRuns?: boolean;
  /** 复用唯一分钟 tick 清理无活跃执行的僵尸 job_run；不得另起第二个 timer。 */
  sweepStaleJobRuns?: () => Promise<number>;
  scheduledChildren?: {attach(ref:{executionTaskId:string;attempt:number;fenceToken:string},childId:string):Promise<void>;reconcile():Promise<{succeeded:number;failed:number;pending:number}>};
  wakeDelegated?:()=>void;
  /** 宿主封闭调度后只结算已开始的任务，不再发起下一份查询或领取。 */
  shouldStop?:()=>boolean;
}

export interface AutomationDriverTickReport {
  recovered: Awaited<ReturnType<PersistentTaskService["recoverExpiredLeases"]>>;
  sweptJobRuns: number;
  enqueued: number;
  overlapped: number;
  succeeded: number;
  failed: number;
}

function minuteAnchor(iso: string): string {
  const value = new Date(iso);
  value.setSeconds(0, 0);
  return value.toISOString();
}

/**
 * `self.metrics` 的每日自定义计划在 CreatorOS 关闭或事件循环阻塞时可能错过
 * 精确 cron 分钟；此处把简单的 `M H * * *` 计划按其时区还原为当天时间锚。当天计划之后
 * 已经出现过任意 run（成功/失败/手动初始化均算一次尝试）就不再自动补，避免分钟级重试。
 */
function missedDailyRunAnchor(
  job: AutomationDriverJob,
  now: Date,
): string | null {
  if (job.sourceKind !== "self.metrics") return null;
  const match = job.schedule.trim().match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/);
  if (!match) return null;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;

  const scheduled = new Date(now);
  if (job.target.scheduleTimezone === "Asia/Shanghai") {
    // 与精确 cron 匹配使用同一时区，不能由本机日期提前补跑。
    const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1_000);
    scheduled.setTime(Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), beijing.getUTCDate(), hour - 8, minute));
  } else {
    scheduled.setHours(hour, minute, 0, 0);
  }
  if (now.getTime() < scheduled.getTime()) return null;

  if (job.lastRunStartedAt) {
    const lastRunMs = new Date(job.lastRunStartedAt).getTime();
    if (Number.isFinite(lastRunMs) && lastRunMs >= scheduled.getTime()) {
      return null;
    }
  }
  return scheduled.toISOString();
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  const message = String(error ?? "").trim();
  return message || "自动化执行失败，未返回具体原因";
}

function payloadOf(value: Record<string, unknown>): {
  handler: string;
  job: AutomationDriverJob;
  scheduledFor: string;
} {
  const handler = typeof value.handler === "string" ? value.handler : "";
  const scheduledFor =
    typeof value.scheduledFor === "string" ? value.scheduledFor : "";
  const rawJob =
    value.job && typeof value.job === "object"
      ? (value.job as Record<string, unknown>)
      : {};
  const lastRunStartedAt =
    typeof rawJob.lastRunStartedAt === "string"
      ? rawJob.lastRunStartedAt
      : null;
  const job: AutomationDriverJob = {
    id: typeof rawJob.id === "string" ? rawJob.id : "",
    accountId:
      typeof rawJob.accountId === "string" ? rawJob.accountId : null,
    ...(rawJob.groupId!==undefined?{groupId:typeof rawJob.groupId==="string"?rawJob.groupId:null}:{}),
    ...(rawJob.groupVersion!==undefined?{groupVersion:typeof rawJob.groupVersion==="number"?rawJob.groupVersion:null}:{}),
    ...(rawJob.membershipVersion!==undefined?{membershipVersion:typeof rawJob.membershipVersion==="number"?rawJob.membershipVersion:null}:{}),
    sourceKind:
      typeof rawJob.sourceKind === "string" ? rawJob.sourceKind : "",
    target:
      rawJob.target && typeof rawJob.target === "object"
        ? (rawJob.target as Record<string, unknown>)
        : {},
    schedule:
      typeof rawJob.schedule === "string" ? rawJob.schedule : "",
    enabled: rawJob.enabled === true,
    ...(lastRunStartedAt ? { lastRunStartedAt } : {}),
  };
  if (!handler || !scheduledFor || !job.id || !job.sourceKind || (!job.accountId&&!(["topic.daily","intelligence.sync"].includes(job.sourceKind)&&job.groupId))) {
    throw new Error("自动化任务 payload 不完整");
  }
  return { handler, scheduledFor, job };
}

/**
 * 唯一 server-side tick：先恢复过期租约，再产 due task，最后经 claim 执行。
 * 所有执行状态只写 PersistentTaskService；scheduled handler 仍通过既有 service port 落业务结果。
 */
export async function runAutomationDriverTick(
  deps: AutomationDriverTickDeps,
): Promise<AutomationDriverTickReport> {
  if (!deps.registry.isSealed()) {
    throw new Error("自动化 handler registry 必须先 seal");
  }
  const report: AutomationDriverTickReport = {
    recovered: {requeued: 0, unknownResult: 0, failed: 0, paused: 0, cancelled: 0},
    sweptJobRuns: 0, enqueued: 0, overlapped: 0, succeeded: 0, failed: 0,
  };
  if (deps.shouldStop?.()) return report;
  const delegated = await deps.scheduledChildren?.reconcile();
  report.succeeded = delegated?.succeeded ?? 0;
  report.failed = delegated?.failed ?? 0;
  if (deps.shouldStop?.()) return report;
  report.sweptJobRuns = await deps.sweepStaleJobRuns?.() ?? 0;
  if (deps.shouldStop?.()) return report;
  report.recovered = await deps.tasks.recoverExpiredLeases();
  if (deps.shouldStop?.()) return report;
  const nowIso = deps.now();
  const scheduledFor = minuteAnchor(nowIso);
  const now = new Date(nowIso);
  const jobs = await deps.listRunnableJobs(deps.ctx);
  for (const job of jobs) {
    if (deps.shouldStop?.()) break;
    const validSchedule = deps.cron.validate(job.schedule);
    const scheduleMatches =
      validSchedule && cronMatchesMinute(job.schedule, now, job.target.scheduleTimezone === "Asia/Shanghai" ? "Asia/Shanghai" : undefined);
    const startupRecovery =
      deps.startupRecovery === true &&
      job.sourceKind === "intelligence.sync";
    const missedDailyAnchor =
      deps.recoverMissedDailyRuns === true && validSchedule
        ? missedDailyRunAnchor(job, now)
        : null;
    if (
      !job.enabled ||
      (!scheduleMatches && !startupRecovery && !missedDailyAnchor)
    ) {
      continue;
    }
    const triggerAnchor = missedDailyAnchor ?? scheduledFor;
    if (missedDailyAnchor && !scheduleMatches) {
      console.log(
        `[automation-driver] 补跑错过的作品同步 job=${job.id} scheduledFor=${missedDailyAnchor}`,
      );
    }
    const jobCtx: RequestContext = { ...deps.ctx,source:"ingestion", accountId: job.accountId,groupId:job.groupId??null,groupVersion:job.groupVersion??undefined,membershipVersion:job.membershipVersion??undefined };
    try {
      await deps.tasks.enqueue(jobCtx, {
        kind: AUTOMATION_TASK_KIND,
        ownerType: AUTOMATION_TASK_OWNER_TYPE,
        ownerId: job.id,
        idempotencyKey: `scheduled-job:${job.id}:${triggerAnchor}`,
        payload: {
          handler: "scheduled_collection",
          job,
          scheduledFor: triggerAnchor,
        },
        maxAttempts: 3,
      });
      report.enqueued += 1;
    } catch (error) {
      // 活跃 owner 唯一索引把下一次 tick 挡在执行层；这代表重叠跳过，不是本轮失败。
      if ((error as { name?: unknown } | null)?.name === "ConflictError") {
        report.overlapped += 1;
        continue;
      }
      throw error;
    }
  }

  const leaseSeconds = deps.leaseSeconds ?? 120;
  const maxClaims = Math.max(1, deps.maxClaims ?? 8);
  for (let index = 0; index < maxClaims; index += 1) {
    if (deps.shouldStop?.()) break;
    const claim = await deps.tasks.claimNext({
      workerId: deps.workerId,
      kinds: [AUTOMATION_TASK_KIND],
      leaseSeconds,
    });
    if (!claim) break;
    const taskCtx: RequestContext = {
      userId: claim.task.userId,
      accountId: claim.task.accountId,groupId:claim.task.groupId,groupVersion:claim.task.groupVersion??undefined,membershipVersion:claim.task.membershipVersion??undefined,
      requestId: `automation:${claim.task.id}`,
      source: "ingestion",
    };
    const heartbeatMs = Math.max(1_000, Math.floor((leaseSeconds * 1_000) / 3));
    let heartbeatInFlight: Promise<unknown> | undefined;
    const heartbeat = setInterval(() => {
      if (heartbeatInFlight) return;
      heartbeatInFlight = deps.tasks
        .heartbeat({
          taskId: claim.task.id,
          workerId: claim.lease.workerId,
          attempt: claim.lease.attempt,
          leaseSeconds,
        })
        .catch(() => undefined)
        .finally(() => { heartbeatInFlight = undefined; });
    }, heartbeatMs);
    heartbeat.unref?.();
    let delegationReceived=false;
    try {
      const payload = payloadOf(claim.payload);
      const handler = deps.registry.resolve(payload.handler);
      const outcome=await handler(taskCtx, {
        job: payload.job,
        scheduledFor: payload.scheduledFor,
        taskId: claim.task.id,
        attempt: claim.lease.attempt,
      });
      if(outcome){delegationReceived=true;if(!deps.scheduledChildren)throw new Error('调度子任务跟踪端口未配置');await deps.scheduledChildren.attach({executionTaskId:claim.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},outcome.executionTaskId);try{deps.wakeDelegated?.();}catch{/* 定时dispatcher仍会领取已持久绑定子任务。 */}continue;}
      await deps.tasks.finish({
        taskId: claim.task.id,
        workerId: claim.lease.workerId,
        attempt: claim.lease.attempt,
        status: "succeeded",
      });
      report.succeeded += 1;
    } catch (error) {
      // 子任务已存在而链接回执不明，不把父写失败。租约到期后以同一调度幂等键重新绑定。
      if(delegationReceived){console.error('[automation-driver] 子任务绑定待恢复',errorMessageOf(error));continue;}
      await deps.tasks.finish({
        taskId: claim.task.id,
        workerId: claim.lease.workerId,
        attempt: claim.lease.attempt,
        status: "failed",
        errorCode: "AUTOMATION_HANDLER_FAILED",
        errorMessage: errorMessageOf(error),
      });
      report.failed += 1;
    } finally {
      clearInterval(heartbeat);
      await heartbeatInFlight;
    }
  }
  return report;
}

export type AutomationDriverStartDeps = Omit<AutomationDriverTickDeps, "cron">;

export interface AutomationDriverControl {
  /** 启动恢复仍可观察失败；控制句柄在异步启动之前就归属宿主。 */
  ready: Promise<void>;
  stop(): Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __creatorosAutomationDriverStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __creatorosAutomationDriver: AutomationDriverControl | undefined;
}

/** 一个进程一个 driver；慢 tick 只登记一次待刷新，停止先封闭入口再等当前工作。 */
export function startAutomationDriver(deps: AutomationDriverStartDeps): AutomationDriverControl {
  if (
    process.env.NODE_ENV === "test" || process.env.VITEST || process.env.CI ||
    process.env.NEXT_PHASE === "phase-production-build" || process.env.CREATOROS_DISABLE_SCHEDULER === "1"
  ) return {ready: Promise.resolve(), stop: async () => {}};
  if (globalThis.__creatorosAutomationDriver) return globalThis.__creatorosAutomationDriver;

  let stopped = false, pendingWake = false;
  let active: Promise<void> | undefined, stopping: Promise<void> | undefined;
  let scheduled: Pick<import("node-cron").ScheduledTask, "stop" | "destroy"> | undefined;
  const release = () => {
    if (globalThis.__creatorosAutomationDriver === control) {
      globalThis.__creatorosAutomationDriver = undefined;
      globalThis.__creatorosAutomationDriverStarted = false;
    }
  };
  const control: AutomationDriverControl = {
    ready: Promise.resolve(),
    stop() {
      if (stopping) return stopping;
      stopped = true; pendingWake = false;
      stopping = (async () => {
        await scheduled?.stop(); await scheduled?.destroy();
        // 已发送查询无法物理取消；等它返回，shouldStop 阻止接着发起下一份。
        await control.ready.catch(() => {});
        await active;
        release();
      })();
      return stopping;
    },
  };
  globalThis.__creatorosAutomationDriver = control;
  globalThis.__creatorosAutomationDriverStarted = true;
  control.ready = (async () => {
    const cron = await import("node-cron");
    if (stopped) return;
    const wake = (startupRecovery: boolean): Promise<void> => {
      if (stopped) return Promise.resolve();
      if (active) {pendingWake = true; return active;}
      const work = Promise.resolve().then(async () => {
        let startup = startupRecovery;
        while (!stopped) {
          try {
            await runAutomationDriverTick({...deps, cron, startupRecovery: startup,
              recoverMissedDailyRuns: true, shouldStop: () => stopped || deps.shouldStop?.() === true});
          } catch (error) {
            if (startup) throw error;
            console.error("[automation-driver] tick 失败:", error);
          }
          startup = false;
          if (!pendingWake) break;
          pendingWake = false;
        }
      }).finally(() => {if (active === work) active = undefined;});
      active = work;
      return work;
    };
    scheduled = cron.schedule("* * * * *", () => {void wake(false).catch(error => console.error("[automation-driver] tick 失败:", error));});
    await wake(true);
    if (!stopped) console.log("[automation-driver] 持久自动化 driver 已启动(每分钟一次)");
  })().catch(async error => {
    stopped = true; pendingWake = false;
    await scheduled?.stop(); await scheduled?.destroy(); release();
    throw error;
  });
  return control;
}
