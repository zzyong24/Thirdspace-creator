"use strict";
const fs = require('node:fs');
const {createSuite} = require('./harness.cjs');
const {test, expect, harness, binding} = createSuite(['U03-vision', 'U08-vision', 'U09-vision', 'U20-vision', 'U22-vision']);
const routes = {'U03-vision': ['topics', 'vision:topic.generate'], 'U08-vision': ['calibration', 'vision:calibration.diagnose'], 'U09-vision': ['positioning', 'vision:positioning.generate'], 'U20-vision': ['review', 'vision:review.insights'], 'U22-vision': ['knowledge-distill', 'vision:knowledge.distill']};
test('新包实际带图页面或公开深链 ' + binding.caseId, async ({page}) => {
  const h = harness(page); await h.owner();
  const image = binding.image; if (!image?.path || !image.sha256 || !image.reviewDescription) throw Error('REAL_OWNED_IMAGE_INPUT_REQUIRED');
  expect(h.sha(fs.readFileSync(image.path))).toBe(image.sha256);
  const [surface, routeKey] = routes[binding.caseId];
  if (binding.caseId === 'U03-vision') {await page.goto('/topics'); await page.getByTestId('topics-generate-positioning').click();}
  if (binding.caseId === 'U09-vision') {await page.goto('/positioning'); await page.getByTestId('positioning-open-copilot').click();}
  if (binding.caseId === 'U22-vision') {
    await page.goto('/knowledge'); const button = page.locator('[data-slot="knowledge-distill"]');
    if (!(await button.isVisible())) await page.locator('summary').filter({hasText: '录入与整理'}).click();
    await button.click();
  }
  if (binding.caseId === 'U08-vision') await page.goto('/projects/' + h.scope.projectId + '/script?copilot=open&surface=calibration');
  if (binding.caseId === 'U20-vision') await page.goto('/projects/' + h.scope.projectId + '/review?copilot=open&surface=review&selKind=project&selId=' + encodeURIComponent(h.scope.projectId));
  await h.mirrors(); const dialog = page.locator('[data-slot="ai-copilot-dialog"]'); await expect(dialog).toBeVisible(); await dialog.getByRole('button', {name: '新对话', exact: true}).click();
  await dialog.locator('[data-slot="copilot-attachment-picker"] input[type=file]').setInputFiles(image.path);
  // 以真实上传ready附件和实际发送attachmentIds为真值，不猜内部上传端点。
  await expect(dialog.locator('[data-slot="copilot-attachment-picker"]')).not.toContainText('上传中', {timeout: h.remaining()});
  const turn = await h.submit(dialog, '请先阅读这张真实附件图片，说明图中实际可见的内容，并结合当前页面已有材料说明一条有依据的建议；缺少事实就明确未知，不补经历、数字或成效，不联网。', binding.caseId);
  expect(turn.request.chatContext.surface).toBe(surface); expect(turn.request.attachmentIds?.length).toBeGreaterThan(0);
  if (binding.caseId === 'U20-vision') expect(turn.request.chatContext.projectId).toBe(h.scope.projectId);
  const messages = await h.rpc('ai.conversations.messages.list', {params: {conversationId: turn.ids.conversationId}}), source = messages.find(m => m.id === turn.ids.sourceMessageId);
  expect(source).toBeTruthy(); expect(source.attachments).toEqual(turn.request.attachmentIds);
  for (const assetId of turn.request.attachmentIds) {const asset = await h.rpc('assets.get', {params: {assetId}}); expect(asset.assetType).toBe('image'); h.save('uploaded-image-' + assetId, asset);} expect(turn.assistant.content.trim().length).toBeGreaterThan(0);
  await page.reload(); expect((await h.rpc('ai.conversations.messages.list', {params: {conversationId: turn.ids.conversationId}})).find(m => m.id === turn.assistant.id)).toEqual(turn.assistant);
  const frozenProven = await h.frozenRoute(turn.ids, {routeKey});
  h.save('vision-business-result', {ids: turn.ids, actualSurface: surface, routeKeyExpectedOnly: routeKey, entryKind: ['U08-vision', 'U20-vision'].includes(binding.caseId) ? 'PUBLIC_DEEPLINK_WITH_IMAGE_NOT_PAGE_BUTTON' : 'REAL_PAGE_UI_WITH_IMAGE', attachmentIds: turn.request.attachmentIds, uiAttachmentRoundtrip: true, frozenVisionRouteProven: frozenProven, frozenRouteState: frozenProven ? 'PROVEN_BY_BOUND_SERVER_EVIDENCE' : 'UNKNOWN_OBSERVABILITY_LIMIT', imageReviewDescription: image.reviewDescription, imageGroundingReviewRequired: true, notSubstitutingOrdinaryNode: true});
  await page.screenshot({path: require('node:path').join(binding.outputDirectory, 'final-ui.png'), timeout: Math.min(120000, h.remaining()), animations: 'disabled'});
});
