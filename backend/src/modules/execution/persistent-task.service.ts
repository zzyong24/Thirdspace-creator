import {assertPreparationSource,isPreparationParent,readPreparationParentProof,preparationExclusiveChildIds,preparationGenerationAttemptsExhausted,type PreparationParentProof} from './execution-preparation-parent';
import {inheritExecutionRoute,frozenExecutionRoute,type ExecutionRoute} from '@creatoros/contract/execution-worker';
import {userPreferences,intelligenceSyncRuns,itemSourceObservations} from '@creatoros/backend';
import {createExecutionRoute} from '@creatoros/contract/execution-worker';
import {PRIVATE_COLLECTION_SOURCE_KINDS,assertPrivateCollectorJob,assertExecutionTaskWorkspaceAdmission} from '../scheduling';
import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import {lockWorkspaceMembership,assertFrozenWorkspaceMembership} from "../platform-account/membership-lock.service";
import {executionBudgetSchema, newExecutionBudgetDeadline, isContinuousExecutionBudget, executionAttemptAvailable, type ExecutionBudget} from "@creatoros/contract/execution-worker";
import {recoverableAssetCalls} from "./asset-execution-recovery";
import {executionEvidence} from "../../schema/intelligence";
import {uncommittedChatTaskCalls} from "./chat-task-submission-recovery";
import {recoverableChatNodeParents} from "./chat-generation-recovery";
import {recoverableWorkbenchPlanCalls} from "./workbench-plan-recovery";
import {recoverableBrowserObservationFailures} from "./workbench-browser-observation-recovery";
import {generationReadRecovery,generationReadRecoveryHasFinalResult,recoverableCodexModelCalls,unconfirmedModelCalls,resumableChatModelCalls,recoverableChatModelRetryAnchor,isChatReplayRecoveryError} from "./model-call-recovery";
import {codexReadDeadlineAvailable} from './codex-read-recovery';
import {recoverableCodexProposalParents} from './chat-generation-recovery';
import {createDailyTopicRunService} from "../scheduling";
import {scheduledChildId,assertScheduledChild,scheduledParentProjection} from "./execution-scheduled-child.service";
import { createHash, randomUUID } from "node:crypto";
import {withWorkspaceWrite,type WorkspaceWriteTx} from "../../workspace-write";
import {TRANSCRIBE_COMMAND_RECEIPTS,isTranscribeCommandInput,inspectTranscribeCommand,routeTranscribeCommand,readTranscribeCommandBinding,isTranscribeCommandReplay,appendTranscribeCommandReceipt} from "./transcribe-command-receipt";

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
  executionControlReceipts,
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
  | "project_preparation"
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
 prepareModelAuthority?(ctx:RequestContext,input:EnqueuePersistentTaskInput):Promise<((tx:Db)=>Promise<void>)|undefined>;
  /** 私有同store根快照；已有payload/可信父优先，重放不捕获当前选择。 */
  resolveRootExecutionRoute?(ctx:RequestContext,input:EnqueuePersistentTaskInput,tx:Db):Promise<ExecutionRoute>;
  observeSettlement?: (event:{taskId:string;userId:string;attempt:number;kind:string;status:string;occurredAt:string})=>Promise<void>;
  observeAttempt?: (event: PersistentTaskAttemptObservation) => Promise<void>;
  now?: () => string;
  nextId?: (prefix: string) => string;
}

export type PersistentTaskAttemptObservation = { taskId:string; userId:string; attempt:number; createdAt:string; startedAt:string };
export type PersistentTaskSettlementObservation = { taskId:string; userId:string; attempt:number; kind:string; status:string; occurredAt:string };
type TaskObserver = Pick<PersistentTaskServiceDeps, "observeAttempt" | "observeSettlement">;
type ObserverRegistration = { observer:TaskObserver; pending:Map<string,Promise<void>> };
const taskObservers = new WeakMap<Db, ObserverRegistration>();
/** 由正式装配按Db绑定可选typed事实端口；其它Db/事务不会继承或提前观察。 */
export function registerPersistentTaskObserver(db:Db, observer:TaskObserver) {
  const registration = { observer, pending:new Map<string,Promise<void>>() };
  taskObservers.set(db,registration);
  return {
    drain:async()=>{await Promise.all([...registration.pending.values()]);},
    dispose:()=>{if(taskObservers.get(db)===registration)taskObservers.delete(db);},
  };
}
function queueTaskObservation(db:Db, key:string, invoke:()=>Promise<void>|undefined) {
  const registration = taskObservers.get(db);
  let pending:Promise<void>;
  try {
    const previous = registration?.pending.get(key);
    // 首个claim立即调用端口，可同步pause上报；同attempt结算等待其记录，业务不等待。
    pending = (previous ? previous.then(invoke) : Promise.resolve(invoke())).then(()=>{}).catch(()=>{});
  } catch { return; }
  if(registration) {
    registration.pending.set(key,pending);
    void pending.then(()=>{if(registration.pending.get(key)===pending)registration.pending.delete(key);});
  }
}
export function observeCommittedTaskAttempt(db:Db,event:PersistentTaskAttemptObservation,explicit?:PersistentTaskServiceDeps["observeAttempt"]) {
  const observe = explicit ?? taskObservers.get(db)?.observer.observeAttempt;
  if(observe)queueTaskObservation(db,`${event.taskId}:${event.attempt}`,()=>observe(event));
}
export function observeCommittedTaskSettlement(db:Db,event:PersistentTaskSettlementObservation,explicit?:PersistentTaskServiceDeps["observeSettlement"]) {
  const observe = explicit ?? taskObservers.get(db)?.observer.observeSettlement;
  if(observe)queueTaskObservation(db,`${event.taskId}:${event.attempt}`,()=>observe(event));
}

