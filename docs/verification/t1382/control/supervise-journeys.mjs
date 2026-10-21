#!/usr/bin/env node
// 独立 watchdog；由 run-journeys.mjs fork，必须先等待 ready 再 hash/copy/启动业务。
// 只接受父进程 IPC init，不能用公开 CLI 参数指定任意 PID/目录。
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, realpath, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const TOTAL_BUDGET_MS = 600_000 + 21_600_000 + 120_000 + 600_000;
const CLEANUP_MS = 120_000;
const PROBE_MS = 120_000;
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const identity = (row) => `${row.pid}:${row.uid}:${row.born}`;
const ownUid = process.getuid?.();

function exec(program, args) {
  return new Promise((done, reject) => {
    execFile(program, args, { encoding: 'utf8', timeout: PROBE_MS, maxBuffer: 32 * 1024 * 1024,
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LC_ALL: 'C', LANG: 'C' } }, (error, stdout, stderr) => {
      if (error && (typeof error.code !== 'number' || error.killed)) reject(error);
      else done({ code: error?.code ?? 0, stdout, stderr });
    });
  });
}

async function snapshot() {
  const result = await exec('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,uid=,lstart=,command=']);
  assert.equal(result.code, 0, '无法核对进程身份');
  assert.equal(result.stderr.trim(), '', '进程身份检查不完整');
  const lines = result.stdout.split('\n').filter((line) => line.trim());
  assert(lines.length, '进程列表为空');
  return lines.map((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.{24})\s+(.+)$/);
    assert(match, 'ps身份格式不可识别');
    return { pid: +match[1], ppid: +match[2], pgid: +match[3], uid: +match[4], born: match[5] };
  });
}

async function missing(path) {
  try { await lstat(path); return false; }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}

async function occupants(path) {
  if (await missing(path)) return [];
  const result = await exec('/usr/sbin/lsof', ['-nP', '-F', 'p', '+D', path]);
  assert.equal(result.stderr.trim(), '', '私有目录占用检查不完整');
  if (result.code === 1 && !result.stdout.trim()) return [];
  assert.equal(result.code, 0, '私有目录占用检查失败');
  const lines = result.stdout.split('\n').filter(Boolean);
  assert(lines.every((line) => /^p\d+$/.test(line)), '私有目录占用格式不可识别');
  return [...new Set(lines.map((line) => +line.slice(1)))];
}

async function noLinks(path) {
  const stat = await lstat(path);
  assert(!stat.isSymbolicLink(), '私有根含符号链接，拒绝删除');
  assert(stat.uid === ownUid, '私有目录归属变化，拒绝删除');
  if (stat.isDirectory()) for (const name of await readdir(path)) await noLinks(join(path, name));
}

