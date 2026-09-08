import {bindTranscribeAudioExecution,type TranscribeResourceBinding} from './transcribe-execution-binding';
import {readTranscribeAsrPlan} from './transcribe-asr-plan';
import {asrExecutionIdentity} from '@creatoros/ai-worker/asr-identity';
import {localWhisperSpec} from '@creatoros/ai-worker';
import {assembleAsrTranscript} from '@creatoros/ai-worker/asr-transcript';
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq, asc, aiTasks, executionCalls, executionTasks, type Db } from "@creatoros/backend";
import { transcribeAudioReceiptSchema, transcribeTaskInputSchema, transcribeAsrPlanSchema, asrTaskInputSchema, asrRequestSchema, asrAudioManifestSchema, asrResultReceiptSchema, workerPortInputSchemas, type AsrRequest, type ExecutionRef, type WorkerPort } from "@creatoros/contract/execution-worker";
import { canonicalJson } from "../ai/canonical-json";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { ConflictError, ExecutionBudgetError } from "./execution.errors";
type Scope = Parameters<Parameters<ReturnType<typeof createExecutionLeaseService>["withLease"]>[2]>[0];
const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
const operationKey = (awemeId: string, index: number, protocol: AsrRequest["protocol"]) => `transcribe:${awemeId}/${protocol === "whisper-local.v1" ? "local-asr" : "asr"}/${index + 1}`;
const manifestOf = (request: AsrRequest) => asrAudioManifestSchema.parse({ audioDigest: request.audioDigest, audioByteLength: request.audioByteLength, chunks: request.chunks });
/** ASR 顶层请求专用端口；任务、归属和请求清单由后端锁内绑定，不放宽聊天子模型账本。 */
export function createExecutionAsrPorts(db: Db, deps: Parameters<typeof createExecutionCallLedgerService>[1]&{bindResource?:TranscribeResourceBinding}) {
    const leases = createExecutionLeaseService(db, deps);
    const ledgerFor = (scope: Scope) => createExecutionCallLedgerService(scope.tx as unknown as Db, deps);
    async function bind(scope: Scope, awemeId: string,primaryOnly=false) {
        const { task, tx, context } = scope, payload = task.payload as Record<string, unknown>;
        const resource=deps.bindResource?await deps.bindResource(scope,awemeId):null;
        const legacy=asrTaskInputSchema.safeParse(resource?null:payload.modelInput);
        const selected=legacy.success?null:readTranscribeAsrPlan(payload,awemeId);
        const plan=selected?(primaryOnly?selected.primary:selected.plan):null;
        if(!legacy.success&&!plan)throw new ConflictError('缺少原识别选择');
        const input=legacy.success?legacy.data:{...transcribeTaskInputSchema.parse(resource?resource.input:payload.modelInput),identity:plan!.identity};
        if(plan){const audio=transcribeAudioReceiptSchema.parse((payload.transcribeAudioInputs as Record<string,unknown>)?.[awemeId]);if(audio.audioDigest!==plan.audioDigest||audio.audioByteLength!==plan.audioByteLength)throw new ConflictError("实际识别身份与原音频不符");}
        if(!legacy.success){if(!resource)await bindTranscribeAudioExecution(scope,awemeId);if(!input.awemeIds.includes(awemeId))throw new ConflictError("ASR 输入与领域资源不符");}
        else {
        const [business] = await tx.select().from(aiTasks).where(and(eq(aiTasks.id, task.ownerId), eq(aiTasks.executionTaskId, task.id), eq(aiTasks.userId, context.userId), eq(aiTasks.accountId, context.accountId!)));
        const raw = business?.inputData as {
            awemeIds?: unknown;
            awemeId?: unknown;
        } | undefined;
        const ids = Array.isArray(raw?.awemeIds) ? raw.awemeIds : typeof raw?.awemeId === 'string' ? [raw.awemeId] : [];
        if (task.kind !== 'ai_task' || task.ownerType !== 'ai_task' || !business || payload.aiTaskId !== business.id || business.taskType !== 'transcribe.douyin' || !isDeepStrictEqual(input.awemeIds, ids) || !input.awemeIds.includes(awemeId))
            throw new ConflictError('转写执行与原作品归属不符');
        }
        const manifestKey = input.identity.protocol === "whisper-local.v1" ? "localAsrAudioManifests" : "asrAudioManifests";
        const manifests = payload[manifestKey];
        if (manifests !== undefined && (!manifests || typeof manifests !== 'object' || Array.isArray(manifests)))
            throw new ConflictError('转写音频清单损坏');
        return { input, payload, manifestKey, manifests: (manifests ?? {}) as Record<string, unknown> };
    }
    function validateCall(bound:Awaited<ReturnType<typeof bind>>,manifest:ReturnType<typeof asrAudioManifestSchema.parse>,call:typeof executionCalls.$inferSelect,index:number){
        if (index < 0 || call.kind !== 'model' || call.parentCallId || call.toolExecutionClaimId || call.accountingBasis !== 'requests' || call.reservedTokens !== 0)
            throw new ConflictError('ASR 调用与原作品不符');
        const request = { ...bound.input.identity, ...manifest, chunkIndex: index, chunkCount: manifest.chunks.length, chunkDigest: manifest.chunks[index]!.digest, chunkByteLength: manifest.chunks[index]!.byteLength };
        if (call.inputDigest !== digest(request))throw new ConflictError('ASR 调用与冻结请求不符');
        return {call,manifest,index,protocol:bound.input.identity.protocol};
    }
    async function boundCall(scope: Scope, awemeId: string, callId: string) {
        const [call] = await scope.tx.select().from(executionCalls).where(and(eq(executionCalls.id, callId), eq(executionCalls.executionTaskId, scope.task.id)));
        if(!call)throw new ConflictError('ASR 调用与原作品不符');
        const bound=await bind(scope,awemeId,call.operationKey.startsWith(`transcribe:${awemeId}/asr/`)),manifest=asrAudioManifestSchema.parse(bound.manifests[awemeId]);
        const index = manifest.chunks.findIndex((_, i) => call.operationKey === operationKey(awemeId, i, bound.input.identity.protocol));
        return validateCall(bound,manifest,call,index);
    }
    const receipt = (call: typeof executionCalls.$inferSelect) => ({ callId: call.id, status: call.status, ...(call.status === 'settled' ? { result: asrResultReceiptSchema.parse(JSON.parse(call.resultText ?? 'null')).result } : {}), ...(call.rejectionCode?.startsWith('ASR_HTTP_') ? { rejectionStatus: Number(call.rejectionCode.slice(9)) } : {}) });
    const service = {
        async selectLocalFallback(ref:ExecutionRef,raw:unknown,onlyIfProven=false){
            const {awemeId}=workerPortInputSchemas.selectTranscribeLocalFallback.parse(raw);
            return leases.withLease(ref,'admission',async scope=>{
                const bound=await bind(scope,awemeId,true),selected=readTranscribeAsrPlan(bound.payload,awemeId);
                if(!selected.primary||selected.primary.identity.protocol==='whisper-local.v1')throw new ConflictError('只有原云端执行可回退');
                if(selected.fallback)return selected.fallback.plan;
                const audio=transcribeAudioReceiptSchema.parse((bound.payload.transcribeAudioInputs as Record<string,unknown>)?.[awemeId]);
                if(audio.state!=='ready'||audio.audioDigest!==selected.primary.audioDigest||audio.audioByteLength!==selected.primary.audioByteLength)throw new ConflictError('回退需要同一原音频');
                const state=await ledgerFor(scope).inspect(ref);
                if(state.calls.some(call=>['reserved','started','unknown'].includes(call.status)||(call.status==='settled'&&call.accountingBasis!=='requests'&&call.totalTokens===null))){if(onlyIfProven)return null;throw new ConflictError('已有调用未核对，不能改走本地');}
                if(onlyIfProven&&bound.manifests[awemeId]===undefined)return null;
                const manifest=asrAudioManifestSchema.parse(bound.manifests[awemeId]),calls=new Map(state.calls.map(call=>[call.operationKey,call]));
                const sources:typeof state.calls=[],parts=[];let rejected=false;
                for(let index=0;index<manifest.chunks.length;index++){
                    const call=calls.get(operationKey(awemeId,index,bound.input.identity.protocol));
                    if(!call){if(onlyIfProven)return null;throw new ConflictError('云端缺少完成或拒绝事实');}
                    validateCall(bound,manifest,call,index);sources.push(call);
                    if(call.status==='rejected'){rejected=true;break;}
                    if(call.status!=='settled')throw new ConflictError('云端结果未确认');
                    parts.push(asrResultReceiptSchema.parse(JSON.parse(call.resultText??'null')).result);
                }
                if(!rejected&&assembleAsrTranscript(bound.input.identity,parts).text.trim()){if(onlyIfProven)return null;throw new ConflictError('云端已有正文，无需改走本地');}
                if(!state.budget||!state.deadlineAt||state.calls.length>=state.budget.maxCalls||Date.parse(state.deadlineAt)<=Date.parse((deps.now??(()=>new Date().toISOString()))()))throw new ExecutionBudgetError('原执行预算不足，不能另开本地识别');
                const plan=transcribeAsrPlanSchema.parse({...selected.primary,identity:asrExecutionIdentity(localWhisperSpec(),selected.primary.identity.language)});
                await scope.tx.update(executionTasks).set({payload:{...bound.payload,transcribeLocalFallbacks:{...selected.fallbacks,[awemeId]:{plan,sourceCallIds:sources.map(call=>call.id),reason:rejected?'rejected':'empty'}}}}).where(eq(executionTasks.id,scope.task.id));
                return plan;
            });
        },
        async recoverLocalFallback(ref:ExecutionRef,raw:unknown){return service.selectLocalFallback(ref,raw,true);},
        async read(ref:ExecutionRef,raw:unknown){
            const {awemeId}=workerPortInputSchemas.prepareTranscribeAsr.parse(raw);
            return leases.withLease(ref,'admission',async scope=>{
                const bound=await bind(scope,awemeId),rawManifest=bound.manifests[awemeId];
                if(rawManifest===undefined)return null;
                const manifest=asrAudioManifestSchema.parse(rawManifest);
                const audio=transcribeAudioReceiptSchema.parse((bound.payload.transcribeAudioInputs as Record<string,unknown>)?.[awemeId]);
                if(audio.state!=='ready'||audio.audioDigest!==manifest.audioDigest||audio.audioByteLength!==manifest.audioByteLength)throw new ConflictError('原音频与识别清单不符');
                const calls=await scope.tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,scope.task.id)).orderBy(asc(executionCalls.sequence));
                const byOperation=new Map(calls.map(call=>[call.operationKey,call]));
                const parts=[];
                for(let index=0;index<manifest.chunks.length;index++){
                    const call=byOperation.get(operationKey(awemeId,index,bound.input.identity.protocol));
                    if(!call||call.status!=='settled')return null;
                    validateCall(bound,manifest,call,index);
                    parts.push(asrResultReceiptSchema.parse(JSON.parse(call.resultText??'null')).result);
                }
                return {identity:bound.input.identity,result:assembleAsrTranscript(bound.input.identity,parts)};
            });
        },
        async reserve(ref: ExecutionRef, raw: unknown) {
            const { awemeId, request } = workerPortInputSchemas.reserveAsrRequest.parse(raw);
            return leases.withLease(ref, 'admission', async (scope) => {
                const { input, payload, manifestKey, manifests } = await bind(scope, awemeId);
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
                    if (request.chunkIndex !== 0 || state.calls.some(call => call.operationKey.startsWith(operationKey(awemeId, 0, input.identity.protocol).slice(0,-1))))
                        throw new ConflictError('已有请求不能补写新音频清单');
                    await scope.tx.update(executionTasks).set({ payload: { ...payload, [manifestKey]: { ...manifests, [awemeId]: manifest } } }).where(eq(executionTasks.id, scope.task.id));
                }
                const key = operationKey(awemeId, request.chunkIndex, input.identity.protocol), existing = state.calls.filter(call => call.operationKey === key).at(-1);
                // 原事实先回读，不能被后片的 unknown 误伤。
                if (!existing)
                    for (let i = 0; i < request.chunkIndex; i++) {
                        const prefix = state.calls.filter(call => call.operationKey === operationKey(awemeId, i, input.identity.protocol)).at(-1);
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
                const { call, protocol } = await boundCall(scope, input.awemeId, input.callId);
                if(protocol==='whisper-local.v1'&&input.status==='rejected'&&input.rejectionStatus!==undefined)throw new ConflictError('本地识别不能声明 HTTP 拒绝');
                if (input.status !== "unknown" && !["settled", "rejected"].includes(call.status) && call.startedAttempt !== ref.attempt)
                    throw new ConflictError("新租约不能替旧未知 ASR 调用补交正文或拒绝事实");
                const settlement = input.status === 'settled' ? { status: 'settled' as const, usage: {}, resultText: JSON.stringify({ schemaVersion: 1, result: input.result }) } : input.status === 'unknown' ? { status: 'unknown' as const } : { status: 'rejected' as const, ...(input.rejectionStatus ? { rejectionCode: `ASR_HTTP_${input.rejectionStatus}` as const } : {}) };
                return receipt(await ledgerFor(scope).settle(ref, input.callId, settlement));
            });
        },
        async invoke(ref: ExecutionRef, port: WorkerPort, raw: unknown) {
            if (port === 'selectTranscribeLocalFallback')return service.selectLocalFallback(ref,raw);
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
