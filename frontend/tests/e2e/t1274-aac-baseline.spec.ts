import { test, expect as baseExpect, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ENDPOINTS } from '@creatoros/contract';

// 仅旧 kernel 同输入 AAC baseline。不得将此测试当作采纳/保存/完整导出旅程 PASS。
// SEMANTIC_BOUNDARY_ALLOW: 精确身份、摘要、样本/帧相等比较只作媒体取证，不选择内容。
const expect = baseExpect.configure({ timeout: 120_000 });
const evidenceRoot = resolve('../docs/verification/t1274/browser');
const nativePath = '/reference-editors/opencut-classic/native/native.js';
const oldRevision = '83b12c553';
const original = {
  isolatedRoot: '/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/creatoros-playwright-SnlZk2',
  groupId: 'grp-2da80ee7-6', projectId: 'project-2da80ee7-8', outputId: 'output-2da80ee7-19',
  assetId: 'asset-2da80ee7-27', assetFileId: 'afile-2da80ee7-31',
  sourceRequestId: '5bcacef8-7a4f-4fd2-a2cd-f94ff6467c79',
};
const readOnlyOperations = new Set<string>([
  ENDPOINTS.getProductionEditorSource.id, ENDPOINTS.getProductionEditor.id,
  ENDPOINTS.readProductionEditorScript.id, ENDPOINTS.proposeProductionEditorScript.id,
]);
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  const result = JSON.stringify(value);
  if (result === undefined || typeof value === 'number' && !Number.isFinite(value)) throw Error('取证输入不能规范化');
  return result;
}
function jsonEvidence(name: string, value: unknown) {
  writeFileSync(resolve(evidenceRoot, name), JSON.stringify(value, null, 2));
}
async function dispatch(page: Page, id: string, input: unknown) {
  if (!readOnlyOperations.has(id)) throw Error(`baseline 禁止正式写操作：${id}`);
  const response = await page.request.post('/api/v1/dispatch', {
    timeout: 120_000, headers: { 'content-type': 'application/json', 'x-group-id': original.groupId },
    data: { id, input },
  });
  expect(response.ok(), `${id} ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()).data;
}

/** 实际解码；保留原帧时间戳，不补帧、不变速、不裁音频。仅在测试被明确运行时调用。 */
function inspectMedia(path: string, prefix: string) {
  const command = (bin: string, args: string[]) => execFileSync(bin, args, {
    encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  });
  const decoded = JSON.parse(command('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path]));
  const frames = JSON.parse(command('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_frames',
    '-show_entries', 'frame=pts,pts_time,best_effort_timestamp,best_effort_timestamp_time,duration,duration_time,width,height,pix_fmt', '-of', 'json', path]));
  const frameMd5 = command('ffmpeg', ['-v', 'error', '-i', path, '-map', '0:v:0', '-an', '-fps_mode', 'passthrough', '-f', 'framemd5', '-']);
  const pcmPath = resolve(evidenceRoot, `${prefix}-audio.f32le`);
  command('ffmpeg', ['-y', '-v', 'error', '-i', path, '-map', '0:a:0', '-vn', '-c:a', 'pcm_f32le', '-f', 'f32le', pcmPath]);
  const pcm = readFileSync(pcmPath), audio = decoded.streams.find((stream: any) => stream.codec_type === 'audio');
  if (!audio || !Number.isInteger(audio.channels) || !Number(audio.sample_rate)) throw Error('实际媒体缺少可核验音频');
  expect(pcm.length % (4 * audio.channels)).toBe(0);
  const sampleFrames = pcm.length / (4 * audio.channels), threshold = 1e-4;
  let first: number | null = null, last: number | null = null;
  for (let frame = 0; frame < sampleFrames; frame++) {
    for (let channel = 0; channel < audio.channels; channel++) {
      const value = pcm.readFloatLE((frame * audio.channels + channel) * 4);
      if (!Number.isFinite(value)) throw Error('实际解码 PCM 含非有限值');
      if (Math.abs(value) > threshold) { first ??= frame; last = frame; }
    }
  }
  const sampleEvidence = {
    sampleFrames, channels: audio.channels, sampleRate: Number(audio.sample_rate),
    decodedDuration: sampleFrames / Number(audio.sample_rate), threshold,
    firstAboveThresholdSample: first, lastAboveThresholdSample: last,
    firstAboveThreshold: first === null ? null : first / Number(audio.sample_rate),
    lastAboveThreshold: last === null ? null : last / Number(audio.sample_rate), pcmSha256: sha(pcm),
  };
  jsonEvidence(`${prefix}-decoded.json`, decoded);
  jsonEvidence(`${prefix}-video-frame-pts.json`, frames);
  jsonEvidence(`${prefix}-audio-sample-evidence.json`, sampleEvidence);
  writeFileSync(resolve(evidenceRoot, `${prefix}-video.framemd5`), frameMd5);
  // 文件名、创建时间和压缩码率不用于证明解码相等。
  const frameHashes = frameMd5.split('\n').filter(line => line.startsWith('#tb') || line.trim() && !line.startsWith('#')).map(line => line.trim());
  const framePts = frames.frames.map((frame: any) => ({
    pts: frame.pts, ptsTime: frame.pts_time, bestEffortTimestamp: frame.best_effort_timestamp,
    bestEffortTimestampTime: frame.best_effort_timestamp_time, duration: frame.duration, durationTime: frame.duration_time,
  }));
  const timing = decoded.streams.map((stream: any) => ({
    type: stream.codec_type, timeBase: stream.time_base, startPts: stream.start_pts, durationTicks: stream.duration_ts,
    sampleRate: stream.sample_rate, channels: stream.channels, frames: stream.nb_frames,
    width: stream.width, height: stream.height, frameRate: stream.avg_frame_rate,
  }));
  return { decoded, frames, framePts, frameHashes, pcm, sampleEvidence, timing, fileSha256: sha(readFileSync(path)) };
}

test('仅旧 83b12c553 kernel 同候选 AAC baseline：真实编码与新预览严格比较，不采纳、不保存工程', async ({ page, context, baseURL }, info) => {
  test.setTimeout(1_800_000);
  page.setDefaultTimeout(120_000); page.setDefaultNavigationTimeout(120_000);
  // 必须显式指定原隔离库，不能让 playwright.config 创建新 root 或连接用户正式数据。
  const resumePath = process.env.CREATOROS_T1274_RESUME;
  expect(resumePath, '须指定原 resume JSON').toBeTruthy();
  const resume = JSON.parse(readFileSync(resumePath!, 'utf8'));
  for (const [key, value] of Object.entries(original)) expect(resume[key], `原身份 ${key}`).toBe(value);
  expect(process.env.CREATOROS_PLAYWRIGHT_DATA_ROOT).toBe(original.isolatedRoot);
  expect(existsSync(resolve(original.isolatedRoot, 'pglite', 'PG_VERSION'))).toBe(true);
  expect(baseURL).toBeTruthy();
  expect(['127.0.0.1', 'localhost', '[::1]']).toContain(new URL(baseURL!).hostname);
  const newPath = resolve(evidenceRoot, 'candidate-preview.mp4');
  expect(existsSync(newPath), '须保留真实新预览完整 Blob').toBe(true);
  mkdirSync(evidenceRoot, { recursive: true });
  await context.addCookies([{ name: 'creatoros_current_group', value: encodeURIComponent(original.groupId), url: baseURL! }]);
  await context.addInitScript(groupId => { localStorage.setItem('creatoros:current-group', groupId); localStorage.removeItem('creatoros:current-account'); }, original.groupId);

  const source = await dispatch(page, ENDPOINTS.getProductionEditorSource.id, { params: { outputId: original.outputId, requestId: original.sourceRequestId } });
  expect(source.status).toBe('succeeded');
  expect(source.assetId).toBe(original.assetId); expect(source.assetFileId).toBe(original.assetFileId);
  const sourceBytes = readFileSync('/tmp/creatoros-t1274-media/source.mp4');
  expect(sha(sourceBytes)).toBe(source.probe.fileDigest);
  const before = await dispatch(page, ENDPOINTS.getProductionEditor.id, { params: { outputId: original.outputId } });
  expect(before.projectId).toBe(original.projectId); expect(before.outputId).toBe(original.outputId);
  expect(before.plan.editorVersion).toBe(3);
  const nativeDocument = before.plan.referenceEditor.nativeDocument;
  const scene = nativeDocument.scenes.find((item: any) => item.id === nativeDocument.currentSceneId);
  expect(scene).toBeTruthy(); expect(scene.tracks.main.elements).toHaveLength(2);
  const target = {
    schemaVersion: 1, projectId: original.projectId, outputId: original.outputId, owner: 'production', contentType: 'video',
    savedBase: { kind: 'production', productionId: before.productionId, revision: before.revision },
    documentDigest: `sha256:${sha(canonical(before.plan))}`,
    selection: { kind: 'native_scene', sceneId: scene.id, elementRefs: [], playheadTick: 0, contextEpoch: 0, editorGeneration: `aac-baseline:${randomUUID()}` },
  };
  const read = await dispatch(page, ENDPOINTS.readProductionEditorScript.id, { params: { outputId: original.outputId }, body: { target } });
  const script = read.scriptMarkdown;
  expect(script.scopeComplete).toBe(true);
  const lines = script.markdown.split('\n');
  const first = lines.findIndex((line: string) => line.startsWith('[c1]'));
  const second = lines.findIndex((line: string) => line.startsWith('[c2]'));
  expect(first).toBeGreaterThan(0); expect(second).toBeGreaterThan(first);
  lines.splice(first, second - first);
  const candidate = await dispatch(page, ENDPOINTS.proposeProductionEditorScript.id, {
    params: { outputId: original.outputId }, body: { target: read.target, input: {
      base: read.base, baseDigest: read.baseDigest, summary: '仅同输入旧 AAC baseline，删除 c1',
      candidate: { kind: 'markdown_timeline', owner: 'production', sceneId: script.sceneId, markdown: lines.join('\n'),
        declaredTrackIds: script.tracks.map((track: any) => track.trackId), stateStamp: script.stateStamp, libraryStamp: script.libraryStamp },
    } },
  });
  expect(candidate.error).toBeNull(); expect(candidate.scriptDiagnostics.errors).toEqual([]);
  expect(candidate.apply?.operation).toBe('applyProductionEditor'); expect(candidate.candidate?.kind).toBe('native_scene');
  const candidateScene = candidate.candidate.document;
  expect(candidateScene.id).toBe(scene.id); expect(candidateScene.tracks.main.elements).toHaveLength(1);
  expect(candidateScene.tracks.main.elements[0].startTime).toBe(0);
  expect(candidateScene.tracks.main.elements[0].duration).toBe(240000);
  const document = structuredClone(nativeDocument);
  document.scenes.find((item: any) => item.id === scene.id).tracks = structuredClone(candidateScene.tracks);
  expect(document.settings.fps).toEqual(nativeDocument.settings.fps);
  const refs = before.plan.referenceEditor.mediaRefs;
  expect(refs).toHaveLength(1);
  expect(refs[0].assetId).toBe(original.assetId); expect(refs[0].assetFileId).toBe(original.assetFileId);
  const descriptor = nativeDocument.mediaMetadata.find((item: any) => item.mediaId === refs[0].mediaId);
  expect(descriptor).toBeTruthy(); expect(descriptor.type).toBe('video');
  expect(descriptor.size).toBe(sourceBytes.length); expect(Number.isSafeInteger(descriptor.lastModified)).toBe(true);

  // git show 读取完整旧发布字节；route 只覆盖带 ?old-baseline 的一次独立模块请求。
  const oldJs = execFileSync('git', ['show', `${oldRevision}:frontend/public${nativePath}`], { cwd: resolve('..'), maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
  const oldCommit = execFileSync('git', ['rev-parse', oldRevision], { cwd: resolve('..'), encoding: 'utf8', timeout: 120_000 }).trim();
  const publishedJsSha256 = sha(readFileSync(resolve('public', nativePath.slice(1))));
  jsonEvidence('old-kernel-baseline-input.json', {
    purpose: '仅旧 kernel 同输入媒体对照，非完整旅程', original, oldCommit, oldKernelSha256: sha(oldJs), publishedJsSha256,
    productionRevision: before.revision, basePlanDigest: target.documentDigest, candidateDigest: candidate.candidateDigest,
    sourceSha256: sha(sourceBytes), descriptor, document, candidate,
  });
  const baseline = await context.newPage();
  baseline.setDefaultTimeout(120_000); baseline.setDefaultNavigationTimeout(120_000);
  let oldModuleRequests = 0;
  await baseline.route(url => url.pathname === nativePath && url.search === '?old-baseline', async route => {
    oldModuleRequests++; await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: oldJs });
  });
  try {
    await baseline.goto('/');
    await expect(baseline.locator('[data-native-root="opencut"]')).toHaveCount(0);
    const rendered = await baseline.evaluate(async input => {
      // 页面自有 ShadowRoot，旧模块使用真实 mount/load/export 和真实浏览器编码器。
      const host = window.document.createElement('div');
      host.style.cssText = 'height:780px;width:100%;display:block'; window.document.body.append(host);
      const shadow = host.attachShadow({ mode: 'open' });
      const css = window.document.createElement('link'); css.rel = 'stylesheet'; css.href = '/reference-editors/opencut-classic/native/native.css';
      const cssReady = new Promise<void>((resolve, reject) => { css.onload = () => resolve(); css.onerror = () => reject(Error('真实 native CSS 未加载')); });
      const container = window.document.createElement('div'), portalContainer = window.document.createElement('div');
      container.style.cssText = 'height:100%;min-height:0'; portalContainer.dataset.nativePortalRoot = '';
      shadow.append(css, container, portalContainer);
      const root = window.document.documentElement, computed = getComputedStyle(root);
      const names = ['canvas', 'surface', 'surface-subtle', 'brand', 'brand-hover', 'brand-soft', 'brand-foreground', 'text', 'text-muted', 'text-subtle', 'border', 'border-strong', 'success', 'warning', 'danger', 'info', 'radius-control', 'radius-card', 'radius-panel', 'shadow-card', 'shadow-popover', 'font-sans', 'text-xs', 'text-sm', 'text-md'];
      const tokens = Object.fromEntries(names.map(name => { const key = `--creatoros-${name}`; return [key, computed.getPropertyValue(key).trim()]; }));
      if (!tokens['--creatoros-brand'] || !tokens['--creatoros-surface']) throw Error('真实宿主 theme 尚未就绪');
      const theme = { mode: root.classList.contains('dark') ? 'dark' : 'light', tokens, fontFamily: tokens['--creatoros-font-sans'], fontSize: tokens['--creatoros-text-sm'], density: root.dataset.density ?? 'comfortable' };
      for (const [key, value] of Object.entries(tokens)) host.style.setProperty(key, value);
      const moduleUrl = new URL(`${input.nativePath}?old-baseline`, location.origin).href;
      // 由浏览器 import 完整历史产物，不走打包器/新 kernel。
      const module = await import(/* webpackIgnore: true */ moduleUrl); await cssReady;
      const lifetime = new AbortController(), errors: string[] = [];
      const handle = await module.mount(container, {
        owner: input.owner, theme, portalContainer, signal: lifetime.signal,
        onChanged() {}, onError(message: string) { errors.push(message); },
        async importMedia() { throw Error('baseline 禁止导入新素材'); },
      });
      try {
        const data = Uint8Array.from(atob(input.sourceBase64), character => character.charCodeAt(0));
        const file = new File([data], input.descriptor.name, { type: 'video/mp4', lastModified: input.descriptor.lastModified });
        const loaded = await handle.request('load', { outputId: input.owner.outputId, document: input.document,
          media: [{ ...input.descriptor, mediaId: input.mediaId, assetId: input.assetId, assetFileId: input.assetFileId, file }] });
        if (loaded.documentVersion !== 31) throw Error('旧 kernel 文档 ABI 不匹配');
        const result = await handle.request('export', { format: 'mp4' });
        if (!(result.blob instanceof Blob) || !result.blob.size) throw Error('旧 kernel 未返回完整真实 Blob');
        return { bytes: Array.from(new Uint8Array(await result.blob.arrayBuffer())), fileName: result.fileName,
          document: result.document, mediaMetadata: result.mediaMetadata, errors, theme };
      } finally { await handle.dispose(); lifetime.abort(); host.remove(); }
    }, { nativePath, owner: { groupId: original.groupId, accountId: null, projectId: original.projectId, outputId: original.outputId, sourceVersionId: `${before.productionId}:${before.revision}` },
      document, descriptor, mediaId: refs[0].mediaId, assetId: original.assetId, assetFileId: original.assetFileId, sourceBase64: sourceBytes.toString('base64') });
    expect(oldModuleRequests).toBe(1); expect(rendered.errors).toEqual([]);
    expect(rendered.document.scenes.find((item: any) => item.id === scene.id).tracks).toEqual(candidateScene.tracks);
    const oldPath = resolve(evidenceRoot, 'old-kernel-candidate.mp4');
    writeFileSync(oldPath, Buffer.from(rendered.bytes));
    jsonEvidence('old-kernel-export-snapshot.json', { document: rendered.document, mediaMetadata: rendered.mediaMetadata, theme: rendered.theme, errors: rendered.errors });
    // 新 Blob 必须先前已存在，不能以此测试偷偷再编码一次新预览。
    const oldMedia = inspectMedia(oldPath, 'old-kernel-candidate');
    const newMedia = inspectMedia(newPath, 'new-kernel-candidate-baseline-comparison');
    const after = await dispatch(page, ENDPOINTS.getProductionEditor.id, { params: { outputId: original.outputId } });
    const comparison = {
      purpose: '旧 AAC baseline 严格媒体对照，非完整采纳/保存/导出旅程', oldCommit, oldKernelSha256: sha(oldJs),
      oldBlobSha256: oldMedia.fileSha256, newBlobSha256: newMedia.fileSha256,
      videoDecodedFrameHashesEqual: canonical(oldMedia.frameHashes) === canonical(newMedia.frameHashes),
      videoFramePtsEqual: canonical(oldMedia.framePts) === canonical(newMedia.framePts),
      audioDecodedPcmBytesEqual: oldMedia.pcm.equals(newMedia.pcm),
      trackTimingsEqual: canonical(oldMedia.timing) === canonical(newMedia.timing),
      containerDurationsEqual: Number(oldMedia.decoded.format.duration) === Number(newMedia.decoded.format.duration),
      productionUnchanged: canonical(before) === canonical(after),
      oldAudio: oldMedia.sampleEvidence, newAudio: newMedia.sampleEvidence,
    };
    jsonEvidence('old-new-kernel-media-comparison.json', comparison);
    await info.attach('旧 kernel 完整 MP4 baseline（非完整旅程）', { path: oldPath, contentType: 'video/mp4' });
    await info.attach('旧新媒体严格比较', { path: resolve(evidenceRoot, 'old-new-kernel-media-comparison.json'), contentType: 'application/json' });
    expect(after).toEqual(before);
    expect(sha(readFileSync(resolve('public', nativePath.slice(1))))).toBe(publishedJsSha256);
    const video = oldMedia.decoded.streams.find((stream: any) => stream.codec_type === 'video');
    expect(Number(video.nb_frames)).toBe(48); expect(Number(video.duration)).toBe(2);
    expect(comparison.videoDecodedFrameHashesEqual).toBe(true);
    expect(comparison.videoFramePtsEqual).toBe(true);
    expect(comparison.audioDecodedPcmBytesEqual).toBe(true);
    expect(comparison.trackTimingsEqual).toBe(true);
    expect(comparison.containerDurationsEqual).toBe(true);
  } finally { await baseline.close(); }
});
