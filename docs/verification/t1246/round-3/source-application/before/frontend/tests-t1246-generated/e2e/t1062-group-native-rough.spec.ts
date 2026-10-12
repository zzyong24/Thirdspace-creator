import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import type { Locator, Page, Request, TestInfo } from '@playwright/test';
import { ENDPOINTS, productionReferencePlan, projectProductionRoughPlan } from '@creatoros/contract';
import { expect, test } from '../helpers/test-environment';

// 本文件只验证真实浏览器、公共服务和原生剪辑工作流。loopback粗剪输出是协议夹具，
// 不证明语义模型效果；AudioContext自然ended也不代替用户听感/人工签名。
// 原18组合第12应包含本文件；运行前须已应用正式宿主/native候选并完成离线worker准入。
const FIXTURE_ROOT = '/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/t1062-neutral-rough-media-qmk3a1mp';
const FIXTURE_MANIFEST_SHA = '1ba2379fc70eba30aac253bfd0dd4ce84e040991ee30fbf8f6a022dd4654ad4d';
const MEDIA = {
  normal: { name: 'neutral-original-speed.mp4', bytes: 232847,
    sha: 'e6c0f4e72741e8f37b369d9511311569df8ef6c4e07009f3c746c632fb0e2073' },
  offset: { name: 'neutral-clock-offset.mp4', bytes: 232875,
    sha: '0b22998e8238f35c9c3447c01234ce03f0ee03770db229c53f1e3de9f6905914' },
} as const;
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
type ProductionRoughCutRequest = typeof ENDPOINTS.getProductionRoughCut.response['_output'];
type Scope = { groupId?: string; accountId?: string };
type Input = { params?: unknown; query?: unknown; body?: unknown };
const body = (value: unknown): Input => ({ body: value });
const params = (value: unknown): Input => ({ params: value });
const fresh = (prefix: string) => `${prefix}-${randomUUID()}`;
const headers = (scope: Scope) => ({ 'content-type': 'application/json',
  ...(scope.groupId ? { 'x-group-id': scope.groupId } : {}),
  ...(scope.accountId ? { 'x-account-id': scope.accountId } : {}) });

