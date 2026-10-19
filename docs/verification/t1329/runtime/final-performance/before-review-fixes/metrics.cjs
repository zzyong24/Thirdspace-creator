'use strict';

/* 仅由未来新包 driver 注入 page；导入无 I/O、无浏览器启动、无私有会话读取。
 * 所有浏览器时间均为同 document 的 performance.now()；不与服务 ISO 相减。
 * fetch clone / rAF / MutationObserver 有观测开销，结果不是无仪器基准。
 */
const KEY = '__t1316PerformanceProbe';
const MIN_OPERATION_MS = 120000;

function browserInstall() {
  const key = '__t1316PerformanceProbe';
  if (window[key]) return;
  const originalFetch = window.fetch;
  const retained = new Map();
  const observers = new Set();
  const readers = new Set();
  const state = { transition: null, chat: null, disposed: false };
  const clock = { timeOrigin: performance.timeOrigin };
  const now = () => performance.now();
  function parent(node) { return node.parentElement || node.getRootNode()?.host || null; }
  function all(selector, root = document) {
    const found = [...root.querySelectorAll(selector)];
    // 只进入0e1固定源码已有的三种 NativeEditorSurface host，避免每帧遍历全DOM寻找shadow。
    if (root === document) for (const node of document.querySelectorAll(
      '[aria-label="视频剪辑工作台"],[aria-label="图片设计工作台"],[aria-label="公众号排版编辑器"]')) {
      if (node.shadowRoot) found.push(...node.shadowRoot.querySelectorAll(selector));
    }
    return found;
  }
  function belongs(node, container) {
    for (let current = node; current; current = parent(current)) if (current === container) return true;
    return false;
  }
  function visible(node) {
    if (!(node instanceof Element) || !node.isConnected) return false;
    for (let current = node; current; current = parent(current)) {
      const style = getComputedStyle(current);
      if (current.hidden || current.hasAttribute('inert') || current.getAttribute('aria-hidden') === 'true' ||
          style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
    }
    return [...node.getClientRects()].some(r => r.width > 0 && r.height > 0 &&
      r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth);
  }
  function clippedRect(rect, node) {
    let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
    let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
    for (let current = node; current; current = parent(current)) {
      const style = getComputedStyle(current), box = current.getBoundingClientRect();
      const scaleX = current.offsetWidth ? box.width / current.offsetWidth : 1;
      const scaleY = current.offsetHeight ? box.height / current.offsetHeight : 1;
      const clipX = /^(hidden|clip|scroll|auto|overlay)$/.test(style.overflowX);
      const clipY = /^(hidden|clip|scroll|auto|overlay)$/.test(style.overflowY);
      const paint = /(^|\s)(paint|strict|content)(\s|$)/.test(style.contain);
      if (clipX || paint) {
        const x = box.left + current.clientLeft * scaleX;
        left = Math.max(left, x); right = Math.min(right, x + current.clientWidth * scaleX);
      }
      if (clipY || paint) {
        const y = box.top + current.clientTop * scaleY;
        top = Math.max(top, y); bottom = Math.min(bottom, y + current.clientHeight * scaleY);
      }
      if (right <= left || bottom <= top) return null;
    }
    return right > left && bottom > top ? { left, right, top, bottom } : null;
  }
  function deepHit(x, y) {
    let hit = document.elementFromPoint(x, y);
    while (hit?.shadowRoot) {
      const inner = hit.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === hit) break;
      hit = inner;
    }
    return hit;
  }
  function unoccluded(rect, node) {
    const clipped = clippedRect(rect, node);
    if (!clipped) return false;
    // 在裁切后的文本范围内采样；只接受文字原父元素或其子级命中，不接受祖先容器/遮罩命中。
    for (const fraction of [0.5, 0.2, 0.8]) {
      const hit = deepHit(clipped.left + (clipped.right - clipped.left) * fraction,
        (clipped.top + clipped.bottom) / 2);
      if (hit && belongs(hit, node)) return true;
    }
    return false;
  }
  function interactive(node) {
    if (!visible(node) || node.matches(':disabled,[aria-disabled="true"]') ||
        node.closest('[aria-disabled="true"]')) return false;
    if (!node.matches('button,input,textarea,select,a[href],[role="button"],[role="slider"],[contenteditable="true"]')) return false;
    if (node.matches('input[readonly],textarea[readonly]')) return false;
    return unoccluded(node.getBoundingClientRect(), node);
  }
  function firstVisible(selector, container) {
    return all(selector).find(node => visible(node) && (!container || belongs(node, container)));
  }
  function ruleReady(rule) {
    const matches = all(rule.selector);
    if (rule.absent) return matches.every(node => !visible(node));
    return matches.some(node => {
      if (!visible(node)) return false;
      if (rule.interactive && !interactive(node)) return false;
      if (rule.textEquals !== undefined && node.textContent.trim() !== rule.textEquals) return false;
      if (rule.attribute && node.getAttribute(rule.attribute.name) !== rule.attribute.value) return false;
      return true;
    });
  }
  function transitionReady(t) {
    if (t.spec.rules) return t.spec.rules.every(ruleReady);
    const main = firstVisible(t.spec.main);
    if (!main || !firstVisible(t.spec.content, main)) return false;
    return all(t.spec.control).some(node => belongs(node, main) && interactive(node));
  }
  function publicTransition(t) {
    if (!t) return null;
    return { label: t.label, clock, startAt: t.startAt, readyAt: t.readyAt,
      elapsedMs: t.startAt !== null && t.readyAt !== null ? t.readyAt - t.startAt : null,
      triggerCount: t.triggerCount, timedOut: t.timedOut,
      readiness: t.spec.rules ? '明确状态条件' : 'main与关键内容可见且实际控件通过命中检查' };
  }
  function capture(event) {
    const t = state.transition;
    const path = event.composedPath();
    if (t && event.type === t.spec.event && path.some(n => n instanceof Element && n.matches(t.spec.trigger))) {
      t.triggerCount++;
      if (t.startAt === null) t.startAt = now();
    }
    const chat = state.chat;
    if (chat && event.type === 'click' && path.some(n => n instanceof Element && n.matches(chat.sendSelector))) {
      chat.clickCount++;
      if (chat.clickAt === null) chat.clickAt = now();
    }
  }
  for (const name of ['click', 'input', 'change', 'keydown']) document.addEventListener(name, capture, true);
  function visibleText(node) {
    if (!visible(node)) return false;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      // 只读精确 assistant 文本节点判断非空，绝不保存字符或整条消息。
      if (!text.nodeValue.trim() || !visible(text.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      const shown = [...range.getClientRects()].some(r => r.width > 0 && r.height > 0 &&
        unoccluded(r, text.parentElement));
      range.detach();
      if (shown) return true;
    }
    return false;
  }
  function observeChat() {
    const c = state.chat;
    if (!c || c.clickAt === null || c.stopped) return;
    const rows = all('[data-slot="copilot-message"][data-role="assistant"]').filter(n => !c.baseline.has(n));
    if (c.firstVisibleAssistantTextAt === null && rows.some(row =>
      [...row.querySelectorAll('[data-slot="copilot-message-text"]')].some(visibleText))) {
      c.firstVisibleAssistantTextAt = now();
    }
    // SEMANTIC_BOUNDARY_ALLOW: 只比较本次SSE已完成正文与实际DOM文本的空白归一字节，不判断内容含义。
    if (c.firstCompleteVisibleAssistantTextAt === null && c.finishAt !== null && c.emittedText.length > 0) {
      const normalize = value => value.replace(/\s+/gu, ' ').trim();
      if (rows.some(row => {
        const texts = [...row.querySelectorAll('[data-slot="copilot-message-text"]')];
        return texts.length > 0 && texts.every(visibleText) && normalize(texts.map(n => n.textContent).join(' ')) === normalize(c.emittedText);
      })) c.firstCompleteVisibleAssistantTextAt = now();
    }
    if (c.firstToolDomAt === null && rows.some(row =>
      [...row.querySelectorAll('[data-slot="copilot-tool-trace"],[data-slot="copilot-tool-running"],[data-slot="copilot-tool-terminal"]')].some(visible))) {
      c.firstToolDomAt = now();
    }
  }
  let animation;
  function frame() {
    if (state.disposed) return;
    const t = state.transition;
    if (t && t.readyAt === null && !t.timedOut) {
      if (now() >= t.deadline) t.timedOut = true;
      else if (t.startAt !== null && transitionReady(t)) t.readyAt = now();
    }
    if (state.chat && (state.chatDirty || state.chat.firstVisibleAssistantTextAt === null ||
        state.chat.firstToolDomAt === null || state.chat.firstCompleteVisibleAssistantTextAt === null)) observeChat();
    state.chatDirty = false;
    animation = requestAnimationFrame(frame);
  }
  animation = requestAnimationFrame(frame);
  // Mutation 只标记变更；首次可见读数在下一 rAF 的真实布局检查发生，不能用整块文本变化冒首字。
  const mutation = new MutationObserver(() => { state.chatDirty = true; });
  mutation.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
  observers.add(mutation);
  function sseEvent(c, data) {
    if (c.stopped) return;
    const at = now();
    if (c.firstSseEventAt === null) c.firstSseEventAt = at;
    c.sseEventCount++;
    if (data === '[DONE]') { if (c.finishAt === null) c.finishAt = at; return; }
    let part;
    try { part = JSON.parse(data); } catch { c.unparsedSseEvents++; return; }
    if (part?.type === 'text-delta' && typeof (part.delta ?? part.textDelta) === 'string') c.emittedText += part.delta ?? part.textDelta;
    if (part?.type === 'text-delta' && typeof (part.delta ?? part.textDelta) === 'string' &&
        (part.delta ?? part.textDelta).length > 0 && c.firstTextDeltaAt === null) c.firstTextDeltaAt = at;
    if (['tool-input-start', 'tool-call', 'tool-input-available'].includes(part?.type) && c.firstToolSseAt === null) c.firstToolSseAt = at;
    if (part?.type === 'finish' && c.finishAt === null) c.finishAt = at;
    if (part?.type === 'error') c.streamError = true;
  }
  async function readStream(response, c) {
    if (!response.headers.get('content-type')?.includes('text/event-stream')) { c.notSse = true; return; }
    const reader = response.body?.getReader();
    if (!reader) { c.noBody = true; return; }
    readers.add(reader);
    let buffer = '', data = [], ended = false;
    const decoder = new TextDecoder();
    function line(value) {
      if (value === '') { if (data.length) sseEvent(c, data.join('\n')); data = []; }
      else if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''));
    }
    try {
      while (!c.stopped) {
        const next = await reader.read();
        if (next.done) {
          buffer += decoder.decode();
          if (buffer) line(buffer.replace(/\r$/, ''));
          if (data.length) sseEvent(c, data.join('\n'));
          c.bodyEndAt = now(); ended = true;
          break;
        }
        if (c.firstChunkAt === null) c.firstChunkAt = now();
        buffer += decoder.decode(next.value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n')) !== -1) {
          line(buffer.slice(0, end).replace(/\r$/, ''));
          buffer = buffer.slice(end + 1);
        }
        // 有界瞬态解析，不把不受支持大事件误当计时成功，也不干预原响应。
        if (buffer.length + data.reduce((n, item) => n + item.length, 0) > 1048576) {
          c.parserLimit = true;
          break;
        }
      }
    } catch { c.streamReadError = true; }
    finally {
      if (!ended) void reader.cancel().catch(() => {});
      readers.delete(reader); reader.releaseLock();
    }
  }
  function wrappedFetch(input, init) {
    const c = state.chat;
    let match = false;
    try {
      const url = new URL(typeof input === 'string' ? input : input.url ?? String(input), location.href);
      const method = String(init?.method ?? input?.method ?? 'GET').toUpperCase();
      match = Boolean(c && !c.stopped && url.origin === location.origin && url.pathname === '/api/chat' && method === 'POST');
    } catch { /* 不改原 fetch 对无效输入的行为。 */ }
    if (!match) return originalFetch.apply(this, arguments);
    c.postCount++;
    const request = { postAt: now(), headersAt: null, status: null };
    c.requests.push(request);
    // 只调用原 fetch 一次；从不保存 request body / URL / headers。
    let result;
    try { result = originalFetch.apply(this, arguments); }
    catch (cause) { c.fetchRejected = true; throw cause; }
    return result.then(response => {
      request.headersAt = now(); request.status = response.status;
      if (c.postCount === 1) {
        try { void readStream(response.clone(), c); } catch { c.cloneError = true; }
      }
      return response;
    }, cause => { c.fetchRejected = true; throw cause; });
  }
  window.fetch = wrappedFetch;
  window[key] = {
    clock,
    armTransition(label, spec, budgetMs) {
      if (budgetMs < 120000) throw Error('正操作预算不足两分钟');
      state.transition = { label, spec: { event: 'click', ...spec }, startAt: null, readyAt: null,
        triggerCount: 0, timedOut: false, deadline: now() + budgetMs };
      return clock;
    },
    transition: () => publicTransition(state.transition),
    retain(name, selector) {
      const nodes = all(selector);
      if (nodes.length !== 1 || !nodes[0].isConnected) throw Error('保留对象必须唯一且已连接');
      retained.set(name, { node: nodes[0], selector });
    },
    retained(name) {
      const item = retained.get(name);
      return { recorded: Boolean(item), connected: Boolean(item?.node.isConnected),
        same: Boolean(item && all(item.selector).includes(item.node)) };
    },
    armChat(sendSelector) {
      if (all('[data-slot="copilot-message"]').length !== 0) throw Error('普通聊天必须是新的空会话');
      state.chat = { sendSelector, baseline: new Set(all('[data-slot="copilot-message"][data-role="assistant"]')),
        clickAt: null, clickCount: 0, postCount: 0, requests: [], firstChunkAt: null,
        firstSseEventAt: null, firstTextDeltaAt: null, firstVisibleAssistantTextAt: null, firstCompleteVisibleAssistantTextAt: null, emittedText: '',
        firstToolSseAt: null, firstToolDomAt: null, finishAt: null, bodyEndAt: null,
        sseEventCount: 0, unparsedSseEvents: 0, stopped: false };
      return clock;
    },
    chat() {
      const c = state.chat;
      if (!c) return null;
      const keys = ['clickAt', 'clickCount', 'postCount', 'requests', 'firstChunkAt', 'firstSseEventAt',
        'firstTextDeltaAt', 'firstVisibleAssistantTextAt', 'firstCompleteVisibleAssistantTextAt', 'firstToolSseAt', 'firstToolDomAt',
        'finishAt', 'bodyEndAt', 'sseEventCount', 'unparsedSseEvents', 'streamError', 'notSse',
        'noBody', 'parserLimit', 'streamReadError', 'fetchRejected', 'cloneError'];
      const out = { clock };
      for (const name of keys) if (c[name] !== undefined) out[name] = c[name];
      out.toolObservation = c.firstToolSseAt !== null || c.firstToolDomAt !== null ? 'observed' :
        c.finishAt !== null && c.bodyEndAt !== null ? 'none_observed_in_completed_stream' : 'not_yet_known';
      return out;
    },
    navigation() {
      return performance.getEntriesByType('navigation').map(entry => ({ type: entry.type,
        startTime: entry.startTime, requestStart: entry.requestStart, responseStart: entry.responseStart,
        responseEnd: entry.responseEnd, domInteractive: entry.domInteractive,
        domContentLoadedEventEnd: entry.domContentLoadedEventEnd, loadEventEnd: entry.loadEventEnd }));
    },
    dispose() {
      state.disposed = true;
      if (state.chat) state.chat.stopped = true;
      cancelAnimationFrame(animation);
      for (const observer of observers) observer.disconnect();
      for (const name of ['click', 'input', 'change', 'keydown']) document.removeEventListener(name, capture, true);
      for (const reader of readers) void reader.cancel().catch(() => {});
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
      retained.clear();
    },
  };
}

