'use strict';

const metrics = require('./metrics.cjs');
const STAGES = Object.freeze(['script', 'article', 'image', 'production', 'review']);
const CASE_COUNT = 4;
const BUDGET = Object.freeze({ test: 28800000, action: 1800000, navigation: 300000,
  expect: 120000, cleanup: 300000, launch: 180000, startup: 300000,
  caseCount: CASE_COUNT,
  outerRequiredSeconds: Math.ceil((CASE_COUNT * (28800000 + 300000) + 180000 + 300000) / 1000) });

/* 注册工厂，当前没有薄 spec / 最终 source binding，不会自行执行。
 * C 注入 {test,expect,owner,rpc,save,snap,fixture}：
 * - owner 仅传给注入函数，不序列化。rpc 是真实只读/受权端口；本文件不构造会话。
 * - save(name,safeJson) 只收本文生成的白名单结果，snap 可选且仅供 fixture.safeSnap 使用。
 * - fixture.binding={source:<40hex>,routeRevision:<非空string>,runLabel:<安全标签>}；
 *   preflight({binding,owner,rpc,budgets}) 实际核新包/真实 owned 身份/冻结配置，禁止旧 root，
 *   返回真实外层 wrapper {outerBudgetSeconds}；四例全注册，须>=116880秒（32小时28分），
 *   机械覆盖4×8小时+每例清理+启动/launch，不接受原24小时外层或缩短正操作凑门。
 * - populationScope={kind:'owned-group',groupId:<真实owned组>}，populationFields 为
 *   activeTasks/historyItems/conversations 中已定义可实际分页读回的非空子集；
 *   population({owner,rpc}) 返回 {scope:populationScope,paginationComplete:true,counts:{...}}。
 *   仅强核声明字段的完整分页计数；其它字段/其它root未测另记，不填0，不取消/删除历史。
 * - stages[stage]={main,content,control} 为已核真实 CSS（可穿透 open shadow），
 *   main 为实际主内容区，content 为该面的关键内容，control 为可用的真实控件。
 * - openTabs({owner,rpc,visit,target?,budgets}) 返回 {page,close}，全新 context：
 *   cold 时不得先访问 target，初始在另一真实工作面；warm 时已就绪 production。
 *   所有 URL / owned project/output IDs 由未来绑定注入；不得复制旧 sessionStorage。
 * - video.surfaceSelector 指向原唯一原生 host，例 [aria-label="视频剪辑工作台"]；
 *   不新增产品标记，不将“同URL/同文字”当 DOM session 仍在。
 * - interactions.open({owner,rpc,budgets}) 返回 {page,close}；steps.script 精确为
 *   edit,undo（改字后撤回、不保存正文）；steps.video 精确为 control,edit,undo,redo,save,restore。
 *   每步 {name,trigger,event?,rules:[{selector,interactive?,absent?,textEquals?,attribute?}],
 *   perform({page,owner,rpc,deadlineAt,budgets})} 必须走真实 UI；rules 是真实 dirty/UndoRedo/
 *   保存回执状态，不能只用 timer；restore 按原合法可逆路径还原并保留自然新增版本。
 *   assertBaseline({page,owner,rpc}) 核脚本全文和原 video 内容（原允许版本差异另列），
 *   不返回正文。文章/图文仅 previewActions，不开精调，不写正文。
 * - previewActions({stage,page,owner,deadlineAt,budgets}) 只预览/展开/滚动，返回
 *   {previewed:true,expanded:true,scrolled:true,wroteBody:false} 的真实核验结果。
 * - chat.openEmpty({owner,rpc,budgets}) 返回 {page,close} 真空会话；chat.prepare 填新中性普通
 *   prompt（不持久到 metrics），不发工具指令；chat.sendSelector 必须实际发送按钮。
 *   chat.waitTerminal({page,owner,rpc,deadlineAt,budgets,onIdentity}) 只观察这一个原turn，
 *   原task/execution ID一旦已知立即调用 onIdentity({taskId?,executionId?,status?})，最终返回
 *   同结构；失败前最后已知ID保留，不为补ID新查/重发/续期/取消或人为造工具。
 * - safeSnap?({snap,page,label}) 由C确认画面安全后调用，不拍聊天正文。
 * 注入的回调承诺不以合成结果替代真实操作；当前只通过语法，不代表这些路径已发生。
 */
