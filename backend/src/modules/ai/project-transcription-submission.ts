import { and, eq, workspaceKey, workspaceFilter, workspaceStamp, projectTranscriptionRequests, type Db } from '@creatoros/backend';
import type { RequestContext } from '@creatoros/contract';
import { createAiService, type ServiceDeps } from './ai.service';
import { AttemptIdInvalidError, AttemptPayloadMismatchError, ConflictError } from './ai.errors';
export interface ProjectTranscriptionSubmission {
    projectId: string;
    attemptId: string;
}
type Task = Awaited<ReturnType<ReturnType<typeof createAiService>['getTask']>>;
type Prepared = {
    awemeId: string;
    inputData: Record<string, unknown>;
};
/** 请求回执、在途合并、任务创建由后端提交；配置读取不占数据库写事务。 */
export async function submitProjectTranscription(deps: ServiceDeps, context: RequestContext, original: ProjectTranscriptionSubmission) {
    const ctx = structuredClone(context), input = structuredClone(original);
    const workspace = workspaceKey(ctx);
    const stamp = workspaceStamp(ctx);
    if (typeof input.attemptId !== 'string' || input.attemptId.length < 16 || input.attemptId.length > 128)
        throw new AttemptIdInvalidError();
    if (!input.projectId?.trim())
        throw new ConflictError('转写必须属于具体项目');
    const targets = deps.projectTranscriptionTargets;
    if (!targets)
        throw new Error('转写事务目标端口未装配');
    const where = and(eq(projectTranscriptionRequests.userId, ctx.userId), workspaceFilter(projectTranscriptionRequests,workspace), eq(projectTranscriptionRequests.attemptId, input.attemptId));
    function awemeOf(task: Task) {
        const ids = task.inputData.awemeIds;
        if (task.taskType !== 'transcribe.douyin' || task.projectId !== input.projectId || !Array.isArray(ids) || ids.length !== 1 || typeof ids[0] !== 'string' || !ids[0])
            throw new AttemptPayloadMismatchError(task.id);
        return ids[0] as string;
    }
    async function replay(db: Db) {
        const [receipt] = await db.select().from(projectTranscriptionRequests).where(where);
        if (!receipt)
            return null;
        // SEMANTIC_BOUNDARY_ALLOW:同请求项目 ID 精确比较，只校验幂等意图，不判断语义。
        if (receipt.projectId !== input.projectId)
            throw new AttemptPayloadMismatchError(receipt.aiTaskId);
        const task = await createAiService({ ...deps, db }).getTask(ctx, receipt.aiTaskId);
        if (awemeOf(task) !== receipt.awemeId)
            throw new ConflictError('转写请求与原任务不一致');
        return task;
    }
    async function record(tx: Db, task: Task) {
        const inserted = await tx.insert(projectTranscriptionRequests).values({ id: deps.nextId('transcription-request'), userId: ctx.userId, ...stamp, attemptId: input.attemptId, projectId: input.projectId, awemeId: awemeOf(task), aiTaskId: task.id, createdAt: deps.now() }).onConflictDoNothing().returning();
        if (!inserted.length) {
            // 跨项目争用同请求键时整笔事务回滚，不留下输家的新任务。
            const [winner] = await tx.select().from(projectTranscriptionRequests).where(where);
            throw new AttemptPayloadMismatchError(winner?.aiTaskId ?? task.id);
        }
    }
    const prior = await replay(deps.db);
    if (prior)
        return prior;
    async function transact(runtime?: {
        prepared: Prepared;
        data: Record<string, unknown>;
    }): Promise<{
        task: Task;
    } | {
        prepared: Prepared;
    }> {
        return deps.db.transaction(async (transaction) => {
            const tx = transaction as unknown as Db;
            await targets!.lock(tx, ctx, input.projectId);
            const existing = await replay(tx);
            if (existing)
                return { task: existing };
            const service = createAiService({ ...deps, db: tx, resolveTaskRuntimeData: async () => structuredClone(runtime?.data ?? {}) });
            // 兼容已有单请求任务；历史回读不因当前正文或来源变化而重建。
            const legacy = await service.findTaskByAttempt(ctx, 'transcribe.douyin', input.attemptId);
            if (legacy) {
                awemeOf(legacy);
                await record(tx, legacy);
                return { task: legacy };
            }
            const target = await targets!.read(tx, ctx, input.projectId);
            if (target.hasTranscript)
                throw new ConflictError('ConflictError: 该项目已经有逐字稿，不支持重复抓取');
            let task: Task | undefined;
            for (let offset = 0;; offset += 200) {
                const page = await service.listTasks(ctx, { limit: 200, offset, projectId: input.projectId, taskType: 'transcribe.douyin' });
                task = page.rows.find(row => {
                    const active = row.runtimeStatus ? !['succeeded', 'partial', 'failed', 'cancelled'].includes(row.runtimeStatus) : !['succeeded', 'failed', 'cancelled', 'partial'].includes(row.status);
                    return active && Array.isArray(row.inputData.awemeIds) && row.inputData.awemeIds.length === 1 && row.inputData.awemeIds[0] === target.awemeId;
                });
                if (task || offset + page.rows.length >= page.total)
                    break;
            }
            if (!task) {
                const prepared = { awemeId: target.awemeId, inputData: { projectId: input.projectId, awemeIds: [target.awemeId], idempotencyKey: `project-transcribe:${input.projectId}:${target.awemeId}` } };
                if (!runtime)
                    return { prepared };
                if (runtime.prepared.awemeId !== target.awemeId)
                    throw new ConflictError('转写项目来源已变化，请重新发起');
                task = await service.createTask(ctx, { taskType: 'transcribe.douyin', attemptId: input.attemptId, inputData: prepared.inputData });
            }
            await record(tx, task);
            return { task };
        });
    }
    const first = await transact();
    if ('task' in first)
        return first.task;
    const data = structuredClone(await deps.resolveTaskRuntimeData?.(structuredClone(ctx), 'transcribe.douyin', Object.freeze(structuredClone(first.prepared.inputData))) ?? {});
    const final = await transact({ prepared: first.prepared, data });
    if (!('task' in final))
        throw new Error('转写提交未完成');
    return final.task;
}
