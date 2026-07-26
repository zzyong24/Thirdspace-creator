import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  lt,
  sql,
  type Db,
} from "@creatoros/backend";
import {
  requireAccountId,
  executionTasks,
  OwnershipError,
} from "@creatoros/backend";
import type {
  ExecutionTaskResourceV2,
  RequestContext,
} from "@creatoros/contract";
import { ConflictError, ExecutionValidationError } from "./execution.errors";

export type PersistentTaskKind =
  | "source_sync"
  | "share_import"
  | "transcribe"
  | "topic_preview"
  | "script_candidate"
  | "migration";
export type PersistentTaskOwnerType =
  | "source"
  | "item_import"
  | "item"
  | "transform"
  | "project"
  | "migration";
export type PersistentTaskStatus = ExecutionTaskResourceV2["status"];
export type PersistentTaskCommand = "pause" | "resume" | "cancel" | "retry";

type TaskRow = typeof executionTasks.$inferSelect;

export interface PersistentTaskServiceDeps {
  now?: () => string;
  nextId?: (prefix: string) => string;
}

export interface EnqueuePersistentTaskInput {
  kind: PersistentTaskKind;
  ownerType: PersistentTaskOwnerType;
  ownerId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  costEstimate?: ExecutionTaskResourceV2["costEstimate"];
}

export interface PersistentTaskClaim {
  task: ExecutionTaskResourceV2;
  payload: Record<string, unknown>;
  lease: {
    workerId: string;
    attempt: number;
  };
}

