// 仅创建T1246临时本机PG；不连接/停止现有服务器，不读项目.env。
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const exec = promisify(execFile);
const entries = [];
const commandBudgetMs = 240000;
const env = { ...process.env };
for (const name of Object.keys(env)) if (/^PG/.test(name) || /DATABASE_URL/.test(name)) delete env[name];
async function command(id, file, args) {
  const startedAt = new Date().toISOString(), start = Date.now();
  try {
    const result = await exec(file, args, { env, timeout: commandBudgetMs, maxBuffer: 8 * 1024 * 1024 });
    const entry = { id, file, args, startedAt, elapsedMs: Date.now() - start, exitCode: 0, ...result };
    entries.push(entry); return result.stdout;
  } catch (error) {
    entries.push({ id, file, args, startedAt, elapsedMs: Date.now() - start, exitCode: typeof error.code === 'number' ? error.code : null, error: error.message, stdout: error.stdout || '', stderr: error.stderr || '' });
    throw error;
  }
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  if (port === 5432 || port === 55422) return freePort();
  return port;
}
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 't1246-unit-pg-'));
  const dataDir = path.join(root, 'data'), socketDir = path.join(root, 'socket');
  await fs.mkdir(socketDir);
  const port = await freePort();
  const database = `creatoros_test_t1246_${randomUUID().replaceAll('-', '')}`;
  const adminRole = 't1246_admin';
  const report = { task: 'T-1246', recordedAt: new Date().toISOString(), root, dataDir, socketDir, port, database, adminRole, host: '127.0.0.1', commandBudgetMs, pgCtlInnerBudgetSeconds: 120, status: 'preparing', entries, existing55422: '既有监听PID52177，未连接或停止；本轮不使用该端口', startupPid: null };
  try {
    await command('initdb', '/opt/homebrew/bin/initdb', ['-D', dataDir, '--auth-local=trust', '--auth-host=trust', '--username=' + adminRole, '--no-instructions']);
    await command('start', '/opt/homebrew/bin/pg_ctl', ['start', '-D', dataDir, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${socketDir}`, '-w', '-t', '120']);
    const pid = Number((await fs.readFile(path.join(dataDir, 'postmaster.pid'), 'utf8')).split('\n')[0]);
    report.startupPid = pid;
    await fs.writeFile(path.join(root, 't1246-owner.json'), JSON.stringify({ task: 'T-1246', root, dataDir, pid, port, database }) + '\n');
    const psqlArgs = ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', adminRole, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
    await command('create-test-db', '/opt/homebrew/bin/psql', [...psqlArgs, '-c', `CREATE DATABASE ${database};`]);
    await command('create-t1074-role', '/opt/homebrew/bin/psql', [...psqlArgs, '-c', 'CREATE ROLE creatoros_t1074 LOGIN SUPERUSER;']);
    report.serverProof = (await command('server-proof', '/opt/homebrew/bin/psql', [...psqlArgs, '-At', '-c', "SELECT json_build_object('port',current_setting('port'),'listen',current_setting('listen_addresses'),'data_directory',current_setting('data_directory'),'database',current_database(),'user',current_user); "])).trim();
    report.databaseProof = (await command('database-proof', '/opt/homebrew/bin/psql', [...psqlArgs, '-At', '-c', `SELECT json_build_object('name',datname,'owner',pg_get_userbyid(datdba)) FROM pg_database WHERE datname='${database}';`])).trim();
    report.environment = {
      TEST_DATABASE_URL: `postgresql://${adminRole}@127.0.0.1:${port}/${database}`,
      CREATOROS_T1074_ISOLATED_PG_URL: `postgresql://creatoros_t1074@127.0.0.1:${port}/postgres`,
    };
    report.guardLimit = 'CREATOROS_TEST_POSTGRES_URL/CREATOROS_ISOLATED_PG_URL多个原消费者强制55422，暂不填入不符合guard的新端口；migration-convergence另硬编码55422，完整backend启动准入待主线程处理归属。';
    report.status = 'ready_with_original_port_guard_gap';
  } catch (error) { report.status = 'setup_failed'; report.failure = error.message; process.exitCode = 1; }
  await fs.writeFile(path.join(__dirname, 'pg-environment.json'), JSON.stringify(report, null, 2) + '\n');
  await fs.writeFile(path.join(__dirname, 'pg-environment.log'), entries.map(entry => JSON.stringify({ id: entry.id, exitCode: entry.exitCode, startedAt: entry.startedAt, elapsedMs: entry.elapsedMs }) + '\n' + entry.stdout + entry.stderr).join('\n') + '\n');
  console.log(JSON.stringify({ status: report.status, root, dataDir, port, database, startupPid: report.startupPid }));
})().catch(error => { console.error(error); process.exitCode = 1; });
