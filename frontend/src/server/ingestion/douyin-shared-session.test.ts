// @vitest-environment node
import { it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
const mocks = vi.hoisted(() => ({
  open: vi.fn()
}));
vi.mock('@creatoros/ai-worker/browser/douyin-profile-context', () => ({
  openDouyinProfileContext: mocks.open
}));
import { checkDouyinStatus } from './douyin-cdp';
import { configureHostBrowserProfileLifecycle } from './host-browser-profile-lifecycle';
it('生产状态探针经授权registry和共享pool，同账号两请求仅获一次DB租约，最后探针才关闭', async () => {
  let releaseCookies!: (value: unknown[]) => void;
  const pendingCookies = new Promise<unknown[]>(resolve => releaseCookies = resolve);
  const emitter = new EventEmitter(), close = vi.fn(async () => {
    emitter.emit('close');
  }), released = vi.fn(async () => {
  });
  mocks.open.mockImplementation(async (_dir: string, _headless: boolean, options: {
    onStopped: () => Promise<void>;
  }) => ({
    on: emitter.on.bind(emitter), off: emitter.off.bind(emitter), pages: () => [], newPage: vi.fn(), cookies: () => pendingCookies, clearCookies: vi.fn(), close: async () => {
      await close();
      await options.onStopped();
    }
  }));
  const authorize = vi.fn(async () => ({
    userId: 'fixture', authDir: '/fixture/canonical', profileKey: 'f'.repeat(64)
  }));
  const acquire = vi.fn(async () => ({
    authDir: '/fixture/canonical', onStopped: released
  }));
  configureHostBrowserProfileLifecycle(acquire, authorize);
  const first = checkDouyinStatus({
    authDir: '/fixture/account'
  }), second = checkDouyinStatus({
    authDir: '/fixture/account'
  });
  await vi.waitFor(() => expect(mocks.open).toHaveBeenCalledOnce());
  expect(acquire).toHaveBeenCalledOnce();
  expect(authorize).toHaveBeenCalledTimes(2);
  expect(close).not.toHaveBeenCalled();
  authorize.mockRejectedValueOnce(Error('owner mismatch'));
  await expect(checkDouyinStatus({
    authDir: '/fixture/account'
  })).rejects.toThrow('owner mismatch');
  expect(mocks.open).toHaveBeenCalledOnce();
  releaseCookies([{
      name: 'sessionid', value: 'fixture'
    }]);
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  expect(close).toHaveBeenCalledOnce();
  expect(released).toHaveBeenCalledOnce();
});
