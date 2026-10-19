// @vitest-environment node
import { it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ENDPOINTS } from '@creatoros/contract';
import { executionTasks, executionCalls, aiTasks, eq } from '@creatoros/backend';
import { canonicalJson } from '../../../../backend/src/modules/ai/canonical-json';
import { reorganizePrompt } from '@/features/projects/script-first-content';

const observation = vi.hoisted(() => ({
  directory: '', root: '', db: null as any,
  tools: new Map<string, { input: any; tools: any }>(),
  assertions: new Set<string>(), submitted: false,
}));
const digest = (value: unknown) => createHash('sha256')
  .update(typeof value === 'string' ? value : JSON.stringify(value) ?? 'undefined').digest('hex');
function write(name: string, value: unknown) {
  fs.writeFileSync(path.join(observation.directory, name + '.json'), JSON.stringify(value, null, 2) + '\n');
}
function append(name: string, value: unknown) {
  fs.appendFileSync(path.join(observation.directory, name + '.ndjson'), JSON.stringify({ at: new Date().toISOString(), ...value as object }) + '\n');
}
function safeError(error: unknown) {
  const e = error instanceof Error ? error : new Error(String(error));
  return {
    name: /^[A-Za-z0-9_]{1,80}$/.test(e.name) ? e.name : 'UnknownError',
    ...(observation.assertions.has(e.message) ? { assertion: e.message } : {}),
    messageBytes: Buffer.byteLength(e.message), messageSha256: digest(e.message),
    frames: (e.stack ?? '').split('\n').slice(1)
      .flatMap(line => line.match(/(?:backend|frontend|ai-worker)\/src\/[^():\s]+:\d+:\d+/g) ?? []),
  };
}
function shape(value: unknown, depth = 0): unknown {
  if (value === null) return { type: 'null' };
  if (typeof value === 'string') return { type: 'string', bytes: Buffer.byteLength(value), sha256: digest(value) };
  if (typeof value !== 'object') return { type: typeof value, sha256: digest(value) };
  if (depth > 10) return { type: 'object', sha256: digest(value) };
  if (Array.isArray(value)) return { type: 'array', length: value.length, items: value.slice(0, 100).map(v => shape(v, depth + 1)), sha256: digest(value) };
  return { type: 'object', keys: Object.fromEntries(Object.entries(value).slice(0, 150).map(([key, v]) => [
    /^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(key) ? key : 'key-sha256-' + digest(key), shape(v, depth + 1),
  ])), sha256: digest(value) };
}
function ids(input: any) {
  return Object.fromEntries(['callId', 'modelCallId', 'turnCallId', 'toolCallId', 'threadId', 'turnId', 'toolName']
    .filter(key => typeof input?.[key] === 'string' && /^[A-Za-z0-9_.:\/-]{1,200}$/.test(input[key]))
    .map(key => [key, input[key]]));
}
function publicPart(part: any) {
  const out = part?.output ?? part?.data;
  return {
    type: part?.type, state: part?.state, ...ids(part),
    kind: out?.kind ?? null, failureCode: out?.failureCode ?? null,
    target: out?.kind?.startsWith('work.editor.') ? out.target ?? null : null,
    base: out?.kind?.startsWith('work.editor.') ? out.base ?? null : null,
    candidateKind: out?.candidate?.kind ?? null,
    candidateDigest: out?.candidateDigest ?? null,
    apply: out?.apply ? { operation: out.apply.operation, outputId: out.apply.outputId,
      expectedCurrentVersionId: out.apply.body?.expectedCurrentVersionId } : null,
    hasCandidate: Boolean(out?.kind === 'work.editor.candidate' && out.candidate && out.apply),
    errorPresent: typeof out?.error === 'string' && out.error.length > 0,
  };
}

// 原prepare返回前保存实际冻结定义，不记录system/messages/模型正文。
vi.mock('@/server/prepare-chat-reply', async original => {
  const actual = await original<any>();
  return { ...actual, async prepareChatReply(...args: any[]) {
    const result = await actual.prepareChatReply(...args);
    append('prepared', { executionEngine: result.executionEngine, executionRoute: result.executionRoute,
      definitions: result.tools, target: result.hostContext?.chatContext?.editorTarget ?? null,
      genericAdoptPresent: result.tools.some((def: any) => def.name === 'creativeResults.adopt') });
    return result;
  } };
});

