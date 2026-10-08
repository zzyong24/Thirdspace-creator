import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import {lockWorkspaceMembership,assertFrozenWorkspaceMembership} from "../platform-account/membership-lock.service";
import {executionBudgetSchema, executionBudgetDeadline, isContinuousExecutionBudget, executionAttemptAvailable, type ExecutionBudget} from "@creatoros/contract/execution-worker";
import {recoverableAssetCalls} from "./asset-execution-recovery";
import {executionEvidence} from "../../schema/intelligence";
import {uncommittedChatTaskCalls} from "./chat-task-submission-recovery";
import {recoverableChatNodeParents} from "./chat-generation-recovery";
import {createDailyTopicRunService} from "../scheduling";
import {scheduledChildId,assertScheduledChild,scheduledParentProjection} from "./execution-scheduled-child.service";
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
  executionCalls,
  OwnershipError,
} from "@creatoros/backend";
import type {
  ExecutionTaskResourceV2,
  RequestContext,
} from "@creatoros/contract";
import { ConflictError, ExecutionValidationError } from "./execution.errors";
import { isAcknowledgableResearchBlock } from "./execution-research-blocked";

export type PersistentTaskKind =
  | "ai_task"
  | "source_sync"
  | "share_import"
  | "transcribe"
  | "topic_preview"
  | "radar_project_upgrade"
  | "script_candidate"
  | "automation_sync"
  | "migration"
  | "account_binding";
export type PersistentTaskOwnerType =
  | "ai_task"
  | "source"
  | "item_import"
  | "item"
  | "transform"
  | "project"
  | "scheduled_job"
  | "migration"
  | "account_binding";
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
  /** 后端创建策略，不在公共入队契约中暴露。 */
  executionBudget?: ExecutionBudget;
  costEstimate?: ExecutionTaskResourceV2["costEstimate"];
}

