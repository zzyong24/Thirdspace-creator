// @vitest-environment node
import {it, expect, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {createHash, randomBytes} from 'node:crypto';
import {ENDPOINTS, type Endpoint, type RequestContext} from '@creatoros/contract';
import {aiTasks, executionTasks, executionCalls, intelligenceItems, intelligenceSyncRuns, sourceSnapshots, eq, asc, type Db} from '@creatoros/backend';
const owned = vi.hoisted(() => ({root: '', db: null as Db | null, host: null as any, errors: [] as any[], ports: [] as any[]}));
vi.mock('@creatoros/backend', async original => {
  const actual = await original<typeof import('@creatoros/backend')>();
  return {...actual, createConfiguredDb: async (...args: Parameters<typeof actual.createConfiguredDb>) => {
    const value = await actual.createConfiguredDb(...args); owned.db = value.db; return value;
  }};
});
vi.mock('@/server/activation/client-config.server', async original => ({...await original<typeof import('@/server/activation/client-config.server')>(), readChannelModelAuthority: async () => ({authority: 'local'})}));
vi.mock('@creatoros/backend/modules/ai-runtime', async original => {
  const actual = await original<typeof import('@creatoros/backend/modules/ai-runtime')>();
  const status = {engine: 'codex' as const, installed: true, available: true, version: '0.159.3', defaultModelId: 't1319-fixture-model', availableModels: [{id: 't1319-fixture-model', inputModalities: ['text', 'image']}], loginStatus: 'authenticated' as const, capabilities: {text: true, imageUnderstanding: true, imageGeneration: true, imageEditing: 'unverified' as const}};
  return {...actual, createLocalCodexStatusService: () => ({read: async () => structuredClone(status), peek: () => structuredClone(status), stop: async () => {}})};
});
vi.mock('@/server/execution-worker-path', async original => ({...await original<typeof import('@/server/execution-worker-path')>(), resolveAgenticWorkerPath: () => path.resolve('../docs/verification/t1319/runtime/worker-entry.fixture.cjs')}));
vi.mock('@creatoros/backend/modules/execution', async original => {
  const actual = await original<typeof import('@creatoros/backend/modules/execution')>();
  return {...actual,
    createAgenticWorkerDispatcher: (...args: Parameters<typeof actual.createAgenticWorkerDispatcher>) => {
      owned.host = actual.createAgenticWorkerDispatcher(...args); return {...owned.host, start: () => {}};
    },
    createModelWorkerDispatcher: (...args: Parameters<typeof actual.createModelWorkerDispatcher>) => {
      const host = actual.createModelWorkerDispatcher(...args); return {...host, start: () => {}};
    },
  };
});
vi.mock('node:dns/promises', async original => {
  const actual = await original<typeof import('node:dns/promises')>();
  return {...actual, lookup: async (host: string) => {
    if (host !== 't1319-fixture.example') throw Error('OWNED_DNS_ONLY');
    return [{address: '93.184.216.34', family: 4}];
  }};
});
vi.mock('../../../../backend/src/modules/execution/worker-supervisor', async original => {
  const actual = await original<typeof import('../../../../backend/src/modules/execution/worker-supervisor')>();
  return {...actual, createWorkerSupervisor: (options: Parameters<typeof actual.createWorkerSupervisor>[0]) => actual.createWorkerSupervisor({...options,
    extraEnv: {...options.extraEnv, T1319_FIXTURE_ROOT: owned.root, CODEX_HOME: path.join(owned.root, 'empty-codex-home'), TMPDIR: path.join(owned.root, 'tmp'), TMP: path.join(owned.root, 'tmp'), TEMP: path.join(owned.root, 'tmp')},
    ports: {...options.ports, async invoke(ref, port, input) {
      owned.ports.push({port, callId: (input as any)?.callId ?? null});
      try {return await options.ports.invoke(ref, port, input);}
      catch (error) {const e = error as Error; owned.errors.push({port, message: e.message, stack: (e.stack ?? '').split('\n').filter((line, index) => index === 0 || line.includes('/backend/src/')).slice(0, 12)}); throw error;}
    }},
  })};
});
import {compositeTransport, getChatRuntime, getIdentityService, __resetPersistenceForTests} from '@/server/persistence-client';
import {assertUrlAllowed} from '@/server/ingestion/url-guard';
const runtime = path.resolve('../docs/verification/t1319/runtime');
const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const save = (name: string, value: unknown) => fs.writeFileSync(path.join(owned.root, name + '.json'), JSON.stringify(value, null, 2) + '\n');
it('公开 agentic.collect 使用真实定义与 immutable agentic worker 采 owned RSS', async () => {
  owned.root = path.join(runtime, 'cases', process.env.T1319_RUN_ID ?? 'unbound', 'collect');
  for (const dir of ['', 'tmp', 'media', 'workspaces', 'empty-codex-home']) fs.mkdirSync(path.join(owned.root, dir), {recursive: true});
  owned.db = null; owned.host = null; owned.errors = []; owned.ports = [];
  for (const [key, value] of Object.entries({DATABASE_URL: '', PGLITE_DATA_DIR: path.join(owned.root, 'db'), CREATOROS_MASTER_KEY: randomBytes(32).toString('base64'), CREATOROS_MASTER_KEY_FD: '', CREATOROS_MASTER_KEY_FILE: '', CREATOROS_STORAGE: 'local', CREATOROS_MEDIA_ROOT: path.join(owned.root, 'media'), CREATOROS_WORKSPACES_ROOT: path.join(owned.root, 'workspaces'), CREATOROS_DISABLE_BACKGROUND_DRIVERS: '1', CREATOROS_DISABLE_SCHEDULER: '1', CREATOROS_CLIENT_CONFIG_PULL_ENABLED: '0', CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH: path.join(owned.root, 'missing-seed')})) vi.stubEnv(key, value);
  __resetPersistenceForTests();
  const requests: unknown[] = [];
  const rss = '<?xml version="1.0"?><rss version="2.0"><channel><title>Owned RSS</title><link>https://t1319-fixture.example/</link><description>受控来源</description><item><guid>t1319-owned-item</guid><title>记录一次桌面整理</title><link>https://t1319-fixture.example/item-1</link><description>杯子与笔记本之间留出空白。</description><pubDate>Fri, 16 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>';
  const server = createServer((req, res) => {
    requests.push({method: req.method, path: req.url, responseBytes: Buffer.byteLength(rss), responseSha256: digest(rss)});
    req.resume(); res.writeHead(200, {'content-type': 'application/rss+xml'}); res.end(rss); save('owned-http', requests);
  });
  await new Promise<void>((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  const localUrl = `http://127.0.0.1:${(server.address() as {port: number}).port}/rss`;
  const feedUrl = 'https://t1319-fixture.example/rss';
  const actualFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url !== feedUrl) throw Error('OWNED_FETCH_ONLY');
    const response = await actualFetch(localUrl, init);
    save('network-boundary', {requestedUrl: url, ownedTransportUrl: localUrl, responseUrl: response.url, finalUrl: feedUrl, method: init?.method ?? 'GET', redirect: init?.redirect ?? null, signalPreserved: Boolean(init?.signal), contentType: response.headers.get('content-type')});
    return response;
  });
  let ctx: RequestContext, taskId = '';
  const call = async (endpoint: Endpoint, input: any = {}, scope = ctx): Promise<any> => (await compositeTransport.request(endpoint, input, scope) as {data: any}).data;
  const snapshot = async (name: string) => {
    if (!owned.db) return;
    const business = await owned.db.select().from(aiTasks);
    const tasks = await owned.db.select().from(executionTasks);
    const calls = await owned.db.select().from(executionCalls).orderBy(asc(executionCalls.sequence));
    save(name, {business, tasks: tasks.map(task => ({...task, fenceToken: task.fenceToken ? digest(task.fenceToken) : null})), calls, errors: owned.errors, ports: owned.ports, requests});
  };
  try {
    const binding = JSON.parse(fs.readFileSync(path.join(runtime, 'WORKER_BINDING.json'), 'utf8'));
    const worker = fs.readFileSync(binding.executionWorkerPath); expect(worker.length).toBe(1538258); expect(createHash('sha256').update(worker).digest('hex')).toBe(binding.sha256);
    await getChatRuntime(); ctx = {...await (await getIdentityService()).resolveLocalContext(), accountId: null};
    const group = await call(ENDPOINTS.createAccountGroup, {body: {name: '真实采集组', idempotencyKey: 't1319-owned-group'}}); ctx = {...ctx, groupId: group.id, groupVersion: group.version};
    const routing = await call(ENDPOINTS.getModelRouting); await call(ENDPOINTS.putModelRouting, {body: {schemaVersion: 1, expectedRevision: routing.revision, choices: {text: 'codex', vision: 'codex', image: 'codex', video: 'official', audio: 'local', embed: 'official'}}});
    await expect(assertUrlAllowed('http://127.0.0.1/rss')).rejects.toThrow();
    const source = await call(ENDPOINTS.createIntelligenceSource, {body: {collectionId: null, type: 'rss', config: {type: 'rss', url: feedUrl}, displayName: 'T1319 owned RSS', monitorEnabled: false, runInitial: false, idempotencyKey: 't1319-source-original'}});
    save('source-created', source); expect(source.run).toBeNull(); expect(source.task).toBeNull();
    save('scenario', {kind: 'collect', sourceId: source.source.id, actualExternalModels: 0});
    const body = {attemptId: 't1319-original-public-attempt', spec: {taskType: 'agentic.collect', goal: `只采集真实来源 ${source.source.id}，先plan核原ID，再run一次并status读到真实完成。`, inputs: [], params: {maxSteps: 20, maxTokens: 100000}, constraints: {timeoutSec: 1800, network: 'deny', maxOutputMB: 512}}};
    save('public-submission', {body, ctx}); await snapshot('before-public-create');
    let task;
    try {task = await call(ENDPOINTS.createExecutionTask, {body});}
    catch (error) {const e = error as Error; save('public-create-error', {name: e.name, message: e.message, stack: (e.stack ?? '').split('\n').slice(0, 12)}); await snapshot('public-create-failed'); throw error;}
    taskId = task.id; save('public-created', task);
    await expect.poll(async () => Boolean((await call(ENDPOINTS.getTask, {params: {taskId}})).executionTaskId), {timeout: 120000, interval: 1000}).toBe(true);
    await snapshot('prepared-before-worker');
    expect(await owned.host.drainOnce()).toBe(1);
    await snapshot('after-worker');
    const business = await call(ENDPOINTS.getTask, {params: {taskId}}); save('public-task-after', business); expect(business.status).toBe('succeeded'); expect(owned.errors).toEqual([]);
    const items = await owned.db!.select().from(intelligenceItems), runs = await owned.db!.select().from(intelligenceSyncRuns), snapshots = await owned.db!.select().from(sourceSnapshots);
    save('collection-output', {items, runs, snapshots}); expect(items).toHaveLength(1); expect(runs).toHaveLength(1); expect(snapshots).toHaveLength(1);
    expect(runs[0]!.sourceId).toBe(source.source.id); expect(runs[0]!.status).toBe('succeeded_with_items'); expect(requests).toHaveLength(1);
    const child = (await owned.db!.select().from(executionTasks).where(eq(executionTasks.id, runs[0]!.executionTaskId)))[0]!;
    expect(child.idempotencyKey).toBe('agentic-collect:' + digest([taskId, source.source.id]));
    expect((await call(ENDPOINTS.createExecutionTask, {body})).id).toBe(taskId);
    expect(await owned.host.drainOnce()).toBe(0); expect(requests).toHaveLength(1);
    await snapshot('after-original-key-replay');
  } finally {
    await snapshot('before-cleanup').catch(() => {}); await owned.host?.stop(); await (globalThis as {__creatorosDisposePersistence?: () => Promise<void>}).__creatorosDisposePersistence?.(); __resetPersistenceForTests();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); save('cleanup', {hostStopped: true, persistenceDisposed: true, ownedHttpClosed: true, originalTaskId: taskId || null, actualExternalModels: 0, candidateControllersTouched: false});
  }
}, 3600000);