// 仅 loader 绑定既有不可变文件；不构建、不更换 worker 协议或认证。
vi.mock('@/server/execution-worker-path', async original => {
  const actual = await original<any>();
  const root = '/private/tmp/t1300-artifact-940jy2at/sidecar/frontend/runtime';
  return {
    ...actual,
    resolveExecutionWorkerPath: () => path.join(root, 'execution-worker.cjs'),
    resolveCodexStatusWorkerPath: () => path.join(root, 'codex-status-worker.cjs'),
  };
});
// 同一个真实 DB factory；在打开前核 driver，再观测真实返回，不换连接。
vi.mock('@creatoros/backend', async original => {
  const actual = await original<any>();
  return {
    ...actual,
    async createConfiguredDb(...args: any[]) {
      const planned = actual.resolveDbDriver(args[0]);
      if (planned.kind !== 'file-pglite' || planned.target !== path.join(observation.root, 'db')) throw Error('T1321_OWNED_DB_REQUIRED');
      const value = await actual.createConfiguredDb(...args);
      expect(value.driver).toEqual(planned);
      observation.db = value.db;
      write('db-factory', { driver: value.driver, ownRoot: observation.root });
      return value;
    },
  };
});
// 真实 resolver 同 ctx/input/ref/signal；持有原工具对象，不改变集合/参数/返回。
vi.mock('../../../../backend/src/modules/execution/model-worker-dispatcher', async original => {
  const actual = await original<any>();
  return {
    ...actual,
    createChatWorkerDispatcher(db: any, deps: any) {
      return actual.createChatWorkerDispatcher(db, {
        ...deps,
        async resolveTools(...args: any[]) {
          const tools = await deps.resolveTools(...args);
          const [ctx, input, ref] = args;
          observation.tools.set(ref.executionTaskId + ':' + ref.attempt, { input, tools });
          append('resolver', {
            executionTaskId: ref.executionTaskId, attempt: ref.attempt,
            scope: { userId: ctx.userId, groupId: ctx.groupId ?? null, accountId: ctx.accountId ?? null },
            editorTarget: input.hostContext?.chatContext?.editorTarget ?? null,
            frozen: input.tools.map((def: any) => ({ name: def.name, version: def.version, effect: def.effect, execution: def.execution ?? 'host', parameters: def.parameters })),
            resolved: Object.entries(tools).map(([name, tool]: any) => ({ name, version: tool.version, effect: tool.effect, execution: tool.execution ?? 'host' })),
            genericAdoptPresent: Boolean(tools['creativeResults.adopt']),
          });
          return tools;
        },
      });
    },
  };
});
// 真实 supervisor 只透明观测 invoke；validate/其余依赖/原返回/原 throw 均不换。
vi.mock('../../../../backend/src/modules/execution/worker-supervisor', async original => {
  const actual = await original<any>();
  return {
    ...actual,
    createWorkerSupervisor(options: any) {
      return actual.createWorkerSupervisor({
        ...options,
        ports: {
          ...options.ports,
          async invoke(ref: any, port: string, input: any) {
            const base = { executionTaskId: ref.executionTaskId, attempt: ref.attempt, port, ...ids(input) };
            append('invoke', { ...base, phase: 'start',
              ...(port === 'executeExternalTaskTool' ? { inputShape: shape(input.input) } : {}) });
            try {
              const result = await options.ports.invoke(ref, port, input);
              append('invoke', { ...base, phase: 'returned', ...ids(result),
                status: typeof result?.status === 'string' ? result.status : null,
                ...(port === 'executeExternalTaskTool' ? { result: publicPart({ output: result?.data }) } : {}) });
              return result;
            } catch (error) {
              append('invoke', { ...base, phase: 'throw', error: safeError(error) });
              if (port === 'executeExternalTaskTool' && error instanceof Error && error.message === '外部工具参数不符合冻结定义') {
                const resolved = observation.tools.get(ref.executionTaskId + ':' + ref.attempt);
                const definition = resolved?.input.tools.find((v: any) => v.name === input.toolName);
                const tool = resolved?.tools[input.toolName];
                const matched = Boolean(definition && tool && definition.version === tool.version && definition.effect === tool.effect && (definition.execution ?? 'host') === (tool.execution ?? 'host'));
                const parsed = matched ? tool.parameters.safeParse(input.input) : null;
                append('parameter-diagnosis', {
                  ...base, matched, frozenVersion: definition?.version ?? null,
                  owner: resolved?.input.hostContext?.chatContext?.editorTarget?.owner ?? null,
                  inputShape: shape(input.input), success: parsed?.success ?? null,
                  issues: parsed && !parsed.success ? parsed.error.issues.map((issue: any) => ({
                    path: issue.path.map((p: any) => typeof p === 'number' || /^[A-Za-z0-9_]{1,80}$/.test(String(p)) ? p : 'key-sha256-' + digest(String(p))),
                    code: issue.code, expected: typeof issue.expected === 'string' ? issue.expected : undefined,
                  })) : [],
                });
              }
              throw error;
            }
          },
        },
      });
    },
  };
});

