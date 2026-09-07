import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq, aiTasks, executionCalls, executionTasks, type Db } from "@creatoros/backend";
import { transcribeAudioReceiptSchema, asrTaskInputSchema, asrRequestSchema, asrAudioManifestSchema, asrResultReceiptSchema, workerPortInputSchemas, type AsrRequest, type ExecutionRef, type WorkerPort } from "@creatoros/contract/execution-worker";
import { canonicalJson } from "../ai/canonical-json";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { ConflictError } from "./execution.errors";
type Scope = Parameters<Parameters<ReturnType<typeof createExecutionLeaseService>["withLease"]>[2]>[0];
const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
const operationKey = (awemeId: string, index: number) => `transcribe:${awemeId}/asr/${index + 1}`;
const manifestOf = (request: AsrRequest) => asrAudioManifestSchema.parse({ audioDigest: request.audioDigest, audioByteLength: request.audioByteLength, chunks: request.chunks });
/** ASR 顶层请求专用端口；任务、归属和请求清单由后端锁内绑定，不放宽聊天子模型账本。 */
export function createExecutionAsrPorts(db: Db, deps: Parameters<typeof createExecutionCallLedgerService>[1]) {
    const leases = createExecutionLeaseService(db, deps);
    const ledgerFor = (scope: Scope) => createExecutionCallLedgerService(scope.tx as unknown as Db, deps);
    async function bind(scope: Scope, awemeId: string) {
        const { task, tx, context } = scope, payload = task.payload as Record<string, unknown>, input = asrTaskInputSchema.parse(payload.modelInput);
        const [business] = await tx.select().from(aiTasks).where(and(eq(aiTasks.id, task.ownerId), eq(aiTasks.executionTaskId, task.id), eq(aiTasks.userId, context.userId), eq(aiTasks.accountId, context.accountId!)));
        const raw = business?.inputData as {
            awemeIds?: unknown;
            awemeId?: unknown;
        } | undefined;
        const ids = Array.isArray(raw?.awemeIds) ? raw.awemeIds : typeof raw?.awemeId === 'string' ? [raw.awemeId] : [];
        if (task.kind !== 'ai_task' || task.ownerType !== 'ai_task' || !business || payload.aiTaskId !== business.id || business.taskType !== 'transcribe.douyin' || !isDeepStrictEqual(input.awemeIds, ids) || !input.awemeIds.includes(awemeId))
            throw new ConflictError('转写执行与原作品归属不符');
        const manifests = payload.asrAudioManifests;
        if (manifests !== undefined && (!manifests || typeof manifests !== 'object' || Array.isArray(manifests)))
            throw new ConflictError('转写音频清单损坏');
        return { input, payload, manifests: (manifests ?? {}) as Record<string, unknown> };
    }
    async function boundCall(scope: Scope, awemeId: string, callId: string) {
        const bound = await bind(scope, awemeId), manifest = asrAudioManifestSchema.parse(bound.manifests[awemeId]);
        const [call] = await scope.tx.select().from(executionCalls).where(and(eq(executionCalls.id, callId), eq(executionCalls.executionTaskId, scope.task.id)));
        const index = manifest.chunks.findIndex((_, i) => call?.operationKey === operationKey(awemeId, i));
        if (!call || index < 0 || call.kind !== 'model' || call.parentCallId || call.toolExecutionClaimId || call.accountingBasis !== 'requests' || call.reservedTokens !== 0)
            throw new ConflictError('ASR 调用与原作品不符');
        const request = { ...bound.input.identity, ...manifest, chunkIndex: index, chunkCount: manifest.chunks.length, chunkDigest: manifest.chunks[index]!.digest, chunkByteLength: manifest.chunks[index]!.byteLength };
        if (call.inputDigest !== digest(request))
            throw new ConflictError('ASR 调用与冻结请求不符');
        return { call, manifest, index };
    }
    const receipt = (call: typeof executionCalls.$inferSelect) => ({ callId: call.id, status: call.status, ...(call.status === 'settled' ? { result: asrResultReceiptSchema.parse(JSON.parse(call.resultText ?? 'null')).result } : {}), ...(call.rejectionCode?.startsWith('ASR_HTTP_') ? { rejectionStatus: Number(call.rejectionCode.slice(9)) } : {}) });
    const service = {
        async reserve(ref: ExecutionRef, raw: unknown) {
            const { awemeId, request } = workerPortInputSchemas.reserveAsrRequest.parse(raw);
            return leases.withLease(ref, 'admission', async (scope) => {
                const { input, payload, manifests } = await bind(scope, awemeId);
                const { protocol, provider, model, endpointDigest, language } = request;
                if (!isDeepStrictEqual(input.identity, { protocol, provider, model, endpointDigest, language }))
                    throw new ConflictError('ASR 身份与冻结模型不符');
                const audio=transcribeAudioReceiptSchema.parse((payload.transcribeAudioInputs as Record<string,unknown>|undefined)?.[awemeId]);
                if(audio.state!=="ready"||audio.audioDigest!==request.audioDigest||audio.audioByteLength!==request.audioByteLength)throw new ConflictError("ASR 缺少与当前请求一致的原音频快照");
                const manifest = manifestOf(request), current = manifests[awemeId], ledger = ledgerFor(scope), state = await ledger.inspect(ref);
                if (current !== undefined) {
                    if (!isDeepStrictEqual(asrAudioManifestSchema.parse(current), manifest))
                        throw new ConflictError('原音频或分片清单已改变');
                }
                else {
                    if (request.chunkIndex !== 0 || state.calls.some(call => call.operationKey.startsWith(`transcribe:${awemeId}/asr/`)))
                        throw new ConflictError('已有请求不能补写新音频清单');
                    await scope.tx.update(executionTasks).set({ payload: { ...payload, asrAudioManifests: { ...manifests, [awemeId]: manifest } } }).where(eq(executionTasks.id, scope.task.id));
                }
                const key = operationKey(awemeId, request.chunkIndex), existing = state.calls.filter(call => call.operationKey === key).at(-1);
                // 原事实先回读，不能被后片的 unknown 误伤。
                if (!existing)
                    for (let i = 0; i < request.chunkIndex; i++) {
                        const prefix = state.calls.filter(call => call.operationKey === operationKey(awemeId, i)).at(-1);
                        if (!prefix || prefix.status !== 'settled' || prefix.accountingBasis !== 'requests')
                            throw new ConflictError('前一分片尚未确认');
                        asrResultReceiptSchema.parse(JSON.parse(prefix.resultText ?? 'null'));
                    }
                const call = await ledger.reserve(ref, { operationKey: key, kind: 'model', inputDigest: digest(request), reservedTokens: 0, accountingBasis: 'requests', ...(existing?.id === scope.task.retryOfCallId ? { retryOfCallId: existing.id } : {}) });
                return receipt(call);
            });
        },
        async start(ref: ExecutionRef, raw: unknown) {
            const { awemeId, callId } = workerPortInputSchemas.startAsrRequest.parse(raw);
            return leases.withLease(ref, 'admission', async (scope) => { await boundCall(scope, awemeId, callId); return receipt(await ledgerFor(scope).start(ref, callId)); });
        },
        async settle(ref: ExecutionRef, raw: unknown) {
            const input = workerPortInputSchemas.settleAsrRequest.parse(raw);
            return leases.withLease(ref, 'settlement', async (scope) => {
                const { call } = await boundCall(scope, input.awemeId, input.callId);
                if (input.status !== "unknown" && !["settled", "rejected"].includes(call.status) && call.startedAttempt !== ref.attempt)
                    throw new ConflictError("新租约不能替旧未知 ASR 调用补交正文或拒绝事实");
                const settlement = input.status === 'settled' ? { status: 'settled' as const, usage: {}, resultText: JSON.stringify({ schemaVersion: 1, result: input.result }) } : input.status === 'unknown' ? { status: 'unknown' as const } : { status: 'rejected' as const, ...(input.rejectionStatus ? { rejectionCode: `ASR_HTTP_${input.rejectionStatus}` as const } : {}) };
                return receipt(await ledgerFor(scope).settle(ref, input.callId, settlement));
            });
        },
        async invoke(ref: ExecutionRef, port: WorkerPort, raw: unknown) {
            if (port === 'reserveAsrRequest')
                return service.reserve(ref, raw);
            if (port === 'startAsrRequest')
                return service.start(ref, raw);
            if (port === 'settleAsrRequest')
                return service.settle(ref, raw);
            throw new ConflictError('不是 ASR 命名端口');
        },
    };
    return service;
}
