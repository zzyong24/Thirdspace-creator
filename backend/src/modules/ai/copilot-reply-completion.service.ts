import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import { z } from "zod";
import {
  and,
  eq,
  asc,
  aiTasks,
  aiTaskResults,
  aiConversations,
  executionTasks,
  executionCalls,
  type Db,
} from "@creatoros/backend";
import {
  workerPortInputSchemas,
  workerStructuredResultSchema,
  type ExecutionRef,
} from "@creatoros/contract/execution-worker";
import {
  copilotReplySchema,
  copilotReplyInputSchema,
} from "@creatoros/ai-worker";
import { createExecutionLeaseService } from "../execution/execution-lease.service";
import { ConflictError } from "../execution/execution.errors";
import { createAiRepository } from "./ai.repository";
const modelSchema = z.object({
  kind: z.literal("model.structured"),
  skillId: z.literal("copilot.assist"),
  capability: z.literal("copilot.assist"),
  facets: z.object({ __copilotReply: z.string() }),
});
/** 后端依据已结算调用写会话回复；消息、业务结果、执行终态与回执同一事务。 */
export function createCopilotReplyCompletionService(
  db: Db,
  deps: { now?: () => string } = {},
) {
  const now = deps.now ?? (() => new Date().toISOString()),
    leases = createExecutionLeaseService(db, { now });
  return {
    async commitResult(ref: ExecutionRef, raw: unknown) {
      const input = workerPortInputSchemas.commitResult.parse(raw);
      if (input.outcome !== "succeeded")
        throw new ConflictError("对话失败须经执行状态端口");
      return leases.withLease(
        ref,
        "settlement",
        async ({ tx, task, context }) => {
          if (task.kind !== "ai_task" || task.ownerType !== "ai_task")
            throw new ConflictError("对话执行归属无效");
          const [business] = await tx
            .select()
            .from(aiTasks)
            .where(
              and(
                eq(aiTasks.id, task.ownerId),
                eq(aiTasks.executionTaskId, task.id),
                eq(aiTasks.userId, context.userId),
                workspaceFilter(aiTasks,context),
              ),
            )
            .for("update");
          if (
            !business ||
            business.taskType !== "copilot.assist" ||
            (task.payload as { aiTaskId?: unknown }).aiTaskId !== business.id
          )
            throw new ConflictError("对话任务映射无效");
          const model = modelSchema.parse(
              (task.payload as { modelInput?: unknown }).modelInput,
            ),
            frozen = copilotReplyInputSchema.parse(
              JSON.parse(model.facets.__copilotReply),
            ),
            sourceInput = copilotReplyInputSchema.parse(business.inputData);
          if (
            JSON.stringify(sourceInput) !== JSON.stringify(frozen) ||
            business.projectId !== frozen.projectId
          )
            throw new ConflictError("冻结会话与任务输入不符");
          const calls = await tx
              .select()
              .from(executionCalls)
              .where(eq(executionCalls.executionTaskId, task.id))
              .orderBy(asc(executionCalls.sequence)),
            call = calls.find((c) => c.id === input.callId);
          if (
            !call ||
            call.kind !== "model" ||
            call.status !== "settled" ||
            !call.providerResult ||
            call.resultText !== input.text
          )
            throw new ConflictError("缺少真实回复调用回执");
          const resultId = `copilot:${call.id}`,
            messageId = `reply:${business.id}`;
          const [existing] = await tx
            .select()
            .from(aiTaskResults)
            .where(eq(aiTaskResults.id, resultId));
          if (existing) {
            if (
              existing.aiTaskId !== business.id ||
              existing.resultType !== "conversation_reply" ||
              call.resultRef !== resultId ||
              task.status !== "succeeded" ||
              business.status !== "succeeded"
            )
              throw new ConflictError("回复完成回执不一致");
            return { resultId, aiTaskId: business.id };
          }
          const stamp = now();
          if (
            call.resultRef ||
            task.status !== "running" ||
            !task.leaseOwner ||
            !task.leaseExpiresAt ||
            Date.parse(task.leaseExpiresAt) <= Date.parse(stamp) ||
            (task.deadlineAt &&
              Date.parse(task.deadlineAt) <= Date.parse(stamp)) ||
            !["queued", "running"].includes(business.status) ||
            call !== calls.at(-1) ||
            calls.some((c) =>
              ["reserved", "started", "unknown"].includes(c.status),
            )
          )
            throw new ConflictError("对话当前不可提交");
          const [conversation] = await tx
            .select()
            .from(aiConversations)
            .where(
              and(
                eq(aiConversations.id, frozen.conversationId),
                eq(aiConversations.userId, context.userId),
                workspaceFilter(aiConversations,context),
              ),
            )
            .for("update");
          if (!conversation || conversation.projectId !== frozen.projectId)
            throw new ConflictError("会话归属已改变");
          const repo = createAiRepository(tx as unknown as Db, {
            now: () => stamp,
            nextId: () => messageId,
            userId: context.userId,
            accountId: context.accountId??null,groupId:context.groupId,
          });
          const messages = await repo.listMessages(conversation.id),
            byId = new Map(messages.map((m) => [m.id, m])),
            source = byId.get(frozen.sourceMessageId);
          if (
            !source ||
            source.role !== "user" ||
            (source.modelMetadata as { replyTaskId?: unknown }).replyTaskId !==
              business.id ||
            frozen.historyMessageIds.some((id) => !byId.has(id))
          )
            throw new ConflictError("会话来源消息已不可用");
          const structured = workerStructuredResultSchema.parse(
            JSON.parse(call.resultText!),
          );
          if (structured.validation?.status === "partial")
            throw new ConflictError("对话回复尚未完整");
          const reply = copilotReplySchema.parse(structured.object).reply;
          await repo.createMessage(conversation.id, {
            role: "assistant",
            content: reply,
            attachments: [],
            modelMetadata: {
              replyTaskId: business.id,
              sourceMessageId: source.id,
            },
            usage: structured.generation.usage,
            modelKey: structured.modelLabel ?? null,
          });
          await tx
            .insert(aiTaskResults)
            .values({
              id: resultId,
              aiTaskId: business.id,
              resultType: "conversation_reply",
              executionCallId: call.id,
              resultData: {
                conversationId: conversation.id,
                sourceMessageId: source.id,
                messageId,
              },
            });
          await tx
            .update(executionCalls)
            .set({ resultRef: resultId, updatedAt: stamp })
            .where(eq(executionCalls.id, call.id));
          await tx
            .update(aiTasks)
            .set({
              status: "succeeded",
              completedAt: stamp,
              errorMessage: null,
              leaseOwner: null,
              leaseToken: null,
              leaseExpiresAt: null,
            })
            .where(eq(aiTasks.id, business.id));
          await tx
            .update(executionTasks)
            .set({
              status: "succeeded",
              leaseOwner: null,
              leaseExpiresAt: null,
              heartbeatAt: null,
              retryAt: null,
              retryOfCallId: null,
              lastErrorCode: null,
              lastErrorMessage: null,
              updatedAt: stamp,
            })
            .where(eq(executionTasks.id, task.id));
          return { resultId, aiTaskId: business.id };
        },
      );
    },
  };
}
