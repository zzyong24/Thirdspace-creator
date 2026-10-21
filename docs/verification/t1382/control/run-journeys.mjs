#!/usr/bin/env node
// 仅在沙箱外显式运行；import / --help 不复制数据库、不启动服务。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fork, spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { get as httpGet } from 'node:http';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTROL = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(CONTROL, '../../../..');
const COMMAND = 'node docs/verification/t1382/control/run-journeys.mjs';
const PORT = 3441;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PROBE_MS = 120_000;
const START_MS = 600_000;
const PLAYWRIGHT_MS = 21_600_000; // 配置全局6h；20例每例15m，保留冷编译/等待余量。
const CLEANUP_MS = 120_000;
const OUTER_MS = START_MS + PLAYWRIGHT_MS + CLEANUP_MS + 600_000;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const rel = (value) => relative(ROOT, value).split('\\').join('/');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
function save(file, value) { writeFileSync(file, json(value), { mode: 0o600, flag: 'wx' }); }
function command(file, args, options = {}) {
  const result = spawnSync(file, args, { cwd: ROOT, encoding: 'utf8', timeout: PROBE_MS, maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  return result;
}
function git(args) {
  const result = command('git', args);
  assert.equal(result.status, 0, `git ${args[0]} 失败`);
  return result.stdout.trim();
}
function contract() {
  const source = readFileSync(join(CONTROL, 'PAGE_SPEC.md'), 'utf8');
  const blocks = [...source.matchAll(/```frontend-journey-contract\s*\n([\s\S]*?)\n```/g)];
  assert.equal(blocks.length, 1, '需要唯一旅程合约');
  return { value: JSON.parse(blocks[0][1]), digest: sha(source).slice(0, 12) };
}
function watchedClean(paths) {
  assert(paths.length > 0);
  const committed = new Set(git(['ls-tree', '--full-tree', '-r', '--name-only', 'HEAD', '--', ...paths]).split('\n'));
  for (const item of paths) {
    assert(existsSync(resolve(ROOT, item)), `监视文件不存在：${item}`);
    assert(committed.has(item), `监视文件尚未提交（忽略文件须显式纳入）：${item}`);
  }
  const status = git(['status', '--porcelain=v1', '--untracked-files=all', '--', ...paths.map((p) => `:(literal)${p}`)]);
  assert.equal(status, '', '请先由外部提交本次监视文件；禁止在脏代码上绑定正式运行');
}
function psRows() {
  const result = command('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,lstart=,command=']);
  assert.equal(result.status, 0, '无法核对进程归属，停止');
  return result.stdout.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.{24})\s+(.+)$/);
    return match ? [{ pid: +match[1], ppid: +match[2], pgid: +match[3], born: match[4], command: match[5] }] : [];
  });
}
function lsofEmpty(args, label) {
  const result = command('/usr/sbin/lsof', ['-nP', ...args]);
  assert(!result.stderr.trim(), `${label}占用检查不完整，停止`);
  assert(result.status === 1 && !result.stdout.trim(), `${label}仍被占用或无法证明空闲，请在外部处理后重新运行`);
}
function sourceFree(source) {
  const rows = psRows();
  assert(rows.length > 0, '进程列表为空，无法证明已退出');
  assert(!rows.some((row) => /(?:CreatorOS|creatoros)\.app\/Contents\//.test(row.command)), '已装 CreatorOS 仍运行；本脚本不会杀用户应用');
  lsofEmpty(['+D', source], '已装数据库');
}
function sourceManifest(source) {
  const files = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name), info = lstatSync(file);
      assert(!info.isSymbolicLink(), '源库含符号链接，拒绝复制');
      if (info.isDirectory()) visit(file);
      else {
        assert(info.isFile(), '源库含特殊文件，拒绝复制');
        files.push({ path: relative(source, file), size: info.size, sha256: sha(readFileSync(file)) });
      }
    }
  }
  visit(source);
  assert(files.length > 0, '源库为空');
  return { sha256: sha(JSON.stringify(files)), files: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0) };
}
function envFiles() {
  return [ROOT, join(ROOT, 'frontend')].flatMap((dir) => ['.env', '.env.local', '.env.development', '.env.development.local'].map((name) => join(dir, name)));
}
function isolatedEnv(privateRoot, runDir, metadata) {
  // 只传播运行时白名单；不读取.env值，禁止Next合并且OS拒绝.env读取。
  const env = {};
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL']) if (process.env[key]) env[key] = process.env[key];
  return { ...env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', __NEXT_PROCESSED_ENV: '1',
    DATABASE_URL: '', PGLITE_DATA_DIR: join(privateRoot, 'db'), CREATOROS_DB_DIR: join(privateRoot, 'db'),
    CODEX_HOME: join(privateRoot, 'codex'), TMPDIR: join(privateRoot, 'tmp'),
    CREATOROS_DEV_MODE: '1', CREATOROS_DISABLE_BACKGROUND_DRIVERS: '1', CREATOROS_DISABLE_SCHEDULER: '1',
    CREATOROS_MEDIA_ROOT: join(privateRoot, 'media'), CREATOROS_DATABASE_BACKUP_DIR: join(privateRoot, 'backups'),
    CREATOROS_DOUYIN_AUTH_DIR: join(privateRoot, 'auth-douyin'), CREATOROS_WEB_AUTH_DIR: join(privateRoot, 'auth-web'),
    CREATOROS_BROWSER_POOL_DIR: join(privateRoot, 'browser-pool'), CREATOROS_LOCAL_READ_GRANTS_FILE: join(privateRoot, 'local-read-grants.json'),
    NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
    T1382_JOURNEY_RUN_DIR: runDir, T1382_JOURNEY_RUN_ID: metadata.run_id,
    T1382_JOURNEY_COMMIT_SHA: metadata.commit_sha, T1382_JOURNEY_CONTRACT_SHA: metadata.contract_sha,
    T1382_JOURNEY_BASE_URL: BASE_URL, T1382_JOURNEY_MODE: metadata.mode,
  };
}
function sandboxProfile(privateRoot, runDir, sourceRoot) {
  const quote = (text) => JSON.stringify(text);
  const writable = [privateRoot, runDir, join(ROOT, 'frontend/.next'), join(ROOT, 'ai-worker/dist')];
  return `(version 1)\n(allow default)\n` +
    // 仅3441可出站，禁止 localhost:* 绕到本地代理/真实模型网关。
    `(deny network*)\n(allow network-bind (local ip "127.0.0.1:${PORT}"))\n(allow network-inbound (local ip "127.0.0.1:${PORT}"))\n(allow network-outbound (remote ip "127.0.0.1:${PORT}"))\n` +
    `(deny file-write*)\n${writable.map((p) => `(allow file-write* (subpath ${quote(p)}))`).join('\n')}\n` +
    `(allow file-write* (literal "/dev/null") (literal "/dev/tty"))\n` +
    [sourceRoot, join(homedir(), '.codex'), join(homedir(), '.creatoros'), join(ROOT, '.auth'), join(ROOT, 'frontend/.auth')].map((p) => `(deny file-read* (subpath ${quote(p)}))`).join('\n') + '\n' +
    envFiles().map((p) => `(deny file-read-data (literal ${quote(p)}))`).join('\n') + '\n';
}
async function run(options) {
  assert.equal(process.platform, 'darwin', '此运行器限定已审计macOS沙箱宿主');
  assert(existsSync('/usr/bin/sandbox-exec'), '缺少OS出站隔离，拒绝运行');
  const current = contract();
  assert.equal(current.value.task_id, 'T-1382');
  watchedClean(current.value.watched_paths);
  const head = git(['rev-parse', 'HEAD']);
  assert.equal(JSON.parse(readFileSync(join(ROOT, 'orchestrator/process/reconcile.config.json'), 'utf8')).frontend_verify_commands['t1382-unified-intake:e2e'], COMMAND);
  const disk = command('/bin/df', ['-k', '/System/Volumes/Data']);
  assert.equal(disk.status, 0);
  assert(+disk.stdout.trim().split('\n').at(-1).trim().split(/\s+/)[3] >= 5 * 1024 * 1024, '可用空间低于5GiB');
  const source = join(homedir(), 'Library/Application Support/cloud.aitongban.creatoros/db');
  assert(existsSync(source), '已装账号数据库不存在');
  assert.equal(realpathSync(source), source, '真实数据库路径不能为符号链接');
  sourceFree(source);
  lsofEmpty(['-iTCP:' + PORT, '-sTCP:LISTEN'], '旅程端口');
  assert(!existsSync(join(ROOT, 'frontend/.next/dev/lock')), '已有Next dev锁，拒绝争用缓存（不要自动删除）');
  const runs = join(ROOT, 'docs/verification/t1382/journey/runs');
  mkdirSync(runs, { recursive: true, mode: 0o700 });
  const runDir = mkdtempSync(join(runs, `${options.mode}-${new Date().toISOString().replaceAll(':', '-')}-`));
  const privateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'creatoros-t1382-journey-')));
  const metadata = { schema: 't1382-journey-run/v1', task_id: 'T-1382', run_id: runDir.split('/').at(-1),
    mode: options.mode, commit_sha: head, contract_sha: current.digest, command: COMMAND,
    invocation_command: options.invocationCommand,
    verify_key: 't1382-unified-intake:e2e', started_at: new Date().toISOString(),
    runtime: '真实 Chromium 浏览器 + Next dev + 已装账号 PGlite 私有副本',
    playwright_report: rel(join(runDir, 'playwright-results.json')), output_ref: rel(join(runDir, 'playwright.log')),
    red_ref: options.redRef ?? null,
    ...(options.mode === 'red' ? { red_test_id: 'J03-manual-create', red_check_id: 'AC-1382-MANUAL', red_sentinel_ref: rel(join(runDir, 'red-sentinel.json')) } : {}),
    safety: { evidence_refs: {} } };
  const tracked = new Map(), children = [], fds = [];
  let before, stopping = false, monitor, outer, caught, interrupted, watchdog, watchdogFd;
  const cancellationPoint = async () => { await sleep(0); assert(!interrupted && !caught, "运行已取消，不启动后续步骤"); };
  const remember = () => {
    const rows = psRows();
    const ids = new Set(rows.filter((row) => tracked.get(row.pid)?.born === row.born).map((row) => row.pid));
    for (const child of children) if (!tracked.has(child.pid) && child.exitCode === null && child.signalCode === null) ids.add(child.pid);
    for (const row of rows) if (row.command.includes(privateRoot)) ids.add(row.pid);
    let added = true;
    while (added) { added = false; for (const row of rows) if (ids.has(row.ppid) && !ids.has(row.pid)) { ids.add(row.pid); added = true; } }
    for (const row of rows) if (ids.has(row.pid) && !tracked.has(row.pid)) tracked.set(row.pid, row);
    return rows;
  };
  const launch = (program, args, file, env) => {
    const fd = openSync(file, 'wx', 0o600); fds.push(fd);
    const child = spawn('/usr/bin/sandbox-exec', ['-f', join(privateRoot, 'isolation.sb'), program, ...args], { cwd: join(ROOT, 'frontend'), env, stdio: ['ignore', fd, fd], detached: true });
    children.push(child);
    remember();
    child.on('error', (error) => { caught ??= error; });
    return child;
  };
  const killOwned = (signal) => {
    const rows = remember();
    const live = rows.filter((row) => tracked.get(row.pid)?.born === row.born);
    const groups = new Set(live.map((row) => row.pgid).filter((pgid) => rows.filter((row) => row.pgid === pgid).every((row) => tracked.get(row.pid)?.born === row.born)));
    for (const pgid of groups) { try { process.kill(-pgid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    for (const row of live) { try { process.kill(row.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    return live;
  };
  const cancel = (signal) => { interrupted = signal; if (!stopping) { try { killOwned('SIGTERM'); } catch (error) { caught ??= error; } } };
  const onInt = () => cancel('SIGINT'), onTerm = () => cancel('SIGTERM');
  process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
  try {
    watchdogFd = openSync(join(runDir, 'watchdog.log'), 'wx', 0o600);
    const watchdogEnv = { PATH: process.env.PATH, HOME: homedir(), TMPDIR: tmpdir(), LANG: 'C', LC_ALL: 'C' };
    watchdog = fork(join(CONTROL, 'supervise-journeys.mjs'), [], { cwd: ROOT, env: watchdogEnv, detached: true, stdio: ['ignore', watchdogFd, watchdogFd, 'ipc'] });
    await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(Error('独立监督者未就绪')), PROBE_MS);
      watchdog.once('error', (error) => { clearTimeout(timer); reject(error); });
      watchdog.once('exit', () => { if (!stopping) { caught ??= Error('独立监督者提前退出'); cancel('watchdog-exited'); } });
      watchdog.on('message', (message) => { if (message?.type === 'ready') { clearTimeout(timer); done(); } });
      watchdog.send({ type: 'init', runnerPid: process.pid, privateRoot, runDir });
    });
    save(join(runDir, 'source-preflight.json'), { app_stopped: true, source_unoccupied: true, port: PORT, checked_at: new Date().toISOString() });
    metadata.safety.source_unoccupied = true;
    metadata.safety.evidence_refs.source_unoccupied = rel(join(runDir, 'source-preflight.json'));
    before = sourceManifest(source);
    const available = +disk.stdout.trim().split('\n').at(-1).trim().split(/\s+/)[3] * 1024;
    assert(available > before.bytes + 5 * 1024 ** 3, '复制后剩余空间不足5GiB');
    cpSync(source, join(privateRoot, 'db'), { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    assert.equal(sourceManifest(join(privateRoot, 'db')).sha256, before.sha256, '复制品与源库摘要不一致');
    sourceFree(source);
    assert.equal(sourceManifest(source).sha256, before.sha256, '复制期间真实库发生变化，停止');
    for (const name of ['codex', 'tmp', 'media', 'backups', 'auth-douyin', 'auth-web', 'browser-pool']) mkdirSync(join(privateRoot, name), { mode: 0o700 });
    const env = isolatedEnv(privateRoot, runDir, metadata);
    const profile = sandboxProfile(privateRoot, runDir, dirname(source));
    writeFileSync(join(privateRoot, 'isolation.sb'), profile, { mode: 0o600 });
    writeFileSync(join(runDir, 'isolation.sb'), profile, { mode: 0o600, flag: 'wx' });
    // 不访问真实供应商；保留地址与另一loopback端口必须在connect时明确EPERM/EACCES。
    const probeScript = `
const net = require('node:net');
async function probe(host, port) {
  await new Promise((ok, bad) => {
    const socket = net.connect({ host, port });
    socket.on('connect', () => { socket.destroy(); bad(Error('unexpected connect')); });
    socket.on('error', error => ['EPERM', 'EACCES'].includes(error.code) ? ok() : bad(Error(error.code)));
    socket.setTimeout(120000, () => { socket.destroy(); bad(Error('timeout is not isolation proof')); });
  });
}
Promise.all([probe('192.0.2.1', 9), probe('127.0.0.1', 1)]).then(
  () => console.log('network denied at OS boundary'),
  error => { console.error(error.message); process.exit(1); }
);`;
    await cancellationPoint();
    const network = command('/usr/bin/sandbox-exec', ['-f', join(privateRoot, 'isolation.sb'), process.execPath, '-e', probeScript], { env, timeout: 240_000 });
    writeFileSync(join(runDir, 'network-sandbox.log'), `${network.stdout}${network.stderr}`, { mode: 0o600, flag: 'wx' });
    assert.equal(network.status, 0, '操作系统网络拒绝探针未通过');
    metadata.safety.network_sandbox = true;
    metadata.safety.evidence_refs.network_sandbox = rel(join(runDir, 'network-sandbox.log'));
    await cancellationPoint();
    const requireWorker = createRequire(join(ROOT, 'ai-worker/package.json'));
    const codexPackage = requireWorker.resolve('@openai/codex/package.json');
    const requireCodex = createRequire(codexPackage);
    const target = process.arch === 'arm64' ? 'aarch64-apple-darwin' : process.arch === 'x64' ? 'x86_64-apple-darwin' : null;
    assert(target, '不支持此Codex宿主架构');
    const binary = realpathSync(join(dirname(requireCodex.resolve(`@openai/codex-darwin-${process.arch}/package.json`)), 'vendor', target, 'bin/codex'));
    const login = command('/usr/bin/sandbox-exec', ['-f', join(privateRoot, 'isolation.sb'), binary, 'login', 'status'], { env });
    const loginOutput = `${login.stdout}${login.stderr}`;
    assert.match(loginOutput, /Not logged in/, '隔离Codex未明确返回Not logged in，停止');
    assert(login.status === 0 || login.status === 1, 'Codex登录探针异常退出');
    writeFileSync(join(runDir, 'codex-login-status.log'), loginOutput, { mode: 0o600, flag: 'wx' });
    metadata.safety.codex_not_logged_in = true;
    metadata.safety.evidence_refs.codex_not_logged_in = rel(join(runDir, 'codex-login-status.log'));
    outer = setTimeout(() => cancel('outer-deadline'), OUTER_MS);
    monitor = setInterval(() => { try { remember(); } catch (error) { caught ??= error; cancel('process-audit-failed'); } }, 250);
    await cancellationPoint();
    const server = launch('/usr/bin/env', ['pnpm', 'dev', '--hostname', '127.0.0.1', '--port', String(PORT)], join(runDir, 'next-dev.log'), env);
    const started = Date.now();
    let ready = false;
    while (Date.now() - started < START_MS) {
      assert(!interrupted && !caught, '运行被中止');
      assert(server.exitCode === null && server.signalCode === null, 'Next dev提前退出');
      try {
        const status = await new Promise((done, reject) => {
          const request = httpGet({ hostname: '127.0.0.1', port: PORT, path: '/api/v1/auth/me', agent: false, signal: AbortSignal.timeout(PROBE_MS) }, (response) => { response.resume(); done(response.statusCode); });
          request.once('error', reject);
        });
        if (status === 200) { ready = true; break; }
      } catch { /* 有界冷启动观察，不发业务写请求。 */ }
      await sleep(1000);
    }
    assert(ready, '真实Next dev启动超时，保留日志');
    assert(!interrupted, '运行被中止');
    const args = ['pnpm', 'exec', 'playwright', 'test', '--config=playwright.t1382.config.ts', '--workers=1', '--retries=0'];
    if (options.mode === 'red') args.push('--project=t1382-normal', '--grep=J03-manual-create');
    await cancellationPoint();
    const browser = launch('/usr/bin/env', args, join(runDir, 'playwright.log'), env);
    const result = await new Promise((done) => {
      const timer = setTimeout(() => { cancel('playwright-deadline'); done({ code: null, signal: 'timeout' }); }, PLAYWRIGHT_MS + 120_000);
      browser.once('error', (error) => { clearTimeout(timer); caught ??= error; done({ code: null, signal: 'spawn-error' }); });
      browser.once('close', (code, signal) => { clearTimeout(timer); done({ code, signal }); });
    });
    metadata.playwright_exit_code = result.code;
    metadata.playwright_signal = result.signal;
    metadata.exit_code = result.code ?? 1;
    assert(!interrupted && !caught, '运行中断或子进程异常');
  } catch (error) {
    caught ??= error;
    metadata.exit_code = 1;
    metadata.failure = error.message;
  } finally {
    stopping = true;
    clearInterval(monitor); clearTimeout(outer);
    const cleanupErrors = [];
    try { killOwned('SIGTERM'); } catch (error) { cleanupErrors.push(error.message); }
    const deadline = Date.now() + CLEANUP_MS;
    try { while (Date.now() < deadline && remember().some((row) => tracked.get(row.pid)?.born === row.born)) await sleep(500); }
    catch (error) { cleanupErrors.push(error.message); }
    try { killOwned('SIGKILL'); } catch (error) { cleanupErrors.push(error.message); }
    await sleep(1000);
    for (const fd of fds) { try { closeSync(fd); } catch (error) { cleanupErrors.push(error.message); } }
    try {
      const survivors = remember().filter((row) => tracked.get(row.pid)?.born === row.born);
      save(join(runDir, 'process-cleanup.json'), { stopped: survivors.length === 0, owned_pids: [...tracked.keys()], survivor_pids: survivors.map((row) => row.pid) });
      metadata.safety.process_groups_stopped = survivors.length === 0;
      metadata.safety.evidence_refs.process_groups_stopped = rel(join(runDir, 'process-cleanup.json'));
      assert.equal(survivors.length, 0, '自有进程未完全结束；保留副本，不删除被占用数据');
      assert.equal(cleanupErrors.length, 0, `清理观察不完整：${cleanupErrors.join('; ')}`);
      lsofEmpty(['+D', privateRoot], '私有运行目录');
      rmSync(privateRoot, { recursive: true, force: false });
      metadata.safety.private_database_removed = !existsSync(privateRoot);
      save(join(runDir, 'database-cleanup.json'), { private_root_removed: !existsSync(privateRoot), original_database_opened: false });
      metadata.safety.evidence_refs.private_database_removed = rel(join(runDir, 'database-cleanup.json'));
      sourceFree(source);
      if (before) {
        const after = sourceManifest(source);
        save(join(runDir, 'source-integrity.json'), { schema: 't1382-source-integrity/v1', unchanged: before.sha256 === after.sha256, before_sha256: before.sha256, after_sha256: after.sha256, files: before.files, bytes: before.bytes });
        metadata.source_manifest_ref = rel(join(runDir, 'source-integrity.json'));
        assert.equal(after.sha256, before.sha256, '真实库在本轮期间发生变化');
      }
      assert.equal(git(['rev-parse', 'HEAD']), head, '执行期间HEAD变化');
      assert.equal(contract().digest, current.digest, '执行期间合约变化');
      watchedClean(current.value.watched_paths);
    } catch (error) { caught ??= error; metadata.exit_code = 1; metadata.cleanup_error = error.message; }
    process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
    metadata.finished_at = new Date().toISOString();
    metadata.interrupted = interrupted ?? null;
    save(join(runDir, 'run.json'), metadata);
  }
  if (watchdog?.connected) {
    watchdog.send({ type: 'done' });
    await new Promise((done) => {
      const timer = setTimeout(() => { metadata.exit_code = 1; caught ??= Error('独立监督者未完成释放'); done(); }, CLEANUP_MS + PROBE_MS + 120_000);
      watchdog.once('exit', (code) => { clearTimeout(timer); if (code !== 0) { metadata.exit_code = 1; caught ??= Error('独立监督者释放失败'); } done(); });
    });
  }
  if (watchdogFd !== undefined) closeSync(watchdogFd);
  if (existsSync(join(runDir, 'watchdog.json'))) {
    const release = JSON.parse(readFileSync(join(runDir, 'watchdog.json'), 'utf8'));
    metadata.safety.supervisor_released = release.status === 'released' && release.private_root_removed === true;
    metadata.safety.evidence_refs.supervisor_released = rel(join(runDir, 'watchdog.json'));
    if (!metadata.safety.supervisor_released) metadata.exit_code = 1;
  }
  writeFileSync(join(runDir, 'run.json'), json(metadata), { mode: 0o600 });
  if (options.mode === 'green') {
    try {
      const { inspectRun } = await import('./generate-report.mjs');
      const inspection = inspectRun({ root: ROOT, runDir, redRef: options.redRef });
      save(join(runDir, 'runner-inspection.json'), { ...inspection.summary, errors: inspection.errors });
      if (inspection.status !== 'pass') metadata.exit_code = 1;
    } catch (error) { metadata.exit_code = 1; caught ??= error; }
  }

  // 此目录尚未封存；如证据检查失败，持久化真正的最终非零退出。
  writeFileSync(join(runDir, 'run.json'), json(metadata), { mode: 0o600 });
  console.log(json({ run_dir: rel(runDir), mode: options.mode, playwright_exit_code: metadata.playwright_exit_code ?? null, exit_code: metadata.exit_code, error: caught?.message ?? null }));
  // 红测必须保留真实非零退出；生成器另核对指定断言与注入回执，不把preflight失败当RED。
  process.exitCode = metadata.exit_code ?? 1;
}
function argumentsFor(argv) {
  const options = { mode: 'green', redRef: process.env.T1382_JOURNEY_RED_REF || null, invocationCommand: [COMMAND, ...argv].join(' ') };
  while (argv.length) {
    const flag = argv.shift();
    if (flag === '--red') options.mode = 'red';
    else throw new Error(`未知参数：${flag}`);
  }
  if (options.mode === 'green' && !options.redRef && existsSync(join(CONTROL, 'FRONTEND_REPORT.md'))) {
    const text = readFileSync(join(CONTROL, 'FRONTEND_REPORT.md'), 'utf8');
    const block = text.match(/```frontend-validation\s*\n([\s\S]*?)\n```/);
    if (block) options.redRef = JSON.parse(block[1]).tdd_red_ref;
  }
  return options;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) console.log(`${COMMAND} [--red]\n仅供外部运行；先提交监视文件、退出已装App。每次复制库到私有/tmp；不生成正式报告。`);
  else {
    let options;
    try { options = argumentsFor(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exit(1); }
    const lock = join(tmpdir(), `creatoros-t1382-runner-${sha(realpathSync(ROOT)).slice(0, 12)}.lock`);
    try {
      mkdirSync(lock, { mode: 0o700 });
      save(join(lock, 'owner.json'), { pid: process.pid, started_at: new Date().toISOString() });
      run(options).catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => rmSync(lock, { recursive: true, force: false }));
    } catch (error) { console.error(`无法取得本任务独占锁（不自动删旧锁）：${error.message}`); process.exitCode = 1; }
  }
}
