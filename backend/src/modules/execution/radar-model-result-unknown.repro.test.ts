import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createDb, type Db } from '@creatoros/backend';
import type { WorkerMessage, WorkerPort } from '@creatoros/contract/execution-worker';
import { structuredGenerationInputSchema, workerPortInputSchemas } from '@creatoros/contract/execution-worker';
import { createExecutionWorker } from '../../../../ai-worker/src/execution/worker-runtime';
import { runTranscribeInWorker } from '../../../../ai-worker/src/execution/transcribe-worker-run';
import { asrExecutionIdentity } from '../../../../ai-worker/src/runtime/asr-execution-identity';
import { runTranscriptPostprocessRuntime } from '../../../../ai-worker/src/runtime/transcript-postprocess';
import { generateIntelligenceInWorker } from '../../../../ai-worker/src/execution/intelligence-generation-worker';
import { getOfficialSkillBase, registerAllTemplates } from '../../../../ai-worker/src/prompt/registry';
import { createPersistentTaskService } from './persistent-task.service';
import { createExecutionCallLedgerService } from './execution-call-ledger.service';
import { createExecutionWorkerOutcomeService } from './execution-worker-outcome.service';

// 隔离复现：ASR输入/原文为合成回执；真实Worker、Pi/SDK、本地HTTP、内存PG账本和终态服务。
// 不读取用户账号、媒体、凭据或应用数据目录，不连接任何外部模型供应商。
type Mode = 'success' | 'http-401' | 'http-429' | 'http-503' | 'disconnect' | 'partial-disconnect' | 'json-instead-of-sse';
const evidence: Record<string, unknown>[] = [];
let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  const created = await createDb(); // 无dataDir：只创建内存库。
  db = created.db;
  close = () => created.client.close();
}, 120_000);
afterAll(async () => {
  await close?.();
  if (process.env.T1068_REPRO_EVIDENCE) writeFileSync(process.env.T1068_REPRO_EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');
});
const original = '这是一段已经识别完成的转录原文';
const corrected = '这是一段已经识别完成的转录原文。';
const digest = (value: string | Uint8Array) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

async function reproduce(mode: Mode, flow: 'radar' | 'transcribe' = 'radar') {
  let requests = 0;
  const servedResponses: { status: number; format: string; fullContent: boolean }[] = [];
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* 消费实际SDK请求，避免未读取请求体造成假断流。 */ }
    requests++;
    const fault = mode !== 'success';
    if (fault && mode.startsWith('http-')) {
      const status = Number(mode.slice(5));
      servedResponses.push({ status, format: 'json-error', fullContent: false });
      response.writeHead(status, { 'content-type': 'application/json', 'retry-after': '120' });
      response.end(JSON.stringify({ error: { type: 'fixture_rejection', message: 'isolated fixture rejection' } }));
      return;
    }
    if (fault && mode === 'disconnect') { request.socket.destroy(); return; }
    if (fault && mode === 'json-instead-of-sse') {
      servedResponses.push({ status: 200, format: 'json-completion', fullContent: true });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ id: 'fixture', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ correctedText: corrected }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 } }));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    servedResponses.push({ status: 200, format: 'sse', fullContent: !(fault && mode === 'partial-disconnect') });
    const chunk = (delta: object, finish_reason: string | null = null) => `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 0, model: 'fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
    response.write(chunk({ role: 'assistant', content: '' }));
    if (fault && mode === 'partial-disconnect') {
      response.write(chunk({ content: '{"correctedText":"部分' }));
      // 刷出真实HTTP200与部分输出后再断开，不以模拟异常代替断流。
      setTimeout(() => response.destroy(), 20);
      return;
    }
    response.write(chunk({ content: JSON.stringify({ correctedText: corrected }) }));
    response.write(chunk({}, 'stop'));
    // 多作品回归需要明确用量回执；缺用量时真实账本应阻止后续调用。
    response.write(`data: ${JSON.stringify({ id: 'fixture', choices: [], usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 } })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
  const spec = { apiFormat: 'openai_chat' as const, model: 'fixture', token: 'synthetic-fixture-token', baseUrl };
  const nodeProbe = flow === 'transcribe' ? await runTranscriptPostprocessRuntime(spec, { transcript: original }) : null;
  const configuration = { kind: 'audio' as const, provider: 'qwen', model: 'fixture-asr', baseUrl: null };
  const bytes = new Uint8Array([1, 2, 3]);
  const asrPlan = { schemaVersion: 1, identity: asrExecutionIdentity({ ...configuration, token: '' }, 'zh'), audioDigest: digest(bytes), audioByteLength: bytes.byteLength };
  const transcribeInput = { kind: 'transcribe.douyin' as const, awemeIds: ['fixture-one', 'fixture-two', 'fixture-three'], language: 'zh', configuration };
  registerAllTemplates();
  const bases = ['intelligence.topic-adapted-draft', 'intelligence.topic-decompose'].map(id => {
    const base = getOfficialSkillBase(id); if (!base) throw new Error('缺少官方雷达Skill'); return base;
  });
  const skillSnapshot = { snapshotVersion: 1, userId: 't1068-fixture-user', accountId: 't1068-fixture-account', resolvedAt: new Date().toISOString(), platformPolicyVersion: 'fixture-v1', platformPolicy: '隔离复现，只产生候选',
    skills: bases.map(base => ({ skillId: base.skillId, baseVersion: base.baseVersion, overlayRevision: null, overlayVersion: null, effective: { methodSystem: base.methodSystem, template: base.template, tools: base.tools, requiredFacets: base.requiredFacets, contextRequirements: base.contextRequirements, outputSchema: base.outputSchema, completionPolicy: base.completionPolicy, completionPolicyAdapter: base.completionPolicyAdapter } })),
  };
  const radarInput = structuredGenerationInputSchema.parse({ kind: 'model.structured', operationKey: 'intelligence:fixture', capability: 'topic.generate', skillId: 'intelligence.topic-decompose', skillSnapshot, maxOutputTokens: 512,
    facets: { mode: 'topic_preview', target: JSON.stringify({ generationMode: 'rewrite_only', item: { title: '合成作品', platform: 'douyin', canonicalUrl: 'https://example.invalid/fixture' }, transcript: { text: original } }) },
  });
  const input = flow === 'radar' ? radarInput : transcribeInput;
  const ctx = { userId: 't1068-fixture-user', accountId: 't1068-fixture-account', requestId: `repro-${mode}`, source: 'user' as const };
  const tasks = createPersistentTaskService(db);
  const task = await tasks.enqueue(ctx, { kind: 'ai_task', ownerType: 'ai_task', ownerId: `fixture-${flow}-${mode}`, idempotencyKey: `t1068-${flow}-${mode}`, payload: { modelInput: input } });
  const claim = await tasks.claimTask({ taskId: task.id, workerId: 't1068-repro', leaseSeconds: 300 });
  if (!claim) throw new Error('缺少隔离任务claim');
  const lease = claim.lease;
  const ref = { executionTaskId: task.id, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken };
  const ledger = createExecutionCallLedgerService(db, { budget: { maxCalls: 10, maxTokens: 100_000, deadlineMs: 300_000 } });
  const outcomes = createExecutionWorkerOutcomeService(db);
  const ports: string[] = [];
  const asrRead: string[] = [];
  const artifacts: string[] = [];
  const savedResults: string[] = [];
  const messages: WorkerMessage[] = [];
  const hostErrors: string[] = [];
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  async function port(port: WorkerPort, raw: unknown): Promise<unknown> {
    ports.push(port);
    const data = raw as { awemeId: string; callId: string; operationKey: string; request: Record<string, unknown>; status: string; outcome: string; text: string };
    switch (port) {
      case 'readTaskContext': return input;
      case 'resolveModelCredential': return spec;
      case 'heartbeat': return {};
      case 'prepareTranscribeItem': return { receipt: null, source: null };
      case 'readTranscribeAudio': return { status: 'ready', bytes, audioDigest: digest(bytes), audioByteLength: bytes.byteLength };
      case 'prepareTranscribeAsr': asrRead.push(data.awemeId); return { status: 'restored', plan: asrPlan, result: { text: original, language: 'zh' } };
      case 'prepareTranscribePostprocess': return { status: 'prepared', spec, plan: {
        schemaVersion: 1, transcript: original, sourceDigest: digest(original), templateVersion: 'transcript.postprocess.inline/v1', templateDigest: digest('fixture-template'),
        maxOutputTokens: 512, operationKey: `transcribe:${data.awemeId}/postprocess:fixture`,
        identity: { schemaVersion: 1, capability: 'video.subtitles', apiFormat: 'openai_chat', model: 'fixture', baseUrlDigest: digest(baseUrl), customEndpoint: true },
      } };
      case 'reserveGenerationCall':
      case 'reserveTranscribePostprocess': {
        const call = await ledger.reserve(ref, { operationKey: data.operationKey, kind: 'model', inputDigest: digest(JSON.stringify(data.request)), reservedTokens: 8192 });
        return { callId: call.id, status: call.status, ...(call.providerResult ? { providerResult: call.providerResult } : {}) };
      }
      case 'startCall':
      case 'startTranscribePostprocess': {
        const call = await ledger.start(ref, data.callId); return { callId: call.id, status: call.status };
      }
      case 'settleGenerationCall':
      case 'settleTranscribePostprocess': {
        const { awemeId: _awemeId, callId, ...settlement } = raw as { awemeId: string; callId: string; status: string };
        const { callId: validatedCallId, ...validatedSettlement } = workerPortInputSchemas.settleGenerationCall.parse({ callId, ...settlement });
        const call = await ledger.settle(ref, validatedCallId, validatedSettlement); return { callId: call.id, status: call.status };
      }
      case 'saveTranscribePostprocess': {
        const rows = (await ledger.inspect(ref)).calls.filter(call => call.operationKey.startsWith(`transcribe:${data.awemeId}/`));
        const last = rows.at(-1);
        if (!last || !['settled', 'rejected'].includes(last.status)) throw new Error('未知回执不可保存');
        return { applied: false, transcript: original, reason: '隔离宿主仅投影已确认ASR原文' };
      }
      case 'saveTranscribeArtifact': artifacts.push(data.awemeId); return { awemeId: data.awemeId, status: 'saved', projectId: 'fixture-project', error: null };
      case 'saveGenerationResult': {
        const last = (await ledger.inspect(ref)).calls.at(-1);
        if (last?.id !== data.callId || last.status !== 'settled') throw new Error('候选缺少已结算模型回执');
        savedResults.push(JSON.parse(data.text).kind);
        return { callId: data.callId };
      }
      case 'completeTranscribeTask': await tasks.finish({ taskId: task.id, workerId: lease.workerId, attempt: lease.attempt, status: 'succeeded' }); return { status: 'succeeded' };
      case 'commitResult': {
        if (data.outcome !== 'succeeded') return outcomes.recordFailure(ref, raw);
        await tasks.finish({ taskId: task.id, workerId: lease.workerId, attempt: lease.attempt, status: 'succeeded' });
        return { status: 'succeeded' };
      }
      default: throw new Error(`意外复现端口:${port}`);
    }
  }
  let stopped!: () => void;
  const stop = new Promise<void>(resolve => { stopped = resolve; });
  const worker = createExecutionWorker({ capabilities: flow === 'radar' ? ['model.structured'] : ['transcribe.douyin'], runTranscribe: runTranscribeInWorker, generateStructured: generateIntelligenceInWorker,
    async generate() { throw new Error('复现不允许裸生成'); },
    send(message) {
      messages.push(message);
      if (message.type === 'stopped') stopped();
      if (message.type === 'call') void port(message.port, message.data).then(
        data => worker.receive({ version: 1, type: 'reply', requestId: message.requestId, ok: true, data }),
        error => { hostErrors.push(String(error)); worker.receive({ version: 1, type: 'reply', requestId: message.requestId, ok: false, errorCode: 'HOST_PORT_REJECTED' }); },
      );
    },
  });
  try {
    worker.receive({ version: 1, type: 'run', requestId: `repro-${mode}`, execution: ref, deadlineAt: Date.now() + 120_000 });
    await stop;
    const persisted = await tasks.get(ctx, task.id);
    const rows = await ledger.inspect(ref);
    const result = { flow, mode, requests, servedResponses, asrRead, artifacts, savedResults, nodeProbe, hostErrors, runtimeStatus: persisted.runtimeStatus ?? persisted.status, errorCode: persisted.errorCode, errorMessage: persisted.errorMessage,
      callStatuses: rows.calls.map(call => call.status), diagnostic: log.mock.calls.map(args => args.join(' ')),
      stopReason: [...messages].reverse().find(message => message.type === 'stopped')?.reason ?? null,
    };
    evidence.push(result);
    expect(hostErrors).toEqual([]);
    expect(ports).not.toContain('reserveAsrRequest'); // 已确认识别回执：全程不重新ASR。
    expect(JSON.stringify(result)).not.toContain(spec.token);
    if (flow === 'transcribe') {
      expect(result).toMatchObject({ requests: 4, asrRead: ['fixture-one', 'fixture-two', 'fixture-three'], artifacts: ['fixture-one', 'fixture-two', 'fixture-three'], runtimeStatus: 'succeeded', callStatuses: ['settled', 'settled', 'settled'] });
      expect(nodeProbe).toMatchObject({ applied: true, transcript: corrected });
    } else if (['disconnect', 'partial-disconnect'].includes(mode)) {
      expect(result).toMatchObject({ requests: 1, savedResults: [], runtimeStatus: 'unknown_result', errorCode: 'MODEL_RESULT_UNKNOWN', errorMessage: '服务尚未返回完整结果，任务已暂停，已完成内容保留', callStatuses: ['unknown'], stopReason: 'unknown_result' });
      expect(await tasks.claimTask({ taskId: task.id, workerId: 'no-blind-retry' })).toBeNull();
    } else if (mode !== 'success' && mode !== 'json-instead-of-sse') {
      expect(result).toMatchObject({ requests: 1, savedResults: [], runtimeStatus: mode === 'http-401' ? 'waiting_user' : 'retry_wait', callStatuses: ['rejected'] });
    } else {
      expect(result).toMatchObject({ requests: 1, savedResults: ['checkpoint', 'result'], runtimeStatus: 'succeeded', callStatuses: ['settled'] });
      if (mode === 'json-instead-of-sse') expect(servedResponses).toEqual([{ status: 200, format: 'json-completion', fullContent: true }]);
    }
    return result;
  } finally {
    worker.close(); log.mockRestore(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

it.each<Mode>(['success', 'http-401', 'http-429', 'http-503', 'disconnect', 'partial-disconnect', 'json-instead-of-sse'])('T-1068 实际调用链隔离复现：%s', async mode => { await reproduce(mode); }, 180_000);
it('T-1070 通用转录校正具备schema validator：原缺陷回归已恢复模型调用与保存', async () => { await reproduce('success', 'transcribe'); }, 180_000);
