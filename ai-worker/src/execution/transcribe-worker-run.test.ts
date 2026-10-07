import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createWhisperLocalAdapter, createWorkerPipelineProvider } from '../runtime/multimodal-whisper-local';
import { asrExecutionIdentity } from '../runtime/asr-execution-identity';
import { runTranscribeInWorker } from './transcribe-worker-run';
import type { MultimodalProviderRegistry } from '../runtime/multimodal-factory';

const injected = vi.hoisted(() => ({ registry: () => ({}) as MultimodalProviderRegistry }));
vi.mock('./transcribe-asr-registry', async original => ({
  ...await original<object>(), createTranscribeAsrRegistry: () => injected.registry(),
}));
const workers: Worker[] = [];
afterEach(async () => { await Promise.all(workers.splice(0).map(worker => worker.terminate())); });
const bytes = new Uint8Array([1]), digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const configuration = { kind: 'audio' as const, provider: 'whisper-local', model: 'small', baseUrl: null };
const spec = { ...configuration, token: '' };
const input = { kind: 'transcribe.douyin' as const, awemeIds: ['synthetic'], language: 'zh', configuration };

function setup(mode: 'success' | 'failure' | 'cancel' = 'success') {
  const controller = new AbortController();
  const provider = createWorkerPipelineProvider(() => {
    const worker = new Worker(`
      const {parentPort}=require('node:worker_threads');
      parentPort.on('message', message => {
        parentPort.postMessage({id:message.id,ok:${mode !== 'failure'},text:'合成回执',error:'fixture',errorCode:'LOCAL_WHISPER_INFERENCE'});
      });`, { eval: true });
    workers.push(worker);
    if (mode === 'cancel') worker.once('message', () => controller.abort());
    return worker;
  });
  const close = vi.fn(() => (provider as typeof provider & {close(): Promise<void>}).close());
  const adapter = createWhisperLocalAdapter({ getPipeline: provider, decodeAudioToFloat32: async () => new Float32Array(1), close });
  injected.registry = () => ({ 'whisper-local': adapter, 'same-instance-alias': adapter });
  const call = vi.fn(async (port: string, raw: unknown) => {
    if (port === 'prepareTranscribeItem') return { receipt: null, source: null };
    if (port === 'readTranscribeAudio') return { status: 'ready', bytes, audioDigest: digest, audioByteLength: 1 };
    if (port === 'prepareTranscribeAsr') return { status: 'prepared', plan: {schemaVersion: 1, identity: asrExecutionIdentity(spec, 'zh'), audioDigest: digest, audioByteLength: 1}, spec };
    if (port === 'reserveAsrRequest') return {callId: 'asr-synthetic', status: 'reserved'};
    if (port === 'startAsrRequest') return {callId: 'asr-synthetic', status: 'started'};
    if (port === 'settleAsrRequest') return {callId: 'asr-synthetic', status: (raw as {status: string}).status};
    if (port === 'prepareTranscribePostprocess') return {status: 'restored', result: {applied: false, transcript: '合成回执', reason: '不执行模型'}};
    if (port === 'saveTranscribeArtifact' || port === 'failTranscribeItem') return {awemeId: 'synthetic', status: port === 'saveTranscribeArtifact' ? 'saved' : 'failed', projectId: null, error: null};
    if (port === 'completeTranscribeTask') return {status: mode === 'failure' ? 'failed' : 'succeeded'};
    throw Error(`unexpected port ${port}`);
  });
  return { controller, close, call, run: () => runTranscribeInWorker(input, controller.signal, call) };
}

it('实际转录入口连续成功三轮，每轮回执返回前自己的真实轻量线程已经退出', async () => {
  const observation:Array<{completedTask:number;liveThreads:number;closeCalls:number}>=[];
  for (let round = 0; round < 3; round++) {
    const fixture = setup();
    expect(await fixture.run()).toEqual({status: 'succeeded'});
    fixture.controller.abort();
    expect(fixture.close).toHaveBeenCalledOnce();
    expect(workers.every(worker => worker.threadId === -1)).toBe(true);
    observation.push({completedTask:round+1,liveThreads:workers.filter(worker=>worker.threadId!==-1).length,closeCalls:fixture.close.mock.calls.length});
  }
  await writeFile(path.resolve('../docs/verification/t1073/worker/whisper-thread-observation.json'),JSON.stringify(observation)+'\n');
});
it('实际转录入口本地推理失败也等待释放线程，保留单作品失败结果', async () => {
  const fixture = setup('failure');
  expect(await fixture.run()).toEqual({status: 'failed'});
  expect(fixture.close).toHaveBeenCalledOnce();
  expect(workers.every(worker => worker.threadId === -1)).toBe(true);
  expect(fixture.call.mock.calls.map(row => row[0])).toContain('failTranscribeItem');
});
it('实际转录入口收到取消后不保存作品，等自己的轻量线程退出才结束', async () => {
  const fixture = setup('cancel');
  await expect(fixture.run()).rejects.toMatchObject({name: 'AbortError'});
  expect(fixture.close).toHaveBeenCalledOnce();
  expect(workers.every(worker => worker.threadId === -1)).toBe(true);
  expect(fixture.call.mock.calls.map(row => row[0])).not.toContain('saveTranscribeArtifact');
});