export interface PersistentTaskClaim {
  task: ExecutionTaskResourceV2;
  payload: Record<string, unknown>;
  lease: {
    workerId: string;
    attempt: number;
    fenceToken: string;
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
    executionMode?: "model.generate" | "model" | "agentic.run" | "chat.run" | "scheduled.flywheel" | "benchmark.transcribe";
    leaseSeconds?: number;
    /** 仅 worker 内部入场协调：跳过本消费者正在执行的精确属主。 */
    excludeAccounts?: ReadonlyArray<{userId:string;accountId:string|null;groupId?:string|null}>;
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
    status: "succeeded" | "failed" | "blocked" | "waiting_user" | "retry_wait";
    fenceToken?:string;
    retryAfterMs?:number;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<ExecutionTaskResourceV2>;
  recoverExpiredLeases(input?: {kinds?: PersistentTaskKind[]}): Promise<{
    requeued: number;
    unknownResult: number;
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
    groupId:row.groupId??null,groupVersion:row.groupVersion??null,membershipVersion:row.membershipVersion??null,
    kind: row.kind as PersistentTaskKind,
    ownerType: row.ownerType as PersistentTaskOwnerType,
    ownerId: row.ownerId,
    status: ({retry_wait:"queued",waiting_user:"blocked",unknown_result:"blocked",partial:"succeeded"}[row.status] ?? row.status) as PersistentTaskStatus,
    ...(["retry_wait","waiting_user","unknown_result","partial"].includes(row.status) ? {runtimeStatus: row.status as "retry_wait" | "waiting_user" | "unknown_result" | "partial"} : {}),
    retryAt: row.retryAt,
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

// 重试等待不能被直接领取或 pause/resume 绕过；旧任务未设置这两个字段时保持原行为。
function claimableAt(stamp: string) {
  return sql`(${executionTasks.status} = 'queued' OR ${executionTasks.status} = 'retry_wait')
    AND NOT (${executionTasks.payload} ? '__scheduledChild')
    AND (${executionTasks.retryAt} IS NULL OR ${executionTasks.retryAt} <= ${stamp})
    AND (${executionTasks.deadlineAt} IS NULL OR ${executionTasks.deadlineAt} > ${stamp})`;
}

function recoveryDueAt(stamp: string) {
  return sql`((${executionTasks.status} IN ('running','pause_requested','cancel_requested') AND ${executionTasks.leaseExpiresAt} < ${stamp})
    OR (${executionTasks.status} IN ('queued','retry_wait') AND ${executionTasks.deadlineAt} <= ${stamp}))`;
}

function commandTarget(
  status: string,
  command: PersistentTaskCommand,
  attempt: number,
  maxAttempts: number,
  attemptAvailable = attempt < maxAttempts,
): PersistentTaskStatus {
  if (command === "pause" && status === "retry_wait") return "paused";
  if (command === "resume" && status === "waiting_user") return "queued";
  if (command === "pause" && status === "running") return "pause_requested";
  if (command === "resume" && status === "paused") return "queued";
  if (command === "cancel") {
    if (status === "queued" || status === "paused" || status === "retry_wait" || status === "waiting_user" || status === "unknown_result") return "cancelled";
    if (status === "running" || status === "pause_requested") {
      return "cancel_requested";
    }
  }
  if (
    command === "retry" &&
    (status === "failed" || status === "blocked") &&
    attemptAvailable
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
  const dailyRuns = createDailyTopicRunService(db,{now});

  async function getOwnedRow(
    ctx: RequestContext,
    taskId: string,
    op: string,
  ): Promise<TaskRow> {
    requireWorkspace(ctx);
    const [row] = await db
      .select()
      .from(executionTasks)
      .where(
        and(
          eq(executionTasks.id, taskId),
          eq(executionTasks.userId, ctx.userId),
          workspaceFilter(executionTasks,ctx),
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
      requireWorkspace(ctx);
      return db.transaction(async tx => {
      const frozen=await lockWorkspaceMembership(tx,ctx);
      if (!input.ownerId || !input.idempotencyKey) {
        throw new ExecutionValidationError(
          "ownerId 与 idempotencyKey 不能为空",
        );
      }
      if (Object.hasOwn(input.payload, "modelIdentity") || Object.hasOwn(input.payload, "__scheduledChild") || Object.hasOwn(input.payload, "parentExecutionTaskId") || Object.hasOwn(input.payload, "researchBlockedAcknowledgedThroughSequence") || Object.hasOwn(input.payload, "researchBlockedAcknowledgedCallIds")) {
        throw new ExecutionValidationError("宿主运行字段不能由入队请求指定");
      }
      const maxAttempts = input.maxAttempts ?? 3;
      if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
        throw new ExecutionValidationError("maxAttempts 必须是正整数");
      }
      const stamp = now();
      const executionBudget = input.executionBudget === undefined ? null : executionBudgetSchema.parse(isContinuousExecutionBudget(input.executionBudget)&&input.maxAttempts!==undefined?{...input.executionBudget,maxAttempts:input.maxAttempts}:input.executionBudget);
      const row = {
        executionBudget,
        deadlineAt: executionBudget === null ? null : executionBudgetDeadline(executionBudget, stamp),
        id: nextId("execution-task"),
        userId: ctx.userId,
        accountId:frozen.accountId,groupId:frozen.groupId,groupVersion:frozen.groupVersion,membershipVersion:frozen.membershipVersion,
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
      const [inserted] = await tx
        .insert(executionTasks)
        .values(row)
        .onConflictDoNothing()
        .returning();
      if (inserted) return toResource(inserted);

      const [existing] = await tx
        .select()
        .from(executionTasks)
        .where(
          and(
            eq(executionTasks.userId, ctx.userId),
            workspaceFilter(executionTasks,ctx),
            eq(executionTasks.kind, input.kind),
            eq(executionTasks.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (!existing && input.kind === "source_sync") {
        // source_sync 有 active-owner 部分唯一索引。手动点击与定时 tick 可能用
        // 不同 idempotencyKey 同时排队；唯一冲突后复用赢家，而不是把正常并发
        // 误报为 500。run 层随后也会按 executionTaskId 复用同一条运行记录。
        const [activeOwnerTask] = await tx
          .select()
          .from(executionTasks)
          .where(
            and(
              eq(executionTasks.userId, ctx.userId),
              workspaceFilter(executionTasks,ctx),
              eq(executionTasks.kind, input.kind),
              eq(executionTasks.ownerType, input.ownerType),
              eq(executionTasks.ownerId, input.ownerId),
              inArray(executionTasks.status, [
                "queued",
                "running",
                "pause_requested",
                "paused",
                "cancel_requested",
              ]),
            ),
          )
          .limit(1);
        if (activeOwnerTask) return toResource(activeOwnerTask);
      }
      // 模型身份、恢复认可等宿主执行状态不改变最初入队请求的幂等身份。
      const existingRequestPayload = {...asPayload(existing?.payload)};
      delete existingRequestPayload.modelIdentity;
      delete existingRequestPayload.researchBlockedAcknowledgedThroughSequence;
      delete existingRequestPayload.researchBlockedAcknowledgedCallIds;
      delete existingRequestPayload.__scheduledChild;
      delete existingRequestPayload.parentExecutionTaskId;
      if (
        !existing ||
        existing.ownerType !== input.ownerType ||
        existing.ownerId !== input.ownerId ||
        stableJson(existingRequestPayload) !== stableJson(input.payload) ||
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
      });
    },

    async get(ctx, taskId) {
      return toResource(
        await getOwnedRow(ctx, taskId, "execution.tasks.getPersistent"),
      );
    },

    async list(ctx, query = {}) {
      requireWorkspace(ctx);
      const filters = [
        eq(executionTasks.userId, ctx.userId),
        workspaceFilter(executionTasks,ctx),
      ];
      if (query.kind) filters.push(eq(executionTasks.kind, query.kind));
      if (query.ownerId) {
        filters.push(eq(executionTasks.ownerId, query.ownerId));
      }
      if (query.status) {
        // 过滤与公开 DTO 的状态投影一致；否则“排队/阻塞”列表会漏掉自动重试和等待用户。
        const projectedStatuses: Partial<Record<PersistentTaskStatus, string[]>> = {
          queued: ["queued", "retry_wait"],
          blocked: ["blocked", "waiting_user", "unknown_result"],
          succeeded: ["succeeded", "partial"],
        };
        filters.push(inArray(executionTasks.status, projectedStatuses[query.status] ?? [query.status]));
      }
      const offset = Math.max(0, query.offset ?? 0);
      const limit = Math.max(1, query.limit ?? 20);
      // 在数据库分页，避免历史任务 payload 撑坏 PGlite 的单次协议响应。
      const [rows, totals] = await Promise.all([
        db.select().from(executionTasks).where(and(...filters))
          .orderBy(desc(executionTasks.priority), desc(executionTasks.createdAt), asc(executionTasks.id))
          .limit(limit).offset(offset),
        db.select({total: sql<number>`count(*)::int`}).from(executionTasks).where(and(...filters)),
      ]);
      return { rows: rows.map(toResource), total: totals[0]?.total ?? 0 };
    },

    async command(ctx, input) {
      await assertWritableWorkspace(db,ctx);
      requireWorkspace(ctx);
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
        const discovered = await tx.select().from(executionTasks).where(and(inArray(executionTasks.id,taskIds),eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx)));
        const lockIds=[...new Set([...taskIds,...discovered.map(scheduledChildId).filter((id):id is string=>Boolean(id))])];
        const rows = await tx
          .select()
          .from(executionTasks)
          .where(
            and(
              inArray(executionTasks.id, lockIds),
              eq(executionTasks.userId, ctx.userId),
              workspaceFilter(executionTasks,ctx),
            ),
          ).orderBy(asc(executionTasks.id)).for("update");
        if (rows.length !== lockIds.length) {
          throw new OwnershipError("Execution task not found");
        }

        const parents=rows.filter(row=>taskIds.includes(row.id)&&scheduledChildId(row));
        for(const parent of parents){const child=rows.find(row=>row.id===scheduledChildId(parent));if(!child||asPayload(child.payload).parentExecutionTaskId!==parent.id)throw new ConflictError('调度链接变更，请重新执行控制命令');assertScheduledChild(parent,child);}
        const effectiveIds=[...new Set(taskIds.map(id=>scheduledChildId(rows.find(row=>row.id===id)!)??id))];
        // 绑定只有开始、核对和取消协议；重开必须终态后用新意图，不借通用控制平行执行扫码。
        if(input.command!=="cancel"&&rows.some(row=>effectiveIds.includes(row.id)&&row.kind==="account_binding")){
          throw new ExecutionValidationError("扫码绑定仅允许取消；完成停止后请重新发起绑定，不支持暂停、继续或重试");
        }
        // 旧素材核对态没有可证明的模型输入/回执，不能通过通用继续或重试获得执行权。
        // 同时覆盖升级前已保存为 waiting_user 的记录；已有候选采纳不经过此控制端口。
        if(input.command==='resume'||input.command==='retry'){
          for(const row of rows.filter(row=>effectiveIds.includes(row.id))){
            const recovery=asPayload(row.payload).assetLegacyRecovery as {mode?:string}|undefined;
            if(recovery?.mode==='review')throw new ConflictError('旧素材提交结果待核对，仅允许取消或采纳已有候选，不能继续或重试');
          }
        }
        const targetById = new Map(
          rows.filter(row=>effectiveIds.includes(row.id)).map((row) => [
            row.id,
            (input.command==='pause' && row.status==='queued' && (parents.some(parent=>scheduledChildId(parent)===row.id) || ['self.traffic','self.metrics'].includes((asPayload(row.payload).modelInput as {kind?:string;sourceKind?:string}|undefined)?.sourceKind??''))) ? 'paused' : commandTarget(
              row.status as PersistentTaskStatus,
              input.command,
              row.attempt,
              row.maxAttempts,
              executionAttemptAvailable(row.executionBudget,row.attempt,row.maxAttempts),
            ),
          ]),
        );
        const stamp = now();
        const updated: TaskRow[] = [];
        for (const taskId of effectiveIds) {
          const target = targetById.get(taskId);
          if (!target) throw new OwnershipError("Execution task not found");
          const previous = rows.find(row => row.id === taskId)!;
          if(input.command==='retry')await dailyRuns.reopenForExecutionRetry(ctx,taskId,tx);
          let acknowledgedPayload: Record<string, unknown> | undefined;
          if (input.command === "resume" && previous.status === "waiting_user") {
            // 与状态变更持有同一execution行锁；仅用户此次明确恢复认可已经发生的阻断。
            const calls = await tx.select().from(executionCalls)
              .where(eq(executionCalls.executionTaskId, taskId)).orderBy(asc(executionCalls.sequence));
            acknowledgedPayload = {...asPayload(previous.payload), researchBlockedAcknowledgedThroughSequence: calls.at(-1)?.sequence ?? 0,
              researchBlockedAcknowledgedCallIds: calls.filter(isAcknowledgableResearchBlock).map(call => call.id)};
          }
          const clearLease =
            target === "queued" ||
            target === "cancelled" ||
            target === "paused";
          const [row] = await tx
            .update(executionTasks)
            .set({
              status: target,
              ...(acknowledgedPayload ? {payload: acknowledgedPayload} : {}),
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
        for(const parent of parents){const child=updated.find(row=>row.id===scheduledChildId(parent))!;const [projected]=await tx.update(executionTasks).set({...scheduledParentProjection(child),updatedAt:stamp}).where(eq(executionTasks.id,parent.id)).returning();updated.push(projected!);}
        return taskIds.map(id=>toResource(updated.find(row=>row.id===id)!));
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
        const filters = [claimableAt(stamp)];
        for(const owner of input.excludeAccounts??[]){
          if(!owner.userId||(!owner.accountId&&!owner.groupId))throw new ExecutionValidationError("排除账号必须有完整属主");
          filters.push(sql`NOT (${executionTasks.userId} = ${owner.userId} AND ${workspaceFilter(executionTasks,{accountId:owner.accountId,groupId:owner.groupId})})`);
        }
        if (input.executionMode === "benchmark.transcribe") filters.push(sql`${executionTasks.kind} = 'ai_task' AND ${executionTasks.payload}->'modelInput'->>'kind' = 'benchmark.transcribe'`);
        if (input.executionMode === "scheduled.flywheel") filters.push(sql`${executionTasks.kind} = 'ai_task' AND ${executionTasks.payload}->'modelInput'->>'kind' = 'scheduled.flywheel'`);
        if (input.executionMode === "chat.run") filters.push(sql`${executionTasks.kind} = 'ai_task' AND ${executionTasks.payload}->'modelInput'->>'kind' = 'chat.run'`);
        if (input.executionMode === "agentic.run") filters.push(sql`${executionTasks.kind} = 'ai_task' AND ${executionTasks.payload}->'modelInput'->>'kind' = 'agentic.run'`);
        if (input.executionMode === "model") filters.push(sql`${executionTasks.kind} = 'ai_task' AND ${executionTasks.payload}->'modelInput'->>'kind' IN ('model.generate','model.structured','asset.generate','transcribe.douyin')`);
        if (input.executionMode === "model.generate") filters.push(sql`${executionTasks.kind} = 'ai_task' AND ${executionTasks.payload}->'modelInput'->>'kind' = 'model.generate'`);
        if (input.kinds) {
          filters.push(inArray(executionTasks.kind, input.kinds));
        }
        // T-937：队列父项只编排已持久化子任务。等待中的最早作品继续占顺序，
        // blocked/paused/cancelled 不阻塞后续；模型子任务使用各自队列，不占父租约。
        if (input.kinds?.length === 1 && input.kinds[0] === "radar_project_upgrade") {
          filters.push(sql`NOT EXISTS (SELECT 1 FROM execution_tasks older
            WHERE older.kind = 'radar_project_upgrade'
              AND older.status IN ('queued','retry_wait','running','pause_requested','cancel_requested')
              AND (older.created_at < ${executionTasks.createdAt}
                OR (older.created_at = ${executionTasks.createdAt} AND older.id < ${executionTasks.id})))`);
        }
        const candidates = await tx
          .select()
          .from(executionTasks)
          .where(and(...filters))
          .orderBy(desc(executionTasks.priority), asc(executionTasks.createdAt), asc(executionTasks.id))
          .limit(1);
        for (const candidate of candidates) {
          try{await assertFrozenWorkspaceMembership(tx,{userId:candidate.userId,groupId:candidate.groupId,accountId:candidate.accountId,groupVersion:candidate.groupVersion,membershipVersion:candidate.membershipVersion},{allowArchived:!!candidate.accountId});}catch(error){await tx.update(executionTasks).set({status:"blocked",lastErrorCode:"STALE_WORKSPACE_MEMBERSHIP",lastErrorMessage:error instanceof Error?error.message:"任务归属已失效",updatedAt:stamp}).where(eq(executionTasks.id,candidate.id));continue;}
          const [claimed] = await tx
            .update(executionTasks)
            .set({
              status: "running",
              leaseOwner: input.workerId,
              fenceToken: randomUUID(),
              leaseExpiresAt,
              heartbeatAt: stamp,
              attempt: sql`${executionTasks.attempt} + 1`,
              updatedAt: stamp,
            })
            .where(
              and(
                eq(executionTasks.id, candidate.id),
                claimableAt(stamp),
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
                fenceToken: claimed.fenceToken!,
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
      return db.transaction(async tx=>{
      const [snapshot]=await tx.select().from(executionTasks).where(and(eq(executionTasks.id,input.taskId),claimableAt(stamp)));
      if(!snapshot)return null;
      try{await assertFrozenWorkspaceMembership(tx,{userId:snapshot.userId,groupId:snapshot.groupId,accountId:snapshot.accountId,groupVersion:snapshot.groupVersion,membershipVersion:snapshot.membershipVersion},{allowArchived:!!snapshot.accountId});}catch(error){await tx.update(executionTasks).set({status:"blocked",lastErrorCode:"STALE_WORKSPACE_MEMBERSHIP",lastErrorMessage:error instanceof Error?error.message:"任务归属已失效",updatedAt:stamp}).where(eq(executionTasks.id,snapshot.id));return null;}
      const [claimed] = await tx
        .update(executionTasks)
        .set({
          status: "running",
          leaseOwner: input.workerId,
          fenceToken: randomUUID(),
          leaseExpiresAt,
          heartbeatAt: stamp,
          attempt: sql`${executionTasks.attempt} + 1`,
          updatedAt: stamp,
        })
        .where(
          and(
            eq(executionTasks.id, input.taskId),
            claimableAt(stamp),
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
          fenceToken: claimed.fenceToken!,
        },
      };
      });
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
            sql`${executionTasks.leaseExpiresAt} > ${stamp}`,
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
      if (current.kind === "ai_task") throw new ConflictError("AI 执行检查点必须使用带 fence 和 revision 的命名端口");
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
      if(input.status==='waiting_user'||input.status==='retry_wait'){
        // 非模型等待门：来源读取，或只串联持久子任务的雷达父项；有调用账本一律不走此门。
        return db.transaction(async tx=>{
          const [row]=await tx.select().from(executionTasks).where(eq(executionTasks.id,input.taskId)).for('update');
          const stamp=now();
          if(!row||!((row.kind==='share_import'&&row.ownerType==='item_import')||(row.kind==='radar_project_upgrade'&&row.ownerType==='item'))||row.status!=='running'||!input.fenceToken||row.fenceToken!==input.fenceToken||row.leaseOwner!==input.workerId||row.attempt!==input.attempt||!row.leaseExpiresAt||Date.parse(row.leaseExpiresAt)<=Date.parse(stamp))throw new ConflictError('任务等待恢复缺少当前执行凭证');
          const calls=await tx.select({id:executionCalls.id}).from(executionCalls).where(eq(executionCalls.executionTaskId,row.id)).limit(1);
          if(calls.length)throw new ConflictError('存在调用账本的任务不能走无副作用读取重试');
          let status:string=input.status,retryAt:string|null=null;
          if(input.status==='retry_wait'){
            if(input.retryAfterMs!==undefined&&(!Number.isFinite(input.retryAfterMs)||input.retryAfterMs<0))throw new ConflictError('任务恢复等待时间非法');
            const delay=row.kind==='radar_project_upgrade'?Math.max(1000,input.retryAfterMs??2000):Math.max(2000*2**Math.min(row.attempt-1,8),input.retryAfterMs??0);
            const next=Date.parse(stamp)+delay;
            const maxCalls=(row.executionBudget as {maxCalls?:number}|null)?.maxCalls;
            const limit=typeof maxCalls==='number'&&Number.isInteger(maxCalls)&&maxCalls>0?Math.min(row.maxAttempts,maxCalls):row.maxAttempts;
            if((!executionAttemptAvailable(row.executionBudget,row.attempt,limit))||(row.deadlineAt!==null&&next>=Date.parse(row.deadlineAt)))status='failed';
            else retryAt=new Date(next).toISOString();
          }
          const [updated]=await tx.update(executionTasks).set({status,retryAt,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,
            lastErrorCode:status==='failed'?'SHARE_READ_RETRY_EXHAUSTED':input.errorCode??null,
            lastErrorMessage:status==='failed'?'分享读取重试次数已用尽，请检查网络或原链接':input.errorMessage??null,updatedAt:stamp,
          }).where(and(eq(executionTasks.id,row.id),eq(executionTasks.fenceToken,input.fenceToken))).returning();
          if(!updated)throw new ConflictError('分享读取恢复时执行凭证已变化');return toResource(updated);
        });
      }
      if(input.fenceToken&&input.fenceToken!==current.fenceToken)throw new ConflictError("任务完成时 fence 已变化");
      const legal =
        current.status === "running" ||
        ((current.status === "pause_requested" ||
          current.status === "cancel_requested") &&
          input.status === "failed" && !(current.kind==='share_import'&&input.fenceToken));
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
            ...(input.fenceToken?[eq(executionTasks.fenceToken,input.fenceToken)]:[]),
          ),
        )
        .returning();
      if (!updated) throw new ConflictError("任务完成时租约已变化");
      return toResource(updated);
    },

    async recoverExpiredLeases(input = {}) {
      const stamp = now();
      const report = {
        requeued: 0,
        unknownResult: 0,
        failed: 0,
        paused: 0,
        cancelled: 0,
      };
      await db.transaction(async (tx) => {
        const expired = await tx
          .select()
          .from(executionTasks)
          .where(
            and(recoveryDueAt(stamp), input.kinds ? inArray(executionTasks.kind, input.kinds) : undefined),
          ).orderBy(asc(executionTasks.id)).for("update");
        for (const row of expired) {
          // 绑定取消须由专属恢复端口确认 owned staging 窗口停止及清理，不能按租约期限假报已取消。
          if(row.kind === "account_binding")continue;
          let target: PersistentTaskStatus | "unknown_result";
          const calls = row.kind === "ai_task" ? await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,row.id)) : [];
          const atomicPending=uncommittedChatTaskCalls(row,calls);
          // 子任务与回执严格同事务；只回收尚未提交的纯事务工具，不重置调用或预算。
          for(const callId of atomicPending){
            await tx.update(executionCalls).set({status:"reserved",startedAttempt:null,updatedAt:stamp}).where(eq(executionCalls.id,callId));
            calls.find(call=>call.id===callId)!.status="reserved";
          }
          const recoverable=recoverableChatNodeParents(row,calls,await tx.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,row.id)));
          const assetCalls=await recoverableAssetCalls({tx,task:row,context:{userId:row.userId,accountId:row.accountId,groupId:row.groupId,requestId:`recovery:${row.id}:${row.attempt}`,source:"ai"}},calls,stamp);
          const completedParents=[...assetCalls,...recoverable.completedHooks,...recoverable.resumableHooks,...recoverable.structured,...recoverable.webReads,...recoverable.scriptDrafts];
          if (row.status === "pause_requested") {
            target = "paused";
          } else if (row.status === "cancel_requested") {
            target = "cancelled";
          } else if (calls.some(call => (call.status === "started" && !completedParents.includes(call.id)) || (call.status === "unknown" && !assetCalls.includes(call.id)))) {
            target = "unknown_result";
          } else if (row.deadlineAt && Date.parse(row.deadlineAt) <= Date.parse(stamp)) {
            target = "failed";
          } else if ((row.payload as {modelInput?:{kind?:string}})?.modelInput?.kind === "asset.generate" && !executionAttemptAvailable(row.executionBudget,row.attempt,row.maxAttempts)) {
            target = "failed";
          } else if (isContinuousExecutionBudget(row.executionBudget) && !executionAttemptAvailable(row.executionBudget,row.attempt,row.maxAttempts)) {
            target = "failed";
          } else if (completedParents.length || calls.some(call => call.status === "settled" && call.resultText)) {
            target = "queued";
          } else if (executionAttemptAvailable(row.executionBudget,row.attempt,row.maxAttempts)) {
            target = "queued";
          } else {
            target = "failed";
          }
          const updated = await tx
            .update(executionTasks)
            .set({
              status: target,
              leaseOwner: null,
              leaseExpiresAt: null,
              heartbeatAt: null,
              ...(target === "unknown_result" ? {lastErrorCode:"CALL_RESULT_UNKNOWN",lastErrorMessage:"已有调用提交结果未知，须同键对账"} : {}),
              ...(target === "failed"
                ? {
                    lastErrorCode: row.deadlineAt && Date.parse(row.deadlineAt) <= Date.parse(stamp) ? "EXECUTION_DEADLINE" : "LEASE_EXPIRED",
                    lastErrorMessage: row.deadlineAt && Date.parse(row.deadlineAt) <= Date.parse(stamp) ? "原任务截止时间已到" : "worker 租约过期且重试预算已耗尽",
                  }
                : {}),
              updatedAt: stamp,
            })
            .where(
              and(
                eq(executionTasks.id, row.id),
                eq(executionTasks.status, row.status),
                eq(executionTasks.attempt, row.attempt),
                recoveryDueAt(stamp),
              ),
            ).returning({id: executionTasks.id});
          if (updated.length) {
            if (target === "queued") report.requeued++;
            else if (target === "paused") report.paused++;
            else if (target === "cancelled") report.cancelled++;
            else if (target === "unknown_result") report.unknownResult++;
            else report.failed++;
          }
        }
      });
      return report;
    },
  };
}
