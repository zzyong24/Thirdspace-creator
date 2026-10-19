import { test, expect as baseExpect, type Page } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ENDPOINTS } from '@creatoros/contract';

// 真实默认ASR和公共UI链；语音来自系统Tingting，不作为真人质量或人工听审证据。
const expect = baseExpect.configure({ timeout: 120_000 });
const evidence = resolve(process.env.CREATOROS_T1274_SPEECH_EVIDENCE ?? '../docs/verification/t1274/speech-acceptance');
async function rpc(page: Page, id: string, input: unknown, groupId?: string) {
  const result = await page.request.post('/api/v1/dispatch', { timeout: 120_000,
    headers: { 'content-type': 'application/json', ...(groupId ? { 'x-group-id': groupId } : {}) }, data: { id, input } });
  expect(result.ok(), `${id}: ${result.status()} ${await result.text()}`).toBe(true);
  return (await result.json()).data;
}
function save(name: string, value: unknown) { writeFileSync(resolve(evidence, name), JSON.stringify(value, null, 2)); }
async function clicked(page: Page, id: string, action: () => Promise<unknown>) {
  const next = page.waitForRequest(request => request.url().endsWith('/api/v1/dispatch') && request.method() === 'POST' && request.postDataJSON()?.id === id, { timeout: 120_000 });
  await action(); const request = await next;
  // 先封存已发送的原请求，即使ACK超时也保留同一requestId用于核对，不重建任务。
  const originalName = id === ENDPOINTS.prepareProductionEditorSource.id ? 'source' : id === ENDPOINTS.createProductionEditorTranscript.id ? 'transcript' : id.replace(/[^a-zA-Z0-9.-]/g, '-');
  save(`${originalName}-sent-original-request.json`, { operationId: id, input: request.postDataJSON().input, capturedAt: new Date().toISOString(), acknowledgement: 'pending' });
  const response = await request.response();
  expect(response, `${id} must have original ACK`).not.toBeNull();
  expect(response!.ok(), `${id}: ${await response!.text()}`).toBe(true);
  return { input: request.postDataJSON().input, receipt: (await response!.json()).data };
}

