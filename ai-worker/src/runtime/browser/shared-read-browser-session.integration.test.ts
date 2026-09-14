import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createSharedReadBrowserSessionPool } from './shared-read-browser-session';
import { createBrowserShutdownScope } from './browser-shutdown-scope';
import { guardedLaunch, chromiumSandboxOpts } from './chromium-guard';
import { launchWithBrowser } from './browser-launch';
it('真实Chromium端口：同账号复用、不同账号并行、页面popup及取消隔离、末位释放', async () => {
  const root = await mkdtemp(join(tmpdir(), 'creatoros-shared-session-')), scope = createBrowserShutdownScope();
  let opens = 0, releases = 0;
  const pool = createSharedReadBrowserSessionPool({
    scope, authorize: async (account) => ({
      userId: 'integration', authDir: join(root, account), profileKey: account
    }), open: async (identity) => {
      opens++;
      return guardedLaunch(identity.authDir, () => launchWithBrowser(selection => chromium.launchPersistentContext(identity.authDir, {
        headless: true, ...selection, ...chromiumSandboxOpts()
      })), {
        shutdownScope: scope, onStopped: async () => {
          releases++;
        }
      });
    }
  });
  try {
    const controller = new AbortController();
    const [a, b, other] = await Promise.all([pool.checkoutRead('a', controller.signal), pool.checkoutRead('a'), pool.checkoutRead('b')]);
    expect(opens).toBe(2);
    const pa = await a.newPage(), pb = await b.newPage();
    await pa.goto('data:text/html,<title>A</title>');
    await pb.goto('data:text/html,<title>B</title>');
    const popupReady = pa.waitForEvent('popup');
    await pa.evaluate(() => {
      window.open('about:blank');
    });
    const popup = await popupReady;
    expect(a.pages()).toContain(popup);
    expect(b.pages()).toEqual([pb]);
    await a.cookies('https://creator.douyin.com');
    controller.abort();
    await expect.poll(() => pa.isClosed() && popup.isClosed()).toBe(true);
    expect(await pb.title()).toBe('B');
    expect(releases).toBe(0);
    await b.close();
    expect(releases).toBe(1);
    await other.close();
    expect(releases).toBe(2);
    const [active, probe] = await Promise.all([pool.checkoutRead('a'), pool.checkoutRead('a')]);
    const activePage = await active.newPage();
    await probe.cookies('https://creator.douyin.com');
    await scope.drain();
    expect(activePage.isClosed()).toBe(true);
    expect(releases).toBe(3);
    await expect(pool.checkoutRead('a')).rejects.toMatchObject({
      name: 'AbortError'
    });
  }
  finally {
    await scope.drain();
    await rm(root, {
      recursive: true, force: true
    });
  }
}, 30000);
