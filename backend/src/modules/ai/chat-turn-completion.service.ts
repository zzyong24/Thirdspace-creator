import type {TerminalToolBinding,TerminalToolInputResolver} from "../execution/workbench-plan.service";
import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import { partitionExecutionCalls } from "../execution/execution-call-tree";
import { and, asc, eq, aiTasks, aiMessages, aiConversations, aiTaskResults, executionTasks, executionCalls, executionStreamEvents, type Db } from "@creatoros/backend";
import { chatWorkerInputSchema, workerProviderReceiptSchema, executionCheckpointSchema, workerPortInputSchemas, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "../execution/execution-lease.service";
import { ConflictError } from "../execution/execution.errors";
import { createAiRepository } from "./ai.repository";
import { chatHistoryDigest, chatInputDigest } from "./chat-turn-submission.service";
import { selectFrozenChatHistory } from "./chat-turn-history";
import { projectChatReceipts,readChatApprovalFacts } from "./chat-receipt-projection";
import { restoreHistoricalChatToolCards } from "./chat-historical-tool-stream.service";
import type { TerminalPlanIssue, TerminalToolFailure } from "../execution/workbench-plan.service";
import { isDeepStrictEqual } from "node:util";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** 同一事务提交聊天消息、业务结果、调用结果引用和执行终态。完成请求只含已有账本引用。 */
export function createChatTurnCompletionService(db: Db, deps: {
    now?: () => string;
    validateTerminalPlanFailures?(payload: unknown, candidateStepIds?: string[], requireFailureIds?: boolean): TerminalPlanIssue[] | null;
    validateTerminalToolFailures?(calls:ReadonlyArray<typeof executionCalls.$inferSelect>,candidateCallIds?:string[],requireFailureIds?:boolean,resolveInput?:TerminalToolInputResolver):TerminalToolFailure[]|null;
} = {}) {
    const now = deps.now ?? (() => new Date().toISOString()), leases = createExecutionLeaseService(db, { now });
    return { async commitResult(ref: ExecutionRef, raw: unknown, trustedBinding?:(task:typeof executionTasks.$inferSelect,calls:Array<typeof executionCalls.$inferSelect>,call:typeof executionCalls.$inferSelect)=>TerminalToolBinding) {
            const request = workerPortInputSchemas.commitChatResult.parse(raw);
            return leases.withLease(ref, "settlement", async ({ tx, task, context }) => {
                if (task.kind !== "ai_task" || task.ownerType !== "ai_task")
                    throw new ConflictError("聊天执行归属无效");
                const [business] = await tx.select().from(aiTasks).where(and(eq(aiTasks.id, task.ownerId), eq(aiTasks.executionTaskId, task.id), eq(aiTasks.userId, context.userId), workspaceFilter(aiTasks,context))).for("update");
                const payload = object(task.payload), sourceInput = object(business?.inputData), frozen = chatWorkerInputSchema.parse(payload.modelInput);
                if (!business || business.taskType !== "copilot.assist" || payload.aiTaskId !== business.id || sourceInput.kind !== "chat.run" || sourceInput.conversationId !== frozen.conversationId || sourceInput.sourceMessageId !== frozen.sourceMessageId || frozen.userId !== context.userId || frozen.accountId !== (context.accountId??null) || (frozen.groupId??null)!==(context.groupId??null) || sourceInput.modelInputDigest !== chatInputDigest(frozen))
                    throw new ConflictError("聊天任务来源或冻结映射无效");
                const [conversation] = await tx.select().from(aiConversations).where(and(eq(aiConversations.id, frozen.conversationId), eq(aiConversations.userId, context.userId), workspaceFilter(aiConversations,context))).for("update");
                if (!conversation || conversation.projectId !== business.projectId)
                    throw new ConflictError("会话归属已改变");
                const messages = await tx.select().from(aiMessages).where(eq(aiMessages.conversationId, conversation.id)).orderBy(asc(aiMessages.createdAt));
                const {sourceMessage:source,messages:history} = selectFrozenChatHistory(conversation,messages,frozen.sourceMessageId,sourceInput.historyMessageIds);
                if (!source || source.role !== "user" || object(source.modelMetadata).chatTaskId !== business.id || JSON.stringify(history.map(message => message.id)) !== JSON.stringify(sourceInput.historyMessageIds) || chatHistoryDigest({ conversation, messages: history, sourceMessage: source }) !== sourceInput.historyDigest)
                    throw new ConflictError("会话来源已变化");
                const calls = await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId, task.id)).orderBy(asc(executionCalls.sequence));
                const {roots}=partitionExecutionCalls(calls);
                const confirmed = calls.filter(call => !["rejected","superseded"].includes(call.status)), rootConfirmed=roots.filter(call=>!["rejected","superseded"].includes(call.status)), latestRoot=roots.at(-1), lastModel = rootConfirmed.filter(call => call.kind === "model").at(-1);
                if (!lastModel || lastModel.id !== request.lastModelCallId || confirmed.some(call => call.status !== "settled") || JSON.stringify(confirmed.filter(call => call.kind === "tool").map(call => call.id).sort()) !== JSON.stringify([...request.toolCallIds].sort()))
                    throw new ConflictError("聊天调用回执不完整");
                const policyVersion=payload.terminalPlanFailurePolicyVersion;
                if(policyVersion!==undefined && policyVersion!==1)throw new ConflictError("聊天终态失败策略版本不支持");
                if(policyVersion===1 && !deps.validateTerminalPlanFailures)throw new ConflictError("execution计划校验端口未装配");
                if(policyVersion===1 && !deps.validateTerminalToolFailures)throw new ConflictError("execution工具失败校验端口未装配");
                if(policyVersion!==1 && (request.partialPlanFailureStepIds || request.terminalToolFailureCallIds))throw new ConflictError("旧策略任务不能提交终态失败说明");
                if(request.partialPlanFailureStepIds && request.terminalToolFailureCallIds)throw new ConflictError("聊天终态失败说明不能混用计划与工具引用");
                const providerFinishReason=workerProviderReceiptSchema.parse(lastModel.providerResult).finishReason.unified;
                const latestSettledStop=latestRoot?.id===lastModel.id && latestRoot.status==="settled" && providerFinishReason==="stop";
                let terminalFailureTitles=policyVersion===1?deps.validateTerminalPlanFailures!(payload,request.partialPlanFailureStepIds,latestSettledStop):null;
                const terminalToolFailures=policyVersion===1?deps.validateTerminalToolFailures!(calls,request.terminalToolFailureCallIds,latestSettledStop,trustedBinding?call=>trustedBinding(task,calls,call):undefined):null;
                if(terminalFailureTitles && request.partialPlanFailureStepIds && !latestSettledStop)throw new ConflictError("终态失败计划必须由最新settled stop回执收口");
                if(terminalToolFailures && request.terminalToolFailureCallIds && !latestSettledStop)throw new ConflictError("终态工具失败必须由最新settled stop回执收口");
                if(terminalFailureTitles && !request.partialPlanFailureStepIds){
                    if(latestRoot?.id===lastModel.id && latestRoot.status==="settled" && providerFinishReason!=="stop")terminalFailureTitles=null;
                    else throw new ConflictError("终态失败计划必须由最新settled stop回执收口");
                }
                const checkpoint = executionCheckpointSchema.parse(task.checkpoint);
                if (checkpoint.ledgerSequence !== calls.at(-1)?.sequence || JSON.stringify(checkpoint.messages) !== JSON.stringify(rootConfirmed.map(call => ({ role: call.kind === "model" ? "assistant" : "tool", callId: call.id }))))
                    throw new ConflictError("聊天检查点尚未确认全部调用");
                const events=await tx.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId,task.id)).orderBy(asc(executionStreamEvents.sequence));
                const projected = projectChatReceipts(rootConfirmed, frozen,readChatApprovalFacts(events.map(event=>event.chunk)),terminalFailureTitles??undefined,terminalToolFailures??undefined,{...(payload.toolFailureReceiptVersion===1 && latestSettledStop?{toolFailureReceiptVersion:1 as const}:{})}), resultId = `chat:${business.id}`, messageId = `chat:${source.id}`;
                const assertCards=()=>{
                // 工具结算与补卡是不同事务；卡片未确认时保持原任务可恢复，不能先发布结束。
                for(const part of projected.parts.filter(part=>typeof part.toolCallId==="string")){
                    const input=events.find(event=>event.chunk.toolCallId===part.toolCallId && ["tool-input-start","tool-input-available"].includes(String(event.chunk.type)));
                    const output=events.filter(event=>event.chunk.toolCallId===part.toolCallId && ["tool-input-error","tool-output-available","tool-output-denied"].includes(String(event.chunk.type)));
                    const expected=part.state==="output-error"?{type:"tool-input-error",toolCallId:part.toolCallId,toolName:String(part.type).slice(5),input:part.rawInput,errorText:part.errorText,...(part.callProviderMetadata?{providerMetadata:part.callProviderMetadata}:{})}
                        :part.state==="output-denied"?{type:"tool-output-denied",toolCallId:part.toolCallId}:{type:"tool-output-available",toolCallId:part.toolCallId,output:part.output};
                    if(!input || output.length!==1 || !isDeepStrictEqual(output[0]!.chunk,expected) || input.sequence>=output[0]!.sequence)throw new ConflictError("聊天工具卡尚未确认");
                }
                };
                const [existing] = await tx.select().from(aiTaskResults).where(eq(aiTaskResults.id, resultId));
                const metadata = { chatTaskId: business.id, sourceMessageId: source.id, actualEngine: frozen.executionEngine ?? "vercel", stopReason: projected.finishReason, completeness: projected.outcome === "succeeded" ? "completed" : "partial", checkpointRef: checkpoint.revision };
                const resultData = { conversationId: conversation.id, sourceMessageId: source.id, messageId, actualEngine: frozen.executionEngine ?? "vercel", stopReason: projected.finishReason, completeness: metadata.completeness, checkpointRef: checkpoint.revision };
                const finish={type:"finish",finishReason:["stop","length","tool-calls","content-filter","error","other","unknown"].includes(projected.finishReason)?projected.finishReason:"other",messageMetadata:metadata};
                const finishes=events.filter(event=>event.chunk.type==="finish");
                if(finishes.length && (finishes.length!==1 || finishes[0]!.callId!==lastModel.id || finishes[0]!.sequence!==events.at(-1)!.sequence || !isDeepStrictEqual(finishes[0]!.chunk,finish)))throw new ConflictError("聊天结束事件不一致");
                const partialChunks=projected.partialNotice?[{type:"text-start",id:`${lastModel.id}:terminal-partial`},{type:"text-delta",id:`${lastModel.id}:terminal-partial`,delta:projected.partialNotice},{type:"text-end",id:`${lastModel.id}:terminal-partial`}]:[];
                const savedPartialChunks=events.filter(event=>event.callId===lastModel.id && partialChunks.some(chunk=>chunk.id===event.chunk.id));
                if(savedPartialChunks.length && (savedPartialChunks.length!==partialChunks.length || savedPartialChunks.some((event,index)=>!isDeepStrictEqual(event.chunk,partialChunks[index]))))throw new ConflictError("聊天部分完成流事件不一致");
                if(finishes.length && partialChunks.length && savedPartialChunks.length!==partialChunks.length)throw new ConflictError("终态失败说明缺少对应流事件");
                if(!projected.partialNotice && events.some(event=>event.chunk.id===`${lastModel.id}:terminal-partial`))throw new ConflictError("非部分完成回复包含终态失败流事件");
                const appendPartialNotice=async()=>{
                    if(!partialChunks.length || savedPartialChunks.length)return;
                    let sequence=events.at(-1)?.sequence??0,callIndex=events.filter(event=>event.callId===lastModel.id).at(-1)?.callIndex??-1;
                    const stamp=now();
                    await tx.insert(executionStreamEvents).values(partialChunks.map(chunk=>({executionTaskId:task.id,sequence:++sequence,callId:lastModel.id,callIndex:++callIndex,chunk,createdAt:stamp})));
                };
                const appendFinish=async()=>{
                    if(finishes.length)return;
                    const missingPartialCount=partialChunks.length-savedPartialChunks.length;
                    const sequence=(events.at(-1)?.sequence??0)+missingPartialCount+1,callIndex=(events.filter(event=>event.callId===lastModel.id).at(-1)?.callIndex??-1)+missingPartialCount+1;
                    await tx.insert(executionStreamEvents).values({executionTaskId:task.id,sequence,callId:lastModel.id,callIndex,chunk:finish,createdAt:now()});
                };
                if (existing) {
                    const saved = messages.find(message => message.id === messageId);
                    if (chatInputDigest(existing.resultData) !== chatInputDigest(resultData) || existing.aiTaskId !== business.id || existing.resultType !== "conversation_reply" || existing.executionCallId !== lastModel.id || lastModel.resultRef !== resultId || task.status !== projected.outcome || business.status !== projected.outcome || !saved || saved.role !== "assistant" || saved.content !== projected.content || chatInputDigest(saved.parts) !== chatInputDigest(projected.parts) || chatInputDigest(saved.modelMetadata) !== chatInputDigest(metadata))
                        throw new ConflictError("聊天完成回执不一致");
                    if(!finishes.length)await restoreHistoricalChatToolCards(tx,task.id,rootConfirmed,projected.parts,events,now);
                    assertCards();
                    await appendPartialNotice();
                    await appendFinish();
                    return { resultId, aiTaskId: business.id, messageId, outcome: projected.outcome };
                }
                                assertCards();
                if(finishes.length)throw new ConflictError("聊天完成前已有结束事件");
                const stamp = now();
                if (lastModel.resultRef || task.status !== "running" || !task.leaseOwner || !task.leaseExpiresAt || Date.parse(task.leaseExpiresAt) <= Date.parse(stamp) || (task.deadlineAt && Date.parse(task.deadlineAt) <= Date.parse(stamp)) || !["queued", "running"].includes(business.status))
                    throw new ConflictError("聊天当前不可提交");
                const usage = confirmed.filter(call => call.kind === "model").map(call => workerProviderReceiptSchema.parse(call.providerResult).usage);
                const sum = (values: (number | undefined)[]) => values.some(value => value === undefined) ? null : values.reduce<number>((total, value) => total + (value ?? 0), 0);
                const repo = createAiRepository(tx as unknown as Db, { now: () => stamp, nextId: () => messageId, userId: context.userId, accountId: context.accountId??null,groupId:context.groupId });
                await repo.createMessage(conversation.id, { role: "assistant", content: projected.content, parts: projected.parts, attachments: [], modelMetadata: metadata, usage: { inputTokens: sum(usage.map(item => item.inputTokens.total)), outputTokens: sum(usage.map(item => item.outputTokens.total)), cachedTokens: sum(usage.map(item => item.inputTokens.cacheRead)) } });
                await tx.insert(aiTaskResults).values({ id: resultId, aiTaskId: business.id, resultType: "conversation_reply", executionCallId: lastModel.id, resultData });
                await tx.update(executionCalls).set({ resultRef: resultId, updatedAt: stamp }).where(eq(executionCalls.id, lastModel.id));
                await tx.update(aiTasks).set({ status: projected.outcome, completedAt: stamp, errorMessage: null, leaseOwner: null, leaseToken: null, leaseExpiresAt: null }).where(eq(aiTasks.id, business.id));
                await appendPartialNotice();
                await appendFinish();
                await tx.update(executionTasks).set({ status: projected.outcome, leaseOwner: null, leaseExpiresAt: null, heartbeatAt: null, retryAt: null, retryOfCallId: null, lastErrorCode: null, lastErrorMessage: null, updatedAt: stamp }).where(eq(executionTasks.id, task.id));
                return { resultId, aiTaskId: business.id, messageId, outcome: projected.outcome };
            });
        } };
}
