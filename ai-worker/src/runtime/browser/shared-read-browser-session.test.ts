import { it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { BrowserContext, Page } from '@playwright/test';
import { createSharedReadBrowserSessionPool } from './shared-read-browser-session';
import { createBrowserShutdownScope } from './browser-shutdown-scope';
function deferred<T>() {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>(r => resolve = r), resolve
  };
}
class FakePage extends EventEmitter {
  closed = false;
  async close() {
    this.closed = true;
    this.emit('close');
  }
  isClosed() {
    return this.closed;
  }
  popup() {
    const page = new FakePage();
    this.emit('popup', page);
    return page;
  }
}
function context() {
  const emitter = new EventEmitter(), pages: FakePage[] = [];
  let closed = false;
  const raw = {
    on: emitter.on.bind(emitter), off: emitter.off.bind(emitter), pages: () => pages.filter(p => !p.closed), newPage: vi.fn(async () => {
      const p = new FakePage();
      pages.push(p);
      return p;
    }), cookies: vi.fn(async () => [{
        name: 'sessionid', value: 'fixture'
      }]), clearCookies: vi.fn(async () => {
    }), close: vi.fn(async () => {
      if (!closed) {
        closed = true;
        for (const p of pages)
          await p.close();
        emitter.emit('close');
      }
    })
  };
  return {
    raw: raw as unknown as BrowserContext, close: raw.close, pages, emitClosed: () => emitter.emit('close')
  };
}
function fixture(open?: (_profile: unknown, headless: boolean, signal: AbortSignal) => Promise<BrowserContext>) {
  const scope = createBrowserShutdownScope(), instances: ReturnType<typeof context>[] = [];
  const authorize = vi.fn(async (dir: string) => ({
    authDir: `/canonical/${dir}`, userId: 'user', profileKey: dir
  }));
  const launch = vi.fn(open ?? (async () => {
    const ctx = context();
    instances.push(ctx);
    return ctx.raw;
  }));
  return {
    scope, instances, authorize, launch, pool: createSharedReadBrowserSessionPool({
      scope, authorize, open: launch
    })
  };
}
it('同账号探针与采集只启动一次，每次仍授权；页面和popup隔离，最后借用者才关闭真实ctx', async () => {
  const f = fixture();
  const [a, b] = await Promise.all([f.pool.checkoutRead('a'), f.pool.checkoutRead('a')]);
  expect(f.launch).toHaveBeenCalledOnce();
  expect(f.authorize).toHaveBeenCalledTimes(2);
  const pa = await a.newPage(), pb = await b.newPage();
  const popup = (pa as unknown as FakePage).popup();
  expect(a.pages()).toEqual([pa, popup]);
  expect(b.pages()).toEqual([pb]);
  expect('clearCookies' in a).toBe(false);
  await a.close();
  expect(pa.isClosed()).toBe(true);
  expect(popup.isClosed()).toBe(true);
  expect(pb.isClosed()).toBe(false);
  expect(f.instances[0]!.close).not.toHaveBeenCalled();
  await b.close();
  expect(f.instances[0]!.close).toHaveBeenCalledOnce();
});
it('opening阶段单个取消不杀共享launch；全部取消后迟到ctx仍被关闭', async () => {
  const opened = deferred<BrowserContext>(), f = fixture(async () => opened.promise), a = new AbortController(), b = new AbortController();
  const first = f.pool.checkoutRead('a', a.signal), second = f.pool.checkoutRead('a', b.signal);
  const rejected = expect(first).rejects.toMatchObject({
    name: 'AbortError'
  });
  await vi.waitFor(() => expect(f.launch).toHaveBeenCalled());
  a.abort();
  await rejected;
  expect(f.launch.mock.calls[0]![2].aborted).toBe(false);
  const ctx = context();
  opened.resolve(ctx.raw);
  const borrowed = await second;
  expect(ctx.close).not.toHaveBeenCalled();
  await borrowed.close();
  expect(ctx.close).toHaveBeenCalledOnce();
  const late = deferred<BrowserContext>(), g = fixture(async () => late.promise), controller = new AbortController();
  const cancelled = g.pool.checkoutRead('b', controller.signal), failure = expect(cancelled).rejects.toMatchObject({
    name: 'AbortError'
  });
  await vi.waitFor(() => expect(g.launch).toHaveBeenCalled());
  controller.abort();
  await failure;
  const lateCtx = context();
  late.resolve(lateCtx.raw);
  await vi.waitFor(() => expect(lateCtx.close).toHaveBeenCalledOnce());
});
it('登录独占排队后，新读请求不得插队；不同账号可并行', async () => {
  const f = fixture(), first = await f.pool.checkoutRead('a');
  let loginReady = false, readerReady = false;
  const login = f.pool.checkoutExclusive('a').then(x => {
    loginReady = true;
    return x;
  });
  await vi.waitFor(() => expect(f.authorize).toHaveBeenCalledTimes(2));
  const reader = f.pool.checkoutRead('a').then(x => {
    readerReady = true;
    return x;
  });
  const other = await f.pool.checkoutRead('b');
  expect(f.launch).toHaveBeenCalledTimes(2);
  expect(loginReady).toBe(false);
  expect(readerReady).toBe(false);
  await first.close();
  const exclusive = await login;
  expect(f.launch.mock.calls[2]![1]).toBe(false);
  expect(readerReady).toBe(false);
  await exclusive.close();
  await (await reader).close();
  await other.close();
});
it('closing阶段不复用正在关闭的ctx，真实关闭确认后下一次重建；意外close也重建', async () => {
  const f = fixture(), a = await f.pool.checkoutRead('a'), closing = deferred<void>();
  f.instances[0]!.close.mockImplementationOnce(() => closing.promise);
  const stop = a.close();
  let ready = false;
  const next = f.pool.checkoutRead('a').then(x => {
    ready = true;
    return x;
  });
  await Promise.resolve();
  expect(ready).toBe(false);
  closing.resolve();
  await stop;
  const b = await next;
  expect(f.launch).toHaveBeenCalledTimes(2);
  f.instances[1]!.emitClosed();
  const c = await f.pool.checkoutRead('a');
  expect(f.launch).toHaveBeenCalledTimes(3);
  await c.close();
  await b.close();
});
it('已借用会话取消仅关闭自己的页；newPage在取消后迟到也会关闭', async () => {
  const f = fixture(), controller = new AbortController(), a = await f.pool.checkoutRead('a', controller.signal), b = await f.pool.checkoutRead('a');
  const pa = await a.newPage(), pb = await b.newPage();
  controller.abort();
  await vi.waitFor(() => expect(pa.isClosed()).toBe(true));
  expect(pb.isClosed()).toBe(false);
  expect(f.instances[0]!.close).not.toHaveBeenCalled();
  await b.close();
});
it('复用前授权失败不借用已有ctx或打开新页面', async () => {
  const f = fixture(), a = await f.pool.checkoutRead('a');
  f.authorize.mockRejectedValueOnce(Error('owner mismatch'));
  await expect(f.pool.checkoutRead('a')).rejects.toThrow('owner mismatch');
  expect(f.launch).toHaveBeenCalledOnce();
  await a.close();
});
it('已归还借用方的迟到popup仍被关闭，不遗留在其他借用方的ctx中', async () => {
  const f = fixture(), first = await f.pool.checkoutRead('a'), second = await f.pool.checkoutRead('a');
  const opener = await first.newPage(), other = await second.newPage();
  await first.close();
  const popup = (opener as unknown as FakePage).popup();
  await vi.waitFor(() => expect(popup.isClosed()).toBe(true));
  expect(other.isClosed()).toBe(false);
  await second.close();
});
it('取消期间迟到newPage被关闭，不影响其他借用方', async () => {
  const f = fixture(), controller = new AbortController(), a = await f.pool.checkoutRead('a', controller.signal), b = await f.pool.checkoutRead('a'), pb = await b.newPage();
  const pending = deferred<Page>();
  vi.mocked(f.instances[0]!.raw.newPage).mockImplementationOnce(() => pending.promise);
  const late = a.newPage(), rejected = expect(late).rejects.toMatchObject({
    name: 'AbortError'
  });
  controller.abort();
  const page = new FakePage();
  pending.resolve(page as unknown as Page);
  await rejected;
  await vi.waitFor(() => expect(page.closed).toBe(true));
  expect(pb.isClosed()).toBe(false);
  await b.close();
});
it('取消排队登录解除公平屏障，后续读请求可复用当前ctx', async () => {
  const f = fixture(), first = await f.pool.checkoutRead('a'), controller = new AbortController();
  const login = f.pool.checkoutExclusive('a', controller.signal), rejected = expect(login).rejects.toMatchObject({
    name: 'AbortError'
  });
  await vi.waitFor(() => expect(f.authorize).toHaveBeenCalledTimes(2));
  const later = f.pool.checkoutRead('a');
  controller.abort();
  await rejected;
  const second = await later;
  expect(f.launch).toHaveBeenCalledOnce();
  await first.close();
  await second.close();
});
it('同一物理档案的授权用户变化时拒绝复用', async () => {
  const f = fixture(), first = await f.pool.checkoutRead('a');
  f.authorize.mockResolvedValueOnce({
    authDir: '/canonical/a', profileKey: 'a', userId: 'other'
  });
  await expect(f.pool.checkoutRead('a')).rejects.toThrow('归属');
  expect(f.launch).toHaveBeenCalledOnce();
  await first.close();
});
it('最后ctx关闭失败不提前放行，后续checkout重试真实关闭后再创建', async () => {
  const f = fixture(), first = await f.pool.checkoutRead('a');
  f.instances[0]!.close.mockRejectedValueOnce(Error('still live'));
  await expect(first.close()).rejects.toThrow('still live');
  const next = await f.pool.checkoutRead('a');
  expect(f.instances[0]!.close).toHaveBeenCalledTimes(2);
  expect(f.launch).toHaveBeenCalledTimes(2);
  await next.close();
});
it('真实关闭失败时已排队的请求明确返回档案忙，不无限挂起或提前打开第二个ctx', async () => {
  const f = fixture(), first = await f.pool.checkoutRead('a');
  const login = f.pool.checkoutExclusive('a');
  const failure = expect(login).rejects.toMatchObject({code:'BROWSER_PROFILE_BUSY'});
  await vi.waitFor(() => expect(f.authorize).toHaveBeenCalledTimes(2));
  f.instances[0]!.close.mockRejectedValueOnce(Error('still live'));
  await expect(first.close()).rejects.toThrow('still live');
  await failure;
  expect(f.launch).toHaveBeenCalledOnce();
  await (await f.pool.checkoutRead('a')).close();
});
