import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scope = JSON.parse(fs.readFileSync(path.join(root, 'docs/verification/t1062/backend-adaptation-scope.json'), 'utf8'));
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'creatoros-t1062-backend-verify-'));
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.startsWith('CREATOROS_') || /(?:TOKEN|PASSWORD|SECRET|API_KEY|CREDENTIAL)/i.test(key)) delete env[key];
}
for (const key of ['DATABASE_URL', 'PGLITE_DATA_DIR', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']) delete env[key];
Object.assign(env, {
  NODE_ENV: 'test', CREATOROS_STORAGE: 'mock',
  CREATOROS_DB_DIR: path.join(isolated, 'db'),
  CREATOROS_MEDIA_ROOT: path.join(isolated, 'media'),
  CREATOROS_WORKSPACES_ROOT: path.join(isolated, 'workspaces'),
  CREATOROS_WHISPER_CACHE_DIR: path.join(isolated, 'models'),
  CREATOROS_DOUYIN_AUTH_DIR: path.join(isolated, 'auth/douyin'),
  CREATOROS_WEB_AUTH_DIR: path.join(isolated, 'auth/web'),
  CREATOROS_MASTER_KEY: crypto.randomBytes(32).toString('base64'),
  CREATOROS_DISABLE_BACKGROUND_DRIVERS: '1', CREATOROS_DISABLE_SCHEDULER: '1',
  CREATOROS_TEST_POSTGRES_URL: 'postgresql://zyongzhu@127.0.0.1:55422/postgres',
  CREATOROS_ISOLATED_PG_URL: 'postgresql://zyongzhu@127.0.0.1:55422/postgres',
});
for (const key of ['CREATOROS_DB_DIR', 'CREATOROS_MEDIA_ROOT', 'CREATOROS_WORKSPACES_ROOT', 'CREATOROS_WHISPER_CACHE_DIR', 'CREATOROS_DOUYIN_AUTH_DIR', 'CREATOROS_WEB_AUTH_DIR']) fs.mkdirSync(env[key], { recursive: true });
const commands = scope.executable_verify_combinations.map(item => ({ label: item.label, argv: [...item.argv] }));
const rough = commands.find(item => item.label.startsWith('rough-cut-v3'));
if (!rough) throw new Error('Missing declared rough-cut verification');
rough.argv.splice(rough.argv.length - 1, 0, 'src/modules/production/production-pause-gaps.test.ts');
const report = {
  task: 'T-1062', actualRoot: root,
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  isolated, startedAt: new Date().toISOString(), status: 'running', commands: [],
  limits: ['只运行声明的类型/测试/格式命令，不是安装版验收。', '媒体环境变量不覆盖用户自定义存储；local fixture必须自行使用临时storage，不得读写现用媒体。', '真实PG只在127.0.0.1:55422创建/清理随机测试数据库，不能用skip冒充锁并发通过。'],
};
const reportPath = path.join(isolated, 'verification-result.json');
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
save();
console.log(`T-1062 verification evidence: ${reportPath}`);
for (let index = 0; index < commands.length; index++) {
  const item = commands[index];
  if (!['pnpm', 'git'].includes(item.argv[0]) || item.argv.some(arg => /[\0\r\n]/.test(arg))) throw new Error('Unexpected declared command');
  console.log(`[${index + 1}/${commands.length}] ${item.label}`);
  const start = Date.now();
  const result = spawnSync(item.argv[0], item.argv.slice(1), { cwd: root, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 20 * 60 * 1000 });
  const logPath = path.join(isolated, `${String(index + 1).padStart(2, '0')}.log`);
  fs.writeFileSync(logPath, (result.stdout || '') + (result.stderr || ''));
  report.commands.push({ ...item, cwd: root, exit: result.status, signal: result.signal, error: result.error?.message ?? null, durationMs: Date.now() - start, logPath, logSha256: crypto.createHash('sha256').update(fs.readFileSync(logPath)).digest('hex') });
  save();
  console.log(`exit=${result.status} log=${logPath}`);
  if (result.status !== 0) { report.status = 'failed'; report.finishedAt = new Date().toISOString(); save(); process.exit(1); }
}
report.status = 'passed'; report.finishedAt = new Date().toISOString(); save();
