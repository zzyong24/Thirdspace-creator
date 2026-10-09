import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createDb, aiTasks, aiTaskSteps, executionTasks, projects, eq, sql, type Db } from '@creatoros/backend';
import { transcribePostprocessResultSchema, transcribePostprocessPlanSchema, type AsrRequest, type WorkerPort } from '@creatoros/contract/execution-worker';
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

async function fixture(mode: Mode, extraIds: string[] = []) {
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
  const input = { kind: 'transcribe.douyin' as const, awemeIds: [awemeId, ...extraIds], language: 'zh', configuration: { kind: 'audio' as const, provider: 'qwen', model: 'fixture-asr', baseUrl: null } };
  await db.insert(aiTasks).values({ id, userId: ctx.userId, accountId: ctx.accountId, taskType: input.kind, idempotencyKey: id, inputData: { awemeIds: input.awemeIds }, requestedAt: now() });
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
  return { id, awemeId, ctx, input, ref, tasks, asr, post, workflow, call, now, nextId, requestObserved, modelBaseUrl: baseUrl,
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

// JSONB 只规范对象键顺序；完整字段、模型身份及原作品数组顺序仍严格核验。
async function receiptGuardFixture(mode: 'unconfigured' | 'json' = 'unconfigured') {
  const f = await fixture(mode);
  const stamp = f.now(), projectId = `guard-project-${f.id}`;
  await db.insert(projects).values({ id: projectId, userId: f.ctx.userId, accountId: f.ctx.accountId, title: '合成回执守卫作品', source: 'imported', platformRef: { platform: 'douyin', externalId: f.awemeId }, creationMode: 'talking_head', status: 'active', currentStage: 'script', startedAt: stamp, createdAt: stamp, updatedAt: stamp });
  const result = await runTranscribePostprocessInWorker(f.awemeId, new AbortController().signal, f.call);
  expect(result.applied).toBe(mode === 'json');
  const [task] = await db.select().from(executionTasks).where(eq(executionTasks.id, f.ref.executionTaskId));
  if (!task) throw Error('缺少原真实执行');
  const payload = task.payload as Record<string, unknown>;
  const entries = payload.transcribePostprocess as Record<string, { plan: unknown; result: unknown }>;
  const frozen = entries[f.awemeId];
  if (!frozen) throw Error('缺少完整回执');
  return { ...f, projectId, result, payload, entries, frozen, get requests() { return f.requests; } };
}
async function assertRejectedWithoutReplay(f: Awaited<ReturnType<typeof receiptGuardFixture>>, workflow = f.workflow) {
  const before = await f.ledger.inspect(f.ref), requests = f.requests;
  await expect(workflow.saveArtifact(f.ref, { awemeId: f.awemeId })).rejects.toThrow();
  expect(f.requests).toBe(requests);
  expect((await f.ledger.inspect(f.ref)).calls).toEqual(before.calls);
  expect(await createArtifactsService({ db, now: f.now, nextId: f.nextId }).listProjectArtifacts(f.ctx, f.projectId)).toHaveLength(0);
}
it('JSONB完整回执键重排仍保存原文，原ASR账本只结算一次', async () => {
  const f = await receiptGuardFixture();
  try {
    const frozen = transcribePostprocessResultSchema.parse(f.frozen.result);
    expect(isDeepStrictEqual(f.frozen.result, frozen)).toBe(true);
    expect(JSON.stringify(f.frozen.result)).not.toBe(JSON.stringify(frozen));
    expect(await f.workflow.saveArtifact(f.ref, { awemeId: f.awemeId })).toMatchObject({ status: 'saved', projectId: f.projectId });
    expect(await f.workflow.saveArtifact(f.ref, { awemeId: f.awemeId })).toMatchObject({ status: 'saved', projectId: f.projectId });
    expect(f.requests).toBe(0);
    expect((await f.ledger.inspect(f.ref)).calls.map(row => row.status)).toEqual(['settled']);
    const service = createArtifactsService({ db, now: f.now, nextId: f.nextId });
    const outputs = (await service.listProjectArtifacts(f.ctx, f.projectId)).filter(row => row.artifactType === 'output_script');
    expect(outputs).toHaveLength(1);
    const versions = await service.listVersions(f.ctx, outputs[0]!.id);
    expect(versions.find(row => row.id === outputs[0]!.currentVersionId)?.contentText).toBe(original);
    // driver正控制：保存的零HTTP断言之后直接访问合成供应商，实时计数必须改变。
    const beforeControl = await f.ledger.inspect(f.ref);
    const response = await fetch(`${f.modelBaseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(await response.text()).toContain('data: [DONE]');
    expect(f.requests).toBe(1);
    expect((await f.ledger.inspect(f.ref)).calls).toEqual(beforeControl.calls);
  } finally { await f.cleanup(); }
});
it.each(['transcript', 'applied', 'reason'] as const)('完整回执真实字段不等必须拒绝保存：%s', async field => {
  const f = await receiptGuardFixture();
  try {
    if (f.result.applied) throw Error('此反例需要真实未执行分支');
    const changed = transcribePostprocessResultSchema.parse(field === 'transcript' ? { ...f.result, transcript: '篡改正文' } : field === 'applied' ? { applied: true, transcript: f.result.transcript } : { ...f.result, reason: '篡改完整原因' });
    const workflow = createExecutionTranscribeWorkflowService(db, { now: f.now, nextId: f.nextId, postprocess: { read: async () => changed }, hasTranscriptArtifact: async () => false });
    await assertRejectedWithoutReplay(f, workflow);
  } finally { await f.cleanup(); }
});
it.each(['missing-transcript', 'missing-reason', 'extra-engine', 'extra-array'] as const)('strict回执缺字段或额外字段拒绝，不借深相等放宽schema：%s', async kind => {
  const f = await receiptGuardFixture();
  try {
    if (f.result.applied) throw Error('此反例需要真实未执行分支');
    const result = kind === 'missing-transcript' ? { applied: false, reason: f.result.reason } : kind === 'missing-reason' ? { applied: false, transcript: f.result.transcript } : kind === 'extra-engine' ? { ...f.result, actualEngine: 'whisper-local' } : { ...f.result, segments: ['first', 'second'] };
    await db.update(executionTasks).set({ payload: { ...f.payload, transcribePostprocess: { ...f.entries, [f.awemeId]: { ...f.frozen, result } } } }).where(eq(executionTasks.id, f.ref.executionTaskId));
    await assertRejectedWithoutReplay(f);
  } finally { await f.cleanup(); }
});
it.each(['model', 'apiFormat'] as const)('独立冻结模型identity被改必须拒绝：%s', async field => {
  const f = await receiptGuardFixture('json');
  try {
    // 回读真实已完成HTTP模型调用所冻结的identity；保原operationKey和账本。
    const originalPlan = transcribePostprocessPlanSchema.parse(f.frozen.plan);
    if (!originalPlan.identity) throw Error('真实HTTP调用应有冻结identity');
    const plan = { ...originalPlan, identity: { ...originalPlan.identity, [field]: field === 'model' ? 'different-model' : 'openai_responses' } };
    await db.update(executionTasks).set({ payload: { ...f.payload, transcribePostprocess: { ...f.entries, [f.awemeId]: { ...f.frozen, plan } } } }).where(eq(executionTasks.id, f.ref.executionTaskId));
    await assertRejectedWithoutReplay(f);
  } finally { await f.cleanup(); }
});
it('原作品数组顺序改变拒绝保存，不能把有序binding改成集合', async () => {
  const f = await receiptGuardFixture();
  try {
    const originalIds = [f.awemeId, 'second-original-video'];
    await db.update(aiTasks).set({ inputData: { awemeIds: originalIds } }).where(eq(aiTasks.id, f.id));
    await db.update(executionTasks).set({ payload: { ...f.payload, modelInput: { ...f.input, awemeIds: [...originalIds].reverse() } } }).where(eq(executionTasks.id, f.ref.executionTaskId));
    await assertRejectedWithoutReplay(f);
  } finally { await f.cleanup(); }
});

// T208 观察真实 Host 保存的步骤；不改变原回执/正文/账本/完整Worker断言。
const t208Steps = (id:string) => db.select().from(aiTaskSteps).where(eq(aiTaskSteps.aiTaskId,id));
const t208Rows = async (f:Awaited<ReturnType<typeof fixture>>, ref=f.ref) => ({
 execution:(await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId)))[0]!,
 business:(await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!,
 steps:await t208Steps(f.id),calls:(await f.ledger.inspect(ref)).calls,
});
it.each(['json','unconfigured'] as const)('T208 真实冻结applied/reason保存步骤，双save和complete同键不重发：%s',async mode=>{
 const f=await receiptGuardFixture(mode);
 try{
  const beforeCalls=(await f.ledger.inspect(f.ref)).calls,requests=f.requests;
  const note=f.result.applied?'纠错+断句完成':`后处理未执行:${f.result.reason}`;
  expect(await f.workflow.saveArtifact(f.ref,{awemeId:f.awemeId})).toMatchObject({status:'saved'});const savedOnce=await t208Rows(f);
  expect(await f.workflow.saveArtifact(f.ref,{awemeId:f.awemeId})).toMatchObject({status:'saved'});expect(await t208Rows(f)).toEqual(savedOnce);
  const steps=await t208Steps(f.id);expect(steps).toHaveLength(1);
  expect(steps[0]).toMatchObject({id:`transcribe:${f.ref.executionTaskId}:${f.awemeId}:saved`,aiTaskId:f.id,stepNo:1,kind:'transcribe',toolCalls:[],text:`作品 ${f.awemeId}：逐字稿已保存，${note}`});
  const artifacts=createArtifactsService({db,now:f.now,nextId:f.nextId}),outputs=(await artifacts.listProjectArtifacts(f.ctx,f.projectId)).filter(row=>row.artifactType==='output_script');
  expect(outputs).toHaveLength(1);const versions=await artifacts.listVersions(f.ctx,outputs[0]!.id);expect(versions).toHaveLength(2);expect(versions.find(row=>row.id===outputs[0]!.currentVersionId)?.contentText).toBe(f.result.transcript);
  expect(await f.workflow.complete(f.ref,{})).toEqual({status:'succeeded'});const first=await t208Rows(f);
  expect(first.steps).toHaveLength(2);expect(first.steps.find(row=>row.id.endsWith(':summary'))).toMatchObject({id:`transcribe:${f.ref.executionTaskId}:summary`,aiTaskId:f.id,stepNo:2,kind:'transcribe',toolCalls:[],text:'转写完成 1 条，已有逐字稿跳过 0 条，图集跳过 0 条，转写失败 0 条，未找到对应作品 0 条'});
  expect(first.business.status).toBe('succeeded');expect(first.execution.status).toBe('succeeded');
  expect(await f.workflow.complete(f.ref,{})).toEqual({status:'succeeded'});expect(await t208Rows(f)).toEqual(first);
  expect(f.requests).toBe(requests);expect(first.calls).toEqual(beforeCalls);expect(await artifacts.listVersions(f.ctx,outputs[0]!.id)).toEqual(versions);
 }finally{await f.cleanup();}
});
it.each([false,true])('T208 额外receipt仅合法形状排除计数，畸形仍strict拒绝：%s',async malformed=>{
 const f=await receiptGuardFixture();
 try{
  await f.workflow.saveArtifact(f.ref,{awemeId:f.awemeId});const before=await t208Rows(f),payload=before.execution.payload as Record<string,unknown>;
  const extra=malformed?{awemeId:'outside',status:'failed',projectId:null,error:'合成失败',unexpected:true}:{awemeId:'outside',status:'failed',projectId:null,error:'合成失败'};
  await db.update(executionTasks).set({payload:{...payload,transcribeItems:{...(payload.transcribeItems as Record<string,unknown>),outside:extra}}}).where(eq(executionTasks.id,f.ref.executionTaskId));
  if(malformed){await expect(f.workflow.complete(f.ref,{})).rejects.toThrow();const after=await t208Rows(f);expect(after.steps).toEqual(before.steps);expect(after.execution.status).toBe('running');expect(after.business.status).toBe(before.business.status);}
  else{expect(await f.workflow.complete(f.ref,{})).toEqual({status:'succeeded'});expect((await t208Steps(f.id)).find(row=>row.id.endsWith(':summary'))?.text).toBe('转写完成 1 条，已有逐字稿跳过 0 条，图集跳过 0 条，转写失败 0 条，未找到对应作品 0 条');}
  expect(f.requests).toBe(0);expect((await f.ledger.inspect(f.ref)).calls).toEqual(before.calls);
 }finally{await f.cleanup();}
});
// CHECK在真实合成PGlite插入端抛错；不mock成功回执、不用onConflict吞掉错误。
async function t208BlockStep(id:string){
 const name=`t208_block_${++sequence}`;if(!/^[A-Za-z0-9_:.-]+$/.test(id))throw Error('合成步骤ID非预期安全形状');
 await db.execute(sql.raw(`ALTER TABLE ai_task_steps ADD CONSTRAINT ${name} CHECK (id <> '${id}')`));
 return ()=>db.execute(sql.raw(`ALTER TABLE ai_task_steps DROP CONSTRAINT ${name}`));
}
it('T208 item步骤插入失败同事务回滚工件/receipt，移除故障后原键恢复不重发',async()=>{
 const f=await receiptGuardFixture();let unblock:(()=>Promise<unknown>)|undefined;
 try{
  const before=await t208Rows(f),artifacts=createArtifactsService({db,now:f.now,nextId:f.nextId});
  unblock=await t208BlockStep(`transcribe:${f.ref.executionTaskId}:${f.awemeId}:saved`);
  await expect(f.workflow.saveArtifact(f.ref,{awemeId:f.awemeId})).rejects.toThrow(/t208_block/);
  expect(await t208Rows(f)).toEqual(before);expect(await artifacts.listProjectArtifacts(f.ctx,f.projectId)).toHaveLength(0);expect(f.requests).toBe(0);
  await unblock();unblock=undefined;
  expect(await f.workflow.saveArtifact(f.ref,{awemeId:f.awemeId})).toMatchObject({status:'saved'});expect(await f.workflow.saveArtifact(f.ref,{awemeId:f.awemeId})).toMatchObject({status:'saved'});
  expect(await t208Steps(f.id)).toHaveLength(1);const outputs=(await artifacts.listProjectArtifacts(f.ctx,f.projectId)).filter(row=>row.artifactType==='output_script');expect(outputs).toHaveLength(1);const versions=await artifacts.listVersions(f.ctx,outputs[0]!.id);expect(versions).toHaveLength(2);expect(versions.find(row=>row.id===outputs[0]!.currentVersionId)?.contentText).toBe(original);expect((await f.ledger.inspect(f.ref)).calls).toEqual(before.calls);expect(f.requests).toBe(0);
 }finally{await unblock?.();await f.cleanup();}
});
it('T208 summary插入失败同事务保原running和receipt，原键重结算只一条summary',async()=>{
 const f=await receiptGuardFixture();let unblock:(()=>Promise<unknown>)|undefined;
 try{
  await f.workflow.saveArtifact(f.ref,{awemeId:f.awemeId});const before=await t208Rows(f),artifacts=createArtifactsService({db,now:f.now,nextId:f.nextId}),outputs=await artifacts.listProjectArtifacts(f.ctx,f.projectId);
  unblock=await t208BlockStep(`transcribe:${f.ref.executionTaskId}:summary`);
  await expect(f.workflow.complete(f.ref,{})).rejects.toThrow(/t208_block/);expect(await t208Rows(f)).toEqual(before);expect(await artifacts.listProjectArtifacts(f.ctx,f.projectId)).toEqual(outputs);expect(f.requests).toBe(0);
  await unblock();unblock=undefined;expect(await f.workflow.complete(f.ref,{})).toEqual({status:'succeeded'});const settled=await t208Rows(f);expect(settled.steps).toHaveLength(2);expect(settled.steps.filter(row=>row.id.endsWith(':summary'))).toHaveLength(1);expect(settled.business.status).toBe('succeeded');expect(settled.execution.status).toBe('succeeded');expect(settled.execution.payload).toEqual(before.execution.payload);expect(settled.calls).toEqual(before.calls);
  expect(await f.workflow.complete(f.ref,{})).toEqual({status:'succeeded'});expect(await t208Rows(f)).toEqual(settled);expect(f.requests).toBe(0);
 }finally{await unblock?.();await f.cleanup();}
});
it('T208 旧已保存步骤与终态回放不补写或覆盖历史说明',async()=>{
 const f=await receiptGuardFixture();
 try{
  await f.workflow.saveArtifact(f.ref,{awemeId:f.awemeId});const itemId=`transcribe:${f.ref.executionTaskId}:${f.awemeId}:saved`;
  await db.update(aiTaskSteps).set({text:'历史步骤保留原样'}).where(eq(aiTaskSteps.id,itemId));const before=await t208Rows(f);
  expect(await f.workflow.saveArtifact(f.ref,{awemeId:f.awemeId})).toMatchObject({status:'saved'});expect(await t208Rows(f)).toEqual(before);
  await db.update(executionTasks).set({status:'succeeded'}).where(eq(executionTasks.id,f.ref.executionTaskId));await db.update(aiTasks).set({status:'succeeded'}).where(eq(aiTasks.id,f.id));const oldTerminal=await t208Rows(f);
  expect(await f.workflow.complete(f.ref,{})).toEqual({status:'succeeded'});expect(await t208Rows(f)).toEqual(oldTerminal);expect(oldTerminal.steps).toHaveLength(1);expect(oldTerminal.steps[0]?.text).toBe('历史步骤保留原样');expect(f.requests).toBe(0);
 }finally{await f.cleanup();}
});
it('T208 deadline拒新保存但已有全确认receipt合法settlement仍沿原语义',async()=>{
 const f=await receiptGuardFixture();
 try{
  const past=new Date(Date.now()-1).toISOString();await db.update(executionTasks).set({deadlineAt:past}).where(eq(executionTasks.id,f.ref.executionTaskId));const before=await t208Rows(f);
  await expect(f.workflow.saveArtifact(f.ref,{awemeId:f.awemeId})).rejects.toThrow();expect(await t208Rows(f)).toEqual(before);expect(before.steps).toHaveLength(0);
  // 以另一全新合成fixture验证合法到期settlement；失败任务不续期。
  await expect(f.workflow.complete(f.ref,{})).rejects.toThrow();expect(await t208Steps(f.id)).toHaveLength(0);expect(f.requests).toBe(0);
 }finally{await f.cleanup();}
 const g=await receiptGuardFixture();try{await g.workflow.saveArtifact(g.ref,{awemeId:g.awemeId});const before=await t208Rows(g);await db.update(executionTasks).set({deadlineAt:new Date(Date.now()-1).toISOString()}).where(eq(executionTasks.id,g.ref.executionTaskId));expect(await g.workflow.complete(g.ref,{})).toEqual({status:'succeeded'});expect((await t208Steps(g.id)).filter(row=>row.id.endsWith(':summary'))).toHaveLength(1);expect((await g.ledger.inspect(g.ref)).calls).toEqual(before.calls);expect(g.requests).toBe(0);}finally{await g.cleanup();}
});
it.each(['reserved','started','unknown'] as const)('T208 未确认调用阻止summary和终态：%s',async status=>{
 const f=await receiptGuardFixture();
 try{
  await f.workflow.saveArtifact(f.ref,{awemeId:f.awemeId});const call=await f.ledger.reserve(f.ref,{operationKey:'t208:pending',kind:'model',inputDigest:digest('t208-synthetic-call'),reservedTokens:1});
  if(status!=='reserved'){await f.ledger.start(f.ref,call.id);if(status==='unknown')await f.ledger.settle(f.ref,call.id,{status:'unknown'});}
  const before=await t208Rows(f);await expect(f.workflow.complete(f.ref,{})).rejects.toThrow(/未确认/);expect(await t208Rows(f)).toEqual(before);expect(before.steps).toHaveLength(1);expect(f.requests).toBe(0);
 }finally{await f.cleanup();}
});
it.each(['cancelled','paused','unknown_result'] as const)('T208 原非running拒绝summary不覆盖控制状态：%s',async status=>{
 const f=await receiptGuardFixture();try{await f.workflow.saveArtifact(f.ref,{awemeId:f.awemeId});await db.update(executionTasks).set({status}).where(eq(executionTasks.id,f.ref.executionTaskId));const before=await t208Rows(f);await expect(f.workflow.complete(f.ref,{})).rejects.toThrow(/停止/);expect(await t208Rows(f)).toEqual(before);expect(before.steps).toHaveLength(1);expect(f.requests).toBe(0);}finally{await f.cleanup();}
});
it.each(['owner','workspace','fence'] as const)('T208 原属主scope和执行凭证拒绝无新步骤：%s',async field=>{
 const f=await receiptGuardFixture();try{await f.workflow.saveArtifact(f.ref,{awemeId:f.awemeId});if(field==='owner')await db.update(aiTasks).set({userId:'other-owner'}).where(eq(aiTasks.id,f.id));if(field==='workspace')await db.update(aiTasks).set({accountId:'other-workspace'}).where(eq(aiTasks.id,f.id));const before=await t208Rows(f);await expect(f.workflow.complete(field==='fence'?{...f.ref,fenceToken:'stale-synthetic-fence'}:f.ref,{})).rejects.toThrow();expect(await t208Rows(f)).toEqual(before);expect(before.steps).toHaveLength(1);expect(f.requests).toBe(0);}finally{await f.cleanup();}
});

it('T208 原公开retry同execution新attempt恢复时保旧成功与历史，最新summary准确且同代幂等',async()=>{
 const sibling=`t208-recovery-image-${++sequence}`,f=await fixture('json',[sibling]);
 try{
  const stamp=f.now(),projectId=`retry-success-${f.id}`,siblingProjectId=`retry-image-${f.id}`;
  const parents:Array<{id:string;externalId:string}>=[{id:projectId,externalId:f.awemeId},{id:siblingProjectId,externalId:sibling}];
  for(const {id,externalId}of parents)await db.insert(projects).values({id,userId:f.ctx.userId,accountId:f.ctx.accountId,title:'原任务隔离恢复作品',source:'imported',platformRef:{platform:'douyin',externalId},creationMode:'talking_head',status:'active',currentStage:'script',startedAt:stamp,createdAt:stamp,updatedAt:stamp});
  const result=await runTranscribePostprocessInWorker(f.awemeId,new AbortController().signal,f.call);expect(result).toEqual({applied:true,transcript:corrected});expect(f.requests).toBe(1);
  expect(await f.workflow.saveArtifact(f.ref,{awemeId:f.awemeId})).toMatchObject({status:'saved',projectId});
  await f.workflow.recordSource(f.ref,{awemeId:sibling,source:{kind:'image-album'}});
  await f.workflow.failItem(f.ref,{awemeId:sibling,error:'合成明确作品失败'});
  expect(await f.workflow.complete(f.ref,{})).toEqual({status:'failed'});const failed=await t208Rows(f),oldSummary=failed.steps.find(row=>row.id===`transcribe:${f.ref.executionTaskId}:summary`);
  expect(oldSummary).toMatchObject({stepNo:3,text:'转写完成 1 条，已有逐字稿跳过 0 条，图集跳过 0 条，转写失败 1 条，未找到对应作品 0 条'});
  const artifacts=createArtifactsService({db,now:f.now,nextId:f.nextId});
  const successFacts=await artifacts.listProjectArtifacts(f.ctx,projectId),successVersions=await Promise.all(successFacts.map(row=>artifacts.listVersions(f.ctx,row.id)));
  const [queued]=await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:'retry',idempotencyKey:`retry-${f.id}`});expect(queued).toMatchObject({id:f.ref.executionTaskId,status:'queued'});
  const [pending]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));if(!pending)throw Error('原retry缺少同execution持久行');
  const receiptField='__transcribeCommandReceiptsV1';expect(failed.execution.payload).not.toHaveProperty(receiptField);
  const {[receiptField]:commandReceipts,...originalPayload}=pending.payload as Record<string,unknown>;
  expect(originalPayload).toEqual(failed.execution.payload);expect(pending.deadlineAt).toBe(failed.execution.deadlineAt);
  // 私有回执只容纳这一真实受理；旧字段完整深比较，未知字段或第二记录仍失败。
  const canonicalReceiptInput=(value:unknown):string=>{
   if(Array.isArray(value))return '['+value.map(canonicalReceiptInput).join(',')+']';
   if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>JSON.stringify(key)+':'+canonicalReceiptInput(item)).join(',')+'}';
   const encoded=JSON.stringify(value);if(encoded===undefined)throw Error('原冻结回执输入不是完整JSON');return encoded;
  };
  const original=failed.execution,business=failed.business;
  const inputDigest=digest(canonicalReceiptInput({executionTaskId:original.id,userId:original.userId,groupId:original.groupId,accountId:original.accountId,
   groupVersion:original.groupVersion,membershipVersion:original.membershipVersion,kind:original.kind,ownerType:original.ownerType,ownerId:original.ownerId,
   aiTaskId:business.id,requestFingerprint:business.requestFingerprint,inputData:business.inputData,modelInput:(original.payload as Record<string,unknown>).modelInput}));
  expect(commandReceipts).toEqual({[createHash('sha256').update(`retry-${f.id}`).digest('hex')]:{
   schemaVersion:1,command:'retry',targetDigest:digest(JSON.stringify([f.ref.executionTaskId])),inputDigest,
   acceptedAttempt:original.attempt,acceptedAt:pending.updatedAt,
  }});
  expect(new Date(pending.updatedAt).toISOString()).toBe(pending.updatedAt);
  const claim=await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:'same-task-recovery',leaseSeconds:300});if(!claim)throw Error('原合法retry没有领取');
  const ref={executionTaskId:f.ref.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};expect(ref.attempt).toBe(f.ref.attempt+1);
  await expect(f.workflow.complete(f.ref,{})).rejects.toThrow(); // 旧fence不能写新summary。
  expect(await f.workflow.prepareItem(ref,{awemeId:f.awemeId})).toMatchObject({receipt:{status:'saved',projectId}});
  expect(await f.workflow.saveArtifact(ref,{awemeId:f.awemeId})).toMatchObject({status:'saved',projectId});
  expect(await f.workflow.saveArtifact(ref,{awemeId:sibling})).toMatchObject({status:'image-album',projectId:siblingProjectId});
  expect(await f.workflow.complete(ref,{})).toEqual({status:'succeeded'});const completed=await t208Rows(f,ref);
  expect(completed.execution.status).toBe('succeeded');expect(completed.business.status).toBe('succeeded');expect(completed.execution.deadlineAt).toBe(failed.execution.deadlineAt);expect(completed.calls).toEqual(failed.calls);expect(f.requests).toBe(1);
  expect(await artifacts.listProjectArtifacts(f.ctx,projectId)).toEqual(successFacts);expect(await Promise.all(successFacts.map(row=>artifacts.listVersions(f.ctx,row.id)))).toEqual(successVersions);
  expect(completed.steps.find(row=>row.id===oldSummary!.id)).toEqual(oldSummary);expect(completed.steps.filter(row=>row.id.endsWith(':failed'))).toEqual(failed.steps.filter(row=>row.id.endsWith(':failed')));
  expect(await f.workflow.complete(ref,{})).toEqual({status:'succeeded'});expect(await t208Rows(f,ref)).toEqual(completed);expect(f.requests).toBe(1);
  const summaries=completed.steps.filter(row=>row.id.includes(':summary'));expect(summaries).toHaveLength(2);
  const current=summaries.find(row=>row.id===`transcribe:${ref.executionTaskId}:summary:attempt:${ref.attempt}`);expect(current).toMatchObject({kind:'transcribe',toolCalls:[],text:'转写完成 1 条，已有逐字稿跳过 0 条，图集跳过 1 条，转写失败 0 条，未找到对应作品 0 条'});
  expect(current!.stepNo).toBeGreaterThan(Math.max(...completed.steps.filter(row=>row.id!==current!.id).map(row=>row.stepNo)));
 }finally{await f.cleanup();}
});

it('T208 attempt2 summary真实CHECK失败保两表和旧历史，移除精确故障后原键恢复且同代回放零新增',async()=>{
 const sibling=`t208-insert-recovery-image-${++sequence}`,f=await fixture('unconfigured',[sibling]);let unblock:(()=>Promise<unknown>)|undefined;
 try{
  const stamp=f.now(),projectId=`insert-success-${f.id}`,siblingProjectId=`insert-image-${f.id}`;
  const parents:Array<{id:string;externalId:string}>=[{id:projectId,externalId:f.awemeId},{id:siblingProjectId,externalId:sibling}];
  for(const {id,externalId}of parents)await db.insert(projects).values({id,userId:f.ctx.userId,accountId:f.ctx.accountId,title:'原任务插入故障恢复作品',source:'imported',platformRef:{platform:'douyin',externalId},creationMode:'talking_head',status:'active',currentStage:'script',startedAt:stamp,createdAt:stamp,updatedAt:stamp});
  await runTranscribePostprocessInWorker(f.awemeId,new AbortController().signal,f.call);await f.workflow.saveArtifact(f.ref,{awemeId:f.awemeId});await f.workflow.recordSource(f.ref,{awemeId:sibling,source:{kind:'image-album'}});await f.workflow.failItem(f.ref,{awemeId:sibling,error:'合成明确作品失败'});expect(await f.workflow.complete(f.ref,{})).toEqual({status:'failed'});
  const failed=await t208Rows(f);await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:'retry',idempotencyKey:`insert-retry-${f.id}`});const claim=await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:'same-task-insert-recovery',leaseSeconds:300});if(!claim)throw Error('原retry领取失败');const ref={executionTaskId:f.ref.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};expect(ref.attempt).toBe(f.ref.attempt+1);
  expect(await f.workflow.saveArtifact(ref,{awemeId:sibling})).toMatchObject({status:'image-album',projectId:siblingProjectId});
  const before=await t208Rows(f,ref),artifacts=createArtifactsService({db,now:f.now,nextId:f.nextId});
  const facts=await artifacts.listProjectArtifacts(f.ctx,projectId),versions=await Promise.all(facts.map(row=>artifacts.listVersions(f.ctx,row.id))),imageFacts=await artifacts.listProjectArtifacts(f.ctx,siblingProjectId),imageVersions=await Promise.all(imageFacts.map(row=>artifacts.listVersions(f.ctx,row.id)));
  expect(before.execution.status).toBe('running');expect(before.business.status).toBe('failed');expect(before.execution.deadlineAt).toBe(failed.execution.deadlineAt);expect(before.calls).toEqual(failed.calls);
  const summaryId=`transcribe:${ref.executionTaskId}:summary:attempt:${ref.attempt}`;unblock=await t208BlockStep(summaryId);
  await expect(f.workflow.complete(ref,{})).rejects.toThrow(/t208_block/);expect(await t208Rows(f,ref)).toEqual(before);
  expect(await artifacts.listProjectArtifacts(f.ctx,projectId)).toEqual(facts);expect(await Promise.all(facts.map(row=>artifacts.listVersions(f.ctx,row.id)))).toEqual(versions);expect(await artifacts.listProjectArtifacts(f.ctx,siblingProjectId)).toEqual(imageFacts);expect(await Promise.all(imageFacts.map(row=>artifacts.listVersions(f.ctx,row.id)))).toEqual(imageVersions);expect(f.requests).toBe(0);
  await unblock();unblock=undefined;expect(await f.workflow.complete(ref,{})).toEqual({status:'succeeded'});const after=await t208Rows(f,ref);
  expect(after.execution.status).toBe('succeeded');expect(after.business.status).toBe('succeeded');expect(after.execution.payload).toEqual(before.execution.payload);expect(after.execution.deadlineAt).toBe(before.execution.deadlineAt);expect(after.calls).toEqual(before.calls);expect(after.steps.filter(row=>row.id!==summaryId)).toEqual(before.steps);expect(after.steps.filter(row=>row.id===summaryId)).toHaveLength(1);
  const summary=after.steps.find(row=>row.id===summaryId)!;expect(summary.text).toBe('转写完成 1 条，已有逐字稿跳过 0 条，图集跳过 1 条，转写失败 0 条，未找到对应作品 0 条');expect(summary.stepNo).toBeGreaterThan(Math.max(...before.steps.map(row=>row.stepNo)));
  expect(await f.workflow.complete(ref,{})).toEqual({status:'succeeded'});expect(await t208Rows(f,ref)).toEqual(after);expect(f.requests).toBe(0);expect(await artifacts.listProjectArtifacts(f.ctx,projectId)).toEqual(facts);expect(await artifacts.listProjectArtifacts(f.ctx,siblingProjectId)).toEqual(imageFacts);
 }finally{await unblock?.();await f.cleanup();}
});
