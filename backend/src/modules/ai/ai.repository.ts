import {assertPrivateCollectorJob,assertAiTaskWorkspaceAdmission} from '../scheduling';
import {withWorkspaceParentWrite,withWorkspaceWrite} from "../../workspace-write";
import {projects,contentOutputs,assertWritableWorkspace} from "@creatoros/backend";
import {workspaceFilter,workspaceStamp} from "../../workspace-scope";
import {lockWorkspaceMembership} from "../platform-account/membership-lock.service";
import { and, asc, desc, eq, isNull, like, sql, type Db } from "@creatoros/backend";
// [DATA-H07] 跨模块表(assets)—— canonical 定义在共享基座 @creatoros/backend(与 T-102
// projects.repository 级联删除同一先例):AI 生成资产的「采纳翻 active / 拒绝清理」是 AI 采纳门
// 的生命周期职责,但组合根(persistence-client)本波冻结、无法新增 assets 端口 —— 故按 T-102
// 裁决的既有范式,在本模块 repository 内经共享 schema 直写 assets 行(只碰 status/deleted_at/
// account_id 三列,不动 assets 模块的服务/契约)。
import { assets } from "@creatoros/backend";
import {
  aiConversations,
  aiMessages,
  aiTasks,
  aiTaskReferences,
  aiTaskResults,
  aiTaskSteps,
  agentConfigurations,
  modelConfigurations,
} from "./ai.db-schema";
import { OwnershipError } from "./ai.errors";

// AI repository (foundation §5.2) — user-scoped queries ONLY. `userId` is baked into
// deps (mirrors the learnings/reviews repos): EVERY read/write of an owned-root row
// (ai_conversations / ai_tasks / agent_configurations / model_configurations) filters
// eq(table.userId, deps.userId) and stamps userId on insert. Child tables
// (ai_messages / ai_task_references / ai_task_results) carry no user_id — they are
// reachable ONLY through the private ownership gates requireConversation / requireTask,
// which filter eq(parent.userId, deps.userId) and throw OwnershipError (→ 404) for a
// cross-user / unknown id BEFORE any child row is revealed. The repository executes only
// service-approved writes — the AI Task state-machine guard lives in the service
// (SPEC §12).

export type ConversationRow = typeof aiConversations.$inferSelect;
export type MessageRow = typeof aiMessages.$inferSelect;
export type TaskRow = typeof aiTasks.$inferSelect;

// [T-248 批C] PendingTopicReviewRow / findLatestPendingTopicReview 已删 ——
// 唯一消费方 op ai.tasks.pending_topic_review 随 T-060 弹窗任务流退役而移除。
export type ReferenceRow = typeof aiTaskReferences.$inferSelect;
export type ResultRow = typeof aiTaskResults.$inferSelect;
export type StepRow = typeof aiTaskSteps.$inferSelect;
export type AgentConfigRow = typeof agentConfigurations.$inferSelect;
export type ModelConfigRow = typeof modelConfigurations.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
  // [T-332 S2 · ISO-02/03] 第二所有权维度,**必填 strict**:owned-root ai_conversations /
  // ai_tasks 恒叠号门(无「无号 → 退化全量」分支;未选号在 service 入口 requireAccountId
  // 就被拒,SPEC §4.2 / C-07:0 号禁建会话与任务)。子表经父门透传。
  // ⚠️ model_configurations / agent_configurations 是「用户级」模型/密钥配置(跨号共享,
  // 非号级资源),故不叠号门(见文件尾注)。
  accountId: string | null;
  groupId?: string | null;
  membershipVersion?: number;
  scheduledCollectorJobId?:string;
}

export interface CreateConversationInput {
  title: string;
  projectId: string | null;
  // T-096 会话作用域(SPEC 2026-07-03 §1.3)。缺省 'global'(与列 DEFAULT 一致)。
  scope?: string;
}

export interface CreateMessageInput {
  role: string;
  content: string;
  // [T-128] useChat UIMessage parts(text + tool-result 部件)。缺省 [](用户消息/旧调用无部件,
  // 恢复时前端 toUIMessages 回落 content 文本气泡)。assistant 回复带完整 parts → 卡刷新可重渲。
  parts?: unknown[];
  attachments: string[];
  modelMetadata: Record<string, unknown>;
  // [T-239e] 用量可见(additive,可选):assistant 行的 token 计数 + 本轮实际模型 id。
  // 缺省/null → 列落 NULL(user 行/无 usage 的老调用兼容)。
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    cachedTokens?: number | null;
  } | null;
  modelKey?: string | null;
}

export interface CreateTaskInput {
  projectId: string | null;
  contentOutputId: string | null;
  taskType: string;
  inputData: Record<string, unknown>;
  runtimeData?: Record<string, unknown>;
  modelKey: string;
  idempotencyKey: string;
  attemptId?: string;
  requestFingerprint?: string;
  retryOfTaskId?: string | null;
  requestedAt: string;
}

export interface ReferenceInput {
  entityType: string;
  entityId: string;
  relationType: string;
}

export interface InsertResultInput {
  aiTaskId: string;
  resultType: string;
  artifactId: string | null;
  knowledgeItemId: string | null;
  assetId: string | null;
  resultData: Record<string, unknown>;
}

export interface InsertStepInput {
  aiTaskId: string;
  stepNo: number;
  kind: string; // step | tool_call | final
  text: string;
  toolCalls: unknown[];
}