test('真实系统合成语音经默认ASR采纳转录并在文字剪辑读取真实词级时间', async ({ page, baseURL }) => {
  // 外层覆盖原片准备、原ASR任务观察、原生载入、保存和清理，绝不延长持久任务deadline。
  test.setTimeout(14_400_000); page.setDefaultTimeout(120_000); page.setDefaultNavigationTimeout(120_000);
  mkdirSync(evidence, { recursive: true });
  if (existsSync(resolve(evidence, 'transcript-sent-original-request.json'))) throw Error('该验收已有真实ASR原请求；请核对/恢复原ID，禁止运行此创建用例覆盖证据或重发。');
  const fixture = JSON.parse(readFileSync(process.env.CREATOROS_T1274_SPEECH_PREPARED ?? resolve(evidence, 'prepared.json'), 'utf8'));
  const bytes = readFileSync(fixture.mediaPath);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.mediaSHA256);
  const configuredModels = await rpc(page, 'settings.models.list', {});
  expect(configuredModels.some((model: { capability: string }) => model.capability === 'transcribe.audio')).toBe(false);
  const resume = process.env.CREATOROS_T1274_SPEECH_RESUME ? JSON.parse(readFileSync(process.env.CREATOROS_T1274_SPEECH_RESUME, 'utf8')) : null;
  if (resume) expect(resume.isolatedRoot).toBe(process.env.CREATOROS_PLAYWRIGHT_DATA_ROOT);
  const group = resume ? { id: resume.groupId } : await rpc(page, ENDPOINTS.createAccountGroup.id, { body: { name: `语音验收-${randomUUID()}`, idempotencyKey: randomUUID() } });
  const project = resume ? { id: resume.projectId } : await rpc(page, ENDPOINTS.createProject.id, { body: { title: '系统语音真实转写验收', brief: '系统Tingting合成8秒语音。仅机械链验收，不代签真人质量与听感。', contentType: 'video' } }, group.id);
  const output = resume ? { id: resume.outputId } : await rpc(page, ENDPOINTS.createOutput.id, { params: { projectId: project.id }, body: { title: '转录与停顿验收', contentType: 'video', clientRequestId: randomUUID() } }, group.id);
  const checkpoint = { isolatedRoot: process.env.CREATOROS_PLAYWRIGHT_DATA_ROOT, groupId: group.id, projectId: project.id, outputId: output.id, fixture: fixture.mediaPath, fixtureSHA256: fixture.mediaSHA256 };
  if (!resume) save('checkpoint.json', checkpoint);
  await page.context().addCookies([{ name: 'creatoros_current_group', value: encodeURIComponent(group.id), url: baseURL! }]);
  await page.addInitScript(id => { localStorage.setItem('creatoros:current-group', id); localStorage.removeItem('creatoros:current-account'); }, group.id);
  let asset = resume?.asset;
  if (!resume) {
  const upload = await rpc(page, 'assets.uploads.create', { body: { assetType: 'video', mimeType: fixture.mimeType ?? 'video/mp4', fileSize: bytes.length, projectId: project.id, fileName: fixture.fileName ?? 'speech.mp4' } }, group.id);
  expect((await page.request.put(upload.uploadUrl, { timeout: 120_000, headers: { 'content-type': fixture.mimeType ?? 'video/mp4' }, data: bytes })).ok()).toBe(true);
  asset = await rpc(page, 'assets.uploads.complete', { params: { uploadId: upload.uploadId }, body: { name: '系统合成语音验收' } }, group.id);
  save('checkpoint.json', { ...checkpoint, asset });
  }
  const exactFile = await rpc(page, 'assets.fileDownloadUrl', { params: { assetId: asset.id, assetFileId: asset.currentFileId } }, group.id);
  await page.goto(`/projects/${project.id}/production?outputId=${output.id}`);
  const work = page.getByRole('region', { name: '视频剪辑工作台' });
  const native = page.locator('[data-native-root="opencut"]');
  await expect(work.getByRole('button', { name: '保存工程', exact: true })).toBeEnabled();
  const nav = native.getByRole('navigation', { name: '剪辑工作区面板' });
  if (await nav.isVisible()) await nav.getByRole('button', { name: '素材/转录', exact: true }).click();
  if (!resume) {
  await work.getByRole('button', { name: '从素材库选取', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '预览 系统合成语音验收', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '加入编辑器', exact: true }).click();
  const card = native.getByRole('option').filter({ hasText: fixture.fileName ?? 'speech.mp4' });
  await expect(card).toHaveCount(1); await card.hover(); await card.getByRole('button').click();
  await work.getByRole('button', { name: '保存工程', exact: true }).click();
  await expect(work.getByText('剪辑工程已保存，刷新后可继续编辑。', { exact: true })).toBeVisible();
  }
  const existing = await rpc(page, ENDPOINTS.getProductionEditor.id, { params: { outputId: output.id } }, group.id);
  expect(existing.plan.referenceEditor.nativeDocument.scenes[0].tracks.main.elements).toHaveLength(1);
  await work.getByRole('button', { name: '原片与转录', exact: true }).click();
  await page.getByText('转写原片 · 选择视频', { exact: true }).click();
  const sourcePanel = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^转写原片 · 选择视频$/ }) });
  await sourcePanel.getByRole('button', { name: '核对原片', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: `预览 ${exactFile.fileName}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '选择这段原片', exact: true }).click();
  const source = await clicked(page, ENDPOINTS.prepareProductionEditorSource.id, () => page.getByRole('button', { name: '准备转写', exact: true }).click());
  save('source-original-request.json', source);
  let prepared: typeof ENDPOINTS.getProductionEditorSource.response['_output'] | undefined;
  await expect.poll(async () => { prepared = ENDPOINTS.getProductionEditorSource.response.parse(await rpc(page, ENDPOINTS.getProductionEditorSource.id, { params: { outputId: output.id, requestId: source.input.body.requestId } }, group.id)); save('source-latest.json', prepared); expect(['failed', 'cancelled']).not.toContain(prepared.status); return prepared.status; }, { timeout: 480_000, intervals: [1000, 3000, 5000] }).toBe('succeeded');
  expect(prepared?.probe?.fileDigest).toBe(fixture.mediaSHA256);
  await page.getByRole('button', { name: '读取原请求状态', exact: true }).click();
  await page.getByRole('button', { name: '使用这段原片转写', exact: true }).click();
  await expect(page.getByRole('button', { name: '已准备好转写', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '读取时间轴选区', exact: true }).click();
  await page.getByText('原片转写与逐字稿', { exact: true }).click();
  await page.getByLabel('转写精度', { exact: true }).selectOption('word');
  const transcript = await clicked(page, ENDPOINTS.createProductionEditorTranscript.id, () => page.getByRole('button', { name: '转写这段原片', exact: true }).click());
  save('transcript-original-request.json', transcript);
  save('checkpoint.json', { ...checkpoint, asset, sourceRequestId: source.input.body.requestId, transcriptRequestId: transcript.input.body.requestId, transcriptTaskId: transcript.receipt.taskId });
  let actual: typeof ENDPOINTS.getProductionEditorTranscript.response['_output'] | undefined;
  await expect.poll(async () => { actual = ENDPOINTS.getProductionEditorTranscript.response.parse(await rpc(page, ENDPOINTS.getProductionEditorTranscript.id, { params: { outputId: output.id, requestId: transcript.input.body.requestId } }, group.id)); save('transcript-latest.json', actual); expect(['failed', 'cancelled', 'unknown_result', 'waiting_user']).not.toContain(actual.status); return actual.status; }, { timeout: 900_000, intervals: [1000, 3000, 5000] }).toBe('succeeded');
  await page.getByRole('button', { name: '读取原转写状态', exact: true }).click();
  // 真供应商时间码若无法验证，保留失败与实际全文；不补词时码/缩小请求族洗绿。
  if (!actual?.transcript || actual.transcript.granularity === 'text') throw Error('真实词级时间不可用，保留供应商回执；不注入时间码');
  expect(actual.transcript.granularity).toBe('word'); expect(actual.transcript.tokens.length).toBeGreaterThan(1);
  await page.getByRole('button', { name: '采纳转写并保存版本', exact: true }).click();
  await expect(page.getByRole('button', { name: '已保存这份转写', exact: true })).toBeVisible();
  const saved = await rpc(page, ENDPOINTS.getProductionEditor.id, { params: { outputId: output.id } }, group.id);
  expect(saved.plan.sourceTranscripts).toContainEqual(actual.transcript);
  await page.getByRole('button', { name: '读取当前时间轴', exact: true }).click();
  await page.getByText('高级：编辑时间轴文字', { exact: true }).click();
  const markdown = await page.getByRole('textbox', { name: '时间轴文字', exact: true }).inputValue();
  expect(markdown.length).toBeGreaterThan(0); writeFileSync(resolve(evidence, 'actual-timeline.md'), markdown);
  await page.screenshot({ path: resolve(evidence, 'adopted-transcript.png'), fullPage: true });
  save('result.json', { ...checkpoint, asset, source: prepared, transcript: actual, savedRevision: saved.revision, asrCalled: true, semanticModelCalled: false, humanListeningSigned: false, limitation: '系统合成语音仅证明当前ASR及公共采纳/词级投影链，停顿模型与实际试听另行补验。' });
});