export interface EnqueuePersistentTaskInput {
  /** 私有宿主父执行权，不进入公共enqueue DTO。缺fence仅兼容原share_import内部lease。 */
  modelRouteParent?:{taskId:string;workerId:string;attempt:number;fenceToken?:string;preparationReferenceId?:string|null};
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
  hasActiveTasks(ctx:RequestContext):Promise<boolean>;
  readObservabilityLedger(ctx:RequestContext,cursor:{updatedAt:string;taskId:string}):Promise<Array<{id:string;user_id:string;kind:string;status:string;attempt:number;created_at:string;updated_at:string}>>;

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
      /** 仅版本端点内部设置；不是客户端授权事实。 */
      receiptProtocol?: "transcribe-command-v1";
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
  recoverExpiredLeases(input?: {kinds?: PersistentTaskKind[];includeSafeUnknownResults?:boolean;taskId?:string}): Promise<{
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
function claimableWithoutPayloadAt(stamp: string) {
  return sql`(${executionTasks.status} = 'queued' OR ${executionTasks.status} = 'retry_wait')
    AND ${executionTasks.kind} <> 'radar_project_upgrade'
    AND (${executionTasks.lastErrorCode} IS DISTINCT FROM 'SYSTEM_UPGRADED')
    AND (${executionTasks.retryAt} IS NULL OR ${executionTasks.retryAt} <= ${stamp})
    AND (${executionTasks.deadlineAt} IS NULL OR ${executionTasks.deadlineAt} > ${stamp})`;
}

function claimableAt(stamp: string) {
  // AND 不保证求值顺序；CASE 避免空闲轮询解压终态历史任务的大 payload。
  return sql`CASE WHEN ${claimableWithoutPayloadAt(stamp)}
    THEN NOT (${executionTasks.payload} ? '__scheduledChild') ELSE false END`;
}

function claimableModeAt(stamp: string, mode: NonNullable<Parameters<PersistentTaskService["claimNext"]>[0]["executionMode"]>) {
  const matchesMode = mode === "model"
    ? sql`${executionTasks.payload}->'modelInput'->>'kind' IN ('model.generate','model.structured','asset.generate','transcribe.douyin','asset.asr')`
    : sql`${executionTasks.payload}->'modelInput'->>'kind' = ${mode}`;
  return sql`${executionTasks.kind} = 'ai_task' AND CASE WHEN ${claimableWithoutPayloadAt(stamp)}
    THEN ${matchesMode} ELSE false END`;
}

function recoveryDueAt(stamp: string, includeSafeUnknownResults=false) {
  const due=sql`((${executionTasks.status} IN ('running','pause_requested','cancel_requested') AND ${executionTasks.leaseExpiresAt} <= ${stamp})
    OR (${executionTasks.status} IN ('pause_requested','cancel_requested') AND (${executionTasks.leaseOwner} IS NULL OR ${executionTasks.leaseExpiresAt} IS NULL))
    OR (${executionTasks.status} IN ('queued','retry_wait') AND ${executionTasks.deadlineAt} <= ${stamp}))`;
  return sql`(${includeSafeUnknownResults?sql`(${due} OR ${executionTasks.status} = 'unknown_result')`:due}) AND ${executionTasks.kind} <> 'radar_project_upgrade' AND ${executionTasks.lastErrorCode} IS DISTINCT FROM 'SYSTEM_UPGRADED'`;
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
  if(status==='cancelled')throw new ConflictError('任务已取消，不能继续或重试，请保留原记录核对');
  if(command==='retry'&&!attemptAvailable)throw new ConflictError('原任务重试次数已用尽，请保留原记录核对');
  throw new ConflictError('任务状态已变化，请重新读取后操作');
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
    async hasActiveTasks(ctx){return (await db.execute(sql`SELECT id FROM execution_tasks WHERE user_id=${ctx.userId} AND status IN('running','pause_requested','cancel_requested') LIMIT 1`)).rows.length>0;},
    async readObservabilityLedger(ctx,cursor){return (await db.execute(sql`SELECT id,user_id,kind,status,attempt,created_at,updated_at FROM execution_tasks WHERE user_id=${ctx.userId} AND (updated_at>${cursor.updatedAt} OR (updated_at=${cursor.updatedAt} AND id>${cursor.taskId})) ORDER BY updated_at,id LIMIT 100`)).rows as Array<{id:string;user_id:string;kind:string;status:string;attempt:number;created_at:string;updated_at:string}>;},
    async enqueue(ctx, input) {
      if(input.kind==="radar_project_upgrade")throw new ConflictError("系统已升级，请重新点击升级为项目");
      requireWorkspace(ctx);
      // 精确重放与可信父路由无需捕获当前模型；只在无路由的新根进行锁前准备。
      const priorRoot=await db.select({id:executionTasks.id}).from(executionTasks).where(and(eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx),eq(executionTasks.kind,input.kind),eq(executionTasks.idempotencyKey,input.idempotencyKey))).limit(1);
      const [routeParent]=input.modelRouteParent?await db.select().from(executionTasks).where(eq(executionTasks.id,input.modelRouteParent.taskId)):[];
      const deferredParent=routeParent&&isPreparationParent(routeParent)&&asPayload(routeParent.payload).executionRoute===undefined;
      const checkModelAuthority=input.kind!=='project_preparation'&&!priorRoot.length&&(!input.modelRouteParent||deferredParent)&&input.payload.executionRoute===undefined?await deps.prepareModelAuthority?.(ctx,input):undefined;
      return db.transaction(async tx => {
      const jobPayload=input.payload.job as {id?:string;sourceKind?:string}|undefined;
      const privateAdmission=input.kind==="automation_sync"&&input.ownerType==="scheduled_job"&&ctx.source==="ingestion"&&!!ctx.groupId&&!!ctx.accountId&&jobPayload?.id===input.ownerId&&PRIVATE_COLLECTION_SOURCE_KINDS.has(jobPayload?.sourceKind??"");
      const frozen=await lockWorkspaceMembership(tx,ctx,{allowArchived:privateAdmission});
      if(privateAdmission){const actual=await assertPrivateCollectorJob(tx as unknown as Db,ctx,input.ownerId,jobPayload!.sourceKind);input={...input,payload:{...input.payload,job:{id:actual.id,accountId:actual.accountId,groupId:actual.groupId,groupVersion:actual.groupVersion,membershipVersion:actual.membershipVersion,sourceKind:actual.sourceKind,target:actual.target??{},schedule:actual.schedule,enabled:actual.enabled}}};}
      if (!input.ownerId || !input.idempotencyKey) {
        throw new ExecutionValidationError(
          "ownerId 与 idempotencyKey 不能为空",
        );
      }
      if (input.kind === "ai_task" && isTranscribeCommandInput(input.payload) && Object.hasOwn(input.payload, TRANSCRIBE_COMMAND_RECEIPTS)) throw new ExecutionValidationError("转写控制回执只能由宿主受理写入");
      if (Object.hasOwn(input.payload,"preparationControl") || Object.hasOwn(input.payload,"generationReadRecovery") || Object.hasOwn(input.payload,"preparationParentProof") || Object.hasOwn(input.payload, "filePredispatchRecoveries") || Object.hasOwn(input.payload, "modelIdentity") || Object.hasOwn(input.payload, "__scheduledChild") || Object.hasOwn(input.payload, "parentExecutionTaskId") || Object.hasOwn(input.payload, "researchBlockedAcknowledgedThroughSequence") || Object.hasOwn(input.payload, "researchBlockedAcknowledgedCallIds")) {
        throw new ExecutionValidationError("宿主运行字段不能由入队请求指定");
      }
      const maxAttempts = input.maxAttempts ?? 3;
      if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
        throw new ExecutionValidationError("maxAttempts 必须是正整数");
      }
      const replay=(existing:typeof executionTasks.$inferSelect)=>{
        // 模型身份、恢复认可等宿主执行状态不改变最初入队请求的幂等身份。
        const existingRequestPayload = {...asPayload(existing?.payload)};
        const preparation=readPreparationParentProof(existing);
        if(preparation&&(input.modelRouteParent?.taskId!==preparation.parentTaskId||(input.modelRouteParent.preparationReferenceId??null)!==preparation.sourceReferenceId))throw new ConflictError('准备子任务与原父不符');
        delete existingRequestPayload.preparationControl;
        delete existingRequestPayload.generationReadRecovery;
        delete existingRequestPayload.preparationParentProof;
        delete existingRequestPayload.modelIdentity;
        // 宿主补的默认冻结值不改变原入队请求；显式父路由仍逐字核验。
        if(input.payload.executionRoute===undefined)delete existingRequestPayload.executionRoute;
        delete existingRequestPayload.filePredispatchRecoveries;
        delete existingRequestPayload.researchBlockedAcknowledgedThroughSequence;
        delete existingRequestPayload.researchBlockedAcknowledgedCallIds;
        delete existingRequestPayload.__scheduledChild;
        delete existingRequestPayload.parentExecutionTaskId;
        if (input.kind === "ai_task" && isTranscribeCommandInput(input.payload)) delete existingRequestPayload[TRANSCRIBE_COMMAND_RECEIPTS];
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
      };
      const [prior]=await tx.select().from(executionTasks).where(and(eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx),eq(executionTasks.kind,input.kind),eq(executionTasks.idempotencyKey,input.idempotencyKey))).limit(1);
      if(prior)return replay(prior);
      const stamp = now();
      let executionBudget = input.executionBudget === undefined ? null : executionBudgetSchema.parse(isContinuousExecutionBudget(input.executionBudget)&&input.maxAttempts!==undefined?{...input.executionBudget,maxAttempts:input.maxAttempts}:input.executionBudget);
      let lockedPreparationParent:typeof executionTasks.$inferSelect|undefined;
      let inheritedDeadlineAt:string|null|undefined;let preparationParentProof:PreparationParentProof|undefined;
      let executionRoute=input.payload.executionRoute===undefined?undefined:frozenExecutionRoute(input.payload);
      if(input.modelRouteParent){
        const proof=input.modelRouteParent;
        const [parent]=await tx.select().from(executionTasks).where(eq(executionTasks.id,proof.taskId)).for('update');
        if(!parent||parent.userId!==ctx.userId||parent.accountId!==frozen.accountId||parent.groupId!==frozen.groupId||parent.groupVersion!==frozen.groupVersion||parent.membershipVersion!==frozen.membershipVersion||parent.status!=='running'||parent.attempt!==proof.attempt||parent.leaseOwner!==proof.workerId||!parent.leaseExpiresAt||!Number.isFinite(Date.parse(parent.leaseExpiresAt))||Date.parse(parent.leaseExpiresAt)<=Date.parse(stamp)||(proof.fenceToken!==undefined?parent.fenceToken!==proof.fenceToken:parent.kind!=='share_import'))throw new ExecutionValidationError('原父执行权失效，不能创建转写子任务');
        if(isPreparationParent(parent)){
          lockedPreparationParent=parent;
          if(!proof.fenceToken)throw new ExecutionValidationError('项目准备子任务缺少fence');
          const reference=await assertPreparationSource(tx,parent,{kind:input.kind,ownerType:input.ownerType,ownerId:input.ownerId,...frozen,payload:input.payload},proof.preparationReferenceId??null);
          const original=executionBudgetSchema.parse(parent.executionBudget),remaining=parent.deadlineAt===null?null:Date.parse(parent.deadlineAt)-Date.parse(stamp);
          if((remaining!==null&&(!Number.isFinite(remaining)||remaining<=0))||(remaining===null&&!isContinuousExecutionBudget(original)))throw new ExecutionValidationError('原准备期限已耗尽');
          executionBudget=executionBudgetSchema.parse({...original,deadlineMs:remaining});inheritedDeadlineAt=parent.deadlineAt;
          preparationParentProof={schemaVersion:1,parentTaskId:parent.id,projectId:parent.ownerId,sourceReferenceId:reference?.id??null,sourceDigest:reference?.sourceDigest??null,exclusive:true};
        }else{
        if(input.kind!=='transcribe'||input.ownerType!=='item'||parent.kind!=='share_import')throw new ExecutionValidationError('父执行与转写子任务类型不符');
        if(parent.deadlineAt!==null&&(!Number.isFinite(Date.parse(parent.deadlineAt))||Date.parse(parent.deadlineAt)<=Date.parse(stamp)))throw new ExecutionValidationError('原父执行期限已耗尽');
        const parentPayload=asPayload(parent.payload);
        if(parent.ownerType!=='item_import'||parentPayload.transcribeAfterImport!==true)throw new ExecutionValidationError('原分享任务没有转录授权');
        if(input.payload.itemId!==input.ownerId)throw new ExecutionValidationError('转写作品与原请求不符');
          // 原同步运行/作品观察是导入事实，不能从链接文本或幂等前缀猜作品。
          const observations=await tx.select({id:itemSourceObservations.id}).from(itemSourceObservations).innerJoin(intelligenceSyncRuns,and(eq(itemSourceObservations.runId,intelligenceSyncRuns.id),eq(itemSourceObservations.sourceId,intelligenceSyncRuns.sourceId))).where(and(eq(intelligenceSyncRuns.executionTaskId,parent.id),eq(intelligenceSyncRuns.userId,parent.userId),workspaceFilter(intelligenceSyncRuns,{accountId:parent.accountId,groupId:parent.groupId}),eq(itemSourceObservations.userId,parent.userId),workspaceFilter(itemSourceObservations,{accountId:parent.accountId,groupId:parent.groupId}),eq(itemSourceObservations.itemId,input.ownerId))).limit(1);
          if(!observations.length)throw new ExecutionValidationError('原分享任务尚未导入此转写作品');
        }
        executionRoute=asPayload(parent.payload).executionRoute===undefined?executionRoute:inheritExecutionRoute(parent.payload);
        if(input.payload.executionRoute!==undefined&&stableJson(input.payload.executionRoute)!==stableJson(executionRoute))throw new ConflictError('指定路由与原父执行不符');
      }
      if(!executionRoute && input.kind!=='project_preparation'){
        await checkModelAuthority?.(tx as unknown as Db);
        if(deps.resolveRootExecutionRoute)executionRoute=frozenExecutionRoute({executionRoute:await deps.resolveRootExecutionRoute(ctx,input,tx as unknown as Db)});
        else{const [preference]=await tx.select().from(userPreferences).where(eq(userPreferences.userId,ctx.userId));executionRoute=createExecutionRoute(preference?.assistantExecutionEngine==='codex'?'codex':'pi');}
      }
      await checkModelAuthority?.(tx as unknown as Db);
      if(lockedPreparationParent&&asPayload(lockedPreparationParent.payload).executionRoute===undefined&&executionRoute)await tx.update(executionTasks).set({payload:{...asPayload(lockedPreparationParent.payload),executionRoute}}).where(eq(executionTasks.id,lockedPreparationParent.id));
      const row = {
        executionBudget,
        deadlineAt: inheritedDeadlineAt!==undefined?inheritedDeadlineAt:executionBudget === null ? null : newExecutionBudgetDeadline(executionBudget, stamp),
        id: nextId("execution-task"),
        userId: ctx.userId,
        accountId:frozen.accountId,groupId:frozen.groupId,groupVersion:frozen.groupVersion,membershipVersion:frozen.membershipVersion,
        kind: input.kind,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        status: "queued",
        priority: input.priority ?? 0,
        idempotencyKey: input.idempotencyKey,
        payload: {...input.payload,...(executionRoute?{executionRoute}:{}),...(preparationParentProof?{preparationParentProof}:{})},
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
      if(!existing)throw new ConflictError('idempotencyKey 已被另一份任务请求使用');
      return replay(existing);
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
      if (input.receiptProtocol !== undefined && input.receiptProtocol !== "transcribe-command-v1") {
        throw new ExecutionValidationError("不支持的转写控制恢复协议");
      }
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
      if (input.receiptProtocol === "transcribe-command-v1" && taskIds.length !== 1) {
        throw new ExecutionValidationError("转写控制恢复协议仅支持单个直接转写任务");
      }
      // SEMANTIC_BOUNDARY_ALLOW: 摘要只核验用户明确命令和目标 ID，不做创作选择。
      const requestDigest=createHash("sha256").update(JSON.stringify({command:input.command,taskIds:[...taskIds].sort()})).digest("hex");
      const accountId=ctx.accountId??null;
      const receiptWhere=and(eq(executionControlReceipts.userId,ctx.userId),workspaceFilter(executionControlReceipts,ctx),eq(executionControlReceipts.idempotencyKey,input.idempotencyKey));
      const restore=(receipt:typeof executionControlReceipts.$inferSelect)=>{
        if(receipt.requestDigest!==requestDigest)throw new ConflictError("同一命令请求号对应不同输入");
        const resources=receipt.result as ExecutionTaskResourceV2[];
        return taskIds.map(id=>{const resource=resources.find(item=>item.id===id);if(!resource)throw new ConflictError("原命令回执缺少目标");return resource;});
      };
      // SEMANTIC_BOUNDARY_ALLOW: 只核对已保存回执的真实目标ID，不分析内容或选择创作结果。
      const selectReceipt=(receipts:Array<typeof executionControlReceipts.$inferSelect>,directTargetId?:string)=>{
        if(!directTargetId)return receipts[0];
        return receipts.find(receipt=>{
          if(!Array.isArray(receipt.result)||receipt.result.length===0)throw new ConflictError("原命令回执缺少真实目标");
          const ids=receipt.result.map((target:unknown)=>{
            if(typeof target!=="object"||target===null||Array.isArray(target)||!("id" in target)||typeof target.id!=="string"||!target.id)throw new ConflictError("原命令回执缺少真实目标");
            return target.id;
          });
          return ids.includes(directTargetId);
        });
      };
      const routeRows=await db.select().from(executionTasks).where(and(inArray(executionTasks.id,taskIds),eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx)));
      if(["retry","resume"].includes(input.command)&&routeRows.some(row=>row.kind==="radar_project_upgrade"||row.lastErrorCode==="SYSTEM_UPGRADED"))throw new ConflictError("系统已升级，请重新点击升级为项目");
      const workspaceWrite=await routeTranscribeCommand(db,ctx,routeRows,taskIds,input.idempotencyKey);
      let committedChanges:TaskRow[]=[];
      let provedDirectReceiptTaskId:string|undefined;
      const execute=async(tx:WorkspaceWriteTx)=>{
        committedChanges=[];
        provedDirectReceiptTaskId=undefined;
        const discovered = await tx.select().from(executionTasks).where(and(inArray(executionTasks.id,taskIds),eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx)));
        if(["retry","resume"].includes(input.command)&&discovered.some(row=>row.kind==="radar_project_upgrade"||row.lastErrorCode==="SYSTEM_UPGRADED"))throw new ConflictError("系统已升级，请重新点击升级为项目");
        const preparationIds=discovered.filter(isPreparationParent).map(row=>row.id);
        const stopping=input.command==='pause'||input.command==='cancel';
        const preparationChildren=stopping&&preparationIds.length?await tx.select().from(executionTasks).where(and(eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx),sql`${executionTasks.payload}->'preparationParentProof'->>'parentTaskId' IN (${sql.join(preparationIds.map(id=>sql`${id}`),sql`,`)})`)):[];
        const exclusive=preparationChildren.filter(child=>readPreparationParentProof(child)?.exclusive===true);
        const lockIds=[...new Set([...taskIds,...exclusive.map(row=>row.id),...discovered.map(scheduledChildId).filter((id):id is string=>Boolean(id))])];
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
        const refreshed=stopping&&preparationIds.length?await tx.select().from(executionTasks).where(and(eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx),sql`${executionTasks.payload}->'preparationParentProof'->>'parentTaskId' IN (${sql.join(preparationIds.map(id=>sql`${id}`),sql`,`)})`)):[];
        if(refreshed.some(row=>readPreparationParentProof(row)?.exclusive&&!lockIds.includes(row.id)))throw new ConflictError('准备子任务集合已改变，请重试原控制命令');
        const controlledChildren=stopping?rows.filter(child=>readPreparationParentProof(child)?.exclusive===true&&preparationIds.includes(readPreparationParentProof(child)!.parentTaskId)).filter(child=>{const proof=readPreparationParentProof(child)!,parent=rows.find(row=>row.id===proof.parentTaskId);if(!parent||parent.ownerId!==proof.projectId||parent.userId!==child.userId||parent.accountId!==child.accountId||parent.groupId!==child.groupId||parent.groupVersion!==child.groupVersion||parent.membershipVersion!==child.membershipVersion||(proof.sourceReferenceId!==null&&!(asPayload(parent.payload).sourceReferenceIds as unknown[]|undefined)?.includes(proof.sourceReferenceId)))throw new ConflictError('准备子任务控制归属不符');return !['succeeded','failed','cancelled','partial'].includes(child.status);}):[];
        const effectiveIds=[...new Set([...taskIds.map(id=>scheduledChildId(rows.find(row=>row.id===id)!)??id),...controlledChildren.map(row=>row.id)])];
        const transcribeBindings=new Map<string,NonNullable<Awaited<ReturnType<typeof readTranscribeCommandBinding>>>>();
        for(const row of rows){if(!inspectTranscribeCommand(row,taskIds,input.idempotencyKey))continue;const bound=await readTranscribeCommandBinding(tx,row,ctx);if(bound)transcribeBindings.set(row.id,bound);}
        const receiptTaskId=taskIds.length===1&&effectiveIds.length===1&&effectiveIds[0]===taskIds[0]&&!parents.length&&!transcribeBindings.get(taskIds[0]!)?.delegated&&transcribeBindings.has(taskIds[0]!)?taskIds[0]:undefined;
        provedDirectReceiptTaskId=receiptTaskId;
        // 先核新协议的真实适用域，再回放已有原意图。
        if (input.receiptProtocol === "transcribe-command-v1" && !receiptTaskId) {
          throw new ExecutionValidationError("转写控制恢复协议仅支持单个直接转写任务");
        }
        // mixed输入若包含已受理原任务，完整target摘要必须一致；不能借批量绕回执。
        for(const bound of transcribeBindings.values()){
          if(isTranscribeCommandReplay(bound,input.idempotencyKey,input.command,taskIds)){if(!workspaceWrite)throw new ConflictError("转写控制回执已改变，请沿原任务回读同一意图");return taskIds.map(target=>toResource(rows.find(row=>row.id===target)!));}
        }
        // 若预查询后真实绑定改变，不在未受workspace写锁保护的事务里新建受理。
        if(receiptTaskId&&!workspaceWrite)throw new ConflictError('转写控制绑定已改变，请沿原任务重试同一意图');
        const receipt=selectReceipt(await tx.select().from(executionControlReceipts).where(receiptWhere),receiptTaskId);
        if(receipt){
          if(input.receiptProtocol==="transcribe-command-v1")throw new ConflictError("原转写命令未保存此版本的受理回执，请保留原任务核对");
          return restore(receipt);
        }
        // 绑定只有开始、核对和取消协议；重开必须终态后用新意图，不借通用控制平行执行扫码。
        if(input.command!=="cancel"&&rows.some(row=>effectiveIds.includes(row.id)&&row.kind==="account_binding")){
          throw new ExecutionValidationError("扫码绑定仅允许取消；完成停止后请重新发起绑定，不支持暂停、继续或重试");
        }
        // 旧素材核对态没有可证明的模型输入/回执，不能通过通用继续或重试获得执行权。
        // 同时覆盖升级前已保存为 waiting_user 的记录；已有候选采纳不经过此控制端口。
        if(input.command==='resume'||input.command==='retry'){
          for(const row of rows.filter(row=>effectiveIds.includes(row.id))){
            if((isPreparationParent(row)||readPreparationParentProof(row))&&row.deadlineAt!==null&&!(Date.parse(row.deadlineAt)>Date.parse(now())))throw new ConflictError('原项目准备期限已耗尽，不能续期');
            const recovery=asPayload(row.payload).assetLegacyRecovery as {mode?:string}|undefined;
            if(recovery?.mode==='review')throw new ConflictError('旧素材提交结果待核对，仅允许取消或采纳已有候选，不能继续或重试');
          }
        }
        const resumeModels=new Map<string,typeof executionCalls.$inferSelect[]>();
        const resumeAnchors=new Map<string,string>();
        const codexReadOnlyResume=new Set<string>();
        const blockedCodexResume=new Set<string>();
        if(input.command==="resume"){
          for(const row of rows.filter(row=>effectiveIds.includes(row.id)&&["paused","unknown_result"].includes(row.status))){
            const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,row.id)).orderBy(asc(executionCalls.sequence));
            const originalNative=recoverableCodexModelCalls(row,calls),pending=calls.filter(call=>['started','unknown'].includes(call.status));
            const codexParents=recoverableCodexProposalParents(row,calls);
            if(generationReadRecoveryHasFinalResult(row,calls)&&row.leaseOwner===null&&row.leaseExpiresAt===null&&codexReadDeadlineAvailable(row,now()))codexReadOnlyResume.add(row.id);
            // 未知工具动作不能借模型恢复许可重放；原预算/期限/尝试次数仍守同一任务。
            if(originalNative.length&&!calls.some(call=>call.status==='reserved')&&pending.every(call=>originalNative.some(native=>native.id===call.id)||codexParents.includes(call.id))&&
              row.leaseOwner===null&&row.leaseExpiresAt===null&&executionAttemptAvailable(row.executionBudget,row.attempt,row.maxAttempts)&&
              codexReadDeadlineAvailable(row,now()))codexReadOnlyResume.add(row.id);
            const frozen=asPayload(row.payload),engine=(frozen.executionRoute as {engine?:string}|undefined)?.engine??(frozen.modelInput as {executionEngine?:string}|undefined)?.executionEngine;
            if((engine==='codex'&&pending.length&&!codexReadOnlyResume.has(row.id))||(generationReadRecovery(row)&&!codexReadOnlyResume.has(row.id)&&!generationReadRecoveryHasFinalResult(row,calls)))blockedCodexResume.add(row.id);
            const safe=resumableChatModelCalls(row,calls);
            if(safe.length)resumeModels.set(row.id,safe);
            else {const anchor=recoverableChatModelRetryAnchor(row,calls);if(anchor)resumeAnchors.set(row.id,anchor.id);}
          }
        }
        for(const row of rows.filter(row=>effectiveIds.includes(row.id))){
          if(['resume','retry'].includes(input.command)&&preparationGenerationAttemptsExhausted(row)&&!codexReadOnlyResume.has(row.id)&&['failed','blocked','waiting_user','paused'].includes(row.status))throw new ConflictError('原任务重试次数已用尽，请保留原记录核对');
        }
        const targetById = new Map(
          rows.filter(row=>effectiveIds.includes(row.id)).map((row) => [
            row.id,
            controlledChildren.some(child=>child.id===row.id)&&((input.command==='pause'&&['paused','pause_requested','cancel_requested','unknown_result'].includes(row.status))||(input.command==='cancel'&&row.status==='cancel_requested'))?row.status as PersistentTaskStatus:
            blockedCodexResume.has(row.id) ? row.status as PersistentTaskStatus :
            (isPreparationParent(row)||controlledChildren.some(child=>child.id===row.id))&&input.command==='cancel'&&row.status==='blocked'?'cancelled':
            input.command==='resume' && ['paused','unknown_result'].includes(row.status) && (resumeModels.has(row.id)||resumeAnchors.has(row.id)||codexReadOnlyResume.has(row.id)) ? 'queued' :
            (input.command==='pause' && ['queued','retry_wait','waiting_user','blocked'].includes(row.status) && (isPreparationParent(row)||controlledChildren.some(child=>child.id===row.id)||parents.some(parent=>scheduledChildId(parent)===row.id) || ['self.traffic','self.metrics'].includes((asPayload(row.payload).modelInput as {kind?:string;sourceKind?:string}|undefined)?.sourceKind??''))) ? 'paused' : commandTarget(
              row.status as PersistentTaskStatus,
              input.command,
              row.attempt,
              row.maxAttempts,
              isPreparationParent(row)||executionAttemptAvailable(row.executionBudget,row.attempt,row.maxAttempts),
            ),
          ]),
        );
        const stamp = now();
        const updated: TaskRow[] = [];
        for (const taskId of effectiveIds) {
          const target = targetById.get(taskId);
          if (!target) throw new OwnershipError("Execution task not found");
          const previous = rows.find(row => row.id === taskId)!;
          const recoveredModels=resumeModels.get(taskId);
          // 不结算未知费用；保留原调用、预留预算及摘要，新租约通过 retryOfCallId 沿原操作键重试。
          if(recoveredModels){
            for(const call of recoveredModels)await tx.update(executionCalls).set({status:"superseded",updatedAt:stamp}).where(eq(executionCalls.id,call.id));
          }
          if(input.command==='retry')await dailyRuns.reopenForExecutionRetry(ctx,taskId,tx);
          let acknowledgedPayload: Record<string, unknown> | undefined;
          if (input.command === "resume" && previous.status === "waiting_user") {
            // 与状态变更持有同一execution行锁；仅用户此次明确恢复认可已经发生的阻断。
            const calls = await tx.select().from(executionCalls)
              .where(eq(executionCalls.executionTaskId, taskId)).orderBy(asc(executionCalls.sequence));
            acknowledgedPayload = {...asPayload(previous.payload), researchBlockedAcknowledgedThroughSequence: calls.at(-1)?.sequence ?? 0,
              researchBlockedAcknowledgedCallIds: calls.filter(isAcknowledgableResearchBlock).map(call => call.id)};
          }
          if(isPreparationParent(previous)&&['resume','retry'].includes(input.command))acknowledgedPayload={...(acknowledgedPayload??asPayload(previous.payload)),preparationControl:{id:input.idempotencyKey,command:input.command,at:stamp}};
          if(taskId===receiptTaskId){
            acknowledgedPayload=appendTranscribeCommandReceipt(transcribeBindings.get(taskId)!,acknowledgedPayload??asPayload(previous.payload),input.idempotencyKey,input.command,taskIds,previous.attempt,stamp);
          }
          const clearLease =
            target === "queued" ||
            target === "cancelled" ||
            target === "paused";
          const [row] = await tx
            .update(executionTasks)
            .set({
              status: target,
              ...(isPreparationParent(previous)&&target==='queued'?{retryAt:null}:{}),
              ...(recoveredModels ? {retryOfCallId:recoveredModels.at(-1)!.id,lastErrorCode:null,lastErrorMessage:null} : {}),
              ...(resumeAnchors.has(taskId)?{retryOfCallId:resumeAnchors.get(taskId)!,lastErrorCode:null,lastErrorMessage:null}:{}),
              ...(codexReadOnlyResume.has(taskId)?{lastErrorCode:null,lastErrorMessage:null}:{}),
              ...(acknowledgedPayload ? {payload: acknowledgedPayload} : {}),
              ...(clearLease
                ? {
                    leaseOwner: null,
                    leaseExpiresAt: null,
                    heartbeatAt: null,
                  }
                : {}),
              ...(target === "queued"
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
        committedChanges=updated;
        const result=taskIds.map(id=>toResource(updated.find(row=>row.id===id)!));
        if(!receiptTaskId)await tx.insert(executionControlReceipts).values({id:nextId("control-receipt"),userId:ctx.userId,accountId,groupId:ctx.groupId??null,idempotencyKey:input.idempotencyKey,requestDigest,result,createdAt:stamp});
        return result;
      };
      const committed=async(operation:()=>Promise<ExecutionTaskResourceV2[]>)=>{
        const result=await operation();
        for(const row of committedChanges)observeCommittedTaskSettlement(db,{taskId:row.id,userId:row.userId,attempt:row.attempt,kind:row.kind,status:row.status,occurredAt:row.updatedAt},deps.observeSettlement);
        return result;
      };
      try{return await committed(()=>workspaceWrite?withWorkspaceWrite(db,ctx,execute):db.transaction(execute));}catch(error){
        // 唯一冲突后事务已回滚；重新鉴权再恢复真实赢家，不重复执行命令。
        const owned=await db.select({id:executionTasks.id}).from(executionTasks).where(and(inArray(executionTasks.id,taskIds),eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx)));
        if(owned.length!==taskIds.length)throw new OwnershipError("Execution task not found");
        const winner=selectReceipt(await db.select().from(executionControlReceipts).where(receiptWhere),provedDirectReceiptTaskId);
        if(winner){
          if(workspaceWrite)return committed(()=>withWorkspaceWrite(db,ctx,execute));
          if(input.receiptProtocol==="transcribe-command-v1")return committed(()=>db.transaction(execute));
          return restore(winner);
        }
        throw error;
      }
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
        if (input.executionMode) filters.push(claimableModeAt(stamp, input.executionMode));
        if (input.kinds) {
          filters.push(inArray(executionTasks.kind, input.kinds));
        }
        const candidates = await tx
          .select()
          .from(executionTasks)
          .where(and(...filters))
          .orderBy(desc(executionTasks.priority), asc(executionTasks.createdAt), asc(executionTasks.id))
          .limit(1);
        for (const candidate of candidates) {
          try{await assertExecutionTaskWorkspaceAdmission(tx,candidate);}catch(error){await tx.update(executionTasks).set({status:"blocked",lastErrorCode:"STALE_WORKSPACE_MEMBERSHIP",lastErrorMessage:error instanceof Error?error.message:"任务归属已失效",updatedAt:stamp}).where(eq(executionTasks.id,candidate.id));continue;}
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
      }).then(result=>{if(result){observeCommittedTaskAttempt(db,{taskId:result.task.id,userId:result.task.userId,attempt:result.lease.attempt,createdAt:result.task.createdAt,startedAt:stamp},deps.observeAttempt);}return result;});
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
      try{await assertExecutionTaskWorkspaceAdmission(tx,snapshot);}catch(error){await tx.update(executionTasks).set({status:"blocked",lastErrorCode:"STALE_WORKSPACE_MEMBERSHIP",lastErrorMessage:error instanceof Error?error.message:"任务归属已失效",updatedAt:stamp}).where(eq(executionTasks.id,snapshot.id));return null;}
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
      }).then(result=>{if(result){observeCommittedTaskAttempt(db,{taskId:result.task.id,userId:result.task.userId,attempt:result.lease.attempt,createdAt:result.task.createdAt,startedAt:stamp},deps.observeAttempt);}return result;});
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
      observeCommittedTaskSettlement(db,{taskId:updated.id,userId:updated.userId,attempt:updated.attempt,kind:updated.kind,status:updated.status,occurredAt:updated.updatedAt},deps.observeSettlement);
      return toResource(updated);
    },

    async finish(input) {
      const current = await getWorkerRow(input);
      if(input.status==='waiting_user'||input.status==='retry_wait'){
        // 无调用账本等待门：来源读取、项目准备与尚未发出模型调用的连续生成任务。
        // 生成一旦有调用事实，必须走 execution-worker-outcome 的拒绝/未知判定，不能绕账本重试。
        return db.transaction(async tx=>{
          const [row]=await tx.select().from(executionTasks).where(eq(executionTasks.id,input.taskId)).for('update');
          const stamp=now();
          const sourceRead=row?.kind==='share_import'&&row.ownerType==='item_import';
          const preparationParent=Boolean(row&&isPreparationParent(row));
          const continuousGeneration=Boolean(row&&((row.kind==='topic_preview'&&['transform','project'].includes(row.ownerType))||(row.kind==='script_candidate'&&row.ownerType==='project'))&&isContinuousExecutionBudget(row.executionBudget));
          const preparationGeneration=Boolean(row&&row.kind==='topic_preview'&&readPreparationParentProof(row));
          if(!row||!(sourceRead||continuousGeneration||preparationParent||(preparationGeneration&&input.status==='waiting_user'))||row.status!=='running'||!input.fenceToken||row.fenceToken!==input.fenceToken||row.leaseOwner!==input.workerId||row.attempt!==input.attempt||!row.leaseExpiresAt||Date.parse(row.leaseExpiresAt)<=Date.parse(stamp))throw new ConflictError('任务等待恢复缺少当前执行凭证');
          const calls=await tx.select({id:executionCalls.id}).from(executionCalls).where(eq(executionCalls.executionTaskId,row.id)).limit(1);
          if(calls.length)throw new ConflictError('存在调用账本的任务不能走无副作用读取重试');
          let status:string=input.status,retryAt:string|null=null;
          if(input.status==='retry_wait'){
            if(input.retryAfterMs!==undefined&&(!Number.isFinite(input.retryAfterMs)||input.retryAfterMs<0))throw new ConflictError('任务恢复等待时间非法');
            const delay=continuousGeneration||preparationParent?Math.max(1000,input.retryAfterMs??1000):Math.max(2000*2**Math.min(row.attempt-1,8),input.retryAfterMs??0);
            const next=Date.parse(stamp)+delay;
            const maxCalls=(row.executionBudget as {maxCalls?:number}|null)?.maxCalls;
            const limit=typeof maxCalls==='number'&&Number.isInteger(maxCalls)&&maxCalls>0?Math.min(row.maxAttempts,maxCalls):row.maxAttempts;
            if(preparationGenerationAttemptsExhausted(row)||(!preparationParent&&!executionAttemptAvailable(row.executionBudget,row.attempt,limit))||(row.deadlineAt!==null&&next>=Date.parse(row.deadlineAt)))status='failed';
            else retryAt=new Date(next).toISOString();
          }
          if(input.status==='waiting_user'&&preparationGenerationAttemptsExhausted(row))status='failed';
          const generationExhausted=status==='failed'&&preparationGenerationAttemptsExhausted(row);
          const [updated]=await tx.update(executionTasks).set({status,retryAt,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,
            lastErrorCode:status==='failed'?(generationExhausted?'GENERATION_RECOVERY_EXHAUSTED':preparationParent?'EXECUTION_DEADLINE':continuousGeneration?'GENERATION_RECOVERY_EXHAUSTED':'SHARE_READ_RETRY_EXHAUSTED'):input.errorCode??null,
            lastErrorMessage:status==='failed'?(generationExhausted?`原任务生成重试次数已用尽，已停止自动重试${input.status==='waiting_user'&&input.errorMessage?`；${input.errorMessage}`:''}`:preparationParent?'原项目准备截止时间已到':continuousGeneration?'生成恢复策略已停止，请保留原任务并查看诊断':'分享读取重试次数已用尽，请检查网络或原链接'):input.errorMessage??null,updatedAt:stamp,
          }).where(and(eq(executionTasks.id,row.id),eq(executionTasks.fenceToken,input.fenceToken))).returning();
          if(!updated)throw new ConflictError('分享读取恢复时执行凭证已变化');return toResource(updated);
        }).then(result=>{observeCommittedTaskSettlement(db,{taskId:result.id,userId:result.userId,attempt:result.attempt,kind:result.kind,status:result.runtimeStatus??result.status,occurredAt:result.updatedAt},deps.observeSettlement);return result;});
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
      const generationExhausted=input.status==='failed'&&preparationGenerationAttemptsExhausted(current);
      const [updated] = await db
        .update(executionTasks)
        .set({
          status: input.status,
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          lastErrorCode:
            generationExhausted?'GENERATION_RECOVERY_EXHAUSTED':input.status === "succeeded" ? null : (input.errorCode ?? null),
          lastErrorMessage:
            generationExhausted?'原任务生成重试次数已用尽，已停止自动重试':input.status === "succeeded" ? null : (input.errorMessage ?? null),
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
      observeCommittedTaskSettlement(db,{taskId:updated.id,userId:updated.userId,attempt:updated.attempt,kind:updated.kind,status:updated.status,occurredAt:updated.updatedAt},deps.observeSettlement);
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
      const recoveredChanges:PersistentTaskSettlementObservation[]=[];
      await db.transaction(async (tx) => {
        const expired = await tx
          .select()
          .from(executionTasks)
          .where(
            and(recoveryDueAt(stamp,input.includeSafeUnknownResults), input.kinds ? inArray(executionTasks.kind, input.kinds) : undefined, input.taskId ? eq(executionTasks.id,input.taskId) : undefined),
          ).orderBy(asc(executionTasks.id)).for("update");
        for (const row of expired) {
          // 绑定取消须由专属恢复端口确认 owned staging 窗口停止及清理，不能按租约期限假报已取消。
          if(row.kind === "account_binding")continue;
          let target: PersistentTaskStatus | "unknown_result";
          const calls = ["ai_task","topic_preview","script_candidate","project_preparation"].includes(row.kind) ? await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,row.id)) : [];
          // 丢锚路径在专用helper核验租约；不以该新增门替代计划/产物等既有专用恢复证明。
          const retryAnchor=recoverableChatModelRetryAnchor(row,calls);
          const lastPhysical=calls.slice().sort((a,b)=>a.sequence-b.sequence).at(-1);
          const needsChatAnchor=(asPayload(row.payload).modelInput as {kind?:string}|undefined)?.kind==="chat.run"&&
            (isChatReplayRecoveryError(row.lastErrorCode)||(lastPhysical?.kind==="model"&&lastPhysical.status==="superseded"));
          // 已有started/unknown继续走下方原专用恢复；本门只处理不再有在途事实的丢锚族。
          if(row.status==="unknown_result"&&needsChatAnchor&&!retryAnchor&&!calls.some(call=>call.status==="started"||call.status==="unknown"))continue;
          // Only proven observation protocols can close a missing read receipt.
          // Preserve the original call and unknown evidence; never repeat I/O.
          for(const recovered of await recoverableBrowserObservationFailures(row,calls,stamp)){
            const patch={status:"settled",resultText:recovered.resultText,totalTokens:0,usage:{totalTokens:0},updatedAt:stamp};
            const [updated]=await tx.update(executionCalls).set(patch).where(and(eq(executionCalls.id,recovered.call.id),
              eq(executionCalls.executionTaskId,row.id),eq(executionCalls.status,recovered.call.status),
              eq(executionCalls.toolExecutionClaimId,recovered.call.toolExecutionClaimId!),eq(executionCalls.inputDigest,recovered.call.inputDigest))).returning();
            if(updated)Object.assign(recovered.call,updated);
          }
          const atomicPending=uncommittedChatTaskCalls(row,calls);
          // 子任务与回执严格同事务；只回收尚未提交的纯事务工具，不重置调用或预算。
          for(const callId of atomicPending){
            await tx.update(executionCalls).set({status:"reserved",startedAttempt:null,updatedAt:stamp}).where(eq(executionCalls.id,callId));
            calls.find(call=>call.id===callId)!.status="reserved";
          }
          // 计划只有本地 CAS 写入；严格核对冻结定义、原模型提案与现存计划后，
          // 由新租约沿原调用重放。清除旧执行 claim，其他未知工具保持待对账。
          for(const callId of await recoverableWorkbenchPlanCalls(row,calls,stamp)){
            const patch={status:"reserved",startedAttempt:null,toolExecutionClaimId:null,updatedAt:stamp};
            await tx.update(executionCalls).set(patch).where(eq(executionCalls.id,callId));
            Object.assign(calls.find(call=>call.id===callId)!,patch);
          }
          // 文本模型只产候选，没有业务副作用。进程退出时未能结算的模型调用可在
          // 原操作键上记为 superseded，再由重试预算控制续跑；工具和异步 provider job
          // 仍须保持未知并按原键对账。
          const originalRetryOfCallId=row.retryOfCallId;
          const safeModels=["running","unknown_result"].includes(row.status)?unconfirmedModelCalls(row,calls):[];
          const safeModelStatuses=new Map(safeModels.map(call=>[call.id,call.status]));
          const safeModelIds=new Set(safeModels.map(call=>call.id));
          for(const call of safeModels)call.status="superseded";
          if(safeModels.length)row.retryOfCallId=safeModels.sort((a,b)=>a.sequence-b.sequence).at(-1)!.id;
          let recoverable=recoverableChatNodeParents(row,calls,await tx.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,row.id)));
          const assetCalls=await recoverableAssetCalls({tx,task:row,context:{userId:row.userId,accountId:row.accountId,groupId:row.groupId,requestId:`recovery:${row.id}:${row.attempt}`,source:"ai"}},calls,stamp);
          let completedParents=[...assetCalls,...recoverable.completedHooks,...recoverable.resumableHooks,...recoverable.structured,...recoverable.webReads,...recoverable.scriptDrafts];
          const unsafeUnknown=calls.some(call=>(call.status==="started"||call.status==="unknown")&&!safeModelIds.has(call.id)&&!completedParents.includes(call.id));
          const recoveredModels=safeModels.length>0&&!unsafeUnknown;
          if(recoveredModels){
            for(const call of safeModels)await tx.update(executionCalls).set({status:"superseded",updatedAt:stamp}).where(eq(executionCalls.id,call.id));
          }else if(safeModels.length){
            for(const call of safeModels)call.status=safeModelStatuses.get(call.id)!;
            row.retryOfCallId=originalRetryOfCallId;
            recoverable=recoverableChatNodeParents(row,calls,await tx.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,row.id)));
            completedParents=[...assetCalls,...recoverable.completedHooks,...recoverable.resumableHooks,...recoverable.structured,...recoverable.webReads,...recoverable.scriptDrafts];
          }
          // 外部副作用仍有 started/unknown 回执时继续等待专用对账。专用对账已经把原调用
          // 结算后，允许同一任务重新入队；否则产物虽已恢复，Agent loop 仍会永久停住。
          const unresolvedCalls=calls.some(call=>call.status==="started"||call.status==="unknown");
          const nativeReads=recoverableCodexModelCalls(row,calls);
          const nativeReadIds=new Set(nativeReads.map(call=>call.id));
          const codexParents=recoverableCodexProposalParents(row,calls);
          const codexReadOnly=nativeReads.length>0&&!calls.some(call=>call.status==='reserved')&&calls.every(call=>!['started','unknown'].includes(call.status)||nativeReadIds.has(call.id)||codexParents.includes(call.id)||completedParents.includes(call.id))&&
            codexReadDeadlineAvailable(row,stamp)&&executionAttemptAvailable(row.executionBudget,row.attempt,row.maxAttempts);
          if(row.status==="unknown_result"&&!recoveredModels&&unresolvedCalls&&!codexReadOnly)continue;

          if (row.status === "pause_requested") {
            target = "paused";
          } else if (row.status === "cancel_requested") {
            target = "cancelled";
          } else if (codexReadOnly) {
            target="queued";
          } else if (calls.some(call => (call.status === "started" && !completedParents.includes(call.id)) || (call.status === "unknown" && !assetCalls.includes(call.id)))) {
            target = "unknown_result";
          } else if (row.deadlineAt && Date.parse(row.deadlineAt) <= Date.parse(stamp)) {
            target = "failed";
          } else if(generationReadRecovery(row)&&!generationReadRecoveryHasFinalResult(row,calls)){
            target='unknown_result';
          } else if(isPreparationParent(row)&&calls.length===0){
            target='queued';
          } else if(generationReadRecoveryHasFinalResult(row,calls)){
            // 只恢复已结算的原结果，不取得新模型提交权，也不重置原期限。
            target='queued';
          } else if(preparationGenerationAttemptsExhausted(row)){
            target='failed';
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
              ...(target === "queued" && recoveredModels ? {retryOfCallId:row.retryOfCallId,lastErrorCode:null,lastErrorMessage:null} : {}),
              ...(target === "queued" && retryAnchor ? {retryOfCallId:retryAnchor.id,lastErrorCode:null,lastErrorMessage:null} : {}),
              ...(target === "unknown_result" ? {lastErrorCode:"CALL_RESULT_UNKNOWN",lastErrorMessage:"已有调用提交结果未知，须同键对账"} : {}),
              ...(target === "failed"
                ? {
                    lastErrorCode: row.deadlineAt && Date.parse(row.deadlineAt) <= Date.parse(stamp) ? "EXECUTION_DEADLINE" : preparationGenerationAttemptsExhausted(row)?'GENERATION_RECOVERY_EXHAUSTED':"LEASE_EXPIRED",
                    lastErrorMessage: row.deadlineAt && Date.parse(row.deadlineAt) <= Date.parse(stamp) ? "原任务截止时间已到" : "原执行已停止且重试次数已用尽，请保留原记录核对",
                  }
                : {}),
              updatedAt: stamp,
            })
            .where(
              and(
                eq(executionTasks.id, row.id),
                eq(executionTasks.status, row.status),
                eq(executionTasks.attempt, row.attempt),
                recoveryDueAt(stamp,input.includeSafeUnknownResults),
              ),
            ).returning({id: executionTasks.id});
          if (updated.length) {
            recoveredChanges.push({taskId:row.id,userId:row.userId,attempt:row.attempt,kind:row.kind,status:target,occurredAt:stamp});
            if (target === "queued") report.requeued++;
            else if (target === "paused") report.paused++;
            else if (target === "cancelled") report.cancelled++;
            else if (target === "unknown_result") report.unknownResult++;
            else report.failed++;
          }
        }
      });
      for(const event of recoveredChanges)observeCommittedTaskSettlement(db,event,deps.observeSettlement);
      return report;
    },
  };
}
