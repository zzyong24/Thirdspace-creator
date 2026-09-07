import { expect, it, vi } from 'vitest';
import { createDurableAsrRequestExecutor, type DurableAsrPorts } from './durable-asr-request';
import { AsrExecutionInterruption, type AsrRequest } from '../runtime/asr-request';
const request: AsrRequest = { chunks:[{digest:'chunk',byteLength:4}], protocol: 'openai-audio-transcriptions.v1', provider: 'openai', model: 'asr', endpointDigest: 'hash', audioDigest: 'audio', audioByteLength: 4, chunkDigest: 'chunk', chunkByteLength: 4, chunkIndex: 0, chunkCount: 1, language: null };
function ledger() {
    const records = new Map<string, {
        callId: string;
        status: string;
        result?: unknown;
        rejectionStatus?: number;
        request: AsrRequest;
    }>();
    const ports: DurableAsrPorts = { reserve: vi.fn(async (input) => { const old = records.get(input.operationKey); if (old) {
            expect(old.request).toEqual(input.request);
            return old;
        } const row = { callId: input.operationKey, status: 'reserved', request: structuredClone(input.request) }; records.set(input.operationKey, row); return row; }), start: vi.fn(async (id) => { records.get(id)!.status = 'started'; }), settle: vi.fn(async (id, value) => { Object.assign(records.get(id)!, value); }) };
    return { ports, records };
}
it('已结算分片恢复时零重复调用，第二片独立记账', async () => {
    const f = ledger(), invoke = vi.fn(async () => ({ text: '首片' }));
    const first = createDurableAsrRequestExecutor({ operationKey: 'audio', ports: f.ports });
    await first({ ...request, chunkCount: 2 }, invoke);
    const restored = createDurableAsrRequestExecutor({ operationKey: 'audio', ports: f.ports });
    expect(await restored({ ...request, chunkCount: 2 }, invoke)).toEqual({ text: '首片' });
    await restored({ ...request, chunkIndex: 1, chunkCount: 2 }, invoke);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(f.records.size).toBe(2);
});
it.each(['start', 'settle'])('%s ACK 丢失不重投，已结算结果可以恢复', async (phase) => {
    const f = ledger(), invoke = vi.fn(async () => ({ text: '正文' }));
    if (phase === 'start') {
        const original = f.ports.start;
        f.ports.start = vi.fn(async (id) => { await original(id); throw new Error('ACK lost'); });
    }
    else {
        const original = f.ports.settle;
        f.ports.settle = vi.fn(async (id, value) => { await original(id, value); throw new Error('ACK lost'); });
    }
    const execute = createDurableAsrRequestExecutor({ operationKey: 'audio', ports: f.ports });
    await expect(execute(request, invoke)).rejects.toBeInstanceOf(AsrExecutionInterruption);
    if (phase === 'start')
        await expect(execute(request, invoke)).rejects.toBeInstanceOf(AsrExecutionInterruption);
    else
        expect(await execute(request, invoke)).toEqual({ text: '正文' });
    expect(invoke).toHaveBeenCalledTimes(phase === 'start' ? 0 : 1);
});
it('网络丢响应保留 unknown，显式 HTTP 拒绝保留 rejected', async () => {
    for (const [error, status] of [[new TypeError('socket closed'), 'unknown'], [Object.assign(new Error('429'), { statusCode: 429 }), 'rejected']] as const) {
        const f = ledger(), execute = createDurableAsrRequestExecutor({ operationKey: 'audio', ports: f.ports }), invoke = vi.fn(async () => { throw error; });
        await expect(execute(request, invoke)).rejects.toThrow();
        expect(f.records.get('audio/asr/1')?.status).toBe(status);
        await expect(execute(request, invoke)).rejects.toThrow();
        expect(invoke).toHaveBeenCalledTimes(1);
    }
});
it('启动确认后取消不发供应商请求，并记录未提交拒绝', async () => {
    const f = ledger(), controller = new AbortController(), invoke = vi.fn(async () => ({ text: '不得执行' }));
    f.ports.start = async () => controller.abort();
    const execute = createDurableAsrRequestExecutor({ operationKey: 'audio', ports: f.ports, signal: controller.signal });
    await expect(execute(request, invoke)).rejects.toMatchObject({ name: 'AbortError' });
    expect(invoke).not.toHaveBeenCalled();
    expect(f.records.get('audio/asr/1')?.status).toBe('rejected');
});
it('畸形回执或畸形供应商结果不伪造成功', async () => {
    const f = ledger(), execute = createDurableAsrRequestExecutor({ operationKey: 'audio', ports: f.ports });
    await expect(execute(request, async () => ({ text: 4 } as never))).rejects.toBeInstanceOf(AsrExecutionInterruption);
    expect(f.records.get('audio/asr/1')?.status).toBe('unknown');
    f.records.get('audio/asr/1')!.status = 'settled';
    f.records.get('audio/asr/1')!.result = { text: 4 };
    await expect(execute(request, vi.fn())).rejects.toBeInstanceOf(AsrExecutionInterruption);
});
it('预留回执丢失不透出普通错误触发本地回退', async () => {
    const f = ledger();
    f.ports.reserve = async () => { throw new Error('database ACK unavailable'); };
    const invoke = vi.fn();
    await expect(createDurableAsrRequestExecutor({ operationKey: 'audio', ports: f.ports })(request, invoke)).rejects.toBeInstanceOf(AsrExecutionInterruption);
    expect(invoke).not.toHaveBeenCalled();
});
it('真实 Qwen 分片适配器恢复已确认首片，未知第二片不重发 HTTP', async () => {
    const { transcribeAudio } = await import('../runtime/multimodal-factory');
    const { createQwenAsrAdapter } = await import('../runtime/multimodal-qwen-asr');
    const frame = new Uint8Array(417);
    frame.set([0xff, 0xfb, 0x90, 0]);
    const audioBytes = new Uint8Array(834);
    audioBytes.set(frame);
    audioBytes.set(frame, 417);
    const f = ledger();
    let calls = 0;
    const fetcher = vi.fn(async () => { if (++calls === 2)
        throw new TypeError('response lost'); return new Response(JSON.stringify({ choices: [{ message: { content: '首片' } }] })); });
    const spec = { kind: 'audio' as const, provider: 'qwen', model: 'fixture', token: 'fixture', baseUrl: 'https://fixture.invalid' };
    const registry = { qwen: createQwenAsrAdapter({ fetch: fetcher, maxEncodedBytes: 600 }) };
    const run = () => transcribeAudio(spec, { audioBytes, executeRequest: createDurableAsrRequestExecutor({ operationKey: 'audio', ports: f.ports }) }, registry);
    await expect(run()).rejects.toBeInstanceOf(AsrExecutionInterruption);
    expect(f.records.get('audio/asr/1')?.status).toBe('settled');
    expect(f.records.get('audio/asr/2')?.status).toBe('unknown');
    await expect(run()).rejects.toBeInstanceOf(AsrExecutionInterruption);
    expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([408,500,502,503,504])('HTTP %s 不能证明提交未发生，必须保留 unknown',async(statusCode)=>{
 const f=ledger();const run=createDurableAsrRequestExecutor({operationKey:'audio',ports:f.ports});
 await expect(run(request,async()=>{throw Object.assign(new Error('gateway response'),{statusCode});})).rejects.toBeInstanceOf(AsrExecutionInterruption);
 expect(f.records.get('audio/asr/1')?.status).toBe('unknown');
});
