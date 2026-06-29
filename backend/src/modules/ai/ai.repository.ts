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
export type ReferenceRow = typeof aiTaskReferences.$inferSelect;
export type ResultRow = typeof aiTaskResults.$inferSelect;
export type StepRow = typeof aiTaskSteps.$inferSelect;
export type AgentConfigRow = typeof agentConfigurations.$inferSelect;
export type ModelConfigRow = typeof modelConfigurations.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
}

export interface CreateConversationInput {
  title: string;
  projectId: string | null;
}

export interface CreateMessageInput {
  role: string;
  content: string;
  attachments: string[];
  modelMetadata: Record<string, unknown>;
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

  listConversations(page: {
    limit: number;
    offset: number;
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
  insertStep(rec: InsertStepInput): Promise<StepRow>;
  listSteps(taskId: string): Promise<StepRow[]>;

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
      .where(and(eq(aiTasks.userId, deps.userId), eq(aiTasks.id, taskId)));
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

    async listConversations({ limit, offset }) {
      const rows = await db
        .select()
        .from(aiConversations)
        .where(eq(aiConversations.userId, deps.userId))
        .orderBy(desc(aiConversations.updatedAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: aiConversations.id })
        .from(aiConversations)
        .where(eq(aiConversations.userId, deps.userId));
      return { rows, total: all.length };
    },

    async createConversation(input) {
      const inserted = await db
        .insert(aiConversations)
        .values({
          id: deps.nextId("ai-conv"),
          userId: deps.userId,
          projectId: input.projectId ?? null,
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
          attachments: input.attachments,
          modelMetadata: input.modelMetadata,
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

    async listTasks({ limit, offset }) {
      // Global cross-project task feed for the copilot 「最近任务」 surface — scoped to
      // the user (mirrors listConversations), newest-requested first.
      const rows = await db
        .select()
        .from(aiTasks)
        .where(eq(aiTasks.userId, deps.userId))
        .orderBy(desc(aiTasks.requestedAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: aiTasks.id })
        .from(aiTasks)
        .where(eq(aiTasks.userId, deps.userId));
      return { rows, total: all.length };
    },

    async findTaskByIdempotencyKey(idempotencyKey) {
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