function registerPerformance({ test, expect, owner, rpc, save, snap, fixture }) {
  for (const [key, value] of Object.entries({ test, expect, rpc, save })) {
    if (typeof value !== 'function' && !(key === 'rpc' && value && typeof value === 'object')) {
      throw Error(`缺少注入能力：${key}`);
    }
  }
  if (!owner || !fixture || typeof fixture.preflight !== 'function' || typeof fixture.population !== 'function') {
    throw Error('缺少新包 owned fixture / 预检 / 真实负载读回');
  }
  const binding = fixture.binding;
  if (!binding || !/^[a-f0-9]{40}$/.test(binding.source) ||
      typeof binding.routeRevision !== 'string' || !binding.routeRevision ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(binding.runLabel)) throw Error('尚未注入合法新包 binding');
  for (const stage of STAGES) {
    const spec = fixture.stages?.[stage];
    if (!spec || ['main', 'content', 'control'].some(key => typeof spec[key] !== 'string' || !spec[key])) {
      throw Error(`缺少真实工作面 readiness：${stage}`);
    }
  }
  const videoSelector = fixture.video?.surfaceSelector;
  if (typeof videoSelector !== 'string' || !videoSelector) throw Error('缺少原视频 DOM 引用选择器');
  const populationScope = fixture.populationScope;
  const populationFields = fixture.populationFields;
  const countKeys = ['activeTasks', 'historyItems', 'conversations'];
  if (populationScope?.kind !== 'owned-group' || !/^[a-zA-Z0-9_-]{1,150}$/.test(populationScope.groupId) ||
      !Array.isArray(populationFields) || !populationFields.length ||
      new Set(populationFields).size !== populationFields.length ||
      populationFields.some(key => !countKeys.includes(key))) throw Error('缺少明确owned负载范围/计数字段');
  const safeBinding = { source: binding.source, routeRevision: binding.routeRevision, runLabel: binding.runLabel };
  const resultsNote = '当前样本实测；无同条件旧基线，不计算加速百分比。服务ISO阶段由C另列，不与浏览器时钟对齐。';
  function remaining(deadlineAt) {
    const budget = Math.min(BUDGET.action, deadlineAt - Date.now() - BUDGET.cleanup);
    if (budget < metrics.MIN_OPERATION_MS) throw Error('外层剩余预算不足，未启动下一正操作');
    return budget;
  }
  function populationValue(value) {
    if (value?.scope?.kind !== populationScope.kind || value?.scope?.groupId !== populationScope.groupId ||
        value?.paginationComplete !== true) throw Error('owned负载范围不符或分页未完成');
    const counts = {};
    for (const key of populationFields) {
      if (!Number.isSafeInteger(value.counts?.[key]) || value.counts[key] < 0) throw Error(`真实负载读回缺失：${key}`);
      counts[key] = value.counts[key];
    }
    return { scope: { kind: populationScope.kind, groupId: populationScope.groupId }, counts,
      paginationComplete: true, unobservedFields: countKeys.filter(key => !populationFields.includes(key)),
      otherRoots: '未在本指标中观测，由C另存，未填0' };
  }
  async function begin() {
    const startedAt = Date.now();
    const verified = await fixture.preflight({ binding: safeBinding, owner, rpc, budgets: BUDGET });
    if (!Number.isFinite(verified?.outerBudgetSeconds) || verified.outerBudgetSeconds < BUDGET.outerRequiredSeconds) {
      throw Error('实际外层预算不足以覆盖已注册四例完整串行上限与余量');
    }
    return { deadlineAt: startedAt + BUDGET.test,
      populationBefore: populationValue(await fixture.population({ owner, rpc })) };
  }
  function safeIdentity(value) {
    const out = {};
    for (const key of ['taskId', 'executionId']) {
      if (typeof value?.[key] === 'string' && /^[a-zA-Z0-9_-]{1,150}$/.test(value[key])) out[key] = value[key];
    }
    if (['pending', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'unknown_result', 'awaiting_confirmation'].includes(value?.status)) out.status = value.status;
    return out;
  }
  async function captureFailure(label, handle, phase, cause, original = {}) {
    let browser = null, observer = '页面尚未打开';
    if (handle?.page && !handle.page.isClosed()) {
      try {
        browser = { clock: await handle.page.evaluate(() => ({ timeOrigin: performance.timeOrigin })),
          transition: await metrics.call(handle.page, 'transition'), chat: await metrics.call(handle.page, 'chat'),
          navigation: await metrics.call(handle.page, 'navigation') };
        observer = '关闭前读取现有安全仪器状态；未新增业务请求';
      } catch { observer = '关闭前仪器不可读取；不补拍/重开页面'; }
    }
    const names = ['TimeoutError', 'AssertionError', 'Error', 'TypeError', 'RangeError', 'AbortError', 'ProtocolError', 'TargetClosedError'];
    const codes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ABORT_ERR'];
    const error = { category: names.includes(cause?.name) ? cause.name : 'OtherError' };
    if (codes.includes(cause?.code)) error.code = cause.code;
    try {
      await save(`${label}-failure.json`, { schema: 't1316-performance-failure/v1', binding: safeBinding,
        phase, error, original: safeIdentity(original), browser, observer,
        disposition: '保留原失败并继续throw；不续期、不重发、不取消原任务',
        privacy: '无原错误正文/stack/prompt/headers/消息正文' });
    } catch {
      // 证据sink也失败时仍抛原错误，不声称现场已成功保存。
      try { cause.performanceEvidenceWriteFailed = true; } catch { /* 原错误对象可能不可写。 */ }
    }
  }
  async function finish(name, run, result) {
    await save(name, { schema: 't1316-performance/v1', binding: safeBinding,
      budgets: BUDGET, populationBefore: run.populationBefore,
      populationAfter: populationValue(await fixture.population({ owner, rpc })),
      note: resultsNote, ...result });
  }
  async function measureTab(page, stage, run, label) {
    const trigger = `[data-testid="stage-segment-${stage}"]`;
    const link = page.locator(trigger);
    expect(await link.count()).toBe(1);
    expect(await link.getAttribute('aria-current')).toBeNull();
    const budgetMs = remaining(run.deadlineAt);
    const clock = await metrics.call(page, 'armTransition', label,
      { trigger, ...fixture.stages[stage] }, budgetMs);
    await link.click({ timeout: Math.min(BUDGET.navigation, budgetMs) });
    const result = await metrics.waitTransition(page, clock, budgetMs);
    // 非同document导航不是零延时或成功Tab；原导航时序仍另列。
    const navigation = await metrics.call(page, 'navigation');
    await save(`${label}-tab.json`, { schema: 't1316-performance-tab/v1', binding: safeBinding,
      stage, ...result, navigation, navigationClockSeparateFromSave: true });
    expect(result.comparableClock).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.triggerCount).toBe(1);
    expect(result.readyAt).not.toBeNull();
    expect(await link.getAttribute('aria-current')).not.toBeNull();
    return { stage, ...result, navigation };
  }
  async function close(handle, primaryError) {
    let cleanupError;
    try { if (handle?.page) await metrics.dispose(handle.page); }
    catch (cause) { cleanupError = cause; }
    try { if (handle) await handle.close(); }
    catch (cause) { cleanupError ??= cause; }
    if (cleanupError && !primaryError) throw cleanupError;
    if (cleanupError && primaryError) {
      try { primaryError.performanceCleanupFailed = true; } catch { /* 不覆盖原失败。 */ }
    }
  }

  test('T1316 性能：新context首访各工作面', async () => {
    test.setTimeout(BUDGET.test);
    const run = await begin(), samples = [];
    for (const stage of STAGES) {
      let handle, failure, phase = 'open';
      try {
        handle = await fixture.openTabs({ owner, rpc, visit: 'cold', target: stage, budgets: BUDGET });
        phase = 'install';
        await metrics.install(handle.page);
        phase = 'tab-click-and-ready';
        samples.push(await measureTab(handle.page, stage, run, `cold-${stage}`));
      } catch (cause) {
        failure = cause;
        await captureFailure(`cold-${stage}`, handle, phase, cause);
        throw cause;
      } finally { await close(handle, failure); }
    }
    await finish('tabs-cold.json', run, { visit: 'new-context-first-target-visit', samples });
  });

  test('T1316 性能：同page暖访与原视频surface保留', async () => {
    test.setTimeout(BUDGET.test);
    const run = await begin();
    let handle, failure, phase = 'open';
    try {
      handle = await fixture.openTabs({ owner, rpc, visit: 'warm', budgets: BUDGET });
      const page = handle.page;
      phase = 'install-and-retain-video';
      await metrics.install(page);
      await metrics.call(page, 'retain', 'video', videoSelector);
      // production 初始已就绪；其余各面先真实访问一次，预热样本单列不冒首访。
      const warmup = [];
      for (const stage of STAGES.filter(s => s !== 'production')) {
        phase = `warmup-${stage}`;
        warmup.push(await measureTab(page, stage, run, `warmup-${stage}`));
        expect(await metrics.call(page, 'retained', 'video')).toEqual({ recorded: true, connected: true, same: true });
      }
      const samples = [];
      for (const stage of STAGES) {
        phase = `warm-${stage}`;
        samples.push(await measureTab(page, stage, run, `warm-${stage}`));
        expect(await metrics.call(page, 'retained', 'video')).toEqual({ recorded: true, connected: true, same: true });
        if (stage === 'article' || stage === 'image') {
          phase = `preview-${stage}`;
          const observed = await fixture.previewActions({ stage, page, owner,
            deadlineAt: Math.min(run.deadlineAt, Date.now() + remaining(run.deadlineAt)), budgets: BUDGET });
          expect(observed).toEqual({ previewed: true, expanded: true, scrolled: true, wroteBody: false });
        }
      }
      if (fixture.safeSnap && snap) await fixture.safeSnap({ snap, page, label: 'warm-tabs' });
      phase = 'save-result';
      await finish('tabs-warm.json', run, { visit: 'same-page-after-each-target-visited', warmup,
        samples, videoSurface: await metrics.call(page, 'retained', 'video'),
        articleImagePolicy: '仅预览、展开、滚动，不开启精调或写正文' });
    } catch (cause) {
      failure = cause;
      await captureFailure('tabs-warm', handle, phase, cause);
      throw cause;
    } finally { await close(handle, failure); }
  });

  test('T1316 性能：脚本撤回与视频可逆控制/dirty/UndoRedo/save单列', async () => {
    test.setTimeout(BUDGET.test);
    const run = await begin();
    const expected = { script: ['edit', 'undo'], video: ['control', 'edit', 'undo', 'redo', 'save', 'restore'] };
    let handle, failure, phase = 'open';
    try {
      handle = await fixture.interactions.open({ owner, rpc, budgets: BUDGET });
      const page = handle.page;
      phase = 'install-and-retain-video';
      await metrics.install(page);
      await metrics.call(page, 'retain', 'video', videoSelector);
      const samples = [];
      for (const kind of ['script', 'video']) {
        const steps = fixture.interactions.steps[kind];
        expect(steps.map(step => step.name)).toEqual(expected[kind]);
        for (const step of steps) {
          if (!step.trigger || !Array.isArray(step.rules) || !step.rules.length || typeof step.perform !== 'function') {
            throw Error('可逆操作必须提供真实触发控件、完成状态和UI动作');
          }
          const budgetMs = remaining(run.deadlineAt), label = `${kind}-${step.name}`;
          phase = label;
          const clock = await metrics.call(page, 'armTransition', label,
            { trigger: step.trigger, event: step.event ?? 'click', rules: step.rules }, budgetMs);
          await step.perform({ page, owner, rpc, deadlineAt: Date.now() + budgetMs, budgets: BUDGET });
          const measured = await metrics.waitTransition(page, clock, budgetMs);
          await save(`${label}-operation.json`, { binding: safeBinding, kind, operation: step.name, ...measured });
          expect(measured.comparableClock).toBe(true);
          expect(measured.timedOut).toBe(false);
          expect(measured.startAt).not.toBeNull();
          expect(measured.readyAt).not.toBeNull();
          samples.push({ kind, operation: step.name, ...measured });
          expect(await metrics.call(page, 'retained', 'video')).toEqual({ recorded: true, connected: true, same: true });
        }
      }
      phase = 'assert-baseline';
      await fixture.interactions.assertBaseline({ page, owner, rpc });
      phase = 'save-result';
      await finish('reversible-operations.json', run, { samples,
        saveSeparateFromTab: true, scriptBodyRestored: true, videoContentRestored: true });
    } catch (cause) {
      failure = cause;
      await captureFailure('reversible-operations', handle, phase, cause);
      throw cause;
    } finally { await close(handle, failure); }
  });

  test('T1316 性能：新空会话普通单turn真实POST/SSE/可见首字', async () => {
    test.setTimeout(BUDGET.test);
    const run = await begin();
    let handle, failure, phase = 'open', original = {};
    const progress = { opened: false, installed: false, prepared: false, armed: false,
      clickCompleted: false, terminalObserved: false, streamObservationCompleted: false };
    const onIdentity = value => { original = { ...original, ...safeIdentity(value) }; };
    try {
      handle = await fixture.chat.openEmpty({ owner, rpc, budgets: BUDGET });
      progress.opened = true; phase = 'install';
      const page = handle.page;
      await metrics.install(page);
      progress.installed = true; phase = 'prepare';
      await fixture.chat.prepare({ page, owner, budgets: BUDGET });
      progress.prepared = true; phase = 'arm';
      const clock = await metrics.call(page, 'armChat', fixture.chat.sendSelector);
      progress.armed = true;
      const budgetMs = remaining(run.deadlineAt), deadlineAt = Date.now() + budgetMs;
      phase = 'click';
      await page.locator(fixture.chat.sendSelector).click({ timeout: BUDGET.expect });
      progress.clickCompleted = true; phase = 'wait-original-terminal';
      const terminal = await fixture.chat.waitTerminal({ page, owner, rpc, deadlineAt, budgets: BUDGET, onIdentity });
      onIdentity(terminal);
      progress.terminalObserved = true;
      expect(terminal?.status).toBe('succeeded');
      phase = 'observe-original-stream';
      // 同一个原turn完成后等待仪器读完SSE；绝不第二次发消息补证。
      const left = deadlineAt - Date.now();
      if (left <= 0) throw Error('原观察截止已到，不续期');
      await page.waitForFunction(({ key, origin }) => {
        const p = window[key];
        if (!p || p.clock.timeOrigin !== origin) return true;
        const c = p.chat();
        return c && (c.bodyEndAt !== null || c.fetchRejected || c.notSse || c.streamReadError ||
          c.parserLimit || c.noBody || c.cloneError);
      }, { key: '__t1316PerformanceProbe', origin: clock.timeOrigin }, { timeout: left, polling: 'raf' });
      progress.streamObservationCompleted = true;
      phase = 'observe-visible-assistant-text';
      const textLeft = deadlineAt - Date.now();
      if (textLeft <= 0) throw Error('原观察截止已到，不续期');
      await page.waitForFunction(({ key, origin }) => {
        const p = window[key];
        return !p || p.clock.timeOrigin !== origin || p.chat()?.firstVisibleAssistantTextAt !== null;
      }, { key: '__t1316PerformanceProbe', origin: clock.timeOrigin }, { timeout: textLeft, polling: 'raf' });
      const observed = await metrics.call(page, 'chat');
      phase = 'save-result';
      const functionSucceeded = observed.clock.timeOrigin === clock.timeOrigin && observed.clickCount === 1 &&
        observed.postCount === 1 && observed.requests[0]?.status === 200 &&
        observed.firstVisibleAssistantTextAt !== null && terminal?.status === 'succeeded';
      await finish('plain-chat.json', run, { browser: observed, terminal: safeIdentity(terminal), progress,
        functionSucceeded,
        measurementCompleteness: { firstTextDelta: observed.firstTextDeltaAt === null ? '未观测/格式不支持，保留null' : 'observed',
          finishEvent: observed.finishAt === null ? '未观测，保留null' : 'observed',
          streamBodyEnd: observed.bodyEndAt === null ? '未观测，保留null' : 'observed',
          instrumentationIncomplete: Boolean(observed.parserLimit || observed.streamReadError || observed.cloneError || observed.notSse || observed.noBody) },
        sseDeltaIsNotVisibleText: true, toolTimingIsNotPlainChatTtft: true,
        backendClock: '服务ISO安全phase另存；此处未拼接/推断跨时钟延时',
        instrumentation: '原fetch一次+clone旁读；无正文/prompt/headers存储；包含仪器开销' });
      expect(observed.clock.timeOrigin).toBe(clock.timeOrigin);
      expect(observed.clickCount).toBe(1);
      expect(observed.postCount).toBe(1);
      expect(observed.requests[0].status).toBe(200);
      expect(observed.firstVisibleAssistantTextAt).not.toBeNull();
      expect(terminal?.status).toBe('succeeded');
    } catch (cause) {
      failure = cause;
      // 独立先存完成步骤，再读现有仪器；不依赖成功的finish()/population读回。
      try { await save('plain-chat-progress.json', { binding: safeBinding, phase, progress, original }); }
      catch { try { cause.performanceEvidenceWriteFailed = true; } catch { /* 保原错。 */ } }
      await captureFailure('plain-chat', handle, phase, cause, original);
      throw cause;
    } finally { await close(handle, failure); }
  });
  return { stages: STAGES, budgets: BUDGET, binding: safeBinding };
}

module.exports = { registerPerformance, STAGES, BUDGET };