export interface PersistentTaskService {
  enqueue(
    ctx: RequestContext,
    input: EnqueuePersistentTaskInput,
  ): Promise<ExecutionTaskResourceV2>;
  get(
    ctx: RequestContext,
    taskId: string,
  ): Promise<ExecutionTaskResourceV2>;
  list(
    ctx: RequestContext,
    query?: {
      kind?: PersistentTaskKind;
      ownerId?: string;
      status?: PersistentTaskStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ rows: ExecutionTaskResourceV2[]; total: number }>;
  command(
    ctx: RequestContext,
    input: {
      taskIds: string[];
      command: PersistentTaskCommand;
      idempotencyKey: string;
    },
  ): Promise<ExecutionTaskResourceV2[]>;
  /** Worker-only internal port. It returns one opaque lease, never an arbitrary account listing. */
  claimNext(input: {
    workerId: string;
    kinds?: PersistentTaskKind[];
    leaseSeconds?: number;
  }): Promise<PersistentTaskClaim | null>;
  claimTask(input: {
    taskId: string;
    workerId: string;
    leaseSeconds?: number;
  }): Promise<PersistentTaskClaim | null>;
  heartbeat(input: {
    taskId: string;
    workerId: string;
    attempt: number;
    leaseSeconds?: number;
  }): Promise<ExecutionTaskResourceV2>;
  saveCheckpoint(input: {
    taskId: string;
    workerId: string;
    attempt: number;
    checkpoint: unknown;
  }): Promise<ExecutionTaskResourceV2>;
  acknowledgeControl(input: {
    taskId: string;
    workerId: string;
    attempt: number;
  }): Promise<ExecutionTaskResourceV2>;
  finish(input: {
    taskId: string;
    workerId: string;
    attempt: number;
    status: "succeeded" | "failed" | "blocked";
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<ExecutionTaskResourceV2>;
  recoverExpiredLeases(): Promise<{
    requeued: number;
    failed: number;
    paused: number;
    cancelled: number;
  }>;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(",")}}`;
}

function toResource(row: TaskRow): ExecutionTaskResourceV2 {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    kind: row.kind as PersistentTaskKind,
    ownerType: row.ownerType as PersistentTaskOwnerType,
    ownerId: row.ownerId,
    status: row.status as PersistentTaskStatus,
    priority: row.priority,
    idempotencyKey: row.idempotencyKey,
    checkpoint: row.checkpoint ?? null,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    heartbeatAt: row.heartbeatAt,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    errorCode: row.lastErrorCode,
    errorMessage: row.lastErrorMessage,
    costEstimate:
      (row.costEstimate as ExecutionTaskResourceV2["costEstimate"]) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function asPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function assertLease(
  row: TaskRow | undefined,
  input: { workerId: string; attempt: number },
): TaskRow {
  if (
    !row ||
    row.leaseOwner !== input.workerId ||
    row.attempt !== input.attempt
  ) {
    throw new ConflictError("任务租约已失效，请停止当前执行并重新 claim");
  }
  return row;
}

function leaseExpiry(now: string, seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new ExecutionValidationError("leaseSeconds 必须是正数");
  }
  return new Date(Date.parse(now) + seconds * 1_000).toISOString();
}

function commandTarget(
  status: PersistentTaskStatus,
  command: PersistentTaskCommand,
  attempt: number,
  maxAttempts: number,
): PersistentTaskStatus {
  if (command === "pause" && status === "running") return "pause_requested";
  if (command === "resume" && status === "paused") return "queued";
  if (command === "cancel") {
    if (status === "queued" || status === "paused") return "cancelled";
    if (status === "running" || status === "pause_requested") {
      return "cancel_requested";
    }
  }
  if (
    command === "retry" &&
    (status === "failed" || status === "blocked") &&
    attempt < maxAttempts
  ) {
    return "queued";
  }
  throw new ConflictError(
    `任务状态不允许执行 ${command}: status=${status}, attempt=${attempt}/${maxAttempts}`,
  );
}

export function createPersistentTaskService(
  db: Db,
  deps: PersistentTaskServiceDeps = {},
): PersistentTaskService {
  const now = deps.now ?? (() => new Date().toISOString());
  const nextId = deps.nextId ?? ((prefix: string) => `${prefix}_${randomUUID()}`);

  async function getOwnedRow(
    ctx: RequestContext,
    taskId: string,
    op: string,
  ): Promise<TaskRow> {
    const accountId = requireAccountId(ctx.accountId, op);
    const [row] = await db
      .select()
      .from(executionTasks)
      .where(
        and(
          eq(executionTasks.id, taskId),
          eq(executionTasks.userId, ctx.userId),
          eq(executionTasks.accountId, accountId),
        ),
      )
      .limit(1);
    if (!row) throw new OwnershipError("Execution task not found");
    return row;
  }

  async function getWorkerRow(
    input: { taskId: string; workerId: string; attempt: number },
  ): Promise<TaskRow> {
    const [row] = await db
      .select()
      .from(executionTasks)
      .where(eq(executionTasks.id, input.taskId))
      .limit(1);
    return assertLease(row, input);
  }

  return {
    async enqueue(ctx, input) {
      const accountId = requireAccountId(
        ctx.accountId,
        "execution.tasks.enqueue",
      );
      if (!input.ownerId || !input.idempotencyKey) {
        throw new ExecutionValidationError(
          "ownerId 与 idempotencyKey 不能为空",
        );
      }
      const maxAttempts = input.maxAttempts ?? 3;
      if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
        throw new ExecutionValidationError("maxAttempts 必须是正整数");
      }
      const stamp = now();
      const row = {
        id: nextId("execution-task"),
        userId: ctx.userId,
        accountId,
        kind: input.kind,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        status: "queued",
        priority: input.priority ?? 0,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        checkpoint: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        attempt: 0,
        maxAttempts,
        costEstimate: input.costEstimate ?? null,
        lastErrorCode: null,
        lastErrorMessage: null,
        createdAt: stamp,
        updatedAt: stamp,
      };
      const [inserted] = await db
        .insert(executionTasks)
        .values(row)
        .onConflictDoNothing()
        .returning();
      if (inserted) return toResource(inserted);

      const [existing] = await db
        .select()
        .from(executionTasks)
        .where(
          and(
            eq(executionTasks.userId, ctx.userId),
            eq(executionTasks.accountId, accountId),
            eq(executionTasks.kind, input.kind),
            eq(executionTasks.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (
        !existing ||
        existing.ownerType !== input.ownerType ||
        existing.ownerId !== input.ownerId ||
        stableJson(existing.payload) !== stableJson(input.payload) ||
        existing.priority !== (input.priority ?? 0) ||
        existing.maxAttempts !== maxAttempts ||
        stableJson(existing.costEstimate) !==
          stableJson(input.costEstimate ?? null)
      ) {
        throw new ConflictError(
          "idempotencyKey 已被另一份任务请求使用",
        );
      }
      return toResource(existing);
    },

    async get(ctx, taskId) {
      return toResource(
        await getOwnedRow(ctx, taskId, "execution.tasks.getPersistent"),
      );
    },

    async list(ctx, query = {}) {
      const accountId = requireAccountId(
        ctx.accountId,
        "execution.tasks.listPersistent",
      );
      const filters = [
        eq(executionTasks.userId, ctx.userId),
        eq(executionTasks.accountId, accountId),
      ];
      if (query.kind) filters.push(eq(executionTasks.kind, query.kind));
      if (query.ownerId) {
        filters.push(eq(executionTasks.ownerId, query.ownerId));
      }
      if (query.status) filters.push(eq(executionTasks.status, query.status));
      const all = await db
        .select()
        .from(executionTasks)
        .where(and(...filters))
        .orderBy(desc(executionTasks.priority), desc(executionTasks.createdAt));
      const offset = Math.max(0, query.offset ?? 0);
      const limit = Math.max(1, query.limit ?? 20);
      return {
        rows: all.slice(offset, offset + limit).map(toResource),
        total: all.length,
      };
    },

    async command(ctx, input) {
      const accountId = requireAccountId(
        ctx.accountId,
        "execution.tasks.command",
      );
      const taskIds = [...new Set(input.taskIds)];
      if (
        taskIds.length === 0 ||
        !input.idempotencyKey ||
        taskIds.length !== input.taskIds.length
      ) {
        throw new ExecutionValidationError(
          "taskIds 必须非空且不得重复，idempotencyKey 不能为空",
        );
      }
      return db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(executionTasks)
          .where(
            and(
              inArray(executionTasks.id, taskIds),
              eq(executionTasks.userId, ctx.userId),
              eq(executionTasks.accountId, accountId),
            ),
          );
        if (rows.length !== taskIds.length) {
          throw new OwnershipError("Execution task not found");
        }

        const targetById = new Map(
          rows.map((row) => [
            row.id,
            commandTarget(
              row.status as PersistentTaskStatus,
              input.command,
              row.attempt,
              row.maxAttempts,
            ),
          ]),
        );
        const stamp = now();
        const updated: TaskRow[] = [];
        for (const taskId of taskIds) {
          const target = targetById.get(taskId);
          if (!target) throw new OwnershipError("Execution task not found");
          const clearLease =
            target === "queued" ||
            target === "cancelled" ||
            target === "paused";
          const [row] = await tx
            .update(executionTasks)
            .set({
              status: target,
              ...(clearLease
                ? {
                    leaseOwner: null,
                    leaseExpiresAt: null,
                    heartbeatAt: null,
                  }
                : {}),
              ...(input.command === "retry"
                ? {
                    lastErrorCode: null,
                    lastErrorMessage: null,
                  }
                : {}),
              updatedAt: stamp,
            })
            .where(eq(executionTasks.id, taskId))
            .returning();
          if (!row) throw new OwnershipError("Execution task not found");
          updated.push(row);
        }
        return updated.map(toResource);
      });
    },

    async claimNext(input) {
      const stamp = now();
      const leaseExpiresAt = leaseExpiry(stamp, input.leaseSeconds ?? 60);
      if (!input.workerId) {
        throw new ExecutionValidationError("workerId 不能为空");
      }
      if (input.kinds && input.kinds.length === 0) return null;
      return db.transaction(async (tx) => {
        const filters = [eq(executionTasks.status, "queued")];
        if (input.kinds) {
          filters.push(inArray(executionTasks.kind, input.kinds));
        }
        const candidates = await tx
          .select()
          .from(executionTasks)
          .where(and(...filters))
          .orderBy(desc(executionTasks.priority), asc(executionTasks.createdAt))
          .limit(8);
        for (const candidate of candidates) {
          const [claimed] = await tx
            .update(executionTasks)
            .set({
              status: "running",
              leaseOwner: input.workerId,
              leaseExpiresAt,
              heartbeatAt: stamp,
              attempt: sql`${executionTasks.attempt} + 1`,
              updatedAt: stamp,
            })
            .where(
              and(
                eq(executionTasks.id, candidate.id),
                eq(executionTasks.status, "queued"),
              ),
            )
            .returning();
          if (claimed) {
            return {
              task: toResource(claimed),
              payload: asPayload(claimed.payload),
              lease: {
                workerId: input.workerId,
                attempt: claimed.attempt,
              },
            };
          }
        }
        return null;
      });
    },

    async claimTask(input) {
      const stamp = now();
      const leaseExpiresAt = leaseExpiry(stamp, input.leaseSeconds ?? 60);
      if (!input.workerId || !input.taskId) {
        throw new ExecutionValidationError(
          "taskId 与 workerId 不能为空",
        );
      }
      const [claimed] = await db
        .update(executionTasks)
        .set({
          status: "running",
          leaseOwner: input.workerId,
          leaseExpiresAt,
          heartbeatAt: stamp,
          attempt: sql`${executionTasks.attempt} + 1`,
          updatedAt: stamp,
        })
        .where(
          and(
            eq(executionTasks.id, input.taskId),
            eq(executionTasks.status, "queued"),
          ),
        )
        .returning();
      if (!claimed) return null;
      return {
        task: toResource(claimed),
        payload: asPayload(claimed.payload),
        lease: {
          workerId: input.workerId,
          attempt: claimed.attempt,
        },
      };
    },

    async heartbeat(input) {
      await getWorkerRow(input);
      const stamp = now();
      const [updated] = await db
        .update(executionTasks)
        .set({
          heartbeatAt: stamp,
          leaseExpiresAt: leaseExpiry(stamp, input.leaseSeconds ?? 60),
          updatedAt: stamp,
        })
        .where(
          and(
            eq(executionTasks.id, input.taskId),
            eq(executionTasks.leaseOwner, input.workerId),
            eq(executionTasks.attempt, input.attempt),
            inArray(executionTasks.status, [
              "running",
              "pause_requested",
              "cancel_requested",
            ]),
          ),
        )
        .returning();
      return toResource(assertLease(updated, input));
    },

    async saveCheckpoint(input) {
      const current = await getWorkerRow(input);
      if (
        !["running", "pause_requested", "cancel_requested"].includes(
          current.status,
        )
      ) {
        throw new ConflictError(
          `任务状态 ${current.status} 不允许写 checkpoint`,
        );
      }
      const [updated] = await db
        .update(executionTasks)
        .set({ checkpoint: input.checkpoint, updatedAt: now() })
        .where(
          and(
            eq(executionTasks.id, input.taskId),
            eq(executionTasks.leaseOwner, input.workerId),
            eq(executionTasks.attempt, input.attempt),
          ),
        )
        .returning();
      return toResource(assertLease(updated, input));
    },

    async acknowledgeControl(input) {
      const current = await getWorkerRow(input);
      const target =
        current.status === "pause_requested"
          ? "paused"
          : current.status === "cancel_requested"
            ? "cancelled"
            : null;
      if (!target) {
        throw new ConflictError(
          `任务状态 ${current.status} 没有待确认控制命令`,
        );
      }
      const [updated] = await db
        .update(executionTasks)
        .set({
          status: target,
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          updatedAt: now(),
        })
        .where(
          and(
            eq(executionTasks.id, input.taskId),
            eq(executionTasks.leaseOwner, input.workerId),
            eq(executionTasks.attempt, input.attempt),
            eq(executionTasks.status, current.status),
          ),
        )
        .returning();
      if (!updated) {
        throw new ConflictError("控制命令确认时租约或任务状态已变化");
      }
      return toResource(updated);
    },

    async finish(input) {
      const current = await getWorkerRow(input);
      const legal =
        current.status === "running" ||
        ((current.status === "pause_requested" ||
          current.status === "cancel_requested") &&
          input.status === "failed");
      if (!legal) {
        throw new ConflictError(
          `任务状态 ${current.status} 不允许结束为 ${input.status}`,
        );
      }
      const [updated] = await db
        .update(executionTasks)
        .set({
          status: input.status,
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          lastErrorCode:
            input.status === "succeeded" ? null : (input.errorCode ?? null),
          lastErrorMessage:
            input.status === "succeeded" ? null : (input.errorMessage ?? null),
          updatedAt: now(),
        })
        .where(
          and(
            eq(executionTasks.id, input.taskId),
            eq(executionTasks.leaseOwner, input.workerId),
            eq(executionTasks.attempt, input.attempt),
            eq(executionTasks.status, current.status),
          ),
        )
        .returning();
      if (!updated) throw new ConflictError("任务完成时租约已变化");
      return toResource(updated);
    },

    async recoverExpiredLeases() {
      const stamp = now();
      const report = {
        requeued: 0,
        failed: 0,
        paused: 0,
        cancelled: 0,
      };
      await db.transaction(async (tx) => {
        const expired = await tx
          .select()
          .from(executionTasks)
          .where(
            and(
              inArray(executionTasks.status, [
                "running",
                "pause_requested",
                "cancel_requested",
              ]),
              lt(executionTasks.leaseExpiresAt, stamp),
            ),
          );
        for (const row of expired) {
          let target: PersistentTaskStatus;
          if (row.status === "pause_requested") {
            target = "paused";
            report.paused += 1;
          } else if (row.status === "cancel_requested") {
            target = "cancelled";
            report.cancelled += 1;
          } else if (row.attempt < row.maxAttempts) {
            target = "queued";
            report.requeued += 1;
          } else {
            target = "failed";
            report.failed += 1;
          }
          await tx
            .update(executionTasks)
            .set({
              status: target,
              leaseOwner: null,
              leaseExpiresAt: null,
              heartbeatAt: null,
              ...(target === "failed"
                ? {
                    lastErrorCode: "LEASE_EXPIRED",
                    lastErrorMessage: "worker 租约过期且重试预算已耗尽",
                  }
                : {}),
              updatedAt: stamp,
            })
            .where(
              and(
                eq(executionTasks.id, row.id),
                eq(executionTasks.status, row.status),
                eq(executionTasks.attempt, row.attempt),
              ),
            );
        }
      });
      return report;
    },
  };
}