async function watchdog() {
  assert.equal(process.platform, 'darwin');
  assert.equal(typeof ownUid, 'number');
  assert(process.send && process.connected, 'watchdog只能由父runner通过IPC启动');
  const initialParent = process.ppid;
  let initialized = false, doneRequested = false, reason, wake;
  const pulse = () => { const callback = wake; wake = undefined; callback?.(); };
  const messages = (message) => {
    if (message?.type === 'done' && initialized) { doneRequested = true; pulse(); }
  };
  process.on('message', messages);
  process.on('disconnect', () => { reason ??= 'runner-ipc-disconnected'; pulse(); });
  process.on('SIGTERM', () => { reason ??= 'watchdog-sigterm'; pulse(); });
  process.on('SIGINT', () => { reason ??= 'watchdog-sigint'; pulse(); });
  const init = await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(Error('watchdog-init-timeout')), PROBE_MS);
    const listener = (message) => {
      if (message?.type !== 'init') return;
      clearTimeout(timer); process.off('message', listener); done(message);
    };
    process.on('message', listener);
  });
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const runs = await realpath(join(repository, 'docs/verification/t1382/journey/runs'));
  const privateRoot = await realpath(init.privateRoot), runDir = await realpath(init.runDir);
  assert.equal(dirname(privateRoot), await realpath(tmpdir()), '私有根必须是系统tmp直属目录');
  assert(basename(privateRoot).startsWith('creatoros-t1382-journey-'), '私有根名字不匹配');
  assert.equal(dirname(runDir), runs, '证据目录必须是本任务runs直属目录');
  const rootStat = await lstat(privateRoot), runStat = await lstat(runDir);
  assert(!rootStat.isSymbolicLink() && rootStat.isDirectory() && rootStat.uid === ownUid);
  assert((rootStat.mode & 0o077) === 0, '私有根必须0700');
  assert(runStat.isDirectory() && runStat.uid === ownUid);
  const rows = await snapshot(), parent = rows.find((row) => row.pid === initialParent);
  assert(parent?.uid === ownUid && initialParent !== 1, 'runner父进程已消失或身份不符');
  assert.equal(init.runnerPid, initialParent, '禁止监督非父进程');
  const tracked = new Map([[parent.pid, parent]]);
  const errors = [], startedAt = new Date().toISOString();
  const absoluteDeadline = Date.now() + TOTAL_BUDGET_MS;
  // 在全预算前预留120秒TERM宽限；到总截止时KILL。
  const timer = setTimeout(() => { reason ??= 'outer-deadline'; pulse(); }, TOTAL_BUDGET_MS - CLEANUP_MS);
  initialized = true;
  process.send({ type: 'ready', watchdogPid: process.pid, runnerIdentity: identity(parent), totalBudgetMs: TOTAL_BUDGET_MS });

  function adopt(current) {
    const live = new Map(current.map((row) => [row.pid, row]));
    // 历史PID仅在出生身份仍匹配时可以作为后代发现根，绝不覆盖旧身份。
    const ids = new Set([...tracked.values()].filter((row) => identity(live.get(row.pid) ?? {}) === identity(row)).map((row) => row.pid));
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of current) if (row.pid !== process.pid && row.uid === ownUid && ids.has(row.ppid) && !ids.has(row.pid)) {
        // PID复用不能替换历史身份，也不允许从该新身份继续遍历。
        const previous = tracked.get(row.pid);
        if (previous && identity(previous) !== identity(row)) continue;
        tracked.set(row.pid, row); ids.add(row.pid); changed = true;
      }
    }
    return current.filter((row) => row.pid !== process.pid && identity(tracked.get(row.pid) ?? {}) === identity(row));
  }
  async function observe() {
    const current = await snapshot();
    const live = adopt(current);
    return { current, live, parentAlive: current.some((row) => identity(row) === identity(parent)) };
  }
  function signal(live, name) {
    // 逐PID发信号，不按PG广播；防同一PG混入无关身份，detached子树仍由tracked覆盖。
    for (const row of [...live].sort((a, b) => (a.pid === parent.pid ? -1 : b.pid === parent.pid ? 1 : 0))) {
      try { process.kill(row.pid, name); }
      catch (error) { if (error.code !== 'ESRCH') errors.push(`signal:${name}:${row.pid}:${error.code}`); }
    }
  }
  async function record(value) {
    await writeFile(join(runDir, 'watchdog.json'), JSON.stringify({ schema: 't1382-watchdog/v1', started_at: startedAt,
      finished_at: new Date().toISOString(), total_budget_ms: TOTAL_BUDGET_MS, runner_pid: parent.pid,
      reason, owned_pids: [...tracked.keys()], errors, ...value }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  }
  try {
    while (!reason && !doneRequested) {
      try { const state = await observe(); if (!state.parentAlive) reason ??= 'runner-identity-disappeared'; }
      catch (error) { errors.push(error.message); reason ??= 'process-audit-failed'; }
      if (!reason && !doneRequested) await new Promise((done) => { wake = done; setTimeout(pulse, 1000).unref(); });
    }
    if (doneRequested && !reason) {
      const state = await observe();
      const descendants = state.live.filter((row) => row.pid !== parent.pid);
      if (descendants.length === 0 && await missing(privateRoot)) {
        reason = 'runner-done'; await record({ status: 'released', private_root_removed: true }); return;
      }
      reason = 'runner-done-with-leftovers';
    }
    const cleanupDeadline = Math.min(Date.now() + CLEANUP_MS, absoluteDeadline);
    let lastLive = [];
    do {
      try {
        // lsof补充抓取已reparent、仍持有本轮私有路径的进程；拒绝其他UID。
        const pids = await occupants(privateRoot), state = await observe();
        for (const pid of pids) {
          const row = state.current.find((candidate) => candidate.pid === pid);
          if (!row || pid === process.pid || row.uid !== ownUid) throw Error('私有根有无法确认归属的占用者');
          const previous = tracked.get(pid);
          if (previous && identity(previous) !== identity(row)) throw Error('私有根占用PID发生身份复用');
          tracked.set(pid, row);
        }
        lastLive = adopt(state.current);
        signal(lastLive, 'SIGTERM');
        if (!lastLive.length && !pids.length) break;
      } catch (error) { errors.push(error.message); }
      if (Date.now() < cleanupDeadline) await delay(500);
    } while (Date.now() < cleanupDeadline);
    try { lastLive = (await observe()).live; signal(lastLive, 'SIGKILL'); }
    catch (error) { errors.push(error.message); }
    await delay(1000);
    const finalState = await observe(), openPids = await occupants(privateRoot);
    const survivors = finalState.live.map((row) => row.pid);
    const stopped = survivors.length === 0 && openPids.length === 0;
    // 检查不完整时不删除；只删初始inode相同的本轮root，绝不删源库/其他tmp。
    let removed = await missing(privateRoot);
    if (stopped && errors.length === 0 && !removed) {
      const stat = await lstat(privateRoot);
      assert.equal(stat.dev, rootStat.dev); assert.equal(stat.ino, rootStat.ino);
      assert.equal(await realpath(privateRoot), privateRoot);
      await noLinks(privateRoot);
      await rm(privateRoot, { recursive: true, force: false });
      removed = await missing(privateRoot);
    }
    await record({ status: stopped && removed && errors.length === 0 ? 'recovered' : 'failed',
      observed_processes_stopped: stopped, full_descendant_capture_proven: false,
      private_root_removed: removed, survivor_pids: survivors, open_pids: openPids,
      limitation: '轮询不能证明捕获瞬间生成后已脱离且不再持有本轮路径的全部后代；不按名称杀用户进程。' });
    process.exitCode = stopped && removed && errors.length === 0 ? 0 : 1;
  } catch (error) {
    errors.push(error.message);
    await record({ status: 'failed', private_root_removed: await missing(privateRoot) }).catch(() => {});
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    if (process.connected) process.disconnect();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  watchdog().catch((error) => { console.error(`watchdog初始化失败：${error.message}`); process.exitCode = 1; if (process.connected) process.disconnect(); });
}
