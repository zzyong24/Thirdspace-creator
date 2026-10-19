'use strict';
// 仅注册/注入工厂；没有顶层业务、旧support/session、环境或文件读取。
const { createHash, randomUUID } = require('node:crypto');
const BUDGET = Object.freeze({ test: 28800000, launch: 180000, navigation: 300000,
  action: 120000, rpc: 900000, observe: 1800000, outerRequiredSeconds: 32400 });
const STOP = new Set(['succeeded', 'awaiting_confirmation', 'failed', 'partial',
  'cancelled', 'blocked', 'waiting_user', 'unknown_result', 'paused']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (value, code) => { if (!value) throw Object.assign(new Error(code), { code }); };
const safeWord = value => String(value || 'UNKNOWN').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 96);
const stable = value => JSON.stringify(value);

function createMediaRepair(deps) {
  const { binding, owner, rpc, save, journal, writeBytes, fixture, expect } = deps;
  const b = binding && binding.finalCandidateBinding;
  check(binding?.executionAuthorized === true && b, 'PREPARATION_ONLY_NO_FINAL_BINDING');
  for (const k of ['sourceCommit', 'runtimeSha256', 'baseURL', 'rootId', 'ownedGroupId',
    'settingsRevision', 'beforeSnapshotSha256', 'performanceReleaseReceipt']) {
    check(b[k] !== undefined && b[k] !== null && b[k] !== '', 'MISSING_BINDING_' + k);
  }
  check(/^[a-f0-9]{40}$/.test(b.sourceCommit) && /^[a-f0-9]{64}$/.test(b.runtimeSha256), 'BAD_PACKAGE_BINDING');
  check(b.rootId !== 'qyb5ZR' && b.ownedGroupId !== 'grp-e80980cf-20', 'OLD_CANDIDATE_IDS_FORBIDDEN');
  check(binding.outerSeconds >= BUDGET.outerRequiredSeconds && binding.retry === 0 && binding.workers === 1,
    'OUTER_BUDGET_OR_SINGLE_WORKER_REQUIRED');
  check(typeof journal?.reserve === 'function' && typeof journal?.read === 'function', 'DURABLE_JOURNAL_REQUIRED');
  for (const name of ['preflight', 'readCallEvidence', 'readIsolation',
    'persistentDeadline', 'verifyCandidateSources', 'assertCardReadback', 'openRender',
    'previewContexts', 'decodeVideo', 'readSettings', 'assertSettingsUnavailable',
    'assertHumanImageReview', 'captureFailure']) {
    check(typeof fixture?.[name] === 'function', 'MISSING_REAL_ADAPTER_' + name);
  }
  const known = {};
  let stage = 'not_started';
  const record = async (key, value) => save(key, value); // 注入者须秘密清洗，禁止会话/headers落盘。
  async function call(page, id, input, deadline = Date.now() + BUDGET.rpc) {
    const remaining = deadline - Date.now();
    check(remaining >= BUDGET.action, 'OBSERVATION_DEADLINE_REACHED_NO_RESEND');
    return rpc(page, id, input, { groupId: b.ownedGroupId,
      timeout: Math.min(BUDGET.rpc, remaining), retry: 0 });
  }
  async function action(page, label, fn) {
    try {
      stage = 'preflight';
      await fixture.preflight(page, b, { phase: label, settingsWindow: binding.settingsWindow }); // 真包/source/runtime/六槽设置/actor/owned组/性能释放/前快照。
      await owner(page, b.ownedGroupId);
      await record(label + '/binding', { sourceCommit: b.sourceCommit, runtimeSha256: b.runtimeSha256,
        rootId: b.rootId, groupId: b.ownedGroupId, settingsRevision: b.settingsRevision,
        beforeSnapshotSha256: b.beforeSnapshotSha256, performanceReleaseReceipt: b.performanceReleaseReceipt });
      const value = await fn();
      await record(label + '/result', { status: 'COMPLETED_PENDING_HUMAN_REVIEW', ids: known, value });
      return value;
    } catch (error) {
      try { await fixture.captureFailure(page, { label, stage, ids: { ...known } }); }
      catch (captureError) { await record(label + '/capture-failure', { category: safeWord(captureError?.name) }); }
      await record(label + '/failure', { status: 'FAIL_OR_UNKNOWN', stage, ids: known,
        category: safeWord(error?.name), code: safeWord(error?.code),
        observedAt: new Date().toISOString(), retrySubmitted: false });
      throw error; // 不存原错误message/body，不吞失败，不自动重发/取消。
    }
  }
  async function submitOnce(page, label, operation, input) {
    const observationDeadlineAt = Date.now() + BUDGET.observe;
    // reserve必须原子地拒绝任何已存在记录（包括STARTED/丢回复），不能仅在PASS时去重。
    await journal.reserve(label, { operation, input, observationDeadlineAt, state: 'SUBMITTING' });
    stage = label + ':submitted_no_retry';
    const result = await call(page, operation, input);
    await record(label + '/submitted', { operation, input, result, observationDeadlineAt });
    if (result.taskId) known[label + 'AiTaskId'] = result.taskId;
    else if (result.id) known[label + 'AiTaskId'] = result.id;
    return { result, observationDeadlineAt };
  }
  async function observe(page, label, taskId, observationDeadlineAt) {
    check(Number.isFinite(observationDeadlineAt), 'ORIGINAL_OBSERVATION_DEADLINE_REQUIRED');
    let effectiveDeadline = observationDeadlineAt;
    for (;;) {
      const task = await call(page, 'ai.tasks.get', { params: { taskId } }, effectiveDeadline);
      const persistent = await fixture.persistentDeadline(page, task);
      // adapter仅从原公开持久证据读取；不可据当前时刻生成新期限。null明确为无公开期限证据。
      const deadline = persistent == null ? effectiveDeadline : Math.min(effectiveDeadline, persistent);
      effectiveDeadline = deadline;
      check(Number.isFinite(deadline), 'BAD_PERSISTENT_DEADLINE');
      await record(label + '/latest', { task, observedAt: new Date().toISOString(),
        observationDeadlineAt, persistentDeadlineAt: persistent, effectiveDeadlineAt: deadline });
      if (task.executionTaskId) known[label + 'ExecutionTaskId'] = task.executionTaskId;
      const status = task.runtimeStatus || task.status;
      if (STOP.has(status) || STOP.has(task.status)) {
        check(task.status === 'awaiting_confirmation' || task.status === 'succeeded', 'ORIGINAL_TASK_NOT_READY');
        return task;
      }
      check(deadline - Date.now() >= BUDGET.action, 'ORIGINAL_TASK_OBSERVATION_ENDED_UNKNOWN');
      await new Promise(resolve => setTimeout(resolve, 2000)); // 采样间隔不是执行上限。
    }
  }
  async function calls(page, taskId, label) {
    const evidence = await fixture.readCallEvidence(page, taskId);
    check(evidence?.complete === true && evidence.taskId === taskId && Array.isArray(evidence.calls),
      'REAL_NONCHAT_CALL_EVIDENCE_REQUIRED');
    check(evidence.calls.every(c => c.callId && c.status && c.sourceEvidenceRef), 'UNBOUND_CALL_EVIDENCE');
    await record(label, evidence);
    return evidence;
  }
  async function image(page, label, assetId, fileId) {
    const url = await call(page, 'assets.fileDownloadUrl', { params: { assetId, assetFileId: fileId } });
    const response = await page.request.get(url.url, { timeout: BUDGET.rpc });
    check(response.status() === 200, 'IMAGE_DOWNLOAD_FAILED');
    const bytes = await response.body();
    const decoded = await page.evaluate(async base64 => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))]));
      const value = { width: bitmap.width, height: bitmap.height }; bitmap.close(); return value;
    }, bytes.toString('base64'));
    check(decoded.width > 0 && decoded.height > 0, 'ACTUAL_IMAGE_DECODE_FAILED');
    await writeBytes(label + '/actual-image', bytes);
    const result = { assetId, fileId, bytes: bytes.length, sha256: sha(bytes), decoded };
    await record(label + '/file', result);
    return result;
  }

  async function setupImages(page) {
    // 每次写请求先持久预约；未知回复不再创建新实体，供C沿原key/原ID只读诊断。
    async function write(label, operation, input) {
      await journal.reserve('source-' + label, { operation, input, state: 'SUBMITTING' });
      const result = await call(page, operation, input);
      await record('images/source-' + label, { operation, input, result });
      if (result.id) known[label + 'Id'] = result.id;
      return result;
    }
    const project = await write('project', 'projects.create', { body: {
      title: '新包中性桌面媒体验收', brief: '用户明确输入：杯子、笔记本与整洁桌面，不声明真实经验或外部数据。' } });
    const coverOutput = await write('cover-output', 'projects.outputs.create', { params: { projectId: project.id },
      body: { title: '中性封面', contentType: 'video', clientRequestId: randomUUID() } });
    const script = await write('script', 'artifacts.create', { params: { projectId: project.id }, body: {
      title: '用户输入的中性口播稿', artifactType: 'output_script', stage: 'scripting', contentOutputId: coverOutput.id } });
    await write('script-version', 'artifacts.versions.create', { params: { artifactId: script.id }, body: {
      contentText: '整理桌面时，把杯子放稳，把合上的笔记本收在一边。留出一块空白，让下一次记录更轻松。',
      contentData: { sections: [{ id: 'desk-neutral', heading: '整理桌面', body: '把杯子放稳，把合上的笔记本收在一边。' }] },
      changeSummary: '测试用户明确输入的中性稿，不是ASR、AI生成或真实经验声明' } });
    const cardOutput = await write('card-output', 'projects.outputs.create', { params: { projectId: project.id },
      body: { title: '桌面中性图卡', contentType: 'article', targetPlatform: 'wechatOfficialAccount', clientRequestId: randomUUID() } });
    const initial = await call(page, 'articles.get', { params: { outputId: cardOutput.id } });
    const sectionId = randomUUID();
    const document = { schemaVersion: 1, title: '给桌面留出一块空白', summary: '用户明确输入的中性验收文字。',
      sections: [{ sectionId, order: 0, heading: '整理物品', headingLevel: 2,
        body: '桌面上放一只杯子和一本合上的笔记本。把物品摆齐，给记录留出一块空白。', sourceRefs: [] }],
      factItems: [], visualBriefs: [], imageUses: [] };
    const manual = await write('article-version', 'articles.versions.create', { params: { outputId: cardOutput.id },
      body: { expectedCurrentVersionId: initial.currentVersionId, document, clientRequestId: randomUUID() } });
    return { projectId: project.id, coverOutputId: coverOutput.id, scriptId: script.id,
      cardOutputId: cardOutput.id, cardVersionId: manual.versionId, sectionId, document };
  }

  async function generateImages(page) {
    return action(page, 'images', async () => {
      stage = 'public_source_setup';
      const source = await setupImages(page); // 真公开新project/output/script/article，用户中性文稿。
      check(source?.projectId && source.coverOutputId && source.cardOutputId && source.cardVersionId && source.sectionId,
        'REAL_PUBLIC_IMAGE_SOURCE_REQUIRED');
      await record('images/source', source);
      const baseline = await fixture.readIsolation(page, source);
      check(baseline?.allVersionsRead === true && baseline.otherPlatformRead === true, 'FULL_ISOLATION_REQUIRED');
      await record('images/isolation-before', baseline);
      const coverInput = { body: { taskType: 'cover.generate', attemptId: randomUUID(), inputData: {
        projectId: source.projectId, outputId: source.coverOutputId, contentOutputId: source.coverOutputId,
        userVisualRequirements: '简洁桌面主题：杯子与合上的笔记本；无未经来源支持的数字、承诺、人物或品牌。' } } };
      const cover = await submitOnce(page, 'cover', 'ai.tasks.create', coverInput);
      const coverTask = await observe(page, 'cover', cover.result.id, cover.observationDeadlineAt);
      check(coverTask.status === 'awaiting_confirmation', 'COVER_ALREADY_ADOPTED_CANNOT_TEST_ORIGINAL_CONFIRM');
      const results = await call(page, 'ai.tasks.results.list', { params: { taskId: coverTask.id } });
      const generated = results.filter(r => r.resultType === 'generated_asset');
      check(generated.length === 1 && generated[0].resultData.assetId, 'EXACT_COVER_ASSET_REQUIRED');
      await record('cover/original-task-results', { task: coverTask, results });
      const coverAsset = await call(page, 'assets.get', { params: { assetId: generated[0].resultData.assetId } });
      const coverFile = await image(page, 'cover', coverAsset.id, coverAsset.currentFileId);
      const coverCalls = await calls(page, coverTask.id, 'cover/calls-ready');
      await fixture.verifyCandidateSources(page, { source, task: coverTask, results, file: coverFile, calls: coverCalls });
      const cardInput = { params: { outputId: source.cardOutputId }, body: { kind: 'image_card',
        targetPlatform: 'wechatOfficialAccount', targetSectionId: source.sectionId, clientRequestId: randomUUID(),
        ruleOverrides: { visualRequirements: '简洁桌面插画：杯子与合上的笔记本，不新增数据、logo或人物。' } } };
      const card = await submitOnce(page, 'card', 'creativeResults.generate', cardInput);
      known.cardResultId = card.result.resultId;
      await observe(page, 'card', card.result.taskId, card.observationDeadlineAt);
      const candidate = await call(page, 'creativeResults.get', { params: { resultId: card.result.resultId } });
      check(candidate.status === 'awaiting_confirmation' && candidate.value?.length === 1, 'EXACT_CARD_CANDIDATE_REQUIRED');
      const value = candidate.value[0];
      await record('card/original-candidate', candidate);
      const cardFile = await image(page, 'card', value.assetId, value.assetFileId);
      const cardCalls = await calls(page, card.result.taskId, 'card/calls-ready');
      await fixture.verifyCandidateSources(page, { source, candidate, file: cardFile, calls: cardCalls });
      const ready = { source, coverTaskId: coverTask.id, coverFile, coverCalls,
        cardTaskId: card.result.taskId, cardResultId: candidate.resultId, cardFile, cardCalls,
        adoption: { params: { resultId: candidate.resultId }, body: {
          expected: { owner: 'wechat_article', versionId: source.cardVersionId },
          editedValue: candidate.value, clientRequestId: randomUUID() } } };
      check(ready.cardResultId === card.result.resultId, 'CARD_RESULT_ID_MISMATCH');
      await record('images/ready-original-candidates', ready);
      await record('images/isolation-ready', await fixture.readIsolation(page, source));
      return { state: 'READY_WAIT_C_EXCLUSIVE_SETTINGS_AND_HUMAN_IMAGE_REVIEW', ids: known };
    });
  }

  async function adoptReadyImages(page) {
    return action(page, 'adoption', async () => {
      const ready = await journal.read('images/ready-original-candidates');
      check(ready?.coverTaskId && ready.cardTaskId && ready.cardResultId, 'ORIGINAL_READY_IDS_REQUIRED');
      Object.assign(known, { coverAiTaskId: ready.coverTaskId, cardAiTaskId: ready.cardTaskId, cardResultId: ready.cardResultId });
      const window = binding.settingsWindow;
      check(window?.exclusive === true && window.otherModelLanesPaused === true && window.controllerReceipt,
        'C_EXCLUSIVE_SETTINGS_WINDOW_REQUIRED');
      stage = 'C_changed_settings_readonly_verify';
      const settings = await fixture.readSettings(page);
      await fixture.assertSettingsUnavailable(settings, window); // 原六槽/revision/不可用来源实际读回，runner不写settings。
      await record('adoption/settings-before', settings);
      await fixture.assertHumanImageReview(ready); // 人工实际看图记录，不能以PNG可解码冒质量。
      const beforeCover = await calls(page, ready.coverTaskId, 'adoption/cover-calls-before');
      const beforeCard = await calls(page, ready.cardTaskId, 'adoption/card-calls-before');
      await journal.reserve('cover-confirm', { taskId: ready.coverTaskId, state: 'SUBMITTING' });
      const coverReceipt = await call(page, 'ai.tasks.confirm', { params: { taskId: ready.coverTaskId } });
      await record('adoption/cover-original-receipt', coverReceipt);
      check(coverReceipt.status === 'succeeded', 'COVER_CONFIRM_FAILED');
      await journal.reserve('card-adopt', ready.adoption);
      const receipt = await call(page, 'creativeResults.adopt', ready.adoption);
      await record('adoption/card-original-receipt', receipt);
      check(receipt.status === 'adopted' && receipt.resultId === ready.cardResultId, 'CARD_ADOPT_FAILED');
      // 仅原body/key回执重放，不重新generate、不恢复settings绕readiness。
      const replay = await call(page, 'creativeResults.adopt', ready.adoption);
      check(stable(replay) === stable(receipt), 'ORIGINAL_RECEIPT_REPLAY_MISMATCH');
      await record('adoption/card-replayed-receipt', replay);
      const asset = await call(page, 'assets.get', { params: { assetId: ready.coverFile.assetId } });
      check(asset.status === 'active' && asset.currentFileId === ready.coverFile.fileId, 'COVER_FILE_ID_CHANGED');
      const coverFile = await image(page, 'adoption/cover', asset.id, asset.currentFileId);
      const cardFile = await image(page, 'adoption/card', ready.cardFile.assetId, ready.cardFile.fileId);
      check(coverFile.sha256 === ready.coverFile.sha256 && cardFile.sha256 === ready.cardFile.sha256, 'ADOPTED_BYTES_CHANGED');
      await fixture.assertCardReadback(page, ready, receipt); // 真articles.get、原section/title、唯一imageUse、版本/CAS。
      const afterCover = await calls(page, ready.coverTaskId, 'adoption/cover-calls-after');
      const afterCard = await calls(page, ready.cardTaskId, 'adoption/card-calls-after');
      check(stable(beforeCover.calls) === stable(afterCover.calls) && stable(beforeCard.calls) === stable(afterCard.calls), 'ADOPTION_NEW_MODEL_OR_CALL');
      const stillUnavailable = await fixture.readSettings(page);
      await fixture.assertSettingsUnavailable(stillUnavailable, window);
      await record('adoption/settings-after', stillUnavailable);
      await record('adoption/isolation-after', await fixture.readIsolation(page, ready.source));
      return { coverReceipt, receipt, noNewModelCalls: true, settingsRestorationOwnedByC: true };
    });
  }

  async function previewRender(page) {
    return action(page, 'render', async () => {
      const original = binding.renderCandidate;
      check(original?.taskId && original.projectId && original.outputId && original.artifactPath && original.sourceEvidenceRef,
        'NEW_PACKAGE_REAL_RENDER_CANDIDATE_REQUIRED');
      known.renderTaskId = original.taskId;
      stage = 'read_original_render_no_resend';
      const before = await call(page, 'execution.tasks.get', { params: { taskId: original.taskId } });
      const results = await call(page, 'ai.tasks.results.list', { params: { taskId: original.taskId } });
      const renderCallsBefore = await calls(page, original.taskId, 'render/calls-before');
      await record('render/original-task-results', { task: before, results, inputEvidenceRef: original.sourceEvidenceRef });
      check(before.status === 'awaiting_confirmation' && before.manifest, 'ORIGINAL_RENDER_NOT_READY');
      const artifact = before.manifest.artifacts.find(a => a.path === original.artifactPath);
      check(artifact?.mimeType?.startsWith('video/'), 'REAL_MANIFEST_VIDEO_REQUIRED');
      const previewPath = '/api/v1/local/execution-preview/' + encodeURIComponent(original.taskId) + '/' +
        artifact.path.split('/').map(encodeURIComponent).join('/');
      const contexts = await fixture.previewContexts(page, b); // 真新包request上下文，headers/cookies由C私密适配。
      let bytes;
      for (const mode of ['groupHeader', 'groupCookie', 'legalAccountFilter']) {
        check(contexts[mode], 'MISSING_AUTH_CONTEXT_' + mode);
        const response = await contexts[mode].get(previewPath, { timeout: BUDGET.rpc });
        check(response.status() === 200, 'PREVIEW_' + mode + '_NOT_200');
        const current = await response.body();
        check(Number(response.headers()['content-length']) === current.length, 'GET_LENGTH_MISMATCH');
        if (bytes) check(sha(bytes) === sha(current), 'AUTH_MODE_BYTES_MISMATCH'); else bytes = current;
        await record('render/http-' + mode, { status: response.status(), bytes: current.length, sha256: sha(current) });
      }
      const request = contexts.groupHeader;
      const end = Math.min(31, bytes.length - 1);
      check(end >= 0, 'EMPTY_REAL_RENDER');
      const range = await request.get(previewPath, { headers: { Range: 'bytes=0-' + end }, timeout: BUDGET.rpc });
      check(range.status() === 206 && range.headers()['content-range'] === `bytes 0-${end}/${bytes.length}`,
        'REAL_RANGE_HEADERS_FAILED');
      check((await range.body()).equals(bytes.subarray(0, end + 1)), 'RANGE_BYTES_MISMATCH');
      // 真实HTTP HEAD到Next服务器；绝不import route / GET(new Request({method:HEAD}))。
      const head = await request.head(previewPath, { timeout: BUDGET.rpc });
      const rangedHead = await request.head(previewPath, { headers: { Range: 'bytes=0-' + end }, timeout: BUDGET.rpc });
      check(head.status() === 200 && (await head.body()).length === 0 &&
        Number(head.headers()['content-length']) === bytes.length, 'ACTUAL_NEXT_HEAD_FAILED');
      check(rangedHead.status() === 206 && (await rangedHead.body()).length === 0 &&
        rangedHead.headers()['content-range'] === range.headers()['content-range'] &&
        Number(rangedHead.headers()['content-length']) === end + 1, 'ACTUAL_NEXT_RANGE_HEAD_FAILED');
      await record('render/actual-next-head', { transport: 'actual HTTP HEAD to bound Next server',
        headStatus: head.status(), headBodyBytes: 0, contentLength: bytes.length,
        rangeStatus: rangedHead.status(), rangeBodyBytes: 0, range: range.headers()['content-range'] });
      for (const [name, status] of [['foreignGroup', 404], ['noSession', 401]]) {
        check(contexts[name], 'MISSING_REJECTION_CONTEXT_' + name);
        const rejected = await contexts[name].get(previewPath, { timeout: BUDGET.rpc });
        check(rejected.status() === status, 'PREVIEW_AUTH_REJECTION_' + name);
        await record('render/reject-' + name, { status: rejected.status() });
      }
      const taskAfterReads = await call(page, 'execution.tasks.get', { params: { taskId: original.taskId } });
      const resultsAfterReads = await call(page, 'ai.tasks.results.list', { params: { taskId: original.taskId } });
      check(stable(before) === stable(taskAfterReads) && stable(results) === stable(resultsAfterReads), 'PREVIEW_MUTATED_TASK');
      stage = 'actual_browser_play_original_candidate';
      const card = await fixture.openRender(page, original);
      const video = card.locator('video');
      await expect(video).toBeVisible({ timeout: BUDGET.action });
      await expect.poll(() => video.evaluate(v => v.readyState >= 2 && v.videoWidth > 0 && Number.isFinite(v.duration)),
        { timeout: BUDGET.action }).toBe(true);
      const srcPath = await video.evaluate(v => new URL(v.currentSrc, location.href).pathname);
      check(srcPath === previewPath, 'PLAYER_NOT_ORIGINAL_RENDER');
      const start = await video.evaluate(v => v.currentTime);
      await video.evaluate(v => v.play());
      await expect.poll(() => video.evaluate(v => v.currentTime), { timeout: BUDGET.action }).toBeGreaterThan(start + 0.1);
      await video.evaluate(v => v.pause());
      await record('render/player', await video.evaluate(v => ({ currentTime: v.currentTime,
        duration: v.duration, width: v.videoWidth, height: v.videoHeight, readyState: v.readyState })));
      await journal.reserve('render-confirm', { taskId: original.taskId, state: 'SUBMITTING' });
      const receipt = await call(page, 'execution.tasks.confirm', { params: { taskId: original.taskId } });
      await record('render/confirm-receipt', receipt);
      const adopted = await call(page, 'execution.tasks.get', { params: { taskId: original.taskId } });
      check(adopted.status === 'succeeded' && adopted.adoptedAssetIds.length > 0, 'ORIGINAL_RENDER_NOT_ADOPTED');
      check(adopted.adoptedAssetIds.length === 1, 'EXACT_RENDER_ASSET_REQUIRED');
      const renderCallsAfter = await calls(page, original.taskId, 'render/calls-after');
      check(stable(renderCallsBefore.calls) === stable(renderCallsAfter.calls), 'RENDER_PREVIEW_ADOPT_NEW_MODEL_OR_CALL');
      const asset = await call(page, 'assets.get', { params: { assetId: adopted.adoptedAssetIds[0] } });
      const dl = await call(page, 'assets.fileDownloadUrl', { params: { assetId: asset.id, assetFileId: asset.currentFileId } });
      const response = await page.request.get(dl.url, { timeout: BUDGET.rpc });
      check(response.status() === 200, 'ADOPTED_VIDEO_DOWNLOAD_FAILED');
      const downloaded = await response.body();
      check(sha(downloaded) === sha(bytes), 'ADOPTED_RENDER_DIFFERS_FROM_PREVIEW');
      const filename = await writeBytes('render/adopted.mp4', downloaded);
      const decoded = await fixture.decodeVideo(filename, { timeout: BUDGET.rpc }); // 真ffprobe+完整ffmpeg解码，非容器header。
      check(decoded?.fullDecode === true && decoded.videoFrames > 0 && decoded.duration > 0, 'FULL_VIDEO_DECODE_REQUIRED');
      await record('render/final', { originalTaskId: original.taskId, assetId: asset.id, fileId: asset.currentFileId,
        sha256: sha(downloaded), bytes: downloaded.length, decoded, sameCandidateAdopted: true });
      return { originalTaskId: original.taskId, assetId: asset.id, actualNextHead: true, actualPlayback: true };
    });
  }
  return { generateImages, adoptReadyImages, previewRender };
}

function registerMediaRepair({ test, phase, ...deps }) {
  check(['generateImages', 'adoptReadyImages', 'previewRender'].includes(phase), 'EXACT_ONE_PHASE_PER_INVOCATION');
  const runner = createMediaRepair(deps);
  // 每个薄spec只注册一个8h case；不能一次注册三例却仍引用9h outer。
  test('T1316新包原真实媒体链 ' + phase, async ({ page }) => {
    test.setTimeout(BUDGET.test);
    page.setDefaultTimeout(BUDGET.action);
    page.setDefaultNavigationTimeout(BUDGET.navigation);
    await runner[phase](page);
  });
}
module.exports = { BUDGET, createMediaRepair, registerMediaRepair };
