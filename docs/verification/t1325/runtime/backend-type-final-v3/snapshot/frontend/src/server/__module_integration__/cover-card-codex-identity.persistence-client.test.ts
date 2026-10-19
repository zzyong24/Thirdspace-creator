// @vitest-environment node
import {it, expect, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash, randomBytes} from 'node:crypto';
import {ENDPOINTS, type Endpoint, type RequestContext} from '@creatoros/contract';
import {aiTasks, executionTasks, executionCalls, aiTaskResults, assetFiles, eq, asc, type Db} from '@creatoros/backend';
import type {ObjectStoragePort} from '@creatoros/backend/modules/assets';
const owned = vi.hoisted(() => ({root: '', db: null as Db | null, host: null as any, storage: null as ObjectStoragePort | null, errors: [] as any[], ports: [] as any[], ref: null as any, beforeInvoke: null as null | ((ref: any, port: any, input: any, invoke: any) => Promise<void>)}));
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
    await owned.beforeInvoke?.(ref, port, input, options.ports.invoke);
    owned.ports.push({phase: 'invoke', port, callId: (input as any)?.callId ?? null, keys: Object.keys((input ?? {}) as object)});
    try {
      const value = await options.ports.invoke(ref, port, input);
      owned.ports.push({phase: 'receipt', port, callId: (value as any)?.callId ?? null});
      if (process.env.T1322_PROTECTION === '1' && port === 'commitResult') {
        const replay = await options.ports.invoke(ref, port, structuredClone(input));
        expect(replay).toEqual(value);
        fs.writeFileSync(path.join(owned.root, 'completion-replay.json'), JSON.stringify({original: value, replay, sameOriginalRefAndPayload: true}, null, 2) + '\n');
      }
      return value;
    }
    catch (error) {const e = error as Error; owned.errors.push({port, callId: (input as any)?.callId ?? null, name: e.name, message: e.message, stack: (e.stack ?? '').split('\n').filter((line, index) => index === 0 || line.includes('/backend/src/')).slice(0, 12)}); throw error;}
  }}})};
});
import {compositeTransport, getChatRuntime, getIdentityService, __resetPersistenceForTests} from '@/server/persistence-client';
import {GET as readBlob} from '@/app/api/v1/blob/[...key]/route';
const requireFixture = createRequire(import.meta.url);
const {PNG} = requireFixture(path.resolve('../node_modules/.pnpm/pngjs@7.0.0/node_modules/pngjs'));
const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4AWP8DwQMQMDEAAUAPfgEADYYS7QAAAAASUVORK5CYII=', 'base64');
const runtime = path.resolve('../docs/verification/t1322/runtime');
const sha = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const save = (name: string, value: unknown) => fs.writeFileSync(path.join(owned.root, name + '.json'), JSON.stringify(value, null, 2) + '\n');
const selected = (process.env.T1322_CASES ?? 'cover,card').split(',');
it.each(selected)('完整公开封面/图卡 Codex 两阶段 %s', async name => {
  owned.root = path.join(runtime, 'cases', process.env.T1322_RUN_ID ?? 'unbound', name);
  for (const dir of ['', 'tmp', 'media', 'empty-codex-home']) fs.mkdirSync(path.join(owned.root, dir), {recursive: true});
  owned.errors = []; owned.ports = []; owned.db = null; owned.host = null; owned.storage = null; owned.ref = null; owned.beforeInvoke = null;
  save('scenario', {kind: name === 'cover' ? 'cover' : 'card', externalModels: 0, protocolBoundary: 'controlled-native-cli'});
  for (const [key, value] of Object.entries({DATABASE_URL: '', PGLITE_DATA_DIR: path.join(owned.root, 'db'), CREATOROS_MASTER_KEY_FD: '', CREATOROS_MASTER_KEY_FILE: '', CREATOROS_MASTER_KEY: randomBytes(32).toString('base64'), CREATOROS_STORAGE: 'local', CREATOROS_MEDIA_ROOT: path.join(owned.root, 'media'), CREATOROS_DISABLE_BACKGROUND_DRIVERS: '1', CREATOROS_DISABLE_SCHEDULER: '1', CREATOROS_CLIENT_CONFIG_PULL_ENABLED: '0', CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH: path.join(owned.root, 'missing-seed')})) vi.stubEnv(key, value);
  __resetPersistenceForTests();
  let ctx: RequestContext = {userId: 'uninitialized-owned-user', accountId: null, requestId: 't1322-public', source: 'user'};
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
    ctx = {...await (await getIdentityService()).resolveLocalContext(), accountId: null};
    save('actual-local-context', ctx);
    const group = await call(ENDPOINTS.createAccountGroup, {body: {name: '受控封面图卡组', idempotencyKey: 't1322-group-' + name}}); ctx = {...ctx, groupId: group.id, groupVersion: group.version};
    const routing = await call(ENDPOINTS.getModelRouting); await call(ENDPOINTS.putModelRouting, {body: {schemaVersion: 1, expectedRevision: routing.revision, choices: {text: 'codex', vision: 'codex', image: 'codex', video: 'official', audio: 'local', embed: 'official'}}});
    const project = await call(ENDPOINTS.createProject, {body: {title: '桌面记录方法', brief: '杯子与合上的笔记本，留出记录空间，不虚构数据。'}});
    if (name === 'cover') {
      const output = await call(ENDPOINTS.createOutput, {params: {projectId: project.id}, body: {title: '中性封面', contentType: 'video', clientRequestId: 't1322-cover-output'}}); outputId = output.id;
      const artifact = await call(ENDPOINTS.createArtifact, {params: {projectId: project.id}, body: {title: '原口播稿', artifactType: 'output_script', stage: 'script', contentOutputId: output.id}});
      await call(ENDPOINTS.createArtifactVersion, {params: {artifactId: artifact.id}, body: {contentText: '把杯子放稳，合上笔记本，给桌面留出一块空白。', contentData: {}, changeSummary: '测试用户中性输入'}});
      const task = await call(ENDPOINTS.createAITask, {body: {taskType: 'cover.generate', attemptId: 't1322-cover-original-attempt', inputData: {projectId: project.id, outputId, contentOutputId: outputId, visualRequirements: '杯子和合上的笔记本，简洁插画。'}}}); taskId = task.id;
    } else if (name === 'edit') {
      const upload = await call(ENDPOINTS.createUpload, {body: {assetType: 'image', mimeType: 'image/png', fileSize: pngBytes.length, projectId: project.id, fileName: 'owned-reference.png'}});
      await owned.storage!.putObject({storageKey: upload.storageKey, bytes: pngBytes, mimeType: 'image/png', assetType: 'image'});
      const reference = await call(ENDPOINTS.completeUpload, {params: {uploadId: upload.uploadId}, body: {name: '受控不可变参考图'}});
      save('reference', {assetId: reference.id, assetFileId: reference.currentFileId, checksum: createHash('sha256').update(pngBytes).digest('hex')});
      const output = await call(ENDPOINTS.createGraphicPost, {params: {projectId: project.id}, body: {title: '参考图系列', targetPlatform: 'xiaohongshu', clientRequestId: 't1322-edit-output'}}); outputId = output.id;
      const initial = await call(ENDPOINTS.getGraphicPost, {params: {outputId}});
      const document = {...initial.current, title: '留出空白', body: '用户原稿不变', cardBriefs: [{cardId: 'owned-card', title: '整理物品', body: '杯子和合上的笔记本。', visualBrief: '简洁插画。', sourceRefs: []}], seriesProfile: {visualDirection: '温暖纸色', aspectRatio: '3:4', referenceImage: {assetId: reference.id, assetFileId: reference.currentFileId}}};
      const manual = await call(ENDPOINTS.createGraphicPostVersion, {params: {outputId}, body: {expectedCurrentVersionId: initial.currentVersionId, document, clientRequestId: 't1322-edit-source'}}); baseVersionId = manual.versionId;
      save('graphic-before', await call(ENDPOINTS.getGraphicPost, {params: {outputId}}));
      const result = await call(ENDPOINTS.generateResult, {params: {outputId}, body: {kind: 'image_card', targetSectionId: 'owned-card', targetPlatform: 'xiaohongshu', clientRequestId: 't1322-original-edit-request'}}); taskId = result.taskId; resultId = result.resultId;
    } else {
      const output = await call(ENDPOINTS.createOutput, {params: {projectId: project.id}, body: {title: '中性文章', contentType: 'article', targetPlatform: 'wechatOfficialAccount', clientRequestId: 't1322-card-output'}}); outputId = output.id;
      const initial = await call(ENDPOINTS.getArticle, {params: {outputId}});
      const document = {...initial.current, title: '留出空白', sections: [{sectionId: 'owned-section', order: 0, heading: '整理物品', headingLevel: 2, body: '桌面上是一只杯子和一本合上的笔记本，旁边留出空白。', sourceRefs: []}]};
      const manual = await call(ENDPOINTS.createArticleVersion, {params: {outputId}, body: {expectedCurrentVersionId: initial.currentVersionId, document, clientRequestId: 't1322-card-manual-source'}}); baseVersionId = manual.versionId; save('article-before', await call(ENDPOINTS.getArticle, {params: {outputId}}));
      const result = await call(ENDPOINTS.generateResult, {params: {outputId}, body: {kind: 'image_card', targetSectionId: 'owned-section', targetPlatform: 'wechatOfficialAccount', clientRequestId: 't1322-original-card-request'}}); taskId = result.taskId; resultId = result.resultId;
    }
    save('public-submission', {taskId, resultId, outputId, baseVersionId, ctx, project});
    await snapshot('before-drain');
    expect(owned.host).toBeTruthy();
    let preparedTask = await call(ENDPOINTS.getTask, {params: {taskId}});
    if (!preparedTask.executionTaskId) {
      save('preparation-tick', {originalTaskId: taskId, claims: await owned.host.drainOnce()});
      await expect.poll(async () => {
        preparedTask = await call(ENDPOINTS.getTask, {params: {taskId}});
        save('public-preparation-readback', preparedTask);
        return Boolean(preparedTask.executionTaskId);
      }, {timeout: 120000, interval: 1000}).toBe(true);
    }
    await snapshot('prepared-before-worker');
    if (process.env.T1322_PROTECTION === '1') {
      const before = await call(ENDPOINTS.getModelRouting);
      await call(ENDPOINTS.putModelRouting, {body: {schemaVersion: 1, expectedRevision: before.revision, choices: {text: 'official', vision: 'official', image: 'official', video: 'official', audio: 'local', embed: 'official'}}});
      save('settings-drift', {before, after: await call(ENDPOINTS.getModelRouting), originalTaskId: taskId});
    }
    const protectedPhases = new Set<string>();
    const guardEvidence: unknown[] = [];
    owned.beforeInvoke = async (ref, port, input, invoke) => {
      if (process.env.T1322_PROTECTION !== '1' || protectedPhases.has(port) ||
          !['bindCodexCall', 'resolveAssetCredential', ...(name === 'edit' ? ['readCoverReference'] : [])].includes(port)) return;
      protectedPhases.add(port);
      const db = owned.db!;
      const [originalTask] = await db.select().from(executionTasks).where(eq(executionTasks.id, ref.executionTaskId));
      expect(originalTask).toBeTruthy();
      const [originalCall] = await db.select().from(executionCalls).where(eq(executionCalls.id, input.callId));
      const [originalBusiness] = await db.select().from(aiTasks).where(eq(aiTasks.id, taskId));
      expect(originalCall).toBeTruthy(); expect(originalBusiness).toBeTruthy();
      const reject = async (label: string, taskPatch: any = {}, callPatch: any = {}, businessPatch: any = {}, refPatch: any = {}) => {
        let caught: Error | null = null;
        try {
          if (Object.keys(taskPatch).length) await db.update(executionTasks).set(taskPatch).where(eq(executionTasks.id, originalTask!.id));
          if (Object.keys(callPatch).length) await db.update(executionCalls).set(callPatch).where(eq(executionCalls.id, originalCall!.id));
          if (Object.keys(businessPatch).length) await db.update(aiTasks).set(businessPatch).where(eq(aiTasks.id, originalBusiness!.id));
          try { await invoke({...ref, ...refPatch}, port, input); }
          catch (error) { caught = error as Error; }
          expect(caught, label + ' must be rejected by actual port').toBeTruthy();
        } finally {
          for (const [table, row, patch] of [[executionTasks, originalTask, taskPatch], [executionCalls, originalCall, callPatch], [aiTasks, originalBusiness, businessPatch]] as const) {
            const restored = Object.fromEntries(Object.keys(patch).map(key => [key, (row as any)[key]]));
            if (Object.keys(restored).length) await db.update(table as typeof executionTasks).set(restored).where(eq(table.id, row!.id));
          }
          const [taskNow] = await db.select().from(executionTasks).where(eq(executionTasks.id, originalTask!.id));
          const [callNow] = await db.select().from(executionCalls).where(eq(executionCalls.id, originalCall!.id));
          const [businessNow] = await db.select().from(aiTasks).where(eq(aiTasks.id, originalBusiness!.id));
          expect(taskNow).toEqual(originalTask); expect(callNow).toEqual(originalCall); expect(businessNow).toEqual(originalBusiness);
          guardEvidence.push({label, port, rejected: Boolean(caught), error: caught ? {name: caught.name, message: caught.message} : null, restoredExactly: true, originalTaskDigest: sha(originalTask), originalCallDigest: sha(originalCall), originalBusinessDigest: sha(originalBusiness)});
          save('guard-evidence', guardEvidence);
        }
      };
      const payload = originalTask!.payload as any;
      const corruptPayload = async (label: string, mutate: (value: any) => void) => {
        const value = structuredClone(payload); mutate(value);
        await reject(label, {payload: value});
      };
      if (port === 'readCoverReference') {
        const reference = payload.coverImage.value.reference;
        const [file] = await db.select().from(assetFiles).where(eq(assetFiles.id, reference.assetFileId));
        expect(file).toBeTruthy();
        const absolute = path.join(owned.root, 'media', file!.storageKey);
        const originalBytes = fs.readFileSync(absolute);
        const checkReference = async (label: string, mutate: () => void, restore: () => void) => {
          let caught: Error | null = null;
          try {
            mutate();
            try {await invoke(ref, port, input);} catch (error) {caught = error as Error;}
            expect(caught, label).toBeTruthy();
          } finally {
            restore(); expect(fs.readFileSync(absolute)).toEqual(originalBytes);
            guardEvidence.push({label, port, rejected: Boolean(caught), error: caught ? {name: caught.name, message: caught.message} : null, restoredExactly: true, checksum: sha(originalBytes.toString('base64'))});
            save('guard-evidence', guardEvidence);
          }
        };
        await checkReference('immutable-reference-missing', () => fs.renameSync(absolute, absolute + '.owned-backup'), () => fs.renameSync(absolute + '.owned-backup', absolute));
        await checkReference('immutable-reference-checksum', () => fs.writeFileSync(absolute, Buffer.from([1, 2, 3])), () => fs.writeFileSync(absolute, originalBytes));
      } else if (port === 'bindCodexCall') {
        expect(payload.coverImage).toBeUndefined();
        for (const [label, mutate] of [
          ['text-engine', (p: any) => {p.executionRoute.routes['structured:copy.generate'].source = 'self';}],
          ['text-mode', (p: any) => {p.executionRoute.routes['structured:copy.generate'].mode = 'image';}],
          ['text-capability', (p: any) => {p.executionRoute.routes['structured:copy.generate'].capability = 'image.generate';}],
          ['text-runtime', (p: any) => {p.executionRoute.routes['structured:copy.generate'].identity.runtimeVersion = 'invalid-runtime';}],
          ['text-requestedModel', (p: any) => {p.executionRoute.routes['structured:copy.generate'].identity.requestedModel = 'foreign-model';}],
          ['text-pin', (p: any) => {p.modelIdentity.requestedModel = 'foreign-pin';}],
          ['text-frozen-user', (p: any) => {p.modelInput.skillSnapshot.userId = 'foreign-user';}],
          ['text-frozen-account', (p: any) => {p.modelInput.skillSnapshot.accountId = 'foreign-account';}],
          ['text-frozen-group', (p: any) => {p.modelInput.skillSnapshot.groupId = 'foreign-group';}],
          ['text-owner', (p: any) => {p.aiTaskId = 'foreign-owner';}],
        ] as const) await corruptPayload(label, mutate);
        await reject('text-operation', {}, {operationKey: originalCall!.operationKey + '-foreign'});
        await reject('text-parent-kind', {}, {kind: 'tool'});
      } else {
        expect(payload.coverImage).toBeTruthy();
        await corruptPayload('missing-preparation', p => {delete p.coverImage;});
        await corruptPayload('source-digest', p => {p.coverImage.sourceDigest = 'sha256:' + 'f'.repeat(64);});
        await corruptPayload('prepared-operation', p => {p.coverImage.value.input.operationKey += '-foreign';});
        await corruptPayload('prepared-capability', p => {p.coverImage.value.input.capability = 'video.generate';});
        await corruptPayload('prepared-requestedModel', p => {p.coverImage.value.input.requestedModel = 'foreign-image';});
        await reject('image-call-digest', {}, {inputDigest: 'sha256:' + 'f'.repeat(64)});
        await reject('image-call-operation', {}, {operationKey: originalCall!.operationKey + '-foreign'});
        await reject('wrong-business-taskType', {}, {}, {taskType: 'asset.generate'});
        await reject('business-source', {}, {}, {inputData: {...originalBusiness!.inputData as object, topic: 'owned-corruption'}});
        await reject('wrong-business-mapping', {}, {}, {executionTaskId: null});
        await reject('cancelled-admission', {status: 'cancel_requested'});
        await reject('expired-lease', {leaseExpiresAt: '2000-01-01T00:00:00.000Z'});
        await reject('expired-deadline', {deadlineAt: '2000-01-01T00:00:00.000Z'});
        await reject('wrong-attempt', {}, {}, {}, {attempt: ref.attempt + 1});
        await reject('wrong-fence', {}, {}, {}, {fenceToken: 'foreign-fence'});
        await reject('cross-user', {userId: 'foreign-user'});
        await reject('cross-group', {groupId: 'foreign-group'});
        await reject('cross-account', {accountId: 'foreign-account'});
      }
    };
    await owned.host.drainOnce();
    const final = await snapshot('after-drain');
    const publicTask = await call(ENDPOINTS.getTask, {params: {taskId}}); save('public-task-after-drain', publicTask);
    expect(publicTask.status, JSON.stringify({errors: owned.errors, status: final!.task?.status})).toBe('awaiting_confirmation');
    if (process.env.T1322_PROTECTION === '1') {
      const drift = JSON.parse(fs.readFileSync(path.join(owned.root, 'settings-drift.json'), 'utf8'));
      const current = await call(ENDPOINTS.getModelRouting);
      await call(ENDPOINTS.putModelRouting, {body: {schemaVersion: 1, expectedRevision: current.revision, choices: drift.before.choices}});
      save('settings-restored', await call(ENDPOINTS.getModelRouting));
    }
    expect(owned.errors).toEqual([]); expect(final!.calls).toHaveLength(2); expect(final!.calls.every(row => row.status === 'settled')).toBe(true);
    const readImage = async (assetId: string, assetFileId?: string) => {
      const asset = await call(ENDPOINTS.getAsset, {params: {assetId}});
      const fileId = assetFileId ?? asset.currentFileId;
      const link = await call(ENDPOINTS.getAssetFileDownloadUrl, {params: {assetId, assetFileId: fileId}});
      const url = new URL(link.url, 'http://owned.invalid');
      const response = await readBlob(new Request(url, {headers: {'x-group-id': ctx.groupId!}}), {params: Promise.resolve({key: url.pathname.slice('/api/v1/blob/'.length).split('/')})});
      save('blob-response', {status: response.status, path: url.pathname, queryKeys: [...url.searchParams.keys()], body: response.ok ? null : await response.clone().text()});
      expect(response.status).toBe(200);
      const bytes = Buffer.from(await response.arrayBuffer()), decoded = PNG.sync.read(bytes);
      expect(decoded.width).toBe(2); expect(decoded.height).toBe(2); expect(decoded.data.length).toBe(16);
      save('decoded-image', {assetId, assetFileId: fileId, status: response.status, mime: response.headers.get('content-type'), bytes: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex'), width: decoded.width, height: decoded.height});
    };
    if (name === 'cover') {
      const generated = await call(ENDPOINTS.listTaskResults, {params: {taskId}});
      await readImage(generated.find((row: any) => row.resultType === 'generated_asset').assetId);
      save('confirmed', await call(ENDPOINTS.confirmTask, {params: {taskId}}));
      save('public-results', await call(ENDPOINTS.listTaskResults, {params: {taskId}}));
    } else {
      const result = await call(ENDPOINTS.getResult, {params: {resultId}}); save('candidate', result); expect(result.status).toBe('awaiting_confirmation'); expect(result.value).toHaveLength(1);
      await readImage(result.value[0].assetId, result.value[0].assetFileId);
      const adoptionBody = {expected: {owner: name === 'edit' ? 'graphic_post' : 'wechat_article', versionId: baseVersionId}, editedValue: result.value, clientRequestId: 't1322-card-adoption'};
      save('adoption-request', adoptionBody);
      await expect(call(ENDPOINTS.adoptResult, {params: {resultId}, body: {...structuredClone(adoptionBody), expected: {...adoptionBody.expected, versionId: 'foreign-version'}}})).rejects.toThrow();
      const receipt = await call(ENDPOINTS.adoptResult, {params: {resultId}, body: structuredClone(adoptionBody)}); save('adoption', receipt);
      if (name === 'edit') {
        const after = await call(ENDPOINTS.getGraphicPost, {params: {outputId}}), before = JSON.parse(fs.readFileSync(path.join(owned.root, 'graphic-before.json'), 'utf8'));
        save('graphic-after', after); expect(after.current.cardBriefs).toEqual(before.current.cardBriefs); expect(after.current.body).toBe(before.current.body); expect(after.current.title).toBe(before.current.title); expect(after.current.imageUses).toHaveLength(1);
        const prepared = (final!.task!.payload as any).coverImage.value; expect(prepared.input.capability).toBe('image.edit'); expect(prepared.reference.assetFileId).toBe(before.current.seriesProfile.referenceImage.assetFileId);
        const audit = fs.readFileSync(path.join(owned.root, 'native-rpc.ndjson'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
        expect(audit.some(row => row.method === 'turn/start' && row.imageMode && row.inputKinds.includes('image'))).toBe(true);
      } else {
      const after = await call(ENDPOINTS.getArticle, {params: {outputId}}); save('article-after', after); const before = JSON.parse(fs.readFileSync(path.join(owned.root, 'article-before.json'), 'utf8'));
      expect(after.current.sections).toEqual(before.current.sections); expect(after.current.title).toBe(before.current.title); expect(after.current.imageUses).toHaveLength(1);
      }
    }
    const firstConfirmed = await snapshot('after-public-confirm');
    const mediaBefore = fs.readdirSync(path.join(owned.root, 'media'), {recursive: true}).sort();
    if (name === 'cover') {
      await expect(call(ENDPOINTS.confirmTask, {params: {taskId}})).rejects.toThrow('not awaiting confirmation');
    } else {
      const originalBody = JSON.parse(fs.readFileSync(path.join(owned.root, 'adoption-request.json'), 'utf8'));
      const repeated = await call(ENDPOINTS.adoptResult, {params: {resultId}, body: originalBody});
      expect(repeated).toEqual(JSON.parse(fs.readFileSync(path.join(owned.root, 'adoption.json'), 'utf8')));
      save('repeated-adoption', repeated);
    }
    const repeated = await snapshot('after-repeated-confirm');
    expect(repeated!.calls).toEqual(firstConfirmed!.calls); expect(repeated!.results).toEqual(firstConfirmed!.results);
    expect(fs.readdirSync(path.join(owned.root, 'media'), {recursive: true}).sort()).toEqual(mediaBefore);
    if (process.env.T1322_PROTECTION === '1') expect(guardEvidence).toHaveLength(name === 'edit' ? 32 : 30);
  } finally {
    await snapshot('before-cleanup').catch(() => {}); await owned.host?.stop(); await (globalThis as {__creatorosDisposePersistence?: () => Promise<void>}).__creatorosDisposePersistence?.(); __resetPersistenceForTests(); vi.unstubAllEnvs(); save('cleanup', {ownModelHostStopped: true, ownPersistenceDisposed: true, candidateTouched: false, actualExternalModels: 0});
  }
}, 3600000);
