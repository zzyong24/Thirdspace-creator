// @vitest-environment node
import {it, expect, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {createHash, randomBytes} from 'node:crypto';
import {ENDPOINTS, type Endpoint, type RequestContext} from '@creatoros/contract';
import type {ObjectStoragePort} from '@creatoros/backend/modules/assets';
import {aiTasks, executionTasks, executionCalls, intelligenceItems, intelligenceSources, intelligenceSyncRuns, sourceSnapshots, eq, asc, type Db} from '@creatoros/backend';
const owned = vi.hoisted(() => ({root: '', db: null as Db | null, host: null as any, errors: [] as any[], domainErrors: [] as any[], ports: [] as any[], storage: null as ObjectStoragePort | null, beforeInvoke: null as null | ((ref: any, port: any, input: any, invoke: any) => Promise<void>)}));
vi.mock('@creatoros/backend', async original => {
  const actual = await original<typeof import('@creatoros/backend')>();
  return {...actual, createConfiguredDb: async (...args: Parameters<typeof actual.createConfiguredDb>) => {
    const value = await actual.createConfiguredDb(...args); owned.db = value.db; return value;
  }};
});
vi.mock('@creatoros/backend/modules/assets', async original => {
  const actual = await original<typeof import('@creatoros/backend/modules/assets')>();
  return {...actual, createLocalFsObjectStorage: (...args: Parameters<typeof actual.createLocalFsObjectStorage>) => {
    owned.storage = actual.createLocalFsObjectStorage(...args); return owned.storage;
  }};
});
vi.mock('@creatoros/backend/modules/intelligence', async original => {
  const actual = await original<typeof import('@creatoros/backend/modules/intelligence')>();
  return {...actual, createCollectionToolPorts: (...args: Parameters<typeof actual.createCollectionToolPorts>) => {
    const ports = actual.createCollectionToolPorts(...args);
    return {...ports, async runCollection(...input: Parameters<typeof ports.runCollection>) {
      try {return await ports.runCollection(...input);}
      catch (error) {
        const e = error as Error;
        owned.domainErrors.push({port: 'collection.runCollection', context: args[0], parentTaskId: args[1], input: input[0], name: e.name, message: e.message, stack: (e.stack ?? '').split('\n').filter((line, index) => index === 0 || line.includes('/backend/src/')).slice(0, 12)});
        throw error;
      }
    }};
  }};
});
vi.mock('@/server/activation/client-config.server', async original => ({...await original<typeof import('@/server/activation/client-config.server')>(), readChannelModelAuthority: async () => ({authority: 'local'})}));
vi.mock('@creatoros/backend/modules/ai-runtime', async original => {
  const actual = await original<typeof import('@creatoros/backend/modules/ai-runtime')>();
  const status = {engine: 'codex' as const, installed: true, available: true, version: '0.159.3', defaultModelId: 't1329-fixture-model', availableModels: [{id: 't1329-fixture-model', inputModalities: ['text', 'image']}], loginStatus: 'authenticated' as const, capabilities: {text: true, imageUnderstanding: true, imageGeneration: true, imageEditing: 'unverified' as const}};
  return {...actual, createLocalCodexStatusService: () => ({read: async () => structuredClone(status), peek: () => structuredClone(status), stop: async () => {}})};
});
vi.mock('@/server/execution-worker-path', async original => ({...await original<typeof import('@/server/execution-worker-path')>(), resolveAgenticWorkerPath: () => path.resolve('../docs/verification/t1329/runtime/worker-entry.fixture.cjs')}));
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
    if (host !== 't1329-fixture.example') throw Error('OWNED_DNS_ONLY');
    return [{address: '93.184.216.34', family: 4}];
  }};
});
vi.mock('../../../../backend/src/modules/execution/worker-supervisor', async original => {
  const actual = await original<typeof import('../../../../backend/src/modules/execution/worker-supervisor')>();
  return {...actual, createWorkerSupervisor: (options: Parameters<typeof actual.createWorkerSupervisor>[0]) => actual.createWorkerSupervisor({...options,
    extraEnv: {...options.extraEnv, T1329_PHASE_ROOT: path.dirname(path.dirname(path.dirname(owned.root))), T1329_RUN_ID: process.env.T1329_RUN_ID! , T1329_FIXTURE_ROOT: owned.root, NODE_PATH: [path.resolve('node_modules'),path.resolve('../ai-worker/node_modules')].join(path.delimiter), CODEX_HOME: path.join(owned.root, 'empty-codex-home'), TMPDIR: path.join(owned.root, 'tmp'), TMP: path.join(owned.root, 'tmp'), TEMP: path.join(owned.root, 'tmp')},
    ports: {...options.ports, async invoke(ref, port, input) {
      await owned.beforeInvoke?.(ref, port, input, options.ports.invoke);
      owned.ports.push({port, callId: (input as any)?.callId ?? null});
      try {return await options.ports.invoke(ref, port, input);}
      catch (error) {const e = error as Error; owned.errors.push({port, message: e.message, stack: (e.stack ?? '').split('\n').filter((line, index) => index === 0 || line.includes('/backend/src/')).slice(0, 12)}); throw error;}
    }},
  })};
});
import {compositeTransport, getChatRuntime, getIdentityService, __resetPersistenceForTests} from '@/server/persistence-client';
import {assertUrlAllowed} from '@/server/ingestion/url-guard';
const runtime = path.resolve('../docs/verification/t1329/runtime',process.env.T1329_PHASE??'unbound');
const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const save = (name: string, value: unknown) => fs.writeFileSync(path.join(owned.root, name + '.json'), JSON.stringify(value, null, 2) + '\n');
const selected = (process.env.T1329_CASES ?? 'collect,material,research').split(',');
it.each(selected)('公开 agentic 准入与完整原链 %s', async name => {
  owned.root = path.join(process.env.CREATOROS_TEST_OUTPUT_ROOT ? path.join(process.env.CREATOROS_TEST_OUTPUT_ROOT, 'docs/verification/t1329/runtime') : runtime,  'cases', process.env.T1329_RUN_ID ?? 'unbound', name);
  for (const dir of ['', 'tmp', 'media', 'workspaces', 'empty-codex-home']) fs.mkdirSync(path.join(owned.root, dir), {recursive: true});
  owned.db = null; owned.host = null; owned.errors = []; owned.domainErrors = []; owned.ports = []; owned.storage = null; owned.beforeInvoke = null;
  for (const [key, value] of Object.entries({DATABASE_URL: '', PGLITE_DATA_DIR: path.join(owned.root, 'db'), CREATOROS_MASTER_KEY: randomBytes(32).toString('base64'), CREATOROS_MASTER_KEY_FD: '', CREATOROS_MASTER_KEY_FILE: '', CREATOROS_STORAGE: 'local', CREATOROS_MEDIA_ROOT: path.join(owned.root, 'media'), CREATOROS_WORKSPACES_ROOT: path.join(owned.root, 'workspaces'), CREATOROS_DISABLE_BACKGROUND_DRIVERS: '1', CREATOROS_DISABLE_SCHEDULER: '1', CREATOROS_CLIENT_CONFIG_PULL_ENABLED: '0', CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH: path.join(owned.root, 'missing-seed')})) vi.stubEnv(key, value);
  __resetPersistenceForTests();
  const requests: unknown[] = [];
  const rss = '<?xml version="1.0"?><rss version="2.0"><channel><title>Owned RSS</title><link>https://t1329-fixture.example/</link><description>受控来源</description><item><guid>t1329-owned-item</guid><title>记录一次桌面整理</title><link>https://t1329-fixture.example/item-1</link><description>杯子与笔记本之间留出空白。</description><pubDate>Fri, 16 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>';
  const server = createServer((req, res) => {
    requests.push({method: req.method, path: req.url, responseBytes: Buffer.byteLength(rss), responseSha256: digest(rss)});
    req.resume(); res.writeHead(200, {'content-type': 'application/rss+xml'}); res.end(rss); save('owned-http', requests);
  });
  await new Promise<void>((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  const localUrl = `http://127.0.0.1:${(server.address() as {port: number}).port}/rss`;
  const feedUrl = 'https://t1329-fixture.example/rss';
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
    save(name, {business, tasks: tasks.map(task => ({...task, fenceToken: task.fenceToken ? digest(task.fenceToken) : null})), calls, errors: owned.errors, domainErrors: owned.domainErrors, sources: await owned.db.select().from(intelligenceSources), ports: owned.ports, requests});
  };
  try {
    const bindingText = (() => {
      try { return fs.readFileSync(path.join(runtime, 'WORKER_BINDING.json'), 'utf8'); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('T1329_WORKER_BINDING_REQUIRED', {cause: error});
        throw error;
      }
    })();
    const binding = JSON.parse(bindingText);
    const worker = fs.readFileSync(binding.executionWorkerPath); expect(worker.length).toBe(binding.bytes); expect(createHash('sha256').update(worker).digest('hex')).toBe(binding.sha256);
    await getChatRuntime(); ctx = {...await (await getIdentityService()).resolveLocalContext(), accountId: null};
    const group = await call(ENDPOINTS.createAccountGroup, {body: {name: '真实采集组', idempotencyKey: 't1329-owned-group'}}); ctx = {...ctx, groupId: group.id, groupVersion: group.version};
    const routing = await call(ENDPOINTS.getModelRouting); await call(ENDPOINTS.putModelRouting, {body: {schemaVersion: 1, expectedRevision: routing.revision, choices: {text: 'codex', vision: 'codex', image: 'codex', video: 'official', audio: 'local', embed: 'official'}}});
    await expect(assertUrlAllowed('http://127.0.0.1/rss')).rejects.toThrow();
    const source = await call(ENDPOINTS.createIntelligenceSource, {body: {collectionId: null, type: 'rss', config: {type: 'rss', url: feedUrl}, displayName: 'T1329 owned RSS', monitorEnabled: false, runInitial: false, idempotencyKey: 't1329-source-original'}});
    save('source-created', source); expect(source.run).toBeNull(); expect(source.task).toBeNull();
    let targetId = source.source.id;
    let foreignAssetId: string | null = null;
    if (['input', 'foreign-source'].includes(name)) {
      const foreignGroup = await call(ENDPOINTS.createAccountGroup, {body: {name: '隔离对照组', idempotencyKey: 't1329-foreign-group'}});
      const foreignCtx = {...ctx, groupId: foreignGroup.id, groupVersion: foreignGroup.version};
      if (name === 'foreign-source') {
        const foreign = await call(ENDPOINTS.createIntelligenceSource, {body: {collectionId: null, type: 'rss', config: {type: 'rss', url: feedUrl + '?foreign=1'}, monitorEnabled: false, runInitial: false, idempotencyKey: 't1329-foreign-source'}}, foreignCtx);
        targetId = foreign.source.id;
      } else {
        const bytes = Buffer.from('owned foreign input');
        const upload = await call(ENDPOINTS.createUpload, {body: {assetType: 'document', mimeType: 'text/plain', fileSize: bytes.length, fileName: 'owned-input.txt'}}, foreignCtx);
        await owned.storage!.putObject({storageKey: upload.storageKey, bytes, mimeType: 'text/plain', assetType: 'document'});
        const asset = await call(ENDPOINTS.completeUpload, {params: {uploadId: upload.uploadId}, body: {name: '真实外组素材'}}, foreignCtx);
        foreignAssetId = asset.id;
      }
      save('foreign-owned-resource', {foreignCtx, foreignAssetId, foreignSourceId: name === 'foreign-source' ? targetId : null});
    }
    save('scenario', {kind: name, sourceId: targetId, actualExternalModels: 0});
    const body = {attemptId: 't1329-original-public-attempt', spec: {taskType: 'agentic.collect', goal: `只采集真实来源 ${source.source.id}，先plan核原ID，再run一次并status读到真实完成。`, inputs: [], params: {maxSteps: 20, maxTokens: 100000}, constraints: {timeoutSec: 1800, network: 'deny', maxOutputMB: 512}}};
    if (['material', 'research', 'input', 'cancel', 'browser'].includes(name)) body.spec.taskType = name === 'research' || name === 'browser' ? 'agentic.research' : 'agentic.material';
    if (name === 'material' || name === 'research') (body.spec.params as any).dryRun = true;
    if (name === 'network') body.spec.constraints.network = 'allowlist';
    if (name === 'browser') (body.spec.params as any).browserAuthorization = {allowedDomains: ['example.com'], allowInteraction: true};
    if (foreignAssetId) (body.spec.inputs as any[]).push({assetId: foreignAssetId, mountAs: 'input.txt'});
    if (name === 'budget') body.spec.params.maxSteps = 1;
    body.attemptId += '-' + name;
    if (name === 'collect') {
      const evidence: unknown[] = [];
      for (const unknown of ['agentic.unknown', 'exec.agentic.collect']) {
        let caught: Error | null = null;
        try {await call(ENDPOINTS.createExecutionTask, {body: {...body, attemptId: 't1329-unknown-type-attempt', spec: {...body.spec, taskType: unknown}}});}
        catch (error) {caught = error as Error;}
        expect(caught).toBeTruthy(); evidence.push({type: unknown, error: caught!.message});
      }
      const echo = await call(ENDPOINTS.createExecutionTask, {body: {attemptId: 't1329-deterministic-echo', spec: {taskType: 'echo.manifest', goal: '原确定性回显', inputs: [], params: {goal: '原确定性回显'}, constraints: {timeoutSec: 600, network: 'deny', maxOutputMB: 512}}}});
      await expect.poll(async () => (await call(ENDPOINTS.getTask, {params: {taskId: echo.id}})).status, {timeout: 120000, interval: 1000}).toBe('awaiting_confirmation');
      save('deterministic-echo', await call(ENDPOINTS.getExecutionTask, {params: {taskId: echo.id}}));
      await call(ENDPOINTS.discardExecutionTask, {params: {taskId: echo.id}});
      save('unknown-type-rejections', evidence);
    }
    save('public-submission', {body, ctx}); await snapshot('before-public-create');
    let task;
    try {task = await call(ENDPOINTS.createExecutionTask, {body});}
    catch (error) {
      const e = error as Error;
      save('public-create-error', {name: e.name, message: e.message, stack: (e.stack ?? '').split('\n').slice(0, 12)});
      await snapshot('public-create-failed');
      if (name === 'input') {
        expect(e.message).toBe('GROUP_RESOURCE_SCOPE_CONFLICT:共享授权已撤销或不存在，请先修复引用');
        expect(await owned.db!.select().from(aiTasks)).toHaveLength(0);
        expect(await owned.db!.select().from(executionTasks)).toHaveLength(0);
        expect(await owned.db!.select().from(executionCalls)).toHaveLength(0);
        expect(requests).toHaveLength(0);
        save('foreign-input-early-rejection', {layer: 'public create / original database resource reference trigger', foreignAssetId, error: e.message, businessTasks: 0, executionTasks: 0, calls: 0, modelTurns: 0});
        return;
      }
      throw error;
    }
    taskId = task.id; save('public-created', task);
    if (name === 'network') {
      await expect.poll(async () => (await call(ENDPOINTS.getTask, {params: {taskId}})).status, {timeout: 120000, interval: 1000}).toBe('failed');
      const failed = await call(ENDPOINTS.getTask, {params: {taskId}}); save('preparation-rejected', failed);
      expect(failed.executionTaskId).toBeUndefined(); expect(requests).toHaveLength(0);
      expect(failed.errorMessage).toContain(name === 'network' ? 'AGENTIC_NETWORK_POLICY_UNSUPPORTED' : '素材');
      await snapshot('after-rejected-preparation'); return;
    }
    if (name === 'browser') {
      await expect.poll(async () => (await call(ENDPOINTS.getTask, {params: {taskId}})).authorizationStatus, {timeout: 120000, interval: 1000}).toBe('awaiting_authorization');
      const ungranted = await call(ENDPOINTS.getTask, {params: {taskId}}); save('browser-ungranted', ungranted);
      expect(ungranted.executionTaskId).toBeUndefined(); expect(requests).toHaveLength(0); return;
    }
    await expect.poll(async () => Boolean((await call(ENDPOINTS.getTask, {params: {taskId}})).executionTaskId), {timeout: 120000, interval: 1000}).toBe(true);
    await snapshot('prepared-before-worker');
    const mapped = await call(ENDPOINTS.getTask, {params: {taskId}});
    const [frozen] = await owned.db!.select().from(executionTasks).where(eq(executionTasks.id, mapped.executionTaskId));
    expect((frozen!.payload as any).modelInput.taskType).toBe(body.spec.taskType);
    expect(frozen!.executionBudget).toMatchObject({policy: 'continuous', maxCalls: body.spec.params.maxSteps, maxTokens: 100000, deadlineMs: 1800000});
    if (name === 'cancel') {
      save('cancel-command', await call(ENDPOINTS.commandExecutionTasks, {body: {taskIds: [mapped.executionTaskId], command: 'cancel', idempotencyKey: 't1329-cancel-before-claim'}}));
      expect(await owned.host.drainOnce()).toBe(0);
      const [cancelled] = await owned.db!.select().from(executionTasks).where(eq(executionTasks.id, mapped.executionTaskId));
      expect(cancelled!.status).toBe('cancelled'); expect(requests).toHaveLength(0); await snapshot('after-cancel'); return;
    }
    let refsChecked = false;
    owned.beforeInvoke = async (ref, port, input, invoke) => {
      if (refsChecked || port !== 'resolveModelCredential') return;
      refsChecked = true;
      const evidence = [];
      for (const patch of [{attempt: ref.attempt + 1}, {fenceToken: 'wrong-fence'}]) {
        let error: Error | null = null;
        try {await invoke({...ref, ...patch}, port, input);} catch (caught) {error = caught as Error;}
        expect(error?.message).toBe('执行凭证已失效'); evidence.push({patchKind: 'attempt' in patch ? 'attempt' : 'fence', message: error!.message});
      }
      save('lease-rejections', evidence);
    };
    expect(await owned.host.drainOnce()).toBe(1);
    await snapshot('after-worker');
    if (['foreign-source', 'budget', 'unknown'].includes(name)) {
      const [terminal] = await owned.db!.select().from(executionTasks).where(eq(executionTasks.id, mapped.executionTaskId));
      expect(['unknown_result', 'blocked', 'failed']).toContain(terminal!.status);
      if (name === 'foreign-source') {
        expect(owned.errors.some(error => error.port === 'executeAgenticTool')).toBe(true);
        expect(owned.domainErrors).toHaveLength(1);
        expect(owned.domainErrors[0]).toMatchObject({port: 'collection.runCollection', context: {userId: ctx.userId, groupId: ctx.groupId}, parentTaskId: taskId, input: {targetId}, name: 'OwnershipError', message: 'Intelligence source not found'});
        expect(owned.domainErrors[0].stack.some((line: string) => line.includes('intelligence.service.ts:1127'))).toBe(true);
        const effects = {
          runs: await owned.db!.select().from(intelligenceSyncRuns),
          items: await owned.db!.select().from(intelligenceItems),
          snapshots: await owned.db!.select().from(sourceSnapshots),
          tasks: await owned.db!.select().from(executionTasks),
          originalThrow: owned.domainErrors[0],
        };
        save('foreign-source-original-rejection', effects);
        expect(effects.runs).toHaveLength(0); expect(effects.items).toHaveLength(0); expect(effects.snapshots).toHaveLength(0);
        expect(effects.tasks.map(row => row.id)).toEqual([mapped.executionTaskId]);
      }
      if (name === 'budget') expect(owned.errors.some(error => error.message.includes('预算不足'))).toBe(true);
      expect(requests).toHaveLength(0);
      const beforeCalls = await owned.db!.select().from(executionCalls).where(eq(executionCalls.executionTaskId, mapped.executionTaskId));
      expect(await owned.host.drainOnce()).toBe(0);
      const afterCalls = await owned.db!.select().from(executionCalls).where(eq(executionCalls.executionTaskId, mapped.executionTaskId));
      expect(afterCalls).toEqual(beforeCalls); await snapshot('after-no-auto-retry'); return;
    }
    const business = await call(ENDPOINTS.getTask, {params: {taskId}}); save('public-task-after', business); expect(business.status).toBe('succeeded'); expect(owned.errors).toEqual([]);
    const rawCalls=await owned.db!.select().from(executionCalls).where(eq(executionCalls.executionTaskId,mapped.executionTaskId));
    const toolCalls=rawCalls.filter(row=>row.kind==='tool');
    const originalNames=(frozen!.payload as any).modelInput.tools.map((tool:any)=>tool.name);
    expect(toolCalls.length).toBeGreaterThan(0);
    const canonicalParts=rawCalls.filter(row=>row.kind==='model').flatMap(row=>(row.providerResult as any)?.content??[]).filter((part:any)=>part.type==='tool-call');
    for(const toolCall of toolCalls){expect(toolCall.status).toBe('settled');const receipt=JSON.parse(toolCall.resultText!);expect(originalNames).toContain(receipt.toolName);expect(receipt.toolName).toContain('.');expect(canonicalParts).toContainEqual(expect.objectContaining({toolCallId:receipt.toolCallId,toolName:receipt.toolName}));}
    save('provider-mapping-ledger',{rawCalls,toolCalls,canonicalParts,originalNames,syntheticProtocol:true});
    expect(owned.ports.some(row=>row.port==='recordCodexToolCall')).toBe(true);
    const rpcLines=fs.readFileSync(path.join(owned.root,'native-rpc.ndjson'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
    const thread=rpcLines.find(row=>row.method==='thread/start');
    const originalTools=(frozen!.payload as any).modelInput.tools;
    expect(thread.dynamicTools).toEqual(originalTools.map((tool:any)=>({name:tool.name.replace(/[^a-zA-Z0-9_-]/g,'_'),description:tool.description,inputSchema:tool.parameters})));
    expect(thread.toolNames.every((name:string)=>/^[a-zA-Z0-9_-]+$/.test(name))).toBe(true);
    const requestsByCall=rpcLines.filter(row=>row.method==='owned-tool-request');
    expect(requestsByCall.length).toBe(canonicalParts.length);
    for(const request of requestsByCall){const original=originalTools.find((tool:any)=>tool.name.replace(/[^a-zA-Z0-9_-]/g,'_')===request.name);expect(original).toBeTruthy();const canonical=canonicalParts.find((part:any)=>part.toolCallId===request.toolCallId);expect(canonical?.toolName).toBe(original.name);expect(JSON.parse(canonical.input)).toEqual(request.args);}
    if (name === 'material' || name === 'research') {
      expect((frozen!.payload as any).modelInput.dryRun).toBe(true); expect(requests).toHaveLength(0);
      expect(await owned.host.drainOnce()).toBe(0); await snapshot('after-type-loop-validation'); return;
    }
    const items = await owned.db!.select().from(intelligenceItems), runs = await owned.db!.select().from(intelligenceSyncRuns), snapshots = await owned.db!.select().from(sourceSnapshots);
    save('collection-output', {items, runs, snapshots}); expect(items).toHaveLength(1); expect(runs).toHaveLength(1); expect(snapshots).toHaveLength(1);
    expect(runs[0]!.sourceId).toBe(source.source.id); expect(runs[0]!.status).toBe('succeeded_with_items'); expect(requests).toHaveLength(1);
    const child = (await owned.db!.select().from(executionTasks).where(eq(executionTasks.id, runs[0]!.executionTaskId)))[0]!;
    expect(child.idempotencyKey).toBe('agentic-collect:' + digest([taskId, source.source.id]));
    const unchanged = (await owned.db!.select().from(executionTasks).where(eq(executionTasks.id, mapped.executionTaskId)))[0];
    expect((await call(ENDPOINTS.createExecutionTask, {body})).id).toBe(taskId);
    await expect(call(ENDPOINTS.createExecutionTask, {body: {...body, spec: {...body.spec, goal: body.spec.goal + '改变'}}})).rejects.toMatchObject({code: 'ATTEMPT_PAYLOAD_MISMATCH'});
    await expect(call(ENDPOINTS.createExecutionTask, {body: {...body, spec: {...body.spec, constraints: {...body.spec.constraints, timeoutSec: 3600}}}})).rejects.toMatchObject({code: 'ATTEMPT_PAYLOAD_MISMATCH'});
    await expect(call(ENDPOINTS.getExecutionTask, {params: {taskId}}, {...ctx, userId: 'foreign-user'})).rejects.toThrow();
    expect((await owned.db!.select().from(executionTasks).where(eq(executionTasks.id, mapped.executionTaskId)))[0]).toEqual(unchanged);
    expect(await owned.host.drainOnce()).toBe(0); expect(requests).toHaveLength(1);
    await snapshot('after-original-key-replay');
  } finally {
    const cleanup:any={host:owned.host?'not_closed':'not_created',persistence:'not_observed',reset:false,http:false,globals:false,envs:false,errors:[],originalTaskId:taskId||null,actualExternalModels:0,candidateControllersTouched:false};
    const step=async(name:string,action:()=>Promise<void>|void)=>{try{await action();return true;}catch(error){cleanup.errors.push({resource:name,errorType:error instanceof Error?error.name:'OtherError'});return false;}};
    await step('snapshot',()=>snapshot('before-cleanup'));
    if(owned.host&&await step('host',()=>owned.host.stop()))cleanup.host='close_completed';
    const dispose=(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence;
    if(typeof dispose==='function'){if(await step('persistence',()=>dispose()))cleanup.persistence='dispose_completed';}else cleanup.persistence='not_created';
    cleanup.reset=await step('reset',()=>__resetPersistenceForTests());
    await step('http',async()=>{server.closeAllConnections();if(server.listening)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));cleanup.http=!server.listening;});
    cleanup.globals=await step('globals',()=>{vi.unstubAllGlobals();});cleanup.envs=await step('envs',()=>{vi.unstubAllEnvs();});
    const registry=path.join(runtime,'CHILDREN.ndjson');const children=fs.existsSync(registry)?fs.readFileSync(registry,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(row=>row.ownedRoot===owned.root):[];
    const alive=()=>children.filter(row=>{try{process.kill(row.pid,0);return true;}catch{return false;}});
    await step('processes',async()=>{await expect.poll(()=>alive().length,{timeout:120000,interval:250}).toBe(0);});
    cleanup.children=children.map(row=>({...row,pidExists:alive().some(current=>current.pid===row.pid)}));cleanup.ownedChildrenAbsent=cleanup.children.every((row:any)=>!row.pidExists);
    save('cleanup',cleanup);expect(cleanup.errors).toEqual([]);expect(cleanup.http).toBe(true);expect(cleanup.ownedChildrenAbsent).toBe(true);
  }
}, 28800000);
