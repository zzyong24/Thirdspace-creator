import { expect, it, vi } from 'vitest';
import { transcribeAudio, type MultimodalSpec } from './multimodal-factory';
import { createOpenaiAsrAdapter } from './multimodal-openai-asr';
import { createQwenAsrAdapter } from './multimodal-qwen-asr';
import { createMimoAsrAdapter } from './multimodal-mimo-asr';
const spec: MultimodalSpec = { provider: 'openai', baseUrl: 'https://fixture.invalid', model: 'asr', token: 'secret-fixture', kind: 'audio' };
it.each(['openai', 'qwen', 'mimo'])('%s：预先取消不发 HTTP', async (provider) => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ text: '稿', choices: [{ message: { content: '稿' } }] })));
    const factory = provider === 'openai' ? createOpenaiAsrAdapter : provider === 'qwen' ? createQwenAsrAdapter : createMimoAsrAdapter;
    await expect(transcribeAudio({ ...spec, provider }, { audioBytes: new Uint8Array([1]), signal: controller.signal }, { [provider]: factory({ fetch: fetcher }) })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
});
it('Qwen 每个分片单独执行并可直接复用已结算正文，描述不含凭据和音频正文', async () => {
    const frame = new Uint8Array(417);
    frame.set([0xff, 0xfb, 0x90, 0]);
    const bytes = new Uint8Array(417 * 2);
    bytes.set(frame);
    bytes.set(frame, 417);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '第二段' } }] })));
    const requests: unknown[] = [];
    const executeRequest = vi.fn(async (request: unknown, execute: () => Promise<{
        text: string;
    }>) => { requests.push(request); return requests.length === 1 ? { text: '首段回执' } : execute(); });
    const result = await transcribeAudio({ ...spec, provider: 'qwen' }, { audioBytes: bytes, executeRequest }, { qwen: createQwenAsrAdapter({ fetch: fetcher, maxEncodedBytes: 600 }) });
    expect(result.text).toBe('首段回执\n第二段');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(executeRequest).toHaveBeenCalledTimes(2);
    expect(requests[0]).toMatchObject({ chunkIndex: 0, chunkCount: 2, audioByteLength: 834, chunkByteLength: 417 });
    expect(JSON.stringify(requests)).not.toContain('secret-fixture');
    expect(JSON.stringify(requests)).not.toContain('data:audio');
});
it('第一片完成后取消，不发送第二片；HTTP 接收到同一 signal', async () => {
    const controller = new AbortController();
    const frame = new Uint8Array(417);
    frame.set([0xff, 0xfb, 0x90, 0]);
    const bytes = new Uint8Array(834);
    bytes.set(frame);
    bytes.set(frame, 417);
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => { expect(init?.signal).toBe(controller.signal); controller.abort(); return new Response(JSON.stringify({ choices: [{ message: { content: '首段' } }] })); });
    await expect(transcribeAudio({ ...spec, provider: 'mimo' }, { audioBytes: bytes, signal: controller.signal }, { mimo: createMimoAsrAdapter({ fetch: fetcher, maxEncodedBytes: 600 }) })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
});
it('渠道包装保留执行未知，取消自定义原因规范为 AbortError', async () => {
    const { AsrExecutionInterruption } = await import('./asr-request');
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ text: '正文' })));
    const managed = { ...spec, displayModelKey: 'channel-managed' as const };
    const executeRequest = async () => { throw new AsrExecutionInterruption(); };
    await expect(transcribeAudio(managed, { audioBytes: new Uint8Array([1]), executeRequest }, { openai: createOpenaiAsrAdapter({ fetch: fetcher }) })).rejects.toBeInstanceOf(AsrExecutionInterruption);
    const controller = new AbortController();
    const fetchAbort = vi.fn(async () => { controller.abort(new Error('private abort detail')); throw controller.signal.reason; });
    await expect(transcribeAudio(managed, { audioBytes: new Uint8Array([1]), signal: controller.signal }, { openai: createOpenaiAsrAdapter({ fetch: fetchAbort }) })).rejects.toMatchObject({ name: 'AbortError', message: '转写已取消' });
    expect(fetcher).not.toHaveBeenCalled();
});
it.each(['factory', 'adapter'])('%s：预留等待期间修改调用方 Buffer 和模型不会改变实际请求', async (entry) => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const bytes = Buffer.from([1, 2, 3]);
    const mutable = { ...spec };
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
        const form = init!.body as FormData;
        expect(form.get('model')).toBe('asr');
        expect(new Uint8Array(await (form.get('file') as Blob).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
        return new Response(JSON.stringify({ text: '正文' }));
    });
    const options = { audioBytes: bytes, executeRequest: async (_request: unknown, invoke: () => Promise<{text:string}>) => { await gate; return invoke(); } };
    const adapter = createOpenaiAsrAdapter({ fetch: fetcher });
    const run = entry === 'factory' ? transcribeAudio(mutable, options, {openai:adapter}) : adapter.transcribeAudio!(mutable, options);
    bytes.fill(9);
    mutable.model = 'changed';
    release();
    await run;
    expect(fetcher).toHaveBeenCalledTimes(1);
});