export interface TaskStatusPatch {
  status?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  errorMessage?: string | null;
  sessionId?: string | null;
  costUsd?: number | null;
}

export interface TaskExecutionClaim {
  task: TaskRow;
  leaseToken: string;
  leaseExpiresAt: string;
}

export interface CompleteTaskExecutionInput {
  status: "succeeded" | "failed" | "cancelled" | "awaiting_confirmation";
  completedAt?: string | null;
  errorMessage?: string | null;
}

export interface AiRepository {
  // Fixture/seed hydration (onConflictDoNothing parity).
  seedAgentConfigs(rows: AgentConfigRow[]): Promise<void>;
  seedModelConfigs(rows: ModelConfigRow[]): Promise<void>;

  // T-096:scope 传了按作用域过滤(入口级历史隔离,内层于 user ownership 门);不传全量(旧调用不破)。
  listConversations(page: {
    limit: number;
    offset: number;
    scope?: string;
  }): Promise<{ rows: ConversationRow[]; total: number }>;
  createConversation(input: CreateConversationInput): Promise<ConversationRow>;
  requireConversation(conversationId: string): Promise<ConversationRow>;
  createMessage(
    conversationId: string,
    input: CreateMessageInput,
  ): Promise<MessageRow>;
  listMessages(conversationId: string): Promise<MessageRow[]>;

  listTasks(page: {
    limit: number;
    offset: number;
    // [T-116c] additive 读过滤(纯读):可选 projectId + taskType,都不传维持全量馈。
    projectId?: string;
    taskType?: string;
    // [T-255a] additive 前缀过滤(纯读):执行层任务命名空间窄化(`exec.` 开头)。
    taskTypePrefix?: string;
  }): Promise<{ rows: TaskRow[]; total: number }>;
  findTaskByIdempotencyKey(idempotencyKey: string): Promise<TaskRow | null>;
  findTaskByAttempt(taskType: string, attemptId: string): Promise<TaskRow | null>;
  /** [T-332 S2 修补] 系统级 sweep 专用:跨账号列该 user 所有 status='running' 的 ai_task
   *  最小投影(启动扫僵尸 sweepStaleAiTasks 用)。**不叠账号门** —— 扫僵尸是系统 daemon
   *  路径(schedulerCtx 无选中号),与 scheduling.listRunsByStatus 同族;用户面 listTasks
   *  仍 strict 按号。 */
  listRunningTasksSystem(): Promise<
    {
      id: string;
      accountId: string|null;
      groupId?:string|null;
      taskType: string;
      startedAt: string | null;
      requestedAt: string;
    }[]
  >;
  createTask(input: CreateTaskInput): Promise<TaskRow>;
  createTaskIfAbsent(input: CreateTaskInput): Promise<TaskRow | null>;
  requireTask(taskId: string): Promise<TaskRow>;
  claimAiTaskExecution(
    taskId: string,
    input: { workerId: string; leaseToken: string; leaseSeconds: number },
  ): Promise<TaskExecutionClaim | null>;
  beginModelCall(taskId: string, leaseToken: string): Promise<boolean>;
  renewAiTaskExecution(
    taskId: string,
    leaseToken: string,
    extendSeconds: number,
  ): Promise<{ leaseExpiresAt: string } | null>;
  completeAiTaskExecution(
    taskId: string,
    leaseToken: string,
    input: CompleteTaskExecutionInput,
  ): Promise<boolean>;
  recordCandidateUnmapped(taskId: string, input: Omit<InsertResultInput, "aiTaskId">): Promise<TaskRow | null>;
  recordCandidateWithLease(
    taskId: string,
    leaseToken: string,
    input: Omit<InsertResultInput, "aiTaskId">,
  ): Promise<TaskRow | null>;
  reconcileExpiredAiTaskExecution(
    taskId: string,
    leaseToken: string,
  ): Promise<"requeued" | "reconciliation_required" | null>;
  addReferences(taskId: string, refs: ReferenceInput[]): Promise<void>;
  listReferences(taskId: string): Promise<ReferenceRow[]>;
  updateTaskStatus(taskId: string, patch: TaskStatusPatch): Promise<TaskRow>;
  updateMappedTaskStatus(taskId: string, executionTaskId: string, expectedStatus: TaskRow["status"], patch: TaskStatusPatch): Promise<TaskRow | null>;
  updateUnboundTaskStatus(taskId: string, expectedStatus: TaskRow["status"], patch: TaskStatusPatch): Promise<TaskRow | null>;
  /** server-only 运行态补丁；不得投影到 task DTO/transport。 */
  patchTaskRuntimeData(
    taskId: string,
    runtimeData: Record<string, unknown>,
  ): Promise<void>;
  insertResult(rec: InsertResultInput): Promise<ResultRow>;
  getResult(resultId: string): Promise<ResultRow>;
  listResults(taskId: string): Promise<ResultRow[]>;
  /** CollabField:用人编辑后的 items 替换最新结果的 result_data.items(采纳前可改/删)。 */
  patchLatestResultItems(taskId: string, items: unknown[]): Promise<ResultRow>;
  /** [DATA-H06] 逐项幂等采纳:把已采纳的稳定键追加进某结果行的 result_data.adoptedKeys(去重)。
   *  确认门逐条落库时,失败重试据此跳过已采纳项 —— 保证「第 N 条失败后重试不重复前 N-1 条」。
   *  ownership 经父任务门(与 getResult 同款透传属主),跨用户/未知 id → OwnershipError。 */
  recordAdoptedKey(resultId: string, key: string): Promise<void>;
  /** [DATA-H07] 采纳门翻转:AI 生成资产 pending → active(+ stamp 当前号,镜像 assets 模块
   *  commitPendingAsset 语义)。WHERE status='pending' 保证幂等:已 active(重试/存量直落 active
   *  的旧资产)→ no-op 不误动。user_id 收窄 → 跨用户静默不命中(不泄露存在性)。 */
  commitGeneratedAsset(assetId: string): Promise<void>;
  /** [DATA-H07] 拒绝/失败清理:**仍 pending**(未被采纳)的 AI 生成资产 → 软删进回收站
   *  (status='deleted' + deleted_at,复用 assets §12 既有 trash 终态,可人工恢复/清理;不硬删
   *  行 —— 硬删会把 storage_key 引用一并抹掉,对象字节反而成永久无主孤儿)。已 active(已采纳)
   *  / 不存在 / 越权 → no-op 返 false。返回是否真的清理了。 */
  discardGeneratedAsset(assetId: string): Promise<boolean>;
  insertStep(rec: InsertStepInput): Promise<StepRow>;
  listSteps(taskId: string): Promise<StepRow[]>;

