// 原始PEM仅存在于本入口；构建链只接收受控临时路径。
import { mkdtempSync, writeFileSync, rmSync, realpathSync, readdirSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { userInfo } from 'node:os';
import { spawnSync } from 'node:child_process';
import { assertSidecarSigningKey } from './sign-sidecar.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const secretName = 'CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PEM';
const pathName = 'CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH';
function prefix(env) {
  const id = `${env.GITHUB_RUN_ID ?? 'local'}-${env.GITHUB_RUN_ATTEMPT ?? '1'}`;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw Error('非法CI运行标识');
  return `creatoros-signing-${id}-`;
}
function tempRoot(env, workspace) {
  if (!env.RUNNER_TEMP) throw Error('缺少RUNNER_TEMP');
  const root = realpathSync(env.RUNNER_TEMP);
  const rel = relative(resolve(workspace), root);
  if (!rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')))) throw Error('签名临时目录不得位于工作区');
  return root;
}
export function runCIRelease({ env = process.env, workspace = env.GITHUB_WORKSPACE ?? repo,
  validate = path => assertSidecarSigningKey({ privateKeyPath: path }),
  launch = childEnv => {
    const result = spawnSync(process.execPath, [join(here, 'release.mjs')], { cwd: resolve(here, '../..'), env: childEnv, stdio: 'inherit' });
    if (result.error) throw Error('无法启动正式打包入口');
    return result.status ?? 1;
  } } = {}) {
  let pem = env[secretName];
  delete env[secretName];
  delete env[pathName];
  if (env.CREATOROS_SIGNED_SIDECAR_CAPSULE_PATH) return launch({ ...env });
  if (!pem?.trim()) throw Error('缺少CI签名Secret');
  const root = tempRoot(env, workspace);
  const dir = mkdtempSync(join(root, prefix(env)));
  try {
    if (process.platform === 'win32') {
      const result = spawnSync('icacls.exe', [dir, '/inheritance:r', '/grant:r', `${userInfo().username}:(OI)(CI)F`], { env: { ...env }, stdio: 'pipe' });
      if (result.status !== 0) throw Error('无法限制签名临时目录ACL');
    }
    const path = join(dir, 'root.pem');
    writeFileSync(path, pem, { mode: 0o600, flag: 'wx' });
    pem = undefined;
    validate(path);
    console.log('[release-ci] 既有信任根预检通过，原始密钥环境已剥离');
    return launch({ ...env, [pathName]: path });
  } finally { pem = undefined; rmSync(dir, { recursive: true, force: true }); }
}
function cleanup(env = process.env) {
  const root = tempRoot(env, env.GITHUB_WORKSPACE ?? repo);
  for (const entry of readdirSync(root)) {
    if (entry.startsWith(prefix(env))) rmSync(join(root, entry), { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--cleanup')) cleanup();
    else process.exitCode = runCIRelease();
  } catch {
    console.error('[release-ci] 签名接入或打包失败；请核对既有根Secret、临时目录权限与构建日志');
    process.exitCode = 1;
  }
}