async function install(page) {
  await page.addInitScript(browserInstall);
  await page.evaluate(browserInstall);
}
async function call(page, method, ...args) {
  return page.evaluate(({ key, method, args }) => {
    if (!window[key]) throw Error('性能采集器未安装或文档已替换');
    return window[key][method](...args);
  }, { key: KEY, method, args });
}
async function waitTransition(page, armedClock, budgetMs) {
  if (!(budgetMs > 0)) throw Error('原操作观察期限已经耗尽');
  let observerExpired = false;
  try {
    await page.waitForFunction(({ key, origin }) => {
      const probe = window[key];
      if (!probe || probe.clock.timeOrigin !== origin) return true;
      const result = probe.transition();
      return result && (result.readyAt !== null || result.timedOut);
    }, { key: KEY, origin: armedClock.timeOrigin }, { timeout: budgetMs, polling: 'raf' });
  } catch { observerExpired = true; }
  let current;
  try { current = await page.evaluate(key => window[key]?.clock ?? null, KEY); }
  catch { return { comparableClock: false, reason: '原页面不可读取，未重开/重发', elapsedMs: null }; }
  if (!current || current.timeOrigin !== armedClock.timeOrigin) {
    return { comparableClock: false, reason: '完整文档导航；不拼接不同performance时钟', elapsedMs: null };
  }
  const result = await call(page, 'transition');
  return { comparableClock: true, ...result, timedOut: result.timedOut || observerExpired, observerExpired };
}
async function dispose(page) {
  if (!page.isClosed()) await page.evaluate(key => window[key]?.dispose(), KEY);
}

module.exports = { install, call, waitTransition, dispose, MIN_OPERATION_MS };
