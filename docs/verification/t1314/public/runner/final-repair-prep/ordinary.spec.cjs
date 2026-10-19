"use strict";
const {createSuite} = require('./harness.cjs');
const {test, expect, harness, binding} = createSuite(['U08', 'U10', 'U18', 'U19', 'U20']);
const normalizePart = p => p.output?.data ?? p.output;
function outputOf(turn, kind) {const found = turn.assistant.parts.find(p => normalizePart(p)?.kind === kind); expect(found, '真实tool output缺失，不按模型自述推断').toBeTruthy(); const output = normalizePart(found); expect(output.error ?? null).toBeNull(); return output;}
function keepPlatforms(before, after) {expect(after.article).toEqual(before.article); expect(after.graphic).toEqual(before.graphic);}
function appendOnly(before, after) {for (const v of before.versions) expect(after.versions.find(x => x.id === v.id)).toEqual(v); expect(after.artifact.currentVersionId).not.toBe(before.artifact.currentVersionId); expect(after.versions.length).toBeGreaterThan(before.versions.length); keepPlatforms(before, after);}
test('新包普通内容修复验收 ' + binding.caseId, async ({page}) => {
  const h = harness(page); await h.owner();
  if (binding.caseId === 'U08') {
    const rail = await h.rail(), before = await h.state();
    const beforePredictions = await h.rpc('calibration.predictions.list', {query: {page: 1, pageSize: 100}});
    const turn = await h.trigger(() => page.getByRole('button', {name: '先盲预测', exact: true}).click(), 'U08/ordinary-node');
    const diagnosis = outputOf(turn, 'calibration.diagnosis');
    const dimensions = diagnosis.diagnosis?.dimensions;
    expect(Array.isArray(dimensions)).toBe(true); expect(dimensions.length).toBeGreaterThan(0);
    expect(dimensions.some(d => ['persona', 'cta', 'product_path', 'conversion', 'altruism'].includes(d.key))).toBe(true);
    h.save('U08/actual-diagnosis', diagnosis);
    const card = rail.locator('[data-slot="chat-diagnosis-card"]').last(); await expect(card).toBeVisible();
    const childResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/dispatch' && r.request().postDataJSON()?.id === 'ai.tasks.create', {timeout: h.remaining()});
    await card.locator('[data-slot="chat-diagnosis-lock"]').click();
    const reply = await childResponse, body = await reply.json(); expect(reply.status()).toBe(200);
    const child = body.data; h.save('U08/lock-child-submission', child);
    expect(child.taskType).toBe('calibration.diagnose');
    await h.task(child.id, 'U08/lock-child');
    await expect(card.locator('[data-slot="chat-diagnosis-locked"]')).toBeVisible({timeout: h.remaining()});
    const rows = await h.rpc('calibration.predictions.list', {query: {page: 1, pageSize: 100}});
    const added = rows.filter(p => !beforePredictions.some(old => old.id === p.id) && p.subjectType === child.inputData.subjectType && p.subjectId === child.inputData.subjectId);
    expect(added).toHaveLength(1); expect(added[0].status).toBe('locked');
    const prediction = await h.rpc('calibration.predictions.get', {params: {predictionId: added[0].id}}); expect(prediction).toEqual(added[0]);
    h.save('U08/original-locked-prediction', {prediction, childTaskId: child.id, sourceTurn: turn.ids});
    await page.reload(); expect(await h.rpc('calibration.predictions.get', {params: {predictionId: prediction.id}})).toEqual(prediction);
    const after = await h.state(); expect(after).toEqual(before);
    if (binding.allowNewDiagnosisScore === true) {
      const scored = await h.rpc('ai.tasks.create', {body: {taskType: 'calibration.score', attemptId: require('node:crypto').randomUUID(), inputData: {predictionId: prediction.id}}}); h.save('U08/score-submission', scored);
      const score = await h.task(scored.id, 'U08/score'); expect(score.results.some(r => r.resultType === 'calibration_score')).toBe(true);
      h.save('U08/score-with-actual-metrics', score.results); expect(await h.rpc('calibration.predictions.get', {params: {predictionId: prediction.id}})).toEqual(prediction);
    } else h.save('U08/score-coverage', {state: 'NOT_RUN', reason: '最终绑定未授权新评分；不得由普通节点锁定代签评分'});
  }
  if (binding.caseId === 'U10') {
    const rail = await h.rail(), before = await h.state(); h.save('U10/before', before);
    const hooks = await h.submit(rail, '请调用script.hooks，为当前真实已保存项目给出3条可采纳开场候选。严格依据原稿，不编经历或数字，不联网。', 'U10/hooks');
    const hookCard = rail.locator('[data-slot="chat-hook-card"]').last(); await expect(hookCard.locator('[data-slot="chat-hook-write"]').first()).toBeEnabled(); expect(await h.state()).toEqual(before);
    await hookCard.locator('[data-slot="chat-hook-write"]').first().click(); await expect(hookCard.locator('[data-slot="chat-hook-written"]')).toBeVisible();
    const afterHooks = await h.state(); appendOnly(before, afterHooks); h.save('U10/after-hooks', {source: hooks.ids, state: afterHooks});
    const draft = await h.submit(rail, '请调用script.draft，mode=generate，根据当前已保存稿和项目真实材料给出一份可采纳完整分镜脚本；不编经历、数据或时长证据，不联网。', 'U10/draft');
    const dispatch = outputOf(draft, 'script.draft'); expect(dispatch.taskId).toBeTruthy(); h.save('U10/draft-dispatch', dispatch);
    await h.task(dispatch.taskId, 'U10/draft-child');
    const card = rail.locator('[data-slot="chat-script-draft-card"]').last(); await expect(card.locator('[data-slot="chat-script-write"]')).toBeEnabled({timeout: h.remaining()});
    expect(await h.state()).toEqual(afterHooks);
    await card.locator('[data-slot="chat-script-write"]').click(); await expect(card.locator('[data-slot="chat-script-done"]')).toBeVisible({timeout: h.remaining()});
    const after = await h.state(); appendOnly(afterHooks, after); h.save('U10/after-draft', after); await page.reload(); expect(await h.state()).toEqual(after);
  }
  if (binding.caseId === 'U18') {
    const rail = await h.rail(), before = await h.state(); h.save('U18/before', before);
    const turn = await h.submit(rail, '请调用review.script审核当前已保存的完整脚本，给出真实审核报告，不应用改写、不修改原稿、不对外发布。', 'U18/review');
    const dispatch = outputOf(turn, 'review.report'); expect(dispatch.taskId).toBeTruthy();
    await h.task(dispatch.taskId, 'U18/child', false); // review的业务报告不要求ai.results非空。
    const report = await h.rpc('scriptReviews.getLatest', {params: {projectId: h.scope.projectId}}), current = before.versions.find(v => v.id === before.artifact.currentVersionId);
    expect(current).toBeTruthy(); expect(report.projectId).toBe(h.scope.projectId); expect(report.artifactId).toBe(before.artifact.id); expect(report.artifactVersion).toBe(current.versionNumber);
    h.save('U18/report-tuple', {report, artifactId: current.artifactId, currentVersionId: current.id, versionNumber: current.versionNumber, sourceTurn: turn.ids, taskId: dispatch.taskId});
    await expect(rail.locator('[data-slot="chat-review-report-card"]')).toBeVisible({timeout: h.remaining()}); expect(await h.state()).toEqual(before);
    await page.reload(); expect(await h.rpc('scriptReviews.getLatest', {params: {projectId: h.scope.projectId}})).toEqual(report); expect(await h.state()).toEqual(before);
  }
  if (binding.caseId === 'U19') {
    const rail = await h.rail(), before = await h.state();
    const turn = await h.submit(rail, '请调用publish.package，为当前已经保存的完整脚本准备抖音标题、简介、标签、封面文案与审核结论，仅站内预览并等待采用，不对外发布；没有真实目标账号时明确待选号。', 'U19/package');
    const dispatch = outputOf(turn, 'publish.package'); expect(dispatch.taskId).toBeTruthy(); const child = await h.task(dispatch.taskId, 'U19/child');
    const card = rail.locator('[data-slot="chat-publish-package-card"]').last(); await expect(card.locator('[data-slot="chat-publish-adopt"]')).toBeEnabled({timeout: h.remaining()});
    h.save('U19/before-adopt', {state: before, child});
    await card.locator('[data-slot="chat-publish-adopt"]').click(); await expect(card.locator('[data-slot="chat-publish-done"]')).toBeVisible({timeout: h.remaining()});
    const material = await h.rpc('artifacts.list', {params: {projectId: h.scope.projectId}, query: {page: 1, pageSize: 100}});
    // DTO集合随真实合同保存；不把无account站内物料当外部Publication。
    h.save('U19/material-readback', material);
    const candidate = child.results.find(x => x.resultType === 'publication_drafts'); expect(candidate).toBeTruthy();
    const drafts = candidate.resultData.drafts; expect(drafts.length).toBeGreaterThan(0);
    const draft = drafts.find(x => x.platform === 'douyin') || drafts[0];
    const outputId = candidate.resultData.outputId || child.task.inputData.outputId; expect(outputId).toBeTruthy();
    const targets = material.filter(x => x.artifactType === 'platform_copy' && x.contentOutputId === outputId); expect(targets).toHaveLength(1);
    const target = await h.rpc('artifacts.get', {params: {artifactId: targets[0].id}});
    const versions = await h.rpc('artifacts.versions.list', {params: {artifactId: target.id}, query: {page: 1, pageSize: 100}}), current = versions.find(x => x.id === target.currentVersionId); expect(current).toBeTruthy();
    expect(current.contentText).toBe(draft.body); expect(current.contentData).toMatchObject({outputId, platform: draft.platform, title: draft.title, description: draft.body, platformTags: draft.tags, needsTarget: true});
    h.save('U19/exact-unassigned-material', {artifact: target, currentVersion: current, actualSourceTaskId: child.task.id, outputId});
    const outputs = await h.rpc('projects.outputs.list', {params: {projectId: h.scope.projectId}}), publications = [];
    for (const output of outputs) publications.push({outputId: output.id, rows: await h.rpc('outputs.publications.list', {params: {outputId: output.id}, query: {page: 1, pageSize: 100}})});
    expect(publications.find(x => x.outputId === outputId)?.rows).toEqual([]);
    h.save('U19/publications-readback', {publications, externalPublishInvoked: false, accountId: null, platformLandingVerified: false});
    const after = await h.state(); expect(after).toEqual(before); await page.reload(); expect(await h.state()).toEqual(after);
    h.save('U19/coverage', {stationDraftObserved: true, externalPublication: 'NOT_RUN', targetAccount: 'BLOCKED_NO_REAL_ACCOUNT'});
  }
  if (binding.caseId === 'U20') {
    const rail = await h.rail('review'), before = await h.state();
    const main = page.locator('main[data-page="analytics-review"]'); await expect(main).toBeVisible();
    const turn = await h.trigger(() => main.locator('[data-slot="review-analyze-primary"]').click(), 'U20/button');
    expect(turn.request.chatContext.functionKey).toBe('review.analyze'); expect(turn.request.chatContext.projectId).toBe(h.scope.projectId);
    const output = outputOf(turn, 'learning_list');
    expect(turn.assistant.parts.some(p => p.toolName === 'review.analyze' || ['tool-review.analyze', 'tool-review_analyze'].includes(p.type))).toBe(true);
    h.save('U20/button-node-output', {ids: turn.ids, actualOutput: output, independentAnalysisNotSubstituted: true, zeroLearningAllowed: true});
    expect(await h.state()).toEqual(before); await expect(rail).toBeVisible(); await page.reload(); expect(await h.state()).toEqual(before);
  }
  await page.screenshot({path: require('node:path').join(binding.outputDirectory, 'final-ui.png'), timeout: Math.min(120000, h.remaining()), animations: 'disabled'});
  h.save('case-result', {caseId: binding.caseId, state: 'PUBLIC_BUSINESS_ASSERTIONS_COMPLETED', sourceHead: binding.sourceHead, actualVisualAndSemanticReviewStillRequired: true});
});
