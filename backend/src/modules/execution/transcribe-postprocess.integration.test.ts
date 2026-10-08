import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createDb, aiTasks, executionTasks, projects, eq, type Db } from '@creatoros/backend';
import type { AsrRequest, WorkerPort } from '@creatoros/contract/execution-worker';
import { runTranscribeInWorker } from '../../../../ai-worker/src/execution/transcribe-worker-run';
import { runTranscribePostprocessInWorker } from '../../../../ai-worker/src/execution/transcribe-postprocess-run';
import { buildTranscriptPostprocessNode, TRANSCRIPT_POSTPROCESS_SCHEMA } from '../../../../ai-worker/src/runtime/transcript-postprocess';
import { GenerationFailure } from '../../../../ai-worker/src/execution/generation-error';
import { createExecutionAuthorityService } from './execution-authority.service';
import { createPersistentTaskService } from './persistent-task.service';
import { createExecutionAsrPorts } from './execution-asr-ports.service';
import { createExecutionTranscribePostprocessService } from './execution-transcribe-postprocess.service';
import { createExecutionTranscribeWorkflowService } from './execution-transcribe-workflow.service';
import { createExecutionCallLedgerService } from './execution-call-ledger.service';
import { createExecutionWorkerOutcomeService } from './execution-worker-outcome.service';
import { createExecutionLeaseService } from './execution-lease.service';
import { createWorkerSupervisor } from './worker-supervisor';
import { createTranscriptArtifactService } from '../projects/transcript-artifact.service';
import { createArtifactsService } from '../artifacts';

// 媒体与ASR正文合成；ASR回执、冻结计划、后处理所有业务端口、回放、工件与终态都是真实service。
let db: Db, close: () => Promise<void>, sequence = 0;
const original = '这是一段已经识别完成的转录原文';
const corrected = '这是一段已经识别完成的转录原文。';
const digest = (value: string | Uint8Array) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
beforeAll(async () => { const opened = await createDb(); db = opened.db; close = () => opened.client.close(); }, 120_000);
afterAll(async () => close?.());
type Mode = 'sse' | 'json' | 'reject' | 'bad-output' | 'fidelity' | 'unconfigured' | 'budget' | 'disconnect' | 'cancel';

