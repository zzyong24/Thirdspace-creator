// T1246冻结候选首轮；每次单包，全发现范围、原断言不变，输出真实日志与exit。
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const root = process.argv[2] === 'frontend' ? '/Users/zyongzhu/.codex/worktrees/integrated-frontend-unit/Thirdspace-creator' : '/Users/zyongzhu/.codex/worktrees/integrated-unit-acceptance/Thirdspace-creator';
const evidenceRoot = '/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator';
const frozenCommit = '533224f334c43cdb81a344424e420cad93784dd1';
const pkg = process.argv[2];
if (!['contract', 'ai-worker', 'backend', 'frontend'].includes(pkg)) throw new Error('指定单包');
const actualCommit = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: root, timeout: 120000, encoding: 'utf8' }).trim();
if (actualCommit !== frozenCommit) throw new Error('冻结commit已变，不能混入首轮');
const guard = '/tmp/t1246-unit/deny-legacy-postgres.cjs';
const review = '/tmp/t1246-unit/ENV_GUARD_REVIEW_RESULT.md';
if (!fs.existsSync(review) || !/可接受用于首轮环境拒绝/.test(fs.readFileSync(review, 'utf8'))) throw new Error('独立ENV护栏评审尚未可接受');
const guardSha = crypto.createHash('sha256').update(fs.readFileSync(guard)).digest('hex');
if (!fs.readFileSync(review, 'utf8').includes(guardSha)) throw new Error('护栏与独评SHA不一致');
const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/verification/t1246/source-inventory-before.json'), 'utf8'));
const sourceFiles = [...sourceManifest.other_changes, ...sourceManifest.same_as_codex];
if (sourceFiles.length !== 253 || sourceFiles.some(file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file.path))).digest('hex') !== file.sha256)) throw new Error('冻结253源码SHA发生变化');
const out = path.join(evidenceRoot, 'docs/verification/t1246/unit-first');
fs.mkdirSync(out, { recursive: true });
const log = path.join(out, pkg + '-typecheck.log'), resultJson = path.join(out, pkg + '-typecheck-no-json'), exitJson = path.join(out, pkg + '-typecheck-exit.json');
if ([log, resultJson, exitJson].some(file => fs.existsSync(file))) throw new Error('首轮回执已存在，禁止覆盖或重跑');
const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), `t1246-unit-${pkg}-`));
const env = { ...process.env };
for (const name of Object.keys(env)) {
  if (/^(CREATOROS_|PG|S3_|AWS_|OPENAI_|ANTHROPIC_|AZURE_OPENAI_|GOOGLE_API_)/.test(name) || ['DATABASE_URL', 'TEST_DATABASE_URL', 'PGLITE_DATA_DIR', 'NODE_PG_FORCE_NATIVE', 'NODE_OPTIONS'].includes(name)) delete env[name];
}
const runtimeDirs = { app: path.join(runRoot, 'app'), db: path.join(runRoot, 'db'), media: path.join(runRoot, 'media'), browser: path.join(runRoot, 'browser'), workbench: path.join(runRoot, 'workbench'), auth: path.join(runRoot, 'auth'), backups: path.join(runRoot, 'backups') };
Object.values(runtimeDirs).forEach(dir => fs.mkdirSync(dir, { recursive: true }));
Object.assign(env, {
  NODE_ENV: 'test', CI: '1', NODE_OPTIONS: `--require ${guard}`,
  CREATOROS_APP_DATA_DIR: runtimeDirs.app, CREATOROS_DB_DIR: runtimeDirs.db,
  CREATOROS_MEDIA_ROOT: runtimeDirs.media, CREATOROS_BROWSER_POOL_DIR: runtimeDirs.browser,
  CREATOROS_WORKBENCH_ROOT: runtimeDirs.workbench,
  CREATOROS_DOUYIN_AUTH_DIR: path.join(runtimeDirs.auth, 'douyin'), CREATOROS_WEB_AUTH_DIR: path.join(runtimeDirs.auth, 'web'),
  CREATOROS_DATABASE_BACKUP_DIR: runtimeDirs.backups,
});
const pg = JSON.parse(fs.readFileSync(path.join(out, 'pg-environment.json'), 'utf8'));
if (pg.status !== 'ready_with_original_port_guard_gap' || pg.port === 55422 || pg.host !== '127.0.0.1') throw new Error('独立PG环境未核实');
Object.assign(env, pg.environment, {
  // 提供真实合法本轮环境，让旧硬端口guard如实拒绝，而不是借缺env隐藏失败。
  CREATOROS_TEST_POSTGRES_URL: `postgresql://${pg.adminRole}@127.0.0.1:${pg.port}/postgres`,
  CREATOROS_ISOLATED_PG_URL: `postgresql://${pg.adminRole}@127.0.0.1:${pg.port}/postgres`,
});
const cli = fs.realpathSync('/opt/homebrew/bin/pnpm');
const args = [cli, '--dir', path.join(root,pkg), 'run', 'typecheck'];
const nativeBinding = JSON.parse(execFileSync(process.execPath, ['-e', 'const net=require("node:net");const guard=require("/tmp/t1246-unit/deny-legacy-postgres.cjs");const result={nodePgForceNativeDefined:typeof process.env.NODE_PG_FORCE_NATIVE!=="undefined",preloaded:net.Socket.prototype.connect.name==="t1246GuardedConnect",errorCode:guard.errorCode};if(result.nodePgForceNativeDefined||!result.preloaded)throw Error("T1246_ENV_GUARD_NOT_BOUND");console.log(JSON.stringify(result));'], { cwd: path.join(root, pkg), env, timeout: 120000, encoding: 'utf8' }).trim());
const record = { task: 'T-1246', package: pkg, frozenCommit, actualCommit, source253ShaVerified: true, startedAt: new Date().toISOString(), status: 'running', command: [process.execPath, ...args], cwd: path.join(root, pkg), log, resultJson, runRoot, runtimeDirs, guard, guardSha256: guardSha, networkGuardReview: review, nodePgForceNative: 'explicitly_deleted', nativeBinding, dependencyVitest: JSON.parse(fs.readFileSync(path.join(root,pkg,'node_modules/vitest/package.json'),'utf8')).version, pnpmLockSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'pnpm-lock.yaml'))).digest('hex'), pgPort: pg.port, testTimeoutMs: 180000, hookTimeoutMs: 180000, retry: 0, maxWorkers: 2, fileParallelism: false, phase: 'typecheck-first', frontendTypegenOnlyUnitTree: true, originalAssertions: true, officialModelE2E: false, nativeAppAcceptance: false };
fs.writeFileSync(exitJson, JSON.stringify(record, null, 2) + '\n');
const fd = fs.openSync(log, 'wx');
const child = spawn(process.execPath, args, { cwd: path.join(root, pkg), env, stdio: ['ignore', fd, fd] });
record.pid = child.pid;
fs.writeFileSync(exitJson, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ package: pkg, pid: child.pid, log, frozenCommit, status: 'running' }));
child.on('error', error => { record.spawnError = error.message; });
child.on('close', (code, signal) => {
  fs.closeSync(fd);
  Object.assign(record, { endedAt: new Date().toISOString(), elapsedMs: Date.now() - Date.parse(record.startedAt), exitCode: code, signal, status: code === 0 ? 'completed_exit0' : 'completed_nonzero' });
  fs.writeFileSync(exitJson, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({ package: pkg, exitCode: code, signal, log, resultJson }));
  process.exitCode = code === 0 ? 0 : 1;
});
