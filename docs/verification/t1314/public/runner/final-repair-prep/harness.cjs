"use strict";
// 只有未来精确绑定且另获执行授权后才装配。prep不import此工厂、不启动浏览器。
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {StringDecoder} = require('node:string_decoder');
const {loadBinding, sha} = require('./binding.cjs');
function createSuite(allowed) {
  const {binding: b, secret, out} = loadBinding();
  if (!allowed.includes(b.caseId)) throw Error('EXACT_CASE_SELECTION_REQUIRED');
  const requireRuntime = createRequire(b.runtime.frontendPackageJson);
  const {test: base, expect, chromium} = requireRuntime('@playwright/test');
  const clean = text => String(text).split(secret).join('[OWNED_HANDSHAKE_REDACTED]');
  const target = name => {const p = path.resolve(out, name); if (!p.startsWith(out + path.sep)) throw Error('OUTPUT_ESCAPE'); return p;};
  function save(name, data) {const p = target(name + '.json'); fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, JSON.stringify(data, (_k, v) => typeof v === 'string' ? clean(v) : v, 2) + '\n');}
  function remaining(deadline = b.absoluteObservationDeadlineAt) {const n = Math.min(Date.parse(b.absoluteObservationDeadlineAt), Date.parse(deadline)) - Date.now(); if (n <= 0) throw Error('ORIGINAL_OBSERVATION_DEADLINE_EXHAUSTED_NO_RESEND'); return n;}
  const test = base.extend({context: async ({}, use) => {
    remaining(); save('invocation-start', {caseId: b.caseId, sourceHead: b.sourceHead, candidate: b.finalCandidateBinding, absoluteObservationDeadlineAt: b.absoluteObservationDeadlineAt, at: new Date().toISOString()});
    const context = await chromium.launchPersistentContext('', {headless: true, timeout: Math.min(180000, remaining()), baseURL: b.runtime.baseURL, viewport: {width: 1366, height: 900}, extraHTTPHeaders: {'x-creatoros-handshake': secret}});
    context.setDefaultTimeout(120000); context.setDefaultNavigationTimeout(300000);
    await context.addInitScript(value => {window.__CREATOROS_HANDSHAKE_TOKEN__ = value;}, secret);
    const denied = [], origin = new URL(b.runtime.baseURL).origin;
    await context.route('**/*', async route => {const u = new URL(route.request().url()); if (['data:', 'blob:', 'about:'].includes(u.protocol) || u.origin === origin) return route.continue(); denied.push(u.origin + u.pathname); return route.abort('blockedbyclient');});
    await context.routeWebSocket('**/*', socket => {if (new URL(socket.url()).origin.replace(/^ws/, 'http') === origin) socket.connectToServer(); else {denied.push('foreign-websocket'); void socket.close();}});
    let auditSequence = 0; const sseTails = new Map();
    await context.exposeBinding('__t1314SseChunk', (_source, event) => {
      const p = target('sse/stream-' + event.streamId + '.ndjson'); fs.mkdirSync(path.dirname(p), {recursive: true});
      const key = event.streamId + ':' + event.executionTaskId;
      let stream = sseTails.get(key); if (!stream) {stream = {decoder: new StringDecoder('utf8'), tail: ''}; sseTails.set(key, stream);}
      const text = clean(stream.tail + stream.decoder.write(Buffer.from(event.bytes || [])) + (event.done ? stream.decoder.end() : ''));
      const ended = event.done || event.observationErrorName;
      const cut = ended ? text.length : Math.max(0, text.length - Math.max(0, secret.length - 1));
      fs.appendFileSync(p, JSON.stringify({sequence: ++auditSequence, at: new Date().toISOString(), executionTaskId: event.executionTaskId, text: text.slice(0, cut), done: !!event.done, observationErrorName: event.observationErrorName || null}) + '\n');
      stream.tail = text.slice(cut); if (ended) sseTails.delete(key);
    });
    await context.addInitScript(() => {
      const original = window.fetch.bind(window); let sequence = 0;
      window.fetch = async (...args) => {
        const response = await original(...args), input = args[0], url = new URL(typeof input === 'string' ? input : input.url ?? String(input), location.href);
        if (url.pathname === '/api/chat' && response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
          const streamId = ++sequence, executionTaskId = response.headers.get('x-execution-task-id'), reader = response.clone().body.getReader();
          void (async () => {try {for (;;) {const x = await reader.read(); if (x.done) break; await window.__t1314SseChunk({streamId, executionTaskId, bytes: Array.from(x.value)});} await window.__t1314SseChunk({streamId, executionTaskId, done: true});} catch (e) {await window.__t1314SseChunk({streamId, executionTaskId, observationErrorName: e?.name || 'Error'});}})();
        }
        return response;
      };
    });
    // 仅自有浏览器到绝对界时释放观察，不调用任何任务cancel/retry/resume。
    const timer = setTimeout(() => {save('observer-deadline', {at: new Date().toISOString(), absolute: b.absoluteObservationDeadlineAt, action: 'close-owned-browser-only'}); void context.close();}, remaining());
    try {await use(context);} finally {clearTimeout(timer); save('sse-observation-state', {pendingStreams: [...sseTails.keys()], completeOnlyIfPendingEmpty: sseTails.size === 0}); await context.close(); save('browser-cleanup', {closedOwnEphemeralContext: true, denied}); expect(denied).toEqual([]);}
  }});
  test.setTimeout(7200000);
  test.describe.configure({mode: 'serial', retries: 0});
  function harness(page) {
    const scope = b.ownedScope;
    async function rpc(id, input = {}, deadline) {
      let response; try {response = await page.request.post('/api/v1/dispatch', {timeout: Math.min(900000, remaining(deadline)), headers: {'x-group-id': scope.groupId}, data: {id, input}});} catch {throw Error('RPC_TRANSPORT ' + id);}
      let body; try {body = await response.json();} catch {throw Error('RPC_INVALID_JSON ' + id + ' status=' + response.status());}
      if (!response.ok() || body.success === false) throw Error('RPC_REJECTED ' + id + ' status=' + response.status() + ' code=' + String(body.error?.code ?? body.code ?? 'UNKNOWN').replace(/[^A-Za-z0-9_.:-]/g, ''));
      return body.data;
    }
    async function owner() {
      const group = await rpc('accountGroups.get', {params: {groupId: scope.groupId}}); expect(group.status).toBe('active');
      await page.context().addCookies([{name: 'creatoros_current_group', value: encodeURIComponent(scope.groupId), url: b.runtime.baseURL}, {name: 'creatoros_current_account', value: '', url: b.runtime.baseURL}]);
      await page.addInitScript(id => {localStorage.setItem('creatoros:current-group', id); localStorage.removeItem('creatoros:current-account'); localStorage.setItem('creatoros:onboarding:hidden', '1');}, scope.groupId);
      const routing = await rpc('settings.modelRouting.get'); expect(routing.revision).toBe(b.routing.revision); expect(routing.choices).toEqual(b.routing.choices); save('routing-readback', routing);
      const project = await rpc('projects.get', {params: {projectId: scope.projectId}}); expect(project.id).toBe(scope.projectId); if (Object.hasOwn(project, 'groupId')) expect(project.groupId).toBe(scope.groupId);
    }
    async function mirrors() {
      expect(await page.evaluate(() => localStorage.getItem('creatoros:current-group'))).toBe(scope.groupId);
      expect(await page.evaluate(() => localStorage.getItem('creatoros:current-account'))).toBeNull();
      const cookies = await page.context().cookies(); expect(cookies.find(x => x.name === 'creatoros_current_group')?.value).toBe(encodeURIComponent(scope.groupId)); expect([undefined, '']).toContain(cookies.find(x => x.name === 'creatoros_current_account')?.value);
    }
    async function pages(id, input, prefix, size = 100) {
      const output = []; let afterSequence = 0;
      for (;;) {const value = await rpc(id, {...input, query: {afterSequence, limit: size}}); output.push(value); if (!value.hasMore) break; expect(value.nextSequence).toBeGreaterThan(afterSequence); afterSequence = value.nextSequence;}
      save(prefix, output); return output;
    }
    async function observeExecution(ids, label) {
      let task, deadline = b.absoluteObservationDeadlineAt;
      for (;;) {
        task = await rpc('execution.tasks.get', {params: {taskId: ids.executionTaskId}}, deadline); if (task.deadlineAt) deadline = new Date(Math.min(Date.parse(deadline), Date.parse(task.deadlineAt))).toISOString();
        save(label + '/task', {ids, task, at: new Date().toISOString(), originalDeadlineAt: deadline});
        if (['succeeded', 'failed', 'unknown_result', 'blocked', 'waiting_user', 'partial', 'paused', 'cancelled'].includes(task.runtimeStatus ?? task.status)) break;
        await new Promise(resolve => setTimeout(resolve, Math.min(2000, remaining(deadline))));
      }
      const inspect = await pages('workbench.tasks.inspect', {params: {taskId: ids.executionTaskId}}, label + '/inspect');
      expect(task.ownerId).toBe(ids.aiTaskId); expect(task.runtimeStatus ?? task.status, '保原ID/真实状态；不自动重发').toBe('succeeded');
      return {task, inspect};
    }
    async function settle(response, label) {
      const headers = response.headers(), ids = {conversationId: headers['x-conversation-id'], sourceMessageId: headers['x-source-message-id'], aiTaskId: headers['x-ai-task-id'], executionTaskId: headers['x-execution-task-id']};
      save(label + '/submission', {httpStatus: response.status(), ids}); save(label + '/actual-request', response.request().postDataJSON());
      expect(response.status()).toBe(200); for (const value of Object.values(ids)) expect(value).toBeTruthy();
      const observed = await observeExecution(ids, label);
      const messages = await rpc('ai.conversations.messages.list', {params: {conversationId: ids.conversationId}}), assistant = messages.find(m => m.role === 'assistant' && m.modelMetadata?.sourceMessageId === ids.sourceMessageId);
      save(label + '/messages', messages); expect(assistant).toBeTruthy(); expect(assistant.modelMetadata.actualEngine).toBe('codex');
      return {...observed, ids, assistant, request: response.request().postDataJSON()};
    }
    async function trigger(click, label) {const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/chat' && r.request().method() === 'POST', {timeout: remaining()}); await click(); return settle(await pending, label);}
    async function submit(host, text, label) {return trigger(async () => {await host.getByRole('textbox', {name: '我能帮你做什么', exact: true}).fill(text); await host.getByRole('button', {name: '提交提示给 Copilot', exact: true}).click();}, label);}
    async function rail(route = 'script') {await page.goto('/projects/' + scope.projectId + '/' + route); await mirrors(); const host = page.locator('[data-slot="draft-chat-rail"]'), toggle = page.locator('[data-slot="draft-rail-expand-toggle"]'); if (!(await host.isVisible()) && await toggle.isVisible()) await toggle.click(); await expect(host).toBeVisible(); await host.getByRole('button', {name: '新对话', exact: true}).click(); return host;}
    async function state() {
      const artifact = await rpc('artifacts.get', {params: {artifactId: scope.scriptArtifactId}}), versions = []; let n = 1, total;
      do {const response = await page.request.post('/api/v1/dispatch', {timeout: Math.min(900000, remaining()), headers: {'x-group-id': scope.groupId}, data: {id: 'artifacts.versions.list', input: {params: {artifactId: artifact.id}, query: {page: n++, pageSize: 100}}}}); const body = await response.json(); expect(response.status()).toBe(200); total = body.meta.total; expect(Number.isSafeInteger(total)).toBe(true); if (versions.length < total) expect(body.data.length).toBeGreaterThan(0); versions.push(...body.data);} while (versions.length < total);
      expect(versions).toHaveLength(total); expect(artifact.projectId).toBe(scope.projectId); for (const v of versions) expect(v.artifactId).toBe(artifact.id);
      const article = scope.articleOutputId ? await rpc('articles.get', {params: {outputId: scope.articleOutputId}}) : null, graphic = scope.graphicOutputId ? await rpc('graphicPosts.get', {params: {outputId: scope.graphicOutputId}}) : null;
      return {artifact, versions, article, graphic};
    }
    async function task(id, label, requireResults = true) {
      let current = await rpc('ai.tasks.get', {params: {taskId: id}}); expect(current.executionTaskId).toBeTruthy();
      const execution = await observeExecution({executionTaskId: current.executionTaskId, aiTaskId: id}, label);
      current = await rpc('ai.tasks.get', {params: {taskId: id}}); const results = await rpc('ai.tasks.results.list', {params: {taskId: id}}); save(label + '/business', {task: current, results}); expect(['succeeded', 'awaiting_confirmation']).toContain(current.status); if (requireResults) expect(results.length).toBeGreaterThan(0); return {task: current, results, execution};
    }
    async function frozenRoute(ids, expected) {
      if (!b.frozenRouteEvidenceDirectory) {save('vision-frozen-proof', {state: 'UNKNOWN_NOT_EXPOSED_BY_PUBLIC_DTO', ids, expected, businessMayContinue: true}); return false;}
      const file = path.join(b.frozenRouteEvidenceDirectory, ids.executionTaskId + '.json');
      if (!fs.existsSync(file)) {save('vision-frozen-proof', {state: 'UNKNOWN_EVIDENCE_NOT_AVAILABLE', ids, expected}); return false;}
      const evidence = JSON.parse(fs.readFileSync(file, 'utf8')); save('vision-frozen-proof', evidence);
      expect(evidence.sourceHead).toBe(b.sourceHead); expect(evidence.executionTaskId).toBe(ids.executionTaskId); expect(evidence.aiTaskId).toBe(ids.aiTaskId); expect(evidence.sourceMessageId).toBe(ids.sourceMessageId); expect(evidence.routeKey).toBe(expected.routeKey); expect(evidence.source).toBe('codex'); expect(evidence.modelInputContainsImage).toBe(true); expect(evidence.identity.runtimeVersion).toBe(b.expectedRuntimeVersion); expect(evidence.identity.requestedModel).toBe(b.expectedModelId); return true;
    }
    return {b, scope, expect, save, remaining, rpc, owner, mirrors, pages, observeExecution, settle, trigger, submit, rail, state, task, frozenRoute, sha};
  }
  return {test, expect, harness, binding: b};
}
module.exports = {createSuite};
