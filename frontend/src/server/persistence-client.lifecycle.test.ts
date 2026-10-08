// @vitest-environment node
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect, it, vi} from 'vitest';
const fixture = vi.hoisted(() => ({closed: false, sweeps: 0, close: async () => {}, cronStop: vi.fn(), cronDestroy: vi.fn(), cronCallback: undefined as (() => void) | undefined}));
vi.mock('node-cron', () => ({validate: () => true, schedule: (_expression: string, callback: () => void) => {fixture.cronCallback = callback; return {stop: fixture.cronStop, destroy: fixture.cronDestroy};}}));
vi.mock('./execution-worker-path', () => {
 const missing = () => {throw Error('隔离夹具无外部 Worker');};
 return Object.fromEntries(['resolveExecutionWorkerPath','resolveAgenticWorkerPath','resolveIntelligenceGenerationWorkerPath','resolveIntelligenceTranscriptWorkerPath','resolveEmbeddingWorkerPath','resolveFlywheelWorkerPath','resolveModelProbeWorkerPath','resolveCodexStatusWorkerPath'].map(name => [name, missing]));
});
vi.mock('@creatoros/backend', async originalImport => {
 const original = await originalImport<typeof import('@creatoros/backend')>();
 return {...original, resolveMasterKey: () => ({key: Buffer.alloc(32, 7), degraded: false}), createConfiguredDb: async () => {
  const opened = await original.createDb(); let closed = false; fixture.close = async () => {if (!closed) {closed = true; await opened.client.close();}};
  return {db: opened.db, driver: {kind: 'memory-pglite'}, dispose: async () => {fixture.closed = true; await fixture.close();}};
 }};
});
vi.mock('@creatoros/backend/modules/ai-runtime', async originalImport => {
 const original = await originalImport<typeof import('@creatoros/backend/modules/ai-runtime')>();
 return {...original, sweepStaleAiTasks: async (...args: Parameters<typeof original.sweepStaleAiTasks>) => {
  if (fixture.closed) throw Error('停止后仍查询已关闭数据库'); fixture.sweeps++; return original.sweepStaleAiTasks(...args);
 }};
});
import {getIdentityService, __resetPersistenceForTests} from './persistence-client';

it('真实持久层 dispose 停止分钟 cron 和周期 sweep，停止后十次触发不再查询数据库', async () => {
 const directory = await mkdtemp(join(tmpdir(), 't1073-root-lifecycle-'));
 fixture.closed = false; fixture.sweeps = 0;
 fixture.cronStop.mockClear(); fixture.cronDestroy.mockClear(); fixture.cronCallback = undefined;
 for (const [name, value] of Object.entries({NODE_ENV: 'production', VITEST: '', CI: '', NEXT_PHASE: '', CREATOROS_DISABLE_SCHEDULER: '', CREATOROS_DISABLE_BACKGROUND_DRIVERS: '', DATABASE_URL: '', S3_BUCKET: '', CREATOROS_WORKSPACES_ROOT: join(directory,'workspaces'), CREATOROS_DOUYIN_AUTH_DIR: join(directory,'douyin'), CREATOROS_WEB_AUTH_DIR: join(directory,'web'), CREATOROS_BROWSER_POOL_DIR: join(directory,'pool')})) vi.stubEnv(name, value);
 __resetPersistenceForTests();
 vi.useFakeTimers();
 try {
  await getIdentityService();
  await vi.waitFor(() => expect(fixture.cronCallback).toBeTypeOf('function'), {timeout: 120000});
  // 确认周期清扫真正启动，而非测试环境早退造成假通过。
  await vi.advanceTimersByTimeAsync(30*60*1000); expect(fixture.sweeps).toBeGreaterThan(1);
  const dispose = (globalThis as {__creatorosDisposePersistence?: () => Promise<void>}).__creatorosDisposePersistence!;
  await dispose(); expect(fixture.closed).toBe(true);
  expect(fixture.cronStop).toHaveBeenCalledOnce(); expect(fixture.cronDestroy).toHaveBeenCalledOnce();
  const before = fixture.sweeps;
  for(let i=0;i<10;i++) fixture.cronCallback!();
  await vi.advanceTimersByTimeAsync(10*30*60*1000);
  expect(fixture.sweeps).toBe(before); expect(vi.getTimerCount()).toBe(0);
  process.stdout.write(JSON.stringify({witness: 'T-1073 root dispose', sweepsBeforeStop: before, sweepsAfterStop: fixture.sweeps, cronStops: fixture.cronStop.mock.calls.length, timersAfterStop: vi.getTimerCount()}) + '\n');
 } finally {
  await globalThis.__creatorosAutomationDriver?.stop(); await fixture.close(); __resetPersistenceForTests();
  globalThis.__creatorosAutomationDriverStarted = false;
  vi.useRealTimers(); vi.unstubAllEnvs(); await rm(directory, {recursive: true, force: true});
 }
});