import { compositeTransport, getIdentityService, getStorageRootForRequest, __resetPersistenceForTests } from '@/server/persistence-client';
import { POST } from '@/app/api/chat/route';

it('一次真实公共图文重组：透明诊断原端口与原模型，不重发', async () => {
  const directory = process.env.T1321_RUN_DIR;
  if (!directory || !path.isAbsolute(directory)) throw Error('T1321_RUN_DIR_REQUIRED');
  observation.directory = directory;
  observation.root = fs.mkdtempSync('/private/tmp/t1321-owned-');
  fs.mkdirSync(directory, { recursive: true });
  const root = observation.root;
  const paths = { db: path.join(root, 'db'), media: path.join(root, 'media'), workspaces: path.join(root, 'workspaces'), tmp: path.join(root, 'tmp'), browser: path.join(root, 'browser') };
  Object.values(paths).forEach(p => fs.mkdirSync(p, { recursive: true, mode: 0o700 }));
  const handshake = randomBytes(32).toString('hex');
  for (const [key, value] of Object.entries({
    DATABASE_URL: '', PGLITE_DATA_DIR: paths.db, CREATOROS_STORAGE: 'local', CREATOROS_MEDIA_ROOT: paths.media,
    CREATOROS_WORKSPACES_ROOT: paths.workspaces, CREATOROS_BROWSER_POOL_DIR: path.join(paths.browser, 'pool'),
    CREATOROS_WEB_AUTH_DIR: path.join(paths.browser, 'web'), CREATOROS_DOUYIN_AUTH_DIR: path.join(paths.browser, 'douyin'),
    TMPDIR: paths.tmp, TEMP: paths.tmp, TMP: paths.tmp, CREATOROS_DISABLE_BACKGROUND_DRIVERS: '1', CREATOROS_DISABLE_SCHEDULER: '1',
    CREATOROS_CLIENT_CONFIG_PULL_ENABLED: '0', CREATOROS_MASTER_KEY_FD: '', CREATOROS_MASTER_KEY_FILE: '',
    CREATOROS_MASTER_KEY: randomBytes(32).toString('base64'), S3_BUCKET: '', CREATOROS_DESKTOP: '0', CREATOROS_LOG_DIR: '',
    CREATOROS_SIDECAR_HANDSHAKE_TOKEN: handshake, CREATOROS_HANDSHAKE_REQUIRED: '1',
  })) vi.stubEnv(key, value);
  write('isolation', { root, paths, pid: process.pid, node: process.execPath, nodeVersion: process.version, auth: '原 HOME/CODEX_HOME 自然继承；未读取或复制认证', appKey: '仅本轮随机内存key，非Codex认证', controllersTouched: false });
  const assertions = JSON.parse(fs.readFileSync(path.join(directory, 'FIXED_ASSERTIONS.json'), 'utf8'));
  observation.assertions = new Set(assertions.assertions.map((v: any) => v.message));
  __resetPersistenceForTests();
  let executionTaskId: string | null = null;
  let conversationId: string | null = null;
  let actualCtx: any, outputId: string | undefined, initialVersionId: string | undefined;
  let requestAbort: AbortController | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastStatus: any = null;
  const call = async (endpoint: any, ctx: any, body?: any, params?: any) => (await compositeTransport.request(endpoint, { body, params } as never, ctx)).data as any;
  async function readBusiness() {
    if (!conversationId || !actualCtx) return;
    const messages = await call(ENDPOINTS.listMessages, actualCtx, undefined, { conversationId });
    if (!Array.isArray(messages)) throw Error('T1321_PUBLIC_MESSAGE_LIST_SHAPE_UNKNOWN');
    const assistants = messages.filter((m: any) => m.role === 'assistant');
    const summaries = assistants.map((m: any) => ({ id: m.id, role: m.role,
      parts: (m.parts ?? []).map(publicPart) }));
    const candidates = assistants.flatMap((m: any) => (m.parts ?? [])
      .filter((part: any) => part.output?.kind === 'work.editor.candidate')
      .map((part: any) => ({ messageId: m.id, toolCallId: part.toolCallId,
        ...publicPart(part), neutralCandidate: part.output.candidate ?? null })));
    const current = await call(ENDPOINTS.getGraphicPost, actualCtx, undefined, { outputId });
    write('public-business-readback', { conversationId, assistants: summaries, candidates,
      usableCandidates: candidates.filter((c: any) => c.hasCandidate).length,
      outputId, initialVersionId, currentVersionId: current.currentVersionId,
      versionUnchanged: current.currentVersionId === initialVersionId,
      interpretation: '原公开消息parts和原图文get读回，不以succeeded代替正式候选' });
  }
  async function snapshot(label: string) {
    if (!observation.db || !executionTaskId) return;
    const [task] = await observation.db.select().from(executionTasks).where(eq(executionTasks.id, executionTaskId));
    const calls = await observation.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId, executionTaskId));
    const [business] = await observation.db.select().from(aiTasks).where(eq(aiTasks.executionTaskId, executionTaskId));
    lastStatus = { id: task?.id, status: task?.status, attempt: task?.attempt, deadlineAt: task?.deadlineAt, errorCode: task?.lastErrorCode, businessId: business?.id, businessStatus: business?.status };
    write('state-' + label, {
      task: lastStatus,
      tuple: { userId: task?.userId, groupId: task?.groupId ?? null, accountId: task?.accountId ?? null, ownerId: task?.ownerId, projectId: business?.projectId },
      frozen: { executionEngine: task?.payload?.modelInput?.executionEngine, executionRoute: task?.payload?.modelInput?.executionRoute, editorTarget: task?.payload?.modelInput?.hostContext?.chatContext?.editorTarget, tools: task?.payload?.modelInput?.tools },
      calls: calls.map((c: any) => ({ id: c.id, parentCallId: c.parentCallId, kind: c.kind, status: c.status, inputDigest: c.inputDigest, errorCode: c.errorCode, resultDigest: c.resultDigest, totalTokens: c.totalTokens, providerResultShape: shape(c.providerResult) })),
      payloadSha256: digest(task?.payload),
    });
    return task;
  }
  try {
    const local = await (await getIdentityService()).resolveLocalContext();
    const user = { ...local, accountId: null, requestId: 't1321-owned', source: 'user' as const };
    const group = await call(ENDPOINTS.createAccountGroup, user, { name: 'T1321隔离图文诊断', idempotencyKey: 't1321-' + randomUUID() });
    const ctx = { ...user, groupId: group.id, groupVersion: group.version };
    actualCtx = ctx;
    expect(await getStorageRootForRequest(ctx)).toBe(paths.media);
    const routing = await call(ENDPOINTS.getModelRouting, ctx);
    const configured = await call(ENDPOINTS.putModelRouting, ctx, { schemaVersion: 1, expectedRevision: routing.revision,
      choices: { text: 'codex', vision: 'codex', image: 'official', video: 'official', audio: 'local', embed: 'official' } });
    const project = await call(ENDPOINTS.createProject, ctx, { title: '记录一次真实尝试' });
    const artifact = await call(ENDPOINTS.createArtifact, ctx, { title: '记录方法原稿', artifactType: 'master_script', stage: 'script' }, { projectId: project.id });
    const script = await call(ENDPOINTS.createArtifactVersion, ctx, { contentText: '遇到一个问题，先写清楚当时的情况，再记录自己做了什么尝试，最后记下观察到的结果。每次只改变一个条件，可以更容易比较前后差异。如果结果与预期不同，就保留记录，下次再核对，不把一次尝试当作普遍结论。' }, { artifactId: artifact.id });
    const output = await call(ENDPOINTS.createGraphicPost, ctx, { title: '把一次尝试记清楚', targetPlatform: 'xiaohongshu', clientRequestId: 't1321-graphic-create' }, { projectId: project.id });
    outputId = output.id;
    let post = await call(ENDPOINTS.getGraphicPost, ctx, undefined, { outputId: output.id });
    expect(post.scriptContext?.state).toBe('ready');
    expect(post.scriptContext.scriptRef.versionId).toBe(script.id);
    const document = { ...post.current, title: '把一次尝试记清楚', body: '记录问题、尝试和观察结果，保留每次比较的依据。', summary: '一次真实尝试的记录方法', tags: ['记录'], sourceRefs: [post.scriptContext.scriptRef] };
    await call(ENDPOINTS.createGraphicPostVersion, ctx, { expectedCurrentVersionId: post.currentVersionId, document, clientRequestId: 't1321-graphic-save' }, { outputId: output.id });
    post = await call(ENDPOINTS.getGraphicPost, ctx, undefined, { outputId: output.id });
    initialVersionId = post.currentVersionId;
    const exact = await call(ENDPOINTS.getGraphicPostVersion, ctx, undefined, { outputId: output.id, versionId: post.currentVersionId });
    const target = { schemaVersion: 1, projectId: project.id, outputId: output.id, owner: 'graphic_post', contentType: 'image', savedBase: { kind: 'artifact', artifactId: post.artifactId, versionId: post.currentVersionId }, documentDigest: 'sha256:' + digest(canonicalJson(exact.document)), selection: { kind: 'graphic_post', cardIds: [] } };
    write('public-fixture', { ctx, project, script, post, exact, target, routing: configured, provenance: '本轮公开人工中性输入，非原U14/模型血缘' });
    const prompt = reorganizePrompt('rednote');
    write('submission-intent', { rootSubmits: 1, promptSha256: digest(prompt), promptBytes: Buffer.byteLength(prompt), target, executionEngine: 'codex' });
    requestAbort = new AbortController();
    // 原持久预算为600000；外层仅观察/订阅，不延长业务任务。
    timer = setTimeout(() => requestAbort?.abort(), 720000);
    observation.submitted = true;
    append('lifecycle', { phase: 'unique-public-post-start' });
    const response = await POST(new Request('http://127.0.0.1/api/chat', { method: 'POST', signal: requestAbort.signal,
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1', 'x-creatoros-handshake': handshake, 'x-group-id': group.id },
      body: JSON.stringify({ executionEngine: 'codex', messages: [{ id: randomUUID(), role: 'user', parts: [{ type: 'text', text: prompt }] }], chatContext: { surface: 'project', projectId: project.id, scope: 'project:' + project.id, editorTarget: target } }),
    }));
    executionTaskId = response.headers.get('x-execution-task-id');
    conversationId = response.headers.get('x-conversation-id');
    write('public-response', { status: response.status, executionTaskId, conversationId, contentType: response.headers.get('content-type') });
    if (!executionTaskId || !response.body || response.status !== 200) {
      write('blocked', { layer: 'public-route', status: response.status, responseShape: shape(await response.text()), rootResubmitted: false });
      return;
    }
    const first = await snapshot('submitted');
    clearTimeout(timer);
    const remaining = Date.parse(first.deadlineAt) - Date.now();
    write('observation-budget', { originalDeadlineAt: first.deadlineAt, remainingMs: remaining, businessDeadlineUnchanged: true });
    timer = setTimeout(() => requestAbort?.abort(), Math.max(1, remaining));
    reader = response.body.getReader();
    let buffer = '';
    const decoder = new TextDecoder();
    while (!requestAbort.signal.aborted) {
      const next = await reader.read();
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const text = line.slice(6);
        if (text === '[DONE]') { append('sse', { type: 'done' }); continue; }
        try {
          const value = JSON.parse(text);
          append('sse', { ...publicPart(value), status: value.messageMetadata?.execution?.status ?? null,
            executionTaskId: value.messageMetadata?.execution?.executionTaskId ?? executionTaskId,
          });
        } catch { append('sse', { type: 'unparsed', bytes: Buffer.byteLength(text), sha256: digest(text) }); }
      }
    }
    await snapshot('final');
    write('outcome', { lastStatus, actualThrows: fs.existsSync(path.join(directory, 'invoke.ndjson')) ? fs.readFileSync(path.join(directory, 'invoke.ndjson'), 'utf8').split('\n').filter(v => v.includes('"phase":"throw"')).length : 0,
      interpretation: '诊断结果；test完成不代表业务PASS或旧U14首因已证', rootSubmits: 1 });
  } catch (error) {
    write('fixture-or-runtime-error', { submitted: observation.submitted, executionTaskId, error: safeError(error) });
    await snapshot('error').catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    requestAbort?.abort();
    await reader?.cancel().catch(() => {});
    await snapshot('before-cleanup').catch(() => {});
    await readBusiness().catch(error => write('public-readback-error', { error: safeError(error) }));
    await (globalThis as any).__creatorosDisposePersistence?.();
    __resetPersistenceForTests();
    write('cleanup', { hostDisposed: true, dbRetained: paths.db, root, lastStatus, backgroundTaskNotRewritten: true, controllersTouched: false });
    vi.unstubAllEnvs();
  }
}, 3600000);
