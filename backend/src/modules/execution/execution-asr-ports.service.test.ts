import { createWorkerSupervisor } from "./worker-supervisor";
import { createExecutionLeaseService } from "./execution-lease.service";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createExecutionWorkerCallPorts } from "./execution-worker-call-ports.service";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { createDb, aiTasks, executionTasks, executionCalls, eq, type Db } from "@creatoros/backend";
import { type AsrRequest, workerPortInputSchemas } from "@creatoros/contract/execution-worker";
import { createExecutionAuthorityService } from "./execution-authority.service";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionAsrPorts } from "./execution-asr-ports.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createDurableAsrRequestExecutor, AsrExecutionInterruption, transcribeAudio, createQwenAsrAdapter } from "@creatoros/ai-worker";
const hash = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const identity = { protocol: 'qwen-chat-audio.v1' as const, provider: 'qwen', model: 'asr', endpointDigest: hash('https://fixture.invalid/v1/chat/completions'), language: 'zh' };
const request: AsrRequest = { ...identity, audioDigest: hash('audio'), audioByteLength: 8, chunks: [{ digest: hash('a'), byteLength: 4 }, { digest: hash('b'), byteLength: 4 }], chunkDigest: hash('a'), chunkByteLength: 4, chunkIndex: 0, chunkCount: 2 };
const second = { ...request, chunkIndex: 1, chunkDigest: hash('b') };
let db: Db, close: () => Promise<void>, seq = 0;
beforeAll(async () => { const opened = await createDb(); db = opened.db; close = () => opened.client.close(); });
afterAll(async () => close?.());
async function fixture(maxCalls = 3, store: Db = db) {
    const id = `asr-${++seq}`, now = () => new Date().toISOString(), ctx = { userId: 'asr-user', accountId: 'asr-account', requestId: id, source: 'user' as const };
    await store.insert(aiTasks).values({ id, userId: ctx.userId, accountId: ctx.accountId, taskType: 'transcribe.douyin', idempotencyKey: id, inputData: { awemeIds: ['video'] }, requestedAt: now() });
    const mapped = await createExecutionAuthorityService(store).bindAiTask(ctx, id);
    await store.update(executionTasks).set({ payload: { aiTaskId: id, transcribeAudioInputs:{video:{schemaVersion:1,state:'ready',storageKey:'fixture-input',audioDigest:request.audioDigest,audioByteLength:request.audioByteLength}}, modelInput: { kind: 'transcribe.douyin', awemeIds: ['video'], identity } } }).where(eq(executionTasks.id, mapped.executionTaskId));
    const tasks = createPersistentTaskService(store), claim = (await tasks.claimTask({ taskId: mapped.executionTaskId, workerId: 'fixture' }))!;
    const ref = { executionTaskId: mapped.executionTaskId, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken }, budget = { maxCalls, maxTokens: 1000, deadlineMs: 60000 };
    const service = createExecutionAsrPorts(store, { now, budget });
    const ports = { reserve: async (input: {
            operationKey: string;
            request: AsrRequest;
        }) => service.reserve(ref, { awemeId: 'video', request: input.request }), start: async (callId: string) => { await service.start(ref, { awemeId: 'video', callId }); }, settle: async (callId: string, input: unknown) => { await service.settle(ref, { awemeId: 'video', callId, ...input as object }); } };
    return { id, ref, ports, service, budget, tasks, ledger: createExecutionCallLedgerService(store, { now, budget }), run: createDurableAsrRequestExecutor({ operationKey: 'transcribe:video', ports }) };
}
it('两片真实 DB 回执允许无 token 继续，重建执行器只读原正文', async () => {
    const f = await fixture(), http = vi.fn(async () => ({ text: '正文' }));
    await f.run(request, http);
    await f.run(second, http);
    const restored = createDurableAsrRequestExecutor({ operationKey: 'transcribe:video', ports: f.ports });
    expect(await restored(request, http)).toEqual({ text: '正文' });
    expect(await restored(second, http)).toEqual({ text: '正文' });
    expect(http).toHaveBeenCalledTimes(2);
    const state = await f.ledger.inspect(f.ref);
    expect(state.calls).toHaveLength(2);
    expect(state).toMatchObject({ spentTokens: null, unknownUsage: true });
    expect(state.calls.every(c => c.accountingBasis === 'requests' && c.totalTokens === null)).toBe(true);
});
it('未知第二片阻止重发，仍能回读成功首片', async () => {
    const f = await fixture();
    await f.run(request, async () => ({ text: '首片' }));
    await expect(f.run(second, async () => { throw new Error('断流'); })).rejects.toBeInstanceOf(AsrExecutionInterruption);
    const http = vi.fn();
    expect(await f.run(request, http)).toEqual({ text: '首片' });
    await expect(f.run(second, http)).rejects.toBeInstanceOf(AsrExecutionInterruption);
    expect(http).not.toHaveBeenCalled();
});
it('完整清单已冻结，不能换后片、音频或供应商', async () => {
    const f = await fixture();
    await f.run(request, async () => ({ text: '首片' }));
    for (const patch of [{ audioDigest: hash('changed') }, { provider: 'other' }, { chunks: [request.chunks[0]!, { digest: hash('changed'), byteLength: 4 }] }])
        await expect(f.service.reserve(f.ref, { awemeId: 'video', request: { ...request, ...patch } })).rejects.toThrow();
    expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(1);
});
it('禁止跳片，调用次数预算不足时清单与预留一起回滚', async () => {
    const f = await fixture(1);
    await expect(f.service.reserve(f.ref, { awemeId: 'video', request: second })).rejects.toThrow();
    await f.run(request, async () => ({ text: '首片' }));
    await expect(f.service.reserve(f.ref, { awemeId: 'video', request: second })).rejects.toThrow();
    expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(1);
});
it('请求与调用 ID 不能跨作品、账号、任务或旧租约', async () => {
    const a = await fixture(), b = await fixture();
    const call = await a.service.reserve(a.ref, { awemeId: 'video', request });
    await expect(a.service.reserve(a.ref, { awemeId: 'foreign', request })).rejects.toThrow();
    await expect(b.service.start(b.ref, { awemeId: 'video', callId: call.callId })).rejects.toThrow();
    await expect(a.service.start({ ...a.ref, fenceToken: 'old' }, { awemeId: 'video', callId: call.callId })).rejects.toThrow();
    await db.update(aiTasks).set({ accountId: 'changed' }).where(eq(aiTasks.id, a.id));
    await expect(a.service.start(a.ref, { awemeId: 'video', callId: call.callId })).rejects.toThrow();
});
it('成功 ACK 丢失后原回执可恢复，迟到 unknown 不抹成功', async () => {
    const f = await fixture(), http = vi.fn(async () => ({ text: '原文' }));
    let lost = true;
    const run = createDurableAsrRequestExecutor({ operationKey: 'transcribe:video', ports: { ...f.ports, settle: async (id, input) => { await f.ports.settle(id, input); if (lost) {
                lost = false;
                throw Error('ACK lost');
            } } } });
    await expect(run(request, http)).rejects.toBeInstanceOf(AsrExecutionInterruption);
    expect(await run(request, http)).toEqual({ text: '原文' });
    expect(http).toHaveBeenCalledTimes(1);
    const call = (await f.ledger.inspect(f.ref)).calls[0]!;
    await f.service.settle(f.ref, { awemeId: 'video', callId: call.id, status: 'unknown' });
    expect((await f.ledger.inspect(f.ref)).calls[0]?.status).toBe('settled');
});
it('取消后不能 reserve/start，但在途结果仍可结算', async () => {
    const f = await fixture(), call = await f.service.reserve(f.ref, { awemeId: 'video', request });
    await f.service.start(f.ref, { awemeId: 'video', callId: call.callId });
    await db.update(executionTasks).set({ status: 'cancel_requested' }).where(eq(executionTasks.id, f.ref.executionTaskId));
    await expect(f.service.reserve(f.ref, { awemeId: 'video', request: second })).rejects.toThrow();
    await f.service.settle(f.ref, { awemeId: 'video', callId: call.callId, status: 'settled', result: { text: '已返回' } });
    expect((await db.select().from(executionCalls).where(eq(executionCalls.id, call.callId)))[0]?.status).toBe('settled');
});
it('Worker 不得选择请求计量或提交错误分片清单', () => {
    expect(workerPortInputSchemas.reserveCall.safeParse({ operationKey: 'x', maxOutputTokens: 2, accountingBasis: 'requests' }).success).toBe(false);
    for (const patch of [{ chunkCount: 3 }, { chunkIndex: 2 }, { chunkDigest: hash('wrong') }, { chunks: [] }, { accountId: 'injected' }])
        expect(workerPortInputSchemas.reserveAsrRequest.safeParse({ awemeId: 'video', request: { ...request, ...patch } }).success).toBe(false);
});
it('通用模型端口不能启动或伪造 ASR 回执', async () => {
    const f = await fixture(), call = await f.service.reserve(f.ref, { awemeId: 'video', request });
    const generic = createExecutionWorkerCallPorts(db, { budget: f.budget });
    await expect(generic.startCall(f.ref, { callId: call.callId })).rejects.toThrow();
    await f.service.start(f.ref, { awemeId: 'video', callId: call.callId });
    await expect(generic.settleCall(f.ref, { callId: call.callId, status: 'settled', usage: { totalTokens: 0 }, text: '伪造' })).rejects.toThrow();
});
it('临时磁盘数据库关闭重开后，真实 Qwen 分片适配器复用原回执且不再次 HTTP', async () => {
    const dir = await mkdtemp(join(tmpdir(), 't915-asr-ledger-'));
    let opened = await createDb({ dataDir: join(dir, 'db') });
    try {
        const f = await fixture(3, opened.db);
        const frame = new Uint8Array(417);
        frame.set([255, 251, 144, 0]);
        const audio = new Uint8Array(834);
        audio.set(frame);
        audio.set(frame, 417);
        const [owner]=await opened.db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
        await opened.db.update(executionTasks).set({payload:{...owner!.payload as Record<string,unknown>,transcribeAudioInputs:{video:{schemaVersion:1,state:'ready',storageKey:'fixture-input',audioDigest:`sha256:${createHash('sha256').update(audio).digest('hex')}`,audioByteLength:audio.byteLength}}}}).where(eq(executionTasks.id,f.ref.executionTaskId));
        const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '片段' } }] })));
        const registry = { qwen: createQwenAsrAdapter({ fetch: fetcher, maxEncodedBytes: 600 }) };
        const spec = { provider: 'qwen', model: 'asr', baseUrl: 'https://fixture.invalid', kind: 'audio' as const, token: 'fixture-only' };
        expect((await transcribeAudio(spec, { audioBytes: audio, language: 'zh', executeRequest: f.run }, registry)).text).toBe('片段\n片段');
        await opened.client.close();
        opened = await createDb({ dataDir: join(dir, 'db') });
        await opened.client.exec(await readFile(new URL('../../../drizzle/0090_execution_call_accounting_basis.sql', import.meta.url), 'utf8'));
        const service = createExecutionAsrPorts(opened.db, { budget: f.budget }), ports = { reserve: async (input: {
                request: AsrRequest;
            }) => service.reserve(f.ref, { awemeId: 'video', request: input.request }), start: async (callId: string) => { await service.start(f.ref, { awemeId: 'video', callId }); }, settle: async (callId: string, input: unknown) => { await service.settle(f.ref, { awemeId: 'video', callId, ...input as object }); } };
        const run = createDurableAsrRequestExecutor({ operationKey: 'transcribe:video', ports });
        expect((await transcribeAudio(spec, { audioBytes: audio, language: 'zh', executeRequest: run }, registry)).text).toBe('片段\n片段');
        expect(fetcher).toHaveBeenCalledTimes(2);
    }
    finally {
        await opened.client.close();
        await rm(dir, { recursive: true, force: true });
    }
}, 30000);
it('明确拒绝只在宿主指定原 retryOfCallId 后按原键重试并累计预算', async () => {
    const f = await fixture(2), http = vi.fn(async () => { throw Object.assign(Error('限流'), { statusCode: 429 }); });
    await expect(f.run(request, http)).rejects.toMatchObject({ statusCode: 429 });
    await expect(f.run(request, http)).rejects.toMatchObject({ statusCode: 429 });
    expect(http).toHaveBeenCalledTimes(1);
    const first = (await f.ledger.inspect(f.ref)).calls[0]!;
    await db.update(executionTasks).set({ retryOfCallId: first.id }).where(eq(executionTasks.id, f.ref.executionTaskId));
    await expect(f.run(request, http)).rejects.toMatchObject({ statusCode: 429 });
    expect(http).toHaveBeenCalledTimes(2);
    const last = (await f.ledger.inspect(f.ref)).calls.at(-1)!;
    expect(last.operationKey).toBe(first.operationKey);
    expect(last.retryOfCallId).toBe(first.id);
    await db.update(executionTasks).set({ retryOfCallId: last.id }).where(eq(executionTasks.id, f.ref.executionTaskId));
    await expect(f.run(request, http)).rejects.toBeInstanceOf(AsrExecutionInterruption);
    expect(http).toHaveBeenCalledTimes(2);
});
it('真实子进程经命名端口结算，Supervisor 将 ASR 结算识别为 settlement', async () => {
    const f = await fixture(), dir = await mkdtemp(join(tmpdir(), 't915-asr-ipc-')), entry = join(dir, 'worker.cjs'), modes: string[] = [];
    await writeFile(entry, `let n=0,pending=new Map();function call(execution,port,data){return new Promise((resolve,reject)=>{const requestId=String(++n);pending.set(requestId,{resolve,reject});process.send({version:1,type:'call',requestId,execution,port,data});});}process.on('message',async m=>{if(m.type==='reply'){const p=pending.get(m.requestId);if(p){pending.delete(m.requestId);m.ok?p.resolve(m.data):p.reject(Error(m.errorCode));}return;}if(m.type!=='run')return;let reason='failed';try{const data={awemeId:'video',request:${JSON.stringify(request)}},r=await call(m.execution,'reserveAsrRequest',data);await call(m.execution,'startAsrRequest',{awemeId:'video',callId:r.callId});await call(m.execution,'settleAsrRequest',{awemeId:'video',callId:r.callId,status:'settled',result:{text:'IPC 原文'}});reason='completed';}catch{}process.send({version:1,type:'stopped',requestId:m.requestId,execution:m.execution,reason});});process.send({version:1,type:'ready',requestId:'ready',capabilities:['asr-fixture']});`);
    const leases = createExecutionLeaseService(db), supervisor = createWorkerSupervisor({ entryPath: entry, ports: { validate: async (ref, mode) => { modes.push(mode); await leases.withLease(ref, mode, async () => { }); }, invoke: (ref, port, raw) => f.service.invoke(ref, port, raw) } });
    try {
        expect(await supervisor.run(f.ref, Date.now() + 30000)).toBe('completed');
        // run 本身一次准入，reserve/start 各一次，最后才是结算。
        expect(modes).toEqual(['admission', 'admission', 'admission', 'settlement']);
        expect(await f.run(request, vi.fn())).toEqual({ text: 'IPC 原文' });
    }
    finally {
        await supervisor.stop();
        await rm(dir, { recursive: true, force: true });
    }
}, 30000);
it('新租约不能替旧未知请求上传成功正文，但可回读已确认回执', async () => {
    const f = await fixture(), call = await f.service.reserve(f.ref, { awemeId: 'video', request });
    await f.service.start(f.ref, { awemeId: 'video', callId: call.callId });
    await f.service.settle(f.ref, { awemeId: 'video', callId: call.callId, status: 'unknown' });
    const next = { ...f.ref, attempt: f.ref.attempt + 1, fenceToken: 'new-fence' };
    await db.update(executionTasks).set({ attempt: next.attempt, fenceToken: next.fenceToken }).where(eq(executionTasks.id, next.executionTaskId));
    await expect(f.service.settle(next, { awemeId: 'video', callId: call.callId, status: 'settled', result: { text: '无来源正文' } })).rejects.toThrow();
    expect((await db.select().from(executionCalls).where(eq(executionCalls.id, call.callId)))[0]?.status).toBe('unknown');
    const confirmed = await fixture(), saved = await confirmed.service.reserve(confirmed.ref, { awemeId: 'video', request });
    await confirmed.service.start(confirmed.ref, { awemeId: 'video', callId: saved.callId });
    await confirmed.service.settle(confirmed.ref, { awemeId: 'video', callId: saved.callId, status: 'settled', result: { text: '原回执' } });
    const resumed = { ...confirmed.ref, attempt: confirmed.ref.attempt + 1, fenceToken: 'resumed-fence' };
    await db.update(executionTasks).set({ attempt: resumed.attempt, fenceToken: resumed.fenceToken }).where(eq(executionTasks.id, resumed.executionTaskId));
    expect((await confirmed.service.settle(resumed, { awemeId: 'video', callId: saved.callId, status: 'settled', result: { text: '原回执' } })).result).toEqual({ text: '原回执' });
});

it('未保存原音频时不能启动 ASR 预留',async()=>{
 const f=await fixture();const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));
 const payload={...task!.payload as Record<string,unknown>};delete payload.transcribeAudioInputs;
 await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,f.ref.executionTaskId));
 await expect(f.service.reserve(f.ref,{awemeId:'video',request})).rejects.toThrow();
});
