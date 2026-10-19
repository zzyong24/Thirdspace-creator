'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { test: originalTest, expect, session, binding, dispatch } = require('../../../candidate/driver/public-fixture.cjs');
const test = originalTest.extend({
  context: async ({}, use) => {
    const { chromium } = createRequire(path.join(binding.sourceRoot, 'frontend/package.json'))('@playwright/test');
    const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, timeout: 180000,
      baseURL: session.baseURL, viewport: { width: 1366, height: 900 },
      extraHTTPHeaders: { 'x-creatoros-handshake': session.handshake } });
    context.setDefaultTimeout(120000); context.setDefaultNavigationTimeout(300000);
    try { await use(context); } finally { await context.close(); }
  },
});
const root = path.join(binding.sourceRoot, 'docs/verification/t1303/acceptance/runs/recovery2-8ced635/a');
const handoff = JSON.parse(fs.readFileSync(path.join(root, '../b/HANDOFF.json'), 'utf8'));
const events = [], results = [];
let phase = 'setup', activePage;
const clean = value => typeof value === 'string' ? value.split(session.handshake).join('[REDACTED_OWNED_TEST_HANDSHAKE]') : value;
function save(name, value) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(root, name + '.json'), JSON.stringify(value, (_k, v) => clean(v), 2) + '\n', { mode: 0o600 });
}
async function snap(page, name) {
  const file = path.join(root, name + '.png');
  await page.screenshot({ path: file, animations: 'disabled', caret: 'hide', timeout: 120000 });
  fs.writeFileSync(path.join(root, name + '.html'), clean(await page.content()), { mode: 0o600 });
  fs.writeFileSync(path.join(root, name + '.aria.txt'), clean(await page.locator('body').ariaSnapshot()), { mode: 0o600 });
  save(name + '-meta', { phase, url: page.url(), viewport: page.viewportSize(), at: new Date().toISOString() });
}
async function metrics(page, cdp, name) {
  const m = await cdp.send('Page.getLayoutMetrics');
  const dom = await page.evaluate(() => ({ innerWidth, innerHeight, devicePixelRatio,
    rootZoom: getComputedStyle(document.documentElement).zoom, bodyZoom: getComputedStyle(document.body).zoom,
    visualViewport: { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale },
    documentWidth: document.documentElement.scrollWidth }));
  save(name, { cdp: m, dom, at: new Date().toISOString() });
  return { m, dom };
}
async function trial(name, fn) {
  phase = name;
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', error: clean(String(error)), stack: clean(error.stack) }); await snap(activePage, name + '-failure').catch(() => {}); }
  save('checks', results);
}
async function readAll(page) {
  const rpc = (id, input) => dispatch(page, id, input, handoff.groupId);
  return {
    article: await rpc('articles.get', { params: { outputId: handoff.articleId } }),
    graphic: await rpc('graphicPosts.get', { params: { outputId: handoff.graphicId } }),
    scripts: await rpc('artifacts.versions.list', { params: { artifactId: handoff.scriptId }, query: { page: 1, pageSize: 100 } }),
  };
}
async function openOwner(page, kind, viewport, conversation = 'joint1') {
  await page.setViewportSize(viewport);
  await page.goto(kind === 'article' ? handoff.articleUrl : handoff.graphicUrl);
  await expect(page.locator(`[data-page="${kind === 'article' ? 'article' : 'graphic-post'}-workbench"]`)).toBeVisible();
  const mobile = page.getByRole('button', { name: '打开编导', exact: true });
  const rail = page.getByRole('button', { name: '展开编导栏', exact: true });
  if (await mobile.isVisible()) await mobile.click();
  else if (await rail.isVisible()) await rail.click();
  await page.getByRole('button', { name: '历史记录', exact: true }).click();
  await page.locator(`[data-slot="copilot-history-item"][data-conversation-id="${handoff.turns[conversation].ids.conversationId}"]`).click();
  const region = page.getByRole('region', { name: conversation === 'editor' ? '编导编辑候选' : '文章和图文联合候选', exact: true });
  await expect(region).toBeVisible();
  const card = conversation === 'editor' ? region : region.locator('article').filter({ has: page.getByRole('heading', { name: kind === 'article' ? '文章候选' : '图文候选', exact: true }) });
  await expect(card).toHaveCount(1);
  return card;
}
async function preview(page, card, kind, editor = false) {
  const button = card.getByRole('button', { name: editor ? '预览改动' : '预览候选', exact: true });
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: editor ? '文章改动预览' : kind === 'article' ? '文章候选预览' : '图文候选预览', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: kind === 'article' ? '复制公众号文章' : '导出分页 ZIP', exact: true })).toBeEnabled();
  return { dialog, button };
}
async function walk(page, kind, viewport, label, conversation = 'joint1', closeAction = 'Escape') {
  const card = await openOwner(page, kind, viewport, conversation);
  await snap(page, label + '-outside');
  const { dialog, button } = await preview(page, card, kind, conversation === 'editor');
  await expect(dialog.getByRole('region', { name: '本次采纳选择', exact: true })).toHaveCount(0);
  const initialFocus = await page.evaluate(() => ({ tag: document.activeElement.tagName, text: document.activeElement.textContent?.slice(0, 200), inDialog: !!document.activeElement.closest('[role="dialog"]') }));
  expect(initialFocus.inDialog).toBe(true);
  await snap(page, label + '-modal-collapsed');
  const summary = dialog.locator('summary').filter({ hasText: /^本次采纳选择$/ });
  await summary.focus(); await page.keyboard.press('Enter');
  const selection = dialog.getByRole('region', { name: '本次采纳选择', exact: true });
  await expect(selection).toBeVisible();
  const boxes = selection.getByRole('checkbox');
  expect(await boxes.count()).toBeGreaterThan(0);
  const defaults = await boxes.evaluateAll(nodes => nodes.map(n => ({ label: n.parentElement.textContent, checked: n.checked, disabled: n.disabled })));
  const unlocked = boxes.filter({ visible: true });
  const first = unlocked.first();
  if (!(await first.isDisabled())) { await first.focus(); await page.keyboard.press('Space'); }
  const afterChoice = await boxes.evaluateAll(nodes => nodes.map(n => ({ label: n.parentElement.textContent, checked: n.checked, disabled: n.disabled })));
  const focusTrail = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => ({ tag: document.activeElement.tagName, text: (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || '').slice(0, 100), inDialog: !!document.activeElement.closest('[role="dialog"]') }));
    focusTrail.push(focused); expect(focused.inDialog).toBe(true);
  }
  await snap(page, label + '-selection-keyboard');
  const scrollBefore = await dialog.evaluate(node => [node, ...node.querySelectorAll('*')].filter(n => n.scrollHeight > n.clientHeight + 2).map(n => { const r = n.getBoundingClientRect(); return { tag: n.tagName, cls: String(n.className), top: n.scrollTop, height: n.clientHeight, scrollHeight: n.scrollHeight, rect: { x: r.x, y: r.y, width: r.width, height: r.height } }; }));
  save(label + '-scroll-before', scrollBefore);
  if (scrollBefore.length) {
    const scroller = scrollBefore[0], r = scroller.rect;
    await page.mouse.move(r.x + r.width - 12, Math.max(30, Math.min(viewport.height - 30, r.y + r.height * 0.5)));
    await page.mouse.wheel(0, scroller.top + scroller.height < scroller.scrollHeight - 2 ? 700 : -700);
    await expect.poll(async () => JSON.stringify(await dialog.evaluate(node => [node, ...node.querySelectorAll('*')].filter(n => n.scrollHeight > n.clientHeight + 2).map(n => n.scrollTop))), { timeout: 120000 }).not.toBe(JSON.stringify(scrollBefore.map(n => n.top)));
  }
  await snap(page, label + '-scrolled');
  if (closeAction === 'Escape') await page.keyboard.press('Escape');
  else await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(dialog).toBeHidden();
  save(label + '-close-immediate', await page.evaluate(() => ({ active: { tag: document.activeElement.tagName, label: document.activeElement.getAttribute('aria-label'), text: document.activeElement.textContent?.slice(0, 200) }, dialogs: [...document.querySelectorAll('[role="dialog"]')].map(n => n.textContent?.slice(0, 100)), openAssistant: [...document.querySelectorAll('button')].filter(n => n.textContent === '打开编导').length, candidateRegions: [...document.querySelectorAll('[role="region"]')].filter(n => /候选/.test(n.getAttribute('aria-label') || '')).length })));
  await snap(page, label + '-after-close');
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter'); await expect(dialog).toBeVisible();
  await summary.focus(); await page.keyboard.press('Enter'); await expect(selection).toBeVisible();
  expect(await boxes.evaluateAll(nodes => nodes.map(n => ({ label: n.parentElement.textContent, checked: n.checked, disabled: n.disabled })))).toEqual(afterChoice);
  if (closeAction === 'Escape') await page.keyboard.press('Escape');
  else await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(dialog).toBeHidden(); await expect(button).toBeFocused();
  save(label + '-keyboard-scroll', { initialFocus, focusTrail, defaults, afterChoice, restoredChoice: true, closeAction, focusReturned: true, scrollBefore, newContextBusinessConfirmation: false });
}
async function sourceFailure(page) {
  const card = await openOwner(page, 'article', { width: 1366, height: 900 }, 'editor');
  let release, intercepted = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const handler = async route => {
    if (route.request().postDataJSON()?.id === 'ai.workCandidates.source') {
      intercepted++; await gate; await route.abort('connectionfailed');
    } else await route.fallback();
  };
  await page.route('**/api/v1/dispatch', handler);
  try {
    await card.getByRole('button', { name: '预览改动', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '文章改动预览', exact: true });
    await expect(dialog.getByText('正在核对原候选来源与稿件版本…', { exact: true })).toBeVisible();
    await snap(page, 'editor-source-loading');
    release();
    await expect(dialog.getByRole('alert')).toBeVisible(); await snap(page, 'editor-source-error');
    expect(intercepted).toBe(1);
    await page.unroute('**/api/v1/dispatch', handler);
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    const retried = await preview(page, card, 'article', true);
    await expect(retried.dialog.locator('summary').filter({ hasText: /^本次采纳选择$/ })).toBeVisible();
    await snap(page, 'editor-source-recovered');
    await page.keyboard.press('Escape'); await expect(retried.dialog).toBeHidden(); await expect(retried.button).toBeFocused();
    save('source-failure-result', { injection: '仅暂持真实只读来源请求，截图loading后abort连接；不伪造业务返回；关闭重开真实读回', intercepted, recovered: true });
  } finally { release(); await page.unroute('**/api/v1/dispatch', handler); }
}
test.beforeEach(async ({}, info) => { info.setTimeout(180000); });
test('T1303 同一完整Chromium共享UI与真实浏览器缩放', async ({ page, context }, info) => {
  test.setTimeout(1800000);
  activePage = page;
  expect(binding.sourceHead).toBe(handoff.sourceHead);
  save('binding-reference', { sourceHead: binding.sourceHead, bindingPath: session.candidateBinding,
    bindingSha256: crypto.createHash('sha256').update(fs.readFileSync(session.candidateBinding)).digest('hex'),
    baseURL: session.baseURL, browserVersion: context.browser().version(), temporaryPersistentProfile: true, newContext: true, businessStorageCopied: false });
  context.on('request', request => {
    try { const u = new URL(request.url()); if (u.pathname === '/api/v1/dispatch') events.push({ phase, method: request.method(), id: request.postDataJSON()?.id });
      else if (u.pathname === '/api/chat') events.push({ phase, method: request.method(), id: '/api/chat' }); } catch {}
    save('network-operations', events);
  });
  await context.addCookies([{ name: 'creatoros_current_group', value: encodeURIComponent(handoff.groupId), url: session.baseURL }]);
  await context.addInitScript(id => { localStorage.setItem('creatoros:current-group', id); localStorage.removeItem('creatoros:current-account'); localStorage.setItem('creatoros:onboarding:hidden', '1'); }, handoff.groupId);
  const before = await readAll(page); save('business-before', before);
  await page.goto(handoff.articleUrl);
  const cdp = await context.newCDPSession(page);
  const baseline = await metrics(page, cdp, 'zoom-baseline'); expect(baseline.m.cssVisualViewport.zoom).toBe(1);
  const settings = await context.newPage();
  let zoomControl, originalZoom;
  try {
    if (process.env.T1303_SKIP_ZOOM === '1') throw new Error('ZOOM_BRANCH_NOT_RUN: prior settings navigation closed browser; independent normal/narrow only');
    phase = 'settings-discovery';
    await settings.goto('chrome://settings/appearance');
    await expect(settings.locator('body')).toContainText(/Page zoom|网页缩放|页面缩放/);
    await snap(settings, 'settings-discovery');
    const selects = await settings.locator('select').evaluateAll(nodes => nodes.map(n => ({ id: n.id, aria: n.getAttribute('aria-label'), value: n.value, options: [...n.options].map(o => ({ text: o.textContent, value: o.value })) })));
    save('settings-selects', selects);
    // 控件选择依据当前真实 DOM 的可见 option；不调用私有设置接口。
    const found = selects.filter(s => s.options.some(o => o.text.trim() === '200%'));
    expect(found).toHaveLength(1); expect(found[0].id).toBeTruthy();
    zoomControl = settings.locator('select#' + found[0].id);
    await expect(zoomControl).toHaveCount(1); originalZoom = found[0].value;
    save('settings-control-ground-truth', { select: found[0], originalZoom });
    save('SETTINGS_READY', { at: new Date().toISOString(), next: '等待A阅读真实DOM后写settings-authorized.json；保持同一browser/context/page' });
    await expect.poll(() => fs.existsSync(path.join(root, 'settings-authorized.json')), { timeout: 600000, intervals: [1000] }).toBe(true);
    const choice = JSON.parse(fs.readFileSync(path.join(root, 'settings-authorized.json'), 'utf8'));
    expect(choice.visibleLabel).toBe('200%');
    await zoomControl.selectOption({ label: '200%' });
    await expect(zoomControl.locator('option:checked')).toHaveText('200%');
    await snap(settings, 'settings-200-percent');
    await page.bringToFront();
    await expect.poll(async () => (await cdp.send('Page.getLayoutMetrics')).cssVisualViewport.zoom, { timeout: 120000 }).toBe(2);
    const enlarged = await metrics(page, cdp, 'zoom-200-target');
    expect(enlarged.dom.rootZoom).toBe('1'); expect(enlarged.dom.bodyZoom).toBe('1');
    await snap(page, 'zoom-200-target-before-assistant');
    await trial('article-real-200', () => walk(page, 'article', { width: 1366, height: 900 }, 'article-real-200', 'joint1', 'close-button'));
    await trial('graphic-real-200', () => walk(page, 'image', { width: 1366, height: 900 }, 'graphic-real-200', 'joint1', 'close-button'));
  } catch (error) {
    results.push({ name: phase, status: 'FAIL', error: clean(String(error)), stack: clean(error.stack) }); save('checks', results);
    await snap(settings, 'settings-failure').catch(() => {}); await snap(page, 'zoom-target-failure').catch(() => {});
  } finally {
    if (zoomControl && originalZoom !== undefined) {
      await settings.bringToFront(); await zoomControl.selectOption(originalZoom); await expect(zoomControl).toHaveValue(originalZoom);
      await snap(settings, 'settings-restored'); await page.bringToFront();
      await expect.poll(async () => (await cdp.send('Page.getLayoutMetrics')).cssVisualViewport.zoom, { timeout: 120000 }).toBe(1);
      await metrics(page, cdp, 'zoom-restored-target');
    }
  }
  await trial('article-normal', () => walk(page, 'article', { width: 1366, height: 900 }, 'article-normal'));
  await trial('graphic-normal', () => walk(page, 'image', { width: 1366, height: 900 }, 'graphic-normal'));
  await trial('graphic-narrow', () => walk(page, 'image', { width: 1024, height: 700 }, 'graphic-narrow', 'joint1', 'close-button'));
  await trial('editor-narrow', () => walk(page, 'article', { width: 1024, height: 700 }, 'editor-narrow', 'editor', 'close-button'));
  await trial('editor-source-loading-error', () => sourceFailure(page));
  await trial('article-narrow-Escape', () => walk(page, 'article', { width: 1024, height: 700 }, 'article-narrow-Escape'));
  const after = await readAll(page); save('business-after', after);
  expect(after).toEqual(before);
  const forbidden = events.filter(e => e.id === '/api/chat' || ['articles.versions.create', 'graphicPosts.versions.create', 'ai.conversations.messages.create'].includes(e.id));
  save('RESULT', { results, zeroModels: forbidden.length === 0, zeroBusinessSaves: forbidden.length === 0, forbidden, businessUnchanged: true, businessStorageCopied: false, contextNotB: true, at: new Date().toISOString() });
  expect(forbidden).toEqual([]);
  expect(results.filter(r => r.status !== 'PASS')).toEqual([]);
  await cdp.detach(); await settings.close();
});