  getModelConfig(capability: string): Promise<ModelConfigRow | null>;
  getDefaultModelConfig(): Promise<ModelConfigRow | null>;
  getAgentConfig(agentType: string): Promise<AgentConfigRow | null>;
}

export function createAiRepository(db: Db, deps: RepoDeps, parentLocked=false): AiRepository {
  const ctx={userId:deps.userId,...workspaceStamp(deps),requestId:"ai-parent-write",source:"user" as const};
  const conversationParent={table:aiConversations,id:aiConversations.id,userId:aiConversations.userId,groupId:aiConversations.groupId,accountId:aiConversations.accountId,lock:"update" as const};
  const projectParent={table:projects,id:projects.id,userId:projects.userId,groupId:projects.groupId,accountId:projects.accountId};
  async function withTaskParents<T>(input:CreateTaskInput,write:(repo:AiRepository,current:CreateTaskInput)=>Promise<T>):Promise<T>{
    // 任务冻结端口要求组UPDATE；先取得它，避免多个SHARE持有者同时升级造成死锁。
    return db.transaction(async membershipTx=>{
    await lockWorkspaceMembership(membershipTx,{...ctx,membershipVersion:deps.membershipVersion});
    const lockedDb=membershipTx as unknown as Db;
    if(input.contentOutputId) return withWorkspaceParentWrite(lockedDb,ctx,{...projectParent,via:[{table:contentOutputs,id:contentOutputs.id,parentId:contentOutputs.projectId}]},[input.contentOutputId],async tx=>{
      const [output]=await tx.select({projectId:contentOutputs.projectId}).from(contentOutputs).where(eq(contentOutputs.id,input.contentOutputId!));
      if(!output || (input.projectId && input.projectId!==output.projectId))throw new OwnershipError("任务作品不属于当前项目");
      return write(createAiRepository(tx as unknown as Db,deps,true),{...input,projectId:output.projectId});
    });
    return withWorkspaceParentWrite(lockedDb,ctx,projectParent,[input.projectId!],tx=>write(createAiRepository(tx as unknown as Db,deps,true),input));
    });
  }
  const addSeconds = (iso: string, seconds: number): string =>
    new Date(Date.parse(iso) + seconds * 1_000).toISOString();

  // Private ownership gates: the scoped select for a parent. Empty ⇒ OwnershipError
  // (→ 404; cross-user / unknown id never reveals existence).
  async function getConversation(conversationId: string): Promise<ConversationRow> {
    const rows = await db
      .select()
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.userId, deps.userId),
          // [T-332 S2 · §4.5 by-id 门] strict 恒叠号:跨号会话与未知 id 同样 404。
          workspaceFilter(aiConversations, deps),
          eq(aiConversations.id, conversationId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(
        `OwnershipError: conversation not found: ${conversationId}`,
      );
    }
    return row;
  }

  async function getTask(taskId: string): Promise<TaskRow> {
    const rows = await db
      .select()
      .from(aiTasks)
      .where(
        and(
          eq(aiTasks.userId, deps.userId),
          // [T-332 S2 · §4.5 by-id 门] strict 恒叠号:跨号任务与未知 id 同样 404。
          workspaceFilter(aiTasks, deps),
          eq(aiTasks.id, taskId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(`OwnershipError: task not found: ${taskId}`);
    }
    return row;
  }

  return {
    async seedAgentConfigs(rows) {
      if (rows.length === 0) return;
      await db.insert(agentConfigurations).values(rows).onConflictDoNothing();
    },

    async seedModelConfigs(rows) {
      if (rows.length === 0) return;
      await db.insert(modelConfigurations).values(rows).onConflictDoNothing();
    },

    async listConversations({ limit, offset, scope }) {
      // T-096:scope 过滤是 user ownership 门的内层 —— 跨 scope 的会话在列表里**不出现**
      // (隔离语义:不可见,不是置灰)。不传 scope 维持全量(旧调用不破)。
      // [T-332 S2 · ISO-02] 号维度 strict 恒叠(user 门内层,无「无号全量」退化);
      // scope 过滤再叠一层。
      const where = and(
        eq(aiConversations.userId, deps.userId),
        workspaceFilter(aiConversations, deps),
        scope ? eq(aiConversations.scope, scope) : undefined,
      );
      const rows = await db
        .select()
        .from(aiConversations)
        .where(where)
        .orderBy(desc(aiConversations.updatedAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: aiConversations.id })
        .from(aiConversations)
        .where(where);
      return { rows, total: all.length };
    },

    async createConversation(input) {
      if(!parentLocked&&input.projectId)return withWorkspaceParentWrite(db,ctx,projectParent,[input.projectId],tx=>createAiRepository(tx as unknown as Db,deps,true).createConversation(input));
      if(!parentLocked)return withWorkspaceWrite(db,ctx,tx=>createAiRepository(tx as unknown as Db,deps,true).createConversation(input));
      await assertWritableWorkspace(db,ctx);
      const inserted = await db
        .insert(aiConversations)
        .values({
          id: deps.nextId("ai-conv"),
          userId: deps.userId,
          // [T-332 S2 · ISO-03/C-07] 号维度盖章(必填;0 号/未选号在 service 入口即被拒)。
          ...workspaceStamp(deps),
          projectId: input.projectId ?? null,
          // T-096:落作用域(缺省 global,与列 DEFAULT / 迁移 backfill 语义一致)。
          scope: input.scope && input.scope.length > 0 ? input.scope : "global",
          title: input.title,
          createdAt: deps.now(),
          updatedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async requireConversation(conversationId) {
      return getConversation(conversationId);
    },

    async createMessage(conversationId, input) {
      if(!parentLocked)return withWorkspaceParentWrite(db,ctx,conversationParent,[conversationId],tx=>createAiRepository(tx as unknown as Db,deps,true).createMessage(conversationId,input));
      await getConversation(conversationId); // scoped ownership gate
      const inserted = await db
        .insert(aiMessages)
        .values({
          id: deps.nextId("ai-msg"),
          conversationId,
          role: input.role,
          content: input.content,
          parts: input.parts ?? [],
          attachments: input.attachments,
          modelMetadata: input.modelMetadata,
          // [T-239e] token 用量(可选,additive):没报 usage → 全 NULL(诚实缺省,不填 0 充数)。
          inputTokens: input.usage?.inputTokens ?? null,
          outputTokens: input.usage?.outputTokens ?? null,
          cachedTokens: input.usage?.cachedTokens ?? null,
          modelKey: input.modelKey ?? null,
          createdAt: deps.now(),
        })
        .returning();
      // Bump the parent conversation updatedAt (scoped).
      await db
        .update(aiConversations)
        .set({ updatedAt: deps.now() })
        .where(
          and(
            eq(aiConversations.userId, deps.userId),
            workspaceFilter(aiConversations,deps),
            eq(aiConversations.id, conversationId),
          ),
        );
      return inserted[0]!;
    },

    async listMessages(conversationId) {
      await getConversation(conversationId); // scoped ownership gate
      return db
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conversationId))
        .orderBy(asc(aiMessages.createdAt));
    },

    async listTasks({ limit, offset, projectId, taskType, taskTypePrefix }) {
      // Global cross-project task feed for the copilot 「最近任务」 surface — scoped to
      // the user (mirrors listConversations), newest-requested first.
      // [T-116c] additive 读过滤:传了 projectId / taskType 就再叠一层 eq(纯读窄化,
      // 用户归属门始终在最外层);都不传维持全量馈,旧调用零破坏。
      const filters = [
        eq(aiTasks.userId, deps.userId),
        // [T-332 S2 · ISO-02] 号维度 strict 恒叠(无「无号全量」退化)。
        workspaceFilter(aiTasks, deps),
      ];
      if (projectId) filters.push(eq(aiTasks.projectId, projectId));
      if (taskType) filters.push(eq(aiTasks.taskType, taskType));
      // [T-255a] 前缀过滤(LIKE 'exec.%')。转义 %/_ 防通配注入(前缀是代码内常量,防御性)。
      if (taskTypePrefix) {
        const escaped = taskTypePrefix.replace(/[\\%_]/g, (m) => `\\${m}`);
        filters.push(like(aiTasks.taskType, `${escaped}%`));
      }
      const where = filters.length === 1 ? filters[0]! : and(...filters);
      const rows = await db
        .select()
        .from(aiTasks)
        .where(where)
        .orderBy(desc(aiTasks.requestedAt))
        .limit(limit)
        .offset(offset);
      const all = await db.select({ id: aiTasks.id }).from(aiTasks).where(where);
      return { rows, total: all.length };
    },

    async listRunningTasksSystem() {
      // [T-332 S2 修补] 只按 userId 收窄 + status='running',**不叠 accountId**(系统 daemon
      //   跨号扫僵尸)。占位 accountId 不进 WHERE,故工厂传什么号都不影响结果。
      const rows = await db
        .select({
          id: aiTasks.id,
          accountId: aiTasks.accountId,groupId:aiTasks.groupId,
          taskType: aiTasks.taskType, // [T-389] sweep 类型感知:进程内 runner 重启即死,判死不看年龄
          startedAt: aiTasks.startedAt,
          requestedAt: aiTasks.requestedAt,
        })
        .from(aiTasks)
        .where(
          and(eq(aiTasks.userId, deps.userId), eq(aiTasks.status, "running"), sql`${aiTasks.executionTaskId} IS NULL`),
        );
      return rows;
    },

    async findTaskByIdempotencyKey(idempotencyKey) {
      // [T-332 S2 · 诚实例外] 幂等 dedup 查询保持「用户级」——UNIQUE(user_id, idempotency_key)
      // 不含 account_id,叠号门会漏查既有行 → UNIQUE 冲突插入失败。跨号隔离由 service 层
      // 把幂等键按号命名空间化(`{accountId}:{key}`)保证:双号同 key 不互撞、也绝不
      // 跨号返回对方任务(见 ai.service createTask)。
      const rows = await db
        .select()
        .from(aiTasks)
        .where(
          and(
            eq(aiTasks.userId, deps.userId),
            eq(aiTasks.idempotencyKey, idempotencyKey),
          ),
        );
      return rows[0] ?? null;
    },

    async findTaskByAttempt(taskType, attemptId) {
      const rows = await db
        .select()
        .from(aiTasks)
        .where(
          and(
            eq(aiTasks.userId, deps.userId),
            workspaceFilter(aiTasks, deps),
            eq(aiTasks.taskType, taskType),
            eq(aiTasks.attemptId, attemptId),
          ),
        );
      return rows[0] ?? null;
    },

    async createTask(input) {
      if(!parentLocked&&(input.projectId||input.contentOutputId))return withTaskParents(input,(repo,current)=>repo.createTask(current));
      return db.transaction(async tx => {
      const frozen=await lockWorkspaceMembership(tx,{...deps,requestId:"ai-create-task",source:"ai"},{allowArchived:!!deps.scheduledCollectorJobId});
      if(deps.scheduledCollectorJobId)await assertPrivateCollectorJob(tx as unknown as Db,{...deps,requestId:"ai-private-collector",source:"ingestion"},deps.scheduledCollectorJobId,input.taskType.slice(10));
      const inserted = await tx
        .insert(aiTasks)
        .values({
          id: deps.nextId("ai-task"),
          userId: deps.userId,
          // [T-332 S2 · ISO-03] 号维度盖章(必填;未选号 → service 入口 AccountRequiredError)。
          accountId:frozen.accountId,groupId:frozen.groupId,
          groupVersion:frozen.groupVersion,membershipVersion:frozen.membershipVersion,
          projectId: input.projectId ?? null,
          contentOutputId: input.contentOutputId ?? null,
          taskType: input.taskType,
          status: "queued",
          inputData: input.inputData,
          runtimeData: input.runtimeData?.skillSnapshot ? {...input.runtimeData,skillSnapshot:{...(input.runtimeData.skillSnapshot as Record<string,unknown>),groupId:frozen.groupId,groupVersion:frozen.groupVersion,membershipVersion:frozen.membershipVersion}} : input.runtimeData??{},
          modelKey: input.modelKey,
          idempotencyKey: input.idempotencyKey,
          attemptId: input.attemptId ?? `legacy-attempt:${input.idempotencyKey}`,
          requestFingerprint:
            input.requestFingerprint ?? `sha256:${"0".repeat(64)}`,
          retryOfTaskId: input.retryOfTaskId ?? null,
          requestedAt: input.requestedAt,
          startedAt: null,
          completedAt: null,
          errorMessage: null,
          sessionId: null,
          costUsd: null,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          modelCallStartedAt: null,
        })
        .returning();
      return inserted[0]!;
      });
    },

    async createTaskIfAbsent(input) {
      if(!parentLocked&&(input.projectId||input.contentOutputId))return withTaskParents(input,(repo,current)=>repo.createTaskIfAbsent(current));
      return db.transaction(async tx => {
      const frozen=await lockWorkspaceMembership(tx,{...deps,requestId:"ai-create-task",source:"ai"},{allowArchived:!!deps.scheduledCollectorJobId});
      if(deps.scheduledCollectorJobId)await assertPrivateCollectorJob(tx as unknown as Db,{...deps,requestId:"ai-private-collector",source:"ingestion"},deps.scheduledCollectorJobId,input.taskType.slice(10));
      const inserted = await tx
        .insert(aiTasks)
        .values({
          id: deps.nextId("ai-task"),
          userId: deps.userId,
          accountId:frozen.accountId,groupId:frozen.groupId,
          groupVersion:frozen.groupVersion,membershipVersion:frozen.membershipVersion,
          projectId: input.projectId ?? null,
          contentOutputId: input.contentOutputId ?? null,
          taskType: input.taskType,
          status: "queued",
          inputData: input.inputData,
          runtimeData: input.runtimeData?.skillSnapshot ? {...input.runtimeData,skillSnapshot:{...(input.runtimeData.skillSnapshot as Record<string,unknown>),groupId:frozen.groupId,groupVersion:frozen.groupVersion,membershipVersion:frozen.membershipVersion}} : input.runtimeData??{},
          modelKey: input.modelKey,
          idempotencyKey: input.idempotencyKey,
          attemptId: input.attemptId ?? `legacy-attempt:${input.idempotencyKey}`,
          requestFingerprint:
            input.requestFingerprint ?? `sha256:${"0".repeat(64)}`,
          retryOfTaskId: input.retryOfTaskId ?? null,
          requestedAt: input.requestedAt,
          startedAt: null,
          completedAt: null,
          errorMessage: null,
          sessionId: null,
          costUsd: null,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          modelCallStartedAt: null,
        })
        .onConflictDoNothing()
        .returning();
      return inserted[0] ?? null;
      });
    },

    async requireTask(taskId) {
      return getTask(taskId);
    },

    async claimAiTaskExecution(taskId, input) {
      const now = deps.now();
      const leaseExpiresAt = addSeconds(now, input.leaseSeconds);
      return db.transaction(async tx=>{
      const [snapshot]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,taskId),eq(aiTasks.userId,deps.userId),workspaceFilter(aiTasks,deps)));
      if(!snapshot)return null;
      await assertAiTaskWorkspaceAdmission(tx,snapshot);
      const rows = await tx
        .update(aiTasks)
        .set({
          status: "running",
          startedAt: now,
          leaseOwner: input.workerId,
          leaseToken: input.leaseToken,
          leaseExpiresAt,
        })
        .where(
          and(
            eq(aiTasks.userId, deps.userId),
            workspaceFilter(aiTasks, deps),
            eq(aiTasks.id, taskId),
            eq(aiTasks.status, "queued"),
            sql`${aiTasks.executionTaskId} IS NULL`,
          ),
        )
        .returning();
      const task = rows[0];
      return task ? { task, leaseToken: input.leaseToken, leaseExpiresAt } : null;
      });
    },

    async beginModelCall(taskId, leaseToken) {
      const now = deps.now();
      try {
        return await db.transaction(async (tx) => {
          const [snapshot]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,taskId),eq(aiTasks.userId,deps.userId),workspaceFilter(aiTasks,deps)));
          if(!snapshot)return false;
          await assertAiTaskWorkspaceAdmission(tx,snapshot);
          const rows = await tx
            .update(aiTasks)
            .set({ modelCallStartedAt: now })
            .where(
              and(
                eq(aiTasks.userId, deps.userId),
                workspaceFilter(aiTasks, deps),
                eq(aiTasks.id, taskId),
                eq(aiTasks.status, "running"),
                eq(aiTasks.leaseToken, leaseToken),
                sql`${aiTasks.leaseExpiresAt} > ${now}`,
                sql`${aiTasks.modelCallStartedAt} IS NULL`,
              ),
            )
            .returning({ id: aiTasks.id });
          if (!rows[0]) return false;
          await tx.insert(aiTaskSteps).values({
            id: deps.nextId("ai-step"),
            aiTaskId: taskId,
            stepNo: 0,
            kind: "model_call_started",
            text: "model_call_started",
            toolCalls: [],
            createdAt: now,
          });
          return true;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/unique|duplicate/i.test(message)) return false;
        throw error;
      }
    },

    async renewAiTaskExecution(taskId, leaseToken, extendSeconds) {
      const now = deps.now();
      const leaseExpiresAt = addSeconds(now, extendSeconds);
      const rows = await db
        .update(aiTasks)
        .set({ leaseExpiresAt })
        .where(
          and(
            eq(aiTasks.userId, deps.userId),
            workspaceFilter(aiTasks, deps),
            eq(aiTasks.id, taskId),
            eq(aiTasks.status, "running"),
            eq(aiTasks.leaseToken, leaseToken),
            sql`${aiTasks.leaseExpiresAt} > ${now}`,
          ),
        )
        .returning({ leaseExpiresAt: aiTasks.leaseExpiresAt });
      return rows[0] ? { leaseExpiresAt } : null;
    },

    async completeAiTaskExecution(taskId, leaseToken, input) {
      const now = deps.now();
      const rows = await db
        .update(aiTasks)
        .set({
          status: input.status,
          completedAt:
            input.completedAt !== undefined
              ? input.completedAt
              : input.status === "awaiting_confirmation"
                ? null
                : now,
          errorMessage: input.errorMessage ?? null,
        })
        .where(
          and(
            eq(aiTasks.userId, deps.userId),
            workspaceFilter(aiTasks, deps),
            eq(aiTasks.id, taskId),
            eq(aiTasks.status, "running"),
            eq(aiTasks.leaseToken, leaseToken),
            sql`${aiTasks.leaseExpiresAt} > ${now}`,
          ),
        )
        .returning({ id: aiTasks.id });
      return Boolean(rows[0]);
    },

    async recordCandidateUnmapped(taskId, input) {
      return db.transaction(async tx => {
        const [task] = await tx.select().from(aiTasks).where(and(eq(aiTasks.id,taskId),eq(aiTasks.userId,deps.userId),workspaceFilter(aiTasks, deps))).for("update");
        if (!task) throw new OwnershipError(`OwnershipError: task not found: ${taskId}`);
        if (task.executionTaskId || task.leaseToken || !["queued","running"].includes(task.status)) return null;
        await tx.insert(aiTaskResults).values({id:deps.nextId("ai-result"),aiTaskId:taskId,...input});
        const [updated] = await tx.update(aiTasks).set({status:"awaiting_confirmation",startedAt:task.startedAt ?? deps.now(),completedAt:null,errorMessage:null}).where(eq(aiTasks.id,taskId)).returning();
        return updated ?? null;
      });
    },

    async recordCandidateWithLease(taskId, leaseToken, input) {
      const now = deps.now();
      return db.transaction(async (tx) => {
        const rows = await tx
          .update(aiTasks)
          .set({
            status: "awaiting_confirmation",
            completedAt: null,
            errorMessage: null,
          })
          .where(
            and(
              eq(aiTasks.userId, deps.userId),
              workspaceFilter(aiTasks, deps),
              eq(aiTasks.id, taskId),
              eq(aiTasks.status, "running"),
              eq(aiTasks.leaseToken, leaseToken),
              sql`${aiTasks.leaseExpiresAt} > ${now}`,
            ),
          )
          .returning();
        const task = rows[0];
        if (!task) return null;
        await tx.insert(aiTaskResults).values({
          id: deps.nextId("ai-result"),
          aiTaskId: taskId,
          resultType: input.resultType,
          artifactId: input.artifactId,
          knowledgeItemId: input.knowledgeItemId,
          assetId: input.assetId,
          resultData: input.resultData,
        });
        return task;
      });
    },

    async reconcileExpiredAiTaskExecution(taskId, leaseToken) {
      const now = deps.now();
      const requeued = await db
        .update(aiTasks)
        .set({
          status: "queued",
          startedAt: null,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
        })
        .where(
          and(
            eq(aiTasks.userId, deps.userId),
            workspaceFilter(aiTasks, deps),
            eq(aiTasks.id, taskId),
            eq(aiTasks.status, "running"),
            eq(aiTasks.leaseToken, leaseToken),
            sql`${aiTasks.leaseExpiresAt} <= ${now}`,
            sql`${aiTasks.modelCallStartedAt} IS NULL`,
          ),
        )
        .returning({ id: aiTasks.id });
      if (requeued[0]) return "requeued";

      const reconciliationRequired = await db
        .update(aiTasks)
        .set({
          status: "failed",
          completedAt: now,
          errorMessage: "SKILL_SNAPSHOT_RECONCILIATION_REQUIRED",
        })
        .where(
          and(
            eq(aiTasks.userId, deps.userId),
            workspaceFilter(aiTasks, deps),
            eq(aiTasks.id, taskId),
            eq(aiTasks.status, "running"),
            eq(aiTasks.leaseToken, leaseToken),
            sql`${aiTasks.leaseExpiresAt} <= ${now}`,
            sql`${aiTasks.modelCallStartedAt} IS NOT NULL`,
          ),
        )
        .returning({ id: aiTasks.id });
      return reconciliationRequired[0] ? "reconciliation_required" : null;
    },

    async addReferences(taskId, refs) {
      await getTask(taskId); // scoped ownership gate on the parent task
      if (refs.length === 0) return;
      await db.insert(aiTaskReferences).values(
        refs.map((r) => ({
          id: deps.nextId("ai-ref"),
          aiTaskId: taskId,
          entityType: r.entityType,
          entityId: r.entityId,
          relationType: r.relationType,
        })),
      );
    },

    async listReferences(taskId) {
      await getTask(taskId); // scoped ownership gate
      return db
        .select()
        .from(aiTaskReferences)
        .where(eq(aiTaskReferences.aiTaskId, taskId));
    },

    async updateUnboundTaskStatus(taskId, expectedStatus, patch) {
      const [updated] = await db.update(aiTasks).set(patch).where(and(
        eq(aiTasks.id,taskId),eq(aiTasks.userId,deps.userId),workspaceFilter(aiTasks, deps),
        eq(aiTasks.status,expectedStatus),isNull(aiTasks.executionTaskId),
      )).returning();
      return updated ?? null;
    },

    async updateMappedTaskStatus(taskId, executionTaskId, expectedStatus, patch) {
      const [updated] = await db.update(aiTasks).set(patch).where(and(
        eq(aiTasks.id, taskId), eq(aiTasks.userId, deps.userId), workspaceFilter(aiTasks, deps),
        eq(aiTasks.executionTaskId, executionTaskId), eq(aiTasks.status, expectedStatus),
      )).returning();
      return updated ?? null;
    },

    async updateTaskStatus(taskId, patch) {
      await getTask(taskId); // scoped ownership gate
      const set: Record<string, unknown> = {};
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.startedAt !== undefined) set.startedAt = patch.startedAt;
      if (patch.completedAt !== undefined) set.completedAt = patch.completedAt;
      if (patch.errorMessage !== undefined) set.errorMessage = patch.errorMessage;
      if (patch.sessionId !== undefined) set.sessionId = patch.sessionId;
      if (patch.costUsd !== undefined) set.costUsd = patch.costUsd;
      const updated = await db
        .update(aiTasks)
        .set(set)
        .where(and(eq(aiTasks.userId, deps.userId), eq(aiTasks.id, taskId)))
        .returning();
      return updated[0]!;
    },

    async patchTaskRuntimeData(taskId, runtimeData) {
      await getTask(taskId); // ownership gate
      await db
        .update(aiTasks)
        .set({ runtimeData: sql`coalesce(${aiTasks.runtimeData}, '{}'::jsonb) || ${JSON.stringify(runtimeData)}::jsonb` })
        .where(
          and(
            eq(aiTasks.userId, deps.userId),
            workspaceFilter(aiTasks, deps),
            eq(aiTasks.id, taskId),
          ),
        );
    },

    async insertResult(rec) {
      await getTask(rec.aiTaskId); // scoped ownership gate on the parent task
      const inserted = await db
        .insert(aiTaskResults)
        .values({
          id: deps.nextId("ai-result"),
          aiTaskId: rec.aiTaskId,
          resultType: rec.resultType,
          artifactId: rec.artifactId ?? null,
          knowledgeItemId: rec.knowledgeItemId ?? null,
          assetId: rec.assetId ?? null,
          resultData: rec.resultData,
        })
        .returning();
      return inserted[0]!;
    },

    async getResult(resultId) {
      const rows = await db
        .select()
        .from(aiTaskResults)
        .where(eq(aiTaskResults.id, resultId));
      const row = rows[0];
      if (!row) {
        throw new OwnershipError(`OwnershipError: result not found: ${resultId}`);
      }
      await getTask(row.aiTaskId); // transitive ownership: throws if not owned
      return row;
    },

    async listResults(taskId) {
      await getTask(taskId); // scoped ownership gate
      return db
        .select()
        .from(aiTaskResults)
        .where(eq(aiTaskResults.aiTaskId, taskId));
    },

    async patchLatestResultItems(taskId, items) {
      await getTask(taskId); // scoped ownership gate
      const rows = await db
        .select()
        .from(aiTaskResults)
        .where(eq(aiTaskResults.aiTaskId, taskId));
      const last = rows[rows.length - 1];
      if (!last) {
        throw new OwnershipError(
          `OwnershipError: no result to patch for task: ${taskId}`,
        );
      }
      const data = (last.resultData ?? {}) as Record<string, unknown>;
      const updated = await db
        .update(aiTaskResults)
        .set({ resultData: { ...data, items } })
        .where(eq(aiTaskResults.id, last.id))
        .returning();
      return updated[0]!;
    },

    async recordAdoptedKey(resultId, key) {
      // 透传属主(与 getResult 同款):先取结果行,再经父任务门;跨用户/未知 → OwnershipError。
      const rows = await db
        .select()
        .from(aiTaskResults)
        .where(eq(aiTaskResults.id, resultId));
      const row = rows[0];
      if (!row) {
        throw new OwnershipError(`OwnershipError: result not found: ${resultId}`);
      }
      await getTask(row.aiTaskId); // transitive ownership: throws if not owned
      const data = (row.resultData ?? {}) as Record<string, unknown>;
      const existing = Array.isArray(data.adoptedKeys)
        ? data.adoptedKeys.filter((k): k is string => typeof k === "string")
        : [];
      if (existing.includes(key)) return; // 已记过 → 幂等 no-op
      await db
        .update(aiTaskResults)
        .set({ resultData: { ...data, adoptedKeys: [...existing, key] } })
        .where(eq(aiTaskResults.id, resultId));
    },

    async commitGeneratedAsset(assetId) {
      // [DATA-H07] pending → active + stamp 当前号(镜像 assets repo commitPendingAsset:
      // pending 若 account_id=NULL 在此补号)。WHERE status='pending' → 已 active/已删的行
      // 不误动(幂等);user_id 收窄 → 跨用户静默不命中。
      await db
        .update(assets)
        .set({
          status: "active",
          // [T-332 S2] stamp 必填当前号(assets.account_id 自 S1 起 NOT NULL)。
          ...(deps.accountId?{accountId:deps.accountId}:{}),
          updatedAt: deps.now(),
        })
        .where(
          and(
            eq(assets.id, assetId),
            eq(assets.userId, deps.userId),
            eq(assets.status, "pending"),
          ),
        );
    },

    async discardGeneratedAsset(assetId) {
      // [DATA-H07] 只清理**仍 pending**(未采纳)的行 → 软删进回收站(§12 既有 deleted 终态)。
      // 已采纳(active)/已删/越权/不存在 → WHERE 不命中 → no-op(绝不误删已入库素材)。
      const updated = await db
        .update(assets)
        .set({
          status: "deleted",
          deletedAt: deps.now(),
          updatedAt: deps.now(),
        })
        .where(
          and(
            eq(assets.id, assetId),
            eq(assets.userId, deps.userId),
            eq(assets.status, "pending"),
          ),
        )
        .returning({ id: assets.id });
      return updated.length > 0;
    },

    async insertStep(rec) {
      await getTask(rec.aiTaskId); // scoped ownership gate on the parent task
      const inserted = await db
        .insert(aiTaskSteps)
        .values({
          id: deps.nextId("ai-step"),
          aiTaskId: rec.aiTaskId,
          stepNo: rec.stepNo,
          kind: rec.kind,
          text: rec.text,
          toolCalls: rec.toolCalls,
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async listSteps(taskId) {
      await getTask(taskId); // scoped ownership gate
      return db
        .select()
        .from(aiTaskSteps)
        .where(eq(aiTaskSteps.aiTaskId, taskId))
        .orderBy(asc(aiTaskSteps.stepNo));
    },

    async getModelConfig(capability) {
      const rows = await db
        .select()
        .from(modelConfigurations)
        .where(
          and(
            eq(modelConfigurations.userId, deps.userId),
            eq(modelConfigurations.capability, capability),
          ),
        );
      return rows[0] ?? null;
    },

    async getDefaultModelConfig() {
      const rows = await db
        .select()
        .from(modelConfigurations)
        .where(
          and(
            eq(modelConfigurations.userId, deps.userId),
            eq(modelConfigurations.isDefault, true),
          ),
        );
      return rows[0] ?? null;
    },

    // [T-136 切片 b · 诚实例外] getDefaultModelConfig / getModelConfig / getAgentConfig 读的是
    // model_configurations / agent_configurations —— 用户级模型/密钥/agent 配置(一个用户的
    // API key 与模型选择跨其所有抖音号共享,不是号级资源)。故这三个读点**不叠号门**,只按
    // userId 收窄(与本切片「专注 owned-root 号隔离」一致;这些配置表不在 cluster B 迁移范围)。
    async getAgentConfig(agentType) {
      const rows = await db
        .select()
        .from(agentConfigurations)
        .where(
          and(
            eq(agentConfigurations.userId, deps.userId),
            eq(agentConfigurations.agentType, agentType),
          ),
        );
      return rows[0] ?? null;
    },
  };
}
