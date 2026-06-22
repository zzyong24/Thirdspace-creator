import { eq, and, asc, desc } from "drizzle-orm";
import type { Db } from "../db";
import {
  aiConversations,
  aiMessages,
  aiTasks,
  aiTaskReferences,
  aiTaskResults,
} from "../schema/ai";

// Injected dependencies — mirrors project-/knowledge-repository's RepoDeps so the
// repo stays deterministic (no Date.now / Math.random / fetch inside) and
// user-scoped (userId threaded from RequestContext, stamped on owned-root rows).
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type ConversationRow = typeof aiConversations.$inferSelect;
type MessageRow = typeof aiMessages.$inferSelect;
type TaskRow = typeof aiTasks.$inferSelect;
type TaskReferenceRow = typeof aiTaskReferences.$inferSelect;
type TaskResultRow = typeof aiTaskResults.$inferSelect;

type MessageRole = "user" | "assistant" | "system";
type TaskStatus =
  | "queued"
  | "running"
  | "awaiting_confirmation"
  | "succeeded"
  | "failed"
  | "cancelled";

// AI Task state machine (schema/ai.ts header / SPEC §12 / aiTaskStatus enum):
//   queued → running | cancelled
//   running → awaiting_confirmation | succeeded | failed | cancelled
//   awaiting_confirmation → succeeded | cancelled
// Terminals (succeeded/failed/cancelled) have no outgoing edges. The FSM guard
// lives here in the repo (mirrors project-repository's adjacent-only transition).
const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["awaiting_confirmation", "succeeded", "failed", "cancelled"],
  awaiting_confirmation: ["succeeded", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export interface AiRepository {
  // ── seeds (idempotent) ──────────────────────────────────────────────────
  seedConversations(rows: ConversationRow[]): Promise<void>;
  seedTasks(rows: TaskRow[]): Promise<void>;

  // ── conversations (owned-root) ──────────────────────────────────────────
  listConversations(): Promise<ConversationRow[]>;
  getConversation(conversationId: string): Promise<ConversationRow>;
  createConversation(input: {
    title: string;
    projectId?: string | null;
  }): Promise<ConversationRow>;

  // ── messages (child of conversation; append-only) ───────────────────────
  appendMessage(
    conversationId: string,
    input: {
      role: MessageRole;
      content?: string;
      attachments?: string[];
      modelMetadata?: Record<string, unknown>;
    },
  ): Promise<MessageRow>;
  listMessages(conversationId: string): Promise<MessageRow[]>;

  // ── tasks (owned-root; idempotent create + FSM transition) ──────────────
  listTasks(): Promise<TaskRow[]>;
  getTask(taskId: string): Promise<TaskRow>;
  createTask(input: {
    taskType: string;
    idempotencyKey: string;
    projectId?: string | null;
    contentOutputId?: string | null;
    inputData?: Record<string, unknown>;
    modelKey?: string;
  }): Promise<TaskRow>;
  transitionTask(
    taskId: string,
    status: TaskStatus,
    patch?: { errorMessage?: string | null; costUsd?: number | null },
  ): Promise<TaskRow>;

  // ── task children (reached only through the task ownership gate) ─────────
  addTaskReference(
    taskId: string,
    input: { entityType: string; entityId: string; relationType: string },
  ): Promise<TaskReferenceRow>;
  listTaskReferences(taskId: string): Promise<TaskReferenceRow[]>;
  addTaskResult(
    taskId: string,
    input: {
      resultType: string;
      artifactId?: string | null;
      knowledgeItemId?: string | null;
      assetId?: string | null;
      resultData?: Record<string, unknown>;
    },
  ): Promise<TaskResultRow>;
  listTaskResults(taskId: string): Promise<TaskResultRow[]>;

  // TODO(ai): AgentConfiguration / ModelConfiguration live in schema/settings.ts
  // and are owned by the settings repository — intentionally NOT handled here.
}

export function createAiRepository(db: Db, deps: RepoDeps): AiRepository {
  // Owner-scoped read: a conversation owned by another user is invisible → the
  // same "not found" surface project-/knowledge-repository use for cross-user /
  // missing rows.
  async function requireConversation(
    conversationId: string,
  ): Promise<ConversationRow> {
    const rows = await db
      .select()
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.id, conversationId),
          eq(aiConversations.userId, deps.userId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(
        `OwnershipError: conversation not found: ${conversationId}`,
      );
    }
    return row;
  }

  // Owner-scoped read for tasks (owned-root). Children (references/results) are
  // reached ONLY through this gate, so they are never visible cross-user.
  async function requireTask(taskId: string): Promise<TaskRow> {
    const rows = await db
      .select()
      .from(aiTasks)
      .where(and(eq(aiTasks.id, taskId), eq(aiTasks.userId, deps.userId)));
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: task not found: ${taskId}`);
    }
    return row;
  }

  return {
    async seedConversations(rows) {
      if (rows.length === 0) return;
      await db.insert(aiConversations).values(rows).onConflictDoNothing();
    },

    async seedTasks(rows) {
      if (rows.length === 0) return;
      await db.insert(aiTasks).values(rows).onConflictDoNothing();
    },

    async listConversations() {
      return db
        .select()
        .from(aiConversations)
        .where(eq(aiConversations.userId, deps.userId))
        .orderBy(asc(aiConversations.createdAt));
    },

    getConversation: requireConversation,

    async createConversation({ title, projectId }) {
      const ts = deps.now();
      const inserted = await db
        .insert(aiConversations)
        .values({
          id: deps.nextId("ai_conversation"),
          userId: deps.userId,
          projectId: projectId ?? null,
          title,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning();
      return inserted[0]!;
    },

    // Messages are append-only; appending touches the parent's updatedAt so
    // listConversations ordering by recency stays meaningful.
    async appendMessage(conversationId, input) {
      await requireConversation(conversationId); // ownership + existence gate
      const ts = deps.now();
      const inserted = await db
        .insert(aiMessages)
        .values({
          id: deps.nextId("ai_message"),
          conversationId,
          role: input.role,
          content: input.content ?? "",
          attachments: input.attachments ?? [],
          modelMetadata: input.modelMetadata ?? {},
          createdAt: ts,
        })
        .returning();
      await db
        .update(aiConversations)
        .set({ updatedAt: ts })
        .where(eq(aiConversations.id, conversationId));
      return inserted[0]!;
    },

    async listMessages(conversationId) {
      await requireConversation(conversationId); // ownership + existence gate
      return db
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conversationId))
        .orderBy(asc(aiMessages.createdAt));
    },

    async listTasks() {
      return db
        .select()
        .from(aiTasks)
        .where(eq(aiTasks.userId, deps.userId))
        .orderBy(asc(aiTasks.requestedAt));
    },

    getTask: requireTask,

    // Idempotent create: the (user_id, idempotency_key) UNIQUE index means a
    // duplicate request returns the EXISTING task rather than minting a second
    // one (design-spec §7). onConflictDoNothing → empty returning() on conflict,
    // so we fall back to the user-scoped lookup by idempotency key.
    async createTask({
      taskType,
      idempotencyKey,
      projectId,
      contentOutputId,
      inputData,
      modelKey,
    }) {
      const ts = deps.now();
      const inserted = await db
        .insert(aiTasks)
        .values({
          id: deps.nextId("ai_task"),
          userId: deps.userId,
          projectId: projectId ?? null,
          contentOutputId: contentOutputId ?? null,
          taskType,
          status: "queued",
          inputData: inputData ?? {},
          modelKey: modelKey ?? "",
          idempotencyKey,
          requestedAt: ts,
          startedAt: null,
          completedAt: null,
          errorMessage: null,
          sessionId: null,
          costUsd: null,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) return inserted[0];

      const existing = await db
        .select()
        .from(aiTasks)
        .where(
          and(
            eq(aiTasks.userId, deps.userId),
            eq(aiTasks.idempotencyKey, idempotencyKey),
          ),
        );
      return existing[0]!;
    },

    // FSM transition: only edges declared in TASK_TRANSITIONS are legal
    // (adjacent-only, mirroring project-repository.transition). startedAt is
    // stamped on the first move into running; completedAt on any terminal.
    async transitionTask(taskId, status, patch) {
      const task = await requireTask(taskId);
      const allowed = TASK_TRANSITIONS[task.status as TaskStatus] ?? [];
      if (!allowed.includes(status)) {
        throw new Error(
          `ConflictError: illegal task transition ${task.status} -> ${status}`,
        );
      }
      const ts = deps.now();
      const set: Partial<TaskRow> = { status };
      if (status === "running" && task.startedAt === null) set.startedAt = ts;
      if (
        status === "succeeded" ||
        status === "failed" ||
        status === "cancelled"
      ) {
        set.completedAt = ts;
      }
      if (patch?.errorMessage !== undefined) set.errorMessage = patch.errorMessage;
      if (patch?.costUsd !== undefined) set.costUsd = patch.costUsd;
      const updated = await db
        .update(aiTasks)
        .set(set)
        .where(eq(aiTasks.id, taskId))
        .returning();
      return updated[0]!;
    },

    async addTaskReference(taskId, input) {
      await requireTask(taskId); // caller must own the parent task
      const inserted = await db
        .insert(aiTaskReferences)
        .values({
          id: deps.nextId("ai_task_ref"),
          aiTaskId: taskId,
          entityType: input.entityType,
          entityId: input.entityId,
          relationType: input.relationType,
        })
        .returning();
      return inserted[0]!;
    },

    async listTaskReferences(taskId) {
      await requireTask(taskId); // ownership + existence gate
      return db
        .select()
        .from(aiTaskReferences)
        .where(eq(aiTaskReferences.aiTaskId, taskId));
    },

    async addTaskResult(taskId, input) {
      await requireTask(taskId); // caller must own the parent task
      const inserted = await db
        .insert(aiTaskResults)
        .values({
          id: deps.nextId("ai_task_result"),
          aiTaskId: taskId,
          resultType: input.resultType,
          artifactId: input.artifactId ?? null,
          knowledgeItemId: input.knowledgeItemId ?? null,
          assetId: input.assetId ?? null,
          resultData: input.resultData ?? {},
        })
        .returning();
      return inserted[0]!;
    },

    async listTaskResults(taskId) {
      await requireTask(taskId); // ownership + existence gate
      return db
        .select()
        .from(aiTaskResults)
        .where(eq(aiTaskResults.aiTaskId, taskId))
        .orderBy(desc(aiTaskResults.id));
    },
  };
}