async function dispatch<T>(page: Page, id: string, input: Input, scope: Scope = {}): Promise<T> {
  const response = await page.request.post('/api/v1/dispatch', { headers: headers(scope), data: { id, input } , timeout: 120000});
  expect(response.ok(), `${id} ${response.status()}: ${await response.text()}`).toBe(true);
  return (await response.json() as { data: T }).data;
}
function requestInput(request: Request): { id: string; input: Input } | null {
  if (!request.url().endsWith('/api/v1/dispatch') || request.method() !== 'POST') return null;
  return request.postDataJSON() as { id: string; input: Input };
}
async function clickDispatch(page: Page, id: string, action: () => Promise<unknown>) {
  const request = page.waitForRequest(request => requestInput(request)?.id === id);
  await action();
  return await request;
}
async function group(page: Page, name = fresh('中性账号组')) {
  const created = await dispatch<{ id: string; name: string; members: Array<{ accountId: string }> }>(
    page, ENDPOINTS.createAccountGroup.id, body({ name, idempotencyKey: fresh('group') }));
  // API夹具成功创建后发送既有列表失效协议；侧栏仍真实公共回读，不直接改组选中。
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('creatoros:accounts-changed', {
    detail: { source: 'external', routeRefreshScheduled: false },
  })));
  return created;
}
async function groupWithAccounts(page: Page) {
  const a = await group(page);
  const accounts = [] as Array<{ id: string; platform: string; accountHandle: string }>;
  for (const platform of ['douyin', 'douyin', 'xiaohongshu']) {
    const account = await dispatch<{ id: string; platform: string; accountHandle: string }>(page,
      'accounts.create', body({ platform, accountHandle: fresh('仅测试账号'), idempotencyKey: fresh('account') }));
    const preview = await dispatch<Record<string, unknown>>(page, 'accountGroups.members.previewTransfer',
      body({ accountId: account.id, toGroupId: a.id }));
    await dispatch(page, 'accountGroups.members.transfer', body({ ...preview, idempotencyKey: fresh('transfer') }));
    accounts.push(account);
  }
  return { ...a, accounts };
}
async function enterGroup(page: Page, groupId: string, baseURL: string) {
  await page.context().addCookies([{ name: 'creatoros_current_group', value: encodeURIComponent(groupId), url: baseURL }]);
  // 只引导首次页面；之后真实切组不得被reload的initScript恢复到旧组。
  await page.addInitScript(id => {
    if (!localStorage.getItem('creatoros:current-group')) localStorage.setItem('creatoros:current-group', id);
    localStorage.removeItem('creatoros:current-account');
  }, groupId);
}
async function switchGroup(page: Page, groupId: string) {
  await page.getByTestId('account-switcher-trigger').click();
  await page.getByTestId('account-switcher-menu').locator(`[data-group-id="${groupId}"]`).click();
  const confirm = page.getByTestId('account-switch-confirm-action');
  if (await confirm.isVisible()) await confirm.click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('creatoros:current-group'))).toBe(groupId);
}
async function projectAndOutput(page: Page, scope: Scope) {
  const project = await dispatch<{ id: string; groupId: string | null; accountId: string | null }>(page,
    'projects.create', body({ title: fresh('中性原生剪辑'), brief: '', contentType: 'video' }), scope);
  const output = await dispatch<{ id: string }>(page, 'projects.outputs.create', {
    params: { projectId: project.id }, body: { title: '原声核对', contentType: 'video', clientRequestId: fresh('output') },
  }, scope);
  return { project, output };
}
async function document(page: Page, outputId: string, scope: Scope) {
  return ENDPOINTS.getProductionEditor.response.parse(await dispatch(page, ENDPOINTS.getProductionEditor.id,
    params({ outputId }), scope));
}
function native(page: Page) { return page.locator('[data-native-root="opencut"]'); }
function workbench(page: Page) { return page.locator('section[aria-label="视频剪辑工作台"]'); }
async function openNative(page: Page, projectId: string, outputId: string) {
  await page.goto(`/projects/${projectId}/production?outputId=${outputId}`);
  await expect(native(page)).toHaveCount(1);
  await expect(native(page).locator('.native-workbench')).toBeVisible();
  await expect(workbench(page).getByRole('button', { name: '保存工程', exact: true })).toBeEnabled();
  await expect(native(page).locator('iframe')).toHaveCount(0);
}
async function renameNative(page: Page, name: string) {
  // OpenCut实际EditableProjectName，无虚构test handle或native context。
  const field = native(page).locator('header input[type="text"]');
  await field.click(); await field.fill(name); await field.press('Enter');
  await expect(workbench(page).getByText('有未保存修改', { exact: true })).toBeVisible();
}
async function saveNative(page: Page) {
  const request = await clickDispatch(page, ENDPOINTS.saveProductionEditor.id,
    () => workbench(page).getByRole('button', { name: '保存工程', exact: true }).click());
  await expect(workbench(page).getByText('剪辑工程已保存，刷新后可继续编辑。', { exact: true })).toBeVisible();
  return request;
}
async function upload(page: Page, projectId: string, scope: Scope, kind: keyof typeof MEDIA) {
  const fixture = MEDIA[kind], bytes = readFileSync(join(FIXTURE_ROOT, fixture.name));
  expect(bytes.length).toBe(fixture.bytes); expect(sha(bytes)).toBe(fixture.sha);
  const started = await dispatch<{ uploadId: string; uploadUrl: string }>(page, 'assets.uploads.create',
    body({ assetType: 'video', mimeType: 'video/mp4', fileSize: bytes.length, projectId, fileName: fixture.name }), scope);
  const put = await page.request.put(started.uploadUrl, { headers: { 'content-type': 'video/mp4' }, data: bytes , timeout: 120000});
  expect(put.ok(), await put.text()).toBe(true);
  const asset = await dispatch<{ id: string; currentFileId: string }>(page, 'assets.uploads.complete',
    { params: { uploadId: started.uploadId }, body: { name: fixture.name } }, scope);
  const exact = await dispatch<{ url: string; fileName: string }>(page, 'assets.fileDownloadUrl',
    params({ assetId: asset.id, assetFileId: asset.currentFileId }), scope);
  const downloaded = await page.request.get(exact.url, { timeout: 120000 });
  expect(downloaded.ok()).toBe(true); expect(sha(await downloaded.body())).toBe(fixture.sha);
  return { ...asset, name: fixture.name, nativeFileName: exact.fileName, sha: fixture.sha };
}
async function addToNative(page: Page, asset: { id: string; name: string; nativeFileName: string }) {
  await workbench(page).getByRole('button', { name: '从素材库选取', exact: true }).click();
  await workbench(page).getByLabel('剪辑素材', { exact: true }).selectOption(asset.id);
  await workbench(page).getByRole('button', { name: '加入编辑器', exact: true }).click();
  const card = native(page).getByRole('option').filter({ has: page.getByTitle(asset.nativeFileName, { exact: true }) });
  await expect(card).toHaveCount(1); await card.hover();
  // 实际MediaItem的PlusButton无aria-label，卡片内唯一button是加入时间轴。
  await expect(card.getByRole('button')).toHaveCount(1); await card.getByRole('button').click();
  await expect(workbench(page).getByText('有未保存修改', { exact: true })).toBeVisible();
}
async function confirmedDispatchResponse(request: Request, id: string): Promise<unknown> {
  // waitForRequest只证明已发送；预约response确认后才读取同一原requestId。
  const response = await request.response();
  expect(response, `${id} 原请求未返回response`).not.toBeNull();
  expect(response!.status(), `${id}: ${await response!.text()}`).toBe(200);
  return (await response!.json() as { data: unknown }).data;
}
async function pollWithButton(page: Page, button: Locator, read: () => Promise<{ status: string }>, wanted: string) {
  await expect.poll(async () => {
    await expect(button).toBeEnabled(); await button.click();
    const value = await read();
    expect(['failed', 'cancelled', 'unknown_result', 'waiting_user']).not.toContain(value.status);
    return value.status;
  }, { timeout: 480_000, intervals: [1000, 2000, 5000] }).toBe(wanted);
}
async function registerSourceAndTranscribe(page: Page, outputId: string, scope: Scope, expectedGranularity: 'word' | 'text' = 'word') {
  await workbench(page).getByRole('button', { name: 'AI 辅助粗剪', exact: true }).click();
  await page.getByText('转写原片 · 选择视频', { exact: true }).click();
  const prepared = await clickDispatch(page, ENDPOINTS.prepareProductionEditorSource.id,
    () => page.getByRole('button', { name: '准备转写', exact: true }).click());
  const sourceBody = ENDPOINTS.prepareProductionEditorSource.body!.parse(requestInput(prepared)!.input.body);
  const sourceReceipt = ENDPOINTS.prepareProductionEditorSource.response.parse(
    await confirmedDispatchResponse(prepared, ENDPOINTS.prepareProductionEditorSource.id));
  expect(sourceReceipt).toMatchObject({ requestId: sourceBody.requestId,
    assetId: sourceBody.assetId, assetFileId: sourceBody.assetFileId });
  await pollWithButton(page, page.getByRole('button', { name: '读取原请求状态', exact: true }),
    () => dispatch<{ status: string }>(page, ENDPOINTS.getProductionEditorSource.id,
      params({ outputId, requestId: sourceBody.requestId }), scope), 'succeeded');
  await page.getByRole('button', { name: '使用这段原片转写', exact: true }).click();
  await expect(page.getByRole('button', { name: '已准备好转写', exact: true })).toBeVisible();
  await page.getByText('原片转写与逐字稿', { exact: true }).click();
  await page.getByLabel('转写精度', { exact: true }).selectOption('word');
  const created = await clickDispatch(page, ENDPOINTS.createProductionEditorTranscript.id,
    () => page.getByRole('button', { name: '转写这段原片', exact: true }).click());
  const original = ENDPOINTS.createProductionEditorTranscript.body!.parse(requestInput(created)!.input.body);
  const transcriptReceipt = ENDPOINTS.createProductionEditorTranscript.response.parse(
    await confirmedDispatchResponse(created, ENDPOINTS.createProductionEditorTranscript.id));
  expect(transcriptReceipt).toMatchObject({ requestId: original.requestId, sourceId: original.sourceId });
  await pollWithButton(page, page.getByRole('button', { name: '读取原转写状态', exact: true }),
    () => dispatch<{ status: string }>(page, ENDPOINTS.getProductionEditorTranscript.id,
      params({ outputId, requestId: original.requestId }), scope), 'succeeded');
  const actual = ENDPOINTS.getProductionEditorTranscript.response.parse(await dispatch(page,
    ENDPOINTS.getProductionEditorTranscript.id, params({ outputId, requestId: original.requestId }), scope));
  expect(original.granularity).toBe('word'); // 两族均真实请求词级，偏移族不得改请求掩盖降级。
  expect(actual.transcript?.granularity).toBe(expectedGranularity);
  if (expectedGranularity === 'word') {
    if (!actual.transcript || actual.transcript.granularity === 'text') throw Error('默认真实ASR缺词级映射，不能用伪时码补gap');
    expect(actual.transcript.tokens.length).toBeGreaterThan(1);
  } else {
    expect(actual.transcript?.text.trim().length).toBeGreaterThan(0);
    expect(actual.transcript).not.toHaveProperty('tokens');
    await expect(page.getByText('该结果仅有全文，没有词句时间码；请在时间轴按原片时间手工剪辑。', { exact: true })).toBeVisible();
  }
  const adopted = await clickDispatch(page, ENDPOINTS.adoptProductionEditorTranscript.id,
    () => page.getByRole('button', { name: '采纳转写并保存版本', exact: true }).click());
  const adoption = ENDPOINTS.adoptProductionEditorTranscript.body!.parse(requestInput(adopted)!.input.body);
  expect(adoption.transcriptRequestId).toBe(original.requestId);
  ENDPOINTS.adoptProductionEditorTranscript.response.parse(
    await confirmedDispatchResponse(adopted, ENDPOINTS.adoptProductionEditorTranscript.id));
  await expect(page.getByRole('button', { name: '已保存这份转写', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '读取时间轴选区', exact: true }).click();
  return { original, actual };
}

// SEMANTIC_BOUNDARY_ALLOW: 以下仅将本次真实modelContext中的身份机械映射为固定协议夹具；
// 不承担语义删留，不能作为“模型认为停顿该删”的验收证据，不返回ASR/原生context。
function frozenJsonPrefix(text: string): unknown {
  // 原structured-node在prompt后附加JSON Schema；只读取完整首个真实JSON对象。
  const start = text.indexOf('{'); if (start < 0) throw Error('冻结JSON缺失');
  let depth = 0, quoted = false, escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true; else if (char === '{') depth++; else if (char === '}' && --depth === 0) return JSON.parse(text.slice(start, index + 1));
  }
  throw Error('冻结JSON不完整');
}
async function roughProvider() {
  const calls: Array<{ path: string; input: unknown; output: unknown }> = [], errors: string[] = [];
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'POST' || request.url !== '/v1/chat/completions') throw Error('禁止夹具服务的未知端口');
      const chunks = [] as Buffer[];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { messages: Array<{ content: unknown }> };
      const texts = input.messages.flatMap(message => typeof message.content === 'string' ? [message.content] :
        Array.isArray(message.content) ? message.content.flatMap(part => typeof part.text === 'string' ? [part.text] : []) : []);
      const prompt = texts.findLast(text => text.includes('【冻结真实上下文】'));
      if (!prompt) throw Error('未读到原Skill冻结上下文');
      const frozen = frozenJsonPrefix(prompt.slice(prompt.lastIndexOf('【冻结真实上下文】') + '【冻结真实上下文】'.length)) as {
        roughProtocolVersion: number; pauseGaps: Array<{ gapId: string; clipId: string; transcriptId: string;
          sourceStartTicks: number; sourceEndTicks: number; sourceTimebase: { num: number; den: number } }> };
      if (frozen.roughProtocolVersion !== 3 || !frozen.pauseGaps?.length) throw Error('真实默认ASR上下文没有gap，不造gap');
      const output = { summary: '本机协议夹具建议：逐项完整试听并手动核对，未听审不得采用。',
        suggestions: [...frozen.pauseGaps].sort((a, b) => (b.sourceEndTicks - b.sourceStartTicks) * b.sourceTimebase.num / b.sourceTimebase.den - (a.sourceEndTicks - a.sourceStartTicks) * a.sourceTimebase.num / a.sourceTimebase.den).map((gap, index) => ({ suggestionId: `fixture-gap-${index + 1}`,
          decision: 'review', target: { kind: 'pause_gap', clipId: gap.clipId, transcriptId: gap.transcriptId,
            gapId: gap.gapId, retainedTicks: 0 }, reason: '仅用于检验真实原声与明确采用流程。',
          uncertainty: '呼吸、语气和未识别声音需要用户亲自核对；本夹具没有听过音频。' })) };
      calls.push({ path: request.url, input, output });
      const base = { id: fresh('t1062-loopback'), object: 'chat.completion.chunk', created: 1, model: 't1062-rough-protocol-fixture' };
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: JSON.stringify(output) }, finish_reason: null }] })}\n\n` +
        `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n` + 'data: [DONE]\n\n');
    } catch (error) { errors.push(String(error)); response.writeHead(422); response.end('隔离协议夹具拒绝无真实上下文的请求'); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('loopback监听失败');
  return { calls, errors, baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())) };
}
async function makeRough(page: Page, outputId: string, scope: Scope) {
  const summary = page.getByText('AI 粗剪建议与逐条采用', { exact: true });
  await expect(summary).toBeVisible({ timeout: 120_000 });
  if (await summary.locator('..').getAttribute('open') === null) await summary.click();
  const choices = page.getByRole('checkbox', { name: /^选择片段 / });
  await expect(choices.first()).toBeVisible({ timeout: 120_000 });
  await expect(choices.first()).toBeEnabled({ timeout: 120_000 });
  expect(await choices.count()).toBeGreaterThan(0); await choices.first().check();
  await page.getByLabel('粗剪要求', { exact: true }).fill('本地管线验收：保留内容，只提交需逐项原声核对的停顿建议，不自动采用。');
  const started = await clickDispatch(page, ENDPOINTS.createProductionRoughCut.id,
    () => page.getByRole('button', { name: '生成粗剪建议', exact: true }).click());
  const original = ENDPOINTS.createProductionRoughCut.body!.parse(requestInput(started)!.input.body);
  expect(original.protocolVersion).toBe(3);
  await pollWithButton(page, page.getByRole('button', { name: '读取原粗剪建议', exact: true }),
    () => dispatch<{ status: string }>(page, ENDPOINTS.getProductionRoughCut.id,
      params({ outputId, requestId: original.requestId }), scope), 'succeeded');
  const candidate = ENDPOINTS.getProductionRoughCut.response.parse(await dispatch(page,
    ENDPOINTS.getProductionRoughCut.id, params({ outputId, requestId: original.requestId }), scope));
  expect(candidate.pauseGaps?.length).toBeGreaterThan(0);
  return { original, candidate };
}
async function recordAudio(page: Page) {
  await page.addInitScript(() => {
    const events: Array<Record<string, unknown>> = [];
    Object.defineProperty(window, '__t1062AudioEvents', { value: events });
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (...args) {
      const source = original.apply(this, args), context = this;
      const start = source.start.bind(source), stop = source.stop.bind(source);
      let stopped = false, at = 0, duration = 0;
      source.start = (when = 0, offset = 0, requestedDuration?: number) => {
        at = when; duration = requestedDuration ?? Math.max(0, (source.buffer?.duration ?? 0) - offset);
        events.push({ kind: 'start', at, duration, currentTime: context.currentTime,
          state: context.state, sampleRate: source.buffer?.sampleRate, samples: source.buffer?.length,
          playbackRate: source.playbackRate.value, loop: source.loop });
        return start(when, offset, requestedDuration);
      };
      source.stop = (...values) => { stopped = true; events.push({ kind: 'stop' }); return stop(...values); };
      source.addEventListener('ended', () => events.push({ kind: 'ended', stopped, at, duration,
        currentTime: context.currentTime, state: context.state, sampleRate: source.buffer?.sampleRate }));
      return source;
    };
  });
}
async function audioEvents(page: Page) {
  return page.evaluate(() => (window as unknown as { __t1062AudioEvents: Array<Record<string, unknown>> }).__t1062AudioEvents);
}
function gapArticle(page: Page, candidate: ProductionRoughCutRequest, index = 0) {
  const row = candidate.suggestions[index];
  if (!row || row.target.kind !== 'pause_gap') throw Error('缺真实gap建议');
  return page.locator('article').filter({ has: page.getByRole('checkbox', { name: `采用建议 ${index + 1}`, exact: true }) });
}
async function completeGap(page: Page, article: Locator, expectedDuration: number) {
  const before = (await audioEvents(page)).length;
  await article.getByRole('button', { name: '完整试听此项原声', exact: true }).click();
  const acknowledgement = article.getByRole('checkbox', { name: '我已听完原声，并核对这次保留和删除的范围', exact: true });
  await expect(acknowledgement).toHaveCount(0);
  await expect(acknowledgement).toBeVisible({ timeout: Math.max((Math.ceil(expectedDuration * 1000) + 30_000), 120000) });
  await expect(acknowledgement).not.toBeChecked();
  const events = (await audioEvents(page)).slice(before);
  const starts = events.filter(event => event.kind === 'start'); expect(starts.length).toBeGreaterThan(0);
  expect(starts.every(event => event.playbackRate === 1 && event.loop === false && event.state === 'running')).toBe(true);
  const actualDuration = starts.reduce((total, event) => total + Number(event.duration), 0);
  expect(Math.abs(actualDuration - expectedDuration)).toBeLessThanOrEqual(1 / Number(starts[0].sampleRate));
  const ends = events.filter(event => event.kind === 'ended' && event.stopped === false);
  expect(ends).toHaveLength(starts.length);
  expect(ends.every(event => event.state === 'running' && Number(event.currentTime) + 1 / Number(event.sampleRate) >= Number(event.at) + Number(event.duration))).toBe(true);
  await acknowledgement.check();
}

function assertFixture() {
  const manifestBytes = readFileSync(join(FIXTURE_ROOT, 'manifest.json'));
  expect(sha(manifestBytes)).toBe(FIXTURE_MANIFEST_SHA);
  for (const file of Object.values(MEDIA)) {
    const bytes = readFileSync(join(FIXTURE_ROOT, file.name)); expect(bytes.length).toBe(file.bytes); expect(sha(bytes)).toBe(file.sha);
  }
}
function assertPrivateRuntime() {
  const root = process.env.CREATOROS_PLAYWRIGHT_DATA_ROOT;
  if (!root) throw Error('须使用原playwright.config的fresh隔离数据根');
  const realRoot = realpathSync(root), realTmp = realpathSync(tmpdir());
  if (relative(realTmp, realRoot).startsWith('..') || !basename(realRoot).startsWith('creatoros-playwright-')) throw Error('禁止真实数据根');
  // runner交付offline ASR/network约束后才可运行音频case；本文件不下载/安装模型。
  const admission = process.env.CREATOROS_T1062_E2E_LOCAL_ASR_ADMISSION;
  if (!admission) return;
  const admissionBytes = readFileSync(admission);
  if (sha(admissionBytes) !== process.env.CREATOROS_T1062_E2E_LOCAL_ASR_ADMISSION_SHA256) throw Error('离线worker准入字节未冻结');
  const proof = JSON.parse(admissionBytes.toString('utf8')) as { dataRoot: string; backendCommit: string; workerNetworkPolicy: string; cacheDir: string; files: Array<{ path: string; bytes: number; sha256: string }> };
  if (realpathSync(proof.dataRoot) !== realRoot || proof.backendCommit !== 'b1cd073b8a813dda2dfd4233a3855dffc43a00b3' || proof.workerNetworkPolicy !== 'deny_non_loopback') throw Error('离线worker准入不匹配当前隔离根/后端');
  if (!proof.files.length || realpathSync(proof.cacheDir) !== realpathSync(process.env.CREATOROS_WHISPER_CACHE_DIR ?? '')) throw Error('没有已绑定本地Whisper缓存');
  for (const file of proof.files) { const path = realpathSync(join(proof.cacheDir, file.path));
    if (relative(realpathSync(proof.cacheDir), path).startsWith('..')) throw Error('缓存清单越界');
    expect(statSync(path).size).toBe(file.bytes); expect(sha(readFileSync(path))).toBe(file.sha256); }
}
function requireLocalAsrAdmission() {
  if (!process.env.CREATOROS_T1062_E2E_LOCAL_ASR_ADMISSION) throw Error('音频旅程待ROOT绑定真实离线worker/network/cache准入，禁止云端/下载/fake ASR');
}
async function evidence(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: true , timeout: 120000});
}

test.describe('T1062 账号组真实原生粗剪', () => {
  test.describe.configure({ retries: 0 });
  test.use({ viewport: { width: 1366, height: 900 }, colorScheme: 'light' });
  test.beforeEach(async ({ page, baseURL }) => {
    expect(new URL(baseURL!).hostname).toBe('127.0.0.1'); assertPrivateRuntime(); assertFixture();
    const dataRoot = process.env.CREATOROS_PLAYWRIGHT_DATA_ROOT!;
    await dispatch(page, 'settings.storage.put', body({ backend: 'local', rootPath: join(dataRoot, 't1062-neutral-media') }));
  });

  test('纯组无平台账号仍可通过真实创建弹层创建项目、保存画布和打开原生剪辑', async ({ page, baseURL }, testInfo) => {
    const a = await group(page); expect(a.members).toEqual([]); await enterGroup(page, a.id, baseURL!);
    await page.goto('/projects'); await page.getByRole('link', { name: /新建项目/ }).first().click();
    await expect(page.getByRole('dialog', { name: '新建项目' })).toBeVisible();
    await page.getByLabel('作品主题').fill('纯组中性作品');
    const created = await clickDispatch(page, 'projects.create', () => page.getByRole('button', { name: '创建', exact: true }).click());
    expect(created.headers()['x-group-id']).toBe(a.id); expect(created.headers()['x-account-id']).toBeUndefined();
    // 请求发出时弹层仍可能停在 /projects/new；必须由真实成功回执绑定精确导航目标。
    const createdResponse = await created.response(); expect(createdResponse).not.toBeNull();
    expect(createdResponse!.ok(), await createdResponse!.text()).toBe(true);
    const { data: createdProject } = await createdResponse!.json() as { data: { id: string } };
    expect(typeof createdProject.id).toBe('string'); expect(createdProject.id.length).toBeGreaterThan(0);
    const projectId = createdProject.id;
    await expect(page).toHaveURL(url => url.pathname === `/projects/${projectId}` && !url.search);
    // 既有项目公开DTO不含group/account字段：用合法回读与错误组拒绝证明真实归属。
    const owned = await dispatch<{ id: string; title: string }>(page, 'projects.get', params({ projectId }), { groupId: a.id });
    expect(owned.id).toBe(projectId); expect(owned.title).toBe('纯组中性作品');
    const foreignGroup = await group(page);
    const foreignRead = await page.request.post('/api/v1/dispatch', { headers: headers({ groupId: foreignGroup.id }),
      data: { id: 'projects.get', input: params({ projectId }) } , timeout: 120000});
    expect(foreignRead.status()).toBe(404);
    expect((await foreignRead.json() as { error: { code: string } }).error.code).toBe('OwnershipError');
    await page.goto('/canvases?tab=canvases'); await page.getByRole('button', { name: '新建画布', exact: true }).click();
    await page.getByRole('textbox', { name: '画布标题' }).fill('纯组画布'); await page.getByRole('button', { name: '＋ 文字', exact: true }).click();
    await page.getByRole('button', { name: '保存', exact: true }).click(); await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByRole('textbox', { name: '画布标题' })).toHaveValue('纯组画布');
    const outputs = await dispatch<Array<{ id: string; contentType: string }>>(page, 'projects.outputs.list', params({ projectId }), { groupId: a.id });
    const output = outputs.find(value => value.contentType === 'video'); expect(output).toBeDefined();
    await openNative(page, projectId, output!.id); await renameNative(page, '纯组原生工程'); await saveNative(page);
    await page.reload(); await expect(native(page).locator('header input[type="text"]')).toHaveValue('纯组原生工程');
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(native(page).locator('.native-workbench')).toBeVisible();
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await evidence(page, testInfo, 'pure-group-native-1024.png');
  });

  test('同组多个账号/平台筛选保留dirty和真实native实例，公共保存始终冻结组根', async ({ page, context, baseURL }, testInfo) => {
    const a = await groupWithAccounts(page), scope = { groupId: a.id }; const { project, output } = await projectAndOutput(page, scope);
    await enterGroup(page, a.id, baseURL!); await openNative(page, project.id, output.id); await renameNative(page, '保持未保存原生稿');
    const instance = await native(page).locator('.native-workbench').elementHandle(); expect(instance).not.toBeNull();
    const filters = await context.newPage(); await filters.goto('/overview');
    await filters.getByRole('group', { name: '平台筛选', exact: true }).getByRole('button', { name: '抖音', exact: true }).click();
    await expect(filters).toHaveURL(/platform=douyin/);
    await filters.getByLabel('平台账号', { exact: true }).click();
    await expect(filters.getByRole('option').filter({ hasText: '仅测试账号' })).toHaveCount(2);
    await filters.getByRole('option').filter({ hasText: a.accounts[1].accountHandle }).click();
    await filters.getByRole('group', { name: '平台筛选', exact: true }).getByRole('button', { name: '小红书', exact: true }).click();
    await expect(filters).toHaveURL(/platform=xiaohongshu/); await filters.close();
    // 平台筛选实际URL仅属数据页；另核同组账号选择的真实storage订阅协议，不伪装为页面控件。
    await page.evaluate(id => { localStorage.setItem('creatoros:current-account', id); window.dispatchEvent(new CustomEvent('creatoros:accounts-changed')); }, a.accounts[2].id);
    await expect(workbench(page).getByText('有未保存修改', { exact: true })).toBeVisible();
    expect(await native(page).locator('.native-workbench').evaluate((node, original) => node === original, instance!)).toBe(true);
    await expect(native(page).locator('header input[type="text"]')).toHaveValue('保持未保存原生稿');
    const saved = await saveNative(page); expect(saved.headers()['x-group-id']).toBe(a.id); expect(saved.headers()['x-account-id']).toBeUndefined();
    await page.reload(); await expect(native(page).locator('header input[type="text"]')).toHaveValue('保持未保存原生稿');
    await evidence(page, testInfo, 'group-filter-native-stable.png');
  });

  test('跨组时取消真实在途素材响应，旧组晚到结果不能回写或继续保存', async ({ page, baseURL }, testInfo) => {
    const a = await group(page), b = await group(page), scope = { groupId: a.id };
    const { project, output } = await projectAndOutput(page, scope); const asset = await upload(page, project.id, scope, 'normal');
    await enterGroup(page, a.id, baseURL!); await openNative(page, project.id, output.id);
    const before = await document(page, output.id, scope);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), arrived = new Promise<void>(resolve => { entered = resolve; });
    let intercepted = false;
    await page.route('**/api/v1/dispatch', async route => {
      if (!intercepted && requestInput(route.request())?.id === 'assets.list') {
        intercepted = true; const actual = await route.fetch({ timeout: 120000 }); entered(); await gate;
        // 只延迟真实公共服务响应。取消后的route已经关闭是预期，绝不造成功body。
        try { await route.fulfill({ response: actual }); } catch (error) { if (!/closed|aborted|canceled|disposed|finished/i.test(String(error))) throw error; }
      } else await route.fallback();
    });
    const cancelled = page.waitForEvent('requestfailed', { predicate: request => requestInput(request)?.id === 'assets.list' });
    await workbench(page).getByRole('button', { name: '从素材库选取', exact: true }).click(); await arrived;
    try { await switchGroup(page, b.id); await cancelled; } finally { release(); }
    await expect(native(page)).toHaveCount(0); await expect(page.getByLabel('剪辑素材', { exact: true })).toHaveCount(0);
    await expect(page.getByText(asset.name, { exact: true })).toHaveCount(0);
    expect((await document(page, output.id, scope)).revision).toBe(before.revision);
    const foreign = await page.request.post('/api/v1/dispatch', { headers: headers({ groupId: b.id }),
      data: { id: ENDPOINTS.getProductionEditor.id, input: params({ outputId: output.id }) } , timeout: 120000});
    expect(foreign.ok()).toBe(false); await evidence(page, testInfo, 'cross-group-late-read.png');
  });

  test('真实迁组历史画布保留account出处，group归属可读写；错误组读回明确结束loading', async ({ page, baseURL }, testInfo) => {
    const account = await dispatch<{ id: string }>(page, 'accounts.create', body({ platform: 'douyin', accountHandle: fresh('历史画布账号') }));
    // 从公开成员事实取得此真实账号的唯一来源组，不推算legacy组ID或选择首账号。
    const groups = await dispatch<Array<{ id: string; status: string; members: Array<{ accountId: string; leftAt: string | null }> }>>(page,
      'accountGroups.list', { query: { page: 1, pageSize: 100 } });
    const sources = groups.filter(value => value.status === 'active' && value.members.some(member => member.accountId === account.id && member.leftAt === null));
    expect(sources).toHaveLength(1);
    const source = await dispatch<{ id: string; members: Array<{ accountId: string; leftAt: string | null }> }>(page,
      'accountGroups.get', params({ groupId: sources[0]!.id }));
    expect(source.members.filter(member => member.accountId === account.id && member.leftAt === null)).toHaveLength(1);
    const sourceScope = { groupId: source.id, accountId: account.id };
    const { project } = await projectAndOutput(page, sourceScope);
    // legacy调用合法保留account出处和null group；迁移的真实父项目已属于公开确认的来源组。
    const historical = await dispatch<{ id: string; revision: number; groupId: string | null; accountId: string }>(page,
      'canvas.create', body({ title: '保留账号出处的历史画布', projectId: project.id }), { accountId: account.id });
    expect(historical.accountId).toBe(account.id); expect(historical.groupId).toBeNull();
    const target = await group(page), selection = { fromGroupId: source.id, toGroupId: target.id,
      projectIds: [project.id], knowledgeIds: [], conversationIds: [] };
    const preview = await dispatch<{ digest: string; projects: Array<{ id: string }>; counts: Record<string, number>; requiredProjectIds: string[] }>(page,
      'accountGroups.migration.preview', body(selection), sourceScope);
    // requiredProjectIds是待补选的依赖；完整选中父项目必须在projects且没有待补选项。
    expect(preview.projects.map(value => value.id)).toContain(project.id);
    expect(preview.requiredProjectIds).toEqual([]); expect(preview.counts.creative_canvases).toBe(1);
    await dispatch(page, 'accountGroups.migration.apply', body({ ...selection, digest: preview.digest, idempotencyKey: fresh('migration') }), sourceScope);
    const moved = await dispatch<{ id: string; groupId: string; accountId: string; revision: number }>(page, 'canvas.get', params({ canvasId: historical.id }), { groupId: target.id });
    expect(moved.groupId).toBe(target.id); expect(moved.accountId).toBe(account.id);
    await enterGroup(page, target.id, baseURL!); await page.goto(`/canvases/${historical.id}`);
    await expect(page.getByRole('textbox', { name: '画布标题' })).toHaveValue('保留账号出处的历史画布');
    await page.getByRole('button', { name: '＋ 文字', exact: true }).click();
    await page.getByRole('button', { name: '保存', exact: true }).click(); await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByTestId('canvas-node')).toHaveCount(1);
    const saved = await dispatch<{ revision: number; accountId: string }>(page, 'canvas.get', params({ canvasId: historical.id }), { groupId: target.id });
    expect(saved.accountId).toBe(account.id); expect(saved.revision).toBeGreaterThan(moved.revision);
    const wrong = await group(page); await switchGroup(page, wrong.id); await page.goto(`/canvases/${historical.id}`);
    await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByText('正在读取画布…', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: '画布标题' })).toHaveCount(0); await evidence(page, testInfo, 'historical-canvas-group-owner.png');
  });

  for (const kind of ['normal', 'offset'] as const) test(`真实默认ASR与原生原声：${kind === 'normal' ? '普通AAC完整自然播放、单独核对、明确采用与保存刷新' : '非零视频起点仅此项手工降级，原工程仍可保存'}`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(Math.max((600_000), 672660000)); requireLocalAsrAdmission();
    const provider = await roughProvider();
    try {
      const a = await group(page), scope = { groupId: a.id }, { project, output } = await projectAndOutput(page, scope);
      const models = await dispatch<Array<{ capability: string }>>(page, 'settings.models.list', {});
      expect(models.some(model => model.capability === 'transcribe.audio')).toBe(false); // 原defaultWhisper，不回假ASR
      await dispatch(page, 'settings.models.put', { params: { capability: 'script.draft' }, body: {
        provider: 'openai-compatible', modelName: 't1062-rough-protocol-fixture', baseUrl: provider.baseUrl,
        apiFormat: 'openai_chat', settings: { structuredOutputs: true }, secret: 'local-t1062-fixture-only', isDefault: false,
      } });
      const asset = await upload(page, project.id, scope, kind); await enterGroup(page, a.id, baseURL!); await recordAudio(page);
      await openNative(page, project.id, output.id); await addToNative(page, asset); await saveNative(page);
      const roughRequests: string[] = [];
      const observeRough = (request: Request) => {
        const id = requestInput(request)?.id;
        if (id === ENDPOINTS.createProductionRoughCut.id || id === ENDPOINTS.adoptProductionRoughCut.id) roughRequests.push(id);
      };
      page.on('request', observeRough);
      const source = await registerSourceAndTranscribe(page, output.id, scope, kind === 'offset' ? 'text' : 'word');
      if (kind === 'offset') {
        const textSaved = await document(page, output.id, scope), view = projectProductionRoughPlan(textSaved.plan)!;
        const originalSource = view.mainTrack.sources.find(row => row.sourceId === source.original.sourceId);
        expect(originalSource).toMatchObject({ assetId: asset.id, assetFileId: asset.currentFileId, fileDigest: asset.sha });
        expect(view.sourceTranscripts.find(row => row.transcriptId === source.actual.transcript!.transcriptId)).toEqual(source.actual.transcript);
        expect(source.actual.transcript).toMatchObject({ sourceId: source.original.sourceId, assetFileId: asset.currentFileId, granularity: 'text' });
        expect(source.actual.transcript).not.toHaveProperty('tokens');
        expect(source.actual.transcript!.audioDigest).toMatch(/^[a-f0-9]{64}$/);
        const referenceBefore = productionReferencePlan.parse(textSaved.plan);
        await renameNative(page, '非零起点手工保留');
        const manualSave = await saveNative(page);
        const saveCommand = ENDPOINTS.saveProductionEditor.body!.parse(requestInput(manualSave)!.input.body);
        expect(saveCommand.expectedRevision).toBe(textSaved.revision);
        ENDPOINTS.saveProductionEditor.response.parse(
          await confirmedDispatchResponse(manualSave, ENDPOINTS.saveProductionEditor.id));
        const manuallySaved = await document(page, output.id, scope);
        expect(manuallySaved.revision).toBeGreaterThan(textSaved.revision);
        const referenceAfter = productionReferencePlan.parse(manuallySaved.plan);
        expect(referenceAfter.referenceEditor.mediaRefs).toEqual(referenceBefore.referenceEditor.mediaRefs);
        expect(referenceAfter.nativeSources).toEqual(referenceBefore.nativeSources);
        expect(referenceAfter.sourceTranscripts).toEqual(referenceBefore.sourceTranscripts);
        await page.reload(); await expect(native(page).locator('.native-workbench')).toBeVisible();
        await expect(native(page).locator('header input[type="text"]')).toHaveValue('非零起点手工保留');
        const reloaded = await document(page, output.id, scope);
        expect(reloaded.revision).toBe(manuallySaved.revision); expect(reloaded.plan).toEqual(manuallySaved.plan);
        const exact = await dispatch<{ url: string }>(page, 'assets.fileDownloadUrl', params({ assetId: asset.id, assetFileId: asset.currentFileId }), scope);
        const originalFile = await page.request.get(exact.url, { timeout: 120000 }); expect(originalFile.ok()).toBe(true);
        expect(sha(await originalFile.body())).toBe(asset.sha);
        expect(roughRequests).toEqual([]); expect(provider.calls).toEqual([]); expect(provider.errors).toEqual([]);
        expect((await audioEvents(page)).filter(event => event.kind === 'start')).toHaveLength(0);
        page.off('request', observeRough);
        await testInfo.attach('偏移原片全文与手工保存回读', { body: Buffer.from(JSON.stringify({ source, textSaved, manuallySaved, reloaded,
          roughRequests, providerCalls: provider.calls.length, caveat: '真实全文降级与手工保存，不产生词级时间码、粗剪候选或自动采用，不代签听感' }, null, 2)), contentType: 'application/json' });
        await evidence(page, testInfo, `${kind}-native-audio-workflow.png`);
        return;
      }
      page.off('request', observeRough);
      const { original, candidate } = await makeRough(page, output.id, scope);
      expect(provider.errors).toEqual([]); expect(provider.calls).toHaveLength(1);
      const savedBefore = await document(page, output.id, scope), view = projectProductionRoughPlan(savedBefore.plan)!;
      expect(view.mainTrack.sources.some(row => row.assetFileId === asset.currentFileId && row.fileDigest === asset.sha)).toBe(true);
      const article = gapArticle(page, candidate), item = candidate.suggestions[0];
      if (item.target.kind !== 'pause_gap') throw Error('没有真实gap目标');
      const target = item.target;
      const gap = candidate.pauseGaps!.find(gap => gap.gapId === target.gapId)!;
      const duration = (gap.sourceEndTicks - gap.sourceStartTicks) * gap.sourceTimebase.num / gap.sourceTimebase.den;
      const use = article.getByRole('checkbox', { name: '采用建议 1', exact: true }); await expect(use).toBeDisabled();
      {
        expect(duration, '真实转写须保留中性夹具的可操作长停顿；没有就失败，不造时码').toBeGreaterThan(0.25);
        // stop不得解锁；“一直dirty=true”的第二次改动也必须清除旧确认。
        await article.getByRole('button', { name: '完整试听此项原声', exact: true }).click();
        await expect(article.getByRole('button', { name: '停止试听', exact: true })).toBeEnabled();
        await article.getByRole('button', { name: '停止试听', exact: true }).click();
        await expect(article.getByRole('checkbox', { name: '我已听完原声，并核对这次保留和删除的范围', exact: true })).toHaveCount(0);
        await expect(use).toBeDisabled(); await completeGap(page, article, duration); await expect(use).toBeEnabled();
        await renameNative(page, '第一次未保存改动');
        await expect(article.getByRole('checkbox', { name: '我已听完原声，并核对这次保留和删除的范围', exact: true })).toHaveCount(0);
        await expect(use).toBeDisabled(); await renameNative(page, '第二次未保存改动');
        await expect(use).toBeDisabled(); await saveNative(page);
        await page.getByRole('button', { name: '读取时间轴选区', exact: true }).click();
        // 真实revision已变，重新生成同原片建议，不能重发旧confirmed/body。
        await page.getByRole('button', { name: '明确另建一份粗剪建议', exact: true }).click();
        const freshRough = await makeRough(page, output.id, scope); const freshArticle = gapArticle(page, freshRough.candidate);
        const freshTarget = freshRough.candidate.suggestions[0].target;
        if (freshTarget.kind !== 'pause_gap') throw Error('新上下文缺真实gap');
        const actualGap = freshRough.candidate.pauseGaps!.find(gap => gap.gapId === freshTarget.gapId)!;
        await completeGap(page, freshArticle, (actualGap.sourceEndTicks - actualGap.sourceStartTicks) * actualGap.sourceTimebase.num / actualGap.sourceTimebase.den);
        await freshArticle.getByRole('button', { name: '定位建议 1 对应片段', exact: true }).click();
        await expect(freshArticle.getByRole('checkbox', { name: '我已听完原声，并核对这次保留和删除的范围', exact: true })).toHaveCount(0);
        await expect(freshArticle.getByRole('checkbox', { name: '采用建议 1', exact: true })).toBeDisabled();
        await page.getByRole('button', { name: '读取时间轴选区', exact: true }).click();
        await completeGap(page, freshArticle, (actualGap.sourceEndTicks - actualGap.sourceStartTicks) * actualGap.sourceTimebase.num / actualGap.sourceTimebase.den);
        await freshArticle.getByRole('checkbox', { name: '采用建议 1', exact: true }).check();
        await page.getByRole('checkbox', { name: '确认本次剪辑影响', exact: true }).check();
        const beforeAdopt = await document(page, output.id, scope);
        const adopted = await clickDispatch(page, ENDPOINTS.adoptProductionRoughCut.id,
          () => page.getByRole('button', { name: '采用所选建议并保存', exact: true }).click());
        const command = ENDPOINTS.adoptProductionRoughCut.body!.parse(requestInput(adopted)!.input.body);
        expect(command.candidateRequestId).toBe(freshRough.original.requestId); expect(command.requestId).not.toBe(original.requestId);
        expect(command.pauseGapConfirmation).toEqual({ acknowledgement: 'reviewed_audio_and_ranges', entries: [{ suggestionId: freshRough.candidate.suggestions[0].suggestionId, gapDigest: actualGap.gapDigest }] });
        await expect(workbench(page).getByRole('status').filter({ hasText: '已采用到当前时间轴' })).toBeVisible();
        const afterAdopt = await document(page, output.id, scope); expect(afterAdopt.revision).toBeGreaterThan(beforeAdopt.revision);
        expect(productionReferencePlan.parse(afterAdopt.plan).referenceEditor.mediaRefs).toEqual(productionReferencePlan.parse(beforeAdopt.plan).referenceEditor.mediaRefs);
        await page.reload(); await expect(native(page).locator('.native-workbench')).toBeVisible();
        const afterReload = await document(page, output.id, scope); expect(afterReload.revision).toBe(afterAdopt.revision); expect(afterReload.plan).toEqual(afterAdopt.plan);
        const exact = await dispatch<{ url: string }>(page, 'assets.fileDownloadUrl', params({ assetId: asset.id, assetFileId: asset.currentFileId }), scope);
        expect(sha(await (await page.request.get(exact.url, { timeout: 120000 })).body())).toBe(asset.sha);
      }
      await testInfo.attach('原公开转写与候选', { body: Buffer.from(JSON.stringify({ source, candidate, providerCalls: provider.calls.length,
        caveat: '真实默认ASR管线与自动自然播放流程；loopback建议不是语义评审，未代签用户听感' }, null, 2)), contentType: 'application/json' });
      await evidence(page, testInfo, `${kind}-native-audio-workflow.png`);
    } finally { await provider.close(); }
  });
});


async function saveInitializedArticle(page: Page, article: Locator, outputId: string, groupId: string, title: string) {
  type NetworkResponse = NonNullable<Awaited<ReturnType<Request['response']>>>;
  const reads: NetworkResponse[] = [];
  const readVersionId = (response: NetworkResponse) => {
    const request = requestInput(response.request());
    const input = request?.input.params as { outputId?: string; versionId?: string } | undefined;
    return request?.id === ENDPOINTS.getArticleVersion.id && input?.outputId === outputId ? input.versionId : undefined;
  };
  const capture = (response: NetworkResponse) => { if (readVersionId(response)) reads.push(response); };
  page.on('response', capture);
  try {
    const saveRequest = await clickDispatch(page, ENDPOINTS.createArticleVersion.id,
      () => article.getByRole('button', { name: '保存修改', exact: true }).click());
    expect(saveRequest.headers()['x-group-id']).toBe(groupId);
    expect(saveRequest.headers()['x-account-id']).toBeUndefined();
    const command = ENDPOINTS.createArticleVersion.body!.parse(requestInput(saveRequest)!.input.body);
    expect(command.document.title).toBe(title); expect(command.expectedCurrentVersionId).toBeTruthy();
    expect(command.clientRequestId).toBeTruthy();
    const saveResponse = await saveRequest.response();
    expect(saveResponse).not.toBeNull(); expect(saveResponse!.ok()).toBe(true);
    const saved = ENDPOINTS.createArticleVersion.response.parse((await saveResponse!.json() as { data: unknown }).data);
    expect(saved.versionId).toBeTruthy(); expect(saved.document).toEqual(command.document);
    // 精确按实际save.versionId捕获读回；不能用可能在途的旧版本读回替代。
    const readResponse = reads.find(response => readVersionId(response) === saved.versionId) ??
      await page.waitForResponse(response => readVersionId(response) === saved.versionId);
    expect(readResponse.ok()).toBe(true);
    expect(requestInput(readResponse.request())!.input.params).toEqual({ outputId, versionId: saved.versionId });
    expect(readResponse.request().headers()['x-group-id']).toBe(groupId);
    expect(readResponse.request().headers()['x-account-id']).toBeUndefined();
    const exact = ENDPOINTS.getArticleVersion.response.parse((await readResponse.json() as { data: unknown }).data);
    expect(exact.versionId).toBe(saved.versionId); expect(exact.document).toEqual(command.document);
    // 保真实UI保存成功门；200写入回执不能代替产品清理恢复记录并开放后续操作。
    await expect(article.getByRole('status').filter({ hasText: '稿件已保存为新版本并完成指定版本读回。' })).toBeVisible();
    const current = ENDPOINTS.getArticle.response.parse(await dispatch(page, ENDPOINTS.getArticle.id, params({ outputId }), { groupId }));
    expect(current.outputId).toBe(outputId); expect(current.currentVersionId).toBe(saved.versionId);
    expect(current.current).toEqual(exact.document); expect(current.current.title).toBe(title);
    return saved;
  } finally { page.off('response', capture); }
}

test('真实首载组列表延迟时不发创建，根就绪后文章可创建保存刷新', async ({ page, baseURL }) => {
  const owner = await group(page, fresh('首载就绪工作区'));
  const project = await dispatch<{ id: string }>(page, 'projects.create',
    body({ title: '真实初始化后写文章', brief: '', contentType: 'article' }), { groupId: owner.id });
  await enterGroup(page, owner.id, baseURL ?? 'http://127.0.0.1');
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  let observed!: () => void;
  const intercepted = new Promise<void>(resolve => { observed = resolve; });
  let delayedOnce = false;
  let browserCreates = 0;
  page.on('request', request => { if (requestInput(request)?.id === 'projects.outputs.create') browserCreates++; });
  await page.route('**/api/v1/dispatch', async route => {
    if (requestInput(route.request())?.id !== 'accountGroups.list' || delayedOnce) { await route.continue(); return; }
    delayedOnce = true;
    // 读取真实公开服务的成功字节，只延迟交付，不造组或授权。
    const response = await route.fetch({ timeout: 120000 });
    expect(response.ok()).toBe(true);
    const envelope = await response.json() as { data: Array<{ id: string }>; meta: { total: number } };
    expect(envelope.data.some(row => row.id === owner.id)).toBe(true);
    expect(envelope.meta.total).toBeGreaterThanOrEqual(envelope.data.length);
    observed();
    await delayed;
    await route.fulfill({ response });
  });
  try {
    await page.goto(`/projects/${project.id}/article`);
    await intercepted;
    await expect(page.getByTestId('workspace-initialization-loading')).toBeVisible();
    await expect(page.locator('[data-page="article-workbench"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '新建文章', exact: true })).toHaveCount(0);
    expect(browserCreates).toBe(0);
    release();
    const article = page.locator('[data-page="article-workbench"]');
    await expect(article).toBeVisible();
    const createRequest = await clickDispatch(page, 'projects.outputs.create',
      () => article.getByRole('button', { name: '新建文章', exact: true }).click());
    const createResponse = await createRequest.response();
    expect(createResponse).not.toBeNull();
    expect(createResponse!.ok()).toBe(true);
    const created = (await createResponse!.json() as { data: { id: string } }).data;
    expect(created.id).toBeTruthy();
    expect(createRequest.headers()['x-group-id']).toBe(owner.id);
    expect(createRequest.headers()['x-account-id']).toBeUndefined();
    expect(browserCreates).toBe(1);
    await expect(article.getByText('当前稿件', { exact: true })).toBeVisible();
    await article.getByLabel('标题', { exact: true }).fill('初始化后真实保存的文章');
    await saveInitializedArticle(page, article, created.id, owner.id, '初始化后真实保存的文章');
    await page.reload();
    await expect(article.getByLabel('标题', { exact: true })).toHaveValue('初始化后真实保存的文章');
    await expect(page).toHaveURL(new RegExp(`outputId=${created.id}`));
  } finally {
    release();
    await page.unroute('**/api/v1/dispatch');
  }
});

test('真实首次RSC同步中手动切B：旧A完成不能放行，B就绪才可创建保存刷新', async ({ page, baseURL }, testInfo) => {
  const a = await group(page, fresh('首同步A'));
  const b = await group(page, fresh('首同步B'));
  const account = await dispatch<{ id: string }>(page, 'accounts.create',
    body({ platform: 'douyin', accountHandle: fresh('首同步真实账号'), idempotencyKey: fresh('account') }));
  const preview = await dispatch<Record<string, unknown>>(page, 'accountGroups.members.previewTransfer',
    body({ accountId: account.id, toGroupId: a.id }));
  await dispatch(page, 'accountGroups.members.transfer', body({ ...preview, idempotencyKey: fresh('transfer') }));
  const project = await dispatch<{ id: string }>(page, 'projects.create',
    body({ title: '切B后真实保存文章', brief: '', contentType: 'article' }), { groupId: b.id });
  const origin = baseURL ?? 'http://127.0.0.1';
  await page.context().addCookies([
    { name: 'creatoros_current_group', value: '', url: origin, expires: 0 },
    { name: 'creatoros_current_account', value: encodeURIComponent(account.id), url: origin },
  ]);
  const sentinel = fresh('first-sync-once');
  await page.addInitScript(({ accountId, sentinel }) => {
    if (sessionStorage.getItem(sentinel)) return;
    sessionStorage.setItem(sentinel, '1');
    // 失效本地选择是调用意图，不是授权；A来自真实公开唯一membership回读。
    localStorage.setItem('creatoros:current-group', 'removed-local-intent');
    localStorage.setItem('creatoros:current-account', accountId);
  }, { accountId: account.id, sentinel });
  function latch() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
  const heldA = latch(), heldB = latch(), observedA = latch(), observedB = latch(), finishedA = latch(), finishedB = latch();
  const seen = new Set<string>();
  const observations: Array<{ groupId: string; status: number; contentType: string; bodySha256: string; delivery: string }> = [];
  let browserCreates = 0, browserProjectCreates = 0;
  page.on('request', request => {
    const endpoint = requestInput(request)?.id;
    if (endpoint === 'projects.outputs.create') browserCreates++;
    if (endpoint === 'projects.create') browserProjectCreates++;
  });
  const path = "/projects";
  await page.route(`**${path}*`, async route => {
    const request = route.request(), requestHeaders = await request.allHeaders();
    if (requestHeaders.rsc !== '1' || requestHeaders['next-router-prefetch'] === '1') { await route.continue(); return; }
    const cookie = requestHeaders.cookie ?? '';
    const selected = [a.id, b.id].find(id => cookie.split(';').some(value => value.trim() === `creatoros_current_group=${encodeURIComponent(id)}`));
    if (!selected || seen.has(selected)) { await route.continue(); return; }
    seen.add(selected);
    const held = selected === a.id ? heldA : heldB;
    const observed = selected === a.id ? observedA : observedB;
    const finished = selected === a.id ? finishedA : finishedB;
    try {
      // 获取实际RSC响应字节，不替换payload或服务授权；只延迟浏览器交付。
      const response = await route.fetch({ timeout: 120000 });
      expect(response.ok()).toBe(true);
      const contentType = response.headers()['content-type'] ?? '';
      expect(contentType).toContain('text/x-component');
      const row = { groupId: selected, status: response.status(), contentType, bodySha256: sha(await response.body()), delivery: 'held' };
      observations.push(row); observed.resolve();
      await held.promise;
      try { await route.fulfill({ response }); row.delivery = 'fulfilled'; }
      catch (error) {
        // 若浏览器实际取消请求，仅有requestfailed证据才记录；不预设REFRESH会取消。
        const failure = request.failure();
        if (!failure) throw error;
        row.delivery = `requestfailed:${failure.errorText}`;
      }
    } finally { finished.resolve(); }
  });
  try {
    const initialResponse = await page.goto(path);
    expect(initialResponse).not.toBeNull(); expect(initialResponse!.ok()).toBe(true);
    await observedA.promise;
    await expect(page.getByTestId('workspace-initialization-loading')).toBeVisible();
    await expect(page.getByTestId('account-switcher-trigger')).toHaveAttribute('aria-label', `当前账号组：${a.name}`);
    await expect(page.locator('[data-page="article-workbench"]')).toHaveCount(0);
    await expect(page.locator('[data-page="projects"]')).toHaveCount(0);
    // Header保留合法导航；真正创作表单由page/@modal首次初始化边界阻留。
    await expect(page.getByRole('banner').getByRole('link', { name: /新建项目/ })).toHaveAttribute('href', '/projects/new');
    await expect(page.getByRole('dialog', { name: '新建项目', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-slot="new-project-submit"]')).toHaveCount(0);
    expect(browserCreates).toBe(0); expect(browserProjectCreates).toBe(0);
    await evidence(page, testInfo, 'first-rsc-a-loading.png');
    await switchGroup(page, b.id);
    // installed Next把REFRESH排队；必须先交付A，B的实际请求才会开始。
    heldA.resolve(); await finishedA.promise;
    await observedB.promise;
    // 旧A可能交付或由Next取消，两个真实结果都不能代替仍被阻留的B完成。
    await expect(page.getByTestId('workspace-initialization-loading')).toBeVisible();
    await expect(page.locator('[data-page="article-workbench"]')).toHaveCount(0);
    await expect(page.locator('[data-page="projects"]')).toHaveCount(0);
    // Header保留合法导航；真正创作表单由page/@modal首次初始化边界阻留。
    await expect(page.getByRole('banner').getByRole('link', { name: /新建项目/ })).toHaveAttribute('href', '/projects/new');
    await expect(page.getByRole('dialog', { name: '新建项目', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-slot="new-project-submit"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '新建文章', exact: true })).toHaveCount(0);
    expect(browserCreates).toBe(0); expect(browserProjectCreates).toBe(0);
    heldB.resolve(); await finishedB.promise;
    const article = page.locator('[data-page="article-workbench"]');
    const projects = page.locator('[data-page="projects"]');
    await expect(projects).toBeVisible();
    await expect(projects.locator(`a[href^="/projects/${project.id}"]`).first()).toBeVisible();
    await expect(page.getByTestId('account-switcher-trigger')).toHaveAttribute('aria-label', `当前账号组：${b.name}`);
    // B真实refresh已经放行后，进入其公开父项目页继续完整创建旅程。
    await page.goto(`/projects/${project.id}/article`);
    await expect(article).toBeVisible();
    const createdRequest = await clickDispatch(page, 'projects.outputs.create',
      () => article.getByRole('button', { name: '新建文章', exact: true }).click());
    const response = await createdRequest.response();
    expect(response).not.toBeNull(); expect(response!.ok()).toBe(true);
    const created = (await response!.json() as { data: { id: string } }).data;
    expect(created.id).toBeTruthy();
    expect(createdRequest.headers()['x-group-id']).toBe(b.id);
    expect(createdRequest.headers()['x-account-id']).toBeUndefined();
    expect(browserCreates).toBe(1); expect(browserProjectCreates).toBe(0);
    await expect(article.getByText('当前稿件', { exact: true })).toBeVisible();
    await article.getByLabel('标题', { exact: true }).fill('真实B根完成后保存');
    await saveInitializedArticle(page, article, created.id, b.id, '真实B根完成后保存');
    await evidence(page, testInfo, 'first-rsc-b-ready-saved.png');
    await page.reload();
    await expect(article.getByLabel('标题', { exact: true })).toHaveValue('真实B根完成后保存');
    await expect(page).toHaveURL(new RegExp(`outputId=${created.id}`));
  } finally {
    heldA.resolve(); heldB.resolve();
    // 先等已实际进入的held处理完成；先unroute会把尚待fulfill的route标成已处理。
    await Promise.all([...seen].map(id => id === a.id ? finishedA.promise : finishedB.promise));
    await page.unroute(`**${path}*`);
    await testInfo.attach('真实首载RSC交付观察', { body: Buffer.from(JSON.stringify({ observations, browserCreates, browserProjectCreates,
      caveat: '仅真实响应交付延迟；Next实际取消/并发顺序以原trace为准，未用固定sleep或伪router放行。' }, null, 2)), contentType: 'application/json' });
  }
});

test('真实首载RSC一直未交付：有界超时后显式整页重试，同B根可创建保存回读', async ({ page, baseURL }, testInfo) => {
  const b = await group(page, fresh('整页恢复B'));
  const account = await dispatch<{ id: string }>(page, 'accounts.create',
    body({ platform: 'douyin', accountHandle: fresh('恢复真实账号'), idempotencyKey: fresh('account') }));
  const preview = await dispatch<Record<string, unknown>>(page, 'accountGroups.members.previewTransfer',
    body({ accountId: account.id, toGroupId: b.id }));
  await dispatch(page, 'accountGroups.members.transfer', body({ ...preview, idempotencyKey: fresh('transfer') }));
  const project = await dispatch<{ id: string }>(page, 'projects.create',
    body({ title: '真实重载后文章', brief: '', contentType: 'article' }), { groupId: b.id });
  const origin = baseURL ?? 'http://127.0.0.1', sentinel = fresh('reload-init-once');
  await page.context().addCookies([
    { name: 'creatoros_current_group', value: '', url: origin, expires: 0 },
    { name: 'creatoros_current_account', value: encodeURIComponent(account.id), url: origin },
  ]);
  await page.addInitScript(({ accountId, sentinel }) => {
    if (sessionStorage.getItem(sentinel)) return;
    sessionStorage.setItem(sentinel, '1');
    localStorage.setItem('creatoros:current-group', 'removed-before-recovery');
    localStorage.setItem('creatoros:current-account', accountId);
  }, { accountId: account.id, sentinel });
  let release!: () => void, observed!: () => void, finished!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const intercepted = new Promise<void>(resolve => { observed = resolve; });
  const settled = new Promise<void>(resolve => { finished = resolve; });
  let seen = false, browserCreates = 0, browserProjectCreates = 0;
  const observation: { status?: number; contentType?: string; bodySha256?: string; delivery?: string; elapsedToErrorMs?: number; actualReloadStatus?: number } = {};
  page.on('request', request => {
    const endpoint = requestInput(request)?.id;
    if (endpoint === 'projects.outputs.create') browserCreates++;
    if (endpoint === 'projects.create') browserProjectCreates++;
  });
  await page.route('**/projects*', async route => {
    const request = route.request(), requestHeaders = await request.allHeaders();
    if (requestHeaders.rsc !== '1' || requestHeaders['next-router-prefetch'] === '1' || seen) { await route.continue(); return; }
    seen = true;
    try {
      const response = await route.fetch({ timeout: 120000 });
      expect(response.ok()).toBe(true);
      observation.status = response.status(); observation.contentType = response.headers()['content-type'];
      expect(observation.contentType).toContain('text/x-component');
      observation.bodySha256 = sha(await response.body()); observation.delivery = 'held-through-retry-and-save';
      observed(); await held;
      try { await route.fulfill({ response }); observation.delivery = 'late-fulfilled'; }
      catch (error) { const failure = request.failure(); if (!failure) throw error; observation.delivery = `requestfailed:${failure.errorText}`; }
    } finally { finished(); }
  });
  try {
    const initialResponse = await page.goto('/projects');
    expect(initialResponse).not.toBeNull(); expect(initialResponse!.ok()).toBe(true);
    await intercepted;
    const started = Date.now();
    await expect(page.getByTestId('workspace-initialization-loading')).toBeVisible();
    await expect(page.locator('[data-page="article-workbench"]')).toHaveCount(0);
    await expect(page.locator('[data-page="projects"]')).toHaveCount(0);
    // Header保留合法导航；真正创作表单由page/@modal首次初始化边界阻留。
    await expect(page.getByRole('banner').getByRole('link', { name: /新建项目/ })).toHaveAttribute('href', '/projects/new');
    await expect(page.getByRole('dialog', { name: '新建项目', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-slot="new-project-submit"]')).toHaveCount(0);
    expect(browserCreates).toBe(0); expect(browserProjectCreates).toBe(0);
    // 等待产品真实15s超时状态，不sleep、不给挂起响应放行。
    const error = page.getByTestId('workspace-initialization-error');
    await expect(error).toContainText('工作区页面打开超时，请重试。', { timeout: 120000 });
    observation.elapsedToErrorMs = Date.now() - started;
    await expect(page.locator('[data-page="article-workbench"]')).toHaveCount(0);
    await expect(page.locator('[data-page="projects"]')).toHaveCount(0);
    // Header保留合法导航；真正创作表单由page/@modal首次初始化边界阻留。
    await expect(page.getByRole('banner').getByRole('link', { name: /新建项目/ })).toHaveAttribute('href', '/projects/new');
    await expect(page.getByRole('dialog', { name: '新建项目', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-slot="new-project-submit"]')).toHaveCount(0); expect(browserCreates).toBe(0); expect(browserProjectCreates).toBe(0);
    await evidence(page, testInfo, 'first-rsc-timeout-real-error.png');
    const navigation = page.waitForRequest(request => request.isNavigationRequest() &&
      request.resourceType() === 'document' && new URL(request.url()).pathname === '/projects');
    await error.getByRole('button', { name: '重试打开工作区', exact: true }).click();
    const actualNavigation = await navigation;
    const response = await actualNavigation.response();
    expect(response).not.toBeNull(); expect(response!.ok()).toBe(true);
    observation.actualReloadStatus = response!.status();
    expect(response!.headers()['content-type']).toContain('text/html');
    // 被挂起的旧RSC仍未release；新文档使用已持久化B意图真实初始化。
    const projects = page.locator('[data-page="projects"]');
    await expect(projects).toBeVisible();
    await expect(projects.locator(`a[href^="/projects/${project.id}"]`).first()).toBeVisible();
    await expect(page.getByTestId('account-switcher-trigger')).toHaveAttribute('aria-label', `当前账号组：${b.name}`);
    expect(observation.delivery).toBe('held-through-retry-and-save'); expect(browserCreates).toBe(0); expect(browserProjectCreates).toBe(0);
    await page.goto(`/projects/${project.id}/article`);
    const article = page.locator('[data-page="article-workbench"]'); await expect(article).toBeVisible();
    const request = await clickDispatch(page, 'projects.outputs.create',
      () => article.getByRole('button', { name: '新建文章', exact: true }).click());
    const createdResponse = await request.response();
    expect(createdResponse).not.toBeNull(); expect(createdResponse!.ok()).toBe(true);
    const created = (await createdResponse!.json() as { data: { id: string } }).data;
    expect(created.id).toBeTruthy(); expect(request.headers()['x-group-id']).toBe(b.id);
    expect(request.headers()['x-account-id']).toBeUndefined(); expect(browserCreates).toBe(1); expect(browserProjectCreates).toBe(0);
    await expect(article.getByText('当前稿件', { exact: true })).toBeVisible();
    await article.getByLabel('标题', { exact: true }).fill('真实整页恢复后保存');
    await saveInitializedArticle(page, article, created.id, b.id, '真实整页恢复后保存');
    const reread = await dispatch<{ id: string; title: string }>(page, ENDPOINTS.getOutput.id, params({ outputId: created.id }), { groupId: b.id });
    expect(reread.id).toBe(created.id); // output是作品身份，文章标题以articles当前/指定版本完整回读为准。
    await evidence(page, testInfo, 'first-rsc-real-reload-saved.png');
    await page.reload();
    await expect(article.getByLabel('标题', { exact: true })).toHaveValue('真实整页恢复后保存');
    await expect(page).toHaveURL(new RegExp(`outputId=${created.id}`));
    expect(observation.delivery).toBe('held-through-retry-and-save');
  } finally {
    release(); if (seen) await settled;
    await page.unroute('**/projects*');
    await testInfo.attach('真实首载超时整页恢复观察', { body: Buffer.from(JSON.stringify({ observation, browserCreates, browserProjectCreates,
      caveat: '旧真实RSC字节直到创建保存完成仍未交付；显式重试必须观测document请求与真实新文档就绪，非mockrouter或排队refresh。截图仅用例执行后才存在。' }, null, 2)), contentType: 'application/json' });
  }
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 672660000 });
