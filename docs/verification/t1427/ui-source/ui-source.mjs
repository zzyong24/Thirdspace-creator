// T-1427 源码 UI 隔离准备；只启动正常 Next dev、公开建空工程，不控制浏览器。
import {spawn, execFileSync} from 'node:child_process';
import {createServer, createConnection} from 'node:net';
import {randomBytes, randomUUID} from 'node:crypto';
import {mkdir, mkdtemp, lstat, realpath, readdir, readFile, writeFile, open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const EXPECTED = '778ea4559850b0d8dfbf279c312dc4c21d72866e';
const evidenceScope = await realpath(dirname(fileURLToPath(import.meta.url)));
const mainRoot = await realpath(resolve(evidenceScope, '../../../..'));
const [command, ...argv] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i += 2) {
  if (!['--source-root', '--evidence-root', '--expected-ref'].includes(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('--') || flags[argv[i]]) throw Error('ARGUMENTS_INVALID');
  flags[argv[i]] = argv[i + 1];
}
if (!['start', 'seed', 'stop'].includes(command) || !flags['--source-root'] || !flags['--evidence-root']) throw Error('USE_start_seed_stop_WITH_source-root_AND_evidence-root');
if (process.versions.node.split('.')[0] !== '25') throw Error('NODE_25_REQUIRED');
const expectedRef = flags['--expected-ref'] ?? EXPECTED;
if (!/^[a-f0-9]{40}$/.test(expectedRef)) throw Error('EXPECTED_REF_MUST_BE_FULL_SHA');
const sourceRoot = await realpath(resolve(flags['--source-root']));
const sourceStat = await lstat(resolve(flags['--source-root']));
if (sourceStat.isSymbolicLink() || !sourceStat.isDirectory() || sourceStat.uid !== process.getuid() || sourceRoot === mainRoot) throw Error('SEPARATE_OWNED_SOURCE_REQUIRED');
const frontend = join(sourceRoot, 'frontend');
const git = (...args) => execFileSync('git', ['-C', sourceRoot, ...args], {encoding: 'utf8'}).trim();
if (git('rev-parse', 'HEAD') !== expectedRef) throw Error('SOURCE_HEAD_MISMATCH');
if (git('status', '--porcelain', '--untracked-files=all')) throw Error('SOURCE_MUST_BE_CLEAN');
for (const dir of [sourceRoot, frontend]) {
  if ((await readdir(dir)).some(name => /^\.env(?:\.|$)/.test(name) && name !== '.env.example')) throw Error('ENV_FILE_PRESENT_NO_READ_OR_COPY');
}
const evidenceRoot = resolve(flags['--evidence-root']);
const parent = await realpath(dirname(evidenceRoot));
if (!parent.startsWith(evidenceScope + sep)) throw Error('EVIDENCE_PARENT_MUST_BE_INSIDE_UI_SOURCE_SCOPE');
const runtimeFile = join(evidenceRoot, 'runtime.json');
const json = (file, value, fresh = false) => writeFile(file, JSON.stringify(value, null, 2) + '\n', {mode: 0o600, ...(fresh ? {flag: 'wx'} : {})});
const exists = async path => {try {await lstat(path); return true;} catch (error) {if (error.code === 'ENOENT') return false; throw error;}};
async function privateFile(file) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw Error('PRIVATE_FILE_IDENTITY_MISMATCH');
}
function processIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 1) throw Error('PID_INVALID');
  const row = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'uid=,pgid=,lstart='], {encoding: 'utf8'}).trim();
  const fields = row.match(/^(\d+)\s+(\d+)\s+(.+)$/);
  if (!fields || Number(fields[1]) !== process.getuid() || Number(fields[2]) !== pid) throw Error('OWNED_PROCESS_GROUP_MISMATCH');
  const cwd = execFileSync('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {encoding: 'utf8'}).split('\n').find(line => line.startsWith('n'))?.slice(1);
  if (cwd !== frontend) throw Error('PROCESS_CWD_MISMATCH');
  return {uid: Number(fields[1]), pgid: Number(fields[2]), started: fields[3], cwd};
}
function ownedListener(runtime) {
  const values = [...new Set(execFileSync('/usr/sbin/lsof', ['-nP', '-iTCP:' + runtime.port, '-sTCP:LISTEN', '-t'], {encoding: 'utf8'}).trim().split(/\s+/).filter(Boolean))];
  if (!values.length) throw Error('OWNED_LISTENER_MISSING');
  for (const pid of values) {
    const row = execFileSync('/bin/ps', ['-p', pid, '-o', 'uid=,pgid='], {encoding: 'utf8'}).trim().split(/\s+/);
    if (Number(row[0]) !== process.getuid() || Number(row[1]) !== runtime.pid) throw Error('PORT_LISTENER_OUTSIDE_OWNED_PROCESS_GROUP');
  }
  return values.map(Number);
}
async function loadRuntime() {
  const dir = await lstat(evidenceRoot);
  if (!dir.isDirectory() || dir.isSymbolicLink() || dir.uid !== process.getuid() || (dir.mode & 0o077)) throw Error('PRIVATE_EVIDENCE_DIRECTORY_REQUIRED');
  await privateFile(runtimeFile);
  const runtime = JSON.parse(await readFile(runtimeFile, 'utf8'));
  if (runtime.schema !== 't1427-source-ui-runtime/v1' || runtime.sourceRoot !== sourceRoot || runtime.sourceCommit !== expectedRef || runtime.evidenceRoot !== evidenceRoot) throw Error('RUNTIME_BINDING_MISMATCH');
  const current = processIdentity(runtime.pid);
  if (JSON.stringify(current) !== JSON.stringify(runtime.processIdentity)) throw Error('PROCESS_IDENTITY_CHANGED');
  ownedListener(runtime);
  const root = await realpath(runtime.dataRoot), stat = await lstat(root);
  if (root !== runtime.dataRoot || !root.startsWith(await realpath(tmpdir()) + sep + 'creatoros-t1427-ui-') || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw Error('DATA_ROOT_IDENTITY_MISMATCH');
  await privateFile(join(root, 'owner.json'));
  const owner = JSON.parse(await readFile(join(root, 'owner.json'), 'utf8'));
  if (owner.nonce !== runtime.nonce || owner.sourceRoot !== sourceRoot || owner.evidenceRoot !== evidenceRoot) throw Error('DATA_OWNER_MISMATCH');
  const origin = new URL(runtime.origin);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.port !== String(runtime.port) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error('ORIGIN_MISMATCH');
  return runtime;
}
async function auth(runtime, milliseconds = 120000) {
  const response = await fetch(runtime.origin + '/api/v1/auth/me', {redirect: 'error', signal: AbortSignal.timeout(milliseconds)});
  if (!response.ok) throw Error('PRIVATE_AUTH_HTTP_' + response.status);
  const value = await response.json();
  if (!value?.data?.id || typeof value.data.id !== 'string') throw Error('PRIVATE_LOCAL_USER_MISSING');
  return {userId: value.data.id, httpStatus: response.status};
}

if (command === 'start') {
  if (await exists(evidenceRoot) || await exists(join(frontend, '.next'))) throw Error('FRESH_EVIDENCE_AND_NEXT_ROOT_REQUIRED');
  if (!await exists(join(frontend, 'node_modules/next/dist/bin/next'))) throw Error('FROZEN_DEPENDENCIES_REQUIRED');
  await mkdir(evidenceRoot, {mode: 0o700});
  const dataRoot = await realpath(await mkdtemp(join(await realpath(tmpdir()), 'creatoros-t1427-ui-')));
  for (const name of ['db', 'media', 'workspaces', 'auth-douyin', 'auth-web', 'database-backups', 'logs', 'tmp']) await mkdir(join(dataRoot, name), {mode: 0o700});
  const nonce = randomUUID();
  await json(join(dataRoot, 'owner.json'), {nonce, sourceRoot, evidenceRoot, createdAt: new Date().toISOString()}, true);
  const port = await new Promise((yes, no) => {const server = createServer(); server.once('error', no); server.listen(0, '127.0.0.1', () => {const value = server.address().port; server.close(error => error ? no(error) : yes(value));});});
  const env = {
    PATH: dirname(process.execPath) + ':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'zh_CN.UTF-8', NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
    DATABASE_URL: '', PGLITE_DATA_DIR: join(dataRoot, 'db'), CREATOROS_STORAGE: 'local', CREATOROS_MEDIA_ROOT: join(dataRoot, 'media'),
    CREATOROS_WORKSPACES_ROOT: join(dataRoot, 'workspaces'), CREATOROS_DOUYIN_AUTH_DIR: join(dataRoot, 'auth-douyin'), CREATOROS_WEB_AUTH_DIR: join(dataRoot, 'auth-web'),
    CREATOROS_DATABASE_BACKUP_DIR: join(dataRoot, 'database-backups'), CREATOROS_DISABLE_BACKGROUND_DRIVERS: '1', CREATOROS_DISABLE_SCHEDULER: '1',
    CREATOROS_CLIENT_CONFIG_PULL_ENABLED: '0', CREATOROS_OFFLINE: '1', CREATOROS_DESKTOP: '0', CREATOROS_DEV_MODE: '1',
    CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH: join(dataRoot, 'missing-seed'),
    CREATOROS_MASTER_KEY: randomBytes(32).toString('base64'), CREATOROS_MASTER_KEY_FILE: '', CREATOROS_MASTER_KEY_FD: '',
    TMPDIR: join(dataRoot, 'tmp'), TEMP: join(dataRoot, 'tmp'), TMP: join(dataRoot, 'tmp'),
  };
  const log = await open(join(evidenceRoot, 'next-dev.log'), 'wx', 0o600);
  const child = spawn(process.execPath, [join(frontend, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {cwd: frontend, env, stdio: ['ignore', log.fd, log.fd], detached: true});
  let spawnError;
  child.once('error', error => {spawnError = error;});
  // 密钥只在子进程环境；不保存环境副本或真实凭据。
  delete env.CREATOROS_MASTER_KEY;
  const runtime = {schema: 't1427-source-ui-runtime/v1', status: 'STARTING', sourceRoot, sourceCommit: expectedRef, evidenceRoot, dataRoot, nonce, pid: child.pid, port, origin: 'http://127.0.0.1:' + port, startedAt: new Date().toISOString(), processIdentity: null, localIdentity: null,
    safety: {freshPrivateData: true, ordinaryDevMode: true, desktopHandshakeInjected: false, userCredentialsRead: false, inheritedEnvironment: false, osNetworkSandboxClaimed: false, browserStarted: false}};
  await json(runtimeFile, runtime, true);
  const deadline = Date.now() + 600000;
  try {
    let listening = false;
    while (Date.now() < deadline) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null) throw Error('OWNED_NEXT_EXITED_BEFORE_READY');
      listening = await new Promise(yes => {const socket = createConnection({host: '127.0.0.1', port}); const done = value => {socket.destroy(); yes(value);}; socket.once('connect', () => done(true)); socket.once('error', () => done(false)); socket.setTimeout(1000, () => done(false));});
      if (listening) break;
      await delay(500);
    }
    if (!listening || deadline - Date.now() < 120000) throw Error('PRIVATE_NEXT_READINESS_BUDGET_EXHAUSTED');
    runtime.processIdentity = processIdentity(child.pid);
    runtime.listenerPids = ownedListener(runtime);
    // 单次真实auth完整响应；不重试HTTP，不续启动deadline。
    runtime.localIdentity = await auth(runtime, deadline - Date.now());
    runtime.status = 'READY'; runtime.readyAt = new Date().toISOString();
    if (git('status', '--porcelain', '--untracked-files=all')) throw Error('SOURCE_DRIFT_AFTER_DEV_START');
    await json(runtimeFile, runtime);
    child.unref(); await log.close();
    console.log(JSON.stringify({status: runtime.status, pid: runtime.pid, origin: runtime.origin, runtimeFile, sourceCommit: expectedRef, userId: runtime.localIdentity.userId}));
  } catch (error) {
    runtime.status = 'FAILED'; runtime.error = error.code ?? error.message; runtime.finishedAt = new Date().toISOString();
    if (child.pid && child.exitCode === null && child.signalCode === null) {try {process.kill(-child.pid, 'SIGTERM');} catch {}}
    await json(runtimeFile, runtime); await log.close(); throw error;
  }
} else if (command === 'seed') {
  // auth加7个串行公开请求各120秒，另留60秒写证据/检查余量；绝对期限不续期。
  const seedDeadline = Date.now() + 1020000;
  const runtime = await loadRuntime();
  if (runtime.status !== 'READY') throw Error('RUNTIME_NOT_READY');
  const authNow = await auth(runtime);
  if (authNow.userId !== runtime.localIdentity.userId) throw Error('PRIVATE_LOCAL_OWNER_CHANGED');
  const file = join(evidenceRoot, 'entities.json');
  const seed = {schema: 't1427-source-ui-entities/v1', status: 'IN_PROGRESS', startedAt: new Date().toISOString(), sourceCommit: expectedRef, origin: runtime.origin, runtimeNonce: runtime.nonce, userId: authNow.userId, runId: randomUUID(), groupKey: randomUUID(), outputKey: randomUUID(), calls: []};
  // 首次运行意向原子落盘，未知结果禁止再次执行本seed制造替代对象。
  await json(file, seed, true);
  async function rpc(id, input, groupId) {
    if (seedDeadline - Date.now() < 120000) throw Error('SEED_ABSOLUTE_BUDGET_EXHAUSTED');
    const at = performance.now(); const call = {id, status: 'STARTED'}; seed.calls.push(call); await json(file, seed);
    const response = await fetch(runtime.origin + '/api/v1/dispatch', {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000), headers: {'content-type': 'application/json', ...(groupId ? {'x-group-id': groupId} : {})}, body: JSON.stringify({id, input})});
    call.httpStatus = response.status; call.elapsedMs = performance.now() - at;
    const value = await response.json();
    if (!response.ok || value.error) {call.status = 'FAILED'; call.errorCode = value.error?.code ?? 'HTTP_ERROR'; await json(file, seed); throw Error('PUBLIC_SEED_' + id + '_HTTP_' + response.status);}
    call.status = 'COMPLETED'; await json(file, seed); return value.data;
  }
  try {
    seed.group = await rpc('accountGroups.create', {body: {name: '编辑器只读复验-' + seed.runId.slice(0, 8), idempotencyKey: seed.groupKey}});
    if (!seed.group?.id || seed.group.members?.length !== 0) throw Error('NEW_EMPTY_GROUP_REQUIRED'); await json(file, seed);
    seed.project = await rpc('projects.create', {body: {title: '空编辑器复验', brief: '', contentType: 'video'}}, seed.group.id); await json(file, seed);
    seed.output = await rpc('projects.outputs.create', {params: {projectId: seed.project.id}, body: {title: '空原片', contentType: 'video', clientRequestId: seed.outputKey}}, seed.group.id); await json(file, seed);
    await rpc('settings.preferences.patch', {body: {autosaveEnabled: false}}, seed.group.id);
    const group = await rpc('accountGroups.get', {params: {groupId: seed.group.id}}, seed.group.id);
    const project = await rpc('projects.get', {params: {projectId: seed.project.id}}, seed.group.id);
    const output = await rpc('outputs.get', {params: {outputId: seed.output.id}}, seed.group.id);
    if (group.id !== seed.group.id || group.members?.length !== 0 || project.id !== seed.project.id || output.id !== seed.output.id || output.projectId !== project.id || output.contentType !== 'video') throw Error('PUBLIC_SEED_READBACK_MISMATCH');
    seed.editorPath = '/projects/' + encodeURIComponent(project.id) + '/production?outputId=' + encodeURIComponent(output.id);
    seed.viewports = [{width: 1440, height: 900}, {width: 1024, height: 680}];
    seed.originalEditorThresholdMs = 10000; seed.uiExecuted = false; seed.status = 'READY_FOR_CUA'; seed.finishedAt = new Date().toISOString();
    await json(file, seed);
    console.log(JSON.stringify({status: seed.status, origin: seed.origin, groupId: group.id, groupName: group.name, projectId: project.id, outputId: output.id, editorPath: seed.editorPath, entitiesFile: file, browserStarted: false}));
  } catch (error) {seed.status = 'FAILED_NO_AUTOMATIC_REPLAY'; seed.error = error.code ?? error.message; seed.finishedAt = new Date().toISOString(); await json(file, seed); throw error;}
} else {
  const runtime = await loadRuntime();
  process.kill(-runtime.pid, 'SIGTERM');
  const deadline = Date.now() + 120000;
  let alive = true;
  while (Date.now() < deadline) {try {process.kill(runtime.pid, 0);} catch (error) {if (error.code === 'ESRCH') {alive = false; break;} throw error;} await delay(250);}
  if (alive) throw Error('OWNED_NEXT_STOP_UNCONFIRMED_RESOURCES_PRESERVED');
  runtime.status = 'STOPPED'; runtime.stoppedAt = new Date().toISOString(); runtime.privateDataRetained = true;
  await json(runtimeFile, runtime); console.log(JSON.stringify({status: runtime.status, pid: runtime.pid, privateDataRetained: true}));
}
