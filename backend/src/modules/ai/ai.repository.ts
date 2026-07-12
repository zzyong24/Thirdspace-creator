import { and, asc, desc, eq, type Db } from "@creatoros/backend";
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

/** 选题弹窗跨刷新缓存用:最近待审阅 topic.generate 任务的精简投影。 */
export interface PendingTopicReviewRow {
  taskId: string;
  basis: string;
  count: number;
  requestedAt: string; // 与 TaskRow.requestedAt 一致(库里存 ISO 串,toTaskDto 直接透传)
}
export type ReferenceRow = typeof aiTaskReferences.$inferSelect;
export type ResultRow = typeof aiTaskResults.$inferSelect;
export type StepRow = typeof aiTaskSteps.$inferSelect;
export type AgentConfigRow = typeof agentConfigurations.$inferSelect;
export type ModelConfigRow = typeof modelConfigurations.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
  // [T-136 切片 b] 第二所有权维度(多抖音号 / 多人设)。仅 owned-root ai_conversations /
  // ai_tasks 叠号门(非空才 eq;null → 退化不过滤,create 落 NULL)。子表经父门透传。
  // ⚠️ model_configurations / agent_configurations 是「用户级」模型/密钥配置(跨号共享,
  // 非号级资源),故不叠号门(见文件尾注)。
  accountId: string | null;
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
  modelKey: string;
  idempotencyKey: string;
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
  }): Promise<{ rows: TaskRow[]; total: number }>;
  findTaskByIdempotencyKey(idempotencyKey: string): Promise<TaskRow | null>;
  createTask(input: CreateTaskInput): Promise<TaskRow>;
  requireTask(taskId: string): Promise<TaskRow>;
  addReferences(taskId: string, refs: ReferenceInput[]): Promise<void>;
  listReferences(taskId: string): Promise<ReferenceRow[]>;
  updateTaskStatus(taskId: string, patch: TaskStatusPatch): Promise<TaskRow>;
  insertResult(rec: InsertResultInput): Promise<ResultRow>;
  getResult(resultId: string): Promise<ResultRow>;
  listResults(taskId: string): Promise<ResultRow[]>;
  /** CollabField:用人编辑后的 items 替换最新结果的 result_data.items(采纳前可改/删)。 */
  patchLatestResultItems(taskId: string, items: unknown[]): Promise<ResultRow>;
  insertStep(rec: InsertStepInput): Promise<StepRow>;
  listSteps(taskId: string): Promise<StepRow[]>;
  /** 最近一条待审阅(awaiting_confirmation)的 topic.generate 任务 + 候选数;无则 null。 */
  findLatestPendingTopicReview(): Promise<PendingTopicReviewRow | null>;

  getModelConfig(capability: string): Promise<ModelConfigRow | null>;
  getDefaultModelConfig(): Promise<ModelConfigRow | null>;
  getAgentConfig(agentType: string): Promise<AgentConfigRow | null>;
}

