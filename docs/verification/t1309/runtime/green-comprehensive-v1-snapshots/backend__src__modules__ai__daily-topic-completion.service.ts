import {workspaceFilter} from "../../workspace-scope";
import {isDeepStrictEqual} from 'node:util';
import {assertExecutionTaskWorkspaceAdmission} from '../scheduling';
import { assessAudienceTask } from "../candidate";
import { topicSourceRead } from "@creatoros/contract";
import { z } from 'zod';
import { and, eq, asc, aiTasks, aiTaskResults, executionTasks, executionCalls, type Db } from '@creatoros/backend';
import type { RequestContext } from '@creatoros/contract';
import { workerStructuredResultSchema, type ExecutionRef } from '@creatoros/contract/execution-worker';
import { normalizeTopics, topicArraySchema, dailyTopicInputSchema, topicGenerateFrozenSchema } from '@creatoros/ai-worker';
import { computePreferenceAdjustment, rankWithExploration } from '../candidate/topic-preference-guardrail';
import { createExecutionLeaseService } from '../execution/execution-lease.service';
import { ConflictError } from '../execution/execution.errors';
import type { AiCandidatePort } from './ai.service';
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type RunRef = {
    jobId: string;
    jobRunId: string;
    aiTaskId: string;
};
export interface DailyTopicCompletionPorts {
    validateRun(ctx: RequestContext, run: RunRef, tx: Tx): Promise<unknown>;
    lockAccount(ctx: RequestContext, tx: Tx): Promise<unknown>;
    countCandidatesForDay(ctx: RequestContext, day: string, tx: Tx): Promise<number>;
    createCandidate(ctx: RequestContext, input: Parameters<AiCandidatePort['createFromAIResult']>[1], tx: Tx): Promise<{
        id: string;
    }>;
    finishRun(ctx: RequestContext, input: RunRef & {
        itemsNew: number;
        itemsUpdated: 0;
        message: string;
    }, tx: Tx): Promise<unknown>;
}
const frozenSchema = dailyTopicInputSchema;
const modelSchema = z.object({ kind: z.literal('model.structured'), skillId: z.literal('topic.generate'), facets: z.object({ __dailyTopic: z.string(), __topicGenerate: z.string().optional() }) });
const commitSchema = z.object({ outcome: z.literal('succeeded'), callId: z.string().min(1), text: z.string() }).strict();
// SEMANTIC_BOUNDARY_ALLOW: 复用既有已批准偏好护栏和探索排序，不新增语义规则。
const clamp = (n: number) => Math.max(0, Math.min(100, n));
export function createDailyTopicCompletionService(db: Db, deps: {
    now?: () => string;
    ports: DailyTopicCompletionPorts;
}) {
    const now = deps.now ?? (() => new Date().toISOString()), p = deps.ports;
    async function complete(ref: ExecutionRef, raw?: unknown) {
        const commit = raw === undefined ? undefined : commitSchema.parse(raw);
        return db.transaction(async outerTx => {
            const [snapshot] = await outerTx.select().from(executionTasks).where(eq(executionTasks.id, ref.executionTaskId));
            if (!snapshot) throw new ConflictError('执行凭证已失效');
            const replayOnly = snapshot.status === 'succeeded';
            // 与认领保持 account→member→group→execution；结算持有execution后不再新取工作区锁。
            if (!replayOnly) await assertExecutionTaskWorkspaceAdmission(outerTx, snapshot);
            // 必须复用outerTx的session/savepoint，不能以root db开启第二连接等待自己。
            return createExecutionLeaseService(outerTx as unknown as Db, { now }).withLease(ref, 'settlement', async ({ tx, task, context }) => {
            const identity = (row: typeof executionTasks.$inferSelect) => ({
                id: row.id, userId: row.userId, groupId: row.groupId, accountId: row.accountId,
                groupVersion: row.groupVersion, membershipVersion: row.membershipVersion,
                kind: row.kind, ownerType: row.ownerType, ownerId: row.ownerId,
                attempt: row.attempt, fenceToken: row.fenceToken, payload: row.payload,
            });
            if (!isDeepStrictEqual(identity(snapshot), identity(task)))
                throw new ConflictError('每日选题冻结执行归属已改变');
            if (replayOnly && task.status !== 'succeeded')
                throw new ConflictError('每日选题历史完成事实已改变');
            if (task.kind !== 'ai_task' || task.ownerType !== 'ai_task')
                throw new ConflictError('每日选题执行归属无效');
            const businessQuery = tx.select().from(aiTasks).where(and(eq(aiTasks.id, task.ownerId), eq(aiTasks.executionTaskId, task.id), eq(aiTasks.userId, context.userId), workspaceFilter(aiTasks,context)));
            const [business] = await (replayOnly ? businessQuery : businessQuery.for('update'));
            if (!business || business.taskType !== 'scheduled.topic.daily' || (task.payload as {
                aiTaskId?: unknown;
            }).aiTaskId !== business.id || business.groupId !== task.groupId || business.accountId !== task.accountId || business.groupVersion !== task.groupVersion || business.membershipVersion !== task.membershipVersion)
                throw new ConflictError('每日选题任务映射无效');
            const model = modelSchema.parse((task.payload as {
                modelInput?: unknown;
            }).modelInput), frozen = frozenSchema.parse(JSON.parse(model.facets.__dailyTopic));
            if (commit) {
                const topic = topicGenerateFrozenSchema.parse(JSON.parse(model.facets.__topicGenerate ?? 'null'));
                if (topic.mode !== 'daily' || topic.basis !== 'positioning' || topic.projectId !== null || business.projectId !== null)
                    throw new ConflictError('每日选题模式或归属不符');
            }
            const calls = await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId, task.id)).orderBy(asc(executionCalls.sequence));
            const call = commit ? calls.find(c => c.id === commit.callId) : undefined;
            const resultId = commit ? `daily-topic:${commit.callId}` : `daily-topic-skip:${task.id}`;
            const [existing] = await tx.select().from(aiTaskResults).where(eq(aiTaskResults.id, resultId));
            if (existing) {
                if (existing.aiTaskId !== business.id || existing.resultType !== 'daily_topic_completion' || task.status !== 'succeeded' || business.status !== 'succeeded' || (commit && (!call || call !== calls.at(-1) || call.kind !== 'model' || call.status !== 'settled' || !call.providerResult || existing.executionCallId !== call.id || call.resultRef !== resultId || call.resultText !== commit.text)) || (!commit && (calls.length || !frozen.skipReason || existing.executionCallId !== null)))
                    throw new ConflictError('每日选题完成回执不一致');
                return { resultId, aiTaskId: business.id };
            }
            if (replayOnly) throw new ConflictError('每日选题历史完成回执缺失');
            const stamp = now();
            if (task.status !== 'running' || !task.leaseOwner || !task.leaseExpiresAt || Date.parse(task.leaseExpiresAt) <= Date.parse(stamp) || (task.deadlineAt && Date.parse(task.deadlineAt) <= Date.parse(stamp)) || !['queued', 'running'].includes(business.status))
                throw new ConflictError('每日选题当前不可提交');
            if (calls.some(c => ['reserved', 'started', 'unknown'].includes(c.status)))
                throw new ConflictError('每日选题仍有未确认调用');
            await p.validateRun(context, { jobId: frozen.jobId, jobRunId: frozen.jobRunId, aiTaskId: business.id }, tx);
            await p.lockAccount(context, tx);
            const day = stamp.slice(0, 10);
            let count = 0;
            if (commit) {
                count = await p.countCandidatesForDay(context, day, tx);
                if (!Number.isSafeInteger(count) || count < 0)
                    throw new ConflictError('每日供给计数无效');
            }
            let ids: string[] = [], usage: unknown = { totalTokens: 0 };
            if (!commit) {
                if (!frozen.skipReason || calls.length)
                    throw new ConflictError('无可信零调用跳过事实');
                if (frozen.skipReason === 'quota') {
                    const observed = (frozen as {
                        observedCount?: number;
                    }).observedCount;
                    if (!Number.isSafeInteger(observed) || observed! < frozen.dailyLimit)
                        throw new ConflictError('冻结额度检查缺少真实计数');
                }
            }
            else {
                if (frozen.skipReason || !call || call !== calls.at(-1) || call.kind !== 'model' || call.status !== 'settled' || !call.providerResult || call.resultText !== commit.text)
                    throw new ConflictError('每日选题缺少最后真实模型回执');
                const structured = workerStructuredResultSchema.parse(JSON.parse(call.resultText));
                if (structured.validation?.status === 'partial')
                    throw new ConflictError('每日选题结果尚未完整');
                const topicFrozen=topicGenerateFrozenSchema.parse(JSON.parse(model.facets.__topicGenerate??'null'));
                const topics = normalizeTopics(topicArraySchema.parse(structured.object).topics).map((topic,index)=>({...topic,index,audienceAssessment:topicFrozen.audienceTaskContext?assessAudienceTask(topic.audienceTask??{},topicFrozen.audienceTaskContext,stamp,z.array(topicSourceRead).parse((structured.object as {sourceReads?:unknown}).sourceReads??[])):undefined})).filter(t=>t.audienceAssessment?.route!=="unsuitable");
                const scored = topics.map((topic, index) => { const baseScore = clamp(topic.predictedScore ?? 50); return { id: String(index), baseScore, adjustedScore: clamp(baseScore + computePreferenceAdjustment(`${topic.title} ${topic.angle}`, frozen.preferences, frozen.rankingNow)), topic }; });
                const ranked = rankWithExploration(scored, { limit: Math.max(0, frozen.dailyLimit - count), explorationSlots: 1 });
                for (const item of ranked) {
                    const value = await p.createCandidate(context, { aiTaskId: `${business.id}#${item.id}`, resultType: 'candidate', resultData: { title: item.topic.title, angle: item.topic.angle, source: item.topic.source === 'benchmark' || item.topic.source === 'demand' ? item.topic.source : 'trend', predictedScore: item.adjustedScore,card:item.topic.audienceAssessment?{audienceTask:item.topic.audienceAssessment,oneLiner:item.topic.audienceAssessment.job,targetAudience:item.topic.audienceAssessment.audience}:undefined } }, tx);
                    ids.push(value.id);
                }
                usage = { totalTokens: calls.some(c => c.status === 'settled' && c.totalTokens === null) ? null : calls.reduce((n, c) => n + (c.totalTokens ?? 0), 0) };
            }
            const message = commit ? `每日选题已入池 ${ids.length} 条` : (frozen.skipReason === 'quota' ? '该次检查已达额度，跳过每日选题' : '该次检查未配置模型，跳过每日选题');
            await p.finishRun(context, { jobId: frozen.jobId, jobRunId: frozen.jobRunId, aiTaskId: business.id, itemsNew: ids.length, itemsUpdated: 0, message }, tx);
            await tx.insert(aiTaskResults).values({ id: resultId, aiTaskId: business.id, resultType: 'daily_topic_completion', executionCallId: call?.id ?? null, resultData: { candidateIds: ids, itemsNew: ids.length, dayKey: day, frozenDayKey: frozen.dayKey, decisionDay: frozen.dayKey, observedCount: (frozen as {
                        observedCount?: number;
                    }).observedCount ?? null, dailyLimit: frozen.dailyLimit, skipReason: commit ? null : frozen.skipReason, usage } });
            if (call)
                await tx.update(executionCalls).set({ resultRef: resultId, updatedAt: stamp }).where(eq(executionCalls.id, call.id));
            await tx.update(aiTasks).set({ status: 'succeeded', completedAt: stamp, errorMessage: null, leaseOwner: null, leaseToken: null, leaseExpiresAt: null }).where(eq(aiTasks.id, business.id));
            await tx.update(executionTasks).set({ status: 'succeeded', leaseOwner: null, leaseExpiresAt: null, heartbeatAt: null, retryAt: null, lastErrorCode: null, lastErrorMessage: null, updatedAt: stamp }).where(eq(executionTasks.id, task.id));
            return { resultId, aiTaskId: business.id };
            });
        });
    }
    return { commitResult: (ref: ExecutionRef, input: unknown) => complete(ref, input), completeDailyTopicSkip: (ref: ExecutionRef) => complete(ref) };
}
