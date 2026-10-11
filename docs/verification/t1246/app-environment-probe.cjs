// T-1246：只读环境核查，不启动被测 App，不修改系统自动化权限。
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const outputDir = __dirname;
const phase = process.argv[2] || 'current';
if (!/^[a-z0-9-]+$/.test(phase)) throw new Error('无效阶段名');
const taskTools = '/tmp/t1246-appium';
const commandBudgetMs = 120000;
const outerBudgetMs = 1800000;
const outer = setTimeout(() => { console.error('环境探针外层期限耗尽'); process.exitCode = 1; }, outerBudgetMs);
const commands = [
  ['macos', '/usr/bin/sw_vers', []],
  ['xcode-path', '/usr/bin/xcode-select', ['-p']],
  ['xcode-version', '/usr/bin/xcodebuild', ['-version']],
  ['automation-tool', '/usr/bin/xcrun', ['--find', 'automationmodetool']],
  ['automation-status', '/usr/bin/automationmodetool', []],
  ['node-version', process.execPath, ['--version']],
  ['npm-version', '/opt/homebrew/bin/npm', ['--version']],
  ['ffmpeg-version', '/opt/homebrew/bin/ffmpeg', ['-version']],
  ['source-commit', '/usr/bin/git', ['rev-parse', 'HEAD']],
];
if (phase.startsWith('installed')) {
  commands.push(
    ['appium-version', path.join(taskTools, 'node_modules/.bin/appium'), ['--version']],
    ['installed-drivers', path.join(taskTools, 'node_modules/.bin/appium'), ['driver', 'list', '--installed']],
    ['mac2-doctor', path.join(taskTools, 'node_modules/.bin/appium'), ['driver', 'doctor', 'mac2']],
  );
}
(async () => {
  const entries = [];
  for (const [id, file, args] of commands) {
    const startedAt = new Date().toISOString();
    const start = Date.now();
    try {
      const result = await exec(file, args, { cwd: id.startsWith('appium-') || id === 'installed-drivers' || id === 'mac2-doctor' ? taskTools : path.resolve(__dirname, '../../..'), env: { ...process.env, APPIUM_HOME: path.join(taskTools, 'home') }, timeout: commandBudgetMs, maxBuffer: 4 * 1024 * 1024 });
      entries.push({ id, file, args, startedAt, elapsedMs: Date.now() - start, exitCode: 0, ...result });
    } catch (error) {
      entries.push({ id, file, args, startedAt, elapsedMs: Date.now() - start, exitCode: typeof error.code === 'number' ? error.code : null, error: error.message, stdout: error.stdout || '', stderr: error.stderr || '' });
    }
  }
  const packages = {};
  for (const name of ['appium', 'appium-mac2-driver']) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(taskTools, 'node_modules', name, 'package.json'), 'utf8'));
      packages[name] = { version: pkg.version, engines: pkg.engines, peerDependencies: pkg.peerDependencies || null };
    } catch (error) { packages[name] = { installed: false, errorCode: error.code || null }; }
  }
  const report = {
    task: 'T-1246', phase, recordedAt: new Date().toISOString(), commandBudgetMs, outerBudgetMs,
    taskTools, packages, entries,
    nativeAcceptance: 'pending', nativeSessionCreated: false, applicationStarted: false,
    prerequisites: { userAuthentication: '等待系统正常认证；未调用免认证开关', frozenApp: '等待主线程提供冻结包路径', isolatedApplicationData: '待证明 shell app_data_dir、激活及用户资料均不读写真实用户数据' },
    scope: '环境命令与版本；不证明 App 可用、驱动会话成功、所有功能或官方模型整链通过',
  };
  await fs.writeFile(path.join(outputDir, `app-environment-${phase}.json`), JSON.stringify(report, null, 2) + '\n');
  await fs.writeFile(path.join(outputDir, 'app-environment.json'), JSON.stringify(report, null, 2) + '\n');
  await fs.writeFile(path.join(outputDir, `app-environment-${phase}.txt`), entries.map(e => `[${e.id}] ${e.file} ${e.args.join(' ')}\nstarted=${e.startedAt} elapsedMs=${e.elapsedMs} exit=${e.exitCode}\n${e.stdout}${e.stderr}${e.error ? '\n' + e.error : ''}`).join('\n\n') + '\n');
  console.log(JSON.stringify({ phase, entries: entries.length, packages, nativeAcceptance: 'pending' }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(outer));