async function fixture(mode: Mode) {
  const id = `postprocess-${++sequence}`, awemeId = `video-${sequence}`, now = () => new Date().toISOString();
  const ctx = { userId: 'synthetic-user', accountId: 'synthetic-account', requestId: id, source: 'user' as const };
  let requests = 0;
  let observed!: () => void;
  const requestObserved = new Promise<void>(resolve => { observed = resolve; });
  const server = createServer(async (req, res) => {
    for await (const _ of req) { /* 消费HTTP请求，不伪造模型异常。 */ }
    requests++;
    if (mode === 'cancel') { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"object":"chat.completion","choices":['); observed(); return; }
    if (mode === 'disconnect') { req.socket.destroy(); return; }
    if (mode === 'reject') { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":{"message":"fixture rejected"}}'); return; }
    const content = mode === 'bad-output' ? '{"wrong":1}' : JSON.stringify({ correctedText: mode === 'fidelity' ? '完全无关且经过大幅度改写的虚构内容' : corrected });
    const choice = { index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' };
    const usage = { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 };
    if (mode === 'json') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id, object: 'chat.completion', created: 1, model: 'fixture', choices: [choice], usage })); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: choice.message, finish_reason: 'stop' }], usage })}\n\ndata: [DONE]\n\n`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
  const spec = { apiFormat: 'openai_chat' as const, model: 'fixture', baseUrl, token: 'synthetic-token' };
  const bytes = new Uint8Array([1, 2, 3]);
  const identity = { protocol: 'qwen-chat-audio.v1' as const, provider: 'qwen', model: 'fixture-asr', endpointDigest: digest('https://example.invalid/v1/chat/completions'), language: 'zh' };
  const plan = { schemaVersion: 1, identity, audioDigest: digest(bytes), audioByteLength: bytes.byteLength };
  const input = { kind: 'transcribe.douyin' as const, awemeIds: [awemeId], language: 'zh', configuration: { kind: 'audio' as const, provider: 'qwen', model: 'fixture-asr', baseUrl: null } };
  await db.insert(aiTasks).values({ id, userId: ctx.userId, accountId: ctx.accountId, taskType: input.kind, idempotencyKey: id, inputData: { awemeIds: [awemeId] }, requestedAt: now() });
  const bound = await createExecutionAuthorityService(db).bindAiTask(ctx, id);
  await db.update(executionTasks).set({ payload: { aiTaskId: id, modelInput: input,
    transcribeAudioInputs: { [awemeId]: { schemaVersion: 1, state: 'ready', storageKey: 'synthetic-input', audioDigest: plan.audioDigest, audioByteLength: bytes.byteLength } },
    transcribeAsrPlans: { [awemeId]: plan },
  } }).where(eq(executionTasks.id, bound.executionTaskId));
  const tasks = createPersistentTaskService(db), claim = await tasks.claimTask({ taskId: bound.executionTaskId, workerId: 'integration', leaseSeconds: 300 });
  if (!claim) throw Error('合成任务claim失败');
  const ref = { executionTaskId: bound.executionTaskId, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken };
  const budget = { maxCalls: mode === 'budget' ? 1 : 20, maxTokens: 1_000_000, deadlineMs: 300_000 };
  const asr = createExecutionAsrPorts(db, { budget, now });
  const request: AsrRequest = { ...identity, audioDigest: plan.audioDigest, audioByteLength: bytes.byteLength, chunks: [{ digest: digest(bytes), byteLength: bytes.byteLength }], chunkDigest: digest(bytes), chunkByteLength: bytes.byteLength, chunkIndex: 0, chunkCount: 1 };
  const receipt = await asr.reserve(ref, { awemeId, request });
  await asr.start(ref, { awemeId, callId: receipt.callId });
  await asr.settle(ref, { awemeId, callId: receipt.callId, status: 'settled', result: { text: original, language: 'zh' } });
  const post = createExecutionTranscribePostprocessService(db, { budget, now, maxOutputTokens: 128, resolveModelSpec: async () => mode === 'unconfigured' ? null : spec, readContext: async () => ({ title: '合成作品' }) });
  const nextId = (prefix: string) => `${prefix}-${id}-${++sequence}`;
  const artifactService = createTranscriptArtifactService({ db, now, nextId });
  const workflow = createExecutionTranscribeWorkflowService(db, { now, nextId, postprocess: post, hasTranscriptArtifact: (context, video) => artifactService.hasExisting(context, video) });
  const call = async (port: WorkerPort, raw: unknown, signal?: AbortSignal) => {
    if (port === 'readTranscribeAudio') return { status: 'ready', bytes, audioDigest: plan.audioDigest, audioByteLength: bytes.byteLength };
    if (port === 'prepareTranscribeAsr') { const saved = await asr.read(ref, raw); if (!saved) throw Error('缺真实ASR回执'); return { status: 'restored', plan, result: saved.result }; }
    if (['prepareTranscribeItem', 'recordTranscribeSource', 'saveTranscribeArtifact', 'failTranscribeItem', 'completeTranscribeTask'].includes(port)) return workflow.invoke(ref, port, raw, signal);
    return post.invoke(ref, port, raw, signal);
  };
  return { id, awemeId, ctx, input, ref, tasks, asr, post, workflow, call, now, nextId, requestObserved,
    ledger: createExecutionCallLedgerService(db, { budget, now }), get requests() { return requests; },
    async cleanup() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

it('共享节点保持原JSON schema并提供严格validator', async () => {
  const { outputSchema } = await buildTranscriptPostprocessNode({ transcript: original });
  const { asSchema } = await import('ai');
  const schema = asSchema(outputSchema);
  expect(await schema.jsonSchema).toEqual(TRANSCRIPT_POSTPROCESS_SCHEMA);
  expect(schema.validate).toBeTypeOf('function');
  expect(await schema.validate?.({ correctedText: corrected })).toMatchObject({ success: true });
  for (const bad of [{}, { correctedText: 1 }, { correctedText: corrected, extra: '不允许' }]) expect(await schema.validate?.(bad)).toMatchObject({ success: false });
});

it.each<Mode>(['sse', 'json', 'reject', 'bad-output', 'fidelity', 'unconfigured', 'budget'])('实际后端后处理端口保存并无网络恢复：%s', async mode => {
  const f = await fixture(mode), log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const result = await runTranscribePostprocessInWorker(f.awemeId, AbortSignal.timeout(120_000), f.call);
    expect(result).toMatchObject({ applied: ['sse', 'json'].includes(mode), transcript: ['sse', 'json'].includes(mode) ? corrected : original });
    if (!result.applied) expect(result.reason).toBeTruthy();
    expect(await f.post.read(f.ref, { awemeId: f.awemeId })).toEqual(result);
    expect(await f.post.prepare(f.ref, { awemeId: f.awemeId })).toEqual({ status: 'restored', result });
    expect(await runTranscribePostprocessInWorker(f.awemeId, AbortSignal.timeout(120_000), f.call)).toEqual(result);
    expect(f.requests).toBe(mode === 'unconfigured' || mode === 'budget' ? 0 : mode === 'bad-output' ? 3 : 1);
    expect((await f.ledger.inspect(f.ref)).calls.every(c => ['settled', 'rejected'].includes(c.status))).toBe(true);
    await expect(f.post.read({ ...f.ref, fenceToken: 'stale' }, { awemeId: f.awemeId })).rejects.toThrow();
    await expect(f.post.read(f.ref, { awemeId: 'foreign-video' })).rejects.toThrow();
  } finally { log.mockRestore(); await f.cleanup(); }
}, 180_000);

it('断流保留真实未知账本与原ASR回执，不能保存或重发', async () => {
  const f = await fixture('disconnect'), log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await expect(runTranscribePostprocessInWorker(f.awemeId, AbortSignal.timeout(120_000), f.call)).rejects.toBeInstanceOf(GenerationFailure);
    const rows = (await f.ledger.inspect(f.ref)).calls;
    expect(rows.map(c => c.status)).toEqual(['settled', 'unknown']);
    expect((await f.asr.read(f.ref, { awemeId: f.awemeId }))?.result.text).toBe(original);
    await expect(f.post.save(f.ref, { awemeId: f.awemeId })).rejects.toThrow();
    await expect(f.post.prepare(f.ref, { awemeId: f.awemeId })).rejects.toThrow();
    await createExecutionWorkerOutcomeService(db).recordFailure(f.ref, { outcome: 'unknown_result', errorCode: 'MODEL_RESULT_UNKNOWN' });
    expect((await f.tasks.get(f.ctx, f.ref.executionTaskId)).runtimeStatus).toBe('unknown_result');
    expect(await f.tasks.claimTask({ taskId: f.ref.executionTaskId, workerId: 'no-retry' })).toBeNull();
    expect(f.requests).toBe(1);
  } finally { log.mockRestore(); await f.cleanup(); }
}, 180_000);

it('JSON正文读取中取消立即停止，保留已启动调用未知且不能伪造保存', async () => {
  const f = await fixture('cancel'), log = vi.spyOn(console, 'warn').mockImplementation(() => {}), controller = new AbortController();
  try {
    const pending = runTranscribePostprocessInWorker(f.awemeId, controller.signal, f.call);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await f.requestObserved;
    controller.abort();
    await rejected;
    expect((await f.ledger.inspect(f.ref)).calls.map(c => c.status)).toEqual(['settled', 'unknown']);
    await expect(f.post.save(f.ref, { awemeId: f.awemeId })).rejects.toThrow();
    expect(f.requests).toBe(1);
  } finally { log.mockRestore(); await f.cleanup(); }
}, 180_000);

it('调用前取消、原deadline耗尽与伪造节点请求均拒绝出网', async () => {
  const f = await fixture('sse');
  try {
    const controller = new AbortController(); controller.abort();
    await expect(runTranscribePostprocessInWorker(f.awemeId, controller.signal, f.call)).rejects.toMatchObject({ name: 'AbortError' });
    const prepared = await f.post.prepare(f.ref, { awemeId: f.awemeId });
    if (prepared.status !== 'prepared') throw Error('应有冻结节点');
    await expect(f.post.reserve(f.ref, { awemeId: f.awemeId, operationKey: `${prepared.plan.operationKey}/model/1`, request: { prompt: '伪造正文' } })).rejects.toThrow();
    await db.update(executionTasks).set({ deadlineAt: new Date(Date.now() - 1).toISOString() }).where(eq(executionTasks.id, f.ref.executionTaskId));
    await expect(f.post.prepare(f.ref, { awemeId: f.awemeId })).rejects.toThrow();
    expect(f.requests).toBe(0);
  } finally { await f.cleanup(); }
}, 180_000);

it.each(['source', 'bundle'] as const)('实际转录Worker闭合工件写入/终态/全文读回：%s', async runtime => {
  const f = await fixture(runtime === 'bundle' ? 'json' : 'sse');
  const leases = createExecutionLeaseService(db);
  const supervisor = runtime === 'bundle' ? createWorkerSupervisor({ entryPath: resolve('../ai-worker/dist/execution-worker.cjs'), startupTimeoutMs: 120_000, shutdownGraceMs: 120_000, ports: {
    async validate(ref, mode) { await leases.withLease(ref, mode, async () => {}); },
    async invoke(ref, port, raw) {
      expect(ref).toEqual(f.ref);
      if (port === 'readTaskContext') return f.input;
      if (port === 'heartbeat') return {};
      if (port === 'commitResult') return createExecutionWorkerOutcomeService(db).recordFailure(ref, raw);
      return f.call(port, raw);
    },
  } }) : null;
  try {
    const stamp = f.now(), projectId = `project-${f.id}`;
    await db.insert(projects).values({ id: projectId, userId: f.ctx.userId, accountId: f.ctx.accountId, title: '合成导入作品', source: 'imported', platformRef: { platform: 'douyin', externalId: f.awemeId }, creationMode: 'talking_head', status: 'active', currentStage: 'script', startedAt: stamp, createdAt: stamp, updatedAt: stamp });
    if (supervisor) expect(await supervisor.run(f.ref, Date.now() + 120_000)).toBe('completed');
    else expect(await runTranscribeInWorker(f.input, AbortSignal.timeout(120_000), f.call)).toEqual({ status: 'succeeded' });
    const service = createArtifactsService({ db, now: f.now, nextId: f.nextId });
    const output = (await service.listProjectArtifacts(f.ctx, projectId)).find(row => row.artifactType === 'output_script');
    expect(output).toBeTruthy();
    expect((await service.listVersions(f.ctx, output!.id)).find(row => row.id === output!.currentVersionId)?.contentText).toBe(corrected);
    expect((await f.tasks.get(f.ctx, f.ref.executionTaskId)).status).toBe('succeeded');
    expect(f.requests).toBe(1);
  } finally { await supervisor?.stop(); await f.cleanup(); }
}, 300_000); // 原deadline包含启动，另覆盖120秒关闭与60秒清理余量。