export function createAiRepository(db: Db, deps: RepoDeps): AiRepository {
  // Private ownership gates: the scoped select for a parent. Empty ⇒ OwnershipError
  // (→ 404; cross-user / unknown id never reveals existence).
  async function getConversation(conversationId: string): Promise<ConversationRow> {
    const rows = await db
      .select()
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.userId, deps.userId),
          // [T-136 切片 b] 号维度收窄(非空才叠;null → 不过滤,§A)。
          deps.accountId
            ? eq(aiConversations.accountId, deps.accountId)
            : undefined,
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
          // [T-136 切片 b] 号维度收窄(非空才叠;null → 不过滤)。
          deps.accountId ? eq(aiTasks.accountId, deps.accountId) : undefined,
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
      // [T-136 切片 b] 号维度收窄是 user ownership 门的内层(非空才叠;null → 不过滤,
      // 旧行为);scope 过滤再叠一层。
      const where = and(
        eq(aiConversations.userId, deps.userId),
        deps.accountId
          ? eq(aiConversations.accountId, deps.accountId)
          : undefined,
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
      const inserted = await db
        .insert(aiConversations)
        .values({
          id: deps.nextId("ai-conv"),
          userId: deps.userId,
          // [T-136 切片 b] 号维度盖章(null 兜底)。
          accountId: deps.accountId,
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

    async listTasks({ limit, offset, projectId, taskType }) {
      // Global cross-project task feed for the copilot 「最近任务」 surface — scoped to
      // the user (mirrors listConversations), newest-requested first.
      // [T-116c] additive 读过滤:传了 projectId / taskType 就再叠一层 eq(纯读窄化,
      // 用户归属门始终在最外层);都不传维持全量馈,旧调用零破坏。
      const filters = [eq(aiTasks.userId, deps.userId)];
      // [T-136 切片 b] 号维度收窄(非空才叠;null → 全量,旧行为)。
      if (deps.accountId) filters.push(eq(aiTasks.accountId, deps.accountId));
      if (projectId) filters.push(eq(aiTasks.projectId, projectId));
      if (taskType) filters.push(eq(aiTasks.taskType, taskType));
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

    async findTaskByIdempotencyKey(idempotencyKey) {
      // [T-136 切片 b · 诚实例外] 幂等 dedup 是「用户级」——UNIQUE(user_id, idempotency_key)
      // 不含 account_id。这里**故意不叠号门**:若叠了,同一 key 在另一个号下会漏查既有行 →
      // 触发 UNIQUE 冲突插入失败。幂等语义按 (user, key) 归一,与号无关,保持 userId-only。
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

    async createTask(input) {
      const inserted = await db
        .insert(aiTasks)
        .values({
          id: deps.nextId("ai-task"),
          userId: deps.userId,
          // [T-136 切片 b] 号维度盖章(null 兜底)。
          accountId: deps.accountId,
          projectId: input.projectId ?? null,
          contentOutputId: input.contentOutputId ?? null,
          taskType: input.taskType,
          status: "queued",
          inputData: input.inputData,
          modelKey: input.modelKey,
          idempotencyKey: input.idempotencyKey,
          requestedAt: input.requestedAt,
          startedAt: null,
          completedAt: null,
          errorMessage: null,
          sessionId: null,
          costUsd: null,
        })
        .returning();
      return inserted[0]!;
    },

    async requireTask(taskId) {
      return getTask(taskId);
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

    async findLatestPendingTopicReview() {
      // user-scoped:只看本人最近一条还在等采纳的选题任务。
      const taskRows = await db
        .select()
        .from(aiTasks)
        .where(
          and(
            eq(aiTasks.userId, deps.userId),
            // [T-136 切片 b] 号维度收窄(非空才叠;null → 不过滤)。
            deps.accountId ? eq(aiTasks.accountId, deps.accountId) : undefined,
            eq(aiTasks.taskType, "topic.generate"),
            eq(aiTasks.status, "awaiting_confirmation"),
          ),
        )
        .orderBy(desc(aiTasks.requestedAt))
        .limit(1);
      const task = taskRows[0];
      if (!task) return null;
      // 候选数真来自该任务最新一条 candidate_list 的 items 长度(不编造)。
      const resultRows = await db
        .select()
        .from(aiTaskResults)
        .where(
          and(
            eq(aiTaskResults.aiTaskId, task.id),
            eq(aiTaskResults.resultType, "candidate_list"),
          ),
        );
      const last = resultRows[resultRows.length - 1];
      const data = (last?.resultData ?? {}) as Record<string, unknown>;
      const items = Array.isArray(data.items) ? (data.items as unknown[]) : [];
      const basisRaw = ((task.inputData ?? {}) as Record<string, unknown>).basis;
      return {
        taskId: task.id,
        basis: typeof basisRaw === "string" ? basisRaw : "",
        count: items.length,
        requestedAt: task.requestedAt,
      };
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
