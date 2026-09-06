import { and, asc, eq, aiTasks, aiMessages, aiConversations, aiTaskResults, executionTasks, executionCalls, executionStreamEvents, type Db } from "@creatoros/backend";
import { chatWorkerInputSchema, workerProviderReceiptSchema, executionCheckpointSchema, workerPortInputSchemas, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "../execution/execution-lease.service";
import { ConflictError } from "../execution/execution.errors";
import { createAiRepository } from "./ai.repository";
import { chatHistoryDigest, chatInputDigest } from "./chat-turn-submission.service";
import { projectChatReceipts,readChatApprovalFacts } from "./chat-receipt-projection";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** 同一事务提交聊天消息、业务结果、调用结果引用和执行终态。完成请求只含已有账本引用。 */
export function createChatTurnCompletionService(db: Db, deps: {
    now?: () => string;
} = {}) {
    const now = deps.now ?? (() => new Date().toISOString()), leases = createExecutionLeaseService(db, { now });
    return { async commitResult(ref: ExecutionRef, raw: unknown) {
            const request = workerPortInputSchemas.commitChatResult.parse(raw);
            return leases.withLease(ref, "settlement", async ({ tx, task, context }) => {
                if (task.kind !== "ai_task" || task.ownerType !== "ai_task")
                    throw new ConflictError("聊天执行归属无效");
                const [business] = await tx.select().from(aiTasks).where(and(eq(aiTasks.id, task.ownerId), eq(aiTasks.executionTaskId, task.id), eq(aiTasks.userId, context.userId), eq(aiTasks.accountId, context.accountId!))).for("update");
                const payload = object(task.payload), sourceInput = object(business?.inputData), frozen = chatWorkerInputSchema.parse(payload.modelInput);
                if (!business || business.taskType !== "copilot.assist" || payload.aiTaskId !== business.id || sourceInput.kind !== "chat.run" || sourceInput.conversationId !== frozen.conversationId || sourceInput.sourceMessageId !== frozen.sourceMessageId || frozen.userId !== context.userId || frozen.accountId !== context.accountId || sourceInput.modelInputDigest !== chatInputDigest(frozen))
                    throw new ConflictError("聊天任务来源或冻结映射无效");
                const [conversation] = await tx.select().from(aiConversations).where(and(eq(aiConversations.id, frozen.conversationId), eq(aiConversations.userId, context.userId), eq(aiConversations.accountId, context.accountId!))).for("update");
                if (!conversation || conversation.projectId !== business.projectId)
                    throw new ConflictError("会话归属已改变");
                const messages = await tx.select().from(aiMessages).where(eq(aiMessages.conversationId, conversation.id)).orderBy(asc(aiMessages.createdAt));
                const sourceIndex = messages.findIndex(message => message.id === frozen.sourceMessageId), source = messages[sourceIndex];
                const history = messages.slice(0, sourceIndex + 1);
                if (!source || source.role !== "user" || object(source.modelMetadata).chatTaskId !== business.id || JSON.stringify(history.map(message => message.id)) !== JSON.stringify(sourceInput.historyMessageIds) || chatHistoryDigest({ conversation, messages: history, sourceMessage: source }) !== sourceInput.historyDigest)
                    throw new ConflictError("会话来源已变化");
                const calls = await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId, task.id)).orderBy(asc(executionCalls.sequence));
                const confirmed = calls.filter(call => call.status !== "rejected"), lastModel = confirmed.filter(call => call.kind === "model").at(-1);
                if (!lastModel || lastModel.id !== request.lastModelCallId || confirmed.some(call => call.status !== "settled") || JSON.stringify(confirmed.filter(call => call.kind === "tool").map(call => call.id).sort()) !== JSON.stringify([...request.toolCallIds].sort()))
                    throw new ConflictError("聊天调用回执不完整");
                const checkpoint = executionCheckpointSchema.parse(task.checkpoint);
                if (checkpoint.ledgerSequence !== calls.at(-1)?.sequence || JSON.stringify(checkpoint.messages) !== JSON.stringify(confirmed.map(call => ({ role: call.kind === "model" ? "assistant" : "tool", callId: call.id }))))
                    throw new ConflictError("聊天检查点尚未确认全部调用");
                const events=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,task.id)).orderBy(asc(executionStreamEvents.sequence));
                const projected = projectChatReceipts(confirmed, frozen,readChatApprovalFacts(events.map(event=>event.chunk))), resultId = `chat:${business.id}`, messageId = `chat:${source.id}`;
                const [existing] = await tx.select().from(aiTaskResults).where(eq(aiTaskResults.id, resultId));
                const metadata = { chatTaskId: business.id, sourceMessageId: source.id, actualEngine: "vercel", stopReason: projected.finishReason, completeness: projected.outcome === "succeeded" ? "completed" : "partial", checkpointRef: checkpoint.revision };
                const resultData = { conversationId: conversation.id, sourceMessageId: source.id, messageId, actualEngine: "vercel", stopReason: projected.finishReason, completeness: metadata.completeness, checkpointRef: checkpoint.revision };
                if (existing) {
                    const saved = messages.find(message => message.id === messageId);
                    if (chatInputDigest(existing.resultData) !== chatInputDigest(resultData) || existing.aiTaskId !== business.id || existing.resultType !== "conversation_reply" || existing.executionCallId !== lastModel.id || lastModel.resultRef !== resultId || task.status !== projected.outcome || business.status !== projected.outcome || !saved || saved.role !== "assistant" || saved.content !== projected.content || chatInputDigest(saved.parts) !== chatInputDigest(projected.parts) || chatInputDigest(saved.modelMetadata) !== chatInputDigest(metadata))
                        throw new ConflictError("聊天完成回执不一致");
                    return { resultId, aiTaskId: business.id, messageId, outcome: projected.outcome };
                }
                const stamp = now();
                if (lastModel.resultRef || task.status !== "running" || !task.leaseOwner || !task.leaseExpiresAt || Date.parse(task.leaseExpiresAt) <= Date.parse(stamp) || (task.deadlineAt && Date.parse(task.deadlineAt) <= Date.parse(stamp)) || !["queued", "running"].includes(business.status))
                    throw new ConflictError("聊天当前不可提交");
                const usage = confirmed.filter(call => call.kind === "model").map(call => workerProviderReceiptSchema.parse(call.providerResult).usage);
                const sum = (values: (number | undefined)[]) => values.some(value => value === undefined) ? null : values.reduce<number>((total, value) => total + (value ?? 0), 0);
                const repo = createAiRepository(tx as unknown as Db, { now: () => stamp, nextId: () => messageId, userId: context.userId, accountId: context.accountId! });
                await repo.createMessage(conversation.id, { role: "assistant", content: projected.content, parts: projected.parts, attachments: [], modelMetadata: metadata, usage: { inputTokens: sum(usage.map(item => item.inputTokens.total)), outputTokens: sum(usage.map(item => item.outputTokens.total)), cachedTokens: sum(usage.map(item => item.inputTokens.cacheRead)) } });
                await tx.insert(aiTaskResults).values({ id: resultId, aiTaskId: business.id, resultType: "conversation_reply", executionCallId: lastModel.id, resultData });
                await tx.update(executionCalls).set({ resultRef: resultId, updatedAt: stamp }).where(eq(executionCalls.id, lastModel.id));
                await tx.update(aiTasks).set({ status: projected.outcome, completedAt: stamp, errorMessage: null, leaseOwner: null, leaseToken: null, leaseExpiresAt: null }).where(eq(aiTasks.id, business.id));
                await tx.update(executionTasks).set({ status: projected.outcome, leaseOwner: null, leaseExpiresAt: null, heartbeatAt: null, retryAt: null, retryOfCallId: null, lastErrorCode: null, lastErrorMessage: null, updatedAt: stamp }).where(eq(executionTasks.id, task.id));
                return { resultId, aiTaskId: business.id, messageId, outcome: projected.outcome };
            });
        } };
}
