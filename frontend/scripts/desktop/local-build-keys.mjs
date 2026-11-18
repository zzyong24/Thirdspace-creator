// 本机开发包使用独立密钥；不获取正式凭证，也不修改仓库信任根。
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function isFormalPackageEnv(env) {
  return env.CREATOROS_RELEASE === '1' || env.GITHUB_ACTIONS === 'true' || env.CREATOROS_CHANNEL_PACKAGE_MODE === 'release';
}

export function assertLocalPackageBoundary(env) {
  if ((env.CREATOROS_LOCAL_PACKAGE === '1' || env.CREATOROS_LOCAL_SIDECAR_PUBLIC_KEY_B64?.trim()) && isFormalPackageEnv(env)) {
    throw new Error('本地开发密钥不能用于正式release或GitHub Actions构建。');
  }
}

function readOrCreateKey(path) {
  let pem;
  try { pem = readFileSync(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const { privateKey } = generateKeyPairSync('ed25519');
    try { writeFileSync(path, privateKey.export({type:'pkcs8',format:'pem'}), {flag:'wx',mode:0o600}); }
    catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; }
    pem = readFileSync(path);
  }
  // 不把解析器的原始错误或密钥内容写到日志。
  let key;
  try { key = createPrivateKey(pem); } catch { throw new Error('本机开发密钥文件损坏，请移走 ~/.creatoros/local-build-keys 后重试。'); }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('本机开发密钥必须为Ed25519。');
  if (process.platform !== 'win32') chmodSync(path, 0o600);
  return key;
}

export function prepareLocalBuildKeys(homeDir, { needsVerdict = true } = {}) {
  const dir = join(homeDir,'.creatoros','local-build-keys');
  mkdirSync(dir,{recursive:true,mode:0o700});
  if (process.platform !== 'win32') chmodSync(dir,0o700);
  const sidecarPrivateKeyPath = join(dir,'sidecar.pem');
  const root = readOrCreateKey(sidecarPrivateKeyPath);
  const verdict = needsVerdict ? readOrCreateKey(join(dir,'verdict.pem')) : null;
  return {
    sidecarPrivateKeyPath,
    sidecarPublicKeyB64:createPublicKey(root).export({format:'der',type:'spki'}).toString('base64'),
    ...(verdict ? {
      signingKeyB64:verdict.export({format:'jwk'}).d,
      publicKeyB64:Buffer.from(createPublicKey(verdict).export({format:'jwk'}).x,'base64url').toString('base64'),
    } : {}),
  };
}

export function verdictPublicKeyFromSeed(seed) {
  // 对显式材料保持原有canonical校验；此处不接受容错解码后的别名。
  if (!/^[A-Za-z0-9_-]{43}$/.test(seed) || Buffer.from(seed,'base64url').toString('base64url') !== seed) {
    throw new Error('CREATOROS_VERDICT_SIGNING_KEY_B64 必须为规范32B Ed25519 seed。');
  }
  const key = createPrivateKey({format:'der',type:'pkcs8',key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(seed,'base64url')])});
  return Buffer.from(createPublicKey(key).export({format:'jwk'}).x,'base64url').toString('base64');
}
