import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { and, eq, asc, aiTasks, aiTaskResults, executionTasks, executionCalls, type Db } from '@creatoros/backend';
import type { AssetsService } from '../assets';
import { assetProcessingInputSchema, materialExtractionSchema, assetProcessingCompleteSchema, structuredGenerationInputSchema, workerStructuredResultSchema, type ExecutionRef } from '@creatoros/contract/execution-worker';
import { classificationSchema, materialSummarySchema } from '@creatoros/ai-worker';
import { createExecutionLeaseService } from './execution-lease.service';
import { createAssetProcessingService } from '../assets/asset-processing.service';
import { assignAssetClassificationTags } from '../taxonomy/asset-classification-tags.service';
import { ConflictError } from './execution.errors';
export function createExecutionAssetProcessingService(db: Db, deps: {
    assets: Pick<AssetsService, 'getAsset' | 'getAssetBytes'>;
    now?: () => string;
}) {
    const now = deps.now ?? (() => new Date().toISOString()), leases = createExecutionLeaseService(db, { now }), domain = createAssetProcessingService();
    type Scope = Parameters<Parameters<typeof leases.withLease>[2]>[0];
    const bind = async ({ tx, task, context }: Scope) => {
        const [business] = await tx.select().from(aiTasks).where(and(eq(aiTasks.id, task.ownerId), eq(aiTasks.executionTaskId, task.id), eq(aiTasks.userId, context.userId), eq(aiTasks.accountId, context.accountId!))).for('update');
        const model = structuredGenerationInputSchema.parse((task.payload as {
            modelInput?: unknown;
        }).modelInput), target = assetProcessingInputSchema.parse(JSON.parse(model.facets.__assetProcessing ?? 'null'));
        if (task.kind !== 'ai_task' || task.ownerType !== 'ai_task' || !business || (task.payload as {
            aiTaskId?: unknown;
        }).aiTaskId !== business.id || business.taskType !== target.taskType || model.skillId !== target.taskType || model.capability !== (target.taskType === 'asset.classify' ? 'asset.classify' : 'script.draft') || (business.inputData as {
            assetId?: unknown;
        }).assetId !== target.assetId)
            throw new ConflictError('素材处理真实任务绑定不符');
        return { business, model, target };
    };
    const active = (scope: Scope) => { const stamp = Date.parse(now()); if (scope.task.status !== 'running' || !scope.task.leaseOwner || !scope.task.leaseExpiresAt || Date.parse(scope.task.leaseExpiresAt) <= stamp || (scope.task.deadlineAt && Date.parse(scope.task.deadlineAt) <= stamp))
        throw new ConflictError('素材处理已停止或租约到期'); };
    return { async read(ref: ExecutionRef, signal?: AbortSignal) {
            const saved = await leases.withLease(ref, 'admission', async (scope) => { const bound = await bind(scope); await domain.lock(scope.tx as unknown as Db, scope.context, bound.target); return { ...bound, context: scope.context, extraction: (scope.task.payload as {
                    materialExtraction?: unknown;
                }).materialExtraction }; });
            signal?.throwIfAborted();
            const file = saved.target.checksum ? await deps.assets.getAssetBytes(saved.context, saved.target.assetId) : null;
            signal?.throwIfAborted();
            if (saved.target.checksum && (!file || createHash('sha256').update(file.bytes).digest('hex') !== saved.target.checksum || file.mimeType !== saved.target.mimeType))
                throw new ConflictError('素材字节与冻结版本不符');
            await leases.withLease(ref, 'admission', async (scope) => { await bind(scope); await domain.lock(scope.tx as unknown as Db, scope.context, saved.target); });
            signal?.throwIfAborted();
            return { bytes: file?.bytes ?? null, mimeType: saved.target.mimeType, extraction: saved.extraction ? materialExtractionSchema.parse(saved.extraction) : null };
        }, async saveExtraction(ref: ExecutionRef, raw: unknown, signal?: AbortSignal) {
            const value = materialExtractionSchema.parse(raw);
            return leases.withLease(ref, 'admission', async (scope) => {
                const { target } = await bind(scope);
                if (target.taskType !== 'material.extract')
                    throw new ConflictError('当前任务不能保存文档抽取');
                signal?.throwIfAborted();
                const payload = scope.task.payload as Record<string, unknown>;
                if (payload.materialExtraction) {
                    if (!isDeepStrictEqual(payload.materialExtraction, value))
                        throw new ConflictError('同一文件抽取事实冲突');
                    return value;
                }
                await domain.saveExtraction(scope.tx as unknown as Db, scope.context, target, value);
                signal?.throwIfAborted();
                active(scope);
                await scope.tx.update(executionTasks).set({ payload: { ...payload, materialExtraction: value } }).where(eq(executionTasks.id, scope.task.id));
                signal?.throwIfAborted();
                return value;
            });
        }, async complete(ref: ExecutionRef, raw: unknown, signal?: AbortSignal) {
            const input = assetProcessingCompleteSchema.parse(raw);
            return leases.withLease(ref, 'settlement', async (scope) => {
                const { tx, task, context } = scope, { business, target } = await bind(scope), resultId = `asset-process:${task.id}`;
                const [existing] = await tx.select().from(aiTaskResults).where(eq(aiTaskResults.id, resultId));
                if (existing) {
                    if (existing.aiTaskId !== business.id || existing.resultType !== target.taskType || task.status !== 'succeeded' || business.status !== 'succeeded' || (input.callId && existing.executionCallId !== input.callId))
                        throw new ConflictError('素材完成历史回执不符');
                    if (input.callId) {
                        const [oldCall] = await tx.select().from(executionCalls).where(and(eq(executionCalls.id, input.callId), eq(executionCalls.executionTaskId, task.id)));
                        if (!oldCall || oldCall.status !== 'settled' || oldCall.resultRef !== resultId || oldCall.resultText !== input.text)
                            throw new ConflictError('素材完成原模型回执不符');
                    }
                    return { resultId, aiTaskId: business.id };
                }
                signal?.throwIfAborted();
                active(scope);
                if (!['queued', 'running'].includes(business.status))
                    throw new ConflictError('素材业务任务已结束');
                const calls = await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId, task.id)).orderBy(asc(executionCalls.sequence));
                if (calls.some(c => ['reserved', 'started', 'unknown'].includes(c.status)))
                    throw new ConflictError('素材处理仍有未知模型调用');
                const call = input.callId ? calls.find(c => c.id === input.callId) : undefined;
                if (input.callId && (!call || call.status !== 'settled' || call.kind !== 'model' || call.parentCallId || !call.providerResult || call.resultText !== input.text || calls.at(-1)?.id !== call.id))
                    throw new ConflictError('素材处理缺少真实模型回执');
                let resultData: Record<string, unknown> = { assetId: target.assetId };
                await domain.lock(tx as unknown as Db, context, target);
                if (target.taskType === 'material.extract') {
                    const extraction = materialExtractionSchema.parse((task.payload as {
                        materialExtraction?: unknown;
                    }).materialExtraction);
                    resultData = { ...resultData, extractStatus: extraction.status, note: extraction.note };
                    if (call) {
                        const summary = materialSummarySchema.parse(workerStructuredResultSchema.parse(JSON.parse(input.text!)).object);
                        await domain.annotate(tx as unknown as Db, context, target, { materialSummary: summary });
                        resultData.summary = summary;
                        resultData.summaryTruncated = (extraction.text?.length ?? 0) > 200000;
                    }
                    else if (extraction.status === 'done' && !target.skipModel && calls.length === 0)
                        throw new ConflictError('摘要尚未执行，不能假完成');
                    else if (extraction.status === 'done')
                        resultData.summaryStatus = target.skipModel ? 'model_unconfigured' : 'failed';
                }
                else if (call) {
                    const classification = classificationSchema.parse(workerStructuredResultSchema.parse(JSON.parse(input.text!)).object);
                    if (classification.tags.length)
                        await assignAssetClassificationTags(tx as unknown as Db, context, target.assetId, classification.tags, now);
                    if (classification.description)
                        await domain.annotate(tx as unknown as Db, context, target, { aiDescription: classification.description });
                    resultData.classification = classification;
                }
                else if (!target.skipModel && target.checksum && target.mimeType.startsWith('image/'))
                    throw new ConflictError('图片归类尚无模型回执');
                else
                    resultData.skipped = true;
                signal?.throwIfAborted();
                active(scope);
                const stamp = now();
                await tx.insert(aiTaskResults).values({ id: resultId, aiTaskId: business.id, resultType: target.taskType, executionCallId: call?.id ?? null, resultData });
                if (call)
                    await tx.update(executionCalls).set({ resultRef: resultId, updatedAt: stamp }).where(eq(executionCalls.id, call.id));
                await tx.update(aiTasks).set({ status: 'succeeded', completedAt: stamp, errorMessage: null, leaseOwner: null, leaseToken: null, leaseExpiresAt: null }).where(eq(aiTasks.id, business.id));
                await tx.update(executionTasks).set({ status: 'succeeded', leaseOwner: null, leaseExpiresAt: null, heartbeatAt: null, retryAt: null, retryOfCallId: null, lastErrorCode: null, lastErrorMessage: null, updatedAt: stamp }).where(eq(executionTasks.id, task.id));
                signal?.throwIfAborted();
                return { resultId, aiTaskId: business.id };
            });
        } };
}
