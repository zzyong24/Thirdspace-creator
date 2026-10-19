// @vitest-environment node
import {it, expect, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomBytes} from 'node:crypto';
import {ENDPOINTS, type Endpoint, type RequestContext} from '@creatoros/contract';
import {aiTasks, executionTasks, executionCalls, aiTaskResults, eq, asc, type Db} from '@creatoros/backend';
import type {ObjectStoragePort} from '@creatoros/backend/modules/assets';
const owned = vi.hoisted(() => ({root: '', db: null as Db | null, host: null as any, storage: null as ObjectStoragePort | null, errors: [] as any[], ports: [] as any[], ref: null as any}));
vi.mock('@creatoros/backend', async original => {
  const actual = await original<typeof import('@creatoros/backend')>();
  return {...actual, createConfiguredDb: async (...args: Parameters<typeof actual.createConfiguredDb>) => {const value = await actual.createConfiguredDb(...args); owned.db = value.db; return value;}};
});
vi.mock('@creatoros/backend/modules/assets', async original => {
  const actual = await original<typeof import('@creatoros/backend/modules/assets')>();
  return {...actual, migrateStorageRoot: async () => {throw Error('OWNED_MEDIA_MIGRATION_FORBIDDEN');}, createLocalFsObjectStorage: (...args: Parameters<typeof actual.createLocalFsObjectStorage>) => {owned.storage = actual.createLocalFsObjectStorage({...args[0], rootPath: path.join(owned.root, 'media')}, args[1]); return owned.storage;}};
});
vi.mock('@/server/activation/client-config.server', async original => ({...await original<typeof import('@/server/activation/client-config.server')>(), readChannelModelAuthority: async () => ({authority: 'local'})}));
vi.mock('@creatoros/backend/modules/ai-runtime', async original => {
  const actual = await original<typeof import('@creatoros/backend/modules/ai-runtime')>();
  const status = {engine: 'codex' as const, installed: true, available: true, version: '0.159.3', defaultModelId: 't1322-fixture-model', availableModels: [{id: 't1322-fixture-model', inputModalities: ['text', 'image']}], loginStatus: 'authenticated' as const, capabilities: {text: true, imageUnderstanding: true, imageGeneration: true, imageEditing: 'unverified' as const}};
  return {...actual, createLocalCodexStatusService: () => ({read: async () => structuredClone(status), peek: () => structuredClone(status), stop: async () => {}})};
});
vi.mock('@/server/execution-worker-path', async original => ({...await original<typeof import('@/server/execution-worker-path')>(), resolveExecutionWorkerPath: () => path.resolve('../docs/verification/t1322/runtime/worker-entry.fixture.cjs')}));
vi.mock('@creatoros/backend/modules/execution', async original => {
  const actual = await original<typeof import('@creatoros/backend/modules/execution')>();
  return {...actual, createModelWorkerDispatcher: (...args: Parameters<typeof actual.createModelWorkerDispatcher>) => {owned.host = actual.createModelWorkerDispatcher(...args); return {...owned.host, start: () => {}};}};
});
vi.mock('../../../../backend/src/modules/execution/worker-supervisor', async original => {
  const actual = await original<typeof import('../../../../backend/src/modules/execution/worker-supervisor')>();
  return {...actual, createWorkerSupervisor: (options: Parameters<typeof actual.createWorkerSupervisor>[0]) => actual.createWorkerSupervisor({...options, extraEnv: {...options.extraEnv, T1322_FIXTURE_ROOT: owned.root, CODEX_HOME: path.join(owned.root, 'empty-codex-home'), TMPDIR: path.join(owned.root, 'tmp'), TMP: path.join(owned.root, 'tmp'), TEMP: path.join(owned.root, 'tmp')}, ports: {...options.ports, async invoke(ref, port, input) {
    owned.ref = ref;
    owned.ports.push({phase: 'invoke', port, callId: (input as any)?.callId ?? null, keys: Object.keys((input ?? {}) as object)});
    try {const value = await options.ports.invoke(ref, port, input); owned.ports.push({phase: 'receipt', port, callId: (value as any)?.callId ?? null}); return value;}
    catch (error) {const e = error as Error; owned.errors.push({port, callId: (input as any)?.callId ?? null, name: e.name, message: e.message, stack: (e.stack ?? '').split('\n').filter((line, index) => index === 0 || line.includes('/backend/src/')).slice(0, 12)}); throw error;}
  }}})};
});
import {compositeTransport, getChatRuntime, __resetPersistenceForTests} from '@/server/persistence-client';
import {canonicalDataset} from '@/fixtures/canonical';
const runtime = path.resolve('../docs/verification/t1322/runtime');
const sha = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const save = (name: string, value: unknown) => fs.writeFileSync(path.join(owned.root, name + '.json'), JSON.stringify(value, null, 2) + '\n');
const selected = (process.env.T1322_CASES ?? 'cover,card').split(',');
it.each(selected)('完整公开封面/图卡 Codex 两阶段 %s', async name => {
  owned.root = path.join(runtime, 'cases', process.env.T1322_RUN_ID ?? 'unbound', name);
  for (const dir of ['', 'tmp', 'media', 'empty-codex-home']) fs.mkdirSync(path.join(owned.root, dir), {recursive: true});
  owned.errors = []; owned.ports = []; owned.db = null; owned.host = null; owned.storage = null; owned.ref = null;
  save('scenario', {kind: name === 'cover' ? 'cover' : 'card', externalModels: 0, protocolBoundary: 'controlled-native-cli'});
  for (const [key, value] of Object.entries({DATABASE_URL: '', PGLITE_DATA_DIR: path.join(owned.root, 'db'), CREATOROS_MASTER_KEY: randomBytes(32).toString('base64'), CREATOROS_STORAGE: 'local', CREATOROS_MEDIA_ROOT: path.join(owned.root, 'media'), CREATOROS_DISABLE_BACKGROUND_DRIVERS: '1', CREATOROS_DISABLE_SCHEDULER: '1', CREATOROS_CLIENT_CONFIG_PULL_ENABLED: '0', CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH: path.join(owned.root, 'missing-seed')})) vi.stubEnv(key, value);
  __resetPersistenceForTests();
  let ctx: RequestContext = {userId: canonicalDataset.user.id, accountId: null, requestId: 't1322-public', source: 'user'};
  let taskId = '', resultId = '', outputId = '', baseVersionId = '';
  const call = async (endpoint: Endpoint, input: any = {}, scope = ctx): Promise<any> => (await compositeTransport.request(endpoint, input, scope) as {data: any}).data;
  const snapshot = async (label: string) => {
    if (!owned.db || !taskId) return;
    const [business] = await owned.db.select().from(aiTasks).where(eq(aiTasks.id, taskId));
    if (!business?.executionTaskId) {const value = {business, task: null, calls: [], results: [], errors: owned.errors, ports: owned.ports}; save(label, value); return value;}
    const [task] = await owned.db.select().from(executionTasks).where(eq(executionTasks.id, business.executionTaskId));
    const calls = await owned.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId, task!.id)).orderBy(asc(executionCalls.sequence));
    const results = await owned.db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId, taskId));
    const value = {business, task: {...task, fenceToken: task!.fenceToken ? sha(task!.fenceToken) : null}, calls, results, errors: owned.errors, ports: owned.ports}; save(label, value); return value;
  };
  try {
    const binding = JSON.parse(fs.readFileSync(path.join(runtime, 'WORKER_BINDING.json'), 'utf8'));
    const worker = fs.readFileSync(binding.executionWorkerPath); expect(worker.length).toBe(binding.bytes); expect(createHash('sha256').update(worker).digest('hex')).toBe(binding.sha256);
    await getChatRuntime();
    const group = await call(ENDPOINTS.createAccountGroup, {body: {name: '受控封面图卡组', idempotencyKey: 't1322-group-' + name}}); ctx = {...ctx, groupId: group.id, groupVersion: group.version};
    const routing = await call(ENDPOINTS.getModelRouting); await call(ENDPOINTS.putModelRouting, {body: {schemaVersion: 1, expectedRevision: routing.revision, choices: {text: 'codex', vision: 'codex', image: 'codex', video: 'official', audio: 'local', embed: 'official'}}});
    const project = await call(ENDPOINTS.createProject, {body: {title: '桌面记录方法', brief: '杯子与合上的笔记本，留出记录空间，不虚构数据。'}});
    if (name === 'cover') {
      const output = await call(ENDPOINTS.createOutput, {params: {projectId: project.id}, body: {title: '中性封面', contentType: 'video', clientRequestId: 't1322-cover-output'}}); outputId = output.id;
      const artifact = await call(ENDPOINTS.createArtifact, {params: {projectId: project.id}, body: {title: '原口播稿', artifactType: 'output_script', stage: 'script', contentOutputId: output.id}});
      await call(ENDPOINTS.createArtifactVersion, {params: {artifactId: artifact.id}, body: {contentText: '把杯子放稳，合上笔记本，给桌面留出一块空白。', contentData: {}, changeSummary: '测试用户中性输入'}});
      const task = await call(ENDPOINTS.createAITask, {body: {taskType: 'cover.generate', attemptId: 't1322-cover-original-attempt', inputData: {projectId: project.id, outputId, contentOutputId: outputId, visualRequirements: '杯子和合上的笔记本，简洁插画。'}}}); taskId = task.id;
    } else {
      const output = await call(ENDPOINTS.createOutput, {params: {projectId: project.id}, body: {title: '中性文章', contentType: 'article', targetPlatform: 'wechatOfficialAccount', clientRequestId: 't1322-card-output'}}); outputId = output.id;
      const initial = await call(ENDPOINTS.getArticle, {params: {outputId}});
      const document = {...initial.current, title: '留出空白', sections: [{sectionId: 'owned-section', order: 0, heading: '整理物品', headingLevel: 2, body: '桌面上是一只杯子和一本合上的笔记本，旁边留出空白。', sourceRefs: []}]};
      const manual = await call(ENDPOINTS.createArticleVersion, {params: {outputId}, body: {expectedCurrentVersionId: initial.currentVersionId, document, clientRequestId: 't1322-card-manual-source'}}); baseVersionId = manual.versionId; save('article-before', await call(ENDPOINTS.getArticle, {params: {outputId}}));
      const result = await call(ENDPOINTS.generateResult, {params: {outputId}, body: {kind: 'image_card', targetSectionId: 'owned-section', targetPlatform: 'wechatOfficialAccount', clientRequestId: 't1322-original-card-request'}}); taskId = result.taskId; resultId = result.resultId;
    }
    save('public-submission', {taskId, resultId, outputId, baseVersionId, ctx, project});
    await snapshot('before-drain'); expect(owned.host).toBeTruthy(); await owned.host.drainOnce(); const final = await snapshot('after-drain');
    const publicTask = await call(ENDPOINTS.getTask, {params: {taskId}}); save('public-task-after-drain', publicTask);
    expect(publicTask.status, JSON.stringify({errors: owned.errors, status: final!.task?.status})).toBe('awaiting_confirmation');
    expect(owned.errors).toEqual([]); expect(final!.calls).toHaveLength(2); expect(final!.calls.every(row => row.status === 'settled')).toBe(true);
    if (name === 'cover') {
      save('confirmed', await call(ENDPOINTS.confirmTask, {params: {taskId}}));
      save('public-results', await call(ENDPOINTS.listTaskResults, {params: {taskId}}));
    } else {
      const result = await call(ENDPOINTS.getResult, {params: {resultId}}); save('candidate', result); expect(result.status).toBe('awaiting_confirmation'); expect(result.value).toHaveLength(1);
      const receipt = await call(ENDPOINTS.adoptResult, {params: {resultId}, body: {expected: {owner: 'wechat_article', versionId: baseVersionId}, editedValue: result.value, clientRequestId: 't1322-card-adoption'}}); save('adoption', receipt);
      const after = await call(ENDPOINTS.getArticle, {params: {outputId}}); save('article-after', after); const before = JSON.parse(fs.readFileSync(path.join(owned.root, 'article-before.json'), 'utf8'));
      expect(after.current.sections).toEqual(before.current.sections); expect(after.current.title).toBe(before.current.title); expect(after.current.imageUses).toHaveLength(1);
    }
    await snapshot('after-public-confirm');
  } finally {
    await snapshot('before-cleanup').catch(() => {}); await owned.host?.stop(); await (globalThis as {__creatorosDisposePersistence?: () => Promise<void>}).__creatorosDisposePersistence?.(); __resetPersistenceForTests(); vi.unstubAllEnvs(); save('cleanup', {ownModelHostStopped: true, ownPersistenceDisposed: true, candidateTouched: false, actualExternalModels: 0});
  }
}, 3600000);
