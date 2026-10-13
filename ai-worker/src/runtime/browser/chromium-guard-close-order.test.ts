import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { createBrowserShutdownScope } from './browser-shutdown-scope';
import { guardedLaunch, liveContextCount } from './chromium-guard';

const deps = { listProfileProcesses: async () => [], removeFile: async () => {} };
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

for (const synchronous of [true, false]) {
  it(`主动关闭${synchronous ? '同步' : '异步'}发出close事件时，完整关闭前保留宿主占用`, async () => {
    const profile = `/isolated/t1259-close-${synchronous}`;
    const scope = createBrowserShutdownScope();
    const events = new EventEmitter(), physical = deferred();
    const onStopped = vi.fn(async () => {});
    const browser = await guardedLaunch(profile, async () => ({
      on: events.on.bind(events),
      close: async () => {
        if (!synchronous) await Promise.resolve();
        events.emit('close');
        await physical.promise;
      },
    }), { onStopped, shutdownScope: scope }, deps);
    const closing = browser.close();
    // 给事件后的释放微任务机会，不能仅在事件发出前断言。
    await new Promise(resolve => setImmediate(resolve));
    try {
      expect(onStopped).not.toHaveBeenCalled();
      expect(liveContextCount(profile)).toBe(1);
    } finally {
      physical.resolve();
      await closing;
      await scope.drain();
    }
    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(liveContextCount(profile)).toBe(0);
  }, 120_000);
}

it('close事件早到但主动关闭失败，原档案仍占用且允许再次关闭', async () => {
  const profile = '/isolated/t1259-close-event-failure';
  const scope = createBrowserShutdownScope(), events = new EventEmitter();
  const physical = deferred(), onStopped = vi.fn(async () => {});
  let first = true;
  const browser = await guardedLaunch(profile, async () => ({
    on: events.on.bind(events),
    close: async () => {
      if (first) { first = false; events.emit('close'); await physical.promise; }
    },
  }), { onStopped, shutdownScope: scope }, deps);
  const closing = browser.close();
  const failure = expect(closing).rejects.toThrow('仍有文件句柄');
  physical.reject(new Error('仍有文件句柄'));
  await failure;
  try {
    expect(onStopped).not.toHaveBeenCalled();
    expect(liveContextCount(profile)).toBe(1);
  } finally {
    await browser.close();
    await scope.drain();
  }
  expect(onStopped).toHaveBeenCalledTimes(1);
}, 120_000);
