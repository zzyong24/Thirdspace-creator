import type { RequestContext } from "@creatoros/contract";
import type { PersistentTaskService } from "../execution";
import { cronMatchesMinute } from "./scheduled-collection-scheduler";

export const AUTOMATION_TASK_KIND = "automation_sync" as const;
export const AUTOMATION_TASK_OWNER_TYPE = "scheduled_job" as const;

export type AutomationHandlerKey = "scheduled_collection";

export interface AutomationDriverJob {
  id: string;
  accountId: string;
  sourceKind: string;
  target: Record<string, unknown>;
  schedule: string;
  enabled: boolean;
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
) => Promise<void>;

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
}

export interface AutomationDriverTickReport {
  recovered: Awaited<ReturnType<PersistentTaskService["recoverExpiredLeases"]>>;
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
  const job: AutomationDriverJob = {
    id: typeof rawJob.id === "string" ? rawJob.id : "",
    accountId:
      typeof rawJob.accountId === "string" ? rawJob.accountId : "",
    sourceKind:
      typeof rawJob.sourceKind === "string" ? rawJob.sourceKind : "",
    target:
      rawJob.target && typeof rawJob.target === "object"
        ? (rawJob.target as Record<string, unknown>)
        : {},
    schedule:
      typeof rawJob.schedule === "string" ? rawJob.schedule : "",
    enabled: rawJob.enabled === true,
  };
  if (!handler || !scheduledFor || !job.id || !job.accountId || !job.sourceKind) {
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
  const recovered = await deps.tasks.recoverExpiredLeases();
  const report: AutomationDriverTickReport = {
    recovered,
    enqueued: 0,
    overlapped: 0,
    succeeded: 0,
    failed: 0,
  };
  const nowIso = deps.now();
  const scheduledFor = minuteAnchor(nowIso);
  const now = new Date(nowIso);
  const jobs = await deps.listRunnableJobs(deps.ctx);
  for (const job of jobs) {
    if (
      !job.enabled ||
      !deps.cron.validate(job.schedule) ||
      !cronMatchesMinute(job.schedule, now)
    ) {
      continue;
    }
    const jobCtx: RequestContext = { ...deps.ctx, accountId: job.accountId };
    try {
      await deps.tasks.enqueue(jobCtx, {
        kind: AUTOMATION_TASK_KIND,
        ownerType: AUTOMATION_TASK_OWNER_TYPE,
        ownerId: job.id,
        idempotencyKey: `scheduled-job:${job.id}:${scheduledFor}`,
        payload: {
          handler: "scheduled_collection",
          job,
          scheduledFor,
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
    const claim = await deps.tasks.claimNext({
      workerId: deps.workerId,
      kinds: [AUTOMATION_TASK_KIND],
      leaseSeconds,
    });
    if (!claim) break;
    const taskCtx: RequestContext = {
      userId: claim.task.userId,
      accountId: claim.task.accountId,
      requestId: `automation:${claim.task.id}`,
      source: "ingestion",
    };
    const heartbeatMs = Math.max(1_000, Math.floor((leaseSeconds * 1_000) / 3));
    const heartbeat = setInterval(() => {
      void deps.tasks
        .heartbeat({
          taskId: claim.task.id,
          workerId: claim.lease.workerId,
          attempt: claim.lease.attempt,
          leaseSeconds,
        })
        .catch(() => undefined);
    }, heartbeatMs);
    heartbeat.unref?.();
    try {
      const payload = payloadOf(claim.payload);
      const handler = deps.registry.resolve(payload.handler);
      await handler(taskCtx, {
        job: payload.job,
        scheduledFor: payload.scheduledFor,
        taskId: claim.task.id,
        attempt: claim.lease.attempt,
      });
      await deps.tasks.finish({
        taskId: claim.task.id,
        workerId: claim.lease.workerId,
        attempt: claim.lease.attempt,
        status: "succeeded",
      });
      report.succeeded += 1;
    } catch (error) {
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
    }
  }
  return report;
}

export type AutomationDriverStartDeps = Omit<AutomationDriverTickDeps, "cron">;

declare global {
  // eslint-disable-next-line no-var
  var __creatorosAutomationDriverStarted: boolean | undefined;
}

/** 一个进程只启动这一处分钟 driver；测试/build 明确无副作用。 */
export async function startAutomationDriver(
  deps: AutomationDriverStartDeps,
): Promise<void> {
  if (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST ||
    process.env.CI ||
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.CREATOROS_DISABLE_SCHEDULER === "1"
  ) {
    return;
  }
  if (globalThis.__creatorosAutomationDriverStarted) return;
  globalThis.__creatorosAutomationDriverStarted = true;
  try {
    const cron = await import("node-cron");
    cron.schedule("* * * * *", () => {
      void runAutomationDriverTick({ ...deps, cron }).catch((error) =>
        console.error("[automation-driver] tick 失败:", error),
      );
    });
    console.log("[automation-driver] 持久自动化 driver 已启动(每分钟一次)");
  } catch (error) {
    globalThis.__creatorosAutomationDriverStarted = false;
    throw error;
  }
}
