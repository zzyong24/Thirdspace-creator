import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import { createWhisperLocalAdapter, createFfmpegPcmDecoder, createWorkerPipelineProvider, type WhisperWorkerLike } from './multimodal-whisper-local';
const tick = () => new Promise<void>(r => setImmediate(r));
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const spec = { provider: 'whisper-local', baseUrl: null, model: 'small', token: '', kind: 'audio' } as const;
class FakeWorker extends EventEmitter {
    posts: any[] = [];
    stopped = deferred<number>();
    terminate = vi.fn(() => this.stopped.promise);
    postMessage(msg: any) { this.posts.push(msg); }
    reply(text = '完成') { this.emit('message', { id: this.posts.at(-1).id, ok: true, text }); }
}
describe('本地 Whisper 取消与资源归属', () => {
    it('预取消不启动解码', async () => {
        const c = new AbortController();
        c.abort('取消');
        const decode = vi.fn(async () => new Float32Array([1]));
        const adapter = createWhisperLocalAdapter({ decodeAudioToFloat32: decode, getPipeline: async () => async () => ({ text: 'x' }) });
        await expect(adapter.transcribeAudio!(spec, { audioBytes: new Uint8Array([1]), signal: c.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(decode).not.toHaveBeenCalled();
    });
    it.each(['decode', 'load', 'inference'])('%s 阶段取消保持 AbortError', async (stage) => {
        const fail = async () => { throw new DOMException('取消', 'AbortError'); };
        const adapter = createWhisperLocalAdapter({ decodeAudioToFloat32: stage === 'decode' ? fail : async () => new Float32Array([1]), getPipeline: stage === 'load' ? fail : async () => stage === 'inference' ? fail : async () => ({ text: 'x' }) });
        await expect(adapter.transcribeAudio!(spec, { audioBytes: new Uint8Array([1]) })).rejects.toMatchObject({ name: 'AbortError' });
    });
    it('ffmpeg 取消 kill 后等待 close 才拒绝', async () => {
        const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(() => true) });
        const c = new AbortController();
        const decode = createFfmpegPcmDecoder({ ffmpegPath: 'fake', spawn: () => child });
        const result = decode(new Uint8Array([1]), c.signal);
        let done = false;
        const caught = result.catch(e => { done = true; return e; });
        c.abort();
        await tick();
        expect(child.kill).toHaveBeenCalledWith('SIGKILL');
        expect(done).toBe(false);
        child.emit('error', new Error('取消期间错误'));
        await tick();
        expect(done).toBe(false);
        child.emit('close', null);
        expect(await caught).toMatchObject({ name: 'AbortError' });
    });
    it('排队取消不发送，在途取消等待 terminate，旧事件不能破坏新 worker', async () => {
        const workers: FakeWorker[] = [];
        const provider = createWorkerPipelineProvider(() => { const w = new FakeWorker(); workers.push(w); return w as WhisperWorkerLike; });
        const pipe = await provider('small');
        const a = new AbortController();
        const b = new AbortController();
        const first = pipe(new Float32Array([1]), {}, a.signal).catch(e => e);
        await tick();
        const second = pipe(new Float32Array([2]), {}, b.signal).catch(e => e);
        const third = pipe(new Float32Array([3]));
        b.abort();
        a.abort();
        await tick();
        expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);
        expect(workers).toHaveLength(1);
        expect(workers[0]!.posts).toHaveLength(1);
        workers[0]!.emit('exit', 1);
        workers[0]!.reply('迟到结果');
        await tick();
        expect(workers).toHaveLength(1);
        workers[0]!.stopped.resolve(1);
        expect(await first).toMatchObject({ name: 'AbortError' });
        expect(await second).toMatchObject({ name: 'AbortError' });
        await tick();
        expect(workers).toHaveLength(2);
        workers[0]!.emit('error', new Error('旧错误'));
        workers[0]!.emit('exit', 1);
        workers[1]!.reply();
        expect(await third).toEqual({ text: '完成' });
    });
    it('exit 0 结算 pending，下一项重建', async () => {
        const workers: FakeWorker[] = [];
        const provider = createWorkerPipelineProvider(() => { const w = new FakeWorker(); workers.push(w); return w as WhisperWorkerLike; });
        const pipe = await provider('small');
        const first = pipe(new Float32Array([1])).catch(e => e);
        await tick();
        workers[0]!.emit('exit', 0);
        const error = await first;
        expect(error).toMatchObject({ reference: 'LOCAL_WHISPER_WORKER_EXIT' });
        const next = pipe(new Float32Array([1]));
        await tick();
        expect(workers).toHaveLength(2);
        workers[1]!.reply();
        await next;
    }, 1000);
    it('subarray 仅发送有效 PCM 范围', async () => {
        const w = new FakeWorker();
        const pipe = await createWorkerPipelineProvider(() => w as WhisperWorkerLike)('small');
        const run = pipe(new Float32Array([99, 1, 2, 99]).subarray(1, 3));
        await tick();
        expect(Array.from(new Float32Array(w.posts[0].pcm))).toEqual([1, 2]);
        w.reply();
        await run;
    });
    it.each(['decode', 'load', 'inference'])('%s 完成时发现取消，不继续下游或返回成功', async (stage) => {
        const c = new AbortController();
        const decode = vi.fn(async (_bytes: Uint8Array, signal?: AbortSignal) => { expect(signal).toBe(c.signal); if (stage === 'decode')
            c.abort('用户取消'); return new Float32Array([1]); });
        const inference = vi.fn(async (_audio: Float32Array, _opts: unknown, signal?: AbortSignal) => { expect(signal).toBe(c.signal); c.abort('用户取消'); return { text: 'x' }; });
        const load = vi.fn(async (_model: string, signal?: AbortSignal) => { expect(signal).toBe(c.signal); if (stage === 'load')
            c.abort('用户取消'); return inference; });
        const adapter = createWhisperLocalAdapter({ decodeAudioToFloat32: decode, getPipeline: load });
        await expect(adapter.transcribeAudio!(spec, { audioBytes: new Uint8Array([1]), signal: c.signal })).rejects.toMatchObject({ name: 'AbortError' });
        if (stage === 'decode')
            expect(load).not.toHaveBeenCalled();
        if (stage !== 'inference')
            expect(inference).not.toHaveBeenCalled();
    });
    it('ffmpeg 预取消不解析路径或启动，stdin 错误 kill 后等待 close', async () => {
        const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() }), kill: vi.fn(() => true) });
        const spawn = vi.fn(() => child);
        const decode = createFfmpegPcmDecoder({ ffmpegPath: 'fake', spawn });
        const c = new AbortController();
        c.abort();
        await expect(decode(new Uint8Array([1]), c.signal)).rejects.toMatchObject({ name: 'AbortError' });
        expect(spawn).not.toHaveBeenCalled();
        let done = false;
        const run = decode(new Uint8Array([1])).catch(e => { done = true; return e; });
        child.stdin.emit('error', new Error('EPIPE'));
        await tick();
        expect(done).toBe(false);
        expect(child.kill).toHaveBeenCalledWith('SIGKILL');
        child.emit('close', 1);
        expect((await run).message).toContain('stdin');
    });
    it('普通推理失败后复用 worker，崩溃后重建且忽略旧 exit', async () => {
        const workers: FakeWorker[] = [];
        const pipe = await createWorkerPipelineProvider(() => { const w = new FakeWorker(); workers.push(w); return w as WhisperWorkerLike; })('small');
        const first = pipe(new Float32Array([1])).catch(e => e);
        await tick();
        workers[0]!.emit('message', { id: workers[0]!.posts[0].id, ok: false, errorCode: 'LOCAL_WHISPER_INFERENCE' });
        expect(await first).toMatchObject({ reference: 'LOCAL_WHISPER_INFERENCE' });
        const second = pipe(new Float32Array([1])).catch(e => e);
        await tick();
        expect(workers).toHaveLength(1);
        let settled=false;void second.then(()=>{settled=true;});
        workers[0]!.emit('error', new Error('crash'));
        await tick();expect(settled).toBe(false);expect(workers).toHaveLength(1);
        expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);workers[0]!.stopped.resolve(0);
        expect(await second).toMatchObject({ reference: 'LOCAL_WHISPER_WORKER_CRASH' });
        const third = pipe(new Float32Array([1]));
        await tick();
        expect(workers).toHaveLength(2);
        workers[0]!.emit('exit', 0);
        workers[1]!.reply();
        await third;
        const fourth = pipe(new Float32Array([1]));
        await tick();
        expect(workers).toHaveLength(2);
        workers[1]!.reply();
        await fourth;
    });
    it.each(['throw', 'reject'])('terminate %s 后必须等 owner exit，不能提前启动下一项', async mode => {
        const workers: FakeWorker[] = [];
        const pipe = await createWorkerPipelineProvider(() => {
            const w = new FakeWorker();
            if (!workers.length) w.terminate.mockImplementation(() => {
                if (mode === 'throw') throw new Error('终止失败');
                return Promise.reject(new Error('终止失败'));
            });
            workers.push(w);
            return w as WhisperWorkerLike;
        })('small');
        const controller = new AbortController();
        let settled = false;
        const first = pipe(new Float32Array([1]), {}, controller.signal).catch(error => { settled = true; return error; });
        await tick();
        const next = pipe(new Float32Array([2]));
        controller.abort();
        await tick();
        expect(settled).toBe(false);
        expect(workers).toHaveLength(1);
        workers[0]!.emit('error', new Error('仍非退出确认'));
        workers[0]!.reply('迟到结果');
        await tick();
        expect(workers).toHaveLength(1);
        workers[0]!.emit('exit', 0);
        expect(await first).toMatchObject({ name: 'AbortError' });
        await tick();
        expect(workers).toHaveLength(2);
        workers[1]!.reply();
        await next;
    }, 1000);
    it.each(['abort', 'stdin'])('ffmpeg %s 后 kill 抛错不能成为未捕获异常或悬挂请求', async trigger => {
        const child = Object.assign(new EventEmitter(), {
            stdout: new EventEmitter(), stderr: new EventEmitter(),
            stdin: Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() }),
            kill: vi.fn(() => { throw new Error('kill 失败'); }),
        });
        const controller = new AbortController();
        const decode = createFfmpegPcmDecoder({ ffmpegPath: 'fake', spawn: () => child });
        const result = decode(new Uint8Array([1]), controller.signal).catch(error => error);
        if (trigger === 'abort') {
            controller.abort();
            expect(await result).toMatchObject({ name: 'AbortError' });
        } else {
            child.stdin.emit('error', new Error('EPIPE'));
            expect((await result).message).toContain('无法终止 ffmpeg');
        }
    }, 1000);

    it('ffmpeg kill 失败后阻止同 decoder 再 spawn，旧 close 后恢复', async () => {
        const children: Array<ReturnType<typeof makeChild>> = [];
        function makeChild() {
            return Object.assign(new EventEmitter(), {
                stdout: new EventEmitter(), stderr: new EventEmitter(),
                kill: vi.fn(() => { throw new Error('kill 失败'); }),
            });
        }
        const spawn = vi.fn(() => { const child = makeChild(); children.push(child); return child; });
        const decode = createFfmpegPcmDecoder({ ffmpegPath: 'fake', spawn });
        const controller = new AbortController();
        const first = decode(new Uint8Array([1]), controller.signal).catch(error => error);
        controller.abort();
        expect(await first).toMatchObject({ name: 'AbortError' });
        await expect(decode(new Uint8Array([2]))).rejects.toThrow('尚未确认退出');
        expect(spawn).toHaveBeenCalledTimes(1);
        children[0]!.emit('close', 1);
        const next = decode(new Uint8Array([3]));
        expect(spawn).toHaveBeenCalledTimes(2);
        children[1]!.stdout.emit('data', new Uint8Array(new Float32Array([0.5]).buffer));
        children[1]!.emit('close', 0);
        expect(Array.from(await next)).toEqual([0.5]);
    }, 1000);

});
