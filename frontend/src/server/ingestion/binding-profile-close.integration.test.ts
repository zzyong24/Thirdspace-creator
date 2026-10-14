// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createDb } from '@creatoros/backend';
import { createHostBrowserProfileLifecycle } from '@creatoros/backend/modules/execution';
import { guardedLaunch } from '@creatoros/ai-worker/browser/chromium-guard';
import { createBrowserShutdownScope } from '@creatoros/ai-worker/browser/browser-shutdown-scope';
import { expect, it } from 'vitest';
import { adoptDouyinStagingDir, createDouyinStagingToken, douyinStagingDirFor } from './douyin-auth-staging';

it('真实临时Chromium停止→宿主租约释放→登录目录搬移→重开读回原Cookie', async () => {
  const base = await mkdtemp(join(tmpdir(), 't1259-binding-profile-'));
  const database = await createDb(); // 隔离内存PGlite，绝不读取用户库。
  const scope = createBrowserShutdownScope();
  const stage = douyinStagingDirFor(base, createDouyinStagingToken()), target = join(base, 'acct-fixture');
  const lifecycle = createHostBrowserProfileLifecycle(database.db, {
    resolveProfile: async dir => {
      if (![stage, target].includes(dir)) throw new Error('超出隔离测试目录');
      return { userId: 't1259-fixture', authDir: dir, profileKey: createHash('sha256').update(dir).digest('hex') };
    },
  });
  const deps = { listProfileProcesses: async () => [], removeFile: async () => {} };
  let physicalClosed = false;
  const stoppedPhases: boolean[] = [];
  try {
    await mkdir(stage, { recursive: true });
    const lease = await lifecycle.acquire(stage);
    const context = await guardedLaunch(stage, async () => {
      const context = await chromium.launchPersistentContext(stage, { headless: true, timeout: 180_000 });
      const close = context.close.bind(context);
      context.close = async options => { await close(options); physicalClosed = true; };
      return context;
    }, { shutdownScope: scope, onStopped: async () => {
      // 记录真实释放时机，不能在事件回调抛断言后被guard吞掉、稍后重试掩盖早放行。
      stoppedPhases.push(physicalClosed);
      await lease.onStopped();
    } }, deps);
    await context.addCookies([{ name: 'sessionid', value: 't1259-fixture-only', domain: '.example.invalid', path: '/', expires: Math.floor(Date.now() / 1000) + 3600 }]);
    await context.close();
    expect(stoppedPhases).toEqual([true]);
    await lifecycle.withProfiles([stage, target], () => adoptDouyinStagingDir(stage, target));
    const next = await lifecycle.acquire(target);
    const reopened = await guardedLaunch(target, () => chromium.launchPersistentContext(target, { headless: true, timeout: 180_000 }), {
      shutdownScope: scope, onStopped: next.onStopped,
    }, deps);
    expect(await reopened.cookies('https://example.invalid')).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'sessionid', value: 't1259-fixture-only' }),
    ]));
    await reopened.close();
  } finally {
    await scope.drain();
    await database.client.close();
    await rm(base, { recursive: true, force: true });
  }
}, 420_000);
